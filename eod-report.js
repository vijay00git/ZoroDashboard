// EOD status mail ("Claude EOD report" mode of the Daily Status page).
//
// Everything that plain code can collect is collected in code (free, seconds): git work in
// ic-tokyo, local Cypress runs, Jenkins builds. Only Bitbucket PRs and Jira tickets need a
// Claude call — both are reachable only through the user's MCP servers (Atlassian is OAuth) —
// so one small Haiku run fetches just those, with read-only tools. The mail is then filled
// from the eod-status skill's template, so Claude Code and this page share one format.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');

const run = promisify(execFile);
const HOME = os.homedir();
const SKILL_DIR = path.join(HOME, '.claude', 'skills', 'eod-status');
const REPO = process.env.EOD_REPO || path.join(HOME, 'ic-tokyo');
const MODEL = 'claude-haiku-5-5';
const MAX_BUDGET_USD = '0.60';

// Read-only MCP tools the Haiku run may call; anything else is refused by `claude -p`.
const ALLOWED_TOOLS = [
    'ToolSearch',
    'mcp__bitbucket__getPullRequests', 'mcp__bitbucket__getPullRequest', 'mcp__bitbucket__getPullRequestActivity',
    'mcp__bitbucket__getPullRequestComments', 'mcp__bitbucket__getPendingReviewPRs',
    'mcp__atlassian__getAccessibleAtlassianResources', 'mcp__atlassian__atlassianUserInfo',
    'mcp__atlassian__searchJiraIssuesUsingJql', 'mcp__atlassian__getJiraIssue', 'mcp__atlassian__listJiraIssueComments',
];

const SHEET_NAMES = ['Automation Tracker Sheet', 'Test Metrics Sheet', 'Polaris Tracking Sheet'];
const localDate = (ms) => new Date(ms).toLocaleDateString('en-CA'); // YYYY-MM-DD in the server's timezone
const nextDay = (d) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + 1); return localDate(x.getTime()); };
const mailDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).replace(/ /g, '-');
const uniq = (xs) => [...new Set(xs)];
const git = async (...args) => (await run('git', ['-C', REPO, ...args], { maxBuffer: 64 * 1024 * 1024 })).stdout;

// ── git ──────────────────────────────────────────────────────────────────────

const SPEC_RE = /cypress\/e2e\/.*\.(ts|js)$/;
const IT_RE = /\bit(?:\.only|\.skip)?\s*\(\s*[`'"]\s*(C\d{5,}(?:\s*[|,&]\s*C\d{5,})*)/;
const cids = (s) => (s.match(/C\d{5,}/g) || []);

/** Changed line numbers (new side) per file from a `git show -U0` patch. */
function changedLines(patch) {
    const out = {};
    let file = null;
    for (const line of patch.split('\n')) {
        const f = line.match(/^\+\+\+ b\/(.*)$/);
        if (f) { file = f[1]; out[file] = out[file] || { added: [], hunks: [] }; continue; }
        const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        if (h && file) { const start = +h[1], n = h[2] === undefined ? 1 : +h[2]; out[file].hunks.push([start, Math.max(start, start + n - 1)]); continue; }
        if (file && line.startsWith('+') && !line.startsWith('+++')) out[file].added.push(line.slice(1));
    }
    return out;
}

/** The C-ids of the it() block enclosing each changed line. */
function enclosingCases(content, hunks) {
    const lines = content.split('\n');
    const found = new Set();
    for (const [a, b] of hunks) {
        for (let ln = Math.min(b, lines.length); ln >= 1; ln--) {
            const m = lines[ln - 1].match(IT_RE);
            if (m) { cids(m[1]).forEach((c) => found.add(c)); break; }
            // A change inside a hook (or above the first it) belongs to no single case.
            if (/^\s*(beforeEach|afterEach|before|after|describe|context)\s*\(/.test(lines[ln - 1])) break;
        }
    }
    return [...found];
}

const kindOf = (f) => SPEC_RE.test(f) ? 'spec'
    : /\/locators\//.test(f) ? 'locator'
    : /\/(utils|support)\//.test(f) ? 'helper'
    : /\/pages\//.test(f) ? 'page'
    : /\.robot$/.test(f) ? 'robot'
    : /fixtures\//.test(f) ? 'fixture' : 'other';

/** Function / locator names touched in the added lines of a non-spec file. */
const touchedNames = (added) => uniq(added.map((l) => (l.match(/^\s*(?:async\s+)?([A-Za-z_]\w*)\s*\([^)]*\)\s*(?::\s*[\w<>[\]|, ]+)?\s*\{/) || [])[1]).filter((n) => n && !['if', 'for', 'while', 'switch', 'catch', 'function'].includes(n)));

async function collectGit(date) {
    const email = (await git('config', 'user.email')).trim();
    // --since is committer date (rebases/merges move it); widen, then keep the author date only.
    const since = new Date(`${date}T00:00:00`); since.setDate(since.getDate() - 10);
    const log = await git('log', '--all', '--no-merges', `--author=${email}`, `--since=${since.toISOString()}`, '--format=%H%x09%ad%x09%s', '--date=format-local:%Y-%m-%d');
    const commits = log.split('\n').filter(Boolean).map((l) => { const [hash, ad, subject] = l.split('\t'); return { hash, date: ad, subject }; })
        .filter((c) => c.date === date);
    const automated = new Set(), fixed = new Set(), touched = { locator: new Set(), helper: new Set(), page: new Set(), robot: new Set(), spec: new Set() };
    const commitNotes = [];
    for (const c of commits) {
        const patch = await git('show', '--format=', '-U0', '--no-color', c.hash);
        const status = await git('show', '--format=', '--name-status', c.hash);
        const addedFiles = new Set(status.split('\n').filter((l) => l.startsWith('A\t')).map((l) => l.slice(2)));
        const byFile = changedLines(patch);
        const kinds = new Set();
        for (const [file, { added, hunks }] of Object.entries(byFile)) {
            const kind = kindOf(file);
            kinds.add(kind);
            if (kind === 'spec') {
                touched.spec.add(file.replace(/^.*functional_tests\//, ''));
                const newIds = uniq(added.flatMap((l) => { const m = l.match(IT_RE); return m ? cids(m[1]) : []; }));
                for (const id of newIds) {
                    // New only if the id appears nowhere in the parent commit's tree.
                    const existed = await run('git', ['-C', REPO, 'grep', '-q', '-F', id, `${c.hash}^`, '--', 'services/polaris-web-client/cypress'])
                        .then(() => true, () => false);
                    if (!existed) automated.add(id);
                }
                if (!addedFiles.has(file)) {
                    const content = await git('show', `${c.hash}:${file}`).catch(() => '');
                    enclosingCases(content, hunks).filter((id) => !automated.has(id)).forEach((id) => fixed.add(id));
                }
            } else if (touched[kind]) {
                const names = touchedNames(added);
                (names.length ? names.map((n) => `${n} (${path.basename(file)})`) : [path.basename(file)]).forEach((n) => touched[kind].add(n));
            }
        }
        commitNotes.push({ ...c, kinds: [...kinds] });
    }
    return {
        email, commits: commitNotes,
        automated: [...automated].sort(), fixed: [...fixed].filter((id) => !automated.has(id)).sort(),
        touched: Object.fromEntries(Object.entries(touched).map(([k, v]) => [k, [...v]])),
    };
}

/** PR ids and branches git already knows about — handed to Claude as hints to verify, so it doesn't have to search. */
async function gitPrHints(date, email) {
    await git('fetch', 'origin', '--quiet', '--prune').catch(() => {});   // remote-tracking refs only
    const since = new Date(`${date}T00:00:00`); since.setDate(since.getDate() - 2);
    const merges = await git('log', 'origin/track/qa', '--merges', `--since=${since.toISOString()}`, '--format=%ad%x09%s', '--date=format-local:%Y-%m-%d').catch(() => '');
    const mergedIds = uniq(merges.split('\n').filter((l) => l.startsWith(date)).map((l) => (l.match(/pull request #(\d+)/) || [])[1]).filter(Boolean));
    const refs = await git('for-each-ref', 'refs/remotes/origin', '--format=%(refname:short)%09%(authoremail)%09%(committerdate:format-local:%Y-%m-%d)').catch(() => '');
    const myBranches = refs.split('\n').map((l) => l.split('\t')).filter(([, mail, d]) => d === date && mail && mail.replace(/[<>]/g, '') === email).map(([r]) => r.replace(/^origin\//, '')).filter((b) => !/^(track\/|master$|main$|HEAD$)/.test(b));
    return { mergedIds, myBranches };
}

// ── local Cypress runs (this app's own records) ─────────────────────────────

const TR_STATUS = { 1: 'passed', 2: 'blocked', 3: 'untested', 4: 'retest', 5: 'failed' };

function collectLocalRuns(dataDir, date) {
    const dir = path.join(dataDir, 'cypress-runs');
    const runs = [];
    for (const id of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
        try {
            const m = JSON.parse(fs.readFileSync(path.join(dir, id, 'meta.json'), 'utf8'));
            if (!m.startedAt || localDate(m.startedAt) !== date || !m.stats) continue; // killed runs have no stats
            runs.push({
                spec: String(m.specPath || '').replace(/^.*(regression|functional_tests)\//i, ''), status: m.status, startedAt: m.startedAt,
                cases: Object.keys(m.caseResults || {}).map((cid) => `C${cid}`),
                // Cypress test counts (one it() can carry several C-ids, so caseResults is a different unit).
                passed: m.stats.passing || 0, failed: m.stats.failing || 0, pending: m.stats.pending || 0, total: m.stats.tests || 0,
            });
        } catch { /* half-written run: skip */ }
    }
    return runs.sort((a, b) => a.startedAt - b.startedAt);
}

/** One line per spec: its latest run, plus how many times it ran. */
function latestPerSpec(runs) {
    const by = new Map();
    for (const r of runs) by.set(r.spec, { ...r, count: (by.get(r.spec)?.count || 0) + 1 });
    return [...by.values()];
}

// ── Jenkins builds started on the date ──────────────────────────────────────

async function collectJenkins(jenkins, date) {
    const cfg = jenkins.loadConfig();
    const jobs = uniq(Object.values(cfg.jobs || {}).flat().map((j) => (typeof j === 'string' ? j : j && (j.name || j.job))).filter(Boolean));
    const builds = [];
    const warnings = [];
    for (const job of jobs) {
        try {
            const tree = 'builds[number,result,timestamp,url,actions[parameters[name,value]]]{0,60}';
            const data = await jenkins.getJson(`${cfg.url}/job/${encodeURIComponent(job)}/api/json?tree=${encodeURIComponent(tree)}`, cfg.auth);
            for (const b of data.builds || []) {
                if (localDate(b.timestamp) !== date) continue;
                const params = Object.fromEntries((b.actions || []).flatMap((a) => a.parameters || []).map((p) => [p.name, p.value]));
                let cases = [];
                try {
                    const rep = await jenkins.getJson(`${b.url}testReport/api/json?tree=${encodeURIComponent('suites[cases[name,className]]')}`, cfg.auth);
                    cases = uniq((rep.suites || []).flatMap((s) => s.cases || []).flatMap((x) => cids(`${x.className} ${x.name}`)));
                } catch { /* no JUnit report on this build */ }
                builds.push({ job, number: b.number, result: b.result || 'RUNNING', spec: String(params.SPEC_PATH || '').replace(/^.*functional_tests\//, ''), runId: params.RUN_ID || '', cases });
            }
        } catch (e) { warnings.push(`Jenkins job ${job}: ${e.message}`); }
    }
    return { builds, warnings };
}

// ── Bitbucket + Jira through Claude (Haiku, read-only MCP) ──────────────────

function claudePrompt(date, hints = { mergedIds: [], myBranches: [] }) {
    const end = nextDay(date);
    // Bitbucket timestamps are UTC; the report day is the server's local day.
    const fromUtc = new Date(`${date}T00:00:00`).toISOString(), toUtc = new Date(`${end}T00:00:00`).toISOString();
    return `Collect data for my end-of-day report for ${date} (local day = UTC ${fromUtc} to ${toUtc}). Read-only: never create, edit, comment, approve or merge anything.
Bitbucket (workspace elosystemsteam, repo ic-tokyo; "me" is the account the bitbucket MCP is authenticated as). Use the UTC window above for every timestamp:
- raised: pull requests I authored with created_on inside the window (check OPEN, MERGED and DECLINED)
- merged: my pull requests whose MERGED state change (from getPullRequestActivity, call it with only workspace, repo_slug and pull_request_id) falls inside the window — not updated_on
- reviewed: other people's pull requests where my approval, request-changes or comment falls inside the window
Jira (atlassian MCP): first get my accountId with atlassianUserInfo, then
- raised: JQL reporter = currentUser() AND created >= "${date}" AND created < "${end}"
- updated: JQL issuekey in updatedBy("<my accountId>", "${date}", "${end}"); if rejected, use (assignee = currentUser() OR reporter = currentUser() OR watcher = currentUser()) AND updated >= "${date}" AND updated < "${end}". Leave out issues already in raised. Give "what" (status change, comment, field) only if cheap to tell, else "".
Hints from local git (verify each, and still look beyond them): PRs merged into track/qa on this day: ${hints.mergedIds.map((i) => `#${i}`).join(', ') || 'none'}; my branches with commits on this day: ${hints.myBranches.join(', ') || 'none'}. A PR raised and merged on the same day belongs in BOTH raised and merged.
Reply with ONLY this JSON, no prose. "warnings": at most 3 short lines, only when some data may be missing.
{"prs":{"raised":[{"id":1234,"title":""}],"merged":[{"id":1234,"title":""}],"reviewed":[{"id":1234,"title":"","author":""}]},
 "jira":{"raised":[{"key":"","summary":"","status":"","type":""}],"updated":[{"key":"","summary":"","status":"","what":""}]},
 "warnings":[]}`;
}

function runClaude(dataDir, prompt) {
    return new Promise((resolve) => {
        const cwd = path.join(dataDir, 'eod-reports', 'claude-cwd'); // empty folder: no repo CLAUDE.md loaded
        fs.mkdirSync(cwd, { recursive: true });
        const args = ['-p', prompt, '--model', MODEL, '--output-format', 'json', '--max-turns', '30',
            '--max-budget-usd', MAX_BUDGET_USD, '--allowedTools', ALLOWED_TOOLS.join(',')];
        const child = spawn('claude', args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { err += d; });
        child.on('error', (e) => resolve({ ok: false, error: e.message }));
        child.on('close', (code) => {
            let res = {};
            try { res = JSON.parse(out); } catch { return resolve({ ok: false, error: (err || out).slice(0, 400) }); }
            const text = String(res.result || '');
            const json = (text.match(/```json\s*([\s\S]*?)```/) || [])[1] || (text.match(/\{[\s\S]*\}/) || [])[0];
            let data = null;
            try { data = JSON.parse(json); } catch { /* unparseable */ }
            resolve({ ok: code === 0 && !res.is_error && !!data, data, costUsd: res.total_cost_usd || 0, error: data ? null : text.slice(0, 400) || err.slice(0, 400) });
        });
    });
}

// ── assemble ─────────────────────────────────────────────────────────────────

const readSkill = (f) => fs.readFileSync(path.join(SKILL_DIR, f), 'utf8');
const bullets = (xs, fmt, empty = '- None') => (xs && xs.length ? xs.map(fmt).join('\n') : empty);
const prLine = (p) => `- PR-${p.id}${p.title ? ` - ${p.title}` : ''}${p.author ? ` (${p.author})` : ''}`;
const listIds = (ids, max = 12) => (ids.length > max ? `${ids.slice(0, max).join(', ')} and ${ids.length - max} more` : ids.join(', '));

function compose({ date, manual, g, local, jenkins, ext }) {
    const prs = (ext && ext.prs) || { raised: [], merged: [], reviewed: [] };
    const jira = (ext && ext.jira) || { raised: [], updated: [] };
    const executed = uniq([...local.flatMap((r) => r.cases), ...jenkins.builds.flatMap((b) => b.cases)]);
    const t = g.touched;

    const overview = [];
    if (g.automated.length) overview.push(`- **Test Case Automation:** Automated ${g.automated.length} new test case(s): ${listIds(g.automated)}.`);
    if (g.fixed.length) {
        const why = t.locator.length && t.locator.length >= t.helper.length ? ' mainly through locator updates' : t.helper.length ? ' mainly through helper updates' : '';
        overview.push(`- **Test Case Fixes:** Fixed ${g.fixed.length} previously failing test case(s)${why}: ${listIds(g.fixed)}.`);
    }
    if (local.length || jenkins.builds.length) {
        const parts = [];
        if (local.length) parts.push(`${local.length} local run(s)`);
        if (jenkins.builds.length) parts.push(`${jenkins.builds.length} Jenkins job(s)`);
        overview.push(`- **Execution:** Executed ${executed.length} test case(s) across ${parts.join(' and ')}.`);
    }
    if (prs.raised.length || prs.merged.length || prs.reviewed.length) overview.push(`- **Pull Requests:** Raised ${prs.raised.length}, merged ${prs.merged.length}, reviewed ${prs.reviewed.length}.`);
    if (jira.raised.length || jira.updated.length) overview.push(`- **Jira:** Raised ${jira.raised.length} and updated ${jira.updated.length} ticket(s).`);
    if (manual.scrum) overview.push('- **Scrum Participation:** Attended the daily scrum call.');
    if (manual.manualTeam) overview.push(`- **Collaboration with Manual Team:** ${manual.manualTeam}`);
    if (manual.sheets && manual.sheets.length) {
        const links = readSkill('sheets.md').split('\n').filter((l) => /^- \[/.test(l) && manual.sheets.some((s) => l.includes(`[${s}]`)));
        overview.push(`- **Documentation Updates:** Updated the following tracking sheets:\n${links.map((l) => `  ${l}`).join('\n')}`);
    }
    if (manual.notes) overview.push(...manual.notes.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (l.startsWith('-') ? l : `- ${l}`)));

    const tech = [];
    for (const c of g.commits) tech.push(`- **${c.subject}** (${c.hash.slice(0, 7)})`);
    if (t.locator.length) tech.push(`- **Locators updated/added:** ${t.locator.slice(0, 15).join(', ')}${t.locator.length > 15 ? ', …' : ''}`);
    if (t.helper.length) tech.push(`- **Helpers updated/added:** ${t.helper.slice(0, 15).join(', ')}${t.helper.length > 15 ? ', …' : ''}`);
    if (t.page.length) tech.push(`- **Page objects:** ${t.page.slice(0, 10).join(', ')}`);
    if (t.robot.length) tech.push(`- **Robot Framework:** ${t.robot.slice(0, 10).join(', ')}`);
    for (const r of latestPerSpec(local)) {
        const extra = [r.failed && `${r.failed} failed`, r.pending && `${r.pending} not run`].filter(Boolean).join(', ');
        tech.push(`- **Local run** \`${r.spec}\`: ${r.passed}/${r.total} passed${extra ? ` (${extra})` : ''}${r.count > 1 ? ` — latest of ${r.count} runs` : ''}.`);
    }
    for (const b of jenkins.builds) tech.push(`- **Jenkins** ${b.job} #${b.number}${b.spec ? ` \`${b.spec}\`` : ''}: ${b.result}${b.runId ? ` (TestRail run ${b.runId})` : ''}.`);

    const jiraLines = [
        ...jira.raised.map((j) => `- ${j.key} — ${j.summary}${j.status ? ` (${j.status})` : ''} — raised`),
        ...jira.updated.map((j) => `- ${j.key} — ${j.summary}${j.status ? ` (${j.status})` : ''} — updated${j.what ? `: ${j.what}` : ''}`),
    ];

    const fill = {
        date: mailDate(date),
        overview_bullets: overview.join('\n') || '- No activity recorded.',
        technical_bullets: tech.join('\n') || '- None',
        pr_reviewed_list: bullets(prs.reviewed, prLine),
        pr_raised_list: bullets(prs.raised, prLine),
        pr_merged_list: bullets(prs.merged, prLine),
        jira_list: jiraLines.join('\n') || '- None',
        // Every count is the length of the list it summarises.
        n_automated: g.automated.length, n_fixed: g.fixed.length, n_executed: executed.length,
        n_pr_raised: prs.raised.length, n_pr_reviewed: prs.reviewed.length, n_issues: jira.raised.length, n_jenkins: jenkins.builds.length,
    };
    return readSkill('template.md').replace(/\{(\w+)\}/g, (m, k) => (k in fill ? String(fill[k]) : m));
}

// ── jobs ─────────────────────────────────────────────────────────────────────

module.exports = function createEodReport({ dataDir, jenkins }) {
    const jobs = new Map();
    const outDir = path.join(dataDir, 'eod-reports');
    fs.mkdirSync(outDir, { recursive: true });

    async function work(job) {
        const step = (key, status, detail = '') => { job.steps[key] = { status, detail }; };
        const { date, manual } = job;
        const warnings = [];
        step('git', 'running');
        const g = await collectGit(date).catch((e) => { warnings.push(`git: ${e.message}`); return { commits: [], automated: [], fixed: [], touched: { locator: [], helper: [], page: [], robot: [], spec: [] } }; });
        step('git', 'done', `${g.commits.length} commit(s), ${g.automated.length} automated, ${g.fixed.length} fixed`);
        step('local', 'running');
        const local = collectLocalRuns(dataDir, date);
        step('local', 'done', `${local.length} run(s)`);
        step('jenkins', 'running');
        const jenkinsData = await collectJenkins(jenkins, date).catch((e) => ({ builds: [], warnings: [`Jenkins: ${e.message}`] }));
        warnings.push(...jenkinsData.warnings);
        step('jenkins', 'done', `${jenkinsData.builds.length} build(s)`);
        let ext = null;
        if (manual.skipClaude) step('claude', 'skipped', 'PRs and Jira left empty');
        else {
            step('claude', 'running', `${MODEL} via MCP`);
            const hints = await gitPrHints(date, g.email || '').catch(() => undefined);
            const r = await runClaude(dataDir, claudePrompt(date, hints));
            job.costUsd = r.costUsd || 0;
            if (r.ok) { ext = r.data; warnings.push(...(r.data.warnings || [])); step('claude', 'done', `$${job.costUsd.toFixed(3)}`); }
            else { warnings.push(`Bitbucket/Jira not fetched: ${r.error}`); step('claude', 'failed', r.error || ''); }
        }
        job.report = compose({ date, manual, g, local, jenkins: jenkinsData, ext });
        job.warnings = warnings;
        job.status = 'done';
        fs.writeFileSync(path.join(outDir, `${date}.json`), JSON.stringify({ ...job, finishedAt: Date.now() }, null, 2));
    }

    return {
        start(body = {}) {
            const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : localDate(Date.now());
            const manual = {
                scrum: !!body.scrum, manualTeam: String(body.manualTeam || '').trim(),
                sheets: (body.sheets || []).filter((s) => SHEET_NAMES.includes(s)), notes: String(body.notes || '').trim(),
                skipClaude: !!body.skipClaude,
            };
            const id = `eod_${Date.now()}`;
            const job = { id, date, manual, status: 'running', steps: {}, warnings: [], report: '', costUsd: 0, startedAt: Date.now() };
            jobs.set(id, job);
            work(job).catch((e) => { job.status = 'failed'; job.error = e.message; });
            return { id };
        },
        get(id) { return jobs.get(id) || null; },
        sheets: SHEET_NAMES,
    };
};

module.exports.collectGit = collectGit;
module.exports.collectLocalRuns = collectLocalRuns;
module.exports.collectJenkins = collectJenkins;
module.exports.compose = compose;
module.exports.runClaude = runClaude;
module.exports.claudePrompt = claudePrompt;
module.exports.gitPrHints = gitPrHints;
