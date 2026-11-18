// FilterRail.
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { TCD_PAGE_SIZE, TRR_PAGE_CONCURRENCY, fs, path, tcdHttpRequest, tcdLoadTrConfig, tcdSleep,
        tcdTrGet, trWithQualityRating, trrFetchAllResults, trrFetchAllTests, trrGet, trrGetMeta,
        trrLoadSettings, trrParseRunId, trrPlainText, writeJsonAtomic, ROOT } = ctx;

    // ─────────────────────────────────────────────────────────────────────────
    // FILTER RAIL — one TestRail run's full test list, filterable/sortable
    // ─────────────────────────────────────────────────────────────────────────
    // Unlike Test Runs (which caches only a computed summary), this keeps one
    // slim row per test so the page can filter and sort client-side, plus the
    // suite's section tree for the TestRail-style folder sidebar. Tests don't
    // carry their section, so a case_id -> section_id map is built from
    // get_cases and cached per suite (it rarely changes, and a 12k-case suite
    // takes a while to page through). Fetches reuse trrGet's 429 back-off and
    // run one at a time, like Test Runs.
    const FRL_DIR = path.join(ROOT, 'data', 'filter-rail');
    const FRL_INDEX_PATH = path.join(FRL_DIR, 'index.json');
    const FRL_SUITE_TTL_MS = 12 * 60 * 60 * 1000;
    fs.mkdirSync(FRL_DIR, { recursive: true });

    const frlJobs = new Map(); // runId -> { state, phase, done, total, error }
    const frlQueue = [];
    let frlWorking = false;
    let frlCaseTypesCache = null;

    function frlRunPath(runId) { return path.join(FRL_DIR, `run-${runId}.json`); }
    function frlSuitePath(suiteId) { return path.join(FRL_DIR, `suite-${suiteId}.json`); }

    function frlLoadIndex() {
        try { return JSON.parse(fs.readFileSync(FRL_INDEX_PATH, 'utf8')); } catch (e) { return { runs: [] }; }
    }
    function frlSaveIndexEntry(entry) {
        const index = frlLoadIndex();
        index.runs = [entry, ...index.runs.filter((r) => r.id !== entry.id)];
        writeJsonAtomic(FRL_INDEX_PATH, index);
    }

    // Pages through a TestRail list endpoint in waves of TRR_PAGE_CONCURRENCY
    // until a wave returns a short page (no total count is given up front).
    async function frlFetchPaged(endpoint, key, onProgress) {
        const all = [];
        let offset = 0;
        for (;;) {
            const offsets = Array.from({ length: TRR_PAGE_CONCURRENCY }, (_, i) => offset + i * TCD_PAGE_SIZE);
            const pages = await Promise.all(offsets.map((o) =>
                trrGet(`${endpoint}&limit=${TCD_PAGE_SIZE}&offset=${o}`).then((p) => (Array.isArray(p) ? p : (p[key] || [])))));
            pages.forEach((p) => all.push(...p));
            if (onProgress) onProgress(all.length);
            if (pages.some((p) => p.length < TCD_PAGE_SIZE)) return all;
            offset += TRR_PAGE_CONCURRENCY * TCD_PAGE_SIZE;
        }
    }

    async function frlLoadSuite(projectId, suiteId, caseIds, force, setJob) {
        let cached = null;
        try { cached = JSON.parse(fs.readFileSync(frlSuitePath(suiteId), 'utf8')); } catch (e) { /* first fetch */ }
        const fresh = cached && Date.now() - cached.fetchedAt < FRL_SUITE_TTL_MS;
        if (cached && fresh && !force && caseIds.every((id) => cached.caseSection[id] !== undefined)) return cached;

        setJob({ step: 4, phase: 'Fetching folder structure', done: 0, total: 0 });
        const sections = await frlFetchPaged(`/index.php?/api/v2/get_sections/${projectId}&suite_id=${suiteId}`, 'sections', (done) => setJob({ done }));
        setJob({ step: 4, phase: 'Mapping cases to folders', done: 0, total: 0 });
        const cases = await frlFetchPaged(`/index.php?/api/v2/get_cases/${projectId}&suite_id=${suiteId}`, 'cases', (done) => setJob({ done }));
        const suite = {
            suiteId,
            fetchedAt: Date.now(),
            sections: sections.map((s) => ({ id: s.id, name: s.name, parentId: s.parent_id || null, depth: s.depth || 0, order: s.display_order || 0 })),
            caseSection: Object.fromEntries(cases.map((c) => [c.id, c.section_id])),
        };
        writeJsonAtomic(frlSuitePath(suiteId), suite);
        return suite;
    }

    async function frlGetCaseTypes() {
        if (frlCaseTypesCache) return frlCaseTypesCache;
        const types = await trrGet('/index.php?/api/v2/get_case_types').catch(() => []);
        frlCaseTypesCache = (Array.isArray(types) ? types : []).map((t) => ({ id: t.id, name: t.name }));
        return frlCaseTypesCache;
    }

    function frlLabelNames(labels) {
        return (Array.isArray(labels) ? labels : [])
            .map((l) => (l && typeof l === 'object' ? (l.title || l.name || String(l.id)) : String(l)))
            .filter(Boolean);
    }

    async function frlFetchRun(runId, force) {
        const job = frlJobs.get(runId);
        const setJob = (patch) => Object.assign(job, patch);
        setJob({ state: 'running', step: 1, steps: 5, startedAt: Date.now(), phase: 'Fetching run details', done: 0, total: 0, error: null });

        const [run, meta, types] = await Promise.all([trrGet(`/index.php?/api/v2/get_run/${runId}`), trrGetMeta(), frlGetCaseTypes()]);
        const milestone = run.milestone_id ? await trrGet(`/index.php?/api/v2/get_milestone/${run.milestone_id}`).catch(() => null) : null;

        const total = Object.keys(run).filter((k) => k.endsWith('_count')).reduce((s, k) => s + (run[k] || 0), 0);
        setJob({ step: 2, phase: 'Fetching tests', done: 0, total });
        const tests = await trrFetchAllTests(runId, total, (done) => setJob({ done }));

        // No total is known for results — a run's history can be several times
        // its test count, so the client shows a running count + elapsed time.
        setJob({ step: 3, phase: 'Fetching results', done: 0, total: 0 });
        const results = await trrFetchAllResults(runId, (done) => setJob({ done }));

        const suite = await frlLoadSuite(run.project_id, run.suite_id, tests.map((t) => t.case_id), force, setJob);

        setJob({ step: 5, phase: 'Building rows', done: 0, total: 0 });
        const byTest = new Map();
        results.forEach((r) => {
            const e = byTest.get(r.test_id) || { count: 0, latest: null, defects: new Set() };
            e.count++;
            if (r.defects) String(r.defects).split(',').map((d) => d.trim()).filter(Boolean).forEach((d) => e.defects.add(d));
            // Only results that set a status count as "tested" — the rest are
            // comment-only or reassignment entries.
            if (r.status_id && (!e.latest || r.created_on > e.latest.created_on || (r.created_on === e.latest.created_on && r.id > e.latest.id))) e.latest = r;
            byTest.set(r.test_id, e);
        });

        const rows = tests.map((t) => {
            const e = byTest.get(t.id);
            const latest = e && e.latest;
            return {
                id: t.id,
                caseId: t.case_id,
                title: t.title,
                sectionId: suite.caseSection[t.case_id] ?? null,
                order: t.cases_display_order || 0,
                statusId: t.status_id,
                assignedTo: t.assignedto_id ?? null,
                priorityId: t.priority_id ?? null,
                typeId: t.type_id ?? null,
                refs: t.refs || '',
                estimate: t.estimate || '',
                labels: frlLabelNames(t.labels),
                automation: !!t.custom_automation,
                testedBy: latest ? latest.created_by : null,
                testedOn: latest ? latest.created_on : null,
                elapsed: latest ? (latest.elapsed || '') : '',
                version: latest ? (latest.version || '') : '',
                comment: latest ? trrPlainText(latest.comment, 240) : '',
                defects: e ? [...e.defects] : [],
                resultCount: e ? e.count : 0,
            };
        });

        // Only the sections that hold a test in this run (and their ancestors),
        // the way TestRail's own run view trims the tree.
        const sectionById = new Map(suite.sections.map((s) => [s.id, s]));
        const keep = new Set();
        rows.forEach((r) => {
            let s = sectionById.get(r.sectionId);
            while (s && !keep.has(s.id)) { keep.add(s.id); s = sectionById.get(s.parentId); }
        });

        const data = {
            run: {
                id: run.id, name: run.name, url: run.url, suiteId: run.suite_id, projectId: run.project_id, planId: run.plan_id || null,
                description: trrPlainText(run.description, 600), isCompleted: !!run.is_completed,
                createdOn: run.created_on, completedOn: run.completed_on || null,
                milestone: milestone ? milestone.name : null, config: run.config || null,
            },
            fetchedAt: new Date().toISOString(),
            statuses: meta.statuses,
            priorities: meta.priorities,
            types,
            sections: suite.sections.filter((s) => keep.has(s.id)),
            rows,
        };
        writeJsonAtomic(frlRunPath(runId), data);
        frlSaveIndexEntry({ id: run.id, name: run.name, total: rows.length, fetchedAt: data.fetchedAt });
    }

    async function frlPumpQueue() {
        if (frlWorking) return;
        frlWorking = true;
        try {
            while (frlQueue.length) {
                const { runId, force } = frlQueue.shift();
                try {
                    await frlFetchRun(runId, force);
                    Object.assign(frlJobs.get(runId), { state: 'done', phase: 'Done' });
                } catch (err) {
                    Object.assign(frlJobs.get(runId), { state: 'error', error: String(err && err.message || err) });
                }
            }
        } finally {
            frlWorking = false;
        }
    }

    // HTML fields (preconditions/steps/comments) as plain text with line breaks
    // kept, so the client never has to render TestRail's HTML.
    function frlHtmlToText(html) {
        if (!html) return '';
        return String(html)
            .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
            .replace(/<[^>]+>/g, '')
            .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    }

    app.get('/api/filter-rail/runs', (req, res) => {
        res.set('Cache-Control', 'no-store');
        const index = frlLoadIndex();
        const jobs = {};
        frlJobs.forEach((j, id) => { jobs[id] = j; });
        res.json({ runs: index.runs, jobs });
    });

    app.get('/api/filter-rail/runs/:runId', (req, res) => {
        const runId = trrParseRunId(req, res);
        if (runId === null) return;
        res.set('Cache-Control', 'no-store');
        const job = frlJobs.get(runId) || null;
        const queuePosition = frlQueue.findIndex((q) => q.runId === runId);
        const jobOut = job && {
            ...job,
            queuePosition: queuePosition >= 0 ? queuePosition + 1 : null,
            elapsedMs: job.startedAt && job.state === 'running' ? Date.now() - job.startedAt : null,
        };
        if (req.query.jobOnly) return res.json({ runId, job: jobOut });
        let data = null;
        try { data = JSON.parse(fs.readFileSync(frlRunPath(runId), 'utf8')); } catch (e) { /* never fetched */ }
        res.json({ runId, data, job: jobOut });
    });

    app.post('/api/filter-rail/runs/:runId/refresh', (req, res) => {
        const runId = trrParseRunId(req, res);
        if (runId === null) return;
        const job = frlJobs.get(runId);
        if (job && (job.state === 'queued' || job.state === 'running')) return res.status(202).json({ alreadyQueued: true });
        frlJobs.set(runId, { state: 'queued', phase: 'Queued', done: 0, total: 0, error: null });
        frlQueue.push({ runId, force: !!(req.body && req.body.refreshSections) });
        frlPumpQueue();
        res.status(202).json({ queued: true });
    });

    app.delete('/api/filter-rail/runs/:runId', (req, res) => {
        const runId = trrParseRunId(req, res);
        if (runId === null) return;
        try { fs.unlinkSync(frlRunPath(runId)); } catch (e) { /* already gone */ }
        const index = frlLoadIndex();
        index.runs = index.runs.filter((r) => r.id !== runId);
        writeJsonAtomic(FRL_INDEX_PATH, index);
        frlJobs.delete(runId);
        res.json({ removed: true });
    });

    // One test's full case content and result history, fetched on demand when
    // a row is opened (too heavy to keep for every test in the run cache).
    app.get('/api/filter-rail/tests/:testId', async (req, res) => {
        const testId = Number(req.params.testId);
        if (!Number.isInteger(testId) || testId <= 0) return res.status(400).json({ error: 'Invalid test id' });
        try {
            const [test, resultsPage] = await Promise.all([
                trrGet(`/index.php?/api/v2/get_test/${testId}`),
                trrGet(`/index.php?/api/v2/get_results/${testId}&limit=50`),
            ]);
            const results = Array.isArray(resultsPage) ? resultsPage : (resultsPage.results || []);
            res.json({
                preconds: frlHtmlToText(test.custom_preconds),
                steps: frlHtmlToText(test.custom_steps),
                expected: frlHtmlToText(test.custom_expected),
                results: results.map((r) => ({
                    id: r.id, statusId: r.status_id, createdBy: r.created_by, createdOn: r.created_on,
                    assignedTo: r.assignedto_id, comment: frlHtmlToText(r.comment), defects: r.defects || '',
                    elapsed: r.elapsed || '', version: r.version || '',
                })),
            });
        } catch (err) {
            res.status(502).json({ error: String(err && err.message || err) });
        }
    });

    // ── FilterRail edits: status / assignee (as results) and test labels ──
    // Writes go straight to TestRail, then the same change is patched into the
    // cached run file so the page updates without a full re-fetch. Labels here
    // are TestRail's *test* labels (per run), not case labels — editing them
    // never touches the case in the suite or any other run.
    const FRL_WRITE_CHUNK = 250;
    const FRL_MAX_LABELS = 10; // TestRail's per-test limit
    const frlRunLocks = new Map();

    // Serializes cache-file read/patch/write per run so two edits can't race.
    function frlWithRunLock(runId, fn) {
        const prev = frlRunLocks.get(runId) || Promise.resolve();
        const next = prev.catch(() => {}).then(fn);
        frlRunLocks.set(runId, next.catch(() => {}));
        return next;
    }

    // Only 429 is retried: TestRail rejects a rate-limited request without
    // applying it, while any other failure may have been partly applied.
    async function frlTrPost(endpoint, body, attempt) {
        attempt = attempt || 1;
        const { url, auth } = tcdLoadTrConfig();
        const res = await tcdHttpRequest(`${url}${endpoint}`, {
            method: 'POST',
            headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            timeoutMs: 60000,
        });
        if (res.statusCode === 429 && attempt < 5) {
            await tcdSleep(5000 * attempt);
            return frlTrPost(endpoint, body, attempt + 1);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(`TestRail ${res.statusCode}: ${res.body.slice(0, 300)}`);
        try { return JSON.parse(res.body); } catch (e) { return null; }
    }

    function frlReadRun(runId) {
        try { return JSON.parse(fs.readFileSync(frlRunPath(runId), 'utf8')); } catch (e) { return null; }
    }

    async function frlCurrentUserId() {
        const settings = trrLoadSettings();
        if (settings.currentUserId) return settings.currentUserId;
        const me = await tcdTrGet('/index.php?/api/v2/get_current_user');
        return me.id;
    }

    const frlLabelCache = new Map(); // projectId -> { at, labels }
    async function frlProjectLabels(projectId, force) {
        const cached = frlLabelCache.get(projectId);
        if (cached && !force && Date.now() - cached.at < 5 * 60 * 1000) return cached.labels;
        const all = await frlFetchPaged(`/index.php?/api/v2/get_labels/${projectId}`, 'labels');
        const labels = all.map((l) => ({ id: l.id, name: l.name || l.title })).sort((a, b) => a.name.localeCompare(b.name));
        frlLabelCache.set(projectId, { at: Date.now(), labels });
        return labels;
    }

    app.get('/api/filter-rail/runs/:runId/edit-options', async (req, res) => {
        const runId = trrParseRunId(req, res);
        if (runId === null) return;
        const data = frlReadRun(runId);
        if (!data) return res.status(404).json({ error: 'Load the run first' });
        try {
            const [labels, currentUserId, projectUsers] = await Promise.all([
                frlProjectLabels(data.run.projectId, !!req.query.refresh),
                frlCurrentUserId().catch(() => null),
                // A non-admin key only sees a partial list here — merged with
                // everyone seen in the run below.
                trrGet(`/index.php?/api/v2/get_users/${data.run.projectId}`).then((p) => (Array.isArray(p) ? p : (p.users || []))).catch(() => []),
            ]);
            const names = trrLoadSettings().userNames || {};
            const ids = new Set();
            data.rows.forEach((r) => { if (r.assignedTo != null) ids.add(r.assignedTo); if (r.testedBy != null) ids.add(r.testedBy); });
            projectUsers.forEach((u) => { if (u.is_active !== 0) ids.add(u.id); });
            if (currentUserId) ids.add(currentUserId);
            Object.keys(names).forEach((id) => ids.add(Number(id)));
            const byId = Object.fromEntries(projectUsers.map((u) => [u.id, u.name]));
            const users = [...ids].map((id) => ({ id, name: names[id] || byId[id] || null }));
            res.json({ labels, users, currentUserId, maxLabels: FRL_MAX_LABELS });
        } catch (err) {
            res.status(502).json({ error: String(err && err.message || err) });
        }
    });

    function frlValidTestIds(data, testIds) {
        if (!Array.isArray(testIds) || testIds.length === 0) throw new Error('Pick at least one test');
        const inRun = new Set(data.rows.map((r) => r.id));
        const ids = [...new Set(testIds.map(Number))];
        const stray = ids.filter((id) => !inRun.has(id));
        if (stray.length) throw new Error(`${stray.length} test(s) aren't in this run`);
        return ids;
    }

    // Status and/or assignee as TestRail results. A result with only
    // assignedto_id is TestRail's own "reassign" entry (no status change).
    app.post('/api/filter-rail/runs/:runId/results', (req, res) => {
        const runId = trrParseRunId(req, res);
        if (runId === null) return;
        const { testIds, statusId, assignedTo, comment, defects } = req.body || {};
        frlWithRunLock(runId, async () => {
            const data = frlReadRun(runId);
            if (!data) throw Object.assign(new Error('Load the run first'), { status: 404 });
            const ids = frlValidTestIds(data, testIds);
            const status = statusId != null ? data.statuses.find((s) => s.id === Number(statusId)) : null;
            if (statusId != null && (!status || status.isUntested)) throw new Error('Pick a status other than Untested');
            const assignee = assignedTo != null && assignedTo !== '' ? Number(assignedTo) : null;
            if (!status && assignee == null && !String(comment || '').trim()) throw new Error('Nothing to change');

            const base = {};
            if (status) base.status_id = status.id;
            if (assignee != null) base.assignedto_id = assignee;
            if (String(comment || '').trim()) base.comment = String(comment).trim();
            if (String(defects || '').trim()) base.defects = String(defects).trim();

            const me = status ? await frlCurrentUserId().catch(() => null) : null;
            const now = Math.floor(Date.now() / 1000);
            const newDefects = String(defects || '').split(',').map((d) => d.trim()).filter(Boolean);
            const rowById = new Map(data.rows.map((r) => [r.id, r]));
            const changed = [];
            const patch = (chunk) => chunk.forEach((id) => {
                const r = rowById.get(id);
                r.resultCount++;
                if (assignee != null) r.assignedTo = assignee;
                if (status) {
                    r.statusId = status.id;
                    r.testedBy = me;
                    r.testedOn = now;
                    r.comment = trrPlainText(base.comment || '', 240);
                }
                if (newDefects.length) r.defects = [...new Set([...r.defects, ...newDefects])];
                changed.push(r);
            });

            try {
                for (let i = 0; i < ids.length; i += FRL_WRITE_CHUNK) {
                    const chunk = ids.slice(i, i + FRL_WRITE_CHUNK);
                    await frlTrPost(`/index.php?/api/v2/add_results/${runId}`, { results: chunk.map((id) => trWithQualityRating({ test_id: id, ...base })) });
                    patch(chunk);
                }
            } catch (err) {
                if (changed.length) err.message = `${err.message} (the first ${changed.length} of ${ids.length} were saved)`;
                throw err;
            } finally {
                // Save whatever TestRail accepted, even if a later chunk failed.
                if (changed.length) writeJsonAtomic(frlRunPath(runId), data);
            }
            return { updated: changed.length, rows: changed };
        })
            .then((out) => res.json(out))
            .catch((err) => res.status(err.status || 400).json({ error: String(err.message || err) }));
    });

    // Adds/removes labels on tests. update_tests sets one label list for every
    // test in the call, so tests are grouped by their resulting label set.
    app.post('/api/filter-rail/runs/:runId/labels', (req, res) => {
        const runId = trrParseRunId(req, res);
        if (runId === null) return;
        const { testIds, add, remove } = req.body || {};
        frlWithRunLock(runId, async () => {
            const data = frlReadRun(runId);
            if (!data) throw Object.assign(new Error('Load the run first'), { status: 404 });
            const ids = frlValidTestIds(data, testIds);
            const projectLabels = await frlProjectLabels(data.run.projectId);
            const byId = new Map(projectLabels.map((l) => [l.id, l]));
            const byName = new Map(projectLabels.map((l) => [l.name, l]));
            const addIds = (Array.isArray(add) ? add : []).map(Number).filter((id) => byId.has(id));
            const removeIds = new Set((Array.isArray(remove) ? remove : []).map(Number).filter((id) => byId.has(id)));
            if (!addIds.length && !removeIds.size) throw new Error('Pick a label to add or remove');

            const rowById = new Map(data.rows.map((r) => [r.id, r]));
            const groups = new Map(); // "1,4,9" -> { labelIds, testIds }
            const tooMany = [];
            ids.forEach((id) => {
                const r = rowById.get(id);
                // Rows only store names; a name no longer in the project (deleted
                // label) is dropped, the same as TestRail would show it.
                const current = r.labels.map((n) => byName.get(n)).filter(Boolean).map((l) => l.id);
                const next = [...new Set([...current.filter((l) => !removeIds.has(l)), ...addIds])].sort((a, b) => a - b);
                if (next.length > FRL_MAX_LABELS) { tooMany.push(id); return; }
                if (next.join(',') === [...current].sort((a, b) => a - b).join(',')) return; // nothing changes
                const key = next.join(',');
                if (!groups.has(key)) groups.set(key, { labelIds: next, testIds: [] });
                groups.get(key).testIds.push(id);
            });
            if (tooMany.length) throw new Error(`${tooMany.length} test(s) would end up with more than ${FRL_MAX_LABELS} labels (TestRail's limit). Remove some first.`);

            const changed = [];
            let calls = 0;
            try {
                for (const g of groups.values()) {
                    for (let i = 0; i < g.testIds.length; i += FRL_WRITE_CHUNK) {
                        const chunk = g.testIds.slice(i, i + FRL_WRITE_CHUNK);
                        await frlTrPost('/index.php?/api/v2/update_tests', { test_ids: chunk, labels: g.labelIds });
                        calls++;
                        const names = g.labelIds.map((l) => byId.get(l).name);
                        chunk.forEach((id) => { const r = rowById.get(id); r.labels = names; changed.push(r); });
                    }
                }
            } finally {
                // Save whatever TestRail accepted, even if a later call failed.
                if (changed.length) writeJsonAtomic(frlRunPath(runId), data);
            }
            return { updated: changed.length, unchanged: ids.length - changed.length, calls, rows: changed };
        })
            .then((out) => res.json(out))
            .catch((err) => res.status(err.status || 400).json({ error: String(err.message || err) }));
    });

    return {};
};
