import { useCallback, useEffect, useMemo, useState } from 'react';
import { Play, Copy, Download, X, RefreshCw, History, CheckCheck, ExternalLink, CloudDownload, Save, Trash2 } from 'lucide-react';
import CaseDetailDrawer from './CaseDetailDrawer';
import RunPreviewModal from './RunPreviewModal';
import { showPrompt, showConfirm } from '../../utils/Alerts';
import { testRailCaseUrl, copyText, normCat, CAT_ORDER, CAT_LABELS, versionTagsForPath, caseRunItems, CASE_EVENT_STYLE, CAT_COLOR } from './helpers';
import './CaseTable.css';

const short = (p) => String(p || '').replace('cypress/e2e/functional_tests/Regression/', '');
const ago = (ms, now) => {
  if (!ms || !now) return '';
  const d = (now - ms) / 86400000;
  if (d < 1 / 24) return `${Math.max(1, Math.round(d * 1440))}m ago`;
  if (d < 1) return `${Math.round(d * 24)}h ago`;
  return `${Math.round(d)}d ago`;
};
const STATUSES = ['passed', 'failed', 'blocked', 'retest', 'untested', 'none'];
const EVENT_TEXT = Object.fromEntries(Object.entries(CASE_EVENT_STYLE).map(([k, v]) => [k, v.short]));
const evColor = (t) => (CASE_EVENT_STYLE[t] || {}).color || 'var(--text-secondary)';
// TestRail status label → our status chip class.
const trClass = (s) => {
  const v = String(s || '').toLowerCase();
  return ['passed', 'failed', 'blocked', 'retest', 'untested'].includes(v) ? v : 'none';
};
// The case's entry for the chosen synced run ('' = most recent sync).
const trEntry = (c, runId) => (runId ? (c.testrail || []).find((e) => String(e.runId) === String(runId)) : (c.testrail || [])[0]) || null;
const FLAGS = [
  ['moved', 'Moved', (c) => !!c.tracking.movedFrom],
  ['missing', 'Missing / not in spec', (c) => c.unresolved || c.tracking.status === 'missing'],
  ['commented', 'Commented out', (c) => c.commented],
  ['multi', 'In 2+ specs', (c) => c.multiSpec],
  ['shared', 'Shared spec', (c) => c.sharedSpec],
  ['flaky', 'Flaky (own runs)', (c) => c.local.flaky],
  ['never', 'Never run locally', (c) => c.local.runs === 0],
  ['bug', 'Has bug', (c) => !!(c.bugs.local || c.bugs.jenkins)],
  ['note', 'Has note', (c) => !!c.note],
  ['deps', 'Has deps', (c) => c.deps.length > 0],
  ['changed7', 'Changed in 7d', (c, now) => !!c.lastEvent && now - Date.parse(c.lastEvent.at) < 7 * 86400000],
  ['setup', 'Setup warning', (c) => c.setupWarnings.length > 0],
  ['trMismatch', 'TestRail ≠ local', (c, now, trRun) => {
    const t = trClass((trEntry(c, trRun) || {}).status);
    const l = (c.local.last || {}).result;
    return (t === 'passed' || t === 'failed') && (l === 'passed' || l === 'failed') && t !== l;
  }],
  ['retired', 'Retired', (c) => !!c.retired],
];
const SORTS = {
  id: (a, b) => a.id.localeCompare(b.id),
  title: (a, b) => a.title.localeCompare(b.title),
  lastRunDesc: (a, b) => ((b.local.last || {}).at || 0) - ((a.local.last || {}).at || 0),
  lastRunAsc: (a, b) => ((a.local.last || {}).at || 0) - ((b.local.last || {}).at || 0),
  fails: (a, b) => b.local.fails - a.local.fails,
  events: (a, b) => b.events - a.events,
  addedAt: (a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')),
};
const DEFAULT_FILTERS = {
  trRun: '', trStatus: '',
  q: '', cats: [], grp: '', status: '', last: '', flags: [], tag: '', source: '', stale: '', sort: 'id', groupBy: 'grp',
};
const PAGE = 150;

// Test-ID view shared by Jenkins Runner and Cypress Runner (case mode). The
// page supplies how a case's status is decided (TestRail run / manual / local)
// and what "run" means (Jenkins build vs local queue).
const CaseTable = ({ storageKey, statusOf, statusSource, testrailUrl, onRunCases, runLabel, runTarget = 'local', environment, onOpenHistory, showToast, refreshKey }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(() => {
    try { return { ...DEFAULT_FILTERS, ...JSON.parse(localStorage.getItem(storageKey) || '{}') }; } catch { return DEFAULT_FILTERS; }
  });
  const [selected, setSelected] = useState(() => new Set());
  const [limit, setLimit] = useState(PAGE);
  const [detailId, setDetailId] = useState(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [syncRunId, setSyncRunId] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const viewsKey = `${storageKey}-views`;
  const [views, setViews] = useState(() => { try { return JSON.parse(localStorage.getItem(viewsKey) || '{}'); } catch { return {}; } });
  const [currentView, setCurrentView] = useState('');

  const load = useCallback(() => {
    fetch('/api/cases/overview', { cache: 'no-store' })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error || 'Failed to load cases');
        setData(body);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, []);
  // Reloads whenever the page's own poll brings new data (refreshKey).
  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(filters)); } catch { /* storage unavailable */ }
  }, [filters, storageKey]);

  const set = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setLimit(PAGE); };
  const toggleIn = (k, v) => set(k, filters[k].includes(v) ? filters[k].filter((x) => x !== v) : [...filters[k], v]);

  const cases = useMemo(() => (data ? data.cases : []), [data]);
  // "Now" = when the overview was built, so renders stay pure.
  const now = data ? Date.parse(data.generatedAt) : 0;
  const withStatus = useMemo(() => cases.map((c) => {
    const vtags = Array.from(new Set(c.livePaths.flatMap(versionTagsForPath)));
    return { ...c, __vtags: vtags, tags: Array.from(new Set([...c.tags, ...vtags])), __status: statusOf ? statusOf(c) || 'none' : 'none' };
  }), [cases, statusOf]);

  const options = useMemo(() => ({
    groups: [...new Set(withStatus.map((c) => c.grp))].sort(),
    tags: [...new Set(withStatus.flatMap((c) => c.tags))].sort(),
    sources: [...new Set(withStatus.map((c) => c.source).filter(Boolean))].sort(),
  }), [withStatus]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const ids = q ? new Set((q.toUpperCase().match(/C\d{5,}/g) || [])) : null;
    const staleMs = filters.stale ? Number(filters.stale) * 86400000 : 0;
    const showRetired = filters.flags.includes('retired');
    const out = withStatus.filter((c) => {
      // Retired cases only appear when the Retired chip is on.
      if (!!c.retired !== showRetired) return false;
      if (q) {
        if (ids && ids.size > 1) { if (!ids.has(c.id)) return false; } else {
          const hay = `${c.id} ${c.title} ${c.grp} ${c.paths.join(' ')} ${c.tags.join(' ')} ${c.note} ${c.manifestNote} ${c.club}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
      }
      if (filters.cats.length && !filters.cats.includes(normCat(c.cat || ''))) return false;
      if (filters.grp && c.grp !== filters.grp) return false;
      if (filters.status && c.__status !== filters.status) return false;
      if (filters.last === 'passed' && (c.local.last || {}).result !== 'passed') return false;
      if (filters.last === 'failed' && (c.local.last || {}).result !== 'failed') return false;
      if (filters.last === 'never' && c.local.last) return false;
      if (filters.tag && !c.tags.includes(filters.tag)) return false;
      if (filters.source && c.source !== filters.source) return false;
      if (filters.trStatus) {
        const e = trEntry(c, filters.trRun);
        if ((e ? e.status : 'Not synced') !== filters.trStatus) return false;
      }
      if (staleMs) {
        const lastAt = Math.max((c.local.last || {}).at || 0, (c.jenkins.last || {}).at || 0);
        if (lastAt && now - lastAt < staleMs) return false;
      }
      for (const f of filters.flags) {
        const def = FLAGS.find(([k]) => k === f);
        if (def && !def[2](c, now, filters.trRun)) return false;
      }
      return true;
    });
    if (filters.sort === 'status') out.sort((a, b) => STATUSES.indexOf(a.__status) - STATUSES.indexOf(b.__status) || a.id.localeCompare(b.id));
    else out.sort(SORTS[filters.sort] || SORTS.id);
    return out;
  }, [withStatus, filters, now]);

  const stats = useMemo(() => {
    const active = withStatus.filter((c) => !c.retired);
    const s = { total: active.length, passed: 0, failed: 0, blocked: 0, retest: 0, untested: 0, none: 0 };
    active.forEach((c) => { s[c.__status] = (s[c.__status] || 0) + 1; });
    FLAGS.forEach(([k, , fn]) => { s[k] = (k === 'retired' ? withStatus : active).filter((c) => fn(c, now, filters.trRun)).length; });
    s.tr = {};
    active.forEach((c) => { const e = trEntry(c, filters.trRun); const k = e ? e.status : 'Not synced'; s.tr[k] = (s.tr[k] || 0) + 1; });
    return s;
  }, [withStatus, now, filters.trRun]);

  const groupKey = (c) => {
    if (filters.groupBy === 'grp') return c.grp;
    if (filters.groupBy === 'cat') return CAT_LABELS[normCat(c.cat || '')] || c.cat || '—';
    if (filters.groupBy === 'spec') return short(c.path) || '(not in any spec)';
    if (filters.groupBy === 'status') return c.__status;
    return null;
  };

  const visible = filtered.slice(0, limit);
  const rowsWithHeaders = [];
  if (filters.groupBy !== 'none') {
    const counts = {};
    filtered.forEach((c) => { const k = groupKey(c); counts[k] = (counts[k] || 0) + 1; });
    const sorted = [...visible].sort((a, b) => String(groupKey(a)).localeCompare(String(groupKey(b))));
    let last = null;
    sorted.forEach((c) => {
      const k = groupKey(c);
      if (k !== last) { rowsWithHeaders.push({ header: k, count: counts[k] }); last = k; }
      rowsWithHeaders.push(c);
    });
  } else visible.forEach((c) => rowsWithHeaders.push(c));

  const toggle = (id) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAllFiltered = () => setSelected(new Set(filtered.map((c) => c.id)));
  const selectedCases = withStatus.filter((c) => selected.has(c.id));
  const runnable = (list) => list.filter((c) => !c.unresolved && !c.commented);
  const specCount = (list) => new Set(runnable(list).flatMap((c) => (c.pinned && c.pinned.length ? c.pinned : c.livePaths))).size;

  const exportCsv = (list) => {
    const head = ['Case ID', 'Title', 'Group', 'Category', 'Status', 'TestRail run', 'TestRail status', 'Last local', 'Last local at', 'Local runs', 'Local fails', 'Last Jenkins', 'Last Jenkins at', 'Spec', 'Flags', 'Tags', 'Bug', 'Source', 'Added'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = list.map((c) => [
      c.id, c.title, c.grp, c.cat, c.__status, (trEntry(c, filters.trRun) || {}).runId || '', (trEntry(c, filters.trRun) || {}).status || '', (c.local.last || {}).result || '', c.local.last ? new Date(c.local.last.at).toISOString() : '',
      c.local.runs, c.local.fails, (c.jenkins.last || {}).status || '', c.jenkins.last ? new Date(c.jenkins.last.at).toISOString() : '',
      c.paths.join(' | '), FLAGS.filter(([, , fn]) => fn(c, now, filters.trRun)).map(([, l]) => l).join('; '), c.tags.join('; '),
      [c.bugs.local && c.bugs.local.bugId, c.bugs.jenkins && c.bugs.jenkins.bugId].filter(Boolean).join('; '), c.source, c.addedAt,
    ].map(esc).join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `test-ids-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── TestRail sync ──
  const syncRun = async () => {
    const id = syncRunId.trim();
    if (!id) return;
    setSyncing(true); setSyncMsg('');
    try {
      const res = await fetch('/api/cases/testrail-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId: id }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Sync failed');
      setSyncMsg(`Synced run ${body.runId}${body.runName ? ` (${body.runName})` : ''}: ${Object.entries(body.counts).map(([k, v]) => `${v} ${k}`).join(', ')}`);
      setSyncRunId('');
      set('trRun', '');
      load();
    } catch (e) {
      setSyncMsg(`Error: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };
  const forgetRun = async (runId) => {
    if (!runId || !(await showConfirm(`Forget synced TestRail run ${runId}? Its statuses are removed from every case's history.`))) return;
    await fetch('/api/cases/testrail-sync/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runId }) });
    set('trRun', '');
    load();
  };

  // ── Saved views (filters only; per page, in this browser) ──
  const persistViews = (v) => { setViews(v); try { localStorage.setItem(viewsKey, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  const saveView = async () => {
    const name = (await showPrompt('Name this view', currentView || '') || '').trim();
    if (!name) return;
    persistViews({ ...views, [name]: { ...filters } });
    setCurrentView(name);
  };
  const applyView = (name) => {
    setCurrentView(name);
    if (name && views[name]) { setFilters({ ...DEFAULT_FILTERS, ...views[name] }); setLimit(PAGE); }
  };
  const deleteView = async () => {
    if (!currentView || !(await showConfirm(`Delete view "${currentView}"?`))) return;
    const v = { ...views }; delete v[currentView];
    persistViews(v); setCurrentView('');
  };

  // Every run goes through the preview first.
  const startRun = (list) => {
    const items = caseRunItems(runnable(list));
    if (items.length) setPreview(items);
  };

  const markReviewed = async () => {
    await fetch('/api/testcases/case-tracking/mark-reviewed', { method: 'POST' }).catch(() => {});
    load();
  };

  if (error) return <div className="tcd-conn-banner">Couldn't load the test-ID view: {error}</div>;
  if (!data) return <p className="tcd-modal-hint">Loading test IDs…</p>;
  if (data.mode !== 'cases') return <p className="tcd-modal-hint">Case manifest not set up — the test-ID view needs <code>~/.claude/ic-tokyo-case-manifest.json</code>.</p>;

  const alerts = data.trackingAlerts || [];
  const detail = detailId ? withStatus.find((c) => c.id === detailId) : null;
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => !['sort', 'groupBy'].includes(k) && (Array.isArray(v) ? v.length : v)).length;

  return (
    <div className="ct-wrap">
      {alerts.length > 0 && (
        <div className="ct-alerts">
          <div className="ct-alerts-head">
            <strong>{alerts.length} test ID change{alerts.length === 1 ? '' : 's'} since you last reviewed</strong>
            <span className="ct-muted">
              {Object.entries(alerts.reduce((m, a) => { m[a.type] = (m[a.type] || 0) + 1; return m; }, {})).map(([t, n]) => (
                <span key={t} className="ct-ev-chip" style={{ color: evColor(t), marginRight: 4 }}>{n} {EVENT_TEXT[t] || t}</span>
              ))}
            </span>
            <span style={{ flex: 1 }} />
            <button type="button" className="tcd-btn" onClick={() => setAlertsOpen((v) => !v)}>{alertsOpen ? 'Hide' : 'Show'}</button>
            {onOpenHistory && <button type="button" className="tcd-btn" onClick={onOpenHistory}><History size={13} /> Full history</button>}
            <button type="button" className="tcd-btn primary" onClick={markReviewed}><CheckCheck size={13} /> Mark reviewed</button>
          </div>
          {alertsOpen && (
            <ul>
              {alerts.map((a) => (
                <li key={a.id}>
                  <code>{a.caseId}</code> <span className="ct-ev" style={{ color: evColor(a.type) }}>{EVENT_TEXT[a.type] || a.type}</span>
                  {a.type === 'case_moved' ? <> — <code>{short(a.from)}</code> → <code>{short(a.path)}</code></> : <> — <code>{short(a.path)}</code></>}
                  {a.reason ? ` (${a.reason})` : ''} <span className="ct-muted">· {new Date(a.detectedAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="ct-stats">
        <span className={`ct-stat${!filters.status && !filters.flags.length ? ' active' : ''}`} onClick={() => { set('status', ''); set('flags', []); }}>Owned <b>{stats.total}</b></span>
        {['passed', 'failed', 'blocked', 'retest', 'untested', 'none'].map((s) => (
          <span key={s} className={`ct-stat s-${s}${filters.status === s ? ' active' : ''}`} onClick={() => set('status', filters.status === s ? '' : s)}>
            {s === 'none' ? 'No status' : s[0].toUpperCase() + s.slice(1)} <b>{stats[s] || 0}</b>
          </span>
        ))}
        {['moved', 'missing', 'flaky', 'never', 'shared', 'multi'].map((k) => (
          <span key={k} className={`ct-stat f-${k}${filters.flags.includes(k) ? ' active' : ''}`} onClick={() => toggleIn('flags', k)}>
            {FLAGS.find(([x]) => x === k)[1]} <b>{stats[k]}</b>
          </span>
        ))}
        <span className="ct-muted" style={{ fontSize: '0.74rem', alignSelf: 'center' }}>Status from: {statusSource} · {data.specCount} specs</span>
      </div>

      <div className="ct-filters">
        <span className="ct-muted" style={{ fontSize: '0.76rem' }}>TestRail:</span>
        <input style={{ width: 110 }} placeholder="Run ID" value={syncRunId} onChange={(e) => setSyncRunId(e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') syncRun(); }} />
        <button type="button" className="tcd-btn primary" disabled={syncing || !syncRunId} onClick={syncRun} title="Pull this run's status for every owned case and keep it in the case history">
          <CloudDownload size={13} /> {syncing ? 'Syncing…' : 'Sync run'}
        </button>
        <select value={filters.trRun} onChange={(e) => set('trRun', e.target.value)} title="Which synced run the TestRail column shows">
          <option value="">Column: latest synced run{(data.testrailRuns || [])[0] ? ` (#${data.testrailRuns[0].runId})` : ''}</option>
          {(data.testrailRuns || []).map((r) => (
            <option key={r.runId} value={r.runId}>#{r.runId} {r.runName} — {new Date(r.syncedAt).toLocaleDateString()}</option>
          ))}
        </select>
        {filters.trRun && <button type="button" className="tcd-btn" onClick={() => forgetRun(filters.trRun)} title="Forget this synced run"><Trash2 size={13} /></button>}
        <select value={filters.trStatus} onChange={(e) => set('trStatus', e.target.value)} title="Filter by status in that run">
          <option value="">Any TestRail status</option>
          {Object.entries(stats.tr).sort((a, b) => b[1] - a[1]).map(([k, v]) => <option key={k} value={k}>{k} ({v})</option>)}
        </select>
        {syncMsg && <span className="ct-muted" style={{ fontSize: '0.76rem' }}>{syncMsg}</span>}
        <span style={{ flex: 1 }} />
        <span className="ct-muted" style={{ fontSize: '0.76rem' }}>Views:</span>
        <select value={currentView} onChange={(e) => applyView(e.target.value)}>
          <option value="">{Object.keys(views).length ? 'Choose a saved view…' : 'No saved views'}</option>
          {Object.keys(views).sort().map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <button type="button" className="tcd-btn" onClick={saveView} title={currentView ? `Save current filters as "${currentView}" (or a new name)` : 'Save current filters as a view'}><Save size={13} /> Save view</button>
        {currentView && <button type="button" className="tcd-btn" onClick={deleteView} title={`Delete "${currentView}"`}><Trash2 size={13} /></button>}
      </div>
      <div className="ct-filters">
        <input className="ct-search" placeholder="Search ID, title, spec, group, tag, note… (press /; paste several IDs to list just those)" value={filters.q} onChange={(e) => set('q', e.target.value)} />
        <select value={filters.grp} onChange={(e) => set('grp', e.target.value)}>
          <option value="">All groups</option>
          {options.groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s === 'none' ? 'No status' : s}</option>)}
        </select>
        <select value={filters.last} onChange={(e) => set('last', e.target.value)}>
          <option value="">Any last local result</option>
          <option value="passed">Last local: passed</option>
          <option value="failed">Last local: failed</option>
          <option value="never">Never run locally</option>
        </select>
        <select value={filters.stale} onChange={(e) => set('stale', e.target.value)}>
          <option value="">Any run date</option>
          {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>Not run in {d} day{d === 1 ? '' : 's'}</option>)}
        </select>
        {options.tags.length > 0 && (
          <select value={filters.tag} onChange={(e) => set('tag', e.target.value)}>
            <option value="">Any tag</option>
            {options.tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <select value={filters.source} onChange={(e) => set('source', e.target.value)}>
          <option value="">Any source</option>
          {options.sources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.sort} onChange={(e) => set('sort', e.target.value)} title="Sort">
          <option value="id">Sort: ID</option>
          <option value="title">Sort: title</option>
          <option value="status">Sort: status</option>
          <option value="lastRunDesc">Sort: last run (newest)</option>
          <option value="lastRunAsc">Sort: last run (oldest)</option>
          <option value="fails">Sort: most local fails</option>
          <option value="events">Sort: most changes</option>
          <option value="addedAt">Sort: recently owned</option>
        </select>
        <select value={filters.groupBy} onChange={(e) => set('groupBy', e.target.value)} title="Group rows">
          <option value="grp">Group by: group</option>
          <option value="cat">Group by: category</option>
          <option value="spec">Group by: spec</option>
          <option value="status">Group by: status</option>
          <option value="none">No grouping</option>
        </select>
        <button type="button" className="tcd-btn" onClick={load} title="Refresh"><RefreshCw size={13} /></button>
        {activeFilterCount > 0 && <button type="button" className="tcd-btn" onClick={() => { setFilters({ ...DEFAULT_FILTERS, sort: filters.sort, groupBy: filters.groupBy }); setLimit(PAGE); }}><X size={13} /> Clear {activeFilterCount}</button>}
      </div>
      <div className="ct-chips">
        {CAT_ORDER.map((cat) => (
          <span key={cat} className={`ct-chip${filters.cats.includes(cat) ? ' on' : ''}`} style={filters.cats.includes(cat) ? undefined : { color: CAT_COLOR[cat], borderColor: CAT_COLOR[cat] }} onClick={() => toggleIn('cats', cat)}>{CAT_LABELS[cat]}</span>
        ))}
        <span className="ct-muted" style={{ fontSize: '0.74rem' }}>|</span>
        {FLAGS.map(([k, label]) => (
          <span key={k} className={`ct-chip${filters.flags.includes(k) ? ' on' : ''}`} onClick={() => toggleIn('flags', k)}>{label} ({stats[k]})</span>
        ))}
      </div>

      <div className="ct-bulk">
        <span><b>{filtered.length}</b> of {stats.total} shown{selected.size ? <> · <b>{selected.size}</b> selected</> : ''}</span>
        <button type="button" className="tcd-btn" onClick={selectAllFiltered} disabled={!filtered.length}>Select all shown</button>
        {selected.size > 0 && <button type="button" className="tcd-btn" onClick={() => setSelected(new Set())}><X size={13} /> Clear selection</button>}
        <span style={{ flex: 1 }} />
        {onRunCases && (
          <button type="button" className="tcd-btn primary" disabled={!runnable(selectedCases).length} onClick={() => startRun(selectedCases)}
            title="Each spec runs once, filtered to the selected IDs plus its @setup/precondition blocks and any dependencies">
            <Play size={13} /> {runnable(selectedCases).length ? `${runLabel || 'Run'}: ${runnable(selectedCases).length} case${runnable(selectedCases).length === 1 ? '' : 's'} in ${specCount(selectedCases)} spec${specCount(selectedCases) === 1 ? '' : 's'}` : `${runLabel || 'Run'} (select cases)`}
          </button>
        )}
        <button type="button" className="tcd-btn" disabled={!filtered.length} onClick={() => { copyText((selected.size ? selectedCases : filtered).map((c) => c.id).join(', ')); if (showToast) showToast('Copied IDs', 'success'); }}>
          <Copy size={13} /> Copy IDs
        </button>
        <button type="button" className="tcd-btn" disabled={!filtered.length} onClick={() => exportCsv(selected.size ? selectedCases : filtered)}>
          <Download size={13} /> CSV
        </button>
      </div>

      <div className="ct-table-wrap">
        <table className="ct-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}>
                <input type="checkbox" aria-label="Select all shown" checked={filtered.length > 0 && filtered.every((c) => selected.has(c.id))}
                  onChange={(e) => (e.target.checked ? selectAllFiltered() : setSelected(new Set()))} />
              </th>
              <th onClick={() => set('sort', 'id')}>Test ID</th>
              <th onClick={() => set('sort', 'title')}>Title / spec</th>
              <th onClick={() => set('sort', 'status')}>Status</th>
              <th title={filters.trRun ? `TestRail run #${filters.trRun}` : 'Latest synced TestRail run'}>TestRail{filters.trRun ? ` #${filters.trRun}` : ''}</th>
              <th onClick={() => set('sort', 'lastRunDesc')}>Local (last 10)</th>
              <th>Jenkins</th>
              <th onClick={() => set('sort', 'events')}>Flags</th>
              <th>Tags / bug</th>
            </tr>
          </thead>
          <tbody>
            {rowsWithHeaders.map((c) => (c.header !== undefined ? (
              <tr key={`h-${c.header}`} className="ct-group-row"><td colSpan={9}>{c.header}<span className="ct-count">{c.count}</span></td></tr>
            ) : (
              <tr key={c.id} className={`ct-row${selected.has(c.id) ? ' sel' : ''}`} onClick={() => setDetailId(c.id)}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.id}`} />
                </td>
                <td className="ct-id">
                  {c.id}
                  {testRailCaseUrl(testrailUrl, c.id) && (
                    <a href={testRailCaseUrl(testrailUrl, c.id)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Open in TestRail" style={{ marginLeft: 4 }}>
                      <ExternalLink size={11} />
                    </a>
                  )}
                  <div><span className="ct-cat" style={{ color: CAT_COLOR[normCat(c.cat || '')] || 'var(--text-muted)' }}>{c.cat || '—'}</span></div>
                </td>
                <td className="ct-title">
                  {c.title || <span className="ct-muted">(not found in any spec)</span>}
                  <div className="ct-sub">{c.paths.length ? short(c.path) : '—'}{c.paths.length > 1 ? ` +${c.paths.length - 1}` : ''}</div>
                </td>
                <td>
                  <span className={`ct-status ${c.__status}`}>{c.__status === 'none' ? '—' : c.__status}</span>
                  {(c.manual.local || c.manual.jenkins) && <div className="ct-sub">manual</div>}
                </td>
                <td>
                  {(() => {
                    const e = trEntry(c, filters.trRun);
                    if (!e) return <span className="ct-muted">—</span>;
                    return (
                      <>
                        <span className={`ct-status ${trClass(e.status)}`} title={e.runName}>{e.status}</span>
                        <div className="ct-sub" style={{ whiteSpace: 'nowrap' }} title={e.runName}>#{e.runId}{c.testrail.length > 1 ? ` · ${c.testrail.length} runs` : ''}</div>
                      </>
                    );
                  })()}
                </td>
                <td>
                  <span className="ct-dots" title={c.local.recent.join(', ') || 'never run locally'}>
                    {c.local.recent.slice().reverse().map((r, i) => <span key={i} className={`ct-dot ${r}`} />)}
                  </span>
                  <div className="ct-sub">{c.local.last ? `${c.local.last.result} ${ago(c.local.last.at, now)}` : 'never'}{c.local.runs ? ` · ${c.local.passes}/${c.local.runs}` : ''}</div>
                </td>
                <td>
                  {c.jenkins.last ? (
                    <>
                      <span className={`ct-status ${String(c.jenkins.last.status).toLowerCase() === 'success' ? 'passed' : ['failure', 'error', 'unstable'].includes(String(c.jenkins.last.status).toLowerCase()) ? 'failed' : 'none'}`}>{String(c.jenkins.last.status).toLowerCase()}</span>
                      <div className="ct-sub" style={{ whiteSpace: 'nowrap' }}>{ago(c.jenkins.last.at, now)}{c.jenkins.last.narrowed ? '' : ' · spec'}</div>
                    </>
                  ) : <span className="ct-muted">—</span>}
                </td>
                <td>
                  <div className="ct-badges">
                    {c.tracking.movedFrom && <span className="ct-badge orange" title={`from ${short(c.tracking.movedFrom)}`}>moved {c.tracking.movedAt ? ago(Date.parse(c.tracking.movedAt), now) : ''}</span>}
                    {(c.unresolved || c.tracking.status === 'missing') && <span className="ct-badge red">missing</span>}
                    {c.commented && <span className="ct-badge yellow">commented</span>}
                    {c.multiSpec && <span className="ct-badge cyan">{c.livePaths.length} specs{c.pinned ? ' 📌' : ''}</span>}
                    {c.sharedSpec && <span className="ct-badge">shared</span>}
                    {c.local.flaky && <span className="ct-badge orange">flaky</span>}
                    {c.deps.length > 0 && <span className="ct-badge purple">+{c.deps.length} dep</span>}
                    {c.setupWarnings.length > 0 && <span className="ct-badge red">setup?</span>}
                    {c.events > 0 && <span className="ct-badge" title="Tracker events">{c.events} ev</span>}
                  </div>
                </td>
                <td>
                  <div className="ct-badges">
                    {c.tags.map((t) => <span key={t} className={`ct-badge ${c.__vtags.includes(t) ? 'cyan' : 'purple'}`} title={c.__vtags.includes(t) ? 'From the spec folder' : 'Tag'}>{t}</span>)}
                    {c.bugs.local && <span className="ct-badge red">{c.bugs.local.bugId}</span>}
                    {c.bugs.jenkins && <span className="ct-badge red">{c.bugs.jenkins.bugId}</span>}
                    {c.note && <span className="ct-badge" title={c.note}>note</span>}
                  </div>
                </td>
              </tr>
            )))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="tcd-modal-hint" style={{ padding: '0.8rem' }}>No test IDs match these filters.</p>}
        {filtered.length > limit && (
          <div className="ct-more">
            <button type="button" className="tcd-btn" onClick={() => setLimit((l) => l + PAGE)}>Show {Math.min(PAGE, filtered.length - limit)} more ({filtered.length - limit} left)</button>
            <button type="button" className="tcd-btn" onClick={() => setLimit(filtered.length)} style={{ marginLeft: 6 }}>Show all</button>
          </div>
        )}
      </div>

      {preview && (
        <RunPreviewModal
          items={preview}
          target={runTarget}
          onClose={() => setPreview(null)}
          onConfirm={() => { const items = preview; setPreview(null); onRunCases(items); }}
        />
      )}
      {detail && (
        <CaseDetailDrawer
          c={detail}
          status={detail.__status === 'none' ? null : detail.__status}
          testrailUrl={testrailUrl}
          onClose={() => setDetailId(null)}
          onRun={onRunCases ? startRun : null}
          environment={environment}
          onChanged={load}
          onClosed={() => { setDetailId(null); load(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
};

export default CaseTable;
