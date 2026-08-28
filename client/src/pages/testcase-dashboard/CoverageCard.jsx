import { Layers, CheckCircle2 } from 'lucide-react';
import DonutChart from './DonutChart';
import { CAT_ORDER, CAT_LABELS, normCat } from './helpers';

const CAT_COLOR = { OFFLINE: 'var(--accent-cyan)', ONLINE: 'var(--accent-purple)', E2E: 'var(--accent-pink)' };

// activeCats/onToggleCat are optional — when passed (currently just Cypress
// Runner, which already tracks this same per-category filter state for its
// StatsBar), each tier segment/chip doubles as a filter toggle so this card
// and the filter bar drive the same state instead of being two disconnected
// controls. Without them (the Jenkins Test Case Dashboard) the card is
// purely decorative — same as before.
const CoverageCard = ({ data, activeCats, onToggleCat }) => {
  const total = data.totalCases || 0;
  const commentedCount = data.rows.filter((r) => r.commented).length;
  const unknownCount = (data.unknownIds || []).length;
  const cleanCount = Math.max(0, total - commentedCount - unknownCount);

  const tiers = CAT_ORDER.map((cat) => {
    let count = 0;
    Object.keys(data.catCounts || {}).forEach((k) => { if (normCat(k) === cat) count += data.catCounts[k]; });
    return { cat, count, pct: total ? (count / total) * 100 : 0 };
  }).filter((t) => t.count > 0);

  return (
    <div className="tcd-card">
      <p className="tcd-card-title">
        <Layers size={13} /> Coverage by tier
        <span className="tcd-card-title-sub">{total} case{total === 1 ? '' : 's'}</span>
      </p>

      <div className="tcd-cov-bar">
        {tiers.map((t) => (
          <div
            key={t.cat}
            className={`tcd-cov-seg${activeCats && !activeCats[t.cat] ? ' inactive' : ''}${onToggleCat ? ' clickable' : ''}`}
            style={{ '--seg-color': CAT_COLOR[t.cat], flexBasis: `${t.pct}%` }}
            title={`${CAT_LABELS[t.cat]} — ${t.count} (${Math.round(t.pct)}%)`}
            onClick={onToggleCat ? () => onToggleCat(t.cat) : undefined}
          />
        ))}
      </div>

      <div className="tcd-cov-chips">
        {tiers.map((t) => (
          <button
            type="button"
            key={t.cat}
            className={`tcd-cov-chip${activeCats && !activeCats[t.cat] ? ' inactive' : ''}${onToggleCat ? '' : ' static'}`}
            style={{ '--seg-color': CAT_COLOR[t.cat] }}
            onClick={onToggleCat ? () => onToggleCat(t.cat) : undefined}
            title={onToggleCat ? `Toggle ${CAT_LABELS[t.cat]} in the filter bar` : undefined}
          >
            <span className="dot" />
            <span className="lbl">{CAT_LABELS[t.cat]}</span>
            <b>{t.count}</b>
            <span className="pct">{Math.round(t.pct)}%</span>
          </button>
        ))}
      </div>

      <div className="tcd-cov-divider" />

      <div className="tcd-donut-row">
        <div className="tcd-donut-wrap">
          <DonutChart
            size={72}
            segments={[
              { value: cleanCount, color: 'var(--accent-green)' },
              { value: commentedCount, color: 'var(--accent-yellow)' },
              { value: unknownCount, color: 'var(--accent-red)' },
            ]}
          />
          <div className="tcd-donut-total"><span className="n">{total}</span><span className="lbl">total</span></div>
        </div>
        <div className="tcd-legend">
          {commentedCount === 0 && unknownCount === 0 && total > 0 ? (
            <span className="tcd-health-empty"><CheckCircle2 size={13} /> All clean</span>
          ) : (
            <>
              <span className="tcd-legend-item"><span className="tcd-sw" style={{ background: 'var(--accent-green)' }} />{cleanCount} clean</span>
              <span className="tcd-legend-item"><span className="tcd-sw" style={{ background: 'var(--accent-yellow)' }} />{commentedCount} commented</span>
              <span className="tcd-legend-item"><span className="tcd-sw" style={{ background: 'var(--accent-red)' }} />{unknownCount} not in TestRail</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CoverageCard;
