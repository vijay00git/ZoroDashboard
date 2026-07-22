import { useEffect, useRef } from 'react';

// Auto-scrolls to the bottom as new output arrives, but stops doing so the
// moment the user scrolls up to read something — re-engages once they
// scroll back near the bottom themselves.
const LogViewer = ({ text }) => {
  const ref = useRef(null);
  const stickToBottomRef = useRef(true);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    const el = ref.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <pre className="cyr-log-viewer" ref={ref} onScroll={handleScroll}>
      {text || 'Waiting for output…'}
    </pre>
  );
};

export default LogViewer;
