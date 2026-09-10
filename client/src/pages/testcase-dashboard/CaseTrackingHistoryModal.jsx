import { useEffect, useState } from 'react';
import { History, AlertTriangle, PlusCircle, CheckCircle2, FileX2, Trash2 } from 'lucide-react';
import ModalPortal from './ModalPortal';
import { showConfirm } from '../../utils/Alerts';

const REASON_LABEL = {
  file_deleted: 'file deleted from disk',
  id_removed: 'removed from its spec file',
};

const EVENT_META = {
  case_added: { icon: PlusCircle, label: 'Started tracking', color: 'var(--accent-cyan)' },
  case_missing: { icon: AlertTriangle, label: 'Went missing', color: 'var(--accent-red)' },
  case_restored: { icon: CheckCircle2, label: 'Back in codebase', color: 'var(--accent-green)' },
  file_untracked: { icon: FileX2, label: 'File removed from manifest', color: 'var(--text-muted)' },
};

// Shared by Cypress Runner and Jenkins Runner (Test Case Dashboard) — both
// read the same /api/testcases/data payload and the same case-tracking
// history, since a case id disappearing from a spec file is a fact about the
// codebase, not something specific to either runner.
const CaseTrackingHistoryModal = ({ missingCases, onClose }) => {
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

  return (
    <ModalPortal>
      <div className="tcd-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="tcd-modal full" role="dialog" aria-modal="true">
          <h3><History size={15} /> Test ID tracking</h3>
          <p className="tcd-modal-hint">
            Every case ID found in the manifest's spec files is remembered. If one later disappears — deleted from
            its it() block, or its whole file vanishes — it's flagged missing here until it reappears.
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
            {loading ? (
              <p className="tcd-modal-hint">Loading…</p>
            ) : history.length === 0 ? (
              <p className="tcd-modal-hint">No tracked changes yet.</p>
            ) : (
              <div className="tcd-case-history-list tcd-case-history-scroll">
                {history.map((h) => {
                  const meta = EVENT_META[h.type] || { icon: History, label: h.type, color: 'var(--text-muted)' };
                  const Icon = meta.icon;
                  return (
                    <div key={h.id} className="tcd-case-history-row">
                      <Icon size={14} style={{ color: meta.color }} />
                      <div className="tcd-case-history-row-body">
                        <div>
                          <strong>{meta.label}</strong>
                          {h.type === 'file_untracked'
                            ? <> — {h.count} case ID{h.count === 1 ? '' : 's'}</>
                            : <> — <code>{h.caseId}</code> {h.title}</>}
                        </div>
                        <div className="tcd-case-history-row-meta">
                          {h.path}{h.reason ? ` — ${REASON_LABEL[h.reason] || h.reason}` : ''} — {new Date(h.detectedAt).toLocaleString()}
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
