import { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import LearnSkills from './pages/LearnSkills';
import QuickLaunch from './pages/QuickLaunch';
import ResumeUp from './pages/ResumeUp';
import Notebook from './pages/Notebook';
import TaskManager from './pages/TaskManager';
import Water from './pages/Water';
import Settings from './pages/Settings';
import Status from './pages/Status';
import SyncHub from './pages/SyncHub';
import Timesheet from './pages/Timesheet';
import PomodoroTimer from './components/PomodoroTimer';
import GlobalClock from './components/GlobalClock';
import { GlobalAlert } from './components/GlobalAlert';

const PAGE_TITLES = {
  '/':             'Dashboard',
  '/synchub':      'Sync Hub',
  '/notebook':     'Notebook',
  '/task-manager': 'Task Manager',
  '/timesheet':    'Timesheet',
  '/water':        'Hydration',
  '/quicklaunch':  'Quick Launch',
  '/status':       'Daily Status',
  '/goal':         'Learn Skills',
  '/resume':       'Resume Up',
  '/settings':     'Settings',
};

function App() {
  const [theme, setTheme] = useState(localStorage.getItem('tr-theme') || 'dark');
  const location = useLocation();
  const navigate = useNavigate();

  const pageTitle = PAGE_TITLES[location.pathname] || 'Portal';

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!e.ctrlKey) return;
      let shortcuts = [
        { path: '/',             key: '0' },
        { path: '/task-manager', key: '1' },
        { path: '/notebook',     key: '2' },
        { path: '/synchub',      key: '3' },
        { path: '/timesheet',    key: '4' },
        { path: '/goal',         key: '5' },
        { path: '/water',        key: '6' },
        { path: '/quicklaunch',  key: '7' },
        { path: '/status',       key: '8' },
        { path: '/settings',     key: '9' },
      ];
      try {
        const saved = localStorage.getItem('tr-shortcuts');
        if (saved) shortcuts = JSON.parse(saved);
      } catch (_) {}
      const target = shortcuts.find(s => s.key === e.key);
      if (target) { e.preventDefault(); navigate(target.path); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  /* ── Theme sync ── */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tr-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'tr-theme' && e.newValue) setTheme(e.newValue);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const toggleTheme = () => {
    document.body.classList.add('theme-transition');
    const next = theme === 'dark' ? 'light' : theme === 'light' ? 'lava' : 'dark';
    setTheme(next);
    setTimeout(() => document.body.classList.remove('theme-transition'), 450);
  };

  return (
    <div className="app-shell">
      <GlobalAlert />
      <Navbar />

      <div className="app-main">
        {/* ── Slim Header ── */}
        <header className="app-header">
          <div className="app-header-left">
            <span className="page-title">{pageTitle}</span>
          </div>

          <div className="app-header-right">
            <PomodoroTimer />
            <GlobalClock />

            <button
              onClick={toggleTheme}
              className="theme-toggle-btn"
              title={`Switch theme (currently ${theme})`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🌋'}
            </button>
          </div>
        </header>

        {/* ── Page Content ── */}
        <main className="app-content">
          <div key={location.pathname} style={{ animation: 'fadeIn 0.25s ease-out forwards' }}>
            <Routes>
              <Route path="/"             element={<Dashboard />} />
              <Route path="/synchub"      element={<SyncHub />} />
              <Route path="/notebook"     element={<Notebook />} />
              <Route path="/task-manager" element={<TaskManager />} />
              <Route path="/timesheet"    element={<Timesheet />} />
              <Route path="/water"        element={<Water />} />
              <Route path="/quicklaunch"  element={<QuickLaunch />} />
              <Route path="/status"       element={<Status />} />
              <Route path="/goal"         element={<LearnSkills />} />
              <Route path="/resume"       element={<ResumeUp />} />
              <Route path="/settings"     element={<Settings />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
