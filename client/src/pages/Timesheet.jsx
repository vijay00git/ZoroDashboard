import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  User,
  Building,
  Upload,
  Download,
  FileText,
  Clock,
  DatabaseBackup,
  ChevronDown,
  CalendarDays
} from 'lucide-react';

const DonutChart = ({ data }) => {
  let total = data.reduce((acc, d) => acc + d.count, 0);
  if (total === 0) total = 1;
  let currentOffset = 0;

  return (
    <svg viewBox="0 0 36 36" style={{ width: '180px', height: '180px', transform: 'rotate(-90deg)' }}>
      {data.map((d, i) => {
        if (d.count === 0) return null;
        const percent = (d.count / total) * 100;
        const dashArray = `${percent} ${100 - percent}`;
        const offset = currentOffset;
        currentOffset -= percent;

        return (
          <circle
            key={i}
            r="15.9155"
            cx="18" cy="18"
            fill="transparent"
            stroke={d.color}
            strokeWidth="5"
            strokeDasharray={dashArray}
            strokeDashoffset={offset}
            style={{ transition: 'all 0.5s ease' }}
          />
        );
      })}
    </svg>
  );
};

const TIME_OPTIONS = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 30) {
    let ampm = h >= 12 ? 'PM' : 'AM';
    let hour = h % 12 || 12;
    let min = m === 0 ? '00' : m;
    TIME_OPTIONS.push(`${hour}:${min} ${ampm}`);
  }
}

const Timesheet = () => {
  const [empId, setEmpId] = useState(localStorage.getItem('ts-empId') || '1200');
  const [empName, setEmpName] = useState(localStorage.getItem('ts-empName') || 'Vijay S');
  const [org, setOrg] = useState(localStorage.getItem('ts-org') || 'SAT');
  const [activeTimePicker, setActiveTimePicker] = useState(null);

  const [events, setEvents] = useState(() => {
    try {
      const stored = localStorage.getItem('ts-events');
      if (stored) {
        return JSON.parse(stored).map(e => ({
          ...e,
          start: e.start ? new Date(e.start) : null,
          end: e.end ? new Date(e.end) : null
        }));
      }
    } catch(err){}
    return [];
  });
  
  const icsInputRef = useRef(null);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const [rows, setRows] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('ts-empId', empId);
    localStorage.setItem('ts-empName', empName);
    localStorage.setItem('ts-org', org);
  }, [empId, empName, org]);

  useEffect(() => {
    loadMonthData(currentMonth);
  }, [currentMonth]);

  const getDaysInMonth = (year, month) => new Date(year, month, 0).getDate();

  const loadMonthData = async (monthYearStr) => {
    const [year, month] = monthYearStr.split('-').map(Number);
    const storageKey = `ts-data-${monthYearStr}`;

    try {
      const response = await fetch(`http://localhost:3000/api/timesheet/${monthYearStr}?empName=${encodeURIComponent(empName)}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.rows) && data.rows.length > 0) {
          const newRows = data.rows.map((r, idx) => {
            let dateStr = r.date;
            if (dateStr.includes('-')) {
              const parts = dateStr.split('-');
              if (parts[2] && parts[2].length === 4) {
                dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
              }
            }
            return {
              day: idx + 1,
              date: dateStr,
              dayName: r.day,
              type: r.type,
              inTime: formatAMPM(convertTo24Hour(r.inTime)),
              outTime: formatAMPM(convertTo24Hour(r.outTime)),
              projHrs: r.proj || '0:00:00',
              meetingHrs: r.meet || '0:00:00'
            };
          });
          setRows(newRows);
          if (data.empId) setEmpId(data.empId);
          if (data.empName) setEmpName(data.empName);
          if (data.org) setOrg(data.org);
          localStorage.setItem(storageKey, JSON.stringify({ empId: data.empId, empName: data.empName, org: data.org, rows: newRows }));
          return;
        }
      }
    } catch (e) { console.error("Backend load failed", e); }

    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.rows)) {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          let modified = false;
          const cleanRows = parsed.rows.map(r => {
            const parts = r.date.split('-');
            const rowDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
            if (rowDate > today && (r.inTime === '9:30 AM' || r.inTime === '09:30')) {
              modified = true;
              return { ...r, inTime: '', outTime: '', projHrs: '0:00:00', meetingHrs: '0:00:00' };
            }
            return r;
          });

          setRows(cleanRows);
          if (parsed.empId) setEmpId(parsed.empId);
          if (parsed.empName) setEmpName(parsed.empName);
          if (parsed.org) setOrg(parsed.org);
          if (modified) localStorage.setItem(storageKey, JSON.stringify({ ...parsed, rows: cleanRows }));
          return;
        }
      } catch (e) { }
    }

    const totalDays = getDaysInMonth(year, month);
    const newRows = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (let day = 1; day <= totalDays; day++) {
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isFuture = dateObj > today;

      const dayStr = String(day).padStart(2, '0');
      const monthStr = String(month).padStart(2, '0');

      newRows.push({
        day,
        date: `${dayStr}-${monthStr}-${year}`,
        dayName: dateObj.toLocaleDateString('en-US', { weekday: 'long' }),
        type: isWeekend ? 'WeekEnd' : 'Office',
        inTime: isWeekend || isFuture ? '' : '9:30 AM',
        outTime: isWeekend || isFuture ? '' : '6:30 PM',
        projHrs: isWeekend || isFuture ? '0:00:00' : '9:00:00',
        meetingHrs: '0:00:00'
      });
    }

    setRows(newRows);
    localStorage.setItem(storageKey, JSON.stringify({ empId, empName, org, rows: newRows }));
  };

  const handleRowChange = (index, field, value) => {
    const updated = [...rows];
    updated[index] = { ...updated[index], [field]: value };
    setRows(updated);
    localStorage.setItem(`ts-data-${currentMonth}`, JSON.stringify({ empId, empName, org, rows: updated }));
    saveToBackend(updated, empName, empId, org, currentMonth);
  };

  const formatToTimeStr = (minutes) => {
    if (isNaN(minutes) || minutes < 0) return '0:00:00';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}:${String(m).padStart(2, '0')}:00`;
  };

  const convertTo24Hour = (timeStr) => {
    if (!timeStr) return '';
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/i);
    if (!match) return timeStr;
    let [, h, m, ampm] = match;
    h = parseInt(h, 10);
    if (ampm) {
      ampm = ampm.toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
    }
    return `${String(h).padStart(2, '0')}:${m}`;
  };

  const formatAMPM = (timeStr) => {
    if (!timeStr) return '';
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return timeStr;
    let h = parseInt(match[1], 10);
    const m = match[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  };

  const parseTimeStrToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/i);
    if (match) {
      let [, h, m, ampm] = match;
      h = parseInt(h, 10);
      m = parseInt(m, 10);
      if (ampm) {
        ampm = ampm.toUpperCase();
        if (ampm === 'PM' && h < 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
      }
      return h * 60 + m;
    }
    const parts = timeStr.split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h * 60 + m;
  };

  const calculateRowHours = (r) => {
    if (r.type === 'WeekEnd' || r.type === 'Holiday' || r.type === 'Leave' || r.type === 'Comp Off') {
      return { extra: 0, total: 0 };
    }
    const inMin = parseTimeStrToMinutes(r.inTime);
    const outMin = parseTimeStrToMinutes(r.outTime);
    let diff = outMin - inMin;
    if (diff < 0) diff = 0;

    const extra = diff > 540 ? diff - 540 : 0;
    return { extra, total: diff };
  };

  const saveToBackend = async (currentRows, currentEmpName, currentEmpId, currentOrg, monthStr) => {
    let workingDaysCount = 0;
    let totalMinutes = 0;

    const csvRows = currentRows.map(r => {
      const isWork = r.type === 'Office' || r.type === 'WFH' || r.type === 'Working';
      if (isWork) workingDaysCount++;
      const { extra, total } = calculateRowHours(r);
      totalMinutes += total;

      return [
        r.date, r.dayName, r.type,
        formatAMPM(r.inTime), formatAMPM(r.outTime),
        formatToTimeStr(extra), r.projHrs || '0:00:00', r.meetingHrs || '0:00:00',
        formatToTimeStr(total)
      ].join(',');
    });

    const headerLine = `Month/Year,${monthStr},Employee ID,${currentEmpId},Employee Name,${currentEmpName},Organization,${currentOrg}`;
    const subHeaderLine = `Day of the month,Day,WFH / Office/ Leave,Check-in time,Check-out time,Extra Working hours,Project Hrs (Elotouch),Meeting Hrs,Total hours`;

    let monthName = new Date(monthStr + '-02').toLocaleString('default', { month: 'long' });
    const totalLine = `TOTAL,Total working days,${workingDaysCount},Data for the month:,${monthName}/${monthStr.split('-')[0]},Total approx. working hours for the month:,${formatToTimeStr(totalMinutes)}`;

    const csvContent = [headerLine, '', subHeaderLine, ...csvRows, totalLine].join('\n');
    const safeEmp = (currentEmpName || 'Unknown_Emp').replace(/ /g, '_').replace(/[^a-z0-9_.-]/gi, '_');
    const filename = `${safeEmp}_${monthStr}_Timesheet.csv`;

    try {
      await fetch('http://localhost:3000/api/timesheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, csvData: csvContent })
      });
    } catch (e) {
      console.error("Failed to save to backend", e);
    }
  };

  const handleImportCSV = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n').map(line => line.split(','));

      try {
        const headerRow = lines[0];
        if (headerRow && headerRow[0] === 'Month/Year') {
          const mMonth = headerRow[1].trim();
          setCurrentMonth(mMonth);
          setEmpId(headerRow[3] || '');
          setEmpName(headerRow[5] || '');
          setOrg(headerRow[7] || '');

          const newRows = [];
          for (let i = 3; i < lines.length; i++) {
            const row = lines[i];
            if (!row || row.length < 5 || row[0].startsWith('TOTAL') || !row[0].trim()) continue;

            const dateStr = row[0];
            const dayName = row[1];
            let type = row[2];
            const inTime = row[3];
            const outTime = row[4];

            const formatTime = (t) => t && t.length > 5 ? t.substring(0, 5) : t;
            const projHrs = row[6] || '0:00:00';
            const meetingHrs = row[7] || '0:00:00';

            const dayNum = parseInt(dateStr.split('-')[0], 10) || parseInt(dateStr.split('-')[2], 10) || 1;

            newRows.push({
              day: dayNum,
              date: dateStr,
              dayName,
              type,
              inTime: formatTime(inTime),
              outTime: formatTime(outTime),
              projHrs,
              meetingHrs
            });
          }
          setRows(newRows);
          localStorage.setItem(`ts-data-${mMonth}`, JSON.stringify({ empId: headerRow[3], empName: headerRow[5], org: headerRow[7], rows: newRows }));
          alert('Data Restored Successfully!');
        } else {
          alert('Invalid CSV format. Please upload a valid Timesheet CSV.');
        }
      } catch (err) {
        alert('Failed to parse CSV.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const parseICSDate = (dateStr) => {
    if (!dateStr) return null;
    const year = dateStr.substring(0, 4);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1;
    const day = dateStr.substring(6, 8);
    if (dateStr.length === 8) return new Date(year, month, day);
    const hour = dateStr.substring(9, 11);
    const minute = dateStr.substring(11, 13);
    return new Date(year, month, day, hour, minute);
  };

  const parseICS = (icsString) => {
    const parsedEvents = [];
    const lines = icsString.split(/\r\n|\n|\r/);
    let currentEvent = null;

    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('BEGIN:VEVENT')) {
        currentEvent = {};
      } else if (line.startsWith('END:VEVENT')) {
        if (currentEvent && currentEvent.start) parsedEvents.push(currentEvent);
        currentEvent = null;
      } else if (currentEvent) {
        if (line.startsWith('SUMMARY:')) currentEvent.summary = line.substring(8);
        if (line.startsWith('DTSTART')) currentEvent.start = parseICSDate(line.split(':')[1]);
        if (line.startsWith('DTEND')) currentEvent.end = parseICSDate(line.split(':')[1]);
      }
    }
    return parsedEvents;
  };

  const handleImportICS = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsedEvents = parseICS(text);
      setEvents(parsedEvents);
      localStorage.setItem('ts-events', JSON.stringify(parsedEvents));
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleExportCSV = () => {
    let workingDaysCount = 0;
    let totalMinutes = 0;

    const csvRows = rows.map(r => {
      const isWork = r.type === 'Office' || r.type === 'WFH' || r.type === 'Working';
      if (isWork) workingDaysCount++;

      const { extra, total } = calculateRowHours(r);
      totalMinutes += total;

      return [
        r.date,
        r.dayName,
        r.type,
        r.inTime || '',
        r.outTime || '',
        formatToTimeStr(extra),
        r.projHrs || '0:00:00',
        r.meetingHrs || '0:00:00',
        formatToTimeStr(total)
      ].join(',');
    });

    const headerLine = `Month/Year,${currentMonth},Employee ID,${empId},Employee Name,${empName},Organization,${org}`;
    const subHeaderLine = `Day of the month,Day,WFH / Office/ Leave,Check-in time,Check-out time,Extra Working hours,Project Hrs (Elotouch),Meeting Hrs,Total hours`;

    let monthName = new Date(currentMonth + '-02').toLocaleString('default', { month: 'long' });
    const totalLine = `TOTAL,Total working days,${workingDaysCount},Data for the month:,${monthName}/${currentMonth.split('-')[0]},Total approx. working hours for the month:,${formatToTimeStr(totalMinutes)}`;

    const csvContent = [headerLine, '', subHeaderLine, ...csvRows, totalLine].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Timesheet_${empName}_${currentMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  let totalWorking = 0, totalLeave = 0, totalWFH = 0, totalWeekends = 0, totalHoliday = 0, totalCompOff = 0;
  let totalMins = 0;

  rows.forEach(r => {
    const t = r.type.toLowerCase();
    if (t.includes('office') || t.includes('working')) totalWorking++;
    else if (t.includes('leave')) totalLeave++;
    else if (t.includes('wfh')) totalWFH++;
    else if (t.includes('weekend')) totalWeekends++;
    else if (t.includes('holiday')) totalHoliday++;
    else if (t.includes('comp')) totalCompOff++;

    const { total } = calculateRowHours(r);
    totalMins += total;
  });

  const totalWorkingDaysAll = totalWorking + totalWFH;
  const avgMins = totalWorkingDaysAll > 0 ? totalMins / totalWorkingDaysAll : 0;

  const donutData = [
    { label: 'Office', count: totalWorking, color: '#10b981' },
    { label: 'WFH', count: totalWFH, color: '#f59e0b' },
    { label: 'Leave', count: totalLeave, color: '#ef4444' },
    { label: 'WeekEnd', count: totalWeekends, color: '#8b5cf6' },
    { label: 'Holiday', count: totalHoliday, color: '#06b6d4' }
  ];

  const getRowStyle = (type) => {
    const t = type.toLowerCase();
    if (t.includes('weekend')) return { bg: 'rgba(255,255,255,0.02)', color: 'var(--text-muted)' };
    if (t.includes('leave') || t.includes('holiday') || t.includes('comp')) return { bg: 'rgba(244,63,94,0.05)', color: 'var(--accent-red)' };
    return { bg: 'transparent', color: '#10b981' };
  };

  const getStatusBadgeStyle = (type) => {
    const t = type.toLowerCase();
    if (t.includes('weekend')) return { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' };
    if (t.includes('leave')) return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' };
    if (t.includes('holiday')) return { bg: 'rgba(6,182,212,0.15)', color: '#06b6d4' };
    if (t.includes('comp')) return { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6' };
    if (t.includes('wfh')) return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' };
    return { bg: 'rgba(16,185,129,0.15)', color: '#10b981' };
  };

  const upcomingEvents = events
    .filter(e => e.start && e.start >= new Date(new Date().setHours(0,0,0,0)))
    .sort((a, b) => a.start - b.start)
    .slice(0, 4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '100vh', paddingBottom: '40px' }}>

      <input type="file" accept=".csv" style={{ display: 'none' }} ref={fileInputRef} onChange={handleImportCSV} />
      <input type="file" accept=".ics" style={{ display: 'none' }} ref={icsInputRef} onChange={handleImportICS} />

      {/* Top Header / Nav Bar */}
      <div style={{
        background: 'linear-gradient(90deg, #10b981, #059669)',
        borderRadius: '16px',
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 4px 20px rgba(16, 185, 129, 0.3)'
      }}>
        <h1 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: '800', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CalendarIcon size={24} /> Monthly Timesheet
        </h1>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => icsInputRef.current.click()} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CalendarDays size={16} /> Import .ics
          </button>
          <button onClick={() => fileInputRef.current.click()} style={{ background: '#fff', color: '#059669', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <DatabaseBackup size={16} /> Restore
          </button>
          <button onClick={handleExportCSV} style={{ background: 'rgba(0,0,0,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download size={16} /> Export CSV
          </button>
          <button style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={16} /> Export PDF
          </button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Month/Year</label>
          <input type="month" value={currentMonth} onChange={(e) => setCurrentMonth(e.target.value)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 14px', borderRadius: '8px', outline: 'none', fontWeight: 'bold' }} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Employee ID</label>
          <input type="text" value={empId} onChange={(e) => setEmpId(e.target.value)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 14px', borderRadius: '8px', outline: 'none', fontWeight: 'bold' }} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Employee Name</label>
          <input type="text" value={empName} onChange={(e) => setEmpName(e.target.value)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 14px', borderRadius: '8px', outline: 'none', fontWeight: 'bold' }} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Organization</label>
          <input type="text" value={org} onChange={(e) => setOrg(e.target.value)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 14px', borderRadius: '8px', outline: 'none', fontWeight: 'bold' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 300px', gap: '20px', alignItems: 'start' }}>

        {/* Left Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Status Counts */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Working</span>
              <span style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', fontSize: '0.85rem' }}>{totalWorking}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Leave</span>
              <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', fontSize: '0.85rem' }}>{totalLeave}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>WFH</span>
              <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', fontSize: '0.85rem' }}>{totalWFH}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Weekends</span>
              <span style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', fontSize: '0.85rem' }}>{totalWeekends}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Holiday</span>
              <span style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', fontSize: '0.85rem' }}>{totalHoliday}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Comp Off</span>
              <span style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold', fontSize: '0.85rem' }}>{totalCompOff}</span>
            </div>
          </div>

          {/* Totals Summary */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Month:</span>
              <span style={{ fontWeight: 'bold' }}>{currentMonth}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Working Days:</span>
              <span style={{ fontWeight: 'bold' }}>{totalWorkingDaysAll}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Total Hours:</span>
              <span style={{ fontWeight: '800', color: 'var(--accent-purple)' }}>{formatToTimeStr(totalMins)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>WFH Days:</span>
              <span style={{ fontWeight: 'bold' }}>{totalWFH}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Leave Days:</span>
              <span style={{ fontWeight: 'bold' }}>{totalLeave}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Comp Off:</span>
              <span style={{ fontWeight: 'bold' }}>{totalCompOff}</span>
            </div>
          </div>

          {/* Big Time Block */}
          <div className="glass-panel" style={{ padding: '30px 20px', textAlign: 'center', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <h2 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#10b981', margin: '0 0 10px 0' }}>{formatToTimeStr(totalMins)}</h2>
            <div style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>AVG HOURS / DAY</div>
            <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-primary)' }}>{formatToTimeStr(avgMins)}</div>
          </div>

        </div>

        {/* Middle Column: Grid */}
        <div className="glass-panel" style={{ overflowX: 'auto', padding: '0', background: 'var(--bg-primary)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '14px', borderBottom: '1px solid var(--border-color)', fontWeight: '800', letterSpacing: '0.5px' }}>DAY OF THE MONTH</th>
                <th style={{ padding: '14px', borderBottom: '1px solid var(--border-color)', fontWeight: '800', letterSpacing: '0.5px' }}>DAY</th>
                <th style={{ padding: '14px', borderBottom: '1px solid var(--border-color)', fontWeight: '800', letterSpacing: '0.5px' }}>STATUS</th>
                <th style={{ padding: '14px', borderBottom: '1px solid var(--border-color)', fontWeight: '800', letterSpacing: '0.5px' }}>CHECK-IN</th>
                <th style={{ padding: '14px', borderBottom: '1px solid var(--border-color)', fontWeight: '800', letterSpacing: '0.5px' }}>CHECK-OUT</th>
                <th style={{ padding: '14px', borderBottom: '1px solid var(--border-color)', fontWeight: '800', letterSpacing: '0.5px' }}>EXTRA HRS</th>
                <th style={{ padding: '14px', borderBottom: '1px solid var(--border-color)', fontWeight: '800', letterSpacing: '0.5px' }}>PROJECT HRS</th>
                <th style={{ padding: '14px', borderBottom: '1px solid var(--border-color)', fontWeight: '800', letterSpacing: '0.5px' }}>MEETING HRS</th>
                <th style={{ padding: '14px', borderBottom: '1px solid var(--border-color)', fontWeight: '800', letterSpacing: '0.5px' }}>TOTAL HRS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const { extra, total } = calculateRowHours(row);
                const st = getRowStyle(row.type);
                const badge = getStatusBadgeStyle(row.type);

                return (
                  <tr key={index} style={{ background: st.bg, borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }} className="nav-item-hover">
                    <td style={{ padding: '10px', fontWeight: 'bold', color: st.color }}>{row.date}</td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: st.color }}>{row.dayName}</td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ position: 'relative', display: 'inline-block', width: '100px' }}>
                        <select
                          value={row.type}
                          onChange={(e) => handleRowChange(index, 'type', e.target.value)}
                          style={{ background: badge.bg, border: `1px solid ${badge.color}40`, color: badge.color, padding: '4px 24px 4px 8px', borderRadius: '12px', outline: 'none', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', width: '100%', textAlign: 'center' }}
                        >
                          <option value="Office" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>Office</option>
                          <option value="WFH" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>WFH</option>
                          <option value="WeekEnd" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>WeekEnd</option>
                          <option value="Holiday" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>Holiday</option>
                          <option value="Leave" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>Leave</option>
                          <option value="Comp Off" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>Comp Off</option>
                        </select>
                        <ChevronDown size={14} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: badge.color, pointerEvents: 'none' }} />
                      </div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ position: 'relative', width: '100%' }}>
                        <input type="text" placeholder="HH:MM AM" value={row.inTime} onChange={(e) => handleRowChange(index, 'inTime', e.target.value)} onFocus={() => setActiveTimePicker(`${index}-inTime`)} onBlur={() => setTimeout(() => setActiveTimePicker(null), 200)} disabled={st.bg !== 'transparent'} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontWeight: 'bold', fontSize: '0.85rem', width: '100%', textAlign: 'center', outline: 'none' }} />
                        {activeTimePicker === `${index}-inTime` && (
                          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: '100px', maxHeight: '180px', overflowY: 'auto', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', zIndex: 50, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', padding: '4px' }}>
                            {TIME_OPTIONS.map(t => (
                              <div key={t} onMouseDown={(e) => { e.preventDefault(); handleRowChange(index, 'inTime', t); setActiveTimePicker(null); }} onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'} onMouseOut={(e) => e.target.style.background = 'transparent'} style={{ padding: '6px', cursor: 'pointer', color: '#fff', fontSize: '0.75rem', borderRadius: '4px', textAlign: 'center', transition: 'background 0.2s' }}>{t}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <div style={{ position: 'relative', width: '100%' }}>
                        <input type="text" placeholder="HH:MM PM" value={row.outTime} onChange={(e) => handleRowChange(index, 'outTime', e.target.value)} onFocus={() => setActiveTimePicker(`${index}-outTime`)} onBlur={() => setTimeout(() => setActiveTimePicker(null), 200)} disabled={st.bg !== 'transparent'} style={{ background: 'transparent', border: 'none', color: '#3b82f6', fontWeight: 'bold', fontSize: '0.85rem', width: '100%', textAlign: 'center', outline: 'none' }} />
                        {activeTimePicker === `${index}-outTime` && (
                          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', width: '100px', maxHeight: '180px', overflowY: 'auto', background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', zIndex: 50, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', padding: '4px' }}>
                            {TIME_OPTIONS.map(t => (
                              <div key={t} onMouseDown={(e) => { e.preventDefault(); handleRowChange(index, 'outTime', t); setActiveTimePicker(null); }} onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.1)'} onMouseOut={(e) => e.target.style.background = 'transparent'} style={{ padding: '6px', cursor: 'pointer', color: '#fff', fontSize: '0.75rem', borderRadius: '4px', textAlign: 'center', transition: 'background 0.2s' }}>{t}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px', color: 'var(--text-secondary)' }}>{formatToTimeStr(extra)}</td>
                    <td style={{ padding: '10px' }}>
                      <input type="text" value={row.projHrs} onChange={(e) => handleRowChange(index, 'projHrs', e.target.value)} disabled={st.bg !== 'transparent'} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.8rem', width: '70px', textAlign: 'center', outline: 'none' }} />
                    </td>
                    <td style={{ padding: '10px' }}>
                      <input type="text" value={row.meetingHrs} onChange={(e) => handleRowChange(index, 'meetingHrs', e.target.value)} disabled={st.bg !== 'transparent'} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.8rem', width: '70px', textAlign: 'center', outline: 'none' }} />
                    </td>
                    <td style={{ padding: '10px', fontWeight: 'bold', color: 'var(--text-primary)' }}>{formatToTimeStr(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right Column: Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Bar Chart Panel */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '300px' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '20px', fontWeight: 'bold' }}>Daily Hours Logged</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', flexGrow: 1, width: '100%', borderBottom: '1px solid var(--border-color)', borderLeft: '1px solid var(--border-color)', padding: '10px', position: 'relative' }}>
              {rows.map((r, i) => {
                const { total } = calculateRowHours(r);
                const height = total > 0 ? (total / 720) * 100 : 0; // max 12 hours = 720 mins
                return (
                  <div key={i} style={{ flex: 1, background: '#06b6d4', height: `${Math.min(height, 100)}%`, borderTopLeftRadius: '2px', borderTopRightRadius: '2px', opacity: total > 0 ? 0.8 : 0 }} title={`Day ${r.day}: ${formatToTimeStr(total)}`} />
                );
              })}
            </div>
          </div>

          {/* Donut Chart Panel */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>Status Distribution</h3>
            <div style={{ position: 'relative', width: '180px', height: '180px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <DonutChart data={donutData} />
              <div style={{ position: 'absolute', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{totalWorkingDaysAll}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Days</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
              {donutData.map(d => (
                <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
                  <div style={{ width: '10px', height: '10px', background: d.color, borderRadius: '2px' }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Events Widget */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6' }}>
              <CalendarDays size={18} />
              <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', margin: 0 }}>Upcoming Events</h3>
            </div>
            {upcomingEvents.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {upcomingEvents.map((evt, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingBottom: '12px', borderBottom: i < upcomingEvents.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{evt.summary || 'Untitled Event'}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {evt.start.toLocaleDateString()} at {evt.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                No upcoming events. Import an .ics file above.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default Timesheet;
