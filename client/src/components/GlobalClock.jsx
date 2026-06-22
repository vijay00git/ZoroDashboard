import React, { useState, useEffect } from 'react';

const GlobalClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hh = time.getHours().toString().padStart(2, '0');
  const mm = time.getMinutes().toString().padStart(2, '0');
  const date = time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const blink = time.getSeconds() % 2 === 0;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '4px 10px',
      background: 'var(--bg-tertiary)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-sm)',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.85rem',
        fontWeight: '700',
        color: 'var(--accent-cyan)',
        letterSpacing: '1px',
      }}>
        {hh}
        <span style={{ opacity: blink ? 1 : 0.35, transition: 'opacity 0.2s ease' }}>:</span>
        {mm}
      </span>

      <span style={{
        width: '1px',
        height: '12px',
        background: 'var(--border-color)',
        flexShrink: 0,
      }} />

      <span style={{
        fontSize: '0.68rem',
        fontWeight: '600',
        color: 'var(--text-muted)',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>
        {date}
      </span>
    </div>
  );
};

export default GlobalClock;
