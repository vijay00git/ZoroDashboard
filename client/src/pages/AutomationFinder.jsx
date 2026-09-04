import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCw, Search, Download, ExternalLink, FileCode2, MessageSquareOff,
  AlertTriangle, ChevronDown, ChevronRight, Pencil,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { showPrompt } from '../utils/Alerts';
import './AutomationFinder.css';

const EMPTY_DATA = { generatedAt: null, testrailUrl: '', referenceRunId: null, referenceRunName: null, sheetUrl: '', sectionTree: [], summary: null, cases: {} };

// Verdict is decided ONLY from the codebase scan + the reference run's real
// execution status (see server.js afMergeCase) — the sheet and TestRail's
// custom_automation checkbox are shown as their own tags below, never folded
// into this.
const VERDICT_LABEL = {
  not_automated: 'Not automated',
  commented: 'Commented',
  automated: 'Automated',
};

const FLAG_LABEL = {
  not_confirmed_by_run: 'Code exists, run never confirmed it',
  run_result_no_codebase_match: 'Run has a result, no codebase match',
  sheet_says_done_but_unconfirmed: 'Sheet says Done, unconfirmed',
  sheet_not_marked_done: "Sheet doesn't say Done yet",
  checkbox_says_automated_but_unconfirmed: 'TestRail checkbox says yes, unconfirmed',
  assignee_conflict: 'Different QA names',
  duplicate_in_sheet: 'Duplicate row in sheet',
  qa_data_issue: 'Bad QA data',
  not_in_sheet: 'Missing from sheet',
  outside_reference_suite: 'Not in reference suite',
  blocked: 'Blocked',
};

// TestRail's own status colors (Passed/Blocked/Untested/Retest/Failed) —
// matches the run's own status_id map so the tag reads the same as TestRail.
function runStatusClass(name) {
  const n = (name || '').toLowerCase();
  if (n === 'passed') return 'run-passed';
  if (n === 'failed') return 'run-failed';
  if (n === 'retest') return 'run-retest';
  if (n === 'blocked') return 'run-blocked';
  return 'run-untested';
}

function feasibilityClass(value) {
  const v = (value || '').toLowerCase();
  if (v === 'automatable') return 'feas-good';
  if (v === 'not automatable') return 'feas-bad';
  if (v === 'blocked') return 'feas-warn';
  return 'feas-unknown';
}

// Extra, combinable filter conditions — each a checkbox, combined with each
// other via the AND/OR toggle (separate from the verdict chip/search/assignee
// filters above, which always AND with whatever this group produces).
const CONDITIONS = [
  { key: 'not_confirmed_by_run', label: 'Code exists, run never confirmed it', test: (c) => c.flags.includes('not_confirmed_by_run') },
  { key: 'run_result_no_codebase_match', label: 'Run confirmed, no codebase match', test: (c) => c.flags.includes('run_result_no_codebase_match') },
  { key: 'not_in_sheet', label: 'Missing from sheet', test: (c) => c.flags.includes('not_in_sheet') },
  { key: 'outside_reference_suite', label: 'Not in reference suite', test: (c) => c.flags.includes('outside_reference_suite') },
  { key: 'testrail_mapped', label: 'Mapped in TestRail (checkbox)', test: (c) => !!c.testrail.automationFlag },
  { key: 'present_in_codebase', label: 'Present in codebase', test: (c) => c.codebase.files.length > 0 },
  { key: 'sheet_says_done_but_unconfirmed', label: 'Sheet says Done, unconfirmed', test: (c) => c.flags.includes('sheet_says_done_but_unconfirmed') },
  { key: 'sheet_not_marked_done', label: "Sheet doesn't say Done yet", test: (c) => c.flags.includes('sheet_not_marked_done') },
  { key: 'checkbox_says_automated_but_unconfirmed', label: 'TestRail checkbox says yes, unconfirmed', test: (c) => c.flags.includes('checkbox_says_automated_but_unconfirmed') },
  { key: 'assignee_conflict', label: 'Different QA names', test: (c) => c.flags.includes('assignee_conflict') },
  { key: 'duplicate_in_sheet', label: 'Duplicate row in sheet', test: (c) => c.flags.includes('duplicate_in_sheet') },
  { key: 'qa_data_issue', label: 'Bad QA data', test: (c) => c.flags.includes('qa_data_issue') },
  { key: 'blocked', label: 'Blocked (sheet)', test: (c) => c.flags.includes('blocked') },
];

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function timeAgo(iso) {
  if (!iso) return 'never';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const AutomationFinder = () => {
  const { showToast } = useToast();
  const [data, setData] = useState(EMPTY_DATA);
  const [overrides, setOverrides] = useState({});
  const [progress, setProgress] = useState({ running: false, phase: 'idle' });
  const [verdictFilter, setVerdictFilter] = useState('not_automated');
  const [selectedConditions, setSelectedConditions] = useState(() => new Set());
  const [conditionMode, setConditionMode] = useState('AND'); // 'AND' | 'OR'
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [search, setSearch] = useState('');
  const [openSections, setOpenSections] = useState(() => new Set());
  const pollRef = useRef(null);

  const loadData = () => {
    fetch('/api/automation-finder/data').then((r) => r.json()).then(setData).catch(() => {});
    fetch('/api/automation-finder/overrides').then((r) => r.json()).then(setOverrides).catch(() => {});
  };

  useEffect(() => { loadData(); }, []);

  const pollProgress = () => {
    fetch('/api/automation-finder/progress').then((r) => r.json()).then((p) => {
      setProgress(p);
      if (p.running) {
        pollRef.current = setTimeout(pollProgress, 2000);
      } else {
        loadData();
      }
    }).catch(() => { pollRef.current = setTimeout(pollProgress, 4000); });
  };

  useEffect(() => {
    pollProgress();
    return () => clearTimeout(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSync = async () => {
    const res = await fetch('/api/automation-finder/sync', { method: 'POST' });
    if (res.status === 409) { showToast('A sync is already running', 'warning'); return; }
    if (!res.ok) { showToast('Failed to start sync', 'error'); return; }
    showToast('Sync started — this scans ~11k cases and can take a couple of minutes', 'info');
    clearTimeout(pollRef.current);
    pollProgress();
  };

  const cases = useMemo(() => Object.values(data.cases || {}), [data]);

  const summary = data.summary || { total: 0, automated: 0, commented: 0, not_automated: 0, flagged: 0 };
  const notAutomatableCount = useMemo(
    () => cases.filter((c) => (c.feasibility || '').toLowerCase() === 'not automatable').length,
    [cases],
  );

  const activeConditions = useMemo(
    () => CONDITIONS.filter((cond) => selectedConditions.has(cond.key)),
    [selectedConditions],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const aq = assigneeQuery.trim().toLowerCase();
    return cases.filter((c) => {
      if (verdictFilter !== 'all' && c.verdict !== verdictFilter) return false;
      if (activeConditions.length) {
        const matches = conditionMode === 'AND'
          ? activeConditions.every((cond) => cond.test(c))
          : activeConditions.some((cond) => cond.test(c));
        if (!matches) return false;
      }
      if (q && !(c.caseId.toLowerCase().includes(q) || (c.title || '').toLowerCase().includes(q))) return false;
      if (aq) {
        const names = [c.sheet && c.sheet.cloudQA, c.sheet && c.sheet.deviceQA, overrides[c.caseId] && overrides[c.caseId].assignee]
          .filter(Boolean).map((n) => n.toLowerCase());
        if (!names.some((n) => n.includes(aq))) return false;
      }
      return true;
    });
  }, [cases, verdictFilter, activeConditions, conditionMode, search, assigneeQuery, overrides]);

  const toggleCondition = (key) => {
    setSelectedConditions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((c) => {
      const top = (c.sectionPath && c.sectionPath[0]) || 'Other suites / no section';
      if (!map.has(top)) map.set(top, []);
      map.get(top).push(c);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  const toggleSection = (name) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const expandAll = () => setOpenSections(new Set(grouped.map(([name]) => name)));
  const collapseAll = () => setOpenSections(new Set());

  const exportCsv = () => {
    const header = ['Case ID', 'Title', 'Section', 'Verdict', 'In Codebase', 'Commented', 'Spec Files', 'Run Status', 'TestRail Checkbox', 'Feasibility (sheet)', 'Cloud Status', 'Cloud QA', 'Device Status', 'Device QA', 'Assignee Override', 'Note', 'Flags'];
    const rows = filtered.map((c) => {
      const ov = overrides[c.caseId] || {};
      return [
        c.caseId, c.title, (c.sectionPath || []).join(' > '), VERDICT_LABEL[c.verdict] || c.verdict,
        c.codebase.inCodebase ? 'Yes' : 'No', c.codebase.commented ? 'Yes' : 'No',
        c.codebase.files.map((f) => f.path).join(' | '),
        c.run.statusName, c.testrail.automationFlag ? 'Yes' : 'No', c.feasibility || '',
        c.sheet ? c.sheet.cloudStatus || '' : '',
        c.sheet ? c.sheet.cloudQA || '' : '',
        c.sheet ? c.sheet.deviceStatus || '' : '',
        c.sheet ? c.sheet.deviceQA || '' : '',
        ov.assignee || '', ov.note || '',
        (c.flags || []).map((f) => FLAG_LABEL[f] || f).join(' | '),
      ];
    });
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `automation-finder-${verdictFilter}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOverride = async (caseId) => {
    const current = overrides[caseId] || {};
    const assignee = await showPrompt(`Assign ${caseId} to (leave blank to clear):`, current.assignee || '');
    if (assignee === null || assignee === undefined) return;
    const res = await fetch('/api/automation-finder/overrides', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, assignee, note: current.note || '' }),
    });
    const out = await res.json();
    setOverrides((prev) => ({ ...prev, [caseId]: out.entry || undefined }));
  };

  const caseUrl = (caseId) => data.testrailUrl ? `${data.testrailUrl}/index.php?/cases/view/${caseId.replace(/^C/i, '')}` : null;

  return (
    <div className="af">
      <div className="af-title-hero">
        <h1>Automation Finder</h1>
        <p>Verdict comes only from the ic-tokyo codebase and the reference run's real pass/fail results — the sheet and TestRail's automation checkbox are shown alongside for reference, not used to decide.</p>
      </div>

      <div className="af-card af-toolbar">
        <button className="af-btn primary" onClick={handleSync} disabled={progress.running}>
          <RefreshCw size={14} className={progress.running ? 'af-spin' : ''} /> {progress.running ? 'Syncing…' : 'Sync Now'}
        </button>
        <span className="af-last-synced">
          {data.generatedAt ? `Last synced ${timeAgo(data.generatedAt)}` : 'Never synced yet'}
        </span>
        {progress.error && <span className="af-error"><AlertTriangle size={13} /> {progress.error}</span>}
        <div className="af-spacer" />
        <button className="af-btn small" onClick={exportCsv} disabled={!filtered.length}>
          <Download size={13} /> Export CSV ({filtered.length})
        </button>
      </div>

      {progress.running && (
        <div className="af-card af-progress">
          <p className="af-progress-phase">{progress.phase}</p>
          {!!progress.total && (
            <div className="af-progress-track">
              <div className="af-progress-fill" style={{ width: `${Math.min(100, Math.round((progress.done / progress.total) * 100))}%` }} />
            </div>
          )}
        </div>
      )}

      <div className="af-stats">
        <div className="af-stat"><span className="af-stat-num">{summary.total}</span><span className="af-stat-label">Total cases</span></div>
        <div className="af-stat highlight"><span className="af-stat-num">{summary.not_automated}</span><span className="af-stat-label">Not automated</span></div>
        <div className="af-stat"><span className="af-stat-num">{summary.commented}</span><span className="af-stat-label">Commented</span></div>
        <div className="af-stat"><span className="af-stat-num">{summary.automated}</span><span className="af-stat-label">Automated</span></div>
        <div className="af-stat"><span className="af-stat-num">{notAutomatableCount}</span><span className="af-stat-label">Not automatable (sheet)</span></div>
        <div className="af-stat warn"><span className="af-stat-num">{summary.flagged}</span><span className="af-stat-label">Flagged</span></div>
      </div>

      <div className="af-card af-filter-bar">
        <div className="af-filter-chips">
          {['not_automated', 'commented', 'automated', 'all'].map((v) => (
            <button key={v} className={`af-chip ${verdictFilter === v ? 'active' : ''}`} onClick={() => setVerdictFilter(v)}>
              {v === 'all' ? 'All' : VERDICT_LABEL[v]}
            </button>
          ))}
          <span className="af-filter-divider" />
          <button className={`af-chip issue ${activeConditions.length ? 'active' : ''}`} onClick={() => setConditionsOpen((v) => !v)}>
            <AlertTriangle size={12} /> More filters {activeConditions.length ? `(${activeConditions.length})` : ''}
            {conditionsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {activeConditions.length > 1 && (
            <div className="af-gate-toggle">
              <button className={conditionMode === 'AND' ? 'active' : ''} onClick={() => setConditionMode('AND')}>AND</button>
              <button className={conditionMode === 'OR' ? 'active' : ''} onClick={() => setConditionMode('OR')}>OR</button>
            </div>
          )}
          {activeConditions.length > 0 && (
            <button className="af-chip clear" onClick={() => setSelectedConditions(new Set())}>Clear filters</button>
          )}
        </div>

        {conditionsOpen && (
          <div className="af-conditions-panel">
            {CONDITIONS.map((cond) => (
              <label key={cond.key} className="af-condition-check">
                <input
                  type="checkbox"
                  checked={selectedConditions.has(cond.key)}
                  onChange={() => toggleCondition(cond.key)}
                />
                {cond.label}
              </label>
            ))}
          </div>
        )}

        <div className="af-search-row">
          <div className="af-input-wrap">
            <Search size={13} />
            <input className="af-input" placeholder="Search case ID or title…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="af-input-wrap">
            <input className="af-input" placeholder="Filter by assignee name…" value={assigneeQuery} onChange={(e) => setAssigneeQuery(e.target.value)} />
          </div>
          <span className="af-result-count">{filtered.length.toLocaleString()} of {cases.length.toLocaleString()} cases</span>
          <button className="af-btn small" onClick={expandAll}>Expand all</button>
          <button className="af-btn small" onClick={collapseAll}>Collapse all</button>
        </div>
      </div>

      <div className="af-groups">
        {grouped.length === 0 && <div className="af-card af-empty">No cases match these filters.</div>}
        {grouped.map(([sectionName, rows]) => {
          const isOpen = openSections.has(sectionName);
          return (
            <div className="af-card af-group" key={sectionName}>
              <button className="af-group-header" onClick={() => toggleSection(sectionName)}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="af-group-name">{sectionName}</span>
                <span className="af-group-count">{rows.length}</span>
              </button>
              {isOpen && (
                <div className="af-table-wrap">
                  <table className="af-table">
                    <thead>
                      <tr>
                        <th>Case</th>
                        <th>Title</th>
                        <th>Verdict</th>
                        <th>Codebase</th>
                        <th>Run status</th>
                        <th>TestRail checkbox</th>
                        <th>Feasibility (sheet)</th>
                        <th>Cloud status / QA</th>
                        <th>Device status / QA</th>
                        <th>Flags</th>
                        <th>Assignee note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((c) => {
                        const ov = overrides[c.caseId];
                        const url = caseUrl(c.caseId);
                        return (
                          <tr key={c.caseId}>
                            <td className="af-mono">
                              {url ? <a href={url} target="_blank" rel="noreferrer">{c.caseId} <ExternalLink size={10} /></a> : c.caseId}
                            </td>
                            <td className="af-title-cell" title={c.title}>{c.title}</td>
                            <td><span className={`af-badge verdict-${c.verdict}`}>{VERDICT_LABEL[c.verdict] || c.verdict}</span></td>
                            <td>
                              {c.codebase.files.length > 0 ? (
                                <span className={`af-code-badge ${c.codebase.commented ? 'commented' : 'active'}`} title={c.codebase.files.map((f) => f.path).join('\n')}>
                                  {c.codebase.commented ? <MessageSquareOff size={12} /> : <FileCode2 size={12} />}
                                  {c.codebase.files.length} file{c.codebase.files.length > 1 ? 's' : ''}
                                </span>
                              ) : <span className="af-muted">—</span>}
                            </td>
                            <td><span className={`af-tag ${runStatusClass(c.run.statusName)}`}>{c.run.statusName}</span></td>
                            <td>{c.testrail.automationFlag ? <span className="af-badge yes">Yes</span> : <span className="af-muted">No</span>}</td>
                            <td>{c.feasibility ? <span className={`af-tag ${feasibilityClass(c.feasibility)}`}>{c.feasibility}</span> : <span className="af-muted">not in sheet</span>}</td>
                            <td>
                              {c.sheet ? (
                                <>
                                  <div>{c.sheet.cloudStatus || '—'}</div>
                                  {c.sheet.cloudQA && <div className="af-qa-name">{c.sheet.cloudQA}</div>}
                                </>
                              ) : <span className="af-muted">—</span>}
                            </td>
                            <td>
                              {c.sheet ? (
                                <>
                                  <div>{c.sheet.deviceStatus || '—'}</div>
                                  {c.sheet.deviceQA && <div className="af-qa-name">{c.sheet.deviceQA}</div>}
                                </>
                              ) : <span className="af-muted">—</span>}
                            </td>
                            <td>
                              <div className="af-flags">
                                {(c.flags || []).map((f) => (
                                  <span key={f} className="af-flag-badge" title={f}>{FLAG_LABEL[f] || f}</span>
                                ))}
                              </div>
                            </td>
                            <td>
                              <button className="af-override-btn" onClick={() => handleOverride(c.caseId)}>
                                <Pencil size={11} /> {ov ? ov.assignee || ov.note || 'edit' : 'assign'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AutomationFinder;
