// Pure helpers for the Cypress Runner page.

import { numericId, isFlakyTrend } from '../testcase-dashboard/helpers';

// Manual status <-> TestRail status id, shared between the pill/tally display
// and the "sync to TestRail" resultMap so a manual override syncs exactly
// like an auto-detected one would.
export const MANUAL_STATUS_TO_ID = { passed: 1, blocked: 2, retest: 4, failed: 5 };

// Per-path variant of latestCaseResultsForPaths, but keeping the *overall*
// verdict (h.status) of that file's most recent run instead of its
// case-level results — used by localRunTally's fallback below.
export function latestRunStatusByPath(history) {
  const seenPaths = new Set();
  const byPath = {};
  (history || []).forEach((h) => {
    if (!h.specPath || seenPaths.has(h.specPath)) return;
    seenPaths.add(h.specPath);
    byPath[h.specPath] = h.status;
  });
  return byPath;
}

// One manifest case row's local-run verdict — 'passed' | 'failed' |
// 'untested' — sourced from caseResultsByPath (1=passed, 5=failed, TestRail's
// own status IDs — see cyrExtractCaseResults in server.js) instead of a
// pulled TestRail run. Shared by localRunTally (aggregate counts) and the CSV
// export (per-row status), so both agree on exactly the same verdict.
//
// "Untested" means the case's own FILE has never been run locally at all —
// not merely that this one case's id didn't show up in the log. A case whose
// file DID run but whose id wasn't individually extracted (e.g. it's clubbed
// with a sibling id that led the log line, or the manifest row is stale)
// falls back first to a club-sibling's result, then to the file's own overall
// pass/fail verdict — anything else would double-count as "untested" cases
// from files that were never touched at all alongside cases from files that
// genuinely ran.
//
// A commented-out case (r.commented, from tcdExtractFromFile) never executes
// even when its file runs, so it's forced to untested up front — otherwise
// it would ride along on whatever verdict the rest of that file happened to
// get via the overall-status fallback, crediting/blaming it for a test it
// was never part of.
// manualStatus (optional 4th arg) is the map fetched from
// /api/testcases/manual-status, keyed by case id (e.g. "C12345") — a manual
// override always wins over whatever an actual run detected, since it's an
// explicit human decision (e.g. "blocked" or "retest", which no automated
// run can ever produce on its own).
export function localCaseStatus(r, caseResultsByPath, statusByPath, manualStatus) {
  const manual = manualStatus ? manualStatus[r.id] : undefined;
  if (manual) return manual.status;

  if (r.commented) return 'untested';

  const fileResults = caseResultsByPath ? caseResultsByPath[r.path] : undefined;
  if (!fileResults) return 'untested';

  let v = fileResults[numericId(r.id)];
  if (v !== 1 && v !== 5 && r.club) {
    for (const cid of r.club.split('|')) {
      const cv = fileResults[numericId(cid.trim())];
      if (cv === 1 || cv === 5) { v = cv; break; }
    }
  }

  if (v === 1) return 'passed';
  if (v === 5) return 'failed';

  const overall = statusByPath ? statusByPath[r.path] : undefined;
  if (overall === 'passed') return 'passed';
  if (overall === 'failed' || overall === 'killed') return 'failed';
  return 'untested';
}

// Tallies the manifest's own case rows against each file's most recent local
// Cypress result — same idea as the TestRail RunStatusCard's tallyFor.
// blocked/retest only ever come from manualStatus (no automated run produces
// them), but they're tallied here rather than folded into "untested" so a
// manually-blocked case is visibly distinct from one that's never run.
export function localRunTally(rows, caseResultsByPath, statusByPath, manualStatus) {
  const tally = { passed: 0, failed: 0, blocked: 0, retest: 0, untested: 0 };
  (rows || []).forEach((r) => { tally[localCaseStatus(r, caseResultsByPath, statusByPath, manualStatus)]++; });
  return tally;
}

export function formatDuration(ms) {
  if (!ms && ms !== 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

export function formatDateTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Time-only (no date) — used once runs are already grouped under a date
// heading, so the date itself doesn't need repeating on every row.
export function formatTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export const STATUS_LABEL = {
  queued: 'Queued',
  running: 'Running',
  passed: 'Passed',
  failed: 'Failed',
  killed: 'Killed',
  interrupted: 'Interrupted',
};

export function cyrStatusClass(status) {
  switch (status) {
    case 'passed': return 'cyr-passed';
    case 'failed': return 'cyr-failed';
    case 'running': return 'cyr-running';
    case 'queued': return 'cyr-queued';
    case 'killed': return 'cyr-killed';
    case 'interrupted': return 'cyr-interrupted';
    default: return 'cyr-unknown';
  }
}

// history is newest-first (unshift order), so the first entry seen for a
// given spec path is that file's most recent run — later (older) entries
// for the same path are skipped rather than merged over it.
export function latestCaseResultsForPaths(history, paths) {
  const pathSet = new Set(paths);
  const seenPaths = new Set();
  const merged = {};
  (history || []).forEach((h) => {
    if (!h.specPath || !pathSet.has(h.specPath) || seenPaths.has(h.specPath)) return;
    seenPaths.add(h.specPath);
    if (h.caseResults) Object.assign(merged, h.caseResults);
  });
  return merged;
}

// Overlays manual overrides onto an auto-detected resultMap (case id ->
// TestRail status id) before it's posted to TestRail — manual wins over
// whatever the local run itself produced, matching localCaseStatus's
// priority. `rows` should be the manifest rows the sync covers, so only
// cases actually in scope get merged in.
export function mergeManualIntoResultMap(resultMap, rows, manualStatus) {
  if (!manualStatus) return resultMap;
  const merged = { ...resultMap };
  (rows || []).forEach((r) => {
    const manual = manualStatus[r.id];
    if (manual && MANUAL_STATUS_TO_ID[manual.status]) {
      merged[numericId(r.id)] = MANUAL_STATUS_TO_ID[manual.status];
    }
  });
  return merged;
}

// Per-path variant of latestCaseResultsForPaths — used to color/tally each
// file card by its OWN most recent run, rather than merging many files'
// results into one combined map (that merge is only right for the batch
// sync-to-TestRail button, not for per-file display).
export function latestCaseResultsByPath(history) {
  const seenPaths = new Set();
  const byPath = {};
  (history || []).forEach((h) => {
    if (!h.specPath || seenPaths.has(h.specPath)) return;
    seenPaths.add(h.specPath);
    if (h.caseResults) byPath[h.specPath] = h.caseResults;
  });
  return byPath;
}

// Mirrors recentBuildStats (testcase-dashboard/helpers.js) but keyed on cyr's
// own lowercase statuses instead of Jenkins' uppercase SUCCESS/FAILURE/etc.
// 'interrupted' (server crashed mid-run) is deliberately excluded from both
// success and failure — it's not a real test outcome — leaving it in the
// implicit "other" bucket alongside 'killed' left out of failed... actually
// 'killed' (a user-requested stop) IS counted as a failure, matching how
// Jenkins' ABORTED counts as one; only 'interrupted' is excluded.
const CYR_TERMINAL_STATUSES = new Set(['passed', 'failed', 'killed', 'interrupted']);

export function cyrRecentRunStats(history, limit = 20) {
  const recent = (history || []).filter((h) => CYR_TERMINAL_STATUSES.has(h.status)).slice(0, limit);
  const success = recent.filter((h) => h.status === 'passed').length;
  const failed = recent.filter((h) => h.status === 'failed' || h.status === 'killed').length;
  const rate = recent.length ? Math.round((success / recent.length) * 100) : null;
  return { recent, success, failed, rate, lastAt: recent[0] ? (recent[0].completedAt || recent[0].startedAt) : null };
}

// Mirrors buildJobReportBlock's shape (testcase-dashboard/helpers.js) for the
// Jenkins flow, adapted to a Cypress run's own fields.
export function buildCyrReportText(h) {
  const verdict = h.status === 'passed' ? 'PASS' : (h.status === 'failed' ? 'FAIL' : String(h.status || 'UNKNOWN').toUpperCase());
  const statsStr = h.stats
    ? `${h.stats.passing} passed, ${h.stats.failing} failed${h.stats.pending ? `, ${h.stats.pending} pending` : ''}`
    : 'no pass/fail data';
  const lines = [
    `[${verdict}] ${h.specPath || 'all specs'}`,
    `${h.category ? h.category + ' — ' : ''}${h.browser || 'electron'}${h.headed ? ' (headed)' : ''}${h.environment ? ` — env: ${h.environment}` : ''}`,
    statsStr,
    `Started ${formatTime(h.startedAt)}${h.duration ? ` · took ${formatDuration(h.duration)}` : ''}`,
  ];
  if (h.testrailRunId) lines.push(`TestRail run #${h.testrailRunId}`);
  return lines.join('\n');
}

// Mirrors buildReportText's shape (testcase-dashboard/helpers.js) — a header
// + count + each job's own block, joined — but built on buildCyrReportText
// instead of the Jenkins-specific buildJobReportBlock.
export function buildCyrDateReportText(jobs, headerLabel) {
  if (!jobs || jobs.length === 0) return null;
  const lines = [`Cypress Run Report — ${headerLabel}`, `${jobs.length} run${jobs.length === 1 ? '' : 's'}`, ''];
  jobs.forEach((h) => { lines.push(buildCyrReportText(h)); lines.push(''); });
  return { text: lines.join('\n').trim(), count: jobs.length };
}

// ── Flakiness ────────────────────────────────────────────────────────────
// FileCard already flags an individual file as flaky inline (isFlakyTrend,
// same rule: recent runs flip pass/fail more than once), but that only
// surfaces once the tree is scrolled to that exact row. This surfaces the
// same verdict as one glanceable list, built from the same fileTrendMap
// CypressRunner.jsx already computes for the tree's trend dots.
export function cyrFlakySpecs(fileTrendMap) {
  return Object.keys(fileTrendMap || {})
    .filter((path) => isFlakyTrend(fileTrendMap[path]))
    .map((path) => ({ path, trend: fileTrendMap[path] }));
}

// ── Bug links ────────────────────────────────────────────────────────────
// Groups the flat caseId -> {bugId, updatedAt} store (server's bug-links.json)
// by ticket, since one ticket commonly covers several failing cases — sorted
// most-linked-first so the highest-impact bug surfaces at the top of the card.
export function cyrGroupBugLinks(bugLinks) {
  const groups = {};
  Object.entries(bugLinks || {}).forEach(([caseId, entry]) => {
    if (!entry || !entry.bugId) return;
    (groups[entry.bugId] = groups[entry.bugId] || []).push({ caseId, updatedAt: entry.updatedAt });
  });
  return Object.entries(groups)
    .map(([bugId, cases]) => ({ bugId, cases: cases.sort((a, b) => a.caseId.localeCompare(b.caseId)) }))
    .sort((a, b) => b.cases.length - a.cases.length || a.bugId.localeCompare(b.bugId));
}

// ── Duration tracking & ETA ──────────────────────────────────────────────
// 'interrupted' (server crashed mid-run) is excluded — its duration reflects
// however long the server happened to be down, not how long the spec itself
// takes to run.
const CYR_DURATION_STATUSES = new Set(['passed', 'failed', 'killed']);
const CYR_DURATION_SAMPLE_LIMIT = 5;
export const CYR_DEFAULT_ESTIMATE_MS = 30000;

// Rolling average duration per spec path — most-recent-first, capped at
// CYR_DURATION_SAMPLE_LIMIT samples so a spec that's recently sped up or
// slowed down is reflected quickly rather than smoothed out by old runs.
export function cyrAvgDurationByPath(history) {
  const byPath = {};
  (history || []).forEach((h) => {
    if (!h.specPath || !CYR_DURATION_STATUSES.has(h.status) || !h.duration) return;
    const arr = (byPath[h.specPath] = byPath[h.specPath] || []);
    if (arr.length < CYR_DURATION_SAMPLE_LIMIT) arr.push(h.duration);
  });
  const avg = {};
  Object.keys(byPath).forEach((p) => { avg[p] = byPath[p].reduce((a, b) => a + b, 0) / byPath[p].length; });
  return avg;
}

// Fallback for a spec with no local run history of its own yet — average of
// the last 50 terminal runs across every spec.
export function cyrGlobalAvgDuration(history) {
  const durations = (history || [])
    .filter((h) => CYR_DURATION_STATUSES.has(h.status) && h.duration)
    .slice(0, 50)
    .map((h) => h.duration);
  if (durations.length === 0) return null;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

// Estimated total ms to run this set of spec paths — used for both the live
// queue ETA and the "~Xm Ys" preview badges shown before anything's queued.
export function cyrEstimateDuration(paths, avgByPath, globalAvg) {
  const fallback = globalAvg || CYR_DEFAULT_ESTIMATE_MS;
  return (paths || []).reduce((sum, p) => sum + (avgByPath[p] || fallback), 0);
}

// "~2m 30s" / "~45s" — same rounding as formatDuration, prefixed so an
// estimate is never mistaken for a recorded duration at the call site.
export function formatEta(ms) {
  if (!ms || ms <= 0) return '~0s';
  return `~${formatDuration(ms)}`;
}

// ── Run comparison ───────────────────────────────────────────────────────
// history is newest-first, so the previous run of the same spec is simply
// the next entry after h's own index that shares its specPath.
export function findPreviousRun(history, h) {
  if (!h || !h.specPath) return null;
  const idx = (history || []).findIndex((x) => x.id === h.id);
  if (idx === -1) return null;
  for (let i = idx + 1; i < history.length; i++) {
    if (history[i].specPath === h.specPath) return history[i];
  }
  return null;
}

// Per-case diff between two runs of the same spec. 'from'/'to' are
// TestRail-style status ids (1=passed, 5=failed, undefined=not extracted),
// the same vocabulary cyrExtractCaseResults (server.js) produces.
export function diffCaseResults(currentResults, previousResults) {
  const cur = currentResults || {};
  const prev = previousResults || {};
  const ids = new Set([...Object.keys(cur), ...Object.keys(prev)]);
  const changed = [];
  let unchangedPass = 0, unchangedFail = 0;
  ids.forEach((id) => {
    const c = cur[id];
    const p = prev[id];
    if (c === p) {
      if (c === 1) unchangedPass++; else if (c === 5) unchangedFail++;
      return;
    }
    changed.push({ caseId: id, from: p, to: c });
  });
  changed.sort((a, b) => Number(a.caseId) - Number(b.caseId));
  return { changed, unchangedPass, unchangedFail };
}

// Pairs screenshots between two runs of the same spec by their relative
// name — Cypress's default screenshot naming is deterministic per spec +
// test title (plus a numeric suffix for multiple shots in one test), so the
// same failing test produces the same relative path run over run. Used by
// the compare-run modal's before/after gallery.
export function pairScreenshots(currentShots, previousShots) {
  const cur = currentShots || [];
  const prev = previousShots || [];
  const prevByName = new Map(prev.map((s) => [s.name, s]));
  const curNames = new Set(cur.map((s) => s.name));
  const paired = [];
  const onlyCurrent = [];
  cur.forEach((s) => {
    const p = prevByName.get(s.name);
    if (p) paired.push({ name: s.name, current: s, previous: p }); else onlyCurrent.push(s);
  });
  const onlyPrevious = prev.filter((s) => !curNames.has(s.name));
  return { paired, onlyCurrent, onlyPrevious };
}
