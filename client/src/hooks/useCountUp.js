import { useEffect, useRef, useState } from 'react';

/* Animates a numeric display value from its previous value to a new one
   whenever it changes, instead of snapping instantly. Non-numeric values
   (or a no-op change) pass through unchanged with no animation. */
export function useCountUp(value, duration = 500) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;

    if (typeof to !== 'number' || typeof from !== 'number' || from === to) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }

    const start = performance.now();

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return display;
}
