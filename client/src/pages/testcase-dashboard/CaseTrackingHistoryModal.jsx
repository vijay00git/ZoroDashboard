import { useEffect, useMemo, useState } from 'react';
import { History, AlertTriangle, PlusCircle, CheckCircle2, FileX2, Trash2, EyeOff, MoveRight, MessageSquareOff, MessageSquare, UserPlus, UserMinus } from 'lucide-react';
import ModalPortal from './ModalPortal';
import { showConfirm } from '../../utils/Alerts';
import { MISSING_REASON_LABEL as REASON_LABEL } from './helpers';


const EVENT_META = {
  case_added: { icon: PlusCircle, label: 'Started tracking', color: 'var(--accent-cyan)' },
  case_missing: { icon: AlertTriangle, label: 'Went missing', color: 'var(--accent-red)' },
  case_restored: { icon: CheckCircle2, label: 'Back in codebase', color: 'var(--accent-green)' },
  file_untracked: { icon: FileX2, label: 'File removed from manifest', color: 'var(--text-muted)' },
  case_dismissed: { icon: EyeOff, label: 'Dismissed (stopped tracking)', color: 'var(--text-muted)' },
  case_moved: { icon: MoveRight, label: 'Moved to another spec', color: 'var(--accent-orange)' },
  case_commented: { icon: MessageSquareOff, label: 'Commented out', color: 'var(--accent-yellow)' },
  case_uncommented: { icon: MessageSquare, label: 'Uncommented', color: 'var(--accent-green)' },
  cases_owned: { icon: UserPlus, label: 'Added to case manifest', color: 'var(--accent-purple)' },
  cases_disowned: { icon: UserMinus, label: 'Removed from case manifest', color: 'var(--text-muted)' },
  case_retired: { icon: EyeOff, label: 'Marked intentionally removed', color: 'var(--text-muted)' },
  case_unretired: { icon: CheckCircle2, label: 'Un-retired', color: 'var(--accent-green)' },
};
const FILTERS = [
  ['all', 'All', null],
  ['case_moved', 'Moved', ['case_moved']],
  ['case_missing', 'Removed', ['case_missing']],
  ['case_added', 'Added', ['case_added', 'cases_owned']],
  ['case_restored', 'Restored', ['case_restored', 'case_uncommented']],
  ['case_commented', 'Commented out', ['case_commented']],
  ['manifest', 'Manifest edits', ['cases_owned', 'cases_disowned', 'file_untracked', 'case_dismissed', 'case_retired', 'case_unretired']],
];
const shortPath = (p) => String(p || '').replace('cypress/e2e/functional_tests/Regression/', '');

// Shared by Cypress Runner and Jenkins Runner (Test Case Dashboard) — both
// read the same /api/testcases/data payload and the same case-tracking
// history, since a case id disappearing from a spec file is a fact about the
// codebase, not something specific to either runner.
const CaseTrackingHistoryModal = ({ missingCases, onClose }) => {
  const [typeFilter, setTypeFilter] = useState('all');
  const [idFilter, setIdFilter] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    fetch('/api/testcases/case-tracking/history', { cache: 'no-store' })
      .then((r) => r.json())
      .then((body) => setHistory(body.history || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleClear = async () => {
    if (!(await showConfirm('Clear the whole test ID history log? Currently-missing IDs stay tracked and flagged — this only clears the log entries.'))) return;
    setClearing(true);
    try {
      await fetch('/api/testcases/case-tracking/clear-history', { method: 'POST' });
      setHistory([]);
    } finally {
      setClearing(false);
    }
  };

  const missing = missingCases || [];

  const shown = useMemo(() => {
    const types = (FILTERS.find(([k]) => k === typeFilter) || [])[2];
    const term = idFilter.trim().toUpperCase();
    return history.filter((h) => {
      if (types && !types.includes(h.type)) return false;
      if (term && !String(h.caseId || '').toUpperCase().includes(term) && !(h.caseIds || []).some((c) => c.includes(term))) return false;
      return true;
    });
  }, [history, typeFilter, idFilter]);
  const countOf = (types) => (types ? history.filter((h) => types.includes(h.type)).length : history.length);

  return (
    <ModalPortal>
      <div className="tcd-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="tcd-modal full" role="dialog" aria-modal="true">
          <h3><History size={15} /> Test ID tracking</h3>
          <p className="tcd-modal-hint">
            Every owned case ID is remembered with its spec. Moves to another spec, removals, additions,
            comment-outs and restores are logged here with their date.
          </p>

          <div className="tcd-case-history-section">
            <div className="tcd-case-history-heading">
              Currently missing {missing.length > 0 && <span className="tcd-case-history-count">{missing.length}</span>}
            </div>
            {missing.length === 0 ? (
              <p className="tcd-modal-hint">Nothing missing right now — every tracked case ID was found in its last scan.</p>
            ) : (
              <div className="tcd-case-history-list">
                {missing.map((c) => (
                  <div key={c.caseId} className="tcd-case-history-row missing">
                    <AlertTriangle size={14} />
                    <div className="tcd-case-history-row-body">
                      <div><code>{c.caseId}</code> {c.title}</div>
                      <div className="tcd-case-history-row-meta">
                        {c.path} — {REASON_LABEL[c.reason] || c.reason} — missing since {new Date(c.missingSince).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="tcd-case-history-section">
            <div className="tcd-case-history-heading">History log</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', margin: '0.4rem 0' }}>
              {FILTERS.map(([k, label, types]) => (
                <button key={k} type="button" className={`tcd-btn${typeFilter === k ? ' primary' : ''}`} onClick={() => setTypeFilter(k)}>
                  {label} ({countOf(types)})
                </button>
              ))}
              <input className="tcd-search-input" style={{ maxWidth: 200 }} placeholder="Case ID…" value={idFilter} onChange={(e) => setIdFilter(e.target.value)} />
            </div>
            {loading ? (
              <p className="tcd-modal-hint">Loading…</p>
            ) : shown.length === 0 ? (
              <p className="tcd-modal-hint">No tracked changes yet.</p>
            ) : (
              <div className="tcd-case-history-list tcd-case-history-scroll">
                {shown.map((h) => {
                  const meta = EVENT_META[h.type] || { icon: History, label: h.type, color: 'var(--text-muted)' };
                  const Icon = meta.icon;
                  return (
                    <div key={h.id} className="tcd-case-history-row">
                      <Icon size={14} style={{ color: meta.color }} />
                      <div className="tcd-case-history-row-body">
                        <div>
                          <strong>{meta.label}</strong>
                          {h.caseIds
                            ? <> — {h.count} case ID{h.count === 1 ? '' : 's'}: <code>{h.caseIds.slice(0, 12).join(', ')}{h.caseIds.length > 12 ? '…' : ''}</code></>
                            : h.type === 'file_untracked'
                              ? <> — {h.count} case ID{h.count === 1 ? '' : 's'}</>
                              : <> — <code>{h.caseId}</code> {h.title}</>}
                        </div>
                        <div className="tcd-case-history-row-meta">
                          {h.type === 'case_moved'
                            ? <>{shortPath(h.from)} → {shortPath(h.path)}</>
                            : shortPath(h.path)}
                          {h.reason ? ` — ${REASON_LABEL[h.reason] || h.reason}` : ''} — {new Date(h.detectedAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="tcd-modal-actions">
            <button className="tcd-btn" disabled={clearing || history.length === 0} onClick={handleClear}>
              <Trash2 size={13} /> Clear log
            </button>
            <button className="tcd-btn primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default CaseTrackingHistoryModal;
