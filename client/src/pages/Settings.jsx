import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Key,
  Cpu,
  Download,
  Upload,
  Check,
  Eye,
  EyeOff,
  Database,
  RefreshCw,
  Keyboard,
  LayoutGrid,
  User,
  Palette,
  Shield,
  Monitor
} from 'lucide-react';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('profile');

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('gemini-1.5-flash-8b');
  const [theme, setTheme] = useState('dark');
  
  // Profile State
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // Backup/Restore status
  const [exportLoading, setExportLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  // Success toast msg
  const [saveStatus, setSaveStatus] = useState('');

  const [widgetsConfig, setWidgetsConfig] = useState(() => {
    const saved = localStorage.getItem('tr-dash-widgets');
    if (saved) return JSON.parse(saved);
    return [
      { id: 'learning', enabled: true },
      { id: 'events', enabled: true },
      { id: 'scratchpad', enabled: true },
      { id: 'tasks', enabled: true },
      { id: 'draft', enabled: true },
      { id: 'status_mini_grid', enabled: true },
      { id: 'matrix', enabled: true },
      { id: 'links', enabled: true },
      { id: 'clocks', enabled: true }
    ];
  });

  const toggleWidget = (id) => {
    const newConfig = widgetsConfig.map(w =>
      w.id === id ? { ...w, enabled: w.enabled === false ? true : false } : w
    );
    setWidgetsConfig(newConfig);
    localStorage.setItem('tr-dash-widgets', JSON.stringify(newConfig));
  };

  const widgetNames = {
    learning: 'Active Learning',
    events: 'Upcoming Events',
    scratchpad: 'Notebook Scratchpad',
    tasks: 'Status Checklist',
    draft: 'Daily Status Draft',
    status_mini_grid: 'Hydration & Timesheet',
    matrix: 'Pinned Matrix',
    links: 'Frequently Visited Links',
    clocks: 'World Clocks'
  };

  const [shortcuts, setShortcuts] = useState(() => {
    const saved = localStorage.getItem('tr-shortcuts');
    if (saved) return JSON.parse(saved);
    return [
      { path: '/', label: 'Dashboard', key: '0' },
      { path: '/task-manager', label: 'Task Manager', key: '1' },
      { path: '/notebook', label: 'Notes / Scratchpad', key: '2' },
      { path: '/synchub', label: 'Sync Hub', key: '3' },
      { path: '/timesheet', label: 'Timesheet', key: '4' },
      { path: '/goal', label: 'Learning Goals', key: '5' },
      { path: '/water', label: 'Water Log', key: '6' },
      { path: '/quicklaunch', label: 'Quick Links', key: '7' },
      { path: '/status', label: 'Daily Status', key: '8' },
      { path: '/settings', label: 'Settings', key: '9' }
    ];
  });

  const handleShortcutChange = (index, newKey) => {
    const newShortcuts = [...shortcuts];
    newShortcuts[index].key = newKey.toLowerCase();
    setShortcuts(newShortcuts);
    localStorage.setItem('tr-shortcuts', JSON.stringify(newShortcuts));
  };

  useEffect(() => {
    setApiKey(localStorage.getItem('zoro-ai-key') || '');
    setModel(localStorage.getItem('zoro-ai-model') || 'gemini-1.5-flash-8b');
    setTheme(localStorage.getItem('tr-theme') || 'dark');
    setDisplayName(localStorage.getItem('tr-display-name') || 'Zoro User');
    setAvatarUrl(localStorage.getItem('tr-avatar-url') || '');
  }, []);

  const handleSaveAIConfig = (e) => {
    e.preventDefault();
    localStorage.setItem('zoro-ai-key', apiKey);
    localStorage.setItem('zoro-ai-model', model);
    setSaveStatus('AI configuration saved successfully!');
    setTimeout(() => setSaveStatus(''), 3000);
  };
  
  const handleSaveProfile = (e) => {
    e.preventDefault();
    localStorage.setItem('tr-display-name', displayName);
    localStorage.setItem('tr-avatar-url', avatarUrl);
    // Dispatch a custom event to notify App.jsx that the profile changed
    window.dispatchEvent(new Event('profileUpdated'));
    setSaveStatus('Profile updated successfully!');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 1024 * 1024) { // 1MB limit for localStorage
        alert("Please select an image smaller than 1MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExportBackup = () => {
    setExportLoading(true);
    window.location.href = 'http://localhost:3000/api/backup';
    setTimeout(() => {
      setExportLoading(false);
    }, 2000);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith('.zip')) {
        alert('Please select a valid .zip backup file.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedFile) return;
    const confirmed = window.confirm(
      "WARNING: Restoring this backup will PERMANENTLY overwrite all current data. This cannot be undone. Are you absolutely sure?"
    );
    if (!confirmed) return;

    setRestoreLoading(true);
    const formData = new FormData();
    formData.append('backup', selectedFile);

    try {
      const response = await fetch('http://localhost:3000/api/restore', {
        method: 'POST',
        body: formData
      });
      const result = await response.json();
      if (response.ok) {
        alert('Backup restored successfully! Returning to dashboard.');
        window.location.href = '/';
      } else {
        alert(`Restore failed: ${result.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('An unexpected error occurred during restoration.');
    } finally {
      setRestoreLoading(false);
    }
  };

  const TABS = [
    { id: 'profile', label: 'Profile', icon: <User size={16} /> },
    { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutGrid size={16} /> },
    { id: 'shortcuts', label: 'Shortcuts', icon: <Keyboard size={16} /> },
    { id: 'ai', label: 'AI Integration', icon: <Cpu size={16} /> },
    { id: 'vault', label: 'Data Vault', icon: <Database size={16} /> }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: '100%' }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '4px' }}>
          Portal <span className="gradient-text">Settings</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>Personalize your experience and manage integrations.</p>
      </div>

      <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
        
        {/* Sidebar Nav */}
        <div style={{ 
          width: '240px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '8px',
          background: 'var(--bg-tertiary)',
          padding: '16px',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          flexShrink: 0
        }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '10px',
                background: activeTab === tab.id ? 'var(--bg-primary)' : 'transparent',
                border: activeTab === tab.id ? '1px solid var(--border-glow)' : '1px solid transparent',
                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.id ? 'bold' : '500',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left'
              }}
              className="nav-item-hover"
            >
              {React.cloneElement(tab.icon, { color: activeTab === tab.id ? 'var(--accent-cyan)' : 'var(--text-muted)' })}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
          
          {saveStatus && (
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--accent-green)', color: 'var(--accent-green)', padding: '12px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Check size={16} /> {saveStatus}
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                <User size={24} style={{ color: 'var(--accent-purple)' }} />
                <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>Profile Settings</h3>
              </div>
              <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '400px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '12px 16px', borderRadius: '10px', outline: 'none', fontSize: '0.9rem' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Avatar Profile Photo</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--bg-tertiary)', border: '2px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {avatarUrl ? <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={24} style={{ color: 'var(--text-muted)' }} />}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        style={{ display: 'none' }}
                        id="avatar-upload"
                      />
                      <label htmlFor="avatar-upload" className="glow-btn" style={{ padding: '8px 16px', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', width: 'max-content' }}>
                        Upload Image
                      </label>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Or paste an image URL below (max 1MB for upload):</span>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.png"
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '12px 16px', borderRadius: '10px', outline: 'none', fontSize: '0.9rem' }}
                  />
                </div>
                <button type="submit" className="glow-btn" style={{ justifyContent: 'center', marginTop: '10px' }}>
                  <Check size={16} /> Save Profile
                </button>
              </form>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                <Palette size={24} style={{ color: 'var(--accent-pink)' }} />
                <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>Appearance</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '600' }}>Color Theme</label>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <button 
                    onClick={() => { setTheme('dark'); document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('tr-theme', 'dark'); }}
                    style={{ flex: 1, padding: '20px', borderRadius: '12px', background: 'var(--bg-tertiary)', border: theme === 'dark' ? '2px solid var(--accent-pink)' : '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#0f172a', border: '1px solid #334155' }} />
                    <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>Dark Mode</span>
                  </button>
                  <button 
                    onClick={() => { setTheme('light'); document.documentElement.setAttribute('data-theme', 'light'); localStorage.setItem('tr-theme', 'light'); }}
                    style={{ flex: 1, padding: '20px', borderRadius: '12px', background: 'var(--bg-tertiary)', border: theme === 'light' ? '2px solid var(--accent-pink)' : '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f8fafc', border: '1px solid #e2e8f0' }} />
                    <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>Light Mode</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                <LayoutGrid size={24} style={{ color: 'var(--accent-orange)' }} />
                <div>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>Dashboard Widgets</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Toggle which widgets are visible on your primary dashboard.</p>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
                {widgetsConfig.map(w => (
                  <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>{widgetNames[w.id]}</span>
                    <div 
                      onClick={() => toggleWidget(w.id)}
                      style={{
                        width: '44px',
                        height: '24px',
                        background: w.enabled !== false ? 'var(--accent-green)' : 'var(--bg-primary)',
                        borderRadius: '12px',
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        border: w.enabled !== false ? '1px solid var(--accent-green)' : '1px solid var(--text-muted)'
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        top: '2px',
                        left: w.enabled !== false ? '22px' : '2px',
                        width: '18px',
                        height: '18px',
                        background: '#fff',
                        borderRadius: '50%',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                <Keyboard size={24} style={{ color: 'var(--accent-cyan)' }} />
                <div>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>Global Shortcuts</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Customize your quick-jump navigation keys. Uses Ctrl modifier.</p>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
                {shortcuts.map((shortcut, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{shortcut.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-primary)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-glow)' }}>
                      <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>Ctrl +</span>
                      <input
                        type="text"
                        value={shortcut.key}
                        onChange={(e) => handleShortcutChange(idx, e.target.value.slice(-1))}
                        style={{
                          width: '20px',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--accent-cyan)',
                          fontSize: '0.85rem',
                          fontFamily: 'var(--font-mono)',
                          textAlign: 'center',
                          outline: 'none',
                          fontWeight: 'bold',
                          textTransform: 'lowercase'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                <Cpu size={24} style={{ color: '#fbbf24' }} />
                <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>AI Configuration</h3>
              </div>
              
              <form onSubmit={handleSaveAIConfig} style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '500px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Gemini API Key</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '14px 45px 14px 16px', borderRadius: '10px', outline: 'none', fontSize: '0.95rem', fontFamily: showKey ? 'var(--font-mono)' : 'inherit' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      style={{ position: 'absolute', right: '16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                    >
                      {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Default Model Engine</label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '14px 16px', borderRadius: '10px', outline: 'none', fontSize: '0.95rem', fontWeight: '500' }}
                  >
                    <option value="gemini-2.5-flash">gemini-2.5-flash (Next-Gen Fast)</option>
                    <option value="gemini-2.0-flash-exp">gemini-2.0-flash-exp (Experimental Fast)</option>
                    <option value="gemini-2.0-pro-exp">gemini-2.0-pro-exp (Experimental Pro)</option>
                    <option value="gemini-1.5-pro">gemini-1.5-pro (Standard Pro)</option>
                    <option value="gemini-1.5-flash">gemini-1.5-flash (Standard Fast)</option>
                    <option value="gemini-1.5-flash-8b">gemini-1.5-flash-8b (Ultra Fast / Cheap)</option>
                  </select>
                </div>

                <button type="submit" className="glow-btn" style={{ justifyContent: 'center', padding: '14px' }}>
                  <Check size={18} /> Save AI Settings
                </button>
              </form>
            </div>
          )}

          {activeTab === 'vault' && (
            <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                <Database size={24} style={{ color: 'var(--accent-red)' }} />
                <div>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>Data Archive Vault</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Manage all local storage data, including backups and restoration.</p>
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                
                {/* Export Card */}
                <div style={{ background: 'var(--bg-tertiary)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '12px', color: '#3b82f6' }}>
                      <Download size={24} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: 'bold' }}>Export Backup</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Download all your data as a ZIP file.</p>
                    </div>
                  </div>
                  <button onClick={handleExportBackup} disabled={exportLoading} className="glow-btn" style={{ justifyContent: 'center', marginTop: 'auto' }}>
                    <Download size={16} /> {exportLoading ? 'Exporting...' : 'Generate Archive'}
                  </button>
                </div>

                {/* Restore Card */}
                <div style={{ background: 'var(--bg-tertiary)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '12px', color: 'var(--accent-red)' }}>
                      <Upload size={24} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: '1.05rem', fontWeight: 'bold' }}>Restore Backup</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Upload a previously exported ZIP.</p>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto' }}>
                    <input type="file" accept=".zip" onChange={handleFileChange} style={{ display: 'none' }} id="restore-upload-input" />
                    <label htmlFor="restore-upload-input" style={{ background: 'var(--bg-primary)', border: '1px dashed var(--border-color)', color: 'var(--text-secondary)', padding: '12px', borderRadius: '12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }} className="nav-item-hover">
                      <Upload size={16} /> {selectedFile ? selectedFile.name : 'Select Archive File'}
                    </label>

                    {selectedFile && (
                      <button onClick={handleRestoreBackup} disabled={restoreLoading} style={{ padding: '12px', background: 'linear-gradient(135deg, var(--accent-pink), var(--accent-red))', border: 'none', color: 'white', fontWeight: 'bold', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                        {restoreLoading ? <RefreshCw size={16} className="spinner" /> : <RefreshCw size={16} />} 
                        {restoreLoading ? 'Restoring...' : 'Restore Now'}
                      </button>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
};

export default Settings;
