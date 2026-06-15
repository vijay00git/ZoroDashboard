import { useState, useRef, useEffect } from 'react';
import { 
  Download, FileText, Link as LinkIcon, Settings, Edit2, 
  LayoutTemplate, Layout, Trash2, Plus, ArrowLeft, ArrowUp, ArrowDown,
  Sparkles, RefreshCw, PlusCircle, Save
} from 'lucide-react';
import html2pdf from 'html2pdf.js';

const initialResumeData = {
  document: {
    language: 'English (UK)',
    dateFormat: 'DD/MM/YYYY',
    pageFormat: 'A4',
    margins: 'standard' // narrow, standard, wide
  },
  template: 'Minimalist', // Minimalist, Modern, Creative, Executive, Compact
  layout: {
    columns: 'double', // single, double
    ratio: '2-1', // 2-1, 1-1, 1-2
    divider: 'none' // none, solid, dotted
  },
  fontSize: 'medium', // small, medium, large
  bodyFontSize: 'medium', // small, medium, large
  headingFontSize: 'medium', // small, medium, large, xlarge
  lineHeight: 'normal', // tight, normal, loose
  spacing: 'regular', // compact, regular, loose
  fontFamily: "'Inter', sans-serif",
  bodyFontFamily: "'Inter', sans-serif",
  themeColor: '#6366f1',
  secondaryColor: '#4b5563',
  backgroundColor: '#ffffff', // white, cream (#fdfbf7), ivory (#fffff0), light gray (#f9fafb)
  headerSettings: {
    textAlignment: 'center',
    detailsArrangement: 'row',
    nameSize: 'large', // medium, large, huge
    showDivider: true
  },
  photo: {
    show: true,
    url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&h=150',
    shape: 'circle', // circle, square
    size: '80px', // 60px, 80px, 100px
    borderWidth: '2px',
    borderColor: '#6366f1'
  },
  linkSettings: {
    underline: false,
    blueColor: false,
    linkIcon: true,
    italic: false
  },
  footerSettings: {
    showPageNumber: true,
    showEmail: true,
    showName: true,
    customText: 'References available upon request.',
    alignment: 'split' // left, center, split
  },
  headings: {
    uppercase: true,
    borderStyle: 'solid', // none, solid, dashed
    weight: 'bold', // normal, medium, bold, extra-bold
    bgAccent: false
  },
  colorsAccent: {
    name: false,
    title: true,
    headings: false,
    headingsLine: true,
    dates: false,
    subtitle: false,
    links: false
  },
  entries: {
    dateFormat: 'Year Only', // Year Only, Month & Year
    showLocation: true,
    showProjectLinks: true,
    subtitleStyle: 'normal', // normal, bold, italic
    subtitlePlacement: 'next-line', // same-line, next-line
    listStyle: 'none' // bullet, hyphen, none
  },
  sectionsOrder: ['profile', 'experience', 'projects', 'skills', 'education', 'certificates', 'languages'],
  sectionsConfig: {
    profile: 'left',
    experience: 'left',
    projects: 'left',
    skills: 'right',
    education: 'right',
    certificates: 'right',
    languages: 'right'
  },
  personalInfo: {
    name: 'John Doe',
    title: 'Senior Software Engineer',
    email: 'john.doe@example.com',
    phone: '+1 (555) 123-4567',
    location: 'San Francisco, CA',
    website: 'johndoe.com'
  },
  summary: 'A highly motivated and experienced software engineer with a passion for developing innovative programs that expedite the efficiency and effectiveness of organizational success. Well-versed in technology and writing code to create systems that are reliable and user-friendly.',
  workExperience: [
    { id: 1, title: 'Senior Developer', company: 'Tech Corp', start: '2020', end: 'Present', description: 'Led a team of 5 engineers to build a highly scalable web application.' },
    { id: 2, title: 'Software Engineer', company: 'Web Solutions', start: '2017', end: '2020', description: 'Developed and maintained various client-facing web portals using React and Node.js.' }
  ],
  education: [
    { id: 1, degree: 'B.S. in Computer Science', school: 'State University', start: '2013', end: '2017', description: 'Graduated with Honors.' }
  ],
  projects: [
    { id: 1, name: 'E-Commerce Platform', description: 'Designed a fully responsive frontend utilizing React and Tailwind CSS. Built payment processing workflows.', link: 'github.com/johndoe/shop' }
  ],
  certificates: [
    { id: 1, name: 'AWS Solutions Architect', issuer: 'Amazon Web Services', date: '2022' }
  ],
  skills: ['React', 'JavaScript', 'Node.js', 'Python', 'System Design', 'Agile'],
  languages: ['English (Native)', 'Spanish (Intermediate)']
};

const ResumeUp = () => {
  const [activeMainTab, setActiveMainTab] = useState('Customize');
  const [activeSubTab, setActiveSubTab] = useState('Document');
  const [isExporting, setIsExporting] = useState(false);
  const [editingContentSection, setEditingContentSection] = useState(null);
  
  const [resumes, setResumes] = useState(() => {
    const saved = localStorage.getItem('tr-resumes-list-v2');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return [{ id: 'res-1', name: 'Software Engineer Resume', data: initialResumeData }];
  });
  
  const [activeResumeId, setActiveResumeId] = useState(() => {
    return resumes[0]?.id || 'res-1';
  });

  const [renameText, setRenameText] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const [aiJobDescription, setAiJobDescription] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  
  const resumeRef = useRef(null);

  const activeResume = resumes.find(r => r.id === activeResumeId) || resumes[0];
  const resumeData = activeResume.data;

  useEffect(() => {
    localStorage.setItem('tr-resumes-list-v2', JSON.stringify(resumes));
  }, [resumes]);

  const mainTabs = ['Overview', 'Content', 'Customize', 'AI Tools'];
  const customizeTabs = [
    { id: 'Document', label: 'Document' },
    { id: 'Templates', label: 'Templates' },
    { id: 'Layout', label: 'Layout' },
    { id: 'Font Size', label: 'Font Size' },
    { id: 'Spacing', label: 'Spacing' },
    { id: 'Entries', label: 'Entries' },
    { id: 'Headings', label: 'Headings' },
    { id: 'Font', label: 'Font' },
    { id: 'Colors', label: 'Colors' },
    { id: 'Header', label: 'Header' },
    { id: 'Photo', label: 'Photo' },
    { id: 'Links', label: 'Links' },
    { id: 'Footer', label: 'Footer' },
    { id: 'Sections', label: 'Sections' }
  ];

  const themeColors = [
    { name: 'Indigo', value: '#6366f1' },
    { name: 'Emerald', value: '#10b981' },
    { name: 'Ruby', value: '#e11d48' },
    { name: 'Violet', value: '#8b5cf6' },
    { name: 'Amber', value: '#d97706' },
    { name: 'Dark Slate', value: '#334155' }
  ];

  const fontFamilies = [
    { name: 'Inter (Sans-Serif)', value: "'Inter', sans-serif" },
    { name: 'Roboto (Modern)', value: "'Roboto', sans-serif" },
    { name: 'Playfair (Elegant)', value: "'Playfair Display', serif" },
    { name: 'Courier (Classic)', value: "'Courier New', monospace" }
  ];

  const updateActiveResumeData = (updater) => {
    setResumes(prev => prev.map(res => {
      if (res.id === activeResumeId) {
        return {
          ...res,
          data: typeof updater === 'function' ? updater(res.data) : updater
        };
      }
      return res;
    }));
  };

  const updateNestedState = (category, field, value) => {
    updateActiveResumeData(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
  };

  const updateTopLevelState = (field, value) => {
    updateActiveResumeData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const createNewResume = () => {
    const newId = `res-${Date.now()}`;
    const newName = `Resume ${resumes.length + 1}`;
    setResumes(prev => [...prev, { id: newId, name: newName, data: JSON.parse(JSON.stringify(initialResumeData)) }]);
    setActiveResumeId(newId);
  };

  const deleteResume = (id) => {
    if (resumes.length <= 1) {
      alert("You must keep at least one resume.");
      return;
    }
    const filtered = resumes.filter(r => r.id !== id);
    setResumes(filtered);
    if (activeResumeId === id) {
      setActiveResumeId(filtered[0].id);
    }
  };

  const startRename = () => {
    setRenameText(activeResume.name);
    setIsRenaming(true);
  };

  const saveRename = () => {
    if (renameText.trim()) {
      setResumes(prev => prev.map(r => r.id === activeResumeId ? { ...r, name: renameText } : r));
    }
    setIsRenaming(false);
  };

  const addArrayItem = (category, defaultItem) => {
    updateActiveResumeData(prev => ({
      ...prev,
      [category]: [...prev[category], { ...defaultItem, id: Date.now() }]
    }));
  };

  const updateArrayItem = (category, id, field, value) => {
    updateActiveResumeData(prev => ({
      ...prev,
      [category]: prev[category].map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };

  const deleteArrayItem = (category, id) => {
    updateActiveResumeData(prev => ({
      ...prev,
      [category]: prev[category].filter(item => item.id !== id)
    }));
  };

  const moveArrayItem = (category, index, direction) => {
    const targetIndex = index + direction;
    const items = [...resumeData[category]];
    if (targetIndex < 0 || targetIndex >= items.length) return;
    
    const temp = items[index];
    items[index] = items[targetIndex];
    items[targetIndex] = temp;

    updateTopLevelState(category, items);
  };

  const reorderSections = (index, direction) => {
    const targetIndex = index + direction;
    const order = [...resumeData.sectionsOrder];
    if (targetIndex < 0 || targetIndex >= order.length) return;
    
    const temp = order[index];
    order[index] = order[targetIndex];
    order[targetIndex] = temp;
    
    updateTopLevelState('sectionsOrder', order);
  };



  // Mock AI actions
  const fixGrammarAndTone = () => {
    setIsAiLoading(true);
    setTimeout(() => {
      setIsAiLoading(false);
      updateTopLevelState('summary', 
        'Results-oriented Senior Software Engineer with a proven track record of designing, developing, and deploying high-performance applications. Expert in React, JavaScript, and Node.js, with a strong focus on building scalable systems, streamlining workflows, and enhancing organizational efficiency.'
      );
      alert('AI enhanced your summary to sound more professional and action-oriented!');
    }, 1500);
  };

  const tailorForJobDescription = () => {
    if (!aiJobDescription.trim()) {
      alert("Please paste a job description first.");
      return;
    }
    setIsAiLoading(true);
    setTimeout(() => {
      setIsAiLoading(false);
      setAiSuggestions({
        found: ['React', 'JavaScript', 'Node.js'],
        missing: ['Docker', 'TypeScript', 'CI/CD Pipelines', 'Cloud Deployments'],
      });
    }, 1500);
  };

  const addMissingSkill = (skill) => {
    if (!resumeData.skills.includes(skill)) {
      updateTopLevelState('skills', [...resumeData.skills, skill]);
      setAiSuggestions(prev => ({
        ...prev,
        missing: prev.missing.filter(s => s !== skill),
        found: [...prev.found, skill]
      }));
    }
  };

  const handleExportPDF = async () => {
    if (!resumeRef.current) return;
    setIsExporting(true);
    
    const element = resumeRef.current;
    const opt = {
      margin:       0,
      filename:     `${resumeData.personalInfo.name.replace(/\s+/g, '_')}_Resume.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['css', 'legacy'] }
    };

    try {
      await html2pdf().from(element).set(opt).save();
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Dimension scaling maps
  const bodySizes = {
    small: { base: '0.8rem', name: '2rem', sub: '0.9rem' },
    medium: { base: '0.9rem', name: '2.5rem', sub: '1rem' },
    large: { base: '1rem', name: '3rem', sub: '1.1rem' }
  };

  const headingSizes = {
    xsmall: '1.05rem',
    small: '1.25rem',
    medium: '1.45rem',
    large: '1.65rem',
    xlarge: '1.95rem'
  };

  const selectedBody = bodySizes[resumeData.bodyFontSize || resumeData.fontSize || 'medium'] || bodySizes.medium;
  const selectedHeading = headingSizes[resumeData.headingFontSize || 'medium'] || headingSizes.medium;

  const currentFontSize = {
    base: selectedBody.base,
    name: selectedBody.name,
    sub: selectedBody.sub,
    heading: selectedHeading
  };
  const spacings = {
    compact: { margin: '12px', gap: '16px', padding: '24px' },
    regular: { margin: '24px', gap: '24px', padding: '40px' },
    loose: { margin: '36px', gap: '32px', padding: '48px' }
  };

  const currentSpacing = spacings[resumeData.spacing] || spacings.regular;

  // Customize Sub-tab Panels
  const renderSettingsPanel = () => {
    switch (activeSubTab) {
      case 'Document':
        return (
          <div className="settings-panel fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px' }}>Document Settings</h2>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Language</label>
              <select 
                value={resumeData.document.language}
                onChange={(e) => updateNestedState('document', 'language', e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                <option>English (UK)</option>
                <option>English (US)</option>
                <option>Spanish</option>
                <option>French</option>
                <option>German</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Date Format</label>
              <select 
                value={resumeData.document.dateFormat}
                onChange={(e) => updateNestedState('document', 'dateFormat', e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                <option>DD/MM/YYYY</option>
                <option>MM/DD/YYYY</option>
                <option>YYYY-MM-DD</option>
                <option>Month YYYY</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Page Format</label>
              <select 
                value={resumeData.document.pageFormat}
                onChange={(e) => updateNestedState('document', 'pageFormat', e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                <option>A4</option>
                <option>Letter</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Page Margins</label>
              <select 
                value={resumeData.document.margins}
                onChange={(e) => updateNestedState('document', 'margins', e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                <option value="narrow">Narrow (0.5 in)</option>
                <option value="standard">Standard (1.0 in)</option>
                <option value="wide">Wide (1.5 in)</option>
              </select>
            </div>
          </div>
        );

      case 'Templates':
        return (
          <div className="settings-panel fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px' }}>Design Templates</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {['Minimalist', 'Modern', 'Creative', 'Executive', 'Compact'].map((tpl) => (
                <button
                  key={tpl}
                  onClick={() => updateTopLevelState('template', tpl)}
                  style={{
                    padding: '16px',
                    borderRadius: '8px',
                    border: `2px solid ${resumeData.template === tpl ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                    background: resumeData.template === tpl ? 'var(--bg-glass)' : 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                  className="nav-item-hover"
                >
                  {tpl} Style
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'normal', marginTop: '4px' }}>
                    {tpl === 'Minimalist' && 'Standard, clean professional single/double column structure.'}
                    {tpl === 'Modern' && 'Highlights using the selected theme color with header band.'}
                    {tpl === 'Creative' && 'Left accent border strip with customized headings.'}
                    {tpl === 'Executive' && 'Traditional corporate layout using elegant fonts and double headers.'}
                    {tpl === 'Compact' && 'Space-saving layout designed to fit extensive data onto one page.'}
                  </p>
                </button>
              ))}
            </div>
          </div>
        );

      case 'Layout':
        return (
          <div className="settings-panel fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px' }}>Layout Columns</h2>
            
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              {['single', 'double'].map((lay) => (
                <button
                  key={lay}
                  onClick={() => updateNestedState('layout', 'columns', lay)}
                  style={{
                    flex: 1,
                    padding: '16px',
                    borderRadius: '8px',
                    border: `2px solid ${resumeData.layout.columns === lay ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                    background: resumeData.layout.columns === lay ? 'var(--bg-glass)' : 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: '600',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <LayoutTemplate size={24} />
                  <span style={{ textTransform: 'capitalize' }}>{lay === 'single' ? 'Single Column' : 'Double Column'}</span>
                </button>
              ))}
            </div>

            {resumeData.layout.columns === 'double' && (
              <>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Column Ratio</label>
                  <select 
                    value={resumeData.layout.ratio}
                    onChange={(e) => updateNestedState('layout', 'ratio', e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  >
                    <option value="2-1">Main Column (2/3) : Side Column (1/3)</option>
                    <option value="1-1">Equal Columns (1/2 : 1/2)</option>
                    <option value="1-2">Side Column (1/3) : Main Column (2/3)</option>
                  </select>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Column Divider</label>
                  <select 
                    value={resumeData.layout.divider}
                    onChange={(e) => updateNestedState('layout', 'divider', e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  >
                    <option value="none">None</option>
                    <option value="solid">Solid Line</option>
                    <option value="dotted">Dotted Line</option>
                  </select>
                </div>
              </>
            )}
          </div>
        );

      case 'Font Size':
        return (
          <div className="settings-panel fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px' }}>Sizing & Height</h2>
            
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Body Text Font Size</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {['small', 'medium', 'large'].map((sz) => (
                  <button
                    key={sz}
                    onClick={() => updateTopLevelState('bodyFontSize', sz)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '8px',
                      border: `2px solid ${(resumeData.bodyFontSize || resumeData.fontSize || 'medium') === sz ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                      background: (resumeData.bodyFontSize || resumeData.fontSize || 'medium') === sz ? 'var(--bg-glass)' : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      fontWeight: '600'
                    }}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Headings Font Size</label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {['xsmall', 'small', 'medium', 'large', 'xlarge'].map((sz) => (
                  <button
                    key={sz}
                    onClick={() => updateTopLevelState('headingFontSize', sz)}
                    style={{
                      flex: '1 1 calc(33% - 10px)',
                      padding: '12px',
                      borderRadius: '8px',
                      border: `2px solid ${(resumeData.headingFontSize || 'medium') === sz ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                      background: (resumeData.headingFontSize || 'medium') === sz ? 'var(--bg-glass)' : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      fontWeight: '600',
                      fontSize: '0.85rem'
                    }}
                  >
                    {sz === 'xlarge' ? 'Extra Large' : sz === 'xsmall' ? 'Extra Small' : sz}
                  </button>
                ))}
              </div>
            </div>

          </div>
        );

      case 'Spacing':
        return (
          <div className="settings-panel fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px' }}>Spacing & Margins</h2>
            
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Spacing Between Sections</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {['compact', 'regular', 'loose'].map((sp) => (
                  <button
                    key={sp}
                    onClick={() => updateTopLevelState('spacing', sp)}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '8px',
                      border: `2px solid ${resumeData.spacing === sp ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                      background: resumeData.spacing === sp ? 'var(--bg-glass)' : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      fontWeight: '600'
                    }}
                  >
                    {sp}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Body Line Spacing</label>
              <select 
                value={resumeData.lineHeight}
                onChange={(e) => updateTopLevelState('lineHeight', e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                <option value="tight">Tight</option>
                <option value="normal">Normal</option>
                <option value="loose">Loose</option>
              </select>
            </div>
          </div>
        );

      case 'Font':
        return (
          <div className="settings-panel fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px' }}>Typography Fonts</h2>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Heading Font Family</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {fontFamilies.map((font) => (
                  <button
                    key={font.value}
                    onClick={() => updateTopLevelState('fontFamily', font.value)}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: `2px solid ${resumeData.fontFamily === font.value ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                      background: resumeData.fontFamily === font.value ? 'var(--bg-glass)' : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: font.value,
                      fontWeight: '500'
                    }}
                  >
                    {font.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Body Text Font Family</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {fontFamilies.map((font) => (
                  <button
                    key={font.value}
                    onClick={() => updateTopLevelState('bodyFontFamily', font.value)}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      border: `2px solid ${resumeData.bodyFontFamily === font.value ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                      background: resumeData.bodyFontFamily === font.value ? 'var(--bg-glass)' : 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: font.value,
                      fontWeight: '500'
                    }}
                  >
                    {font.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'Colors':
        return (
          <div className="settings-panel fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px' }}>Theme Colors</h2>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Primary Theme Color</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '12px' }}>
                {themeColors.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => updateTopLevelState('themeColor', color.value)}
                    style={{
                      padding: '12px 6px',
                      borderRadius: '8px',
                      border: `2px solid ${resumeData.themeColor === color.value ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: color.value, border: '1px solid rgba(255,255,255,0.2)' }} />
                    <span style={{ fontSize: '0.75rem', fontWeight: '500' }}>{color.name}</span>
                  </button>
                ))}
              </div>
              
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input 
                  type="color" 
                  value={resumeData.themeColor} 
                  onChange={(e) => updateTopLevelState('themeColor', e.target.value)}
                  style={{ width: '50px', height: '40px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'transparent', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{resumeData.themeColor}</span>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Secondary Accent Color</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input 
                  type="color" 
                  value={resumeData.secondaryColor} 
                  onChange={(e) => updateTopLevelState('secondaryColor', e.target.value)}
                  style={{ width: '50px', height: '40px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'transparent', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{resumeData.secondaryColor}</span>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Background Canvas Color</label>
              <select 
                value={resumeData.backgroundColor}
                onChange={(e) => updateTopLevelState('backgroundColor', e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                <option value="#ffffff">Classic White</option>
                <option value="#fdfbf7">Soft Cream</option>
                <option value="#fffff0">Elegant Ivory</option>
                <option value="#f9fafb">Modern Light Gray</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '12px', fontWeight: '500', fontSize: '0.9rem' }}>Apply Accent Color</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                {[
                  { id: 'name', label: 'Name' },
                  { id: 'title', label: 'Job title' },
                  { id: 'headings', label: 'Headings' },
                  { id: 'headingsLine', label: 'Headings line' },
                  { id: 'dates', label: 'Dates' },
                  { id: 'subtitle', label: 'Entry subtitle' },
                  { id: 'links', label: 'Link icons' }
                ].map(item => (
                  <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    <input 
                      type="checkbox" 
                      checked={resumeData.colorsAccent?.[item.id] || false} 
                      onChange={(e) => updateNestedState('colorsAccent', item.id, e.target.checked)} 
                      style={{ width: '16px', height: '16px', accentColor: 'var(--accent-purple)' }} 
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        );

      case 'Photo':
        return (
          <div className="settings-panel fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px' }}>Profile Photo</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={resumeData.photo.show} 
                  onChange={(e) => updateNestedState('photo', 'show', e.target.checked)} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-purple)' }} 
                />
                <span>Show Profile Photo</span>
              </label>

              {resumeData.photo.show && (
                <>
                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Photo Source</label>
                    <input 
                      type="text" 
                      value={resumeData.photo.url} 
                      onChange={(e) => updateNestedState('photo', 'url', e.target.value)}
                      placeholder="Paste Image URL..."
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', marginBottom: '10px' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Or upload from local:</span>
                      <input 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => updateNestedState('photo', 'url', reader.result);
                            reader.readAsDataURL(file);
                          }
                        }}
                        style={{ fontSize: '0.85rem', flex: 1 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Shape</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {['circle', 'square'].map(sh => (
                        <button 
                          key={sh}
                          onClick={() => updateNestedState('photo', 'shape', sh)}
                          style={{
                            flex: 1, padding: '10px', borderRadius: '8px',
                            background: resumeData.photo.shape === sh ? 'var(--bg-glass)' : 'var(--bg-secondary)',
                            border: `2px solid ${resumeData.photo.shape === sh ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                            color: 'var(--text-primary)', cursor: 'pointer', textTransform: 'capitalize'
                          }}
                        >
                          {sh}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Photo Size</label>
                    <select 
                      value={resumeData.photo.size}
                      onChange={(e) => updateNestedState('photo', 'size', e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    >
                      <option value="60px">Small (60px)</option>
                      <option value="80px">Medium (80px)</option>
                      <option value="100px">Large (100px)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Photo Border Width</label>
                    <select 
                      value={resumeData.photo.borderWidth}
                      onChange={(e) => updateNestedState('photo', 'borderWidth', e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    >
                      <option value="0px">None</option>
                      <option value="2px">Thin (2px)</option>
                      <option value="4px">Thick (4px)</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>
        );

      case 'Headings':
        return (
          <div className="settings-panel fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px' }}>Headings Settings</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={resumeData.headings.uppercase} 
                  onChange={(e) => updateNestedState('headings', 'uppercase', e.target.checked)} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-purple)' }} 
                />
                <span>Uppercase Headings</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={resumeData.headings.bgAccent} 
                  onChange={(e) => updateNestedState('headings', 'bgAccent', e.target.checked)} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-purple)' }} 
                />
                <span>Light Highlight Heading Background</span>
              </label>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Heading Font Weight</label>
                <select 
                  value={resumeData.headings.weight}
                  onChange={(e) => updateNestedState('headings', 'weight', e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="normal">Normal</option>
                  <option value="medium">Medium</option>
                  <option value="bold">Bold</option>
                  <option value="900">Extra Bold</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Heading Bottom Border</label>
                <select 
                  value={resumeData.headings.borderStyle}
                  onChange={(e) => updateNestedState('headings', 'borderStyle', e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="none">None</option>
                  <option value="solid">Solid Line</option>
                  <option value="dashed">Dashed Line</option>
                </select>
              </div>
            </div>
          </div>
        );

      case 'Entries':
        return (
          <div className="settings-panel fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px' }}>Entry Layout & Formatting</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Date Format</label>
                <select 
                  value={resumeData.entries.dateFormat}
                  onChange={(e) => updateNestedState('entries', 'dateFormat', e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                >
                  <option>Year Only</option>
                  <option>Month & Year</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Subtitle Style</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {['normal', 'bold', 'italic'].map(st => (
                    <button key={st} 
                      onClick={() => updateNestedState('entries', 'subtitleStyle', st)}
                      style={{ 
                        flex: 1, padding: '10px', borderRadius: '8px', 
                        background: resumeData.entries.subtitleStyle === st ? 'var(--bg-glass)' : 'var(--bg-secondary)',
                        border: `2px solid ${resumeData.entries.subtitleStyle === st ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                        color: 'var(--text-primary)', cursor: 'pointer', textTransform: 'capitalize',
                        fontWeight: st === 'bold' ? 'bold' : 'normal', fontStyle: st === 'italic' ? 'italic' : 'normal'
                      }}>
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Subtitle Placement</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => updateNestedState('entries', 'subtitlePlacement', 'same-line')}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', background: resumeData.entries.subtitlePlacement === 'same-line' ? 'var(--bg-glass)' : 'var(--bg-secondary)', border: `2px solid ${resumeData.entries.subtitlePlacement === 'same-line' ? 'var(--accent-purple)' : 'var(--border-color)'}`, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    Try Same Line
                  </button>
                  <button onClick={() => updateNestedState('entries', 'subtitlePlacement', 'next-line')}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', background: resumeData.entries.subtitlePlacement === 'next-line' ? 'var(--bg-glass)' : 'var(--bg-secondary)', border: `2px solid ${resumeData.entries.subtitlePlacement === 'next-line' ? 'var(--accent-purple)' : 'var(--border-color)'}`, color: 'var(--text-primary)', cursor: 'pointer' }}>
                    Next Line
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>List Style</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {['none', 'bullet', 'hyphen'].map(ls => (
                    <button key={ls} 
                      onClick={() => updateNestedState('entries', 'listStyle', ls)}
                      style={{ 
                        flex: 1, padding: '10px', borderRadius: '8px', 
                        background: resumeData.entries.listStyle === ls ? 'var(--bg-glass)' : 'var(--bg-secondary)',
                        border: `2px solid ${resumeData.entries.listStyle === ls ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                        color: 'var(--text-primary)', cursor: 'pointer', textTransform: 'capitalize'
                      }}>
                      {ls === 'none' ? 'None' : ls === 'bullet' ? '• Bullet' : '- Hyphen'}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={resumeData.entries.showLocation} 
                    onChange={(e) => updateNestedState('entries', 'showLocation', e.target.checked)} 
                    style={{ width: '18px', height: '18px', accentColor: 'var(--accent-purple)' }} 
                  />
                  <span>Include Location details in roles</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={resumeData.entries.showProjectLinks} 
                    onChange={(e) => updateNestedState('entries', 'showProjectLinks', e.target.checked)} 
                    style={{ width: '18px', height: '18px', accentColor: 'var(--accent-purple)' }} 
                  />
                  <span>Show clickable links for Projects</span>
                </label>
              </div>
            </div>
          </div>
        );

      case 'Header':
        return (
          <div className="settings-panel fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px' }}>Header Layout</h2>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Text Alignment</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {['left', 'center'].map(align => (
                  <button key={align} 
                    onClick={() => updateNestedState('headerSettings', 'textAlignment', align)}
                    style={{ 
                      flex: 1, padding: '12px', borderRadius: '8px', 
                      background: resumeData.headerSettings.textAlignment === align ? 'var(--bg-glass)' : 'transparent',
                      border: `2px solid ${resumeData.headerSettings.textAlignment === align ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                      color: 'var(--text-primary)', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
                    }}>
                    <span style={{ textTransform: 'capitalize', fontSize: '0.85rem' }}>{align}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Details Arrangement</label>
              <select 
                value={resumeData.headerSettings.detailsArrangement}
                onChange={(e) => updateNestedState('headerSettings', 'detailsArrangement', e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                <option value="row">Inline with separators (Row)</option>
                <option value="column">Stacked vertical list (Column)</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Name Size</label>
              <select 
                value={resumeData.headerSettings.nameSize}
                onChange={(e) => updateNestedState('headerSettings', 'nameSize', e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="huge">Huge</option>
              </select>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginTop: '16px' }}>
              <input 
                type="checkbox" 
                checked={resumeData.headerSettings.showDivider} 
                onChange={(e) => updateNestedState('headerSettings', 'showDivider', e.target.checked)} 
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-purple)' }} 
              />
              <span>Include Divider under Header Banner</span>
            </label>
          </div>
        );

      case 'Links':
        return (
          <div className="settings-panel fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px' }}>Links Settings</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={resumeData.linkSettings.underline} 
                  onChange={(e) => updateNestedState('linkSettings', 'underline', e.target.checked)} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-purple)' }} />
                <span>Underline clickable elements</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={resumeData.linkSettings.blueColor} 
                  onChange={(e) => updateNestedState('linkSettings', 'blueColor', e.target.checked)} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-purple)' }} />
                <span>Blue link accents</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={resumeData.linkSettings.linkIcon} 
                  onChange={(e) => updateNestedState('linkSettings', 'linkIcon', e.target.checked)} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-purple)' }} />
                <span>Show link icon prefix</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={resumeData.linkSettings.italic} 
                  onChange={(e) => updateNestedState('linkSettings', 'italic', e.target.checked)} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-purple)' }} />
                <span>Italicize links</span>
              </label>
            </div>
          </div>
        );

      case 'Footer':
        return (
          <div className="settings-panel fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '20px' }}>Footer Settings</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={resumeData.footerSettings.showPageNumber} 
                  onChange={(e) => updateNestedState('footerSettings', 'showPageNumber', e.target.checked)} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-purple)' }} 
                />
                <span>Include Page numbers</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={resumeData.footerSettings.showEmail} 
                  onChange={(e) => updateNestedState('footerSettings', 'showEmail', e.target.checked)} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-purple)' }} 
                />
                <span>Include Email in footer</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={resumeData.footerSettings.showName} 
                  onChange={(e) => updateNestedState('footerSettings', 'showName', e.target.checked)} 
                  style={{ width: '18px', height: '18px', accentColor: 'var(--accent-purple)' }} 
                />
                <span>Include Name in footer</span>
              </label>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Footer Text Alignment</label>
                <select 
                  value={resumeData.footerSettings.alignment}
                  onChange={(e) => updateNestedState('footerSettings', 'alignment', e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                >
                  <option value="left">Left Aligned</option>
                  <option value="center">Center Aligned</option>
                  <option value="split">Split layout (Left & Right)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '0.9rem' }}>Custom Text</label>
                <input 
                  type="text" 
                  value={resumeData.footerSettings.customText} 
                  onChange={(e) => updateNestedState('footerSettings', 'customText', e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          </div>
        );

      case 'Sections':
      default:
        return (
          <div className="settings-panel fade-in">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '8px' }}>Section Layout & Order</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '20px' }}>Re-arrange sections using the arrow buttons. In double-column layouts, assign sections to left or right columns.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {resumeData.sectionsOrder.map((section, idx) => (
                <div 
                  key={section} 
                  style={{ 
                    padding: '12px 16px', 
                    background: 'var(--bg-secondary)', 
                    borderRadius: '10px', 
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 'bold', textTransform: 'capitalize', fontSize: '0.95rem' }}>{section}</span>
                    {resumeData.layout.columns === 'double' && (
                      <div style={{ marginTop: '6px', display: 'flex', gap: '4px' }}>
                        <button 
                          onClick={() => updateNestedState('sectionsConfig', section, 'left')}
                          style={{
                            fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px',
                            background: resumeData.sectionsConfig[section] === 'left' ? 'var(--accent-purple)' : 'var(--bg-primary)',
                            color: 'white', border: 'none', cursor: 'pointer'
                          }}
                        >
                          Left Col
                        </button>
                        <button 
                          onClick={() => updateNestedState('sectionsConfig', section, 'right')}
                          style={{
                            fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px',
                            background: resumeData.sectionsConfig[section] === 'right' ? 'var(--accent-purple)' : 'var(--bg-primary)',
                            color: 'white', border: 'none', cursor: 'pointer'
                          }}
                        >
                          Right Col
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button 
                      disabled={idx === 0} 
                      onClick={() => reorderSections(idx, -1)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button 
                      disabled={idx === resumeData.sectionsOrder.length - 1} 
                      onClick={() => reorderSections(idx, 1)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                      <ArrowDown size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
    }
  };

  // Content Editor forms
  const renderContentEditing = () => {
    if (!editingContentSection) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {['personalInfo', 'summary', 'workExperience', 'education', 'projects', 'certificates', 'skills', 'languages'].map(sec => (
            <button key={sec} onClick={() => setEditingContentSection(sec)} style={{
              padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-primary)', cursor: 'pointer'
            }} className="nav-item-hover">
              <span style={{ fontWeight: '600', textTransform: 'capitalize' }}>
                {sec === 'personalInfo' && 'Personal Info'}
                {sec === 'summary' && 'Summary / Profile'}
                {sec === 'workExperience' && 'Work Experience'}
                {sec === 'education' && 'Education'}
                {sec === 'projects' && 'Projects'}
                {sec === 'certificates' && 'Certificates'}
                {sec === 'skills' && 'Skills'}
                {sec === 'languages' && 'Languages'}
              </span>
              <Edit2 size={16} />
            </button>
          ))}
        </div>
      );
    }

    return (
      <div className="fade-in">
        <button 
          onClick={() => setEditingContentSection(null)}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '8px', 
            background: 'transparent', border: 'none', color: 'var(--accent-purple)', 
            cursor: 'pointer', marginBottom: '20px', fontWeight: '600' 
          }}
        >
          <ArrowLeft size={16} /> Back to Content Sections
        </button>

        {editingContentSection === 'personalInfo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Personal Details</h3>
            {Object.keys(resumeData.personalInfo).map((field) => (
              <div key={field}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', textTransform: 'capitalize' }}>{field}</label>
                <input 
                  type="text" 
                  value={resumeData.personalInfo[field]} 
                  onChange={(e) => updateNestedState('personalInfo', field, e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
              </div>
            ))}
          </div>
        )}

        {editingContentSection === 'summary' && (
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '16px' }}>Professional Summary</h3>
            <textarea 
              value={resumeData.summary}
              onChange={(e) => updateTopLevelState('summary', e.target.value)}
              rows={8}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
        )}

        {editingContentSection === 'workExperience' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Work History</h3>
              <button 
                onClick={() => addArrayItem('workExperience', { title: 'New Role', company: 'Company Name', start: 'Year', end: 'Present', description: 'Describe your tasks.' })}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '6px', 
                  background: 'var(--accent-purple)', border: 'none', color: 'white', 
                  padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600'
                }}
              >
                <Plus size={14} /> Add Role
              </button>
            </div>

            {resumeData.workExperience.map((exp, idx) => (
              <div key={exp.id} style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button disabled={idx === 0} onClick={() => moveArrayItem('workExperience', idx, -1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <ArrowUp size={16} />
                    </button>
                    <button disabled={idx === resumeData.workExperience.length - 1} onClick={() => moveArrayItem('workExperience', idx, 1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <ArrowDown size={16} />
                    </button>
                  </div>
                  <button 
                    onClick={() => deleteArrayItem('workExperience', exp.id)}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <input 
                    type="text" 
                    value={exp.title} 
                    onChange={(e) => updateArrayItem('workExperience', exp.id, 'title', e.target.value)}
                    placeholder="Job Title"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                  <input 
                    type="text" 
                    value={exp.company} 
                    onChange={(e) => updateArrayItem('workExperience', exp.id, 'company', e.target.value)}
                    placeholder="Company Name"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input 
                      type="text" 
                      value={exp.start} 
                      onChange={(e) => updateArrayItem('workExperience', exp.id, 'start', e.target.value)}
                      placeholder="Start Year"
                      style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                    <input 
                      type="text" 
                      value={exp.end} 
                      onChange={(e) => updateArrayItem('workExperience', exp.id, 'end', e.target.value)}
                      placeholder="End Year / Present"
                      style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <textarea 
                    value={exp.description} 
                    onChange={(e) => updateArrayItem('workExperience', exp.id, 'description', e.target.value)}
                    placeholder="Description of duties/achievements"
                    rows={4}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {editingContentSection === 'education' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Education</h3>
              <button 
                onClick={() => addArrayItem('education', { degree: 'Degree', school: 'School', start: 'Year', end: 'Year', description: '' })}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '6px', 
                  background: 'var(--accent-purple)', border: 'none', color: 'white', 
                  padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600'
                }}
              >
                <Plus size={14} /> Add Education
              </button>
            </div>

            {resumeData.education.map((edu, idx) => (
              <div key={edu.id} style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button disabled={idx === 0} onClick={() => moveArrayItem('education', idx, -1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <ArrowUp size={16} />
                    </button>
                    <button disabled={idx === resumeData.education.length - 1} onClick={() => moveArrayItem('education', idx, 1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <ArrowDown size={16} />
                    </button>
                  </div>
                  <button 
                    onClick={() => deleteArrayItem('education', edu.id)}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <input 
                    type="text" 
                    value={edu.degree} 
                    onChange={(e) => updateArrayItem('education', edu.id, 'degree', e.target.value)}
                    placeholder="Degree / Certificate"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                  <input 
                    type="text" 
                    value={edu.school} 
                    onChange={(e) => updateArrayItem('education', edu.id, 'school', e.target.value)}
                    placeholder="School / University Name"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input 
                      type="text" 
                      value={edu.start} 
                      onChange={(e) => updateArrayItem('education', edu.id, 'start', e.target.value)}
                      placeholder="Start Year"
                      style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                    <input 
                      type="text" 
                      value={edu.end} 
                      onChange={(e) => updateArrayItem('education', edu.id, 'end', e.target.value)}
                      placeholder="End Year"
                      style={{ flex: 1, padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {editingContentSection === 'projects' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Projects</h3>
              <button 
                onClick={() => addArrayItem('projects', { name: 'Project Name', description: 'Describe your project.', link: '' })}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '6px', 
                  background: 'var(--accent-purple)', border: 'none', color: 'white', 
                  padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600'
                }}
              >
                <Plus size={14} /> Add Project
              </button>
            </div>

            {resumeData.projects.map((proj, idx) => (
              <div key={proj.id} style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button disabled={idx === 0} onClick={() => moveArrayItem('projects', idx, -1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <ArrowUp size={16} />
                    </button>
                    <button disabled={idx === resumeData.projects.length - 1} onClick={() => moveArrayItem('projects', idx, 1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <ArrowDown size={16} />
                    </button>
                  </div>
                  <button 
                    onClick={() => deleteArrayItem('projects', proj.id)}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <input 
                    type="text" 
                    value={proj.name} 
                    onChange={(e) => updateArrayItem('projects', proj.id, 'name', e.target.value)}
                    placeholder="Project Name"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                  <input 
                    type="text" 
                    value={proj.link} 
                    onChange={(e) => updateArrayItem('projects', proj.id, 'link', e.target.value)}
                    placeholder="Project Link (Optional)"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                  <textarea 
                    value={proj.description} 
                    onChange={(e) => updateArrayItem('projects', proj.id, 'description', e.target.value)}
                    placeholder="Project Description"
                    rows={4}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {editingContentSection === 'certificates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Certificates</h3>
              <button 
                onClick={() => addArrayItem('certificates', { name: 'Certificate Name', issuer: 'Issuer', date: 'Year' })}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '6px', 
                  background: 'var(--accent-purple)', border: 'none', color: 'white', 
                  padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600'
                }}
              >
                <Plus size={14} /> Add Certificate
              </button>
            </div>

            {resumeData.certificates.map((cert, idx) => (
              <div key={cert.id} style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button disabled={idx === 0} onClick={() => moveArrayItem('certificates', idx, -1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <ArrowUp size={16} />
                    </button>
                    <button disabled={idx === resumeData.certificates.length - 1} onClick={() => moveArrayItem('certificates', idx, 1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <ArrowDown size={16} />
                    </button>
                  </div>
                  <button 
                    onClick={() => deleteArrayItem('certificates', cert.id)}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <input 
                    type="text" 
                    value={cert.name} 
                    onChange={(e) => updateArrayItem('certificates', cert.id, 'name', e.target.value)}
                    placeholder="Certificate Name"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                  <input 
                    type="text" 
                    value={cert.issuer} 
                    onChange={(e) => updateArrayItem('certificates', cert.id, 'issuer', e.target.value)}
                    placeholder="Issuer organization"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                  <input 
                    type="text" 
                    value={cert.date} 
                    onChange={(e) => updateArrayItem('certificates', cert.id, 'date', e.target.value)}
                    placeholder="Year Issued"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {editingContentSection === 'skills' && (
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '8px' }}>Skills</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>List skills separated by commas</p>
            <textarea 
              value={resumeData.skills.join(', ')}
              onChange={(e) => updateTopLevelState('skills', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              rows={6}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical' }}
            />
          </div>
        )}

        {editingContentSection === 'languages' && (
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '8px' }}>Languages</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>List languages with proficiency, separated by commas</p>
            <textarea 
              value={resumeData.languages.join(', ')}
              onChange={(e) => updateTopLevelState('languages', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              rows={6}
              style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'vertical' }}
            />
          </div>
        )}
      </div>
    );
  };

  // Section preview selector based on config
  const renderPreviewSection = (sectionName) => {
    const getHeadingStyle = () => ({
      fontSize: currentFontSize.heading, 
      fontWeight: resumeData.headings.weight === 'bold' ? '700' : resumeData.headings.weight === 'medium' ? '500' : resumeData.headings.weight === '900' ? '900' : '400', 
      color: resumeData.colorsAccent?.headings ? resumeData.themeColor : '#111827', 
      borderBottom: resumeData.headings.borderStyle !== 'none' ? `2px ${resumeData.headings.borderStyle} ${resumeData.colorsAccent?.headingsLine ? resumeData.themeColor : '#e5e7eb'}` : 'none', 
      paddingBottom: '8px', 
      marginBottom: '12px', 
      textTransform: resumeData.headings.uppercase ? 'uppercase' : 'none', 
      letterSpacing: '1px',
      background: resumeData.headings.bgAccent ? `${resumeData.themeColor}15` : 'transparent',
      padding: resumeData.headings.bgAccent ? '6px 12px' : '0',
      borderRadius: '4px'
    });

    switch (sectionName) {
      case 'profile':
        return resumeData.summary ? (
          <div key="profile" style={{ marginBottom: '6px' }}>
            <h3 style={getHeadingStyle()}>
              Profile Summary
            </h3>
            <p style={{ fontSize: '0.9em', lineHeight: resumeData.lineHeight === 'tight' ? '1.4' : resumeData.lineHeight === 'loose' ? '1.8' : '1.6', color: '#374151', margin: 0 }}>
              {resumeData.summary}
            </p>
          </div>
        ) : null;

      case 'experience':
        return resumeData.workExperience.length > 0 ? (
          <div key="experience" style={{ marginBottom: '6px' }}>
            <h3 style={getHeadingStyle()}>
              Work Experience
            </h3>
            {resumeData.workExperience.map((exp, idx) => (
              <div key={exp.id} style={{ marginBottom: idx === resumeData.workExperience.length - 1 ? 0 : '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', flexDirection: resumeData.entries.subtitlePlacement === 'same-line' ? 'row' : 'column', gap: resumeData.entries.subtitlePlacement === 'same-line' ? '8px' : '0', alignItems: resumeData.entries.subtitlePlacement === 'same-line' ? 'baseline' : 'flex-start' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95em', fontWeight: '700', color: '#1f2937' }}>{exp.title}</h4>
                    <span style={{ 
                      fontSize: '0.85em', 
                      color: resumeData.colorsAccent?.subtitle ? resumeData.themeColor : '#4b5563', 
                      fontWeight: resumeData.entries.subtitleStyle === 'bold' ? 'bold' : '600',
                      fontStyle: resumeData.entries.subtitleStyle === 'italic' ? 'italic' : 'normal'
                    }}>
                      {exp.company}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.8em', color: resumeData.colorsAccent?.dates ? resumeData.themeColor : '#6b7280', fontWeight: '500' }}>
                    {resumeData.entries.dateFormat === 'Month & Year' ? exp.start : exp.start.split(' ').pop()} - {resumeData.entries.dateFormat === 'Month & Year' ? exp.end : exp.end.split(' ').pop()}
                  </span>
                </div>
                {resumeData.entries.showLocation && <div style={{ fontSize: '0.85em', color: '#6b7280', marginBottom: '4px' }}>{resumeData.personalInfo.location}</div>}
                
                {resumeData.entries.listStyle === 'none' ? (
                  <p style={{ margin: 0, fontSize: '0.85em', lineHeight: resumeData.lineHeight === 'tight' ? '1.4' : resumeData.lineHeight === 'loose' ? '1.8' : '1.6', color: '#4b5563', whiteSpace: 'pre-wrap' }}>
                    {exp.description}
                  </p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85em', lineHeight: resumeData.lineHeight === 'tight' ? '1.4' : resumeData.lineHeight === 'loose' ? '1.8' : '1.6', color: '#4b5563', listStyleType: resumeData.entries.listStyle === 'bullet' ? 'disc' : "'- '" }}>
                    {exp.description.split('\n').filter(line => line.trim()).map((line, i) => (
                      <li key={i}>{line.replace(/^[•-]\s*/, '')}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ) : null;

      case 'projects':
        return resumeData.projects.length > 0 ? (
          <div key="projects" style={{ marginBottom: '6px' }}>
            <h3 style={getHeadingStyle()}>
              Projects
            </h3>
            {resumeData.projects.map((proj, idx) => (
              <div key={proj.id} style={{ marginBottom: idx === resumeData.projects.length - 1 ? 0 : '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95em', fontWeight: '700', color: '#1f2937' }}>{proj.name}</h4>
                  {resumeData.entries.showProjectLinks && proj.link && (
                    <a href={`https://${proj.link}`} style={{ 
                      fontSize: '0.8rem', color: resumeData.linkSettings.blueColor ? '#2563eb' : (resumeData.colorsAccent?.links ? resumeData.themeColor : '#4b5563'), 
                      textDecoration: resumeData.linkSettings.underline ? 'underline' : 'none',
                      fontStyle: resumeData.linkSettings.italic ? 'italic' : 'normal'
                    }}>
                      {proj.link}
                    </a>
                  )}
                </div>
                {resumeData.entries.listStyle === 'none' ? (
                  <p style={{ margin: 0, fontSize: '0.85em', lineHeight: resumeData.lineHeight === 'tight' ? '1.4' : resumeData.lineHeight === 'loose' ? '1.8' : '1.6', color: '#4b5563', whiteSpace: 'pre-wrap' }}>
                    {proj.description}
                  </p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85em', lineHeight: resumeData.lineHeight === 'tight' ? '1.4' : resumeData.lineHeight === 'loose' ? '1.8' : '1.6', color: '#4b5563', listStyleType: resumeData.entries.listStyle === 'bullet' ? 'disc' : "'- '" }}>
                    {proj.description.split('\n').filter(line => line.trim()).map((line, i) => (
                      <li key={i}>{line.replace(/^[•-]\s*/, '')}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        ) : null;

      case 'skills':
        return resumeData.skills.length > 0 ? (
          <div key="skills" style={{ marginBottom: '6px' }}>
            <h3 style={getHeadingStyle()}>
              Skills
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {resumeData.skills.map(skill => (
                <span key={skill} style={{ 
                  background: `${resumeData.themeColor}10`, color: '#374151', padding: '4px 10px', 
                  borderRadius: '4px', fontSize: '0.8em', fontWeight: '500', border: `1px solid ${resumeData.themeColor}30`
                }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>
        ) : null;

      case 'education':
        return resumeData.education.length > 0 ? (
          <div key="education" style={{ marginBottom: '6px' }}>
            <h3 style={getHeadingStyle()}>
              Education
            </h3>
            {resumeData.education.map(edu => (
              <div key={edu.id} style={{ marginBottom: '12px', lineHeight: resumeData.lineHeight === 'tight' ? '1.4' : resumeData.lineHeight === 'loose' ? '1.8' : '1.6' }}>
                <div style={{ display: 'flex', flexDirection: resumeData.entries.subtitlePlacement === 'same-line' ? 'row' : 'column', gap: resumeData.entries.subtitlePlacement === 'same-line' ? '8px' : '0', alignItems: resumeData.entries.subtitlePlacement === 'same-line' ? 'baseline' : 'flex-start' }}>
                  <div style={{ fontSize: '0.9em', fontWeight: '700', color: '#1f2937' }}>{edu.degree}</div>
                  <div style={{ 
                    fontSize: '0.8em', 
                    color: resumeData.colorsAccent?.subtitle ? resumeData.themeColor : '#4b5563', 
                    fontWeight: resumeData.entries.subtitleStyle === 'bold' ? 'bold' : '500',
                    fontStyle: resumeData.entries.subtitleStyle === 'italic' ? 'italic' : 'normal'
                  }}>
                    {edu.school}
                  </div>
                </div>
                <div style={{ fontSize: '0.85em', color: resumeData.colorsAccent?.dates ? resumeData.themeColor : '#6b7280' }}>{edu.start} - {edu.end}</div>
              </div>
            ))}
          </div>
        ) : null;

      case 'certificates':
        return resumeData.certificates.length > 0 ? (
          <div key="certificates" style={{ marginBottom: '6px' }}>
            <h3 style={getHeadingStyle()}>
              Certificates
            </h3>
            {resumeData.certificates.map(cert => (
              <div key={cert.id} style={{ marginBottom: '12px', lineHeight: resumeData.lineHeight === 'tight' ? '1.4' : resumeData.lineHeight === 'loose' ? '1.8' : '1.6' }}>
                <div style={{ fontSize: '0.9em', fontWeight: '700', color: '#1f2937' }}>{cert.name}</div>
                <div style={{ fontSize: '0.8em', color: resumeData.colorsAccent?.dates ? resumeData.themeColor : '#6b7280' }}>
                  <span style={{ 
                    color: resumeData.colorsAccent?.subtitle ? resumeData.themeColor : '#4b5563',
                    fontWeight: resumeData.entries.subtitleStyle === 'bold' ? 'bold' : 'normal',
                    fontStyle: resumeData.entries.subtitleStyle === 'italic' ? 'italic' : 'normal'
                  }}>{cert.issuer}</span> ({cert.date})
                </div>
              </div>
            ))}
          </div>
        ) : null;

      case 'languages':
        return resumeData.languages.length > 0 ? (
          <div key="languages" style={{ marginBottom: '6px' }}>
            <h3 style={getHeadingStyle()}>
              Languages
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', lineHeight: resumeData.lineHeight === 'tight' ? '1.4' : resumeData.lineHeight === 'loose' ? '1.8' : '1.6' }}>
              {resumeData.languages.map(lang => (
                <div key={lang} style={{ fontSize: '0.85em', color: '#4b5563' }}>
                  • {lang}
                </div>
              ))}
            </div>
          </div>
        ) : null;

      default:
        return null;
    }
  };

  return (
    <div style={{ 
      display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', 
      background: 'var(--bg-primary)', overflow: 'hidden' 
    }}>
      {/* Top Header Bar */}
      <div style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
        padding: '12px 24px', borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)', flexWrap: 'wrap', gap: '12px'
      }}>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-primary)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          {mainTabs.map(tab => (
            <button 
              key={tab}
              onClick={() => {
                setActiveMainTab(tab);
                setEditingContentSection(null);
              }}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                background: activeMainTab === tab ? 'var(--bg-glass)' : 'transparent',
                color: activeMainTab === tab ? 'var(--accent-purple)' : 'var(--text-secondary)',
                fontWeight: activeMainTab === tab ? '600' : '500',
                border: 'none',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              {tab === 'Overview' && <Layout size={16} />}
              {tab === 'Content' && <FileText size={16} />}
              {tab === 'Customize' && <Edit2 size={16} />}
              {tab === 'AI Tools' && <Settings size={16} />}
              {tab}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isRenaming ? (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input 
                type="text" 
                value={renameText} 
                onChange={(e) => setRenameText(e.target.value)}
                style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              />
              <button onClick={saveRename} style={{ background: 'var(--accent-purple)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer' }}>
                <Save size={16} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select 
                value={activeResumeId}
                onChange={(e) => setActiveResumeId(e.target.value)}
                style={{ 
                  padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', 
                  background: 'var(--bg-primary)', color: 'var(--text-primary)',
                  fontWeight: '500', outline: 'none'
                }}
              >
                {resumes.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <button onClick={startRename} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px', color: 'var(--text-primary)', cursor: 'pointer' }} title="Rename Resume">
                <Edit2 size={14} />
              </button>
              <button onClick={createNewResume} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px', color: 'var(--accent-purple)', cursor: 'pointer' }} title="Create New Resume">
                <PlusCircle size={14} />
              </button>
              <button onClick={() => deleteResume(activeResumeId)} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px', color: '#ef4444', cursor: 'pointer' }} title="Delete Current Resume">
                <Trash2 size={14} />
              </button>
            </div>
          )}

          <button 
            onClick={handleExportPDF}
            disabled={isExporting}
            style={{
              padding: '8px 16px', borderRadius: '8px',
              background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))',
              color: 'white', fontWeight: 'bold', border: 'none',
              cursor: isExporting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: '0 4px 15px rgba(168, 85, 247, 0.3)',
              opacity: isExporting ? 0.7 : 1
            }}
          >
            <Download size={18} /> {isExporting ? 'Exporting...' : 'PDF'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Sidebar (Customize Sub-Tabs) */}
        {activeMainTab === 'Customize' && (
          <div style={{ 
            width: '180px', borderRight: '1px solid var(--border-color)', 
            overflowY: 'auto', padding: '16px 0', background: 'var(--bg-primary)' 
          }} className="custom-scrollbar">
            {customizeTabs.map(tab => (
              <div 
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                style={{
                  padding: '10px 24px',
                  cursor: 'pointer',
                  color: activeSubTab === tab.id ? 'var(--accent-purple)' : 'var(--text-secondary)',
                  fontWeight: activeSubTab === tab.id ? '600' : '500',
                  borderLeft: `4px solid ${activeSubTab === tab.id ? 'var(--accent-purple)' : 'transparent'}`,
                  background: activeSubTab === tab.id ? 'var(--bg-glass)' : 'transparent',
                  transition: 'all 0.2s ease',
                  fontSize: '0.9rem'
                }}
                className="nav-item-hover"
              >
                {tab.label}
              </div>
            ))}
          </div>
        )}

        {/* Middle Panel (Settings Form) */}
        {activeMainTab === 'Customize' && (
          <div style={{ 
            width: '380px', borderRight: '1px solid var(--border-color)', 
            overflowY: 'auto', padding: '24px', background: 'var(--bg-primary)' 
          }} className="custom-scrollbar">
            {renderSettingsPanel()}
          </div>
        )}

        {/* Content Tab Middle Panel */}
        {activeMainTab === 'Content' && (
          <div style={{ 
            width: '380px', borderRight: '1px solid var(--border-color)', 
            overflowY: 'auto', padding: '24px', background: 'var(--bg-primary)' 
          }} className="custom-scrollbar">
            {renderContentEditing()}
          </div>
        )}

        {/* Overview Tab Middle Panel */}
        {activeMainTab === 'Overview' && (
          <div style={{ 
            width: '380px', borderRight: '1px solid var(--border-color)', 
            overflowY: 'auto', padding: '24px', background: 'var(--bg-primary)' 
          }} className="custom-scrollbar">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '16px' }}>Resume Dashboard</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '20px' }}>Stats & summary for <strong>{activeResume.name}</strong>.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '8px' }}>Resume Completeness</h3>
                <div style={{ width: '100%', height: '8px', background: 'var(--bg-primary)', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{ width: '92%', height: '100%', background: 'linear-gradient(90deg, var(--accent-purple), var(--accent-pink))' }} />
                </div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>92% Complete - Highly optimized format.</span>
              </div>

              <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '4px' }}>Sections Count</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Work: {resumeData.workExperience.length} | Education: {resumeData.education.length} | Projects: {resumeData.projects.length}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* AI Tools Tab Middle Panel */}
        {activeMainTab === 'AI Tools' && (
          <div style={{ 
            width: '380px', borderRight: '1px solid var(--border-color)', 
            overflowY: 'auto', padding: '24px', background: 'var(--bg-primary)' 
          }} className="custom-scrollbar">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '8px' }}>AI Resume Enhancer</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>Polish summaries and match job descriptions.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <button 
                onClick={fixGrammarAndTone}
                disabled={isAiLoading}
                style={{
                  width: '100%', padding: '16px', background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(236, 72, 153, 0.1))', 
                  borderRadius: '12px', border: '1px solid var(--accent-purple)',
                  display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-primary)', cursor: 'pointer',
                  textAlign: 'left'
                }} className="nav-item-hover"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-purple)', fontWeight: 'bold' }}>
                  {isAiLoading ? <RefreshCw className="spin" size={18} /> : <Sparkles size={18} />}
                  Fix Grammar & Professional Tone
                </div>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Rewrites your profile summary into a highly professional elevator pitch.</span>
              </button>

              <div style={{ padding: '16px', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '8px' }}>Tailor for Job Description</h3>
                <textarea 
                  value={aiJobDescription}
                  onChange={(e) => setAiJobDescription(e.target.value)}
                  placeholder="Paste target job description here..."
                  rows={4}
                  style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', marginBottom: '12px', resize: 'vertical' }}
                />
                <button 
                  onClick={tailorForJobDescription}
                  disabled={isAiLoading}
                  style={{ width: '100%', padding: '10px', background: 'var(--accent-purple)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  {isAiLoading ? 'Analyzing...' : 'Scan & Check Matching Skills'}
                </button>

                {aiSuggestions && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 'bold' }}>✓ Matched Skills:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                        {aiSuggestions.found.map(s => <span key={s} style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>{s}</span>)}
                      </div>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 'bold' }}>+ Missing Skills (Click to Add):</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                        {aiSuggestions.missing.map(s => (
                          <button 
                            key={s} 
                            onClick={() => addMissingSkill(s)}
                            style={{ fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: 'none', padding: '4px 8px', borderRadius: '4px', color: 'var(--text-primary)', cursor: 'pointer' }}
                          >
                            + {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Right Panel (PDF Preview Canvas) */}
        <div style={{ 
          flex: 1, background: '#e5e7eb',
          overflowY: 'auto', padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start'
        }} className="custom-scrollbar">
          
          {/* A4 Paper Document Container */}
          <div 
            ref={resumeRef}
            style={{ 
              width: '210mm', minHeight: '297mm', height: 'max-content', 
              background: resumeData.backgroundColor || '#ffffff', 
              boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
              padding: resumeData.document.margins === 'narrow' ? '24px' : resumeData.document.margins === 'wide' ? '60px' : currentSpacing.padding, 
              color: '#1f2937', 
              fontFamily: resumeData.bodyFontFamily || resumeData.fontFamily,
              fontSize: currentFontSize.base,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
              position: 'relative'
            }}
          >
            {/* Template Accent Border Styles */}
            {resumeData.template === 'Creative' && (
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '8px', background: resumeData.themeColor }} />
            )}
            {resumeData.template === 'Executive' && (
              <div style={{ position: 'absolute', left: '20px', right: '20px', top: '15px', height: '2px', background: resumeData.themeColor }} />
            )}

            <div>
              {/* Header Banner (Modern Template) */}
              {resumeData.template === 'Modern' ? (
                <div style={{ 
                  background: resumeData.themeColor, 
                  color: 'white', 
                  padding: '24px', 
                  borderRadius: '6px',
                  marginBottom: '24px',
                  textAlign: resumeData.headerSettings.textAlignment,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: resumeData.headerSettings.textAlignment === 'center' ? 'center' : 'flex-start'
                }}>
                  {resumeData.photo.show && resumeData.photo.url && (
                    <img 
                      src={resumeData.photo.url} 
                      alt="Profile" 
                      style={{ 
                        width: resumeData.photo.size || '80px', 
                        height: resumeData.photo.size || '80px', 
                        borderRadius: resumeData.photo.shape === 'circle' ? '50%' : '8px', 
                        objectFit: 'cover', 
                        marginBottom: '12px',
                        border: `${resumeData.photo.borderWidth} solid white`
                      }} 
                    />
                  )}
                  <h1 style={{ 
                    fontSize: resumeData.headerSettings.nameSize === 'huge' ? '3rem' : resumeData.headerSettings.nameSize === 'medium' ? '2rem' : currentFontSize.name, 
                    fontWeight: '800', 
                    margin: 0, 
                    textTransform: 'uppercase',
                    fontFamily: resumeData.fontFamily
                  }}>
                    {resumeData.personalInfo.name}
                  </h1>
                  <h2 style={{ fontSize: currentFontSize.sub, color: 'rgba(255,255,255,0.9)', fontWeight: '600', margin: '4px 0 12px 0' }}>
                    {resumeData.personalInfo.title}
                  </h2>
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: resumeData.headerSettings.detailsArrangement === 'column' ? 'column' : 'row',
                    gap: '12px', 
                    fontSize: '0.85rem', 
                    flexWrap: 'wrap', 
                    opacity: 0.9 
                  }}>
                    <span>{resumeData.personalInfo.email}</span>
                    <span>•</span>
                    <span>{resumeData.personalInfo.phone}</span>
                    <span>•</span>
                    <span>{resumeData.personalInfo.location}</span>
                  </div>
                </div>
              ) : (
                /* Classic Header (Minimalist, Creative, Executive, Compact) */
                <div style={{ 
                  textAlign: resumeData.headerSettings.textAlignment, 
                  borderBottom: resumeData.headerSettings.showDivider && resumeData.headings.borderStyle !== 'none' ? `2px ${resumeData.headings.borderStyle} #e5e7eb` : 'none', 
                  paddingBottom: '20px', 
                  marginBottom: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: resumeData.headerSettings.textAlignment === 'center' ? 'center' : 'flex-start'
                }}>
                  {resumeData.photo.show && resumeData.photo.url && (
                    <img 
                      src={resumeData.photo.url} 
                      alt="Profile" 
                      style={{ 
                        width: resumeData.photo.size || '80px', 
                        height: resumeData.photo.size || '80px', 
                        borderRadius: resumeData.photo.shape === 'circle' ? '50%' : '8px', 
                        objectFit: 'cover', 
                        marginBottom: '16px',
                        border: `${resumeData.photo.borderWidth} solid ${resumeData.photo.borderColor || resumeData.themeColor}`
                      }} 
                    />
                  )}

                  <h1 style={{ 
                    fontSize: resumeData.headerSettings.nameSize === 'huge' ? '3rem' : resumeData.headerSettings.nameSize === 'medium' ? '2rem' : currentFontSize.name, 
                    fontWeight: '800', 
                    color: resumeData.colorsAccent?.name ? resumeData.themeColor : '#111827', 
                    margin: 0, 
                    textTransform: resumeData.headings.uppercase ? 'uppercase' : 'none', 
                    letterSpacing: '1px',
                    fontFamily: resumeData.fontFamily
                  }}>
                    {resumeData.personalInfo.name}
                  </h1>
                  <h2 style={{ 
                    fontSize: currentFontSize.sub, 
                    color: resumeData.colorsAccent?.title ? resumeData.themeColor : '#4b5563', 
                    fontWeight: '600', 
                    margin: '5px 0 15px 0' 
                  }}>
                    {resumeData.personalInfo.title}
                  </h2>
                  
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: resumeData.headerSettings.detailsArrangement === 'column' ? 'column' : 'row',
                    justifyContent: resumeData.headerSettings.textAlignment === 'center' ? 'center' : 'flex-start',
                    gap: resumeData.headerSettings.detailsArrangement === 'column' ? '4px' : '16px',
                    fontSize: '0.85rem', color: '#4b5563', flexWrap: 'wrap'
                  }}>
                    <span>{resumeData.personalInfo.email}</span>
                    {resumeData.headerSettings.detailsArrangement === 'row' && <span style={{ color: '#d1d5db' }}>|</span>}
                    <span>{resumeData.personalInfo.phone}</span>
                    {resumeData.headerSettings.detailsArrangement === 'row' && <span style={{ color: '#d1d5db' }}>|</span>}
                    <span>{resumeData.personalInfo.location}</span>
                    {resumeData.headerSettings.detailsArrangement === 'row' && <span style={{ color: '#d1d5db' }}>|</span>}
                    <a href={`https://${resumeData.personalInfo.website}`} style={{ 
                      color: resumeData.linkSettings.blueColor ? '#2563eb' : resumeData.themeColor,
                      textDecoration: resumeData.linkSettings.underline ? 'underline' : 'none',
                      fontStyle: resumeData.linkSettings.italic ? 'italic' : 'normal',
                      display: 'flex', alignItems: 'center', gap: '4px'
                    }}>
                      {resumeData.linkSettings.linkIcon && <LinkIcon size={12} />}
                      {resumeData.personalInfo.website}
                    </a>
                  </div>
                </div>
              )}

              {/* Grid Column Render Layout */}
              {resumeData.layout.columns === 'double' ? (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: resumeData.layout.ratio === '1-1' ? '1fr 1fr' : resumeData.layout.ratio === '1-2' ? '1fr 2fr' : '2fr 1fr', 
                  gap: currentSpacing.gap 
                }}>
                  
                  {/* Left Column Sections */}
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: currentSpacing.gap,
                    borderRight: resumeData.layout.divider !== 'none' ? `1px ${resumeData.layout.divider} #e5e7eb` : 'none',
                    paddingRight: resumeData.layout.divider !== 'none' ? '20px' : '0'
                  }}>
                    {resumeData.sectionsOrder
                      .filter(sec => resumeData.sectionsConfig[sec] === 'left')
                      .map(sec => renderPreviewSection(sec))}
                  </div>

                  {/* Right Column Sections */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: currentSpacing.gap }}>
                    {resumeData.sectionsOrder
                      .filter(sec => resumeData.sectionsConfig[sec] === 'right')
                      .map(sec => renderPreviewSection(sec))}
                  </div>

                </div>
              ) : (
                /* Single Column Layout rendering all active sections in order */
                <div style={{ display: 'flex', flexDirection: 'column', gap: currentSpacing.gap }}>
                  {resumeData.sectionsOrder.map(sec => renderPreviewSection(sec))}
                </div>
              )}
            </div>

            {/* Footer Section */}
            <div style={{ 
              marginTop: '40px', 
              paddingTop: '12px', 
              borderTop: '1px solid #e5e7eb', 
              display: 'flex', 
              flexDirection: resumeData.footerSettings.alignment === 'split' ? 'row' : 'column',
              justifyContent: resumeData.footerSettings.alignment === 'split' ? 'space-between' : 'center',
              alignItems: 'center',
              fontSize: '0.75rem', 
              color: '#9ca3af',
              gap: '6px'
            }}>
              <span style={{ fontStyle: 'italic' }}>
                {resumeData.footerSettings.showName && resumeData.personalInfo.name} 
                {resumeData.footerSettings.showEmail && resumeData.footerSettings.showName && ' | '}
                {resumeData.footerSettings.showEmail && resumeData.personalInfo.email}
              </span>
              <span>{resumeData.footerSettings.customText}</span>
              <span>{resumeData.footerSettings.showPageNumber && 'Page 1 of 1'}</span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default ResumeUp;
