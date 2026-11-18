// RunMyTCs engine — unattended rerun / triage / fix loop for the dashboard-tracked specs.
//
// Design: a persisted state machine ticked every few seconds. Everything mechanical
// (worklists, queueing, watching builds, reading consoles, writing dashboard status)
// goes through this server's own HTTP API so no logic is duplicated, and Claude is
// only invoked (headless `claude -p`, the user's own Claude Code login) for judgment:
// failure triage + Jira lookup, diagnosis, and fixes. Fixes are made in a dedicated
// git worktree off origin/track/qa and are never committed or pushed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const HOME = os.homedir();
const AGENTS_DIR = path.join(HOME, '.claude', 'agents');
const MANUAL_OK = new Set(['passed', 'failed', 'blocked', 'retest']);
const CAT_JOB = { offline: 'OFFLINE', online: 'ONLINE', e2e: 'E2E' };
const TERMINAL_JENKINS = new Set(['SUCCESS', 'FAILURE', 'UNSTABLE', 'ERROR', 'ABORTED']);
const ANSI = /\x1b\[[0-9;]*m/g;

const DEFAULT_CONFIG = {
    runId: '',
    statuses: ['failed', 'untested'],
    cats: ['offline', 'online', 'e2e'],
    onFailure: 'fix',            // fix | diagnose | report
    fixApproval: 'auto',         // auto | manual
    jira: true,
    useJenkins: true,
    useLocal: true,
    e2eTarget: 'local',          // local (attached device, dashboard runner) | jenkins
    environment: 'qa',
    models: { triage: 'haiku', fix: 'sonnet' },
    maxFixes: 10,
    maxParallelJenkins: 2,       // cap across all Jenkins jobs — too many parallel browsers on one Jenkins host time out page loads
    rerunFlakyOnce: true,
    exclude: [],                 // spec path suffixes to leave out
    include: [],                 // if set, ONLY spec paths ending with one of these
    repo: path.join(HOME, 'ic-tokyo'),
    worktree: path.join(HOME, 'ic-tokyo-runmytcs'),
    baseRef: 'origin/track/qa',
};

// Machine-specific files the fix worktree needs to be runnable (credentials, device ids).
// They are copied in from the main tree and hidden from `git diff` with --skip-worktree.
const LOCAL_ONLY_FILES = [
    'services/polaris-web-client/cypress/config/config.qa.json',
    'services/polaris-web-client/cypress/fixtures/loadFormData.json',
    'services/polaris-web-client/cypress.env.json',
];

function short(p) { return String(p || '').split('functional_tests/').pop(); }
function now() { return Date.now(); }

// ── console parsing (same rules as runmytcs.py) ─────────────────────────────
const CASE_PASS = /✓ ((?:C\d+\s*\|?\s*)+)/;
const CASE_FAIL = /^\S*\s+\d+\) ((?:C\d+\s*\|?\s*)+)/;
const NOT_POSTED = /(C\d+) is NOT Reported to Testrail.*?\((.*)\)/;
const DIGEST_LINE = /^\S*\s+\d+\) |AssertionError|CypressError|TypeError|ReferenceError|Error:|Passing:|Failing:|Pending:|Skipped:|FAILED SETUP|"(before|after) (all|each)" hook/;

function parseConsole(text) {
    const verdict = {}, rejected = {}, digest = [];
    const seen = new Set();
    for (const raw of String(text || '').replace(ANSI, '').split('\n')) {
        const l = raw.trim();
        let m = CASE_PASS.exec(l);
        if (m) (m[1].match(/C\d+/g) || []).forEach((c) => { if (!verdict[c]) verdict[c] = 'passed'; });
        m = CASE_FAIL.exec(raw);
        if (m) (m[1].match(/C\d+/g) || []).forEach((c) => { verdict[c] = 'failed'; });
        m = NOT_POSTED.exec(l);
        if (m) rejected[m[1]] = m[2].slice(0, 120);
        if (DIGEST_LINE.test(raw) && !seen.has(l)) { seen.add(l); digest.push(l.slice(0, 240)); }
    }
    return { verdict, rejected, digest: digest.slice(0, 30) };
}

function agentBody(name) {
    try {
        const txt = fs.readFileSync(path.join(AGENTS_DIR, `${name}.md`), 'utf8');
        return txt.replace(/^---[\s\S]*?---\s*/, ''); // drop frontmatter
    } catch (e) { return ''; }
}

function createRunMyTcs({ baseUrl, dataDir, loadJenkinsConfig, writeJsonAtomic, sendTelegram }) {
    const DIR = path.join(dataDir, 'runmytcs');
    const STATE_PATH = path.join(DIR, 'state.json');
    fs.mkdirSync(path.join(DIR, 'runs'), { recursive: true });

    const STORE_PATH = path.join(DIR, 'case-store.json');
    let state = null;
    let ticking = false;
    let claudeChild = null;
    let store = {};
    try { store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); } catch (e) { store = {}; }
    function saveStore() { writeJsonAtomic(STORE_PATH, store); }
    // TestRail run statuses are slow to pull (paged API), so cache per run for a few minutes.
    const runCache = {};
    async function runStatuses(runId, fresh) {
        const c = runCache[runId];
        if (!fresh && c && now() - c.at < 5 * 60000) return c.data;
        const data = await api(`/api/testcases/run-status?runId=${runId}`);
        runCache[runId] = { at: now(), data };
        return data;
    }

    // ── persistence ─────────────────────────────────────────────────────────
    function load() {
        try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch (e) { state = null; }
        if (state && state.claudeBusy) state.claudeBusy = null; // a server restart killed any child
        if (state && !state.messages) state.messages = [];
        if (state) (state.fixes || []).forEach((f) => {
            if (f.patch && (!f.files || !f.files.length)) {
                f.files = [...new Set((f.patch.match(/^diff --git a\/(\S+) b\//gm) || []).map((l) => l.replace(/^diff --git a\//, '').replace(/ b\/$/, '')))];
                f.shared = f.files.filter((x) => /cypress\/(utils|locators|pages|support)\//.test(x));
            }
        });
        if (state) (state.fixes || []).forEach((f) => {
            if (['fixing', 'diagnosing'].includes(f.state)) f.state = 'queued';
            if (f.mode === 'fix' && !['queued', 'awaiting-approval', 'skipped', 'over-cap'].includes(f.state)) f.attempted = true;
        });
    }
    function save() {
        if (!state) return;
        writeJsonAtomic(STATE_PATH, state);
    }
    function log(msg, level = 'info') {
        if (!state) return;
        state.log.push({ t: now(), level, msg });
        if (state.log.length > 800) state.log.splice(0, state.log.length - 800);
    }

    // ── own-API helpers ─────────────────────────────────────────────────────
    async function api(p, body) {
        const res = await fetch(baseUrl + p, body === undefined ? {} : {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const text = await res.text();
        let data; try { data = JSON.parse(text); } catch (e) { data = text; }
        if (!res.ok) throw new Error(`${p} -> ${res.status} ${typeof data === 'string' ? data : (data.error || '')}`);
        return data;
    }
    async function jenkinsConsole(job, num) {
        const cfg = loadJenkinsConfig();
        const res = await fetch(`${cfg.url}/job/${encodeURIComponent(job)}/${num}/consoleText`, {
            headers: { Authorization: `Basic ${cfg.auth}` },
        });
        if (!res.ok) throw new Error(`console ${job}#${num} -> ${res.status}`);
        return res.text();
    }
    // Dated pass/fail record per case, kept across runs: every result RunMyTCs observes
    // (Jenkins build, local run, fix verification), newest last, capped at 200 per case.
    function recordResult(caseId, result, ref, source) {
        const e = store[caseId] || (store[caseId] = { history: [] });
        e.results = e.results || [];
        e.results.push({ t: now(), runId: state ? state.config.runId : '', result, ref, source });
        if (e.results.length > 200) e.results.splice(0, e.results.length - 200);
        saveStore();
    }

    // RunMyTCs keeps its OWN case store (data/runmytcs/case-store.json) — it never writes the
    // Cypress Runner / Jenkins Runner manual-status, notes or bug-link stores.
    async function setCase(caseId, { status, note, bug } = {}, src = 'engine') {
        const e = store[caseId] || (store[caseId] = { history: [] });
        const runId = state ? state.config.runId : '';
        if (status) { e.status = status; if (state) state.overrides[caseId] = { status, at: now() }; }
        if (note !== undefined) e.note = note;
        if (bug !== undefined) e.bug = bug;
        e.updatedAt = now();
        e.history.push({ t: now(), runId, src, status, note, bug });
        if (e.history.length > 50) e.history.splice(0, e.history.length - 50);
        saveStore();
        const c = state && state.cases[caseId];
        if (c) {
            if (status) c.now = status;
            if (note !== undefined) c.note = note;
            if (bug !== undefined) c.bug = bug;
            if (c.cls) e.cls = c.cls;
        }
    }

    // ── external-process guard: never run local Cypress while someone else does ─
    function otherCypressInTree(tree) {
        try {
            const out = execFileSync('pgrep', ['-af', 'cypress run'], { encoding: 'utf8' });
            return out.split('\n').some((l) => l.includes(tree) && !l.includes('pgrep'));
        } catch (e) { return false; } // pgrep exits 1 when nothing matches
    }

    // ── planning ────────────────────────────────────────────────────────────
    // Which manifest cases/specs a config selects, and where each spec runs. Pure: used by
    // plan() to build the run and by preview() to size it before Start.
    function selectWork(cfg, data, run) {
        const wantStatus = new Set(cfg.statuses);
        const cats = new Set(cfg.cats);
        const files = {}; const cases = {}; const specCases = {};
        for (const r of data.rows) {
            const s = String(((run.statuses[r.id.slice(1)] || {}).status) || 'notinrun').toLowerCase();
            const cat = String(r.cat).toLowerCase();
            (specCases[r.path] = specCases[r.path] || []).push({ id: r.id, title: r.title, cat, commented: !!r.commented, tr: s });
            if (!cats.has(cat)) continue;
            if ((cfg.exclude || []).some((x) => x && r.path.endsWith(x))) continue;
            if ((cfg.include || []).length && !cfg.include.some((x) => r.path.endsWith(x))) continue;
            if (!wantStatus.has(s)) continue;
            if (!files[r.path]) files[r.path] = { path: r.path, cat, cases: [] };
            files[r.path].cases.push(r.id);
            cases[r.id] = { id: r.id, title: r.title, path: r.path, cat, before: s, now: s, commented: !!r.commented };
        }
        // route: 'auto' = local runner first, Jenkins only while the local slot is busy;
        // pinned to one side when only that resource is selected (or E2E is set to Jenkins)
        const routeOf = (cat) => {
            if (cat === 'e2e' && cfg.e2eTarget === 'jenkins') return cfg.useJenkins ? 'jenkins' : null;
            if (cfg.useLocal && cfg.useJenkins) return 'auto';
            return cfg.useLocal ? 'local' : (cfg.useJenkins ? 'jenkins' : null);
        };
        const all = Object.values(files).map((f, i) => ({
            id: `i${i}`, path: f.path, cat: f.cat, cases: f.cases, attempts: 0, state: 'pending',
            route: routeOf(f.cat), target: routeOf(f.cat), history: [],
        }));
        const items = all.filter((it) => it.route);
        return { items, cases, specCases, dropped: all.length - items.length };
    }

    async function plan() {
        const cfg = state.config;
        const [data, run] = await Promise.all([
            api('/api/testcases/data'),
            runStatuses(cfg.runId, true),
        ]);
        state.runName = run.runName || '';
        const w = selectWork(cfg, data, run);
        state.items = w.items; state.specCases = w.specCases;
        Object.assign(state.cases, w.cases);
        const dropped = w.dropped;
        log(`Planned ${state.items.length} spec files / ${Object.keys(state.cases).length} cases from run ${cfg.runId}${state.runName ? ` (${state.runName})` : ''}` +
            (dropped ? `; ${dropped} file(s) skipped because their resource is disabled` : ''));
        state.stage = 'running';
    }

    // ── submission (throttled so Pause takes effect quickly) ────────────────
    async function submit() {
        const cfg = state.config;
        let jobs = { OFFLINE: [], ONLINE: [], E2E: [] };
        try { jobs = loadJenkinsConfig().jobs || jobs; } catch (e) { /* no Jenkins configured */ }
        const inflight = (pred) => state.items.filter((it) => (it.state === 'queued' || it.state === 'running') && pred(it)).length;
        // The local slot (device / main tree) is single: free only when none of our runs is on it, no
        // fix is waiting for or running its local check (fix checks go first), the dashboard runner
        // is idle and no other Cypress run is using the tree.
        let cs = { active: null, queue: [] };
        try { cs = await api('/api/cypress/state'); } catch (e) { /* treat as busy below */ }
        let localFree = !!cfg.useLocal && !inflight((x) => x.target === 'local') && !cs.active && !(cs.queue || []).length
            && !state.fixes.some((f) => ['verify-pending', 'verifying'].includes(f.state)) && !otherCypressInTree(cfg.repo + '/');
        for (const it of state.items) {
            if (it.state !== 'pending') continue;
            const route = it.route || it.target; // runs planned before routing existed keep their target
            if (route === 'local' || (route === 'auto' && localFree)) it.target = 'local';
            else if (route === 'auto' || route === 'jenkins') it.target = 'jenkins';
            if (it.target === 'local' && !localFree) {
                if (route === 'local') maybeLogOnce('localwait', 'Local runner busy — local-only specs wait for it');
                continue;
            }
            if (it.target === 'jenkins') {
                const cat = CAT_JOB[it.cat];
                const cap = (jobs[cat] || []).length;
                if (!cap) { it.state = 'skipped'; log(`No Jenkins ${cat} job configured — skipping ${short(it.path)}`, 'warn'); continue; }
                if (inflight((x) => x.target === 'jenkins' && x.cat === it.cat) >= cap) continue;
                if (inflight((x) => x.target === 'jenkins') >= Math.max(1, Number(cfg.maxParallelJenkins) || 2)) continue;
                await api('/api/testcases/queue-jobs', { environment: cfg.environment, runId: String(cfg.runId), items: [{ path: it.path, category: cat, cases: it.cases }] });
            } else {
                localFree = false; // one spec at a time on the local slot
                await api('/api/cypress/queue', {
                    environment: cfg.environment, testrailRunId: String(cfg.runId), browser: 'electron', headed: false,
                    items: [{ path: it.path, cat: it.cat.toUpperCase(), cases: it.cases }],
                });
            }
            it.state = 'queued';
            it.submittedAt = now();
            it.attempts += 1;
            log(`Queued ${short(it.path)} on ${it.target}${it.route === 'auto' ? (it.target === 'local' ? ' (local first)' : ' (local busy → Jenkins)') : ''} (attempt ${it.attempts})`);
        }
    }
    const onceKeys = new Set();
    function maybeLogOnce(key, msg) { if (!onceKeys.has(key)) { onceKeys.add(key); log(msg, 'warn'); } }

    // ── watching ────────────────────────────────────────────────────────────
    async function collect() {
        const active = state.items.filter((it) => it.state === 'queued' || it.state === 'running');
        if (!active.length) return;
        const [jq, cs] = await Promise.all([api('/api/testcases/job-queue'), api('/api/cypress/state')]);
        for (const it of active) {
            if (it.target === 'jenkins') {
                const hit = (jq.history || []).find((h) => h.path === it.path && (h.queuedAt || 0) >= it.submittedAt - 5000 && TERMINAL_JENKINS.has(h.status));
                if (!hit) {
                    if ((jq.running || []).some((h) => h.path === it.path)) it.state = 'running';
                    continue;
                }
                const ref = `${hit.jobName}:${hit.buildNumber}`;
                let parsed = { verdict: {}, rejected: {}, digest: [] };
                let rawText = '';
                try { rawText = await jenkinsConsole(hit.jobName, hit.buildNumber); parsed = parseConsole(rawText); } catch (e) { log(`Could not read console ${ref}: ${e.message}`, 'warn'); }
                await finishItem(it, hit.status === 'SUCCESS', ref, parsed, hit.buildUrl, rawText);
            } else {
                const hit = (cs.history || []).find((h) => h.specPath === it.path && (h.startedAt || 0) >= it.submittedAt - 5000 && h.status && h.status !== 'running');
                if (!hit) {
                    if (cs.active && cs.active.specPath === it.path) it.state = 'running';
                    continue;
                }
                let text = '';
                try { const lg = await api(`/api/cypress/logs/${hit.id}`); text = typeof lg === 'string' ? lg : (lg.log || ''); } catch (e) { /* digest stays empty */ }
                const parsed = parseConsole(text);
                for (const [cid, sid] of Object.entries(hit.caseResults || {})) {
                    parsed.verdict[`C${cid}`] = sid === 1 ? 'passed' : sid === 5 ? 'failed' : parsed.verdict[`C${cid}`];
                }
                await finishItem(it, hit.status === 'passed', `local:${hit.id}`, parsed, null, text);
            }
        }
    }

    async function finishItem(it, ok, ref, parsed, url, rawText) {
        it.state = 'done';
        it.history.push({ ref, ok, at: now(), url });
        // results TestRail refused (e.g. a required result field) still reach the dashboard
        for (const [cid, why] of Object.entries(parsed.rejected)) {
            if (parsed.verdict[cid]) {
                await setCase(cid, { status: parsed.verdict[cid], note: `${parsed.verdict[cid].toUpperCase()} on ${ref}; TestRail rejected the post (${why.slice(0, 80)}).` });
            }
        }
        const failed = [];
        for (const sc of (state.specCases && state.specCases[it.path]) || []) {
            if (it.cases.includes(sc.id) || parsed.verdict[sc.id] !== 'failed') continue;
            it.cases.push(sc.id);
            state.cases[sc.id] = { id: sc.id, title: sc.title, path: it.path, cat: sc.cat, before: sc.tr, now: sc.tr, commented: sc.commented, regression: true };
            log(`Regression: ${sc.id} was ${sc.tr} in the run but failed now in ${short(it.path)} — tracking it`, 'warn');
        }
        for (const cid of it.cases) {
            const v = parsed.verdict[cid];
            const c = state.cases[cid];
            if (!c) continue;
            if (v) { c.now = v; recordResult(cid, v, ref, it.target); }
            c.lastRef = ref;
            if (v === 'failed' || (!ok && !v && !c.commented)) failed.push(cid);
        }
        log(`${ok ? '✅' : '❌'} ${short(it.path)} on ${ref}${failed.length ? ` — failing: ${failed.join(', ')}` : ''}`, ok ? 'info' : 'warn');
        if (failed.length) {
            const ev = await collectEvidence({ ref, url, text: rawText, caseIds: failed, cat: it.cat, localProject: path.join(state.config.repo, 'services/polaris-web-client'), since: it.submittedAt });
            failed.forEach((c) => { if (state.cases[c]) state.cases[c].evRef = ref; });
            log(`Evidence for ${short(it.path)}: ${Object.keys(ev.errors).filter((k) => k !== '_hooks').length} error/stack, ${ev.shots.length} screenshot(s)${ev.robot.length ? `, ${ev.robot.length} Robot failure(s)` : ''}`);
            const collectOnly = state.config.onFailure === 'collect';
            state.failures.push({ id: `f${state.failures.length}`, itemId: it.id, path: it.path, cat: it.cat, ref, cases: failed, digest: parsed.digest, triaged: collectOnly, collected: collectOnly });
        }
    }

    // ── context handed to Claude up front, so fixes don't spend turns searching ─
    // A block = the line that opens it through the matching close at the same indent.
    function blockAt(lines, i, maxLen = 160) {
        const indent = lines[i].match(/^\s*/)[0].length;
        let j = i + 1;
        while (j < lines.length && j - i < maxLen) {
            const l = lines[j];
            if (l.trim() && l.match(/^\s*/)[0].length <= indent && /^\s*[})]/.test(l)) { j++; break; }
            j++;
        }
        return lines.slice(i, j).join('\n');
    }
    // The failing it() blocks (+ hooks when the failure is in one) and the settingsHelper
    // methods they call — capped so the prompt stays small.
    function codeContext(pwc, specPath, caseIds, digest) {
        const spec = path.join(pwc, `cypress/e2e/functional_tests/${short(specPath)}`);
        let lines;
        try { lines = fs.readFileSync(spec, 'utf8').split('\n'); } catch (e) { return ''; }
        const out = []; const helpers = new Set(); const seen = new Set();
        const take = (i, label) => {
            if (i < 0 || seen.has(i)) return;
            seen.add(i);
            const blk = blockAt(lines, i);
            out.push(`// ${label} — ${spec}:${i + 1}\n${blk}`);
            (blk.match(/settingsHelper\.(\w+)\(/g) || []).forEach((m) => helpers.add(m.slice(15, -1)));
        };
        for (const cid of caseIds) take(lines.findIndex((l) => /\bit(\.only)?\s*\(/.test(l) && l.includes(cid)), `it() for ${cid}`);
        const d = (digest || []).join('\n');
        if (/"(before|after) (all|each)" hook/.test(d)) {
            lines.forEach((l, i) => { if (/^\s*(before|after|beforeEach|afterEach)\s*\(/.test(l)) take(i, 'hook'); });
        }
        try {
            const hl = fs.readFileSync(path.join(pwc, 'cypress/utils/settingsHelper.ts'), 'utf8').split('\n');
            [...helpers].slice(0, 6).forEach((name) => {
                const i = hl.findIndex((l) => new RegExp(`^\\s{2}(async\\s+)?${name}\\s*\\(`).test(l));
                if (i >= 0) out.push(`// settingsHelper.${name} — cypress/utils/settingsHelper.ts:${i + 1}\n${blockAt(hl, i, 120)}`);
            });
        } catch (e) { /* helper file missing */ }
        return out.join('\n\n').split('\n').slice(0, 900).join('\n');
    }
    // ── evidence: everything a failed build leaves behind, saved under data/runmytcs/evidence/<ref>/ ──
    const EV_DIR = path.join(DIR, 'evidence');
    const safeRef = (ref) => ref.replace(/[^a-z0-9_-]/gi, '_');
    async function jenkinsGet(job, num, rest) {
        const cfg = loadJenkinsConfig();
        const r = await fetch(`${cfg.url}/job/${encodeURIComponent(job)}/${num}/${rest}`, { headers: { Authorization: `Basic ${cfg.auth}` } });
        if (!r.ok) throw new Error(`${rest} -> ${r.status}`);
        return r;
    }
    const artPath = (rel) => `artifact/${rel.split('/').map(encodeURIComponent).join('/')}`;

    // Mochawesome report: exact error + stack (file:line) per failing test, hooks included.
    function mochaErrors(json, caseIds) {
        const out = {};
        const walk = (suite) => {
            (suite.tests || []).forEach((t) => {
                if (t.state !== 'failed' && !t.fail) return;
                const text = `${t.err && t.err.message || ''}\n${String(t.err && t.err.estack || '').split('\n').slice(1, 12).join('\n')}`.trim();
                const ids = (t.title.match(/C\d+/g) || []).filter((c) => caseIds.includes(c));
                if (ids.length) ids.forEach((c) => { out[c] = `${t.isHook ? '[hook] ' : ''}${text}`; });
                else if (t.isHook || /hook/i.test(t.title)) out._hooks = `${out._hooks ? `${out._hooks}\n\n` : ''}[${t.title}]\n${text}`;
            });
            (suite.suites || []).forEach(walk);
        };
        (json.results || []).forEach(walk);
        return out;
    }
    // Fallback from the spec reporter console: the numbered failure block for each case.
    function consoleErrors(text, caseIds) {
        const lines = String(text || '').replace(ANSI, '').split('\n');
        const out = {};
        for (const c of caseIds) {
            let i = -1;
            lines.forEach((l, k) => { if (l.includes(c) && /^\S*\s+\d+\)\s/.test(l)) i = k; });
            if (i < 0) continue;
            let j = i + 1;
            while (j < lines.length && j - i < 28 && !/^\S*\s+\d+\)\s/.test(lines[j])) j++;
            out[c] = lines.slice(i, j).map((l) => l.trim()).filter(Boolean).join('\n').slice(0, 1800);
        }
        return out;
    }
    // Robot output.xml: the failing keyword path + message (device-side reason for an E2E failure).
    function robotFailures(xml) {
        const out = []; const stack = [];
        const re = /<(test|kw)\b[^>]*\bname="([^"]*)"[^>]*?(\/?)>|<\/(test|kw)>|<status\b[^>]*\bstatus="FAIL"[^>]*>([^<]+)<\/status>/g;
        let m;
        while ((m = re.exec(xml))) {
            if (m[1] && !m[3]) stack.push(m[2]);
            else if (m[4]) stack.pop();
            else if (m[5]) out.push(`${stack.slice(-4).join(' › ')}: ${m[5].trim().replace(/&quot;/g, '"').replace(/&amp;/g, '&').slice(0, 300)}`);
        }
        return [...new Set(out)].sort((a, b) => b.split('›').length - a.split('›').length).slice(0, 5);
    }

    // Collect logs, per-case errors, screenshots and Robot failures for one failed build/run.
    async function collectEvidence({ ref, url, text, caseIds, cat, localProject, since }) {
        const dir = path.join(EV_DIR, safeRef(ref));
        const ev = { ref, buildUrl: url || null, at: now(), errors: {}, shots: [], robot: [] };
        try {
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'console.log'), String(text || '').replace(ANSI, ''));
            ev.log = path.join(dir, 'console.log');
            const want = (p) => p.endsWith('.png') && caseIds.some((c) => p.includes(c));
            if (!ref.startsWith('local:')) {
                const [job, num] = [ref.slice(0, ref.lastIndexOf(':')), ref.slice(ref.lastIndexOf(':') + 1)];
                const arts = ((await (await jenkinsGet(job, num, 'api/json?tree=artifacts[relativePath]')).json()).artifacts || []).map((a) => a.relativePath);
                const mocha = arts.find((a) => a.endsWith('mochawesome.json'));
                if (mocha) { try { ev.errors = mochaErrors(await (await jenkinsGet(job, num, artPath(mocha))).json(), caseIds); } catch (e) { /* fall back below */ } }
                const rx = arts.find((a) => a.endsWith('output.xml'));
                if (rx && cat === 'e2e') { try { ev.robot = robotFailures(await (await jenkinsGet(job, num, artPath(rx))).text()); } catch (e) { /* */ } }
                for (const [i, rel] of arts.filter(want).slice(0, 4).entries()) {
                    try {
                        const f = path.join(dir, `${i}-${path.basename(rel).replace(/[^a-z0-9_.-]/gi, '_').slice(-90)}`);
                        fs.writeFileSync(f, Buffer.from(await (await jenkinsGet(job, num, artPath(rel))).arrayBuffer()));
                        ev.shots.push(f);
                    } catch (e) { /* skip one */ }
                }
            } else {
                const root = path.join(DIR, '..', 'cypress-screenshots', ref.slice(6));
                const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
                if (fs.existsSync(root)) ev.shots = walk(root).filter(want).slice(0, 4);
                // Robot writes to different places depending on the helper (robot_out/<tag>_<ts>/,
                // /tmp/robot-reports, cypress/reports) — take every output.xml written during this run.
                if (cat === 'e2e' && localProject) {
                    const cands = [path.join(localProject, 'cypress/reports/output.xml'), '/tmp/robot-reports/output.xml'];
                    const ro = path.join(localProject, 'robot_out');
                    if (fs.existsSync(ro)) fs.readdirSync(ro).forEach((d) => cands.push(path.join(ro, d, 'output.xml')));
                    const fresh = cands.filter((f) => fs.existsSync(f) && fs.statSync(f).mtimeMs >= (since || 0))
                        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs).slice(0, 3);
                    fresh.forEach((f) => { ev.robot.push(...robotFailures(fs.readFileSync(f, 'utf8'))); });
                    ev.robot = [...new Set(ev.robot)].slice(0, 6);
                }
            }
            const fromConsole = consoleErrors(text, caseIds);
            caseIds.forEach((c) => { if (!ev.errors[c] && fromConsole[c]) ev.errors[c] = fromConsole[c]; });
        } catch (e) { log(`Evidence for ${ref} incomplete: ${e.message}`, 'warn'); }
        state.evidence = state.evidence || {};
        state.evidence[ref] = ev;
        return ev;
    }
    const relEv = (p) => (p ? path.relative(EV_DIR, p) : null);

    // ── Claude (headless Claude Code, user's own login) ─────────────────────
    // Notes the user posted in the page chat are handed to every Claude call as operator input.
    function operatorNotes() {
        const notes = (state.messages || []).filter((m) => m.from === 'user' && !m.answerTo).slice(-10);
        return notes.length ? `\n\nOperator notes from the user (authoritative for this run):\n${notes.map((m) => `- ${m.text}`).join('\n')}` : '';
    }

    function runClaude({ kind, model, prompt, systemFile, cwd, allowedTools, maxTurns, resumeSession, addDirs, tag }) {
        return new Promise((resolve) => {
            const args = ['-p', prompt + operatorNotes(), '--model', model, '--output-format', 'json', '--max-turns', String(maxTurns || 30)];
            if (resumeSession) args.push('--resume', resumeSession);
            if (allowedTools && allowedTools.length) args.push('--allowedTools', allowedTools.join(','));
            if (systemFile) args.push('--append-system-prompt', systemFile);
            const started = now();
            // Started from an empty folder with the code tree granted via --add-dir: the repo's large
            // CLAUDE.md files and project auto-memory are then not re-loaded on every turn (a triage
            // call measured ~860k input tokens when run inside the repo). Agents still read the
            // house rules / architecture docs themselves when they need them.
            if (cwd) args.push('--add-dir', cwd);
            (addDirs || []).forEach((d) => args.push('--add-dir', d));
            const home = path.join(DIR, 'claude-cwd');
            fs.mkdirSync(home, { recursive: true });
            const child = spawn('claude', args, { cwd: home, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
            claudeChild = child;
            state.claudeBusy = { kind, model, startedAt: started, pid: child.pid, tag: tag || null };
            save();
            let out = '', err = '';
            child.stdout.on('data', (d) => { out += d; });
            child.stderr.on('data', (d) => { err += d; });
            child.on('close', (code) => {
                claudeChild = null;
                state.claudeBusy = null;
                let res = {};
                try { res = JSON.parse(out); } catch (e) { res = { result: out, is_error: true }; }
                const u = res.usage || {};
                state.usage.push({
                    t: now(), kind, model, tag: tag || null, ok: code === 0 && !res.is_error, durationMs: now() - started,
                    costUsd: res.total_cost_usd || 0, inTok: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
                    outTok: u.output_tokens || 0, turns: res.num_turns || 0,
                });
                if (code !== 0 || res.is_error) log(`Claude ${kind} call failed (exit ${code}): ${String(res.result || err).slice(0, 200)}`, 'error');
                resolve({ ok: code === 0 && !res.is_error, text: String(res.result || ''), sessionId: res.session_id });
            });
        });
    }

    async function triage() {
        const batch = state.failures.filter((f) => !f.triaged).slice(0, 8);
        if (!batch.length) return;
        batch.forEach((f) => { f.triaged = 'running'; });
        const cfg = state.config;
        const blocks = batch.map((f) => {
            const ev = (state.evidence || {})[f.ref] || { errors: {}, robot: [] };
            const titles = f.cases.map((c) => `${c} — ${(state.cases[c] || {}).title || ''}${ev.errors[c] ? `\n   error: ${ev.errors[c].split('\n').slice(0, 3).join(' | ').slice(0, 400)}` : ''}`).join('\n') +
                (ev.errors._hooks ? `\nHook failure: ${ev.errors._hooks.slice(0, 400)}` : '') + (ev.robot.length ? `\nRobot (device) failures:\n${ev.robot.slice(0, 3).join('\n')}` : '');
            return `### ${short(f.path)}  (${f.ref})\nCases:\n${titles}\nFailure lines:\n${f.digest.join('\n') || '(no console lines captured)'}`;
        }).join('\n\n');
        const tools = ['Read', 'Grep', 'Glob', 'Bash(grep:*)', 'Bash(sed:*)'];
        if (cfg.jira) tools.push('mcp__atlassian__searchJiraIssuesUsingJql', 'mcp__atlassian__getJiraIssue', 'mcp__atlassian__getAccessibleAtlassianResources');
        log(`Triaging ${batch.reduce((n, f) => n + f.cases.length, 0)} failed case(s) with Claude (${cfg.models.triage})${cfg.jira ? ' + Jira' : ''}`);
        const r = await runClaude({
            kind: 'triage', tag: `triage:${batch.map((f) => f.id).join(',')}`, model: cfg.models.triage, cwd: path.join(cfg.worktreeReady ? cfg.worktree : cfg.repo, 'services/polaris-web-client'),
            systemFile: agentBody('runmytcs-triage'), allowedTools: tools, maxTurns: 25,
            prompt: `Triage these failures from TestRail run ${cfg.runId}. Spec paths are relative to ${path.join(cfg.worktreeReady ? cfg.worktree : cfg.repo, 'services/polaris-web-client/cypress/e2e/functional_tests')}/ (read-only).` +
                `${cfg.jira ? '' : ' Jira lookup is DISABLED for this run — skip step 2.'}\n\n${blocks}`,
        });
        const verdicts = {};
        for (const line of r.text.split('\n')) {
            const m = /^\s*(C\d+)\s*\|\s*([a-z-]+)\s*\|\s*([^|]*)\|\s*(.*)$/.exec(line);
            if (m) verdicts[m[1]] = { cls: m[2], jira: m[3].trim().replace(/^-$/, ''), reason: m[4].trim() };
        }
        for (const f of batch) {
            f.triaged = true;
            await applyTriage(f, verdicts);
        }
    }

    async function applyTriage(f, verdicts) {
        const cfg = state.config;
        const it = state.items.find((x) => x.id === f.itemId);
        const testBugCases = [];
        const diagnoseCases = [];
        let rerun = false;
        for (const cid of f.cases) {
            const v = verdicts[cid] || { cls: 'unclear', jira: '', reason: 'triage returned no verdict' };
            const c = state.cases[cid] || {};
            c.cls = v.cls; c.reason = v.reason;
            const key = (v.jira.match(/[A-Z][A-Z0-9]+-\d+/) || [])[0];
            if (v.cls === 'human-needed') {
                await setCase(cid, { status: 'blocked', note: `BLOCKED - needs human: ${v.reason}${key ? ` (see ${key})` : ''}`, ...(key ? { bug: key } : {}) });
            } else if (v.cls === 'product-bug') {
                await setCase(cid, { note: `PRODUCT BUG${key ? '' : ' (no Jira match found)'}: ${v.reason}${/closed/i.test(v.jira) ? ' — Jira is Closed but still reproduces; reopen?' : ''}`, ...(key ? { bug: key } : {}) });
            } else if (['environment', 'flaky', 'unclear'].includes(v.cls) && cfg.rerunFlakyOnce && it && it.attempts < 2) {
                rerun = true;
                await setCase(cid, { note: `${v.cls.toUpperCase()} on ${f.ref}: ${v.reason} — rerunning once.` });
            } else if (v.cls === 'test-bug') {
                testBugCases.push(cid);
                await setCase(cid, { note: `TEST BUG on ${f.ref}: ${v.reason}` });
            } else {
                diagnoseCases.push(cid); // still failing after a rerun but not clearly a test bug: diagnose, don't spend a fix
                await setCase(cid, { note: `${v.cls.toUpperCase()} on ${f.ref} (after rerun): ${v.reason}` });
            }
            c.jira = key || c.jira;
        }
        if (rerun && it) { it.state = 'pending'; if (it.route) it.target = it.route; log(`Requeuing ${short(f.path)} once (environment/flaky)`); }
        if (testBugCases.length && cfg.onFailure !== 'report') {
            const fx = {
                id: `x${state.fixes.length}`, path: f.path, cat: f.cat, cases: testBugCases, ref: f.ref, digest: f.digest,
                mode: cfg.onFailure, // fix | diagnose
                state: cfg.onFailure === 'fix' && cfg.fixApproval === 'manual' ? 'awaiting-approval' : 'queued',
                createdAt: now(),
            };
            state.fixes.push(fx);
            log(`${fx.mode === 'fix' ? 'Fix' : 'Diagnosis'} ${fx.state === 'awaiting-approval' ? 'awaiting your approval' : 'queued'} for ${short(f.path)} (${testBugCases.join(', ')})`);
        }
        if (diagnoseCases.length && cfg.onFailure !== 'report') {
            state.fixes.push({ id: `x${state.fixes.length}`, path: f.path, cat: f.cat, cases: diagnoseCases, ref: f.ref, digest: f.digest, mode: 'diagnose', state: 'queued', createdAt: now() });
            log(`Diagnosis queued for ${short(f.path)} (${diagnoseCases.join(', ')}) — unclear after a rerun, so no fix is spent on it`);
        }
    }

    // ── fix worktree ────────────────────────────────────────────────────────
    function git(args, cwd) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    function ensureWorktree() {
        const cfg = state.config;
        const pwc = path.join(cfg.worktree, 'services/polaris-web-client');
        if (!fs.existsSync(cfg.worktree)) {
            git(['fetch', '-q', 'origin', cfg.baseRef.replace(/^origin\//, '')], cfg.repo);
            const branch = `runmytcs/run${cfg.runId}-${new Date().toISOString().slice(0, 10)}`;
            git(['worktree', 'add', '-q', '-B', branch, cfg.worktree, cfg.baseRef], cfg.repo);
            log(`Created fix worktree ${cfg.worktree} on branch ${branch} (from ${cfg.baseRef})`);
        }
        for (const rel of LOCAL_ONLY_FILES) {
            const src = path.join(cfg.repo, rel);
            if (!fs.existsSync(src)) continue;
            fs.copyFileSync(src, path.join(cfg.worktree, rel));
            try { git(['update-index', '--skip-worktree', rel], cfg.worktree); } catch (e) { /* untracked file — gitignored */ }
        }
        const nm = path.join(pwc, 'node_modules');
        if (!fs.existsSync(nm)) fs.symlinkSync(path.join(cfg.repo, 'services/polaris-web-client/node_modules'), nm);
        cfg.worktreeReady = true;
        return pwc;
    }

    // Every fix keeps a dated trail of its states for the Overview timeline.
    function stamp(fx) { fx.trail = fx.trail || []; if (!fx.trail.length || fx.trail[fx.trail.length - 1].s !== fx.state) fx.trail.push({ s: fx.state, t: now() }); }
    async function runFix() {
        const cfg = state.config;
        const fx = state.fixes.find((f) => f.state === 'queued' && (state.status === 'running' || f.userRequested));
        if (!fx) return;
        // every fix Claude has actually started counts, whatever state it is in now
        const used = state.fixes.filter((f) => f.mode === 'fix' && f.attempted).length;
        if (fx.mode === 'fix' && !fx.userRequested && used >= cfg.maxFixes) {
            fx.state = 'over-cap';
            await Promise.all(fx.cases.map((c) => setCase(c, { note: `TEST BUG — not fixed: run hit its cap of ${cfg.maxFixes} Claude fixes. Last failure ${fx.ref}.` })));
            log(`Fix cap (${cfg.maxFixes}) reached — ${short(fx.path)} left for you`, 'warn');
            return;
        }
        let pwc;
        try { pwc = ensureWorktree(); } catch (e) { fx.state = 'error'; log(`Worktree setup failed: ${e.message}`, 'error'); return; }
        const isRobot = /_Appium|_Adb|e2e_device/.test(fx.path);
        const writer = isRobot ? 'robot-appium-writer' : 'cypress-cloud-writer';
        const specRel = path.join(pwc, `cypress/e2e/functional_tests/${short(fx.path)}`);
        const caseLines = fx.cases.map((c) => `${c} — ${(state.cases[c] || {}).title || ''} [triage: ${(state.cases[c] || {}).reason || ''}]`).join('\n');
        fx.state = fx.mode === 'fix' ? 'fixing' : 'diagnosing';
        log(`${fx.mode === 'fix' ? 'Fixing' : 'Diagnosing'} ${short(fx.path)} with Claude (${cfg.models.fix})`);
        // per-file snapshot so this fix's diff excludes earlier fixes in the same worktree
        const snap = () => { const m = {}; try { git(['diff', '--name-only'], cfg.worktree).split('\n').filter(Boolean).forEach((f) => { m[f] = git(['diff', '--', f], cfg.worktree); }); } catch (e) { /* */ } return m; };
        const before = snap();
        try { git(['add', '-u'], cfg.worktree); } catch (e) { /* nothing tracked changed yet */ } // checkpoint: unstaged diff after Claude = exactly this fix
        const sys = agentBody('e2e-failure-analyst') + (fx.mode === 'fix' ? `\n\n---\n# When applying the fix\n${agentBody(writer)}` : '');
        const tools = fx.mode === 'fix' // propose/diagnose are read-only
            ? ['Read', 'Grep', 'Glob', 'Edit', 'Bash(grep:*)', 'Bash(sed:*)', 'Bash(tail:*)', 'Bash(git diff:*)', 'Bash(git status:*)']
            : ['Read', 'Grep', 'Glob', 'Bash(grep:*)', 'Bash(sed:*)'];
        const ending = 'End your answer with exactly two lines:\nVERDICT: fixed | test-bug-not-fixed | product-bug | environment | unclear | needs-input\n' +
            'SUMMARY: <one sentence root cause + what changed or what should change>\n' +
            'Use needs-input ONLY when a fact only the user can supply blocks you (an account, a credential field name, which of two behaviours is intended); then add a third line\nQUESTION: <one short, self-contained question for the user>';
        const answer = fx.answer;
        fx.answer = null;
        const answerKind = fx.answerKind; fx.answerKind = null;
        const ctx = answer ? '' : codeContext(pwc, fx.path, fx.cases, fx.digest);
        const ev = (state.evidence || {})[fx.ref] || { errors: {}, shots: [], robot: [] };
        const shots = answer ? [] : (ev.shots || []);
        const evText = answer ? '' : [
            ...fx.cases.filter((c) => ev.errors[c]).map((c) => `${c}:\n${ev.errors[c]}`),
            ev.errors._hooks ? `Hook failures:\n${ev.errors._hooks}` : '',
            ev.robot && ev.robot.length ? `Robot (device-side) failures:\n${ev.robot.join('\n')}` : '',
            ev.log ? `Full console log (grep it if the above is not enough): ${ev.log}` : '',
        ].filter(Boolean).join('\n\n');
        const rules = fx.mode === 'fix'
            ? 'Rules: never hardcode credentials, passwords, serials, URLs or names — use LoadFormData fields (cypress/fixtures/loadFormData.json; add a blank field there if one is missing). ' +
              'Prefer changing the spec; change a shared helper/locator (utils/, locators/, pages/) only when the bug is in it, and keep its behaviour for its other callers. '
            : '';
        if (!answer && fx.mode === 'fix') fx.attempted = true; // a resume after the user's answer is the same attempt
        const r = await runClaude({
            kind: fx.mode, model: cfg.models.fix, cwd: pwc, systemFile: sys, allowedTools: tools, maxTurns: fx.mode === 'fix' ? 15 : 10, tag: fx.id,
            addDirs: [...new Set([ev.log, ...shots].filter(Boolean).map((f) => path.dirname(f)))],
            resumeSession: answer && fx.sessionId ? fx.sessionId : undefined,
            prompt: answer
                ? (answerKind === 'approval'
                    ? `The user APPROVED your proposed fix${answer !== 'approved' ? ` with this note: "${answer}"` : ''}. Apply it now in the worktree ${pwc}, exactly as proposed (edit only files under that worktree, follow /home/vijays/.claude/house-rules.md, do not commit). ${rules}${ending}`
                    : `The user answered your question: "${answer}". Continue from where you stopped. ${ending}`)
                : `Spec: ${specRel} (failed on ${fx.ref}, TestRail run ${cfg.runId}).\nFailing cases:\n${caseLines}\n\nFailure lines:\n${fx.digest.join('\n')}\n\n` +
                (evText ? `Errors and stack traces:\n${evText}\n\n` : '') +
                (shots.length ? `Failure screenshots (open them with Read): ${shots.join(' , ')}\n\n` : '') +
                (ctx ? `Relevant code (already extracted — read other files only if this is not enough):\n\`\`\`ts\n${ctx}\n\`\`\`\n\n` : '') + rules +
                (fx.mode === 'fix'
                    ? `Find the root cause and, ONLY if it is a test-code bug, fix it in the worktree ${pwc} (spec, helper, or locator — follow /home/vijays/.claude/house-rules.md). Edit only files under that worktree. Never change a test to make a real product bug pass. Do not commit. `
                    : fx.mode === 'propose'
                        ? 'The user asked you to analyse this failure. Do NOT edit any file. Find the root cause and, if it is a test-code bug, PROPOSE the exact fix: which file(s), what to change and why (a short diff-style snippet is ideal). The user will approve before anything is changed. Use VERDICT fixed when you have a concrete fix to propose. Before the VERDICT line add a section starting with the line PLAN: describing the change. '
                        : 'Diagnose only — do not edit files. ') + ending,
        });
        if (r.sessionId) fx.sessionId = r.sessionId;
        const verdict = (/VERDICT:\s*([a-z-]+)/i.exec(r.text) || [])[1] || 'unclear';
        const summary = ((/SUMMARY:\s*(.+)/i.exec(r.text) || [])[1] || r.text.slice(-300)).trim();
        fx.verdict = verdict; fx.summary = summary;
        if (verdict === 'needs-input') {
            const question = ((/QUESTION:\s*(.+)/i.exec(r.text) || [])[1] || summary).trim();
            fx.state = 'awaiting-input';
            state.messages.push({ id: `m${state.messages.length}`, t: now(), from: 'claude', fixId: fx.id, cases: fx.cases, path: short(fx.path), text: question, open: true });
            log(`Claude needs your input on ${short(fx.path)} — see the chat panel`, 'warn');
            return;
        }
        if (fx.mode === 'propose') {
            const plan = ((/PLAN:\s*([\s\S]*?)(?:\n\s*VERDICT:|$)/i.exec(r.text) || [])[1] || '').trim();
            fx.proposal = (plan || r.text.replace(/\n?VERDICT:[\s\S]*$/i, '')).trim().slice(0, 6000);
            fx.state = verdict === 'fixed' ? 'proposed' : 'diagnosed';
            await Promise.all(fx.cases.map((c) => setCase(c, { note: `${fx.state === 'proposed' ? 'FIX PROPOSED (awaiting your approval)' : `ANALYSIS (${verdict})`}: ${summary}` })));
            log(fx.state === 'proposed' ? `Claude proposed a fix for ${short(fx.path)} — approve or dismiss it on the fix card` : `Claude analysed ${short(fx.path)}: ${verdict} — no fix proposed`, fx.state === 'proposed' ? 'warn' : 'info');
            return;
        }
        if (fx.mode === 'diagnose') {
            fx.state = 'diagnosed';
            await Promise.all(fx.cases.map((c) => setCase(c, { note: `DIAGNOSIS (${verdict}): ${summary}` })));
            return;
        }
        try { fx.patch = git(['diff'], cfg.worktree); git(['add', '-u'], cfg.worktree); } catch (e) { fx.patch = ''; }
        const after = snap();
        // the patch is the source of truth (the worktree is staged right after it is taken, so a
        // post-stage `git diff` snapshot is empty); fall back to the snapshot comparison
        fx.files = [...new Set(((fx.patch || '').match(/^diff --git a\/(\S+) b\//gm) || []).map((l) => l.replace(/^diff --git a\//, '').replace(/ b\/$/, '')))];
        if (!fx.files.length) fx.files = Object.keys(after).filter((f) => after[f] !== before[f]);
        fx.shared = fx.files.filter((f) => /cypress\/(utils|locators|pages|support)\//.test(f));
        if (fx.shared.length) log(`⚠ Fix for ${short(fx.path)} changes SHARED code: ${fx.shared.map((f) => path.basename(f)).join(', ')} — review other callers before merging`, 'warn');
        fx.diff = (fx.patch || fx.files.map((f) => after[f]).join('\n')).slice(0, 60000);
        fx.worktree = cfg.worktree;
        if (!fx.diff.trim() || verdict !== 'fixed') {
            fx.state = 'no-change';
            await Promise.all(fx.cases.map((c) => setCase(c, { note: `${verdict === 'product-bug' ? 'PRODUCT BUG' : 'NOT FIXED'} (${verdict}): ${summary}` })));
            log(`No fix applied for ${short(fx.path)} (${verdict})`, 'warn');
            return;
        }
        fx.state = 'verify-pending';
        log(`Fix written for ${short(fx.path)} — verifying locally`);
    }

    async function verify() {
        const cfg = state.config;
        const fx = state.fixes.find((f) => f.state === 'verify-pending' || f.state === 'verifying');
        if (!fx) return;
        if (fx.state === 'verify-pending') {
            if (state.items.some((it) => it.target === 'local' && (it.state === 'queued' || it.state === 'running'))) return;
            const cs = await api('/api/cypress/state');
            if (cs.active || (cs.queue || []).length) return;
            if (otherCypressInTree(cfg.repo + '/') || otherCypressInTree(cfg.worktree + '/')) { maybeLogOnce('verifybusy', 'Waiting for the local tree to be free before verifying a fix'); return; }
            // Server builds the tags: the cases + their manifest deps + the spec's setup tags. Full verify = every owned case in the spec.
            const envExtra = {};
            const r = await api('/api/cypress/run', {
                projectPath: path.join(cfg.worktree, 'services/polaris-web-client'), specPath: fx.path,
                browser: 'electron', headed: false, environment: cfg.environment, testrailRunId: '', reporter: 'spec', envExtra, cases: fx.fullVerify ? undefined : fx.cases, label: 'RunMyTCs fix check',
            });
            fx.verifyRunId = r.runId; fx.state = 'verifying'; fx.verifyStarted = now();
            log(`Verifying fix for ${short(fx.path)} — ${fx.fullVerify ? 'full spec' : `only ${fx.cases.length} failing case(s) + setup`} (local run ${r.runId}, not posted to TestRail)`);
            return;
        }
        const cs = await api('/api/cypress/state');
        const hit = (cs.history || []).find((h) => h.id === fx.verifyRunId && h.status && h.status !== 'running');
        if (!hit) return;
        let text = '';
        try { const lg = await api(`/api/cypress/logs/${hit.id}`); text = typeof lg === 'string' ? lg : (lg.log || lg.text || ''); } catch (e) { /* */ }
        const parsed = parseConsole(text);
        for (const [cid, sid] of Object.entries(hit.caseResults || {})) parsed.verdict[`C${cid}`] = sid === 1 ? 'passed' : sid === 5 ? 'failed' : parsed.verdict[`C${cid}`];
        const passed = fx.cases.filter((c) => parsed.verdict[c] === 'passed');
        fx.verifyDigest = parsed.digest;
        if (passed.length !== fx.cases.length) {
            const vev = await collectEvidence({ ref: `local:${hit.id}`, url: null, text, caseIds: fx.cases, cat: fx.cat, localProject: path.join(cfg.worktree, 'services/polaris-web-client'), since: fx.verifyStarted });
            fx.verifyEvRef = vev.ref;
        }
        // the narrowed run can mislead (case without tags ran nothing; a skipped precondition) — confirm on the full spec
        if (!fx.fullVerify && passed.length !== fx.cases.length) {
            fx.fullVerify = true; fx.state = 'verify-pending';
            log(`Narrowed verify of ${short(fx.path)} was ${passed.length}/${fx.cases.length} — confirming on the full spec`, 'warn');
            return;
        }
        fx.state = passed.length === fx.cases.length ? 'verified' : 'failed-verify';
        for (const c of fx.cases) {
            if (parsed.verdict[c]) recordResult(c, parsed.verdict[c], `local:${hit.id}`, 'fix-verify');
            if (parsed.verdict[c] === 'passed') {
                await setCase(c, { status: 'passed', note: `FIXED + verified locally (run ${hit.id}): ${fx.summary} — pending merge to track/qa; TestRail keeps the Jenkins result until then.` });
            } else {
                await setCase(c, { note: `Fix attempted but local verify ${parsed.verdict[c] || 'did not run the case'} (run ${hit.id}): ${fx.summary}` });
            }
        }
        log(`${fx.state === 'verified' ? '✅ Fix verified' : '❌ Fix did not verify'} for ${short(fx.path)} (${passed.length}/${fx.cases.length})`, fx.state === 'verified' ? 'info' : 'warn');
    }

    // ── finishing ───────────────────────────────────────────────────────────
    // Final reconciliation: each worked case takes its RunMyTCs override if one was recorded
    // (verified fix, blocked, TestRail-rejected result), else the TestRail run's final status.
    async function sync() {
        const cfg = state.config;
        const run = await runStatuses(cfg.runId, true);
        let changed = 0;
        for (const cid of Object.keys(state.cases)) {
            const o = state.overrides[cid];
            const s = (o && o.status) || String(((run.statuses[cid.slice(1)] || {}).status) || '').toLowerCase();
            if (!MANUAL_OK.has(s)) continue;
            if (state.cases[cid].now !== s) changed++;
            state.cases[cid].now = s;
            const e = store[cid] || (store[cid] = { history: [] });
            e.lastRun = { runId: cfg.runId, status: s, at: now(), ref: state.cases[cid].lastRef };
        }
        saveStore();
        log(`Reconciled ${Object.keys(state.cases).length} case(s) with run ${cfg.runId} (${changed} changed)`);
    }

    // Every manifest row, merged with the TestRail run's status and RunMyTCs' own store.
    // Effective status: a RunMyTCs mark made after the run's result wins, else TestRail.
    async function caseTable(runId) {
        const data = await api('/api/testcases/data');
        let run = { statuses: {} };
        if (/^\d+$/.test(String(runId || ''))) { try { run = await runStatuses(runId); } catch (e) { /* show store only */ } }
        return data.rows.map((r) => {
            const tr = String(((run.statuses[r.id.slice(1)] || {}).status) || 'not in run').toLowerCase();
            const e = store[r.id] || {};
            const live = state && state.cases[r.id];
            return {
                id: r.id, title: r.title, path: r.path, cat: String(r.cat).toLowerCase(), grp: r.grp, commented: !!r.commented,
                testrail: tr, rmt: e.status || null, status: e.status || tr,
                note: e.note || '', bug: e.bug || '', cls: (live && live.cls) || e.cls || '',
                ref: (live && live.lastRef) || (e.lastRun && e.lastRun.ref) || '', updatedAt: e.updatedAt || 0,
                inRun: !!live, history: (e.history || []).slice(-10),
                flags: live ? {
                    newPass: live.now === 'passed' && live.before !== 'passed',
                    regression: !!live.regression,
                    fixed: (state.fixes || []).some((f) => f.state === 'verified' && f.cases.includes(r.id)),
                } : null,
                results: (e.results || []).slice(-12),
                evidence: live && live.evRef && state.evidence && state.evidence[live.evRef] ? (() => {
                    const ev = state.evidence[live.evRef];
                    return { ref: ev.ref, buildUrl: ev.buildUrl, log: relEv(ev.log), shots: (ev.shots || []).map(relEv), error: ev.errors[r.id] || ev.errors._hooks || '', robot: ev.robot || [] };
                })() : null,
            };
        });
    }

    function report() {
        if (!state) return null;
        const cases = Object.values(state.cases);
        const tally = (k) => cases.reduce((m, c) => { m[c[k]] = (m[c[k]] || 0) + 1; return m; }, {});
        const usage = state.usage.reduce((m, u) => {
            m.calls++; m.costUsd += u.costUsd; m.inTok += u.inTok; m.outTok += u.outTok;
            m.byKind[u.kind] = (m.byKind[u.kind] || 0) + 1; return m;
        }, { calls: 0, costUsd: 0, inTok: 0, outTok: 0, byKind: {} });
        const pick = (pred) => cases.filter(pred).map((c) => ({ id: c.id, path: short(c.path), cls: c.cls, note: c.note, bug: c.bug || c.jira, ref: c.lastRef }));
        return {
            runId: state.config.runId, runName: state.runName, status: state.status, stage: state.stage,
            startedAt: state.startedAt, finishedAt: state.finishedAt,
            before: tally('before'), now: tally('now'), total: cases.length,
            nowPassing: pick((c) => c.now === 'passed' && c.before !== 'passed'),
            stillFailing: pick((c) => c.now === 'failed'),
            blocked: pick((c) => c.now === 'blocked'),
            untested: pick((c) => c.now === 'untested' || c.now === 'notinrun'),
            bugs: pick((c) => c.bug || c.jira),
            fixes: state.fixes.map((f) => ({ id: f.id, path: short(f.path), cases: f.cases, mode: f.mode, state: f.state, verdict: f.verdict, summary: f.summary })),
            inFlight: ['running', 'paused'].includes(state.status) ? state.items.filter((it) => it.state === 'queued' || it.state === 'running').length : 0,
            usage,
        };
    }

    // ── the tick ────────────────────────────────────────────────────────────
    async function tick() {
        if (ticking || !state) return;
        if (state.status !== 'running') {
            // outside an active run only the work the user explicitly asked for proceeds
            const userWork = (state.fixes || []).some((f) => f.userRequested && ['queued', 'verify-pending', 'verifying'].includes(f.state));
            if (!userWork || state.status === 'paused') return;
            ticking = true;
            try {
                if (!state.claudeBusy && state.fixes.some((f) => f.userRequested && f.state === 'queued')) runFix().catch((e) => log(`Fix error: ${e.message}`, 'error')).finally(save);
                await verify();
            } catch (e) { log(`Tick error: ${e.message}`, 'error'); } finally { (state.fixes || []).forEach(stamp); ticking = false; save(); }
            return;
        }
        ticking = true;
        try {
            if (state.stage === 'planning') await plan();
            if (state.stage === 'running') {
                await collect();
                await submit();
                if (!state.claudeBusy) {
                    const inflight = state.items.some((it) => it.state === 'queued' || it.state === 'running');
                    const pendingTriage = state.failures.filter((f) => !f.triaged).length;
                    if (pendingTriage && (pendingTriage >= 3 || !inflight)) triage().catch((e) => log(`Triage error: ${e.message}`, 'error')).finally(save);
                    else if (state.fixes.some((f) => f.state === 'queued')) runFix().catch((e) => log(`Fix error: ${e.message}`, 'error')).finally(save);
                }
                await verify();
                const busy = state.claudeBusy
                    || state.items.some((it) => ['pending', 'queued', 'running'].includes(it.state))
                    || state.failures.some((f) => f.triaged !== true)
                    || state.fixes.some((f) => ['queued', 'fixing', 'diagnosing', 'verify-pending', 'verifying'].includes(f.state));
                const waiting = state.fixes.filter((f) => ['awaiting-approval', 'awaiting-input'].includes(f.state) || (f.userRequested && ['queued', 'fixing', 'diagnosing', 'propose', 'verify-pending', 'verifying'].includes(f.state))).length;
                if (!busy && waiting) {
                    state.stage = 'running';
                    maybeLogOnce(`await-${waiting}`, `${waiting} fix(es) waiting on you (approval or a question in the chat) — answer them, or press "Finish now"`);
                } else if (!busy) {
                    state.stage = 'finishing';
                }
            }
            if (state.stage === 'finishing') {
                await sync();
                state.stage = 'done'; state.status = 'done'; state.finishedAt = now();
                state.summary = report();
                writeJsonAtomic(path.join(DIR, 'runs', `${state.id}.json`), state);
                log('Run finished — summary ready');
            }
        } catch (e) {
            log(`Tick error: ${e.message}`, 'error');
        } finally {
            (state.fixes || []).forEach(stamp);
            ticking = false;
            save();
        }
    }

    // ── public API ──────────────────────────────────────────────────────────
    load();
    setInterval(tick, 15000);

    return {
        defaults() {
            let jobs = {};
            try { jobs = loadJenkinsConfig().jobs; } catch (e) { /* */ }
            const last = state ? state.config : null;
            let testrailUrl = null;
            try { testrailUrl = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings', 'integrations.local.json'), 'utf8')).TESTRAIL_URL || null; } catch (e) { /* not configured */ }
            return { defaults: DEFAULT_CONFIG, last, jobs, testrailUrl };
        },
        getState(sinceLog = 0) {
            if (!state) return { status: 'idle' };
            return { ...state, log: state.log.filter((l) => l.t > sinceLog), report: report() };
        },
        start(cfgIn) {
            if (state && ['running', 'paused'].includes(state.status)) throw new Error('A RunMyTCs run is already active — stop it first');
            const config = { ...DEFAULT_CONFIG, ...cfgIn, models: { ...DEFAULT_CONFIG.models, ...(cfgIn.models || {}) } };
            if (!/^\d+$/.test(String(config.runId))) throw new Error('A numeric TestRail run ID is required');
            if (!config.cats.length) throw new Error('Pick at least one test type');
            config.exclude = (config.exclude || []).map((s) => String(s).trim()).filter(Boolean);
            config.include = (config.include || []).map((s) => String(s).trim()).filter(Boolean);
            onceKeys.clear();
            state = {
                id: `rmt_${now()}`, config, status: 'running', stage: 'planning', startedAt: now(),
                items: [], cases: {}, failures: [], fixes: [], overrides: {}, usage: [], log: [], messages: [], claudeBusy: null,
            };
            log(`Started: run ${config.runId}, ${config.cats.join('/')} × ${config.statuses.join('/')}, on failure: ${config.onFailure}` +
                `${config.onFailure === 'fix' ? ` (${config.fixApproval} approval, cap ${config.maxFixes})` : ''}, Jira ${config.jira ? 'on' : 'off'}`);
            save();
            setTimeout(tick, 100);
            return state.id;
        },
        pause() {
            if (!state || state.status !== 'running') throw new Error('Nothing running');
            state.status = 'paused'; log('Paused — builds already running will finish and be recorded; nothing new starts'); save();
        },
        resume() {
            if (!state || state.status !== 'paused') throw new Error('Not paused');
            state.status = 'running'; log('Resumed'); save(); setTimeout(tick, 100);
        },
        // Stop also reconciles with TestRail (same as the normal finish) so the page and the
        // summary reflect the run's latest results, not mid-run states.
        async stop() {
            if (!state || !['running', 'paused'].includes(state.status)) throw new Error('Nothing active');
            if (claudeChild) { try { claudeChild.kill('SIGTERM'); } catch (e) { /* */ } }
            state.status = 'stopped'; state.finishedAt = now();
            log('Stopped by user — builds already queued in Jenkins/local runner are left to finish; reconciling with TestRail…');
            save();
            try { await sync(); } catch (e) { log(`Reconcile on stop failed: ${e.message}`, 'error'); }
            state.summary = report();
            writeJsonAtomic(path.join(DIR, 'runs', `${state.id}.json`), state);
            save();
        },
        approve(fixId, approve) {
            const fx = state && state.fixes.find((f) => f.id === fixId);
            if (!fx || fx.state !== 'awaiting-approval') throw new Error('No fix awaiting approval with that id');
            fx.state = approve ? 'queued' : 'skipped';
            log(`${approve ? 'Approved' : 'Skipped'} fix for ${short(fx.path)}`);
            save(); setTimeout(tick, 100);
        },
        // Page chat: a free note from the user (fed to every later Claude call), or an
        // answer to a question Claude asked — which re-queues that fix to resume its session.
        postMessage(text, answerTo) {
            if (!state) throw new Error('No run');
            const t = String(text || '').trim();
            if (!t) throw new Error('Empty message');
            if (answerTo) {
                const qm = state.messages.find((m) => m.id === answerTo && m.from === 'claude');
                if (!qm) throw new Error('No such question');
                qm.open = false;
                const fx = state.fixes.find((f) => f.id === qm.fixId);
                if (fx && fx.state === 'awaiting-input') { fx.answer = t; fx.state = 'queued'; }
                log(`You answered Claude about ${qm.path} — fix resumes`);
            } else {
                log('Note from you added — Claude sees it on its next call');
            }
            state.messages.push({ id: `m${state.messages.length}`, t: now(), from: 'user', answerTo: answerTo || null, text: t });
            save(); setTimeout(tick, 100);
        },
        finishNow() {
            if (!state || !['running', 'paused'].includes(state.status)) throw new Error('Nothing active');
            const open = state.fixes.filter((f) => f.state === 'awaiting-approval' || f.state === 'awaiting-input');
            open.forEach((f) => { f.state = 'skipped'; });
            state.messages.forEach((m) => { m.open = false; });
            state.status = 'running'; state.stage = 'finishing';
            log(`Finishing now${open.length ? ` — ${open.length} waiting fix(es) skipped` : ''}`);
            save(); setTimeout(tick, 100);
        },
        // The user picks a failed spec for Claude: read-only analysis that ends in a proposal.
        analyse(specPath) {
            if (!state) throw new Error('No run yet');
            const f = [...(state.failures || [])].reverse().find((x) => x.path === specPath || x.path.endsWith(specPath));
            if (!f) throw new Error('No recorded failure for that spec in this run');
            const open = state.fixes.find((x) => x.path === f.path && ['queued', 'fixing', 'diagnosing', 'proposed', 'verify-pending', 'verifying', 'awaiting-input'].includes(x.state));
            if (open) throw new Error(`Claude is already on ${short(f.path)} (${open.state})`);
            const fx = { id: `x${state.fixes.length}`, path: f.path, cat: f.cat, cases: f.cases, ref: f.ref, digest: f.digest, mode: 'propose', state: 'queued', userRequested: true, createdAt: now() };
            state.fixes.push(fx);
            log(`You asked Claude to analyse ${short(f.path)} (${f.cases.join(', ')}) — it will propose, not change`);
            save(); setTimeout(tick, 100);
            return { fixId: fx.id };
        },
        approveProposal(fixId, approve, note) {
            const fx = state && state.fixes.find((x) => x.id === fixId);
            if (!fx || fx.state !== 'proposed') throw new Error('No proposal waiting with that id');
            if (!approve) { fx.state = 'dismissed'; log(`Dismissed Claude's proposal for ${short(fx.path)}`); save(); return { ok: true }; }
            fx.mode = 'fix'; fx.state = 'queued'; fx.attempted = true;
            fx.answer = String(note || '').trim() || 'approved'; fx.answerKind = 'approval';
            log(`Approved Claude's fix for ${short(fx.path)} — applying and verifying`);
            save(); setTimeout(tick, 100);
            return { ok: true };
        },
        failures() {
            if (!state) return [];
            const latest = {};
            (state.failures || []).forEach((f) => { latest[f.path] = f; });
            return Object.values(latest).map((f) => {
                const fx = [...state.fixes].reverse().find((x) => x.path === f.path);
                const ev = (state.evidence || {})[f.ref];
                return { path: f.path, cat: f.cat, ref: f.ref, cases: f.cases, collected: !!f.collected, fix: fx ? { id: fx.id, state: fx.state, mode: fx.mode } : null,
                    at: (ev && ev.at) || null, buildUrl: (ev && ev.buildUrl) || null,
                    caseInfo: f.cases.map((c) => ({ id: c, title: (state.cases[c] || {}).title || '', cls: (state.cases[c] || {}).cls || '',
                        error: ev && ev.errors && ev.errors[c] ? ev.errors[c].split('\n')[0].slice(0, 220) : '' })),
                    hook: ev && ev.errors && ev.errors._hooks ? ev.errors._hooks.split('\n').slice(0, 2).join(' ').slice(0, 220) : '',
                    robot: ev ? (ev.robot || []).slice(0, 2) : [],
                    shots: ev ? (ev.shots || []).slice(0, 3).map(relEv) : [],
                    evidence: ev ? { shots: (ev.shots || []).length, errors: Object.keys(ev.errors || {}).length, robot: (ev.robot || []).length } : null };
            });
        },
        setFixApproval(mode) {
            if (!state) throw new Error('No run');
            state.config.fixApproval = mode === 'manual' ? 'manual' : 'auto';
            if (mode !== 'manual') state.fixes.filter((f) => f.state === 'awaiting-approval').forEach((f) => { f.state = 'queued'; });
            log(`Fix approval switched to ${state.config.fixApproval}`); save();
        },
        report,
        caseTable,
        // Size a config before Start: specs/cases per target and a rough duration from history.
        async preview(cfgIn) {
            const cfg = { ...DEFAULT_CONFIG, ...cfgIn, models: { ...DEFAULT_CONFIG.models, ...(cfgIn.models || {}) } };
            if (!/^\d+$/.test(String(cfg.runId))) throw new Error('A numeric TestRail run ID is required');
            cfg.include = (cfg.include || []).map((x) => String(x).trim()).filter(Boolean);
            cfg.exclude = (cfg.exclude || []).map((x) => String(x).trim()).filter(Boolean);
            const [data, run, jq, cs] = await Promise.all([api('/api/testcases/data'), runStatuses(cfg.runId), api('/api/testcases/job-queue'), api('/api/cypress/state')]);
            const w = selectWork(cfg, data, run);
            const durs = {};
            (jq.history || []).forEach((h) => { if (h.duration > 0) (durs[h.path] = durs[h.path] || []).push(h.duration); });
            (cs.history || []).forEach((h) => { if (h.completedAt && h.startedAt) (durs[h.specPath] = durs[h.specPath] || []).push(h.completedAt - h.startedAt); });
            const est = (p) => { const d = durs[p]; return d && d.length ? d.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, d.length) : 8 * 60000; };
            let jobs = {}; try { jobs = loadJenkinsConfig().jobs || {}; } catch (e) { /* */ }
            const cap = Math.max(1, Number(cfg.maxParallelJenkins) || 2);
            const by = { jenkins: { offline: 0, online: 0, e2e: 0 }, local: 0 };
            const t = { jenkins: { offline: 0, online: 0, e2e: 0 }, local: 0 };
            by.auto = 0;
            w.items.forEach((it) => {
                if (it.route === 'auto') by.auto++;
                if (it.target === 'local') { by.local++; t.local += est(it.path); } else { by.jenkins[it.cat]++; t.jenkins[it.cat] += est(it.path); }
            });
            // with local-first routing the local slot takes specs one at a time and Jenkins takes the overflow,
            // so the run is roughly bounded by (all spec time) / (Jenkins lanes + 1 local lane)
            const autoMs = by.auto ? w.items.reduce((a, it) => a + est(it.path), 0) / (cap + 1) : 0;
            const lanes = (cat) => Math.max(1, Math.min(cap, (jobs[CAT_JOB[cat]] || []).length || 1));
            const jenkinsMs = Math.max(...['offline', 'online', 'e2e'].map((c) => t.jenkins[c] / lanes(c)), (t.jenkins.offline + t.jenkins.online + t.jenkins.e2e) / cap);
            const statusCount = Object.values(w.cases).reduce((m, c) => { m[c.before] = (m[c.before] || 0) + 1; return m; }, {});
            return {
                runName: run.runName, specs: w.items.length, cases: Object.keys(w.cases).length, statusCount,
                byTarget: by, dropped: w.dropped, etaMin: Math.round((by.auto ? autoMs : Math.max(jenkinsMs, t.local)) / 60000),
                noHistory: w.items.filter((it) => !durs[it.path]).length,
            };
        },
        // Keep or discard one fix in the worktree. Discard reverse-applies exactly that fix's patch.
        reviewFix(fixId, action) {
            const fx = state && state.fixes.find((f) => f.id === fixId);
            if (!fx || !fx.files || !fx.files.length) throw new Error('No reviewable fix with that id');
            if (action === 'discard') {
                if (!fx.patch) throw new Error('This fix was made before per-fix patches were recorded — discard it in the worktree by hand');
                execFileSync('git', ['apply', '-R', '--index', '-'], { cwd: state.config.worktree, input: fx.patch, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
                fx.review = 'discarded';
                log(`Discarded fix for ${short(fx.path)} — worktree changes reverted`);
            } else {
                fx.review = 'kept';
                log(`Kept fix for ${short(fx.path)}`);
            }
            save();
            return { review: fx.review };
        },
        reportMarkdown() {
            const r = report();
            if (!r || !r.total) throw new Error('No run to report');
            const line = (o) => Object.entries(o || {}).map(([k, v]) => `${k} ${v}`).join(' · ');
            const list = (rows, n = 25) => rows.slice(0, n).map((c) => `- ${c.id} — ${c.path}${c.bug ? ` · 🐞 ${c.bug}` : ''}${c.note ? `\n  ${String(c.note).slice(0, 160)}` : ''}`).join('\n') + (rows.length > n ? `\n- …and ${rows.length - n} more` : '');
            const fx = r.fixes || [];
            const count = (st) => fx.filter((f) => f.state === st).length;
            return [
                `*RunMyTCs — run ${r.runId}${r.runName ? ` (${r.runName})` : ''}* · ${r.status}`,
                `Cases worked: ${r.total}`,
                `Before: ${line(r.before)}`,
                `Now: ${line(r.now)}`,
                `Fixes: ${count('verified')} verified · ${count('failed-verify')} did not verify · ${fx.filter((f) => ['verify-pending', 'verifying'].includes(f.state)).length} unverified · ${count('over-cap')} over cap`,
                `Claude: ${r.usage.calls} calls · ${(r.usage.inTok / 1e6).toFixed(1)}M tokens in`,
                r.nowPassing.length ? `\n✅ Now passing (${r.nowPassing.length})\n${list(r.nowPassing)}` : '',
                r.blocked.length ? `\n🚫 Blocked — needs a person (${r.blocked.length})\n${list(r.blocked)}` : '',
                r.stillFailing.length ? `\n❌ Still failing (${r.stillFailing.length})\n${list(r.stillFailing, 15)}` : '',
            ].filter(Boolean).join('\n');
        },
        async sendReport() {
            if (!sendTelegram) throw new Error('Telegram is not configured');
            await sendTelegram(this.reportMarkdown());
            return { sent: true };
        },
        // TestRail statuses for the tree's "run" column (cached; manifest cases only are shown).
        async runStatus(runId) {
            if (!/^\d+$/.test(String(runId || ''))) return { statuses: {} };
            const r = await runStatuses(runId);
            return { runId, runName: r.runName, statuses: r.statuses, fetchedAt: r.fetchedAt };
        },
        // Pull another page's marks into RunMyTCs. Jenkins Runner: its manual status, bug links
        // and notes. Cypress Runner: the same plus every local run's per-case results, with their
        // real dates, into the dated pass/fail record. Existing RunMyTCs marks win unless overwrite.
        async importFrom(source, overwrite) {
            if (!['jenkins', 'cypress'].includes(source)) throw new Error('source must be jenkins or cypress');
            const ids = new Set((await api('/api/testcases/data')).rows.map((r) => r.id));
            const [marks, bugs, notes] = await Promise.all([
                api(source === 'jenkins' ? '/api/testcases/jenkins-manual-status' : '/api/testcases/manual-status'),
                api(source === 'jenkins' ? '/api/testcases/jenkins-bug-links' : '/api/testcases/bug-links'),
                api('/api/testcases/notes'),
            ]);
            const n = { status: 0, bug: 0, note: 0, results: 0 };
            const src = `import-${source}`;
            for (const cid of ids) {
                const e = store[cid] || { history: [] };
                let touched = false;
                const m = marks[cid];
                if (m && MANUAL_OK.has(m.status) && (overwrite || !e.status)) {
                    e.status = m.status; n.status++; touched = true;
                    e.results = e.results || [];
                    if (!e.results.some((x) => x.source === src && x.t === m.updatedAt)) {
                        e.results.push({ t: m.updatedAt || now(), runId: '', result: m.status, ref: `${source} runner mark`, source: src }); n.results++;
                    }
                }
                if (bugs[cid] && bugs[cid].bugId && (overwrite || !e.bug)) { e.bug = bugs[cid].bugId; n.bug++; touched = true; }
                if (notes[cid] && notes[cid].text && (overwrite || !e.note)) { e.note = notes[cid].text; n.note++; touched = true; }
                if (touched) { e.history.push({ t: now(), runId: '', src, status: e.status, bug: e.bug, note: e.note }); store[cid] = e; }
            }
            if (source === 'cypress') {
                const cs = await api('/api/cypress/state');
                for (const h of cs.history || []) {
                    for (const [num, sid] of Object.entries(h.caseResults || {})) {
                        const cid = `C${num}`;
                        if (!ids.has(cid) || (sid !== 1 && sid !== 5)) continue;
                        const e = store[cid] || (store[cid] = { history: [] });
                        e.results = e.results || [];
                        const ref = `local:${h.id}`;
                        if (e.results.some((x) => x.ref === ref)) continue;
                        e.results.push({ t: h.completedAt || h.startedAt || now(), runId: h.testrailRunId || '', result: sid === 1 ? 'passed' : 'failed', ref, source: 'cypress-runner' });
                        n.results++;
                    }
                }
            }
            for (const e of Object.values(store)) if (e.results) e.results.sort((a, b) => a.t - b.t).splice(0, Math.max(0, e.results.length - 200));
            saveStore();
            if (state) log(`Imported from ${source} runner: ${n.status} status, ${n.bug} bug link(s), ${n.note} note(s), ${n.results} dated result(s)`);
            return n;
        },
        // Evidence for one build ref (fix cards) and safe file serving for logs/screenshots.
        evidence(ref) {
            const ev = state && state.evidence && state.evidence[ref];
            if (!ev) return null;
            return { ref: ev.ref, buildUrl: ev.buildUrl, log: relEv(ev.log), shots: (ev.shots || []).map(relEv), errors: ev.errors, robot: ev.robot || [] };
        },
        evidenceFile(rel) {
            const full = path.resolve(EV_DIR, String(rel || ''));
            if (!full.startsWith(EV_DIR + path.sep) || !fs.existsSync(full)) throw new Error('No such evidence file');
            return full;
        },
        // Named settings presets, saved server-side (data/runmytcs/presets.json).
        presets() {
            try { return JSON.parse(fs.readFileSync(path.join(DIR, 'presets.json'), 'utf8')); } catch (e) { return []; }
        },
        savePreset(name, config) {
            const n = String(name || '').trim().slice(0, 40);
            if (!n) throw new Error('Preset name is required');
            const keep = ['runId', 'statuses', 'cats', 'onFailure', 'fixApproval', 'jira', 'useJenkins', 'useLocal', 'e2eTarget', 'environment', 'models', 'maxFixes', 'maxParallelJenkins', 'rerunFlakyOnce', 'include', 'exclude'];
            const cfg = Object.fromEntries(keep.filter((k) => config && config[k] !== undefined).map((k) => [k, config[k]]));
            const list = this.presets().filter((x) => x.name !== n);
            list.push({ name: n, config: cfg, savedAt: now() });
            writeJsonAtomic(path.join(DIR, 'presets.json'), list);
            return list;
        },
        deletePreset(name) {
            const list = this.presets().filter((x) => x.name !== name);
            writeJsonAtomic(path.join(DIR, 'presets.json'), list);
            return list;
        },
        caseResults(caseId) {
            const e = store[caseId] || {};
            return { caseId, results: e.results || [], history: e.history || [] };
        },
        async editCase(caseId, patch) {
            if (!/^C\d+$/.test(String(caseId))) throw new Error('caseId like C123 is required');
            const p = {};
            if (patch.status !== undefined) {
                if (patch.status && !MANUAL_OK.has(patch.status)) throw new Error('status must be passed/failed/blocked/retest or empty');
                if (patch.status) p.status = patch.status; else if (store[caseId]) { delete store[caseId].status; }
            }
            if (patch.note !== undefined) p.note = String(patch.note);
            if (patch.bug !== undefined) p.bug = String(patch.bug).trim();
            await setCase(caseId, p, 'user');
            if (p.status) recordResult(caseId, p.status, 'manual mark', 'manual');
            if (state) save();
            return store[caseId];
        },
        history() {
            try {
                return fs.readdirSync(path.join(DIR, 'runs')).filter((f) => f.endsWith('.json')).sort().reverse().slice(0, 20).map((f) => {
                    const s = JSON.parse(fs.readFileSync(path.join(DIR, 'runs', f), 'utf8'));
                    return { id: s.id, runId: s.config.runId, status: s.status, startedAt: s.startedAt, finishedAt: s.finishedAt, summary: s.summary && { before: s.summary.before, now: s.summary.now, usage: s.summary.usage } };
                });
            } catch (e) { return []; }
        },
    };
}

module.exports = { createRunMyTcs, parseConsole };
