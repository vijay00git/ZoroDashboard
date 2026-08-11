import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { MAIN_NAV } from '../navigation';

const Navbar = () => {
  const location = useLocation();
  const displayName = localStorage.getItem('tr-display-name') || 'ZORO';
  const avatarUrl   = localStorage.getItem('tr-avatar-url')   || '';

  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <nav className="sidebar" aria-label="Main navigation">
      {/* ── Brand ── */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
            />
          ) : (
            initials
          )}
        </div>
        <div className="sidebar-brand-text">
          <span className="sidebar-brand-name">{displayName}</span>
          <span className="sidebar-brand-sub">Portal</span>
        </div>
      </div>

      {/* ── Main Nav ── */}
      <div className="sidebar-nav">
        <span className="sidebar-section-label">Workspace</span>

        {MAIN_NAV.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              className={`sidebar-item${isActive ? ' active' : ''}`}
              title={label}
            >
              <Icon size={17} className="sidebar-icon" strokeWidth={isActive ? 2.5 : 1.8} />
              <span className="sidebar-label">{label}</span>
            </Link>
          );
        })}
      </div>

      {/* ── Footer: Settings ── */}
      <div className="sidebar-footer">
        <Link
          to="/settings"
          className={`sidebar-item${location.pathname === '/settings' ? ' active' : ''}`}
          title="Settings"
        >
          <Settings size={17} className="sidebar-icon" strokeWidth={location.pathname === '/settings' ? 2.5 : 1.8} />
          <span className="sidebar-label">Settings</span>
        </Link>
      </div>
    </nav>
  );
};

export default Navbar;
