// Pure helpers for the Cypress Runner page.

import { numericId } from '../testcase-dashboard/helpers';

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
export function localCaseStatus(r, caseResultsByPath, statusByPath) {
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
export function localRunTally(rows, caseResultsByPath, statusByPath) {
  const tally = { passed: 0, failed: 0, untested: 0 };
  (rows || []).forEach((r) => { tally[localCaseStatus(r, caseResultsByPath, statusByPath)]++; });
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
