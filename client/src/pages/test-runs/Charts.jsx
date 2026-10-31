import { fmtNum, fmtPct } from './helpers';
import { useHoverTip } from './useHoverTip';

function TipRows({ title, rows, total }) {
  return (
    <>
      {title && <div className="trr-tip-title">{title}</div>}
      {rows.map((r) => (
        <div className="trr-tip-row" key={r.label}>
          <span className="trr-swatch" style={{ background: r.color }} />
          <span className="trr-tip-label">{r.label}</span>
          <span className="trr-tip-val">{fmtNum(r.value)}{total ? ` · ${fmtPct(r.value, total)}` : ''}</span>
        </div>
      ))}
    </>
  );
}

export function Legend({ statuses, counts }) {
  return (
    <div className="trr-legend">
      {statuses.map((s) => (
        <span key={s.id} className="trr-legend-item">
          <span className="trr-swatch" style={{ background: s.color }} />
          {s.label}
          {counts && <span className="trr-legend-count">{fmtNum(counts[s.id] || 0)}</span>}
        </span>
      ))}
    </div>
  );
}

// Horizontal stacked bar of status counts. `size` = 'lg' for the run's
// headline bar, 'sm' for the inline per-row bars in tables.
export function StatusBar({ statuses, counts, total, size = 'sm', title }) {
  const [bind, tipNode] = useHoverTip();
  const sum = total ?? Object.values(counts || {}).reduce((a, b) => a + b, 0);
  const segments = statuses.filter((s) => counts?.[s.id]);
  const allRows = segments.map((s) => ({ label: s.label, color: s.color, value: counts[s.id] }));
  return (
    <>
      <div className={`trr-bar trr-bar-${size}`} role="img" aria-label={allRows.map((r) => `${r.label} ${r.value}`).join(', ')}>
        {sum === 0 && <div className="trr-bar-empty" />}
        {segments.map((s) => (
          <div
            key={s.id}
            className="trr-bar-seg"
            style={{ flexGrow: counts[s.id], background: s.color }}
            {...bind(<TipRows title={title} rows={allRows.map((r) => (r.label === s.label ? { ...r, label: `▸ ${r.label}` } : r))} total={sum} />)}
          />
        ))}
      </div>
      {tipNode}
    </>
  );
}

// Results posted per day, stacked by the status each result set.
export function DailyChart({ statuses, daily }) {
  const [bind, tipNode] = useHoverTip();
  if (!daily?.length) return <div className="trr-empty">No results posted yet.</div>;
  const max = Math.max(...daily.map((d) => d.total));
  const labelEvery = Math.ceil(daily.length / 14);
  return (
    <div className="trr-daily">
      <div className="trr-daily-axis"><span>{fmtNum(max)}</span><span>0</span></div>
      <div className="trr-daily-plot">
        {daily.map((d, i) => {
          const rows = statuses.filter((s) => d.counts[s.id]).map((s) => ({ label: s.label, color: s.color, value: d.counts[s.id] }));
          const date = new Date(`${d.date}T00:00:00`);
          const label = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          return (
            <div
              className="trr-daily-col"
              key={d.date}
              {...bind(<TipRows title={`${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} — ${fmtNum(d.total)} results`} rows={rows} total={d.total} />)}
            >
              <div className="trr-daily-stack" style={{ height: `${(d.total / max) * 100}%` }}>
                {[...rows].reverse().map((r) => (
                  <div key={r.label} className="trr-daily-seg" style={{ flexGrow: r.value, background: r.color }} />
                ))}
              </div>
              <span className="trr-daily-label">{i % labelEvery === 0 ? label : ''}</span>
            </div>
          );
        })}
      </div>
      {tipNode}
    </div>
  );
}
