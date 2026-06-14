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
  Clock
} from 'lucide-react';

const TaskManager = () => {
  // --- Tasks State ---
  const [tasks, setTasks] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDeadline, setNewTaskDeadline] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskReminder, setNewTaskReminder] = useState('none');
  const [subtaskInputs, setSubtaskInputs] = useState({});
  const [taskFilter, setTaskFilter] = useState('all');

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

  useEffect(() => {
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
      completed: false,
      subtasks: []
    };

    const updated = [...tasks, newTask];
    saveTasks(updated);
    setNewTaskTitle('');
    setNewTaskDeadline('');
    setNewTaskReminder('none');
  };

  const handleToggleTask = (id) => {
    saveTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
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
    return tasks.filter(task => {
      if (!task.deadline) return false;
      const taskDate = new Date(task.deadline);
      return taskDate.getFullYear() === currentYear && taskDate.getMonth() === currentMonth && taskDate.getDate() === day;
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
    const tsDateStr = `${dayStr}-${monthStr}-${currentYear}`;
    const tsRow = timesheetData.find(r => r.date === tsDateStr);

    let leaveType = null;
    let isWeekend = false;
    if (tsRow) {
      if (tsRow.type === 'Leave' || tsRow.type === 'Holiday' || tsRow.type === 'Comp Off') {
        leaveType = tsRow.type;
      }
      if (tsRow.type === 'WeekEnd') {
        isWeekend = true;
      }
    }

    calendarCells.push(
      <div key={`day-${d}`} style={{
        minHeight: '100px',
        background: isToday(d) ? 'rgba(168, 85, 247, 0.1)' : (isWeekend ? 'rgba(255,255,255,0.02)' : 'var(--bg-tertiary)'),
        border: isToday(d) ? '1px solid var(--accent-purple)' : '1px solid var(--border-color)',
        borderRadius: '12px',
        padding: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        transition: 'all 0.2s ease',
        cursor: 'pointer'
      }}
        className="nav-item-hover">
        <span style={{
          fontSize: '0.85rem',
          fontWeight: isToday(d) ? 'bold' : '600',
          color: isToday(d) ? 'var(--accent-purple)' : 'var(--text-secondary)',
          alignSelf: 'flex-end',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          background: isToday(d) ? 'rgba(168, 85, 247, 0.2)' : 'transparent'
        }}>{d}</span>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }} className="custom-scrollbar">

          {leaveType && (
            <div style={{ fontSize: '0.65rem', padding: '4px 6px', borderRadius: '6px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 'bold', borderLeft: '2px solid #ef4444', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {leaveType.toUpperCase()}
            </div>
          )}

          {dayEvents.map((evt, idx) => (
            <div key={`evt-${idx}`} style={{ fontSize: '0.65rem', padding: '4px 6px', borderRadius: '6px', background: 'rgba(59,130,246,0.15)', color: '#3b82f6', fontWeight: 'bold', borderLeft: '2px solid #3b82f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={evt.summary}>
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
              }} title={task.title}>
                {task.title}
              </div>
            );
          })}
        </div>
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
        <div className="glass-panel" style={{ padding: '24px' }}>
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

            <div style={{ display: 'flex', gap: '10px' }}>
              <select
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value)}
                style={{ flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 10px', borderRadius: '8px', outline: 'none', fontSize: '0.85rem' }}
              >
                <option value="high">🔴 High Priority</option>
                <option value="medium">🟡 Medium Priority</option>
                <option value="low">🟢 Low Priority</option>
              </select>

              <input
                type="datetime-local"
                value={newTaskDeadline}
                onChange={(e) => setNewTaskDeadline(e.target.value)}
                style={{ flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 10px', borderRadius: '8px', outline: 'none', fontSize: '0.85rem' }}
              />

              <select
                value={newTaskReminder}
                onChange={(e) => setNewTaskReminder(e.target.value)}
                style={{ flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 10px', borderRadius: '8px', outline: 'none', fontSize: '0.85rem' }}
              >
                <option value="none">No Reminder</option>
                <option value="15m">15 min before</option>
                <option value="1h">1 hour before</option>
                <option value="1d">1 day before</option>
              </select>
            </div>

            <button type="submit" className="glow-btn" style={{ justifyContent: 'center', padding: '12px', marginTop: '4px' }}>
              <Plus size={18} />
              Add to Status
            </button>
          </form>
        </div>

        {/* Tasks List */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
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
                          <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: task.completed ? 'var(--text-muted)' : badgeColor, textTransform: 'uppercase', letterSpacing: '1px' }}>
                            {task.completed ? 'Done' : `${task.priority} Priority`}
                          </span>
                          {task.reminder && task.reminder !== 'none' && (
                            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                              <AlertCircle size={10} /> {task.reminder}
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
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: '2px 0', paddingLeft: '32px' }}>
                        {(task.subtasks || []).map(st => (
                          <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleToggleSubtask(task.id, st.id); }}>
                            {st.completed ? <CheckSquare size={12} className="gradient-text" /> : <Square size={12} style={{ color: 'var(--text-muted)' }} />}
                            <span style={{ fontSize: '0.75rem', textDecoration: st.completed ? 'line-through' : 'none', color: st.completed ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{st.title}</span>
                          </div>
                        ))}
                        {!task.completed && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            <Plus size={12} style={{ color: 'var(--text-muted)' }} />
                            <input
                              type="text"
                              placeholder="Subtask..."
                              value={subtaskInputs[task.id] || ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setSubtaskInputs({ ...subtaskInputs, [task.id]: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleAddSubtask(task.id, subtaskInputs[task.id]);
                                  setSubtaskInputs({ ...subtaskInputs, [task.id]: '' });
                                }
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                fontSize: '0.7rem',
                                width: '100%'
                              }}
                            />
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
