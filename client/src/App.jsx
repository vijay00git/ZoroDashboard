import { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import LearnSkills from './pages/LearnSkills';
import QuickLaunch from './pages/QuickLaunch';
import Notebook from './pages/Notebook';
import TaskManager from './pages/TaskManager';
import Water from './pages/Water';
import Settings from './pages/Settings';
import Status from './pages/Status';
import SyncHub from './pages/SyncHub';
import Timesheet from './pages/Timesheet';
import PomodoroTimer from './components/PomodoroTimer';
import GlobalClock from './components/GlobalClock';

function App() {
  const [theme, setTheme] = useState(localStorage.getItem('tr-theme') || 'dark');
  const [displayName, setDisplayName] = useState(localStorage.getItem('tr-display-name') || "ZORO'S");
  const [avatarUrl, setAvatarUrl] = useState(localStorage.getItem('tr-avatar-url') || '');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey) {
        let shortcuts = [
          { path: '/', key: '0' },
          { path: '/task-manager', key: '1' },
          { path: '/notebook', key: '2' },
          { path: '/synchub', key: '3' },
          { path: '/timesheet', key: '4' },
          { path: '/goal', key: '5' },
          { path: '/water', key: '6' },
          { path: '/quicklaunch', key: '7' },
          { path: '/status', key: '8' },
          { path: '/settings', key: '9' }
        ];
        try {
          const saved = localStorage.getItem('tr-shortcuts');
          if (saved) shortcuts = JSON.parse(saved);
        } catch (err) {}

        const target = shortcuts.find(s => s.key === e.key);
        if (target) {
          e.preventDefault();
          navigate(target.path);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tr-theme', theme);
  }, [theme]);

  // Sync theme and profile changes
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'tr-theme' && e.newValue) {
        setTheme(e.newValue);
      }
      if (e.key === 'tr-display-name') setDisplayName(e.newValue || "ZORO'S");
      if (e.key === 'tr-avatar-url') setAvatarUrl(e.newValue || '');
    };

    const handleProfileUpdate = () => {
      setDisplayName(localStorage.getItem('tr-display-name') || "ZORO'S");
      setAvatarUrl(localStorage.getItem('tr-avatar-url') || '');
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('profileUpdated', handleProfileUpdate);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('profileUpdated', handleProfileUpdate);
    };
  }, []);

  const toggleTheme = () => {
    document.body.classList.add('theme-transition');
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
    setTimeout(() => {
      document.body.classList.remove('theme-transition');
    }, 500);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      transition: 'background var(--transition-normal)'
    }}>
      
      {/* Central Header */}
      <header className="glass-panel" style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 32px',
        margin: '16px 24px',
        borderRadius: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt="Avatar" 
              style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent-purple)', boxShadow: '0 0 10px var(--glow-purple)' }} 
            />
          ) : (
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))',
              boxShadow: '0 0 10px var(--glow-purple)'
            }} />
          )}
          <span style={{ fontSize: '1.25rem', fontWeight: '800', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            {displayName} <strong className="gradient-text">PORTAL</strong>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <GlobalClock />
          <PomodoroTimer />
          <button
            onClick={toggleTheme}
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              padding: '8px 16px',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all var(--transition-fast)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-purple)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-color)';
            }}
          >
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {/* Workspace Area */}
      <div style={{
        display: 'flex',
        gap: '24px',
        padding: '0 24px 24px 24px',
        flexGrow: 1
      }}>
        
        {/* Sidebar Nav */}
        <Navbar />

        {/* Dynamic page content */}
        <main style={{
          flexGrow: 1,
          width: '100%',
          minWidth: 0
        }}>
          <div key={location.pathname} style={{ animation: 'fadeIn 0.3s ease-out forwards' }}>
            <Routes>
                 <Route path="/" element={<Dashboard />} />
                 <Route path="/synchub" element={<SyncHub />} />
                 <Route path="/notebook" element={<Notebook />} />
                 <Route path="/task-manager" element={<TaskManager />} />
                 <Route path="/timesheet" element={<Timesheet />} />
                 <Route path="/water" element={<Water />} />
                 <Route path="/quicklaunch" element={<QuickLaunch />} />
                 <Route path="/status" element={<Status />} />
                 <Route path="/goal" element={<LearnSkills />} />
                 <Route path="/settings" element={<Settings />} />
               </Routes>
           </div>
        </main>

      </div>

    </div>
  );
}

export default App;
