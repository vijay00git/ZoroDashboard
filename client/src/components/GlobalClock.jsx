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
  const dateString = time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '8px 24px',
      background: 'var(--bg-glass)',
      borderRadius: '24px',
      border: '1px solid var(--border-glow)',
      boxShadow: '0 0 25px var(--glow-cyan)',
      transition: 'all 0.3s ease'
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '2.8rem',
        fontWeight: '900',
        letterSpacing: '2px',
        lineHeight: '1',
        background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        display: 'flex',
        alignItems: 'baseline',
        gap: '4px',
        filter: 'drop-shadow(0 0 8px rgba(6, 182, 212, 0.4))'
      }}>
        <span>{hours}</span>
        <span style={{ opacity: time.getSeconds() % 2 === 0 ? 1 : 0.4, transition: 'opacity 0.2s ease', color: 'var(--accent-cyan)', WebkitTextFillColor: 'initial' }}>:</span>
        <span>{minutes}</span>
        <span style={{ opacity: time.getSeconds() % 2 === 0 ? 1 : 0.4, transition: 'opacity 0.2s ease', color: 'var(--accent-cyan)', WebkitTextFillColor: 'initial', fontSize: '2rem' }}>:</span>
        <span style={{ color: 'var(--accent-pink)', WebkitTextFillColor: 'initial', fontSize: '2.2rem', paddingLeft: '2px' }}>{seconds}</span>
      </div>
      <span style={{ 
        fontSize: '0.85rem', 
        color: 'var(--text-secondary)', 
        textTransform: 'uppercase', 
        letterSpacing: '2px',
        fontWeight: '700',
        marginTop: '6px'
      }}>
        {dateString}
      </span>
    </div>
  );
};

export default GlobalClock;
