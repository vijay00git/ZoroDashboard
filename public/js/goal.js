document.addEventListener('DOMContentLoaded', () => {
  const goalInput = document.getElementById('goalInput');
  const btnGenerate = document.getElementById('btnGenerateRoadmap');
  const roadmapList = document.getElementById('roadmapList');
  const customTopicInput = document.getElementById('customTopicInput');
  const btnAddCustom = document.getElementById('btnAddCustomTopic');
  const lessonTitle = document.getElementById('lessonTitle');
  const lessonContent = document.getElementById('lessonContent');
  const lessonBadge = document.getElementById('lessonBadge');
  const btnMarkLearned = document.getElementById('btnMarkLearned');
  const userPointsDisplay = document.getElementById('userPointsDisplay');

  const qaInput = document.getElementById('qaInput');
  const btnAskQA = document.getElementById('btnAskQA');
  const lessonFooter = document.getElementById('lessonFooter');
  const btnSavePDF = document.getElementById('btnSavePDF');
  
  const goalSelector = document.getElementById('goalSelector');
  const newGoalGroup = document.getElementById('newGoalGroup');
  const btnDeleteGoal = document.getElementById('btnDeleteGoal');

  let points = parseInt(localStorage.getItem('tr-goals-points')) || 0;
  let library = JSON.parse(localStorage.getItem('tr-goals-library')) || [];
  
  // Migration
  let oldRoadmap = JSON.parse(localStorage.getItem('tr-goals-roadmap'));
  if (oldRoadmap && !library.length) {
    library.push({
      id: 'g_' + Date.now(),
      skillName: localStorage.getItem('tr-goals-skill') || 'My First Goal',
      roadmap: oldRoadmap
    });
    localStorage.removeItem('tr-goals-roadmap');
    localStorage.removeItem('tr-goals-skill');
    localStorage.setItem('tr-goals-library', JSON.stringify(library));
  }

  let currentGoalId = localStorage.getItem('tr-goals-current-id');
  if (!currentGoalId && library.length > 0) currentGoalId = library[0].id;
  
  let activeTopicId = null;

  function getActiveGoal() {
    return library.find(g => g.id === currentGoalId) || null;
  }

  function saveLibrary() {
    localStorage.setItem('tr-goals-library', JSON.stringify(library));
    if (currentGoalId) localStorage.setItem('tr-goals-current-id', currentGoalId);
  }

  function renderGoalSelector() {
    goalSelector.innerHTML = '<option value="new">+ Create New Goal</option>';
    library.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.skillName;
      if (g.id === currentGoalId) opt.selected = true;
      goalSelector.appendChild(opt);
    });
    
    if (currentGoalId === 'new' || !library.length) {
      newGoalGroup.style.display = 'flex';
      btnDeleteGoal.style.display = 'none';
      goalSelector.value = 'new';
    } else {
      newGoalGroup.style.display = 'none';
      btnDeleteGoal.style.display = 'block';
      if (currentGoalId) goalSelector.value = currentGoalId;
    }
  }

  btnDeleteGoal.addEventListener('click', () => {
    if (!currentGoalId || currentGoalId === 'new') return;
    if (confirm('Are you sure you want to permanently delete this learning goal and all its progress?')) {
      library = library.filter(g => g.id !== currentGoalId);
      currentGoalId = library.length > 0 ? library[0].id : 'new';
      saveLibrary();
      
      // Update Dashboard widget
      if (typeof loadGoalWidget === 'function') loadGoalWidget();
      
      renderRoadmap();
      
      if (currentGoalId === 'new') {
        document.getElementById('lessonHero').style.display = 'none';
        lessonContent.innerHTML = `<div class="placeholder-state" style="padding-top: 100px;">
            <div style="font-size: 5rem; margin-bottom: 20px; animation: pulseQuest 2s infinite;">🗺️</div>
            <h3 style="margin:0 0 10px 0; color: var(--text-primary); font-size: 2rem;">Start a New Quest</h3>
            <p style="font-size: 1.1rem;">Generate a new roadmap to begin your training.</p>
          </div>`;
        lessonFooter.style.display = 'none';
      }
    }
  });

  goalSelector.addEventListener('change', (e) => {
    currentGoalId = e.target.value;
    if (currentGoalId === 'new') {
      newGoalGroup.style.display = 'flex';
      roadmapList.innerHTML = `
        <div class="placeholder-state">
          <div style="font-size: 4rem; margin-bottom: 10px;">⚔️</div>
          <p style="font-size: 1.1rem; font-weight: 500;">Declare your goal to the AI, and it will generate a master quest line for you to conquer!</p>
        </div>`;
      document.getElementById('lessonHero').style.display = 'none';
      lessonContent.innerHTML = `<div class="placeholder-state" style="padding-top: 100px;">
          <div style="font-size: 5rem; margin-bottom: 20px; animation: pulseQuest 2s infinite;">🗺️</div>
          <h3 style="margin:0 0 10px 0; color: var(--text-primary); font-size: 2rem;">Quest Map Ready</h3>
          <p style="font-size: 1.1rem;">Select a quest node on the left to begin your training.</p>
        </div>`;
      lessonFooter.style.display = 'none';
    } else {
      newGoalGroup.style.display = 'none';
      saveLibrary();
      renderRoadmap();
    }
  });

  function getLevelData(pts) {
    if (pts < 100) return { title: 'Novice', min: 0, max: 100, pct: pts, icon: '🥚' };
    if (pts < 300) return { title: 'Apprentice', min: 100, max: 300, pct: ((pts-100)/200)*100, icon: '🌱' };
    if (pts < 600) return { title: 'Scholar', min: 300, max: 600, pct: ((pts-300)/300)*100, icon: '📘' };
    if (pts < 1000) return { title: 'Expert', min: 600, max: 1000, pct: ((pts-600)/400)*100, icon: '🔥' };
    return { title: 'Grandmaster', min: 1000, max: 1000, pct: 100, icon: '👑' };
  }

  let currentLevelTitle = '';

  function updatePoints() {
    localStorage.setItem('tr-goals-points', points);
    const lvl = getLevelData(points);
    
    // Check for level up
    if (currentLevelTitle && currentLevelTitle !== lvl.title && points > 0) {
      showLevelUpModal(lvl);
    }
    currentLevelTitle = lvl.title;

    document.getElementById('userLevelTitle').textContent = lvl.title;
    document.getElementById('userPointsDisplay').textContent = `${points} / ${lvl.max} XP`;
    document.getElementById('levelProgress').style.width = `${lvl.pct}%`;
    
    const rankIcon = document.getElementById('rankIcon');
    if (rankIcon) rankIcon.textContent = lvl.icon;
  }
  
  function showLevelUpModal(lvl) {
    const modal = document.getElementById('levelUpModal');
    if (!modal) return;
    document.getElementById('modalRankIcon').textContent = lvl.icon;
    document.getElementById('modalRankName').textContent = lvl.title;
    modal.style.display = 'flex';
    
    // Epic confetti
    const duration = 3000;
    const end = Date.now() + duration;
    (function frame() {
      if (typeof confetti !== 'undefined') {
        confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#f59e0b', '#ef4444', '#ec4899'] });
        confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#f59e0b', '#ef4444', '#ec4899'] });
      }
      if (Date.now() < end) requestAnimationFrame(frame);
    }());
  }

  updatePoints();

  // Simple Confetti Function
  function shootConfetti() {
    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement('div');
      confetti.className = 'confetti';
      document.body.appendChild(confetti);
      
      const left = Math.random() * 100;
      const animationDuration = Math.random() * 2 + 1;
      
      confetti.style.left = left + 'vw';
      confetti.style.top = '-10px';
      confetti.style.backgroundColor = ['#f59e0b', '#ec4899', '#8b5cf6', '#10b981', '#3b82f6'][Math.floor(Math.random() * 5)];
      confetti.style.transition = `top ${animationDuration}s cubic-bezier(0.25, 1, 0.5, 1), opacity ${animationDuration}s ease-in, transform ${animationDuration}s ease-in`;
      
      setTimeout(() => {
        confetti.style.top = '100vh';
        confetti.style.opacity = '1';
        confetti.style.transform = `rotate(${Math.random() * 720}deg)`;
      }, 50);

      setTimeout(() => confetti.remove(), animationDuration * 1000);
    }
  }

  function toggleModule(modId) {
    const el = document.getElementById(modId);
    if (el) el.classList.toggle('collapsed');
  }

  function renderRoadmap() {
    renderGoalSelector();
    const activeGoal = getActiveGoal();
    
    if (!activeGoal || !activeGoal.roadmap || !activeGoal.roadmap.length) {
      roadmapList.innerHTML = `
        <div class="placeholder-state">
          <div style="font-size: 4rem; margin-bottom: 10px;">⚔️</div>
          <p style="font-size: 1.1rem; font-weight: 500;">Declare your goal to the AI, and it will generate a master quest line for you to conquer!</p>
        </div>`;
      return;
    }

    roadmapList.innerHTML = '';
    
    // Normalize data: if old flat format, wrap it in a 'General' module.
    let displayRoadmap = activeGoal.roadmap;
    if (displayRoadmap[0] && !displayRoadmap[0].subtopics) {
      displayRoadmap = [{ id: 'mod_flat', module: 'General Topics', subtopics: activeGoal.roadmap }];
    }

    displayRoadmap.forEach((mod, mIndex) => {
      const modId = 'mod_' + mIndex;
      
      const modContainer = document.createElement('div');
      modContainer.className = 'tree-module';
      modContainer.id = modId;
      
      const modHeader = document.createElement('div');
      modHeader.className = 'tree-module-header';
      
      const total = mod.subtopics.length;
      const comp = mod.subtopics.filter(t => t.completed).length;
      const isAllComp = total > 0 && comp === total;
      
      modHeader.innerHTML = `<span class="caret">▼</span> 📁 ${mod.module} <span style="margin-left:auto; font-size:0.75rem; font-weight:normal; opacity:0.6;">${comp}/${total}</span>`;
      modHeader.addEventListener('click', () => toggleModule(modId));
      
      const subContainer = document.createElement('div');
      subContainer.className = 'tree-subtopics';
      
      mod.subtopics.forEach((topic, tIndex) => {
        const tEl = document.createElement('div');
        tEl.className = `tree-topic-item ${topic.completed ? 'completed' : ''} ${topic.id === activeTopicId ? 'active' : ''}`;
        tEl.innerHTML = `
          <span class="status-icon">${topic.completed ? '✅' : '📄'}</span>
          <span class="topic-title">${topic.title}</span>
        `;
        tEl.addEventListener('click', () => loadLesson(topic.id, mod.module));
        subContainer.appendChild(tEl);
      });
      
      modContainer.appendChild(modHeader);
      modContainer.appendChild(subContainer);
      roadmapList.appendChild(modContainer);
    });
  }

  async function getAIResponse(prompt, system) {
    const key = localStorage.getItem('zoro-ai-key');
    const model = localStorage.getItem('zoro-ai-model') || 'gemini-1.5-flash-8b';
    
    if (!key) {
      throw new Error("Please connect your Gemini API key using the AI Assistant panel (bottom right) first!");
    }

    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, model, system, prompt })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Server error ${res.status}`);
    }
    const data = await res.json();
    return data.text;
  }

  btnGenerate.addEventListener('click', async () => {
    const skill = goalInput.value.trim();
    if (!skill) return alert('Please enter a skill you want to learn.');

    btnGenerate.disabled = true;
    btnGenerate.innerHTML = '<div class="spinner" style="width:14px; height:14px; border-width:2px; display:inline-block; vertical-align:middle; margin-right:6px;"></div> Generating...';
    
    try {
      const prompt = `I want to learn: ${skill}. Generate a comprehensive, step-by-step roadmap. Break it down into major Modules, and under each module provide small, bite-sized topics. 
      Return ONLY a valid JSON array of objects. Do not include markdown formatting like \`\`\`json.
      Format exactly like this:
      [
        {
          "module": "Module 1 Name",
          "topics": ["Tiny Topic 1", "Tiny Topic 2", "Tiny Topic 3"]
        },
        {
          "module": "Module 2 Name",
          "topics": ["Tiny Topic 4"]
        }
      ]`;
      const system = "You are an expert tutor AI returning raw JSON arrays. NO MARKDOWN.";
      
      const response = await getAIResponse(prompt, system);
      
      // Attempt to parse JSON safely by stripping backticks if any
      const cleaned = response.replace(/^```json/im, '').replace(/^```/im, '').replace(/```$/im, '').trim();
      const modules = JSON.parse(cleaned);

      if (!Array.isArray(modules)) throw new Error("AI did not return a valid list.");

      const newRoadmap = modules.map((m, mIdx) => ({
        id: 'mod_' + Date.now() + '_' + mIdx,
        module: m.module || `Module ${mIdx + 1}`,
        subtopics: (m.topics || []).map((t, tIdx) => ({
          id: 'top_' + Date.now() + '_' + mIdx + '_' + tIdx,
          title: t,
          completed: false,
          lessonContent: null
        }))
      }));
      
      const newGoal = {
        id: 'g_' + Date.now(),
        skillName: skill,
        roadmap: newRoadmap
      };
      
      library.push(newGoal);
      currentGoalId = newGoal.id;
      saveLibrary();
      
      renderRoadmap();
      lessonContent.innerHTML = `<div class="placeholder-state" style="padding-top: 100px;">
          <div style="font-size: 4rem; margin-bottom: 20px;">✅</div>
          <h3 style="margin:0 0 10px 0; color: var(--text-primary);">Roadmap Generated!</h3>
          <p>Click on the first topic on the left to start learning.</p>
        </div>`;
      lessonFooter.style.display = 'none';

    } catch (err) {
      alert("Failed to generate roadmap: " + err.message);
    } finally {
      btnGenerate.disabled = false;
      btnGenerate.innerHTML = '🚀 Generate AI Roadmap';
    }
  });

  // Helper to find a topic in the new nested structure
  function findTopicInRoadmap(roadmap, topicId) {
    if (!roadmap) return null;
    if (roadmap[0] && !roadmap[0].subtopics) return roadmap.find(t => t.id === topicId); // flat old support
    
    for (const mod of roadmap) {
      const t = mod.subtopics.find(t => t.id === topicId);
      if (t) return t;
    }
    return null;
  }

  // Helper to get all topics flat
  function getAllTopicsFlat(roadmap) {
    if (!roadmap) return [];
    if (roadmap[0] && !roadmap[0].subtopics) return roadmap;
    let arr = [];
    roadmap.forEach(m => { arr = arr.concat(m.subtopics); });
    return arr;
  }

  btnAddCustom.addEventListener('click', () => {
    const activeGoal = getActiveGoal();
    if (!activeGoal) return alert("Please select or generate a goal first.");
    
    const title = customTopicInput.value.trim();
    if (!title) return;
    
    let targetMod = null;
    if (activeGoal.roadmap[0] && !activeGoal.roadmap[0].subtopics) {
      // old flat
      activeGoal.roadmap.push({ id: 'top_'+Date.now(), title, completed: false, lessonContent: null });
    } else {
      // Add to last module, or create a custom one
      if (activeGoal.roadmap.length === 0) {
        activeGoal.roadmap.push({ module: 'Custom Topics', subtopics: [] });
      }
      targetMod = activeGoal.roadmap[activeGoal.roadmap.length - 1];
      targetMod.subtopics.push({ id: 'top_'+Date.now(), title, completed: false, lessonContent: null });
    }
    
    saveLibrary();
    customTopicInput.value = '';
    renderRoadmap();
  });

  async function loadLesson(topicId, moduleName = "") {
    const activeGoal = getActiveGoal();
    if (!activeGoal) return;
    
    activeTopicId = topicId;
    renderRoadmap();

    const topic = findTopicInRoadmap(activeGoal.roadmap, topicId);
    if (!topic) return;

    document.getElementById('lessonHero').style.display = 'block';
    document.getElementById('lessonTitleHero').textContent = topic.title;
    document.getElementById('lessonBadgeHero').textContent = moduleName || "Quest Node";

    lessonContent.innerHTML = `<div class="placeholder-state" style="padding-top: 100px;">
      <div class="spinner" style="width:50px; height:50px; margin-bottom: 20px; border-color: var(--primary); border-right-color: transparent;"></div>
      <h3 style="color: var(--primary);">Summoning AI Tutor...</h3>
    </div>`;
    lessonFooter.style.display = 'none';

    try {
      if (topic.lessonContent) {
        // Load saved lesson
        lessonContent.innerHTML = marked.parse(topic.lessonContent);
        document.getElementById('lessonBadgeHero').textContent = (moduleName ? moduleName + " • " : "") + "Saved Scroll";
      } else {
        const modContext = moduleName ? `This is part of the "${moduleName}" module.` : '';
        const prompt = `Teach me about "${topic.title}" in the context of learning "${activeGoal.skillName}". ${modContext}
        Keep the lesson extremely focused, concise, and bite-sized since it's just one small sub-topic. Provide real-world examples, and use code snippets if applicable. 
        Format the response using Markdown. Be encouraging and act as my personal expert tutor.`;
        const system = "You are an expert, friendly AI tutor. Use markdown formatting to make the lesson highly readable with headers, bullet points, and code blocks.";
        
        const response = await getAIResponse(prompt, system);
        
        topic.lessonContent = response; // Save it to avoid fetching again
        saveLibrary();
        
        lessonContent.innerHTML = marked.parse(response);
        document.getElementById('lessonBadgeHero').textContent = (moduleName ? moduleName + " • " : "") + "Newly Written Scroll";
      }
      
      lessonFooter.style.display = 'flex';
      btnMarkLearned.style.display = topic.completed ? 'none' : 'block';

    } catch (err) {
      lessonContent.innerHTML = `<div class="placeholder-state"><p style="color:red;">Error loading lesson. Check console.</p></div>`;
      document.getElementById('lessonBadgeHero').textContent = "Error";
    }
  }

  btnMarkLearned.addEventListener('click', () => {
    const activeGoal = getActiveGoal();
    if (!activeGoal) return;
    const topic = findTopicInRoadmap(activeGoal.roadmap, activeTopicId);
    
    if (topic && !topic.completed) {
      topic.completed = true;
      saveLibrary();
      
      points += 10; // 10 XP per bite-sized topic
      updatePoints();
      renderRoadmap();
      shootConfetti();
      
      btnMarkLearned.style.display = 'none';
      document.getElementById('lessonBadgeHero').textContent = "Quest Completed 🎉";
      
      // Auto-select next uncompleted topic
      const flat = getAllTopicsFlat(activeGoal.roadmap);
      const nextIndex = flat.findIndex(t => !t.completed);
      if (nextIndex !== -1) {
        // Find module name for the next topic if possible
        let nMod = "";
        if (activeGoal.roadmap[0] && activeGoal.roadmap[0].subtopics) {
          const nm = activeGoal.roadmap.find(m => m.subtopics.some(t => t.id === flat[nextIndex].id));
          if (nm) nMod = nm.module;
        }
        setTimeout(() => loadLesson(flat[nextIndex].id, nMod), 2500);
      }
    }
  });

  // Save to PDF logic
  btnSavePDF.addEventListener('click', () => {
    const activeGoal = getActiveGoal();
    if (!activeGoal || !activeTopicId) return;
    const topic = findTopicInRoadmap(activeGoal.roadmap, activeTopicId);
    if (!topic) return;
    
    const element = document.getElementById('lessonContent');
    const opt = {
      margin:       0.5,
      filename:     `Lesson_${topic.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    btnSavePDF.textContent = 'Generating...';
    html2pdf().set(opt).from(element).save().then(() => {
      btnSavePDF.innerHTML = '📄 Save as PDF';
    });
  });

  // Handle Q&A
  async function submitQuestion() {
    const q = qaInput.value.trim();
    if (!q) return;
    
    qaInput.value = '';
    
    const userMsg = document.createElement('div');
    userMsg.innerHTML = `<div style="background: rgba(var(--primary-rgb, 99,102,241), 0.1); border-left: 4px solid var(--primary); padding: 15px; margin: 20px 0; border-radius: 4px;"><strong>You asked:</strong> ${q}</div>`;
    lessonContent.appendChild(userMsg);
    lessonContent.scrollTop = lessonContent.scrollHeight;
    
    const loadingMsg = document.createElement('div');
    loadingMsg.innerHTML = `<p style="color: var(--muted); font-style: italic;">AI is thinking...</p>`;
    lessonContent.appendChild(loadingMsg);
    lessonContent.scrollTop = lessonContent.scrollHeight;
    
    try {
      const activeGoal = getActiveGoal();
      const topic = findTopicInRoadmap(activeGoal.roadmap, activeTopicId);
      const prompt = `Context: I am learning about "${topic ? topic.title : 'this topic'}" in the context of "${activeGoal.skillName}". 
      I just read the lesson, and my question is: "${q}". 
      Please answer my question directly, concisely, and using markdown formatting.`;
      const system = "You are an expert tutor answering a follow-up question about the lesson you just provided.";
      
      const response = await getAIResponse(prompt, system);
      loadingMsg.remove();
      
      const aiMsg = document.createElement('div');
      aiMsg.innerHTML = `<div style="background: var(--bg); border: 1px solid var(--border); padding: 20px; margin: 20px 0; border-radius: var(--r-md); box-shadow: 0 4px 12px rgba(0,0,0,0.05);"><strong style="color: var(--primary); font-size: 1.1rem; margin-bottom: 10px; display: block;">🤖 AI Tutor:</strong><div class="learning-content" style="padding:0;">${marked.parse(response)}</div></div>`;
      lessonContent.appendChild(aiMsg);
      lessonContent.scrollTop = lessonContent.scrollHeight;
    } catch (e) {
      loadingMsg.innerHTML = `<span style="color: #ef4444;">Error getting answer: ${e.message}</span>`;
    }
  }

  btnAskQA.addEventListener('click', submitQuestion);
  qaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitQuestion();
  });

  // Fallback to marked.parse, we don't need the custom simpleMarkdownParse anymore.
  window.simpleMarkdownParse = marked.parse;

  renderRoadmap();
});
