import { useEffect, useRef } from 'react';

// segments: [{ value, color }]. Draws a ring chart into a <canvas>, cut out
// in the middle so it reads as a donut rather than a pie.
const DonutChart = ({ segments, size = 88 }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2, rOuter = size / 2 - 3, rInner = rOuter * 0.52;
    const total = segments.reduce((s, seg) => s + seg.value, 0);

    // canvas fillStyle can't resolve CSS custom properties itself — read the
    // computed value off a live element so var(--accent-*) colors still work.
    const computed = getComputedStyle(canvas);
    const resolveColor = (c) => {
      const m = /^var\((--[\w-]+)\)$/.exec(c || '');
      return m ? (computed.getPropertyValue(m[1]).trim() || '#888') : c;
    };

    if (total === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(128,128,128,0.25)';
      ctx.fill();
    } else {
      let start = -Math.PI / 2;
      segments.forEach((seg) => {
        if (seg.value === 0) return;
        const angle = (seg.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, rOuter, start, start + angle);
        ctx.closePath();
        ctx.fillStyle = resolveColor(seg.color);
        ctx.fill();
        start += angle;
      });
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }, [segments, size]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} />;
};

export default DonutChart;
