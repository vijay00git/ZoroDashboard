import { useState } from 'react';

// One floating tooltip per chart — follows the pointer, never clipped by the
// card since it's position: fixed.
export function useHoverTip() {
  const [tip, setTip] = useState(null);
  const bind = (content) => ({
    onMouseMove: (e) => setTip({ x: e.clientX, y: e.clientY, content }),
    onMouseLeave: () => setTip(null),
  });
  const node = tip ? (
    <div className="trr-tip" style={{ left: tip.x + 14, top: tip.y + 14 }}>{tip.content}</div>
  ) : null;
  return [bind, node];
}
