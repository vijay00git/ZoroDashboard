import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, Sun, Moon, Flame, Timer } from 'lucide-react';
import { usePomo } from '../contexts/PomodoroContext';
import { MAIN_NAV, SETTINGS_NAV_ITEM } from '../navigation';

const THEME_META = {
  dark:  { icon: Moon,  label: 'Dark' },
  light: { icon: Sun,   label: 'Light' },
  lava:  { icon: Flame, label: 'Lava' },
};
const NEXT_THEME = { dark: 'light', light: 'lava', lava: 'dark' };

// App-wide quick-nav + quick-action palette, opened with Ctrl+K / Cmd+K from
// anywhere. Rendered once near the top of App.jsx (inside PomodoroProvider
// and the Router, both of which it needs) rather than per-page.
const CommandPalette = ({ theme, onToggleTheme }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { setIsFocusOpen } = usePomo();

  // Claim Ctrl+K / Cmd+K globally, the same way the app's own Ctrl+0-9
  // page shortcuts already claim their keys ahead of any browser default.
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    // the input doesn't exist until the portal mounts on the next frame
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  const commands = useMemo(() => {
    const nextTheme = NEXT_THEME[theme] || 'dark';
    const actions = [
      {
        id: 'toggle-theme',
        label: `Switch to ${THEME_META[nextTheme].label} theme`,
        hint: 'Appearance',
        icon: THEME_META[nextTheme].icon,
        run: () => onToggleTheme(),
      },
      {
        id: 'focus-mode',
        label: 'Open Focus Mode',
        hint: 'Pomodoro timer',
        icon: Timer,
        run: () => setIsFocusOpen(true),
      },
    ];
    const nav = [...MAIN_NAV, SETTINGS_NAV_ITEM].map((item) => ({
      id: `nav-${item.path}`,
      label: item.label,
      hint: 'Go to page',
      icon: item.icon,
      run: () => navigate(item.path),
    }));
    return [...actions, ...nav];
  }, [theme, onToggleTheme, setIsFocusOpen, navigate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  const close = () => setIsOpen(false);

  const runCommand = (cmd) => {
    if (!cmd) return;
    close();
    cmd.run();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); runCommand(filtered[activeIndex]); }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="cmdk-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="cmdk-panel" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk-input-row">
          <Search size={16} className="cmdk-search-icon" />
          <input
            ref={inputRef}
            className="cmdk-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages or actions…"
          />
          <kbd className="cmdk-esc">Esc</kbd>
        </div>
        <div className="cmdk-list">
          {filtered.length === 0 ? (
            <div className="cmdk-empty">No matches for "{query}"</div>
          ) : (
            filtered.map((cmd, i) => {
              const Icon = cmd.icon;
              return (
                <div
                  key={cmd.id}
                  className={`cmdk-item${i === activeIndex ? ' active' : ''}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => runCommand(cmd)}
                >
                  <Icon size={15} className="cmdk-item-icon" />
                  <span className="cmdk-item-label">{cmd.label}</span>
                  <span className="cmdk-item-hint">{cmd.hint}</span>
                </div>
              );
            })
          )}
        </div>
        <div className="cmdk-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>Enter</kbd> Select</span>
          <span><kbd>Ctrl</kbd>+<kbd>K</kbd> Toggle</span>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommandPalette;
