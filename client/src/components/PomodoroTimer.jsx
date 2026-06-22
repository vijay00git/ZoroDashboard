import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

const PomodoroTimer = () => {
  const [timeLeft, setTimeLeft] = useState(() => {
    const s = localStorage.getItem('tr-global-pomo-time');
    return s !== null ? parseInt(s, 10) : 25 * 60;
  });
  const [isActive, setIsActive] = useState(() => {
    return localStorage.getItem('tr-global-pomo-active') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('tr-global-pomo-time', timeLeft);
    localStorage.setItem('tr-global-pomo-active', isActive);
  }, [timeLeft, isActive]);

  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => setTimeLeft(p => p - 1), 1000);
    } else if (timeLeft === 0 && isActive) {
      setIsActive(false);
      try { new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play().catch(() => {}); } catch (_) {}
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const secs = (timeLeft % 60).toString().padStart(2, '0');
  const pct  = timeLeft / (25 * 60);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '4px 10px',
      background: 'var(--bg-tertiary)',
      border: `1px solid ${isActive ? 'var(--accent-purple)' : 'var(--border-color)'}`,
      borderRadius: 'var(--radius-sm)',
      boxShadow: isActive ? '0 0 0 3px var(--glow-purple)' : 'none',
      transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.85rem',
        fontWeight: '700',
        color: isActive ? 'var(--accent-purple)' : 'var(--text-secondary)',
        letterSpacing: '1px',
        transition: 'color 0.2s ease',
        minWidth: '42px',
      }}>
        {mins}
        <span style={{ opacity: isActive && timeLeft % 2 === 0 ? 1 : 0.4, transition: 'opacity 0.2s ease' }}>:</span>
        {secs}
      </span>

      <button
        onClick={() => setIsActive(p => !p)}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          color: isActive ? 'var(--accent-purple)' : 'var(--text-muted)',
          transition: 'color 0.15s ease',
        }}
        aria-label={isActive ? 'Pause timer' : 'Start timer'}
      >
        {isActive ? <Pause size={13} strokeWidth={2.5} /> : <Play size={13} strokeWidth={2.5} />}
      </button>

      <button
        onClick={() => { setIsActive(false); setTimeLeft(25 * 60); }}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          color: 'var(--text-muted)',
          transition: 'color 0.15s ease',
        }}
        aria-label="Reset timer"
        title="Reset"
      >
        <RotateCcw size={11} strokeWidth={2.5} />
      </button>
    </div>
  );
};

export default PomodoroTimer;
