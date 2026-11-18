// Cypress Runner (local runs, queue, history, TestRail sync).
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { AdmZip, CYR_DIR, CYR_SCREENSHOTS_DIR, INTEGRATIONS_CONFIG_PATH, TCD_E2E_ROOT, fs, path, spawn,
        tcdGrepTagsFor, tcdHttpRequest, tcdLoadTrConfig, tcdOwnedCasesForPath, tcdParseCaseIds, tcdSendTelegramAttachments, tcdSendTelegramMessage,
        trWithQualityRating, writeJsonAtomic } = ctx;

    // Case mode: narrow a spec run to our cases (or the caller's subset).
    // grepOmitFiltered drops the rest from the output instead of listing them as pending.
    function cyrCaseEnv(specPath, cases) {
        const ids = Array.isArray(cases) && cases.length ? tcdParseCaseIds(cases) : (specPath ? tcdOwnedCasesForPath(specPath) : null);
        const grepTags = tcdGrepTagsFor(ids, specPath);
        return grepTags ? { grepTags, grepOmitFiltered: 'true' } : null;
    }

    // ════════════════════════════════════════════
    // CYPRESS RUNNER — trigger local `cypress run` (headed/headless) against a
    // project path the user configures on the page. This repo has no Cypress
    // project of its own, so this always spawns against an external checkout.
    // Only one run at a time (simplest on a single dev machine — avoids
    // browser/port contention); `detached: true` makes the spawned process its
    // own process-group leader so killing it can also reach the Electron/Chrome
    // child Cypress launches, which a plain child.kill() would not.
    // ════════════════════════════════════════════

    const CYR_STATE_PATH = path.join(CYR_DIR, 'state.json');
    const CYR_HISTORY_PATH = path.join(CYR_DIR, 'history.json');
    const CYR_HISTORY_MAX = 2000;

    let cyrActiveRun = null;
    let cyrRunHistory = [];

    function cyrGenerateRunId() {
        return `cyr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    // Resolves the project's own local Cypress binary rather than shelling out
    // to `npx cypress`, which silently attempts a registry download (and can
    // hang indefinitely in a non-interactive spawn) when Cypress isn't already
    // installed in that project.
    function cyrValidateProjectPath(projectPath) {
        if (!projectPath || typeof projectPath !== 'string') {
            return { ok: false, error: 'Project path is required' };
        }
        if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
            return { ok: false, error: `"${projectPath}" is not a directory` };
        }
        const configNames = ['cypress.config.js', 'cypress.config.ts', 'cypress.config.mjs', 'cypress.config.cjs', 'cypress.json'];
        if (!configNames.some((n) => fs.existsSync(path.join(projectPath, n)))) {
            return { ok: false, error: 'No cypress.config.(js|ts|mjs|cjs) or cypress.json found in that directory' };
        }
        const bin = path.join(projectPath, 'node_modules', '.bin', 'cypress');
        if (!fs.existsSync(bin)) {
            return { ok: false, error: `Cypress binary not found under node_modules/.bin — run "npm install" in ${projectPath} first` };
        }
        return { ok: true, bin };
    }

    function cyrBuildArgs({ specPath, browser, headed, environment, screenshotsFolder, reporter, envExtra }) {
        // Headed runs keep each test's command log + DOM snapshots in the runner
        // window after it finishes (Cypress run mode normally clears them — see
        // CYR_HEADED_ENV below); headless runs stay at Cypress's default of 0.
        const keep = headed ? ',numTestsKeptInMemory=50' : '';
        const args = ['run', '--config', `screenshotsFolder=${screenshotsFolder},video=false${keep}`];
        // Optional override, e.g. 'spec' for RunMyTCs fix verification — the project's own
        // reporter posts to TestRail, which must not happen for an unmerged fix.
        if (reporter) args.push('--reporter', reporter);
        if (browser) args.push('--browser', browser);
        if (headed) args.push('--headed');
        const envParts = [];
        if (environment) envParts.push(`configFile=${environment}`);
        Object.entries(envExtra || {}).forEach(([k, v]) => envParts.push(`${k}=${v}`));
        if (envParts.length) args.push('--env', envParts.join(','));
        if (specPath) args.push('--spec', specPath);
        return args;
    }

    function cyrAppendLog(run, chunk) {
        run.logBuffer += chunk;
        try { fs.appendFileSync(run.logPath, chunk); } catch (e) { /* best effort, in-memory buffer still has it */ }
    }

    function cyrStripAnsi(text) {
        return String(text || '').replace(/\x1b\[[0-9;]*m/g, '');
    }

    // Cypress's default `spec` reporter (kept so output streams naturally for
    // live tailing, unlike `--reporter json` which only dumps one blob at exit)
    // prints a per-spec "Tests:/Passing:/Failing:/Pending:/Skipped:" block. This
    // sums those across every spec in the run rather than parsing the fragile
    // bordered "All specs passed!" summary table.
    function cyrParseSummary(logText) {
        const sum = (label) => {
            const re = new RegExp(`${label}:\\s*(\\d+)`, 'g');
            let total = 0, matched = false, m;
            while ((m = re.exec(logText))) { total += Number(m[1]); matched = true; }
            return matched ? total : null;
        };
        const tests = sum('Tests');
        const passing = sum('Passing');
        const failing = sum('Failing');
        if (tests === null && passing === null && failing === null) return null;
        return {
            tests: tests || 0,
            passing: passing || 0,
            failing: failing || 0,
            pending: sum('Pending') || 0,
            skipped: sum('Skipped') || 0,
        };
    }

    // Cypress's default spec reporter prints each it() title verbatim next to a
    // ✓ (pass) or a bare "N)" (fail) in its per-spec listing. Case IDs are
    // required to be the leading token(s) of an it() title (same convention as
    // tcdExtractFromFile's TCD_LEADING_ID_RE/TCD_NEXT_ID_RE, e.g. "C12345 does
    // X" or "C12345 | C12346 does X"), so requiring the match to START with a
    // case ID naturally excludes describe-block names and the bordered summary
    // table — no dependency on manifest data, no reporter plugins needed.
    function cyrExtractCaseResults(logText) {
        const idGroup = 'C\\d{5,}(?:\\s*\\|\\s*C\\d{5,})*';
        const passRe = new RegExp(`^\\s*\\u2713\\s+(${idGroup})`, 'gm');
        const failRe = new RegExp(`^\\s*\\d+\\)\\s+(${idGroup})`, 'gm');
        const result = {};
        let matched = false;
        let m;
        while ((m = passRe.exec(logText))) {
            matched = true;
            m[1].split('|').forEach((id) => { result[id.trim().replace(/^C/i, '')] = 1; });
        }
        // Failures are applied after passes so a genuine failure always wins
        // over any conflicting/duplicate match for the same case ID.
        while ((m = failRe.exec(logText))) {
            matched = true;
            m[1].split('|').forEach((id) => { result[id.trim().replace(/^C/i, '')] = 5; });
        }
        return matched ? result : null;
    }

    function cyrPostTestRailResults(testrailRunId, resultMap, cyrRunId) {
        const { url, auth } = tcdLoadTrConfig();
        const results = Object.keys(resultMap).map((caseId) => ({
            case_id: Number(caseId),
            status_id: resultMap[caseId],
            comment: `Local Cypress run ${cyrRunId}`,
        }));
        return tcdHttpRequest(`${url}/index.php?/api/v2/add_results_for_cases/${testrailRunId}`, {
            method: 'POST',
            headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ results: results.map(trWithQualityRating) }),
        }).then((res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                throw new Error(`TestRail ${res.statusCode}: ${res.body.slice(0, 300)}`);
            }
            return results.length;
        });
    }

    // Client-supplied (manual sync button) result maps are validated before
    // ever reaching a TestRail POST — case_id must be a positive integer and
    // status_id must be one of the values this feature can produce: 1=passed,
    // 2=blocked, 4=retest, 5=failed (TestRail's own status ids). Blocked/retest
    // only ever come from a manually-marked case (cyrExtractCaseResults itself
    // only ever emits 1/5), but sync doesn't care which source it came from.
    function cyrSanitizeResultMap(resultMap) {
        const clean = {};
        Object.keys(resultMap || {}).forEach((k) => {
            const caseId = Number(k);
            const statusId = Number(resultMap[k]);
            if (Number.isInteger(caseId) && caseId > 0 && [1, 2, 4, 5].includes(statusId)) {
                clean[caseId] = statusId;
            }
        });
        return clean;
    }

    // Fire-and-forget from cyrFinalizeRun — a TestRail failure must never affect
    // the run's own pass/fail/screenshot outcome, so every error is captured
    // onto run.testrailSync instead of propagating.
    async function cyrSyncTestRailResults(run) {
        try {
            const resultMap = run.caseResults;
            if (!resultMap || Object.keys(resultMap).length === 0) {
                run.testrailSync = { posted: 0, error: null };
            } else {
                const posted = await cyrPostTestRailResults(run.testrailRunId, resultMap, run.id);
                run.testrailSync = { posted, error: null };
            }
        } catch (err) {
            run.testrailSync = { posted: 0, error: String(err && err.message || err) };
        }
        try { writeJsonAtomic(path.join(run.dir, 'meta.json'), cyrSerializeRun(run)); } catch (e) { /* best effort */ }
        const idx = cyrRunHistory.findIndex((h) => h.id === run.id);
        if (idx !== -1) { cyrRunHistory[idx] = cyrSerializeRun(run); cyrSaveHistory(); }
    }

    function cyrWalkScreenshots(dir, runId, relBase = '') {
        let out = [];
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
        entries.forEach((entry) => {
            const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                out = out.concat(cyrWalkScreenshots(path.join(dir, entry.name), runId, rel));
            } else {
                const url = `/api/cypress/screenshots/${runId}/${rel.split('/').map(encodeURIComponent).join('/')}`;
                out.push({ name: rel, url });
            }
        });
        return out;
    }

    function cyrSerializeRun(run) {
        if (!run) return null;
        return {
            id: run.id,
            projectPath: run.projectPath,
            specPath: run.specPath || null,
            label: run.label || null,
            category: run.category || null,
            browser: run.browser || null,
            headed: !!run.headed,
            environment: run.environment || null,
            testrailRunId: run.testrailRunId || null,
            testrailSync: run.testrailSync || null,
            caseResults: run.caseResults || null,
            status: run.status,
            startedAt: run.startedAt,
            completedAt: run.completedAt || null,
            duration: (run.completedAt || Date.now()) - run.startedAt,
            stats: run.stats || null,
            screenshots: run.screenshots || [],
            exitCode: run.exitCode !== undefined ? run.exitCode : null,
        };
    }

    function cyrSaveHistory() {
        try {
            writeJsonAtomic(CYR_HISTORY_PATH, cyrRunHistory.slice(0, CYR_HISTORY_MAX));
        } catch (e) {
            console.error('[cypress-runner] failed to save history:', e.message);
        }
    }

    // A finished run's full output only lives on disk (or, for the one run
    // that's still active, in its in-memory buffer) — never in the history
    // array itself — so bulk export has to re-read it here rather than
    // trusting anything the client already has cached.
    function cyrReadRunLog(runId) {
        if (cyrActiveRun && cyrActiveRun.id === runId) return cyrActiveRun.logBuffer || '';
        try {
            return fs.readFileSync(path.join(CYR_DIR, runId, 'log.txt'), 'utf8');
        } catch (e) {
            return '';
        }
    }

    // Mirrors buildCyrReportText in client/src/pages/cypress-runner/helpers.js —
    // duplicated rather than shared since that file is an ES module the client
    // bundles and this one's a CommonJS server file.
    function cyrBuildRunSummaryText(h) {
        const verdict = h.status === 'passed' ? 'PASS' : (h.status === 'failed' ? 'FAIL' : String(h.status || 'UNKNOWN').toUpperCase());
        const statsStr = h.stats
            ? `${h.stats.passing} passed, ${h.stats.failing} failed${h.stats.pending ? `, ${h.stats.pending} pending` : ''}`
            : 'no pass/fail data';
        const lines = [
            `[${verdict}] ${h.specPath || 'all specs'}`,
            `${h.category ? h.category + ' — ' : ''}${h.browser || 'electron'}${h.headed ? ' (headed)' : ''}${h.environment ? ` — env: ${h.environment}` : ''}`,
            statsStr,
            `Started ${h.startedAt ? new Date(h.startedAt).toLocaleString() : 'unknown'}${h.duration ? ` · took ${cyrFormatDurationForExport(h.duration)}` : ''}`,
        ];
        if (h.testrailRunId) lines.push(`TestRail run #${h.testrailRunId}`);
        return lines.join('\n');
    }

    function cyrFormatDurationForExport(ms) {
        if (!ms || ms <= 0) return '0s';
        const totalSec = Math.round(ms / 1000);
        if (totalSec < 60) return `${totalSec}s`;
        const min = Math.floor(totalSec / 60), sec = totalSec % 60;
        if (min < 60) return `${min}m ${sec}s`;
        const hr = Math.floor(min / 60), remMin = min % 60;
        return `${hr}h ${remMin}m`;
    }

    // Persists just enough to detect + report an orphaned run if the server
    // restarts mid-run — there's no way to reattach to a lost child process, so
    // this is read back once on boot and turned into an 'interrupted' history
    // entry, not resumed.
    function cyrSaveState() {
        try {
            if (cyrActiveRun) {
                writeJsonAtomic(CYR_STATE_PATH, {
                    active: {
                        runId: cyrActiveRun.id,
                        pid: cyrActiveRun.pid,
                        startedAt: cyrActiveRun.startedAt,
                        projectPath: cyrActiveRun.projectPath,
                        specPath: cyrActiveRun.specPath,
                        category: cyrActiveRun.category,
                        browser: cyrActiveRun.browser,
                        headed: cyrActiveRun.headed,
                        environment: cyrActiveRun.environment,
                        testrailRunId: cyrActiveRun.testrailRunId,
                    },
                });
            } else if (fs.existsSync(CYR_STATE_PATH)) {
                fs.unlinkSync(CYR_STATE_PATH);
            }
        } catch (e) {
            console.error('[cypress-runner] failed to save state:', e.message);
        }
    }

    // Cypress screenshots live on local disk under this run's own directory —
    // unlike Jenkins artifacts there's nothing to fetch over HTTP or authenticate,
    // just a direct file read, so this is the fetcher tcdSendTelegramAttachments
    // is given instead of its Jenkins-HTTP default.
    function cyrFetchAttachment(item) {
        try {
            const data = fs.readFileSync(item.filePath);
            const ext = path.extname(item.filePath).toLowerCase();
            const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
            return Promise.resolve({ name: 'photo', filename: item.filename, contentType, data });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    // Fire-and-forget, mirrors tcdNotifyBuildResult's gating exactly (same
    // TELEGRAM_* config, same bot/chat) — 'killed' counts as a failure (same
    // treatment Jenkins gives ABORTED); 'interrupted' (a server crash, not a
    // real test outcome) is never notified.
    function cyrNotifyRunResult(run) {
        const isFailure = run.status === 'failed' || run.status === 'killed';
        const isSuccess = run.status === 'passed';
        if (!isFailure && !isSuccess) return;

        let cfg;
        try {
            cfg = JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
        } catch (e) {
            return;
        }
        if (!cfg.TELEGRAM_BOT_TOKEN || !cfg.TELEGRAM_CHAT_ID) return;
        if (isFailure && !cfg.TELEGRAM_NOTIFY_ON_FAILURE) return;
        if (isSuccess && !cfg.TELEGRAM_NOTIFY_ON_SUCCESS) return;

        const lines = [
            `${isSuccess ? '🟢' : '🔴'} Cypress run ${run.status}`,
            run.specPath || 'all specs',
            `${run.category ? run.category + ' — ' : ''}${run.browser || 'electron'}${run.headed ? ' (headed)' : ''}${run.environment ? ` — env: ${run.environment}` : ''}`,
        ];
        if (run.stats) lines.push(`${run.stats.passing} passed, ${run.stats.failing} failed`);
        if (run.testrailRunId) lines.push(`TestRail run #${run.testrailRunId}`);
        const text = lines.join('\n');

        const attachScreenshots = cfg.TELEGRAM_ATTACH_SCREENSHOTS !== false; // default on
        const attachments = [];
        if (attachScreenshots) {
            (run.screenshots || []).forEach((s) => {
                attachments.push({ type: 'photo', filename: path.basename(s.name), filePath: path.join(CYR_SCREENSHOTS_DIR, run.id, s.name) });
            });
        }

        if (attachments.length > 0) {
            tcdSendTelegramAttachments(attachments, text, cfg, cyrFetchAttachment).catch((err) => {
                console.error('[cypress-runner] Telegram attachment notify failed, falling back to text:', err.message);
                tcdSendTelegramMessage(text, cfg).catch((err2) => {
                    console.error('[cypress-runner] Telegram text fallback also failed:', err2.message);
                });
            });
        } else {
            tcdSendTelegramMessage(text, cfg).catch((err) => {
                console.error('[cypress-runner] Telegram run notify failed:', err.message);
            });
        }
    }

    function cyrFinalizeRun(run) {
        if (run.finalized) return; // guard: child 'exit' can race with a kill-timeout SIGKILL path
        run.finalized = true;
        if (run.killTimer) clearTimeout(run.killTimer);
        run.completedAt = Date.now();
        run.status = run.cancelRequested ? 'killed' : (run.exitCode === 0 ? 'passed' : 'failed');
        const fullLog = cyrStripAnsi(run.logBuffer);
        run.stats = cyrParseSummary(fullLog);
        run.caseResults = cyrExtractCaseResults(fullLog);
        run.screenshots = cyrWalkScreenshots(path.join(CYR_SCREENSHOTS_DIR, run.id), run.id);
        try {
            writeJsonAtomic(path.join(run.dir, 'meta.json'), cyrSerializeRun(run));
        } catch (e) {
            console.error('[cypress-runner] failed to write run meta.json:', e.message);
        }
        cyrRunHistory.unshift(cyrSerializeRun(run));
        cyrRunHistory = cyrRunHistory.slice(0, CYR_HISTORY_MAX);
        cyrSaveHistory();
        cyrActiveRun = null;
        cyrSaveState();
        if (run.testrailRunId && (run.status === 'passed' || run.status === 'failed')) {
            cyrSyncTestRailResults(run).catch(() => {}); // errors are captured onto run.testrailSync, never thrown here
        }
        cyrNotifyRunResult(run);
        cyrPumpQueue();
    }

    function cyrSpawnRun(run, bin) {
        const args = cyrBuildArgs({
            specPath: run.specPath,
            browser: run.browser,
            headed: run.headed,
            environment: run.environment,
            screenshotsFolder: path.join(CYR_SCREENSHOTS_DIR, run.id),
            reporter: run.reporter,
            envExtra: run.envExtra,
        });
        // Cypress run mode forces numTestsKeptInMemory to 0 (config/project/utils.js)
        // unless this internal env var is set — without it a headed run shows
        // "No commands were issued in this test" once each test finishes.
        const env = run.headed ? { ...process.env, CYPRESS_INTERNAL_HONOR_NUM_TESTS_KEPT_IN_MEMORY: 'true' } : process.env;
        const child = spawn(bin, args, { cwd: run.projectPath, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env });
        run.child = child;
        run.pid = child.pid;
        child.stdout.on('data', (chunk) => cyrAppendLog(run, chunk.toString()));
        child.stderr.on('data', (chunk) => cyrAppendLog(run, chunk.toString()));
        child.on('error', (err) => {
            cyrAppendLog(run, `\n[cypress-runner] failed to start Cypress: ${err.message}\n`);
            run.exitCode = -1;
            cyrFinalizeRun(run);
        });
        child.on('exit', (code) => {
            run.exitCode = code;
            cyrFinalizeRun(run);
        });
        cyrSaveState();
    }

    function cyrKillRun(runId) {
        if (!cyrActiveRun || cyrActiveRun.id !== runId) return { ok: false, error: 'No active run with that id' };
        const run = cyrActiveRun;
        run.cancelRequested = true;
        try { process.kill(-run.pid, 'SIGTERM'); } catch (e) { /* already gone */ }
        run.killTimer = setTimeout(() => {
            if (!run.finalized) {
                try { process.kill(-run.pid, 'SIGKILL'); } catch (e) { /* already gone */ }
            }
        }, 5000);
        return { ok: true };
    }

    // ── Queue: files selected from the manifest tree (Test Cases page's own
    // file listing, GET /api/testcases/data) run one at a time locally, reusing
    // TCD_E2E_ROOT as the project — that's the real project these manifest
    // paths resolve against, independent of whatever the free-form manual
    // single-run panel has typed into its own project-path field. ──
    const CYR_QUEUE_PATH = path.join(CYR_DIR, 'queue.json');
    let cyrQueue = [];

    function cyrSaveQueue() {
        try {
            writeJsonAtomic(CYR_QUEUE_PATH, cyrQueue);
        } catch (e) {
            console.error('[cypress-runner] failed to save queue:', e.message);
        }
    }

    function cyrEnqueuePaths(items) {
        items.forEach((it) => {
            cyrQueue.push({
                id: cyrGenerateRunId(),
                path: it.path,
                cat: it.cat || null,
                browser: it.browser || '',
                headed: !!it.headed,
                environment: it.environment || '',
                testrailRunId: it.testrailRunId || '',
                envExtra: cyrCaseEnv(it.path, it.cases),
                queuedAt: Date.now(),
            });
        });
        cyrSaveQueue();
        cyrPumpQueue();
    }

    function cyrDequeue(id) {
        const idx = cyrQueue.findIndex((q) => q.id === id);
        if (idx === -1) return false;
        cyrQueue.splice(idx, 1);
        cyrSaveQueue();
        return true;
    }

    function cyrClearQueue() {
        const removed = cyrQueue.length;
        cyrQueue = [];
        cyrSaveQueue();
        return removed;
    }

    function cyrPumpQueue() {
        if (cyrActiveRun || cyrQueue.length === 0) return;
        const item = cyrQueue.shift();
        cyrSaveQueue();
        const validation = cyrValidateProjectPath(TCD_E2E_ROOT);
        if (!validation.ok) {
            // The manifest project itself is broken (missing/uninstalled) — every
            // queued item would fail identically, so record each as failed and
            // keep draining rather than retrying forever. Bounded by the queue's
            // original length, so this can't recurse indefinitely.
            const failedAt = Date.now();
            cyrRunHistory.unshift({
                id: item.id,
                projectPath: TCD_E2E_ROOT,
                specPath: item.path,
                category: item.cat,
                browser: item.browser || null,
                headed: !!item.headed,
                environment: item.environment || null,
                testrailRunId: item.testrailRunId || null,
                testrailSync: null,
                status: 'failed',
                startedAt: failedAt,
                completedAt: failedAt,
                duration: 0,
                stats: null,
                screenshots: [],
                exitCode: null,
                error: validation.error,
            });
            cyrRunHistory = cyrRunHistory.slice(0, CYR_HISTORY_MAX);
            cyrSaveHistory();
            cyrPumpQueue();
            return;
        }
        const dir = path.join(CYR_DIR, item.id);
        fs.mkdirSync(dir, { recursive: true });
        const run = {
            id: item.id,
            projectPath: TCD_E2E_ROOT,
            specPath: item.path,
            category: item.cat,
            browser: item.browser || '',
            headed: !!item.headed,
            environment: item.environment || '',
            testrailRunId: item.testrailRunId || '',
            envExtra: item.envExtra || null,
            status: 'running',
            startedAt: Date.now(),
            logBuffer: '',
            dir,
            logPath: path.join(dir, 'log.txt'),
            cancelRequested: false,
            finalized: false,
        };
        cyrActiveRun = run;
        cyrSpawnRun(run, validation.bin);
    }

    // Each run's own meta.json (written by cyrFinalizeRun) is the durable
    // source of truth and is never pruned — history.json is just a cache of it,
    // capped at CYR_HISTORY_MAX entries. If that cap was ever hit (or
    // history.json was lost/edited by hand), entries can end up on disk but
    // missing from the cached list. Re-merging from disk on every boot makes
    // that self-healing rather than a one-time fix.
    function cyrReconcileHistoryWithDisk() {
        let entries;
        try {
            entries = fs.readdirSync(CYR_DIR, { withFileTypes: true });
        } catch (e) {
            return;
        }
        const known = new Set(cyrRunHistory.map((h) => h.id));
        let recovered = 0;
        entries.forEach((entry) => {
            if (!entry.isDirectory() || known.has(entry.name)) return;
            try {
                const meta = JSON.parse(fs.readFileSync(path.join(CYR_DIR, entry.name, 'meta.json'), 'utf8'));
                cyrRunHistory.push(meta);
                known.add(entry.name);
                recovered++;
            } catch (e) {
                // no meta.json (still in progress when the server stopped, or corrupt) — skip
            }
        });
        if (recovered > 0) {
            cyrRunHistory.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
            cyrRunHistory = cyrRunHistory.slice(0, CYR_HISTORY_MAX);
            cyrSaveHistory();
            console.log(`[cypress-runner] recovered ${recovered} run(s) from disk into history`);
        }
    }

    function cyrResumeOnBoot() {
        try {
            cyrRunHistory = JSON.parse(fs.readFileSync(CYR_HISTORY_PATH, 'utf8'));
        } catch (e) {
            cyrRunHistory = [];
        }
        cyrReconcileHistoryWithDisk();
        try {
            cyrQueue = JSON.parse(fs.readFileSync(CYR_QUEUE_PATH, 'utf8'));
        } catch (e) {
            cyrQueue = [];
        }
        try {
            const saved = JSON.parse(fs.readFileSync(CYR_STATE_PATH, 'utf8'));
            const active = saved && saved.active;
            if (active && active.runId) {
                try { process.kill(-active.pid, 'SIGTERM'); } catch (e) { /* process (or its group) is probably already gone */ }
                const dir = path.join(CYR_DIR, active.runId);
                let logText = '';
                try { logText = fs.readFileSync(path.join(dir, 'log.txt'), 'utf8'); } catch (e) { /* no log captured */ }
                const strippedLog = cyrStripAnsi(logText);
                cyrRunHistory.unshift({
                    id: active.runId,
                    projectPath: active.projectPath || null,
                    specPath: active.specPath || null,
                    category: active.category || null,
                    browser: active.browser || null,
                    headed: !!active.headed,
                    environment: active.environment || null,
                    testrailRunId: active.testrailRunId || null,
                    testrailSync: null,
                    caseResults: cyrExtractCaseResults(strippedLog),
                    status: 'interrupted',
                    startedAt: active.startedAt,
                    completedAt: Date.now(),
                    duration: Date.now() - active.startedAt,
                    stats: cyrParseSummary(strippedLog),
                    screenshots: cyrWalkScreenshots(path.join(CYR_SCREENSHOTS_DIR, active.runId), active.runId),
                    exitCode: null,
                });
                cyrRunHistory = cyrRunHistory.slice(0, CYR_HISTORY_MAX);
                cyrSaveHistory();
            }
        } catch (e) {
            // no saved active-run state — nothing to resume
        }
        try { if (fs.existsSync(CYR_STATE_PATH)) fs.unlinkSync(CYR_STATE_PATH); } catch (e) { /* best effort */ }
        cyrPumpQueue();
    }

    // Debug: launches `cypress open` (interactive — keeps the full command log
    // and time-travel snapshots) on the manifest project, pre-filtered to the
    // given cases + their setup blocks. You click the spec in the window it opens.
    let cyrOpenChild = null;
    app.post('/api/cypress/open', (req, res) => {
        const { specPath, cases, environment } = req.body || {};
        if (cyrOpenChild && cyrOpenChild.exitCode === null) {
            return res.status(409).json({ error: 'A Cypress open window is already running — close it first' });
        }
        const validation = cyrValidateProjectPath(TCD_E2E_ROOT);
        if (!validation.ok) return res.status(400).json({ error: validation.error });
        const envParts = [];
        if (environment && /^[\w-]+$/.test(environment)) envParts.push(`configFile=${environment}`);
        const caseEnv = cyrCaseEnv(specPath, cases);
        if (caseEnv) Object.entries(caseEnv).forEach(([k, v]) => envParts.push(`${k}=${v}`));
        const args = ['open', '--e2e', '--browser', 'chrome'];
        if (envParts.length) args.push('--env', envParts.join(','));
        try {
            cyrOpenChild = spawn(validation.bin, args, { cwd: TCD_E2E_ROOT, detached: true, stdio: 'ignore' });
            cyrOpenChild.on('error', () => { /* reported via exitCode */ });
            cyrOpenChild.unref();
            res.json({ started: true, grepTags: caseEnv ? caseEnv.grepTags : null, spec: specPath || null });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/cypress/run', (req, res) => {
        if (cyrActiveRun) {
            return res.status(409).json({ error: 'A Cypress run is already in progress' });
        }
        const { projectPath, specPath, browser, headed, environment, testrailRunId, reporter, envExtra, label } = req.body || {};
        // --env is comma-separated key=value, so keys/values must not contain commas or '='
        if (envExtra && (typeof envExtra !== 'object' || Object.entries(envExtra).some(([k, v]) => !/^[A-Za-z_][\w]*$/.test(k) || /[,=]/.test(String(v))))) {
            return res.status(400).json({ error: 'Invalid envExtra' });
        }
        if (reporter && !/^[a-z0-9_.-]+$/i.test(reporter)) {
            return res.status(400).json({ error: 'Invalid reporter name' });
        }
        const validation = cyrValidateProjectPath(projectPath);
        if (!validation.ok) {
            return res.status(400).json({ error: validation.error });
        }
        const id = cyrGenerateRunId();
        const dir = path.join(CYR_DIR, id);
        fs.mkdirSync(dir, { recursive: true });
        const run = {
            id,
            projectPath,
            specPath: specPath || '',
            browser: browser || '',
            headed: !!headed,
            environment: environment || '',
            testrailRunId: testrailRunId || '',
            reporter: reporter || '',
            // A run with its own grepTags (e.g. a RunMyTCs fix check) keeps it; otherwise case mode narrows it.
            envExtra: (envExtra && envExtra.grepTags) ? envExtra : (Object.assign({}, cyrCaseEnv(specPath, req.body.cases), envExtra || {}) || null),
            label: label ? String(label).slice(0, 40) : '',
            status: 'running',
            startedAt: Date.now(),
            logBuffer: '',
            dir,
            logPath: path.join(dir, 'log.txt'),
            cancelRequested: false,
            finalized: false,
        };
        cyrActiveRun = run;
        cyrSpawnRun(run, validation.bin);
        res.status(202).json({ runId: id });
    });

    app.post('/api/cypress/queue', (req, res) => {
        const { items, browser, headed, environment, testrailRunId } = req.body || {};
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items must be a non-empty array' });
        }
        if (items.some((it) => !it || typeof it.path !== 'string' || !it.path)) {
            return res.status(400).json({ error: 'Each item needs a path' });
        }
        const validation = cyrValidateProjectPath(TCD_E2E_ROOT);
        if (!validation.ok) {
            return res.status(400).json({ error: `Manifest E2E project (${TCD_E2E_ROOT}): ${validation.error}` });
        }
        cyrEnqueuePaths(items.map((it) => ({
            path: it.path,
            cat: it.cat || it.category || null,
            cases: it.cases,
            browser, headed, environment, testrailRunId,
        })));
        res.status(202).json({ queued: items.length });
    });

    app.post('/api/cypress/dequeue', (req, res) => {
        const id = req.body && req.body.id;
        if (!id) return res.status(400).json({ error: 'id is required' });
        if (!cyrDequeue(id)) return res.status(404).json({ error: 'No queued item with that id' });
        res.json({ success: true });
    });

    app.post('/api/cypress/kill', (req, res) => {
        const runId = req.body && req.body.runId;
        if (!runId) return res.status(400).json({ error: 'runId is required' });
        const result = cyrKillRun(runId);
        if (!result.ok) return res.status(404).json({ error: result.error });
        res.json({ success: true });
    });

    // "Cancel the whole queue" — drops every not-yet-started item and, if a run
    // is currently in progress, stops that too. The queue is cleared before the
    // kill signal goes out so that once the child actually exits and
    // cyrFinalizeRun fires its own cyrPumpQueue() call, there's nothing left for
    // it to pick up.
    app.post('/api/cypress/stop-all', (req, res) => {
        const removedFromQueue = cyrClearQueue();
        let stoppedRunId = null;
        if (cyrActiveRun) {
            stoppedRunId = cyrActiveRun.id;
            cyrKillRun(stoppedRunId);
        }
        res.json({ success: true, removedFromQueue, stoppedRunId });
    });

    // Manual sync — triggered from a file/group/category sync button in the
    // tree. The client already holds run history (used for the tree's own
    // trend dots) so it computes which case IDs to sync and their latest known
    // status itself; this route only validates and posts.
    app.post('/api/cypress/sync-testrail', async (req, res) => {
        const { testrailRunId, resultMap } = req.body || {};
        if (!testrailRunId) return res.status(400).json({ error: 'TestRail run ID is required' });
        const clean = cyrSanitizeResultMap(resultMap);
        if (Object.keys(clean).length === 0) {
            return res.status(400).json({ error: 'No local run results to sync yet' });
        }
        try {
            const posted = await cyrPostTestRailResults(testrailRunId, clean, 'manual sync');
            res.json({ posted });
        } catch (err) {
            res.status(502).json({ error: String(err && err.message || err) });
        }
    });

    // Manual "send report" button on a run. The client only names the run
    // (already-finished, so this always re-reads its screenshots fresh from
    // disk rather than trusting whatever the client separately fetched earlier)
    // and supplies the report text; attachments are entirely server-derived.
    app.post('/api/cypress/telegram/send', async (req, res) => {
        const { runId, text, attachScreenshots } = req.body || {};
        if (!runId || !/^[a-zA-Z0-9_-]+$/.test(runId)) return res.status(400).json({ error: 'Invalid runId' });
        const trimmedText = String(text || '').trim();
        if (!trimmedText) return res.status(400).json({ error: 'text is required' });
        try {
            let attachments = [];
            if (attachScreenshots) {
                const dir = path.join(CYR_SCREENSHOTS_DIR, runId);
                attachments = cyrWalkScreenshots(dir, runId).map((f) => ({
                    type: 'photo',
                    filename: path.basename(f.name),
                    filePath: path.join(dir, f.name),
                }));
            }
            if (attachments.length > 0) {
                await tcdSendTelegramAttachments(attachments, trimmedText, null, cyrFetchAttachment);
            } else {
                await tcdSendTelegramMessage(trimmedText, null);
            }
            res.json({ success: true });
        } catch (err) {
            res.status(502).json({ error: String(err && err.message || err) });
        }
    });

    // Bulk export for the Runs history panel's multi-select — either every run
    // on a chosen date, or a hand-picked set of checked runs (same
    // selection-wins-over-date precedence the client applies before calling
    // this). 'txt' bundles just the summaries + full logs into one text file
    // (screenshots can't go in a text file, so that format never touches them);
    // 'zip' additionally walks each run's screenshot folder into the archive.
    app.post('/api/cypress/export', (req, res) => {
        const { runIds, format } = req.body || {};
        if (!Array.isArray(runIds) || runIds.length === 0) {
            return res.status(400).json({ error: 'runIds[] is required' });
        }
        if (format !== 'zip' && format !== 'txt') {
            return res.status(400).json({ error: "format must be 'zip' or 'txt'" });
        }
        const runIdSet = new Set(runIds);
        const runs = cyrRunHistory.filter((h) => runIdSet.has(h.id));
        if (cyrActiveRun && runIdSet.has(cyrActiveRun.id) && !runs.some((h) => h.id === cyrActiveRun.id)) {
            runs.push(cyrSerializeRun(cyrActiveRun));
        }
        if (runs.length === 0) return res.status(404).json({ error: 'None of the given run ids were found' });

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');

        if (format === 'txt') {
            const parts = runs.map((h) => [
                '='.repeat(70),
                cyrBuildRunSummaryText(h),
                '-'.repeat(70),
                cyrReadRunLog(h.id) || '(no log captured for this run)',
            ].join('\n'));
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="cypress-runs-${stamp}.txt"`);
            return res.send(parts.join('\n\n\n'));
        }

        const zip = new AdmZip();
        runs.forEach((h, idx) => {
            const specName = (h.specPath ? path.basename(h.specPath, path.extname(h.specPath)) : 'run').replace(/[^a-z0-9_-]/gi, '_');
            const folder = `${String(idx + 1).padStart(2, '0')}_${specName}_${h.id}`;
            zip.addFile(`${folder}/summary.txt`, Buffer.from(cyrBuildRunSummaryText(h), 'utf8'));
            zip.addFile(`${folder}/log.txt`, Buffer.from(cyrReadRunLog(h.id) || '(no log captured for this run)', 'utf8'));
            const shotsDir = path.join(CYR_SCREENSHOTS_DIR, h.id);
            cyrWalkScreenshots(shotsDir, h.id).forEach((s) => {
                const fp = path.join(shotsDir, s.name);
                if (!fs.existsSync(fp)) return;
                const shotFolder = `${folder}/screenshots/${path.dirname(s.name)}`.replace(/\/\.$/, '');
                zip.addLocalFile(fp, shotFolder, path.basename(s.name));
            });
        });
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="cypress-runs-${stamp}.zip"`);
        res.send(zip.toBuffer());
    });

    app.get('/api/cypress/state', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json({ queue: cyrQueue, active: cyrSerializeRun(cyrActiveRun), history: cyrRunHistory });
    });

    app.get('/api/cypress/logs/:runId', (req, res) => {
        const runId = req.params.runId;
        if (!/^[a-zA-Z0-9_-]+$/.test(runId)) return res.status(400).json({ error: 'Invalid runId' });
        const cursor = Math.max(0, parseInt(req.query.cursor, 10) || 0);
        res.set('Cache-Control', 'no-store');

        if (cyrActiveRun && cyrActiveRun.id === runId) {
            const full = cyrActiveRun.logBuffer;
            return res.json({ log: full.slice(cursor), cursor: full.length, done: false, status: cyrActiveRun.status });
        }
        try {
            const full = fs.readFileSync(path.join(CYR_DIR, runId, 'log.txt'), 'utf8');
            const historyEntry = cyrRunHistory.find((h) => h.id === runId);
            return res.json({ log: full.slice(cursor), cursor: full.length, done: true, status: historyEntry ? historyEntry.status : 'unknown' });
        } catch (e) {
            return res.status(404).json({ error: 'No log found for that run' });
        }
    });

    // Nested wildcard (Express 5 / path-to-regexp v8 requires a *named* splat —
    // req.params.splat comes back as an array of the matched path segments).
    // Screenshots nest per-spec (screenshots/login.cy.js/foo -- failed.png), so
    // every segment is basename-sanitized before being rejoined onto the fixed
    // per-run directory, same fixed-base-dir convention as /api/screenshots/img.
    app.get('/api/cypress/screenshots/:runId/*splat', (req, res) => {
        const runId = req.params.runId;
        if (!/^[a-zA-Z0-9_-]+$/.test(runId)) return res.status(400).json({ error: 'Invalid runId' });
        const segments = [].concat(req.params.splat || []).map((seg) => path.basename(seg));
        const fp = path.join(CYR_SCREENSHOTS_DIR, runId, ...segments);
        if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
        res.sendFile(fp);
    });

    return { cyrResumeOnBoot, cyrGetHistory: () => cyrRunHistory };
};
