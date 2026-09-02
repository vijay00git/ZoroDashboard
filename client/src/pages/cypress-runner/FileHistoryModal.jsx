import { History, Terminal, Image } from 'lucide-react';
import ModalPortal from '../testcase-dashboard/ModalPortal';
import RunStatusPill from './RunStatusPill';
import { formatDuration, formatTime } from './helpers';

// Opened from a file card's History button — filters the page's own
// queue/active/history state down to just this one spec, so you don't have
// to hunt through the global Runs list to see what's happened to a single
// file. Reuses the existing viewLog/viewScreenshots handlers (passed down
// from CypressRunner.jsx) rather than duplicating that logic, so clicking
// through behaves identically to the main Runs list.
const FileHistoryModal = ({ path, queue, active, history, onClose, onViewLog, onViewScreenshots }) => {
  const queued = (queue || []).filter((q) => q.path === path);
  const isActive = !!active && active.specPath === path;
  const past = (history || []).filter((h) => h.specPath === path);
  const total = queued.length + (isActive ? 1 : 0) + past.length;

  return (
    <ModalPortal>
      <div className="cyr-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="cyr-modal cyr-history-modal" role="dialog" aria-modal="true">
          <h3><History size={15} /> Run history</h3>
          <div className="cyr-cmp-spec">{path}</div>

          {total === 0 ? (
            <p className="cyr-empty">No runs recorded for this spec yet.</p>
          ) : (
            <div className="cyr-history-list cyr-history-modal-list">
              {isActive && (
                <div className="cyr-history-item">
                  <RunStatusPill status={active.status} />
                  {active.category && <span className="cyr-badge">{active.category}</span>}
                  {active.browser && <span className="cyr-badge">{active.browser}</span>}
                  <span className="cyr-badge">{active.headed ? 'headed' : 'headless'}</span>
                  {active.environment && <span className="cyr-badge">{active.environment}</span>}
                  <span className="cyr-badge" title="When this run started">Started {formatTime(active.startedAt)}</span>
                </div>
              )}
              {queued.map((q) => (
                <div key={q.id} className="cyr-history-item">
                  <RunStatusPill status="queued" />
                  {q.cat && <span className="cyr-badge">{q.cat}</span>}
                  {q.browser && <span className="cyr-badge">{q.browser}</span>}
                  <span className="cyr-badge">{q.headed ? 'headed' : 'headless'}</span>
                  {q.environment && <span className="cyr-badge">{q.environment}</span>}
                </div>
              ))}
              {past.map((h) => (
                <div key={h.id} className="cyr-history-item">
                  <RunStatusPill status={h.status} />
                  {h.category && <span className="cyr-badge">{h.category}</span>}
                  {h.browser && <span className="cyr-badge">{h.browser}</span>}
                  <span className="cyr-badge">{h.headed ? 'headed' : 'headless'}</span>
                  {h.environment && <span className="cyr-badge">{h.environment}</span>}
                  {h.stats && (
                    <span className="cyr-badge">
                      <b style={{ color: 'var(--accent-green)' }}>{h.stats.passing}✓</b>{' '}
                      <b style={{ color: 'var(--accent-red)' }}>{h.stats.failing}✗</b>
                    </span>
                  )}
                  {h.duration ? <span className="cyr-badge">{formatDuration(h.duration)}</span> : null}
                  {h.screenshots && h.screenshots.length > 0 && (
                    <button type="button" className="cyr-badge cyr-badge-btn" title="View screenshots" aria-label="View screenshots" onClick={() => onViewScreenshots(h)}>
                      <Image size={11} /> {h.screenshots.length}
                    </button>
                  )}
                  <span className="cyr-badge" title="When this run started">Started {formatTime(h.startedAt)}</span>
                  <button type="button" className="cyr-btn small" onClick={() => onViewLog(h)}>
                    <Terminal size={12} /> Log
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="cyr-modal-actions">
            <button className="cyr-btn primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default FileHistoryModal;
