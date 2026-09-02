import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from './ToastContext';

const dateKey = (d) => d.toISOString().slice(0, 10);

const DEFAULT_INTERVAL_MINS = 60;
const DEFAULT_QUIET_START = '22:00';
const DEFAULT_QUIET_END = '07:00';

// Handles the overnight-wraparound case (start > end, e.g. 22:00–07:00
// spans midnight) as well as a same-day window (e.g. 13:00–14:00 for a
// lunch meeting).
function isWithinQuietHours(date, startHHMM, endHHMM) {
  if (!startHHMM || !endHHMM) return false;
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;
  if (startMins === endMins) return false;
  const nowMins = date.getHours() * 60 + date.getMinutes();
  return startMins < endMins
    ? nowMins >= startMins && nowMins < endMins
    : nowMins >= startMins || nowMins < endMins;
}

const WaterReminderContext = createContext(null);

// Single source of truth for hydration data + the reminder schedule — moved
// here (out of the Water page) so intake/goal stay in sync no matter which
// page logged water, and so the reminder can pop up over any page instead of
// only firing while the Water page itself happens to be mounted. Same
// provider-at-the-app-root shape as PomodoroContext.
export function WaterReminderProvider({ children }) {
  const [goal, setGoalState] = useState(2000);
  const [intake, setIntake] = useState(0);
  const [logs, setLogs] = useState([]);
  const [history, setHistory] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [reminderEnabled, setReminderEnabledState] = useState(false);
  const [reminderIntervalMins, setReminderIntervalMinsState] = useState(DEFAULT_INTERVAL_MINS);
  const [isReminderOpen, setIsReminderOpen] = useState(false);

  const [quietHoursEnabled, setQuietHoursEnabledState] = useState(false);
  const [quietStart, setQuietStartState] = useState(DEFAULT_QUIET_START);
  const [quietEnd, setQuietEndState] = useState(DEFAULT_QUIET_END);

  const [isCelebrating, setIsCelebrating] = useState(false);
  const celebrationTimerRef = useRef(null);
  const { showToast } = useToast();

  const nextReminderAtRef = useRef(null);

  /* ── Load everything from localStorage once, including the same
     day-rollover archiving Water.jsx used to do inline. This can't be pure
     useState lazy initializers (PomodoroContext's approach) because the
     day-rollover branch has to read and write several pieces of state
     together (intake/logs/history) depending on whether the stored date
     matches today — set-state-in-effect is deliberately silenced for this
     one-time mount sync. ── */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    const lastSavedDate = localStorage.getItem('tr-water-date');
    const savedGoal = localStorage.getItem('tr-water-goal');
    const parsedGoal = savedGoal ? parseInt(savedGoal, 10) : 2000;
    if (savedGoal) setGoalState(parsedGoal);

    let savedHistory = JSON.parse(localStorage.getItem('tr-water-history') || '[]');

    if (lastSavedDate === todayStr) {
      setIntake(parseInt(localStorage.getItem('tr-water-intake-ml') || '0', 10));
      setLogs(JSON.parse(localStorage.getItem('tr-water-log') || '[]'));
    } else {
      if (lastSavedDate) {
        const prevIntake = parseInt(localStorage.getItem('tr-water-intake-ml') || '0', 10);
        const prevKey = dateKey(new Date(lastSavedDate));
        savedHistory = [...savedHistory.filter((h) => h.date !== prevKey), { date: prevKey, intake: prevIntake, goal: parsedGoal }].slice(-30);
        localStorage.setItem('tr-water-history', JSON.stringify(savedHistory));
      }
      setIntake(0);
      setLogs([]);
      localStorage.setItem('tr-water-intake-ml', '0');
      localStorage.setItem('tr-water-log', '[]');
      localStorage.setItem('tr-water-date', todayStr);
    }
    setHistory(savedHistory);

    const savedSound = localStorage.getItem('tr-water-sound-enabled');
    if (savedSound) setSoundEnabled(savedSound === 'true');

    const savedReminderEnabled = localStorage.getItem('tr-water-reminder-enabled');
    if (savedReminderEnabled) setReminderEnabledState(savedReminderEnabled === 'true');

    const savedInterval = parseInt(localStorage.getItem('tr-water-reminder-interval-mins') || '', 10);
    if (!isNaN(savedInterval) && savedInterval > 0) setReminderIntervalMinsState(savedInterval);

    const savedNextAt = parseInt(localStorage.getItem('tr-water-next-reminder-at') || '', 10);
    if (!isNaN(savedNextAt)) nextReminderAtRef.current = savedNextAt;

    const savedQuietEnabled = localStorage.getItem('tr-water-quiet-hours-enabled');
    if (savedQuietEnabled) setQuietHoursEnabledState(savedQuietEnabled === 'true');
    const savedQuietStart = localStorage.getItem('tr-water-quiet-start');
    if (savedQuietStart) setQuietStartState(savedQuietStart);
    const savedQuietEnd = localStorage.getItem('tr-water-quiet-end');
    if (savedQuietEnd) setQuietEndState(savedQuietEnd);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const playBloop = useCallback(() => {
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
    } catch { /* audio unsupported/blocked */ }
  }, [soundEnabled]);

  // Logging water also pushes the next reminder out a full interval from
  // right now — so drinking a glass "answers" the reminder instead of it
  // nagging again a few minutes later.
  const scheduleNext = useCallback((fromNow) => {
    const next = (fromNow ?? Date.now()) + reminderIntervalMins * 60000;
    nextReminderAtRef.current = next;
    localStorage.setItem('tr-water-next-reminder-at', String(next));
  }, [reminderIntervalMins]);

  // Confetti + a toast the moment intake crosses the goal — a one-time
  // payoff for hitting the target, not something that should re-fire on
  // every subsequent log once you're already over.
  const triggerCelebration = useCallback(() => {
    setIsCelebrating(true);
    showToast('🎉 Daily hydration goal reached — nice work!', 'success');
    if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
    celebrationTimerRef.current = setTimeout(() => setIsCelebrating(false), 2600);
  }, [showToast]);

  const addWater = useCallback((amount) => {
    if (!amount || amount <= 0) return;
    setIntake((prevIntake) => {
      const updated = prevIntake + amount;
      localStorage.setItem('tr-water-intake-ml', String(updated));
      if (prevIntake < goal && updated >= goal) triggerCelebration();
      return updated;
    });
    setLogs((prevLogs) => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const updated = [{ id: Date.now(), time: timeStr, amount }, ...prevLogs];
      localStorage.setItem('tr-water-log', JSON.stringify(updated));
      return updated;
    });
    localStorage.setItem('tr-water-date', new Date().toDateString());
    playBloop();
    if (reminderEnabled) scheduleNext();
    setIsReminderOpen(false);
  }, [playBloop, reminderEnabled, scheduleNext, goal, triggerCelebration]);

  const resetToday = useCallback(() => {
    setIntake(0);
    setLogs([]);
    localStorage.setItem('tr-water-intake-ml', '0');
    localStorage.setItem('tr-water-log', '[]');
  }, []);

  const updateGoal = useCallback((val) => {
    const newGoal = parseInt(val, 10) || 2000;
    setGoalState(newGoal);
    localStorage.setItem('tr-water-goal', String(newGoal));
  }, []);

  const deleteLog = useCallback((id) => {
    setLogs((prevLogs) => {
      const item = prevLogs.find((l) => l.id === id);
      if (!item) return prevLogs;
      setIntake((prevIntake) => {
        const updated = Math.max(0, prevIntake - item.amount);
        localStorage.setItem('tr-water-intake-ml', String(updated));
        return updated;
      });
      const updatedLogs = prevLogs.filter((l) => l.id !== id);
      localStorage.setItem('tr-water-log', JSON.stringify(updatedLogs));
      return updatedLogs;
    });
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('tr-water-sound-enabled', String(next));
      return next;
    });
  }, []);

  const setReminderEnabled = useCallback((enabled) => {
    if (enabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    setReminderEnabledState(enabled);
    localStorage.setItem('tr-water-reminder-enabled', String(enabled));
    if (enabled) scheduleNext();
    else setIsReminderOpen(false);
  }, [scheduleNext]);

  const setReminderIntervalMins = useCallback((mins) => {
    const clean = Math.max(5, parseInt(mins, 10) || DEFAULT_INTERVAL_MINS);
    setReminderIntervalMinsState(clean);
    localStorage.setItem('tr-water-reminder-interval-mins', String(clean));
    if (reminderEnabled) scheduleNext();
  }, [reminderEnabled, scheduleNext]);

  // Snooze: reschedule for later without logging anything.
  const dismissReminder = useCallback(() => {
    setIsReminderOpen(false);
    scheduleNext();
  }, [scheduleNext]);

  const setQuietHoursEnabled = useCallback((enabled) => {
    setQuietHoursEnabledState(enabled);
    localStorage.setItem('tr-water-quiet-hours-enabled', String(enabled));
  }, []);

  const setQuietStart = useCallback((val) => {
    setQuietStartState(val);
    localStorage.setItem('tr-water-quiet-start', val);
  }, []);

  const setQuietEnd = useCallback((val) => {
    setQuietEndState(val);
    localStorage.setItem('tr-water-quiet-end', val);
  }, []);

  useEffect(() => () => { if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current); }, []);

  /* ── The schedule check itself — a cheap 15s poll against a persisted
     timestamp, rather than a single long setTimeout, so it survives the tab
     being backgrounded/throttled and still catches up promptly once it's
     active again. Only ever pops the overlay if the goal isn't already met —
     no point nagging once you've hit your target for the day. During quiet
     hours the check still runs and still reschedules (so it doesn't fire the
     instant quiet hours end with a backlog), it just skips showing anything. ── */
  useEffect(() => {
    if (!reminderEnabled) return undefined;
    if (nextReminderAtRef.current == null || nextReminderAtRef.current < Date.now() - 24 * 3600000) {
      // Never scheduled, or wildly stale (tab left closed for a day+) — start
      // a fresh interval from now rather than firing immediately on load.
      scheduleNext();
    }
    const id = setInterval(() => {
      if (nextReminderAtRef.current != null && Date.now() >= nextReminderAtRef.current) {
        const quiet = quietHoursEnabled && isWithinQuietHours(new Date(), quietStart, quietEnd);
        if (!quiet) {
          setIntake((currentIntake) => {
            if (currentIntake < goal) setIsReminderOpen(true);
            return currentIntake;
          });
        }
        scheduleNext();
      }
    }, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminderEnabled, goal, quietHoursEnabled, quietStart, quietEnd]);

  // Best-effort system notification for when the tab isn't even visible —
  // the in-app overlay (rendered globally, so it shows over any page) covers
  // the "using the app, just on a different page" case; this covers "not
  // looking at the browser at all."
  useEffect(() => {
    if (!isReminderOpen) return;
    if (document.visibilityState === 'visible') return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try { new Notification('Time to hydrate 💧', { body: `You're at ${intake}/${goal} ml today.` }); } catch { /* unsupported */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReminderOpen]);

  // Cross-tab sync — the `storage` event only fires in OTHER tabs, never the
  // one that made the change, so this purely mirrors state written by a
  // sibling tab rather than double-applying our own writes. Without this,
  // two tabs open at once would each keep their own stale copy of
  // intake/goal/etc. and silently drift apart. If a sibling tab's log just
  // pushed intake over the goal while this tab's reminder happens to be
  // open, close it here too rather than leaving it up now that it's moot.
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.newValue == null) return;
      switch (e.key) {
        case 'tr-water-intake-ml': {
          const updated = parseInt(e.newValue, 10) || 0;
          setIntake(updated);
          if (updated >= goal) setIsReminderOpen(false);
          break;
        }
        case 'tr-water-log':
          try { setLogs(JSON.parse(e.newValue)); } catch { /* malformed, ignore */ }
          break;
        case 'tr-water-goal':
          setGoalState(parseInt(e.newValue, 10) || 2000);
          break;
        case 'tr-water-history':
          try { setHistory(JSON.parse(e.newValue)); } catch { /* malformed, ignore */ }
          break;
        case 'tr-water-sound-enabled':
          setSoundEnabled(e.newValue === 'true');
          break;
        case 'tr-water-reminder-enabled':
          setReminderEnabledState(e.newValue === 'true');
          break;
        case 'tr-water-reminder-interval-mins': {
          const v = parseInt(e.newValue, 10);
          if (!isNaN(v)) setReminderIntervalMinsState(v);
          break;
        }
        case 'tr-water-next-reminder-at': {
          const v = parseInt(e.newValue, 10);
          if (!isNaN(v)) nextReminderAtRef.current = v;
          break;
        }
        case 'tr-water-quiet-hours-enabled':
          setQuietHoursEnabledState(e.newValue === 'true');
          break;
        case 'tr-water-quiet-start':
          setQuietStartState(e.newValue);
          break;
        case 'tr-water-quiet-end':
          setQuietEndState(e.newValue);
          break;
        default:
          break;
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [goal]);

  const pct = goal > 0 ? Math.min(100, Math.round((intake / goal) * 100)) : 0;

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const isToday = i === 6;
    const entry = isToday ? { intake, goal } : history.find((h) => h.date === dateKey(d));
    return {
      label: d.toLocaleDateString([], { weekday: 'short' }).slice(0, 1),
      intake: entry?.intake ?? 0,
      goal: entry?.goal ?? goal,
      hasData: !!entry,
      isToday,
    };
  });

  const streak = (() => {
    let count = intake >= goal ? 1 : 0;
    for (let i = 1; ; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const entry = history.find((h) => h.date === dateKey(d));
      if (!entry || entry.intake < entry.goal) break;
      count++;
    }
    return count;
  })();

  return (
    <WaterReminderContext.Provider value={{
      goal, intake, logs, history, pct, last7, streak,
      soundEnabled, toggleSound,
      addWater, resetToday, updateGoal, deleteLog,
      reminderEnabled, setReminderEnabled, reminderIntervalMins, setReminderIntervalMins,
      isReminderOpen, dismissReminder,
      quietHoursEnabled, setQuietHoursEnabled, quietStart, setQuietStart, quietEnd, setQuietEnd,
      isCelebrating,
    }}
    >
      {children}
    </WaterReminderContext.Provider>
  );
}

export function useWaterReminder() {
  return useContext(WaterReminderContext);
}
