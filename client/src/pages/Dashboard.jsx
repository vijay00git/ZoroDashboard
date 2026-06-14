import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play, Pause, RotateCcw, Award, ChevronLeft, ChevronRight, Clock, Activity, CheckCircle,
  Compass, Droplet, Plus, Moon, Sun, ClipboardList, Globe, Zap, Calendar, FileText, Database, Layers, CheckSquare, Sparkles, Settings, User
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

const Dashboard = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [scratchpadContent, setScratchpadContent] = useState('');

  // Extra Widgets Data
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [quickLinks, setQuickLinks] = useState([]);
  const [statusDraft, setStatusDraft] = useState('');
  const [quote, setQuote] = useState('Loading daily wisdom...');
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [pinnedMatrix, setPinnedMatrix] = useState(null);

  const [columnsCount, setColumnsCount] = useState(3);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setColumnsCount(1);
      else if (window.innerWidth < 1100) setColumnsCount(2);
      else setColumnsCount(3);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [widgetOrder, setWidgetOrder] = useState(() => {
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

  const handleDragStart = (e, index) => {
    e.dataTransfer.setData('widgetIndex', index);
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    const sourceIndex = e.dataTransfer.getData('widgetIndex');
    if (sourceIndex === '' || Number(sourceIndex) === targetIndex) return;
    const newWidgets = [...widgetOrder];
    const [moved] = newWidgets.splice(Number(sourceIndex), 1);
    newWidgets.splice(targetIndex, 0, moved);
    setWidgetOrder(newWidgets);
    localStorage.setItem('tr-dash-widgets', JSON.stringify(newWidgets));
  };

  const handleDragOver = (e) => e.preventDefault();

  // Load scratchpad
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tr-dash-scratchpad');
      if (saved) setScratchpadContent(saved);
    } catch (e) { }
  }, []);

  const handleScratchpadChange = (e) => {
    const val = e.target.value;
    setScratchpadContent(val);
    localStorage.setItem('tr-dash-scratchpad', val);
  };

  // Load Status Draft
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tr-status-draft');
      if (saved) setStatusDraft(saved);
    } catch (e) { }
  }, []);

  const handleStatusDraftChange = (e) => {
    setStatusDraft(e.target.value);
    localStorage.setItem('tr-status-draft', e.target.value);
  };

  // Fetch Daily Quote
  useEffect(() => {
    const fetchQuote = async () => {
      const todayStr = new Date().toDateString();
      const savedDate = localStorage.getItem('tr-quote-date');
      const savedQuote = localStorage.getItem('tr-quote-text');

      if (savedDate === todayStr && savedQuote) {
        setQuote(savedQuote);
        return;
      }

      setQuoteLoading(true);
      try {
        const key = localStorage.getItem('zoro-ai-key');
        const model = localStorage.getItem('zoro-ai-model') || 'gemini-1.5-flash-8b';

        if (!key) {
          setQuote("Set your Gemini API key in Settings to get daily AI insights!");
          return;
        }

        const system = "You are a highly motivating senior engineering mentor. Generate one very short (max 2 sentences), inspiring quote or insightful tip about programming, software engineering, or focus. Do not include markdown or quotation marks.";
        const prompt = "Give me today's insight.";

        const res = await fetch('http://localhost:3000/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, model, system, prompt })
        });

        if (res.ok) {
          const data = await res.json();
          const cleanQuote = data.text.replace(/["']/g, '');
          setQuote(cleanQuote);
          localStorage.setItem('tr-quote-date', todayStr);
          localStorage.setItem('tr-quote-text', cleanQuote);
        } else {
          setQuote("Stay focused and write great code!");
        }
      } catch (err) {
        setQuote("Stay focused and write great code!");
      } finally {
        setQuoteLoading(false);
      }
    };
    fetchQuote();
  }, []);

  // --- Live Clock ---
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- Theme/Greeting ---
  const hour = currentTime.getHours();
  let greeting = 'Good evening';
  if (hour < 12) greeting = 'Good morning';
  else if (hour < 17) greeting = 'Good afternoon';

  // --- Dynamic Stats ---
  const [stats, setStats] = useState({
    tasks: 0,
    water: 0,
    days: 0,
    syncs: 0
  });

  // --- Tasks State ---
  const [tasks, setTasks] = useState([]);

  // --- Timesheet Punch-in State ---
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState('--:--');

  const loadAllStates = async () => {
    // Tasks
    let tasksList = [];
    try {
      const savedTasks = localStorage.getItem('tr-run-tasks');
      if (savedTasks) {
        tasksList = JSON.parse(savedTasks);
        if (!Array.isArray(tasksList)) tasksList = [];
      }
    } catch (e) { }
    setTasks(tasksList);

    // Water
    const savedWater = localStorage.getItem('tr-water-intake-ml');
    const waterAmt = savedWater ? parseInt(savedWater) || 0 : 0;

    // Days (Timesheets)
    let daysCount = 0;
    let clockedInToday = false;
    let punchInStr = '--:--';
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const empName = localStorage.getItem('ts-empName') || 'Zoro';

    try {
      const response = await fetch(`http://localhost:3000/api/timesheet/${currentMonth}?empName=${encodeURIComponent(empName)}`);
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.rows)) {
          daysCount = data.rows.filter(r => r.inTime).length;
          const todayDateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
          const todayRow = data.rows.find(r => r.date === todayDateStr);
          if (todayRow && todayRow.inTime) {
            clockedInToday = !todayRow.outTime;
            punchInStr = todayRow.inTime;
          }
        }
      } else {
        const monthKey = `ts-data-${currentMonth}`;
        const savedTS = localStorage.getItem(monthKey);
        if (savedTS) {
          const parsedTS = JSON.parse(savedTS);
          if (parsedTS && Array.isArray(parsedTS.rows)) {
            daysCount = parsedTS.rows.filter(r => r.inTime).length;
            const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const todayRow = parsedTS.rows.find(r => r.date === todayDateStr);
            if (todayRow && todayRow.inTime) {
              clockedInToday = !todayRow.outTime;
              punchInStr = todayRow.inTime;
            }
          }
        }
      }
    } catch (e) { }

    setIsClockedIn(clockedInToday);
    setClockInTime(punchInStr);

    // Quick Launch links count & Quick Links Widget
    let qCount = 0;
    let qLinks = [];
    try {
      const res = await fetch('http://localhost:3000/api/quicklaunch');
      if (res.ok) {
        const parsedQuick = await res.json();
        if (Array.isArray(parsedQuick)) {
          qCount = parsedQuick.length;
          qLinks = parsedQuick;
        }
      } else {
        const savedQuick = localStorage.getItem('tr-quicklaunch-data');
        if (savedQuick) {
          const parsedQuick = JSON.parse(savedQuick);
          if (Array.isArray(parsedQuick)) {
            qCount = parsedQuick.length;
            qLinks = parsedQuick;
          }
        }
      }

      let extracted = [];
      qLinks.forEach(item => {
        if (item.links && Array.isArray(item.links)) {
          extracted.push(...item.links);
        } else if (item.url) {
          extracted.push(item);
        }
      });
      extracted.sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
      setQuickLinks(extracted.slice(0, 4));
    } catch (e) { }

    setStats({
      tasks: tasksList.filter(t => !t.completed).length,
      water: waterAmt,
      days: daysCount,
      syncs: qCount
    });

    // Upcoming Events
    try {
      const storedEvents = localStorage.getItem('ts-events');
      if (storedEvents) {
        const parsed = JSON.parse(storedEvents).map(e => ({ ...e, start: new Date(e.start) }));
        const futureEvents = parsed.filter(e => e.start >= new Date(new Date().setHours(0, 0, 0, 0)));
        futureEvents.sort((a, b) => a.start - b.start);
        setUpcomingEvents(futureEvents.slice(0, 3));
      }
    } catch (e) { }
  };

  const fetchPinnedMatrix = async () => {
    try {
      const pinnedId = localStorage.getItem('tr-sync-pinned');
      if (!pinnedId) return;
      const res = await fetch('http://localhost:3000/api/matrices');
      if (res.ok) {
        const data = await res.json();
        const found = data.matrices?.find(m => m.filename === pinnedId || m.id === pinnedId);
        if (found) setPinnedMatrix(found);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    loadAllStates();
    fetchPinnedMatrix();
  }, []);

  // --- Task toggle checklist ---
  const handleToggleTask = (taskId) => {
    const updated = tasks.map(t => {
      if (t.id === taskId) {
        const isNowCompleted = !t.completed;
        if (isNowCompleted) showToast(`Task completed! Keep it up.`, 'success');
        return { ...t, completed: isNowCompleted };
      }
      return t;
    });
    setTasks(updated);
    localStorage.setItem('tr-run-tasks', JSON.stringify(updated));
    loadAllStates();
  };

  // --- Quick Hydration Log ---
  const handleAddWaterQuick = () => {
    const todayStr = new Date().toDateString();
    const currentIntake = parseInt(localStorage.getItem('tr-water-intake-ml') || '0');
    const updatedIntake = currentIntake + 250;

    let logs = [];
    try {
      logs = JSON.parse(localStorage.getItem('tr-water-log') || '[]');
    } catch (e) { }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newLog = { id: Date.now(), time: timeStr, amount: 250 };
    const updatedLogs = [newLog, ...logs];

    localStorage.setItem('tr-water-intake-ml', String(updatedIntake));
    localStorage.setItem('tr-water-log', JSON.stringify(updatedLogs));
    localStorage.setItem('tr-water-date', todayStr);

    showToast(`Hydration logged! +250ml`, 'success');
    loadAllStates();
  };

  // --- Quick Timesheet Punch In / Out ---
  const handleTogglePunch = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const monthKey = `ts-data-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let tsData = { empId: '', empName: 'Zoro', org: 'Elo Systems', rows: [] };
    const savedTS = localStorage.getItem(monthKey);
    if (savedTS) {
      try { tsData = JSON.parse(savedTS); } catch (e) { }
    }

    let todayRowIdx = tsData.rows.findIndex(r => r.date === todayDateStr);
    if (todayRowIdx === -1) {
      tsData.rows.push({
        day: now.getDate(),
        date: todayDateStr,
        dayName: now.toLocaleDateString([], { weekday: 'short' }),
        type: 'Working',
        inTime: '',
        outTime: '',
        notes: ''
      });
      todayRowIdx = tsData.rows.length - 1;
    }

    if (!isClockedIn) {
      tsData.rows[todayRowIdx].inTime = timeStr;
      tsData.rows[todayRowIdx].outTime = '';
      setIsClockedIn(true);
      setClockInTime(timeStr);
      showToast(`Clocked in at ${timeStr}`, 'success');
    } else {
      tsData.rows[todayRowIdx].outTime = timeStr;
      setIsClockedIn(false);
      showToast(`Clocked out at ${timeStr}`, 'info');
    }

    localStorage.setItem(monthKey, JSON.stringify(tsData));
    loadAllStates();
  };



  // --- Flashcard Learning Widget State ---
  const [flashcards, setFlashcards] = useState([]);
  const [currentCardIdx, setCurrentCardIdx] = useState(0);
  const [lessonProgress, setLessonProgress] = useState({ completed: 0, total: 0 });
  const [activeGoalName, setActiveGoalName] = useState('Learning Goals');

  useEffect(() => {
    const libraryStr = localStorage.getItem('tr-goals-library');
    const currentId = localStorage.getItem('tr-goals-active-id');

    if (libraryStr && currentId) {
      const library = JSON.parse(libraryStr);
      const activeGoal = library.find(g => g.id === currentId);

      if (activeGoal && activeGoal.roadmap) {
        setActiveGoalName(activeGoal.title);

        let displayRoadmap = activeGoal.roadmap;
        if (displayRoadmap[0] && !displayRoadmap[0].subtopics) {
          displayRoadmap = [{ subtopics: activeGoal.roadmap }];
        }

        let completed = 0;
        let total = 0;
        let extractedCards = [];

        displayRoadmap.forEach(m => {
          const subs = m.subtopics || [];
          total += subs.length;
          completed += subs.filter(t => t.completed).length;

          const savedTopics = subs.filter(t => t.lessonContent);
          savedTopics.forEach(t => {
            const cleanText = t.lessonContent.replace(/[*_`#]/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ');
            const sentences = cleanText.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 20);

            for (let i = 0; i < sentences.length; i += 3) {
              const chunk = sentences.slice(i, i + 3).join(' ');
              if (chunk.length > 80) {
                extractedCards.push({ title: t.title, text: chunk });
              }
            }
          });
        });

        setLessonProgress({ completed, total });
        if (extractedCards.length > 0) {
          setFlashcards(extractedCards);
        } else {
          setFlashcards([
            { title: 'No Lessons Found', text: 'Generate roadmaps with lessons in the Learn Skills module to see flashcards here!' }
          ]);
        }
      }
    } else {
      setFlashcards([
        { title: 'Welcome to Learn Skills', text: 'Define your learning goals in the Learn Skills tab, build structured roadmaps using Gemini, and see key takeaways dynamically generated here!' },
        { title: 'Consistency is Key', text: 'Spend just 10 minutes every day reviewing your active roadmaps. Committing lessons to memory builds solid professional growth!' }
      ]);
    }
  }, []);

  const progressPercentage = lessonProgress.total > 0
    ? Math.round((lessonProgress.completed / lessonProgress.total) * 100)
    : 0;

  const activeXP = lessonProgress.completed * 10;
  const getLevel = (xp) => {
    if (xp < 100) return { title: 'Novice', min: 0, max: 100, pct: xp, icon: '🥚' };
    if (xp < 300) return { title: 'Apprentice', min: 100, max: 300, pct: ((xp - 100) / 200) * 100, icon: '🌱' };
    if (xp < 600) return { title: 'Scholar', min: 300, max: 600, pct: ((xp - 300) / 300) * 100, icon: '📘' };
    if (xp < 1000) return { title: 'Expert', min: 600, max: 1000, pct: ((xp - 600) / 400) * 100, icon: '🔥' };
    return { title: 'Grandmaster', min: 1000, max: 1000, pct: 100, icon: '👑' };
  };
  const currentLevel = getLevel(activeXP);

  const widgetsMap = {
    learning: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} style={{ color: 'var(--accent-purple)' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Active Learning</h3>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{activeGoalName}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(168, 85, 247, 0.1)', color: 'var(--accent-purple)', padding: '4px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' }}>
            <Award size={12} /> Lvl {currentLevel.icon}
          </div>
        </div>
        <div style={{ width: '100%', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${progressPercentage}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-purple), var(--accent-pink))' }}></div>
        </div>
        <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '12px', minHeight: '140px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {flashcards.length > 0 && (
            <>
              <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 'bold', color: 'var(--accent-pink)', marginBottom: '8px' }}>
                {flashcards[currentCardIdx]?.title}
              </span>
              <p style={{ fontSize: '0.95rem', lineHeight: '1.5', fontWeight: '500' }}>
                {flashcards[currentCardIdx]?.text}
              </p>
            </>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>
            Card {currentCardIdx + 1} / {flashcards.length}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setCurrentCardIdx(prev => Math.max(0, prev - 1))} disabled={currentCardIdx === 0} style={{ padding: '6px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer', opacity: currentCardIdx === 0 ? 0.4 : 1, color: 'var(--text-primary)' }}>
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => setCurrentCardIdx(prev => Math.min(flashcards.length - 1, prev + 1))} disabled={currentCardIdx === flashcards.length - 1} style={{ padding: '6px', borderRadius: '6px', background: 'var(--bg-tertiary)', border: 'none', cursor: 'pointer', opacity: currentCardIdx === flashcards.length - 1 ? 0.4 : 1, color: 'var(--text-primary)' }}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    ),
    events: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={18} style={{ color: 'var(--accent-orange)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Upcoming Events</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {upcomingEvents.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '24px 0', color: 'var(--text-muted)' }}>
              <Calendar size={32} style={{ opacity: 0.4 }} />
              <span style={{ fontSize: '0.85rem' }}>No upcoming events scheduled.</span>
            </div>
          ) : (
            upcomingEvents.map((evt, idx) => {
              const dateStr = evt.start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
              const timeStr = evt.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={idx} style={{ display: 'flex', gap: '12px', background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '10px', alignItems: 'center' }}>
                  <div style={{ background: 'rgba(249, 115, 22, 0.15)', color: 'var(--accent-orange)', padding: '8px', borderRadius: '8px', fontWeight: 'bold', fontSize: '0.85rem', textAlign: 'center', minWidth: '45px' }}>
                    {evt.start.getDate()}
                  </div>
                  <div style={{ flexGrow: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{evt.summary}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{dateStr} • {timeStr}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    ),
    scratchpad: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardList size={18} style={{ color: 'var(--accent-green)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Scratchpad</h3>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Autosaves</span>
        </div>
        <textarea
          value={scratchpadContent}
          onChange={handleScratchpadChange}
          placeholder="Jot down quick thoughts..."
          style={{ width: '100%', minHeight: '140px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '12px', borderRadius: '10px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', resize: 'vertical', outline: 'none' }}
        />
      </div>
    ),
    tasks: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle size={18} style={{ color: 'var(--accent-cyan)' }} />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 'bold' }}>Status Checklist</h3>
          </div>
          <span style={{ fontSize: '0.75rem', background: 'rgba(6, 182, 212, 0.1)', color: 'var(--accent-cyan)', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>
            {tasks.filter(t => !t.completed).length} Pending
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tasks.filter(t => !t.completed).length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '32px 0', background: 'var(--bg-tertiary)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-green)' }}>
                <CheckCircle size={24} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Inbox Zero</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>You've crushed all sprint tasks.</div>
              </div>
            </div>
          ) : (
            tasks.filter(t => !t.completed).slice(0, 6).map(task => {
              let formattedDate = task.deadline;
              if (formattedDate) {
                 try {
                    const d = new Date(formattedDate);
                    if (!isNaN(d.getTime())) {
                       formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }
                 } catch(e) {}
              }

              return (
                <div 
                  key={task.id} 
                  onClick={() => handleToggleTask(task.id)} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'flex-start', 
                    gap: '14px', 
                    background: 'var(--bg-tertiary)', 
                    border: '1px solid var(--border-color)', 
                    padding: '14px', 
                    borderRadius: '12px', 
                    cursor: 'pointer', 
                    transition: 'all 0.2s ease',
                    position: 'relative'
                  }} 
                  className="nav-item-hover"
                >
                  <div style={{ 
                    width: '20px', 
                    height: '20px', 
                    borderRadius: '50%', 
                    border: '2px solid var(--text-muted)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    flexShrink: 0,
                    marginTop: '2px',
                    transition: 'border-color 0.2s ease'
                  }}></div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '600', lineHeight: '1.3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {task.title}
                    </span>
                    
                    {formattedDate && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(249, 115, 22, 0.1)', color: 'var(--accent-orange)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold' }}>
                          <Clock size={10} /> {formattedDate}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    ),
    draft: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={18} style={{ color: '#fbbf24' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Daily Status Draft</h3>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Autosaves</span>
        </div>
        <textarea
          value={statusDraft}
          onChange={handleStatusDraftChange}
          placeholder="What did you work on today? Jot it down here so it's ready for 5PM..."
          style={{ width: '100%', minHeight: '120px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '12px', borderRadius: '10px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', resize: 'vertical', outline: 'none' }}
        />
      </div>
    ),
    status_mini_grid: (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center' }}>
          <Droplet size={24} style={{ color: 'var(--accent-cyan)' }} />
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Hydration</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stats.water} ml</span>
          </div>
          <button onClick={handleAddWaterQuick} className="glow-btn" style={{ width: '100%', justifyContent: 'center', background: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-cyan)', border: '1px solid rgba(6, 182, 212, 0.3)', boxShadow: 'none', padding: '8px' }}>
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', textAlign: 'center' }}>
          <Clock size={24} style={{ color: isClockedIn ? 'var(--accent-green)' : 'var(--text-muted)' }} />
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Timesheet</h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{isClockedIn ? clockInTime : 'Out'}</span>
          </div>
          <button onClick={handleTogglePunch} className="glow-btn" style={{ width: '100%', justifyContent: 'center', background: isClockedIn ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', color: isClockedIn ? 'var(--accent-red)' : 'var(--accent-green)', border: `1px solid ${isClockedIn ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`, boxShadow: 'none', padding: '8px' }}>
            {isClockedIn ? 'Out' : 'In'}
          </button>
        </div>
      </div>
    ),
    matrix: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={18} style={{ color: 'var(--accent-purple)' }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Pinned Matrix</h3>
          </div>
          {pinnedMatrix && <span style={{ fontSize: '0.75rem', background: 'var(--bg-primary)', padding: '4px 8px', borderRadius: '12px', border: '1px solid var(--border-color)', fontWeight: 'bold' }}>{pinnedMatrix.testCaseCount || 0} Cases</span>}
        </div>
        {pinnedMatrix ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
              {pinnedMatrix.name}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-green)' }}>{pinnedMatrix.statusCounts?.PASSED || 0}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Passed</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-red)' }}>{pinnedMatrix.statusCounts?.FAILED || 0}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Failed</div>
              </div>
              <div style={{ flex: 1, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent-yellow)' }}>{pinnedMatrix.statusCounts?.UNTESTED || 0}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Untested</div>
              </div>
            </div>
            <button onClick={() => navigate('/synchub')} className="glow-btn" style={{ width: '100%', justifyContent: 'center', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px', marginTop: '4px', boxShadow: 'none' }}>
              Open Sync Hub
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 0', color: 'var(--text-muted)' }}>
            <Database size={32} style={{ opacity: 0.4 }} />
            <span style={{ fontSize: '0.85rem' }}>No matrix pinned</span>
            <button onClick={() => navigate('/synchub')} style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '16px', color: 'var(--text-primary)', cursor: 'pointer' }}>
              Go to Sync Hub
            </button>
          </div>
        )}
      </div>
    ),
    links: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Compass size={18} style={{ color: 'var(--accent-pink)' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Frequently Visited</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {quickLinks.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '16px 0', color: 'var(--text-muted)' }}>
              <Compass size={28} style={{ opacity: 0.4 }} />
              <span style={{ fontSize: '0.85rem' }}>No links available.</span>
            </div>
          ) : (
            quickLinks.map((link, idx) => (
              <a key={idx} href={link.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: '10px', textDecoration: 'none', color: 'var(--text-primary)' }} className="nav-item-hover" onClick={() => { fetch('http://localhost:3000/api/quicklaunch/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: link.id }) }).catch(() => { }); }}>
                <span style={{ fontSize: '1.2rem' }}>{link.emoji || '🔗'}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{link.name || link.title}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold', background: 'var(--bg-primary)', padding: '2px 6px', borderRadius: '10px' }}>{link.clicks || 0}</span>
              </a>
            ))
          )}
        </div>
      </div>
    ),
    clocks: (
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Globe size={18} style={{ color: '#6366f1' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>World Clocks</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { label: '🇯🇵 Tokyo', tz: 'Asia/Tokyo' },
            { label: '🇬🇧 London', tz: 'Europe/London' },
            { label: '🇺🇸 New York', tz: 'America/New_York' },
            { label: '🇺🇸 Los Angeles', tz: 'America/Los_Angeles' }
          ].map((clock, idx) => (
            <WorldClockItem key={idx} label={clock.label} tz={clock.tz} />
          ))}
        </div>
      </div>
    )
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Dynamic Top Banner */}
      {/* Dynamic Top Banner */}
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'linear-gradient(to bottom, var(--accent-cyan), var(--accent-purple))' }} />

        {/* Top Section: Greeting & Stats */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '20px', alignItems: 'center' }}>

          {/* Left: Greeting & Rank Profile (Compact) */}
          <div style={{ flex: '1 1 250px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <Activity size={14} style={{ color: 'var(--accent-cyan)' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>Command Center</span>
              </div>
              <h1 style={{ fontSize: '2rem', fontWeight: '900', letterSpacing: '-1px', lineHeight: '1', margin: 0 }}>
                {greeting}, <span style={{ background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Zoro</span>
              </h1>
            </div>

            {/* Compact Profile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-tertiary)', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '1.5rem' }}>{currentLevel.icon}</div>
              <div style={{ flexGrow: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-primary)' }}>{currentLevel.title}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--accent-pink)', fontWeight: 'bold' }}>Lvl {Math.floor(activeXP / 100)}</div>
                </div>
                <div style={{ width: '100%', height: '4px', background: 'rgba(0,0,0,0.3)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${currentLevel.pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-pink), var(--accent-purple))', borderRadius: '2px' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Center: Detailed Stats Grid (Compact) */}
          <div style={{ flex: '2 1 350px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {[
              { label: 'Pending Tasks', value: stats.tasks, icon: CheckSquare, color: 'var(--accent-purple)' },
              { label: 'Hydration', value: `${stats.water}ml`, icon: Droplet, color: 'var(--accent-cyan)' },
              { label: 'Syncs', value: stats.syncs, icon: Compass, color: 'var(--accent-pink)' },
              { label: 'Streak', value: `${stats.days}d`, icon: Zap, color: 'var(--accent-green)' }
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={index} style={{ flex: '1 1 100px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ background: item.color + '15', color: item.color, padding: '8px', borderRadius: '8px', flexShrink: 0 }}>
                    <Icon size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-primary)', lineHeight: '1' }}>{item.value}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '700', marginTop: '2px' }}>{item.label}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Quote Panel (Compact) */}
          <div style={{ flex: '1 1 200px', background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.05), rgba(168, 85, 247, 0.05))', border: '1px solid rgba(6, 182, 212, 0.2)', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} style={{ color: 'var(--accent-cyan)' }} />
              <div style={{ fontSize: '0.65rem', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800' }}>Daily Directive</div>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontStyle: 'italic', lineHeight: '1.3', fontWeight: '500' }}>
              "{quoteLoading ? 'Thinking...' : quote}"
            </div>
          </div>
        </div>

        {/* Bottom Section: Quick Actions Bar (Compact) */}
        <div style={{ borderTop: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '16px', overflowX: 'auto' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800', whiteSpace: 'nowrap' }}>Quick Launch</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { label: 'Tasks', icon: CheckSquare, href: '/task-manager' },
              { label: 'Notes', icon: FileText, href: '/notebook' },
              { label: 'Sync Hub', icon: Database, href: '/synchub' },
              { label: 'Timesheet', icon: Calendar, href: '/timesheet' },
              { label: 'Learning', icon: Layers, href: '/goal' },
              { label: 'Water Log', icon: Droplet, href: '/water' },
              { label: 'Links', icon: Compass, href: '/quicklaunch' },
              { label: 'Daily Status', icon: Activity, href: '/status' },
              { label: 'Settings', icon: Settings, href: '/settings' }
            ].map((qt, idx) => {
              const QtIcon = qt.icon;
              return (
                <button key={idx} onClick={() => navigate(qt.href)} style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '16px', color: 'var(--accent-red)', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s ease'
                }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent-red)'; e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-primary)'; }}>
                  <QtIcon size={14} color="var(--accent-red)" /> {qt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Grid: Masonry Layout */}
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        {Array.from({ length: columnsCount }).map((_, colIndex) => (
          <div key={colIndex} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {widgetOrder
              .map((w, index) => ({ ...w, originalIndex: index }))
              .filter(w => w.enabled !== false)
              .filter((_, idx) => idx % columnsCount === colIndex)
              .map(w => (
                <div
                  key={w.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, w.originalIndex)}
                  onDrop={(e) => handleDrop(e, w.originalIndex)}
                  onDragOver={handleDragOver}
                  style={{ cursor: 'grab', display: 'flex', flexDirection: 'column' }}
                >
                  {widgetsMap[w.id]}
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// World Clock Item component
const WorldClockItem = ({ label, tz }) => {
  const [time, setTime] = useState('--:--');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' }));
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [tz]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 14px',
      background: 'var(--bg-tertiary)',
      border: '1px solid var(--border-color)',
      borderRadius: '8px'
    }}>
      <span style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold', color: 'var(--text-primary)' }}>{time}</span>
    </div>
  );
};

export default Dashboard;
