// Shared formatting + status helpers for the Test Runs page.

// Fixed color per TestRail status id, so a status keeps its color in every
// run and every chart. Custom statuses (id >= 6, e.g. "Not Applicable") take
// the next slot by id, never by how often they occur.
const STATUS_COLORS = {
  1: 'var(--accent-green)',   // Passed
  5: 'var(--accent-red)',     // Failed
  4: 'var(--accent-yellow)',  // Retest
  2: 'var(--accent-orange)',  // Blocked
  3: 'color-mix(in srgb, var(--text-muted) 45%, var(--bg-tertiary))', // Untested
};
const CUSTOM_COLORS = ['var(--accent-cyan)', 'var(--accent-pink)', 'var(--accent-purple)'];

// Display order: outcomes first, Untested last so the "done" part of every
// stacked bar starts at the left edge.
const STATUS_ORDER = [1, 5, 4, 2];

export function statusColor(id) {
  if (STATUS_COLORS[id]) return STATUS_COLORS[id];
  return CUSTOM_COLORS[Math.max(0, id - 6) % CUSTOM_COLORS.length];
}

// Ordered status list for a summary: every status the instance knows about,
// in display order.
export function orderedStatuses(summary) {
  const all = summary?.statuses || [];
  const byId = Object.fromEntries(all.map((s) => [s.id, s]));
  const known = STATUS_ORDER.filter((id) => byId[id]).map((id) => byId[id]);
  const custom = all.filter((s) => !STATUS_ORDER.includes(s.id) && !s.isUntested).sort((a, b) => a.id - b.id);
  const untested = all.filter((s) => s.isUntested);
  return [...known, ...custom, ...untested].map((s) => ({ ...s, color: statusColor(s.id) }));
}

export function statusLabel(summary, id) {
  return (summary?.statuses || []).find((s) => s.id === id)?.label || `Status ${id}`;
}

export function pct(n, d) {
  if (!d) return 0;
  return (n / d) * 100;
}

export function fmtPct(n, d) {
  if (!d) return '—';
  const v = pct(n, d);
  return `${v >= 99.95 || v === 0 ? v.toFixed(0) : v.toFixed(1)}%`;
}

export function fmtNum(n) {
  return (n || 0).toLocaleString();
}

export function fmtDateTime(epochSec) {
  if (!epochSec) return '—';
  return new Date(epochSec * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDate(epochSec) {
  if (!epochSec) return '—';
  return new Date(epochSec * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function timeAgo(iso) {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function userName(userNames, id) {
  if (id === 0) return 'No result on record';
  if (id === null || id === undefined) return 'Unassigned';
  return userNames?.[id] || `User #${id}`;
}

// Accepts "8941, 8950 R9001\nruns/view/9002" — anything numeric.
export function parseRunIds(text) {
  const ids = (String(text).match(/\d+/g) || []).map(Number).filter((n) => n > 0);
  return [...new Set(ids)];
}

export function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename, header, rows) {
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
