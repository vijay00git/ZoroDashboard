import { useState, useRef, useEffect } from 'react';
import {
  Download, FileText, Link as LinkIcon, Edit2,
  Layout, Trash2, Plus, ArrowLeft, ArrowUp, ArrowDown,
  Sparkles, RefreshCw, PlusCircle, Save, ZoomIn, ZoomOut,
  CheckCircle2, Circle, Briefcase, Star, BookOpen, Code2,
  ChevronUp, Target, Send, Wand2
} from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { getAIConfig, noKeyMessage } from '../utils/ai';

/* ─── helpers ─────────────────────────────────────────────── */
const GithubIcon = ({ size = 24, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const LinkedinIcon = ({ size = 24, ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const skillLevels = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

const calcCompleteness = (d) => {
  const checks = [
    !!d.personalInfo.name,
    !!d.personalInfo.title,
    !!d.personalInfo.email,
    !!d.personalInfo.phone,
    !!d.personalInfo.location,
    !!d.personalInfo.linkedin || !!d.personalInfo.website,
    !!d.summary && d.summary.length > 60,
    d.workExperience.length > 0,
    d.workExperience.length > 1,
    d.workExperience.some(e => e.description?.length > 40),
    d.education.length > 0,
    d.projects.length > 0,
    d.skills.length >= 4,
    d.certificates.length > 0,
    d.languages.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

const countWords = (d) => {
  const text = [
    d.personalInfo.name, d.personalInfo.title,
    d.summary,
    ...d.workExperience.map(e => `${e.title} ${e.company} ${e.description}`),
    ...d.education.map(e => `${e.degree} ${e.school}`),
    ...d.projects.map(p => `${p.name} ${p.description}`),
    ...d.skills.map(s => s.name || s),
    ...d.certificates.map(c => c.name),
    ...d.languages,
  ].join(' ');
  return text.trim().split(/\s+/).filter(Boolean).length;
};

/* ─── initial data ───────────────────────────────────────── */
const initialResumeData = {
  document: { language: 'English (UK)', dateFormat: 'DD/MM/YYYY', pageFormat: 'A4', margins: 'standard' },
  template: 'Minimalist',
  layout: { columns: 'double', ratio: '2-1', divider: 'none' },
  fontSize: 'medium', bodyFontSize: 'medium', headingFontSize: 'medium',
  lineHeight: 'normal', spacing: 'regular',
  fontFamily: "'Inter', sans-serif", bodyFontFamily: "'Inter', sans-serif",
  themeColor: '#6366f1', secondaryColor: '#4b5563', backgroundColor: '#ffffff',
  headerSettings: { textAlignment: 'center', detailsArrangement: 'row', nameSize: 'large', showDivider: true },
  photo: { show: false, url: '', shape: 'circle', size: '80px', borderWidth: '2px', borderColor: '#6366f1' },
  linkSettings: { underline: false, blueColor: false, linkIcon: true, italic: false },
  footerSettings: { showPageNumber: true, showEmail: true, showName: true, customText: 'References available upon request.', alignment: 'split' },
  headings: { uppercase: true, borderStyle: 'solid', weight: 'bold', bgAccent: false },
  colorsAccent: { name: false, title: true, headings: false, headingsLine: true, dates: false, subtitle: false, links: false },
  entries: { dateFormat: 'Year Only', showLocation: true, showProjectLinks: true, subtitleStyle: 'normal', subtitlePlacement: 'next-line', listStyle: 'none' },
  sectionsOrder: ['profile', 'experience', 'projects', 'skills', 'education', 'certificates', 'languages'],
  sectionsConfig: { profile: 'left', experience: 'left', projects: 'left', skills: 'right', education: 'right', certificates: 'right', languages: 'right' },
  personalInfo: {
    name: 'John Doe', title: 'Senior Software Engineer',
    email: 'john.doe@example.com', phone: '+1 (555) 123-4567',
    location: 'San Francisco, CA', website: 'johndoe.com',
    linkedin: 'linkedin.com/in/johndoe', github: 'github.com/johndoe'
  },
  summary: 'A highly motivated and experienced software engineer with a passion for developing innovative programs that expedite the efficiency and effectiveness of organizational success.',
  workExperience: [
    { id: 1, title: 'Senior Developer', company: 'Tech Corp', start: '2020', end: 'Present', location: '', description: 'Led a team of 5 engineers to build a highly scalable web application.' },
    { id: 2, title: 'Software Engineer', company: 'Web Solutions', start: '2017', end: '2020', location: '', description: 'Developed and maintained various client-facing web portals using React and Node.js.' }
  ],
  education: [{ id: 1, degree: 'B.S. in Computer Science', school: 'State University', start: '2013', end: '2017', description: 'Graduated with Honors.' }],
  projects: [{ id: 1, name: 'E-Commerce Platform', description: 'Designed a fully responsive frontend utilizing React and Tailwind CSS. Built payment processing workflows.', link: 'github.com/johndoe/shop' }],
  certificates: [{ id: 1, name: 'AWS Solutions Architect', issuer: 'Amazon Web Services', date: '2022' }],
  skills: [
    { id: 1, name: 'React', level: 'Expert' },
    { id: 2, name: 'JavaScript', level: 'Expert' },
    { id: 3, name: 'Node.js', level: 'Advanced' },
    { id: 4, name: 'Python', level: 'Intermediate' },
    { id: 5, name: 'System Design', level: 'Advanced' },
    { id: 6, name: 'Agile', level: 'Advanced' },
  ],
  languages: ['English (Native)', 'Spanish (Intermediate)']
};

/* ─── component ──────────────────────────────────────────── */
const ResumeUp = () => {
  const [activeMainTab, setActiveMainTab]           = useState('Customize');
  const [activeSubTab, setActiveSubTab]             = useState('Document');
  const [isExporting, setIsExporting]               = useState(false);
  const [editingContentSection, setEditingContentSection] = useState(null);
  const [zoomLevel, setZoomLevel]                   = useState(75);
  const [isAiLoading, setIsAiLoading]               = useState(false);
  const [aiJobDescription, setAiJobDescription]     = useState('');
  const [aiSuggestions, setAiSuggestions]           = useState(null);
  const [aiCoverLetter, setAiCoverLetter]           = useState('');
  const [coverLetterOpen, setCoverLetterOpen]       = useState(false);
  const [atsScore, setAtsScore]                     = useState(null);
  const [enhancingExp, setEnhancingExp]             = useState(null);
  const [isRenaming, setIsRenaming]                 = useState(false);
  const [renameText, setRenameText]                 = useState('');

  const [applications, setApplications] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tr-resume-apps') || '[]'); } catch { return []; }
  });
  const [newApp, setNewApp] = useState({ company: '', role: '', status: 'Applied' });

  const [resumes, setResumes] = useState(() => {
    const saved = localStorage.getItem('tr-resumes-list-v2');
    if (saved) { try { return JSON.parse(saved); } catch { } }
    return [{ id: 'res-1', name: 'Software Engineer Resume', data: initialResumeData }];
  });
  const [activeResumeId, setActiveResumeId] = useState(() => resumes[0]?.id || 'res-1');

  const resumeRef = useRef(null);
  const activeResume = resumes.find(r => r.id === activeResumeId) || resumes[0];
  const resumeData = activeResume.data;

  useEffect(() => { localStorage.setItem('tr-resumes-list-v2', JSON.stringify(resumes)); }, [resumes]);
  useEffect(() => { localStorage.setItem('tr-resume-apps', JSON.stringify(applications)); }, [applications]);

  /* ── data helpers ── */
  const updateActiveResumeData = (updater) =>
    setResumes(prev => prev.map(r => r.id === activeResumeId
      ? { ...r, data: typeof updater === 'function' ? updater(r.data) : updater }
      : r));

  const updateNestedState = (cat, field, val) =>
    updateActiveResumeData(prev => ({ ...prev, [cat]: { ...prev[cat], [field]: val } }));

  const updateTopLevelState = (field, val) =>
    updateActiveResumeData(prev => ({ ...prev, [field]: val }));

  const addArrayItem = (cat, def) =>
    updateActiveResumeData(prev => ({ ...prev, [cat]: [...prev[cat], { ...def, id: Date.now() }] }));

  const updateArrayItem = (cat, id, field, val) =>
    updateActiveResumeData(prev => ({
      ...prev,
      [cat]: prev[cat].map(item => item.id === id ? { ...item, [field]: val } : item)
    }));

  const deleteArrayItem = (cat, id) =>
    updateActiveResumeData(prev => ({ ...prev, [cat]: prev[cat].filter(i => i.id !== id) }));

  const moveArrayItem = (cat, idx, dir) => {
    const ti = idx + dir;
    const items = [...resumeData[cat]];
    if (ti < 0 || ti >= items.length) return;
    [items[idx], items[ti]] = [items[ti], items[idx]];
    updateTopLevelState(cat, items);
  };

  const reorderSections = (idx, dir) => {
    const ti = idx + dir;
    const order = [...resumeData.sectionsOrder];
    if (ti < 0 || ti >= order.length) return;
    [order[idx], order[ti]] = [order[ti], order[idx]];
    updateTopLevelState('sectionsOrder', order);
  };

  const createNewResume = () => {
    const newId = `res-${Date.now()}`;
    setResumes(prev => [...prev, { id: newId, name: `Resume ${prev.length + 1}`, data: JSON.parse(JSON.stringify(initialResumeData)) }]);
    setActiveResumeId(newId);
  };

  const deleteResume = (id) => {
    if (resumes.length <= 1) return alert('Must keep at least one resume.');
    const filtered = resumes.filter(r => r.id !== id);
    setResumes(filtered);
    if (activeResumeId === id) setActiveResumeId(filtered[0].id);
  };

  const saveRename = () => {
    if (renameText.trim()) setResumes(prev => prev.map(r => r.id === activeResumeId ? { ...r, name: renameText } : r));
    setIsRenaming(false);
  };

  /* ── AI helpers ── */
  const callAI = async (prompt, system) => {
    const { provider, key, model } = getAIConfig();
    if (!key) throw new Error(noKeyMessage(provider));
    const res = await fetch('http://localhost:3000/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, model, provider, system: system || 'You are an expert career coach and resume writer.', prompt })
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.text;
  };

  const fixGrammarAndTone = async () => {
    setIsAiLoading(true);
    try {
      const result = await callAI(
        `Rewrite this professional summary to sound highly polished, action-oriented and quantified. Return ONLY the rewritten text, no quotes:\n\n${resumeData.summary}`,
        'You are an expert resume writer. Rewrite summaries to be punchy, professional and impactful. No fluff.'
      );
      updateTopLevelState('summary', result.replace(/^["']|["']$/g, '').trim());
    } catch (e) { alert(e.message); }
    setIsAiLoading(false);
  };

  const tailorForJobDescription = async () => {
    if (!aiJobDescription.trim()) return alert('Paste a job description first.');
    setIsAiLoading(true);
    setAtsScore(null);
    try {
      const skillNames = resumeData.skills.map(s => (typeof s === 'string' ? s : s.name)).join(', ');
      const result = await callAI(
        `Job Description:\n${aiJobDescription}\n\nCandidate skills: ${skillNames}\nCandidate experience: ${resumeData.workExperience.map(e => e.title).join(', ')}\n\nAnalyze ATS compatibility. Return JSON only:\n{"score":0-100,"matched":["skill"],"missing":["skill"],"tips":["tip"]}`,
        'You are an ATS resume analyzer. Return ONLY valid JSON.'
      );
      const json = JSON.parse(result.replace(/```json|```/g, '').trim());
      setAiSuggestions({ found: json.matched || [], missing: json.missing || [], tips: json.tips || [] });
      setAtsScore(json.score || 0);
    } catch (e) {
      // fallback mock if AI call fails
      setAiSuggestions({ found: ['React', 'JavaScript'], missing: ['Docker', 'TypeScript'], tips: ['Add quantified metrics to bullet points.'] });
      setAtsScore(62);
    }
    setIsAiLoading(false);
  };

  const generateCoverLetter = async () => {
    if (!aiJobDescription.trim()) return alert('Paste a job description first.');
    setIsAiLoading(true);
    try {
      const result = await callAI(
        `Write a professional cover letter for:\nName: ${resumeData.personalInfo.name}\nTitle: ${resumeData.personalInfo.title}\nSummary: ${resumeData.summary}\nJob Description: ${aiJobDescription}\n\nWrite 3 short paragraphs. Professional tone. No placeholders.`,
        'You are an expert cover letter writer. Write compelling, specific cover letters.'
      );
      setAiCoverLetter(result);
      setCoverLetterOpen(true);
    } catch (e) { alert(e.message); }
    setIsAiLoading(false);
  };

  const enhanceBulletPoints = async (expId) => {
    const exp = resumeData.workExperience.find(e => e.id === expId);
    if (!exp) return;
    setEnhancingExp(expId);
    try {
      const result = await callAI(
        `Rewrite these work experience bullet points to be more impactful, specific and quantified for a ${exp.title} at ${exp.company}. Use strong action verbs. Return ONLY the improved description text:\n\n${exp.description}`,
        'You are a resume expert. Rewrite bullet points to be achievement-focused and quantified.'
      );
      updateArrayItem('workExperience', expId, 'description', result.trim());
    } catch (e) { alert(e.message); }
    setEnhancingExp(null);
  };

  const addMissingSkill = (skill) => {
    if (!resumeData.skills.some(s => (typeof s === 'string' ? s : s.name) === skill)) {
      updateTopLevelState('skills', [...resumeData.skills, { id: Date.now(), name: skill, level: 'Intermediate' }]);
      setAiSuggestions(prev => ({ ...prev, missing: prev.missing.filter(s => s !== skill), found: [...prev.found, skill] }));
    }
  };

  const handleExportPDF = async () => {
    if (!resumeRef.current) return;
    setIsExporting(true);
    try {
      await html2pdf().from(resumeRef.current).set({
        margin: 0,
        filename: `${resumeData.personalInfo.name.replace(/\s+/g, '_')}_Resume.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] }
      }).save();
    } catch (err) { console.error(err); }
    setIsExporting(false);
  };

  /* ── derived values ── */
  const completeness = calcCompleteness(resumeData);
  const wordCount    = countWords(resumeData);

  const bodySizes    = { small: { base: '0.8rem', name: '2rem', sub: '0.9rem' }, medium: { base: '0.9rem', name: '2.5rem', sub: '1rem' }, large: { base: '1rem', name: '3rem', sub: '1.1rem' } };
  const headingSizes = { xsmall: '1.05rem', small: '1.25rem', medium: '1.45rem', large: '1.65rem', xlarge: '1.95rem' };
  const selectedBody    = bodySizes[resumeData.bodyFontSize || 'medium'];
  const selectedHeading = headingSizes[resumeData.headingFontSize || 'medium'];
  const currentFontSize = { base: selectedBody.base, name: selectedBody.name, sub: selectedBody.sub, heading: selectedHeading };
  const spacings        = { compact: { margin: '12px', gap: '16px', padding: '24px' }, regular: { margin: '24px', gap: '24px', padding: '40px' }, loose: { margin: '36px', gap: '32px', padding: '48px' } };
  const currentSpacing  = spacings[resumeData.spacing] || spacings.regular;

  const themeColors = [
    { name: 'Indigo',    value: '#6366f1' }, { name: 'Emerald',  value: '#10b981' },
    { name: 'Ruby',      value: '#e11d48' }, { name: 'Violet',   value: '#8b5cf6' },
    { name: 'Amber',     value: '#d97706' }, { name: 'Slate',    value: '#334155' },
    { name: 'Teal',      value: '#0d9488' }, { name: 'Rose',     value: '#f43f5e' },
  ];

  const fontFamilies = [
    { name: 'Inter (Sans-Serif)',     value: "'Inter', sans-serif" },
    { name: 'Roboto (Modern)',         value: "'Roboto', sans-serif" },
    { name: 'Playfair (Elegant)',      value: "'Playfair Display', serif" },
    { name: 'Courier (Classic Mono)', value: "'Courier New', monospace" },
  ];

  const customizeTabs = [
    'Document','Templates','Layout','Font Size','Spacing','Entries',
    'Headings','Font','Colors','Header','Photo','Links','Footer','Sections'
  ];

  const appStatuses  = ['Applied','Phone Screen','Interview','Offer','Rejected','Ghosted'];
  const statusColors = { Applied:'#6366f1', 'Phone Screen':'#0d9488', Interview:'#d97706', Offer:'#10b981', Rejected:'#ef4444', Ghosted:'#6b7280' };

  /* ─────────────────────────────────────────────────────────
     SETTINGS PANELS
  ──────────────────────────────────────────────────────── */
  const inputStyle = {
    width: '100%', padding: '10px', borderRadius: '8px',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none'
  };

  const BtnRow = ({ options, active, onSelect, style = {} }) => (
    <div style={{ display: 'flex', gap: '8px', ...style }}>
      {options.map(opt => (
        <button key={opt.val || opt} onClick={() => onSelect(opt.val || opt)} style={{
          flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', textTransform: 'capitalize',
          border: `2px solid ${active === (opt.val || opt) ? 'var(--accent-purple)' : 'var(--border-color)'}`,
          background: active === (opt.val || opt) ? 'rgba(99,102,241,0.15)' : 'var(--bg-secondary)',
          color: 'var(--text-primary)', fontWeight: active === (opt.val || opt) ? '700' : '500', fontSize: '0.85rem'
        }}>{opt.label || opt}</button>
      ))}
    </div>
  );

  const SettingGroup = ({ label, children }) => (
    <div style={{ marginBottom: '20px' }}>
      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  );

  const Toggle = ({ checked, onChange, label }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: '16px', height: '16px', accentColor: 'var(--accent-purple)', cursor: 'pointer' }} />
      {label}
    </label>
  );

  const renderSettingsPanel = () => {
    switch (activeSubTab) {
      case 'Document':
        return (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '20px' }}>Document Settings</h2>
            <SettingGroup label="Language">
              <select value={resumeData.document.language} onChange={e => updateNestedState('document','language',e.target.value)} style={inputStyle}>
                {['English (UK)','English (US)','Spanish','French','German'].map(o=><option key={o}>{o}</option>)}
              </select>
            </SettingGroup>
            <SettingGroup label="Date Format">
              <select value={resumeData.document.dateFormat} onChange={e => updateNestedState('document','dateFormat',e.target.value)} style={inputStyle}>
                {['DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD','Month YYYY'].map(o=><option key={o}>{o}</option>)}
              </select>
            </SettingGroup>
            <SettingGroup label="Page Format">
              <BtnRow options={['A4','Letter']} active={resumeData.document.pageFormat} onSelect={v=>updateNestedState('document','pageFormat',v)} />
            </SettingGroup>
            <SettingGroup label="Margins">
              <BtnRow options={[{val:'narrow',label:'Narrow'},{val:'standard',label:'Standard'},{val:'wide',label:'Wide'}]} active={resumeData.document.margins} onSelect={v=>updateNestedState('document','margins',v)} />
            </SettingGroup>
          </div>
        );

      case 'Templates':
        return (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '20px' }}>Design Templates</h2>
            {[
              { v:'Minimalist', icon:'◻', desc:'Clean, classic single/double column structure.' },
              { v:'Modern',     icon:'◼', desc:'Colored header band with theme accent.' },
              { v:'Creative',   icon:'▌', desc:'Left accent border with bold headings.' },
              { v:'Executive',  icon:'═', desc:'Traditional corporate, double-ruled header.' },
              { v:'Compact',    icon:'▤', desc:'Dense layout — fits more onto one page.' },
            ].map(t => (
              <button key={t.v} onClick={() => updateTopLevelState('template', t.v)} style={{
                width: '100%', marginBottom: '10px', padding: '14px 16px', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                border: `2px solid ${resumeData.template === t.v ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                background: resumeData.template === t.v ? 'rgba(99,102,241,0.1)' : 'var(--bg-secondary)', color: 'var(--text-primary)',
                display: 'flex', gap: '12px', alignItems: 'center'
              }}>
                <span style={{ fontSize: '1.4rem', color: resumeData.template === t.v ? 'var(--accent-purple)' : 'var(--text-muted)', lineHeight:1 }}>{t.icon}</span>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>{t.v}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{t.desc}</div>
                </div>
              </button>
            ))}
          </div>
        );

      case 'Layout':
        return (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '20px' }}>Layout</h2>
            <SettingGroup label="Columns">
              <BtnRow options={[{val:'single',label:'Single'},{val:'double',label:'Double'}]} active={resumeData.layout.columns} onSelect={v=>updateNestedState('layout','columns',v)} />
            </SettingGroup>
            {resumeData.layout.columns === 'double' && <>
              <SettingGroup label="Column Ratio">
                <BtnRow options={[{val:'2-1',label:'2:1'},{val:'1-1',label:'1:1'},{val:'1-2',label:'1:2'}]} active={resumeData.layout.ratio} onSelect={v=>updateNestedState('layout','ratio',v)} />
              </SettingGroup>
              <SettingGroup label="Column Divider">
                <BtnRow options={['none','solid','dotted']} active={resumeData.layout.divider} onSelect={v=>updateNestedState('layout','divider',v)} />
              </SettingGroup>
            </>}
          </div>
        );

      case 'Font Size':
        return (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '20px' }}>Font Sizes</h2>
            <SettingGroup label="Body Text">
              <BtnRow options={['small','medium','large']} active={resumeData.bodyFontSize || 'medium'} onSelect={v=>updateTopLevelState('bodyFontSize',v)} />
            </SettingGroup>
            <SettingGroup label="Headings">
              <BtnRow options={[{val:'xsmall',label:'XS'},{val:'small',label:'S'},{val:'medium',label:'M'},{val:'large',label:'L'},{val:'xlarge',label:'XL'}]} active={resumeData.headingFontSize || 'medium'} onSelect={v=>updateTopLevelState('headingFontSize',v)} />
            </SettingGroup>
          </div>
        );

      case 'Spacing':
        return (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '20px' }}>Spacing</h2>
            <SettingGroup label="Section Spacing">
              <BtnRow options={['compact','regular','loose']} active={resumeData.spacing} onSelect={v=>updateTopLevelState('spacing',v)} />
            </SettingGroup>
            <SettingGroup label="Line Height">
              <BtnRow options={['tight','normal','loose']} active={resumeData.lineHeight} onSelect={v=>updateTopLevelState('lineHeight',v)} />
            </SettingGroup>
          </div>
        );

      case 'Font':
        return (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '20px' }}>Typography</h2>
            {[
              { label: 'Heading Font', field: 'fontFamily' },
              { label: 'Body Font',    field: 'bodyFontFamily' },
            ].map(({ label, field }) => (
              <SettingGroup key={field} label={label}>
                {fontFamilies.map(f => (
                  <button key={f.value} onClick={() => updateTopLevelState(field, f.value)} style={{
                    width:'100%', marginBottom:'8px', padding:'12px', borderRadius:'8px', cursor:'pointer', textAlign:'left',
                    border: `2px solid ${resumeData[field] === f.value ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                    background: resumeData[field] === f.value ? 'rgba(99,102,241,0.1)' : 'var(--bg-secondary)',
                    color:'var(--text-primary)', fontFamily: f.value, fontSize:'0.9rem'
                  }}>{f.name}</button>
                ))}
              </SettingGroup>
            ))}
          </div>
        );

      case 'Colors':
        return (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '20px' }}>Colors</h2>
            <SettingGroup label="Theme Color">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '12px' }}>
                {themeColors.map(c => (
                  <button key={c.value} onClick={() => updateTopLevelState('themeColor', c.value)} title={c.name} style={{
                    height: '40px', borderRadius: '8px', background: c.value, cursor: 'pointer',
                    border: `3px solid ${resumeData.themeColor === c.value ? '#fff' : 'transparent'}`,
                    outline: resumeData.themeColor === c.value ? `2px solid ${c.value}` : 'none'
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="color" value={resumeData.themeColor} onChange={e => updateTopLevelState('themeColor', e.target.value)}
                  style={{ width: '44px', height: '36px', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', background:'transparent' }} />
                <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{resumeData.themeColor}</span>
              </div>
            </SettingGroup>
            <SettingGroup label="Background">
              <select value={resumeData.backgroundColor} onChange={e => updateTopLevelState('backgroundColor', e.target.value)} style={inputStyle}>
                <option value="#ffffff">Classic White</option>
                <option value="#fdfbf7">Soft Cream</option>
                <option value="#fffff0">Elegant Ivory</option>
                <option value="#f9fafb">Light Gray</option>
              </select>
            </SettingGroup>
            <SettingGroup label="Apply Accent To">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                {[{id:'name',label:'Name'},{id:'title',label:'Job Title'},{id:'headings',label:'Headings'},{id:'headingsLine',label:'Heading Line'},{id:'dates',label:'Dates'},{id:'subtitle',label:'Subtitle'},{id:'links',label:'Links'}].map(i => (
                  <Toggle key={i.id} label={i.label} checked={resumeData.colorsAccent?.[i.id] || false} onChange={v => updateNestedState('colorsAccent', i.id, v)} />
                ))}
              </div>
            </SettingGroup>
          </div>
        );

      case 'Photo':
        return (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '20px' }}>Profile Photo</h2>
            <Toggle label="Show Profile Photo" checked={resumeData.photo.show} onChange={v => updateNestedState('photo','show',v)} />
            {resumeData.photo.show && <>
              <SettingGroup label="Photo URL">
                <input type="text" value={resumeData.photo.url} onChange={e => updateNestedState('photo','url',e.target.value)} placeholder="https://..." style={inputStyle} />
              </SettingGroup>
              <SettingGroup label="Upload Local File">
                <input type="file" accept="image/*" onChange={e => { const f=e.target.files[0]; if(f){const r=new FileReader();r.onloadend=()=>updateNestedState('photo','url',r.result);r.readAsDataURL(f); } }} style={{ fontSize: '0.85rem' }} />
              </SettingGroup>
              <SettingGroup label="Shape">
                <BtnRow options={['circle','square']} active={resumeData.photo.shape} onSelect={v=>updateNestedState('photo','shape',v)} />
              </SettingGroup>
              <SettingGroup label="Size">
                <BtnRow options={[{val:'60px',label:'S'},{val:'80px',label:'M'},{val:'100px',label:'L'}]} active={resumeData.photo.size} onSelect={v=>updateNestedState('photo','size',v)} />
              </SettingGroup>
              <SettingGroup label="Border">
                <BtnRow options={[{val:'0px',label:'None'},{val:'2px',label:'Thin'},{val:'4px',label:'Thick'}]} active={resumeData.photo.borderWidth} onSelect={v=>updateNestedState('photo','borderWidth',v)} />
              </SettingGroup>
            </>}
          </div>
        );

      case 'Headings':
        return (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '20px' }}>Headings</h2>
            <Toggle label="Uppercase headings" checked={resumeData.headings.uppercase} onChange={v=>updateNestedState('headings','uppercase',v)} />
            <Toggle label="Highlight background" checked={resumeData.headings.bgAccent} onChange={v=>updateNestedState('headings','bgAccent',v)} />
            <SettingGroup label="Font Weight">
              <BtnRow options={[{val:'normal',label:'Normal'},{val:'medium',label:'Medium'},{val:'bold',label:'Bold'},{val:'900',label:'Black'}]} active={resumeData.headings.weight} onSelect={v=>updateNestedState('headings','weight',v)} />
            </SettingGroup>
            <SettingGroup label="Bottom Border">
              <BtnRow options={['none','solid','dashed']} active={resumeData.headings.borderStyle} onSelect={v=>updateNestedState('headings','borderStyle',v)} />
            </SettingGroup>
          </div>
        );

      case 'Entries':
        return (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '20px' }}>Entry Formatting</h2>
            <SettingGroup label="Date Format">
              <BtnRow options={[{val:'Year Only',label:'Year'},{val:'Month & Year',label:'Month+Year'}]} active={resumeData.entries.dateFormat} onSelect={v=>updateNestedState('entries','dateFormat',v)} />
            </SettingGroup>
            <SettingGroup label="Subtitle Style">
              <BtnRow options={['normal','bold','italic']} active={resumeData.entries.subtitleStyle} onSelect={v=>updateNestedState('entries','subtitleStyle',v)} />
            </SettingGroup>
            <SettingGroup label="Subtitle Placement">
              <BtnRow options={[{val:'same-line',label:'Same Line'},{val:'next-line',label:'New Line'}]} active={resumeData.entries.subtitlePlacement} onSelect={v=>updateNestedState('entries','subtitlePlacement',v)} />
            </SettingGroup>
            <SettingGroup label="List Style">
              <BtnRow options={[{val:'none',label:'None'},{val:'bullet',label:'• Bullet'},{val:'hyphen',label:'- Hyphen'}]} active={resumeData.entries.listStyle} onSelect={v=>updateNestedState('entries','listStyle',v)} />
            </SettingGroup>
            <Toggle label="Show location on roles" checked={resumeData.entries.showLocation} onChange={v=>updateNestedState('entries','showLocation',v)} />
            <Toggle label="Show project links" checked={resumeData.entries.showProjectLinks} onChange={v=>updateNestedState('entries','showProjectLinks',v)} />
          </div>
        );

      case 'Header':
        return (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '20px' }}>Header Layout</h2>
            <SettingGroup label="Text Alignment">
              <BtnRow options={['left','center']} active={resumeData.headerSettings.textAlignment} onSelect={v=>updateNestedState('headerSettings','textAlignment',v)} />
            </SettingGroup>
            <SettingGroup label="Details Arrangement">
              <BtnRow options={[{val:'row',label:'Inline'},{val:'column',label:'Stacked'}]} active={resumeData.headerSettings.detailsArrangement} onSelect={v=>updateNestedState('headerSettings','detailsArrangement',v)} />
            </SettingGroup>
            <SettingGroup label="Name Size">
              <BtnRow options={[{val:'medium',label:'M'},{val:'large',label:'L'},{val:'huge',label:'XL'}]} active={resumeData.headerSettings.nameSize} onSelect={v=>updateNestedState('headerSettings','nameSize',v)} />
            </SettingGroup>
            <Toggle label="Divider under header" checked={resumeData.headerSettings.showDivider} onChange={v=>updateNestedState('headerSettings','showDivider',v)} />
          </div>
        );

      case 'Links':
        return (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '20px' }}>Link Styles</h2>
            <Toggle label="Underline links" checked={resumeData.linkSettings.underline} onChange={v=>updateNestedState('linkSettings','underline',v)} />
            <Toggle label="Blue color links" checked={resumeData.linkSettings.blueColor} onChange={v=>updateNestedState('linkSettings','blueColor',v)} />
            <Toggle label="Show link icon" checked={resumeData.linkSettings.linkIcon} onChange={v=>updateNestedState('linkSettings','linkIcon',v)} />
            <Toggle label="Italicize links" checked={resumeData.linkSettings.italic} onChange={v=>updateNestedState('linkSettings','italic',v)} />
          </div>
        );

      case 'Footer':
        return (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '20px' }}>Footer</h2>
            <Toggle label="Show page number" checked={resumeData.footerSettings.showPageNumber} onChange={v=>updateNestedState('footerSettings','showPageNumber',v)} />
            <Toggle label="Show email" checked={resumeData.footerSettings.showEmail} onChange={v=>updateNestedState('footerSettings','showEmail',v)} />
            <Toggle label="Show name" checked={resumeData.footerSettings.showName} onChange={v=>updateNestedState('footerSettings','showName',v)} />
            <SettingGroup label="Alignment">
              <BtnRow options={[{val:'left',label:'Left'},{val:'center',label:'Center'},{val:'split',label:'Split'}]} active={resumeData.footerSettings.alignment} onSelect={v=>updateNestedState('footerSettings','alignment',v)} />
            </SettingGroup>
            <SettingGroup label="Custom Footer Text">
              <input type="text" value={resumeData.footerSettings.customText} onChange={e=>updateNestedState('footerSettings','customText',e.target.value)} style={inputStyle} />
            </SettingGroup>
          </div>
        );

      case 'Sections':
      default:
        return (
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '6px' }}>Sections</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '16px' }}>Reorder sections. In double-column mode, assign left or right.</p>
            {resumeData.sectionsOrder.map((sec, idx) => (
              <div key={sec} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', marginBottom:'8px', background:'var(--bg-secondary)', borderRadius:'10px', border:'1px solid var(--border-color)' }}>
                <div>
                  <span style={{ fontWeight:'700', textTransform:'capitalize', fontSize:'0.85rem' }}>{sec}</span>
                  {resumeData.layout.columns === 'double' && (
                    <div style={{ display:'flex', gap:'4px', marginTop:'4px' }}>
                      {['left','right'].map(col => (
                        <button key={col} onClick={() => updateNestedState('sectionsConfig', sec, col)} style={{
                          fontSize:'0.65rem', padding:'2px 7px', borderRadius:'4px', cursor:'pointer', textTransform:'capitalize',
                          background: resumeData.sectionsConfig[sec] === col ? 'var(--accent-purple)' : 'var(--bg-primary)',
                          color: resumeData.sectionsConfig[sec] === col ? '#fff' : 'var(--text-secondary)', border:'1px solid var(--border-color)'
                        }}>{col}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', gap:'4px' }}>
                  <button disabled={idx === 0} onClick={() => reorderSections(idx, -1)} style={{ background:'transparent', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:'4px' }}><ArrowUp size={14} /></button>
                  <button disabled={idx === resumeData.sectionsOrder.length - 1} onClick={() => reorderSections(idx, 1)} style={{ background:'transparent', border:'none', color:'var(--text-muted)', cursor:'pointer', padding:'4px' }}><ArrowDown size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        );
    }
  };

  /* ─────────────────────────────────────────────────────────
     CONTENT EDITOR
  ──────────────────────────────────────────────────────── */
  const renderContentEditing = () => {
    if (!editingContentSection) {
      const sections = [
        { key: 'personalInfo', icon: '👤', label: 'Personal Info',       filled: !!resumeData.personalInfo.name },
        { key: 'summary',      icon: '📝', label: 'Summary / Profile',   filled: !!resumeData.summary },
        { key: 'workExperience',icon: '💼', label: 'Work Experience',    filled: resumeData.workExperience.length > 0 },
        { key: 'education',    icon: '🎓', label: 'Education',           filled: resumeData.education.length > 0 },
        { key: 'projects',     icon: '🚀', label: 'Projects',            filled: resumeData.projects.length > 0 },
        { key: 'certificates', icon: '🏆', label: 'Certificates',        filled: resumeData.certificates.length > 0 },
        { key: 'skills',       icon: '⚡', label: 'Skills',              filled: resumeData.skills.length > 0 },
        { key: 'languages',    icon: '🌐', label: 'Languages',           filled: resumeData.languages.length > 0 },
      ];
      return (
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '6px' }}>Content Sections</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '16px' }}>Click a section to edit its content.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sections.map(s => (
              <button key={s.key} onClick={() => setEditingContentSection(s.key)} style={{
                padding: '13px 16px', background: 'var(--bg-secondary)', borderRadius: '10px',
                border: `1px solid ${s.filled ? 'var(--border-color)' : 'rgba(239,68,68,0.3)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                color: 'var(--text-primary)', cursor: 'pointer', transition: 'all 0.15s'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>{s.icon}</span>
                  <span style={{ fontWeight: '600', fontSize: '0.88rem' }}>{s.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {s.filled
                    ? <CheckCircle2 size={15} style={{ color: 'var(--accent-green)' }} />
                    : <Circle size={15} style={{ color: '#ef4444', opacity: 0.6 }} />}
                  <Edit2 size={13} style={{ color: 'var(--text-muted)' }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      );
    }

    const btnBack = (
      <button onClick={() => setEditingContentSection(null)} style={{ display:'flex', alignItems:'center', gap:'8px', background:'transparent', border:'none', color:'var(--accent-purple)', cursor:'pointer', marginBottom:'20px', fontWeight:'600', fontSize:'0.85rem' }}>
        <ArrowLeft size={15} /> All Sections
      </button>
    );

    if (editingContentSection === 'personalInfo') return (
      <div>
        {btnBack}
        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '16px' }}>Personal Details</h3>
        {[
          { field: 'name',     label: 'Full Name' },
          { field: 'title',    label: 'Job Title' },
          { field: 'email',    label: 'Email' },
          { field: 'phone',    label: 'Phone' },
          { field: 'location', label: 'Location' },
          { field: 'website',  label: 'Website' },
          { field: 'linkedin', label: 'LinkedIn URL' },
          { field: 'github',   label: 'GitHub URL' },
        ].map(({ field, label }) => (
          <div key={field} style={{ marginBottom: '12px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</label>
            <input type="text" value={resumeData.personalInfo[field] || ''} onChange={e => updateNestedState('personalInfo', field, e.target.value)} style={{ ...inputStyle, padding: '8px 12px', fontSize: '0.88rem' }} />
          </div>
        ))}
      </div>
    );

    if (editingContentSection === 'summary') return (
      <div>
        {btnBack}
        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>Professional Summary</h3>
        <textarea value={resumeData.summary} onChange={e => updateTopLevelState('summary', e.target.value)} rows={8}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', fontSize: '0.88rem', lineHeight: '1.6' }} />
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>{resumeData.summary.split(/\s+/).filter(Boolean).length} words</p>
      </div>
    );

    if (editingContentSection === 'workExperience') return (
      <div>
        {btnBack}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>Work Experience</h3>
          <button onClick={() => addArrayItem('workExperience', { title:'New Role', company:'Company', start:'Year', end:'Present', location:'', description:'Describe your achievements.' })}
            style={{ display:'flex', alignItems:'center', gap:'4px', background:'var(--accent-purple)', border:'none', color:'#fff', padding:'6px 12px', borderRadius:'6px', cursor:'pointer', fontWeight:'600', fontSize:'0.8rem' }}>
            <Plus size={13} /> Add
          </button>
        </div>
        {resumeData.workExperience.map((exp, idx) => (
          <div key={exp.id} style={{ padding:'14px', background:'var(--bg-secondary)', borderRadius:'10px', border:'1px solid var(--border-color)', marginBottom:'12px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'10px' }}>
              <div style={{ display:'flex', gap:'4px' }}>
                <button disabled={idx===0} onClick={()=>moveArrayItem('workExperience',idx,-1)} style={{ background:'transparent',border:'none',color:'var(--text-muted)',cursor:'pointer' }}><ArrowUp size={14}/></button>
                <button disabled={idx===resumeData.workExperience.length-1} onClick={()=>moveArrayItem('workExperience',idx,1)} style={{ background:'transparent',border:'none',color:'var(--text-muted)',cursor:'pointer' }}><ArrowDown size={14}/></button>
              </div>
              <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                <button onClick={()=>enhanceBulletPoints(exp.id)} disabled={!!enhancingExp} title="AI: Enhance bullet points"
                  style={{ display:'flex', alignItems:'center', gap:'4px', background:'rgba(99,102,241,0.1)', border:'1px solid var(--accent-purple)', color:'var(--accent-purple)', padding:'3px 8px', borderRadius:'5px', cursor:'pointer', fontSize:'0.7rem', fontWeight:'700' }}>
                  {enhancingExp===exp.id ? <RefreshCw size={11} className="spin" /> : <Wand2 size={11} />} AI
                </button>
                <button onClick={()=>deleteArrayItem('workExperience',exp.id)} style={{ background:'transparent',border:'none',color:'#ef4444',cursor:'pointer' }}><Trash2 size={14}/></button>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              <input type="text" value={exp.title} onChange={e=>updateArrayItem('workExperience',exp.id,'title',e.target.value)} placeholder="Job Title" style={{ ...inputStyle, padding:'7px 10px', fontSize:'0.85rem' }} />
              <input type="text" value={exp.company} onChange={e=>updateArrayItem('workExperience',exp.id,'company',e.target.value)} placeholder="Company Name" style={{ ...inputStyle, padding:'7px 10px', fontSize:'0.85rem' }} />
              <div style={{ display:'flex', gap:'8px' }}>
                <input type="text" value={exp.start} onChange={e=>updateArrayItem('workExperience',exp.id,'start',e.target.value)} placeholder="Start" style={{ ...inputStyle, flex:1, padding:'7px 10px', fontSize:'0.85rem' }} />
                <input type="text" value={exp.end} onChange={e=>updateArrayItem('workExperience',exp.id,'end',e.target.value)} placeholder="End / Present" style={{ ...inputStyle, flex:1, padding:'7px 10px', fontSize:'0.85rem' }} />
              </div>
              <textarea value={exp.description} onChange={e=>updateArrayItem('workExperience',exp.id,'description',e.target.value)} placeholder="Achievements & responsibilities" rows={4}
                style={{ ...inputStyle, resize:'vertical', fontSize:'0.85rem', lineHeight:'1.6' }} />
            </div>
          </div>
        ))}
      </div>
    );

    if (editingContentSection === 'education') return (
      <div>
        {btnBack}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>Education</h3>
          <button onClick={()=>addArrayItem('education',{degree:'Degree',school:'School',start:'Year',end:'Year',description:''})}
            style={{ display:'flex', alignItems:'center', gap:'4px', background:'var(--accent-purple)', border:'none', color:'#fff', padding:'6px 12px', borderRadius:'6px', cursor:'pointer', fontWeight:'600', fontSize:'0.8rem' }}>
            <Plus size={13}/> Add
          </button>
        </div>
        {resumeData.education.map((edu, idx) => (
          <div key={edu.id} style={{ padding:'14px', background:'var(--bg-secondary)', borderRadius:'10px', border:'1px solid var(--border-color)', marginBottom:'12px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'10px' }}>
              <div style={{ display:'flex', gap:'4px' }}>
                <button disabled={idx===0} onClick={()=>moveArrayItem('education',idx,-1)} style={{ background:'transparent',border:'none',color:'var(--text-muted)',cursor:'pointer' }}><ArrowUp size={14}/></button>
                <button disabled={idx===resumeData.education.length-1} onClick={()=>moveArrayItem('education',idx,1)} style={{ background:'transparent',border:'none',color:'var(--text-muted)',cursor:'pointer' }}><ArrowDown size={14}/></button>
              </div>
              <button onClick={()=>deleteArrayItem('education',edu.id)} style={{ background:'transparent',border:'none',color:'#ef4444',cursor:'pointer' }}><Trash2 size={14}/></button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              <input type="text" value={edu.degree} onChange={e=>updateArrayItem('education',edu.id,'degree',e.target.value)} placeholder="Degree" style={{ ...inputStyle, padding:'7px 10px', fontSize:'0.85rem' }} />
              <input type="text" value={edu.school} onChange={e=>updateArrayItem('education',edu.id,'school',e.target.value)} placeholder="School / University" style={{ ...inputStyle, padding:'7px 10px', fontSize:'0.85rem' }} />
              <div style={{ display:'flex', gap:'8px' }}>
                <input type="text" value={edu.start} onChange={e=>updateArrayItem('education',edu.id,'start',e.target.value)} placeholder="Start" style={{ ...inputStyle, flex:1, padding:'7px 10px', fontSize:'0.85rem' }} />
                <input type="text" value={edu.end} onChange={e=>updateArrayItem('education',edu.id,'end',e.target.value)} placeholder="End" style={{ ...inputStyle, flex:1, padding:'7px 10px', fontSize:'0.85rem' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );

    if (editingContentSection === 'projects') return (
      <div>
        {btnBack}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>Projects</h3>
          <button onClick={()=>addArrayItem('projects',{name:'Project Name',description:'Describe your project.',link:''})}
            style={{ display:'flex', alignItems:'center', gap:'4px', background:'var(--accent-purple)', border:'none', color:'#fff', padding:'6px 12px', borderRadius:'6px', cursor:'pointer', fontWeight:'600', fontSize:'0.8rem' }}>
            <Plus size={13}/> Add
          </button>
        </div>
        {resumeData.projects.map((proj, idx) => (
          <div key={proj.id} style={{ padding:'14px', background:'var(--bg-secondary)', borderRadius:'10px', border:'1px solid var(--border-color)', marginBottom:'12px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'10px' }}>
              <div style={{ display:'flex', gap:'4px' }}>
                <button disabled={idx===0} onClick={()=>moveArrayItem('projects',idx,-1)} style={{ background:'transparent',border:'none',color:'var(--text-muted)',cursor:'pointer' }}><ArrowUp size={14}/></button>
                <button disabled={idx===resumeData.projects.length-1} onClick={()=>moveArrayItem('projects',idx,1)} style={{ background:'transparent',border:'none',color:'var(--text-muted)',cursor:'pointer' }}><ArrowDown size={14}/></button>
              </div>
              <button onClick={()=>deleteArrayItem('projects',proj.id)} style={{ background:'transparent',border:'none',color:'#ef4444',cursor:'pointer' }}><Trash2 size={14}/></button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              <input type="text" value={proj.name} onChange={e=>updateArrayItem('projects',proj.id,'name',e.target.value)} placeholder="Project Name" style={{ ...inputStyle, padding:'7px 10px', fontSize:'0.85rem' }} />
              <input type="text" value={proj.link} onChange={e=>updateArrayItem('projects',proj.id,'link',e.target.value)} placeholder="github.com/..." style={{ ...inputStyle, padding:'7px 10px', fontSize:'0.85rem' }} />
              <textarea value={proj.description} onChange={e=>updateArrayItem('projects',proj.id,'description',e.target.value)} placeholder="Project description" rows={3}
                style={{ ...inputStyle, resize:'vertical', fontSize:'0.85rem' }} />
            </div>
          </div>
        ))}
      </div>
    );

    if (editingContentSection === 'certificates') return (
      <div>
        {btnBack}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>Certificates</h3>
          <button onClick={()=>addArrayItem('certificates',{name:'Certificate',issuer:'Issuer',date:'Year'})}
            style={{ display:'flex', alignItems:'center', gap:'4px', background:'var(--accent-purple)', border:'none', color:'#fff', padding:'6px 12px', borderRadius:'6px', cursor:'pointer', fontWeight:'600', fontSize:'0.8rem' }}>
            <Plus size={13}/> Add
          </button>
        </div>
        {resumeData.certificates.map((cert) => (
          <div key={cert.id} style={{ padding:'14px', background:'var(--bg-secondary)', borderRadius:'10px', border:'1px solid var(--border-color)', marginBottom:'12px' }}>
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'8px' }}>
              <button onClick={()=>deleteArrayItem('certificates',cert.id)} style={{ background:'transparent',border:'none',color:'#ef4444',cursor:'pointer' }}><Trash2 size={14}/></button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              <input type="text" value={cert.name} onChange={e=>updateArrayItem('certificates',cert.id,'name',e.target.value)} placeholder="Certificate Name" style={{ ...inputStyle, padding:'7px 10px', fontSize:'0.85rem' }} />
              <input type="text" value={cert.issuer} onChange={e=>updateArrayItem('certificates',cert.id,'issuer',e.target.value)} placeholder="Issuer" style={{ ...inputStyle, padding:'7px 10px', fontSize:'0.85rem' }} />
              <input type="text" value={cert.date} onChange={e=>updateArrayItem('certificates',cert.id,'date',e.target.value)} placeholder="Year" style={{ ...inputStyle, padding:'7px 10px', fontSize:'0.85rem' }} />
            </div>
          </div>
        ))}
      </div>
    );

    if (editingContentSection === 'skills') {
      const normalizedSkills = resumeData.skills.map(s => typeof s === 'string' ? { id: Math.random(), name: s, level: 'Intermediate' } : s);
      return (
        <div>
          {btnBack}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>Skills</h3>
            <button onClick={()=>updateTopLevelState('skills', [...normalizedSkills, { id: Date.now(), name: '', level: 'Intermediate' }])}
              style={{ display:'flex', alignItems:'center', gap:'4px', background:'var(--accent-purple)', border:'none', color:'#fff', padding:'6px 12px', borderRadius:'6px', cursor:'pointer', fontWeight:'600', fontSize:'0.8rem' }}>
              <Plus size={13}/> Add
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
            {normalizedSkills.map((skill) => (
              <div key={skill.id} style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                <input type="text" value={skill.name} onChange={e => {
                  const updated = normalizedSkills.map(s => s.id === skill.id ? { ...s, name: e.target.value } : s);
                  updateTopLevelState('skills', updated);
                }} placeholder="Skill name" style={{ ...inputStyle, flex: 2, padding: '7px 10px', fontSize: '0.85rem' }} />
                <select value={skill.level} onChange={e => {
                  const updated = normalizedSkills.map(s => s.id === skill.id ? { ...s, level: e.target.value } : s);
                  updateTopLevelState('skills', updated);
                }} style={{ ...inputStyle, flex: 1.2, padding: '7px 8px', fontSize: '0.78rem' }}>
                  {skillLevels.map(l => <option key={l}>{l}</option>)}
                </select>
                <button onClick={() => updateTopLevelState('skills', normalizedSkills.filter(s => s.id !== skill.id))} style={{ background:'transparent',border:'none',color:'#ef4444',cursor:'pointer',flexShrink:0 }}>
                  <Trash2 size={14}/>
                </button>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (editingContentSection === 'languages') return (
      <div>
        {btnBack}
        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '12px' }}>Languages</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>One per line, e.g. "English (Native)"</p>
        <textarea value={resumeData.languages.join('\n')} onChange={e => updateTopLevelState('languages', e.target.value.split('\n').map(s=>s.trim()).filter(Boolean))} rows={6}
          style={{ ...inputStyle, resize:'vertical', fontFamily:'inherit', fontSize:'0.88rem', lineHeight:'1.8' }} />
      </div>
    );

    return null;
  };

  /* ─────────────────────────────────────────────────────────
     PREVIEW RENDERER
  ──────────────────────────────────────────────────────── */
  const getHeadingStyle = () => ({
    fontSize: currentFontSize.heading,
    fontWeight: resumeData.headings.weight === '900' ? '900' : resumeData.headings.weight === 'bold' ? '700' : resumeData.headings.weight === 'medium' ? '500' : '400',
    color: resumeData.colorsAccent?.headings ? resumeData.themeColor : '#111827',
    borderBottom: resumeData.headings.borderStyle !== 'none' ? `2px ${resumeData.headings.borderStyle} ${resumeData.colorsAccent?.headingsLine ? resumeData.themeColor : '#e5e7eb'}` : 'none',
    paddingBottom: '6px', marginBottom: '10px',
    textTransform: resumeData.headings.uppercase ? 'uppercase' : 'none',
    letterSpacing: '1px',
    background: resumeData.headings.bgAccent ? `${resumeData.themeColor}18` : 'transparent',
    padding: resumeData.headings.bgAccent ? '5px 10px' : '0 0 6px 0',
    borderRadius: resumeData.headings.bgAccent ? '4px' : '0'
  });

  const lineH = resumeData.lineHeight === 'tight' ? '1.4' : resumeData.lineHeight === 'loose' ? '1.8' : '1.6';

  const normalizeSkills = (skills) => skills.map(s => typeof s === 'string' ? { name: s, level: null } : s);

  const renderPreviewSection = (sectionName) => {
    switch (sectionName) {
      case 'profile': return resumeData.summary ? (
        <div key="profile" style={{ marginBottom: '6px' }}>
          <h3 style={getHeadingStyle()}>Profile Summary</h3>
          <p style={{ fontSize: '0.9em', lineHeight: lineH, color: '#374151', margin: 0 }}>{resumeData.summary}</p>
        </div>
      ) : null;

      case 'experience': return resumeData.workExperience.length > 0 ? (
        <div key="experience" style={{ marginBottom: '6px' }}>
          <h3 style={getHeadingStyle()}>Work Experience</h3>
          {resumeData.workExperience.map((exp, i) => (
            <div key={exp.id} style={{ marginBottom: i === resumeData.workExperience.length-1 ? 0 : '14px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'3px' }}>
                <div style={{ display:'flex', flexDirection: resumeData.entries.subtitlePlacement==='same-line' ? 'row' : 'column', gap:'6px', alignItems: resumeData.entries.subtitlePlacement==='same-line' ? 'baseline' : 'flex-start' }}>
                  <h4 style={{ margin:0, fontSize:'0.95em', fontWeight:'700', color:'#1f2937' }}>{exp.title}</h4>
                  <span style={{ fontSize:'0.85em', color: resumeData.colorsAccent?.subtitle ? resumeData.themeColor : '#4b5563', fontWeight: resumeData.entries.subtitleStyle==='bold' ? 'bold' : '600', fontStyle: resumeData.entries.subtitleStyle==='italic' ? 'italic' : 'normal' }}>{exp.company}</span>
                </div>
                <span style={{ fontSize:'0.78em', color: resumeData.colorsAccent?.dates ? resumeData.themeColor : '#6b7280', fontWeight:'500', whiteSpace:'nowrap' }}>
                  {exp.start} – {exp.end}
                </span>
              </div>
              {resumeData.entries.showLocation && exp.location && <div style={{ fontSize:'0.8em', color:'#9ca3af', marginBottom:'3px' }}>{exp.location}</div>}
              {resumeData.entries.listStyle === 'none'
                ? <p style={{ margin:0, fontSize:'0.85em', lineHeight: lineH, color:'#4b5563', whiteSpace:'pre-wrap' }}>{exp.description}</p>
                : <ul style={{ margin:0, paddingLeft:'18px', fontSize:'0.85em', lineHeight: lineH, color:'#4b5563', listStyleType: resumeData.entries.listStyle==='bullet' ? 'disc' : "'- '" }}>
                    {exp.description.split('\n').filter(l=>l.trim()).map((l,idx)=><li key={idx}>{l.replace(/^[•\-]\s*/,'')}</li>)}
                  </ul>
              }
            </div>
          ))}
        </div>
      ) : null;

      case 'projects': return resumeData.projects.length > 0 ? (
        <div key="projects" style={{ marginBottom: '6px' }}>
          <h3 style={getHeadingStyle()}>Projects</h3>
          {resumeData.projects.map((proj, i) => (
            <div key={proj.id} style={{ marginBottom: i===resumeData.projects.length-1 ? 0 : '12px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:'3px' }}>
                <h4 style={{ margin:0, fontSize:'0.92em', fontWeight:'700', color:'#1f2937' }}>{proj.name}</h4>
                {resumeData.entries.showProjectLinks && proj.link && (
                  <a href={`https://${proj.link}`} style={{ fontSize:'0.78em', color: resumeData.linkSettings.blueColor ? '#2563eb' : resumeData.themeColor, textDecoration: resumeData.linkSettings.underline ? 'underline' : 'none' }}>
                    {resumeData.linkSettings.linkIcon && '🔗 '}{proj.link}
                  </a>
                )}
              </div>
              <p style={{ margin:0, fontSize:'0.85em', lineHeight: lineH, color:'#4b5563' }}>{proj.description}</p>
            </div>
          ))}
        </div>
      ) : null;

      case 'skills': return resumeData.skills.length > 0 ? (
        <div key="skills" style={{ marginBottom: '6px' }}>
          <h3 style={getHeadingStyle()}>Skills</h3>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
            {normalizeSkills(resumeData.skills).map((skill, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:'4px', background:`${resumeData.themeColor}12`, border:`1px solid ${resumeData.themeColor}28`, borderRadius:'4px', padding:'3px 8px' }}>
                <span style={{ fontSize:'0.78em', fontWeight:'600', color:'#374151' }}>{skill.name}</span>
                {skill.level && (
                  <span style={{ display:'flex', gap:'1px' }}>
                    {['Beginner','Intermediate','Advanced','Expert'].map((_lv, li) => (
                      <span key={li} style={{ width:'5px', height:'5px', borderRadius:'50%', background: ['Beginner','Intermediate','Advanced','Expert'].indexOf(skill.level) >= li ? resumeData.themeColor : '#e5e7eb' }} />
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null;

      case 'education': return resumeData.education.length > 0 ? (
        <div key="education" style={{ marginBottom: '6px' }}>
          <h3 style={getHeadingStyle()}>Education</h3>
          {resumeData.education.map(edu => (
            <div key={edu.id} style={{ marginBottom:'10px', lineHeight: lineH }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                <div>
                  <div style={{ fontSize:'0.9em', fontWeight:'700', color:'#1f2937' }}>{edu.degree}</div>
                  <div style={{ fontSize:'0.8em', color: resumeData.colorsAccent?.subtitle ? resumeData.themeColor : '#4b5563', fontWeight:'500' }}>{edu.school}</div>
                </div>
                <span style={{ fontSize:'0.78em', color: resumeData.colorsAccent?.dates ? resumeData.themeColor : '#6b7280', whiteSpace:'nowrap' }}>{edu.start} – {edu.end}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null;

      case 'certificates': return resumeData.certificates.length > 0 ? (
        <div key="certificates" style={{ marginBottom: '6px' }}>
          <h3 style={getHeadingStyle()}>Certificates</h3>
          {resumeData.certificates.map(cert => (
            <div key={cert.id} style={{ marginBottom:'8px', lineHeight: lineH }}>
              <div style={{ fontSize:'0.9em', fontWeight:'700', color:'#1f2937' }}>{cert.name}</div>
              <div style={{ fontSize:'0.78em', color:'#6b7280' }}>
                <span style={{ color: resumeData.colorsAccent?.subtitle ? resumeData.themeColor : '#4b5563' }}>{cert.issuer}</span> · {cert.date}
              </div>
            </div>
          ))}
        </div>
      ) : null;

      case 'languages': return resumeData.languages.length > 0 ? (
        <div key="languages" style={{ marginBottom: '6px' }}>
          <h3 style={getHeadingStyle()}>Languages</h3>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
            {resumeData.languages.map((lang, i) => (
              <span key={i} style={{ fontSize:'0.82em', color:'#4b5563', background:'#f3f4f6', padding:'3px 10px', borderRadius:'20px' }}>{lang}</span>
            ))}
          </div>
        </div>
      ) : null;

      default: return null;
    }
  };

  /* ─────────────────────────────────────────────────────────
     OVERVIEW PANEL
  ──────────────────────────────────────────────────────── */
  const renderOverview = () => {
    const checks = [
      { label: 'Name & Title',     ok: !!resumeData.personalInfo.name && !!resumeData.personalInfo.title },
      { label: 'Contact Info',     ok: !!resumeData.personalInfo.email && !!resumeData.personalInfo.phone },
      { label: 'Profile Summary',  ok: resumeData.summary?.length > 60 },
      { label: 'Work Experience',  ok: resumeData.workExperience.length > 0 },
      { label: '2+ Roles Listed',  ok: resumeData.workExperience.length > 1 },
      { label: 'Rich Descriptions',ok: resumeData.workExperience.some(e => e.description?.length > 40) },
      { label: 'Education',        ok: resumeData.education.length > 0 },
      { label: 'Projects',         ok: resumeData.projects.length > 0 },
      { label: '4+ Skills',        ok: resumeData.skills.length >= 4 },
      { label: 'Certificate',      ok: resumeData.certificates.length > 0 },
    ];
    const scoreColor = completeness >= 80 ? '#10b981' : completeness >= 50 ? '#f59e0b' : '#ef4444';

    return (
      <div>
        {/* Score card */}
        <div style={{ background:'var(--bg-secondary)', borderRadius:'14px', border:'1px solid var(--border-color)', padding:'20px', marginBottom:'16px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
            <span style={{ fontSize:'0.82rem', fontWeight:'700', textTransform:'uppercase', letterSpacing:'1px', color:'var(--text-muted)' }}>Resume Score</span>
            <span style={{ fontFamily:'var(--font-mono)', fontSize:'1.3rem', fontWeight:'800', color: scoreColor }}>{completeness}%</span>
          </div>
          <div style={{ height:'6px', background:'var(--bg-primary)', borderRadius:'4px', overflow:'hidden', marginBottom:'8px' }}>
            <div style={{ height:'100%', width:`${completeness}%`, background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor}99)`, transition:'width 0.5s' }} />
          </div>
          <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', margin:0 }}>
            {completeness >= 80 ? 'Excellent! Your resume is highly optimized.' : completeness >= 50 ? 'Good start. Fill in the highlighted sections below.' : 'Add more content to improve visibility.'}
          </p>
        </div>

        {/* Stats strip */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'16px' }}>
          {[
            { icon:<Briefcase size={14}/>, val: resumeData.workExperience.length, label:'Roles' },
            { icon:<BookOpen size={14}/>,  val: resumeData.education.length,      label:'Degrees' },
            { icon:<Code2 size={14}/>,     val: resumeData.skills.length,         label:'Skills' },
            { icon:<Star size={14}/>,      val: wordCount,                        label:'Words' },
          ].map(s => (
            <div key={s.label} style={{ background:'var(--bg-secondary)', border:'1px solid var(--border-color)', borderRadius:'10px', padding:'10px 12px', display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ color:'var(--accent-purple)' }}>{s.icon}</span>
              <div>
                <div style={{ fontFamily:'var(--font-mono)', fontWeight:'800', fontSize:'1rem', color:'var(--text-primary)', lineHeight:1 }}>{s.val}</div>
                <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.5px', marginTop:'2px' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Checklist */}
        <div style={{ background:'var(--bg-secondary)', borderRadius:'12px', border:'1px solid var(--border-color)', padding:'14px', marginBottom:'16px' }}>
          <div style={{ fontSize:'0.78rem', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.8px', color:'var(--text-muted)', marginBottom:'10px' }}>Completeness Checklist</div>
          {checks.map(c => (
            <div key={c.label} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 0', borderBottom:'1px solid var(--border-color)' }}>
              {c.ok
                ? <CheckCircle2 size={14} style={{ color:'#10b981', flexShrink:0 }} />
                : <Circle size={14} style={{ color:'#ef4444', opacity:0.5, flexShrink:0 }} />}
              <span style={{ fontSize:'0.82rem', color: c.ok ? 'var(--text-secondary)' : 'var(--text-primary)', fontWeight: c.ok ? '400' : '600' }}>{c.label}</span>
            </div>
          ))}
        </div>

        {/* Application Tracker */}
        <div style={{ background:'var(--bg-secondary)', borderRadius:'12px', border:'1px solid var(--border-color)', padding:'14px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
            <span style={{ fontSize:'0.82rem', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.8px', color:'var(--text-muted)' }}>Application Tracker</span>
            <span style={{ fontSize:'0.7rem', color:'var(--accent-purple)', fontWeight:'700' }}>{applications.length} sent</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'10px' }}>
            <div style={{ display:'flex', gap:'6px' }}>
              <input value={newApp.company} onChange={e=>setNewApp(p=>({...p,company:e.target.value}))} placeholder="Company" style={{ ...inputStyle, flex:1.2, padding:'6px 9px', fontSize:'0.78rem' }} />
              <input value={newApp.role} onChange={e=>setNewApp(p=>({...p,role:e.target.value}))} placeholder="Role" style={{ ...inputStyle, flex:1, padding:'6px 9px', fontSize:'0.78rem' }} />
            </div>
            <div style={{ display:'flex', gap:'6px' }}>
              <select value={newApp.status} onChange={e=>setNewApp(p=>({...p,status:e.target.value}))} style={{ ...inputStyle, flex:1, padding:'6px 9px', fontSize:'0.78rem' }}>
                {appStatuses.map(s=><option key={s}>{s}</option>)}
              </select>
              <button onClick={()=>{ if(!newApp.company) return; setApplications(p=>[...p,{...newApp,id:Date.now(),date:new Date().toLocaleDateString()}]); setNewApp({company:'',role:'',status:'Applied'}); }}
                style={{ background:'var(--accent-purple)', border:'none', color:'#fff', padding:'6px 12px', borderRadius:'7px', cursor:'pointer', fontWeight:'700', fontSize:'0.8rem', whiteSpace:'nowrap' }}>
                + Add
              </button>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'5px', maxHeight:'200px', overflowY:'auto' }}>
            {applications.length === 0 && <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', textAlign:'center', padding:'8px 0' }}>No applications tracked yet.</p>}
            {applications.slice().reverse().map(app => (
              <div key={app.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 10px', background:'var(--bg-primary)', borderRadius:'8px', border:'1px solid var(--border-color)' }}>
                <div>
                  <span style={{ fontSize:'0.8rem', fontWeight:'700', color:'var(--text-primary)' }}>{app.company}</span>
                  {app.role && <span style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginLeft:'6px' }}>{app.role}</span>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                  <span style={{ fontSize:'0.65rem', fontWeight:'700', padding:'2px 7px', borderRadius:'10px', background: `${statusColors[app.status]}20`, color: statusColors[app.status] }}>{app.status}</span>
                  <button onClick={()=>setApplications(p=>p.filter(a=>a.id!==app.id))} style={{ background:'transparent',border:'none',color:'var(--text-muted)',cursor:'pointer',padding:'2px' }}><Trash2 size={11}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────
     AI TOOLS PANEL
  ──────────────────────────────────────────────────────── */
  const renderAiTools = () => (
    <div>
      <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '4px' }}>AI Tools</h2>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '20px' }}>Powered by AI — set your provider &amp; key in Settings → AI.</p>

      {/* Enhance Summary */}
      <button onClick={fixGrammarAndTone} disabled={isAiLoading} style={{ width:'100%', marginBottom:'12px', padding:'14px', background:'rgba(99,102,241,0.08)', border:'1px solid var(--accent-purple)', borderRadius:'10px', cursor:'pointer', textAlign:'left', color:'var(--text-primary)', display:'flex', alignItems:'center', gap:'10px' }}>
        <div style={{ background:'rgba(99,102,241,0.2)', padding:'7px', borderRadius:'8px', flexShrink:0 }}>{isAiLoading ? <RefreshCw size={16} className="spin" style={{ color:'var(--accent-purple)' }} /> : <Sparkles size={16} style={{ color:'var(--accent-purple)' }} />}</div>
        <div>
          <div style={{ fontWeight:'700', fontSize:'0.88rem', color:'var(--accent-purple)' }}>Enhance Summary</div>
          <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'2px' }}>Rewrite profile summary to be more punchy and professional</div>
        </div>
      </button>

      {/* Job Description + ATS */}
      <div style={{ background:'var(--bg-secondary)', borderRadius:'12px', border:'1px solid var(--border-color)', padding:'14px', marginBottom:'12px' }}>
        <div style={{ fontSize:'0.82rem', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.8px', color:'var(--text-muted)', marginBottom:'10px', display:'flex', alignItems:'center', gap:'6px' }}>
          <Target size={13}/> ATS Match Analyzer
        </div>
        <textarea value={aiJobDescription} onChange={e=>setAiJobDescription(e.target.value)} placeholder="Paste the job description here..." rows={4}
          style={{ ...inputStyle, resize:'vertical', fontSize:'0.82rem', lineHeight:'1.5', marginBottom:'8px' }} />
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={tailorForJobDescription} disabled={isAiLoading} style={{ flex:1, padding:'8px', background:'var(--accent-purple)', color:'#fff', border:'none', borderRadius:'7px', cursor:'pointer', fontWeight:'700', fontSize:'0.8rem', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
            {isAiLoading ? <RefreshCw size={13} className="spin"/> : <Target size={13}/>} Analyze
          </button>
          <button onClick={generateCoverLetter} disabled={isAiLoading} style={{ flex:1, padding:'8px', background:'rgba(16,185,129,0.1)', color:'#10b981', border:'1px solid rgba(16,185,129,0.3)', borderRadius:'7px', cursor:'pointer', fontWeight:'700', fontSize:'0.8rem', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
            {isAiLoading ? <RefreshCw size={13} className="spin"/> : <Send size={13}/>} Cover Letter
          </button>
        </div>
      </div>

      {/* ATS Score Result */}
      {atsScore !== null && (
        <div style={{ background:'var(--bg-secondary)', borderRadius:'12px', border:'1px solid var(--border-color)', padding:'14px', marginBottom:'12px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
            <span style={{ fontSize:'0.82rem', fontWeight:'700', color:'var(--text-primary)' }}>ATS Compatibility</span>
            <span style={{ fontFamily:'var(--font-mono)', fontWeight:'800', fontSize:'1.2rem', color: atsScore >= 75 ? '#10b981' : atsScore >= 50 ? '#f59e0b' : '#ef4444' }}>{atsScore}%</span>
          </div>
          <div style={{ height:'5px', background:'var(--bg-primary)', borderRadius:'4px', overflow:'hidden', marginBottom:'12px' }}>
            <div style={{ height:'100%', width:`${atsScore}%`, background: atsScore >= 75 ? '#10b981' : atsScore >= 50 ? '#f59e0b' : '#ef4444', transition:'width 0.5s' }} />
          </div>
          {aiSuggestions?.found?.length > 0 && (
            <div style={{ marginBottom:'10px' }}>
              <div style={{ fontSize:'0.7rem', fontWeight:'700', color:'#10b981', marginBottom:'5px' }}>✓ Matched Skills</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
                {aiSuggestions.found.map(s=><span key={s} style={{ fontSize:'0.7rem', background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.25)', padding:'2px 7px', borderRadius:'4px', color:'#065f46' }}>{s}</span>)}
              </div>
            </div>
          )}
          {aiSuggestions?.missing?.length > 0 && (
            <div style={{ marginBottom:'10px' }}>
              <div style={{ fontSize:'0.7rem', fontWeight:'700', color:'#ef4444', marginBottom:'5px' }}>+ Missing Keywords (click to add)</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'5px' }}>
                {aiSuggestions.missing.map(s=>(
                  <button key={s} onClick={()=>addMissingSkill(s)} style={{ fontSize:'0.7rem', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', padding:'3px 8px', borderRadius:'4px', color:'#ef4444', cursor:'pointer', fontWeight:'600' }}>+ {s}</button>
                ))}
              </div>
            </div>
          )}
          {aiSuggestions?.tips?.length > 0 && (
            <div>
              <div style={{ fontSize:'0.7rem', fontWeight:'700', color:'var(--text-muted)', marginBottom:'5px' }}>Tips</div>
              {aiSuggestions.tips.map((t,i)=><div key={i} style={{ fontSize:'0.72rem', color:'var(--text-secondary)', marginBottom:'3px' }}>• {t}</div>)}
            </div>
          )}
        </div>
      )}

      {/* Cover Letter Result */}
      {coverLetterOpen && aiCoverLetter && (
        <div style={{ background:'var(--bg-secondary)', borderRadius:'12px', border:'1px solid var(--border-color)', padding:'14px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
            <span style={{ fontSize:'0.82rem', fontWeight:'700' }}>Cover Letter Draft</span>
            <div style={{ display:'flex', gap:'6px' }}>
              <button onClick={()=>navigator.clipboard.writeText(aiCoverLetter)} style={{ background:'transparent', border:'1px solid var(--border-color)', color:'var(--text-secondary)', padding:'4px 8px', borderRadius:'5px', cursor:'pointer', fontSize:'0.7rem' }}>Copy</button>
              <button onClick={()=>setCoverLetterOpen(false)} style={{ background:'transparent', border:'none', color:'var(--text-muted)', cursor:'pointer' }}><ChevronUp size={14}/></button>
            </div>
          </div>
          <textarea value={aiCoverLetter} onChange={e=>setAiCoverLetter(e.target.value)} rows={10}
            style={{ ...inputStyle, resize:'vertical', fontSize:'0.8rem', lineHeight:'1.7' }} />
        </div>
      )}
    </div>
  );

  /* ─────────────────────────────────────────────────────────
     MAIN RENDER
  ──────────────────────────────────────────────────────── */
  const mainTabs = [
    { id:'Overview', icon:<Layout size={14}/> },
    { id:'Content',  icon:<FileText size={14}/> },
    { id:'Customize',icon:<Edit2 size={14}/> },
    { id:'AI Tools', icon:<Sparkles size={14}/> },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'calc(100vh - 80px)', background:'var(--bg-primary)', overflow:'hidden' }}>

      {/* ── Top Bar ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 20px', borderBottom:'1px solid var(--border-color)', background:'var(--bg-secondary)', flexWrap:'wrap', gap:'10px', flexShrink:0 }}>

        {/* Main tabs */}
        <div style={{ display:'flex', gap:'2px', background:'var(--bg-primary)', padding:'3px', borderRadius:'10px', border:'1px solid var(--border-color)' }}>
          {mainTabs.map(t => (
            <button key={t.id} onClick={() => { setActiveMainTab(t.id); setEditingContentSection(null); }} style={{
              padding:'7px 14px', borderRadius:'7px', border:'none', cursor:'pointer', fontSize:'0.83rem', fontWeight:'600',
              display:'flex', alignItems:'center', gap:'6px', transition:'all 0.15s',
              background: activeMainTab === t.id ? 'var(--bg-glass)' : 'transparent',
              color: activeMainTab === t.id ? 'var(--accent-purple)' : 'var(--text-muted)',
            }}>{t.icon}{t.id}</button>
          ))}
        </div>

        {/* Resume selector + actions */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          {isRenaming ? (
            <div style={{ display:'flex', gap:'4px' }}>
              <input value={renameText} onChange={e=>setRenameText(e.target.value)} onKeyDown={e=>e.key==='Enter'&&saveRename()} autoFocus
                style={{ ...inputStyle, width:'180px', padding:'6px 10px', fontSize:'0.85rem' }} />
              <button onClick={saveRename} style={{ background:'var(--accent-purple)', border:'none', color:'#fff', padding:'6px 10px', borderRadius:'7px', cursor:'pointer' }}><Save size={14}/></button>
            </div>
          ) : (
            <>
              <select value={activeResumeId} onChange={e=>setActiveResumeId(e.target.value)} style={{ ...inputStyle, width:'180px', padding:'7px 10px', fontSize:'0.83rem' }}>
                {resumes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              <button onClick={()=>{setRenameText(activeResume.name);setIsRenaming(true);}} title="Rename" style={{ background:'var(--bg-primary)', border:'1px solid var(--border-color)', borderRadius:'7px', padding:'7px', color:'var(--text-secondary)', cursor:'pointer' }}><Edit2 size={13}/></button>
              <button onClick={createNewResume} title="New Resume" style={{ background:'var(--bg-primary)', border:'1px solid var(--border-color)', borderRadius:'7px', padding:'7px', color:'var(--accent-purple)', cursor:'pointer' }}><PlusCircle size={13}/></button>
              <button onClick={()=>deleteResume(activeResumeId)} title="Delete" style={{ background:'var(--bg-primary)', border:'1px solid var(--border-color)', borderRadius:'7px', padding:'7px', color:'#ef4444', cursor:'pointer' }}><Trash2 size={13}/></button>
            </>
          )}
          <button onClick={handleExportPDF} disabled={isExporting} style={{ padding:'7px 16px', borderRadius:'8px', background:'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))', color:'white', fontWeight:'700', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', fontSize:'0.83rem', opacity: isExporting ? 0.7 : 1 }}>
            <Download size={14}/>{isExporting ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

        {/* Left sub-nav (Customize only) */}
        {activeMainTab === 'Customize' && (
          <div style={{ width:'150px', borderRight:'1px solid var(--border-color)', overflowY:'auto', padding:'12px 0', background:'var(--bg-primary)', flexShrink:0 }} className="custom-scrollbar">
            {customizeTabs.map(tab => (
              <div key={tab} onClick={() => setActiveSubTab(tab)} style={{
                padding:'9px 18px', cursor:'pointer', fontSize:'0.82rem', transition:'all 0.15s',
                color: activeSubTab === tab ? 'var(--accent-purple)' : 'var(--text-muted)',
                fontWeight: activeSubTab === tab ? '700' : '500',
                borderLeft: `3px solid ${activeSubTab === tab ? 'var(--accent-purple)' : 'transparent'}`,
                background: activeSubTab === tab ? 'rgba(99,102,241,0.07)' : 'transparent',
              }}>{tab}</div>
            ))}
          </div>
        )}

        {/* Middle panel */}
        <div style={{ width: activeMainTab === 'Customize' ? '340px' : '360px', borderRight:'1px solid var(--border-color)', overflowY:'auto', padding:'20px', background:'var(--bg-primary)', flexShrink:0 }} className="custom-scrollbar">
          {activeMainTab === 'Customize' && renderSettingsPanel()}
          {activeMainTab === 'Content'   && renderContentEditing()}
          {activeMainTab === 'Overview'  && renderOverview()}
          {activeMainTab === 'AI Tools'  && renderAiTools()}
        </div>

        {/* ── Preview Panel ── */}
        <div style={{ flex:1, background:'#d1d5db', overflowY:'auto', display:'flex', flexDirection:'column', position:'relative' }} className="custom-scrollbar">

          {/* Preview toolbar */}
          <div style={{ position:'sticky', top:0, zIndex:10, background:'rgba(30,30,35,0.92)', backdropFilter:'blur(8px)', borderBottom:'1px solid rgba(255,255,255,0.08)', padding:'7px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
              <span style={{ fontSize:'0.72rem', color:'rgba(255,255,255,0.5)', fontWeight:'600', textTransform:'uppercase', letterSpacing:'0.8px' }}>Preview</span>
              <span style={{ width:'1px', height:'12px', background:'rgba(255,255,255,0.15)' }} />
              <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.4)', fontFamily:'monospace' }}>{wordCount} words · ~{Math.ceil(wordCount/300)} page</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
              <button onClick={()=>setZoomLevel(z=>Math.max(40,z-15))} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', padding:'4px 8px', borderRadius:'5px', cursor:'pointer', fontSize:'0.8rem' }}><ZoomOut size={13}/></button>
              <span style={{ fontSize:'0.75rem', color:'rgba(255,255,255,0.6)', minWidth:'38px', textAlign:'center', fontFamily:'monospace' }}>{zoomLevel}%</span>
              <button onClick={()=>setZoomLevel(z=>Math.min(150,z+15))} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', padding:'4px 8px', borderRadius:'5px', cursor:'pointer', fontSize:'0.8rem' }}><ZoomIn size={13}/></button>
              <button onClick={()=>setZoomLevel(75)} style={{ background:'rgba(255,255,255,0.06)', border:'none', color:'rgba(255,255,255,0.4)', padding:'4px 7px', borderRadius:'5px', cursor:'pointer', fontSize:'0.7rem', marginLeft:'2px' }}>Fit</button>
              <div style={{ width:'1px', height:'16px', background:'rgba(255,255,255,0.1)', margin:'0 4px' }} />
              <span style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.3)', background:'rgba(255,255,255,0.06)', padding:'2px 7px', borderRadius:'4px' }}>{resumeData.document.pageFormat}</span>
            </div>
          </div>

          {/* Paper */}
          <div style={{ flex:1, padding:'32px', display:'flex', justifyContent:'center', alignItems:'flex-start' }}>
            <div style={{ transform:`scale(${zoomLevel/100})`, transformOrigin:'top center', transition:'transform 0.2s', width:'210mm', marginBottom: zoomLevel < 75 ? `-${(1-zoomLevel/100)*297}mm` : undefined }}>
              <div ref={resumeRef} style={{
                width:'210mm', minHeight:'297mm', height:'max-content',
                background: resumeData.backgroundColor || '#ffffff',
                boxShadow:'0 12px 40px rgba(0,0,0,0.25)',
                padding: resumeData.document.margins === 'narrow' ? '20px' : resumeData.document.margins === 'wide' ? '60px' : currentSpacing.padding,
                color:'#1f2937', fontFamily: resumeData.bodyFontFamily || resumeData.fontFamily,
                fontSize: currentFontSize.base, display:'flex', flexDirection:'column',
                justifyContent:'space-between', boxSizing:'border-box', position:'relative'
              }}>
                {/* Template accents */}
                {resumeData.template === 'Creative' && <div style={{ position:'absolute', left:0, top:0, bottom:0, width:'7px', background: resumeData.themeColor }} />}
                {resumeData.template === 'Executive' && <div style={{ position:'absolute', left:'18px', right:'18px', top:'14px', height:'2px', background: resumeData.themeColor }} />}

                <div style={{ paddingLeft: resumeData.template === 'Creative' ? '16px' : '0' }}>
                  {/* Header */}
                  {resumeData.template === 'Modern' ? (
                    <div style={{ background: resumeData.themeColor, color:'white', padding:'22px', borderRadius:'6px', marginBottom:'22px', textAlign: resumeData.headerSettings.textAlignment, display:'flex', flexDirection:'column', alignItems: resumeData.headerSettings.textAlignment === 'center' ? 'center' : 'flex-start' }}>
                      {resumeData.photo.show && resumeData.photo.url && <img src={resumeData.photo.url} alt="" style={{ width: resumeData.photo.size, height: resumeData.photo.size, borderRadius: resumeData.photo.shape === 'circle' ? '50%' : '8px', objectFit:'cover', marginBottom:'10px', border:`${resumeData.photo.borderWidth} solid rgba(255,255,255,0.5)` }} />}
                      <h1 style={{ fontSize: resumeData.headerSettings.nameSize==='huge'?'3rem':resumeData.headerSettings.nameSize==='medium'?'2rem':currentFontSize.name, fontWeight:'800', margin:0, fontFamily: resumeData.fontFamily }}>{resumeData.personalInfo.name}</h1>
                      <h2 style={{ fontSize: currentFontSize.sub, color:'rgba(255,255,255,0.85)', fontWeight:'600', margin:'4px 0 10px 0' }}>{resumeData.personalInfo.title}</h2>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'10px', fontSize:'0.82rem', opacity:0.9 }}>
                        <span>{resumeData.personalInfo.email}</span><span>·</span>
                        <span>{resumeData.personalInfo.phone}</span><span>·</span>
                        <span>{resumeData.personalInfo.location}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: resumeData.headerSettings.textAlignment, borderBottom: resumeData.headerSettings.showDivider ? `2px ${resumeData.headings.borderStyle==='none'?'solid':resumeData.headings.borderStyle} #e5e7eb` : 'none', paddingBottom:'16px', marginBottom:'16px', display:'flex', flexDirection:'column', alignItems: resumeData.headerSettings.textAlignment==='center'?'center':'flex-start' }}>
                      {resumeData.photo.show && resumeData.photo.url && <img src={resumeData.photo.url} alt="" style={{ width: resumeData.photo.size, height: resumeData.photo.size, borderRadius: resumeData.photo.shape==='circle'?'50%':'8px', objectFit:'cover', marginBottom:'12px', border:`${resumeData.photo.borderWidth} solid ${resumeData.photo.borderColor||resumeData.themeColor}` }} />}
                      <h1 style={{ fontSize: resumeData.headerSettings.nameSize==='huge'?'3rem':resumeData.headerSettings.nameSize==='medium'?'2rem':currentFontSize.name, fontWeight:'800', color: resumeData.colorsAccent?.name?resumeData.themeColor:'#111827', margin:0, textTransform: resumeData.headings.uppercase?'uppercase':'none', fontFamily: resumeData.fontFamily }}>{resumeData.personalInfo.name}</h1>
                      <h2 style={{ fontSize: currentFontSize.sub, color: resumeData.colorsAccent?.title?resumeData.themeColor:'#4b5563', fontWeight:'600', margin:'4px 0 12px 0' }}>{resumeData.personalInfo.title}</h2>
                      <div style={{ display:'flex', flexWrap:'wrap', justifyContent: resumeData.headerSettings.textAlignment==='center'?'center':'flex-start', gap: resumeData.headerSettings.detailsArrangement==='column'?'3px':'14px', fontSize:'0.82rem', color:'#4b5563' }}>
                        <span>{resumeData.personalInfo.email}</span>
                        {resumeData.headerSettings.detailsArrangement==='row' && <span style={{color:'#d1d5db'}}>|</span>}
                        <span>{resumeData.personalInfo.phone}</span>
                        {resumeData.headerSettings.detailsArrangement==='row' && <span style={{color:'#d1d5db'}}>|</span>}
                        <span>{resumeData.personalInfo.location}</span>
                        {resumeData.personalInfo.website && <>{resumeData.headerSettings.detailsArrangement==='row' && <span style={{color:'#d1d5db'}}>|</span>}<a href={`https://${resumeData.personalInfo.website}`} style={{ color: resumeData.linkSettings.blueColor?'#2563eb':resumeData.themeColor, textDecoration: resumeData.linkSettings.underline?'underline':'none', display:'flex', alignItems:'center', gap:'3px' }}>{resumeData.linkSettings.linkIcon&&<LinkIcon size={11}/>}{resumeData.personalInfo.website}</a></>}
                        {resumeData.personalInfo.linkedin && <><a href={`https://${resumeData.personalInfo.linkedin}`} style={{ color: resumeData.linkSettings.blueColor?'#2563eb':resumeData.themeColor, textDecoration:'none', display:'flex', alignItems:'center', gap:'3px' }}>{resumeData.linkSettings.linkIcon&&<LinkedinIcon size={11}/>}LinkedIn</a></>}
                        {resumeData.personalInfo.github && <><a href={`https://${resumeData.personalInfo.github}`} style={{ color: resumeData.linkSettings.blueColor?'#2563eb':resumeData.themeColor, textDecoration:'none', display:'flex', alignItems:'center', gap:'3px' }}>{resumeData.linkSettings.linkIcon&&<GithubIcon size={11}/>}GitHub</a></>}
                      </div>
                    </div>
                  )}

                  {/* Section columns */}
                  {resumeData.layout.columns === 'double' ? (
                    <div style={{ display:'grid', gridTemplateColumns: resumeData.layout.ratio==='1-1'?'1fr 1fr':resumeData.layout.ratio==='1-2'?'1fr 2fr':'2fr 1fr', gap: currentSpacing.gap }}>
                      <div style={{ display:'flex', flexDirection:'column', gap: currentSpacing.gap, borderRight: resumeData.layout.divider!=='none'?`1px ${resumeData.layout.divider} #e5e7eb`:'none', paddingRight: resumeData.layout.divider!=='none'?'18px':'0' }}>
                        {resumeData.sectionsOrder.filter(s=>resumeData.sectionsConfig[s]==='left').map(s=>renderPreviewSection(s))}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap: currentSpacing.gap }}>
                        {resumeData.sectionsOrder.filter(s=>resumeData.sectionsConfig[s]==='right').map(s=>renderPreviewSection(s))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap: currentSpacing.gap }}>
                      {resumeData.sectionsOrder.map(s=>renderPreviewSection(s))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div style={{ marginTop:'32px', paddingTop:'10px', borderTop:'1px solid #e5e7eb', display:'flex', flexDirection: resumeData.footerSettings.alignment==='split'?'row':'column', justifyContent: resumeData.footerSettings.alignment==='split'?'space-between':'center', alignItems:'center', fontSize:'0.7rem', color:'#9ca3af', gap:'4px' }}>
                  <span style={{ fontStyle:'italic' }}>
                    {resumeData.footerSettings.showName && resumeData.personalInfo.name}
                    {resumeData.footerSettings.showEmail && resumeData.footerSettings.showName && ' | '}
                    {resumeData.footerSettings.showEmail && resumeData.personalInfo.email}
                  </span>
                  <span>{resumeData.footerSettings.customText}</span>
                  {resumeData.footerSettings.showPageNumber && <span>Page 1</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Inline CSS */}
      <style>{`
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>
    </div>
  );
};

export default ResumeUp;
