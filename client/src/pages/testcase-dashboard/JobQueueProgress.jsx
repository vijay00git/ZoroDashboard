import { ListTodo } from 'lucide-react';
import { formatDuration, formatEta } from './helpers';

// Purely presentational — TestCaseDashboard.jsx tracks which job ids have
// entered the queue/running slot since it was last empty (a "batch") and
// hands over just the counts + timings so this stays a dumb renderer. Unlike
// Cypress Runner's single active spec, Jenkins can run several jobs in
// parallel (one per pool member), so `activePaths` is a list, not a value.
const JobQueueProgress = ({ total, done, passed, failed, activePaths, etaMs, elapsedMs }) => {
  if (!total) return null;
  const donePct = Math.round((done / total) * 100);
  const activeCount = activePaths.length;
  const activeSegPct = activeCount ? Math.max((activeCount / total) * 100, 2) : 0;
  const fillColor = failed === 0 ? 'var(--accent-green)' : (passed === 0 ? 'var(--accent-red)' : 'var(--accent-orange)');

  return (
    <div className="tcd-card tcd-queue-progress">
      <p className="tcd-card-title"><ListTodo size={13} /> Queue progress</p>
      <div className="tcd-qp-track">
        <div className="tcd-qp-fill" style={{ width: `${donePct}%`, background: fillColor }} />
        {activeCount > 0 && <div className="tcd-qp-active-seg" style={{ left: `${donePct}%`, width: `${activeSegPct}%` }} />}
      </div>
      <div className="tcd-qp-meta">
        <span><b>{done}</b> of <b>{total}</b> done</span>
        {passed > 0 && <span className="tcd-qp-passed">{passed} passed</span>}
        {failed > 0 && <span className="tcd-qp-failed">{failed} failed</span>}
        {activeCount > 0 && (
          <span className="tcd-qp-running" title={activePaths.join(', ')}>
            Running: {activeCount === 1 ? activePaths[0] : `${activeCount} jobs`}
          </span>
        )}
        <span className="tcd-qp-eta">Elapsed {formatDuration(elapsedMs) || '0s'} · Est. {formatEta(etaMs)} remaining</span>
      </div>
    </div>
  );
};

export default JobQueueProgress;
