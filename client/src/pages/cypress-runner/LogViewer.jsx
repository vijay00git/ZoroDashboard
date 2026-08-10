import { useEffect, useRef } from 'react';

// Auto-scrolls to the bottom as new output arrives, but stops doing so the
// moment the user scrolls up to read something — re-engages once they
// scroll back near the bottom themselves.
const LogViewer = ({ text, live = false }) => {
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
    <div className={`cyr-terminal${live ? ' cyr-terminal-live' : ''}`}>
      <div className="cyr-terminal-bar">
        <span className="cyr-terminal-dot red" />
        <span className="cyr-terminal-dot yellow" />
        <span className="cyr-terminal-dot green" />
        {live && <span className="cyr-terminal-live-tag">live</span>}
      </div>
      <pre className="cyr-log-viewer" ref={ref} onScroll={handleScroll}>
        {text || 'Waiting for output…'}
        {live && text ? <span className="cyr-cursor" /> : null}
      </pre>
    </div>
  );
};

export default LogViewer;
