// Pure data helpers for Filter Rail — section tree indexing, filter
// matching, facet counting and sorting over a run's cached test rows.

export const NONE = '__none';

export const EMPTY_FILTERS = {
  status: [], assignee: [], tester: [], priority: [], type: [], label: [],
  automation: 'any', defects: 'any', results: 'any', from: '', to: '', q: '',
  // Labels are the one multi-valued field: 'any' = has at least one of the
  // picked labels, 'all' = has every one of them. Other dropdowns are always
  // "any of these" (a test has only one status, assignee, priority…).
  labelMode: 'any',
  // Cypress comparison bucket (cypressCompare.js CY_CATEGORIES key); only
  // applied while the comparison is switched on.
  cypress: '',
};

// Multi-select facets — `values` returns every value a row has for it, so
// a row with two labels counts under both.
export const FACETS = [
  { key: 'status', label: 'Status', values: (r) => [r.statusId] },
  { key: 'assignee', label: 'Assignee', values: (r) => [r.assignedTo ?? NONE] },
  { key: 'tester', label: 'Tested by', values: (r) => [r.testedBy ?? NONE] },
  { key: 'priority', label: 'Priority', values: (r) => [r.priorityId ?? NONE] },
  { key: 'type', label: 'Type', values: (r) => [r.typeId ?? NONE] },
  { key: 'label', label: 'Label', values: (r) => (r.labels.length ? r.labels : [NONE]) },
];

export function activeFilterCount(f) {
  let n = FACETS.reduce((s, d) => s + (f[d.key].length ? 1 : 0), 0);
  if (f.automation !== 'any') n++;
  if (f.defects !== 'any') n++;
  if (f.results !== 'any') n++;
  if (f.from || f.to) n++;
  if (f.q.trim()) n++;
  if (f.cypress) n++;
  return n;
}

function dayStartSec(dateStr) {
  return dateStr ? new Date(`${dateStr}T00:00:00`).getTime() / 1000 : null;
}

// Builds a matcher for every filter except the facet named in `skip`
// (used to count each facet's options against the *other* filters).
// Different filters always combine with AND. `cyCategory` (row -> Cypress
// comparison bucket) is passed only while the comparison is on.
export function buildMatcher(f, sectionSet, skip, cyCategory) {
  const terms = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const criteria = [];
  FACETS.filter((d) => d.key !== skip && f[d.key].length).forEach((d) => {
    const picked = f[d.key].map(String);
    if (d.key === 'label' && f.labelMode === 'all') {
      criteria.push((r) => { const have = new Set(d.values(r).map(String)); return picked.every((v) => have.has(v)); });
    } else {
      const set = new Set(picked);
      criteria.push((r) => d.values(r).some((v) => set.has(String(v))));
    }
  });
  if (f.automation !== 'any') criteria.push((r) => r.automation === (f.automation === 'yes'));
  if (f.defects !== 'any') criteria.push((r) => (r.defects.length > 0) === (f.defects === 'has'));
  if (f.results !== 'any') criteria.push((r) => (r.resultCount > 0) === (f.results === 'has'));
  if (f.cypress && cyCategory) criteria.push((r) => cyCategory(r) === f.cypress);
  if (f.from || f.to) {
    const from = dayStartSec(f.from);
    const to = f.to ? dayStartSec(f.to) + 86400 : null;
    criteria.push((r) => !!r.testedOn && (!from || r.testedOn >= from) && (!to || r.testedOn < to));
  }
  return (r) => {
    if (sectionSet && !sectionSet.has(r.sectionId)) return false;
    if (terms.length) {
      const hay = r._hay || (r._hay = [`t${r.id}`, `c${r.caseId}`, r.title, r.refs, r.comment, r.defects.join(' '), r.labels.join(' ')].join(' ').toLowerCase());
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return criteria.every((c) => c(r));
  };
}

// ── Sections ──

export function indexSections(sections) {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const children = new Map();
  sections.forEach((s) => {
    const p = byId.has(s.parentId) ? s.parentId : null;
    if (!children.has(p)) children.set(p, []);
    children.get(p).push(s);
  });
  children.forEach((list) => list.sort((a, b) => a.order - b.order || a.id - b.id));

  // Depth-first position, so sorting by section follows the tree's order.
  const position = new Map();
  const pathCache = new Map();
  let i = 0;
  const walk = (id) => (children.get(id) || []).forEach((s) => { position.set(s.id, i++); walk(s.id); });
  walk(null);

  const pathOf = (id) => {
    if (pathCache.has(id)) return pathCache.get(id);
    const parts = [];
    let s = byId.get(id);
    while (s) { parts.unshift(s.name); s = byId.get(s.parentId); }
    const p = parts.join(' › ');
    pathCache.set(id, p);
    return p;
  };
  const subtree = (id) => {
    const out = new Set([id]);
    const stack = [id];
    while (stack.length) (children.get(stack.pop()) || []).forEach((c) => { out.add(c.id); stack.push(c.id); });
    return out;
  };
  return { byId, children, position, pathOf, subtree };
}

// Per-section counts of the given rows, rolled up so each folder includes
// everything beneath it. Returns Map(sectionId -> { total, byStatus }).
export function rollupCounts(rows, idx) {
  const counts = new Map();
  const bump = (id, statusId) => {
    let c = counts.get(id);
    if (!c) { c = { total: 0, byStatus: {} }; counts.set(id, c); }
    c.total++;
    c.byStatus[statusId] = (c.byStatus[statusId] || 0) + 1;
  };
  rows.forEach((r) => {
    let s = idx.byId.get(r.sectionId);
    while (s) { bump(s.id, r.statusId); s = idx.byId.get(s.parentId); }
  });
  return counts;
}

// ── Columns & sorting ──

export const COLUMNS = [
  // Not a visible column: sorts by folder only, so "group by section" can
  // keep folders together while the user's own sorts apply inside each one.
  { key: '__group', label: 'Section group', hidden: true, sort: (r, ctx) => ctx.idx.position.get(r.sectionId) ?? 1e9 },
  { key: 'caseId', label: 'Case ID', sort: (r) => r.caseId, always: true },
  { key: 'id', label: 'Test ID', sort: (r) => r.id },
  { key: 'title', label: 'Title', sort: (r) => r.title.toLowerCase(), always: true },
  { key: 'section', label: 'Section', sort: (r, ctx) => (ctx.idx.position.get(r.sectionId) ?? 1e9) * 1e6 + r.order },
  { key: 'status', label: 'Status', sort: (r, ctx) => ctx.statusRank.get(r.statusId) ?? 99 },
  { key: 'assignee', label: 'Assignee', sort: (r, ctx) => ctx.userSortName(r.assignedTo) },
  { key: 'tester', label: 'Tested by', sort: (r, ctx) => ctx.userSortName(r.testedBy) },
  { key: 'testedOn', label: 'Tested on', sort: (r) => r.testedOn || 0 },
  { key: 'priority', label: 'Priority', sort: (r) => -(r.priorityId || 0) },
  { key: 'type', label: 'Type', sort: (r, ctx) => ctx.typeName(r.typeId) },
  { key: 'labels', label: 'Labels', sort: (r) => r.labels.join(',').toLowerCase() || '\uffff' },
  { key: 'refs', label: 'Refs', sort: (r) => r.refs.toLowerCase() || '\uffff' },
  { key: 'defects', label: 'Defects', sort: (r) => r.defects.length },
  { key: 'resultCount', label: 'Results', sort: (r) => r.resultCount },
  { key: 'elapsed', label: 'Elapsed', sort: (r) => elapsedSeconds(r.elapsed) },
  { key: 'automation', label: 'Automated', sort: (r) => (r.automation ? 0 : 1) },
  { key: 'version', label: 'Version', sort: (r) => r.version.toLowerCase() || '\uffff' },
  { key: 'comment', label: 'Last comment', sort: (r) => r.comment.toLowerCase() || '\uffff' },
  // Shown only while "Compare with Cypress" is on.
  { key: 'cypress', label: 'Cypress', compare: true, sort: (r, ctx) => ctx.cyRank(r) },
];

export const DEFAULT_COLUMNS = ['title', 'status', 'assignee', 'tester', 'testedOn', 'priority', 'labels', 'defects'];

export function elapsedSeconds(s) {
  if (!s) return -1;
  let total = 0;
  String(s).replace(/(\d+)\s*([hms])/g, (_, n, u) => { total += Number(n) * (u === 'h' ? 3600 : u === 'm' ? 60 : 1); return ''; });
  return total;
}

export function sortRows(rows, sorts, ctx) {
  const defs = sorts.map((s) => ({ get: COLUMNS.find((c) => c.key === s.key)?.sort, dir: s.dir === 'desc' ? -1 : 1 })).filter((d) => d.get);
  const sectionDef = COLUMNS.find((c) => c.key === 'section').sort;
  const keyed = rows.map((r) => ({ r, k: defs.map((d) => d.get(r, ctx)), tie: sectionDef(r, ctx) }));
  keyed.sort((a, b) => {
    for (let i = 0; i < defs.length; i++) {
      const x = a.k[i]; const y = b.k[i];
      if (x < y) return -defs[i].dir;
      if (x > y) return defs[i].dir;
    }
    return a.tie - b.tie || a.r.id - b.r.id;
  });
  return keyed.map((k) => k.r);
}

export function parseRunId(text) {
  const s = String(text || '');
  const m = s.match(/runs\/view\/(\d+)/) || s.match(/\bR?(\d+)\b/i);
  return m ? Number(m[1]) : null;
}

export function fmtTested(epochSec) {
  if (!epochSec) return '—';
  return new Date(epochSec * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function readLocal(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}
export function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* per-viewer convenience only */ }
}
