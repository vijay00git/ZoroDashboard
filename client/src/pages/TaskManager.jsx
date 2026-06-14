import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  CheckSquare,
  Square,
  Calendar as CalendarIcon,
  Sparkles,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCcw,
  ChevronDown,
  Flag,
  Bell,
  Repeat
} from 'lucide-react';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/themes/dark.css';

const CustomSelect = ({ value, onChange, options, icon: Icon, iconColor }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find(o => o.value === value) || options[0];

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: '140px' }}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'var(--bg-tertiary)',
          border: isOpen ? '1px solid var(--accent-purple)' : '1px solid var(--border-color)',
          color: 'var(--text-primary)',
          padding: '10px 36px 10px 38px',
          borderRadius: '10px',
          fontSize: '0.85rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.2s ease',
          boxShadow: isOpen ? '0 0 0 2px rgba(168, 85, 247, 0.2)' : 'none',
          fontWeight: 500,
          whiteSpace: 'nowrap'
        }}
      >
        <div style={{ position: 'absolute', left: '12px', display: 'flex', color: iconColor || 'var(--text-muted)', pointerEvents: 'none' }}>
          {Icon && <Icon size={16} />}
        </div>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedOption.label}</span>
        <div style={{ position: 'absolute', right: '12px', display: 'flex', color: 'var(--text-muted)', pointerEvents: 'none' }}>
          <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
        </div>
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          width: '100%',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-glow)',
          borderRadius: '10px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
          zIndex: 100,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setIsOpen(false); }}
              style={{
                padding: '10px 16px',
                fontSize: '0.85rem',
                cursor: 'pointer',
                background: value === opt.value ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
                color: value === opt.value ? 'var(--accent-purple)' : 'var(--text-primary)',
                transition: 'background 0.2s ease',
                fontWeight: value === opt.value ? 'bold' : 'normal'
              }}
              onMouseOver={(e) => { if (value !== opt.value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseOut={(e) => { if (value !== opt.value) e.currentTarget.style.background = 'transparent'; }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
      
      {isOpen && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 90 }} 
          onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
        />
      )}
    </div>
  );
};

const TaskManager = () => {
  // --- Tasks State ---
  const [tasks, setTasks] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskReminder, setNewTaskReminder] = useState('none');
  const [newTaskRecurring, setNewTaskRecurring] = useState('none');
  const [newTaskRecurringDays, setNewTaskRecurringDays] = useState([]);
  const [subtaskInputs, setSubtaskInputs] = useState({});
  const [taskFilter, setTaskFilter] = useState('all');
  const [expandedTasks, setExpandedTasks] = useState({});
  const [hoveredDay, setHoveredDay] = useState(null);

  const toggleSubtasks = (taskId) => {
    setExpandedTasks(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  // --- Calendar State ---
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [timesheetData, setTimesheetData] = useState([]);

  const LOCAL_TASKS_KEY = 'tr-run-tasks';

  // --- Initialize ---
  useEffect(() => {
    const savedTasks = localStorage.getItem(LOCAL_TASKS_KEY);
    if (savedTasks) {
      setTasks(JSON.parse(savedTasks));
    } else {
      const seed = [
        { id: 't_1', title: 'Complete timesheet log for regression test runs', deadline: new Date().toISOString(), priority: 'high', completed: false },
        { id: 't_2', title: 'Revise mastery roadmap for learning React components', deadline: '', priority: 'medium', completed: false }
      ];
      setTasks(seed);
      localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(seed));
    }

    try {
      const storedEvents = localStorage.getItem('ts-events');
      if (storedEvents) {
        const parsed = JSON.parse(storedEvents).map(e => ({
          ...e,
          start: e.start ? new Date(e.start) : null,
          end: e.end ? new Date(e.end) : null
        }));
        setCalendarEvents(parsed);
      }
    } catch (e) { }
  }, []);

  const loadTimesheetData = () => {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const key = `ts-data-${year}-${month}`;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.rows)) {
          setTimesheetData(parsed.rows);
          return;
        }
      }
    } catch (e) { }
    setTimesheetData([]);
  };

  useEffect(() => {
    loadTimesheetData();

    const handleStorage = (e) => {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const key = `ts-data-${year}-${month}`;
      if (e.key === key) {
        loadTimesheetData();
      }
    };
    
    // Also add a custom event listener in case they navigate within the same tab and storage event doesn't fire
    window.addEventListener('storage', handleStorage);
    window.addEventListener('timesheet-updated', loadTimesheetData);
    
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('timesheet-updated', loadTimesheetData);
    };
  }, [currentDate]);

  const saveTasks = (updated) => {
    setTasks(updated);
    localStorage.setItem(LOCAL_TASKS_KEY, JSON.stringify(updated));
  };

  // --- Task Handlers ---
  const handleAddTask = (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const newTask = {
      id: 't_' + Date.now(),
      title: newTaskTitle,
      deadline: newTaskDeadline,
      priority: newTaskPriority,
      reminder: newTaskReminder,
      recurring: newTaskRecurring,
      recurringDays: newTaskRecurringDays,
      completed: false,
      subtasks: []
    };

    const updated = [...tasks, newTask];
    saveTasks(updated);
    setNewTaskTitle('');
    setNewTaskDeadline('');
    setNewTaskReminder('none');
    setNewTaskRecurring('none');
    setNewTaskRecurringDays([]);
  };

  const calculateNextDeadline = (dateString, recurring, recurringDays = []) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (recurring === 'daily') date.setDate(date.getDate() + 1);
    else if (recurring === 'weekly') date.setDate(date.getDate() + 7);
    else if (recurring === 'monthly') date.setMonth(date.getMonth() + 1);
    else if (recurring === 'custom_days') {
      const currentDay = date.getDay(); // 0 is Sunday
      if (!recurringDays || recurringDays.length === 0) {
        date.setDate(date.getDate() + 7);
      } else {
        const sortedDays = [...recurringDays].sort();
        let daysToAdd = -1;
        for (let day of sortedDays) {
          if (day > currentDay) {
            daysToAdd = day - currentDay;
            break;
          }
        }
        if (daysToAdd === -1) {
          daysToAdd = (7 - currentDay) + sortedDays[0];
        }
        date.setDate(date.getDate() + daysToAdd);
      }
    }
    
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const handleToggleTask = (id) => {
    let updatedTasks = [...tasks];
    const taskIndex = updatedTasks.findIndex(t => t.id === id);
    if (taskIndex === -1) return;

    const task = updatedTasks[taskIndex];
    const isNowCompleted = !task.completed;
    updatedTasks[taskIndex] = { ...task, completed: isNowCompleted };

    // Handle Recurrence (Spawn new task)
    if (isNowCompleted && task.recurring && task.recurring !== 'none') {
      const nextDeadline = calculateNextDeadline(task.deadline, task.recurring, task.recurringDays);
      const nextTask = {
        ...task,
        id: 't_' + Date.now() + Math.random().toString(36).substr(2, 5),
        completed: false,
        deadline: nextDeadline,
        subtasks: (task.subtasks || []).map(st => ({ ...st, completed: false })) // Reset subtasks
      };
      updatedTasks.push(nextTask);
    }

    saveTasks(updatedTasks);
  };

  const handleDeleteTask = (id) => {
    saveTasks(tasks.filter(t => t.id !== id));
  };

  const handleClearCompleted = () => {
    saveTasks(tasks.filter(t => !t.completed));
  };

  const handleAddSubtask = (taskId, title) => {
    if (!title.trim()) return;
    saveTasks(tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          subtasks: [...(t.subtasks || []), { id: 's_' + Date.now(), title, completed: false }]
        };
      }
      return t;
    }));
  };

  const handleToggleSubtask = (taskId, subtaskId) => {
    saveTasks(tasks.map(t => {
      if (t.id === taskId) {
        return {
          ...t,
          subtasks: (t.subtasks || []).map(st => st.id === subtaskId ? { ...st, completed: !st.completed } : st)
        };
      }
      return t;
    }));
  };

  // --- Calculations ---
  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const getSortedTasks = () => {
    let filtered = tasks;
    if (taskFilter === 'active') filtered = tasks.filter(t => !t.completed);
    if (taskFilter === 'completed') filtered = tasks.filter(t => t.completed);

    const incomplete = filtered.filter(t => !t.completed);
    const completed = filtered.filter(t => t.completed);

    const priorityMap = { high: 1, medium: 2, low: 3 };
    incomplete.sort((a, b) => priorityMap[a.priority] - priorityMap[b.priority]);

    return [...incomplete, ...completed];
  };

  const sortedTasks = getSortedTasks();

  // --- Calendar Logic ---
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const prevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  const goToToday = () => setCurrentDate(new Date());

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const getTasksForDate = (day) => {
    const targetDayOnly = new Date(currentYear, currentMonth, day);
    const dayOfWeek = targetDayOnly.getDay();

    return tasks.filter(task => {
      if (!task.deadline) return false;
      const taskDate = new Date(task.deadline);
      const taskDayOnly = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
      
      // Exact current deadline match
      if (taskDayOnly.getTime() === targetDayOnly.getTime()) {
        return true;
      }

      // Project future recurrences for incomplete tasks
      if (task.recurring && task.recurring !== 'none' && !task.completed) {
        if (targetDayOnly > taskDayOnly) {
          if (task.recurring === 'daily') return true;
          if (task.recurring === 'weekly') return taskDate.getDay() === dayOfWeek;
          if (task.recurring === 'monthly') return taskDate.getDate() === day;
          if (task.recurring === 'custom_days') return task.recurringDays?.includes(dayOfWeek);
        }
      }
      
      return false;
    });
  };

  const isToday = (day) => {
    const today = new Date();
    return today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day;
  };

  const calendarCells = [];
  for (let i = 0; i < firstDay; i++) {
    calendarCells.push(<div key={`empty-${i}`} style={{ minHeight: '100px', background: 'rgba(0,0,0,0.1)', borderRadius: '12px' }} />);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dayTasks = getTasksForDate(d);

    const dayEvents = calendarEvents.filter(e => e.start && e.start.getFullYear() === currentYear && e.start.getMonth() === currentMonth && e.start.getDate() === d);

    const dayStr = String(d).padStart(2, '0');
    const monthStr = String(currentMonth + 1).padStart(2, '0');
    const tsDateStr1 = `${dayStr}-${monthStr}-${currentYear}`;
    const tsDateStr2 = `${currentYear}-${monthStr}-${dayStr}`;
    const tsRow = timesheetData.find(r => r.date === tsDateStr1 || r.date === tsDateStr2);

    let leaveType = null;
    let isWeekend = false;
    if (tsRow) {
      if (['Leave', 'Holiday', 'Comp Off', 'WFH'].includes(tsRow.type)) {
        leaveType = tsRow.type;
      }
      if (tsRow.type === 'WeekEnd') {
        isWeekend = true;
      }
    }

    calendarCells.push(
      <div key={`day-${d}`} 
        onMouseEnter={() => setHoveredDay(d)}
        onMouseLeave={() => setHoveredDay(null)}
        style={{
          minHeight: '100px',
          background: isToday(d) ? 'rgba(168, 85, 247, 0.1)' : (isWeekend ? 'rgba(255,255,255,0.02)' : 'var(--bg-tertiary)'),
          border: isToday(d) ? '1px solid var(--accent-purple)' : '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          transition: 'all 0.2s ease',
          cursor: 'pointer',
          position: 'relative'
        }}
        className="nav-item-hover">
        
        {/* Cell Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', marginBottom: '4px' }}>
          {/* Top Left: In/Out Times */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
            {tsRow && tsRow.inTime && tsRow.outTime && tsRow.inTime.trim() !== '' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '0.6rem', color: '#10b981', fontWeight: 'bold', lineHeight: 1 }}>↓ {tsRow.inTime}</span>
                <span style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 'bold', lineHeight: 1 }}>↑ {tsRow.outTime}</span>
              </div>
            )}
          </div>

          {/* Top Right: Status & Date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {leaveType && (
              <span style={{ 
                fontSize: '0.6rem', 
                background: leaveType === 'WFH' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)', 
                color: leaveType === 'WFH' ? '#f59e0b' : '#ef4444', 
                padding: '2px 4px', 
                borderRadius: '4px', 
                fontWeight: 'bold',
                whiteSpace: 'nowrap'
              }}>
                {leaveType.toUpperCase()}
              </span>
            )}
            <span style={{
              fontSize: '0.85rem',
              fontWeight: isToday(d) ? 'bold' : '600',
              color: isToday(d) ? 'var(--accent-purple)' : 'var(--text-secondary)',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              background: isToday(d) ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
              flexShrink: 0
            }}>{d}</span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>

          {dayEvents.map((evt, idx) => (
            <div key={`evt-${idx}`} style={{ fontSize: '0.65rem', padding: '4px 6px', borderRadius: '6px', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', fontWeight: 'bold', borderLeft: '2px solid #3b82f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              📅 {evt.summary}
            </div>
          ))}

          {dayTasks.map(task => {
            const isHigh = task.priority === 'high';
            const isLow = task.priority === 'low';
            const badgeColor = isHigh ? 'var(--accent-red)' : (isLow ? '#10b981' : '#f59e0b');

            return (
              <div key={task.id} style={{
                fontSize: '0.65rem',
                padding: '4px 6px',
                borderRadius: '6px',
                background: `rgba(${isHigh ? '244,63,94' : (isLow ? '16,185,129' : '245,158,11')}, 0.15)`,
                color: badgeColor,
                fontWeight: '600',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textDecoration: task.completed ? 'line-through' : 'none',
                opacity: task.completed ? 0.6 : 1,
                borderLeft: `2px solid ${badgeColor}`
              }}>
                {task.title}
              </div>
            );
          })}
        </div>
        
        {hoveredDay === d && (dayTasks.length > 0 || dayEvents.length > 0 || leaveType) && (
          <div style={{
            position: 'absolute',
            bottom: '105%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-glow)',
            padding: '16px',
            borderRadius: '12px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
            zIndex: 100,
            minWidth: '220px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <h4 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', fontWeight: 'bold' }}>
              {monthNames[currentMonth]} {d}, {currentYear}
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {leaveType && (
                <div style={{ fontSize: '0.75rem', padding: '6px 8px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 'bold', borderLeft: '2px solid #ef4444' }}>
                  {leaveType.toUpperCase()}
                </div>
              )}
              {dayEvents.map((evt, idx) => (
                <div key={`evt-tt-${idx}`} style={{ fontSize: '0.75rem', padding: '6px 8px', borderRadius: '6px', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', fontWeight: 'bold', borderLeft: '2px solid #3b82f6' }}>
                  📅 {evt.summary}
                </div>
              ))}
              {dayTasks.map(task => {
                const isHigh = task.priority === 'high';
                const isLow = task.priority === 'low';
                const badgeColor = isHigh ? 'var(--accent-red)' : (isLow ? '#10b981' : '#f59e0b');
                return (
                  <div key={`task-tt-${task.id}`} style={{
                    fontSize: '0.75rem',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    background: `rgba(${isHigh ? '244,63,94' : (isLow ? '16,185,129' : '245,158,11')}, 0.15)`,
                    color: badgeColor,
                    fontWeight: '600',
                    textDecoration: task.completed ? 'line-through' : 'none',
                    opacity: task.completed ? 0.6 : 1,
                    borderLeft: `2px solid ${badgeColor}`
                  }}>
                    {task.title}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  const totalCells = calendarCells.length;
  const cellsToFill = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 0; i < cellsToFill; i++) {
    calendarCells.push(<div key={`empty-end-${i}`} style={{ minHeight: '100px', background: 'rgba(0,0,0,0.1)', borderRadius: '12px' }} />);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '32px', minHeight: 'calc(100vh - 100px)', alignItems: 'start' }}>

      {/* Left Column: Calendar */}
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))', padding: '12px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarIcon size={24} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0, color: 'var(--text-primary)' }}>{monthNames[currentMonth]} {currentYear}</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, marginTop: '2px' }}>Status Calendar View</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={goToToday} style={{ padding: '8px 16px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', transition: 'all 0.2s' }} onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent-purple)'} onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}>Today</button>
            <button onClick={prevMonth} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent-purple)'} onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}><ChevronLeft size={18} /></button>
            <button onClick={nextMonth} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--accent-purple)'} onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}><ChevronRight size={18} /></button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px', marginTop: '10px' }}>
          {dayNames.map(day => (
            <div key={day} style={{ textAlign: 'center', fontWeight: '800', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>{day}</div>
          ))}
          {calendarCells}
        </div>
      </div>

      {/* Right Column: Add Task & List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Add Task Card */}
        <div className="glass-panel" style={{ padding: '24px', position: 'relative', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sparkles size={18} color="#fff" />
            </div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: 0, color: 'var(--text-primary)' }}>New Task</h3>
          </div>

          <form onSubmit={handleAddTask} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input
              type="text"
              placeholder="What needs to be done?"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                padding: '10px 14px',
                borderRadius: '10px',
                outline: 'none',
                fontSize: '0.9rem'
              }}
              required
            />

            <style>{`
              .premium-input-group {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                gap: 12px;
              }
              .premium-select-wrapper {
                position: relative;
                width: 100%;
              }
              .premium-select, .premium-date {
                width: 100%;
                appearance: none;
                background: var(--bg-tertiary);
                border: 1px solid var(--border-color);
                color: var(--text-primary);
                padding: 10px 36px 10px 38px;
                border-radius: 10px;
                outline: none;
                font-size: 0.85rem;
                transition: all 0.2s ease;
                font-weight: 500;
                cursor: pointer;
              }
              .premium-date {
                padding: 10px 14px 10px 38px;
              }
              .premium-select:hover, .premium-date:hover {
                background: rgba(255,255,255,0.05);
                border-color: rgba(255,255,255,0.1);
              }
              .premium-select:focus, .premium-date:focus {
                border-color: var(--accent-purple);
                box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.2);
              }
              .premium-icon-left {
                position: absolute;
                left: 12px;
                top: 50%;
                transform: translateY(-50%);
                color: var(--text-muted);
                pointer-events: none;
                display: flex;
                align-items: center;
              }
              .premium-icon-right {
                position: absolute;
                right: 12px;
                top: 50%;
                transform: translateY(-50%);
                color: var(--text-muted);
                pointer-events: none;
                display: flex;
                align-items: center;
              }
              .premium-date::-webkit-calendar-picker-indicator {
                position: absolute;
                right: 0;
                top: 0;
                width: 100%;
                height: 100%;
                opacity: 0;
                cursor: pointer;
              }
            `}</style>

            <div className="premium-input-group">
              <CustomSelect
                value={newTaskPriority}
                onChange={setNewTaskPriority}
                icon={Flag}
                iconColor={newTaskPriority === 'high' ? '#f43f5e' : (newTaskPriority === 'medium' ? '#f59e0b' : '#10b981')}
                options={[
                  { value: 'high', label: 'High Priority' },
                  { value: 'medium', label: 'Medium Priority' },
                  { value: 'low', label: 'Low Priority' }
                ]}
              />

              <div className="premium-select-wrapper">
                <div className="premium-icon-left"><Clock size={16} /></div>
                <Flatpickr
                  data-enable-time
                  value={newTaskDeadline}
                  onChange={([date]) => {
                    if (date) {
                      const offset = date.getTimezoneOffset() * 60000;
                      const localISOTime = (new Date(date - offset)).toISOString().slice(0, 16);
                      setNewTaskDeadline(localISOTime);
                    } else {
                      setNewTaskDeadline('');
                    }
                  }}
                  options={{
                    dateFormat: "Y-m-d H:i",
                    time_24hr: true,
                    disableMobile: true,
                    placeholder: "Select deadline..."
                  }}
                  className="premium-date"
                />
              </div>

              <CustomSelect
                value={newTaskReminder}
                onChange={setNewTaskReminder}
                icon={Bell}
                options={[
                  { value: 'none', label: 'No Reminder' },
                  { value: '15m', label: '15 min before' },
                  { value: '1h', label: '1 hour before' },
                  { value: '1d', label: '1 day before' }
                ]}
              />

              <CustomSelect
                value={newTaskRecurring}
                onChange={setNewTaskRecurring}
                icon={Repeat}
                options={[
                  { value: 'none', label: 'No Repeat' },
                  { value: 'daily', label: 'Daily' },
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'custom_days', label: 'Custom Days' }
                ]}
              />
            </div>

            {newTaskRecurring === 'custom_days' && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px', background: 'var(--bg-tertiary)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => {
                  const isSelected = newTaskRecurringDays.includes(index);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setNewTaskRecurringDays(prev => prev.filter(d => d !== index));
                        } else {
                          setNewTaskRecurringDays(prev => [...prev, index]);
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: isSelected ? '1px solid rgba(59,130,246,0.4)' : '1px solid var(--border-color)',
                        background: isSelected ? 'rgba(59,130,246,0.15)' : 'transparent',
                        color: isSelected ? '#3b82f6' : 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            )}

            <button type="submit" className="glow-btn" style={{ justifyContent: 'center', padding: '12px', marginTop: '4px' }}>
              <Plus size={18} />
              Add to Status
            </button>
          </form>
        </div>

        {/* Tasks List */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative', zIndex: 1 }}>
          {/* Header & Radial Progress */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h4 style={{ fontWeight: '800', fontSize: '1.3rem', marginBottom: '4px', color: 'var(--text-primary)', margin: 0 }}>Tasks Queue</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, marginTop: '4px' }}>
                {completedCount} of {totalCount} tasks completed
              </p>
            </div>

            <div style={{ position: 'relative', width: '56px', height: '56px' }}>
              <svg width="56" height="56" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="url(#gradient)" strokeWidth="3" strokeDasharray={`${progressPercent}, 100`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s ease' }} />
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--accent-purple)" />
                    <stop offset="100%" stopColor="var(--accent-pink)" />
                  </linearGradient>
                </defs>
              </svg>
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                {progressPercent}%
              </div>
            </div>
          </div>

          {/* Filter Tabs & Clear */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-primary)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              {['all', 'active', 'completed'].map(f => (
                <button
                  key={f}
                  onClick={() => setTaskFilter(f)}
                  style={{
                    padding: '6px 16px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    textTransform: 'capitalize',
                    border: 'none',
                    background: taskFilter === f ? 'rgba(139,92,246,0.15)' : 'transparent',
                    color: taskFilter === f ? 'var(--accent-purple)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {f}
                </button>
              ))}
            </div>

            {completedCount > 0 && (
              <button
                onClick={handleClearCompleted}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(244,63,94,0.3)',
                  color: 'var(--accent-red)',
                  fontSize: '0.75rem',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(244,63,94,0.1)'; e.currentTarget.style.borderColor = 'var(--accent-red)'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(244,63,94,0.3)'; }}
              >
                <Trash2 size={12} /> Clear Done
              </button>
            )}
          </div>

          <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '500px', overflowY: 'auto', paddingRight: '8px' }}>
            {sortedTasks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                <CheckSquare size={48} style={{ strokeWidth: '1.5', opacity: 0.3, marginBottom: '12px' }} />
                <p style={{ fontSize: '0.9rem', fontWeight: '500', margin: 0 }}>No tasks found.</p>
                <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>Add a task above to schedule it on the calendar!</p>
              </div>
            ) : (
              sortedTasks.map(task => {
                const isHigh = task.priority === 'high';
                const isLow = task.priority === 'low';
                const badgeColor = isHigh ? 'var(--accent-red)' : (isLow ? '#10b981' : '#f59e0b');

                return (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      background: task.completed ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.03)',
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.05)',
                      borderLeft: `4px solid ${task.completed ? 'var(--border-color)' : badgeColor}`,
                      opacity: task.completed ? 0.7 : 1,
                      transition: 'all 0.3s ease',
                      transform: 'translateY(0)',
                      position: 'relative'
                    }}
                    onMouseOver={(e) => {
                      if (!task.completed) {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                        e.currentTarget.style.borderLeftColor = badgeColor;
                      }
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.background = task.completed ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.03)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                      e.currentTarget.style.borderLeftColor = task.completed ? 'var(--border-color)' : badgeColor;
                    }}
                  >
                    {/* Top Header: Checkbox, Metadata, Title, and Delete */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <div
                        onClick={() => handleToggleTask(task.id)}
                        style={{
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          marginTop: '2px', flexShrink: 0,
                          color: task.completed ? badgeColor : 'var(--text-muted)',
                          transition: 'all 0.2s ease', opacity: task.completed ? 1 : 0.6
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = task.completed ? badgeColor : 'var(--text-primary)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.opacity = task.completed ? 1 : 0.6; e.currentTarget.style.color = task.completed ? badgeColor : 'var(--text-muted)'; }}
                      >
                        {task.completed ? <CheckSquare size={22} /> : <Square size={22} />}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
                          {task.deadline && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '3px', background: 'rgba(6,182,212,0.15)', padding: '2px 6px', borderRadius: '6px' }}>
                              <Clock size={10} />
                              {new Date(task.deadline).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          )}
                          <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: task.completed ? 'var(--text-muted)' : badgeColor, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px', background: task.completed ? 'transparent' : `rgba(${isHigh ? '244,63,94' : (isLow ? '16,185,129' : '245,158,11')}, 0.1)`, padding: '2px 8px', borderRadius: '12px', border: task.completed ? '1px solid var(--border-color)' : `1px solid ${badgeColor}` }}>
                            {!task.completed && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: badgeColor, boxShadow: `0 0 8px ${badgeColor}` }} />}
                            {task.completed ? 'Done' : `${task.priority} Priority`}
                          </span>
                          {task.reminder && task.reminder !== 'none' && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <AlertCircle size={10} /> {task.reminder}
                            </span>
                          )}
                          {task.recurring && task.recurring !== 'none' && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px', background: 'rgba(16,185,129,0.15)', padding: '2px 6px', borderRadius: '6px', textTransform: 'capitalize' }}>
                              <RefreshCcw size={10} /> 
                              {task.recurring === 'custom_days' && task.recurringDays?.length
                                ? task.recurringDays.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')
                                : task.recurring === 'custom_days' ? 'Custom' : task.recurring}
                            </span>
                          )}
                        </div>
                        <h4 style={{ fontSize: '0.95rem', fontWeight: '700', color: task.completed ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: task.completed ? 'line-through' : 'none', lineHeight: '1.4', margin: 0, marginTop: '4px' }}>
                          {task.title}
                        </h4>
                      </div>

                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                        style={{
                          background: 'transparent', border: 'none', color: 'var(--text-muted)',
                          padding: '4px', borderRadius: '4px', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease',
                          flexShrink: 0, marginTop: '-2px', marginRight: '-4px'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.color = 'var(--accent-red)'; e.currentTarget.style.background = 'rgba(244,63,94,0.1)'; }}
                        onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                        title="Delete Task"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Subtasks */}
                    {(task.subtasks?.length > 0 || !task.completed) && (
                      <div style={{ marginTop: '8px', paddingLeft: '32px' }}>
                        {task.subtasks?.length > 0 && (
                          <div 
                            onClick={(e) => { e.stopPropagation(); toggleSubtasks(task.id); }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'rgba(255,255,255,0.03)', padding: '6px 12px', borderRadius: '8px', marginBottom: '8px', border: '1px solid var(--border-color)' }}
                          >
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                              Subtasks ({task.subtasks.filter(st => st.completed).length}/{task.subtasks.length})
                            </span>
                            <div style={{ flex: 1, margin: '0 12px', height: '6px', background: 'var(--bg-primary)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${(task.subtasks.filter(st => st.completed).length / task.subtasks.length) * 100}%`, background: 'linear-gradient(90deg, var(--accent-purple), var(--accent-pink))', transition: 'width 0.3s ease' }} />
                            </div>
                            <ChevronRight size={14} style={{ color: 'var(--text-muted)', transform: expandedTasks[task.id] ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                          </div>
                        )}

                        {(!task.subtasks?.length || expandedTasks[task.id] || (!task.completed && !task.subtasks?.length)) && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {(task.subtasks || []).map(st => (
                              <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '4px 0' }} onClick={(e) => { e.stopPropagation(); handleToggleSubtask(task.id, st.id); }}>
                                {st.completed ? <CheckSquare size={14} className="gradient-text" /> : <Square size={14} style={{ color: 'var(--text-muted)' }} />}
                                <span style={{ fontSize: '0.8rem', textDecoration: st.completed ? 'line-through' : 'none', color: st.completed ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{st.title}</span>
                              </div>
                            ))}
                            {!task.completed && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', padding: '4px 0' }}>
                                <Plus size={14} style={{ color: 'var(--text-muted)' }} />
                                <input
                                  type="text"
                                  placeholder="Add a subtask..."
                                  value={subtaskInputs[task.id] || ''}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setSubtaskInputs({ ...subtaskInputs, [task.id]: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleAddSubtask(task.id, subtaskInputs[task.id]);
                                      setSubtaskInputs({ ...subtaskInputs, [task.id]: '' });
                                      setExpandedTasks(prev => ({ ...prev, [task.id]: true }));
                                    }
                                  }}
                                  style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-primary)',
                                    outline: 'none',
                                    fontSize: '0.8rem',
                                    width: '100%'
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default TaskManager;
