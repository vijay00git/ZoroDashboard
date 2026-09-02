import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Droplet, X, BellOff } from 'lucide-react';
import { useWaterReminder } from '../contexts/WaterReminderContext';

// Placeholder animation — a bobbing droplet with expanding ripple rings,
// built entirely from CSS so this feature works today with no extra asset.
// To swap in a real animation once one is provided (Lottie JSON is the best
// fit — lottie-react is already a dependency and used by FocusMode's confetti
// via client/src/assets/lottie/*.json): import it here and render
// `<Lottie animationData={waterAnim} loop />` in place of <WaterDropletCss />.
const WaterDropletCss = () => (
  <div className="water-reminder-droplet-wrap">
    <span className="water-reminder-ripple" />
    <span className="water-reminder-ripple delay1" />
    <span className="water-reminder-ripple delay2" />
    <Droplet size={64} className="water-reminder-droplet" fill="var(--accent-cyan)" strokeWidth={1.5} />
  </div>
);

const QUICK_AMOUNTS = [
  { label: 'Sip', amount: 100, desc: '100ml' },
  { label: 'Small Cup', amount: 200, desc: '200ml' },
  { label: 'Cup', amount: 250, desc: '250ml' },
  { label: 'Glass', amount: 500, desc: '500ml' },
  { label: 'Bottle', amount: 750, desc: '750ml' },
];

// Rendered once at the app root (see App.jsx) so it can pop up over any
// page, not just the Water page — the whole point being a "you're using the
// app somewhere else, but it's time to drink water" interrupt.
export default function WaterReminder() {
  const { isReminderOpen, dismissReminder, addWater, intake, goal, pct, setReminderEnabled } = useWaterReminder();
  const [closeHover, setCloseHover] = useState(false);

  if (!isReminderOpen) return null;

  return createPortal(
    <div className="water-reminder-overlay">
      <div className="water-reminder-ambient" />

      <div className="water-reminder-card">
        <button
          type="button"
          className="water-reminder-close"
          style={closeHover ? { background: '#f05050', borderColor: '#f05050', color: '#fff', boxShadow: '0 0 12px rgba(240,80,80,0.4)' } : undefined}
          onMouseEnter={() => setCloseHover(true)}
          onMouseLeave={() => setCloseHover(false)}
          onClick={dismissReminder}
          title="Snooze — remind me again later"
        >
          <X size={13} strokeWidth={2.5} />
        </button>

        <WaterDropletCss />

        <h2 className="water-reminder-title">Time to hydrate 💧</h2>
        <p className="water-reminder-sub">
          You're at <b>{intake}</b> / {goal} ml today ({pct}%) — keep it up, zoro!
        </p>

        <div className="water-reminder-quick-row">
          {QUICK_AMOUNTS.map((item) => (
            <button key={item.label} type="button" className="water-reminder-quick-btn" onClick={() => addWater(item.amount)}>
              <Droplet size={18} style={{ color: 'var(--accent-cyan)' }} />
              <span className="lbl">{item.label}</span>
              <span className="desc">{item.desc}</span>
            </button>
          ))}
        </div>

        <div className="water-reminder-actions">
          <button type="button" className="water-reminder-snooze-btn" onClick={dismissReminder}>Remind me later</button>
          <button type="button" className="water-reminder-off-btn" onClick={() => setReminderEnabled(false)}>
            <BellOff size={12} /> Turn off reminders
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
