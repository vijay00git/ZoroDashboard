// Jenkins Runner: manifest, case tracking, TestRail/Jenkins config, job queue, integrations, Telegram.
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { SETTINGS_DIR, TCD_DIR, fs, http, https, os, path, writeFileAtomic, writeJsonAtomic } = ctx;

    // ════════════════════════════════════════════
    // TEST CASE DASHBOARD — E2E manifest / TestRail / Jenkins
    // Ported from the standalone ~/.claude/testcase-dashboard tool. Reads a
    // manually-maintained manifest of Cypress/Robot files, cross-references
    // their it() blocks against TestRail, and can trigger/track Jenkins builds
    // for them. Notes/history live in data/testcase-dashboard/; the TestRail/
    // Jenkins/Telegram credentials themselves live in data/settings/ since
    // they're shared infrastructure usable from any page (Settings' Integrations
    // tab), not just this one.
    // ════════════════════════════════════════════

    const INTEGRATIONS_CONFIG_PATH = path.join(SETTINGS_DIR, 'integrations.local.json');
    const TCD_NOTES_PATH = path.join(TCD_DIR, 'notes.json');
    const TCD_MANUAL_STATUS_PATH = path.join(TCD_DIR, 'manual-status.json');
    const TCD_TAGS_PATH = path.join(TCD_DIR, 'tags.json');
    const TCD_BUG_LINKS_PATH = path.join(TCD_DIR, 'bug-links.json');
    // Jenkins Runner (TestCaseDashboard) keeps its own manual-status/bug-links
    // stores, deliberately separate from Cypress Runner's — a case run through
    // Jenkins and one run locally via Cypress are different executions, and
    // marking one pass/fail (or linking a bug on one) shouldn't silently apply
    // to the other.
    const TCD_JENKINS_MANUAL_STATUS_PATH = path.join(TCD_DIR, 'jenkins-manual-status.json');
    const TCD_JENKINS_BUG_LINKS_PATH = path.join(TCD_DIR, 'jenkins-bug-links.json');
    const TCD_HISTORY_PATH = path.join(TCD_DIR, 'job-history.json');
    const TCD_QUEUE_STATE_PATH = path.join(TCD_DIR, 'queue-state.json');
    // "Remember test cases" — shared by both Cypress Runner and Jenkins Runner
    // (same manifest, same files on disk) since it's tracking an objective fact
    // about the codebase, not a per-runner annotation like manual-status/tags/
    // bug-links above.
    const TCD_MANIFEST_PATH = process.env.TCD_MANIFEST_PATH || path.join(os.homedir(), '.claude', 'ic-tokyo-file-manifest.md');
    // Case manifest: the TestRail case IDs we own. Specs are shared now (anyone
    // adds tests to any spec), so ownership is per case, and each case's spec is
    // looked up from the it() titles on every build. Present = case mode; the
    // spec manifest above is only used when this file doesn't exist.
    const TCD_CASE_MANIFEST_PATH = process.env.TCD_CASE_MANIFEST_PATH || path.join(os.homedir(), '.claude', 'ic-tokyo-case-manifest.json');
    const TCD_CASE_MODE = fs.existsSync(TCD_CASE_MANIFEST_PATH);
    // Case mode keeps its own tracking snapshot: the spec-mode one also holds
    // other people's cases from shared specs, which would all read as "missing".
    const TCD_CASE_TRACKING_PATH = path.join(TCD_DIR, TCD_CASE_MODE ? 'case-tracking-owned.json' : 'case-tracking.json');
    const TCD_CASE_HISTORY_PATH = path.join(TCD_DIR, TCD_CASE_MODE ? 'case-tracking-owned-history.json' : 'case-tracking-history.json');
    // Manifest paths are relative to the polaris-web-client project root (new
    // cypress/e2e/functional_tests/... structure), which is also where
    // cypress.config.ts and node_modules/.bin/cypress live.
    const TCD_E2E_ROOT = process.env.TCD_E2E_ROOT || path.join(os.homedir(), 'ic-tokyo', 'services', 'polaris-web-client');

    let tcdNotesCache = null;
    function tcdLoadNotes() {
        if (tcdNotesCache) return tcdNotesCache;
        try {
            tcdNotesCache = JSON.parse(fs.readFileSync(TCD_NOTES_PATH, 'utf8'));
        } catch (e) {
            tcdNotesCache = {};
        }
        return tcdNotesCache;
    }
    function tcdSaveNotes() {
        try {
            writeJsonAtomic(TCD_NOTES_PATH, tcdNotesCache || {});
        } catch (e) {
            console.error('[testcases] failed to save notes:', e.message);
        }
    }

    // Manual pass/fail/blocked/retest overrides — lets the Cypress Runner page
    // record a status for a case that wasn't (or can't be) determined by an
    // actual local run, keyed by case id the same way notes.json is.
    let tcdManualStatusCache = null;
    function tcdLoadManualStatus() {
        if (tcdManualStatusCache) return tcdManualStatusCache;
        try {
            tcdManualStatusCache = JSON.parse(fs.readFileSync(TCD_MANUAL_STATUS_PATH, 'utf8'));
        } catch (e) {
            tcdManualStatusCache = {};
        }
        return tcdManualStatusCache;
    }
    function tcdSaveManualStatus() {
        try {
            writeJsonAtomic(TCD_MANUAL_STATUS_PATH, tcdManualStatusCache || {});
        } catch (e) {
            console.error('[testcases] failed to save manual status:', e.message);
        }
    }

    // Jenkins Runner's own manual-status store — same shape as
    // tcdManualStatusCache above, kept in a separate file so a mark made here
    // never shows up on the Cypress Runner page or vice versa.
    let tcdJenkinsManualStatusCache = null;
    function tcdLoadJenkinsManualStatus() {
        if (tcdJenkinsManualStatusCache) return tcdJenkinsManualStatusCache;
        try {
            tcdJenkinsManualStatusCache = JSON.parse(fs.readFileSync(TCD_JENKINS_MANUAL_STATUS_PATH, 'utf8'));
        } catch (e) {
            tcdJenkinsManualStatusCache = {};
        }
        return tcdJenkinsManualStatusCache;
    }
    function tcdSaveJenkinsManualStatus() {
        try {
            writeJsonAtomic(TCD_JENKINS_MANUAL_STATUS_PATH, tcdJenkinsManualStatusCache || {});
        } catch (e) {
            console.error('[testcases] failed to save Jenkins manual status:', e.message);
        }
    }

    // Free-form tags per case id, keyed the same way notes/manual-status are.
    // Stored as { [caseId]: string[] } — lowercased, trimmed, deduped on the way in.
    let tcdTagsCache = null;
    function tcdLoadTags() {
        if (tcdTagsCache) return tcdTagsCache;
        try {
            tcdTagsCache = JSON.parse(fs.readFileSync(TCD_TAGS_PATH, 'utf8'));
        } catch (e) {
            tcdTagsCache = {};
        }
        return tcdTagsCache;
    }
    function tcdSaveTags() {
        try {
            writeJsonAtomic(TCD_TAGS_PATH, tcdTagsCache || {});
        } catch (e) {
            console.error('[testcases] failed to save tags:', e.message);
        }
    }

    // Bug-tracker ticket linked to a case (e.g. "EVB-1234") — keyed the same way
    // notes/manual-status/tags are. Distinct from tags: a free-form label vs a
    // single canonical ticket reference for "this case is currently failing
    // because of a known, tracked bug."
    let tcdBugLinksCache = null;
    function tcdLoadBugLinks() {
        if (tcdBugLinksCache) return tcdBugLinksCache;
        try {
            tcdBugLinksCache = JSON.parse(fs.readFileSync(TCD_BUG_LINKS_PATH, 'utf8'));
        } catch (e) {
            tcdBugLinksCache = {};
        }
        return tcdBugLinksCache;
    }
    function tcdSaveBugLinks() {
        try {
            writeJsonAtomic(TCD_BUG_LINKS_PATH, tcdBugLinksCache || {});
        } catch (e) {
            console.error('[testcases] failed to save bug links:', e.message);
        }
    }

    // Jenkins Runner's own bug-links store — same shape as tcdBugLinksCache
    // above, kept in a separate file so a link made here never shows up on the
    // Cypress Runner page or vice versa.
    let tcdJenkinsBugLinksCache = null;
    function tcdLoadJenkinsBugLinks() {
        if (tcdJenkinsBugLinksCache) return tcdJenkinsBugLinksCache;
        try {
            tcdJenkinsBugLinksCache = JSON.parse(fs.readFileSync(TCD_JENKINS_BUG_LINKS_PATH, 'utf8'));
        } catch (e) {
            tcdJenkinsBugLinksCache = {};
        }
        return tcdJenkinsBugLinksCache;
    }
    function tcdSaveJenkinsBugLinks() {
        try {
            writeJsonAtomic(TCD_JENKINS_BUG_LINKS_PATH, tcdJenkinsBugLinksCache || {});
        } catch (e) {
            console.error('[testcases] failed to save Jenkins bug links:', e.message);
        }
    }
    function tcdNormalizeTagList(list) {
        const seen = new Set();
        (list || []).forEach((t) => {
            const clean = String(t || '').trim().toLowerCase();
            if (clean) seen.add(clean);
        });
        return Array.from(seen);
    }

    // ── "Remember test cases" ───────────────────────────────────────────────
    // Snapshot of every case id ever seen in the manifest's spec files, kept up
    // to date on every /api/testcases/data poll (tcdTrackCaseIds, called from
    // tcdBuildData below). Lets the runner notice a case id that used to be in
    // the codebase and now isn't — deleted from its it() block, or its whole
    // file deleted from disk while still listed in the manifest — as distinct
    // from a case id that was never tracked at all.
    // { seeded: bool, seededAt, reviewedAt, cases: { [caseId]: { path, cat,
    //   grp, title, status: 'present'|'missing', firstSeenAt, lastSeenAt,
    //   missingSince, reason, restoredAt, movedFrom, movedAt } } }
    // A case is "newly added" when firstSeenAt is after seededAt (the baseline
    // scan); reviewedAt is when the user last acknowledged the new ones.
    const TCD_CASE_HISTORY_MAX = 500;

    let tcdCaseTrackingCache = null;
    function tcdLoadCaseTracking() {
        if (tcdCaseTrackingCache) return tcdCaseTrackingCache;
        try {
            tcdCaseTrackingCache = JSON.parse(fs.readFileSync(TCD_CASE_TRACKING_PATH, 'utf8'));
        } catch (e) {
            tcdCaseTrackingCache = { seeded: false, cases: {} };
        }
        if (!tcdCaseTrackingCache.cases) tcdCaseTrackingCache.cases = {};
        // Snapshots written before seededAt existed: the baseline scan stamped
        // every case with the same firstSeenAt, so the earliest one is it.
        if (tcdCaseTrackingCache.seeded && !tcdCaseTrackingCache.seededAt) {
            const firsts = Object.values(tcdCaseTrackingCache.cases).map((c) => c.firstSeenAt).filter(Boolean).sort();
            tcdCaseTrackingCache.seededAt = firsts[0] || new Date().toISOString();
        }
        return tcdCaseTrackingCache;
    }
    function tcdSaveCaseTracking() {
        try {
            writeJsonAtomic(TCD_CASE_TRACKING_PATH, tcdCaseTrackingCache || { seeded: false, cases: {} });
        } catch (e) {
            console.error('[testcases] failed to save case tracking:', e.message);
        }
    }

    let tcdCaseTrackingHistory = [];
    (function tcdLoadCaseHistoryOnBoot() {
        try {
            tcdCaseTrackingHistory = JSON.parse(fs.readFileSync(TCD_CASE_HISTORY_PATH, 'utf8'));
        } catch (e) {
            tcdCaseTrackingHistory = [];
        }
    })();
    function tcdSaveCaseTrackingHistory() {
        try {
            writeJsonAtomic(TCD_CASE_HISTORY_PATH, tcdCaseTrackingHistory.slice(0, TCD_CASE_HISTORY_MAX));
        } catch (e) {
            console.error('[testcases] failed to save case tracking history:', e.message);
        }
    }
    function tcdLogCaseHistory(entry) {
        tcdCaseTrackingHistory.unshift({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            detectedAt: new Date().toISOString(),
            ...entry,
        });
        if (tcdCaseTrackingHistory.length > TCD_CASE_HISTORY_MAX) tcdCaseTrackingHistory.length = TCD_CASE_HISTORY_MAX;
        tcdSaveCaseTrackingHistory();
    }

    // Diffs this poll's live rows (fresh from tcdExtractFromFile, across every
    // manifest file) against the last-known snapshot. The very first run after
    // this feature ships seeds the snapshot from whatever the manifest already
    // contains without logging anything — otherwise every pre-existing case id
    // would look like a brand-new "added" event. After that, every transition
    // (new id, id gone missing, id back again) is logged to history.
    function tcdTrackCaseIds(rows, missing, manifestPaths) {
        const tracking = tcdLoadCaseTracking();
        const cases = tracking.cases;
        const now = new Date().toISOString();
        const missingPaths = new Set(missing.map((m) => m.path));
        let changed = false;
        // Changes are only surfaced in the page banner (no Telegram, per the user).
        const log = (entry) => tcdLogCaseHistory(entry);

        // One primary row per case: a live (uncommented) location wins, so a
        // case in two specs, or with a commented-out copy, doesn't flip path
        // on every poll. It counts as commented only when every copy is.
        const primary = new Map();
        for (const r of rows) {
            const cur = primary.get(r.id);
            if (!cur || (cur.commented && !r.commented)) primary.set(r.id, r);
        }

        for (const r of primary.values()) {
            const existing = cases[r.id];
            const commented = !!r.commented;
            if (!existing) {
                cases[r.id] = {
                    path: r.path, cat: r.cat, grp: r.grp, title: r.title, commented,
                    status: 'present', firstSeenAt: now, lastSeenAt: now, missingSince: null, reason: null,
                };
                changed = true;
                if (tracking.seeded) log({ type: 'case_added', caseId: r.id, path: r.path, cat: r.cat, grp: r.grp, title: r.title });
                continue;
            }
            existing.lastSeenAt = now;
            if (existing.path !== r.path || existing.grp !== r.grp || existing.title !== r.title) {
                if (existing.path !== r.path) {
                    existing.movedFrom = existing.path; existing.movedAt = now;
                    if (TCD_CASE_MODE) log({ type: 'case_moved', caseId: r.id, from: existing.path, path: r.path, cat: r.cat, grp: r.grp, title: r.title });
                }
                existing.path = r.path; existing.cat = r.cat; existing.grp = r.grp; existing.title = r.title;
                changed = true;
            }
            if (TCD_CASE_MODE && existing.commented !== undefined && !!existing.commented !== commented) {
                log({ type: commented ? 'case_commented' : 'case_uncommented', caseId: r.id, path: r.path, cat: r.cat, grp: r.grp, title: r.title });
                changed = true;
            }
            if (existing.commented !== commented) { existing.commented = commented; changed = true; }
            if (existing.status === 'missing') {
                existing.status = 'present';
                existing.missingSince = null;
                existing.reason = null;
                existing.restoredAt = now;
                changed = true;
                log({ type: 'case_restored', caseId: r.id, path: r.path, cat: r.cat, grp: r.grp, title: r.title });
            }
        }

        for (const [caseId, existing] of Object.entries(cases)) {
            if (primary.has(caseId) || existing.status === 'missing') continue;
            existing.status = 'missing';
            existing.missingSince = now;
            existing.reason = manifestPaths && !manifestPaths.has(existing.path)
                ? 'not_in_manifest'
                : (missingPaths.has(existing.path) ? 'file_deleted' : 'id_removed');
            changed = true;
            if (tracking.seeded) {
                log({ type: 'case_missing', caseId, path: existing.path, cat: existing.cat, grp: existing.grp, title: existing.title, reason: existing.reason });
            }
        }

        if (!tracking.seeded) { tracking.seeded = true; tracking.seededAt = now; changed = true; }
        if (changed) tcdSaveCaseTracking();

        const missingCases = Object.entries(cases)
            .filter(([, v]) => v.status === 'missing')
            .map(([caseId, v]) => ({ caseId, ...v }));
        return { trackedCount: Object.keys(cases).length, missingCount: missingCases.length, missingCases };
    }

    // Tracker events since the user last marked them reviewed (case mode).
    const TCD_ALERT_TYPES = new Set(['case_moved', 'case_missing', 'case_added', 'case_restored', 'case_commented', 'case_uncommented']);
    function tcdUnreviewedEvents() {
        const since = tcdLoadCaseTracking().reviewedAt || '';
        return tcdCaseTrackingHistory.filter((h) => TCD_ALERT_TYPES.has(h.type) && h.detectedAt > since);
    }

    // Called when a file is deliberately removed from the manifest (as opposed
    // to disappearing from disk unexpectedly) — its case ids are dropped from
    // tracking outright rather than flagged "missing", since this was an
    // intentional action, not codebase drift.
    function tcdUntrackFile(relPath) {
        const tracking = tcdLoadCaseTracking();
        const removedIds = [];
        for (const [caseId, v] of Object.entries(tracking.cases)) {
            if (v.path === relPath) { removedIds.push(caseId); delete tracking.cases[caseId]; }
        }
        if (removedIds.length) {
            tcdSaveCaseTracking();
            tcdLogCaseHistory({ type: 'file_untracked', path: relPath, caseIds: removedIds, count: removedIds.length });
        }
    }

    let TCD_TR_CONFIG = null;
    function tcdLoadTrConfig() {
        if (TCD_TR_CONFIG) return TCD_TR_CONFIG;
        const raw = JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
        TCD_TR_CONFIG = {
            url: raw.TESTRAIL_URL.replace(/\/+$/, ''),
            auth: Buffer.from(`${raw.TESTRAIL_USERNAME}:${raw.TESTRAIL_API_KEY}`).toString('base64'),
            projectId: raw.TESTRAIL_PROJECT_ID,
            suiteId: raw.TESTRAIL_SUITE_ID,
        };
        return TCD_TR_CONFIG;
    }

    function tcdTrGet(endpoint) {
        const { url, auth } = tcdLoadTrConfig();
        return new Promise((resolve, reject) => {
            const req = https.get(url + endpoint, {
                headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
            }, (res) => {
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                    if (res.statusCode === 429) {
                        reject(new Error('TestRail rate limit hit (429) — wait a bit and try again'));
                        return;
                    }
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        reject(new Error(`TestRail ${res.statusCode}: ${body.slice(0, 300)}`));
                        return;
                    }
                    try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
                });
            });
            req.on('error', reject);
            req.setTimeout(15000, () => req.destroy(new Error('TestRail request timed out after 15s')));
        });
    }

    let TCD_JENKINS_CONFIG = null;
    function tcdLoadJenkinsConfig() {
        if (TCD_JENKINS_CONFIG) return TCD_JENKINS_CONFIG;
        const raw = JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
        TCD_JENKINS_CONFIG = {
            url: raw.JENKINS_URL.replace(/\/+$/, ''),
            auth: Buffer.from(`${raw.JENKINS_USERNAME}:${raw.JENKINS_API_TOKEN}`).toString('base64'),
            jobs: raw.JENKINS_JOBS || { ONLINE: [], OFFLINE: [], E2E: [] },
            defaultEnvironment: raw.JENKINS_DEFAULT_ENVIRONMENT || 'qa',
        };
        return TCD_JENKINS_CONFIG;
    }

    let tcdEnvironmentChoicesCache = null;

    // Generic request helper — Jenkins may be plain HTTP on an internal host, so
    // the transport is picked from the URL itself.
    function tcdHttpRequest(urlStr, { method = 'GET', headers = {}, body = null, timeoutMs = 15000 } = {}) {
        return new Promise((resolve, reject) => {
            const u = new URL(urlStr);
            const transport = u.protocol === 'https:' ? https : http;
            const req = transport.request(u, { method, headers }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
            });
            req.on('error', reject);
            req.setTimeout(timeoutMs, () => req.destroy(new Error(`Request to ${urlStr} timed out after ${timeoutMs}ms`)));
            if (body) req.write(body);
            req.end();
        });
    }

    // Same as tcdHttpRequest but accumulates the response as a Buffer instead of
    // a string — needed for anything binary (screenshots). tcdHttpRequest's
    // `data += chunk` string concatenation silently corrupts binary bytes, since
    // it forces a text encoding on every chunk.
    function tcdHttpRequestBinary(urlStr, { method = 'GET', headers = {}, timeoutMs = 20000 } = {}) {
        return new Promise((resolve, reject) => {
            const u = new URL(urlStr);
            const transport = u.protocol === 'https:' ? https : http;
            const req = transport.request(u, { method, headers }, (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
            });
            req.on('error', reject);
            req.setTimeout(timeoutMs, () => req.destroy(new Error(`Request to ${urlStr} timed out after ${timeoutMs}ms`)));
            req.end();
        });
    }

    // Reads the real ENVIRONMENT choice list from the job's own Jenkins
    // parameter definition, instead of guessing/hardcoding valid values.
    async function tcdGetEnvironmentChoices() {
        if (tcdEnvironmentChoicesCache) return tcdEnvironmentChoicesCache;
        const { url, auth, jobs, defaultEnvironment } = tcdLoadJenkinsConfig();
        const anyJob = (jobs.OFFLINE || [])[0] || (jobs.ONLINE || [])[0];
        if (!anyJob) return [defaultEnvironment];
        try {
            const res = await tcdHttpRequest(
                `${url}/job/${encodeURIComponent(anyJob)}/api/json?tree=property[parameterDefinitions[name,choices]]`,
                { headers: { Authorization: `Basic ${auth}` } }
            );
            const json = JSON.parse(res.body);
            const defs = (json.property && json.property[0] && json.property[0].parameterDefinitions) || [];
            const envDef = defs.find((d) => d.name === 'ENVIRONMENT' && d.choices);
            tcdEnvironmentChoicesCache = envDef ? envDef.choices : [defaultEnvironment];
        } catch (e) {
            tcdEnvironmentChoicesCache = [defaultEnvironment];
        }
        return tcdEnvironmentChoicesCache;
    }

    // Jenkins CSRF protection issues a crumb tied to the requesting session/IP;
    // fetched fresh per trigger rather than cached, since crumbs can be
    // invalidated and a stale one just fails the build request outright.
    async function tcdGetJenkinsCrumb() {
        const { url, auth } = tcdLoadJenkinsConfig();
        try {
            const res = await tcdHttpRequest(`${url}/crumbIssuer/api/json`, {
                headers: { Authorization: `Basic ${auth}` },
            });
            if (res.statusCode !== 200) return null;
            const json = JSON.parse(res.body);
            return { field: json.crumbRequestField, value: json.crumb };
        } catch (e) {
            return null; // crumb issuer disabled/unavailable — proceed without one
        }
    }

    async function tcdTriggerJenkinsJob(jobName, params) {
        const { url, auth, jobs } = tcdLoadJenkinsConfig();
        const known = [].concat(jobs.ONLINE || [], jobs.OFFLINE || [], jobs.E2E || []);
        if (!known.includes(jobName)) {
            throw new Error(`"${jobName}" is not a configured Jenkins job`);
        }

        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, v); });

        const crumb = await tcdGetJenkinsCrumb();
        const headers = { Authorization: `Basic ${auth}` };
        if (crumb) headers[crumb.field] = crumb.value;

        const res = await tcdHttpRequest(`${url}/job/${encodeURIComponent(jobName)}/buildWithParameters?${qs.toString()}`, {
            method: 'POST',
            headers,
        });

        if (res.statusCode !== 201 && res.statusCode !== 200) {
            throw new Error(`Jenkins ${res.statusCode}: ${res.body.slice(0, 300)}`);
        }
        return { jobName, queueUrl: res.headers.location || null, jobUrl: `${url}/job/${encodeURIComponent(jobName)}/` };
    }

    // =======================================================================
    // Job queue — a worker-pool over Jenkins' own job set, not one shared job.
    // Each queued item names a *category* (OFFLINE/ONLINE/E2E); at dispatch time
    // the pump picks whichever job in that category's pool is actually idle on
    // Jenkins right now. Runs server-side (not tied to a browser tab) so
    // dispatch keeps happening even if the dashboard isn't open.
    // =======================================================================

    const TCD_HISTORY_MAX = 200;
    const TCD_PUMP_INTERVAL_MS = 10000; // safety-net repoll

    let tcdJobQueue = [];
    let tcdRunningJobs = [];
    let tcdJobHistory = [];
    let tcdPumpInFlight = false;

    (function tcdLoadHistoryOnBoot() {
        try {
            tcdJobHistory = JSON.parse(fs.readFileSync(TCD_HISTORY_PATH, 'utf8'));
        } catch (e) {
            tcdJobHistory = [];
        }
        let changed = false;
        tcdJobHistory.forEach((h) => {
            if (!h.id) { h.id = `${h.completedAt || Date.now()}-${Math.random().toString(36).slice(2, 8)}`; changed = true; }
        });
        if (changed) tcdSaveHistory();
    })();

    function tcdSaveQueueState() {
        try {
            writeJsonAtomic(TCD_QUEUE_STATE_PATH, { queue: tcdJobQueue, running: tcdRunningJobs });
        } catch (e) {
            console.error('[testcases] failed to save queue state:', e.message);
        }
    }

    function tcdSaveHistory() {
        try {
            writeJsonAtomic(TCD_HISTORY_PATH, tcdJobHistory.slice(0, TCD_HISTORY_MAX));
        } catch (e) {
            console.error('[testcases] failed to save history:', e.message);
        }
    }

    function tcdSleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    // Jenkins' buildWithParameters only hands back a *queue* item — the real
    // build number doesn't exist until Jenkins schedules an executor for it.
    // A poll failure just costs a retry slot instead of ending the whole thing.
    async function tcdPollQueueItem(queueUrl, jenkinsAuth) {
        let misses = 0;
        for (let i = 0; i < 60; i++) { // up to ~3 minutes of real (non-error) attempts
            try {
                const res = await tcdHttpRequest(`${queueUrl}api/json`, { headers: { Authorization: `Basic ${jenkinsAuth}` }, timeoutMs: 30000 });
                if (res.statusCode === 200) {
                    const json = JSON.parse(res.body);
                    if (json.cancelled) throw new Error('Build was cancelled while queued');
                    if (json.executable) return json.executable; // { number, url }
                }
            } catch (e) {
                if (e.message === 'Build was cancelled while queued') throw e;
                misses++;
                console.error(`[testcases] pollQueueItem transient failure (${misses}): ${e.message}`);
                if (misses >= 20) throw new Error(`Gave up waiting for an executor after ${misses} failed polls: ${e.message}`);
            }
            await tcdSleep(3000);
        }
        throw new Error('Timed out waiting for Jenkins to start the build (still queued after 3 minutes)');
    }

    async function tcdPollBuildUntilDone(buildUrl, jenkinsAuth) {
        let misses = 0;
        for (let i = 0; i < 900; i++) { // up to ~2 hours of real (non-error) attempts
            try {
                const res = await tcdHttpRequest(`${buildUrl}api/json`, { headers: { Authorization: `Basic ${jenkinsAuth}` }, timeoutMs: 30000 });
                if (res.statusCode === 200) {
                    const json = JSON.parse(res.body);
                    if (!json.building) return { result: json.result, duration: json.duration };
                    misses = 0; // a good response resets the transient-failure counter
                }
            } catch (e) {
                misses++;
                console.error(`[testcases] pollBuildUntilDone transient failure (${misses}): ${e.message}`);
                if (misses >= 30) throw new Error(`Gave up polling the build after ${misses} consecutive failed requests: ${e.message}`);
            }
            await tcdSleep(8000);
        }
        throw new Error('Timed out waiting for the build to finish (still running after 2 hours)');
    }

    async function tcdJenkinsGetJsonWithRetry(url, jenkinsAuth, attempts = 4) {
        for (let i = 1; i <= attempts; i++) {
            try {
                const res = await tcdHttpRequest(url, { headers: { Authorization: `Basic ${jenkinsAuth}` }, timeoutMs: 30000 });
                if (res.statusCode === 200) return JSON.parse(res.body);
                throw new Error(`Jenkins ${res.statusCode}`);
            } catch (e) {
                if (i === attempts) throw e;
                await tcdSleep(3000 * i);
            }
        }
    }

    // Cypress screenshot filenames carry the full spec title verbatim — brackets,
    // parens, spaces — which Jenkins' server rejects outright if passed through
    // unencoded. Each path segment needs its own encodeURIComponent pass.
    function tcdEncodeArtifactPath(relativePath) {
        return relativePath.split('/').map(encodeURIComponent).join('/');
    }

    // Jenkins' artifacts tree API exposes no timestamp, but ArtifactArchiver
    // preserves each file's original workspace mtime as the Last-Modified
    // header — a cheap HEAD request per file recovers it.
    async function tcdGetArtifactTime(url, jenkinsAuth) {
        try {
            const res = await tcdHttpRequest(url, { method: 'HEAD', headers: { Authorization: `Basic ${jenkinsAuth}` }, timeoutMs: 15000 });
            const lastModified = res.headers['last-modified'];
            return lastModified ? new Date(lastModified).getTime() : null;
        } catch (e) {
            return null;
        }
    }

    async function tcdGetBuildArtifacts(buildUrl, jenkinsAuth) {
        try {
            const json = await tcdJenkinsGetJsonWithRetry(`${buildUrl}api/json?tree=artifacts[fileName,relativePath]`, jenkinsAuth);
            const artifacts = (json.artifacts || []).map((a) => ({ name: a.fileName, url: `${buildUrl}artifact/${tcdEncodeArtifactPath(a.relativePath)}` }));
            const times = await Promise.all(artifacts.map((a) => tcdGetArtifactTime(a.url, jenkinsAuth)));
            artifacts.forEach((a, i) => { a.time = times[i]; });
            return artifacts;
        } catch (e) {
            console.error(`[testcases] getBuildArtifacts failed after retries: ${e.message}`);
            return [];
        }
    }

    async function tcdJenkinsGetTextWithRetry(url, jenkinsAuth, attempts = 4) {
        for (let i = 1; i <= attempts; i++) {
            try {
                const res = await tcdHttpRequest(url, { headers: { Authorization: `Basic ${jenkinsAuth}` }, timeoutMs: 30000 });
                if (res.statusCode === 200) return res.body;
                throw new Error(`Jenkins ${res.statusCode}`);
            } catch (e) {
                if (i === attempts) throw e;
                await tcdSleep(3000 * i);
            }
        }
    }

    // The CSV ends with an "=== EXECUTION SUMMARY ===" block of quoted
    // "Label","Value" rows — parsed with a small regex per label since this
    // one section's shape is fixed.
    function tcdParseCsvSummary(text) {
        const field = (label) => {
            const m = text.match(new RegExp(`"${label.replace(/\//g, '\\/')}"\\s*,\\s*"([^"]*)"`));
            return m ? m[1] : null;
        };
        const toNum = (v) => (v == null ? 0 : parseInt(v, 10) || 0);
        const tests = field('Total Tests');
        if (tests === null) return null; // no summary block found — not our CSV shape
        return {
            tests: toNum(tests),
            passes: toNum(field('Passed')),
            failures: toNum(field('Failed')),
            pending: toNum(field('Skipped/Pending')),
            duration: null,
        };
    }

    // Pass/fail counts come from whichever report the job actually archived.
    // master-report.json (mochawesome) is preferred; test-results.csv's own
    // "EXECUTION SUMMARY" footer is the fallback source.
    async function tcdGetTestStats(artifacts, jenkinsAuth) {
        const reportArtifact = artifacts.find((a) => a.name === 'master-report.json');
        if (reportArtifact) {
            try {
                const json = await tcdJenkinsGetJsonWithRetry(reportArtifact.url, jenkinsAuth);
                const stats = json.stats || {};
                return {
                    tests: stats.tests || 0,
                    passes: stats.passes || 0,
                    failures: stats.failures || 0,
                    pending: stats.pending || 0,
                    duration: stats.duration || 0,
                };
            } catch (e) {
                console.error(`[testcases] getTestStats (master-report.json) failed after retries: ${e.message}`);
            }
        }

        const csvArtifact = artifacts.find((a) => a.name === 'test-results.csv');
        if (csvArtifact) {
            try {
                const text = await tcdJenkinsGetTextWithRetry(csvArtifact.url, jenkinsAuth);
                return tcdParseCsvSummary(text);
            } catch (e) {
                console.error(`[testcases] getTestStats (test-results.csv) failed after retries: ${e.message}`);
            }
        }

        return null;
    }

    // True if this Jenkins job has no build currently running. A job with no
    // prior builds (404 on lastBuild) counts as free.
    async function tcdIsJobFree(jobName) {
        const { url, auth } = tcdLoadJenkinsConfig();
        try {
            const res = await tcdHttpRequest(`${url}/job/${encodeURIComponent(jobName)}/lastBuild/api/json?tree=building`, {
                headers: { Authorization: `Basic ${auth}` },
            });
            if (res.statusCode === 404) return true;
            if (res.statusCode !== 200) return false; // unknown state — don't risk double-booking
            const json = JSON.parse(res.body);
            return !json.building;
        } catch (e) {
            return false;
        }
    }

    // Shared by both the "stop a build" and "cancel a queued item" cancel paths
    // below — Jenkins' crumb-issuer requirement applies to any POST, not just
    // buildWithParameters.
    async function tcdJenkinsAuthHeaders() {
        const { auth } = tcdLoadJenkinsConfig();
        const headers = { Authorization: `Basic ${auth}` };
        const crumb = await tcdGetJenkinsCrumb();
        if (crumb) headers[crumb.field] = crumb.value;
        return headers;
    }

    async function tcdStopBuildOnJenkins(buildUrl) {
        const headers = await tcdJenkinsAuthHeaders();
        await tcdHttpRequest(`${buildUrl}stop`, { method: 'POST', headers, timeoutMs: 15000 });
    }

    async function tcdCancelQueueItemOnJenkins(queueUrl) {
        const { url } = tcdLoadJenkinsConfig();
        const headers = await tcdJenkinsAuthHeaders();
        const m = String(queueUrl).match(/\/queue\/item\/(\d+)/);
        if (!m) return;
        await tcdHttpRequest(`${url}/queue/cancelItem?id=${m[1]}`, { method: 'POST', headers, timeoutMs: 15000 });
    }

    // Cancels a job that's already in `tcdRunningJobs` (still waiting for an
    // executor, or actually building). Doesn't finalize it itself — that stays
    // the job of tcdRunToCompletion's normal polling loop, which will notice
    // the cancellation (Jenkins marks a stopped build's result 'ABORTED', and a
    // cancelled queue item as `cancelled: true`) on its very next poll and
    // finish exactly like any other terminal build. `cancelRequested` covers
    // the brief window before a queueUrl even exists yet (mid buildWithParameters
    // call) — tcdRunToCompletion checks it the moment one arrives.
    async function tcdCancelRunningJob(id) {
        const running = tcdRunningJobs.find((r) => r.id === id);
        if (!running) return { ok: false, error: 'Job not found (it may have already finished)' };

        running.cancelRequested = true;
        try {
            if (running.buildUrl) await tcdStopBuildOnJenkins(running.buildUrl);
            else if (running.queueUrl) await tcdCancelQueueItemOnJenkins(running.queueUrl);
        } catch (e) {
            // Jenkins may already 404 here if the build/queue item is already
            // gone — the polling loop below still notices and finalizes it.
        }
        return { ok: true };
    }

    // Carries a `running` record through to completion from wherever it's
    // currently at — used both for a freshly-dispatched item and for one being
    // resumed after a server restart.
    async function tcdRunToCompletion(running) {
        const { auth } = tcdLoadJenkinsConfig();

        try {
            if (!running.buildUrl) {
                if (!running.queueUrl) {
                    const triggered = await tcdTriggerJenkinsJob(running.jobName, {
                        SPEC_PATH: running.path,
                        ENVIRONMENT: running.environment,
                        RUN_ID: running.runId || '',
                        GREP_TAGS: tcdGrepTagsFor(running.cases, running.path),
                    });
                    running.jobUrl = triggered.jobUrl;
                    running.queueUrl = triggered.queueUrl;
                    running.status = 'queued-on-jenkins';
                    tcdSaveQueueState();
                    if (!running.queueUrl) throw new Error('Jenkins did not return a queue location — cannot track this build');
                    // Cancel arrived while buildWithParameters was still in flight —
                    // honor it now that there's finally a queue item to cancel.
                    if (running.cancelRequested) await tcdCancelQueueItemOnJenkins(running.queueUrl).catch(() => {});
                }
                const executable = await tcdPollQueueItem(running.queueUrl, auth);
                running.buildNumber = executable.number;
                running.buildUrl = executable.url;
                running.status = 'building';
                tcdSaveQueueState();
            }

            const { result, duration } = await tcdPollBuildUntilDone(running.buildUrl, auth);
            running.status = result || 'UNKNOWN';
            running.duration = duration;
            running.artifacts = await tcdGetBuildArtifacts(running.buildUrl, auth);
            running.testStats = await tcdGetTestStats(running.artifacts, auth);
        } catch (err) {
            // A user-initiated cancel while still queued surfaces here as
            // tcdPollQueueItem's "cancelled while queued" throw — report it as
            // ABORTED (same terminal bucket Jenkins itself uses for a stopped
            // build) rather than a generic ERROR.
            running.status = running.cancelRequested ? 'ABORTED' : 'ERROR';
            running.error = err.message;
        }

        running.completedAt = Date.now();
        tcdJobHistory.unshift(running);
        tcdSaveHistory();
        tcdRunningJobs = tcdRunningJobs.filter((r) => r !== running);
        tcdSaveQueueState();
        tcdNotifyBuildResult(running); // fire-and-forget — never let a Telegram hiccup affect queue processing
        tcdPumpQueue(); // a slot just freed up — see if anything queued can use it
    }

    // Fire-and-forget: sends a Telegram alert for a build that just finished,
    // gated independently by TELEGRAM_NOTIFY_ON_FAILURE / TELEGRAM_NOTIFY_ON_SUCCESS.
    // Which artifact types ride along is the user's call too — every screenshot
    // (TELEGRAM_ATTACH_SCREENSHOTS) and CSV report (TELEGRAM_ATTACH_CSV) get
    // attached when their toggle is on and the build produced any (default true
    // for both, so existing setups keep today's behavior until explicitly
    // turned off). Falls back to plain text if there's nothing to attach, or if
    // the attachment upload fails for any reason. Swallows its own errors since
    // a notification failure must never affect the job queue itself.
    function tcdNotifyBuildResult(running) {
        const status = String(running.status || '').toUpperCase();
        const isFailure = ['FAILURE', 'ERROR', 'ABORTED'].includes(status);
        const isSuccess = status === 'SUCCESS';
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
            `${isSuccess ? '🟢' : '🔴'} Build ${running.status}`,
            running.path,
            `Job: ${running.jobName || '?'}${running.buildNumber ? ` #${running.buildNumber}` : ''}${running.runId ? ` | TestRail #${running.runId}` : ''}`,
        ];
        if (running.testStats) lines.push(`${running.testStats.passes} passed, ${running.testStats.failures} failed`);
        if (running.error) lines.push(`Error: ${running.error}`);
        if (running.buildUrl) lines.push(running.buildUrl);
        const text = lines.join('\n');

        const artifacts = running.artifacts || [];
        const attachScreenshots = cfg.TELEGRAM_ATTACH_SCREENSHOTS !== false; // default on
        const attachCsv = cfg.TELEGRAM_ATTACH_CSV !== false; // default on

        const attachments = [];
        if (attachScreenshots) {
            artifacts.filter((a) => /\.(png|jpe?g|gif|webp)$/i.test(a.name))
                .forEach((a) => attachments.push({ type: 'photo', url: a.url, filename: a.name }));
        }
        if (attachCsv) {
            artifacts.filter((a) => /\.csv$/i.test(a.name))
                .forEach((a) => attachments.push({ type: 'document', url: a.url, filename: a.name }));
        }

        if (attachments.length > 0) {
            tcdSendTelegramAttachments(attachments, text, cfg).catch((err) => {
                console.error('[testcases] Telegram attachment notify failed, falling back to text:', err.message);
                tcdSendTelegramMessage(text, cfg).catch((err2) => {
                    console.error('[testcases] Telegram text fallback also failed:', err2.message);
                });
            });
        } else {
            tcdSendTelegramMessage(text, cfg).catch((err) => {
                console.error('[testcases] Telegram build notify failed:', err.message);
            });
        }
    }

    async function tcdDispatchJob(item, jobName) {
        // Reuse the queued item's own id (assigned in tcdEnqueueJobs) so a
        // client can hold onto one id across the whole queued → running →
        // history lifecycle — needed to cancel a job that gets dispatched out
        // from under it. Falls back to a fresh id for any pre-existing queue
        // item that predates this (e.g. one resumed from an older queue-state.json).
        const id = item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const running = { ...item, id, jobName, status: 'triggering', startedAt: Date.now() };
        tcdRunningJobs.push(running);
        tcdSaveQueueState();
        await tcdRunToCompletion(running);
    }

    // Called once at startup. Anything still in `running` when the process last
    // exited was mid-build (or mid-trigger) and gets its polling resumed from
    // exactly where it left off; anything still in `queue` just goes back
    // through the normal pump.
    function tcdResumeInFlightState() {
        try {
            const saved = JSON.parse(fs.readFileSync(TCD_QUEUE_STATE_PATH, 'utf8'));
            tcdJobQueue = saved.queue || [];
            // Backfill an id onto any queue entry saved before cancel support
            // existed — same pattern as tcdLoadHistoryOnBoot's id backfill —
            // so every queued item is cancellable, not just newly-enqueued ones.
            let idsAdded = false;
            tcdJobQueue.forEach((q) => {
                if (!q.id) { q.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; idsAdded = true; }
            });
            const savedRunning = saved.running || [];
            savedRunning.forEach((running) => {
                tcdRunningJobs.push(running);
                console.log(`[testcases] resuming tracking for ${running.path} (${running.jobName}, status was ${running.status})`);
                tcdRunToCompletion(running);
            });
            if (idsAdded) tcdSaveQueueState();
            if (tcdJobQueue.length || savedRunning.length) tcdPumpQueue();
        } catch (e) {
            tcdJobQueue = [];
        }
    }

    // Scans the queue in order and dispatches every item whose category pool has
    // a job that's genuinely idle on Jenkins right now. Re-scans from the start
    // after each dispatch since the busy-set changed.
    async function tcdPumpQueue() {
        if (tcdPumpInFlight) return;
        tcdPumpInFlight = true;
        try {
            let progressed = true;
            while (progressed && tcdJobQueue.length > 0) {
                progressed = false;
                const { jobs } = tcdLoadJenkinsConfig();
                const busy = new Set(tcdRunningJobs.map((r) => r.jobName));
                for (let i = 0; i < tcdJobQueue.length; i++) {
                    const item = tcdJobQueue[i];
                    const pool = item.pinnedJob ? [item.pinnedJob] : (jobs[item.category] || []);
                    const candidates = pool.filter((j) => !busy.has(j));
                    if (candidates.length === 0) continue;

                    let freeJob = null;
                    for (const cand of candidates) {
                        if (await tcdIsJobFree(cand)) { freeJob = cand; break; }
                    }
                    if (!freeJob) continue;

                    tcdJobQueue.splice(i, 1);
                    busy.add(freeJob);
                    tcdDispatchJob(item, freeJob); // not awaited — runs concurrently, calls tcdPumpQueue() again on completion
                    progressed = true;
                    break; // queue mutated — restart the scan
                }
            }
        } finally {
            tcdPumpInFlight = false;
        }
    }

    function tcdEnqueueJobs(items) {
        const now = Date.now();
        items.forEach((item) => tcdJobQueue.push({
            ...item, queuedAt: now, id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        }));
        tcdSaveQueueState();
        tcdPumpQueue();
    }

    setInterval(tcdPumpQueue, TCD_PUMP_INTERVAL_MS);

    const TCD_DEFAULT_STATUSES = {
        1: 'Passed', 2: 'Blocked', 3: 'Untested', 4: 'Retest', 5: 'Failed',
    };
    let tcdStatusNameCache = null;

    async function tcdGetStatusNames() {
        if (tcdStatusNameCache) return tcdStatusNameCache;
        try {
            const list = await tcdTrGet('/index.php?/api/v2/get_statuses');
            const map = {};
            (Array.isArray(list) ? list : []).forEach((s) => { map[s.id] = s.label || s.name; });
            tcdStatusNameCache = Object.keys(map).length ? map : TCD_DEFAULT_STATUSES;
        } catch (e) {
            tcdStatusNameCache = TCD_DEFAULT_STATUSES;
        }
        return tcdStatusNameCache;
    }

    const TCD_PAGE_SIZE = 250;
    const TCD_PAGE_CONCURRENCY = 5;

    async function tcdGetRunStatuses(runId) {
        const [statusNames, run] = await Promise.all([
            tcdGetStatusNames(),
            tcdTrGet(`/index.php?/api/v2/get_run/${runId}`).catch(() => null),
        ]);

        const statuses = {};
        function ingest(tests) {
            tests.forEach((t) => {
                statuses[String(t.case_id)] = {
                    status_id: t.status_id,
                    status: statusNames[t.status_id] || `Status ${t.status_id}`,
                };
            });
        }

        // get_run's own *_count fields sum to the run's total test count, letting
        // us fetch every offset concurrently instead of walking _links.next one
        // page at a time.
        const total = run
            ? Object.keys(run).filter((k) => k.endsWith('_count')).reduce((s, k) => s + (run[k] || 0), 0)
            : 0;

        if (total > 0) {
            const totalPages = Math.ceil(total / TCD_PAGE_SIZE);
            console.log(`[testcases] run ${runId}: ~${total} tests, ${totalPages} pages, concurrency ${TCD_PAGE_CONCURRENCY}`);
            let nextPage = 0;
            const worker = async () => {
                while (nextPage < totalPages) {
                    const p = nextPage++;
                    const offset = p * TCD_PAGE_SIZE;
                    const page = await tcdTrGet(`/index.php?/api/v2/get_tests/${runId}&limit=${TCD_PAGE_SIZE}&offset=${offset}`);
                    ingest(Array.isArray(page) ? page : (page.tests || []));
                }
            };
            await Promise.all(Array.from({ length: Math.min(TCD_PAGE_CONCURRENCY, totalPages) }, worker));
        } else {
            // Fallback when get_run didn't return usable counts — walk
            // _links.next sequentially.
            let endpoint = `/index.php?/api/v2/get_tests/${runId}&limit=${TCD_PAGE_SIZE}`;
            while (endpoint) {
                const page = await tcdTrGet(endpoint);
                ingest(Array.isArray(page) ? page : (page.tests || []));
                const next = !Array.isArray(page) && page._links && page._links.next;
                endpoint = next ? '/index.php?' + next.replace(/^\/+/, '') : null;
            }
        }

        return {
            runId: Number(runId),
            runName: run ? run.name : null,
            completed: run ? !!run.is_completed : null,
            statuses,
            fetchedAt: new Date().toISOString(),
        };
    }

    // A page fetch can fail transiently — retried with backoff so a failure is
    // never silently mistaken for "no more pages".
    async function tcdFetchCasesPage(projectId, suiteId, offset, attempt) {
        attempt = attempt || 1;
        try {
            const p = await tcdTrGet(`/index.php?/api/v2/get_cases/${projectId}&suite_id=${suiteId}&limit=${TCD_PAGE_SIZE}&offset=${offset}`);
            return (p && p.cases) || [];
        } catch (e) {
            if (attempt >= 3) throw new Error(`get_cases offset=${offset} failed after 3 attempts: ${e.message}`);
            await tcdSleep(800 * attempt);
            return tcdFetchCasesPage(projectId, suiteId, offset, attempt + 1);
        }
    }

    // Fetches every case ID that actually exists in TestRail, so /api/testcases/data
    // can flag manifest case IDs that aren't real. If any page fails even after
    // retries, the whole fetch throws rather than returning a partial result —
    // tcdEnsureCaseIdsFresh() keeps the last known-good cache in that case.
    async function tcdFetchAllCaseIds() {
        const { projectId, suiteId } = tcdLoadTrConfig();
        if (!projectId || !suiteId) return new Set();

        const ids = new Set();
        let offset = 0;
        let done = false;
        while (!done) {
            const offsets = Array.from({ length: TCD_PAGE_CONCURRENCY }, (_, i) => offset + i * TCD_PAGE_SIZE);
            const pages = await Promise.all(offsets.map((o) => tcdFetchCasesPage(projectId, suiteId, o)));
            pages.forEach((p) => p.forEach((c) => ids.add(c.id)));
            if (pages.some((p) => p.length < TCD_PAGE_SIZE)) done = true;
            offset += TCD_PAGE_CONCURRENCY * TCD_PAGE_SIZE;
        }
        return ids;
    }

    const TCD_CASE_ID_TTL_MS = 10 * 60 * 1000;
    let tcdCaseIdCache = null;
    let tcdCaseIdCacheAt = 0;
    let tcdCaseIdFetchInFlight = null;

    // Fire-and-forget refresh: /api/testcases/data never blocks on this.
    function tcdEnsureCaseIdsFresh() {
        if (tcdCaseIdFetchInFlight) return;
        if (tcdCaseIdCache && Date.now() - tcdCaseIdCacheAt < TCD_CASE_ID_TTL_MS) return;
        tcdCaseIdFetchInFlight = tcdFetchAllCaseIds()
            .then((ids) => { tcdCaseIdCache = ids; tcdCaseIdCacheAt = Date.now(); })
            .catch((err) => { console.error('[testcases] case-id refresh failed:', err.message); })
            .finally(() => { tcdCaseIdFetchInFlight = null; });
    }

    // Turns a manifest bullet's text into the spec path it names, or null when
    // the bullet isn't a real file in the project: placeholders like
    // "*(pending)*" and "⚠️ NOT IN NEW STRUCTURE — old: ..." notes. Trailing
    // annotations after the path ("path.ts  ⚠️ partial: ...") are dropped.
    function tcdBulletPath(text) {
        const t = String(text || '').trim();
        if (!t || t.startsWith('*') || t.startsWith('⚠')) return null;
        const p = t.split(/\s+⚠/)[0].trim();
        return p || null;
    }

    function tcdParseManifest(md) {
        const lines = md.split('\n');
        const entries = []; // { cat, grp, relPath }
        let cat = null;
        let grp = null;
        for (const raw of lines) {
            const line = raw.trimEnd();
            if (/^## /.test(line)) {
                cat = line.replace(/^## /, '').trim();
                grp = null;
                continue;
            }
            if (/^### /.test(line)) {
                const m = line.match(/^###\s*\d+\.\s*(.+?)\s*\(\d+\)\s*$/);
                grp = m ? m[1].trim() : line.replace(/^### /, '').trim();
                continue;
            }
            const bullet = line.match(/^-\s+(.+)$/);
            if (bullet && cat && grp) {
                const relPath = tcdBulletPath(bullet[1]);
                if (!relPath) continue;
                entries.push({ cat, grp, relPath });
            }
        }
        return entries;
    }

    const TCD_CAT_HEADING = { OFFLINE: 'Offline', ONLINE: 'Online', E2E: 'E2E' };

    // Inserts a new file path into the manifest under the given category/group,
    // editing the raw markdown text directly so existing manual formatting —
    // numbering, "(N)" counts, section order — stays intact everywhere except
    // the one line/count that actually changed.
    function tcdAddFileToManifest(md, category, group, relPath) {
        const heading = TCD_CAT_HEADING[category];
        if (!heading) throw new Error(`Unknown category "${category}"`);
        group = group.trim();
        relPath = relPath.trim();
        if (!relPath) throw new Error('File path is required');

        const lines = md.split('\n');
        const catRe = new RegExp(`^##\\s+${heading}\\s*$`);
        let catStart = lines.findIndex((l) => catRe.test(l.trim()));
        if (catStart === -1) throw new Error(`Couldn't find "## ${heading}" section in the manifest`);

        let catEnd = lines.length;
        for (let i = catStart + 1; i < lines.length; i++) {
            if (/^##\s+/.test(lines[i].trim())) { catEnd = i; break; }
        }

        // Duplicate check across the whole category section.
        for (let i = catStart; i < catEnd; i++) {
            const bullet = lines[i].trim().match(/^-\s+(.+)$/);
            if (bullet && tcdBulletPath(bullet[1]) === relPath) {
                throw new Error(`"${relPath}" is already in the manifest under ${heading}`);
            }
        }

        // Lenient on purpose: some hand-edited headings have no trailing "(N)"
        // count at all — treating it as optional metadata to update-or-add
        // avoids colliding with those headings when picking the next free
        // group number.
        const groupHeadRe = /^###\s*(\d+)\.\s*(.+?)\s*$/;
        const countRe = /\s*\((\d+)\)\s*$/;
        let groupHeadingIdx = -1;
        let groupBulletsEnd = -1;
        let maxGroupNum = 0;

        for (let i = catStart + 1; i < catEnd; i++) {
            const m = lines[i].trim().match(groupHeadRe);
            if (!m) continue;
            maxGroupNum = Math.max(maxGroupNum, parseInt(m[1], 10));
            const nameOnly = m[2].replace(countRe, '').trim();
            if (nameOnly === group) {
                groupHeadingIdx = i;
                let j = i + 1;
                // A real bullet is "- " plus content; a bare "---" divider also
                // starts with "-" but has no space after it.
                while (j < catEnd && (/^-\s+\S/.test(lines[j].trim()) || lines[j].trim() === '')) {
                    if (/^-\s+\S/.test(lines[j].trim())) groupBulletsEnd = j;
                    j++;
                }
                if (groupBulletsEnd === -1) groupBulletsEnd = i; // heading with no bullets yet
            }
        }

        if (groupHeadingIdx !== -1) {
            // Existing group — bump its count (or add one if it never had it)
            // and append the new bullet after its last one.
            const bulletCount = lines.slice(groupHeadingIdx + 1, groupBulletsEnd + 1)
                .filter((l) => /^-\s+\S/.test(l.trim())).length;
            const m = lines[groupHeadingIdx].trim().match(groupHeadRe);
            const nameOnly = m[2].replace(countRe, '').trim();
            lines[groupHeadingIdx] = `### ${m[1]}. ${nameOnly} (${bulletCount + 1})`;
            lines.splice(groupBulletsEnd + 1, 0, `- ${relPath}`);
        } else {
            // New group — append it at the end of the category's section,
            // before the next "## " heading (or a trailing "---" divider
            // immediately before it).
            let insertAt = catEnd;
            while (insertAt > catStart + 1 && lines[insertAt - 1].trim() === '') insertAt--;
            if (insertAt > catStart + 1 && lines[insertAt - 1].trim() === '---') insertAt--;
            while (insertAt > catStart + 1 && lines[insertAt - 1].trim() === '') insertAt--;
            const block = ['', `### ${maxGroupNum + 1}. ${group} (1)`, `- ${relPath}`];
            lines.splice(insertAt, 0, ...block);
        }

        return lines.join('\n');
    }

    // Mirrors tcdAddFileToManifest's line-surgery approach in reverse — removes
    // the bullet for relPath from wherever it lives within the given category
    // (the caller doesn't need to know which group it's under), decrements that
    // group's "(N)" count, and removes the group heading entirely (plus the
    // blank-line gap it leaves behind) if that was its last file.
    function tcdRemoveFileFromManifest(md, category, relPath) {
        const heading = TCD_CAT_HEADING[category];
        if (!heading) throw new Error(`Unknown category "${category}"`);
        relPath = relPath.trim();
        if (!relPath) throw new Error('File path is required');

        const lines = md.split('\n');
        const catRe = new RegExp(`^##\\s+${heading}\\s*$`);
        const catStart = lines.findIndex((l) => catRe.test(l.trim()));
        if (catStart === -1) throw new Error(`Couldn't find "## ${heading}" section in the manifest`);

        let catEnd = lines.length;
        for (let i = catStart + 1; i < lines.length; i++) {
            if (/^##\s+/.test(lines[i].trim())) { catEnd = i; break; }
        }

        const groupHeadRe = /^###\s*(\d+)\.\s*(.+?)\s*$/;
        const countRe = /\s*\((\d+)\)\s*$/;

        // Find the bullet for relPath and which group heading owns it.
        let bulletIdx = -1;
        let groupHeadingIdx = -1;
        for (let i = catStart + 1; i < catEnd; i++) {
            const trimmed = lines[i].trim();
            if (groupHeadRe.test(trimmed)) { groupHeadingIdx = i; continue; }
            const bullet = trimmed.match(/^-\s+(.+)$/);
            if (bullet && tcdBulletPath(bullet[1]) === relPath) { bulletIdx = i; break; }
        }
        if (bulletIdx === -1) throw new Error(`"${relPath}" was not found under ${heading}`);

        lines.splice(bulletIdx, 1);

        // Re-scan the group's remaining bullets from scratch rather than reusing
        // any pre-splice indices/counts, since the splice above shifted every
        // line index after bulletIdx down by one.
        let remaining = 0;
        for (let i = groupHeadingIdx + 1; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (groupHeadRe.test(trimmed) || /^##\s+/.test(trimmed)) break;
            if (/^-\s+\S/.test(trimmed)) remaining++;
        }

        if (remaining === 0) {
            // Remove the now-empty heading itself, plus at most one blank line
            // immediately before it — mirroring the single leading blank
            // tcdAddFileToManifest inserts ahead of a new group's heading.
            // Deliberately does NOT touch anything after the heading: that
            // could be original spacing belonging to whatever follows (the
            // next group, or the next "## " category) rather than anything
            // this group owns, and swallowing it would corrupt formatting
            // that had nothing to do with the file being removed.
            let removeStart = groupHeadingIdx;
            if (removeStart > catStart + 1 && lines[removeStart - 1].trim() === '') removeStart--;
            lines.splice(removeStart, groupHeadingIdx - removeStart + 1);
        } else {
            const m = lines[groupHeadingIdx].trim().match(groupHeadRe);
            const nameOnly = m[2].replace(countRe, '').trim();
            lines[groupHeadingIdx] = `### ${m[1]}. ${nameOnly} (${remaining})`;
        }

        return lines.join('\n');
    }

    const TCD_IT_RE = /it\(\s*(['"`])((?:(?!\1).)*)\1/gs;
    const TCD_LEADING_ID_RE = /^\s*(C\d{5,})\s*/;
    // Some clubbed titles separate their leading IDs with "|"; others use a
    // bare space. The "|" is optional here so both are recognized.
    const TCD_NEXT_ID_RE = /^\s*\|?\s*(C\d{5,})\s*/;

    // Cypress intercept URL patterns like '*/devices**' contain a literal "/*"
    // or "*/" — a naive comment scan misreads those as real comment delimiters.
    // Tokenizing block/line comments and string literals together (in source
    // order) makes the scanner skip over a whole string atomically.
    const TCD_TOKEN_RE = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g;

    function tcdFindCommentSpans(content) {
        const spans = [];
        let m;
        TCD_TOKEN_RE.lastIndex = 0;
        while ((m = TCD_TOKEN_RE.exec(content)) !== null) {
            if (m[0].startsWith('/*') || m[0].startsWith('//')) {
                spans.push([m.index, m.index + m[0].length]);
            }
        }
        return spans;
    }

    function tcdIsCommented(idx, commentSpans) {
        return commentSpans.some(([s, e]) => idx >= s && idx < e);
    }

    function tcdExtractFromFile(content) {
        const rows = [];
        const commentSpans = tcdFindCommentSpans(content);
        let m;
        TCD_IT_RE.lastIndex = 0;
        while ((m = TCD_IT_RE.exec(content)) !== null) {
            const title = m[2];
            const commented = tcdIsCommented(m.index, commentSpans);
            const ids = [];
            let rest = title;
            const first = rest.match(TCD_LEADING_ID_RE);
            if (!first) continue;
            ids.push(first[1]);
            rest = rest.slice(first[0].length);
            let pm;
            while ((pm = rest.match(TCD_NEXT_ID_RE)) !== null) {
                ids.push(pm[1]);
                rest = rest.slice(pm[0].length);
            }
            rest = rest.trim();

            if (ids.length === 1) {
                rows.push({ id: ids[0], title: rest, club: '', commented });
                continue;
            }
            const segments = rest.split('|').map((s) => s.trim());
            const clubLabel = ids.join(' | ');
            if (segments.length === ids.length) {
                ids.forEach((id, i) => rows.push({ id, title: segments[i], club: clubLabel, commented }));
            } else {
                ids.forEach((id) => rows.push({ id, title: rest, club: clubLabel, commented }));
            }
        }
        return rows;
    }

    // relPath -> { mtimeMs, size, rows } — /api/testcases/data is polled every
    // 60s by TestCaseDashboard.jsx, and re-reading + re-parsing every manifest
    // file's full contents on every single poll (even when nothing changed)
    // blocks Node's single event loop long enough to delay other concurrent
    // requests on a large manifest. Skip the read+parse for any file whose
    // mtime/size haven't moved since the last build.
    const tcdFileParseCache = new Map();

    // ── Case manifest (case mode) ───────────────────────────────────────────
    // { version, updatedAt, cases: { C123: { grp, source, addedAt, note?, paths? } } }
    // `paths` optionally pins a case to specific specs when it appears in more
    // than one (e.g. a cloud spec and an e2e_device copy).
    function tcdLoadCaseManifest() {
        const raw = JSON.parse(fs.readFileSync(TCD_CASE_MANIFEST_PATH, 'utf8'));
        if (!raw.cases || typeof raw.cases !== 'object') raw.cases = {};
        return raw;
    }
    function tcdSaveCaseManifest(m) {
        m.updatedAt = new Date().toISOString();
        m.cases = Object.fromEntries(Object.entries(m.cases).sort(([a], [b]) => a.localeCompare(b)));
        writeFileAtomic(TCD_CASE_MANIFEST_PATH, JSON.stringify(m, null, 1) + '\n');
    }

    // Every spec under cypress/e2e, parsed once and re-read only when its
    // mtime/size moves. relPath -> { mtimeMs, size, rows, cat }
    const TCD_SPEC_ROOT = 'cypress/e2e';
    const tcdRepoParseCache = new Map();
    function tcdListSpecFiles(dirRel, out) {
        let entries;
        try { entries = fs.readdirSync(path.join(TCD_E2E_ROOT, dirRel), { withFileTypes: true }); } catch (e) { return out; }
        for (const e of entries) {
            const rel = `${dirRel}/${e.name}`;
            if (e.isDirectory()) tcdListSpecFiles(rel, out);
            else if (/\.(ts|js)$/.test(e.name)) out.push(rel);
        }
        return out;
    }
    // Which Jenkins job family a spec belongs to: offline*.ts → Offline;
    // device specs (e2e_device tree, or anything shelling out to robot) → E2E.
    function tcdCatForSpec(relPath, content) {
        if (/^offline/i.test(path.basename(relPath))) return 'Offline';
        if (relPath.includes('/e2e_device/') || /cy\.exec\([\s\S]{0,200}?robot\s/.test(content) || /['"`]robot\s/.test(content)) return 'E2E';
        return 'Online';
    }
    // caseId -> [{ path, cat, title, club, commented }] across the whole tree.
    function tcdBuildRepoIndex() {
        const files = tcdListSpecFiles(TCD_SPEC_ROOT, []);
        const seen = new Set(files);
        const index = new Map();
        for (const rel of files) {
            let stat;
            try { stat = fs.statSync(path.join(TCD_E2E_ROOT, rel)); } catch (e) { continue; }
            let cached = tcdRepoParseCache.get(rel);
            if (!cached || cached.mtimeMs !== stat.mtimeMs || cached.size !== stat.size) {
                const content = fs.readFileSync(path.join(TCD_E2E_ROOT, rel), 'utf8');
                cached = { mtimeMs: stat.mtimeMs, size: stat.size, rows: tcdExtractFromFile(content), cat: tcdCatForSpec(rel, content) };
                tcdRepoParseCache.set(rel, cached);
            }
            for (const r of cached.rows) {
                if (!index.has(r.id)) index.set(r.id, []);
                index.get(r.id).push({ path: rel, cat: cached.cat, title: r.title, club: r.club, commented: r.commented });
            }
        }
        for (const key of tcdRepoParseCache.keys()) if (!seen.has(key)) tcdRepoParseCache.delete(key);
        return index;
    }

    // Our case IDs in one spec (live, uncommented) — what a run of that spec
    // should be narrowed to with grepTags.
    // caseId -> every location (after pins), from the last case-mode build.
    let tcdLastCaseLocations = new Map();
    function tcdCaseLocations() {
        if (TCD_CASE_MODE) { try { tcdBuildData(); } catch (e) { /* keep last */ } }
        return tcdLastCaseLocations;
    }
    function tcdOwnedCasesForPath(relPath) {
        if (!TCD_CASE_MODE) return null;
        const ids = [];
        for (const [id, locs] of tcdCaseLocations()) {
            if (locs.some((l) => l.path === relPath && !l.commented)) ids.push(id);
        }
        return ids;
    }
    // Tags that keep a spec's setup/precondition it() blocks alive under a
    // filter: always @setup, plus any setup-like tag those blocks actually use
    // (a tier tag like @regression would select every case, so it's skipped).
    const TCD_SETUP_TAG_RE = /setup|pre-?cond|login|reset|clean|teardown|init/i;
    function tcdSetupTagsForSpec(relPath) {
        const tags = new Set(['@setup']);
        const untagged = [];
        if (!relPath) return { tags: [...tags], untagged };
        let content;
        try { content = fs.readFileSync(path.join(TCD_E2E_ROOT, relPath), 'utf8'); } catch (e) { return { tags: [...tags], untagged }; }
        const commentSpans = tcdFindCommentSpans(content);
        const re = /\bit\s*\(\s*(['"`])((?:(?!\1).)*)\1\s*,([\s\S]{0,400}?)(?:\(\)\s*=>|function\s*\()/g;
        let m;
        while ((m = re.exec(content)) !== null) {
            if (tcdIsCommented(m.index, commentSpans) || TCD_LEADING_ID_RE.test(m[2])) continue;
            const found = (m[3].match(/['"`]@[\w-]+['"`]/g) || []).map((t) => t.slice(1, -1));
            const setupLike = found.filter((t) => TCD_SETUP_TAG_RE.test(t));
            setupLike.forEach((t) => tags.add(t));
            if (!setupLike.length) untagged.push({ title: m[2].slice(0, 80) || '(empty title)', line: content.slice(0, m.index).split('\n').length });
        }
        return { tags: [...tags], untagged };
    }
    // Every it() in a spec with its tags — what a grepTags filter will select.
    function tcdSpecItBlocks(relPath) {
        let content;
        try { content = fs.readFileSync(path.join(TCD_E2E_ROOT, relPath), 'utf8'); } catch (e) { return null; }
        const commentSpans = tcdFindCommentSpans(content);
        const re = /\bit(?:\.only|\.skip)?\s*\(\s*(['"`])((?:(?!\1).)*)\1\s*,([\s\S]{0,400}?)(?:\(\)\s*=>|function\s*\()/g;
        const out = [];
        let m;
        while ((m = re.exec(content)) !== null) {
            out.push({
                title: m[2],
                tags: (m[3].match(/['"`]@[\w-]+['"`]/g) || []).map((t) => t.slice(1, -1)),
                commented: tcdIsCommented(m.index, commentSpans),
                ids: m[2].match(/C\d{5,}/g) || [],
            });
        }
        return out;
    }

    // Owned cases plus any `deps` the manifest lists for them (cases that must
    // run first for this one to pass).
    function tcdExpandDeps(caseIds) {
        if (!TCD_CASE_MODE) return caseIds;
        let manifest;
        try { manifest = tcdLoadCaseManifest(); } catch (e) { return caseIds; }
        const out = new Set(caseIds);
        caseIds.forEach((id) => ((manifest.cases[id] || {}).deps || []).forEach((d) => out.add(d)));
        return [...out];
    }
    // "@C1 @C2 @setup" for one spec run.
    function tcdGrepTagsFor(caseIds, relPath) {
        if (!Array.isArray(caseIds) || caseIds.length === 0) return '';
        const ids = tcdExpandDeps(caseIds.map((c) => String(c).replace(/^@/, '')));
        return [...new Set([...ids.map((c) => `@${c}`), ...tcdSetupTagsForSpec(relPath).tags])].join(' ');
    }

    function tcdBuildCaseData() {
        const manifest = tcdLoadCaseManifest();
        const index = tcdBuildRepoIndex();
        const rows = [];
        const unresolvedCases = [];
        const multiSpecCases = [];
        const locations = new Map();
        const fileSet = {};
        const catCounts = {};
        const seenPaths = new Set();

        const retiredCases = [];
        for (const [id, entry] of Object.entries(manifest.cases)) {
            // Retired = removed from the codebase on purpose; kept in the manifest
            // for the record but not shown, run, tracked or counted.
            if (entry.retired) { retiredCases.push({ id, grp: entry.grp || '', retired: entry.retired }); continue; }
            let locs = index.get(id) || [];
            if (Array.isArray(entry.paths) && entry.paths.length) locs = locs.filter((l) => entry.paths.includes(l.path));
            if (locs.length === 0) {
                unresolvedCases.push({ id, grp: entry.grp || '', source: entry.source || '', pinned: entry.paths || null });
                continue;
            }
            const live = locs.filter((l) => !l.commented);
            const livePaths = [...new Set(live.map((l) => l.path))];
            if (livePaths.length > 1) multiSpecCases.push({ id, paths: livePaths });
            locations.set(id, locs);
            // One row per case so every count is a count of test IDs: its live
            // copy (commented only when every copy is). Other live specs ride
            // along in otherPaths and still run the case (tcdOwnedCasesForPath).
            const l = live[0] || locs[0];
            const grp = entry.grp || 'Ungrouped';
            rows.push({ cat: l.cat, grp, path: l.path, id, title: l.title, club: l.club, commented: l.commented, otherPaths: livePaths.filter((p) => p !== l.path) });
            seenPaths.add(l.path);
            fileSet[l.cat] = fileSet[l.cat] || new Set();
            fileSet[l.cat].add(l.path);
            catCounts[l.cat] = (catCounts[l.cat] || 0) + 1;
        }
        tcdLastCaseLocations = locations;

        // Specs that hold our cases next to other people's — a whole-spec run
        // there would also execute (and report) their cases.
        const sharedSpecs = [];
        for (const p of seenPaths) {
            const cached = tcdRepoParseCache.get(p);
            if (!cached) continue;
            const others = [...new Set(cached.rows.filter((r) => !manifest.cases[r.id] && !r.commented).map((r) => r.id))];
            if (others.length) sharedSpecs.push({ path: p, otherCases: others.length });
        }

        const fileCounts = {};
        for (const k of Object.keys(fileSet)) fileCounts[k] = fileSet[k].size;
        const totalFiles = Object.values(fileCounts).reduce((a, b) => a + b, 0);

        tcdEnsureCaseIdsFresh();
        let unknownIds = [];
        let caseIdCheck = { available: false, checkedAt: null, knownCount: 0 };
        if (tcdCaseIdCache) {
            const seen = new Set();
            Object.keys(manifest.cases).forEach((id) => {
                const numId = Number(id.replace(/^C/i, ''));
                if (tcdCaseIdCache.has(numId) || seen.has(numId)) return;
                seen.add(numId);
                const r = rows.find((x) => x.id === id);
                unknownIds.push({ id, title: r ? r.title : '', path: r ? r.path : '', cat: r ? r.cat : '' });
            });
            caseIdCheck = { available: true, checkedAt: new Date(tcdCaseIdCacheAt).toISOString(), knownCount: tcdCaseIdCache.size };
        }

        const caseTracking = tcdTrackCaseIds(rows, [], null);

        return {
            mode: 'cases',
            rows,
            missing: [],
            unresolvedCases,
            retiredCases,
            multiSpecCases,
            sharedSpecs,
            ownedCaseCount: Object.keys(manifest.cases).length - retiredCases.length,
            catCounts,
            fileCounts,
            totalCases: rows.length,
            totalFiles,
            unknownIds,
            caseIdCheck,
            manifestPath: TCD_CASE_MANIFEST_PATH,
            e2eRoot: TCD_E2E_ROOT,
            generatedAt: new Date().toISOString(),
            trackedCaseCount: caseTracking.trackedCount,
            missingCases: caseTracking.missingCases,
            trackingAlerts: tcdUnreviewedEvents().slice(0, 200),
        };
    }

    function tcdBuildData() {
        if (TCD_CASE_MODE) return tcdBuildCaseData();
        const md = fs.readFileSync(TCD_MANIFEST_PATH, 'utf8');
        const entries = tcdParseManifest(md);

        const rows = [];
        const missing = [];
        const fileSet = {};
        const catCounts = {};
        const seenPaths = new Set();

        for (const { cat, grp, relPath } of entries) {
            const fullPath = path.join(TCD_E2E_ROOT, relPath);
            seenPaths.add(relPath);

            let stat;
            try {
                stat = fs.statSync(fullPath);
            } catch (e) {
                stat = null;
            }
            if (!stat || !stat.isFile()) {
                missing.push({ cat, grp, path: relPath });
                tcdFileParseCache.delete(relPath);
                continue;
            }

            const cached = tcdFileParseCache.get(relPath);
            let fileRows;
            if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
                fileRows = cached.rows;
            } else {
                const content = fs.readFileSync(fullPath, 'utf8');
                fileRows = tcdExtractFromFile(content);
                tcdFileParseCache.set(relPath, { mtimeMs: stat.mtimeMs, size: stat.size, rows: fileRows });
            }

            fileSet[cat] = fileSet[cat] || new Set();
            fileSet[cat].add(relPath);
            for (const r of fileRows) {
                rows.push({ cat, grp, path: relPath, id: r.id, title: r.title, club: r.club, commented: r.commented });
                catCounts[cat] = (catCounts[cat] || 0) + 1;
            }
        }

        // Drop cache entries for files no longer referenced by the manifest
        // (removed/renamed) so this map doesn't grow unbounded over time.
        for (const key of tcdFileParseCache.keys()) {
            if (!seenPaths.has(key)) tcdFileParseCache.delete(key);
        }

        const fileCounts = {};
        for (const k of Object.keys(fileSet)) fileCounts[k] = fileSet[k].size;
        const totalFiles = Object.values(fileCounts).reduce((a, b) => a + b, 0);

        tcdEnsureCaseIdsFresh();
        let unknownIds = [];
        let caseIdCheck = { available: false, checkedAt: null, knownCount: 0 };
        if (tcdCaseIdCache) {
            const seen = new Set();
            rows.forEach((r) => {
                const numId = Number(String(r.id).replace(/^C/i, ''));
                if (tcdCaseIdCache.has(numId) || seen.has(numId)) return;
                seen.add(numId);
                unknownIds.push({ id: r.id, title: r.title, path: r.path, cat: r.cat });
            });
            caseIdCheck = { available: true, checkedAt: new Date(tcdCaseIdCacheAt).toISOString(), knownCount: tcdCaseIdCache.size };
        }

        const caseTracking = tcdTrackCaseIds(rows, missing, seenPaths);

        return {
            rows,
            missing,
            catCounts,
            fileCounts,
            totalCases: rows.length,
            totalFiles,
            unknownIds,
            caseIdCheck,
            manifestPath: TCD_MANIFEST_PATH,
            e2eRoot: TCD_E2E_ROOT,
            generatedAt: new Date().toISOString(),
            trackedCaseCount: caseTracking.trackedCount,
            missingCases: caseTracking.missingCases,
        };
    }

    app.get('/api/testcases/data', (req, res) => {
        try {
            res.set('Cache-Control', 'no-store');
            res.json(tcdBuildData());
        } catch (err) {
            res.status(500).json({ error: String(err && err.message || err) });
        }
    });

    app.post('/api/testcases/manifest/add-file', (req, res) => {
        const { category, group, path: relPath } = req.body;
        if (!category || !group || !relPath) {
            return res.status(400).json({ error: 'category, group, and path are all required' });
        }
        try {
            const md = fs.readFileSync(TCD_MANIFEST_PATH, 'utf8');
            const updated = tcdAddFileToManifest(md, category, group, relPath);
            writeFileAtomic(TCD_MANIFEST_PATH, updated);
            res.json({ added: relPath });
        } catch (err) {
            res.status(400).json({ error: String(err && err.message || err) });
        }
    });

    // Shared by both Cypress Runner and Jenkins Runner (Test Case Dashboard) —
    // both pages read/write this exact same manifest file, so a file removed
    // from one immediately disappears from the other's next /api/testcases/data
    // poll too.
    app.post('/api/testcases/manifest/remove-file', (req, res) => {
        const { category, path: relPath } = req.body;
        if (!category || !relPath) {
            return res.status(400).json({ error: 'category and path are both required' });
        }
        try {
            const md = fs.readFileSync(TCD_MANIFEST_PATH, 'utf8');
            const updated = tcdRemoveFileFromManifest(md, category, relPath);
            writeFileAtomic(TCD_MANIFEST_PATH, updated);
            tcdUntrackFile(relPath);
            res.json({ removed: relPath });
        } catch (err) {
            res.status(400).json({ error: String(err && err.message || err) });
        }
    });

    // "Remember test cases" history — every case id that ever went missing (or
    // came back) across the whole manifest, most recent first. Separate from
    // the main /api/testcases/data payload since it's an append-only log, not
    // current state.
    app.get('/api/testcases/case-tracking/history', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json({ history: tcdCaseTrackingHistory });
    });

    // Current tracking state split into the buckets the Cypress Runner's
    // Test ID tracker shows: missing, newly added (first seen after the
    // baseline scan) and restored (went missing, then came back).
    app.get('/api/testcases/case-tracking/summary', (req, res) => {
        res.set('Cache-Control', 'no-store');
        const tracking = tcdLoadCaseTracking();
        const all = Object.entries(tracking.cases).map(([caseId, v]) => ({ caseId, ...v }));
        const seededAt = tracking.seededAt || null;
        const byDesc = (key) => (a, b) => String(b[key] || '').localeCompare(String(a[key] || ''));
        res.json({
            seededAt,
            reviewedAt: tracking.reviewedAt || null,
            trackedCount: all.length,
            presentCount: all.filter((c) => c.status !== 'missing').length,
            missing: all.filter((c) => c.status === 'missing').sort(byDesc('missingSince')),
            added: seededAt ? all.filter((c) => c.status !== 'missing' && c.firstSeenAt > seededAt).sort(byDesc('firstSeenAt')) : [],
            restored: all.filter((c) => c.status !== 'missing' && c.restoredAt).sort(byDesc('restoredAt')),
        });
    });

    // Stops tracking missing case ids the user has confirmed were removed on
    // purpose, so they stop being flagged. They're re-tracked (as newly added)
    // if they ever show up in a manifest file again.
    app.post('/api/testcases/case-tracking/dismiss', (req, res) => {
        const caseIds = req.body && req.body.caseIds;
        if (!Array.isArray(caseIds) || caseIds.length === 0) return res.status(400).json({ error: 'caseIds must be a non-empty array' });
        const tracking = tcdLoadCaseTracking();
        const dismissed = [];
        for (const id of caseIds) {
            const c = tracking.cases[id];
            if (!c || c.status !== 'missing') continue;
            dismissed.push({ caseId: id, path: c.path, title: c.title });
            delete tracking.cases[id];
        }
        if (dismissed.length) {
            tcdSaveCaseTracking();
            dismissed.forEach((d) => tcdLogCaseHistory({ type: 'case_dismissed', ...d }));
        }
        res.json({ dismissed: dismissed.length });
    });

    app.post('/api/testcases/case-tracking/mark-reviewed', (req, res) => {
        const tracking = tcdLoadCaseTracking();
        tracking.reviewedAt = new Date().toISOString();
        tcdSaveCaseTracking();
        res.json({ reviewedAt: tracking.reviewedAt });
    });

    app.post('/api/testcases/case-tracking/clear-history', (req, res) => {
        tcdCaseTrackingHistory = [];
        tcdSaveCaseTrackingHistory();
        res.json({ cleared: true });
    });

    // ── Case manifest endpoints ─────────────────────────────────────────────
    function tcdRequireCaseMode(res) {
        if (TCD_CASE_MODE) return true;
        res.status(409).json({ error: `Case manifest not found at ${TCD_CASE_MANIFEST_PATH} (create it, then restart the server)` });
        return false;
    }
    function tcdParseCaseIds(input) {
        const text = Array.isArray(input) ? input.join(' ') : String(input || '');
        return [...new Set((text.match(/\bC?\d{6,9}\b/gi) || []).map((s) => 'C' + s.replace(/^C/i, '')))];
    }

    app.get('/api/testcases/case-manifest', (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!tcdRequireCaseMode(res)) return;
        try {
            const manifest = tcdLoadCaseManifest();
            const index = tcdBuildRepoIndex();
            const cases = Object.entries(manifest.cases).map(([id, e]) => ({
                id, grp: e.grp || '', source: e.source || '', addedAt: e.addedAt || null, note: e.note || '', paths: e.paths || null, deps: e.deps || [],
                locations: (index.get(id) || []).map((l) => ({ path: l.path, cat: l.cat, title: l.title, commented: l.commented })),
            }));
            const groups = [...new Set(cases.map((c) => c.grp).filter(Boolean))].sort();
            res.json({ path: TCD_CASE_MANIFEST_PATH, updatedAt: manifest.updatedAt || null, cases, groups });
        } catch (err) {
            res.status(500).json({ error: String(err && err.message || err) });
        }
    });

    // Adds case IDs (any text containing C-numbers). Ones already owned are skipped.
    app.post('/api/testcases/case-manifest/add', (req, res) => {
        if (!tcdRequireCaseMode(res)) return;
        const { ids, grp, note, source } = req.body || {};
        const parsed = tcdParseCaseIds(ids);
        if (!parsed.length) return res.status(400).json({ error: 'No case IDs found (expected C1234567)' });
        try {
            const manifest = tcdLoadCaseManifest();
            const index = tcdBuildRepoIndex();
            const added = []; const skipped = []; const notInRepo = [];
            const today = new Date().toISOString().slice(0, 10);
            for (const id of parsed) {
                if (manifest.cases[id]) { skipped.push(id); continue; }
                manifest.cases[id] = { grp: String(grp || '').trim() || 'Ungrouped', source: source || 'manual', addedAt: today };
                if (note) manifest.cases[id].note = String(note).slice(0, 300);
                added.push(id);
                if (!index.has(id)) notInRepo.push(id);
            }
            if (added.length) {
                tcdSaveCaseManifest(manifest);
                tcdLogCaseHistory({ type: 'cases_owned', caseIds: added, count: added.length, grp: grp || '' });
            }
            res.json({ added, skipped, notInRepo });
        } catch (err) {
            res.status(500).json({ error: String(err && err.message || err) });
        }
    });

    app.post('/api/testcases/case-manifest/remove', (req, res) => {
        if (!tcdRequireCaseMode(res)) return;
        const parsed = tcdParseCaseIds((req.body || {}).ids);
        if (!parsed.length) return res.status(400).json({ error: 'ids is required' });
        try {
            const manifest = tcdLoadCaseManifest();
            const removed = parsed.filter((id) => manifest.cases[id]);
            removed.forEach((id) => { delete manifest.cases[id]; });
            if (removed.length) {
                tcdSaveCaseManifest(manifest);
                const tracking = tcdLoadCaseTracking();
                removed.forEach((id) => { delete tracking.cases[id]; });
                tcdSaveCaseTracking();
                tcdLogCaseHistory({ type: 'cases_disowned', caseIds: removed, count: removed.length });
            }
            res.json({ removed });
        } catch (err) {
            res.status(500).json({ error: String(err && err.message || err) });
        }
    });

    // Edits one case's group / note / pinned spec paths (empty paths = unpinned).
    app.post('/api/testcases/case-manifest/update', (req, res) => {
        if (!tcdRequireCaseMode(res)) return;
        const { id, grp, note, paths } = req.body || {};
        const caseId = tcdParseCaseIds(id)[0];
        try {
            const manifest = tcdLoadCaseManifest();
            const entry = caseId && manifest.cases[caseId];
            if (!entry) return res.status(404).json({ error: 'Case is not in the manifest' });
            if (grp !== undefined) entry.grp = String(grp).trim() || 'Ungrouped';
            if (note !== undefined) { if (note) entry.note = String(note).slice(0, 300); else delete entry.note; }
            if (paths !== undefined) {
                if (Array.isArray(paths) && paths.length) entry.paths = paths.map(String); else delete entry.paths;
            }
            if (req.body.deps !== undefined) {
                const deps = tcdParseCaseIds(req.body.deps).filter((d) => d !== caseId);
                if (deps.length) entry.deps = deps; else delete entry.deps;
            }
            tcdSaveCaseManifest(manifest);
            res.json({ id: caseId, entry });
        } catch (err) {
            res.status(500).json({ error: String(err && err.message || err) });
        }
    });

    app.get('/api/testcases/case-manifest/download', (req, res) => {
        if (!tcdRequireCaseMode(res)) return;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(TCD_CASE_MANIFEST_PATH)}"`);
        res.send(fs.readFileSync(TCD_CASE_MANIFEST_PATH, 'utf8'));
    });

    let tcdLastParamCheck = null;
    // Case-mode Jenkins runs pass GREP_TAGS; a job without that parameter
    // silently ignores it and runs the whole spec (other people's cases too).
    app.get('/api/testcases/jenkins-param-check', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        let cfg;
        try { cfg = tcdLoadJenkinsConfig(); } catch (e) { return res.json({ jobs: [], error: 'Jenkins not configured' }); }
        const names = [].concat(cfg.jobs.OFFLINE || [], cfg.jobs.ONLINE || [], cfg.jobs.E2E || []);
        const jobs = await Promise.all(names.map(async (name) => {
            try {
                const r = await tcdHttpRequest(`${cfg.url}/job/${encodeURIComponent(name)}/api/json?tree=property[parameterDefinitions[name]]`, { headers: { Authorization: `Basic ${cfg.auth}` } });
                const defs = [].concat(...(JSON.parse(r.body).property || []).map((p) => p.parameterDefinitions || []));
                const params = defs.map((d) => d.name);
                return { name, params, hasGrepTags: params.includes('GREP_TAGS') };
            } catch (e) {
                return { name, error: e.message };
            }
        }));
        tcdLastParamCheck = { at: new Date().toISOString(), jobs };
        res.json({ caseMode: TCD_CASE_MODE, jobs });
    });

    app.get('/api/testcases/manifest/download', (req, res) => {
        try {
            if (!fs.existsSync(TCD_MANIFEST_PATH)) return res.status(404).json({ error: 'Manifest file not found' });
            const content = fs.readFileSync(TCD_MANIFEST_PATH, 'utf8');
            res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${path.basename(TCD_MANIFEST_PATH)}"`);
            res.send(content);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/testcases/notes', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json(tcdLoadNotes());
    });

    app.post('/api/testcases/notes', (req, res) => {
        const { caseId, text } = req.body;
        if (!caseId) return res.status(400).json({ error: 'caseId is required' });
        const notes = tcdLoadNotes();
        const trimmed = (text || '').trim();
        if (trimmed) {
            notes[caseId] = { text: trimmed, updatedAt: Date.now() };
        } else {
            delete notes[caseId]; // blank text clears the note
        }
        tcdSaveNotes();
        res.json({ caseId, note: notes[caseId] || null });
    });

    const TCD_MANUAL_STATUSES = new Set(['passed', 'failed', 'blocked', 'retest']);

    app.get('/api/testcases/manual-status', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json(tcdLoadManualStatus());
    });

    app.post('/api/testcases/manual-status', (req, res) => {
        const { caseId, status } = req.body;
        if (!caseId) return res.status(400).json({ error: 'caseId is required' });
        const statuses = tcdLoadManualStatus();
        if (status && TCD_MANUAL_STATUSES.has(status)) {
            statuses[caseId] = { status, updatedAt: Date.now() };
        } else {
            delete statuses[caseId]; // clearing an override reverts the case to its auto-detected status
        }
        tcdSaveManualStatus();
        res.json({ caseId, entry: statuses[caseId] || null });
    });

    // Jenkins Runner's own manual-status endpoints — deliberately not the same
    // store as /api/testcases/manual-status above, so a mark made on this page
    // never syncs to Cypress Runner or vice versa.
    app.get('/api/testcases/jenkins-manual-status', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json(tcdLoadJenkinsManualStatus());
    });

    app.post('/api/testcases/jenkins-manual-status', (req, res) => {
        const { caseId, status } = req.body;
        if (!caseId) return res.status(400).json({ error: 'caseId is required' });
        const statuses = tcdLoadJenkinsManualStatus();
        if (status && TCD_MANUAL_STATUSES.has(status)) {
            statuses[caseId] = { status, updatedAt: Date.now() };
        } else {
            delete statuses[caseId];
        }
        tcdSaveJenkinsManualStatus();
        res.json({ caseId, entry: statuses[caseId] || null });
    });

    app.get('/api/testcases/tags', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json(tcdLoadTags());
    });

    // Full replace of one case's tag list — used by the individual tag editor,
    // which edits the whole set at once rather than adding/removing one at a time.
    app.post('/api/testcases/tags', (req, res) => {
        const { caseId, tags } = req.body;
        if (!caseId) return res.status(400).json({ error: 'caseId is required' });
        const store = tcdLoadTags();
        const clean = tcdNormalizeTagList(tags);
        if (clean.length > 0) {
            store[caseId] = clean;
        } else {
            delete store[caseId];
        }
        tcdSaveTags();
        res.json({ caseId, tags: store[caseId] || [] });
    });

    // Adds/removes a single tag across many case ids at once — the bulk-select
    // toolbar's action, kept separate from the single-case replace above so a
    // bulk add can't accidentally wipe out a case's other, unrelated tags.
    app.post('/api/testcases/tags/bulk', (req, res) => {
        const { caseIds, action, tag } = req.body;
        const cleanTag = String(tag || '').trim().toLowerCase();
        if (!Array.isArray(caseIds) || caseIds.length === 0) return res.status(400).json({ error: 'caseIds is required' });
        if (!cleanTag) return res.status(400).json({ error: 'tag is required' });
        if (action !== 'add' && action !== 'remove') return res.status(400).json({ error: "action must be 'add' or 'remove'" });
        const store = tcdLoadTags();
        caseIds.forEach((caseId) => {
            const current = store[caseId] || [];
            const next = action === 'add'
                ? tcdNormalizeTagList([...current, cleanTag])
                : current.filter((t) => t !== cleanTag);
            if (next.length > 0) store[caseId] = next; else delete store[caseId];
        });
        tcdSaveTags();
        res.json({ updated: caseIds.length, tag: cleanTag, action });
    });

    app.get('/api/testcases/bug-links', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json(tcdLoadBugLinks());
    });

    app.post('/api/testcases/bug-links', (req, res) => {
        const { caseId, bugId } = req.body;
        if (!caseId) return res.status(400).json({ error: 'caseId is required' });
        const store = tcdLoadBugLinks();
        const trimmed = (bugId || '').trim();
        if (trimmed) {
            store[caseId] = { bugId: trimmed, updatedAt: Date.now() };
        } else {
            delete store[caseId]; // blank clears the link
        }
        tcdSaveBugLinks();
        res.json({ caseId, entry: store[caseId] || null });
    });

    // Jenkins Runner's own bug-links endpoints — deliberately not the same store
    // as /api/testcases/bug-links above, so a link made on this page never syncs
    // to Cypress Runner or vice versa.
    app.get('/api/testcases/jenkins-bug-links', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json(tcdLoadJenkinsBugLinks());
    });

    app.post('/api/testcases/jenkins-bug-links', (req, res) => {
        const { caseId, bugId } = req.body;
        if (!caseId) return res.status(400).json({ error: 'caseId is required' });
        const store = tcdLoadJenkinsBugLinks();
        const trimmed = (bugId || '').trim();
        if (trimmed) {
            store[caseId] = { bugId: trimmed, updatedAt: Date.now() };
        } else {
            delete store[caseId];
        }
        tcdSaveJenkinsBugLinks();
        res.json({ caseId, entry: store[caseId] || null });
    });

    app.get('/api/testcases/recheck-ids', (req, res) => {
        tcdCaseIdCache = null; // force tcdEnsureCaseIdsFresh() to refetch on the next /api/testcases/data call
        tcdCaseIdCacheAt = 0;
        res.status(202).json({ started: true });
    });

    app.get('/api/testcases/jenkins-jobs', async (req, res) => {
        // Falls back to "nothing configured yet" the same way the TestRail load
        // right below does — on a fresh machine (or before Settings > Integrations
        // has been filled in), data/settings/integrations.local.json doesn't
        // exist yet. Without this try/catch, the thrown error was an unhandled
        // rejection inside this async handler, which crashes the whole server
        // process rather than just failing this one request.
        let jobs = { ONLINE: [], OFFLINE: [], E2E: [] };
        let defaultEnvironment = 'qa';
        try {
            ({ jobs, defaultEnvironment } = tcdLoadJenkinsConfig());
        } catch (e) { /* config not set up yet */ }
        // TestRail's base URL (not a secret) rides along so the client can build
        // "open in TestRail" deep links without fetching the full credentials.
        let testrailUrl = null;
        try { testrailUrl = tcdLoadTrConfig().url; } catch (e) { /* config not set up yet */ }
        try {
            const environments = await tcdGetEnvironmentChoices();
            res.json({ jobs, defaultEnvironment, environments, testrailUrl });
        } catch (err) {
            res.json({ jobs, defaultEnvironment, environments: [defaultEnvironment], testrailUrl });
        }
    });

    app.post('/api/testcases/queue-jobs', (req, res) => {
        const { items, environment, runId } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items[] is required' });
        }
        const { defaultEnvironment, jobs } = tcdLoadJenkinsConfig();
        const bad = items.find((it) => !it.path || !it.category || !jobs[it.category]);
        if (bad) {
            return res.status(400).json({ error: 'each item needs path and a valid category' });
        }
        tcdEnqueueJobs(items.map((it) => ({
            path: it.path,
            category: it.category,
            pinnedJob: it.pinnedJob || null, // set only if the user overrode auto-selection
            environment: environment || defaultEnvironment,
            runId: runId || '',
            // Case mode: run only these cases of the spec (caller's subset, else
            // every case we own in it). null = whole spec.
            cases: Array.isArray(it.cases) && it.cases.length ? tcdParseCaseIds(it.cases) : tcdOwnedCasesForPath(it.path),
        })));
        res.status(202).json({ queued: items.length });
    });

    app.get('/api/testcases/job-queue', (req, res) => {
        res.set('Cache-Control', 'no-store');
        // Full history (not truncated) — the client needs every run per file for
        // trend tracking, not just the most recent handful.
        res.json({ queue: tcdJobQueue, running: tcdRunningJobs, history: tcdJobHistory });
    });

    // Cancels a not-yet-dispatched queue entry (just dropped, no Jenkins call
    // needed) or an in-flight one (still queued on Jenkins, or actually
    // building — either way tcdCancelRunningJob asks Jenkins to stop/cancel it,
    // and the existing polling loop in tcdRunToCompletion finalizes it into
    // history as ABORTED on its own next poll).
    app.post('/api/testcases/cancel-job', async (req, res) => {
        const id = req.body && req.body.id;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const queueIdx = tcdJobQueue.findIndex((q) => q.id === id);
        if (queueIdx !== -1) {
            tcdJobQueue.splice(queueIdx, 1);
            tcdSaveQueueState();
            return res.json({ success: true, mode: 'dequeued' });
        }

        try {
            const result = await tcdCancelRunningJob(id);
            if (!result.ok) return res.status(404).json({ error: result.error });
            tcdSaveQueueState();
            res.json({ success: true, mode: 'stopping' });
        } catch (err) {
            res.status(502).json({ error: String(err && err.message || err) });
        }
    });

    // Single-click "cancel everything" — drops every not-yet-dispatched queue
    // entry and asks Jenkins to stop every currently-building/queued-on-Jenkins
    // job, mirroring what repeatedly calling cancel-job on each item would do.
    // Same finalization path as a single cancel: tcdRunToCompletion's polling
    // loop notices cancelRequested and lands each running job in history as
    // ABORTED on its own next poll.
    app.post('/api/testcases/cancel-all', async (req, res) => {
        const queuedCount = tcdJobQueue.length;
        const runningIds = tcdRunningJobs.map((r) => r.id);
        tcdJobQueue = [];
        tcdSaveQueueState();

        const results = await Promise.allSettled(runningIds.map((id) => tcdCancelRunningJob(id)));
        const stopped = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
        tcdSaveQueueState();

        res.json({ success: true, dequeued: queuedCount, stopping: stopped });
    });

    app.post('/api/testcases/remove-history', (req, res) => {
        const before = tcdJobHistory.length;
        tcdJobHistory = tcdJobHistory.filter((h) => h.id !== req.body.id);
        if (tcdJobHistory.length === before) {
            return res.status(404).json({ error: 'No history entry with that id' });
        }
        tcdSaveHistory();
        res.json({ removed: req.body.id });
    });

    app.get('/api/testcases/run-status', async (req, res) => {
        const runId = req.query.runId;
        if (!runId || !/^\d+$/.test(runId)) {
            return res.status(400).json({ error: 'Provide a numeric ?runId=' });
        }
        const deadline = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timed out pulling run status after 60s — check server console for which page stalled')), 60000)
        );
        try {
            const result = await Promise.race([tcdGetRunStatuses(runId), deadline]);
            res.set('Cache-Control', 'no-store');
            res.json(result);
        } catch (err) {
            res.status(502).json({ error: String(err && err.message || err) });
        }
    });

    app.get('/api/testcases/artifact-proxy', (req, res) => {
        const artifactUrl = req.query.url || '';
        const { url: jenkinsBase, auth } = tcdLoadJenkinsConfig();
        // Browsers won't send Jenkins' session cookie on a cross-origin <img>
        // subresource request, so screenshots 401 unless the server — which
        // already holds the Jenkins API token — fetches them and streams the
        // bytes through. Restricting to URLs under the configured Jenkins base
        // also keeps this from becoming an open proxy.
        if (!artifactUrl.startsWith(jenkinsBase + '/')) {
            return res.status(400).type('text/plain').send('Artifact URL must be under the configured Jenkins host');
        }
        const target = new URL(artifactUrl);
        const transport = target.protocol === 'https:' ? https : http;
        const proxyReq = transport.request(target, { headers: { Authorization: `Basic ${auth}` } }, (proxyRes) => {
            res.status(proxyRes.statusCode);
            res.set('Content-Type', proxyRes.headers['content-type'] || 'application/octet-stream');
            res.set('Cache-Control', 'no-store');
            proxyRes.pipe(res);
        });
        proxyReq.on('error', (err) => {
            res.status(502).type('text/plain').send(`Artifact proxy error: ${err.message}`);
        });
        proxyReq.end();
    });

    // Reads the config file straight through, and writing it invalidates every
    // cache derived from it (TestRail/Jenkins auth, environment choices, status
    // names, case-ID cache) so a saved change takes effect on the very next
    // request — no server restart needed.
    app.get('/api/integrations/config', (req, res) => {
        try {
            res.json(JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8')));
        } catch (err) {
            res.status(500).json({ error: String(err && err.message || err) });
        }
    });

    app.put('/api/integrations/config', (req, res) => {
        const body = req.body || {};
        const required = ['TESTRAIL_URL', 'TESTRAIL_USERNAME', 'TESTRAIL_API_KEY', 'TESTRAIL_PROJECT_ID', 'TESTRAIL_SUITE_ID', 'JENKINS_URL', 'JENKINS_USERNAME', 'JENKINS_API_TOKEN'];
        const missing = required.filter((k) => body[k] === undefined || body[k] === null || String(body[k]).trim() === '');
        if (missing.length) {
            return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
        }
        const jobs = body.JENKINS_JOBS || {};
        // Telegram fields are optional — this integration may not be set up yet,
        // so nothing here is required the way TestRail/Jenkins fields are.
        const digestTime = String(body.TELEGRAM_DIGEST_TIME || '18:00').trim();
        const merged = {
            TESTRAIL_URL: String(body.TESTRAIL_URL).trim(),
            TESTRAIL_USERNAME: String(body.TESTRAIL_USERNAME).trim(),
            TESTRAIL_API_KEY: String(body.TESTRAIL_API_KEY).trim(),
            TESTRAIL_PROJECT_ID: Number(body.TESTRAIL_PROJECT_ID),
            TESTRAIL_SUITE_ID: Number(body.TESTRAIL_SUITE_ID),
            JENKINS_URL: String(body.JENKINS_URL).trim(),
            JENKINS_USERNAME: String(body.JENKINS_USERNAME).trim(),
            JENKINS_API_TOKEN: String(body.JENKINS_API_TOKEN).trim(),
            JENKINS_DEFAULT_ENVIRONMENT: String(body.JENKINS_DEFAULT_ENVIRONMENT || 'qa').trim(),
            JENKINS_JOBS: {
                OFFLINE: Array.isArray(jobs.OFFLINE) ? jobs.OFFLINE.map(String) : [],
                ONLINE: Array.isArray(jobs.ONLINE) ? jobs.ONLINE.map(String) : [],
                E2E: Array.isArray(jobs.E2E) ? jobs.E2E.map(String) : [],
            },
            TELEGRAM_BOT_TOKEN: String(body.TELEGRAM_BOT_TOKEN || '').trim(),
            TELEGRAM_CHAT_ID: String(body.TELEGRAM_CHAT_ID || '').trim(),
            TELEGRAM_NOTIFY_ON_FAILURE: !!body.TELEGRAM_NOTIFY_ON_FAILURE,
            TELEGRAM_NOTIFY_ON_SUCCESS: !!body.TELEGRAM_NOTIFY_ON_SUCCESS,
            TELEGRAM_ATTACH_SCREENSHOTS: !!body.TELEGRAM_ATTACH_SCREENSHOTS,
            TELEGRAM_ATTACH_CSV: !!body.TELEGRAM_ATTACH_CSV,
            TELEGRAM_DIGEST_ENABLED: !!body.TELEGRAM_DIGEST_ENABLED,
            TELEGRAM_DIGEST_TIME: /^\d{2}:\d{2}$/.test(digestTime) ? digestTime : '18:00',
        };
        try {
            writeJsonAtomic(INTEGRATIONS_CONFIG_PATH, merged);
        } catch (err) {
            return res.status(500).json({ error: String(err && err.message || err) });
        }
        TCD_TR_CONFIG = null;
        TCD_JENKINS_CONFIG = null;
        tcdEnvironmentChoicesCache = null;
        tcdStatusNameCache = null;
        tcdCaseIdCache = null;
        tcdCaseIdCacheAt = 0;
        res.json({ success: true, config: merged });
    });

    // Accepts an optional body with the same shape as the config file so the
    // credentials modal can test values the user has typed but not saved yet;
    // falls back to whatever's currently on disk when no body is sent. Uses
    // tcdHttpRequest directly rather than tcdTrGet/tcdLoadJenkinsConfig so a
    // transient test never touches (or is affected by) the cached config.
    async function tcdTestConnections(raw) {
        const cfg = raw || JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
        const result = { testrail: { ok: false }, jenkins: { ok: false } };

        try {
            const trUrl = String(cfg.TESTRAIL_URL || '').replace(/\/+$/, '');
            const trAuth = Buffer.from(`${cfg.TESTRAIL_USERNAME}:${cfg.TESTRAIL_API_KEY}`).toString('base64');
            const res = await tcdHttpRequest(`${trUrl}/index.php?/api/v2/get_statuses`, { headers: { Authorization: `Basic ${trAuth}` }, timeoutMs: 10000 });
            if (res.statusCode >= 200 && res.statusCode < 300) result.testrail.ok = true;
            else result.testrail.error = `TestRail responded ${res.statusCode}`;
        } catch (err) {
            result.testrail.error = err.message;
        }

        try {
            const jUrl = String(cfg.JENKINS_URL || '').replace(/\/+$/, '');
            const jAuth = Buffer.from(`${cfg.JENKINS_USERNAME}:${cfg.JENKINS_API_TOKEN}`).toString('base64');
            const res = await tcdHttpRequest(`${jUrl}/api/json`, { headers: { Authorization: `Basic ${jAuth}` }, timeoutMs: 10000 });
            if (res.statusCode >= 200 && res.statusCode < 300) result.jenkins.ok = true;
            else result.jenkins.error = `Jenkins responded ${res.statusCode}`;
        } catch (err) {
            result.jenkins.error = err.message;
        }

        return result;
    }

    app.post('/api/integrations/config/test', async (req, res) => {
        try {
            const hasBody = req.body && Object.keys(req.body).length > 0;
            res.json(await tcdTestConnections(hasBody ? req.body : null));
        } catch (err) {
            res.status(500).json({ error: String(err && err.message || err) });
        }
    });

    // ════════════════════════════════════════════
    // TELEGRAM — manual send, build-failure alerts, daily digest
    // ════════════════════════════════════════════

    // Telegram's HTML parse_mode only understands a small fixed tag set (b, i,
    // u, s, a, code, pre, blockquote) — feeding it a generic markdown-to-HTML
    // render (headings, <ul>/<li>, <table>, <p>) gets a 400 "unsupported tag".
    // This instead converts just that supported subset by hand, so a Daily
    // Status report (or a job report line) renders with real bold/italic/code
    // instead of showing literal **/##/`` characters. Markdown tables get
    // rendered as a monospaced <pre> block since Telegram has no <table>.
    function tcdMarkdownToTelegramHtml(md) {
        const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
        const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
        const parseRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
        const renderTable = (rows) => {
            const header = rows[0];
            const body = rows.slice(1);
            const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => (r[i] || '').length), 3));
            const pad = (cells) => cells.map((c, i) => (c || '').padEnd(widths[i])).join(' | ');
            const sep = widths.map((w) => '-'.repeat(w)).join('-+-');
            return [pad(header), sep, ...body.map(pad)].join('\n');
        };

        // Pull fenced code blocks and markdown tables out into placeholders
        // first so none of the later inline substitutions (bold/italic/etc)
        // ever touch their content.
        const blocks = [];
        const lines = String(md || '').split('\n');
        const out = [];
        let i = 0;
        while (i < lines.length) {
            if (isTableRow(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
                const rows = [parseRow(lines[i])];
                let j = i + 2;
                while (j < lines.length && isTableRow(lines[j])) { rows.push(parseRow(lines[j])); j++; }
                blocks.push(escapeHtml(renderTable(rows)));
                out.push(`  BLOCK${blocks.length - 1}  `);
                i = j;
            } else {
                out.push(lines[i]);
                i++;
            }
        }
        let text = out.join('\n').replace(/```([\s\S]*?)```/g, (_, code) => {
            blocks.push(escapeHtml(code.replace(/^\n/, '').replace(/\n$/, '')));
            return `  BLOCK${blocks.length - 1}  `;
        });

        text = escapeHtml(text);

        text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        text = text.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
        text = text.replace(/__([^_\n]+)__/g, '<b>$1</b>');
        text = text.replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
        text = text.replace(/(?<![a-zA-Z0-9])_([^_\n]+)_(?![a-zA-Z0-9])/g, '<i>$1</i>');
        text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
        text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
        text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');
        text = text.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');
        text = text.replace(/^(\s*)[-*]\s+(.+)$/gm, '$1• $2');
        text = text.replace(/^(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '─'.repeat(11));

        text = text.replace(/ BLOCK(\d+) /g, (_, n) => `<pre>${blocks[Number(n)]}</pre>`);

        return text;
    }

    // Telegram caps sendMessage text at 4096 chars — split on line boundaries
    // (never mid-tag, since each chunk is converted to HTML independently)
    // so a long report sends as a few messages instead of erroring outright.
    function tcdChunkPlainText(text, maxLen = 3500) {
        if (text.length <= maxLen) return [text];
        const lines = text.split('\n');
        const chunks = [];
        let cur = '';
        for (const line of lines) {
            const candidate = cur ? `${cur}\n${line}` : line;
            if (candidate.length > maxLen && cur) {
                chunks.push(cur);
                cur = line;
            } else {
                cur = candidate;
            }
        }
        if (cur) chunks.push(cur);
        return chunks;
    }

    async function tcdSendTelegramMessage(text, cfgOverride) {
        const cfg = cfgOverride || JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
        const token = cfg.TELEGRAM_BOT_TOKEN;
        const chatId = cfg.TELEGRAM_CHAT_ID;
        if (!token || !chatId) throw new Error('Telegram bot token / chat ID not configured');

        for (const chunk of tcdChunkPlainText(String(text || ''))) {
            const res = await tcdHttpRequest(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: tcdMarkdownToTelegramHtml(chunk), parse_mode: 'HTML', disable_web_page_preview: true }),
                timeoutMs: 10000,
            });
            if (res.statusCode < 200 || res.statusCode >= 300) {
                let message = `Telegram API responded ${res.statusCode}`;
                try { message = JSON.parse(res.body).description || message; } catch (e) { /* keep default */ }
                throw new Error(message);
            }
        }
    }

    // Builds a multipart/form-data body by hand — no form-data lib in this
    // project's dependencies, and the shape needed here (a few text fields plus
    // zero or more binary file parts) isn't worth adding one for.
    function tcdBuildMultipartBody(fields, fileParts) {
        const boundary = `ZoroTelegram${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
        const parts = [];
        Object.entries(fields).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
        });
        (fileParts || []).forEach((filePart) => {
            parts.push(Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="${filePart.name}"; filename="${filePart.filename}"\r\n` +
                `Content-Type: ${filePart.contentType}\r\n\r\n`
            ));
            parts.push(filePart.data);
            parts.push(Buffer.from('\r\n'));
        });
        parts.push(Buffer.from(`--${boundary}--\r\n`));
        return { body: Buffer.concat(parts), boundary };
    }

    async function tcdPostTelegramMultipart(endpoint, token, fields, fileParts) {
        const { body, boundary } = tcdBuildMultipartBody(fields, fileParts);
        const res = await tcdHttpRequest(`https://api.telegram.org/bot${token}/${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
            body,
            timeoutMs: 30000,
        });
        if (res.statusCode < 200 || res.statusCode >= 300) {
            let message = `Telegram API responded ${res.statusCode}`;
            try { message = JSON.parse(res.body).description || message; } catch (e) { /* keep default */ }
            throw new Error(message);
        }
    }

    // Sends one or more screenshots/documents together. Telegram's sendPhoto/
    // sendDocument also accept a plain URL and fetch it server-side, but that
    // only works for URLs Telegram's own servers can reach — Jenkins here is
    // usually on a private/internal host, so every attachment has to be
    // downloaded first (with our own Jenkins auth) and re-uploaded as multipart
    // data. A single attachment uses sendPhoto/sendDocument directly; 2+ go
    // through sendMediaGroup (Telegram's "album" endpoint), batched at 10 items
    // per call since that's its hard limit — only the very first item across
    // all batches carries the caption, matching how Telegram albums display it.
    // An attachment Jenkins won't serve (network blip, expired build) is
    // skipped rather than failing the whole notification.
    // Jenkins is usually on a private/internal host, so its attachments have to
    // be downloaded (with our own Jenkins auth) and re-uploaded as multipart
    // data — this is the default fetcher tcdSendTelegramAttachments uses unless
    // a caller passes its own (e.g. Cypress Runner passes one that reads
    // screenshots straight off local disk instead, since those aren't hosted
    // anywhere that needs fetching over HTTP at all).
    async function tcdFetchJenkinsAttachment(item) {
        const { auth: jenkinsAuth } = tcdLoadJenkinsConfig();
        const fetched = await tcdHttpRequestBinary(item.url, { headers: { Authorization: `Basic ${jenkinsAuth}` }, timeoutMs: 20000 });
        if (fetched.statusCode < 200 || fetched.statusCode >= 300) return null;
        const contentType = fetched.headers['content-type'] || (item.type === 'photo' ? 'image/png' : 'application/octet-stream');
        return { name: item.type === 'photo' ? 'photo' : 'document', filename: item.filename, contentType, data: fetched.body };
    }

    async function tcdSendTelegramAttachments(attachments, caption, cfgOverride, fetchAttachment) {
        const cfg = cfgOverride || JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
        const token = cfg.TELEGRAM_BOT_TOKEN;
        const chatId = cfg.TELEGRAM_CHAT_ID;
        if (!token || !chatId) throw new Error('Telegram bot token / chat ID not configured');
        if (!attachments || attachments.length === 0) throw new Error('No attachments to send');

        const doFetch = fetchAttachment || tcdFetchJenkinsAttachment;

        // Sends one homogeneous (all-photo or all-document) group: a single item
        // uses sendPhoto/sendDocument directly, 2+ go through sendMediaGroup in
        // batches of at most 10 (Telegram's per-call limit). `getCap(isFirstSent)`
        // decides the caption per item so the *overall* first successfully-sent
        // attachment across every group gets it, not just the first per group.
        const sendGroup = async (items, getCap) => {
            if (items.length === 1) {
                const filePart = await doFetch(items[0]);
                if (!filePart) throw new Error(`Couldn't fetch ${items[0].filename}`);
                const endpoint = items[0].type === 'photo' ? 'sendPhoto' : 'sendDocument';
                const cap = getCap(true);
                await tcdPostTelegramMultipart(endpoint, token, { chat_id: chatId, caption: cap, ...(cap ? { parse_mode: 'HTML' } : {}) }, [filePart]);
                return;
            }
            const batches = [];
            for (let i = 0; i < items.length; i += 10) batches.push(items.slice(i, i + 10));
            for (let b = 0; b < batches.length; b++) {
                const batch = batches[b];
                const media = [];
                const fileParts = [];
                for (let i = 0; i < batch.length; i++) {
                    const filePart = await doFetch(batch[i]);
                    if (!filePart) continue; // skip what we can't reach rather than fail the whole album
                    const attachName = `file${b}_${i}`;
                    const mediaItem = { type: batch[i].type, media: `attach://${attachName}` };
                    const cap = getCap(b === 0 && fileParts.length === 0);
                    if (cap) { mediaItem.caption = cap; mediaItem.parse_mode = 'HTML'; }
                    media.push(mediaItem);
                    fileParts.push({ ...filePart, name: attachName });
                }
                if (media.length === 0) continue;
                if (media.length === 1) {
                    // Fetch failures thinned this batch to one — sendMediaGroup needs 2+.
                    const endpoint = media[0].type === 'photo' ? 'sendPhoto' : 'sendDocument';
                    await tcdPostTelegramMultipart(endpoint, token, { chat_id: chatId, caption: media[0].caption, ...(media[0].caption ? { parse_mode: 'HTML' } : {}) }, [{ ...fileParts[0], name: media[0].type === 'photo' ? 'photo' : 'document' }]);
                    continue;
                }
                await tcdPostTelegramMultipart('sendMediaGroup', token, { chat_id: chatId, media: JSON.stringify(media) }, fileParts);
            }
        };

        // Telegram's sendMediaGroup rejects mixing photos with documents in the
        // same album, so each type gets its own message/album — the caption
        // still only ever lands on the first attachment actually sent overall.
        // Converted to Telegram's HTML subset up front so every caller (single
        // sendPhoto/sendDocument or an album item) gets the same formatting.
        const trimmedCaption = tcdMarkdownToTelegramHtml((caption || '').slice(0, 1024));
        const photos = attachments.filter((a) => a.type === 'photo');
        const documents = attachments.filter((a) => a.type !== 'photo');
        let captionClaimed = false;
        const getCap = (isFirstInGroup) => {
            if (!isFirstInGroup || captionClaimed || !trimmedCaption) return undefined;
            captionClaimed = true;
            return trimmedCaption;
        };

        if (photos.length > 0) await sendGroup(photos, getCap);
        if (documents.length > 0) await sendGroup(documents, getCap);
    }

    // Attachment URLs come from the client (the manual "send report" flow lets
    // the user pick a date/selection whose screenshots then get fetched
    // server-side with our Jenkins auth attached) — restricting to the
    // configured Jenkins host keeps this from being used to make the server
    // fetch-and-relay arbitrary internal URLs with that credential.
    function tcdSanitizeTelegramAttachments(list) {
        const { url: jenkinsBase } = tcdLoadJenkinsConfig();
        return (Array.isArray(list) ? list : [])
            .filter((a) => a && typeof a.url === 'string' && a.url.startsWith(`${jenkinsBase}/`) && (a.type === 'photo' || a.type === 'document'));
    }

    app.post('/api/integrations/telegram/send', async (req, res) => {
        const jobs = Array.isArray(req.body && req.body.jobs) ? req.body.jobs : null;

        // Per-job mode: an optional overview message, then each job's own text
        // + its own screenshots/CSV as a separate, sequential message/album —
        // so a multi-job report never dumps one undifferentiated pile of images
        // with no indication of which job each one came from.
        if (jobs) {
            const overview = ((req.body && req.body.overview) || '').trim();
            if (jobs.length === 0 && !overview) return res.status(400).json({ error: 'Nothing to send' });
            try {
                if (overview) await tcdSendTelegramMessage(overview, null);
                for (const job of jobs) {
                    const jobText = ((job && job.text) || '').trim();
                    const attachments = tcdSanitizeTelegramAttachments(job && job.attachments);
                    if (attachments.length > 0) {
                        await tcdSendTelegramAttachments(attachments, jobText, null);
                    } else if (jobText) {
                        await tcdSendTelegramMessage(jobText, null);
                    }
                }
                res.json({ success: true });
            } catch (err) {
                res.status(502).json({ error: String(err && err.message || err) });
            }
            return;
        }

        // Plain single-message mode — used by anything that just wants to send
        // one block of text with no per-job breakdown (e.g. a future simple
        // "send this text" caller).
        const text = ((req.body && req.body.text) || '').trim();
        const attachments = tcdSanitizeTelegramAttachments(req.body && req.body.attachments);
        if (!text && attachments.length === 0) return res.status(400).json({ error: 'text is required' });
        try {
            if (attachments.length > 0) {
                await tcdSendTelegramAttachments(attachments, text, null);
            } else {
                await tcdSendTelegramMessage(text, null);
            }
            res.json({ success: true });
        } catch (err) {
            res.status(502).json({ error: String(err && err.message || err) });
        }
    });

    app.post('/api/integrations/telegram/test', async (req, res) => {
        try {
            const hasBody = req.body && Object.keys(req.body).length > 0;
            await tcdSendTelegramMessage('✅ Zoro Test Case Dashboard is connected to this chat.', hasBody ? req.body : null);
            res.json({ success: true });
        } catch (err) {
            res.status(502).json({ error: String(err && err.message || err) });
        }
    });

    // Telegram bots can't be messaged proactively without knowing a chat ID
    // first, and the only way to discover one otherwise is hand-parsing the
    // getUpdates JSON in a browser — this does that server-side instead. Only
    // surfaces chats the bot has actually seen (i.e. someone already messaged
    // it), which is exactly the precondition sendMessage needs anyway.
    async function tcdDiscoverTelegramChats(cfgOverride) {
        const cfg = cfgOverride || JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
        const token = cfg.TELEGRAM_BOT_TOKEN;
        if (!token) throw new Error('Telegram bot token not configured');

        const res = await tcdHttpRequest(`https://api.telegram.org/bot${token}/getUpdates?limit=100`, { timeoutMs: 10000 });
        if (res.statusCode < 200 || res.statusCode >= 300) {
            let message = `Telegram API responded ${res.statusCode}`;
            try { message = JSON.parse(res.body).description || message; } catch (e) { /* keep default */ }
            throw new Error(message);
        }

        const json = JSON.parse(res.body);
        const seen = new Map();
        (json.result || []).forEach((update) => {
            const msg = update.message || update.channel_post || update.edited_message;
            const chat = msg && msg.chat;
            if (!chat || seen.has(chat.id)) return;
            const name = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ').trim() || chat.username || String(chat.id);
            seen.set(chat.id, { id: chat.id, type: chat.type, label: `${name} (${chat.type})` });
        });
        return Array.from(seen.values());
    }

    app.post('/api/integrations/telegram/discover-chats', async (req, res) => {
        try {
            const hasBody = req.body && Object.keys(req.body).length > 0;
            const chats = await tcdDiscoverTelegramChats(hasBody ? req.body : null);
            res.json({ chats });
        } catch (err) {
            res.status(502).json({ error: String(err && err.message || err) });
        }
    });

    // Same report shape as the client's "copy today's report" button, built
    // server-side so the daily digest can send it without a browser open.
    function tcdBuildTodayReportText() {
        const todayStr = new Date().toDateString();
        const todays = tcdJobHistory
            .filter((h) => { const ts = h.completedAt || h.startedAt || h.queuedAt; return ts && new Date(ts).toDateString() === todayStr; })
            .slice().reverse();
        if (todays.length === 0) return null;

        const lines = [];
        lines.push(`Test Run Report — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);
        lines.push(`${todays.length} job${todays.length === 1 ? '' : 's'} run today`);
        lines.push('');
        todays.forEach((h) => {
            const s = String(h.status || '').toUpperCase();
            const verdict = s === 'SUCCESS' ? 'PASS' : (['FAILURE', 'ERROR', 'ABORTED'].includes(s) ? 'FAIL' : (s || 'UNKNOWN'));
            const statsStr = h.testStats
                ? `${h.testStats.passes} passed, ${h.testStats.failures} failed${h.testStats.pending ? `, ${h.testStats.pending} pending` : ''}`
                : 'no pass/fail data';
            lines.push(`[${verdict}] ${h.path}`);
            lines.push(`  Job: ${h.jobName || '?'}${h.buildNumber ? ` #${h.buildNumber}` : ''}${h.runId ? ` | TestRail #${h.runId}` : ''}`);
            lines.push(`  ${statsStr}`);
            if (h.buildUrl) lines.push(`  ${h.buildUrl}`);
            lines.push('');
        });
        return lines.join('\n').trim();
    }

    const TCD_TELEGRAM_STATE_PATH = path.join(TCD_DIR, 'telegram-state.json');
    let tcdTelegramState = { lastDigestDate: null };
    (function tcdLoadTelegramStateOnBoot() {
        try {
            tcdTelegramState = JSON.parse(fs.readFileSync(TCD_TELEGRAM_STATE_PATH, 'utf8'));
        } catch (e) {
            tcdTelegramState = { lastDigestDate: null };
        }
    })();

    function tcdSaveTelegramState() {
        try {
            writeJsonAtomic(TCD_TELEGRAM_STATE_PATH, tcdTelegramState);
        } catch (e) {
            console.error('[testcases] failed to save telegram state:', e.message);
        }
    }

    // Polled every 5 minutes rather than scheduled precisely — simple, survives
    // restarts, and a several-minute slop on a "daily summary" is irrelevant.
    // lastDigestDate guards against sending twice after the time threshold is
    // crossed; it's only set once a report actually goes out, so a day with no
    // builds yet keeps retrying (harmlessly) until something has run.
    async function tcdCheckDailyDigest() {
        let cfg;
        try {
            cfg = JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
        } catch (e) {
            return;
        }
        if (!cfg.TELEGRAM_DIGEST_ENABLED || !cfg.TELEGRAM_BOT_TOKEN || !cfg.TELEGRAM_CHAT_ID) return;

        const now = new Date();
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        if (tcdTelegramState.lastDigestDate === todayKey) return;

        const [h, m] = String(cfg.TELEGRAM_DIGEST_TIME || '18:00').split(':').map(Number);
        const digestMinutes = (h || 0) * 60 + (m || 0);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        if (nowMinutes < digestMinutes) return;

        const report = tcdBuildTodayReportText();
        if (!report) return;

        try {
            await tcdSendTelegramMessage(`📋 Daily digest\n\n${report}`, cfg);
            tcdTelegramState.lastDigestDate = todayKey;
            tcdSaveTelegramState();
        } catch (err) {
            console.error('[testcases] daily digest send failed:', err.message);
        }
    }

    setInterval(tcdCheckDailyDigest, 5 * 60 * 1000);

    /** Drops config read from integrations.local.json so the next use reloads it (after a restore). */
    function tcdResetConfigCaches() {
        TCD_TR_CONFIG = null;
        TCD_JENKINS_CONFIG = null;
        tcdEnvironmentChoicesCache = null;
        tcdStatusNameCache = null;
        tcdCaseIdCache = null;
        tcdCaseIdCacheAt = 0;
    }

    return { tcdBuildData, tcdCaseLocations, tcdGetRunStatuses, tcdSpecItBlocks, tcdExpandDeps, tcdSaveCaseManifest, tcdSaveCaseTracking, tcdLogCaseHistory, tcdGetLastParamCheck: () => tcdLastParamCheck, tcdLoadCaseManifest, tcdLoadCaseTracking, tcdGetCaseTrackingHistory: () => tcdCaseTrackingHistory, tcdGetJobHistory: () => tcdJobHistory, tcdLoadManualStatus, tcdLoadJenkinsManualStatus, tcdLoadTags, tcdLoadBugLinks, tcdLoadJenkinsBugLinks, tcdLoadNotes, tcdSetupTagsForSpec, INTEGRATIONS_CONFIG_PATH, TCD_CASE_MANIFEST_PATH, TCD_CASE_MODE, TCD_E2E_ROOT, TCD_MANIFEST_PATH, tcdGrepTagsFor, tcdOwnedCasesForPath, tcdParseCaseIds, TCD_PAGE_CONCURRENCY, TCD_PAGE_SIZE, tcdExtractFromFile, tcdFetchCasesPage, tcdGetStatusNames, tcdHttpRequest, tcdJenkinsGetJsonWithRetry, tcdLoadJenkinsConfig, tcdLoadTrConfig, tcdResetConfigCaches, tcdResumeInFlightState, tcdSendTelegramAttachments, tcdSendTelegramMessage, tcdSleep, tcdTrGet };
};
