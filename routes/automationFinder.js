// Automation Finder.
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { AF_DIR, TCD_E2E_ROOT, TCD_PAGE_CONCURRENCY, TCD_PAGE_SIZE, fs, path, spawn, tcdExtractFromFile,
        tcdFetchCasesPage, tcdGetStatusNames, tcdLoadTrConfig, tcdTrGet, writeJsonAtomic, ROOT } = ctx;

    // ════════════════════════════════════════════
    // AUTOMATION FINDER — "which TestRail cases still need automating"
    // Read-only reporting: no dependency on the Cypress Runner or Jenkins
    // Runner job systems above, and never triggers either. Cross-references
    // three sources for every case in the reference TestRail suite —
    // (1) the ic-tokyo Cypress codebase (TCD_E2E_ROOT, reusing tcdExtractFromFile
    // from the Test Case Dashboard section above), (2) the TestRail
    // "Automation Coverage Reference Run", (3) the team's Google Sheet tracker —
    // and merges them into one per-case verdict + flags. Sync is a plain
    // in-memory job (no relation to tcdJobQueue/cyrActiveRun) polled via
    // GET /api/automation-finder/progress.
    // ════════════════════════════════════════════

    const AF_SHEET_URL = process.env.AUTOMATION_SHEET_URL
        || 'https://docs.google.com/spreadsheets/d/1EhoPw41bb1p2Tk47g8UD8fvEtYnX7TcZaa2pJXdjIt4/edit?usp=sharing';
    // The TestRail run synced against is chosen on the page and saved in
    // settings.json (env var / 8095 is only the first-run default).
    const AF_SETTINGS_PATH = path.join(AF_DIR, 'settings.json');
    const AF_DEFAULT_RUN_ID = Number(process.env.AUTOMATION_REFERENCE_RUN_ID) || 8095;
    function afLoadSettings() {
        try { return JSON.parse(fs.readFileSync(AF_SETTINGS_PATH, 'utf8')); } catch (e) { return {}; }
    }
    function afReferenceRunId() {
        return Number(afLoadSettings().referenceRunId) || AF_DEFAULT_RUN_ID;
    }
    const AF_SHEET_SCAN_SCRIPT = path.join(ROOT, 'scripts', 'automation_sheet_scan.py');
    const AF_COVERAGE_PATH = path.join(AF_DIR, 'coverage.json');
    const AF_PROGRESS_PATH = path.join(AF_DIR, 'sync-progress.json');
    const AF_OVERRIDES_PATH = path.join(AF_DIR, 'overrides.json');
    const AF_SHEET_OUTPUT_PATH = path.join(AF_DIR, 'sheet-scan.json');

    // A sync is a single in-flight Node process — there is no external job to
    // reattach to on restart the way Jenkins builds can be repolled, so a
    // snapshot found still "running" at boot means the server died mid-sync,
    // not that one can be resumed.
    let afProgress = { running: false, phase: 'idle', total: 0, done: 0, startedAt: null, finishedAt: null, error: null };
    try {
        const loaded = JSON.parse(fs.readFileSync(AF_PROGRESS_PATH, 'utf8'));
        afProgress = loaded.running
            ? { ...loaded, running: false, phase: 'idle', error: 'Interrupted by a server restart — click Sync Now to retry.' }
            : loaded;
    } catch (e) { /* no prior sync yet */ }

    function afSetProgress(patch) {
        afProgress = { ...afProgress, ...patch };
        try { writeJsonAtomic(AF_PROGRESS_PATH, afProgress); } catch (e) { /* best effort */ }
    }

    let afOverridesCache = null;
    function afLoadOverrides() {
        if (afOverridesCache) return afOverridesCache;
        try { afOverridesCache = JSON.parse(fs.readFileSync(AF_OVERRIDES_PATH, 'utf8')); }
        catch (e) { afOverridesCache = {}; }
        return afOverridesCache;
    }
    function afSaveOverrides() {
        try { writeJsonAtomic(AF_OVERRIDES_PATH, afOverridesCache || {}); }
        catch (e) { console.error('[automation-finder] failed to save overrides:', e.message); }
    }

    // ── Codebase scan ──
    // Walks every .ts/.tsx file under TCD_E2E_ROOT (not just the manually
    // maintained manifest the Test Case Dashboard uses above) so a case isn't
    // missed just because nobody added its spec file to that list, then reuses
    // tcdExtractFromFile/tcdIsCommented (defined earlier in this file) to pull
    // case IDs and comment state out of each one exactly the way that feature does.
    function afWalkTsFiles(dir, out) {
        out = out || [];
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
                afWalkTsFiles(full, out);
            } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
                out.push(full);
            }
        }
        return out;
    }

    function afScanCodebase() {
        const files = afWalkTsFiles(TCD_E2E_ROOT);
        const byCase = {};
        for (const fullPath of files) {
            let content;
            try { content = fs.readFileSync(fullPath, 'utf8'); } catch (e) { continue; }
            const rows = tcdExtractFromFile(content);
            if (!rows.length) continue;
            const relPath = path.relative(TCD_E2E_ROOT, fullPath);
            for (const r of rows) {
                const entry = byCase[r.id] || { inCodebase: false, commented: true, files: [] };
                entry.files.push({ path: relPath, title: r.title, commented: r.commented });
                if (!r.commented) { entry.inCodebase = true; entry.commented = false; }
                byCase[r.id] = entry;
            }
        }
        return byCase;
    }

    // ── TestRail: sections, cases, reference-run tests, users ──
    async function afFetchAllSections(projectId, suiteId) {
        const sections = [];
        let offset = 0;
        while (true) {
            const page = await tcdTrGet(`/index.php?/api/v2/get_sections/${projectId}&suite_id=${suiteId}&limit=250&offset=${offset}`);
            const list = Array.isArray(page) ? page : (page.sections || []);
            sections.push(...list);
            if (list.length < 250) break;
            offset += 250;
        }
        return sections;
    }

    // Reuses tcdFetchCasesPage (defined earlier for tcdFetchAllCaseIds) but
    // keeps the full case objects instead of just their ids, since we need
    // title + section_id for every case.
    async function afFetchAllCases(projectId, suiteId, onProgress) {
        const cases = [];
        let offset = 0;
        let done = false;
        while (!done) {
            const offsets = Array.from({ length: TCD_PAGE_CONCURRENCY }, (_, i) => offset + i * TCD_PAGE_SIZE);
            const pages = await Promise.all(offsets.map((o) => tcdFetchCasesPage(projectId, suiteId, o)));
            pages.forEach((p) => cases.push(...p));
            if (onProgress) onProgress(cases.length);
            if (pages.some((p) => p.length < TCD_PAGE_SIZE)) done = true;
            offset += TCD_PAGE_CONCURRENCY * TCD_PAGE_SIZE;
        }
        return cases;
    }

    // Same concurrent-pagination shape as tcdGetRunStatuses above, but keeps the
    // automation flag/type/assignee this feature needs instead of pass/fail status.
    // Status ids that mean "this test actually ran and got a real result" —
    // the reference run's true automation-execution signal. Untested (3) means
    // no result was ever posted; Blocked (2) means it never got the chance to
    // run either, so neither counts as evidence the case is automated.
    const AF_EXECUTED_STATUS_IDS = new Set([1, 4, 5]); // Passed, Retest, Failed

    async function afFetchRunTests(runId, onProgress) {
        const [run, statusNames] = await Promise.all([
            tcdTrGet(`/index.php?/api/v2/get_run/${runId}`).catch(() => null),
            tcdGetStatusNames(),
        ]);
        const byCase = {};
        function ingest(tests) {
            tests.forEach((t) => {
                byCase[String(t.case_id)] = {
                    statusId: t.status_id,
                    statusName: statusNames[t.status_id] || `Status ${t.status_id}`,
                    executed: AF_EXECUTED_STATUS_IDS.has(t.status_id),
                    automationFlag: !!t.custom_automation,
                    automationType: t.custom_automation_type,
                    assigneeId: t.assignedto_id || null,
                };
            });
        }
        const total = run
            ? Object.keys(run).filter((k) => k.endsWith('_count')).reduce((s, k) => s + (run[k] || 0), 0)
            : 0;
        if (total > 0) {
            const totalPages = Math.ceil(total / TCD_PAGE_SIZE);
            let nextPage = 0;
            const worker = async () => {
                while (nextPage < totalPages) {
                    const p = nextPage++;
                    const offset = p * TCD_PAGE_SIZE;
                    const page = await tcdTrGet(`/index.php?/api/v2/get_tests/${runId}&limit=${TCD_PAGE_SIZE}&offset=${offset}`);
                    ingest(Array.isArray(page) ? page : (page.tests || []));
                    if (onProgress) onProgress(Object.keys(byCase).length, total);
                }
            };
            await Promise.all(Array.from({ length: Math.min(TCD_PAGE_CONCURRENCY, totalPages) }, worker));
        } else {
            let endpoint = `/index.php?/api/v2/get_tests/${runId}&limit=${TCD_PAGE_SIZE}`;
            while (endpoint) {
                const page = await tcdTrGet(endpoint);
                ingest(Array.isArray(page) ? page : (page.tests || []));
                const next = !Array.isArray(page) && page._links && page._links.next;
                endpoint = next ? '/index.php?' + next.replace(/^\/+/, '') : null;
            }
        }
        return { runName: run ? run.name : null, byCase };
    }

    // ── Google Sheet scan (child process — see scripts/automation_sheet_scan.py) ──
    function afRunSheetScan() {
        return new Promise((resolve, reject) => {
            const child = spawn('python3', [AF_SHEET_SCAN_SCRIPT, AF_SHEET_URL, AF_SHEET_OUTPUT_PATH], { stdio: ['ignore', 'pipe', 'pipe'] });
            let stderr = '';
            child.stderr.on('data', (d) => { stderr += d; });
            child.on('error', (err) => reject(new Error(`Failed to start python3: ${err.message}`)));
            child.on('close', () => {
                let out;
                try { out = JSON.parse(fs.readFileSync(AF_SHEET_OUTPUT_PATH, 'utf8')); }
                catch (e) { return reject(new Error(`Sheet scan produced no readable output: ${stderr.slice(0, 300) || e.message}`)); }
                if (out.error) return reject(new Error(`Sheet scan failed: ${out.error}`));
                resolve(out);
            });
        });
    }

    // A QA-name field naming more than one distinct person across the sheet's
    // Cloud/Device QA columns is worth a look, but "vijay" vs "Vijay S" is
    // deliberately NOT treated as a conflict here — only an exact (trimmed,
    // case-insensitive) mismatch is, so spelling variants don't drown out real
    // conflicts. (TestRail's assignedto_id is fetched too but this instance's
    // API key isn't a TestRail admin, so get_users/get_user are 403 for us —
    // there's no way to resolve it to a name; assigneeId is kept in the data as
    // a raw id in case that ever changes, but never compared here.)
    function afNamesConflict(names) {
        const distinct = new Set(names.filter(Boolean).map((n) => String(n).trim().toLowerCase()));
        return distinct.size > 1;
    }

    function afBuildSectionTree(sections) {
        const byId = {};
        sections.forEach((s) => { byId[s.id] = { id: s.id, name: s.name, parentId: s.parent_id, depth: s.depth, children: [] }; });
        const roots = [];
        sections.forEach((s) => {
            const node = byId[s.id];
            if (s.parent_id && byId[s.parent_id]) byId[s.parent_id].children.push(node);
            else roots.push(node);
        });
        return { roots, byId };
    }

    function afSectionPath(sectionId, byId) {
        const parts = [];
        let node = byId[sectionId];
        while (node) {
            parts.unshift(node.name);
            node = node.parentId ? byId[node.parentId] : null;
        }
        return parts;
    }

    async function afRunSync() {
        afSetProgress({ running: true, phase: 'Fetching TestRail sections & cases', total: 0, done: 0, startedAt: Date.now(), finishedAt: null, error: null });
        try {
            const { projectId, suiteId } = tcdLoadTrConfig();
            if (!projectId || !suiteId) throw new Error('TestRail is not configured yet — set it up under Settings > Integrations first.');

            const sections = await afFetchAllSections(projectId, suiteId);
            const tree = afBuildSectionTree(sections);

            const cases = await afFetchAllCases(projectId, suiteId, (n) => afSetProgress({ done: n }));

            const refRunId = afReferenceRunId();
            afSetProgress({ phase: `Fetching reference run ${refRunId}`, total: cases.length, done: 0 });
            const { byCase: runByCase } = await afFetchRunTests(refRunId, (done, total) => afSetProgress({ done, total }));

            afSetProgress({ phase: 'Scanning ic-tokyo codebase', total: 0, done: 0 });
            const codebaseByCase = afScanCodebase();

            afSetProgress({ phase: 'Reading Google Sheet' });
            const sheetResult = await afRunSheetScan();

            afSetProgress({ phase: 'Merging', total: cases.length, done: 0 });

            // Verdict comes ONLY from the two primary sources — the codebase and
            // the reference run's actual execution status — never from the
            // sheet, and never from TestRail's custom_automation checkbox
            // (case-level metadata someone ticks by hand, not tied to any real
            // execution, so it's shown as an informational tag only, same as
            // the sheet). "Executed" means the run posted a real Passed/Failed/
            // Retest result — Untested/Blocked mean automation never actually
            // ran it in this run, regardless of what the checkbox or sheet claim.
            function afMergeCase(caseId, title, sectionPath, inReferenceSuite, codebase, tr, sheet) {
                const sheetCloudQA = sheet && sheet.cloudQA ? String(sheet.cloudQA).trim() : null;
                const sheetDeviceQA = sheet && sheet.deviceQA ? String(sheet.deviceQA).trim() : null;
                const cloudDone = !!(sheet && sheet.cloudStatus && /^done/i.test(String(sheet.cloudStatus).trim()));
                const deviceDone = !!(sheet && sheet.deviceStatus && /^done/i.test(String(sheet.deviceStatus).trim()));
                const sheetSaysDone = cloudDone || deviceDone;

                let verdict;
                if (codebase.inCodebase || tr.executed) {
                    verdict = 'automated';
                } else if (codebase.files.length > 0) {
                    verdict = 'commented';
                } else {
                    verdict = 'not_automated';
                }

                const flags = [];
                // Disagreement between the two sources that actually decide the
                // verdict — worth a look either way (code exists but the run has
                // never confirmed it, or the run passed/failed something our
                // codebase scan didn't find — different framework, stale run, etc).
                if (codebase.inCodebase && !tr.executed) flags.push('not_confirmed_by_run');
                if (tr.executed && !codebase.inCodebase) flags.push('run_result_no_codebase_match');
                // Sheet/checkbox disagreement is informational only — it never
                // changes verdict, just flags that the paperwork disagrees with
                // what codebase+run actually show.
                if (sheet && sheetSaysDone && verdict !== 'automated') flags.push('sheet_says_done_but_unconfirmed');
                if (sheet && !sheetSaysDone && verdict === 'automated' && sheet.caseStatus) flags.push('sheet_not_marked_done');
                if (tr.automationFlag && verdict !== 'automated') flags.push('checkbox_says_automated_but_unconfirmed');
                if (afNamesConflict([sheetCloudQA, sheetDeviceQA])) flags.push('assignee_conflict');
                if (sheet && sheet.duplicate) flags.push('duplicate_in_sheet');
                if (sheet && sheet.qaDataIssues && sheet.qaDataIssues.length) flags.push('qa_data_issue');
                if (!sheet) flags.push('not_in_sheet');
                if (!inReferenceSuite) flags.push('outside_reference_suite');
                if (String(sheet && sheet.caseStatus || '').trim().toLowerCase() === 'blocked'
                    || /^blocked/i.test(String(sheet && sheet.cloudStatus || ''))
                    || /^blocked/i.test(String(sheet && sheet.deviceStatus || ''))) {
                    flags.push('blocked');
                }

                return {
                    caseId,
                    title,
                    sectionPath,
                    verdict,
                    codebase: { inCodebase: codebase.inCodebase, commented: codebase.commented && codebase.files.length > 0, files: codebase.files },
                    run: { statusId: tr.statusId || null, statusName: tr.statusName || 'Untested', executed: tr.executed },
                    testrail: { automationFlag: tr.automationFlag, automationType: tr.automationType, assigneeId: tr.assigneeId },
                    // Feasibility (sheet column C) is shown, never used to decide
                    // whether a case belongs in the "not automated" worklist.
                    feasibility: sheet ? (sheet.caseStatus || null) : null,
                    sheet: sheet ? {
                        module: sheet.module,
                        cloudStatus: sheet.cloudStatus,
                        cloudQA: sheetCloudQA,
                        deviceStatus: sheet.deviceStatus,
                        deviceQA: sheetDeviceQA,
                        sheetTab: sheet.sheetTab,
                        qaDataIssues: sheet.qaDataIssues || [],
                    } : null,
                    flags,
                };
            }

            const records = {};
            let n = 0;
            const EMPTY_CODEBASE = { inCodebase: false, commented: false, files: [] };
            const EMPTY_TR = { statusId: null, statusName: 'Untested', executed: false, automationFlag: false, automationType: 0, assigneeId: null };
            for (const c of cases) {
                n += 1;
                const caseId = `C${c.id}`;
                const codebase = codebaseByCase[caseId] || EMPTY_CODEBASE;
                const tr = runByCase[String(c.id)] || EMPTY_TR;
                const sheet = (sheetResult.cases || {})[caseId] || null;
                records[caseId] = afMergeCase(caseId, c.title, afSectionPath(c.section_id, tree.byId), true, codebase, tr, sheet);
                if (n % 500 === 0) afSetProgress({ done: n });
            }

            // Codebase (or sheet) can reference a case ID that belongs to a
            // *different* TestRail suite than the reference run's — e.g. an old
            // suite a spec's case was never migrated out of. Dropping those
            // silently would hide exactly the "commented, still needs
            // finishing" cases this feature exists to surface, so they're kept
            // as their own bucket rather than folded into the suite-2592 counts.
            const sheetCases = sheetResult.cases || {};
            const leftoverIds = new Set([...Object.keys(codebaseByCase), ...Object.keys(sheetCases)].filter((id) => !records[id]));
            leftoverIds.forEach((caseId) => {
                const codebase = codebaseByCase[caseId] || EMPTY_CODEBASE;
                const sheet = sheetCases[caseId] || null;
                const title = (codebase.files[0] && codebase.files[0].title) || (sheet && sheet.module) || caseId;
                records[caseId] = afMergeCase(caseId, title, [], false, codebase, EMPTY_TR, sheet);
            });

            const summary = { total: 0, automated: 0, commented: 0, not_automated: 0, flagged: 0 };
            Object.values(records).forEach((r) => {
                summary.total += 1;
                summary[r.verdict] = (summary[r.verdict] || 0) + 1;
                if (r.flags.length) summary.flagged += 1;
            });

            writeJsonAtomic(AF_COVERAGE_PATH, {
                generatedAt: new Date().toISOString(),
                testrailUrl: tcdLoadTrConfig().url,
                referenceRunId: refRunId,
                referenceRunName: (await tcdTrGet(`/index.php?/api/v2/get_run/${refRunId}`).catch(() => null) || {}).name || null,
                sheetUrl: AF_SHEET_URL,
                sheetScannedTabs: sheetResult.scannedTabs,
                sheetSkippedTabs: sheetResult.skippedTabs,
                sectionTree: tree.roots,
                summary,
                cases: records,
            });

            afSetProgress({ running: false, phase: 'idle', done: n, total: n, finishedAt: Date.now(), error: null });
        } catch (err) {
            afSetProgress({ running: false, phase: 'idle', finishedAt: Date.now(), error: String(err && err.message || err) });
        }
    }

    app.get('/api/automation-finder/settings', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json({ referenceRunId: afReferenceRunId(), defaultRunId: AF_DEFAULT_RUN_ID });
    });

    // Saves the reference run (checked against TestRail first). A sync can
    // also pass { runId } to switch and sync in one step.
    async function afSetReferenceRun(runId) {
        const id = Number(String(runId || '').replace(/\D/g, ''));
        if (!id) throw new Error('Enter a numeric TestRail run ID');
        const run = await tcdTrGet(`/index.php?/api/v2/get_run/${id}`).catch(() => null);
        if (!run || !run.id) throw new Error(`TestRail run ${id} not found`);
        writeJsonAtomic(AF_SETTINGS_PATH, { ...afLoadSettings(), referenceRunId: id, referenceRunName: run.name || null, savedAt: new Date().toISOString() });
        return { referenceRunId: id, referenceRunName: run.name || null };
    }
    app.post('/api/automation-finder/settings', async (req, res) => {
        try { res.json(await afSetReferenceRun((req.body || {}).referenceRunId)); } catch (e) { res.status(400).json({ error: e.message }); }
    });

    app.post('/api/automation-finder/sync', async (req, res) => {
        if (afProgress.running) return res.status(409).json({ error: 'A sync is already running' });
        if (req.body && req.body.runId) {
            try { await afSetReferenceRun(req.body.runId); } catch (e) { return res.status(400).json({ error: e.message }); }
        }
        afRunSync(); // fire-and-forget — client polls /progress
        res.status(202).json({ started: true });
    });

    app.get('/api/automation-finder/progress', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json(afProgress);
    });

    app.get('/api/automation-finder/data', (req, res) => {
        res.set('Cache-Control', 'no-store');
        try {
            res.json(JSON.parse(fs.readFileSync(AF_COVERAGE_PATH, 'utf8')));
        } catch (e) {
            res.json({ generatedAt: null, cases: {}, sectionTree: [], summary: null });
        }
    });

    app.get('/api/automation-finder/overrides', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json(afLoadOverrides());
    });

    app.post('/api/automation-finder/overrides', (req, res) => {
        const { caseId, assignee, note } = req.body || {};
        if (!caseId) return res.status(400).json({ error: 'caseId is required' });
        const store = afLoadOverrides();
        const trimmedAssignee = (assignee || '').trim();
        const trimmedNote = (note || '').trim();
        if (!trimmedAssignee && !trimmedNote) {
            delete store[caseId];
        } else {
            store[caseId] = { assignee: trimmedAssignee || null, note: trimmedNote || null, updatedAt: Date.now() };
        }
        afSaveOverrides();
        res.json({ caseId, entry: store[caseId] || null });
    });

    return {};
};
