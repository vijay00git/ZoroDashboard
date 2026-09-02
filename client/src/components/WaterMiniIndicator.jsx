import { Droplet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWaterReminder } from '../contexts/WaterReminderContext';

// Header-pill counterpart to PomodoroTimer — a glanceable "where am I today"
// indicator so you don't have to wait for the full-page reminder (or visit
// the Hydration page) to know your progress. Click jumps straight there.
const WaterMiniIndicator = () => {
  const { intake, goal, pct } = useWaterReminder();
  const navigate = useNavigate();
  const met = pct >= 100;

  return (
    <button
      type="button"
      onClick={() => navigate('/water')}
      title={`${intake} / ${goal} ml today`}
      aria-label={`Hydration: ${intake} of ${goal} ml today (${pct}%)`}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '4px 10px',
        background: 'var(--bg-tertiary)',
        border: `1px solid ${met ? 'var(--accent-green)' : 'var(--border-color)'}`,
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        boxShadow: met ? '0 0 0 3px color-mix(in srgb, var(--accent-green) 15%, transparent)' : 'none',
      }}
    >
      <Droplet size={12} strokeWidth={2.5} fill={met ? 'var(--accent-green)' : 'none'} style={{ color: met ? 'var(--accent-green)' : 'var(--accent-cyan)' }} />
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700,
        color: met ? 'var(--accent-green)' : 'var(--text-secondary)',
        letterSpacing: '0.5px',
      }}>
        {pct}%
      </span>
    </button>
  );
};

export default WaterMiniIndicator;
