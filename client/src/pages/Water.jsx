import { useState } from 'react';
import {
  Droplet,
  Plus,
  RotateCcw,
  Volume2,
  VolumeX,
  Bell,
  BellOff,
  Trash2,
  Flame
} from 'lucide-react';
import { showConfirm } from '../utils/Alerts';
import { useWaterReminder } from '../contexts/WaterReminderContext';
import waterHero from '../assets/hero-banners/water-hero.webp';
import waterHeroLight from '../assets/hero-banners/water-hero-light.webp';
import waterEmptyIllustration from '../assets/illustrations/water-empty.svg';

const REMINDER_INTERVALS = [15, 30, 45, 60, 90, 120];

const Water = () => {
  const {
    goal, intake, logs, pct, last7, streak,
    soundEnabled, toggleSound,
    addWater, resetToday, updateGoal, deleteLog,
    reminderEnabled, setReminderEnabled, reminderIntervalMins, setReminderIntervalMins,
    quietHoursEnabled, setQuietHoursEnabled, quietStart, setQuietStart, quietEnd, setQuietEnd,
  } = useWaterReminder();

  const [customAmount, setCustomAmount] = useState('');

  const handleReset = async () => {
    if (await showConfirm("Are you sure you want to clear today's hydration logs?")) resetToday();
  };

  const handleDeleteLog = async (id) => {
    if (await showConfirm('Delete this hydration log entry?')) deleteLog(id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div
        className="glass-panel water-hero"
        style={{
          '--hero-image': `url(${waterHero})`, '--hero-image-light': `url(${waterHeroLight})`,
          padding: '24px 28px',
        }}
      >
        <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '4px' }}>
          Hydration <span className="gradient-text">Station</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>Track and optimize your daily water intake for cognitive performance.</p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 2fr',
        gap: '24px',
        alignItems: 'start'
      }}>

        {/* Left Column: Glass Visualizer */}
        <div className="glass-panel" style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px'
        }}>

          <h3 style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Daily Cylinder</h3>

          {/* Visual Cylinder Glass */}
          <div style={{
            position: 'relative',
            width: '140px',
            height: '260px',
            border: '4px solid var(--border-color)',
            borderTop: 'none',
            borderRadius: '0 0 24px 24px',
            overflow: 'hidden',
            background: 'rgba(255,255,255,0.02)',
            display: 'flex',
            alignItems: 'flex-end',
            boxShadow: 'inset 0 0 20px rgba(255,255,255,0.05)'
          }}>
            {/* Water Fill Layer */}
            <div style={{
              width: '100%',
              height: `${pct}%`,
              background: 'linear-gradient(180deg, var(--accent-cyan), #3b82f6)',
              boxShadow: '0 0 15px var(--glow-cyan)',
              transition: 'height 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative'
            }}>
              {/* Waves bubble styling if needed */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '8px',
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '50% 50% 0 0'
              }} />
            </div>

            {/* Float text */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontWeight: '800',
              fontSize: '1.5rem',
              color: 'var(--text-primary)',
              textShadow: '0 2px 5px rgba(0,0,0,0.5)'
            }}>
              {pct}%
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <h4 style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>{intake} / {goal} ml</h4>
            <p style={{ fontSize: '0.85rem', color: pct >= 100 ? 'var(--accent-green)' : 'var(--text-muted)', fontWeight: '600', marginTop: '4px' }}>
              {pct >= 100 ? '🎉 Goal Achieved!' : `Keep going, zoro!`}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
            <button
              onClick={toggleSound}
              style={{
                flex: 1,
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '8px',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            <button
              onClick={handleReset}
              style={{
                flex: 1,
                background: 'color-mix(in srgb, var(--accent-red) 10%, transparent)',
                color: 'var(--accent-red)',
                border: '1px solid color-mix(in srgb, var(--accent-red) 20%, transparent)',
                borderRadius: '10px',
                padding: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>

        {/* Right Column: Hydration Workspace Controls & Logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Quick Logs */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '16px' }}>Log Water Intake</h3>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
              gap: '12px',
              marginBottom: '16px'
            }}>
              {[
                { label: 'Cup', amount: 250, desc: '250ml' },
                { label: 'Glass', amount: 500, desc: '500ml' },
                { label: 'Bottle', amount: 750, desc: '750ml' }
              ].map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => addWater(item.amount)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '16px 12px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all var(--transition-fast)'
                  }}
                  className="nav-item-hover"
                >
                  <Droplet size={20} style={{ color: 'var(--accent-cyan)' }} />
                  <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{item.label}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.desc}</span>
                </button>
              ))}
            </div>

            {/* Custom Log */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="number"
                placeholder="Custom amount (ml)..."
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                style={{
                  flexGrow: 1,
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  outline: 'none',
                  fontSize: '0.9rem'
                }}
              />
              <button
                onClick={() => {
                  const amt = parseInt(customAmount, 10);
                  if (amt > 0) {
                    addWater(amt);
                    setCustomAmount('');
                  }
                }}
                className="glow-btn"
                style={{
                  background: 'linear-gradient(135deg, var(--accent-cyan), #3b82f6)',
                  boxShadow: '0 4px 15px var(--glow-cyan)'
                }}
              >
                <Plus size={16} />
                Log
              </button>
            </div>
          </div>

          {/* Goal & Settings Panel */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>

            <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Daily Target Goal (ml)</label>
              <input
                type="number"
                value={goal}
                onChange={(e) => updateGoal(e.target.value)}
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  outline: 'none',
                  fontSize: '0.85rem'
                }}
              />
            </div>

            <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>App-wide Reminders</label>
              <button
                onClick={() => setReminderEnabled(!reminderEnabled)}
                style={{
                  background: reminderEnabled ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-tertiary)',
                  color: reminderEnabled ? 'var(--accent-green)' : 'var(--text-primary)',
                  border: reminderEnabled ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  justifyContent: 'center'
                }}
              >
                <Bell size={14} />
                {reminderEnabled ? 'Reminders On' : 'Reminders Off'}
              </button>
            </div>

            {reminderEnabled && (
              <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Remind me every</label>
                <select
                  value={reminderIntervalMins}
                  onChange={(e) => setReminderIntervalMins(e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    outline: 'none',
                    fontSize: '0.85rem',
                  }}
                >
                  {REMINDER_INTERVALS.map((m) => (
                    <option key={m} value={m}>{m} minutes</option>
                  ))}
                </select>
              </div>
            )}

            {reminderEnabled && (
              <div style={{ flex: 1, minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Quiet Hours</label>
                <button
                  onClick={() => setQuietHoursEnabled(!quietHoursEnabled)}
                  style={{
                    background: quietHoursEnabled ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-tertiary)',
                    color: quietHoursEnabled ? 'var(--accent-green)' : 'var(--text-primary)',
                    border: quietHoursEnabled ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    justifyContent: 'center'
                  }}
                >
                  <BellOff size={14} />
                  {quietHoursEnabled ? 'Quiet Hours On' : 'Quiet Hours Off'}
                </button>
              </div>
            )}

            {reminderEnabled && quietHoursEnabled && (
              <>
                <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>From</label>
                  <input
                    type="time"
                    value={quietStart}
                    onChange={(e) => setQuietStart(e.target.value)}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      outline: 'none',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>To</label>
                  <input
                    type="time"
                    value={quietEnd}
                    onChange={(e) => setQuietEnd(e.target.value)}
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      outline: 'none',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              </>
            )}
          </div>

          {reminderEnabled && (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '-8px 0 0' }}>
              A full-page reminder will pop up over whichever page you're on, every {reminderIntervalMins} minutes, until you hit today's goal.
              {quietHoursEnabled && ` Silenced from ${quietStart} to ${quietEnd}.`}
            </p>
          )}

          {/* Last 7 Days & Streak */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>Last 7 Days</h3>
              {streak > 0 && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  background: 'color-mix(in srgb, var(--accent-orange) 15%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent-orange) 35%, transparent)',
                  color: 'var(--accent-orange)', borderRadius: '999px', padding: '2px 9px',
                  fontSize: '0.72rem', fontWeight: '700',
                }}>
                  <Flame size={11} /> {streak} day{streak === 1 ? '' : 's'} streak
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '80px' }}>
              {last7.map((day, i) => {
                const barPct = day.goal ? Math.min(100, Math.round((day.intake / day.goal) * 100)) : 0;
                const met = day.intake >= day.goal && day.goal > 0;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%' }}>
                    <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end', background: 'var(--bg-tertiary)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{
                        width: '100%',
                        height: `${Math.max(barPct, day.hasData || day.isToday ? 4 : 0)}%`,
                        background: met ? 'var(--accent-green)' : 'linear-gradient(180deg, var(--accent-cyan), #3b82f6)',
                        borderRadius: '6px 6px 0 0',
                        transition: 'height 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                        opacity: day.isToday ? 1 : (day.hasData ? 0.85 : 0.25),
                      }} />
                    </div>
                    <span style={{ fontSize: '0.65rem', fontWeight: '700', color: day.isToday ? 'var(--text-primary)' : 'var(--text-muted)' }}>{day.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily Logs History */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '12px' }}>Today's Logs</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
              {logs.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0' }}>
                  <img src={waterEmptyIllustration} alt="" style={{ width: '80px', opacity: 0.9, marginBottom: '4px' }} />
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                    No hydration logged yet today.
                  </p>
                </div>
              ) : (
                logs.map(log => (
                  <div
                    key={log.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'var(--bg-tertiary)',
                      padding: '8px 16px',
                      borderRadius: '8px'
                    }}
                  >
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{log.time}</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--accent-cyan)' }}>+{log.amount} ml</span>
                    <button
                      onClick={() => handleDeleteLog(log.id)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};

export default Water;
