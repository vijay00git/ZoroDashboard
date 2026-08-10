import { useEffect, useId, useState } from 'react';

// Visual gap between adjacent segments, in pathLength percent units (see
// pathLength={100} below — this makes the gap a fixed fraction of the ring
// regardless of pixel size, so it looks consistent at every size prop).
const GAP_PCT = 2.4;

// segments: [{ value, color }]. Renders a ring chart (SVG stroke, not a
// filled pie) with rounded segment caps, a small surface-color gap between
// segments instead of a border, a self-gradient sheen per segment, and a
// draw-in animation on mount — all driven by the theme's own --accent-*
// tokens via stop-color, so it stays correct across dark/light/lava.
const DonutChart = ({ segments, size = 88 }) => {
  const rawId = useId();
  const uid = `donut${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [segments]);

  const strokeWidth = Math.max(7, size * 0.15);
  const r = size / 2 - strokeWidth / 2;
  const cx = size / 2;
  const cy = size / 2;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const visible = segments.filter((seg) => seg.value > 0);
  const gap = visible.length > 1 ? GAP_PCT : 0;
  const fullPcts = visible.map((seg) => (seg.value / total) * 100);

  return (
    <svg className="tcd-donut-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {total === 0 ? (
        <circle cx={cx} cy={cy} r={r} fill="none" className="tcd-donut-track" strokeWidth={strokeWidth} />
      ) : (
        <>
          <defs>
            {visible.map((seg, i) => (
              <linearGradient key={i} id={`${uid}-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: seg.color, stopOpacity: 0.72 }} />
                <stop offset="100%" style={{ stopColor: seg.color, stopOpacity: 1 }} />
              </linearGradient>
            ))}
          </defs>
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {visible.map((seg, i) => {
              const drawPct = Math.max(0, fullPcts[i] - gap);
              const cumPct = fullPcts.slice(0, i).reduce((a, b) => a + b, 0);
              const rotateDeg = (cumPct / 100) * 360;
              return (
                <circle
                  key={i}
                  cx={cx} cy={cy} r={r} fill="none"
                  stroke={`url(#${uid}-${i})`}
                  strokeWidth={strokeWidth}
                  pathLength={100}
                  strokeDasharray={`${drawPct} ${100 - drawPct}`}
                  transform={`rotate(${rotateDeg} ${cx} ${cy})`}
                  className={`tcd-ring-seg${mounted ? ' in' : ''}`}
                  style={{ transitionDelay: `${i * 60}ms` }}
                />
              );
            })}
          </g>
        </>
      )}
    </svg>
  );
};

export default DonutChart;
