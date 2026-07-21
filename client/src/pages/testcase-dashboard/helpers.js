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
