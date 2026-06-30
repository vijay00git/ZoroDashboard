import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Pause, RotateCcw, X, Coffee, Zap, Moon } from 'lucide-react';
import { usePomo } from '../contexts/PomodoroContext';

const ModeIcon = ({ m }) => {
  if (m === 'focus') return <Zap size={11} strokeWidth={2.5} />;
  if (m === 'short') return <Coffee size={11} strokeWidth={2.5} />;
  return <Moon size={11} strokeWidth={2.5} />;
};

const SessionDot = ({ filled, color }) => (
  <div style={{
    width: '9px', height: '9px', borderRadius: '50%',
    background: filled ? color : 'transparent',
    border: `2px solid ${filled ? color : 'rgba(255,255,255,0.15)'}`,
    boxShadow: filled ? `0 0 8px ${color}` : 'none',
    transition: 'all 0.4s ease',
  }} />
);

export default function FocusMode() {
  const { MODES, mode, timeLeft, isActive, sessions, isFocusOpen, totalSecs, toggle, reset, switchMode, setIsFocusOpen } = usePomo();
  const [closeHover, setCloseHover] = useState(false);
  const [startHover, setStartHover] = useState(false);

  if (!isFocusOpen) return null;

  const m = MODES[mode];
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');

  /* SVG ring */
  const R = 108;
  const C = 2 * Math.PI * R;
  const arcLen = (timeLeft / totalSecs) * C;

  const pctDone = Math.round((1 - timeLeft / totalSecs) * 100);

  const statusPhrases = {
    focus: ['Ready when you are', 'Stay in the zone 🔥', 'Deep work activated ⚡', 'You are unstoppable 💪'],
    short: ['Time to recharge ☕', 'Step away and breathe', 'Rest your eyes 👀'],
    long:  ['Great session! Relax 🌿', 'You earned this break', 'Refuel your mind 🧠'],
  };

  let statusText;
  if (timeLeft === totalSecs) {
    statusText = statusPhrases[mode][0];
  } else if (!isActive) {
    statusText = 'Paused — ready to continue';
  } else {
    const pool = statusPhrases[mode].slice(1);
    statusText = pool[Math.floor((1 - timeLeft / totalSecs) * pool.length) % pool.length] || pool[0];
  }

  const startLabel = isActive ? 'PAUSE' : timeLeft === totalSecs ? 'START' : 'RESUME';

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.90)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        animation: 'focusBgIn 0.3s ease forwards',
      }}
    >
      {/* Ambient radial glow behind card */}
      <div style={{
        position: 'absolute',
        width: '600px', height: '600px',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${m.glow} 0%, transparent 70%)`,
        pointerEvents: 'none',
        animation: isActive ? 'focusAmbientPulse 3s ease-in-out infinite' : 'none',
      }} />

      {/* Card */}
      <div style={{
        position: 'relative',
        width: '460px', maxWidth: '94vw',
        background: 'var(--bg-secondary)',
        border: `1px solid ${m.color}40`,
        borderRadius: '24px',
        padding: '36px 32px 28px',
        boxShadow: `0 0 80px ${m.color}18, 0 32px 80px rgba(0,0,0,0.6)`,
        animation: 'focusCardIn 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards',
      }}>

        {/* Close button */}
        <button
          onClick={() => setIsFocusOpen(false)}
          onMouseEnter={() => setCloseHover(true)}
          onMouseLeave={() => setCloseHover(false)}
          style={{
            position: 'absolute', top: '16px', right: '16px',
            width: '30px', height: '30px', borderRadius: '50%',
            background: closeHover ? '#f05050' : 'var(--bg-tertiary)',
            border: `1px solid ${closeHover ? '#f05050' : 'var(--border-color)'}`,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: closeHover ? 'white' : 'var(--text-muted)',
            transition: 'all 0.18s ease',
            boxShadow: closeHover ? '0 0 12px rgba(240,80,80,0.4)' : 'none',
          }}
          title="Close Focus Mode"
        >
          <X size={13} strokeWidth={2.5} />
        </button>

        {/* Header label */}
        <div style={{
          textAlign: 'center', marginBottom: '20px',
          fontSize: '0.58rem', fontWeight: 800, letterSpacing: '3px',
          textTransform: 'uppercase', color: m.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
        }}>
          <ModeIcon m={mode} /> Focus Mode
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '28px' }}>
          {Object.entries(MODES).map(([key, md]) => (
            <button
              key={key}
              onClick={() => switchMode(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 14px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.3px',
                background: mode === key ? md.color : 'var(--bg-tertiary)',
                color: mode === key ? '#0a0c0a' : 'var(--text-muted)',
                boxShadow: mode === key ? `0 0 12px ${md.color}55` : 'none',
                transition: 'all 0.2s ease',
              }}
            >
              <ModeIcon m={key} /> {md.label}
            </button>
          ))}
        </div>

        {/* SVG countdown ring */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <svg width="250" height="250" viewBox="0 0 250 250">
            <defs>
              <radialGradient id="ringGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={m.color} stopOpacity="0.15" />
                <stop offset="100%" stopColor={m.color} stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Glow disk */}
            <circle cx="125" cy="125" r="115" fill="url(#ringGlow)" />

            {/* Track ring */}
            <circle cx="125" cy="125" r={R}
              fill="none"
              stroke="var(--bg-tertiary)"
              strokeWidth="11"
            />

            {/* Progress arc */}
            <circle cx="125" cy="125" r={R}
              fill="none"
              stroke={m.color}
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={`${arcLen} ${C}`}
              transform="rotate(-90 125 125)"
              style={{
                transition: 'stroke-dasharray 0.95s linear',
                filter: isActive ? `drop-shadow(0 0 8px ${m.color})` : 'none',
              }}
            />

            {/* Tick mark at the arc end (leading dot) */}
            {timeLeft < totalSecs && timeLeft > 0 && (
              <circle
                cx={125 + R * Math.cos(((-90 + (timeLeft / totalSecs) * 360) * Math.PI) / 180)}
                cy={125 + R * Math.sin(((-90 + (timeLeft / totalSecs) * 360) * Math.PI) / 180)}
                r="5"
                fill={m.color}
                style={{ filter: `drop-shadow(0 0 6px ${m.color})` }}
              />
            )}

            {/* Center: mode label */}
            <text x="125" y="100" textAnchor="middle"
              fill="var(--text-muted)" fontSize="9.5"
              fontFamily="Space Grotesk" fontWeight="700" letterSpacing="3">
              {m.label.toUpperCase()}
            </text>

            {/* Center: big time */}
            <text x="125" y="141" textAnchor="middle"
              fill="var(--text-primary)" fontSize="42"
              fontFamily="Space Mono" fontWeight="700" letterSpacing="-2">
              {mins}:{secs}
            </text>

            {/* Center: pct complete */}
            <text x="125" y="162" textAnchor="middle"
              fill="var(--text-muted)" fontSize="9"
              fontFamily="Space Grotesk" fontWeight="600" letterSpacing="0.5">
              {pctDone > 0 ? `${pctDone}% complete` : `${m.mins} minutes`}
            </text>
          </svg>
        </div>

        {/* Status text */}
        <p style={{
          textAlign: 'center', margin: '0 0 24px',
          fontSize: '0.8rem', color: 'var(--text-muted)',
          fontStyle: 'italic', minHeight: '18px',
          transition: 'opacity 0.3s ease',
        }}>
          {statusText}
        </p>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '24px' }}>
          <button
            onClick={toggle}
            onMouseEnter={() => setStartHover(true)}
            onMouseLeave={() => setStartHover(false)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 36px', borderRadius: '40px', border: 'none', cursor: 'pointer',
              background: m.color,
              color: '#0a0c0a',
              fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: '0.88rem', letterSpacing: '1.5px',
              boxShadow: `0 4px 24px ${m.color}55`,
              transform: startHover ? 'translateY(-2px) scale(1.03)' : 'none',
              transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            }}
          >
            {isActive ? <Pause size={15} strokeWidth={2.5} /> : <Play size={15} strokeWidth={2.5} />}
            {startLabel}
          </button>

          <button
            onClick={reset}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '12px 20px', borderRadius: '40px', cursor: 'pointer',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: '0.8rem',
              transition: 'all 0.15s ease',
            }}
          >
            <RotateCcw size={13} strokeWidth={2.5} /> Reset
          </button>
        </div>

        {/* Session dots */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', marginRight: '4px' }}>
            Session
          </span>
          {Array.from({ length: 4 }).map((_, i) => (
            <SessionDot key={i} filled={i < (sessions % 4)} color={m.color} />
          ))}
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 600, marginLeft: '4px' }}>
            {sessions} completed
          </span>
        </div>

      </div>
    </div>,
    document.body
  );
}
