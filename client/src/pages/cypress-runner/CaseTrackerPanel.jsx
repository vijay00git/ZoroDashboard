import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Radar, AlertTriangle, PlusCircle, CheckCircle2, History, FileX2, EyeOff, RefreshCw, Search, ChevronDown, ChevronRight, Copy, Crosshair, PlayCircle, Download, CheckCheck, ExternalLink, FileCode2, ArrowRightLeft, Layers, MoveRight, MessageSquareOff, MessageSquare, UserPlus, UserMinus,
} from 'lucide-react';
import { showConfirm } from '../../utils/Alerts';
import { useToast } from '../../contexts/ToastContext';
import { localCaseStatus } from './helpers';
import { CAT_LABELS, CAT_ORDER, MISSING_REASON_LABEL, normCat, testRailCaseUrl, copyText, csvEscape, dateHeadingLabel } from '../testcase-dashboard/helpers';

const TABS = [
  { key: 'missing', label: 'Missing', icon: AlertTriangle, accent: 'var(--accent-red)', timeKey: 'missingSince' },
  { key: 'added', label: 'Newly added', icon: PlusCircle, accent: 'var(--accent-cyan)', timeKey: 'firstSeenAt' },
  { key: 'restored', label: 'Restored', icon: CheckCircle2, accent: 'var(--accent-green)', timeKey: 'restoredAt' },
  { key: 'activity', label: 'Activity', icon: History, accent: 'var(--accent-purple)', timeKey: 'detectedAt' },
];

const RANGES = [
  { key: '1d', label: '24h', ms: 86400000 },
  { key: '7d', label: '7 days', ms: 7 * 86400000 },
  { key: '30d', label: '30 days', ms: 30 * 86400000 },
  { key: 'all', label: 'All time', ms: null },
];

const EVENT_META = {
  case_added: { icon: PlusCircle, label: 'Added', color: 'var(--accent-cyan)' },
  case_missing: { icon: AlertTriangle, label: 'Went missing', color: 'var(--accent-red)' },
  case_restored: { icon: CheckCircle2, label: 'Restored', color: 'var(--accent-green)' },
  file_untracked: { icon: FileX2, label: 'File removed from manifest', color: 'var(--text-muted)' },
  case_dismissed: { icon: EyeOff, label: 'Dismissed', color: 'var(--text-muted)' },
  case_moved: { icon: MoveRight, label: 'Moved', color: 'var(--accent-orange)' },
  case_commented: { icon: MessageSquareOff, label: 'Commented out', color: 'var(--accent-yellow)' },
  case_uncommented: { icon: MessageSquare, label: 'Uncommented', color: 'var(--accent-green)' },
  cases_owned: { icon: UserPlus, label: 'Owned', color: 'var(--accent-purple)' },
  cases_disowned: { icon: UserMinus, label: 'Disowned', color: 'var(--text-muted)' },
  case_retired: { icon: EyeOff, label: 'Retired', color: 'var(--text-muted)' },
  case_unretired: { icon: CheckCircle2, label: 'Un-retired', color: 'var(--accent-green)' },
};

const STATUS_LABEL = { passed: 'Passed', failed: 'Failed', blocked: 'Blocked', retest: 'Retest', untested: 'Not run yet' };

const EMPTY_SUMMARY = { seededAt: null, reviewedAt: null, trackedCount: 0, presentCount: 0, missing: [], added: [], restored: [] };

function readPref(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* per-viewer convenience only */ }
}

function relTime(iso) {
  if (!iso) return '—';
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 30 * 86400) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
const fullTime = (iso) => (iso ? new Date(iso).toLocaleString() : '');

// Cypress Runner's view of the shared "remember test cases" tracking
// (/api/testcases/case-tracking/*): which case ids have gone missing from
// the manifest's spec files, which are new since the baseline scan, and
// which came back — with filters, per-file grouping and bulk actions.
const CaseTrackerPanel = ({
  generatedAt, tab, onTabChange, rows, caseResultsByPath, statusByPath, manualStatus,
  testrailUrl, onRescan, onFocusCase, onQueueFile,
}) => {
  const { showToast } = useToast();
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('ALL');
  const [range, setRange] = useState(() => readPref('cyr_trk_range', 'all'));
  const [groupByFile, setGroupByFile] = useState(() => readPref('cyr_trk_group', '1') === '1');
  const [collapsed, setCollapsed] = useState(() => readPref('cyr_trk_collapsed', '0') === '1');
  const [eventFilter, setEventFilter] = useState('all');
  const [closedGroups, setClosedGroups] = useState(new Set());

  const load = useCallback(() => {
    Promise.all([
      fetch('/api/testcases/case-tracking/summary', { cache: 'no-store' }).then((r) => r.json()),
      fetch('/api/testcases/case-tracking/history', { cache: 'no-store' }).then((r) => r.json()),
    ])
      .then(([s, h]) => { setSummary({ ...EMPTY_SUMMARY, ...s }); setHistory(h.history || []); setLoadedAt(Date.now()); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // generatedAt moves every time /api/testcases/data re-scans the manifest,
  // which is also when the server re-diffs tracking — reload right after.
  useEffect(() => { load(); }, [load, generatedAt]);

  useEffect(() => { writePref('cyr_trk_range', range); }, [range]);
  useEffect(() => { writePref('cyr_trk_group', groupByFile ? '1' : '0'); }, [groupByFile]);
  useEffect(() => { writePref('cyr_trk_collapsed', collapsed ? '1' : '0'); }, [collapsed]);

  const rowById = useMemo(() => {
    const m = new Map();
    (rows || []).forEach((r) => { if (!m.has(r.id)) m.set(r.id, r); });
    return m;
  }, [rows]);

  const reviewedAt = summary.reviewedAt || summary.seededAt;
  const unreviewedCount = summary.added.filter((c) => !reviewedAt || c.firstSeenAt > reviewedAt).length;
  const activeTab = TABS.find((t) => t.key === tab) || TABS[0];

  const counts = {
    missing: summary.missing.length,
    added: summary.added.length,
    restored: summary.restored.length,
    activity: history.length,
  };

  const items = useMemo(() => {
    const source = tab === 'activity' ? history : (summary[tab] || []);
    const rangeMs = RANGES.find((r) => r.key === range)?.ms;
    // Measured from the last load rather than "now" so filtering stays pure.
    const cutoff = rangeMs && loadedAt ? loadedAt - rangeMs : null;
    const term = search.trim().toLowerCase();
    return source.filter((c) => {
      if (cutoff && new Date(c[activeTab.timeKey] || 0).getTime() < cutoff) return false;
      if (cat !== 'ALL' && c.cat && normCat(c.cat) !== cat) return false;
      if (tab === 'activity' && eventFilter !== 'all' && c.type !== eventFilter) return false;
      if (!term) return true;
      return [c.caseId, c.title, c.path, c.grp, c.movedFrom, ...(c.caseIds || [])]
        .some((v) => v && String(v).toLowerCase().includes(term));
    });
  }, [tab, history, summary, range, search, cat, eventFilter, activeTab.timeKey, loadedAt]);

  const groups = useMemo(() => {
    if (tab === 'activity') {
      const byDay = new Map();
      items.forEach((h) => {
        const key = new Date(h.detectedAt).toDateString();
        if (!byDay.has(key)) byDay.set(key, { key, label: dateHeadingLabel(new Date(h.detectedAt).getTime()), items: [] });
        byDay.get(key).items.push(h);
      });
      return Array.from(byDay.values());
    }
    if (!groupByFile) return [{ key: '__all', items }];
    const byPath = new Map();
    items.forEach((c) => {
      if (!byPath.has(c.path)) byPath.set(c.path, { key: c.path, path: c.path, cat: c.cat, grp: c.grp, items: [] });
      byPath.get(c.path).items.push(c);
    });
    return Array.from(byPath.values());
  }, [items, tab, groupByFile]);

  const toggleGroup = (key) => setClosedGroups((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const handleRescan = () => { setLoading(true); onRescan(); };

  const dismiss = async (caseIds) => {
    if (caseIds.length === 0) return;
    const msg = caseIds.length === 1
      ? `Stop tracking ${caseIds[0]}? Do this when it was removed on purpose. It's tracked again if it reappears.`
      : `Stop tracking these ${caseIds.length} missing test IDs? Do this when they were removed on purpose. Any that reappear are tracked again.`;
    if (!(await showConfirm(msg))) return;
    setBusy(true);
    try {
      const res = await fetch('/api/testcases/case-tracking/dismiss', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseIds }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Dismiss failed');
      showToast(`Stopped tracking ${body.dismissed} test ID${body.dismissed === 1 ? '' : 's'}`, 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const markReviewed = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/testcases/case-tracking/mark-reviewed', { method: 'POST' });
      if (!res.ok) throw new Error('Could not mark as reviewed');
      showToast('New test IDs marked as reviewed', 'success');
      load();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const header = ['Case ID', 'Title', 'Category', 'Group', 'File', 'Status', 'Reason', 'First seen', 'Last seen', 'Missing since', 'Restored at', 'Moved from'];
    const lines = [header.join(',')];
    items.forEach((c) => {
      lines.push([
        c.caseId, c.title, c.cat, c.grp, c.path, c.status || c.type, MISSING_REASON_LABEL[c.reason] || c.reason || '',
        c.firstSeenAt, c.lastSeenAt, c.missingSince, c.restoredAt, c.movedFrom,
      ].map((v) => csvEscape(v == null ? '' : v)).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `test-id-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyId = (id) => { copyText(id); showToast(`Copied ${id}`, 'info'); };

  const renderCaseId = (id) => {
    const url = testRailCaseUrl(testrailUrl, id);
    return url
      ? <a className="cyr-trk-id" href={url} target="_blank" rel="noreferrer" title="Open in TestRail">{id}<ExternalLink size={10} /></a>
      : <span className="cyr-trk-id">{id}</span>;
  };

  const renderCaseRow = (c, showPath) => {
    const isNew = tab === 'added' && (!reviewedAt || c.firstSeenAt > reviewedAt);
    const row = rowById.get(c.caseId);
    const localStatus = tab !== 'missing' && row ? localCaseStatus(row, caseResultsByPath, statusByPath, manualStatus) : null;
    return (
      <li key={c.caseId} className={`cyr-trk-row tab-${tab}${isNew ? ' is-new' : ''}`}>
        <span className="cyr-trk-row-icon" style={{ color: activeTab.accent }}><activeTab.icon size={14} /></span>
        <div className="cyr-trk-row-body">
          <div className="cyr-trk-row-title">
            {renderCaseId(c.caseId)}
            <span className="cyr-trk-title-text" title={c.title}>{c.title || <em>untitled</em>}</span>
            {isNew && <span className="cyr-trk-new-badge">new</span>}
            {row && row.commented && <span className="cyr-trk-pill muted" title="The it() block is commented out">commented out</span>}
          </div>
          <div className="cyr-trk-meta">
            {tab === 'missing' && (
              <>
                <span className={`cyr-trk-pill reason-${c.reason}`}>{MISSING_REASON_LABEL[c.reason] || c.reason}</span>
                <span title={fullTime(c.missingSince)}>missing {relTime(c.missingSince)}</span>
                <span title={fullTime(c.lastSeenAt)}>last seen {relTime(c.lastSeenAt)}</span>
              </>
            )}
            {tab === 'added' && <span title={fullTime(c.firstSeenAt)}>added {relTime(c.firstSeenAt)}</span>}
            {tab === 'restored' && <span title={fullTime(c.restoredAt)}>back {relTime(c.restoredAt)}</span>}
            {localStatus && <span className={`cyr-trk-pill st-${localStatus}`}>{STATUS_LABEL[localStatus] || localStatus}</span>}
            {!groupByFile && c.cat && <span className="cyr-trk-pill cat">{CAT_LABELS[normCat(c.cat)] || c.cat}</span>}
            {!groupByFile && c.grp && <span className="cyr-trk-grp">{c.grp}</span>}
          </div>
          {showPath && <div className="cyr-trk-path" title={c.path}><FileCode2 size={11} /> {c.path}</div>}
          {c.movedFrom && (
            <div className="cyr-trk-path moved" title={`Moved ${fullTime(c.movedAt)}`}>
              <ArrowRightLeft size={11} /> moved from {c.movedFrom}
            </div>
          )}
        </div>
        <div className="cyr-trk-row-actions">
          <button type="button" className="cyr-trk-icon-btn" title="Copy case ID" onClick={() => copyId(c.caseId)}><Copy size={13} /></button>
          {tab !== 'missing' && (
            <button type="button" className="cyr-trk-icon-btn" title="Find in the test case tree" onClick={() => onFocusCase(c.caseId)}><Crosshair size={13} /></button>
          )}
          {tab === 'missing' && (
            <button type="button" className="cyr-trk-icon-btn danger" title="Stop tracking (removed on purpose)" disabled={busy} onClick={() => dismiss([c.caseId])}><EyeOff size={13} /></button>
          )}
        </div>
      </li>
    );
  };

  const renderActivityRow = (h) => {
    const meta = EVENT_META[h.type] || { icon: History, label: h.type, color: 'var(--text-muted)' };
    const Icon = meta.icon;
    return (
      <li key={h.id} className="cyr-trk-row">
        <span className="cyr-trk-row-icon" style={{ color: meta.color }}><Icon size={14} /></span>
        <div className="cyr-trk-row-body">
          <div className="cyr-trk-row-title">
            <span className="cyr-trk-event" style={{ color: meta.color }}>{meta.label}</span>
            {h.caseIds
              ? <span className="cyr-trk-title-text">{h.count} test ID{h.count === 1 ? '' : 's'}: {h.caseIds.slice(0, 10).join(', ')}{h.caseIds.length > 10 ? '…' : ''}</span>
              : h.type === 'file_untracked'
              ? <span className="cyr-trk-title-text">{h.count} test ID{h.count === 1 ? '' : 's'}</span>
              : <>{renderCaseId(h.caseId)}<span className="cyr-trk-title-text" title={h.title}>{h.title}</span></>}
          </div>
          <div className="cyr-trk-meta">
            <span title={fullTime(h.detectedAt)}>{new Date(h.detectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            {h.reason && <span className={`cyr-trk-pill reason-${h.reason}`}>{MISSING_REASON_LABEL[h.reason] || h.reason}</span>}
            {h.cat && <span className="cyr-trk-pill cat">{CAT_LABELS[normCat(h.cat)] || h.cat}</span>}
          </div>
          {h.type === 'case_moved' && h.from && <div className="cyr-trk-path" title={h.from}><FileCode2 size={11} /> from {h.from}</div>}
          {h.path && <div className="cyr-trk-path" title={h.path}><FileCode2 size={11} /> {h.type === 'case_moved' ? 'to ' : ''}{h.path}</div>}
        </div>
      </li>
    );
  };

  const missingIdsShown = tab === 'missing' ? items.map((c) => c.caseId) : [];
  const since = summary.seededAt ? new Date(summary.seededAt).toLocaleDateString() : null;

  return (
    <div className="cyr-card cyr-trk">
      <div className="cyr-trk-head">
        <button type="button" className="cyr-trk-collapse" onClick={() => setCollapsed((v) => !v)} aria-expanded={!collapsed}>
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          <span className="cyr-icon-chip" style={{ '--chip-accent': 'var(--accent-orange)' }}><Radar size={15} /></span>
          <span className="cyr-trk-heading">Test ID tracker</span>
        </button>
        <span className="cyr-trk-sub">
          {summary.presentCount} of {summary.trackedCount} tracked IDs present{since ? ` · baseline ${since}` : ''}
        </span>
        {collapsed && (counts.missing > 0 || unreviewedCount > 0) && (
          <span className="cyr-trk-collapsed-badges">
            {counts.missing > 0 && <span className="cyr-trk-pill reason-id_removed">{counts.missing} missing</span>}
            {unreviewedCount > 0 && <span className="cyr-trk-pill st-new">{unreviewedCount} new</span>}
          </span>
        )}
        <button type="button" className="cyr-btn small cyr-trk-rescan" onClick={handleRescan} disabled={loading} title="Re-scan the manifest's spec files now">
          <RefreshCw size={12} className={loading ? 'cyr-spin' : ''} /> Re-scan
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="cyr-trk-tiles">
            {TABS.map((t) => {
              const Icon = t.icon;
              const sub = t.key === 'missing' ? 'no longer in the codebase'
                : t.key === 'added' ? (unreviewedCount > 0 ? `${unreviewedCount} unreviewed` : 'since the baseline scan')
                  : t.key === 'restored' ? 'went missing, came back'
                    : 'changes logged';
              return (
                <button
                  key={t.key}
                  type="button"
                  className={`cyr-trk-tile${tab === t.key ? ' active' : ''}`}
                  style={{ '--tile-accent': t.accent }}
                  onClick={() => onTabChange(t.key)}
                >
                  <span className="cyr-trk-tile-label"><Icon size={13} /> {t.label}</span>
                  <span className="cyr-trk-tile-num">{counts[t.key]}</span>
                  <span className="cyr-trk-tile-sub">{sub}</span>
                </button>
              );
            })}
          </div>

          <div className="cyr-trk-toolbar">
            <div className="cyr-trk-search">
              <Search size={13} />
              <input placeholder="Filter by ID, title, file…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="cyr-trk-seg" role="group" aria-label="Category">
              {['ALL', ...CAT_ORDER].map((k) => (
                <button key={k} type="button" className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>
                  {k === 'ALL' ? 'All' : CAT_LABELS[k]}
                </button>
              ))}
            </div>
            <div className="cyr-trk-seg" role="group" aria-label="Time range">
              {RANGES.map((r) => (
                <button key={r.key} type="button" className={range === r.key ? 'on' : ''} onClick={() => setRange(r.key)}>{r.label}</button>
              ))}
            </div>
            {tab === 'activity' ? (
              <select className="cyr-trk-select" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} aria-label="Event type">
                <option value="all">All events</option>
                {Object.entries(EVENT_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
            ) : (
              <button type="button" className={`cyr-btn small${groupByFile ? ' active' : ''}`} onClick={() => setGroupByFile((v) => !v)} title="Group by spec file">
                <Layers size={12} /> {groupByFile ? 'Grouped by file' : 'Flat list'}
              </button>
            )}
            <div className="cyr-trk-toolbar-end">
              {tab === 'missing' && (
                <button type="button" className="cyr-btn small warn" disabled={busy || missingIdsShown.length === 0} onClick={() => dismiss(missingIdsShown)}>
                  <EyeOff size={12} /> Dismiss shown ({missingIdsShown.length})
                </button>
              )}
              {tab === 'added' && (
                <button type="button" className="cyr-btn small" disabled={busy || unreviewedCount === 0} onClick={markReviewed}>
                  <CheckCheck size={12} /> Mark all reviewed
                </button>
              )}
              <button type="button" className="cyr-btn small" disabled={items.length === 0} onClick={exportCsv} title="Download the rows shown as CSV">
                <Download size={12} /> CSV
              </button>
            </div>
          </div>

          <div className="cyr-trk-results">
            {loading && groups.length === 0 ? (
              <p className="cyr-trk-empty">Loading…</p>
            ) : items.length === 0 ? (
              <div className="cyr-trk-empty">
                <activeTab.icon size={20} />
                <p>
                  {counts[tab] === 0
                    ? ({ missing: 'Nothing missing. Every tracked test ID was found in the last scan.',
                      added: 'No new test IDs since the baseline scan.',
                      restored: 'No test ID has gone missing and come back.',
                      activity: 'No tracked changes yet.' })[tab]
                    : 'Nothing matches these filters.'}
                </p>
              </div>
            ) : (
              <div className="cyr-trk-groups">
                {groups.map((g) => {
                  if (g.key === '__all') {
                    return <ul key={g.key} className="cyr-trk-list">{g.items.map((c) => renderCaseRow(c, true))}</ul>;
                  }
                  const closed = closedGroups.has(g.key);
                  const reasons = tab === 'missing' ? Array.from(new Set(g.items.map((c) => c.reason))) : [];
                  return (
                    <section key={g.key} className="cyr-trk-group">
                      <div className="cyr-trk-group-head">
                        <button type="button" className="cyr-trk-group-toggle" onClick={() => toggleGroup(g.key)} aria-expanded={!closed}>
                          {closed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                          {tab === 'activity'
                            ? <span className="cyr-trk-group-title">{g.label}</span>
                            : <span className="cyr-trk-group-title mono" title={g.path}>{g.path}</span>}
                          <span className="cyr-trk-group-count">{g.items.length}</span>
                        </button>
                        {tab !== 'activity' && (
                          <span className="cyr-trk-group-tags">
                            {g.cat && <span className="cyr-trk-pill cat">{CAT_LABELS[normCat(g.cat)] || g.cat}</span>}
                            {g.grp && <span className="cyr-trk-grp">{g.grp}</span>}
                            {reasons.length === 1 && <span className={`cyr-trk-pill reason-${reasons[0]}`}>{MISSING_REASON_LABEL[reasons[0]] || reasons[0]}</span>}
                          </span>
                        )}
                        <span className="cyr-trk-group-actions">
                          {tab === 'missing' && (
                            <button type="button" className="cyr-btn small warn" disabled={busy} onClick={() => dismiss(g.items.map((c) => c.caseId))}>
                              <EyeOff size={11} /> Dismiss file
                            </button>
                          )}
                          {(tab === 'added' || tab === 'restored') && (
                            <button type="button" className="cyr-btn small" onClick={() => onQueueFile(g.path, g.cat)} title="Queue this spec file for a local run">
                              <PlayCircle size={11} /> Queue file
                            </button>
                          )}
                        </span>
                      </div>
                      {!closed && (
                        <ul className="cyr-trk-list">
                          {g.items.map((c) => (tab === 'activity' ? renderActivityRow(c) : renderCaseRow(c, false)))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CaseTrackerPanel;
