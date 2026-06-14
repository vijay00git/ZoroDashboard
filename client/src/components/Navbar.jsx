import { useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  RefreshCw, 
  CheckSquare, 
  Calendar, 
  Droplet, 
  Rocket, 
  FileText, 
  BookOpen, 
  Settings,
  Database,
  Edit3,
  Menu,
  X
} from 'lucide-react';

const Navbar = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/synchub', label: 'Sync Hub', icon: RefreshCw },
    { path: '/notebook', label: 'Notebook', icon: Edit3 },
    { path: '/task-manager', label: 'Task Manager', icon: CheckSquare },
    { path: '/timesheet', label: 'Timesheet', icon: Calendar },
    { path: '/water', label: 'Hydration', icon: Droplet },
    { path: '/quicklaunch', label: 'Quick-Launch', icon: Rocket },
    { path: '/status', label: 'Daily Status', icon: FileText },
    { path: '/goal', label: 'Learn Skills', icon: BookOpen },
    { path: '/settings', label: 'Settings', icon: Settings }
  ];

  const hoverTimeout = useRef(null);
  
  const handleMouseEnter = () => {
    hoverTimeout.current = setTimeout(() => setIsOpen(true), 250);
  };
  
  const handleMouseLeaveTrigger = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  };

  return (
    <>
      {/* Invisible hover trigger area on the far left */}
      {!isOpen && (
        <div 
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeaveTrigger}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            width: '20px',
            zIndex: 90
          }}
        />
      )}

      {/* Floating Toggle Button (Visible when closed) */}
      {!isOpen && (
        <button 
          onClick={() => setIsOpen(true)}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeaveTrigger}
          style={{
            position: 'fixed',
            left: '0',
            top: '100px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderLeft: 'none',
            padding: '12px 14px 12px 8px',
            borderRadius: '0 14px 14px 0',
            cursor: 'pointer',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            color: 'var(--text-primary)',
            boxShadow: '4px 0 15px rgba(0,0,0,0.15)',
            transition: 'background 0.2s ease'
          }}
          className="nav-item-hover"
        >
          <Menu size={22} style={{ color: 'var(--accent-purple)' }} />
        </button>
      )}

      {/* Sidebar Drawer */}
      <nav 
        className="glass-panel" 
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          padding: '20px 16px',
          height: '100vh',
          position: 'fixed',
          top: '0',
          left: isOpen ? '0' : '-300px', // Slide in/out
          width: '260px',
          borderRadius: '0 16px 16px 0',
          zIndex: 1000,
          transition: 'left 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          boxShadow: isOpen ? '10px 0 30px rgba(0,0,0,0.3)' : 'none',
          overflowY: 'auto'
        }}
      >
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '20px', 
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <div style={{
            fontSize: '0.85rem',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            background: 'linear-gradient(90deg, var(--accent-purple), var(--accent-pink))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: '900'
          }}>
            Command Center
          </div>
          <button 
            onClick={() => setIsOpen(false)} 
            style={{ 
              background: 'var(--bg-glass)', 
              border: '1px solid var(--border-color)', 
              color: 'var(--text-primary)', 
              cursor: 'pointer',
              borderRadius: '8px',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            className="nav-item-hover"
          >
            <X size={16} />
          </button>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <div key={item.path} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                {isActive && (
                  <div style={{
                    position: 'absolute',
                    left: '-16px',
                    width: '6px',
                    height: '60%',
                    background: 'linear-gradient(to bottom, var(--accent-purple), var(--accent-pink))',
                    borderRadius: '0 4px 4px 0',
                    boxShadow: '2px 0 8px rgba(168, 85, 247, 0.4)'
                  }} />
                )}
                <Link
                  to={item.path}
                  onClick={() => setIsOpen(false)} // Close on navigation
                  style={{
                    display: 'flex',
                    width: '100%',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    color: isActive ? 'white' : 'var(--text-secondary)',
                    background: isActive ? 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))' : 'transparent',
                    fontWeight: isActive ? '700' : '500',
                    fontSize: '0.9rem',
                    boxShadow: isActive ? '0 4px 15px rgba(168, 85, 247, 0.3)' : 'none',
                    transition: 'all 0.2s ease',
                    border: isActive ? 'none' : '1px solid transparent'
                  }}
                  className={!isActive ? 'nav-item-hover' : ''}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Overlay Backdrop */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(2px)',
            zIndex: 999,
            transition: 'all 0.3s ease'
          }}
        />
      )}
    </>
  );
};

export default Navbar;
