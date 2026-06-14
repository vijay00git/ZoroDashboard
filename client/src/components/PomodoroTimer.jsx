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
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '8px 24px',
      background: 'var(--bg-glass)',
      borderRadius: '24px',
      border: `1px solid ${isActive ? 'var(--accent-pink)' : 'var(--border-glow)'}`,
      boxShadow: isActive ? '0 0 25px var(--glow-pink)' : '0 0 15px rgba(0,0,0,0.2)',
      transition: 'all 0.3s ease'
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '2.8rem',
        fontWeight: '900',
        letterSpacing: '2px',
        lineHeight: '1',
        color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
        display: 'flex',
        alignItems: 'baseline',
        gap: '4px',
        transition: 'all 0.3s ease'
      }}>
        <span>{mins}</span>
        <span style={{ 
          opacity: isActive && timeLeft % 2 === 0 ? 1 : 0.4, 
          transition: 'opacity 0.2s ease', 
          color: isActive ? 'var(--accent-pink)' : 'var(--text-muted)'
        }}>:</span>
        <span style={{ 
          color: isActive ? 'var(--accent-pink)' : 'var(--text-secondary)', 
          fontSize: '2.2rem', 
          paddingLeft: '2px',
          textShadow: isActive ? '0 0 12px rgba(236, 72, 153, 0.5)' : 'none'
        }}>{secs}</span>
      </div>
      
      <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
        <button onClick={toggleTimer} style={{ background: 'transparent', border: 'none', color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.2s ease' }}>
          {isActive ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button onClick={resetTimer} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.2s ease' }} title="Reset">
          <RotateCcw size={18} />
        </button>
      </div>
    </div>
  );
};

export default PomodoroTimer;
