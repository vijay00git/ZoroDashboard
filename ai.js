// ══════════════════════════════════════════════
//  AI Assistant — Global JS (ai.js)
//  Loads on every page. Shows floating button.
//  Renders chat panel. Proxies calls via server.
// ══════════════════════════════════════════════

(function () {
  'use strict';

  // Top-level variable so all functions share the same reference
  let fab = null;

  const AI_KEY_STORAGE = 'zoro-ai-key';
  const AI_MODEL_STORAGE = 'zoro-ai-model';
  const AI_HISTORY_STORAGE = 'zoro-ai-history';

  // ── Detect current page context ──────────────
  const PAGE_CONTEXTS = {
    'index.html':        { name: 'Dashboard',    emoji: '🏠', hints: ['Summarize my day', 'What tasks need attention?', 'Quick tips for today'] },
    'productivity.html': { name: 'Productivity', emoji: '⚡', hints: ['Prioritize my tasks', 'Suggest a note topic', 'How to improve focus?'] },
    'timesheet.html':    { name: 'Timesheet',    emoji: '📅', hints: ['Analyze my work hours', 'Suggest check-in time', 'Calculate overtime'] },
    'quicklaunch.html':  { name: 'Quick-Launch', emoji: '🚀', hints: ['Suggest link categories', 'Auto-fill link info', 'Best tools for QA?'] },
    'synchub.html':      { name: 'Sync Hub',     emoji: '📊', hints: ['Explain test statuses', 'Suggest test improvements', 'What is a good pass rate?'] },
    'water.html':        { name: 'Hydration',    emoji: '💧', hints: ['Daily water tips', 'Hydration reminders', 'Benefits of water'] },
  };

  const pageName  = window.location.pathname.split('/').pop() || 'index.html';
  const pageCtx   = PAGE_CONTEXTS[pageName] || { name: 'Dashboard', emoji: '🏠', hints: ['What can you help with?'] };

  // ── Helpers ──────────────────────────────────
  function getApiKey()   { return localStorage.getItem(AI_KEY_STORAGE) || ''; }
  function getModel()    { return localStorage.getItem(AI_MODEL_STORAGE) || 'gemini-1.5-flash-8b'; }
  function hasKey()      { return !!getApiKey(); }

  // ── Auto-migrate deprecated models ───────────
  const DEPRECATED_MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro',
                              'gemini-2.5-flash-preview-05-20'];
  (function migrateModel() {
    const stored = localStorage.getItem(AI_MODEL_STORAGE);
    if (stored && DEPRECATED_MODELS.includes(stored)) {
      localStorage.setItem(AI_MODEL_STORAGE, 'gemini-1.5-flash-8b');
      console.info(`[ZORO AI] Migrated deprecated model "${stored}" → gemini-1.5-flash-8b`);
    }
  })();

  function formatModelName(m) {
    const map = {
      'gemini-1.5-flash-8b':  '1.5 Flash 8B ★ Free',
      'gemini-2.0-flash':     '2.0 Flash',
      'gemini-2.0-flash-lite':'2.0 Flash Lite',
      'gemini-1.5-flash':     '1.5 Flash',
      'gemini-1.5-pro':       '1.5 Pro',
    };
    return map[m] || m.replace('gemini-', 'G ');
  }

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(AI_HISTORY_STORAGE) || '[]'); } catch { return []; }
  }
  function saveHistory(h) {
    localStorage.setItem(AI_HISTORY_STORAGE, JSON.stringify(h.slice(-40)));
  }
  function clearHistory() { localStorage.removeItem(AI_HISTORY_STORAGE); }

  // ── Call Gemini via our server proxy ─────────
  async function callAI(prompt, extraContext = '') {
    const key = getApiKey();
    if (!key) throw new Error('No API key set');

    const systemPrompt = `You are ZORO's AI Assistant embedded in a local productivity dashboard called "ZORO's Dashboard". 
The user is currently on the ${pageCtx.name} page (${pageCtx.emoji}).
${extraContext ? 'Page context: ' + extraContext : ''}
Be helpful, concise, and friendly. Use markdown for formatting when helpful. Keep responses short unless detail is requested.`;

    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, model: getModel(), system: systemPrompt, prompt })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || `Server error ${res.status}`);
    }
    const data = await res.json();
    return data.text || 'No response from AI.';
  }

  // ── Get live page context summary ────────────
  function getPageContext() {
    const parts = [];
    if (pageName === 'index.html' || pageName === '') {
      const activeTasks = document.getElementById('qsActiveTasks');
      const waterMl     = document.getElementById('qsWaterMl');
      if (activeTasks) parts.push(`Active tasks: ${activeTasks.textContent}`);
      if (waterMl)     parts.push(`Water today: ${waterMl.textContent}ml`);
    }
    if (pageName === 'productivity.html') {
      const taskEl = document.getElementById('taskList') || document.getElementById('dashboardTaskList');
      if (taskEl) parts.push(`Tasks in view: ${taskEl.querySelectorAll('li').length}`);
    }
    if (pageName === 'quicklaunch.html') {
      const folders = document.querySelectorAll('.ql-folder:not(.smart-folder)');
      parts.push(`Folders: ${folders.length}`);
    }
    return parts.join('. ');
  }

  // ── Simple markdown → HTML ────────────────────
  function mdToHtml(text) {
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>').replace(/$/, '</p>');
  }

  // ── Build DOM ─────────────────────────────────
  function buildUI() {
    // FAB
    fab = document.createElement('button');
    fab.id = 'ai-fab';
    fab.title = hasKey() ? 'AI Assistant (Active)' : 'AI Assistant (Add API Key)';
    fab.className = hasKey() ? 'has-key' : 'no-key';
    fab.innerHTML = `<span id="ai-fab-icon">${hasKey() ? '🤖' : '🔑'}</span><div class="ai-fab-pulse"></div>`;
    document.body.appendChild(fab);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'ai-panel';
    panel.className = 'hidden';
    panel.innerHTML = `
      <div class="ai-panel-header">
        <div class="ai-panel-title">
          <div class="ai-avatar-ring">🤖</div>
          <div>
            <div style="display:flex;align-items:center;gap:6px;">
              ZORO's AI
              <span class="ai-status-dot ${hasKey() ? '' : 'offline'}" id="ai-status-dot"></span>
            </div>
          </div>
          <span class="ai-model-badge" id="ai-model-badge">${formatModelName(getModel())}</span>
        </div>
        <div class="ai-panel-controls">
          <button class="ai-panel-btn" id="ai-btn-settings" title="Settings">⚙️</button>
          <button class="ai-panel-btn" id="ai-btn-clear" title="Clear chat">🗑️</button>
          <button class="ai-panel-btn" id="ai-btn-close" title="Close">✕</button>
        </div>
      </div>

      <div class="ai-context-badge">
        📍 <span>${pageCtx.emoji} ${pageCtx.name}</span>
      </div>

      <div id="ai-main-view">
        ${!hasKey() ? buildSetupHTML() : ''}
        <div class="ai-messages" id="ai-messages" ${!hasKey() ? 'style="display:none"' : ''}>
          ${hasKey() ? buildWelcomeHTML() : ''}
        </div>
        <div class="ai-quick-actions" id="ai-chips" ${!hasKey() ? 'style="display:none"' : ''}>
          ${pageCtx.hints.map(h => `<button class="ai-chip">${h}</button>`).join('')}
        </div>
        <div class="ai-input-row" ${!hasKey() ? 'style="display:none"' : ''}>
          <textarea class="ai-chat-input" id="ai-chat-input" placeholder="Ask anything…" rows="1"></textarea>
          <button class="ai-send-btn" id="ai-send-btn" title="Send">➤</button>
        </div>
      </div>

      <div id="ai-settings-view" style="display:none; flex-direction:column; flex:1; min-height:0;">
        <div class="ai-settings-tab">
          <div class="ai-settings-section-label">Connection</div>
          <div class="ai-settings-group">
            <label>Gemini API Key</label>
            <input type="password" id="ai-settings-key" value="${getApiKey()}" placeholder="AIzaSy...">
          </div>
          <div class="ai-settings-group">
            <label>Model</label>
            <select id="ai-settings-model">
              <option value="gemini-1.5-flash-8b" ${getModel() === 'gemini-1.5-flash-8b' ? 'selected' : ''}>★ Gemini 1.5 Flash 8B — Best Free Tier</option>
              <option value="gemini-2.0-flash" ${getModel() === 'gemini-2.0-flash' ? 'selected' : ''}>🚀 Gemini 2.0 Flash</option>
              <option value="gemini-2.0-flash-lite" ${getModel() === 'gemini-2.0-flash-lite' ? 'selected' : ''}>⚡ Gemini 2.0 Flash Lite</option>
            </select>
          </div>
          <button class="ai-save-key-btn" id="ai-settings-save" style="width:100%; margin-top:4px;">💾 Save Settings</button>
          <div class="ai-settings-divider"></div>
          <div class="ai-settings-section-label">Danger Zone</div>
          <button class="ai-danger-btn" id="ai-clear-key-btn">🗑️ Remove API Key &amp; Disconnect</button>
          <div class="ai-security-note">
            <span>🔒</span>
            Your API key is stored locally in your browser only. All requests go through your local server — never exposed externally.
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    wireEvents(panel);
    restoreHistory();
  }

  function buildSetupHTML() {
    return `
      <div class="ai-setup-panel" id="ai-setup-panel">
        <div class="ai-setup-orb">✨</div>
        <h4>Meet ZORO's AI</h4>
        <p>Connect your Gemini API key to unlock smart AI assistance on every page of your dashboard.</p>
        <div class="ai-key-input-wrap">
          <input type="password" class="ai-key-input" id="ai-quick-key-input" placeholder="Paste Gemini API key…">
          <button class="ai-save-key-btn" id="ai-quick-save-btn">Connect</button>
        </div>
        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" class="ai-studio-link">
          🔗 Get a free key from Google AI Studio
        </a>
      </div>
    `;
  }

  function buildWelcomeHTML() {
    return `
      <div class="ai-welcome" id="ai-welcome">
        <div class="ai-welcome-icon">✨</div>
        <strong>How can I help you?</strong>
        <span>I'm context-aware — I know you're on the <b>${pageCtx.emoji} ${pageCtx.name}</b> page. Try one of the suggestions below or ask me anything!</span>
      </div>
    `;
  }

  // ── Fetch real available models from API ──────
  async function loadAvailableModels(panel) {
    const sel = panel.querySelector('#ai-settings-model');
    if (!sel) return;
    const current = getModel();
    sel.innerHTML = `<option disabled>Loading models…</option>`;
    try {
      const res  = await fetch(`/api/ai/models?key=${encodeURIComponent(getApiKey())}`);
      const data = await res.json();
      if (!res.ok || !data.models?.length) {
        sel.innerHTML = `<option value="${current}">${current} (offline)</option>`;
        return;
      }
      sel.innerHTML = data.models
        .map(m => `<option value="${m.id}" ${m.id === current ? 'selected' : ''}>${m.displayName} (${m.id})</option>`)
        .join('');
    } catch {
      sel.innerHTML = `<option value="${current}">${current} (could not fetch list)</option>`;
    }
  }

  function wireEvents(panel) {
    // FAB toggle
    fab.addEventListener('click', () => {
      panel.classList.toggle('hidden');
    });

    // Close
    panel.querySelector('#ai-btn-close').addEventListener('click', () => {
      panel.classList.add('hidden');
    });

    // Clear chat + show welcome
    panel.querySelector('#ai-btn-clear').addEventListener('click', () => {
      clearHistory();
      const msgs = panel.querySelector('#ai-messages');
      if (msgs) msgs.innerHTML = buildWelcomeHTML();
    });

    // Settings toggle — fetch live models on open
    let settingsOpen = false;
    panel.querySelector('#ai-btn-settings').addEventListener('click', () => {
      settingsOpen = !settingsOpen;
      panel.querySelector('#ai-main-view').style.display = settingsOpen ? 'none' : '';
      panel.querySelector('#ai-settings-view').style.display = settingsOpen ? 'flex' : 'none';
      if (settingsOpen && hasKey()) loadAvailableModels(panel);
    });

    // Settings save
    panel.querySelector('#ai-settings-save').addEventListener('click', () => {
      const key   = panel.querySelector('#ai-settings-key').value.trim();
      const model = panel.querySelector('#ai-settings-model').value;
      if (key) localStorage.setItem(AI_KEY_STORAGE, key);
      localStorage.setItem(AI_MODEL_STORAGE, model);
      panel.querySelector('#ai-model-badge').textContent = model;
      updateKeyStatus(panel);
      settingsOpen = false;
      panel.querySelector('#ai-main-view').style.display = '';
      panel.querySelector('#ai-settings-view').style.display = 'none';
      if (key) enableChatUI(panel);
    });

    // Remove key
    panel.querySelector('#ai-clear-key-btn').addEventListener('click', () => {
      localStorage.removeItem(AI_KEY_STORAGE);
      updateKeyStatus(panel);
    });

    // Quick key save (setup panel)
    const quickSave = panel.querySelector('#ai-quick-save-btn');
    if (quickSave) {
      quickSave.addEventListener('click', () => {
        const k = panel.querySelector('#ai-quick-key-input').value.trim();
        if (!k) return;
        localStorage.setItem(AI_KEY_STORAGE, k);
        updateKeyStatus(panel);
        enableChatUI(panel);
      });
    }

    // Suggestion chips
    panel.querySelector('#ai-chips').addEventListener('click', (e) => {
      if (e.target.classList.contains('ai-chip')) {
        panel.querySelector('#ai-chat-input').value = e.target.textContent;
        sendMessage(panel);
      }
    });

    // Send button
    panel.querySelector('#ai-send-btn').addEventListener('click', () => sendMessage(panel));

    // Enter key
    panel.querySelector('#ai-chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(panel);
      }
    });

    // Auto-resize textarea
    panel.querySelector('#ai-chat-input').addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 80) + 'px';
    });
  }

  function enableChatUI(panel) {
    const setup = panel.querySelector('#ai-setup-panel');
    if (setup) setup.remove();
    const msgs = panel.querySelector('#ai-messages');
    msgs.style.display = '';
    if (!msgs.innerHTML.trim()) msgs.innerHTML = buildWelcomeHTML();
    panel.querySelector('#ai-chips').style.display = '';
    panel.querySelector('.ai-input-row').style.display = '';
    fab.className = 'has-key';
    fab.title = 'AI Assistant (Active)';
    fab.querySelector('#ai-fab-icon').textContent = '🤖';
    const dot = panel.querySelector('#ai-status-dot');
    if (dot) dot.classList.remove('offline');
  }

  function updateKeyStatus(panel) {
    const dot = panel.querySelector('#ai-status-dot');
    const active = hasKey();
    if (dot) {
      dot.classList.toggle('offline', !active);
    }
    // update model badge text
    const badge = panel.querySelector('#ai-model-badge');
    if (badge) badge.textContent = formatModelName(getModel());
    const fabEl = document.getElementById('ai-fab');
    if (fabEl) {
      fabEl.className = active ? 'has-key' : 'no-key';
      fabEl.querySelector('#ai-fab-icon').textContent = active ? '🤖' : '🔑';
    }
  }

  function appendMsg(panel, role, text) {
    // Remove welcome placeholder on first real message
    const welcome = panel.querySelector('#ai-welcome');
    if (welcome) welcome.remove();

    const msgs  = panel.querySelector('#ai-messages');
    const isAI  = role === 'assistant';
    const now   = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const div   = document.createElement('div');
    div.className = `ai-msg ${role}`;
    div.innerHTML = `
      <div class="ai-msg-avatar">${isAI ? '🤖' : '👤'}</div>
      <div class="ai-msg-content">
        <div class="ai-msg-bubble">${isAI ? mdToHtml(text) : text.replace(/</g,'&lt;')}</div>
        <div class="ai-msg-time">${now}</div>
      </div>
    `;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function showTyping(panel) {
    const msgs = panel.querySelector('#ai-messages');
    const div  = document.createElement('div');
    div.className = 'ai-typing-wrap';
    div.id = 'ai-typing-indicator';
    div.innerHTML = `
      <div class="ai-msg-avatar" style="background:linear-gradient(135deg,rgba(99,102,241,0.2),rgba(168,85,247,0.15));border:1px solid rgba(168,85,247,0.2);width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;margin-top:2px;">🤖</div>
      <div class="ai-typing-bubble">
        <div class="ai-typing-dot"></div>
        <div class="ai-typing-dot"></div>
        <div class="ai-typing-dot"></div>
      </div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function hideTyping(panel) {
    const t = panel.querySelector('#ai-typing-indicator');
    if (t) t.remove();
  }

  async function sendMessage(panel) {
    if (!hasKey()) return;
    const input   = panel.querySelector('#ai-chat-input');
    const sendBtn = panel.querySelector('#ai-send-btn');
    const text    = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;

    appendMsg(panel, 'user', text);

    const history = getHistory();
    history.push({ role: 'user', text });
    saveHistory(history);

    showTyping(panel);

    try {
      const ctx    = getPageContext();
      const historyContext = history.slice(-6).map(h => `${h.role}: ${h.text}`).join('\n');
      const fullPrompt = historyContext ? `Previous conversation:\n${historyContext}\n\nCurrent question: ${text}` : text;
      const reply  = await callAI(fullPrompt, ctx);
      hideTyping(panel);
      appendMsg(panel, 'assistant', reply);
      history.push({ role: 'assistant', text: reply });
      saveHistory(history);
    } catch (err) {
      hideTyping(panel);
      const retryMatch = err.message.match(/retry in ([0-9.]+)s/i);
      if (retryMatch) {
        const secs = Math.ceil(parseFloat(retryMatch[1]));
        let remaining = secs;
        const msgDiv = appendMsg(panel, 'assistant',
          `⏳ **Rate limited** — free tier quota hit. Retrying in **${remaining}s**…`);
        const bubble = msgDiv.querySelector('.ai-msg-bubble');
        const timer = setInterval(() => {
          remaining--;
          if (remaining <= 0) {
            clearInterval(timer);
            bubble.innerHTML = mdToHtml('🔄 **Retrying now…**');
            // re-run with original text
            (async () => {
              showTyping(panel);
              try {
                const ctx2 = getPageContext();
                const reply2 = await callAI(text, ctx2);
                hideTyping(panel);
                appendMsg(panel, 'assistant', reply2);
              } catch (e2) {
                hideTyping(panel);
                appendMsg(panel, 'assistant', `❌ **Error:** ${e2.message}`);
              }
            })();
          } else {
            bubble.innerHTML = mdToHtml(
              `⏳ **Rate limited** — free tier quota hit. Retrying in **${remaining}s**…`);
          }
        }, 1000);
      } else {
        appendMsg(panel, 'assistant', `❌ **Error:** ${err.message}`);
      }
    }

    sendBtn.disabled = false;
    input.focus();
  }

  function restoreHistory() {
    if (!hasKey()) return;
    const panel   = document.getElementById('ai-panel');
    const history = getHistory().slice(-10);
    history.forEach(h => appendMsg(panel, h.role, h.text));
  }

  // ── Expose global helper for inline AI buttons ──
  window.ZoroAI = {
    call: callAI,
    hasKey,
    getPageContext,
    appendToChat: (role, text) => {
      const panel = document.getElementById('ai-panel');
      if (panel) appendMsg(panel, role, text);
    },
    openPanel: () => {
      const panel = document.getElementById('ai-panel');
      if (panel) panel.classList.remove('hidden');
    }
  };

  // ── Init after DOM ready ──────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }

})();
