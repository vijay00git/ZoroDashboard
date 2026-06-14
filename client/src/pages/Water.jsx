import React, { useState, useEffect } from 'react';
import { 
  Droplet, 
  Plus, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Bell, 
  Settings,
  Trash2
} from 'lucide-react';

const Water = () => {
  const [goal, setGoal] = useState(2000);
  const [intake, setIntake] = useState(0);
  const [logs, setLogs] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [customAmount, setCustomAmount] = useState('');

  // Reminders
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderInterval, setReminderInterval] = useState(60); // minutes

  // Load from local storage
  useEffect(() => {
    const todayStr = new Date().toDateString();
    const lastSavedDate = localStorage.getItem('tr-water-date');
    const savedGoal = localStorage.getItem('tr-water-goal');
    
    if (savedGoal) setGoal(parseInt(savedGoal));

    if (lastSavedDate === todayStr) {
      setIntake(parseInt(localStorage.getItem('tr-water-intake-ml') || '0'));
      setLogs(JSON.parse(localStorage.getItem('tr-water-log') || '[]'));
    } else {
      // New Day: Clear stats
      setIntake(0);
      setLogs([]);
      localStorage.setItem('tr-water-intake-ml', '0');
      localStorage.setItem('tr-water-log', '[]');
      localStorage.setItem('tr-water-date', todayStr);
    }

    const savedSound = localStorage.getItem('tr-water-sound-enabled');
    if (savedSound) setSoundEnabled(savedSound === 'true');
  }, []);

  const playBloop = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddWater = (amount) => {
    const updatedIntake = intake + amount;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newLog = { id: Date.now(), time: timeStr, amount };
    const updatedLogs = [newLog, ...logs];

    setIntake(updatedIntake);
    setLogs(updatedLogs);
    playBloop();

    localStorage.setItem('tr-water-intake-ml', String(updatedIntake));
    localStorage.setItem('tr-water-log', JSON.stringify(updatedLogs));
    localStorage.setItem('tr-water-date', new Date().toDateString());
  };

  const handleReset = () => {
    if (window.confirm("Are you sure you want to clear today's hydration logs?")) {
      setIntake(0);
      setLogs([]);
      localStorage.setItem('tr-water-intake-ml', '0');
      localStorage.setItem('tr-water-log', '[]');
    }
  };

  const handleUpdateGoal = (val) => {
    const newGoal = parseInt(val) || 2000;
    setGoal(newGoal);
    localStorage.setItem('tr-water-goal', String(newGoal));
  };

  const handleDeleteLog = (id) => {
    const logItem = logs.find(l => l.id === id);
    if (!logItem) return;
    const updatedIntake = Math.max(0, intake - logItem.amount);
    const updatedLogs = logs.filter(l => l.id !== id);

    setIntake(updatedIntake);
    setLogs(updatedLogs);
    localStorage.setItem('tr-water-intake-ml', String(updatedIntake));
    localStorage.setItem('tr-water-log', JSON.stringify(updatedLogs));
  };

  const pct = Math.min(100, Math.round((intake / goal) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div>
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
              onClick={() => setSoundEnabled(!soundEnabled)}
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
                background: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--accent-red)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
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
                  onClick={() => handleAddWater(item.amount)}
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
                  const amt = parseInt(customAmount);
                  if (amt > 0) {
                    handleAddWater(amt);
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
                onChange={(e) => handleUpdateGoal(e.target.value)}
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
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Desktop Reminders</label>
              <button
                onClick={() => {
                  if (!reminderEnabled) {
                    // Check perm
                    if (Notification.permission !== 'granted') {
                      Notification.requestPermission();
                    }
                  }
                  setReminderEnabled(!reminderEnabled);
                }}
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
          </div>

          {/* Daily Logs History */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '12px' }}>Today's Logs</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
              {logs.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>
                  No hydration logged yet today.
                </p>
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
