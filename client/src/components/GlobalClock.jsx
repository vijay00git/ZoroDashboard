import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

const GlobalClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const seconds = time.getSeconds().toString().padStart(2, '0');
  const dateString = time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '4px 12px',
      background: 'var(--bg-tertiary)',
      borderRadius: '20px',
      border: '1px solid var(--border-color)',
      boxShadow: 'none',
      transition: 'all 0.3s ease'
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '1.2rem',
        fontWeight: '800',
        background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        filter: 'drop-shadow(0 0 4px rgba(6, 182, 212, 0.2))'
      }}>
        <span>{hours}</span>
        <span style={{ opacity: time.getSeconds() % 2 === 0 ? 1 : 0.5, transition: 'opacity 0.2s ease', color: 'var(--accent-cyan)', WebkitTextFillColor: 'initial' }}>:</span>
        <span>{minutes}</span>
        <span style={{ opacity: time.getSeconds() % 2 === 0 ? 1 : 0.5, transition: 'opacity 0.2s ease', color: 'var(--accent-cyan)', WebkitTextFillColor: 'initial' }}>:</span>
        <span style={{ color: 'var(--accent-pink)', WebkitTextFillColor: 'initial', fontSize: '1rem', paddingLeft: '2px' }}>{seconds}</span>
      </div>
      <div style={{ width: '1px', height: '14px', background: 'var(--border-color)' }}></div>
      <span style={{ 
        fontSize: '0.75rem', 
        color: 'var(--text-secondary)', 
        textTransform: 'uppercase', 
        letterSpacing: '1px',
        fontWeight: '700'
      }}>
        {dateString}
      </span>
    </div>
  );
};

export default GlobalClock;
