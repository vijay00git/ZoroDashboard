import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Filter, RefreshCw, Search, X, ExternalLink, Download, Copy, Columns3, Bookmark, Trash2, Users, FolderTree,
  ArrowUp, ArrowDown, ChevronLeft, ChevronRight, AlertTriangle, ListTree, Rows3, Save, Check,
  GitCompareArrows, Tag, UserCheck, CircleCheck, Loader2,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { showConfirm, showPrompt } from '../utils/Alerts';
import { StatusBar } from './test-runs/Charts';
import { orderedStatuses, fmtNum, fmtPct, timeAgo, downloadCsv } from './test-runs/helpers';
import { copyText } from './testcase-dashboard/helpers';
import SectionTree from './filter-rail/SectionTree';
import MultiSelect from './filter-rail/MultiSelect';
import TestDrawer from './filter-rail/TestDrawer';
import EditModal from './filter-rail/EditModal';
import ModalPortal from './testcase-dashboard/ModalPortal';
import { CY_CATEGORIES, CY_RANK, CY_BY_KEY, buildCypressIndex, cypressCategory } from './filter-rail/cypressCompare';
import {
  NONE, EMPTY_FILTERS, FACETS, COLUMNS, DEFAULT_COLUMNS, activeFilterCount, buildMatcher, indexSections,
  rollupCounts, sortRows, parseRunId, fmtTested, readLocal, writeLocal,
} from './filter-rail/helpers';
import './test-runs/TestRuns.css';
import './filter-rail/FilterRail.css';

const LS = {
  run: 'frl-run', filters: 'frl-filters', sorts: 'frl-sorts', cols: 'frl-cols-v2', group: 'frl-group', pageSize: 'frl-page-size', views: 'frl-views', compare: 'frl-compare',
};
const ACTIVE = new Set(['queued', 'running']);
const PAGE_SIZES = [50, 100, 250, 500];
const DEFAULT_SORTS = [];
const JIRA_KEY = /^[A-Z][A-Z0-9]+-\d+$/;

function JobProgress({ job }) {
  if (!job) return null;
  if (job.state === 'queued') return <span className="frl-muted">Queued{job.queuePosition ? ` (#${job.queuePosition})` : ''}…</span>;
  const pctDone = job.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : null;
  const secs = job.elapsedMs ? Math.floor(job.elapsedMs / 1000) : 0;
  const elapsed = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`;
  return (
    <div className="frl-job">
      <span>
        {job.step && job.steps && <strong>Step {job.step} of {job.steps} · </strong>}
        {job.phase}{job.total ? ` — ${fmtNum(job.done)} / ${fmtNum(job.total)}` : job.done ? ` — ${fmtNum(job.done)} so far` : ''}
        {job.elapsedMs != null && <span className="frl-muted"> · {elapsed} elapsed</span>}
      </span>
      {job.step === 3 && (
        <span className="frl-muted small">
          A run's result history has no known size up front and can be several times its test count, so this step can take a few minutes on a long-running run.
        </span>
      )}
      <div className="trr-progress-track">
        <div className={`trr-progress-fill ${pctDone === null ? 'indeterminate' : ''}`} style={pctDone === null ? undefined : { width: `${pctDone}%` }} />
      </div>
    </div>
  );
}

// Small anchored popover used by the Columns and Views menus.
function Popover({ label, icon: Icon, children, active }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  return (
    <div className="frl-pop-wrap" ref={ref}>
      <button type="button" className={`trr-btn small${active ? ' frl-btn-active' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Icon size={13} /> {label}
      </button>
      {open && <div className="frl-pop">{children(() => setOpen(false))}</div>}
    </div>
  );
}

function NamesModal({ userIds, userNames, onSave, onClose }) {
  const [draft, setDraft] = useState(() => Object.fromEntries(userIds.map((id) => [id, userNames[id] || ''])));
  return (
    <ModalPortal>
    <div className="frl-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="frl-modal" role="dialog" aria-modal="true" aria-label="Name users">
        <h3><Users size={15} /> Name users</h3>
        <p className="frl-muted">
          This TestRail API key can't look up users, so people show as user IDs until you name them. Names are shared with the Test Runs page.
        </p>
        <div className="frl-names">
          {userIds.map((id) => (
            <label key={id} className="frl-name-row">
              <span className="frl-mono">#{id}</span>
              <input value={draft[id]} placeholder="Name" onChange={(e) => setDraft((d) => ({ ...d, [id]: e.target.value }))} />
            </label>
          ))}
        </div>
        <div className="frl-modal-actions">
          <button type="button" className="trr-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="trr-btn primary" onClick={() => onSave(draft)}><Save size={13} /> Save names</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}

const FilterRail = () => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState({ userNames: {}, testrailUrl: null, jiraUrl: '' });
  const [runsIndex, setRunsIndex] = useState([]);
  const [runId, setRunId] = useState(() => readLocal(LS.run, null));
  const [runInput, setRunInput] = useState('');
  const [data, setData] = useState(null);
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(() => !!readLocal(LS.run, null));

  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, ...readLocal(LS.filters, {}) }));
  const [sectionId, setSectionId] = useState(null);
  const [sorts, setSorts] = useState(() => readLocal(LS.sorts, DEFAULT_SORTS));
  const [cols, setCols] = useState(() => readLocal(LS.cols, DEFAULT_COLUMNS));
  const [grouped, setGrouped] = useState(() => readLocal(LS.group, true));
  const [pageSize, setPageSize] = useState(() => readLocal(LS.pageSize, 100));
  const [page, setPage] = useState(1);
  const [views, setViews] = useState(() => readLocal(LS.views, []));
  const [expanded, setExpanded] = useState(new Set());
  const [drawerRow, setDrawerRow] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set()); // test ids
  const [copiedId, setCopiedId] = useState(null);
  const [editModal, setEditModal] = useState(null); // { kind, rows, initial }
  const [editOptions, setEditOptions] = useState(null);
  const [editOptionsError, setEditOptionsError] = useState(null);
  const [compareOn, setCompareOn] = useState(() => readLocal(LS.compare, false));
  const [cyIndex, setCyIndex] = useState(null);
  const [cyLoading, setCyLoading] = useState(false);
  const [cyLastRunAt, setCyLastRunAt] = useState(null);
  const [namesOpen, setNamesOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(true);
  const searchRef = useRef(null);

  useEffect(() => { writeLocal(LS.run, runId); }, [runId]);
  useEffect(() => { writeLocal(LS.filters, filters); }, [filters]);
  useEffect(() => { writeLocal(LS.sorts, sorts); }, [sorts]);
  useEffect(() => { writeLocal(LS.cols, cols); }, [cols]);
  useEffect(() => { writeLocal(LS.group, grouped); }, [grouped]);
  useEffect(() => { writeLocal(LS.pageSize, pageSize); }, [pageSize]);
  useEffect(() => { writeLocal(LS.views, views); }, [views]);
  useEffect(() => { writeLocal(LS.compare, compareOn); }, [compareOn]);

  const refreshIndex = useCallback(() => {
    fetch('/api/filter-rail/runs', { cache: 'no-store' }).then((r) => r.json()).then((b) => setRunsIndex(b.runs || [])).catch(() => {});
  }, []);

  const queueFetch = useCallback(async (id, refreshSections) => {
    await fetch(`/api/filter-rail/runs/${id}/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshSections: !!refreshSections }),
    });
    const r = await fetch(`/api/filter-rail/runs/${id}?jobOnly=1`).then((x) => x.json());
    setJob(r.job);
  }, []);

  // Callers set loading=true first; everything here runs after an await,
  // so it's safe to start from a mount effect.
  const loadRun = useCallback(async (id) => {
    try {
      const r = await fetch(`/api/filter-rail/runs/${id}`, { cache: 'no-store' }).then((x) => x.json());
      setJob(r.job);
      if (r.data) {
        setData(r.data);
        setExpanded(new Set(r.data.sections.filter((s) => !s.parentId).map((s) => s.id)));
      } else {
        setData(null);
        if (!r.job || r.job.state === 'error' || r.job.state === 'done') await queueFetch(id, false);
      }
    } catch {
      showToast('Could not reach the server', 'error');
    } finally {
      setLoading(false);
    }
  }, [queueFetch, showToast]);

  useEffect(() => {
    refreshIndex();
    // User names first, then the last-opened run.
    fetch('/api/test-runs/settings').then((r) => r.json()).then(setSettings).catch(() => {})
      .then(() => { if (runId) loadRun(runId); });
    // Only on mount — later run switches go through openRun.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll the job while it's queued/running, then load the finished data.
  const jobActive = job && ACTIVE.has(job.state);
  useEffect(() => {
    if (!jobActive || !runId) return undefined;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/filter-rail/runs/${runId}?jobOnly=1`, { cache: 'no-store' }).then((x) => x.json());
        setJob(r.job);
        if (r.job?.state === 'done') { setLoading(true); await loadRun(runId); refreshIndex(); showToast(`R${runId} loaded`, 'success'); }
        if (r.job?.state === 'error') showToast(`R${runId}: ${r.job.error}`, 'error');
      } catch { /* try again next tick */ }
    }, 1500);
    return () => clearInterval(t);
  }, [jobActive, runId, loadRun, refreshIndex, showToast]);

  const openRun = (id) => {
    if (!id) { showToast('Enter a run ID or a TestRail run link', 'warning'); return; }
    setRunId(id);
    setSectionId(null);
    setPage(1);
    setDrawerRow(null);
    setSelectedIds(new Set());
    setEditOptions(null);
    setLoading(true);
    loadRun(id);
  };

  const removeRun = async (id) => {
    if (!(await showConfirm(`Remove the cached copy of R${id}? You can load it again any time.`))) return;
    await fetch(`/api/filter-rail/runs/${id}`, { method: 'DELETE' });
    refreshIndex();
    if (id === runId) { setRunId(null); setData(null); setJob(null); }
  };

  // ── Derived data ──
  const rows = useMemo(() => data?.rows || [], [data]);
  const statuses = useMemo(() => orderedStatuses({ statuses: data?.statuses || [] }), [data]);
  const idx = useMemo(() => indexSections(data?.sections || []), [data]);

  const passedId = statuses.find((s) => /pass/i.test(s.label))?.id ?? 1;

  // ── Cypress comparison ──
  // Same three sources the Cypress Runner page reads, so a case's local
  // verdict here always matches what that page shows.
  const loadCypress = useCallback(async () => {
    setCyLoading(true);
    try {
      const [manifest, state, manual] = await Promise.all([
        fetch('/api/testcases/data', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/cypress/state', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/testcases/manual-status', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (!Array.isArray(manifest.rows)) throw new Error(manifest.error || 'Cypress Runner manifest unavailable');
      const history = state.history || [];
      setCyIndex(buildCypressIndex(manifest.rows, history, manual || {}));
      setCyLastRunAt(history[0] ? (history[0].completedAt || history[0].startedAt) : null);
    } catch (err) {
      showToast(`Couldn't load Cypress Runner data: ${err.message}`, 'error');
      setCompareOn(false);
    } finally {
      setCyLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    // Restores a comparison left on from last time; the state updates all
    // happen after the fetches resolve.
    if (compareOn && data && !cyIndex && !cyLoading) Promise.resolve().then(loadCypress);
  }, [compareOn, data, cyIndex, cyLoading, loadCypress]);

  const toggleCompare = () => {
    if (compareOn) {
      setCompareOn(false);
      if (filters.cypress) updateFilters({ cypress: '' });
      return;
    }
    setCompareOn(true);
    setPage(1);
    loadCypress();
  };

  const cyCategory = useMemo(
    () => (compareOn && cyIndex ? (r) => cypressCategory(r, cyIndex, passedId) : null),
    [compareOn, cyIndex, passedId],
  );

  const ctx = useMemo(() => {
    const names = settings.userNames || {};
    const trUrl = (settings.testrailUrl || '').replace(/\/+$/, '');
    const jira = (settings.jiraUrl || '').replace(/\/+$/, '');
    const statusById = new Map(statuses.map((s) => [s.id, s]));
    const statusRank = new Map(statuses.map((s, i) => [s.id, i]));
    const priorityName = (id) => (data?.priorities || []).find((p) => p.id === id)?.name || (id ? `Priority ${id}` : '—');
    const typeName = (id) => (data?.types || []).find((t) => t.id === id)?.name || (id ? `Type ${id}` : '—');
    const userName = (id) => (id === null || id === undefined || id === NONE ? 'Unassigned' : names[id] || `User #${id}`);
    const issueLinks = (list) => list.map((k, i) => (
      <span key={k + i}>
        {i > 0 && ', '}
        {jira && JIRA_KEY.test(k) ? <a href={`${jira}/browse/${k}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{k}</a> : k}
      </span>
    ));
    return {
      idx, statusById, statusRank, priorityName, typeName, userName,
      userSortName: (id) => (id === null || id === undefined ? '\uffff' : (names[id] || `~${String(id).padStart(6, '0')}`).toLowerCase()),
      testUrl: (id) => (trUrl ? `${trUrl}/index.php?/tests/view/${id}` : null),
      caseUrl: (id) => (trUrl ? `${trUrl}/index.php?/cases/view/${id}` : null),
      suiteUrl: (id) => (trUrl ? `${trUrl}/index.php?/suites/view/${id}` : null),
      renderRefs: (refs) => (refs ? issueLinks(refs.split(',').map((s) => s.trim()).filter(Boolean)) : null),
      renderDefects: (list) => (list && list.length ? issueLinks(list) : null),
      cyRank: (r) => (cyCategory ? CY_RANK.get(cyCategory(r)) : 0),
      cyCategory,
      cyInfo: (r) => (cyIndex ? cyIndex.get(r.caseId) || null : null),
    };
  }, [settings, statuses, data, idx, cyCategory, cyIndex]);

  const sectionSet = useMemo(() => (sectionId ? idx.subtree(sectionId) : null), [sectionId, idx]);

  const filtered = useMemo(() => rows.filter(buildMatcher(filters, sectionSet, null, cyCategory)), [rows, filters, sectionSet, cyCategory]);

  // Tree counts ignore the folder pick so every folder shows what it holds.
  const treeRows = useMemo(
    () => (sectionSet ? rows.filter(buildMatcher(filters, null, null, cyCategory)) : filtered),
    [rows, filters, sectionSet, filtered, cyCategory],
  );

  // Comparison bucket counts over everything the other filters allow, so a
  // bucket's tile still shows its size while another bucket is picked.
  const cyCounts = useMemo(() => {
    if (!cyCategory) return null;
    const match = buildMatcher({ ...filters, cypress: '' }, sectionSet, null, cyCategory);
    const c = {};
    rows.forEach((r) => { if (match(r)) { const k = cyCategory(r); c[k] = (c[k] || 0) + 1; } });
    return c;
  }, [rows, filters, sectionSet, cyCategory]);
  const treeCounts = useMemo(() => rollupCounts(treeRows, idx), [treeRows, idx]);

  const facetOptions = useMemo(() => {
    const out = {};
    FACETS.forEach((f) => {
      const all = new Map();
      rows.forEach((r) => f.values(r).forEach((v) => { if (!all.has(v)) all.set(v, 0); }));
      const match = buildMatcher(filters, sectionSet, f.key, cyCategory);
      const mustHave = f.key === 'label' && filters.labelMode === 'all' ? filters.label.map(String) : [];
      rows.forEach((r) => {
        if (!match(r)) return;
        const vals = f.values(r);
        if (mustHave.length) {
          const have = new Set(vals.map(String));
          if (!mustHave.every((v) => have.has(v))) return;
        }
        vals.forEach((v) => all.set(v, all.get(v) + 1));
      });
      let opts = [...all.entries()].map(([value, count]) => {
        if (f.key === 'status') {
          const st = ctx.statusById.get(value);
          return { value, count, label: st ? st.label : `Status ${value}`, color: st?.color, rank: ctx.statusRank.get(value) ?? 99 };
        }
        if (f.key === 'assignee') return { value, count, label: ctx.userName(value) };
        if (f.key === 'tester') return { value, count, label: value === NONE ? 'Not tested' : ctx.userName(value) };
        if (f.key === 'priority') return { value, count, label: value === NONE ? 'No priority' : ctx.priorityName(value), rank: value === NONE ? 99 : value };
        if (f.key === 'type') return { value, count, label: value === NONE ? 'No type' : ctx.typeName(value) };
        return { value, count, label: value === NONE ? 'No label' : value };
      });
      opts = opts.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || (a.value === NONE) - (b.value === NONE) || a.label.localeCompare(b.label));
      out[f.key] = opts;
    });
    return out;
  }, [rows, filters, sectionSet, ctx, cyCategory]);

  const effectiveSorts = useMemo(
    () => (grouped ? [{ key: '__group', dir: 'asc' }, ...sorts.filter((s) => s.key !== 'section')] : sorts),
    [grouped, sorts],
  );
  const sorted = useMemo(() => sortRows(filtered, effectiveSorts, ctx), [filtered, effectiveSorts, ctx]);

  const statusCounts = useMemo(() => {
    const c = {};
    filtered.forEach((r) => { c[r.statusId] = (c[r.statusId] || 0) + 1; });
    return c;
  }, [filtered]);
  const directCounts = useMemo(() => {
    const c = new Map();
    filtered.forEach((r) => c.set(r.sectionId, (c.get(r.sectionId) || 0) + 1));
    return c;
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const curPage = Math.min(page, pageCount);
  const pageRows = sorted.slice((curPage - 1) * pageSize, curPage * pageSize);

  const userIdsInRun = useMemo(() => {
    const ids = new Set();
    rows.forEach((r) => { if (r.assignedTo != null) ids.add(r.assignedTo); if (r.testedBy != null) ids.add(r.testedBy); });
    return [...ids].sort((a, b) => a - b);
  }, [rows]);
  const unnamedCount = userIdsInRun.filter((id) => !settings.userNames?.[id]).length;

  // ── Actions ──
  const updateFilters = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const toggleFacetValue = (key, value) => {
    const cur = filters[key];
    updateFilters({ [key]: cur.some((v) => String(v) === String(value)) ? cur.filter((v) => String(v) !== String(value)) : [...cur, value] });
  };
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setSectionId(null); setPage(1); };
  const selectSection = (id) => { setSectionId(id); setPage(1); };
  const toggleExpanded = (id) => setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Click: sort by this column (toggling direction). Shift+click: add it as
  // the next sort level instead of replacing the current sort.
  const handleSort = (key, additive) => {
    setPage(1);
    setSorts((prev) => {
      const existing = prev.find((s) => s.key === key);
      if (additive) {
        if (!existing) return [...prev, { key, dir: 'asc' }];
        if (existing.dir === 'asc') return prev.map((s) => (s.key === key ? { ...s, dir: 'desc' } : s));
        return prev.filter((s) => s.key !== key);
      }
      if (existing && prev.length === 1) return existing.dir === 'asc' ? [{ key, dir: 'desc' }] : [];
      return [{ key, dir: 'asc' }];
    });
  };

  const saveView = async () => {
    const name = await showPrompt('Name this view', '');
    if (!name || !name.trim()) return;
    const view = { name: name.trim(), filters, sorts, cols, grouped, sectionId };
    setViews((v) => [view, ...v.filter((x) => x.name !== view.name)]);
    showToast(`Saved view "${view.name}"`, 'success');
  };
  const applyView = (v) => {
    setFilters({ ...EMPTY_FILTERS, ...v.filters });
    setSorts(v.sorts || []);
    if (v.cols) setCols(v.cols);
    setGrouped(v.grouped ?? true);
    setSectionId(v.sectionId && idx.byId.has(v.sectionId) ? v.sectionId : null);
    setPage(1);
  };

  // ── TestRail edits ──
  const openEdit = (kind, targetRows, initial) => {
    if (!targetRows.length) return;
    setEditModal({ kind, rows: targetRows, initial });
    if (!editOptions) {
      setEditOptionsError(null);
      fetch(`/api/filter-rail/runs/${runId}/edit-options`, { cache: 'no-store' })
        .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
        .then(({ ok, body }) => { if (ok) setEditOptions(body); else setEditOptionsError(body.error || 'Could not load TestRail options'); })
        .catch(() => setEditOptionsError('Could not reach the server'));
    }
  };

  const onEditDone = (out) => {
    const byId = new Map(out.rows.map((r) => [r.id, r]));
    setData((d) => ({ ...d, rows: d.rows.map((r) => byId.get(r.id) || r) }));
    setDrawerRow((cur) => (cur && byId.has(cur.id) ? byId.get(cur.id) : cur));
    setEditModal(null);
    const skipped = out.unchanged ? ` (${fmtNum(out.unchanged)} already matched)` : '';
    showToast(`Updated ${fmtNum(out.updated)} test${out.updated === 1 ? '' : 's'} in TestRail${skipped}`, 'success');
  };

  const visibleCols = COLUMNS.filter((c) => !c.hidden && (c.always || cols.includes(c.key) || (c.compare && compareOn)) && !(grouped && c.key === 'section'));

  const cellText = (c, r) => {
    switch (c.key) {
      case 'id': return `T${r.id}`;
      case 'caseId': return `C${r.caseId}`;
      case 'section': return idx.pathOf(r.sectionId);
      case 'status': return ctx.statusById.get(r.statusId)?.label || r.statusId;
      case 'assignee': return ctx.userName(r.assignedTo);
      case 'tester': return r.testedBy == null ? '' : ctx.userName(r.testedBy);
      case 'testedOn': return r.testedOn ? new Date(r.testedOn * 1000).toISOString() : '';
      case 'priority': return ctx.priorityName(r.priorityId);
      case 'type': return ctx.typeName(r.typeId);
      case 'labels': return r.labels.join('; ');
      case 'defects': return r.defects.join(', ');
      case 'automation': return r.automation ? 'Yes' : 'No';
      case 'cypress': return cyCategory ? CY_BY_KEY.get(cyCategory(r))?.label : '';
      default: return r[c.key] ?? '';
    }
  };

  const exportCsv = () => {
    const exportCols = COLUMNS.filter((c) => !c.hidden && (c.always || cols.includes(c.key) || c.key === 'section' || (c.compare && compareOn)));
    downloadCsv(
      `R${data.run.id}-filtered-${new Date().toISOString().slice(0, 10)}.csv`,
      exportCols.map((c) => c.label),
      sorted.map((r) => exportCols.map((c) => cellText(c, r))),
    );
  };
  // One case can sit in a run only once, but de-dupe anyway so a copied
  // list is always clean.
  const copyIds = (list, what) => {
    const ids = [...new Set(list.map((r) => `C${r.caseId}`))];
    copyText(ids.join(', '));
    showToast(`Copied ${fmtNum(ids.length)} ${what} case ID${ids.length === 1 ? '' : 's'}`, 'success');
  };
  const copyOne = (r) => {
    copyText(`C${r.caseId}`);
    setCopiedId(r.id);
    setTimeout(() => setCopiedId((cur) => (cur === r.id ? null : cur)), 1200);
  };

  const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(r.id)), [rows, selectedIds]);
  const toggleSelected = (id) => setSelectedIds((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const pageAllSelected = pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id));
  const pageSomeSelected = pageRows.some((r) => selectedIds.has(r.id));
  const togglePageSelected = () => setSelectedIds((prev) => {
    const n = new Set(prev);
    pageRows.forEach((r) => { if (pageAllSelected) n.delete(r.id); else n.add(r.id); });
    return n;
  });
  const selectAllMatching = () => setSelectedIds((prev) => new Set([...prev, ...sorted.map((r) => r.id)]));

  const saveNames = async (draft) => {
    try {
      const res = await fetch('/api/test-runs/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userNames: draft }),
      });
      if (!res.ok) throw new Error();
      const next = await res.json();
      setSettings((s) => ({ ...s, ...next }));
      setNamesOpen(false);
      showToast('Names saved', 'success');
    } catch {
      showToast('Could not save names', 'error');
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const renderCell = (c, r) => {
    switch (c.key) {
      case 'id': {
        const url = ctx.testUrl(r.id);
        return url ? <a className="frl-mono" href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>T{r.id}</a> : <span className="frl-mono">T{r.id}</span>;
      }
      case 'caseId': {
        const url = ctx.caseUrl(r.caseId);
        const copied = copiedId === r.id;
        return (
          <span className="frl-id-cell">
            {url ? <a className="frl-mono" href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>C{r.caseId}</a> : <span className="frl-mono">C{r.caseId}</span>}
            <button
              type="button"
              className={`frl-copy-btn${copied ? ' done' : ''}`}
              title={copied ? 'Copied' : `Copy C${r.caseId}`}
              aria-label={`Copy C${r.caseId}`}
              onClick={(e) => { e.stopPropagation(); copyOne(r); }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </span>
        );
      }
      case 'title': return <span className="frl-cell-title" title={r.title}>{r.title}</span>;
      case 'section': return <span className="frl-cell-path" title={idx.pathOf(r.sectionId)}>{idx.pathOf(r.sectionId)}</span>;
      case 'status': {
        const st = ctx.statusById.get(r.statusId);
        return <span className="frl-status" style={{ '--st': st?.color || 'var(--text-muted)' }}>{st?.label || r.statusId}</span>;
      }
      case 'assignee': return <span className={r.assignedTo == null ? 'frl-muted' : ''}>{ctx.userName(r.assignedTo)}</span>;
      case 'tester': return r.testedBy == null ? <span className="frl-muted">—</span> : ctx.userName(r.testedBy);
      case 'testedOn': return <span className="frl-nowrap" title={r.testedOn ? new Date(r.testedOn * 1000).toLocaleString() : ''}>{fmtTested(r.testedOn)}</span>;
      case 'priority': return <span className={`frl-prio p${r.priorityId}`}>{ctx.priorityName(r.priorityId)}</span>;
      case 'type': return ctx.typeName(r.typeId);
      case 'labels': return r.labels.map((l) => (
        <button key={l} type="button" className="frl-label" onClick={(e) => { e.stopPropagation(); toggleFacetValue('label', l); }}>{l}</button>
      ));
      case 'refs': return ctx.renderRefs(r.refs) || <span className="frl-muted">—</span>;
      case 'defects': return ctx.renderDefects(r.defects) || <span className="frl-muted">—</span>;
      case 'resultCount': return r.resultCount || <span className="frl-muted">0</span>;
      case 'automation': return r.automation ? <span className="frl-yes">Yes</span> : <span className="frl-muted">No</span>;
      case 'comment': return <span className="frl-cell-comment" title={r.comment}>{r.comment}</span>;
      case 'cypress': {
        if (!cyCategory) return <span className="frl-muted">…</span>;
        const cat = CY_BY_KEY.get(cyCategory(r));
        const info = ctx.cyInfo(r);
        const tip = info ? info.files.map((f) => `${f.commented ? '(commented) ' : ''}${f.path}`).join('\n') : 'No spec file in the Cypress Runner manifest has this case ID';
        return (
          <button type="button" className="frl-cy-pill" style={{ '--cy': cat.color }} title={tip} onClick={(e) => { e.stopPropagation(); updateFilters({ cypress: cat.key }); }}>
            {cat.short}
          </button>
        );
      }
      default: return r[c.key] || <span className="frl-muted">—</span>;
    }
  };

  // ── Render ──
  const filterCount = activeFilterCount(filters) + (sectionId ? 1 : 0);
  const executed = filtered.length - statuses.filter((s) => s.isUntested).reduce((n, s) => n + (statusCounts[s.id] || 0), 0);
  const chips = [];
  if (sectionId) chips.push({ key: 'section', label: `Section: ${idx.byId.get(sectionId)?.name || sectionId}`, clear: () => selectSection(null) });
  if (filters.labelMode === 'all' && filters.label.length > 1) {
    chips.push({ key: 'label-all', label: `Has all labels: ${filters.label.join(' + ')}`, clear: () => updateFilters({ label: [] }) });
  }
  FACETS.forEach((f) => (f.key === 'label' && filters.labelMode === 'all' && filters.label.length > 1 ? [] : filters[f.key]).forEach((v) => {
    const opt = facetOptions[f.key]?.find((o) => String(o.value) === String(v));
    chips.push({ key: `${f.key}-${v}`, label: `${f.label}: ${opt ? opt.label : v}`, clear: () => toggleFacetValue(f.key, v) });
  }));
  if (filters.automation !== 'any') chips.push({ key: 'auto', label: `Automated: ${filters.automation}`, clear: () => updateFilters({ automation: 'any' }) });
  if (filters.defects !== 'any') chips.push({ key: 'def', label: filters.defects === 'has' ? 'Has defects' : 'No defects', clear: () => updateFilters({ defects: 'any' }) });
  if (filters.results !== 'any') chips.push({ key: 'res', label: filters.results === 'has' ? 'Has results' : 'No results', clear: () => updateFilters({ results: 'any' }) });
  if (filters.from || filters.to) chips.push({ key: 'date', label: `Tested ${filters.from || '…'} → ${filters.to || '…'}`, clear: () => updateFilters({ from: '', to: '' }) });
  if (filters.q.trim()) chips.push({ key: 'q', label: `“${filters.q.trim()}”`, clear: () => updateFilters({ q: '' }) });
  if (filters.cypress && compareOn) chips.push({ key: 'cy', label: `Cypress: ${CY_BY_KEY.get(filters.cypress)?.label || filters.cypress}`, clear: () => updateFilters({ cypress: '' }) });

  return (
    <div className="frl">
      <div className="trr-title-hero frl-hero">
        <div>
          <h1><Filter size={20} /> FilterRail</h1>
          <p>Pull every test in a TestRail run, then slice it by tester, assignee, status, label and more, sorted any way you like.</p>
        </div>
        <form className="frl-run-form" onSubmit={(e) => { e.preventDefault(); openRun(parseRunId(runInput)); }}>
          <div className="trr-input-wrap">
            <Search size={14} />
            <input className="trr-input" placeholder="Run ID or TestRail run link" value={runInput} onChange={(e) => setRunInput(e.target.value)} />
          </div>
          <button type="submit" className="trr-btn primary">Load run</button>
        </form>
      </div>

      {runsIndex.length > 0 && (
        <div className="frl-recent">
          <span className="frl-muted small">Cached runs</span>
          {runsIndex.map((r) => (
            <span key={r.id} className={`frl-run-chip${r.id === runId ? ' on' : ''}`}>
              <button type="button" onClick={() => openRun(r.id)} title={`${fmtNum(r.total)} tests · fetched ${timeAgo(r.fetchedAt)}`}>
                <span className="frl-mono">R{r.id}</span> {r.name}
              </button>
              <button type="button" className="frl-run-chip-x" aria-label={`Remove R${r.id}`} onClick={() => removeRun(r.id)}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      {!runId && (
        <div className="trr-card trr-empty big">
          <FolderTree size={28} />
          <p>Load a run to start. The first fetch of a large run takes about a minute; after that it opens from the local cache.</p>
        </div>
      )}

      {runId && !data && (
        <div className="trr-card frl-loading">
          {jobActive ? <JobProgress job={job} />
            : job?.state === 'error' ? (
              <span className="trr-error"><AlertTriangle size={14} /> {job.error} <button type="button" className="trr-btn small" onClick={() => queueFetch(runId, false)}>Retry</button></span>
            ) : <span className="frl-muted">{loading ? 'Loading…' : 'Preparing…'}</span>}
        </div>
      )}

      {data && (
        <>
          <div className="trr-card frl-run-head">
            <div className="frl-run-title">
              {ctx.suiteUrl(data.run.suiteId)
                ? <a className="frl-mono" href={ctx.suiteUrl(data.run.suiteId)} target="_blank" rel="noreferrer" title="Test suite">S{data.run.suiteId} <ExternalLink size={11} /></a>
                : <span className="frl-mono" title="Test suite">S{data.run.suiteId}</span>}
              <h2>{data.run.name}</h2>
              {data.run.milestone && <span className="frl-tag">{data.run.milestone}</span>}
              {data.run.isCompleted && <span className="frl-tag">Completed</span>}
            </div>
            <div className="frl-run-meta">
              <a className="frl-mono" href={data.run.url} target="_blank" rel="noreferrer" title="Open the run in TestRail">Run R{data.run.id} <ExternalLink size={10} /></a>
              <span>{fmtNum(rows.length)} tests</span>
              <span>{fmtNum(data.sections.length)} sections</span>
              <span>Fetched {timeAgo(data.fetchedAt)}</span>
              {jobActive ? <JobProgress job={job} /> : (
                <>
                  <button type="button" className="trr-btn small" onClick={() => queueFetch(runId, false)} title="Pull the latest tests and results">
                    <RefreshCw size={12} /> Refresh
                  </button>
                  <button type="button" className="trr-btn small" onClick={() => queueFetch(runId, true)} title="Also re-read the folder structure (cached for 12 hours)">
                    <FolderTree size={12} /> Refresh folders too
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="trr-card frl-filters">
            <div className="frl-filter-row">
              <div className="trr-input-wrap grow">
                <Search size={14} />
                <input
                  ref={searchRef}
                  className="trr-input"
                  placeholder="Search title, ID, refs, defects, comment… (press /)"
                  value={filters.q}
                  onChange={(e) => updateFilters({ q: e.target.value })}
                />
                {filters.q && <button type="button" className="frl-icon-btn" onClick={() => updateFilters({ q: '' })} aria-label="Clear search"><X size={13} /></button>}
              </div>
              <Popover label={`Views${views.length ? ` (${views.length})` : ''}`} icon={Bookmark}>
                {(close) => (
                  <div className="frl-views">
                    <button type="button" className="trr-btn small" onClick={() => { close(); saveView(); }}><Save size={12} /> Save current view</button>
                    {views.length === 0 && <p className="frl-muted small">Saved filter + sort combinations show here.</p>}
                    {views.map((v) => (
                      <div key={v.name} className="frl-view-row">
                        <button type="button" className="frl-view-name" onClick={() => { applyView(v); close(); }}>{v.name}</button>
                        <button type="button" className="frl-icon-btn" aria-label={`Delete ${v.name}`} onClick={() => setViews((all) => all.filter((x) => x.name !== v.name))}><Trash2 size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </Popover>
              <button type="button" className={`trr-btn small${unnamedCount ? ' frl-btn-warn' : ''}`} onClick={() => setNamesOpen(true)} title="Give user IDs readable names">
                <Users size={13} /> Names{unnamedCount ? ` (${unnamedCount} unnamed)` : ''}
              </button>
            </div>
            <div className="frl-filter-row">
              {FACETS.map((f) => (
                <MultiSelect
                  key={f.key}
                  label={f.label}
                  options={facetOptions[f.key] || []}
                  selected={filters[f.key]}
                  onChange={(v) => updateFilters({ [f.key]: v })}
                  matchMode={f.key === 'label' ? filters.labelMode : undefined}
                  onMatchModeChange={f.key === 'label' ? (m) => updateFilters({ labelMode: m }) : undefined}
                />
              ))}
              <label className={`frl-select${filters.automation !== 'any' ? ' active' : ''}`}>
                <span>Automated</span>
                <select value={filters.automation} onChange={(e) => updateFilters({ automation: e.target.value })}>
                  <option value="any">Any</option><option value="yes">Yes</option><option value="no">No</option>
                </select>
              </label>
              <label className={`frl-select${filters.defects !== 'any' ? ' active' : ''}`}>
                <span>Defects</span>
                <select value={filters.defects} onChange={(e) => updateFilters({ defects: e.target.value })}>
                  <option value="any">Any</option><option value="has">Has defects</option><option value="none">None</option>
                </select>
              </label>
              <label className={`frl-select${filters.results !== 'any' ? ' active' : ''}`}>
                <span>Results</span>
                <select value={filters.results} onChange={(e) => updateFilters({ results: e.target.value })}>
                  <option value="any">Any</option><option value="has">Has results</option><option value="none">No results</option>
                </select>
              </label>
              <label className={`frl-select frl-dates${filters.from || filters.to ? ' active' : ''}`}>
                <span>Tested</span>
                <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => updateFilters({ from: e.target.value })} aria-label="Tested from" />
                <span className="frl-muted">→</span>
                <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => updateFilters({ to: e.target.value })} aria-label="Tested to" />
              </label>
            </div>
            {chips.length > 0 && (
              <div className="frl-chips">
                {chips.map((c) => (
                  <span key={c.key} className="frl-chip">{c.label}<button type="button" onClick={c.clear} aria-label={`Remove ${c.label}`}><X size={11} /></button></span>
                ))}
                <button type="button" className="frl-clear-all" onClick={clearFilters}>Clear all ({filterCount})</button>
              </div>
            )}
          </div>

          <div className="trr-card frl-summary">
            <div className="frl-summary-nums">
              <div><span className="frl-big">{fmtNum(filtered.length)}</span><span className="frl-muted"> of {fmtNum(rows.length)} tests</span></div>
              <div><span className="frl-big">{fmtPct(executed, filtered.length)}</span><span className="frl-muted"> executed</span></div>
              <div><span className="frl-big">{fmtPct(statusCounts[passedId] || 0, executed)}</span><span className="frl-muted"> pass rate</span></div>
            </div>
            <StatusBar statuses={statuses} counts={statusCounts} total={filtered.length} title="Filtered tests" />
            <div className="frl-legend">
              {statuses.map((s) => {
                const on = filters.status.some((v) => String(v) === String(s.id));
                return (
                  <button key={s.id} type="button" className={`frl-legend-item${on ? ' on' : ''}${!statusCounts[s.id] ? ' zero' : ''}`} onClick={() => toggleFacetValue('status', s.id)} title={`Filter to ${s.label}`}>
                    <span className="frl-dot" style={{ background: s.color }} /> {s.label}
                    <strong>{fmtNum(statusCounts[s.id] || 0)}</strong>
                    <span className="frl-muted">{fmtPct(statusCounts[s.id] || 0, filtered.length)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {compareOn && (
            <div className="trr-card frl-compare">
              <div className="frl-compare-head">
                <span className="frl-compare-title"><GitCompareArrows size={15} /> Compared with Cypress Runner</span>
                <span className="frl-muted small">
                  {cyLoading ? 'Loading Cypress results…' : cyLastRunAt ? `Latest local Cypress run ${timeAgo(new Date(cyLastRunAt).toISOString())}` : 'No local Cypress runs yet'}
                </span>
                <button type="button" className="trr-btn small" onClick={loadCypress} disabled={cyLoading} title="Re-read the Cypress Runner's manifest and run history">
                  {cyLoading ? <Loader2 size={12} className="frl-spin" /> : <RefreshCw size={12} />} Reload Cypress
                </button>
              </div>
              {cyCounts && (
                <div className="frl-compare-tiles">
                  {CY_CATEGORIES.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      className={`frl-compare-tile${filters.cypress === c.key ? ' on' : ''}${!cyCounts[c.key] ? ' zero' : ''}`}
                      style={{ '--cy': c.color }}
                      onClick={() => updateFilters({ cypress: filters.cypress === c.key ? '' : c.key })}
                    >
                      <span className="frl-compare-num">{fmtNum(cyCounts[c.key] || 0)}</span>
                      <span className="frl-compare-label">{c.label}</span>
                      {c.hint && <span className="frl-muted small">{c.hint}</span>}
                    </button>
                  ))}
                </div>
              )}
              {filters.cypress === 'cy_pass_tr_not' && filtered.length > 0 && (
                <div className="frl-compare-cta">
                  <span>{fmtNum(filtered.length)} test{filtered.length === 1 ? '' : 's'} passed locally in Cypress but aren't Passed in this run.</span>
                  <button
                    type="button"
                    className="trr-btn small primary"
                    onClick={() => openEdit('status', sorted, { statusId: passedId, comment: 'Passed in local Cypress run' })}
                  >
                    <CircleCheck size={12} /> Mark {fmtNum(filtered.length)} as Passed…
                  </button>
                </div>
              )}
            </div>
          )}

          <div className={`frl-body${treeOpen ? '' : ' tree-closed'}`}>
            {treeOpen && (
              <SectionTree
                idx={idx}
                counts={treeCounts}
                totalCount={treeRows.length}
                statuses={statuses}
                selectedId={sectionId}
                onSelect={selectSection}
                expanded={expanded}
                onToggle={toggleExpanded}
                onSetExpanded={setExpanded}
              />
            )}
            <div className="trr-card frl-table-card">
              <div className="frl-table-toolbar">
                <button type="button" className="trr-btn small" onClick={() => setTreeOpen((v) => !v)} title={treeOpen ? 'Hide sections' : 'Show sections'}>
                  <FolderTree size={13} /> {treeOpen ? 'Hide sections' : 'Show sections'}
                </button>
                <button type="button" className={`trr-btn small${grouped ? ' frl-btn-active' : ''}`} onClick={() => { setGrouped((g) => !g); setPage(1); }}>
                  {grouped ? <ListTree size={13} /> : <Rows3 size={13} />} {grouped ? 'Grouped by section' : 'Flat list'}
                </button>
                <button
                  type="button"
                  className={`trr-btn small${compareOn ? ' frl-btn-active' : ''}`}
                  onClick={toggleCompare}
                  title="Compare each test with its latest local Cypress Runner result"
                >
                  {cyLoading ? <Loader2 size={13} className="frl-spin" /> : <GitCompareArrows size={13} />} {compareOn ? 'Comparing with Cypress' : 'Compare with Cypress'}
                </button>
                <Popover label="Columns" icon={Columns3}>
                  {() => (
                    <div className="frl-cols">
                      {COLUMNS.filter((c) => !c.hidden && !c.always && !c.compare).map((c) => (
                        <label key={c.key} className="frl-col-opt">
                          <input type="checkbox" checked={cols.includes(c.key)} onChange={() => setCols((cur) => (cur.includes(c.key) ? cur.filter((k) => k !== c.key) : [...cur, c.key]))} />
                          {c.label}{grouped && c.key === 'section' && <span className="frl-muted small"> (shown as group headers)</span>}
                        </label>
                      ))}
                      <button type="button" className="frl-clear-all" onClick={() => setCols(DEFAULT_COLUMNS)}>Reset columns</button>
                    </div>
                  )}
                </Popover>
                {sorts.length > 0 && (
                  <span className="frl-sort-summary">
                    Sorted by {sorts.map((s) => `${COLUMNS.find((c) => c.key === s.key)?.label} ${s.dir === 'asc' ? '↑' : '↓'}`).join(', then ')}
                    <button type="button" className="frl-icon-btn" onClick={() => setSorts([])} aria-label="Clear sort"><X size={12} /></button>
                  </span>
                )}
                <span className="trr-spacer" />
                <button type="button" className="trr-btn small" onClick={() => copyIds(sorted, 'matching')} disabled={!sorted.length} title="Copy the case ID of every test matching the filters">
                  <Copy size={12} /> Copy all {fmtNum(sorted.length)} IDs
                </button>
                <button type="button" className="trr-btn small" onClick={exportCsv} disabled={!sorted.length}><Download size={12} /> CSV</button>
              </div>
              {selectedIds.size > 0 ? (
                <div className="frl-selbar">
                  <strong>{fmtNum(selectedIds.size)} selected</strong>
                  {selectedIds.size < sorted.length && (
                    <button type="button" className="frl-link" onClick={selectAllMatching}>Select all {fmtNum(sorted.length)} matching</button>
                  )}
                  <span className="trr-spacer" />
                  <button type="button" className="trr-btn small" onClick={() => openEdit('status', selectedRows)}><CircleCheck size={12} /> Set status</button>
                  <button type="button" className="trr-btn small" onClick={() => openEdit('assign', selectedRows)}><UserCheck size={12} /> Assign</button>
                  <button type="button" className="trr-btn small" onClick={() => openEdit('labels', selectedRows)}><Tag size={12} /> Labels</button>
                  <button type="button" className="trr-btn small primary" onClick={() => copyIds(selectedRows, 'selected')}><Copy size={12} /> Copy selected IDs</button>
                  <button type="button" className="trr-btn small" onClick={() => setSelectedIds(new Set())}><X size={12} /> Clear selection</button>
                </div>
              ) : (
                <p className="frl-hint">Click a column to sort; Shift+click to add a second sort level. Tick rows to copy their IDs. Click a row for steps and result history.</p>
              )}

              {sorted.length === 0 ? (
                <div className="trr-empty big">
                  No tests match these filters.
                  {filterCount > 0 && <div><button type="button" className="trr-btn small" onClick={clearFilters}>Clear all filters</button></div>}
                </div>
              ) : (
                <div className="frl-table-wrap">
                  <table className="frl-table">
                    <thead>
                      <tr>
                        <th className="col-select">
                          <input
                            type="checkbox"
                            aria-label="Select all rows on this page"
                            checked={pageAllSelected}
                            ref={(el) => { if (el) el.indeterminate = pageSomeSelected && !pageAllSelected; }}
                            onChange={togglePageSelected}
                          />
                        </th>
                        {visibleCols.map((c) => {
                          const si = sorts.findIndex((s) => s.key === c.key);
                          const s = sorts[si];
                          return (
                            <th key={c.key} className={`col-${c.key}${s ? ' sorted' : ''}`} aria-sort={s ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                              <button type="button" onClick={(e) => handleSort(c.key, e.shiftKey)}>
                                {c.label}
                                {s && (s.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                                {s && sorts.length > 1 && <sup>{si + 1}</sup>}
                              </button>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r, i) => {
                        const header = grouped && (i === 0 || pageRows[i - 1].sectionId !== r.sectionId);
                        return [
                          header && (
                            <tr key={`s-${r.sectionId}-${r.id}`} className="frl-group-row">
                              <td colSpan={visibleCols.length + 1}>
                                <button type="button" onClick={() => selectSection(r.sectionId)} title="Show only this section">
                                  <FolderTree size={12} /> {idx.pathOf(r.sectionId) || 'Unknown section'}
                                </button>
                                <span className="frl-group-count">{fmtNum(directCounts.get(r.sectionId) || 0)}</span>
                              </td>
                            </tr>
                          ),
                          <tr key={r.id} className={`${drawerRow?.id === r.id ? 'open' : ''}${selectedIds.has(r.id) ? ' selected' : ''}`} onClick={() => setDrawerRow(r)}>
                            <td className="col-select" onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" aria-label={`Select C${r.caseId}`} checked={selectedIds.has(r.id)} onChange={() => toggleSelected(r.id)} />
                            </td>
                            {visibleCols.map((c) => <td key={c.key} className={`col-${c.key}`}>{renderCell(c, r)}</td>)}
                          </tr>,
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {sorted.length > 0 && (
                <div className="frl-pager">
                  <span className="frl-muted">
                    {fmtNum((curPage - 1) * pageSize + 1)}–{fmtNum(Math.min(curPage * pageSize, sorted.length))} of {fmtNum(sorted.length)}
                  </span>
                  <label className="frl-muted">
                    Rows
                    <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                      {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <button type="button" className="trr-btn small" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)} aria-label="Previous page"><ChevronLeft size={13} /></button>
                  <span>Page {curPage} / {pageCount}</span>
                  <button type="button" className="trr-btn small" disabled={curPage >= pageCount} onClick={() => setPage(curPage + 1)} aria-label="Next page"><ChevronRight size={13} /></button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {drawerRow && (
        <TestDrawer
          row={drawerRow}
          ctx={ctx}
          onClose={() => setDrawerRow(null)}
          onFilter={(key, value) => { updateFilters({ [key]: [value] }); setDrawerRow(null); }}
          onEdit={(kind) => openEdit(kind, [drawerRow])}
        />
      )}
      {editModal && (
        <EditModal
          kind={editModal.kind}
          rows={editModal.rows}
          initial={editModal.initial}
          runId={runId}
          statuses={statuses}
          options={editOptions}
          optionsError={editOptionsError}
          onDone={onEditDone}
          onClose={() => setEditModal(null)}
        />
      )}
      {namesOpen && <NamesModal userIds={userIdsInRun} userNames={settings.userNames || {}} onSave={saveNames} onClose={() => setNamesOpen(false)} />}
    </div>
  );
};

export default FilterRail;
