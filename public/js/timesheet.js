console.log("TIMESHEET JS LOADED");
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM LOADED IN TIMESHEET");
  const tsMonthYear = document.getElementById('tsMonthYear');
  const tsHistory = document.getElementById('tsHistory');
  const tbody = document.getElementById('timesheetBody');

  const tsEmpId = document.getElementById('tsEmpId');
  const tsEmpName = document.getElementById('tsEmpName');
  const tsOrg = document.getElementById('tsOrg');

  // DOM Elements for summary
  const statWorking = document.getElementById('statWorking');
  const statLeave = document.getElementById('statLeave');
  const statWfh = document.getElementById('statWfh');
  const statWeekend = document.getElementById('statWeekend');
  const statHoliday = document.getElementById('statHoliday');
  const statComp = document.getElementById('statComp');

  const sumMonth = document.getElementById('sumMonth');
  const sumWorking = document.getElementById('sumWorking');
  const sumHours = document.getElementById('sumHours');
  const sumWfh = document.getElementById('sumWfh');
  const sumLeave = document.getElementById('sumLeave');
  const sumComp = document.getElementById('sumComp');
  const grandTotalHours = document.getElementById('grandTotalHours');
  const approxDaily = document.getElementById('approxDaily');

  let hoursChart = null;
  let statusChart = null;

  const DEFAULT_IN = "";
  const DEFAULT_OUT = "";
  const STORAGE_KEY_PREFIX = "ts-data-";
  
  // State
  let lastSavedFilename = null;
  const holidayCache = {};
  let currentData = {
    empId: "", empName: "", org: "", rows: []
  };

  // Initialize
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  tsMonthYear.value = `${year}-${month}`;

  console.log("History loaded"); loadHistoryDropdown();
  console.log("Loading data"); loadDataForMonth(tsMonthYear.value); console.log("Data loaded");

  tsMonthYear.addEventListener('change', () => loadDataForMonth(tsMonthYear.value));
  tsHistory.addEventListener('change', (e) => {
    if (e.target.value) {
      tsMonthYear.value = e.target.value;
      console.log("Loading data"); loadDataForMonth(tsMonthYear.value); console.log("Data loaded");
    }
  });

  [tsEmpId, tsEmpName, tsOrg].forEach(el => el.addEventListener('input', (e) => {
    currentData[e.target.id.replace('ts', '').charAt(0).toLowerCase() + e.target.id.slice(3)] = e.target.value;
    saveData();
  }));

  const tsCalUrl = document.getElementById('tsCalUrl');
  const btnSyncCal = document.getElementById('btnSyncCal');
  const btnRemoveCal = document.getElementById('btnRemoveCal');
  const calSyncStatus = document.getElementById('calSyncStatus');
  
  const tsCalFile = document.getElementById('tsCalFile');
  const btnUploadCal = document.getElementById('btnUploadCal');

  const calSyncModal = document.getElementById('calSyncModal');
  const btnOpenSyncModal = document.getElementById('btnOpenSyncModal');
  const btnCloseSyncModal = document.getElementById('btnCloseSyncModal');

  if (btnOpenSyncModal && calSyncModal && btnCloseSyncModal) {
    btnOpenSyncModal.addEventListener('click', () => {
      calSyncModal.style.display = 'flex';
    });
    btnCloseSyncModal.addEventListener('click', () => {
      calSyncModal.style.display = 'none';
    });
    calSyncModal.addEventListener('click', (e) => {
      if(e.target === calSyncModal) calSyncModal.style.display = 'none';
    });
  }

  if (tsCalUrl && btnSyncCal) {
    const updateSyncUI = () => {
      const storedUrl = localStorage.getItem('ts-cal-url');
      const hasUrl = !!storedUrl;
      tsCalUrl.value = storedUrl === 'local' ? '' : (storedUrl || '');
      
      if (hasUrl) {
        btnRemoveCal.style.display = 'block';
        calSyncStatus.style.display = 'inline-block';
        calSyncStatus.textContent = storedUrl === 'local' ? 'Local File Synced' : 'Synced';
        calSyncStatus.style.color = '#22c55e';
        calSyncStatus.style.background = 'rgba(34,197,94,0.1)';
      } else {
        btnRemoveCal.style.display = 'none';
        calSyncStatus.style.display = 'none';
      }
    };
    updateSyncUI();

    btnSyncCal.addEventListener('click', () => {
      if (!tsCalUrl.value.trim()) return;
      localStorage.setItem('ts-cal-url', tsCalUrl.value);
      
      calSyncStatus.style.display = 'inline-block';
      calSyncStatus.textContent = "Syncing...";
      calSyncStatus.style.color = "var(--text-muted)";
      calSyncStatus.style.background = "rgba(255,255,255,0.1)";
      
      const [y, m] = tsMonthYear.value.split('-');
      fetchAndDisplayUpcomingEvents().then(() => {
        updateSyncUI();
      }).catch(e => {
        calSyncStatus.textContent = "Failed ❌";
        calSyncStatus.style.color = "#ff4c4c";
        calSyncStatus.style.background = "rgba(239,68,68,0.1)";
      });
    });

    if (btnUploadCal && tsCalFile) {
      btnUploadCal.addEventListener('click', () => {
        const file = tsCalFile.files[0];
        if (!file) return;
        
        calSyncStatus.style.display = 'inline-block';
        calSyncStatus.textContent = "Uploading...";
        calSyncStatus.style.color = "var(--text-muted)";
        calSyncStatus.style.background = "rgba(255,255,255,0.1)";

        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const text = e.target.result;
            const res = await fetch('http://localhost:3000/api/calendar/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain' },
              body: text
            });
            if (res.ok) {
              localStorage.setItem('ts-cal-url', 'local');
              const [y, m] = tsMonthYear.value.split('-');
              await fetchAndDisplayUpcomingEvents();
              updateSyncUI();
              tsCalFile.value = '';
            } else {
              throw new Error("Upload failed");
            }
          } catch(err) {
            calSyncStatus.textContent = "Upload Failed ❌";
            calSyncStatus.style.color = "#ff4c4c";
            calSyncStatus.style.background = "rgba(239,68,68,0.1)";
          }
        };
        reader.readAsText(file);
      });
    }

    if (btnRemoveCal) {
      btnRemoveCal.addEventListener('click', async () => {
        if(confirm("Remove the synced calendar? This will clear imported events.")) {
          const storedUrl = localStorage.getItem('ts-cal-url');
          if (storedUrl === 'local') {
            await fetch('http://localhost:3000/api/calendar/local', { method: 'DELETE' }).catch(e=>console.error(e));
          }
          localStorage.removeItem('ts-cal-url');
          updateSyncUI();
          const [y, m] = tsMonthYear.value.split('-');
          fetchAndDisplayUpcomingEvents();
        }
      });
    }
  }

  function getDaysInMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  function getDayName(y, m, d) {
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
  }

  function parseAmPmTime(timeStr) {
    if (!timeStr) return { h: 0, m: 0 };
    const [time, period] = timeStr.split(' ');
    if (!time) return { h: 0, m: 0 };
    let [h, m] = time.split(':').map(Number);
    if (period && period.toUpperCase() === 'PM' && h !== 12) h += 12;
    if (period && period.toUpperCase() === 'AM' && h === 12) h = 0;
    return { h: h || 0, m: m || 0 };
  }

  function formatTimeDiff(start, end) {
    if (!start || !end) return "0:00:00";
    const t1 = parseAmPmTime(start);
    const t2 = parseAmPmTime(end);
    let diffMins = (t2.h * 60 + t2.m) - (t1.h * 60 + t1.m);
    if (diffMins < 0) diffMins += 24 * 60; // crossover midnight
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    return `${h}:${String(m).padStart(2, '0')}:00`;
  }

  function parseHrs(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    const h = parseInt(parts[0]) || 0;
    const m = parseInt(parts[1]) || 0;
    const s = parseInt(parts[2]) || 0;
    return (h * 3600) + (m * 60) + s;
  }

  function formatSecs(totalSecs) {
    if (totalSecs < 0) totalSecs = 0;
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function loadHistoryDropdown() {
    tsHistory.innerHTML = '<option value="">History...</option>';
    let months = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        months.push(key.replace(STORAGE_KEY_PREFIX, ''));
      }
    }
    // Sort descending (latest month first)
    months.sort().reverse().forEach(monthKey => {
      const option = document.createElement('option');
      option.value = monthKey;
      option.textContent = monthKey;
      tsHistory.appendChild(option);
    });

    // Auto-select the current month if it's in the list
    if (tsMonthYear && tsMonthYear.value) {
      if (Array.from(tsHistory.options).some(opt => opt.value === tsMonthYear.value)) {
        tsHistory.value = tsMonthYear.value;
      }
    }
  }

  function getSaveKey() {
    return STORAGE_KEY_PREFIX + tsMonthYear.value;
  }

  function generateCSVData(data) {
    let csv = [];
    csv.push(`Month/Year,${tsMonthYear.value},Employee ID,${data.empId},Employee Name,${data.empName},Organization,${data.org}`);
    csv.push(''); 
    csv.push('Day of the month,Day,WFH / Office/ Leave,Check-in time,Check-out time,Extra Working hours,Project Hrs (Elotouch),Meeting Hrs,Total hours');
    data.rows.forEach(r => {
      csv.push(`${r.date},${r.day},${r.type},${r.inTime},${r.outTime},${r.extra},${r.proj},${r.meet},${r.total}`);
    });
    csv.push('');
    csv.push(`TOTAL,Total working days,${sumWorking.textContent},Data for the month:,${sumMonth.textContent},Total approx. working hours for the month:,${sumHours.textContent}`);
    return csv.join('\n');
  }
  function saveData() {
    localStorage.setItem(getSaveKey(), JSON.stringify(currentData));
    console.log("History loaded"); loadHistoryDropdown();

    const safeEmp = currentData.empName ? currentData.empName.replace(/ /g, '_') : 'Unknown_Emp';
    const filename = `${safeEmp}_${tsMonthYear.value}_Timesheet.csv`;
    const csvData = generateCSVData(currentData);
    fetch('http://localhost:3000/api/timesheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, csvData, oldFilename: lastSavedFilename })
    }).catch(e => console.error("Error saving timesheet to server:", e));
    
    lastSavedFilename = filename;
    lastSavedFilename = filename;
  }

  async function fetchAndDisplayUpcomingEvents() {
    const listEl = document.getElementById('holidayList');
    if (!listEl) return;
    
    listEl.innerHTML = '<div style="color: var(--text-muted); font-style: italic;">Loading events...</div>';

    try {
      let filtered = [];
      const todayISO = new Date().toISOString().split('T')[0];

      // Add ICS Calendar Events
      const calUrl = localStorage.getItem('ts-cal-url');
      if (calUrl) {
        try {
          const fetchUrl = calUrl === 'local' 
            ? `http://localhost:3000/api/calendar/upcoming?local=true`
            : `http://localhost:3000/api/calendar/upcoming?url=${encodeURIComponent(calUrl)}`;
          
          const calRes = await fetch(fetchUrl);
          if (calRes.ok) {
            const calEvents = await calRes.json();
            calEvents.forEach(ce => {
              const isoDate = ce.date.split('T')[0];
              if (isoDate >= todayISO) {
                filtered.push({
                  date: isoDate,
                  name: ce.name,
                  country: 'Calendar',
                  flag: '🗓️',
                  customColor: '#4285F4' // Google Blue
                });
              }
            });
          }
        } catch(err) {
          console.error("Failed to sync personal calendar:", err);
        }
      }

      // Add Personal Leaves / Local Holidays from currentData
      if (currentData && currentData.rows) {
        currentData.rows.forEach(r => {
          if (r.type === 'Leave' || r.type === 'Holiday' || r.type === 'Comp off') {
            const [d, mStr, yStr] = r.date.split('-');
            const isoDate = `${yStr}-${mStr}-${d}`;
            
            if (isoDate >= todayISO) {
              let icon = '👤';
              let name = 'Personal Leave';
              let color = 'var(--text-muted)';
              
              if (r.type === 'Holiday') { name = 'Company Holiday'; icon = '🏢'; color = '#0070c0'; }
              if (r.type === 'Comp off') { name = 'Comp Off'; icon = '🔄'; color = '#0070c0'; }
              if (r.type === 'Leave') { name = 'Leave / PTO'; icon = '🏖️'; color = '#ff0000'; }

              filtered.push({
                date: isoDate,
                name: name,
                country: 'Personal',
                flag: icon,
                customColor: color
              });
            }
          }
        });
      }

      // Deduplicate if the same holiday falls on the same date for both
      filtered.sort((a, b) => a.date.localeCompare(b.date));
      
      // Ensure we display up to a reasonable amount, the user requested min 6. Let's just show up to 10.
      filtered = filtered.slice(0, Math.max(6, 10));

      if (filtered.length === 0) {
        listEl.innerHTML = '<div style="color: var(--text-muted); padding: 8px; border-radius: 4px; background: rgba(255,255,255,0.05); text-align: center;">No upcoming events</div>';
        return;
      }

      listEl.innerHTML = '';
      filtered.forEach(h => {
        const item = document.createElement('div');
        item.style.padding = '8px 12px';
        item.style.background = 'rgba(255, 255, 255, 0.03)';
        item.style.borderRadius = 'var(--r-sm)';
        item.style.display = 'flex';
        item.style.flexDirection = 'column';
        item.style.gap = '4px';
        const borderCol = h.country === 'IN' ? '#FF9933' : (h.country === 'US' ? '#3C3B6E' : (h.customColor || 'var(--primary)'));
        item.style.borderLeft = `3px solid ${borderCol}`;
        
        const dateObj = new Date(h.date);
        const dayStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });

        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong style="font-size: 13px;">${h.name}</strong>
            <span style="font-size: 14px;" title="${h.country}">${h.flag}</span>
          </div>
          <div style="color: var(--text-muted); font-size: 11px;">${dayStr}</div>
        `;
        listEl.appendChild(item);
      });

    } catch(e) {
      console.error(e);
      listEl.innerHTML = `<div style="color: #ff4c4c; font-size: 12px;">Failed to load holidays: ${e.message}</div>`;
    }
  }

  function getEmployeeNameFromLocalStorage() {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        try {
          const val = JSON.parse(localStorage.getItem(key));
          if (val && val.empName) {
            return val.empName;
          }
        } catch(e) {}
      }
    }
    return '';
  }

  async function loadDataForMonth(monthVal) {
    const [y, m] = monthVal.split('-');
    
    let loadedFromServer = false;
    try {
      const empName = (tsEmpName ? tsEmpName.value : '') || getEmployeeNameFromLocalStorage() || '';
      const url = `http://localhost:3000/api/timesheet/${monthVal}?empName=${encodeURIComponent(empName)}`;
      const res = await fetch(url);
      if (res.ok) {
        currentData = await res.json();
        localStorage.setItem(getSaveKey(), JSON.stringify(currentData));
        loadedFromServer = true;
      }
    } catch (err) {
      console.warn("Failed to fetch from server:", err);
    }

    if (!loadedFromServer) {
      const savedDataStr = localStorage.getItem(getSaveKey());
      if (savedDataStr) {
        currentData = JSON.parse(savedDataStr);
      } else {
        // Fallback: Create blank month
        currentData = { empId: '', empName: '', org: '', rows: [] };
        const days = getDaysInMonth(y, m);
        for (let d = 1; d <= days; d++) {
          const dateStr = `${String(d).padStart(2, '0')}-${m}-${y}`;
          const dayName = getDayName(y, m, d);
          const isWeekend = dayName === 'Saturday' || dayName === 'Sunday';
          const defType = isWeekend ? 'WeekEnd' : 'Office';
          currentData.rows.push({
            date: dateStr, day: dayName, type: defType,
            inTime: isWeekend ? '' : DEFAULT_IN, outTime: isWeekend ? '' : DEFAULT_OUT,
            extra: "0:00:00", proj: "0:00:00", meet: "0:00:00", total: "0:00:00"
          });
        }
      }
    }

    // Refresh history dropdown to reflect server data if synced
    loadHistoryDropdown();
    
    tsEmpId.value = currentData.empId || '';
    tsEmpName.value = currentData.empName || '';
    tsOrg.value = currentData.org || '';

    const safeEmpInit = currentData.empName ? currentData.empName.replace(/ /g, '_') : 'Unknown_Emp';
    lastSavedFilename = `${safeEmpInit}_${tsMonthYear.value}_Timesheet.csv`;

    renderTable();
    fetchAndDisplayUpcomingEvents();

    // Sync history dropdown
    if (tsHistory) {
      if (Array.from(tsHistory.options).some(opt => opt.value === monthVal)) {
        tsHistory.value = monthVal;
      } else {
        tsHistory.value = '';
      }
    }
  }

  function calculateRowLogic(rowObj) {
    if (['Leave', 'WeekEnd', 'Holiday', 'Comp off'].includes(rowObj.type)) {
      rowObj.inTime = "";
      rowObj.outTime = "";
      rowObj.extra = "0:00:00";
      rowObj.proj = "0:00:00";
      rowObj.total = "0:00:00";
      return;
    }

    if (!rowObj.inTime) rowObj.inTime = "";
    if (!rowObj.outTime) rowObj.outTime = "";

    const diff = formatTimeDiff(rowObj.inTime, rowObj.outTime);
    rowObj.proj = diff;

    // Extra hours > 6:30 PM (18:30)
    const tOut = parseAmPmTime(rowObj.outTime);
    const outMins = tOut.h * 60 + tOut.m;
    const thresholdMins = 18 * 60 + 30; // 6:30 PM
    if (outMins > thresholdMins) {
      let extraMins = outMins - thresholdMins;
      const eh = Math.floor(extraMins / 60);
      const em = extraMins % 60;
      rowObj.extra = `${eh}:${String(em).padStart(2, '0')}:00`;
    } else {
      rowObj.extra = "0:00:00";
    }

    const pSecs = parseHrs(rowObj.proj);
    const mSecs = parseHrs(rowObj.meet);
    rowObj.total = formatSecs(pSecs + mSecs);
  }

  function renderTable() {
    tbody.innerHTML = '';
    
    currentData.rows.forEach((r, idx) => {
      calculateRowLogic(r);

      const typeClassMap = {
        'Office': 'ts-status-office ts-row-office',
        'WFH': 'ts-status-wfh ts-row-wfh',
        'Leave': 'ts-status-leave ts-row-leave',
        'WeekEnd': 'ts-status-weekend ts-row-weekend',
        'Holiday': 'ts-status-holiday ts-row-holiday',
        'Comp off': 'ts-status-compoff ts-row-holiday'
      };
      
      const tIn = parseAmPmTime(r.inTime);
      const isLate = (tIn.h * 60 + tIn.m) > (9 * 60 + 30) && r.inTime !== "";
      
      const tOut = parseAmPmTime(r.outTime);
      const isExtra = (tOut.h * 60 + tOut.m) > (18 * 60 + 30) && r.outTime !== "";

      const tr = document.createElement('tr');
      tr.className = typeClassMap[r.type] || '';
      tr.dataset.index = idx;
      
      tr.innerHTML = `
        <td>${r.date}</td>
        <td>${r.day}</td>
        <td>
          <select class="type-select">
            <option value="Office" ${r.type==='Office'?'selected':''}>Office</option>
            <option value="WFH" ${r.type==='WFH'?'selected':''}>WFH</option>
            <option value="Leave" ${r.type==='Leave'?'selected':''}>Leave</option>
            <option value="WeekEnd" ${r.type==='WeekEnd'?'selected':''}>WeekEnd</option>
            <option value="Holiday" ${r.type==='Holiday'?'selected':''}>Holiday</option>
            <option value="Comp off" ${r.type==='Comp off'?'selected':''}>Comp off</option>
          </select>
        </td>
        <td class="${isLate ? 'late-time-cell' : ''}" title="${isLate ? 'Late Check-in' : ''}">
          <input type="text" class="in-time" value="${r.inTime}">
        </td>
        <td class="${isExtra ? 'extra-time-cell' : ''}" title="${isExtra ? 'Working Extra Time' : ''}">
          <input type="text" class="out-time" value="${r.outTime}">
        </td>
        <td><input type="text" class="extra-hrs" value="${r.extra}" readonly></td>
        <td><input type="text" class="proj-hrs" value="${r.proj}" readonly></td>
        <td><input type="text" class="meet-hrs" value="${r.meet}"></td>
        <td><input type="text" class="total-hrs" value="${r.total}" readonly style="font-weight:bold;"></td>
      `;
      tbody.appendChild(tr);
    });

    // Init flatpickrs
    flatpickr(tbody.querySelectorAll('.in-time'), {
      enableTime: true, noCalendar: true, dateFormat: "h:i K", time_24hr: false, allowInput: true,
      onChange: function(dates, str, inst) { inst.element.dispatchEvent(new Event('change', {bubbles: true})); }
    });
    flatpickr(tbody.querySelectorAll('.out-time'), {
      enableTime: true, noCalendar: true, dateFormat: "h:i K", time_24hr: false, allowInput: true,
      onChange: function(dates, str, inst) { inst.element.dispatchEvent(new Event('change', {bubbles: true})); }
    });

    tbody.querySelectorAll('select, input').forEach(el => {
      el.addEventListener('input', handleFieldChange);
      el.addEventListener('change', handleFieldChange);
    });

    function handleFieldChange(e) {
      const rowEl = e.target.closest('tr');
      const idx = rowEl.dataset.index;
      const rowData = currentData.rows[idx];
      
      if (e.target.classList.contains('type-select')) rowData.type = e.target.value;
      if (e.target.classList.contains('in-time')) rowData.inTime = e.target.value;
      if (e.target.classList.contains('out-time')) rowData.outTime = e.target.value;
      if (e.target.classList.contains('meet-hrs')) rowData.meet = e.target.value;
      
      calculateRowLogic(rowData);
      saveData();

      // If the type changed, we should fully re-render and update leaves widget
      if (e.target.classList.contains('type-select')) {
        renderTable();
        const [y, m] = tsMonthYear.value.split('-');
        fetchAndDisplayUpcomingEvents();
        return;
      }

      // Otherwise update this row's values
      rowEl.querySelector('.extra-hrs').value = rowData.extra;
      rowEl.querySelector('.proj-hrs').value = rowData.proj;
      rowEl.querySelector('.total-hrs').value = rowData.total;

      const tIn = parseAmPmTime(rowData.inTime);
      const isLate = (tIn.h * 60 + tIn.m) > (9 * 60 + 30) && rowData.inTime !== "";
      const tdIn = rowEl.querySelector('.in-time').parentElement;
      if(isLate) tdIn.classList.add('late-time-cell'); else tdIn.classList.remove('late-time-cell');

      const tOut = parseAmPmTime(rowData.outTime);
      const isExtra = (tOut.h * 60 + tOut.m) > (18 * 60 + 30) && rowData.outTime !== "";
      const tdOut = rowEl.querySelector('.out-time').parentElement;
      if(isExtra) tdOut.classList.add('extra-time-cell'); else tdOut.classList.remove('extra-time-cell');

      calculateSummary();
    }

    // Ensure summary calculations and charts run on initial load
    calculateSummary();
  }

  function calculateSummary() {
    let counts = { 'Office': 0, 'WFH': 0, 'Leave': 0, 'WeekEnd': 0, 'Holiday': 0, 'Comp off': 0 };
    let totalSecs = 0;

    currentData.rows.forEach(r => {
      if (counts[r.type] !== undefined) counts[r.type]++;
      totalSecs += parseHrs(r.total);
    });

    const workingDays = counts['Office'] + counts['WFH'];
    
    console.log("WORKING DAYS:", workingDays); statWorking.textContent = workingDays;
    statLeave.textContent = counts['Leave'];
    statWfh.textContent = counts['WFH'];
    statWeekend.textContent = counts['WeekEnd'];
    statHoliday.textContent = counts['Holiday'];
    statComp.textContent = counts['Comp off'];

    sumWorking.textContent = workingDays;
    sumWfh.textContent = counts['WFH'];
    sumLeave.textContent = counts['Leave'];
    sumComp.textContent = counts['Comp off'];
    
    const [y, m] = tsMonthYear.value.split('-');
    const monthName = new Date(y, m - 1).toLocaleString('default', { month: 'long' });
    sumMonth.textContent = `${monthName}/${y}`;

    const formattedTotal = formatSecs(totalSecs);
    sumHours.textContent = formattedTotal;
    grandTotalHours.textContent = formattedTotal;

    if (workingDays > 0) {
      approxDaily.textContent = formatSecs(Math.floor(totalSecs / workingDays));
    } else {
      approxDaily.textContent = "0:00:00";
    }

    updateCharts(counts);
  }

  function updateCharts(counts) {
    if (typeof Chart === 'undefined') return;

    const labels = [];
    const dataHrs = [];
    currentData.rows.forEach(r => {
      labels.push(r.date.split('-')[0]); 
      dataHrs.push((parseHrs(r.total) / 3600).toFixed(2));
    });

    const ctxHours = document.getElementById('tsHoursChart');
    if (ctxHours) {
      if (hoursChart) hoursChart.destroy();
      hoursChart = new Chart(ctxHours, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Total Hours Worked',
            data: dataHrs,
            backgroundColor: 'rgba(6, 182, 212, 0.5)',
            borderColor: '#06b6d4',
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, title: { display: true, text: 'Daily Hours Logged', color: '#888' } },
          scales: { y: { beginAtZero: true, suggestedMax: 12, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } }
        }
      });
    }

    const ctxStatus = document.getElementById('tsStatusChart');
    if (ctxStatus) {
      if (statusChart) statusChart.destroy();
      statusChart = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
          labels: ['Office', 'WFH', 'Leave', 'WeekEnd', 'Holiday'],
          datasets: [{
            data: [counts['Office'], counts['WFH'], counts['Leave'], counts['WeekEnd'], counts['Holiday']],
            backgroundColor: ['#00b050', '#ffc000', '#ff0000', '#8b5a2b', '#0070c0'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'right', labels: { color: '#ccc' } }, title: { display: true, text: 'Status Distribution', color: '#888' } }
        }
      });
    }
  }

  document.getElementById('btnExportCSV').addEventListener('click', () => {
    const csv = generateCSVData(currentData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentData.empName ? currentData.empName.replace(/ /g, '_') : 'Employee'}_${tsMonthYear.value}_Timesheet.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  });

  document.getElementById('btnExportPDF').addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(16);
    doc.text(`Monthly Timesheet - ${sumMonth.textContent}`, 14, 15);
    
    doc.setFontSize(10);
    doc.text(`Employee ID: ${currentData.empId || 'N/A'}`, 14, 22);
    doc.text(`Employee Name: ${currentData.empName || 'N/A'}`, 80, 22);
    doc.text(`Organization: ${currentData.org || 'N/A'}`, 160, 22);

    const rows = currentData.rows.map(r => [
      r.date, r.day, r.type, r.inTime, r.outTime, r.extra, r.proj, r.meet, r.total
    ]);

    doc.autoTable({
      startY: 28,
      head: [['Date', 'Day', 'Type', 'In', 'Out', 'Extra Hrs', 'Proj Hrs', 'Meet Hrs', 'Total Hrs']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [98, 163, 115] },
      styles: { fontSize: 8, cellPadding: 2 }
    });
    
    let finalY = doc.lastAutoTable.finalY || 28;
    doc.text(`Total Working Days: ${sumWorking.textContent}`, 14, finalY + 10);
    doc.text(`Total Approx Hours: ${sumHours.textContent}`, 100, finalY + 10);

    doc.save(`${currentData.empName ? currentData.empName.replace(/ /g, '_') : 'Employee'}_${tsMonthYear.value}_Timesheet.pdf`);
  });

  const btnCopySummary = document.getElementById('btnCopySummary');
  if (btnCopySummary) {
    btnCopySummary.addEventListener('click', async () => {
      const htmlTable = `<table border="1" style="border-collapse: collapse;">
        <tr><td style="padding: 4px;">Data for the month:</td><td style="padding: 4px;">${sumMonth.textContent}</td></tr>
        <tr><td style="padding: 4px;">Total working days:</td><td style="padding: 4px;">${sumWorking.textContent}</td></tr>
        <tr><td style="padding: 4px;">Total approx. working hours:</td><td style="padding: 4px;">${sumHours.textContent}</td></tr>
        <tr><td style="padding: 4px;">WFH date:</td><td style="padding: 4px;">${sumWfh.textContent}</td></tr>
        <tr><td style="padding: 4px;">Leave date:</td><td style="padding: 4px;">${sumLeave.textContent}</td></tr>
        <tr><td style="padding: 4px;">Comp off:</td><td style="padding: 4px;">${sumComp.textContent}</td></tr>
      </table>`;
      
      const textTable = `Data for the month:\t${sumMonth.textContent}
Total working days:\t${sumWorking.textContent}
Total approx. working hours:\t${sumHours.textContent}
WFH date:\t${sumWfh.textContent}
Leave date:\t${sumLeave.textContent}
Comp off:\t${sumComp.textContent}`;

      const showSuccess = () => {
        const originalText = btnCopySummary.innerHTML;
        btnCopySummary.innerHTML = '✅ Copied!';
        btnCopySummary.style.color = '#10b981';
        btnCopySummary.style.borderColor = '#10b981';
        setTimeout(() => {
          btnCopySummary.innerHTML = originalText;
          btnCopySummary.style.color = 'var(--text)';
          btnCopySummary.style.borderColor = 'var(--border)';
        }, 2000);
      };

      try {
        const item = new ClipboardItem({
          "text/html": new Blob([htmlTable], { type: "text/html" }),
          "text/plain": new Blob([textTable], { type: "text/plain" })
        });
        await navigator.clipboard.write([item]);
        showSuccess();
      } catch (err) {
        // Fallback for browsers that don't support ClipboardItem well
        navigator.clipboard.writeText(textTable).then(showSuccess);
      }
    });
  }

  // ── Backup and Restore ──
  const btnBackupTS = document.getElementById('btnBackupTS');
  const fileRestoreTS = document.getElementById('fileRestoreTS');

  if (btnBackupTS) {
    btnBackupTS.addEventListener('click', () => {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('ts-data-')) {
          try {
            data[key] = JSON.parse(localStorage.getItem(key));
          } catch(e) { }
        }
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ZORO_Timesheet_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    });
  }

  if (fileRestoreTS) {
    fileRestoreTS.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          let count = 0;
          for (const key in data) {
            if (key.startsWith('ts-data-')) {
              localStorage.setItem(key, JSON.stringify(data[key]));
              count++;
            }
          }
          alert(`✅ Successfully restored ${count} month(s) of timesheet data.`);
          loadHistoryDropdown();
          loadDataForMonth(tsMonthYear.value);
        } catch(err) {
          alert('❌ Invalid backup file format.');
          console.error(err);
        }
      };
      reader.readAsText(file);
      fileRestoreTS.value = ''; // Reset input
    });
  }

});

// --- Auto-seed May 2026 Data ---
(function seedMay2026() {
  const mayKey = "ts-data-2026-05";
  if (!localStorage.getItem(mayKey)) {
    const data = {
      "empId": "1200",
      "empName": "Vijay S",
      "org": "Sequoia Applied Technologies",
      "rows": [
        { "date": "01-05-2026", "day": "Friday", "type": "Holiday", "inTime": "", "outTime": "", "extra": "0:00:00", "proj": "0:00:00", "meet": "0:00:00", "total": "0:00:00" },
        { "date": "02-05-2026", "day": "Saturday", "type": "WeekEnd", "inTime": "", "outTime": "", "extra": "0:00:00", "proj": "0:00:00", "meet": "0:00:00", "total": "0:00:00" },
        { "date": "03-05-2026", "day": "Sunday", "type": "WeekEnd", "inTime": "", "outTime": "", "extra": "0:00:00", "proj": "0:00:00", "meet": "0:00:00", "total": "0:00:00" },
        { "date": "04-05-2026", "day": "Monday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "05-05-2026", "day": "Tuesday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "06-05-2026", "day": "Wednesday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "07-05-2026", "day": "Thursday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "08-05-2026", "day": "Friday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "09-05-2026", "day": "Saturday", "type": "WeekEnd", "inTime": "", "outTime": "", "extra": "0:00:00", "proj": "0:00:00", "meet": "0:00:00", "total": "0:00:00" },
        { "date": "10-05-2026", "day": "Sunday", "type": "WeekEnd", "inTime": "", "outTime": "", "extra": "0:00:00", "proj": "0:00:00", "meet": "0:00:00", "total": "0:00:00" },
        { "date": "11-05-2026", "day": "Monday", "type": "Leave", "inTime": "", "outTime": "", "extra": "0:00:00", "proj": "0:00:00", "meet": "0:00:00", "total": "0:00:00" },
        { "date": "12-05-2026", "day": "Tuesday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "13-05-2026", "day": "Wednesday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "14-05-2026", "day": "Thursday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "15-05-2026", "day": "Friday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "16-05-2026", "day": "Saturday", "type": "WeekEnd", "inTime": "", "outTime": "", "extra": "0:00:00", "proj": "0:00:00", "meet": "0:00:00", "total": "0:00:00" },
        { "date": "17-05-2026", "day": "Sunday", "type": "WeekEnd", "inTime": "", "outTime": "", "extra": "0:00:00", "proj": "0:00:00", "meet": "0:00:00", "total": "0:00:00" },
        { "date": "18-05-2026", "day": "Monday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "19-05-2026", "day": "Tuesday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "20-05-2026", "day": "Wednesday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "21-05-2026", "day": "Thursday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "22-05-2026", "day": "Friday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "23-05-2026", "day": "Saturday", "type": "WeekEnd", "inTime": "", "outTime": "", "extra": "0:00:00", "proj": "0:00:00", "meet": "0:00:00", "total": "0:00:00" },
        { "date": "24-05-2026", "day": "Sunday", "type": "WeekEnd", "inTime": "", "outTime": "", "extra": "0:00:00", "proj": "0:00:00", "meet": "0:00:00", "total": "0:00:00" },
        { "date": "25-05-2026", "day": "Monday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "26-05-2026", "day": "Tuesday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "27-05-2026", "day": "Wednesday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "28-05-2026", "day": "Thursday", "type": "Holiday", "inTime": "", "outTime": "", "extra": "0:00:00", "proj": "0:00:00", "meet": "0:00:00", "total": "0:00:00" },
        { "date": "29-05-2026", "day": "Friday", "type": "Office", "inTime": "10:15 AM", "outTime": "07:00 PM", "extra": "0:30:00", "proj": "8:45:00", "meet": "0:00:00", "total": "8:45:00" },
        { "date": "30-05-2026", "day": "Saturday", "type": "WeekEnd", "inTime": "", "outTime": "", "extra": "0:00:00", "proj": "0:00:00", "meet": "0:00:00", "total": "0:00:00" },
        { "date": "31-05-2026", "day": "Sunday", "type": "WeekEnd", "inTime": "", "outTime": "", "extra": "0:00:00", "proj": "0:00:00", "meet": "0:00:00", "total": "0:00:00" }
      ]
    };
    localStorage.setItem(mayKey, JSON.stringify(data));
  }
})();
