import React, { useState, useEffect } from 'react';
import { marked } from 'marked';
import {
  FileText,
  Sparkles,
  Copy,
  Download,
  Trash2,
  Plus,
  RefreshCw,
  Award,
  Calendar,
  CheckCircle,
  Eye,
  Edit3
} from 'lucide-react';

const Status = () => {
  // Templates
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateContent, setTemplateContent] = useState('');

  // Input notes
  const [rawNotes, setRawNotes] = useState('');
  const [report, setReport] = useState('');
  const [viewMode, setViewMode] = useState('preview'); // 'preview' or 'source'
  const [loading, setLoading] = useState(false);
  const [loadingImport, setLoadingImport] = useState(false);

  // New Template Modal state
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

  // --- Initialize ---
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/status/templates');
        if (response.ok) {
          const data = await response.json();
          // The response might be wrapping templates inside { templates: [...] } or just an array
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

      // Local storage fallback
      const saved = localStorage.getItem('zoro-status-templates');
      if (saved) {
        const parsed = JSON.parse(saved);
        setTemplates(parsed);
        setSelectedTemplateId(parsed[0]?.id || '');
        setTemplateContent(parsed[0]?.content || '');
      } else {
        setTemplates(DEFAULT_TEMPLATES);
        setSelectedTemplateId(DEFAULT_TEMPLATES[0].id);
        setTemplateContent(DEFAULT_TEMPLATES[0].content);
        localStorage.setItem('zoro-status-templates', JSON.stringify(DEFAULT_TEMPLATES));
      }
    };

    fetchTemplates();
  }, []);

  const handleTemplateChange = (id) => {
    setSelectedTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (t) setTemplateContent(t.content);
  };

  const handleImportActivities = () => {
    setLoadingImport(true);
    // Fetch data from local storage
    const tasksSaved = localStorage.getItem('tr-run-tasks');
    const waterIntake = localStorage.getItem('tr-water-intake-ml') || '0';

    let completedText = '';
    let inProgressText = '';
    let tableRows = '';

    if (tasksSaved) {
      const parsedTasks = JSON.parse(tasksSaved);
      if (Array.isArray(parsedTasks)) {
        const comp = parsedTasks.filter(t => t.completed);
        const active = parsedTasks.filter(t => !t.completed);

        completedText = comp.map(t => t.title).join('\n- ');
        inProgressText = active.map(t => t.title).join('\n- ');

        tableRows = parsedTasks.map(t => `| ${t.title} | ${t.completed ? '✅ Completed' : '🔄 In Progress'} | Priority: ${t.priority} |`).join('\n');
      }
    }

    if (!completedText) completedText = 'No tasks checked off today.';
    if (!inProgressText) inProgressText = 'No pending status tasks.';
    if (!tableRows) tableRows = '| No tasks logged | - | - |';

    const dateStr = new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

    let finalNotes = `--- TODAY SUMMARY (${dateStr}) ---\n`;
    finalNotes += `Completed Today:\n- ${completedText}\n\n`;
    finalNotes += `In Progress:\n- ${inProgressText}\n\n`;
    finalNotes += `Hydration Today: ${waterIntake} ml\n`;

    setRawNotes(finalNotes);
    setLoadingImport(false);
  };

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      const key = localStorage.getItem('zoro-ai-key');
      const model = localStorage.getItem('zoro-ai-model') || 'gemini-1.5-flash-8b';

      if (!key) {
        throw new Error("Please connect your Gemini API key in Settings first!");
      }

      // Compile data
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
        body: JSON.stringify({ key, model, system, prompt })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'AI request failed' }));
        throw new Error(err.error || `Server returned ${res.status}`);
      }

      const data = await res.json();
      setReport(data.text);
    } catch (err) {
      alert("AI Generation failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyReport = () => {
    if (!report) return;
    navigator.clipboard.writeText(report);
    alert('Report copied to clipboard!');
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

    const newT = {
      id: 'template_' + Date.now(),
      name: newTemplateName,
      content: newTemplateBody
    };

    const updated = [...templates, newT];
    setTemplates(updated);
    setSelectedTemplateId(newT.id);
    setTemplateContent(newT.content);
    localStorage.setItem('zoro-status-templates', JSON.stringify(updated));

    // Save to API
    fetch('http://localhost:3000/api/status/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templates: updated })
    }).catch(err => console.error("Could not sync templates to server:", err));

    setModalOpen(false);
    setNewTemplateName('');
    setNewTemplateBody('');
  };

  const handleDeleteTemplate = () => {
    if (templates.length <= 1) return alert("You must keep at least one template.");
    if (window.confirm("Permanently delete this status template?")) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '4px' }}>
          Daily <span className="gradient-text">Status Workstation</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>Import today's status achievements and compile professional daily standups.</p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 2fr',
        gap: '24px',
        alignItems: 'start'
      }}>

        {/* Left Column: Inputs & Templates */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Template Select */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '12px' }}>Choose Format</h3>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                style={{
                  flexGrow: 1,
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  outline: 'none',
                  fontWeight: '500'
                }}
              >
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>

              <button
                onClick={() => setModalOpen(true)}
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: '10px',
                  padding: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Create custom template"
              >
                <Plus size={18} />
              </button>

              <button
                onClick={handleDeleteTemplate}
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: 'var(--accent-red)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '10px',
                  padding: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Delete template"
              >
                <Trash2 size={18} />
              </button>
            </div>

            <textarea
              value={templateContent}
              onChange={(e) => setTemplateContent(e.target.value)}
              placeholder="Template content structure..."
              style={{
                width: '100%',
                height: '140px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: '10px',
                padding: '12px',
                outline: 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                resize: 'vertical'
              }}
            />
          </div>

          {/* Raw Notes Input */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Status Activities</h3>

              <button
                onClick={handleImportActivities}
                disabled={loadingImport}
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <RefreshCw size={12} className={loadingImport ? 'spinner' : ''} />
                Auto-Import
              </button>
            </div>

            <textarea
              value={rawNotes}
              onChange={(e) => setRawNotes(e.target.value)}
              placeholder="Paste raw notes or click auto-import to gather timesheets, task progress, and goals..."
              style={{
                width: '100%',
                height: '180px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                borderRadius: '10px',
                padding: '12px',
                outline: 'none',
                fontSize: '0.85rem',
                lineHeight: '1.5',
                resize: 'vertical'
              }}
            />

            <button
              onClick={handleGenerateReport}
              disabled={loading || !rawNotes.trim()}
              className="glow-btn"
              style={{ justifyContent: 'center' }}
            >
              {loading ? (
                <>
                  <div className="spinner" style={{ width: '14px', height: '14px', marginRight: '6px' }}></div>
                  AI Refinement active...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Compile Status with AI
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Preview Panel */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', minHeight: '520px' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Generated Report</h3>

            {report && (
              <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-tertiary)', padding: '2px', borderRadius: '8px' }}>
                <button
                  onClick={() => setViewMode('preview')}
                  style={{
                    background: viewMode === 'preview' ? 'var(--bg-primary)' : 'transparent',
                    border: 'none',
                    color: viewMode === 'preview' ? 'var(--accent-purple)' : 'var(--text-secondary)',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: '600'
                  }}
                >
                  <Eye size={12} style={{ marginRight: '4px', display: 'inline' }} />
                  Preview
                </button>
                <button
                  onClick={() => setViewMode('source')}
                  style={{
                    background: viewMode === 'source' ? 'var(--bg-primary)' : 'transparent',
                    border: 'none',
                    color: viewMode === 'source' ? 'var(--accent-purple)' : 'var(--text-secondary)',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: '600'
                  }}
                >
                  <Edit3 size={12} style={{ marginRight: '4px', display: 'inline' }} />
                  Markdown
                </button>
              </div>
            )}
          </div>

          <div style={{
            flexGrow: 1,
            background: 'var(--bg-tertiary)',
            padding: '24px',
            borderRadius: '16px',
            overflowY: 'auto',
            marginBottom: '16px'
          }}>
            {!report ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--text-muted)',
                textAlign: 'center',
                minHeight: '260px'
              }}>
                <FileText size={48} style={{ opacity: 0.5, marginBottom: '12px' }} />
                <h4>No Report Generated</h4>
                <p style={{ fontSize: '0.8rem', maxWidth: '300px', marginTop: '6px' }}>
                  Write status logs and click "Compile Status" to preview the refined developer standup.
                </p>
              </div>
            ) : viewMode === 'preview' ? (
              <div
                className="markdown-body"
                dangerouslySetInnerHTML={{ __html: marked(report) }}
              />
            ) : (
              <textarea
                value={report}
                onChange={(e) => setReport(e.target.value)}
                style={{
                  width: '100%',
                  height: '100%',
                  minHeight: '260px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                  outline: 'none',
                  resize: 'none',
                  lineHeight: '1.5'
                }}
              />
            )}
          </div>

          {report && (
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCopyReport}
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Copy size={16} />
                Copy Output
              </button>

              <button
                onClick={handleExportMarkdown}
                className="glow-btn"
              >
                <Download size={16} />
                Export Markdown
              </button>
            </div>
          )}
        </div>
      </div>

      {/* New Template Modal */}
      {modalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div className="glass-panel" style={{ padding: '24px', width: '450px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Create Custom Template</h3>

            <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Template Name</label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    outline: 'none'
                  }}
                  placeholder="e.g. Weekly Executive Board Report"
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Template Structure</label>
                <textarea
                  value={newTemplateBody}
                  onChange={(e) => setNewTemplateBody(e.target.value)}
                  style={{
                    height: '180px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    outline: 'none',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8rem'
                  }}
                  placeholder="Use tags like {DATE}, {TASKS_COMPLETED}, {TASKS_IN_PROGRESS} in your template..."
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="glow-btn"
                  style={{ padding: '8px 16px' }}
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Status;
