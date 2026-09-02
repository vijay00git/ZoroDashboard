import { History } from 'lucide-react';
import ModalPortal from './ModalPortal';
import { RunItem } from './RunsPanel';

// Jenkins Runner counterpart to cypress-runner/FileHistoryModal — same idea
// (filter the page's own queue/running/history down to one spec), but reuses
// RunsPanel's own RunItem row so a build here looks and behaves exactly like
// it does in the main Job runs panel (including opening the same
// RunDetailsModal on click).
const FileHistoryModal = ({ path, queue, running, history, onClose, onOpenDetails, onCancelJob }) => {
  const runningItems = (running || []).filter((r) => r.path === path);
  const queued = (queue || []).filter((q) => q.path === path);
  const past = (history || []).filter((h) => h.path === path);
  const total = runningItems.length + queued.length + past.length;

  return (
    <ModalPortal>
      <div className="tcd-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="tcd-modal" role="dialog" aria-modal="true">
          <h3><History size={15} /> Run history</h3>
          <div className="tcd-modal-path">{path}</div>

          {total === 0 ? (
            <p className="tcd-modal-hint">No builds triggered for this file yet.</p>
          ) : (
            <div className="tcd-runs-list" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              {runningItems.map((r, i) => (
                <RunItem key={`r${i}`} item={r} onOpenDetails={onOpenDetails} onCancel={onCancelJob} />
              ))}
              {queued.map((q, i) => (
                <RunItem key={`q${i}`} item={q} onOpenDetails={onOpenDetails} onCancel={onCancelJob} />
              ))}
              {past.map((h, i) => (
                <RunItem key={`h${i}`} item={h} isHistory onOpenDetails={onOpenDetails} />
              ))}
            </div>
          )}

          <div className="tcd-modal-actions">
            <button className="tcd-btn primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default FileHistoryModal;
