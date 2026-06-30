import { Play, Pause, RotateCcw, Maximize2 } from 'lucide-react';
import { usePomo } from '../contexts/PomodoroContext';

const PomodoroTimer = () => {
  const { mode, MODES, timeLeft, isActive, toggle, reset, setIsFocusOpen } = usePomo();

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');
  const color = MODES[mode].color;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '4px 10px',
      background: 'var(--bg-tertiary)',
      border: `1px solid ${isActive ? color : 'var(--border-color)'}`,
      borderRadius: 'var(--radius-sm)',
      boxShadow: isActive ? `0 0 0 3px ${color}22` : 'none',
      transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700,
        color: isActive ? color : 'var(--text-secondary)',
        letterSpacing: '1px', minWidth: '42px',
        transition: 'color 0.2s ease',
      }}>
        {mins}
        <span style={{ opacity: isActive && timeLeft % 2 === 0 ? 1 : 0.4, transition: 'opacity 0.2s ease' }}>:</span>
        {secs}
      </span>

      <button onClick={toggle} aria-label={isActive ? 'Pause' : 'Start'}
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', color: isActive ? color : 'var(--text-muted)', transition: 'color 0.15s ease' }}>
        {isActive ? <Pause size={12} strokeWidth={2.5} /> : <Play size={12} strokeWidth={2.5} />}
      </button>

      <button onClick={reset} aria-label="Reset" title="Reset"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)', transition: 'color 0.15s ease' }}>
        <RotateCcw size={11} strokeWidth={2.5} />
      </button>

      <button onClick={() => setIsFocusOpen(true)} aria-label="Open Focus Mode" title="Focus Mode"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', color: 'var(--text-muted)', transition: 'color 0.15s ease' }}>
        <Maximize2 size={11} strokeWidth={2.5} />
      </button>
    </div>
  );
};

export default PomodoroTimer;
