const fs = require('fs');

const code = `import React, { useState, useEffect, useRef } from 'react';
import { 
  Calendar as CalendarIcon, 
  User, 
  Building, 
  FileSpreadsheet, 
  Download, 
  Clipboard, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Check, 
  HelpCircle,
  Clock,
  LogOut,
  MapPin,
  CalendarDays,
  Upload
} from 'lucide-react';

const Timesheet = () => {
  // Emp stats
  const [empId, setEmpId] = useState(localStorage.getItem('ts-empId') || '');
  const [empName, setEmpName] = useState(localStorage.getItem('ts-empName') || 'Zoro');
  const [org, setOrg] = useState(localStorage.getItem('ts-org') || 'Elo Systems');

  // Month
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return \`\${now.getFullYear()}-\${String(now.getMonth() + 1).padStart(2, '0')}\`;
  });

  // Calendar sync states
  const [calUrl, setCalUrl] = useState(localStorage.getItem('ts-cal-url') || '');
  const [calStatus, setCalStatus] = useState('');
  const [eventsList, setEventsList] = useState([]);

  // Table rows for selected month
  const [rows, setRows] = useState([]);
  const [historyList, setHistoryList] = useState([]);
  
  const fileInputRef = useRef(null);

  // Sync state
  useEffect(() => {
    localStorage.setItem('ts-empId', empId);
  }, [empId]);
  useEffect(() => {
    localStorage.setItem('ts-empName', empName);
  }, [empName]);
  useEffect(() => {
    localStorage.setItem('ts-org', org);
  }, [org]);

  // Load timesheet data for month
  useEffect(() => {
    loadMonthData(currentMonth);
    loadHistoryDropdown();
  }, [currentMonth]);

  const saveToBackend = async (currentRows, currentEmpName, currentEmpId, currentOrg) => {
    const safeEmp = (currentEmpName || 'Unknown_Emp').replace(/ /g, '_').replace(/[^a-z0-9_.-]/gi, '_');
    const filename = \`\${safeEmp}_\${currentMonth}_Timesheet.csv\`;
    
    const headerLine = \`Month/Year,\${currentMonth},Employee ID,\${currentEmpId || ''},Employee Name,\${currentEmpName || ''},Organization,\${currentOrg || ''}\`;
    const subHeaderLine = \`Day of the month,Day,WFH / Office/ Leave,Check-in time,Check-out time,Extra Working hours,Project Hrs (Elotouch),Meeting Hrs,Total hours\`;
    
    let workingDaysCount = 0;
    let totalMinutes = 0;
    
    const csvRows = currentRows.map(r => {
      let csvType = r.type;
      if (r.type === 'Working') csvType = 'Office';
      else if (r.type === 'Weekend') csvType = 'WeekEnd';
      else if (r.type === 'Sick/Casual Leave') csvType = 'Leave';
      else if (r.type === 'Compensation Leave') csvType = 'Compensation Leave';
      else if (r.type === 'Public Holiday') csvType = 'Public Holiday';

      const isWork = csvType === 'Office' || csvType === 'WFH' || csvType === 'Working';
      if (isWork) workingDaysCount++;
      
      const hours = calculateHours(r.inTime, r.outTime);
      const minutes = Math.round(hours * 60);
      totalMinutes += minutes;
      
      const hStr = Math.floor(minutes / 60);
      const mStr = minutes % 60;
      const totalTimeStr = \`\${hStr}:\${String(mStr).padStart(2, '0')}:00\`;
      
      let extraStr = '0:00:00';
      if (hours > 9) {
        const extraMin = Math.round((hours - 9) * 60);
        const eh = Math.floor(extraMin / 60);
        const em = extraMin % 60;
        extraStr = \`\${eh}:\${String(em).padStart(2, '0')}:00\`;
      }
      
      let formattedDate = r.date;
      if (r.date.includes('-')) {
        const parts = r.date.split('-');
        if (parts[0].length === 4) {
          formattedDate = \`\${parts[2]}-\${parts[1]}-\${parts[0]}\`;
        }
      }
      
      return [
        formattedDate,
        r.dayName,
        csvType,
        r.inTime || '',
        r.outTime || '',
        extraStr,
        totalTimeStr,
        '0:00:00',
        totalTimeStr
      ].join(',');
    });

    const totH = Math.floor(totalMinutes / 60);
    const totM = totalMinutes % 60;
    const totStr = \`\${totH}:\${String(totM).padStart(2, '0')}:00\`;
    
    let monthName = 'June';
    try {
      monthName = new Date(currentMonth + '-02').toLocaleString('default', { month: 'long' });
    } catch (e) {}
    
    const totalLine = \`TOTAL,Total working days,\${workingDaysCount},Data for the month:,\${monthName}/\${currentMonth.split('-')[0]},Total approx. working hours for the month:,\${totStr}\`;
    
    const csvContent = [
      headerLine,
      '',
      subHeaderLine,
      ...csvRows,
      totalLine
    ].join('\\n');

    try {
      await fetch('http://localhost:3000/api/timesheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          csvData: csvContent
        })
      });
    } catch (e) {
      console.error("Failed to save timesheet to backend:", e);
    }
  };

  const loadHistoryDropdown = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/timesheets');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.months) && data.months.length > 0) {
          setHistoryList(data.months.sort().reverse());
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to load timesheet history list from backend:", e);
    }

    const history = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ts-data-')) {
        const dateKey = key.replace('ts-data-', '');
        if (!history.includes(dateKey)) {
          history.push(dateKey);
        }
      }
    }
    history.sort().reverse();
    setHistoryList(history);
  };

  const getDaysInMonth = (year, month) => {
    return new Date(year, month, 0).getDate();
  };

  const loadMonthData = async (monthYearStr) => {
    const [year, month] = monthYearStr.split('-').map(Number);
    
    try {
      const response = await fetch(\`http://localhost:3000/api/timesheet/\${monthYearStr}?empName=\${encodeURIComponent(empName)}\`);
      if (response.ok) {
        const data = await response.json();
        if (data.empId) setEmpId(data.empId);
        if (data.empName) setEmpName(data.empName);
        if (data.org) setOrg(data.org);
        
        if (Array.isArray(data.rows) && data.rows.length > 0) {
          const mappedRows = data.rows.map((r, idx) => {
            let dateStr = r.date;
            if (r.date.includes('-')) {
              const parts = r.date.split('-');
              if (parts[2] && parts[2].length === 4) {
                dateStr = \`\${parts[2]}-\${parts[1]}-\${parts[0]}\`;
              }
            }
            
            let scheduleType = r.type;
            if (r.type === 'Office' || r.type === 'Working') scheduleType = 'Working';
            else if (r.type === 'WeekEnd') scheduleType = 'Weekend';
            else if (r.type === 'Leave') scheduleType = 'Sick/Casual Leave';

            return {
              day: idx + 1,
              date: dateStr,
              dayName: r.day,
              type: scheduleType,
              inTime: r.inTime || '',
              outTime: r.outTime || '',
              notes: r.proj && r.proj !== '0:00:00' ? \`Project: \${r.proj}\` : ''
            };
          });
          setRows(mappedRows);
          return;
        }
      }
    } catch (e) {
      console.warn("Could not load from backend timesheet, falling back to local/default:", e);
    }

    const storageKey = \`ts-data-\${monthYearStr}\`;
    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.rows)) {
          setRows(parsed.rows);
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }

    const totalDays = getDaysInMonth(year, month);
    const newRows = [];

    for (let day = 1; day <= totalDays; day++) {
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      newRows.push({
        day,
        date: \`\${year}-\${String(month).padStart(2, '0')}-\${String(day).padStart(2, '0')}\`,
        dayName: dateObj.toLocaleDateString([], { weekday: 'short' }),
        type: isWeekend ? 'Weekend' : 'Working',
        inTime: isWeekend ? '' : '09:00',
        outTime: isWeekend ? '' : '18:00',
        notes: ''
      });
    }

    setRows(newRows);
    localStorage.setItem(storageKey, JSON.stringify({ empId, empName, org, rows: newRows }));
  };

  const handleRowChange = (dayIndex, field, value) => {
    const updated = [...rows];
    updated[dayIndex] = { ...updated[dayIndex], [field]: value };
    setRows(updated);

    const storageKey = \`ts-data-\${currentMonth}\`;
    localStorage.setItem(storageKey, JSON.stringify({ empId, empName, org, rows: updated }));
    saveToBackend(updated, empName, empId, org);
  };

  const handleImportCSV = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\\n').map(line => line.split(','));
      
      try {
        const headerRow = lines[0];
        if (headerRow && headerRow[0] === 'Month/Year') {
          const mMonth = headerRow[1];
          const mEmpId = headerRow[3];
          const mEmpName = headerRow[5];
          const mOrg = headerRow[7];

          setCurrentMonth(mMonth);
          setEmpId(mEmpId);
          setEmpName(mEmpName);
          setOrg(mOrg);

          const newRows = [];
          for (let i = 3; i < lines.length; i++) {
            const row = lines[i];
            if (!row || row.length < 5 || row[0] === 'TOTAL' || row[0] === '' || !row[0].trim()) continue;

            let dateStr = row[0];
            const dayName = row[1];
            let rawType = row[2];
            const inTime = row[3];
            const outTime = row[4];
            
            let type = 'Working';
            if (rawType === 'Office' || rawType === 'Working') type = 'Working';
            else if (rawType === 'WFH') type = 'WFH';
            else if (rawType === 'WeekEnd') type = 'Weekend';
            else if (rawType === 'Leave') type = 'Sick/Casual Leave';
            else if (rawType === 'Compensation Leave') type = 'Compensation Leave';
            else if (rawType === 'Public Holiday') type = 'Public Holiday';

            // Ensure date format is YYYY-MM-DD
            if (dateStr.includes('-')) {
                const parts = dateStr.split('-');
                if (parts[2].length === 4) { // DD-MM-YYYY -> YYYY-MM-DD
                    dateStr = \`\${parts[2]}-\${parts[1]}-\${parts[0]}\`;
                }
            }

            const dayNum = parseInt(dateStr.split('-')[2], 10);

            newRows.push({
              day: dayNum,
              date: dateStr,
              dayName,
              type,
              inTime,
              outTime,
              notes: ''
            });
          }

          setRows(newRows);
          const storageKey = \`ts-data-\${mMonth}\`;
          localStorage.setItem(storageKey, JSON.stringify({ empId: mEmpId, empName: mEmpName, org: mOrg, rows: newRows }));
          alert('CSV imported successfully!');
          loadHistoryDropdown();
        } else {
          alert('Invalid CSV format. Ensure you import a valid Zoro Dashboard Timesheet CSV.');
        }
      } catch (err) {
        console.error("Error parsing CSV:", err);
        alert("Failed to parse the CSV file.");
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleImportCalendar = async () => {
    if (!calUrl.trim()) return;
    setCalStatus('Fetching calendar data...');
    try {
      const response = await fetch(\`http://localhost:3000/api/calendar?url=\${encodeURIComponent(calUrl)}\`);
      if (response.ok) {
        const data = await response.json();
        setEventsList(data.events || []);
        localStorage.setItem('ts-cal-url', calUrl);
        setCalStatus('Calendar synced successfully!');
        
        const updated = rows.map(row => {
          const matchingEvent = data.events?.find(ev => ev.date === row.date);
          if (matchingEvent) {
            return {
              ...row,
              type: 'Public Holiday',
              inTime: '',
              outTime: '',
              notes: matchingEvent.title
            };
          }
          return row;
        });

        setRows(updated);
        localStorage.setItem(\`ts-data-\${currentMonth}\`, JSON.stringify({ empId, empName, org, rows: updated }));
        saveToBackend(updated, empName, empId, org);
      } else {
        setCalStatus('Failed to sync remote calendar.');
      }
    } catch (e) {
      setCalStatus('Network error syncing calendar.');
    }
  };

  const handleCopySummary = () => {
    const lines = [
      \`Timesheet Summary - \${currentMonth}\`,
      \`Employee: \${empName} (\${empId})\`,
      \`Organisation: \${org}\`,
      \`---------------------------------------\`,
      \`Working Days: \${rows.filter(r => r.type === 'Working').length}\`,
      \`WFH Days: \${rows.filter(r => r.type === 'WFH').length}\`,
      \`Leave Days: \${rows.filter(r => r.type === 'Sick/Casual Leave' || r.type === 'Compensation Leave').length}\`,
      \`Weekend Days: \${rows.filter(r => r.type === 'Weekend').length}\`,
      \`Holiday Days: \${rows.filter(r => r.type === 'Public Holiday').length}\`,
      \`Total Hours Logged: \${totalHours} hrs\`
    ];

    navigator.clipboard.writeText(lines.join('\\n'));
    alert('Timesheet summary details copied to clipboard!');
  };

  const calculateHours = (inT, outT) => {
    if (!inT || !outT) return 0;
    const [inH, inM] = inT.split(':').map(Number);
    const [outH, outM] = outT.split(':').map(Number);
    const diff = (outH * 60 + outM) - (inH * 60 + inM);
    return diff > 0 ? parseFloat((diff / 60).toFixed(2)) : 0;
  };

  const handleExportCSV = () => {
    // Generate ZORO standard CSV Format to allow re-importing later
    const safeEmp = (empName || 'Unknown_Emp').replace(/ /g, '_').replace(/[^a-z0-9_.-]/gi, '_');
    
    const headerLine = \`Month/Year,\${currentMonth},Employee ID,\${empId || ''},Employee Name,\${empName || ''},Organization,\${org || ''}\`;
    const subHeaderLine = \`Day of the month,Day,WFH / Office/ Leave,Check-in time,Check-out time,Extra Working hours,Project Hrs (Elotouch),Meeting Hrs,Total hours\`;
    
    let workingDaysCount = 0;
    let totalMinutes = 0;
    
    const csvRows = rows.map(r => {
      let csvType = r.type;
      if (r.type === 'Working') csvType = 'Office';
      else if (r.type === 'Weekend') csvType = 'WeekEnd';
      else if (r.type === 'Sick/Casual Leave') csvType = 'Leave';
      else if (r.type === 'Compensation Leave') csvType = 'Compensation Leave';
      else if (r.type === 'Public Holiday') csvType = 'Public Holiday';

      const isWork = csvType === 'Office' || csvType === 'WFH' || csvType === 'Working';
      if (isWork) workingDaysCount++;
      
      const hours = calculateHours(r.inTime, r.outTime);
      const minutes = Math.round(hours * 60);
      totalMinutes += minutes;
      
      const hStr = Math.floor(minutes / 60);
      const mStr = minutes % 60;
      const totalTimeStr = \`\${hStr}:\${String(mStr).padStart(2, '0')}:00\`;
      
      let extraStr = '0:00:00';
      if (hours > 9) {
        const extraMin = Math.round((hours - 9) * 60);
        const eh = Math.floor(extraMin / 60);
        const em = extraMin % 60;
        extraStr = \`\${eh}:\${String(em).padStart(2, '0')}:00\`;
      }
      
      let formattedDate = r.date;
      if (r.date.includes('-')) {
        const parts = r.date.split('-');
        if (parts[0].length === 4) {
          formattedDate = \`\${parts[2]}-\${parts[1]}-\${parts[0]}\`;
        }
      }
      
      return [
        formattedDate,
        r.dayName,
        csvType,
        r.inTime || '',
        r.outTime || '',
        extraStr,
        totalTimeStr,
        '0:00:00',
        totalTimeStr
      ].join(',');
    });

    const totH = Math.floor(totalMinutes / 60);
    const totM = totalMinutes % 60;
    const totStr = \`\${totH}:\${String(totM).padStart(2, '0')}:00\`;
    
    let monthName = 'June';
    try {
      monthName = new Date(currentMonth + '-02').toLocaleString('default', { month: 'long' });
    } catch (e) {}
    
    const totalLine = \`TOTAL,Total working days,\${workingDaysCount},Data for the month:,\${monthName}/\${currentMonth.split('-')[0]},Total approx. working hours for the month:,\${totStr}\`;
    
    const csvContent = [
      headerLine,
      '',
      subHeaderLine,
      ...csvRows,
      totalLine
    ].join('\\n');

    const element = document.createElement("a");
    const file = new Blob([csvContent], {type: 'text/csv'});
    element.href = URL.createObjectURL(file);
    element.download = \`\${safeEmp}_\${currentMonth}_Timesheet.csv\`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Metrics
  const typeCounts = rows.reduce((acc, row) => {
    acc[row.type] = (acc[row.type] || 0) + 1;
    return acc;
  }, {});

  const totalHours = rows.reduce((sum, r) => {
    if (r.type === 'Working' || r.type === 'WFH') {
      return sum + calculateHours(r.inTime, r.outTime);
    }
    return sum;
  }, 0);

  const totalWorkingDays = (typeCounts['Working'] || 0) + (typeCounts['WFH'] || 0);
  const avgHours = totalWorkingDays > 0 ? (totalHours / totalWorkingDays).toFixed(1) : '0';

  const getBadgeColor = (type) => {
     switch(type) {
         case 'Working': return 'var(--accent-purple)';
         case 'WFH': return 'var(--accent-pink)';
         case 'Sick/Casual Leave': return 'var(--accent-red)';
         case 'Compensation Leave': return 'var(--accent-yellow)';
         case 'Public Holiday': return 'var(--accent-cyan)';
         default: return 'var(--text-muted)';
     }
  };
  
  const getBadgeBg = (type) => {
     switch(type) {
         case 'Working': return 'rgba(168, 85, 247, 0.15)';
         case 'WFH': return 'rgba(236, 72, 153, 0.15)';
         case 'Sick/Casual Leave': return 'rgba(244, 63, 94, 0.15)';
         case 'Compensation Leave': return 'rgba(245, 158, 11, 0.15)';
         case 'Public Holiday': return 'rgba(6, 182, 212, 0.15)';
         default: return 'rgba(255, 255, 255, 0.05)';
     }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Hidden File Input */}
      <input 
        type="file" 
        accept=".csv" 
        style={{ display: 'none' }} 
        ref={fileInputRef} 
        onChange={handleImportCSV} 
      />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '4px', color: 'var(--text-primary)' }}>
            Timesheet <span className="gradient-text">Manager</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>Log daily working hours, manage compensation leave, and import/export logs seamlessly.</p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => fileInputRef.current.click()}
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '10px',
              padding: '10px 16px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent-cyan)'; e.currentTarget.style.color = 'var(--accent-cyan)'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          >
            <Upload size={14} />
            Import CSV
          </button>

          <button
            onClick={handleCopySummary}
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '10px',
              padding: '10px 16px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent-purple)'; e.currentTarget.style.color = 'var(--accent-purple)'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          >
            <Clipboard size={14} />
            Copy Summary
          </button>

          <button
            onClick={handleExportCSV}
            className="glow-btn"
            style={{
              background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))',
              boxShadow: '0 4px 15px var(--glow-purple)',
              padding: '10px 20px',
              borderRadius: '10px',
              fontWeight: 'bold'
            }}
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 2.5fr 1fr',
        gap: '24px',
        alignItems: 'start'
      }}>
        
        {/* Left Column: Emp Info & Month Select */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Employee profile */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'rgba(168, 85, 247, 0.15)', padding: '8px', borderRadius: '10px' }}>
                <User size={18} color="var(--accent-purple)" />
              </div>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>Employee Profile</h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Employee ID</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <User size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={empId}
                    onChange={(e) => setEmpId(e.target.value)}
                    onBlur={() => saveToBackend(rows, empName, empId, org)}
                    placeholder="e.g. EMP-998"
                    style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 10px 10px 32px', borderRadius: '8px', outline: 'none', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Full Name</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <User size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    onBlur={() => saveToBackend(rows, empName, empId, org)}
                    style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 10px 10px 32px', borderRadius: '8px', outline: 'none', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Organisation</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Building size={14} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={org}
                    onChange={(e) => setOrg(e.target.value)}
                    onBlur={() => saveToBackend(rows, empName, empId, org)}
                    style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '10px 10px 10px 32px', borderRadius: '8px', outline: 'none', fontSize: '0.85rem' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Month selector */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'rgba(236, 72, 153, 0.15)', padding: '8px', borderRadius: '10px' }}>
                <CalendarDays size={18} color="var(--accent-pink)" />
              </div>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>Schedules</h3>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Active Period</label>
              <input
                type="month"
                value={currentMonth}
                onChange={(e) => setCurrentMonth(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  outline: 'none',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              />
            </div>

            {historyList.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Quick Jump</label>
                <select
                  value={currentMonth}
                  onChange={(e) => setCurrentMonth(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    outline: 'none',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  {historyList.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Middle Column: Daily Rows Editor Table */}
        <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto', minHeight: '520px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 'bold', margin: 0 }}>Timesheet Logs</h3>
            <span style={{ background: 'var(--bg-tertiary)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid var(--border-color)' }}>
              {rows.length} Days
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '0 12px 8px 12px', textAlign: 'left', width: '80px', fontWeight: '600' }}>Date</th>
                <th style={{ padding: '0 12px 8px 12px', textAlign: 'left', width: '150px', fontWeight: '600' }}>Status</th>
                <th style={{ padding: '0 12px 8px 12px', textAlign: 'left', width: '110px', fontWeight: '600' }}>Check-In</th>
                <th style={{ padding: '0 12px 8px 12px', textAlign: 'left', width: '110px', fontWeight: '600' }}>Check-Out</th>
                <th style={{ padding: '0 12px 8px 12px', textAlign: 'left', width: '80px', fontWeight: '600' }}>Hours</th>
                <th style={{ padding: '0 12px 8px 12px', textAlign: 'left', fontWeight: '600' }}>Daily Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const totalH = calculateHours(row.inTime, row.outTime);
                const isLate = row.inTime && row.inTime > '09:15';
                const isExtra = totalH > 9;
                
                const badgeColor = getBadgeColor(row.type);
                const badgeBg = getBadgeBg(row.type);

                return (
                  <tr key={index} style={{ 
                      background: 'var(--bg-tertiary)', 
                      borderRadius: '12px',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
                      transition: 'all 0.2s ease',
                  }} 
                  className="nav-item-hover">
                    <td style={{ padding: '12px', borderTopLeftRadius: '12px', borderBottomLeftRadius: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                         <span style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--text-primary)' }}>{row.day}</span>
                         <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{row.dayName}</span>
                      </div>
                    </td>
                    
                    <td style={{ padding: '12px' }}>
                      <div style={{ 
                        background: badgeBg, 
                        border: \`1px solid \${badgeColor}40\`,
                        borderRadius: '8px', 
                        padding: '4px 8px',
                        display: 'inline-flex',
                        alignItems: 'center'
                      }}>
                        <select
                          value={row.type}
                          onChange={(e) => {
                            const val = e.target.value;
                            const isOff = val === 'Weekend' || val === 'Public Holiday' || val === 'Sick/Casual Leave' || val === 'Compensation Leave';
                            handleRowChange(index, 'type', val);
                            if (isOff) {
                              handleRowChange(index, 'inTime', '');
                              handleRowChange(index, 'outTime', '');
                            } else {
                              handleRowChange(index, 'inTime', '09:00');
                              handleRowChange(index, 'outTime', '18:00');
                            }
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: badgeColor,
                            fontSize: '0.75rem',
                            outline: 'none',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            width: '100%'
                          }}
                        >
                          <option value="Working" style={{ color: 'black' }}>Working</option>
                          <option value="WFH" style={{ color: 'black' }}>WFH</option>
                          <option value="Weekend" style={{ color: 'black' }}>Weekend</option>
                          <option value="Public Holiday" style={{ color: 'black' }}>Holiday</option>
                          <option value="Sick/Casual Leave" style={{ color: 'black' }}>Casual Leave</option>
                          <option value="Compensation Leave" style={{ color: 'black' }}>Comp Leave</option>
                        </select>
                      </div>
                    </td>

                    <td style={{ padding: '12px' }}>
                      <input
                        type="time"
                        value={row.inTime}
                        onChange={(e) => handleRowChange(index, 'inTime', e.target.value)}
                        disabled={row.type === 'Weekend' || row.type === 'Public Holiday' || row.type === 'Sick/Casual Leave' || row.type === 'Compensation Leave'}
                        style={{
                          background: 'rgba(0,0,0,0.1)',
                          border: \`1px solid \${isLate ? 'var(--accent-pink)' : 'var(--border-color)'}\`,
                          color: isLate ? 'var(--accent-pink)' : 'var(--text-primary)',
                          fontSize: '0.8rem',
                          outline: 'none',
                          fontWeight: isLate ? 'bold' : '600',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          opacity: (row.type === 'Weekend' || row.type === 'Public Holiday' || row.type === 'Sick/Casual Leave' || row.type === 'Compensation Leave') ? 0.3 : 1
                        }}
                      />
                    </td>

                    <td style={{ padding: '12px' }}>
                      <input
                        type="time"
                        value={row.outTime}
                        onChange={(e) => handleRowChange(index, 'outTime', e.target.value)}
                        disabled={row.type === 'Weekend' || row.type === 'Public Holiday' || row.type === 'Sick/Casual Leave' || row.type === 'Compensation Leave'}
                        style={{
                          background: 'rgba(0,0,0,0.1)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                          fontSize: '0.8rem',
                          outline: 'none',
                          fontWeight: '600',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          opacity: (row.type === 'Weekend' || row.type === 'Public Holiday' || row.type === 'Sick/Casual Leave' || row.type === 'Compensation Leave') ? 0.3 : 1
                        }}
                      />
                    </td>

                    <td style={{ 
                      padding: '12px', 
                      fontWeight: '800',
                      color: isExtra ? 'var(--accent-cyan)' : 'var(--text-primary)'
                    }}>
                      {totalH > 0 ? \`\${totalH} h\` : '-'}
                    </td>

                    <td style={{ padding: '12px', borderTopRightRadius: '12px', borderBottomRightRadius: '12px' }}>
                      <input
                        type="text"
                        placeholder="Add details..."
                        value={row.notes}
                        onChange={(e) => handleRowChange(index, 'notes', e.target.value)}
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: '1px solid transparent',
                          borderBottom: '1px solid rgba(255,255,255,0.1)',
                          color: 'var(--text-secondary)',
                          fontSize: '0.8rem',
                          outline: 'none',
                          padding: '6px 4px',
                          transition: 'all 0.2s'
                        }}
                        onFocus={(e) => { e.target.style.borderBottomColor = 'var(--accent-purple)'; e.target.style.color = 'var(--text-primary)'; }}
                        onBlur={(e) => { e.target.style.borderBottomColor = 'rgba(255,255,255,0.1)'; e.target.style.color = 'var(--text-secondary)'; }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Right Column: Analytics & Totals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Totals Box */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'rgba(6, 182, 212, 0.15)', padding: '8px', borderRadius: '10px' }}>
                <FileSpreadsheet size={18} color="var(--accent-cyan)" />
              </div>
              <h3 style={{ fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>Monthly Summary</h3>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: '10px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '600' }}>Working Days</span>
                <span style={{ fontWeight: '800', fontSize: '1.2rem', color: 'var(--text-primary)' }}>{totalWorkingDays}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(236,72,153,0.1))', padding: '12px', borderRadius: '10px', border: '1px solid rgba(168,85,247,0.2)' }}>
                <span style={{ color: 'var(--accent-purple)', fontSize: '0.8rem', fontWeight: '600' }}>Logged Hours</span>
                <span style={{ fontWeight: '800', fontSize: '1.2rem', color: '#fff' }}>{totalHours} h</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: '10px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: '600' }}>Avg Daily Log</span>
                <span style={{ fontWeight: '800', fontSize: '1.2rem', color: 'var(--text-primary)' }}>{avgHours} h/d</span>
              </div>
            </div>
          </div>

          {/* Pure CSS Status Bar Charts */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', margin: 0 }}>Distribution</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                { name: 'Working', count: typeCounts['Working'] || 0, color: 'var(--accent-purple)' },
                { name: 'WFH', count: typeCounts['WFH'] || 0, color: 'var(--accent-pink)' },
                { name: 'Casual Leave', count: typeCounts['Sick/Casual Leave'] || 0, color: 'var(--accent-red)' },
                { name: 'Comp Leave', count: typeCounts['Compensation Leave'] || 0, color: 'var(--accent-yellow)' },
                { name: 'Weekend', count: typeCounts['Weekend'] || 0, color: 'var(--text-muted)' },
                { name: 'Public Holiday', count: typeCounts['Public Holiday'] || 0, color: 'var(--accent-cyan)' }
              ].map((item, idx) => {
                const ratio = rows.length > 0 ? (item.count / rows.length) * 100 : 0;
                if (item.count === 0 && item.name !== 'Working') return null; // hide 0 counts except Working
                
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '600' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
                      <span style={{ color: '#fff' }}>{item.count} d</span>
                    </div>
                    
                    <div style={{ width: '100%', height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: \`\${ratio}%\`, height: '100%', background: item.color, borderRadius: '4px', boxShadow: \`0 0 8px \${item.color}\` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
        </div>

      </div>

    </div>
  );
};

export default Timesheet;
`;

fs.writeFileSync('src/pages/Timesheet.jsx', code);
