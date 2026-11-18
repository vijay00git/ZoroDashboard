// Case view: one record per owned TestRail case (case mode), combining the case
// manifest, the live spec lookup, the ID tracker, local Cypress results, Jenkins
// jobs and the per-case notes/tags/bugs/manual statuses — so both runner pages
// can list and filter by test ID instead of by spec file.

module.exports = function register(app, ctx) {
    const SHORT = (p) => String(p || '').replace('cypress/e2e/functional_tests/Regression/', '');
    const numericId = (id) => String(id).replace(/^C/i, '');
    const RESULT = { 1: 'passed', 5: 'failed', 2: 'blocked', 4: 'retest' };

    // Newest-first local runs that recorded a result for this case.
    function localResultsByCase(history) {
        const map = new Map();
        for (const h of history) {
            if (!h || !h.caseResults) continue;
            for (const [num, sid] of Object.entries(h.caseResults)) {
                const id = `C${num}`;
                if (!map.has(id)) map.set(id, []);
                map.get(id).push({ result: RESULT[sid] || String(sid), at: h.completedAt || h.startedAt, runId: h.id, path: h.specPath, environment: h.environment || null, label: h.label || '' });
            }
        }
        return map;
    }

    // Jenkins only reports per spec, so a job counts for a case when it ran one
    // of the case's specs and either wasn't narrowed or was narrowed to include it.
    function jenkinsJobsFor(id, paths, jobs) {
        return jobs.filter((j) => paths.includes(j.path) && (!Array.isArray(j.cases) || j.cases.includes(id)));
    }

    // ── TestRail run sync store ─────────────────────────────────────────────
    // { runs: [{ runId, runName, syncedAt, counts }], cases: { C1: [{ runId, runName, status, statusId, syncedAt }] } }
    // Newest sync first; re-syncing a run replaces its earlier snapshot.
    const TRS_PATH = ctx.path.join(ctx.TCD_DIR, 'testrail-sync.json');
    let trsCache = null;
    function trsLoad() {
        if (trsCache) return trsCache;
        try { trsCache = JSON.parse(ctx.fs.readFileSync(TRS_PATH, 'utf8')); } catch (e) { trsCache = { runs: [], cases: {} }; }
        trsCache.runs = trsCache.runs || []; trsCache.cases = trsCache.cases || {};
        return trsCache;
    }
    function trsSave() { ctx.writeJsonAtomic(TRS_PATH, trsCache); }

    function buildOverview() {
        const data = ctx.tcdBuildData();
        if (data.mode !== 'cases') return { mode: data.mode || 'specs', cases: [] };
        const manifest = ctx.tcdLoadCaseManifest();
        const tracking = ctx.tcdLoadCaseTracking().cases || {};
        const history = ctx.tcdGetCaseTrackingHistory();
        const local = localResultsByCase(ctx.cyrGetHistory ? ctx.cyrGetHistory() : []);
        const jobs = ctx.tcdGetJobHistory();
        const manualLocal = ctx.tcdLoadManualStatus();
        const manualJenkins = ctx.tcdLoadJenkinsManualStatus();
        const tags = ctx.tcdLoadTags();
        const bugsLocal = ctx.tcdLoadBugLinks();
        const bugsJenkins = ctx.tcdLoadJenkinsBugLinks();
        const notes = ctx.tcdLoadNotes();
        const shared = new Map((data.sharedSpecs || []).map((s) => [s.path, s.otherCases]));
        const trs = trsLoad();

        const eventCount = new Map();
        const lastEvent = new Map();
        for (const h of history) {
            const ids = h.caseId ? [h.caseId] : (h.caseIds || []);
            ids.forEach((id) => {
                eventCount.set(id, (eventCount.get(id) || 0) + 1);
                if (!lastEvent.has(id)) lastEvent.set(id, { type: h.type, at: h.detectedAt });
            });
        }

        // Every location of each case (the page rows hold only one per case).
        const rowsById = ctx.tcdCaseLocations();

        const setupCache = new Map();
        const setupFor = (p) => {
            if (!setupCache.has(p)) setupCache.set(p, ctx.tcdSetupTagsForSpec(p));
            return setupCache.get(p);
        };

        const cases = Object.entries(manifest.cases).map(([id, entry]) => {
            const rows = entry.retired ? [] : (rowsById.get(id) || []);
            const live = rows.filter((r) => !r.commented);
            const primary = live[0] || rows[0] || null;
            const paths = [...new Set(rows.map((r) => r.path))];
            const livePaths = [...new Set(live.map((r) => r.path))];
            const runs = local.get(id) || [];
            const recent = runs.slice(0, 10).map((r) => r.result);
            // Same rule as the spec cards (isFlakyTrend): pass/fail flipped at
            // least twice across this case's last 10 local results.
            const pf = recent.filter((x) => x === 'passed' || x === 'failed');
            let flips = 0;
            for (let i = 1; i < pf.length; i++) if (pf[i] !== pf[i - 1]) flips++;
            const jj = jenkinsJobsFor(id, livePaths, jobs);
            const lastJob = jj[0] || null;
            const t = tracking[id] || {};
            const untaggedSetup = livePaths.flatMap((p) => setupFor(p).untagged.map((u) => ({ path: p, ...u })));
            return {
                id,
                title: primary ? primary.title : '',
                club: primary ? primary.club || '' : '',
                grp: entry.grp || 'Ungrouped',
                cat: primary ? primary.cat : null,
                path: primary ? primary.path : null,
                paths,
                livePaths,
                pathCats: Object.fromEntries(rows.map((r) => [r.path, r.cat])),
                commented: rows.length > 0 && live.length === 0,
                unresolved: rows.length === 0,
                multiSpec: livePaths.length > 1,
                sharedSpec: livePaths.some((p) => shared.has(p)),
                pinned: entry.paths || null,
                deps: entry.deps || [],
                source: entry.source || '',
                addedAt: entry.addedAt || null,
                retired: entry.retired || null,
                testrail: trs.cases[id] || [],
                manifestNote: entry.note || '',
                tracking: {
                    status: t.status || (rows.length ? 'present' : 'missing'),
                    firstSeenAt: t.firstSeenAt || null,
                    movedFrom: t.movedFrom || null,
                    movedAt: t.movedAt || null,
                    missingSince: t.missingSince || null,
                    reason: t.reason || null,
                    restoredAt: t.restoredAt || null,
                },
                events: eventCount.get(id) || 0,
                lastEvent: lastEvent.get(id) || null,
                local: {
                    last: runs[0] || null,
                    runs: runs.length,
                    passes: runs.filter((r) => r.result === 'passed').length,
                    fails: runs.filter((r) => r.result === 'failed').length,
                    recent,
                    flaky: pf.length >= 3 && flips >= 2,
                    lastPassAt: (runs.find((r) => r.result === 'passed') || {}).at || null,
                    lastFailAt: (runs.find((r) => r.result === 'failed') || {}).at || null,
                },
                jenkins: {
                    last: lastJob ? { status: lastJob.status, at: lastJob.completedAt || lastJob.startedAt, build: lastJob.buildNumber || null, url: lastJob.buildUrl || null, job: lastJob.jobName, path: lastJob.path, narrowed: Array.isArray(lastJob.cases) } : null,
                    runs: jj.length,
                },
                manual: { local: manualLocal[id] || null, jenkins: manualJenkins[id] || null },
                tags: tags[id] || [],
                bugs: { local: bugsLocal[id] || null, jenkins: bugsJenkins[id] || null },
                note: notes[id] ? notes[id].text || '' : '',
                setupWarnings: untaggedSetup,
            };
        });

        return {
            mode: 'cases',
            generatedAt: new Date().toISOString(),
            manifestPath: data.manifestPath,
            groups: [...new Set(cases.map((c) => c.grp))].sort(),
            specCount: data.totalFiles,
            sharedSpecs: data.sharedSpecs || [],
            trackingAlerts: data.trackingAlerts || [],
            testrailRuns: trs.runs,
            cases,
        };
    }

    app.get('/api/cases/overview', (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            res.json(buildOverview());
        } catch (err) {
            res.status(500).json({ error: String(err && err.message || err) });
        }
    });

    // Everything that ever happened to one case, newest first: tracker events,
    // manifest changes, local results, Jenkins jobs on its spec(s), manual marks.
    app.get('/api/cases/history/:id', (req, res) => {
        res.set('Cache-Control', 'no-store');
        const id = `C${numericId(req.params.id)}`;
        if (!/^C\d{5,}$/.test(id)) return res.status(400).json({ error: 'Bad case id' });
        try {
            const timeline = [];
            ctx.tcdGetCaseTrackingHistory().forEach((h) => {
                if (h.caseId === id || (h.caseIds || []).includes(id)) {
                    timeline.push({ kind: 'tracker', type: h.type, at: Date.parse(h.detectedAt), path: h.path || null, from: h.from || null, reason: h.reason || null, title: h.title || null });
                }
            });
            const runs = localResultsByCase(ctx.cyrGetHistory ? ctx.cyrGetHistory() : []).get(id) || [];
            runs.forEach((r) => timeline.push({ kind: 'local', type: r.result, at: r.at, path: r.path, runId: r.runId, environment: r.environment, label: r.label }));

            const manifest = ctx.tcdLoadCaseManifest();
            const entry = manifest.cases[id] || null;
            const paths = new Set((ctx.tcdCaseLocations().get(id) || []).map((l) => l.path));
            const tracked = ctx.tcdLoadCaseTracking().cases[id];
            if (tracked && tracked.movedFrom) paths.add(tracked.movedFrom);
            jenkinsJobsFor(id, [...paths], ctx.tcdGetJobHistory()).forEach((j) => timeline.push({
                kind: 'jenkins', type: String(j.status || '').toLowerCase(), at: j.completedAt || j.startedAt, path: j.path,
                job: j.jobName, build: j.buildNumber || null, url: j.buildUrl || null, runId: j.runId || null, narrowed: Array.isArray(j.cases),
                stats: j.testStats || null, error: j.error || null,
            }));
            const ml = ctx.tcdLoadManualStatus()[id];
            if (ml) timeline.push({ kind: 'manual', type: ml.status, at: ml.updatedAt, where: 'local' });
            const mj = ctx.tcdLoadJenkinsManualStatus()[id];
            if (mj) timeline.push({ kind: 'manual', type: mj.status, at: mj.updatedAt, where: 'jenkins' });
            const bl = ctx.tcdLoadBugLinks()[id];
            if (bl) timeline.push({ kind: 'bug', type: bl.bugId, at: bl.updatedAt, where: 'local' });
            const bj = ctx.tcdLoadJenkinsBugLinks()[id];
            if (bj) timeline.push({ kind: 'bug', type: bj.bugId, at: bj.updatedAt, where: 'jenkins' });
            if (entry && entry.addedAt) timeline.push({ kind: 'manifest', type: 'owned', at: Date.parse(entry.addedAt), source: entry.source || '' });

            timeline.sort((a, b) => (b.at || 0) - (a.at || 0));
            res.json({ id, entry, paths: [...paths].map(SHORT), timeline });
        } catch (err) {
            res.status(500).json({ error: String(err && err.message || err) });
        }
    });

    // Pulls one TestRail run and stores every owned case's status in it.
    app.post('/api/cases/testrail-sync', async (req, res) => {
        const runId = String((req.body || {}).runId || '').replace(/\D/g, '');
        if (!runId) return res.status(400).json({ error: 'Enter a numeric TestRail run ID' });
        try {
            const run = await ctx.tcdGetRunStatuses(runId);
            if (!run || !run.statuses || !Object.keys(run.statuses).length) return res.status(404).json({ error: `Run ${runId} returned no tests` });
            const manifest = ctx.tcdLoadCaseManifest();
            const trs = trsLoad();
            const syncedAt = Date.now();
            const runName = run.runName || '';
            const counts = {};
            Object.keys(manifest.cases).forEach((id) => {
                const st = run.statuses[numericId(id)];
                const status = st ? st.status : 'Not in run';
                counts[status] = (counts[status] || 0) + 1;
                const list = (trs.cases[id] || []).filter((e) => String(e.runId) !== runId);
                list.unshift({ runId: Number(runId), runName, status, statusId: st ? st.status_id : null, syncedAt });
                trs.cases[id] = list.slice(0, 50);
            });
            trs.runs = [{ runId: Number(runId), runName, syncedAt, completed: !!run.completed, counts }, ...trs.runs.filter((r) => String(r.runId) !== runId)].slice(0, 50);
            trsSave();
            res.json({ runId: Number(runId), runName, counts, cases: Object.keys(manifest.cases).length });
        } catch (err) {
            res.status(502).json({ error: String(err && err.message || err) });
        }
    });

    // Forgets one synced run (its column history for every case).
    app.post('/api/cases/testrail-sync/remove', (req, res) => {
        const runId = String((req.body || {}).runId || '');
        const trs = trsLoad();
        trs.runs = trs.runs.filter((r) => String(r.runId) !== runId);
        Object.keys(trs.cases).forEach((id) => { trs.cases[id] = trs.cases[id].filter((e) => String(e.runId) !== runId); });
        trsSave();
        res.json({ removed: runId });
    });

    // Retire = the case was removed from the codebase on purpose. It stays in
    // the manifest for the record but is hidden, not run and not tracked.
    app.post('/api/cases/retire', (req, res) => {
        const { id, note, restore } = req.body || {};
        const caseId = `C${numericId(id)}`;
        try {
            const manifest = ctx.tcdLoadCaseManifest();
            const entry = manifest.cases[caseId];
            if (!entry) return res.status(404).json({ error: 'Case is not in the manifest' });
            if (restore) delete entry.retired;
            else entry.retired = { at: new Date().toISOString(), note: String(note || '').slice(0, 300) };
            ctx.tcdSaveCaseManifest(manifest);
            const tracking = ctx.tcdLoadCaseTracking();
            if (!restore && tracking.cases[caseId]) { delete tracking.cases[caseId]; ctx.tcdSaveCaseTracking(); }
            ctx.tcdLogCaseHistory({ type: restore ? 'case_unretired' : 'case_retired', caseId, title: '', reason: restore ? null : (note || null) });
            res.json({ id: caseId, retired: entry.retired || null });
        } catch (err) {
            res.status(500).json({ error: String(err && err.message || err) });
        }
    });

    // Where did a case go? Commits (any branch) that added or removed its ID,
    // plus every place it appears in the working tree right now.
    const { execFile } = require('child_process');
    const git = (args, cwd) => new Promise((resolve) => {
        execFile('git', args, { cwd, maxBuffer: 4 * 1024 * 1024, timeout: 30000 }, (err, stdout) => resolve(err && !stdout ? '' : String(stdout || '')));
    });
    app.get('/api/cases/locate/:id', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const id = `C${numericId(req.params.id)}`;
        if (!/^C\d{5,}$/.test(id)) return res.status(400).json({ error: 'Bad case id' });
        const root = ctx.TCD_E2E_ROOT;
        try {
            const [log, grep] = await Promise.all([
                git(['log', '--all', '-S', id, '--format=%h%x09%ad%x09%an%x09%D%x09%s', '--date=short', '-n', '15', '--', 'cypress', 'e2e'], root),
                git(['grep', '-n', '--untracked', '-I', '-e', id, '--', 'cypress', 'e2e'], root),
            ]);
            const commits = log.split('\n').filter(Boolean).map((l) => {
                const [hash, date, author, refs, subject] = l.split('\t');
                return { hash, date, author, refs, subject };
            });
            const matches = grep.split('\n').filter(Boolean).slice(0, 40).map((l) => {
                const m = l.match(/^([^:]+):(\d+):(.*)$/);
                if (!m) return null;
                const text = m[3].trim();
                return { path: m[1], line: Number(m[2]), text: text.slice(0, 200), commented: text.startsWith('//') || text.startsWith('*') };
            }).filter(Boolean);
            // Per commit: which file it touched for this ID (added or removed it).
            for (const c of commits.slice(0, 8)) {
                const out = await git(['show', '--format=', '--unified=0', c.hash, '--', 'cypress', 'e2e'], root);
                let file = null; const files = [];
                out.split('\n').forEach((l) => {
                    if (l.startsWith('+++ b/') || l.startsWith('--- a/')) file = l.slice(6).replace(/\t.*$/, '').replace(/^"|"$/g, '');
                    else if ((l.startsWith('+') || l.startsWith('-')) && l.includes(id) && file && !files.some((f) => f.path === file && f.change === l[0])) files.push({ path: file, change: l[0] === '+' ? 'added' : 'removed' });
                });
                c.files = files;
            }
            res.json({ id, commits, matches });
        } catch (err) {
            res.status(500).json({ error: String(err && err.message || err) });
        }
    });

    // What a run would actually execute, per spec: the grepTags string and the
    // it() blocks it selects — so a wrong or missing tag shows up before queueing.
    app.post('/api/cases/run-preview', (req, res) => {
        const items = (req.body || {}).items;
        if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items[] is required' });
        const target = (req.body || {}).target || 'local';
        try {
            const data = ctx.tcdBuildData();
            const shared = new Map((data.sharedSpecs || []).map((sp) => [sp.path, sp.otherCases]));
            const out = items.map((it) => {
                const requested = (it.cases || []).map((c) => `C${numericId(c)}`);
                const expanded = ctx.tcdExpandDeps(requested);
                const grepTags = ctx.tcdGrepTagsFor(requested, it.path);
                const tagSet = new Set(grepTags.split(' ').filter(Boolean));
                const blocks = ctx.tcdSpecItBlocks(it.path);
                if (!blocks) return { path: it.path, cat: it.cat || null, error: 'Spec file not found', requested, grepTags };
                const live = blocks.filter((b) => !b.commented);
                const selected = live.filter((b) => b.tags.some((t) => tagSet.has(t)));
                const caseBlocks = selected.filter((b) => b.ids.length);
                const setupBlocks = selected.filter((b) => !b.ids.length);
                const found = new Set(caseBlocks.flatMap((b) => b.ids));
                const notFound = expanded.filter((c) => !found.has(c));
                const extra = [...found].filter((c) => !expanded.includes(c));
                return {
                    path: it.path, cat: it.cat || null, requested, deps: expanded.filter((c) => !requested.includes(c)), grepTags,
                    expectedTests: selected.length, caseTests: caseBlocks.length, setupTests: setupBlocks.length, specTests: live.length,
                    notFound, extraCases: extra, sharedOtherCases: shared.get(it.path) || 0,
                };
            });
            const check = ctx.tcdGetLastParamCheck();
            let jenkins = null;
            if (target === 'jenkins') {
                jenkins = check
                    ? { checkedAt: check.at, missing: check.jobs.filter((j) => !j.hasGrepTags).map((j) => j.name), unreachable: check.jobs.some((j) => j.error) }
                    : { checkedAt: null, missing: null, unreachable: null };
            }
            res.json({ items: out, jenkins });
        } catch (err) {
            res.status(500).json({ error: String(err && err.message || err) });
        }
    });

    return {};
};
