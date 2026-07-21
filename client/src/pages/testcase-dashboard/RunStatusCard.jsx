import { Target } from 'lucide-react';
import DonutChart from './DonutChart';
import { tallyFor, statusSegments, STATUS_COLOR } from './helpers';

const SWATCHES = [
  ['passed', 'Passed'], ['failed', 'Failed'], ['blocked', 'Blocked'],
  ['retest', 'Retest'], ['untested', 'Untested'],
];

const RunStatusCard = ({ data, runStatus, onFocusRunId }) => {
  if (!runStatus) {
    return (
      <div className="tcd-card">
        <p className="tcd-card-title"><Target size={13} /> Run status</p>
        <div className="tcd-hero-empty">
          <Target size={22} style={{ color: 'var(--text-muted)' }} />
          <p>Pull a TestRail run to compare live status against the manifest.</p>
          <button type="button" className="tcd-btn small" onClick={onFocusRunId}>Enter a run ID</button>
        </div>
      </div>
    );
  }
  const { tally, matched } = tallyFor(data.rows, runStatus);

  return (
    <div className="tcd-card">
      <p className="tcd-card-title"><Target size={13} /> Run status</p>
      <div className="tcd-donut-row">
        <div className="tcd-donut-wrap">
          <DonutChart segments={statusSegments(tally)} size={88} />
          <div className="tcd-donut-total"><span className="n">{matched}</span><span className="lbl">matched</span></div>
        </div>
        <div className="tcd-run-meta">
          <span className="run-name">{runStatus.runName || `Run ${runStatus.runId}`}</span>
          <span className="run-id">#{runStatus.runId} · {runStatus.completed ? 'completed' : 'active'}</span>
          <span className="run-id">{matched} of {data.totalCases} manifest cases matched</span>
        </div>
      </div>
      <div className="tcd-tally">
        {SWATCHES.map(([key, label]) => (
          <span key={key}><span className="tcd-sw" style={{ background: STATUS_COLOR[key] }} />{tally[key]} {label}</span>
        ))}
      </div>
    </div>
  );
};

export default RunStatusCard;
