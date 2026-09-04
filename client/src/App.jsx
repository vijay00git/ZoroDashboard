import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import PomodoroTimer from './components/PomodoroTimer';
import FocusMode from './components/FocusMode';
import GlobalClock from './components/GlobalClock';
import { GlobalAlert } from './components/GlobalAlert';
import CommandPalette from './components/CommandPalette';
import { PomodoroProvider } from './contexts/PomodoroContext';
import { WaterReminderProvider } from './contexts/WaterReminderContext';
import WaterReminder from './components/WaterReminder';
import WaterGoalCelebration from './components/WaterGoalCelebration';
import WaterMiniIndicator from './components/WaterMiniIndicator';

// Lazy-loaded per route so navigating to one page doesn't also download
// every other page's code in the same bundle (see the Vite build's
// "chunks larger than 500kB" warning prior to this split).
const Dashboard = lazy(() => import('./pages/Dashboard'));
const LearnSkills = lazy(() => import('./pages/LearnSkills'));
const QuickLaunch = lazy(() => import('./pages/QuickLaunch'));
const ResumeUp = lazy(() => import('./pages/ResumeUp'));
const Notebook = lazy(() => import('./pages/Notebook'));
const TaskManager = lazy(() => import('./pages/TaskManager'));
const Water = lazy(() => import('./pages/Water'));
const Settings = lazy(() => import('./pages/Settings'));
const Status = lazy(() => import('./pages/Status'));
const SyncHub = lazy(() => import('./pages/SyncHub'));
const Timesheet = lazy(() => import('./pages/Timesheet'));
const CSVOrganizer = lazy(() => import('./pages/CSVOrganizer'));
const SSBucket = lazy(() => import('./pages/SSBucket'));
const TestCaseDashboard = lazy(() => import('./pages/TestCaseDashboard'));
const CypressRunner = lazy(() => import('./pages/CypressRunner'));
const AutomationFinder = lazy(() => import('./pages/AutomationFinder'));
const NotFound = lazy(() => import('./pages/NotFound'));

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
  '/resume':         'Resume Up',
  '/csv-organizer':  'CSV Organizer',
  '/ss-bucket':      'SS Bucket',
  '/testcase-dashboard': 'Jenkins Runner',
  '/cypress-runner': 'Cypress Runner',
  '/automation-finder': 'Automation Finder',
  '/settings':       'Settings',
};

function App() {
  const [theme, setTheme] = useState(localStorage.getItem('tr-theme') || 'dark');
  const location = useLocation();
  const navigate = useNavigate();

  const pageTitle = PAGE_TITLES[location.pathname] || 'Portal';

  /* ── Page transition: crossfade instead of the old page snapping away ──
     The rendered <Routes> stays pinned to `displayLocation` (the outgoing
     page) until its fade-out finishes, then swaps to the real location and
     fades the new page in. */
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState('fadeIn');

  useEffect(() => {
    if (location.pathname !== displayLocation.pathname) {
      setTransitionStage('fadeOut');
    }
  }, [location, displayLocation]);

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
      } catch (e) { console.warn('Failed to parse tr-shortcuts, using defaults:', e); }
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
    <PomodoroProvider>
    <WaterReminderProvider>
    <div className="app-shell">
      <GlobalAlert />
      <FocusMode />
      <WaterReminder />
      <WaterGoalCelebration />
      <CommandPalette theme={theme} onToggleTheme={toggleTheme} />
      <Navbar />

      <div className="app-main">
        {/* ── Slim Header ── */}
        <header className="app-header">
          <div className="app-header-left">
            <span className="page-title">{pageTitle}</span>
          </div>

          <div className="app-header-right">
            <PomodoroTimer />
            <WaterMiniIndicator />
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
          <div
            key={displayLocation.pathname}
            style={{ animation: `${transitionStage === 'fadeOut' ? 'pageFadeOut' : 'fadeIn'} 0.18s ease forwards` }}
            onAnimationEnd={() => {
              if (transitionStage === 'fadeOut') {
                setDisplayLocation(location);
                setTransitionStage('fadeIn');
              }
            }}
          >
            <Suspense fallback={<div className="app-route-loading"><div className="spinner" /></div>}>
              <Routes location={displayLocation}>
                <Route path="/"             element={<Dashboard />} />
                <Route path="/synchub"      element={<SyncHub />} />
                <Route path="/notebook"     element={<Notebook />} />
                <Route path="/task-manager" element={<TaskManager />} />
                <Route path="/timesheet"    element={<Timesheet />} />
                <Route path="/water"        element={<Water />} />
                <Route path="/quicklaunch"  element={<QuickLaunch />} />
                <Route path="/status"       element={<Status />} />
                <Route path="/goal"         element={<LearnSkills />} />
                <Route path="/resume"         element={<ResumeUp />} />
                <Route path="/csv-organizer" element={<CSVOrganizer />} />
                <Route path="/ss-bucket"    element={<SSBucket />} />
                <Route path="/testcase-dashboard" element={<TestCaseDashboard />} />
                <Route path="/cypress-runner" element={<CypressRunner />} />
                <Route path="/automation-finder" element={<AutomationFinder />} />
                <Route path="/settings"      element={<Settings />} />
                <Route path="*"              element={<NotFound />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
    </WaterReminderProvider>
    </PomodoroProvider>
  );
}

export default App;
