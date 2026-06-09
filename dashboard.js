document.addEventListener('DOMContentLoaded', () => {
  setGreeting();
  startClock();
  loadMetrics();
  loadQuickLaunchWidget();
});

function setGreeting() {
  const hour = new Date().getHours();
  const greetingEl = document.getElementById('greetingText');
  const greetingSub = document.querySelector('.greeting-sub');
  
  let text = "Welcome to ZORO's DashBoard!";
  if (hour < 12) text = "Good Morning, Zoro! ☀️";
  else if (hour < 18) text = "Good Afternoon, Zoro! 🌤️";
  else text = "Good Evening, Zoro! 🌙";
  
  if (greetingEl) greetingEl.textContent = text;
  
  // Smart Contextual Sub-greeting
  if (greetingSub) {
    try {
      let msg = "Your central command center for automation & productivity.";
      
      const tasks = JSON.parse(localStorage.getItem('tr-run-tasks') || '[]');
      const activeTasks = tasks.filter(t => !t.completed);
      const overdueTasks = activeTasks.filter(t => t.deadline && new Date(t.deadline) < new Date());
      
      const waterIntake = parseInt(localStorage.getItem('tr-water-intake-ml')) || 0;
      const waterGoal = parseInt(localStorage.getItem('tr-water-goal')) || 2000;
      const waterDate = localStorage.getItem('tr-water-date');
      const today = new Date().toDateString();
      const waterToday = waterDate === today ? waterIntake : 0;
      
      const todayPomoStr = localStorage.getItem('tr-pomo-date');
      const pomoToday = todayPomoStr === today ? parseInt(localStorage.getItem('tr-pomo-sessions') || '0') : 0;
      
      let alerts = [];
      
      if (overdueTasks.length > 0) {
        alerts.push(`${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`);
      } else if (activeTasks.length > 0) {
        alerts.push(`${activeTasks.length} pending task${activeTasks.length > 1 ? 's' : ''}`);
      } else if (tasks.length > 0 && activeTasks.length === 0) {
        alerts.push(`finished all your tasks 🎉`);
      }
      
      if (waterToday === 0 && hour > 10) {
        alerts.push("haven't logged any water yet");
      } else if (waterToday >= waterGoal) {
        alerts.push("hit your hydration goal! 💧");
      }
      
      if (pomoToday > 0 && activeTasks.length > 0) {
        alerts.push(`completed ${pomoToday} focus session${pomoToday > 1 ? 's' : ''} today 🔥`);
      }
      
      if (alerts.length > 0) {
        if (alerts.length === 1) {
          msg = `You have ${alerts[0]}.`;
          if (alerts[0].includes('finished') || alerts[0].includes('hit') || alerts[0].includes('completed')) {
            msg = `You've ${alerts[0]}.`;
          }
        } else {
          msg = `You have ${alerts[0]} and ${alerts[1]}.`;
          if (alerts[0].includes('finished') || alerts[0].includes('hit') || alerts[0].includes('completed')) {
             msg = `You've ${alerts[0]} and ${alerts[1]}.`;
          }
        }
      }
      
      greetingSub.textContent = msg;
    } catch (e) {
      console.error('Error generating smart greeting:', e);
    }
  }
}

function startClock() {
  const clockEl = document.getElementById('liveClock');
  const dateEl = document.getElementById('liveDate');
  if (!clockEl || !dateEl) return;

  function tick() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  tick();
  setInterval(tick, 1000);
}

async function loadMetrics() {
  // Setup global chart defaults (kept for any potential chart use)
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";
  }

  loadSyncHubMetrics();
  loadProductivityMetrics();
  loadTimesheetMetrics();
  loadHydrationMetrics();
}

async function loadSyncHubMetrics() {
  try {
    const res = await fetch('http://localhost:3000/api/matrices', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const matrices = data.matrices || [];
      
      const savedCountEl = document.getElementById('syncSavedCount');
      if (savedCountEl) savedCountEl.textContent = `${matrices.length} states`;

      const qsSyncEl = document.getElementById('qsSyncStates');
      if (qsSyncEl) qsSyncEl.textContent = matrices.length;

      if (matrices.length === 0) return;

      matrices.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
      const latest = matrices[0];

      const counts = latest.statusCounts || { PASSED: 0, FAILED: 0, UNTESTED: 0 };
      
      const total = (counts.PASSED || 0) + (counts.FAILED || 0) + (counts.UNTESTED || 0) + (counts.OTHER || 0);
      const passRate = total > 0 ? Math.round((counts.PASSED||0)/total*100) : 0;
      const failRate = total > 0 ? Math.round((counts.FAILED||0)/total*100) : 0;
      const untestedRate = total > 0 ? Math.round((counts.UNTESTED||0)/total*100) : 0;

      const textContainer = document.getElementById('syncHubTextData');
      if (textContainer) {
        textContainer.innerHTML = `
          <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px;">Latest: <strong style="color:var(--text-primary);">${latest.name}</strong></div>
          
          <div style="display: flex; gap: 8px; margin-bottom: 10px;">
            <div style="flex: 1; text-align: center; padding: 10px 6px; background: rgba(34,197,94,0.08); border-radius: 8px; border: 1px solid rgba(34,197,94,0.15);">
              <div style="font-size: 1.3rem; font-weight: 800; color: #22c55e;">${counts.PASSED||0}</div>
              <div style="font-size: 0.6rem; color: #22c55e; text-transform: uppercase; letter-spacing: 0.5px;">Passed</div>
            </div>
            <div style="flex: 1; text-align: center; padding: 10px 6px; background: rgba(239,68,68,0.08); border-radius: 8px; border: 1px solid rgba(239,68,68,0.15);">
              <div style="font-size: 1.3rem; font-weight: 800; color: #ef4444;">${counts.FAILED||0}</div>
              <div style="font-size: 0.6rem; color: #ef4444; text-transform: uppercase; letter-spacing: 0.5px;">Failed</div>
            </div>
            <div style="flex: 1; text-align: center; padding: 10px 6px; background: rgba(148,163,184,0.08); border-radius: 8px; border: 1px solid rgba(148,163,184,0.15);">
              <div style="font-size: 1.3rem; font-weight: 800; color: #94a3b8;">${counts.UNTESTED||0}</div>
              <div style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Untested</div>
            </div>
          </div>

          <div style="background: rgba(255,255,255,0.03); border-radius: 6px; overflow: hidden; height: 8px; display: flex;">
            <div style="width: ${passRate}%; background: #22c55e; transition: width 1s;"></div>
            <div style="width: ${failRate}%; background: #ef4444; transition: width 1s;"></div>
            <div style="width: ${untestedRate}%; background: #94a3b8; transition: width 1s;"></div>
          </div>
        `;
      }
    }
  } catch(e) {
    console.error("Failed to load Sync Hub metrics", e);
  }
}

function loadProductivityMetrics() {
  try {
    const tasks = JSON.parse(localStorage.getItem('tr-run-tasks') || '[]');
    const activeTasks = tasks.filter(t => !t.completed).length;
    document.getElementById('prodActiveTasks').textContent = activeTasks;

    const qsActiveEl = document.getElementById('qsActiveTasks');
    if (qsActiveEl) qsActiveEl.textContent = activeTasks;

    const notes = JSON.parse(localStorage.getItem('tr-run-notes-list') || '[]');
    document.getElementById('prodNotesCount').textContent = notes.length;

    const taskListEl = document.getElementById('dashboardTaskList');
    if (taskListEl) {
      if (tasks.length === 0) {
        taskListEl.innerHTML = '<li style="text-align:center; color:var(--text-muted); font-size:0.8rem; padding: 2rem 0;">No tasks yet. Enjoy your day! 🎉</li>';
      } else {
        const sortedTasks = [...tasks].sort((a, b) => a.completed - b.completed).slice(0, 8);
        
        taskListEl.innerHTML = sortedTasks.map(t => `
          <li class="dash-task-item ${t.completed ? 'completed' : ''}">
            <div class="dash-task-checkbox">
              ${t.completed ? '<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
            </div>
            <div class="dash-task-text">${t.text}</div>
          </li>
        `).join('');
      }
    }
  } catch(e) {
    console.error("Failed to load Productivity metrics", e);
  }
}

function loadTimesheetMetrics() {
  try {
    const allMonths = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ts-data-')) {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        const monthYear = key.replace('ts-data-', '');
        
        let counts = { Office: 0, Leave: 0, WFH: 0, WeekEnd: 0, Holiday: 0, CompOff: 0 };
        if (data.rows && Array.isArray(data.rows)) {
          data.rows.forEach(r => {
            const t = r.type;
            if (t === 'Office' || t === 'Working') counts.Office++;
            else if (t === 'Leave') counts.Leave++;
            else if (t === 'WFH') counts.WFH++;
            else if (t === 'WeekEnd') counts.WeekEnd++;
            else if (t === 'Holiday') counts.Holiday++;
            else if (t === 'CompOff') counts.CompOff++;
          });
        }
        allMonths.push({ monthYear, counts });
      }
    }

    if (allMonths.length === 0) return;

    allMonths.sort((a, b) => b.monthYear.localeCompare(a.monthYear));
    const activeMonth = allMonths[0];

    document.getElementById('tsRecordsCount').textContent = activeMonth.monthYear;

    const qsWorkingEl = document.getElementById('qsWorkingDays');
    if (qsWorkingEl) qsWorkingEl.textContent = activeMonth.counts.Office;

    const c = activeMonth.counts;

    const textContainer = document.getElementById('tsTextData');
    if (textContainer) {
      textContainer.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
          <div style="padding: 8px; background: rgba(59,130,246,0.08); border-radius: 8px; text-align: center; border: 1px solid rgba(59,130,246,0.15);">
            <div style="font-size: 1.2rem; font-weight: 800; color: #3b82f6;">${c.Office}</div>
            <div style="font-size: 0.6rem; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.5px;">Working</div>
          </div>
          <div style="padding: 8px; background: rgba(168,85,247,0.08); border-radius: 8px; text-align: center; border: 1px solid rgba(168,85,247,0.15);">
            <div style="font-size: 1.2rem; font-weight: 800; color: #a855f7;">${c.WFH}</div>
            <div style="font-size: 0.6rem; color: #a855f7; text-transform: uppercase; letter-spacing: 0.5px;">WFH</div>
          </div>
          <div style="padding: 8px; background: rgba(239,68,68,0.08); border-radius: 8px; text-align: center; border: 1px solid rgba(239,68,68,0.15);">
            <div style="font-size: 1.2rem; font-weight: 800; color: #ef4444;">${c.Leave}</div>
            <div style="font-size: 0.6rem; color: #ef4444; text-transform: uppercase; letter-spacing: 0.5px;">Leaves</div>
          </div>
          <div style="padding: 8px; background: rgba(34,197,94,0.08); border-radius: 8px; text-align: center; border: 1px solid rgba(34,197,94,0.15);">
            <div style="font-size: 1.2rem; font-weight: 800; color: #22c55e;">${c.CompOff}</div>
            <div style="font-size: 0.6rem; color: #22c55e; text-transform: uppercase; letter-spacing: 0.5px;">Comp Off</div>
          </div>
          <div style="padding: 8px; background: rgba(245,158,11,0.08); border-radius: 8px; text-align: center; border: 1px solid rgba(245,158,11,0.15);">
            <div style="font-size: 1.2rem; font-weight: 800; color: #f59e0b;">${c.Holiday}</div>
            <div style="font-size: 0.6rem; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.5px;">Holidays</div>
          </div>
          <div style="padding: 8px; background: rgba(148,163,184,0.08); border-radius: 8px; text-align: center; border: 1px solid rgba(148,163,184,0.15);">
            <div style="font-size: 1.2rem; font-weight: 800; color: #94a3b8;">${c.WeekEnd}</div>
            <div style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Weekends</div>
          </div>
        </div>
      `;
    }

    // --- Extra Data: Today's In/Out ---
    const tsTodayInOut = document.getElementById('tsTodayInOut');
    if (tsTodayInOut) {
      const activeData = JSON.parse(localStorage.getItem(`ts-data-${activeMonth.monthYear}`) || '{}');
      const todayObj = new Date();
      const todayStr = `${String(todayObj.getDate()).padStart(2, '0')}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${todayObj.getFullYear()}`;
      
      let inOutText = '--:-- / --:--';
      if (activeData && activeData.rows) {
        const todayRow = activeData.rows.find(r => r.date === todayStr);
        if (todayRow) {
          const tIn = todayRow.inTime || '--:--';
          const tOut = todayRow.outTime || '--:--';
          if (tIn !== '--:--' || tOut !== '--:--') {
            inOutText = `${tIn} / ${tOut}`;
          }
        }
      }
      tsTodayInOut.textContent = inOutText;
    }

    // --- Extra Data: Upcoming Holiday / Event ---
    const tsNextHoliday = document.getElementById('tsNextHoliday');
    const qsNextEvent = document.getElementById('qsNextEvent');
    if (tsNextHoliday) {
      const calUrl = localStorage.getItem('ts-cal-url');
      if (calUrl) {
        const d = new Date();
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const fetchUrl = calUrl === 'local' 
          ? `http://localhost:3000/api/calendar/${y}/${m}?local=true`
          : `http://localhost:3000/api/calendar/${y}/${m}?url=${encodeURIComponent(calUrl)}`;
          
        fetch(fetchUrl)
          .then(r => r.json())
          .then(events => {
            const todayISO = new Date().toISOString().split('T')[0];
            const upcoming = events.filter(e => e.date.split('T')[0] >= todayISO).sort((a,b) => a.date.localeCompare(b.date));
            if (upcoming.length > 0) {
              const next = upcoming[0];
              const dStr = new Date(next.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              tsNextHoliday.textContent = `${next.name} (${dStr})`;
              if (qsNextEvent) qsNextEvent.textContent = `${next.name}`;
            } else {
              tsNextHoliday.textContent = "No more events this month";
              tsNextHoliday.style.color = "var(--text-muted)";
              if (qsNextEvent) qsNextEvent.textContent = "None";
            }
          }).catch(err => {
            tsNextHoliday.textContent = "Sync Error";
            tsNextHoliday.style.color = "var(--text-muted)";
            if (qsNextEvent) qsNextEvent.textContent = "--";
          });
      } else {
        tsNextHoliday.textContent = "Calendar not synced";
        tsNextHoliday.style.color = "var(--text-muted)";
        if (qsNextEvent) qsNextEvent.textContent = "Not synced";
      }
    }

  } catch(e) {
    console.error("Failed to load Timesheet metrics", e);
  }
}

function loadHydrationMetrics() {
  try {
    const intakeEl = document.getElementById('waterIntakeVal');
    const fillEl = document.getElementById('waterWidgetFill');
    const pctEl = document.getElementById('waterPctText');
    const goalEl = document.getElementById('waterGoalText');
    const qsWaterEl = document.getElementById('qsWaterMl');
    
    if (!intakeEl || !fillEl) return;

    let currentIntake = 0;
    const lastDate = localStorage.getItem('tr-water-date');
    const today = new Date().toDateString();
    
    if (lastDate === today) {
      currentIntake = parseInt(localStorage.getItem('tr-water-intake-ml')) || 0;
    }

    const goal = parseInt(localStorage.getItem('tr-water-goal')) || 2000;
    const percentage = Math.min(100, Math.round((currentIntake / goal) * 100));
    
    intakeEl.textContent = currentIntake;
    fillEl.style.height = `${percentage}%`;
    
    if (pctEl) pctEl.textContent = `${percentage}%`;
    if (goalEl) goalEl.textContent = `of ${goal} ml goal`;
    if (qsWaterEl) qsWaterEl.textContent = currentIntake;
  } catch(e) {
    console.error("Failed to load Hydration metrics", e);
  }
}

// ══════════ QUICK-LAUNCH (DASHBOARD) ══════════
async function loadQuickLaunchWidget() {
  try {
    const qlTotalLinks = document.getElementById('qlTotalLinks');
    const qlWidgetLinks = document.getElementById('qlWidgetLinks');
    
    if (!qlWidgetLinks) return;

    let folders = [];
    try {
      const res = await fetch('http://localhost:3000/api/quicklaunch');
      if (res.ok) {
        folders = await res.json();
      }
    } catch (e) {
      console.warn("Failed to fetch from server, falling back to local storage");
    }

    if (!folders || folders.length === 0) {
      const dataStr = localStorage.getItem('tr-quicklaunch-data');
      if (dataStr) folders = JSON.parse(dataStr);
    }
    
    let totalLinks = 0;
    let allLinks = [];
    folders.forEach(f => {
      if (f.links) {
        totalLinks += f.links.length;
        f.links.forEach(l => allLinks.push(l));
      }
    });

    if (qlTotalLinks) qlTotalLinks.textContent = totalLinks;
    
    qlWidgetLinks.innerHTML = '';
    
    if (allLinks.length === 0) {
      qlWidgetLinks.innerHTML = '<div class="wc-placeholder" style="width:100%">No links saved yet</div>';
      return;
    }

    // Show up to 10 links in the widget
    const displayLinks = allLinks.slice(0, 10);
    displayLinks.forEach(link => {
      const a = document.createElement('a');
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = link.name;
      a.style.background = 'var(--bg)';
      a.style.border = '1px solid var(--border)';
      a.style.borderRadius = 'var(--r-sm)';
      a.style.padding = '4px 8px';
      a.style.fontSize = '14px';
      a.style.textDecoration = 'none';
      a.style.color = 'var(--text)';
      a.style.display = 'inline-block';
      a.style.transition = 'all 0.2s';
      
      a.innerHTML = `<span style="margin-right: 4px;">${link.emoji || '🔗'}</span><span style="font-size: 11px; font-weight: 600;">${link.name}</span>`;
      
      a.addEventListener('mouseenter', () => {
        a.style.background = 'var(--faint)';
        a.style.borderColor = 'var(--primary-g)';
      });
      a.addEventListener('mouseleave', () => {
        a.style.background = 'var(--bg)';
        a.style.borderColor = 'var(--border)';
      });
      
      qlWidgetLinks.appendChild(a);
    });
    
    if (allLinks.length > 10) {
      const more = document.createElement('span');
      more.style.fontSize = '11px';
      more.style.color = 'var(--muted)';
      more.style.alignSelf = 'center';
      more.textContent = `+${allLinks.length - 10} more`;
      qlWidgetLinks.appendChild(more);
    }
    
  } catch(e) {
    console.error("Failed to load Quick-Launch widget", e);
  }
}

// ══════════ POMODORO TIMER (DASHBOARD) ══════════
document.addEventListener('DOMContentLoaded', () => {
  const pomoTime = document.getElementById('pomoTime');
  const btnPomoStart = document.getElementById('btnPomoStart');
  const btnPomoPause = document.getElementById('btnPomoPause');
  const btnPomoReset = document.getElementById('btnPomoReset');
  const pomoModeBtns = document.querySelectorAll('.dash-pomo-mode-btn');
  const pomoSessionCount = document.getElementById('pomoSessionCount');

  if (!pomoTime || !btnPomoStart) return;

  let pomoTimer = null;
  let pomoTimeLeft = 25 * 60;
  let isPomoRunning = false;
  let pomoMode = 'work'; // 'work' or 'break'

  // Load daily sessions
  const todayDateStr = new Date().toDateString();
  const savedPomoDate = localStorage.getItem('tr-pomo-date');
  let dailySessions = 0;
  if (savedPomoDate === todayDateStr) {
    dailySessions = parseInt(localStorage.getItem('tr-pomo-sessions') || '0');
  } else {
    localStorage.setItem('tr-pomo-date', todayDateStr);
    localStorage.setItem('tr-pomo-sessions', '0');
  }
  if (pomoSessionCount) pomoSessionCount.textContent = dailySessions;

  function updatePomoDisplay() {
    if (!pomoTime) return;
    const m = Math.floor(pomoTimeLeft / 60);
    const s = pomoTimeLeft % 60;
    pomoTime.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function togglePomoMode(mode) {
    pomoMode = mode;
    pomoModeBtns.forEach(b => {
      if (b.dataset.mode === mode) {
        b.classList.add('active');
        b.style.background = 'var(--bg)';
        b.style.color = 'var(--text)';
        b.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      } else {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = 'var(--muted)';
        b.style.boxShadow = 'none';
      }
    });
    pomoTimeLeft = mode === 'work' ? 25 * 60 : 5 * 60;
    if (isPomoRunning) {
      clearInterval(pomoTimer);
      isPomoRunning = false;
      btnPomoStart.style.display = 'block';
      btnPomoPause.style.display = 'none';
    }
    updatePomoDisplay();
  }

  pomoModeBtns.forEach(btn => {
    btn.addEventListener('click', () => togglePomoMode(btn.dataset.mode));
  });

  btnPomoStart.addEventListener('click', () => {
    if (isPomoRunning) return;
    if (Notification.permission === 'default') Notification.requestPermission();
    isPomoRunning = true;
    btnPomoStart.style.display = 'none';
    btnPomoPause.style.display = 'block';
    
    pomoTimer = setInterval(() => {
      pomoTimeLeft--;
      updatePomoDisplay();
      
      if (pomoTimeLeft <= 0) {
        clearInterval(pomoTimer);
        isPomoRunning = false;
        btnPomoStart.style.display = 'block';
        btnPomoPause.style.display = 'none';
        
        if (pomoMode === 'work') {
          dailySessions++;
          localStorage.setItem('tr-pomo-sessions', dailySessions);
          if (pomoSessionCount) pomoSessionCount.textContent = dailySessions;
          if (Notification.permission === 'granted') {
            new Notification('Focus Session Complete!', { body: 'Great job! Time for a 5-minute break.' });
          }
          togglePomoMode('break');
          setGreeting(); // Update dashboard greeting smartly
        } else {
          if (Notification.permission === 'granted') {
            new Notification('Break Over!', { body: 'Time to get back to work.' });
          }
          togglePomoMode('work');
        }
      }
    }, 1000);
  });

  btnPomoPause.addEventListener('click', () => {
    isPomoRunning = false;
    clearInterval(pomoTimer);
    btnPomoStart.style.display = 'block';
    btnPomoPause.style.display = 'none';
  });

  btnPomoReset.addEventListener('click', () => {
    isPomoRunning = false;
    clearInterval(pomoTimer);
    btnPomoStart.style.display = 'block';
    btnPomoPause.style.display = 'none';
    pomoTimeLeft = pomoMode === 'work' ? 25 * 60 : 5 * 60;
    updatePomoDisplay();
  });
});
