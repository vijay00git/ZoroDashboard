import { Gauge } from 'lucide-react';
import DonutChart from '../testcase-dashboard/DonutChart';
import { STATUS_COLOR } from '../testcase-dashboard/helpers';
import { localRunTally } from './helpers';

const SWATCHES = [['passed', 'Passed'], ['failed', 'Failed'], ['untested', 'Untested']];

// Local counterpart to RunStatusCard — that card tallies a pulled TestRail
// run's statuses against the manifest; this one tallies each file's own most
// recent *local* Cypress run (caseResultsByPath) against the manifest, so it
// stays populated even when no TestRail run has been pulled yet.
const LocalRunStatusCard = ({ data, caseResultsByPath, statusByPath }) => {
  const tally = localRunTally(data.rows, caseResultsByPath, statusByPath);
  const total = data.totalCases || 0;
  const run = tally.passed + tally.failed;
  const segments = [
    { value: tally.passed, color: STATUS_COLOR.passed },
    { value: tally.failed, color: STATUS_COLOR.failed },
    { value: tally.untested, color: STATUS_COLOR.untested },
  ];

  return (
    <div className="tcd-card">
      <p className="tcd-card-title"><Gauge size={13} /> Local run status</p>
      <div className="tcd-donut-row">
        <div className="tcd-donut-wrap">
          <DonutChart segments={segments} size={88} />
          <div className="tcd-donut-total"><span className="n">{run}</span><span className="lbl">run</span></div>
        </div>
        <div className="tcd-run-meta">
          <span className="run-name">Local Cypress results</span>
          <span className="run-id">{run} of {total} manifest cases run locally</span>
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

export default LocalRunStatusCard;
