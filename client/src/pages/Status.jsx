import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { marked } from 'marked';
import {
  FileText, Sparkles, Copy, Download, Trash2, Plus, RefreshCw,
  Eye, Edit3, Settings, CheckCircle2, Clock, Check, ListTodo, Droplets, Mail, DatabaseBackup, X, Send
} from 'lucide-react';
import { showAlert, showConfirm } from '../utils/Alerts';
import { getAIConfig, noKeyMessage } from '../utils/ai';

const Status = () => {
  // Templates
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false);

  // Input notes — persisted to localStorage so navigation/refresh keeps them
  const [rawNotes, setRawNotes] = useState(() => localStorage.getItem('tr-status-raw-notes') || '');
  const [report, setReport] = useState(() => localStorage.getItem('tr-status-report') || '');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('tr-status-view-mode') || 'preview');
  const [loading, setLoading] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);

  // Features config
  const [importConfig, setImportConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('tr-status-import-config');
      return saved ? JSON.parse(saved) : { tasks: true, timesheet: true, health: false };
    } catch { return { tasks: true, timesheet: true, health: false }; }
  });
  const [isCopied, setIsCopied] = useState(false);
  const [isHtmlCopied, setIsHtmlCopied] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [telegramSent, setTelegramSent] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateBody, setNewTemplateBody] = useState('');

  const DEFAULT_TEMPLATES = [
    {
      id: "std-standup",
      name: "Standard Daily Standup",
      content: `# Daily Status Report - {DATE}

## ✅ Completed Today
- {TASKS_COMPLETED}

## 🚧 In Progress / Next Steps
- {TASKS_IN_PROGRESS}

## 🚫 Blockers / Concerns
- None

---
*Generated from today's work logs*`
    },
    {
      id: "tech-status",
      name: "Detailed Technical Status (with Table)",
      content: `# Tech Status Progress - {DATE}

## Task Breakdown
| Task / Activity | Status | Details / Notes |
| --- | --- | --- |
| {TASKS_TABLE_ROW} |

## Summary of Accomplishments
1. Completed code changes and verified locally.
2. Ran integration tests.

## Key Links & References
- QA Staging: http://localhost:5173/`
    }
  ];

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/status/templates');
        if (response.ok) {
          const data = await response.json();
          const list = Array.isArray(data) ? data : (data.templates || []);
          if (list.length > 0) {
            setTemplates(list);
            setSelectedTemplateId(list[0].id);
            setTemplateContent(list[0].content);
            return;
          }
        }
      } catch (e) {
        console.warn("Could not fetch templates from API, loading fallback", e);
      }

      try {
        const saved = localStorage.getItem('zoro-status-templates');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTemplates(parsed);
            setSelectedTemplateId(parsed[0]?.id || '');
            setTemplateContent(parsed[0]?.content || '');
            return;
          }
        }
      } catch (e) {
        console.error("Failed to parse local templates", e);
      }
      
      setTemplates(DEFAULT_TEMPLATES);
      setSelectedTemplateId(DEFAULT_TEMPLATES[0].id);
      setTemplateContent(DEFAULT_TEMPLATES[0].content);
      localStorage.setItem('zoro-status-templates', JSON.stringify(DEFAULT_TEMPLATES));
    };
    fetchTemplates();
  }, []);

  useEffect(() => { localStorage.setItem('tr-status-raw-notes', rawNotes); }, [rawNotes]);
  useEffect(() => { localStorage.setItem('tr-status-report', report); }, [report]);
  useEffect(() => { localStorage.setItem('tr-status-view-mode', viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem('tr-status-import-config', JSON.stringify(importConfig)); }, [importConfig]);

  const handleClear = async () => {
    if (!(await showConfirm('Clear all input notes and the generated report?'))) return;
    setRawNotes('');
    setReport('');
    localStorage.removeItem('tr-status-raw-notes');
    localStorage.removeItem('tr-status-report');
  };

  const handleTemplateChange = (id) => {
    setSelectedTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (t) setTemplateContent(t.content);
  };

  const handleImportActivities = () => {
    setLoadingImport(true);
    let finalNotes = `--- TODAY SUMMARY (${new Date().toLocaleDateString()}) ---\n\n`;

    if (importConfig.tasks) {
      const tasksSaved = localStorage.getItem('tr-run-tasks');
      let completedText = 'No tasks checked off today.';
      let inProgressText = 'No pending tasks.';
      if (tasksSaved) {
        const parsed = JSON.parse(tasksSaved);
        if (Array.isArray(parsed)) {
          const comp = parsed.filter(t => t.completed).map(t => t.title);
          const active = parsed.filter(t => !t.completed).map(t => t.title);
          if (comp.length) completedText = comp.join('\n- ');
          if (active.length) inProgressText = active.join('\n- ');
        }
      }
      finalNotes += `### Tasks\n**Completed:**\n- ${completedText}\n\n**In Progress:**\n- ${inProgressText}\n\n`;
    }

    if (importConfig.timesheet) {
      const now = new Date();
      const monthStr = String(now.getMonth() + 1).padStart(2, '0');
      const dayStr = String(now.getDate()).padStart(2, '0');
      const key = `ts-data-${now.getFullYear()}-${monthStr}`;
      
      let tsInfo = 'No timesheet data logged.';
      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          const todayDate = `${dayStr}-${monthStr}-${now.getFullYear()}`;
          const todayDate2 = `${now.getFullYear()}-${monthStr}-${dayStr}`;
          const row = parsed.rows?.find(r => r.date === todayDate || r.date === todayDate2);
          if (row) {
            tsInfo = `Type: ${row.type} | In: ${row.inTime || 'N/A'} | Out: ${row.outTime || 'N/A'}`;
          }
        }
      } catch(e) {}
      finalNotes += `### Work Hours\n${tsInfo}\n\n`;
    }

    if (importConfig.health) {
      const waterIntake = localStorage.getItem('tr-water-intake-ml') || '0';
      finalNotes += `### Health & Focus\nHydration: ${waterIntake} ml\n\n`;
    }

    setRawNotes(finalNotes);
    setTimeout(() => setLoadingImport(false), 600);
  };

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      const { provider, key, model } = getAIConfig();
      if (!key) throw new Error(noKeyMessage(provider));

      const dateStr = new Date().toLocaleDateString();
      const tasksSaved = localStorage.getItem('tr-run-tasks') || '[]';
      const parsedTasks = JSON.parse(tasksSaved);
      const completed = parsedTasks.filter(t => t.completed).map(t => t.title).join(', ');
      const active = parsedTasks.filter(t => !t.completed).map(t => t.title).join(', ');
      const tableRows = parsedTasks.map(t => `| ${t.title} | ${t.completed ? '✅ Completed' : '🔄 In Progress'} | - |`).join('\n');

      const compiledTemplate = templateContent
        .replace(/{DATE}/g, dateStr)
        .replace(/{TASKS_COMPLETED}/g, completed || 'None')
        .replace(/{TASKS_IN_PROGRESS}/g, active || 'None')
        .replace(/{TASKS_TABLE_ROW}/g, tableRows || '| None | - | - |');

      const prompt = `Here is my raw developer standup summary notes:\n"${rawNotes}"\n\nHere is the target status template structure I want to use:\n"${compiledTemplate}"\n\nPlease refine my raw notes into a professional daily standup status report matching the template. Improve spelling, format tables neatly, and sound like a Senior Software Engineer. Return ONLY the refined status markdown. No other comments.`;
      const system = "You are a professional software engineer technical writer. Return raw markdown text.";

      const res = await fetch('http://localhost:3000/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, model, provider, system, prompt })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'AI request failed' }));
        throw new Error(err.error || `Server returned ${res.status}`);
      }

      const data = await res.json();
      setReport(data.text);
    } catch (err) {
      showAlert("AI Generation failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyReport = () => {
    if (!report) return;
    navigator.clipboard.writeText(report);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCopyHtml = async () => {
    if (!report) return;
    try {
      const htmlContent = marked(report);
      const clipboardItem = new ClipboardItem({
        'text/html': new Blob([htmlContent], { type: 'text/html' }),
        'text/plain': new Blob([report], { type: 'text/plain' })
      });
      await navigator.clipboard.write([clipboardItem]);
      setIsHtmlCopied(true);
      setTimeout(() => setIsHtmlCopied(false), 2000);
    } catch (e) {
      console.error(e);
      handleCopyReport(); // Fallback
    }
  };

  const handleSendTelegram = async () => {
    if (!report) return;
    setSendingTelegram(true);
    try {
      const res = await fetch('/api/integrations/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: report }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Send failed');
      setTelegramSent(true);
      setTimeout(() => setTelegramSent(false), 2000);
    } catch (err) {
      showAlert("Couldn't send to Telegram: " + err.message + ' — check the bot token/chat ID in Settings → Integrations.');
    } finally {
      setSendingTelegram(false);
    }
  };

  const handleExportMarkdown = () => {
    if (!report) return;
    const element = document.createElement("a");
    const file = new Blob([report], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `Daily_Report_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleSaveTemplate = (e) => {
    e.preventDefault();
    if (!newTemplateName.trim() || !newTemplateBody.trim()) return;

    const newT = { id: 'template_' + Date.now(), name: newTemplateName, content: newTemplateBody };
    const updated = [...templates, newT];
    setTemplates(updated);
    setSelectedTemplateId(newT.id);
    setTemplateContent(newT.content);
    localStorage.setItem('zoro-status-templates', JSON.stringify(updated));

    fetch('http://localhost:3000/api/status/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates: updated })
    }).catch(err => console.error("Could not sync templates to server:", err));

    setModalOpen(false);
    setNewTemplateName('');
    setNewTemplateBody('');
  };

  const handleDeleteTemplate = async () => {
    if (templates.length <= 1) return showAlert("You must keep at least one template.");
    if (await showConfirm("Permanently delete this status template?")) {
      const updated = templates.filter(t => t.id !== selectedTemplateId);
      setTemplates(updated);
      setSelectedTemplateId(updated[0].id);
      setTemplateContent(updated[0].content);
      localStorage.setItem('zoro-status-templates', JSON.stringify(updated));

      fetch('http://localhost:3000/api/status/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates: updated })
      }).catch(err => console.error(err));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minHeight: '100vh', paddingBottom: '40px' }}>
      
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: '900', marginBottom: '8px', letterSpacing: '-0.5px' }}>
          Daily <span className="gradient-text">Status Workstation</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Auto-compile your tasks, hours, and health data into a professional standup report.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column: Config & Inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Template Configuration */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="var(--accent-purple)" />
                Report Template
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setTemplatePreviewOpen(true)} className="nav-item-hover" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '6px', cursor: 'pointer' }} title="Preview Template">
                  <Eye size={16} />
                </button>
                <button onClick={() => setModalOpen(true)} className="nav-item-hover" style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', padding: '6px', cursor: 'pointer' }} title="Create new">
                  <Plus size={16} />
                </button>
                <button onClick={handleDeleteTemplate} className="nav-item-hover" style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '6px', cursor: 'pointer' }} title="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <select
              value={selectedTemplateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                padding: '12px 14px',
                borderRadius: '10px',
                outline: 'none',
                fontWeight: '600',
                fontSize: '0.9rem',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%239CA3AF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 14px top 50%',
                backgroundSize: '10px auto'
              }}
            >
              {templates?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            <textarea
              value={templateContent}
              onChange={(e) => setTemplateContent(e.target.value)}
              placeholder="Template content structure..."
              style={{
                width: '100%',
                height: '140px',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                borderRadius: '10px',
                padding: '14px',
                outline: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                resize: 'vertical',
                lineHeight: '1.5'
              }}
            />
          </div>

          {/* Data Importer */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <DatabaseBackup size={18} color="#3b82f6" />
                Data Aggregator
              </h3>
              {rawNotes && (
                <button
                  onClick={() => { setRawNotes(''); localStorage.removeItem('tr-status-raw-notes'); }}
                  title="Clear input notes"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--accent-red)', borderRadius: '7px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <X size={13} /> Clear Notes
                </button>
              )}
            </div>

            {/* Smart Toggles */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <div 
                onClick={() => setImportConfig(p => ({ ...p, tasks: !p.tasks }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                  padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600',
                  background: importConfig.tasks ? 'rgba(16,185,129,0.15)' : 'var(--bg-tertiary)',
                  color: importConfig.tasks ? '#10b981' : 'var(--text-muted)',
                  border: `1px solid ${importConfig.tasks ? 'rgba(16,185,129,0.3)' : 'var(--border-color)'}`,
                  transition: 'all 0.2s'
                }}>
                <ListTodo size={14} /> Tasks
              </div>
              <div 
                onClick={() => setImportConfig(p => ({ ...p, timesheet: !p.timesheet }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                  padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600',
                  background: importConfig.timesheet ? 'rgba(59,130,246,0.15)' : 'var(--bg-tertiary)',
                  color: importConfig.timesheet ? '#3b82f6' : 'var(--text-muted)',
                  border: `1px solid ${importConfig.timesheet ? 'rgba(59,130,246,0.3)' : 'var(--border-color)'}`,
                  transition: 'all 0.2s'
                }}>
                <Clock size={14} /> Timesheet
              </div>
              <div 
                onClick={() => setImportConfig(p => ({ ...p, health: !p.health }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                  padding: '6px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600',
                  background: importConfig.health ? 'rgba(6,182,212,0.15)' : 'var(--bg-tertiary)',
                  color: importConfig.health ? '#06b6d4' : 'var(--text-muted)',
                  border: `1px solid ${importConfig.health ? 'rgba(6,182,212,0.3)' : 'var(--border-color)'}`,
                  transition: 'all 0.2s'
                }}>
                <Droplets size={14} /> Health
              </div>
            </div>

            <button
              onClick={handleImportActivities}
              disabled={loadingImport}
              style={{
                width: '100%',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: '10px',
                padding: '12px',
                cursor: 'pointer',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
              className="nav-item-hover"
            >
              <RefreshCw size={16} className={loadingImport ? 'spinner' : ''} />
              {loadingImport ? 'Aggregating...' : 'Pull Today\'s Activity'}
            </button>

            <textarea
              value={rawNotes}
              onChange={(e) => setRawNotes(e.target.value)}
              placeholder="Raw data goes here..."
              style={{
                width: '100%',
                height: '140px',
                background: 'rgba(0,0,0,0.2)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: '10px',
                padding: '14px',
                outline: 'none',
                fontSize: '0.85rem',
                lineHeight: '1.5',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleGenerateReport}
              disabled={loading || !rawNotes.trim()}
              className="glow-btn"
              style={{
                flex: 1,
                justifyContent: 'center',
                padding: '16px',
                fontSize: '1rem',
                fontWeight: 'bold',
                background: loading ? 'rgba(168, 85, 247, 0.4)' : undefined
              }}
            >
              {loading ? (
                <><div className="spinner" style={{ width: '18px', height: '18px', marginRight: '8px' }} /> AI Processing...</>
              ) : (
                <><Sparkles size={18} /> Generate Perfect Standup</>
              )}
            </button>
            {(rawNotes || report) && (
              <button
                onClick={handleClear}
                title="Clear all notes and report"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--accent-red)', borderRadius: '12px', padding: '0 18px', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, transition: 'all 0.2s ease' }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
              >
                <Trash2 size={16} /> Clear All
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Output / Preview */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100%', minHeight: '600px', position: 'relative' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={20} color="#10b981" />
              Final Report
            </h3>

            {report && (
              <div style={{ display: 'flex', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <button onClick={() => setViewMode('preview')} style={{ background: viewMode === 'preview' ? 'var(--bg-primary)' : 'transparent', border: 'none', color: viewMode === 'preview' ? 'var(--accent-purple)' : 'var(--text-secondary)', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', boxShadow: viewMode === 'preview' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none' }}>
                  <Eye size={14} /> Preview
                </button>
                <button onClick={() => setViewMode('source')} style={{ background: viewMode === 'source' ? 'var(--bg-primary)' : 'transparent', border: 'none', color: viewMode === 'source' ? 'var(--accent-purple)' : 'var(--text-secondary)', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', boxShadow: viewMode === 'source' ? '0 2px 8px rgba(0,0,0,0.2)' : 'none' }}>
                  <Edit3 size={14} /> Markdown
                </button>
              </div>
            )}
          </div>

          <div style={{
            flexGrow: 1,
            background: report ? (viewMode === 'preview' ? 'var(--bg-primary)' : 'rgba(0,0,0,0.3)') : 'rgba(0,0,0,0.1)',
            border: '1px solid var(--border-color)',
            padding: report ? '24px' : '0',
            borderRadius: '12px',
            overflowY: 'auto',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {!report ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                  <FileText size={32} style={{ opacity: 0.5 }} />
                </div>
                <h4 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '8px' }}>Waiting for Data</h4>
                <p style={{ fontSize: '0.9rem', maxWidth: '320px', lineHeight: '1.5' }}>
                  Aggregrate your daily data and click Generate to see your AI-perfected standup report here.
                </p>
              </div>
            ) : viewMode === 'preview' ? (
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: marked(report) }} />
            ) : (
              <textarea
                value={report}
                onChange={(e) => setReport(e.target.value)}
                style={{ width: '100%', height: '100%', flexGrow: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', outline: 'none', resize: 'none', lineHeight: '1.6' }}
              />
            )}
          </div>

          {report && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button onClick={handleCopyHtml} style={{ flex: 1, background: isHtmlCopied ? 'rgba(59,130,246,0.15)' : 'var(--bg-tertiary)', border: `1px solid ${isHtmlCopied ? 'rgba(59,130,246,0.4)' : 'var(--border-color)'}`, color: isHtmlCopied ? '#3b82f6' : 'var(--text-primary)', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }} className="nav-item-hover">
                {isHtmlCopied ? <Check size={18} /> : <Mail size={18} />} {isHtmlCopied ? 'Copied HTML!' : 'Copy for Email/Teams'}
              </button>
              
              <button onClick={handleCopyReport} style={{ flex: 1, background: isCopied ? 'rgba(16,185,129,0.15)' : 'var(--bg-tertiary)', border: `1px solid ${isCopied ? 'rgba(16,185,129,0.4)' : 'var(--border-color)'}`, color: isCopied ? '#10b981' : 'var(--text-primary)', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }} className="nav-item-hover">
                {isCopied ? <Check size={18} /> : <Copy size={18} />} {isCopied ? 'Copied!' : 'Copy Markdown'}
              </button>

              <button onClick={handleSendTelegram} disabled={sendingTelegram} style={{ flex: 1, background: telegramSent ? 'rgba(6,182,212,0.15)' : 'var(--bg-tertiary)', border: `1px solid ${telegramSent ? 'rgba(6,182,212,0.4)' : 'var(--border-color)'}`, color: telegramSent ? '#06b6d4' : 'var(--text-primary)', padding: '12px', borderRadius: '10px', cursor: sendingTelegram ? 'default' : 'pointer', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }} className="nav-item-hover">
                {telegramSent ? <Check size={18} /> : <Send size={18} className={sendingTelegram ? 'spinner' : ''} />} {telegramSent ? 'Sent!' : sendingTelegram ? 'Sending…' : 'Send to Telegram'}
              </button>

              <button onClick={handleExportMarkdown} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '12px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="nav-item-hover" title="Download .md file">
                <Download size={18} />
              </button>

              <button
                onClick={() => { setReport(''); localStorage.removeItem('tr-status-report'); }}
                title="Clear report"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--accent-red)', padding: '12px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                className="nav-item-hover"
              >
                <Trash2 size={18} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* New Template Modal */}
      {modalOpen && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ padding: '30px', width: '500px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800' }}>Create Custom Template</h3>
            <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Template Name</label>
                <input type="text" value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '12px 14px', borderRadius: '10px', outline: 'none', fontSize: '0.9rem' }} placeholder="e.g. Weekly Executive Report" required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>Template Structure</label>
                <textarea value={newTemplateBody} onChange={(e) => setNewTemplateBody(e.target.value)} style={{ height: '220px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '14px', borderRadius: '10px', outline: 'none', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', lineHeight: '1.5' }} placeholder="Use tags like {DATE}, {TASKS_COMPLETED}, {TASKS_IN_PROGRESS} in your template..." required />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setModalOpen(false)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                <button type="submit" className="glow-btn" style={{ padding: '10px 20px', borderRadius: '10px' }}>Save Template</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Template Preview Modal */}
      {templatePreviewOpen && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ padding: '30px', width: '800px', height: '80vh', display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye size={20} color="#3b82f6" />
                Template Preview
              </h3>
              <button onClick={() => setTemplatePreviewOpen(false)} className="nav-item-hover" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '6px', borderRadius: '8px', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            <div
              className="markdown-body"
              style={{
                flexGrow: 1,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '24px',
                overflowY: 'auto',
                fontSize: '0.9rem'
              }}
              dangerouslySetInnerHTML={{ 
                __html: marked(templateContent
                  .replace(/{DATE}/g, new Date().toLocaleDateString())
                  .replace(/{TASKS_COMPLETED}/g, 'Task 1\n- Task 2')
                  .replace(/{TASKS_IN_PROGRESS}/g, 'Task 3\n- Task 4')
                  .replace(/{TASKS_TABLE_ROW}/g, '| Example Task | ✅ Completed | Details |\n| Pending Task | 🔄 In Progress | Fix requested |')
                ) 
              }}
            />
            
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setTemplatePreviewOpen(false)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 24px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold' }}>Close Preview</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Status;
