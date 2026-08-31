// Small Web Audio chimes for celebration moments — same oscillator approach
// Water.jsx already uses for its hydration "bloop", so every celebratory
// moment in the app gets sound instead of just Water's being a one-off.

const getCtx = () => new (window.AudioContext || window.webkitAudioContext)();

function tone(ctx, freq, startTime, duration, gainPeak) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

// Short two-note "ding" — task/subtopic completion.
export function playCompleteChime() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    tone(ctx, 660, now, 0.15, 0.25);
    tone(ctx, 880, now + 0.08, 0.2, 0.25);
  } catch (_e) { /* audio unsupported or blocked */ }
}

// Four-note ascending arpeggio — a bigger moment (leveling up) than the
// plain complete chime.
export function playLevelUpFanfare() {
  try {
    const ctx = getCtx();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      tone(ctx, freq, now + i * 0.09, 0.25, 0.28);
    });
  } catch (_e) { /* audio unsupported or blocked */ }
}
