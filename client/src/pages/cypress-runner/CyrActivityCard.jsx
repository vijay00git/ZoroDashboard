import { Activity } from 'lucide-react';
import DonutChart from '../testcase-dashboard/DonutChart';
import { pctColor } from '../testcase-dashboard/helpers';
import { cyrRecentRunStats, formatDateTime } from './helpers';

// .tcd-trend-dot only understands dot-pass/dot-fail/dot-other (defined
// for Jenkins' uppercase statuses) — map cyr's own lowercase statuses onto
// that same small vocabulary rather than adding new CSS for it.
function cyrDotClass(status) {
  if (status === 'passed') return 'dot-pass';
  if (status === 'failed' || status === 'killed') return 'dot-fail';
  return 'dot-other';
}

// Mirrors testcase-dashboard/JobActivityCard's shape (donut + trend-dot
// strip) but built on cyrRecentRunStats instead of recentBuildStats, since
// Cypress Runner's history uses its own lowercase status vocabulary.
const CyrActivityCard = ({ history }) => {
  const { recent, success, failed, rate, lastAt } = cyrRecentRunStats(history, 20);
  const other = recent.length - success - failed;

  return (
    <div className="tcd-card">
      <p className="tcd-card-title"><Activity size={13} /> Run activity <span className="tcd-card-title-sub">(last {recent.length || 0})</span></p>
      {recent.length === 0 ? (
        <div className="tcd-hero-empty">
          <p>No completed runs yet.</p>
          <p className="tcd-modal-hint">Queue files above or hit Run to trigger a local Cypress run.</p>
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
              {lastAt && <span className="run-id">Last run {formatDateTime(lastAt)}</span>}
            </div>
          </div>
          <div className="tcd-activity-trend" title="Most recent runs, oldest → newest">
            {recent.slice().reverse().map((h, i) => (
              <span key={i} className={`tcd-trend-dot lg ${cyrDotClass(h.status)}`} title={`${h.specPath || 'all specs'} — ${h.status}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default CyrActivityCard;
