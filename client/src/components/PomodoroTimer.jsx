import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

const PomodoroTimer = () => {
  const [timeLeft, setTimeLeft] = useState(() => {
    const saved = localStorage.getItem('tr-global-pomo-time');
    return saved !== null ? parseInt(saved, 10) : 25 * 60;
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
      interval = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && isActive) {
      setIsActive(false);
      try {
        new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg').play().catch(()=>console.log('Audio error'));
      } catch(e) {}
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = () => { setIsActive(false); setTimeLeft(25 * 60); };

  const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const secs = (timeLeft % 60).toString().padStart(2, '0');

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '4px 12px',
      background: 'var(--bg-tertiary)',
      borderRadius: '20px',
      border: `1px solid ${isActive ? 'var(--accent-pink)' : 'var(--border-color)'}`,
      boxShadow: isActive ? '0 0 10px rgba(236,72,153,0.3)' : 'none',
      transition: 'all 0.3s ease'
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '1.2rem',
        fontWeight: '800',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        transition: 'all 0.3s ease'
      }}>
        <span>{mins}</span>
        <span style={{ 
          opacity: isActive && timeLeft % 2 === 0 ? 1 : 0.5, 
          transition: 'opacity 0.2s ease', 
          color: isActive ? 'var(--accent-pink)' : 'var(--text-muted)'
        }}>:</span>
        <span style={{ 
          color: isActive ? 'var(--accent-pink)' : 'var(--text-secondary)', 
          textShadow: isActive ? '0 0 8px rgba(236, 72, 153, 0.4)' : 'none'
        }}>{secs}</span>
      </div>
      
      <div style={{ display: 'flex', gap: '4px' }}>
        <button onClick={toggleTimer} style={{ background: 'transparent', border: 'none', color: isActive ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.2s ease' }} className="nav-item-hover">
          {isActive ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={resetTimer} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.2s ease' }} className="nav-item-hover" title="Reset">
          <RotateCcw size={14} />
        </button>
      </div>
    </div>
  );
};

export default PomodoroTimer;
