import { createPortal } from 'react-dom';
import Lottie from 'lottie-react';
import { useWaterReminder } from '../contexts/WaterReminderContext';
import confettiAnim from '../assets/lottie/confetti.json';

// A brief, non-blocking confetti burst the moment intake crosses the daily
// goal (see triggerCelebration in WaterReminderContext) — reuses the same
// confetti.json FocusMode already plays on a completed Pomodoro session.
// Unlike WaterReminder this doesn't need a response, so no dark backdrop and
// no pointer-events: it just plays over whatever page you're on and clears
// itself.
export default function WaterGoalCelebration() {
  const { isCelebrating } = useWaterReminder();
  if (!isCelebrating) return null;

  return createPortal(
    <Lottie
      animationData={confettiAnim}
      loop={false}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 9999 }}
    />,
    document.body
  );
}
