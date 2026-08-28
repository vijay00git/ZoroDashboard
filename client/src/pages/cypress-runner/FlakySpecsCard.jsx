import { Zap } from 'lucide-react';
import { trendDotClass } from '../testcase-dashboard/helpers';

// A file is flaky when its local-run trend flips between pass and fail more
// than once (isFlakyTrend, applied to the same fileTrendMap the tree's own
// per-file "Flaky" badge already uses) — surfaced here as one glanceable
// list instead of requiring the whole tree to be scanned row by row.
const FlakySpecsCard = ({ specs, caseCount, onFocusPath }) => (
  <div className="tcd-card cyr-flaky-card">
    <p className="tcd-card-title">
      <Zap size={13} /> Flaky specs
      <span className="tcd-card-title-sub">
        {specs.length} spec{specs.length === 1 ? '' : 's'} · {caseCount} case{caseCount === 1 ? '' : 's'}
      </span>
    </p>
    {specs.length === 0 ? (
      <div className="tcd-hero-empty">
        <p>None detected.</p>
        <p className="tcd-modal-hint">A spec is flagged once its last few local runs flip between pass and fail more than once.</p>
      </div>
    ) : (
      <ul className="cyr-flaky-list">
        {specs.map(({ path, trend }) => (
          <li key={path}>
            <button type="button" className="cyr-flaky-item" title={`Filter the tree to ${path}`} onClick={() => onFocusPath(path)}>
              <span className="cyr-flaky-path">{path}</span>
              <span className="cyr-flaky-trend" title={`Every run recorded for this file (${trend.length})`}>
                {trend.slice(-8).map((h, i) => <span key={i} className={`tcd-trend-dot ${trendDotClass(h.status)}`} />)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
);

export default FlakySpecsCard;
