import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { marked } from 'marked';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import {
  FileText, Sparkles, Copy, Download, Trash2, Plus,
  Eye, Edit3, CheckCircle2, Check, Mail, DatabaseBackup, X, Send,
  ChevronDown, MoreHorizontal, ArrowRight, Save, History, AlertTriangle, Wand2, CalendarDays
} from 'lucide-react';
import { showAlert, showConfirm } from '../utils/Alerts';
import { getAIConfig, noKeyMessage } from '../utils/ai';
import './Status.css';
import statusHero from '../assets/hero-banners/status-hero.webp';
import statusHeroLight from '../assets/hero-banners/status-hero-light.webp';

const STEP_META = {
  1: { label: 'Template', color: 'var(--accent-purple)' },
  2: { label: 'Notes', color: 'var(--accent-cyan)' },
  3: { label: 'Generate', color: 'var(--accent-pink)' },
  4: { label: 'Export', color: 'var(--accent-green)' },
};

const AI_LOADING_MESSAGES = ['Reading your notes…', 'Matching your template…', 'Drafting the report…', 'Polishing the tone…'];

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
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [refiningAction, setRefiningAction] = useState(null);

  // Rotates the loading button's label while an AI request is in flight —
  // the backend returns one JSON blob, not a real token stream, so this is
  // the "feels alive" substitute for actual streaming progress.
  useEffect(() => {
    if (!loading) { setLoadingMsgIdx(0); return; }
    const id = setInterval(() => setLoadingMsgIdx((i) => (i + 1) % AI_LOADING_MESSAGES.length), 1200);
    return () => clearInterval(id);
  }, [loading]);

  // Reveals the finished report a few words at a time instead of snapping
  // the whole thing in at once — a typewriter-style stand-in for real
  // streaming, capped so long reports still finish in ~1.4s.
  const revealReport = (fullText) => {
    const words = fullText.split(' ');
    const steps = Math.min(words.length, 60);
    const wordsPerStep = Math.max(1, Math.ceil(words.length / steps));
    const intervalMs = Math.min(1400, Math.max(400, words.length * 10)) / steps;
    let i = 0;
    const timer = setInterval(() => {
      i += wordsPerStep;
      setReport(words.slice(0, i).join(' '));
      if (i >= words.length) clearInterval(timer);
    }, intervalMs);
  };

  // Past generated reports — quick lookback without regenerating
  const [reportHistory, setReportHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tr-status-report-history') || '[]'); } catch { return []; }
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef(null);

  // Workflow stepper — which accordion step is expanded (1, 2, or null = collapsed)
  const [openStep, setOpenStep] = useState(1);
  const outputRef = useRef(null);
  const navigate = useNavigate();

  const [isCopied, setIsCopied] = useState(false);
  const [isHtmlCopied, setIsHtmlCopied] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [telegramSent, setTelegramSent] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);

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
  useEffect(() => { localStorage.setItem('tr-status-report-history', JSON.stringify(reportHistory)); }, [reportHistory]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const onClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [moreMenuOpen]);

  useEffect(() => {
    if (!historyOpen) return;
    const onClickOutside = (e) => {
      if (historyRef.current && !historyRef.current.contains(e.target)) setHistoryOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [historyOpen]);

  const stepStatus = {
    1: selectedTemplateId ? 'done' : 'pending',
    2: rawNotes.trim() ? 'done' : 'pending',
    3: report ? 'done' : 'pending',
    4: report ? 'done' : 'pending',
  };
  const activeStep = openStep === 1 ? 1 : openStep === 2 ? 2 : !report ? 3 : 4;

  const goToStep = (id) => {
    if (id === 1 || id === 2) setOpenStep(id);
    else {
      setOpenStep(null);
      if (id === 4) outputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleClear = async () => {
    if (!(await showConfirm('Clear all input notes and the generated report?'))) return;
    setRawNotes('');
    setReport('');
    localStorage.removeItem('tr-status-raw-notes');
    localStorage.removeItem('tr-status-report');
  };

  const handleTemplateChange = async (id) => {
    if (id === selectedTemplateId) return;
    if (isTemplateDirty) {
      const proceed = await showConfirm('You have unsaved changes to this template. Discard them and switch?');
      if (!proceed) return;
    }
    setSelectedTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (t) setTemplateContent(t.content);
  };

  const handleUpdateTemplate = () => {
    const updated = templates.map(t => t.id === selectedTemplateId ? { ...t, content: templateContent } : t);
    setTemplates(updated);
    localStorage.setItem('zoro-status-templates', JSON.stringify(updated));

    fetch('http://localhost:3000/api/status/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates: updated })
    }).catch(err => console.error("Could not sync templates to server:", err));
  };

  const pushReportToHistory = (text, label) => {
    const entry = { id: 'rep_' + Date.now(), date: new Date().toISOString(), templateName: label || selectedTemplateName, report: text };
    setReportHistory(prev => [entry, ...prev].slice(0, 14));
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
      revealReport(data.text);
      pushReportToHistory(data.text);
      setOpenStep(null);
    } catch (err) {
      showAlert("AI Generation failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const REFINE_ACTIONS = [
    { key: 'shorter', label: 'Shorter', instruction: 'Make this significantly shorter and more concise while keeping all key information.' },
    { key: 'detailed', label: 'More Detailed', instruction: 'Expand this with more specific technical detail and context.' },
    { key: 'casual', label: 'More Casual', instruction: 'Rewrite this in a more casual, conversational tone.' },
  ];

  const handleRefineReport = async (action) => {
    if (!report) return;
    setRefiningAction(action.key);
    try {
      const { provider, key, model } = getAIConfig();
      if (!key) throw new Error(noKeyMessage(provider));

      const prompt = `Here is a daily standup status report written in markdown:\n"${report}"\n\n${action.instruction}\n\nReturn ONLY the revised markdown. No other comments.`;
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
      revealReport(data.text);
      pushReportToHistory(data.text);
    } catch (err) {
      showAlert("Couldn't refine report: " + err.message);
    } finally {
      setRefiningAction(null);
    }
  };

  const WEEKLY_ROLLUP_DAYS = 7;

  const handleWeeklyRollup = async () => {
    const cutoff = Date.now() - WEEKLY_ROLLUP_DAYS * 24 * 60 * 60 * 1000;
    const recent = reportHistory
      .filter(e => e.templateName !== 'Weekly Rollup' && new Date(e.date).getTime() >= cutoff)
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (!recent.length) {
      showAlert(`No reports generated in the last ${WEEKLY_ROLLUP_DAYS} days yet — generate a few daily reports first.`);
      return;
    }

    setLoading(true);
    try {
      const { provider, key, model } = getAIConfig();
      if (!key) throw new Error(noKeyMessage(provider));

      const combined = recent
        .map(e => `### ${new Date(e.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}\n${e.report}`)
        .join('\n\n---\n\n');

      const prompt = `Here are my daily standup status reports from the past ${WEEKLY_ROLLUP_DAYS} days:\n\n${combined}\n\nSynthesize these into a single concise weekly status summary suitable for a manager or sprint review. Structure it with: Key Accomplishments This Week, Still In Progress, Blockers/Risks, and Notable Highlights. Merge duplicate or repeated items instead of listing them per day. Return ONLY the markdown. No other comments.`;
      const system = "You are a professional software engineer technical writer producing a weekly rollup from daily standup notes. Return raw markdown text.";

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
      revealReport(data.text);
      setViewMode('preview');
      pushReportToHistory(data.text, 'Weekly Rollup');
    } catch (err) {
      showAlert("Couldn't generate weekly rollup: " + err.message);
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
      const htmlContent = sanitizeHtml(marked(report));
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
    const previewText = report.replace(/\s+/g, ' ').trim().slice(0, 180);
    const proceed = await showConfirm(`Send this report to Telegram now? Preview: "${previewText}${report.length > 180 ? '…' : ''}"`);
    if (!proceed) return;
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

  const selectedTemplateName = templates.find(t => t.id === selectedTemplateId)?.name || 'No template selected';
  const isTemplateDirty = templates.length > 0 && templates.find(t => t.id === selectedTemplateId)?.content !== templateContent;

  // ── Detail helpers (Step 1 / Step 2 "more details" panels) ──
  const templateWordCount = templateContent.trim() ? templateContent.trim().split(/\s+/).filter(Boolean).length : 0;
  const templateLineCount = templateContent ? templateContent.split('\n').length : 0;
  const templatePlaceholders = [...new Set(templateContent.match(/\{[A-Z_]+\}/g) || [])];

  const rawWordCount = rawNotes.trim() ? rawNotes.trim().split(/\s+/).filter(Boolean).length : 0;
  const rawLineCount = rawNotes ? rawNotes.split('\n').length : 0;

  const aiConfig = getAIConfig();
  const hasAiKey = !!aiConfig.key;

  return (
    <div className="dsw-page">

      {/* Header */}
      <div
        className="glass-panel status-hero"
        style={{
          '--hero-image': `url(${statusHero})`, '--hero-image-light': `url(${statusHeroLight})`,
          padding: '24px 28px',
        }}
      >
        <h1 style={{ fontSize: '2rem', fontWeight: '900', marginBottom: '8px', letterSpacing: '-0.5px' }}>
          Daily <span className="gradient-text">Status Workstation</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Auto-compile your tasks, hours, and health data into a professional standup report.</p>
      </div>

      {/* Workflow Stepper */}
      <div className="dsw-stepper">
        {[1, 2, 3, 4].map((id, idx) => {
          const meta = STEP_META[id];
          const isDone = stepStatus[id] === 'done';
          const isActive = activeStep === id;
          return (
            <React.Fragment key={id}>
              <button
                type="button"
                className={`dsw-step ${isDone ? 'is-done' : ''} ${isActive ? 'is-active' : ''}`}
                style={{ '--step-color': meta.color }}
                onClick={() => goToStep(id)}
              >
                <div className="dsw-step-row">
                  {idx > 0 && <div className="dsw-step-line" />}
                  <div className="dsw-step-dot">{isDone ? <Check size={16} className="dsw-step-check" /> : id}</div>
                  {idx < 3 && <div className="dsw-step-line" />}
                </div>
                <span className="dsw-step-label">{meta.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      <div className="dsw-grid">

        {/* Left Column: Config & Inputs */}
        <div className="dsw-left">

          {/* Step 1: Template Configuration */}
          <div className={`glass-panel dsw-card ${openStep === 1 ? 'is-open' : ''}`} style={{ '--step-color': STEP_META[1].color }}>
            <button type="button" className="dsw-card-header" onClick={() => setOpenStep(openStep === 1 ? null : 1)}>
              <div className="dsw-card-badge">1</div>
              <div className="dsw-card-title">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={16} color={STEP_META[1].color} />
                  Choose Template
                </h3>
                <div className="dsw-card-subtitle">{selectedTemplateName}{isTemplateDirty ? ' · unsaved changes' : ''}</div>
              </div>
              <div className="dsw-card-chevron"><ChevronDown size={18} /></div>
            </button>

            {openStep === 1 && (
              <div className="dsw-card-body">
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                  {isTemplateDirty && (
                    <button onClick={(e) => { e.stopPropagation(); handleUpdateTemplate(); }} className="nav-item-hover" style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'color-mix(in srgb, var(--accent-purple) 15%, transparent)', color: 'var(--accent-purple)', border: '1px solid color-mix(in srgb, var(--accent-purple) 30%, transparent)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '700', marginRight: 'auto' }} title="Save changes to this template">
                      <Save size={14} /> Save Changes
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setTemplatePreviewOpen(true); }} className="nav-item-hover" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)', borderRadius: '8px', padding: '6px', cursor: 'pointer' }} title="Preview Template" aria-label="Preview Template">
                    <Eye size={16} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setModalOpen(true); }} className="nav-item-hover" style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '8px', padding: '6px', cursor: 'pointer' }} title="Create new" aria-label="Create new">
                    <Plus size={16} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(); }} className="nav-item-hover" style={{ background: 'color-mix(in srgb, var(--accent-red) 10%, transparent)', color: 'var(--accent-red)', border: '1px solid color-mix(in srgb, var(--accent-red) 20%, transparent)', borderRadius: '8px', padding: '6px', cursor: 'pointer' }} title="Delete" aria-label="Delete">
                    <Trash2 size={16} />
                  </button>
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

                <div className="dsw-meta-row">
                  <span className="dsw-meta-chip">{templates.length} template{templates.length !== 1 ? 's' : ''} saved</span>
                  <span className="dsw-meta-chip">{templateWordCount} words</span>
                  <span className="dsw-meta-chip">{templateLineCount} lines</span>
                  {templatePlaceholders.map(p => <span key={p} className="dsw-meta-chip tag">{p}</span>)}
                </div>

                <textarea
                  value={templateContent}
                  onChange={(e) => setTemplateContent(e.target.value)}
                  placeholder="Template content structure..."
                  style={{
                    width: '100%',
                    height: '120px',
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

                <button type="button" className="dsw-continue-btn" onClick={() => setOpenStep(2)}>
                  Continue to Raw Notes <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Data Importer */}
          <div className={`glass-panel dsw-card ${openStep === 2 ? 'is-open' : ''}`} style={{ '--step-color': STEP_META[2].color }}>
            <button type="button" className="dsw-card-header" onClick={() => setOpenStep(openStep === 2 ? null : 2)}>
              <div className="dsw-card-badge">2</div>
              <div className="dsw-card-title">
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <DatabaseBackup size={16} color={STEP_META[2].color} />
                  Raw Notes
                </h3>
                <div className="dsw-card-subtitle">{rawNotes.trim() ? `${rawNotes.trim().length} characters captured` : 'No notes yet'}</div>
              </div>
              <div className="dsw-card-chevron"><ChevronDown size={18} /></div>
            </button>

            {openStep === 2 && (
              <div className="dsw-card-body">
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {rawNotes && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setRawNotes(''); localStorage.removeItem('tr-status-raw-notes'); }}
                      title="Clear input notes"
                      style={{ background: 'color-mix(in srgb, var(--accent-red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 20%, transparent)', color: 'var(--accent-red)', borderRadius: '7px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <X size={13} /> Clear Notes
                    </button>
                  )}
                </div>

                <textarea
                  value={rawNotes}
                  onChange={(e) => setRawNotes(e.target.value)}
                  placeholder="Raw data goes here..."
                  style={{
                    width: '100%',
                    height: '320px',
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

                {rawNotes && (
                  <div className="dsw-stats-line">{rawNotes.length} chars · {rawWordCount} words · {rawLineCount} lines</div>
                )}

                <button type="button" className="dsw-continue-btn" onClick={() => setOpenStep(null)}>
                  Continue to Generate <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Step 3: Generate */}
          <div className={`glass-panel dsw-generate-card ${!report ? 'is-ready' : ''}`} style={{ '--step-color': STEP_META[3].color }}>
            <h3 style={{ fontSize: '1.02rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="dsw-card-badge">3</div>
              <Sparkles size={16} color={STEP_META[3].color} />
              Generate Report
            </h3>

            {!hasAiKey && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: 'color-mix(in srgb, var(--accent-yellow) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-yellow) 30%, transparent)', color: 'var(--accent-yellow)', fontSize: '0.78rem' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>No {aiConfig.provider === 'groq' ? 'Groq' : 'Gemini'} API key configured — AI generation is disabled.</span>
                <button type="button" onClick={() => navigate('/settings')} style={{ background: 'transparent', border: '1px solid color-mix(in srgb, var(--accent-yellow) 40%, transparent)', color: 'var(--accent-yellow)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontWeight: '700', fontSize: '0.75rem', flexShrink: 0 }}>
                  Open Settings
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleGenerateReport}
                disabled={loading || !rawNotes.trim() || !hasAiKey}
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
                  <><div className="spinner" style={{ width: '18px', height: '18px', marginRight: '8px' }} /> {AI_LOADING_MESSAGES[loadingMsgIdx]}</>
                ) : (
                  <><Sparkles size={18} /> Generate Perfect Standup</>
                )}
              </button>
              {(rawNotes || report) && (
                <button
                  onClick={handleClear}
                  title="Clear all notes and report"
                  style={{ background: 'color-mix(in srgb, var(--accent-red) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-red) 20%, transparent)', color: 'var(--accent-red)', borderRadius: '12px', padding: '0 18px', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, transition: 'all 0.2s ease' }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent-red) 18%, transparent)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--accent-red) 8%, transparent)'; }}
                >
                  <Trash2 size={16} /> Clear All
                </button>
              )}
            </div>
            {!rawNotes.trim() && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                Add some raw notes in Step 2 first — the AI needs notes to work from.
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Output / Preview — Step 4 */}
        <div ref={outputRef} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: '100%', minHeight: '600px', position: 'relative' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="dsw-card-badge" style={{ '--step-color': STEP_META[4].color }}>4</div>
              <CheckCircle2 size={20} color={STEP_META[4].color} />
              Final Report
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {reportHistory.length > 0 && (
                <div className="dsw-more-wrap" ref={historyRef}>
                  <button onClick={() => setHistoryOpen(o => !o)} className="dsw-more-btn nav-item-hover" title="Past reports" aria-label="Past reports" style={{ padding: '8px 10px' }}>
                    <History size={16} />
                  </button>
                  {historyOpen && (
                    <div className="dsw-more-menu down" style={{ minWidth: '280px', maxHeight: '320px', overflowY: 'auto' }}>
                      {reportHistory.map(entry => (
                        <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            className="dsw-more-item"
                            style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}
                            onClick={() => { setReport(entry.report); setViewMode('preview'); setHistoryOpen(false); }}
                          >
                            <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>
                              {new Date(entry.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {new Date(entry.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '220px' }}>
                              {entry.templateName}
                            </span>
                          </button>
                          <button
                            className="dsw-more-item danger"
                            style={{ width: 'auto', padding: '8px' }}
                            title="Remove from history"
                            aria-label="Remove from history"
                            onClick={() => setReportHistory(prev => prev.filter(e => e.id !== entry.id))}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {reportHistory.length > 0 && (
                <button
                  type="button"
                  onClick={handleWeeklyRollup}
                  disabled={loading || !!refiningAction || !hasAiKey}
                  className="dsw-more-btn nav-item-hover"
                  title={`Synthesize the last ${WEEKLY_ROLLUP_DAYS} days of reports into a weekly summary`}
                  style={{ padding: '8px 12px', width: 'auto', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: '700' }}
                >
                  <CalendarDays size={15} /> Weekly Rollup
                </button>
              )}

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
              <div className="markdown-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(marked(report)) }} />
            ) : (
              <textarea
                value={report}
                onChange={(e) => setReport(e.target.value)}
                style={{ width: '100%', height: '100%', flexGrow: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', outline: 'none', resize: 'none', lineHeight: '1.6' }}
              />
            )}
          </div>

          {report && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: '600', flexShrink: 0 }}>
                <Wand2 size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />Refine:
              </span>
              {REFINE_ACTIONS.map(action => (
                <button
                  key={action.key}
                  type="button"
                  disabled={!!refiningAction || loading}
                  onClick={() => handleRefineReport(action)}
                  className="nav-item-hover"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '20px', padding: '5px 12px', fontSize: '0.76rem', fontWeight: '600', cursor: refiningAction ? 'default' : 'pointer', opacity: refiningAction && refiningAction !== action.key ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  {refiningAction === action.key ? <div className="spinner" style={{ width: '11px', height: '11px' }} /> : null}
                  {action.label}
                </button>
              ))}
              <button
                type="button"
                disabled={!!refiningAction || loading || !hasAiKey}
                onClick={handleGenerateReport}
                className="nav-item-hover"
                title="Regenerate from scratch using the current notes and template"
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '20px', padding: '5px 12px', fontSize: '0.76rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <Sparkles size={12} /> Regenerate
              </button>
            </div>
          )}

          {report && (
            <div className="dsw-action-row">
              <button onClick={handleCopyHtml} className="dsw-action-primary nav-item-hover" style={{ background: isHtmlCopied ? 'rgba(59,130,246,0.15)' : 'var(--bg-tertiary)', border: `1px solid ${isHtmlCopied ? 'rgba(59,130,246,0.4)' : 'var(--border-color)'}`, color: isHtmlCopied ? '#3b82f6' : 'var(--text-primary)', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}>
                {isHtmlCopied ? <Check size={18} /> : <Mail size={18} />} {isHtmlCopied ? 'Copied HTML!' : 'Copy for Email/Teams'}
              </button>

              <button onClick={handleCopyReport} className="dsw-action-secondary nav-item-hover" style={{ background: isCopied ? 'rgba(16,185,129,0.15)' : 'var(--bg-tertiary)', border: `1px solid ${isCopied ? 'rgba(16,185,129,0.4)' : 'var(--border-color)'}`, color: isCopied ? '#10b981' : 'var(--text-primary)', padding: '12px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}>
                {isCopied ? <Check size={18} /> : <Copy size={18} />} {isCopied ? 'Copied!' : 'Copy Markdown'}
              </button>

              <div className="dsw-more-wrap" ref={moreMenuRef}>
                <button onClick={() => setMoreMenuOpen(o => !o)} className="dsw-more-btn nav-item-hover" title="More actions" aria-label="More actions">
                  <MoreHorizontal size={18} />
                </button>
                {moreMenuOpen && (
                  <div className="dsw-more-menu">
                    <button className="dsw-more-item" disabled={sendingTelegram} onClick={() => { handleSendTelegram(); setMoreMenuOpen(false); }}>
                      {telegramSent ? <Check size={16} /> : <Send size={16} className={sendingTelegram ? 'spinner' : ''} />}
                      {telegramSent ? 'Sent!' : sendingTelegram ? 'Sending…' : 'Send to Telegram'}
                    </button>
                    <button className="dsw-more-item" onClick={() => { handleExportMarkdown(); setMoreMenuOpen(false); }}>
                      <Download size={16} /> Download .md
                    </button>
                    <button className="dsw-more-item danger" onClick={() => { setReport(''); localStorage.removeItem('tr-status-report'); setMoreMenuOpen(false); }}>
                      <Trash2 size={16} /> Clear Report
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Template Modal */}
      {modalOpen && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ padding: '30px', width: '500px', maxWidth: '96vw', display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
          <div className="glass-panel" style={{ padding: '30px', width: '800px', maxWidth: '96vw', height: '80vh', display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>
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
                __html: sanitizeHtml(marked(templateContent
                  .replace(/{DATE}/g, new Date().toLocaleDateString())
                  .replace(/{TASKS_COMPLETED}/g, 'Task 1\n- Task 2')
                  .replace(/{TASKS_IN_PROGRESS}/g, 'Task 3\n- Task 4')
                  .replace(/{TASKS_TABLE_ROW}/g, '| Example Task | ✅ Completed | Details |\n| Pending Task | 🔄 In Progress | Fix requested |')
                ))
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
