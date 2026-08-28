import { ListTodo } from 'lucide-react';
import { formatDuration, formatEta } from './helpers';

// Purely presentational — CypressRunner.jsx tracks which run ids have
// entered the queue/active slot since it was last empty (a "batch") and
// hands over just the counts + timings so this stays a dumb renderer.
const QueueProgress = ({ total, done, passed, failed, activeSpec, etaMs, elapsedMs }) => {
  if (!total) return null;
  const donePct = Math.round((done / total) * 100);
  const activeSegPct = activeSpec ? Math.max(100 / total, 2) : 0;
  const fillColor = failed === 0 ? 'var(--accent-green)' : (passed === 0 ? 'var(--accent-red)' : 'var(--accent-orange)');

  return (
    <div className="cyr-card cyr-queue-progress">
      <h3><span className="cyr-icon-chip" style={{ '--chip-accent': 'var(--accent-cyan)' }}><ListTodo size={15} /></span> Queue progress</h3>
      <div className="cyr-qp-track">
        <div className="cyr-qp-fill" style={{ width: `${donePct}%`, background: fillColor }} />
        {activeSpec && <div className="cyr-qp-active-seg" style={{ left: `${donePct}%`, width: `${activeSegPct}%` }} />}
      </div>
      <div className="cyr-qp-meta">
        <span><b>{done}</b> of <b>{total}</b> done</span>
        {passed > 0 && <span className="cyr-qp-passed">{passed} passed</span>}
        {failed > 0 && <span className="cyr-qp-failed">{failed} failed</span>}
        {activeSpec && <span className="cyr-qp-running" title={activeSpec}>Running: {activeSpec}</span>}
        <span className="cyr-qp-eta">Elapsed {formatDuration(elapsedMs) || '0s'} · Est. {formatEta(etaMs)} remaining</span>
      </div>
    </div>
  );
};

export default QueueProgress;
