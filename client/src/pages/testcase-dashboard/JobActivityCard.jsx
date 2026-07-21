import { Activity } from 'lucide-react';
import DonutChart from './DonutChart';
import { recentBuildStats, trendDotClass, formatDateTime, pctColor } from './helpers';

const JobActivityCard = ({ runsState }) => {
  const { recent, success, failed, rate, lastAt } = recentBuildStats(runsState.history, 20);
  const other = recent.length - success - failed;

  return (
    <div className="tcd-card">
      <p className="tcd-card-title"><Activity size={13} /> Job activity <span className="tcd-card-title-sub">(last {recent.length || 0})</span></p>
      {recent.length === 0 ? (
        <div className="tcd-hero-empty">
          <p>No completed builds yet.</p>
          <p className="tcd-modal-hint">Select files below and hit Run to trigger a Jenkins build.</p>
        </div>
      ) : (
        <>
          <div className="tcd-donut-row">
            <div className="tcd-donut-wrap">
              <DonutChart
                size={80}
                segments={[
                  { value: success, color: 'var(--accent-green)' },
                  { value: failed, color: 'var(--accent-red)' },
                  { value: other, color: 'var(--text-muted)' },
                ]}
              />
              <div className="tcd-donut-total"><span className="n" style={{ color: pctColor(rate) }}>{rate}%</span><span className="lbl">pass</span></div>
            </div>
            <div className="tcd-run-meta">
              <span className="run-name">{success} passed · {failed} failed{other ? ` · ${other} other` : ''}</span>
              {lastAt && <span className="run-id">Last build {formatDateTime(lastAt)}</span>}
            </div>
          </div>
          <div className="tcd-activity-trend" title="Most recent builds, oldest → newest">
            {recent.slice().reverse().map((h, i) => (
              <span key={i} className={`tcd-trend-dot lg ${trendDotClass(h.status)}`} title={`${h.path} — ${h.status}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default JobActivityCard;
