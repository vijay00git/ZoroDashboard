import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const MODES = {
  focus: { label: 'Focus',       mins: 25, color: '#e8a825', glow: 'rgba(232,168,37,0.3)'  },
  short: { label: 'Short Break', mins: 5,  color: '#5bc4f5', glow: 'rgba(91,196,245,0.3)'  },
  long:  { label: 'Long Break',  mins: 15, color: '#2de886', glow: 'rgba(45,232,134,0.3)'  },
};

const PomodoroContext = createContext(null);

export function PomodoroProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem('tr-pomo-mode') || 'focus');

  const [timeLeft, setTimeLeft] = useState(() => {
    const parsed = parseInt(localStorage.getItem('tr-pomo-time') || '', 10);
    return isNaN(parsed) ? MODES.focus.mins * 60 : parsed;
  });

  const [isActive, setIsActive]   = useState(false);
  const [sessions, setSessions]   = useState(() => parseInt(localStorage.getItem('tr-pomo-sessions') || '0', 10));
  const [isFocusOpen, setIsFocusOpen] = useState(false);

  /* Keep a ref to mode so the interval callback can read it without stale closure */
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  /* Persist time + mode */
  useEffect(() => {
    localStorage.setItem('tr-pomo-time', String(timeLeft));
    localStorage.setItem('tr-pomo-mode', mode);
  }, [timeLeft, mode]);

  /* Countdown engine — setState only inside setTimeout to avoid cascading renders */
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          /* Schedule side-effects outside the render cycle */
          setTimeout(() => {
            setIsActive(false);
            if (modeRef.current === 'focus') {
              setSessions(s => {
                const next = s + 1;
                localStorage.setItem('tr-pomo-sessions', String(next));
                return next;
              });
            }
            try {
              new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg')
                .play()
                .catch(() => { /* audio blocked */ });
            } catch (_e) { /* unsupported */ }
          }, 0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isActive]);

  const toggle    = useCallback(() => setIsActive(p => !p), []);
  const reset     = useCallback(() => { setIsActive(false); setTimeLeft(MODES[mode].mins * 60); }, [mode]);
  const switchMode = useCallback((m) => { setIsActive(false); setMode(m); setTimeLeft(MODES[m].mins * 60); }, []);

  const totalSecs = MODES[mode].mins * 60;

  return (
    <PomodoroContext.Provider value={{
      MODES, mode, timeLeft, isActive, sessions, isFocusOpen, totalSecs,
      toggle, reset, switchMode, setIsFocusOpen,
    }}>
      {children}
    </PomodoroContext.Provider>
  );
}

export function usePomo() {
  return useContext(PomodoroContext);
}
