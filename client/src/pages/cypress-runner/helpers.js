// Pure helpers for the Cypress Runner page.

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
