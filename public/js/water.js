document.addEventListener('DOMContentLoaded', () => {
  const waterLevel = document.getElementById('waterLevel');
  const intakeText = document.getElementById('intakeText');
  const percentageText = document.getElementById('percentageText');
  const miniProgressFill = document.getElementById('miniProgressFill');
  const logCount = document.getElementById('logCount');
  
  const btnSmall = document.getElementById('btnSmall');
  const btnLarge = document.getElementById('btnLarge');
  const btnBottle = document.getElementById('btnBottle');
  const customAmount = document.getElementById('customAmount');
  const btnCustom = document.getElementById('btnCustom');
  
  const btnReset = document.getElementById('btnReset');
  const goalInput = document.getElementById('goalInput');
  const dailyLog = document.getElementById('dailyLog');
  const soundToggle = document.getElementById('soundToggle');

  const reminderToggle = document.getElementById('reminderToggle');
  const reminderInterval = document.getElementById('reminderInterval');
  const reminderStatus = document.getElementById('reminderStatus');

  let GOAL = parseInt(localStorage.getItem('tr-water-goal')) || 2000;
  goalInput.value = GOAL;

  let currentIntake = parseInt(localStorage.getItem('tr-water-intake-ml')) || 0;
  let logHistory = JSON.parse(localStorage.getItem('tr-water-log') || '[]');
  let lastDate = localStorage.getItem('tr-water-date');
  let reminderTimer = null;

  // Reset if it's a new day
  const today = new Date().toDateString();
  if (lastDate !== today) {
    currentIntake = 0;
    logHistory = [];
    saveData();
  }

  function playWaterSound() {
    if (!soundToggle.checked) return;
    
    // Quick and dirty Web Audio API water sound
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    // Sweep frequency down to sound like a bloop/bubble
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }

  function addWater(amount) {
    currentIntake += amount;
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    logHistory.unshift({ time: timeStr, amount: amount });
    
    saveData();
    playWaterSound();
    
    // Add a little pop animation to the glass
    const glass = document.querySelector('.glass');
    glass.style.transform = 'scale(1.05)';
    setTimeout(() => glass.style.transform = 'scale(1)', 200);
  }

  function saveData() {
    localStorage.setItem('tr-water-intake-ml', currentIntake);
    localStorage.setItem('tr-water-log', JSON.stringify(logHistory));
    localStorage.setItem('tr-water-date', new Date().toDateString());
    updateUI();
  }

  function updateUI() {
    const percentage = Math.min(100, Math.round((currentIntake / GOAL) * 100));
    waterLevel.style.height = `${percentage}%`;
    intakeText.textContent = `${currentIntake} / ${GOAL} ml`;
    
    // Update mini progress bar
    if (miniProgressFill) {
      miniProgressFill.style.width = `${percentage}%`;
      if (percentage >= 100) {
        miniProgressFill.classList.add('done');
      } else {
        miniProgressFill.classList.remove('done');
      }
    }

    // Change text based on completion
    if (percentage >= 100) {
      percentageText.style.color = '#10b981';
      percentageText.textContent = '🎉 Daily Goal Reached!';
      percentageText.classList.add('done');
    } else {
      percentageText.style.color = '#0ea5e9';
      percentageText.textContent = `${percentage}% of Daily Goal`;
      percentageText.classList.remove('done');
    }

    // Update log count badge
    if (logCount) logCount.textContent = logHistory.length;

    // Render log
    if (logHistory.length === 0) {
      dailyLog.innerHTML = `<li class="log-empty">No water logged yet today.</li>`;
    } else {
      dailyLog.innerHTML = logHistory.map(entry => `
        <li class="log-item">
          <span class="log-time">${entry.time}</span>
          <span class="log-amount">+${entry.amount} ml</span>
        </li>
      `).join('');
    }
  }

  // --- Controls ---
  btnSmall.addEventListener('click', () => addWater(250));
  btnLarge.addEventListener('click', () => addWater(500));
  if (btnBottle) btnBottle.addEventListener('click', () => addWater(750));
  
  btnCustom.addEventListener('click', () => {
    const amt = parseInt(customAmount.value);
    if (!isNaN(amt) && amt > 0) {
      addWater(amt);
      customAmount.value = '';
    }
  });

  goalInput.addEventListener('change', () => {
    const newGoal = parseInt(goalInput.value);
    if (!isNaN(newGoal) && newGoal > 0) {
      GOAL = newGoal;
      localStorage.setItem('tr-water-goal', GOAL);
      updateUI();
    }
  });

  soundToggle.addEventListener('change', () => {
    localStorage.setItem('tr-water-sound', soundToggle.checked);
  });
  if (localStorage.getItem('tr-water-sound') === 'false') {
    soundToggle.checked = false;
  }

  // --- Reset ---
  btnReset.addEventListener('click', () => {
    if (confirm("Reset today's water intake?")) {
      currentIntake = 0;
      logHistory = [];
      saveData();
    }
  });

  // --- Reminders ---
  const savedReminder = localStorage.getItem('tr-water-reminder') === 'true';
  const savedInterval = localStorage.getItem('tr-water-interval') || '60';
  
  reminderToggle.checked = savedReminder;
  reminderInterval.value = savedInterval;

  function scheduleReminder() {
    if (reminderTimer) clearInterval(reminderTimer);
    
    if (reminderToggle.checked) {
      const minutes = parseInt(reminderInterval.value);
      reminderStatus.textContent = `⏰ Active — Next reminder in ${minutes} minutes.`;
      
      reminderTimer = setInterval(() => {
        showNotification();
      }, minutes * 60 * 1000);
    } else {
      reminderStatus.textContent = 'Reminders are currently disabled.';
    }
  }

  function showNotification() {
    const title = "💧 Time to Drink Water!";
    const options = {
      body: `You've had ${currentIntake}/${GOAL}ml today. Stay hydrated!`,
      icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💧</text></svg>'
    };

    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, options);
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
          if (permission === "granted") new Notification(title, options);
        });
      } else {
        alert(`${title}\n${options.body}`);
      }
    } else {
      alert(`${title}\n${options.body}`);
    }
  }

  reminderToggle.addEventListener('change', () => {
    localStorage.setItem('tr-water-reminder', reminderToggle.checked);
    
    if (reminderToggle.checked && "Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
    
    scheduleReminder();
  });

  reminderInterval.addEventListener('change', () => {
    localStorage.setItem('tr-water-interval', reminderInterval.value);
    scheduleReminder();
  });

  // Initial render
  updateUI();
  scheduleReminder();
});
