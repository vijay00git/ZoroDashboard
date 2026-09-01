// Pure helpers shared across the Test Case Dashboard components — ported
// from the standalone testcase-dashboard tool's inline script.

export const CAT_LABELS = { OFFLINE: 'Offline', ONLINE: 'Online', E2E: 'E2E / Appium' };
export const CAT_ORDER = ['OFFLINE', 'ONLINE', 'E2E'];
export const CAT_KEY = { Offline: 'OFFLINE', Online: 'ONLINE', E2E: 'E2E' };
export const CAT_TAG = { OFFLINE: 'offline', ONLINE: 'online', E2E: 'E2E' };

export function normCat(c) {
  return CAT_KEY[c] || String(c).toUpperCase();
}

export function numericId(id) {
  return String(id).replace(/^C/i, '');
}

export function basename(p) {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}

export function splitPath(p) {
  const i = p.lastIndexOf('/');
  if (i === -1) return { dir: '', base: p };
  return { dir: p.slice(0, i + 1), base: p.slice(i + 1) };
}

const STATUS_CLASS = {
  passed: 'st-passed', failed: 'st-failed', blocked: 'st-blocked',
  retest: 'st-retest', untested: 'st-untested',
};
export function statusClass(name) {
  return STATUS_CLASS[String(name).toLowerCase()] || 'st-other';
}

export function runStatusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'success') return 'rp-success';
  if (['failure', 'error', 'aborted'].includes(s)) return `rp-${s}`;
  if (s === 'building') return 'rp-building';
  if (s.includes('queued') || s === 'triggering') return 'rp-queued';
  return 'rp-unknown';
}

export function trendDotClass(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'SUCCESS') return 'dot-pass';
  if (s === 'FAILURE' || s === 'ERROR' || s === 'ABORTED') return 'dot-fail';
  return 'dot-other';
}

// A file is "flaky" when its recent runs flip between pass and fail more
// than once (P F P, F P F, ...) rather than settling one way — a single
// fail-then-fixed transition is just progress, not flakiness. Killed/errored
// runs (ABORTED/ERROR) are excluded from the sequence since they're
// inconclusive, not a real pass/fail verdict.
export function isFlakyTrend(trend) {
  if (!trend || trend.length < 3) return false;
  const relevant = trend
    .map((h) => String(h.status || '').toUpperCase())
    .filter((s) => s === 'SUCCESS' || s === 'FAILURE');
  if (relevant.length < 3) return false;
  let transitions = 0;
  for (let i = 1; i < relevant.length; i++) {
    if (relevant[i] !== relevant[i - 1]) transitions++;
  }
  return transitions >= 2;
}

export function formatDuration(ms) {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`;
}

export function formatDateTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function dateHeadingLabel(ms) {
  if (!ms) return 'Unknown date';
  const d = new Date(ms);
  const now = new Date();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function timeAgo(iso) {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  return `${Math.round(secs / 60)}m ago`;
}

export const STATUS_COLOR = {
  passed: 'var(--accent-green)', failed: 'var(--accent-red)', blocked: 'var(--accent-yellow)',
  retest: 'var(--accent-purple)', untested: 'var(--text-muted)', other: 'var(--border-hover)',
};

// The filter bar's status chips — order they render in, and the set FileTree
// checks `issueFilter` against to know it's a status (not commented/unknown).
export const STATUS_FILTER_ORDER = ['passed', 'failed', 'blocked', 'retest', 'untested'];
export const STATUS_FILTER_KEYS = new Set(STATUS_FILTER_ORDER);
export const STATUS_FILTER_LABELS = { passed: 'Passed', failed: 'Failed', blocked: 'Blocked', retest: 'Retest', untested: 'Untested' };

export function tallyFor(rows, runStatus) {
  const tally = { passed: 0, failed: 0, blocked: 0, retest: 0, untested: 0, other: 0 };
  let matched = 0;
  if (!runStatus) return { tally, matched };
  rows.forEach((r) => {
    const entry = runStatus.statuses[numericId(r.id)];
    if (!entry) return;
    matched++;
    const key = String(entry.status).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(tally, key)) tally[key]++; else tally.other++;
  });
  return { tally, matched };
}

export function statusSegments(tally) {
  return ['passed', 'failed', 'blocked', 'retest', 'untested', 'other']
    .map((k) => ({ value: tally[k], color: STATUS_COLOR[k] }));
}

// Green/yellow/red threshold used by any "percent healthy" tile (case
// cleanliness, build success rate, etc).
export function pctColor(pct) {
  if (pct == null) return 'var(--text-muted)';
  if (pct >= 95) return 'var(--accent-green)';
  if (pct >= 80) return 'var(--accent-yellow)';
  return 'var(--accent-red)';
}

// Deterministic tag -> color, so the same tag string always renders the same
// chip color everywhere it appears (no stored color, just a stable hash).
const TAG_COLOR_CLASSES = ['tag-c0', 'tag-c1', 'tag-c2', 'tag-c3', 'tag-c4', 'tag-c5'];
export function tagColorClass(tag) {
  let hash = 0;
  const s = String(tag || '');
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return TAG_COLOR_CLASSES[Math.abs(hash) % TAG_COLOR_CLASSES.length];
}

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILURE', 'ERROR', 'ABORTED']);

// Success-rate summary over the most recent N *completed* history entries
// (queued/building jobs have no status yet, so they're not counted).
export function recentBuildStats(history, limit = 20) {
  const recent = (history || []).filter((h) => TERMINAL_STATUSES.has(String(h.status || '').toUpperCase())).slice(0, limit);
  const success = recent.filter((h) => String(h.status).toUpperCase() === 'SUCCESS').length;
  const failed = recent.filter((h) => ['FAILURE', 'ERROR', 'ABORTED'].includes(String(h.status).toUpperCase())).length;
  const rate = recent.length ? Math.round((success / recent.length) * 100) : null;
  return { recent, success, failed, rate, lastAt: recent[0] ? (recent[0].completedAt || recent[0].startedAt) : null };
}

// ── Bug links ────────────────────────────────────────────────────────────
// Groups the flat caseId -> {bugId, updatedAt} store (server's bug-links.json)
// by ticket, since one ticket commonly covers several failing cases — sorted
// most-linked-first so the highest-impact bug surfaces at the top of the
// card. Mirrors cyrGroupBugLinks (cypress-runner/helpers.js) — both pages
// read/write the exact same bug-links.json.
export function tcdGroupBugLinks(bugLinks) {
  const groups = {};
  Object.entries(bugLinks || {}).forEach(([caseId, entry]) => {
    if (!entry || !entry.bugId) return;
    (groups[entry.bugId] = groups[entry.bugId] || []).push({ caseId, updatedAt: entry.updatedAt });
  });
  return Object.entries(groups)
    .map(([bugId, cases]) => ({ bugId, cases: cases.sort((a, b) => a.caseId.localeCompare(b.caseId)) }))
    .sort((a, b) => b.cases.length - a.cases.length || a.bugId.localeCompare(b.bugId));
}

// ── Duration tracking & ETA (Jenkins job queue) ─────────────────────────
// Mirrors cyrAvgDurationByPath/cyrGlobalAvgDuration/cyrEstimateDuration
// (cypress-runner/helpers.js) for the Jenkins-backed queue instead of local
// Cypress runs. ERROR is excluded from sampling since tcdRunToCompletion
// never sets `duration` on that path (it's thrown before a build number
// exists), so it would never contribute a real sample anyway.
const TCD_DURATION_STATUSES = new Set(['SUCCESS', 'FAILURE', 'ABORTED']);
const TCD_DURATION_SAMPLE_LIMIT = 5;
export const TCD_DEFAULT_ESTIMATE_MS = 90000;

// Rolling average duration per file path — most-recent-first, capped at
// TCD_DURATION_SAMPLE_LIMIT samples so a job that's recently sped up or
// slowed down is reflected quickly rather than smoothed out by old runs.
export function tcdAvgDurationByPath(history) {
  const byPath = {};
  (history || []).forEach((h) => {
    if (!h.path || !TCD_DURATION_STATUSES.has(String(h.status || '').toUpperCase()) || !h.duration) return;
    const arr = (byPath[h.path] = byPath[h.path] || []);
    if (arr.length < TCD_DURATION_SAMPLE_LIMIT) arr.push(h.duration);
  });
  const avg = {};
  Object.keys(byPath).forEach((p) => { avg[p] = byPath[p].reduce((a, b) => a + b, 0) / byPath[p].length; });
  return avg;
}

// Fallback for a file with no local build history yet — average of the last
// 50 terminal builds across every file.
export function tcdGlobalAvgDuration(history) {
  const durations = (history || [])
    .filter((h) => TCD_DURATION_STATUSES.has(String(h.status || '').toUpperCase()) && h.duration)
    .slice(0, 50)
    .map((h) => h.duration);
  if (durations.length === 0) return null;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

// Estimated total ms to run this set of file paths — used for the live queue
// ETA.
export function tcdEstimateDuration(paths, avgByPath, globalAvg) {
  const fallback = globalAvg || TCD_DEFAULT_ESTIMATE_MS;
  return (paths || []).reduce((sum, p) => sum + (avgByPath[p] || fallback), 0);
}

// "~2m" / "~45s" — prefixed so an estimate is never mistaken for a recorded
// duration at the call site.
export function formatEta(ms) {
  if (!ms || ms <= 0) return '~0s';
  return `~${formatDuration(ms) || '0s'}`;
}

export function buildTree(rows) {
  const tree = {};
  rows.forEach((r) => {
    const cat = normCat(r.cat);
    tree[cat] = tree[cat] || {};
    tree[cat][r.grp] = tree[cat][r.grp] || {};
    tree[cat][r.grp][r.path] = tree[cat][r.grp][r.path] || [];
    tree[cat][r.grp][r.path].push(r);
  });
  return tree;
}

// Groups every stored run by file, oldest first, so a trend strip reads
// left-to-right as a timeline.
export function buildFileTrendMap(history) {
  const byPath = {};
  (history || []).forEach((h) => {
    (byPath[h.path] = byPath[h.path] || []).push(h);
  });
  const map = {};
  Object.keys(byPath).forEach((p) => { map[p] = byPath[p].slice().reverse(); });
  return map;
}

export function isImageArtifact(name) {
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}

export function testRailCaseUrl(testrailUrl, id) {
  if (!testrailUrl) return null;
  return `${testrailUrl.replace(/\/+$/, '')}/index.php?/cases/view/${numericId(id)}`;
}

export const SORT_OPTIONS = [
  { key: 'name', label: 'Name' },
  { key: 'cases', label: 'Most cases' },
  { key: 'lastrun', label: 'Last run status' },
];

const LASTRUN_RANK = { fail: 0, other: 1, pass: 2, none: 3 };

// Comparator for the paths within one group. `filesByPath` maps path -> its
// (unfiltered) case rows, used for the "most cases" sort; `fileTrendMap`
// (from buildFileTrendMap) is used for "last run status" so failing files
// surface first.
export function fileSortComparator(sortMode, filesByPath, fileTrendMap) {
  const lastRunRank = (p) => {
    const trend = fileTrendMap[p];
    if (!trend || trend.length === 0) return LASTRUN_RANK.none;
    const key = trendDotClass(trend[trend.length - 1].status).replace('dot-', '');
    return LASTRUN_RANK[key] ?? LASTRUN_RANK.other;
  };
  return (a, b) => {
    if (sortMode === 'cases') return (filesByPath[b] || []).length - (filesByPath[a] || []).length;
    if (sortMode === 'lastrun') return lastRunRank(a) - lastRunRank(b);
    return a.localeCompare(b);
  };
}

export function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* no-op */ }
  ta.remove();
}

// Splits `text` into [before, match, after] around the first case-insensitive
// occurrence of `term`, for a React-safe <mark> highlight (no dangerouslySetInnerHTML).
export function highlightParts(text, term) {
  const s = String(text);
  if (!term) return [s, '', ''];
  const idx = s.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return [s, '', ''];
  return [s.slice(0, idx), s.slice(idx, idx + term.length), s.slice(idx + term.length)];
}

// YYYY-MM-DD in local time — used as both a lookup key and the value of a
// native <input type="date">, which requires exactly this format.
export function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function todayDateKey() {
  return dateKey(Date.now());
}

// Every history entry whose completion (or start/queue, if it never
// finished) falls on the given local calendar date, oldest first — the
// order a report reads best in.
export function filterHistoryByDate(history, dateStr) {
  return (history || [])
    .filter((h) => { const ts = h.completedAt || h.startedAt || h.queuedAt; return ts && dateKey(ts) === dateStr; })
    .slice().reverse();
}

export function formatReportDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return dateStr === todayDateKey() ? `Today — ${label}` : label;
}

// Shared by "copy report" and "send to Telegram" — same report, two
// destinations, and either a date's worth of jobs or a hand-picked set.
// Returns null when there's nothing to report.
// One job's block of the report — pulled out so it's reusable for a
// per-job Telegram message (each job sent as its own text + its own
// screenshots/CSV) without duplicating this formatting.
export function buildJobReportBlock(h) {
  const s = String(h.status || '').toUpperCase();
  const verdict = s === 'SUCCESS' ? 'PASS' : (['FAILURE', 'ERROR', 'ABORTED'].includes(s) ? 'FAIL' : (s || 'UNKNOWN'));
  const statsStr = h.testStats
    ? `${h.testStats.passes} passed, ${h.testStats.failures} failed${h.testStats.pending ? `, ${h.testStats.pending} pending` : ''}`
    : 'no pass/fail data';
  const lines = [
    `[${verdict}] ${h.path}`,
    `Job: ${h.jobName || '?'}${h.buildNumber ? ` #${h.buildNumber}` : ''}${h.runId ? ` | TestRail #${h.runId}` : ''}`,
    statsStr,
  ];
  if (h.buildUrl) lines.push(h.buildUrl);
  return lines.join('\n');
}

export function buildReportText(jobs, headerLabel) {
  if (!jobs || jobs.length === 0) return null;

  const lines = [`Test Run Report — ${headerLabel}`, `${jobs.length} job${jobs.length === 1 ? '' : 's'}`, ''];
  jobs.forEach((h) => { lines.push(buildJobReportBlock(h)); lines.push(''); });
  return { text: lines.join('\n').trim(), count: jobs.length };
}
