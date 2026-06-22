import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Clock, Activity, CheckCircle,
  Compass, Droplet, Plus, ClipboardList, Globe, Calendar,
  FileText, Database, Layers, CheckSquare, Sparkles, Terminal, User,
  Rocket
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import PomodoroTimer from '../components/PomodoroTimer';

/* ─────────────────────────────────────────────────────────────
   WORLD CLOCK (sub-component)
───────────────────────────────────────────────────────────── */
const WorldClockItem = ({ label, flag, tz, color }) => {
  const [time, setTime] = useState('--:--');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, [tz]);

  return (
    <div className="world-clock-item">
      <div className="world-clock-bar" style={{ background: color }} />
      <span className="world-clock-flag">{flag}</span>
      <span className="world-clock-time">{time}</span>
      <span className="world-clock-city">{label}</span>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   WIDGET HEADER (consistent pattern)
───────────────────────────────────────────── */
const WgtHeader = ({ icon: Icon, iconColor, title, badge, badgeVariant, right }) => (
  <div className="wgt-header">
    <div className="wgt-title">
      <Icon size={16} style={{ color: iconColor || 'var(--accent-purple)', flexShrink: 0 }} strokeWidth={2} />
      <span className="wgt-title-text">{title}</span>
    </div>
    {badge != null && (
      <span className={`wgt-badge${badgeVariant ? ` wgt-badge--${badgeVariant}` : ''}`}>{badge}</span>
    )}
    {right}
  </div>
);

/* ─────────────────────────────────────────────────────────────
   DASHBOARD
───────────────────────────────────────────── */
const Dashboard = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const displayName = localStorage.getItem('tr-display-name') || 'Zoro';
  const [scratchpadContent, setScratchpadContent] = useState('');
  const [statusDraft, setStatusDraft] = useState('');
  const [quote, setQuote] = useState('Loading daily wisdom...');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [pinnedMatrix, setPinnedMatrix] = useState(null);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [quickLinks, setQuickLinks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState('--:--');
  const [stats, setStats] = useState({ tasks: 0, water: 0, days: 0, syncs: 0 });
  const [flashcards, setFlashcards] = useState([]);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [lessonProgress, setLessonProgress] = useState({ completed: 0, total: 0 });
  const [activeGoalName, setActiveGoalName] = useState('Learning Goals');
  const [currentTime, setCurrentTime] = useState(new Date());

  /* ── Widget order (drag-to-reorder) ── */
  const [widgetOrder, setWidgetOrder] = useState(() => {
    const saved = localStorage.getItem('tr-dash-widgets');
    if (saved) {
      let parsed = JSON.parse(saved);
      // Migrate old widget ids
      const miniIdx = parsed.findIndex(w => w.id === 'status_mini_grid');
      if (miniIdx !== -1) {
        parsed.splice(miniIdx, 1, { id: 'hydration', enabled: true }, { id: 'timesheet_widget', enabled: true });
      }
      if (!parsed.find(w => w.id === 'profile_widget')) parsed.unshift({ id: 'profile_widget', enabled: true });
      localStorage.setItem('tr-dash-widgets', JSON.stringify(parsed));
      return parsed;
    }
    return [
      { id: 'profile_widget',   enabled: true },
      { id: 'tasks',            enabled: true },
      { id: 'learning',         enabled: true },
      { id: 'matrix',           enabled: true },
      { id: 'scratchpad',       enabled: true },
      { id: 'draft',            enabled: true },
      { id: 'links',            enabled: true },
      { id: 'hydration',        enabled: true },
      { id: 'timesheet_widget', enabled: true },
      { id: 'events',           enabled: true },
      { id: 'clocks',           enabled: true },
    ];
  });

  /* ── Drag handlers ── */
  const handleDragStart = (e, index) => e.dataTransfer.setData('widgetIndex', index);
  const handleDragOver  = (e) => e.preventDefault();
  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    const src = parseInt(e.dataTransfer.getData('widgetIndex'), 10);
    if (isNaN(src) || src === targetIndex) return;
    const next = [...widgetOrder];
    const [moved] = next.splice(src, 1);
    next.splice(targetIndex, 0, moved);
    setWidgetOrder(next);
    localStorage.setItem('tr-dash-widgets', JSON.stringify(next));
  };

  /* ── Live clock ── */
  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const hour = currentTime.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  /* ── Scratchpad ── */
  useEffect(() => {
    try { const s = localStorage.getItem('tr-dash-scratchpad'); if (s) setScratchpadContent(s); } catch (_) {}
  }, []);

  /* ── Status draft ── */
  useEffect(() => {
    try { const s = localStorage.getItem('tr-status-draft'); if (s) setStatusDraft(s); } catch (_) {}
  }, []);

  /* ── Daily quote ── */
  useEffect(() => {
    const fetchQuote = async () => {
      const todayStr = new Date().toDateString();
      const cachedDate  = localStorage.getItem('tr-quote-date');
      const cachedQuote = localStorage.getItem('tr-quote-text');
      if (cachedDate === todayStr && cachedQuote) { setQuote(cachedQuote); return; }

      setQuoteLoading(true);
      try {
        const key   = localStorage.getItem('zoro-ai-key');
        const model = localStorage.getItem('zoro-ai-model') || 'gemini-1.5-flash-8b';
        if (!key) { setQuote('Set your Gemini API key in Settings to get daily AI insights!'); return; }

        const res = await fetch('http://localhost:3000/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key, model,
            system: 'You are a highly motivating senior engineering mentor. Generate one very short (max 2 sentences), inspiring quote or insightful tip about programming, software engineering, or focus. No markdown or quotation marks.',
            prompt: 'Give me today\'s insight.'
          })
        });
        if (res.ok) {
          const data = await res.json();
          const clean = data.text.replace(/["']/g, '');
          setQuote(clean);
          localStorage.setItem('tr-quote-date', todayStr);
          localStorage.setItem('tr-quote-text', clean);
        } else { setQuote('Stay focused and write great code!'); }
      } catch (_) { setQuote('Stay focused and write great code!'); }
      finally { setQuoteLoading(false); }
    };
    fetchQuote();
  }, []);

  /* ── Flashcards / Learning ── */
  useEffect(() => {
    const libraryStr = localStorage.getItem('tr-goals-library');
    const currentId  = localStorage.getItem('tr-goals-active-id');
    if (libraryStr && currentId) {
      const library = JSON.parse(libraryStr);
      const activeGoal = library.find(g => g.id === currentId);
      if (activeGoal?.roadmap) {
        setActiveGoalName(activeGoal.title);
        let roadmap = activeGoal.roadmap;
        if (roadmap[0] && !roadmap[0].subtopics) roadmap = [{ subtopics: roadmap }];
        let completed = 0, total = 0, cards = [];
        roadmap.forEach(m => {
          const subs = m.subtopics || [];
          total += subs.length;
          completed += subs.filter(t => t.completed).length;
          subs.filter(t => t.lessonContent).forEach(t => {
            const clean = t.lessonContent.replace(/[*_`#]/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ');
            const sentences = clean.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 20);
            for (let i = 0; i < sentences.length; i += 3) {
              const chunk = sentences.slice(i, i + 3).join(' ');
              if (chunk.length > 80) cards.push({ title: t.title, text: chunk });
            }
          });
        });
        setLessonProgress({ completed, total });
        setFlashcards(cards.length > 0 ? cards : [{ title: 'No Lessons Yet', text: 'Generate roadmaps with lessons in Learn Skills to see flashcards here!' }]);
        return;
      }
    }
    setFlashcards([
      { title: 'Welcome', text: 'Define learning goals in the Learn Skills tab, build structured roadmaps with Gemini, and see key takeaways here.' },
      { title: 'Consistency Wins', text: 'Ten minutes of daily review beats two hours once a week. Open Learn Skills to get started.' }
    ]);
  }, []);

  const progressPct = lessonProgress.total > 0 ? Math.round((lessonProgress.completed / lessonProgress.total) * 100) : 0;
  const activeXP = lessonProgress.completed * 10;
  const getLevel = (xp) => {
    if (xp < 100)  return { title: 'Novice',      max: 100,  pct: xp,                       icon: '🥚' };
    if (xp < 300)  return { title: 'Apprentice',  max: 300,  pct: ((xp-100)/200)*100,        icon: '🌱' };
    if (xp < 600)  return { title: 'Scholar',     max: 600,  pct: ((xp-300)/300)*100,        icon: '📘' };
    if (xp < 1000) return { title: 'Expert',      max: 1000, pct: ((xp-600)/400)*100,        icon: '🔥' };
    return           { title: 'Grandmaster', max: 1000, pct: 100,                        icon: '👑' };
  };
  const lvl = getLevel(activeXP);

  /* ── Data loader ── */
  const loadAllStates = async () => {
    // Tasks
    let tasksList = [];
    try { tasksList = JSON.parse(localStorage.getItem('tr-run-tasks') || '[]'); if (!Array.isArray(tasksList)) tasksList = []; } catch (_) {}
    setTasks(tasksList);

    // Water
    const waterAmt = parseInt(localStorage.getItem('tr-water-intake-ml') || '0') || 0;

    // Timesheet
    let daysCount = 0, clockedIn = false, punchStr = '--:--';
    const now = new Date();
    const monthKey = `ts-data-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    try {
      const savedTS = localStorage.getItem(monthKey);
      if (savedTS) {
        const ts = JSON.parse(savedTS);
        if (ts?.rows) {
          daysCount = ts.rows.filter(r => r.inTime).length;
          const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
          const row = ts.rows.find(r => r.date === todayStr);
          if (row?.inTime) { clockedIn = !row.outTime; punchStr = row.inTime; }
        }
      }
    } catch (_) {}
    setIsClockedIn(clockedIn);
    setClockInTime(punchStr);

    // Quick links
    let qCount = 0, qLinks = [];
    try {
      const res = await fetch('http://localhost:3000/api/quicklaunch');
      if (res.ok) {
        const parsed = await res.json();
        if (Array.isArray(parsed)) { qCount = parsed.length; qLinks = parsed; }
      } else {
        const saved = localStorage.getItem('tr-quicklaunch-data');
        if (saved) { const p = JSON.parse(saved); if (Array.isArray(p)) { qCount = p.length; qLinks = p; } }
      }
      let flat = [];
      qLinks.forEach(item => { if (item.links) flat.push(...item.links); else if (item.url) flat.push(item); });
      flat.sort((a, b) => (b.clicks||0) - (a.clicks||0));
      setQuickLinks(flat.slice(0, 5));
    } catch (_) {}

    setStats({ tasks: tasksList.filter(t => !t.completed).length, water: waterAmt, days: daysCount, syncs: qCount });

    // Events
    try {
      const ev = localStorage.getItem('ts-events');
      if (ev) {
        const all = JSON.parse(ev).map(e => ({ ...e, start: new Date(e.start) }));
        const future = all.filter(e => e.start >= new Date(new Date().setHours(0,0,0,0))).sort((a,b) => a.start - b.start);
        setUpcomingEvents(future.slice(0, 3));
      }
    } catch (_) {}
  };

  const fetchPinnedMatrix = async () => {
    try {
      const id = localStorage.getItem('tr-sync-pinned');
      if (!id) return;
      const res = await fetch('http://localhost:3000/api/matrices');
      if (res.ok) {
        const data = await res.json();
        const found = data.matrices?.find(m => m.filename === id || m.id === id);
        if (found) setPinnedMatrix(found);
      }
    } catch (_) {}
  };

  useEffect(() => { loadAllStates(); fetchPinnedMatrix(); }, []);

  /* ── Actions ── */
  const handleToggleTask = (id) => {
    const updated = tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t);
    const done = updated.find(t => t.id === id);
    if (done?.completed) showToast('Task completed! Keep it up.', 'success');
    setTasks(updated);
    localStorage.setItem('tr-run-tasks', JSON.stringify(updated));
    loadAllStates();
  };

  const handleAddWater = () => {
    const cur = parseInt(localStorage.getItem('tr-water-intake-ml') || '0');
    const next = cur + 250;
    let logs = [];
    try { logs = JSON.parse(localStorage.getItem('tr-water-log') || '[]'); } catch (_) {}
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    localStorage.setItem('tr-water-intake-ml', String(next));
    localStorage.setItem('tr-water-log', JSON.stringify([{ id: Date.now(), time: timeStr, amount: 250 }, ...logs]));
    localStorage.setItem('tr-water-date', new Date().toDateString());
    showToast('+250 ml logged!', 'success');
    loadAllStates();
  };

  const handleTogglePunch = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const monthKey = `ts-data-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    let tsData = { empId: '', empName: 'Zoro', org: '', rows: [] };
    try { tsData = JSON.parse(localStorage.getItem(monthKey)) || tsData; } catch (_) {}
    let idx = tsData.rows.findIndex(r => r.date === todayStr);
    if (idx === -1) {
      tsData.rows.push({ day: now.getDate(), date: todayStr, dayName: now.toLocaleDateString([],{weekday:'short'}), type: 'Working', inTime: '', outTime: '', notes: '' });
      idx = tsData.rows.length - 1;
    }
    if (!isClockedIn) {
      tsData.rows[idx].inTime = timeStr; tsData.rows[idx].outTime = '';
      setIsClockedIn(true); setClockInTime(timeStr);
      showToast(`Clocked in at ${timeStr}`, 'success');
    } else {
      tsData.rows[idx].outTime = timeStr;
      setIsClockedIn(false);
      showToast(`Clocked out at ${timeStr}`, 'info');
    }
    localStorage.setItem(monthKey, JSON.stringify(tsData));
    loadAllStates();
  };

  /* ─────────────────────────────────────────────────────────────
     WIDGETS MAP
  ───────────────────────────────────────────────────────────── */
  const WATER_GOAL = 2000;
  const waterPct = Math.min(100, Math.round((stats.water / WATER_GOAL) * 100));

  const passed   = pinnedMatrix?.statusCounts?.PASSED   || 0;
  const failed   = pinnedMatrix?.statusCounts?.FAILED   || 0;
  const untested = pinnedMatrix?.statusCounts?.UNTESTED || 0;
  const total    = passed + failed + untested;
  const passPct  = total > 0 ? Math.round((passed / total) * 100) : 0;

  const widgetsMap = {

    /* ── Career Profile ── */
    profile_widget: (
      <div className="glass-panel wgt">
        <WgtHeader icon={User} iconColor="var(--accent-purple)" title="Career Profile"
          badge={`Lvl ${Math.floor(activeXP / 100)}`} badgeVariant="amber" />
        <div style={{ display:'flex', alignItems:'center', gap:'14px', background:'var(--bg-tertiary)', padding:'14px', borderRadius:'var(--radius-md)', border:'1px solid var(--border-color)' }}>
          <span style={{ fontSize:'2.2rem', lineHeight:1 }}>{lvl.icon}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}>
              <span style={{ fontSize:'0.85rem', fontWeight:'800', textTransform:'uppercase', letterSpacing:'1px', color:'var(--text-primary)' }}>{lvl.title}</span>
              <span style={{ fontSize:'0.72rem', color:'var(--accent-pink)', fontWeight:'700' }}>{activeXP} XP</span>
            </div>
            <div className="xp-bar">
              <div className="xp-fill" style={{ width: `${lvl.pct}%` }} />
            </div>
            <div style={{ fontSize:'0.6rem', color:'var(--text-muted)', marginTop:'6px', textAlign:'right' }}>
              {activeXP} / {lvl.max} XP to next level
            </div>
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <div style={{ flex:1, background:'var(--bg-tertiary)', border:'1px solid var(--border-color)', borderRadius:'var(--radius-sm)', padding:'10px', textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'1rem', fontWeight:'700', color:'var(--accent-purple)' }}>{lessonProgress.completed}</div>
            <div style={{ fontSize:'0.58rem', fontWeight:'700', letterSpacing:'1.5px', textTransform:'uppercase', color:'var(--text-muted)', marginTop:'3px' }}>Lessons</div>
          </div>
          <div style={{ flex:1, background:'var(--bg-tertiary)', border:'1px solid var(--border-color)', borderRadius:'var(--radius-sm)', padding:'10px', textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'1rem', fontWeight:'700', color:'var(--accent-cyan)' }}>{progressPct}%</div>
            <div style={{ fontSize:'0.58rem', fontWeight:'700', letterSpacing:'1.5px', textTransform:'uppercase', color:'var(--text-muted)', marginTop:'3px' }}>Progress</div>
          </div>
          <div style={{ flex:1, background:'var(--bg-tertiary)', border:'1px solid var(--border-color)', borderRadius:'var(--radius-sm)', padding:'10px', textAlign:'center' }}>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'1rem', fontWeight:'700', color:'var(--accent-green)' }}>{stats.days}</div>
            <div style={{ fontSize:'0.58rem', fontWeight:'700', letterSpacing:'1.5px', textTransform:'uppercase', color:'var(--text-muted)', marginTop:'3px' }}>Days In</div>
          </div>
        </div>
      </div>
    ),

    /* ── Focus Timer (hidden from default, kept for old saved configs) ── */
    pomodoro_widget: (
      <div className="glass-panel wgt" style={{ alignItems:'center', justifyContent:'center' }}>
        <WgtHeader icon={Clock} iconColor="var(--accent-pink)" title="Focus Timer" />
        <div style={{ padding:'16px 0' }}><PomodoroTimer /></div>
      </div>
    ),

    /* ── Active Learning ── */
    learning: (
      <div className="glass-panel wgt">
        <WgtHeader icon={Layers} iconColor="var(--accent-purple)" title="Active Learning"
          right={<span style={{ fontSize:'0.68rem', color:'var(--accent-purple)', fontWeight:'700' }}>{progressPct}%</span>} />
        <p className="wgt-subtitle">{activeGoalName}</p>
        <div className="prog-bar"><div className="prog-fill" style={{ width:`${progressPct}%` }} /></div>
        <div className="flashcard">
          <span className="flashcard-topic">{flashcards[currentCardIdx]?.title}</span>
          <p className="flashcard-text">{flashcards[currentCardIdx]?.text}</p>
          <div className="flashcard-footer">
            <span className="flashcard-count">{currentCardIdx + 1} / {flashcards.length}</span>
            <div className="flashcard-btns">
              <button className="flashcard-btn" onClick={() => setCurrentCardIdx(p => Math.max(0, p-1))} disabled={currentCardIdx === 0}>
                <ChevronLeft size={14} strokeWidth={2} />
              </button>
              <button className="flashcard-btn" onClick={() => setCurrentCardIdx(p => Math.min(flashcards.length-1, p+1))} disabled={currentCardIdx === flashcards.length-1}>
                <ChevronRight size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>
      </div>
    ),

    /* ── Upcoming Events ── */
    events: (
      <div className="glass-panel wgt">
        <WgtHeader icon={Calendar} iconColor="var(--accent-orange)" title="Upcoming Events"
          badge={upcomingEvents.length > 0 ? upcomingEvents.length : null} />
        <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
          {upcomingEvents.length === 0
            ? <div className="wgt-empty">
                <div className="wgt-empty-icon" style={{ background:'rgba(240,120,48,0.1)', color:'var(--accent-orange)' }}>
                  <Calendar size={18} />
                </div>
                <span className="wgt-empty-title">No upcoming events</span>
                <span className="wgt-empty-sub">Import a calendar in Timesheet</span>
              </div>
            : upcomingEvents.map((evt, i) => (
                <div key={i} className="event-item">
                  <div className="event-day-badge">{evt.start.getDate()}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="event-summary">{evt.summary}</div>
                    <div className="event-time">{evt.start.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
                  </div>
                </div>
              ))
          }
        </div>
      </div>
    ),

    /* ── Scratchpad ── */
    scratchpad: (
      <div className="glass-panel wgt">
        <WgtHeader icon={ClipboardList} iconColor="var(--accent-green)" title="Scratchpad"
          right={<span className="wgt-autosave">Autosaves</span>} />
        <textarea
          className="wgt-textarea"
          value={scratchpadContent}
          onChange={e => { setScratchpadContent(e.target.value); localStorage.setItem('tr-dash-scratchpad', e.target.value); }}
          placeholder="Jot down quick thoughts, commands, or snippets..."
        />
      </div>
    ),

    /* ── Status Checklist ── */
    tasks: (
      <div className="glass-panel wgt">
        <WgtHeader icon={CheckCircle} iconColor="var(--accent-cyan)" title="Status Checklist"
          badge={`${tasks.filter(t => !t.completed).length} pending`} badgeVariant="cyan" />
        <div className="task-list">
          {tasks.filter(t => !t.completed).length === 0
            ? <div className="wgt-empty">
                <div className="wgt-empty-icon"><CheckCircle size={18} /></div>
                <span className="wgt-empty-title">Inbox zero</span>
                <span className="wgt-empty-sub">All sprint tasks crushed</span>
              </div>
            : tasks.filter(t => !t.completed).slice(0, 6).map(task => {
                let due = task.deadline;
                if (due) try { const d = new Date(due); if (!isNaN(d)) due = d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); } catch (_) {}
                return (
                  <div key={task.id} className="task-item" onClick={() => handleToggleTask(task.id)}>
                    <div className="task-check" />
                    <div className="task-body">
                      <span className="task-name">{task.title}</span>
                      {due && <span className="task-due"><Clock size={9} /> {due}</span>}
                    </div>
                  </div>
                );
              })
          }
        </div>
        {tasks.filter(t => !t.completed).length > 0 && (
          <button onClick={() => navigate('/task-manager')}
            style={{ background:'transparent', border:'none', color:'var(--text-muted)', fontSize:'0.7rem', cursor:'pointer', textAlign:'left', padding:0, marginTop:'-4px' }}>
            View all in Task Manager →
          </button>
        )}
      </div>
    ),

    /* ── Daily Status Draft ── */
    draft: (
      <div className="glass-panel wgt">
        <WgtHeader icon={FileText} iconColor="var(--accent-yellow)" title="Daily Status Draft"
          right={<span className="wgt-autosave">Autosaves</span>} />
        <textarea
          className="wgt-textarea"
          value={statusDraft}
          onChange={e => { setStatusDraft(e.target.value); localStorage.setItem('tr-status-draft', e.target.value); }}
          placeholder="What did you work on today? Draft it here before your 5 PM standup..."
        />
        <button onClick={() => navigate('/status')} className="glow-btn" style={{ width:'100%', justifyContent:'center', background:'var(--bg-tertiary)', border:'1px solid var(--border-color)', color:'var(--text-secondary)', boxShadow:'none' }}>
          <Activity size={13} /> Open Daily Status
        </button>
      </div>
    ),

    /* ── Hydration ── */
    hydration: (
      <div className="glass-panel wgt">
        <WgtHeader icon={Droplet} iconColor="var(--accent-cyan)" title="Hydration"
          badge={`${waterPct}%`} badgeVariant="cyan" />
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
          <span style={{ fontFamily:'var(--font-mono)', fontSize:'1.4rem', fontWeight:'700', color:'var(--accent-cyan)' }}>
            {stats.water} <span style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontWeight:'600' }}>ml</span>
          </span>
          <span style={{ fontSize:'0.68rem', color:'var(--text-muted)', fontWeight:'600' }}>Goal: {WATER_GOAL} ml</span>
        </div>
        <div className="water-meter"><div className="water-fill" style={{ width:`${waterPct}%` }} /></div>
        <button onClick={handleAddWater} className="glow-btn"
          style={{ width:'100%', justifyContent:'center', background:'rgba(91,196,245,0.12)', color:'var(--accent-cyan)', border:'1px solid rgba(91,196,245,0.25)', boxShadow:'none' }}>
          <Plus size={13} /> Add 250 ml
        </button>
      </div>
    ),

    /* ── Timesheet ── */
    timesheet_widget: (
      <div className="glass-panel wgt">
        <WgtHeader icon={Clock} iconColor={isClockedIn ? 'var(--accent-green)' : 'var(--text-muted)'} title="Timesheet"
          badge={`${stats.days} days`} />
        <div className="punch-status">
          <div className={`punch-dot ${isClockedIn ? 'punch-dot--on' : 'punch-dot--off'}`} />
          <span className="punch-state-label">{isClockedIn ? 'Active' : 'Offline'}</span>
          {isClockedIn && <span className="punch-time">{clockInTime}</span>}
        </div>
        <button onClick={handleTogglePunch} className="glow-btn"
          style={{
            width:'100%', justifyContent:'center', boxShadow:'none',
            background: isClockedIn ? 'rgba(240,80,80,0.12)' : 'rgba(45,232,134,0.12)',
            color:       isClockedIn ? 'var(--accent-red)'   : 'var(--accent-green)',
            border:      isClockedIn ? '1px solid rgba(240,80,80,0.25)' : '1px solid rgba(45,232,134,0.25)'
          }}>
          {isClockedIn ? 'Clock Out' : 'Clock In'}
        </button>
      </div>
    ),

    /* ── Pinned Matrix ── */
    matrix: (
      <div className="glass-panel wgt">
        <WgtHeader icon={Database} iconColor="var(--accent-purple)" title="Pinned Matrix"
          badge={pinnedMatrix ? `${pinnedMatrix.testCaseCount || 0} cases` : null} />
        {pinnedMatrix ? (
          <>
            <p style={{ fontSize:'0.8rem', fontWeight:'600', color:'var(--text-primary)', wordBreak:'break-all', marginTop:'-6px' }}>
              {pinnedMatrix.name}
            </p>
            <div className="matrix-stats">
              <div className="matrix-stat" style={{ background:'rgba(45,232,134,0.08)', borderColor:'rgba(45,232,134,0.15)' }}>
                <div className="matrix-stat-val" style={{ color:'var(--accent-green)' }}>{passed}</div>
                <div className="matrix-stat-label">Passed</div>
              </div>
              <div className="matrix-stat" style={{ background:'rgba(240,80,80,0.08)', borderColor:'rgba(240,80,80,0.15)' }}>
                <div className="matrix-stat-val" style={{ color:'var(--accent-red)' }}>{failed}</div>
                <div className="matrix-stat-label">Failed</div>
              </div>
              <div className="matrix-stat" style={{ background:'rgba(245,200,66,0.08)', borderColor:'rgba(245,200,66,0.15)' }}>
                <div className="matrix-stat-val" style={{ color:'var(--accent-yellow)' }}>{untested}</div>
                <div className="matrix-stat-label">Untested</div>
              </div>
            </div>
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                <span style={{ fontSize:'0.62rem', fontWeight:'700', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px' }}>Pass rate</span>
                <span style={{ fontSize:'0.72rem', fontWeight:'700', fontFamily:'var(--font-mono)', color:'var(--accent-green)' }}>{passPct}%</span>
              </div>
              <div className="prog-bar"><div className="prog-fill" style={{ width:`${passPct}%`, background:'linear-gradient(90deg, var(--accent-green), rgba(45,232,134,0.5))' }} /></div>
            </div>
            <button onClick={() => navigate('/synchub')} className="glow-btn"
              style={{ width:'100%', justifyContent:'center', background:'var(--bg-tertiary)', border:'1px solid var(--border-color)', color:'var(--text-secondary)', boxShadow:'none' }}>
              Open Sync Hub
            </button>
          </>
        ) : (
          <div className="wgt-empty">
            <div className="wgt-empty-icon" style={{ background:'rgba(232,168,37,0.1)', color:'var(--accent-purple)' }}><Database size={18} /></div>
            <span className="wgt-empty-title">No matrix pinned</span>
            <span className="wgt-empty-sub">Pin one in Sync Hub to track it here</span>
            <button onClick={() => navigate('/synchub')} style={{ background:'var(--bg-primary)', border:'1px solid var(--border-color)', borderRadius:'20px', color:'var(--text-secondary)', cursor:'pointer', fontSize:'0.72rem', padding:'5px 12px' }}>
              Go to Sync Hub
            </button>
          </div>
        )}
      </div>
    ),

    /* ── Frequently Visited ── */
    links: (
      <div className="glass-panel wgt">
        <WgtHeader icon={Compass} iconColor="var(--accent-pink)" title="Frequently Visited" />
        <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
          {quickLinks.length === 0
            ? <div className="wgt-empty">
                <div className="wgt-empty-icon" style={{ background:'rgba(232,83,138,0.1)', color:'var(--accent-pink)' }}><Compass size={18} /></div>
                <span className="wgt-empty-title">No links yet</span>
                <span className="wgt-empty-sub">Add links in Quick Launch</span>
              </div>
            : quickLinks.map((link, i) => (
                <a key={i} href={link.url} target="_blank" rel="noreferrer" className="link-item"
                  onClick={() => fetch('http://localhost:3000/api/quicklaunch/click',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:link.id})}).catch(()=>{})}>
                  <span className="link-emoji">{link.emoji || '🔗'}</span>
                  <span className="link-name">{link.name || link.title}</span>
                  <span className="link-clicks">{link.clicks || 0}</span>
                </a>
              ))
          }
        </div>
      </div>
    ),

    /* ── World Clocks ── */
    clocks: (
      <div className="glass-panel wgt">
        <WgtHeader icon={Globe} iconColor="var(--accent-purple)" title="Global Sync" />
        <div className="world-clocks-grid">
          {[
            { label:'Tokyo',  flag:'🇯🇵', tz:'Asia/Tokyo',            color:'var(--accent-pink)' },
            { label:'London', flag:'🇬🇧', tz:'Europe/London',          color:'var(--accent-cyan)' },
            { label:'NY',     flag:'🇺🇸', tz:'America/New_York',       color:'var(--accent-purple)' },
            { label:'LA',     flag:'🇺🇸', tz:'America/Los_Angeles',    color:'var(--accent-yellow)' },
          ].map((c, i) => <WorldClockItem key={i} {...c} />)}
        </div>
      </div>
    ),
  };

  /* ─────────────────────────────────────────────────────────────
     RENDER
  ───────────────────────────────────────────────────────────── */
  const activeWidgets = widgetOrder.filter(w => w.enabled !== false);

  const QUICK_NAV = [
    { label:'Tasks',    icon:CheckSquare, href:'/task-manager' },
    { label:'Notes',    icon:FileText,    href:'/notebook' },
    { label:'Sync Hub', icon:Database,    href:'/synchub' },
    { label:'Time',     icon:Calendar,    href:'/timesheet' },
    { label:'Learn',    icon:Layers,      href:'/goal' },
    { label:'Links',    icon:Rocket,      href:'/quicklaunch' },
    { label:'Status',   icon:Activity,    href:'/status' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'20px' }}>

      {/* ── Hero ── */}
      <div className="glass-panel" style={{ overflow:'hidden' }}>

        {/* Top: greeting + directive */}
        <div className="dash-hero-body">
          <div className="dash-greeting">
            <div className="dash-greeting-eyebrow">
              <Terminal size={11} strokeWidth={2.5} />
              <span>Command Center · Active</span>
            </div>
            <h1 className="dash-greeting-h1">
              {greeting},<br />
              <span className="gradient-text">{displayName}</span>
            </h1>
          </div>

          <div className="dash-directive">
            <div className="dash-directive-eyebrow">
              <Sparkles size={11} strokeWidth={2.5} />
              <span>Daily Directive</span>
            </div>
            <p className="dash-directive-text">
              {quoteLoading ? 'Thinking…' : `"${quote}"`}
            </p>
          </div>
        </div>

        {/* Bottom strip: stats + quick nav */}
        <div className="dash-hero-foot">
          <div className="dash-stats-row">
            {[
              { val: stats.tasks,        label: 'Pending',    color: 'var(--accent-cyan)' },
              { val: `${stats.water}ml`, label: 'Hydrated',   color: 'var(--accent-cyan)' },
              { val: stats.days,         label: 'Days worked', color: 'var(--accent-purple)' },
              { val: stats.syncs,        label: 'Quick links', color: 'var(--accent-pink)' },
            ].map(s => (
              <div className="dash-stat" key={s.label}>
                <div className="dash-stat-dot" style={{ background: s.color }} />
                <div className="dash-stat-inner">
                  <span className="dash-stat-val">{s.val}</span>
                  <span className="dash-stat-label">{s.label}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="dash-quick-nav">
            {QUICK_NAV.map(({ label, icon: Icon, href }) => (
              <button key={href} className="dash-nav-btn" onClick={() => navigate(href)}>
                <Icon size={12} strokeWidth={2} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Widget Grid ── */}
      <div className="dash-grid">
        {activeWidgets.map((w, idx) => (
          <div
            key={w.id}
            className="dash-widget"
            draggable
            onDragStart={e => handleDragStart(e, widgetOrder.findIndex(x => x.id === w.id))}
            onDrop={e => handleDrop(e, widgetOrder.findIndex(x => x.id === w.id))}
            onDragOver={handleDragOver}
          >
            {widgetsMap[w.id] ?? null}
          </div>
        ))}
      </div>

    </div>
  );
};

export default Dashboard;
