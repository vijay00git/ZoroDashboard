import { Layers } from 'lucide-react';
import DonutChart from './DonutChart';
import { CAT_ORDER, CAT_LABELS, normCat } from './helpers';

const CAT_COLOR = { OFFLINE: 'var(--accent-cyan)', ONLINE: 'var(--accent-purple)', E2E: 'var(--accent-pink)' };

const CoverageCard = ({ data }) => {
  const total = data.totalCases || 0;
  const commentedCount = data.rows.filter((r) => r.commented).length;
  const unknownCount = (data.unknownIds || []).length;
  const cleanCount = Math.max(0, total - commentedCount - unknownCount);

  return (
    <div className="tcd-card">
      <p className="tcd-card-title"><Layers size={13} /> Coverage by tier</p>
      <div className="tcd-tier-bar">
        {CAT_ORDER.map((cat) => {
          let count = 0;
          Object.keys(data.catCounts || {}).forEach((k) => { if (normCat(k) === cat) count += data.catCounts[k]; });
          const pct = total ? (count / total) * 100 : 0;
          if (pct === 0) return null;
          return <div key={cat} className="tcd-tier-seg" style={{ background: CAT_COLOR[cat], flexBasis: `${pct}%` }} />;
        })}
      </div>
      <div className="tcd-legend" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '0.8rem', marginBottom: '0.8rem' }}>
        {CAT_ORDER.map((cat) => {
          let count = 0;
          Object.keys(data.catCounts || {}).forEach((k) => { if (normCat(k) === cat) count += data.catCounts[k]; });
          return (
            <span key={cat} className="tcd-legend-item">
              <span className="tcd-sw" style={{ background: CAT_COLOR[cat] }} />{CAT_LABELS[cat]} {count}
            </span>
          );
        })}
      </div>

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
            <span className="tcd-health-empty">✓ All clean</span>
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
