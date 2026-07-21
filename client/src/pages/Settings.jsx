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
  Monitor,
  Plug,
  Search,
  Send,
  Plus,
  X,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { showAlert, showConfirm } from '../utils/Alerts';

const EMPTY_INTEGRATIONS_FORM = {
  TESTRAIL_URL: '', TESTRAIL_USERNAME: '', TESTRAIL_API_KEY: '', TESTRAIL_PROJECT_ID: '', TESTRAIL_SUITE_ID: '',
  JENKINS_URL: '', JENKINS_USERNAME: '', JENKINS_API_TOKEN: '', JENKINS_DEFAULT_ENVIRONMENT: 'qa',
  JENKINS_JOBS: { OFFLINE: [], ONLINE: [], E2E: [] },
  TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', TELEGRAM_NOTIFY_ON_FAILURE: false, TELEGRAM_NOTIFY_ON_SUCCESS: false,
  TELEGRAM_ATTACH_SCREENSHOTS: true, TELEGRAM_ATTACH_CSV: true,
  TELEGRAM_DIGEST_ENABLED: false, TELEGRAM_DIGEST_TIME: '18:00',
};

const JOB_CAT_LABELS = { OFFLINE: 'Offline', ONLINE: 'Online', E2E: 'E2E / Appium' };
const JOB_CAT_ORDER = ['OFFLINE', 'ONLINE', 'E2E'];

const fieldLabelStyle = { fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: '600' };
const fieldInputStyle = { background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '12px 14px', borderRadius: '10px', outline: 'none', fontSize: '0.9rem', width: '100%' };

const JobsPillEditor = ({ label, jobs, onChange }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v || jobs.includes(v)) { setDraft(''); return; }
    onChange([...jobs, v]);
    setDraft('');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={fieldLabelStyle}>{label} jobs</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '8px 10px' }}>
        {jobs.map((j) => (
          <span key={j} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-primary)', border: '1px solid var(--border-glow)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '20px', fontSize: '0.8rem' }}>
            {j}
            <button type="button" onClick={() => onChange(jobs.filter((x) => x !== j))} title={`Remove ${j}`} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Add job name…"
          style={{ flex: 1, minWidth: '120px', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: '0.85rem' }}
        />
        <button type="button" onClick={add} title="Add job" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--accent-cyan)', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer', display: 'flex' }}>
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
};

const ConnTestRow = ({ label, testing, result }) => {
  let icon = <span style={{ width: '13px', display: 'inline-block' }} />;
  let text = 'Not tested yet';
  let color = 'var(--text-muted)';
  if (testing) { icon = <Loader2 size={13} className="spinner" />; text = 'Testing…'; }
  else if (result) {
    if (result.ok) { icon = <CheckCircle2 size={13} />; text = 'Connected'; color = 'var(--accent-green)'; }
    else { icon = <XCircle size={13} />; text = result.error || 'Failed'; color = 'var(--accent-red)'; }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0' }}>
      <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color }}>{icon}{text}</span>
    </div>
  );
};

const Settings = () => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'profile');

  const [aiProvider, setAiProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('gemini-1.5-flash-8b');
  const [groqKey, setGroqKey] = useState('');
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [groqModel, setGroqModel] = useState('llama-3.3-70b-versatile');
  const [theme, setTheme] = useState('dark');

  const GROQ_MODELS = [
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Best Quality)' },
    { id: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B Instant (Fastest)' },
    { id: 'gemma2-9b-it',            label: 'Gemma 2 9B — Google (Free)' },
    { id: 'llama3-8b-8192',          label: 'Llama 3 8B 8192' },
  ];

  const [availableModels, setAvailableModels] = useState(() => {
    try { return JSON.parse(localStorage.getItem('zoro-ai-models-list')) || null; } catch { return null; }
  });
  const [fetchingModels, setFetchingModels] = useState(false);

  const handleFetchModels = async () => {
    if (!apiKey) {
      showAlert('Please enter a Gemini API key first to pull models.');
      return;
    }
    setFetchingModels(true);
    try {
      const res = await fetch(`http://localhost:3000/api/ai/models?key=${apiKey}&provider=gemini`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch models');
      setAvailableModels(data.models);
      localStorage.setItem('zoro-ai-models-list', JSON.stringify(data.models));
      showAlert(`Successfully fetched ${data.models.length} models!`);
    } catch (e) {
      showAlert('Error fetching models: ' + e.message);
    } finally {
      setFetchingModels(false);
    }
  };

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

  // Integrations — TestRail / Jenkins / Telegram, shared server-side config
  // (data/settings/integrations.local.json) so any page can use them, not
  // just the Test Case Dashboard where this used to live.
  const [intForm, setIntForm] = useState(EMPTY_INTEGRATIONS_FORM);
  const [intLoading, setIntLoading] = useState(true);
  const [intSaving, setIntSaving] = useState(false);
  const [showTrKey, setShowTrKey] = useState(false);
  const [showJenkinsToken, setShowJenkinsToken] = useState(false);
  const [showTelegramToken, setShowTelegramToken] = useState(false);
  const [connTesting, setConnTesting] = useState(false);
  const [connTestResult, setConnTestResult] = useState(null);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoveredChats, setDiscoveredChats] = useState(null);

  useEffect(() => {
    fetch('/api/integrations/config', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setIntForm((f) => ({
        ...f,
        ...json,
        JENKINS_JOBS: { OFFLINE: [], ONLINE: [], E2E: [], ...(json.JENKINS_JOBS || {}) },
      })))
      .catch(() => {})
      .finally(() => setIntLoading(false));
  }, []);

  const setInt = (key) => (e) => setIntForm((f) => ({ ...f, [key]: e.target.value }));
  const setIntChecked = (key) => (e) => setIntForm((f) => ({ ...f, [key]: e.target.checked }));
  const setIntJobs = (cat) => (jobs) => setIntForm((f) => ({ ...f, JENKINS_JOBS: { ...f.JENKINS_JOBS, [cat]: jobs } }));

  const handleSaveIntegrations = async (e) => {
    e.preventDefault();
    setIntSaving(true);
    try {
      const res = await fetch('/api/integrations/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(intForm),
      });
      const body = await res.json();
      if (!res.ok) { showAlert(body.error || "Couldn't save integrations"); return; }
      setSaveStatus('Integrations saved successfully!');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      showAlert('Error saving integrations: ' + err.message);
    } finally {
      setIntSaving(false);
    }
  };

  const runConnTest = async () => {
    setConnTesting(true);
    setConnTestResult(null);
    try {
      const res = await fetch('/api/integrations/config/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(intForm),
      });
      setConnTestResult(await res.json());
    } catch (err) {
      showAlert('Test failed: ' + err.message);
    } finally {
      setConnTesting(false);
    }
  };

  const runTelegramTest = async () => {
    setTelegramTesting(true);
    setTelegramTestResult(null);
    try {
      const res = await fetch('/api/integrations/telegram/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(intForm),
      });
      const body = await res.json();
      setTelegramTestResult(res.ok ? { ok: true } : { ok: false, error: body.error });
    } catch (err) {
      setTelegramTestResult({ ok: false, error: err.message });
    } finally {
      setTelegramTesting(false);
    }
  };

  const discoverChats = async () => {
    setDiscovering(true);
    setDiscoveredChats(null);
    try {
      const res = await fetch('/api/integrations/telegram/discover-chats', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(intForm),
      });
      const body = await res.json();
      if (!res.ok) { showAlert(body.error || "Couldn't look up chats"); setDiscoveredChats([]); return; }
      setDiscoveredChats(body.chats || []);
      if ((body.chats || []).length === 0) showAlert('No chats found yet — message your bot first, then try again.');
    } catch (err) {
      showAlert(`Couldn't look up chats: ${err.message}`);
      setDiscoveredChats([]);
    } finally {
      setDiscovering(false);
    }
  };

  const pickChat = (chat) => {
    setIntForm((f) => ({ ...f, TELEGRAM_CHAT_ID: String(chat.id) }));
    setDiscoveredChats(null);
  };

  useEffect(() => {
    setAiProvider(localStorage.getItem('zoro-ai-provider') || 'gemini');
    setApiKey(localStorage.getItem('zoro-ai-key') || '');
    setModel(localStorage.getItem('zoro-ai-model') || 'gemini-1.5-flash-8b');
    setGroqKey(localStorage.getItem('zoro-groq-key') || '');
    setGroqModel(localStorage.getItem('zoro-groq-model') || 'llama-3.3-70b-versatile');
    setTheme(localStorage.getItem('tr-theme') || 'dark');
    setDisplayName(localStorage.getItem('tr-display-name') || 'Zoro User');
    setAvatarUrl(localStorage.getItem('tr-avatar-url') || '');
  }, []);

  const handleSaveAIConfig = (e) => {
    e.preventDefault();
    localStorage.setItem('zoro-ai-provider', aiProvider);
    localStorage.setItem('zoro-ai-key', apiKey);
    localStorage.setItem('zoro-ai-model', model);
    localStorage.setItem('zoro-groq-key', groqKey);
    localStorage.setItem('zoro-groq-model', groqModel);
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
        showAlert("Please select an image smaller than 1MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarUrl(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExportBackup = async () => {
    setExportLoading(true);
    try {
      const lsData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        lsData[key] = localStorage.getItem(key);
      }

      const res = await fetch('http://localhost:3000/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localStorageData: lsData })
      });
      
      if (!res.ok) throw new Error("Backup failed");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "zoro_dashboard_backup.zip";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
    } catch (err) {
      console.error(err);
      showAlert("Error exporting backup: " + err.message);
    } finally {
      setExportLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith('.zip')) {
        showAlert('Please select a valid .zip backup file.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleRestoreBackup = async () => {
    if (!selectedFile) return;
    const confirmed = await showConfirm(
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
        if (result.localStorageData) {
          Object.keys(result.localStorageData).forEach(key => {
            localStorage.setItem(key, result.localStorageData[key]);
          });
        }
        showAlert('Backup restored successfully! Returning to dashboard.');
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } else {
        showAlert(`Restore failed: ${result.error}`);
      }
    } catch (err) {
      console.error(err);
      showAlert('An unexpected error occurred during restoration.');
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
    { id: 'integrations', label: 'Integrations', icon: <Plug size={16} /> },
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px' }}>
                  <button 
                    onClick={() => { setTheme('dark'); document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('tr-theme', 'dark'); }}
                    style={{ padding: '20px', borderRadius: '12px', background: 'var(--bg-tertiary)', border: theme === 'dark' ? '2px solid var(--accent-pink)' : '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', transition: 'all 0.2s ease' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#0f172a', border: '1px solid #334155' }} />
                    <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>Dark Mode</span>
                  </button>
                  <button 
                    onClick={() => { setTheme('light'); document.documentElement.setAttribute('data-theme', 'light'); localStorage.setItem('tr-theme', 'light'); }}
                    style={{ padding: '20px', borderRadius: '12px', background: 'var(--bg-tertiary)', border: theme === 'light' ? '2px solid var(--accent-pink)' : '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', transition: 'all 0.2s ease' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f8fafc', border: '1px solid #e2e8f0' }} />
                    <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>Light Mode</span>
                  </button>
                  <button 
                    onClick={() => { setTheme('lava'); document.documentElement.setAttribute('data-theme', 'lava'); localStorage.setItem('tr-theme', 'lava'); }}
                    style={{ padding: '20px', borderRadius: '12px', background: 'var(--bg-tertiary)', border: theme === 'lava' ? '2px solid var(--accent-purple)' : '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', transition: 'all 0.2s ease' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #120808, #ff4500)', border: '1px solid #ff4500' }} />
                    <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>Lava Mode</span>
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

              {/* Provider switcher */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '500px' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '600' }}>AI Provider</label>
                <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: '10px', padding: '4px', border: '1px solid var(--border-color)', gap: '4px' }}>
                  {[
                    { id: 'gemini', label: '✦ Google Gemini', sub: 'Paid / limited free tier' },
                    { id: 'groq',   label: '⚡ Groq',          sub: 'Free — 14,400 req/day' },
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setAiProvider(p.id)}
                      style={{
                        flex: 1, padding: '10px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                        background: aiProvider === p.id ? (p.id === 'groq' ? 'linear-gradient(135deg,#f97316,#ef4444)' : 'linear-gradient(135deg,var(--accent-purple),var(--accent-pink))') : 'transparent',
                        color: aiProvider === p.id ? '#fff' : 'var(--text-secondary)',
                        fontWeight: aiProvider === p.id ? '700' : '500',
                        fontSize: '0.9rem', transition: 'all 0.2s ease',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px'
                      }}
                    >
                      <span>{p.label}</span>
                      <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>{p.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSaveAIConfig} style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '500px' }}>

                {/* ── Gemini fields ── */}
                {aiProvider === 'gemini' && (
                  <>
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
                        <button type="button" onClick={() => setShowKey(!showKey)} style={{ position: 'absolute', right: '16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                          {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                        Get your key at <span style={{ color: 'var(--accent-purple)' }}>aistudio.google.com</span>
                      </p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Default Model</label>
                        <button
                          type="button"
                          onClick={handleFetchModels}
                          disabled={fetchingModels}
                          style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-glow)', color: 'var(--accent-cyan)', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          {fetchingModels ? <RefreshCw size={14} className="spinner" /> : <Download size={14} />}
                          Pull Models
                        </button>
                      </div>
                      <select
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '14px 16px', borderRadius: '10px', outline: 'none', fontSize: '0.95rem', fontWeight: '500' }}
                      >
                        {availableModels ? (
                          availableModels.map(m => (
                            <option key={m.id} value={m.id}>{m.displayName || m.id}</option>
                          ))
                        ) : (
                          <>
                            <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite (Free — Recommended)</option>
                            <option value="gemini-1.5-flash-8b">gemini-1.5-flash-8b (Ultra Fast / Free)</option>
                            <option value="gemini-1.5-flash">gemini-1.5-flash (Standard Fast)</option>
                            <option value="gemini-1.5-pro">gemini-1.5-pro (Standard Pro)</option>
                            <option value="gemini-2.0-flash-exp">gemini-2.0-flash-exp (Experimental)</option>
                            <option value="gemini-2.5-flash">gemini-2.5-flash (Next-Gen, needs quota)</option>
                          </>
                        )}
                      </select>
                    </div>
                  </>
                )}

                {/* ── Groq fields ── */}
                {aiProvider === 'groq' && (
                  <>
                    <div style={{ background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#f97316' }}>⚡ Groq Free Tier</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>14,400 requests/day · 30 req/min · No credit card needed · Never "busy"</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Get a free key at <span style={{ color: '#f97316' }}>console.groq.com</span>
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Groq API Key</label>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type={showGroqKey ? 'text' : 'password'}
                          value={groqKey}
                          onChange={(e) => setGroqKey(e.target.value)}
                          placeholder="gsk_..."
                          style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '14px 45px 14px 16px', borderRadius: '10px', outline: 'none', fontSize: '0.95rem', fontFamily: showGroqKey ? 'var(--font-mono)' : 'inherit' }}
                        />
                        <button type="button" onClick={() => setShowGroqKey(!showGroqKey)} style={{ position: 'absolute', right: '16px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                          {showGroqKey ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Model</label>
                      <select
                        value={groqModel}
                        onChange={(e) => setGroqModel(e.target.value)}
                        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '14px 16px', borderRadius: '10px', outline: 'none', fontSize: '0.95rem', fontWeight: '500' }}
                      >
                        {GROQ_MODELS.map(m => (
                          <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <button type="submit" className="glow-btn" style={{ justifyContent: 'center', padding: '14px', background: aiProvider === 'groq' ? 'linear-gradient(135deg,#f97316,#ef4444)' : undefined }}>
                  <Check size={18} /> Save AI Settings
                </button>
              </form>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="glass-panel" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
                <Plug size={24} style={{ color: 'var(--accent-cyan)' }} />
                <div>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>Integrations</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    TestRail, Jenkins, and Telegram credentials — shared across every page that needs them (Test Case Dashboard, Daily Status, …). Stored server-side, changes apply immediately.
                  </p>
                </div>
              </div>

              {intLoading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading current integrations…</div>
              ) : (
                <form onSubmit={handleSaveIntegrations} style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>

                  {/* TestRail */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: '700' }}>TestRail</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={fieldLabelStyle}>URL</label>
                        <input type="text" value={intForm.TESTRAIL_URL} onChange={setInt('TESTRAIL_URL')} placeholder="https://yourteam.testrail.com" style={fieldInputStyle} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={fieldLabelStyle}>Username</label>
                        <input type="email" value={intForm.TESTRAIL_USERNAME} onChange={setInt('TESTRAIL_USERNAME')} placeholder="you@example.com" style={fieldInputStyle} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={fieldLabelStyle}>API Key</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input type={showTrKey ? 'text' : 'password'} value={intForm.TESTRAIL_API_KEY} onChange={setInt('TESTRAIL_API_KEY')} style={{ ...fieldInputStyle, paddingRight: '45px', fontFamily: showTrKey ? 'var(--font-mono)' : 'inherit' }} />
                          <button type="button" onClick={() => setShowTrKey((v) => !v)} style={{ position: 'absolute', right: '14px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            {showTrKey ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={fieldLabelStyle}>Project ID</label>
                        <input type="number" value={intForm.TESTRAIL_PROJECT_ID} onChange={setInt('TESTRAIL_PROJECT_ID')} style={fieldInputStyle} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={fieldLabelStyle}>Suite ID</label>
                        <input type="number" value={intForm.TESTRAIL_SUITE_ID} onChange={setInt('TESTRAIL_SUITE_ID')} style={fieldInputStyle} />
                      </div>
                    </div>
                  </div>

                  {/* Jenkins */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
                    <h4 style={{ fontSize: '1rem', fontWeight: '700' }}>Jenkins</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={fieldLabelStyle}>URL</label>
                        <input type="text" value={intForm.JENKINS_URL} onChange={setInt('JENKINS_URL')} placeholder="http://jenkins.internal:8080" style={fieldInputStyle} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={fieldLabelStyle}>Username</label>
                        <input type="text" value={intForm.JENKINS_USERNAME} onChange={setInt('JENKINS_USERNAME')} style={fieldInputStyle} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={fieldLabelStyle}>API Token</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input type={showJenkinsToken ? 'text' : 'password'} value={intForm.JENKINS_API_TOKEN} onChange={setInt('JENKINS_API_TOKEN')} style={{ ...fieldInputStyle, paddingRight: '45px', fontFamily: showJenkinsToken ? 'var(--font-mono)' : 'inherit' }} />
                          <button type="button" onClick={() => setShowJenkinsToken((v) => !v)} style={{ position: 'absolute', right: '14px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            {showJenkinsToken ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={fieldLabelStyle}>Default environment</label>
                        <input type="text" value={intForm.JENKINS_DEFAULT_ENVIRONMENT} onChange={setInt('JENKINS_DEFAULT_ENVIRONMENT')} style={fieldInputStyle} />
                      </div>
                    </div>
                    {JOB_CAT_ORDER.map((cat) => (
                      <JobsPillEditor key={cat} label={JOB_CAT_LABELS[cat]} jobs={intForm.JENKINS_JOBS[cat] || []} onChange={setIntJobs(cat)} />
                    ))}
                  </div>

                  <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <ConnTestRow label="TestRail" testing={connTesting} result={connTestResult && connTestResult.testrail} />
                    <ConnTestRow label="Jenkins" testing={connTesting} result={connTestResult && connTestResult.jenkins} />
                    <button type="button" onClick={runConnTest} disabled={connTesting} style={{ alignSelf: 'flex-start', marginTop: '6px', background: 'var(--bg-primary)', border: '1px solid var(--border-glow)', color: 'var(--accent-cyan)', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>
                      {connTesting ? 'Testing…' : 'Test connection'}
                    </button>
                  </div>

                  {/* Telegram */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: '700' }}>Telegram notifications</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Create a bot with <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)' }}>@BotFather</a>, paste the token below,
                        then open a chat with your bot and send it any message before using "Find chat ID".
                      </p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={fieldLabelStyle}>Bot token</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input type={showTelegramToken ? 'text' : 'password'} value={intForm.TELEGRAM_BOT_TOKEN} onChange={setInt('TELEGRAM_BOT_TOKEN')} placeholder="123456:ABC-DEF…" style={{ ...fieldInputStyle, paddingRight: '45px', fontFamily: showTelegramToken ? 'var(--font-mono)' : 'inherit' }} />
                          <button type="button" onClick={() => setShowTelegramToken((v) => !v)} style={{ position: 'absolute', right: '14px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                            {showTelegramToken ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={fieldLabelStyle}>Chat ID</label>
                        <input type="text" value={intForm.TELEGRAM_CHAT_ID} onChange={setInt('TELEGRAM_CHAT_ID')} placeholder="e.g. 123456789" style={fieldInputStyle} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button type="button" onClick={discoverChats} disabled={discovering || !intForm.TELEGRAM_BOT_TOKEN} style={{ alignSelf: 'flex-start', background: 'var(--bg-primary)', border: '1px solid var(--border-glow)', color: 'var(--accent-cyan)', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Search size={13} /> {discovering ? 'Looking…' : 'Find chat ID'}
                      </button>
                      {discoveredChats && discoveredChats.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {discoveredChats.map((c) => (
                            <button type="button" key={c.id} onClick={() => pickChat(c)} style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                              <span>{c.label}</span>
                              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{c.id}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={intForm.TELEGRAM_NOTIFY_ON_FAILURE} onChange={setIntChecked('TELEGRAM_NOTIFY_ON_FAILURE')} />
                      Notify me when a triggered build fails
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={intForm.TELEGRAM_NOTIFY_ON_SUCCESS} onChange={setIntChecked('TELEGRAM_NOTIFY_ON_SUCCESS')} />
                      Notify me when a triggered build succeeds
                    </label>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginLeft: '24px', paddingLeft: '12px', borderLeft: '2px solid var(--border-color)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={intForm.TELEGRAM_ATTACH_SCREENSHOTS} onChange={setIntChecked('TELEGRAM_ATTACH_SCREENSHOTS')} />
                        Attach every screenshot from the build
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={intForm.TELEGRAM_ATTACH_CSV} onChange={setIntChecked('TELEGRAM_ATTACH_CSV')} />
                        Attach the CSV results file
                      </label>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={intForm.TELEGRAM_DIGEST_ENABLED} onChange={setIntChecked('TELEGRAM_DIGEST_ENABLED')} />
                      Send a daily digest of everything that ran
                    </label>
                    {intForm.TELEGRAM_DIGEST_ENABLED && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '160px' }}>
                        <label style={fieldLabelStyle}>Digest time (server local time)</label>
                        <input type="time" value={intForm.TELEGRAM_DIGEST_TIME} onChange={setInt('TELEGRAM_DIGEST_TIME')} style={fieldInputStyle} />
                      </div>
                    )}

                    <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <ConnTestRow label="Telegram" testing={telegramTesting} result={telegramTestResult} />
                      <button type="button" onClick={runTelegramTest} disabled={telegramTesting} style={{ alignSelf: 'flex-start', marginTop: '6px', background: 'var(--bg-primary)', border: '1px solid var(--border-glow)', color: 'var(--accent-cyan)', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Send size={13} /> {telegramTesting ? 'Sending…' : 'Send test message'}
                      </button>
                    </div>
                  </div>

                  <button type="submit" className="glow-btn" disabled={intSaving} style={{ justifyContent: 'center', padding: '14px' }}>
                    <Check size={18} /> {intSaving ? 'Saving…' : 'Save Integrations'}
                  </button>
                </form>
              )}
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
