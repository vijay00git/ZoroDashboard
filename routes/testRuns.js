// Test Runs dashboards.
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { TCD_PAGE_SIZE, TRR_DIR, fs, path, tcdLoadTrConfig, tcdSleep, tcdTrGet, writeJsonAtomic } = ctx;

    // ─────────────────────────────────────────────────────────────────────────
    // TEST RUNS — per-run TestRail dashboards (status mix, testers, bugs)
    // ─────────────────────────────────────────────────────────────────────────
    // A big run (~12k tests, ~35k results) takes a minute or two to pull, so a
    // fetch runs in the background and its computed summary (never the raw
    // tests/results) is cached to data/test-runs/run-<id>.json. Runs are fetched
    // one at a time through a queue — several 12k-test runs in parallel is what
    // trips TestRail's 429 rate limit.
    //
    // This API key isn't a TestRail admin, so get_users/get_user are 403 (see
    // afNamesConflict) — testers come back as raw user ids, and the page lets
    // the user name them; those names live in data/test-runs/settings.json.
    const TRR_SETTINGS_PATH = path.join(TRR_DIR, 'settings.json');
    const TRR_PAGE_CONCURRENCY = 4;
    const TRR_DEFAULT_JIRA_URL = 'https://elosystemsteam.atlassian.net';
    const TRR_ATTENTION_LIMIT = 500;

    const trrJobs = new Map(); // runId -> { state: 'queued'|'running'|'done'|'error', phase, done, total, error }
    const trrQueue = [];
    let trrWorking = false;
    let trrMetaCache = null; // { statuses, priorities } — instance-wide, fetched once

    function trrRunPath(runId) {
        return path.join(TRR_DIR, `run-${runId}.json`);
    }

    function trrLoadSettings() {
        try {
            return JSON.parse(fs.readFileSync(TRR_SETTINGS_PATH, 'utf8'));
        } catch (e) {
            return { jiraUrl: TRR_DEFAULT_JIRA_URL, userNames: {}, savedRunIds: [] };
        }
    }

    // 429s are expected on big runs — back off and retry instead of failing the
    // whole fetch on one page.
    async function trrGet(endpoint, attempt) {
        attempt = attempt || 1;
        try {
            return await tcdTrGet(endpoint);
        } catch (e) {
            if (attempt >= 5 || /TestRail 4(0[0-4])/.test(e.message)) throw e;
            await tcdSleep((/429/.test(e.message) ? 5000 : 1000) * attempt);
            return trrGet(endpoint, attempt + 1);
        }
    }

    async function trrGetMeta() {
        if (trrMetaCache) return trrMetaCache;
        const [statuses, priorities] = await Promise.all([
            trrGet('/index.php?/api/v2/get_statuses'),
            trrGet('/index.php?/api/v2/get_priorities').catch(() => []),
        ]);
        trrMetaCache = {
            statuses: statuses.map((s) => ({
                id: s.id,
                label: s.label || s.name,
                color: '#' + Number(s.color_medium || 0).toString(16).padStart(6, '0'),
                isUntested: !!s.is_untested,
            })),
            priorities: (Array.isArray(priorities) ? priorities : []).map((p) => ({ id: p.id, name: p.short_name || p.name })),
        };
        return trrMetaCache;
    }

    // Results have no total count up front, so pages are fetched in waves of
    // TRR_PAGE_CONCURRENCY until a wave comes back with a short page.
    async function trrFetchAllResults(runId, onProgress) {
        const all = [];
        let offset = 0;
        for (;;) {
            const offsets = Array.from({ length: TRR_PAGE_CONCURRENCY }, (_, i) => offset + i * TCD_PAGE_SIZE);
            const pages = await Promise.all(offsets.map((o) =>
                trrGet(`/index.php?/api/v2/get_results_for_run/${runId}&limit=${TCD_PAGE_SIZE}&offset=${o}`)
                    .then((p) => (Array.isArray(p) ? p : (p.results || []))),
            ));
            pages.forEach((p) => all.push(...p));
            onProgress(all.length);
            if (pages.some((p) => p.length < TCD_PAGE_SIZE)) return all;
            offset += TRR_PAGE_CONCURRENCY * TCD_PAGE_SIZE;
        }
    }

    async function trrFetchAllTests(runId, total, onProgress) {
        const all = [];
        const totalPages = Math.ceil(total / TCD_PAGE_SIZE);
        let nextPage = 0;
        const worker = async () => {
            while (nextPage < totalPages) {
                const offset = (nextPage++) * TCD_PAGE_SIZE;
                const page = await trrGet(`/index.php?/api/v2/get_tests/${runId}&limit=${TCD_PAGE_SIZE}&offset=${offset}`);
                all.push(...(Array.isArray(page) ? page : (page.tests || [])));
                onProgress(all.length);
            }
        };
        await Promise.all(Array.from({ length: Math.min(TRR_PAGE_CONCURRENCY, totalPages) }, worker));
        return all;
    }

    function trrLocalDate(epochSec) {
        const d = new Date(epochSec * 1000);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function trrPlainText(html, max) {
        if (!html) return '';
        const text = String(html)
            .replace(/<br\s*\/?>|<\/p>/gi, ' ')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
        return text.length > max ? text.slice(0, max - 1) + '…' : text;
    }

    function trrBump(counts, statusId) {
        counts[statusId] = (counts[statusId] || 0) + 1;
    }

    function trrBuildSummary(run, milestoneName, tests, results, meta) {
        const untestedIds = new Set(meta.statuses.filter((s) => s.isUntested).map((s) => s.id));
        const passedId = 1;

        const statusCounts = {};
        tests.forEach((t) => trrBump(statusCounts, t.status_id));
        const total = tests.length;
        const untested = [...untestedIds].reduce((s, id) => s + (statusCounts[id] || 0), 0);
        const executed = total - untested;

        // Only results that actually set a status count as "testing" — the rest
        // (status_id null) are comment-only or reassignment entries.
        const statusResults = results.filter((r) => r.status_id);
        const latestByTest = new Map();
        statusResults.forEach((r) => {
            const prev = latestByTest.get(r.test_id);
            if (!prev || r.created_on > prev.created_on || (r.created_on === prev.created_on && r.id > prev.id)) latestByTest.set(r.test_id, r);
        });
        const testById = new Map(tests.map((t) => [t.id, t]));

        // Testers: "tested" = tests whose CURRENT status they set (so the
        // per-tester counts add up to the run's executed total); "results" =
        // every status result they posted, retests included.
        const testers = new Map();
        const tester = (id) => {
            if (!testers.has(id)) testers.set(id, { userId: id, tested: 0, statusCounts: {}, results: 0, testsTouched: new Set(), defects: new Set(), firstAt: null, lastAt: null, days: new Set() });
            return testers.get(id);
        };
        statusResults.forEach((r) => {
            const t = tester(r.created_by);
            t.results += 1;
            t.testsTouched.add(r.test_id);
            t.days.add(trrLocalDate(r.created_on));
            if (t.firstAt === null || r.created_on < t.firstAt) t.firstAt = r.created_on;
            if (t.lastAt === null || r.created_on > t.lastAt) t.lastAt = r.created_on;
        });
        // Attributed by the test's own current status, so a test reset to
        // Untested after a result doesn't count, and the totals match the run.
        // userId 0 = executed with no status result on record.
        tests.forEach((t) => {
            if (untestedIds.has(t.status_id)) return;
            const r = latestByTest.get(t.id);
            const owner = tester(r ? r.created_by : 0);
            owner.tested += 1;
            trrBump(owner.statusCounts, t.status_id);
        });

        // Defects, deduped per (defect, test) — a bug re-linked on every retest
        // of the same test shouldn't count that test twice.
        const defects = new Map();
        results.forEach((r) => {
            if (!r.defects) return;
            String(r.defects).split(',').map((d) => d.trim()).filter(Boolean).forEach((id) => {
                const info = (r.defects_data && !Array.isArray(r.defects_data) && r.defects_data[id]) || {};
                if (!defects.has(id)) defects.set(id, { id, summary: info.summary || null, status: info.status || null, assignee: info.assignee || null, issueType: info.issue_type || null, tests: new Map() });
                const d = defects.get(id);
                if (!d.summary && info.summary) Object.assign(d, { summary: info.summary, status: info.status || null, assignee: info.assignee || null, issueType: info.issue_type || null });
                tester(r.created_by).defects.add(id);
                const prev = d.tests.get(r.test_id);
                if (prev && prev.linkedAt <= r.created_on) return;
                const test = testById.get(r.test_id);
                d.tests.set(r.test_id, {
                    testId: r.test_id,
                    caseId: test ? test.case_id : r.case_id,
                    title: test ? test.title : r.case_title,
                    statusId: test ? test.status_id : r.status_id,
                    linkedBy: r.created_by,
                    linkedAt: r.created_on,
                });
            });
        });

        const assignees = new Map();
        tests.forEach((t) => {
            const key = t.assignedto_id || 0;
            if (!assignees.has(key)) assignees.set(key, { userId: t.assignedto_id || null, total: 0, statusCounts: {} });
            const a = assignees.get(key);
            a.total += 1;
            trrBump(a.statusCounts, t.status_id);
        });

        const daily = new Map();
        statusResults.forEach((r) => {
            const day = trrLocalDate(r.created_on);
            if (!daily.has(day)) daily.set(day, { date: day, total: 0, counts: {} });
            const d = daily.get(day);
            d.total += 1;
            trrBump(d.counts, r.status_id);
        });

        const priorities = new Map();
        tests.forEach((t) => {
            const key = t.priority_id || 0;
            if (!priorities.has(key)) priorities.set(key, { priorityId: t.priority_id || null, total: 0, counts: {} });
            const p = priorities.get(key);
            p.total += 1;
            trrBump(p.counts, t.status_id);
        });

        const automation = { automated: { total: 0, counts: {} }, manual: { total: 0, counts: {} } };
        tests.forEach((t) => {
            const bucket = t.custom_automation ? automation.automated : automation.manual;
            bucket.total += 1;
            trrBump(bucket.counts, t.status_id);
        });

        const versions = new Map();
        statusResults.forEach((r) => {
            const v = (r.version || '').trim().replace(/^version\s*/i, '');
            if (v) versions.set(v, (versions.get(v) || 0) + 1);
        });

        // Anything whose current status isn't Passed or untested-ish: failed,
        // retest, blocked, and custom statuses like Not Applicable.
        const attention = tests
            .filter((t) => t.status_id !== passedId && !untestedIds.has(t.status_id))
            .map((t) => {
                const r = latestByTest.get(t.id);
                const linked = [];
                defects.forEach((d) => { if (d.tests.has(t.id)) linked.push(d.id); });
                return {
                    testId: t.id,
                    caseId: t.case_id,
                    title: t.title,
                    statusId: t.status_id,
                    testerId: r ? r.created_by : null,
                    at: r ? r.created_on : null,
                    comment: r ? trrPlainText(r.comment, 240) : '',
                    version: r ? r.version || null : null,
                    defects: linked,
                };
            })
            .sort((a, b) => (b.at || 0) - (a.at || 0));

        return {
            runId: run.id,
            name: run.name,
            description: run.description || null,
            url: run.url,
            milestone: milestoneName,
            planId: run.plan_id || null,
            isCompleted: !!run.is_completed,
            completedOn: run.completed_on || null,
            createdOn: run.created_on,
            createdBy: run.created_by,
            updatedOn: run.updated_on || null,
            fetchedAt: new Date().toISOString(),
            statuses: meta.statuses,
            priorityNames: Object.fromEntries(meta.priorities.map((p) => [p.id, p.name])),
            total,
            executed,
            untested,
            statusCounts,
            resultCount: statusResults.length,
            commentOnlyCount: results.length - statusResults.length,
            testers: [...testers.values()]
                .map((t) => ({ userId: t.userId, tested: t.tested, statusCounts: t.statusCounts, results: t.results, testsTouched: t.testsTouched.size, defects: t.defects.size, activeDays: t.days.size, firstAt: t.firstAt, lastAt: t.lastAt }))
                .sort((a, b) => b.tested - a.tested || b.results - a.results),
            assignees: [...assignees.values()].sort((a, b) => b.total - a.total),
            defects: [...defects.values()]
                .map((d) => ({ ...d, tests: [...d.tests.values()].sort((a, b) => b.linkedAt - a.linkedAt) }))
                .sort((a, b) => b.tests.length - a.tests.length || a.id.localeCompare(b.id)),
            daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
            priorities: [...priorities.values()].sort((a, b) => (a.priorityId || 99) - (b.priorityId || 99)),
            automation,
            versions: [...versions.entries()].map(([version, count]) => ({ version, count })).sort((a, b) => b.count - a.count).slice(0, 12),
            attention: attention.slice(0, TRR_ATTENTION_LIMIT),
            attentionTotal: attention.length,
        };
    }

    async function trrFetchRun(runId) {
        const job = trrJobs.get(runId);
        const setJob = (patch) => Object.assign(job, patch);
        setJob({ state: 'running', phase: 'Fetching run details', done: 0, total: 0, error: null });

        const [run, meta] = await Promise.all([trrGet(`/index.php?/api/v2/get_run/${runId}`), trrGetMeta()]);
        const milestone = run.milestone_id
            ? await trrGet(`/index.php?/api/v2/get_milestone/${run.milestone_id}`).catch(() => null)
            : null;

        const total = Object.keys(run).filter((k) => k.endsWith('_count')).reduce((s, k) => s + (run[k] || 0), 0);
        setJob({ phase: 'Fetching tests', total });
        const tests = await trrFetchAllTests(runId, total, (done) => setJob({ done }));

        // Result count isn't known up front — the client shows a running count
        // rather than a percentage for this phase.
        setJob({ phase: 'Fetching results', done: 0, total: 0 });
        const results = await trrFetchAllResults(runId, (done) => setJob({ done }));

        setJob({ phase: 'Summarizing' });
        const summary = trrBuildSummary(run, milestone ? milestone.name : null, tests, results, meta);
        writeJsonAtomic(trrRunPath(runId), summary);
    }

    async function trrPumpQueue() {
        if (trrWorking) return;
        trrWorking = true;
        try {
            while (trrQueue.length) {
                const runId = trrQueue.shift();
                try {
                    await trrFetchRun(runId);
                    Object.assign(trrJobs.get(runId), { state: 'done', phase: 'Done' });
                } catch (err) {
                    Object.assign(trrJobs.get(runId), { state: 'error', error: String(err && err.message || err) });
                }
            }
        } finally {
            trrWorking = false;
        }
    }

    function trrParseRunId(req, res) {
        const runId = Number(req.params.runId);
        if (!Number.isInteger(runId) || runId <= 0) {
            res.status(400).json({ error: 'Run ID must be a positive number' });
            return null;
        }
        return runId;
    }

    app.get('/api/test-runs/settings', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const settings = trrLoadSettings();
        let testrailUrl = null;
        try { testrailUrl = tcdLoadTrConfig().url; } catch (e) { /* not configured yet */ }
        // Seed the API key owner's own name — get_current_user is the one user
        // lookup a non-admin key is allowed.
        if (testrailUrl && !settings.currentUserId) {
            try {
                const me = await tcdTrGet('/index.php?/api/v2/get_current_user');
                settings.currentUserId = me.id;
                settings.userNames = settings.userNames || {};
                if (!settings.userNames[me.id]) settings.userNames[me.id] = me.name;
                writeJsonAtomic(TRR_SETTINGS_PATH, settings);
            } catch (e) { /* offline — try again next load */ }
        }
        res.json({ ...settings, testrailUrl });
    });

    app.post('/api/test-runs/settings', (req, res) => {
        const { jiraUrl, userNames, savedRunIds } = req.body || {};
        const settings = trrLoadSettings();
        if (typeof jiraUrl === 'string') settings.jiraUrl = jiraUrl.trim().replace(/\/+$/, '');
        if (userNames && typeof userNames === 'object') {
            settings.userNames = settings.userNames || {};
            Object.entries(userNames).forEach(([id, name]) => {
                const trimmed = String(name || '').trim();
                if (trimmed) settings.userNames[id] = trimmed;
                else delete settings.userNames[id];
            });
        }
        if (Array.isArray(savedRunIds)) settings.savedRunIds = savedRunIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
        writeJsonAtomic(TRR_SETTINGS_PATH, settings);
        res.json(settings);
    });

    app.get('/api/test-runs/:runId', (req, res) => {
        const runId = trrParseRunId(req, res);
        if (runId === null) return;
        res.set('Cache-Control', 'no-store');
        let summary = null;
        try { summary = JSON.parse(fs.readFileSync(trrRunPath(runId), 'utf8')); } catch (e) { /* never fetched */ }
        const job = trrJobs.get(runId) || null;
        const queuePosition = trrQueue.indexOf(runId);
        res.json({ runId, summary, job: job && { ...job, queuePosition: queuePosition >= 0 ? queuePosition + 1 : null } });
    });

    app.post('/api/test-runs/:runId/refresh', (req, res) => {
        const runId = trrParseRunId(req, res);
        if (runId === null) return;
        const job = trrJobs.get(runId);
        if (job && (job.state === 'queued' || job.state === 'running')) return res.status(202).json({ alreadyQueued: true });
        trrJobs.set(runId, { state: 'queued', phase: 'Queued', done: 0, total: 0, error: null });
        trrQueue.push(runId);
        trrPumpQueue();
        res.status(202).json({ queued: true });
    });

    return { TRR_PAGE_CONCURRENCY, trrFetchAllResults, trrFetchAllTests, trrGet, trrGetMeta, trrLoadSettings, trrParseRunId, trrPlainText };
};
