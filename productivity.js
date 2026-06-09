// ══════════════════════════════════════════════
//  Productivity Hub — JS
// ══════════════════════════════════════════════

// Toast notification helper
function log(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return console.log(`[${type}] ${msg}`);
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 3000);
}

// ── Theme Toggle ──
(function() {
  const saved = localStorage.getItem('tr-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('tr-theme', theme);
  const btn = document.getElementById('btnThemeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

// ── Mini Clock ──
function startMiniClock() {
  const timeEl = document.getElementById('phClockTime');
  const dateEl = document.getElementById('phClockDate');
  if (!timeEl) return;
  function tick() {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString([], { hour12: true });
    dateEl.textContent = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }
  tick();
  setInterval(tick, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
  // Theme
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const btn = document.getElementById('btnThemeToggle');
  if (btn) {
    btn.textContent = current === 'dark' ? '🌙' : '☀️';
    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }
  window.addEventListener('storage', (e) => {
    if (e.key === 'tr-theme') applyTheme(e.newValue);
  });

  startMiniClock();

  // ══════════ NOTES ══════════
  const runNotesInput = document.getElementById('runNotesInput');
  const notePreviewArea = document.getElementById('notePreviewArea');
  const notesSidebarList = document.getElementById('notesSidebarList');
  const activeNoteTitle = document.getElementById('activeNoteTitle');
  const noteCount = document.getElementById('noteCount');
  const noteCharCount = document.getElementById('noteCharCount');
  const noteLineCount = document.getElementById('noteLineCount');
  const noteSaveStatus = document.getElementById('noteSaveStatus');
  const btnNewNote = document.getElementById('btnNewNote');
  const btnRenameNote = document.getElementById('btnRenameNote');
  const btnExportNote = document.getElementById('btnExportNote');
  const btnDeleteNote = document.getElementById('btnDeleteNote');
  const editorTabs = document.querySelectorAll('.ph-editor-tab');
  const phFormatToolbar = document.getElementById('phFormatToolbar');

  // ══════════ TASKS ══════════
  const taskForm = document.getElementById('taskForm');
  const newTaskInput = document.getElementById('newTaskInput');
  const newTaskDeadline = document.getElementById('newTaskDeadline');
  const todoList = document.getElementById('todoList');
  const btnClearTasks = document.getElementById('btnClearTasks');
  const taskStats = document.getElementById('taskStats');
  const taskProgressFill = document.getElementById('taskProgressFill');

  let tasks = [];
  let notes = [];
  let activeNoteId = null;
  let isPreviewMode = true; // Default to showing preview mode
  let sortMode = localStorage.getItem('tr-tasks-sort-mode') || 'auto';

  // Fallback markdown rendering
  function renderMarkdown(text) {
    if (window.marked && typeof window.marked.parse === 'function') {
      return window.marked.parse(text);
    }
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/`(.*?)`/gim, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  // ── Notes Logic ──
  if (runNotesInput && notesSidebarList) {
    try {
      const savedNotes = localStorage.getItem('tr-run-notes-list');
      if (savedNotes) {
        notes = JSON.parse(savedNotes);
      } else {
        const oldNote = localStorage.getItem('tr-run-notes') || '';
        notes = [{ id: 'default', name: 'Session Note', content: oldNote, created: Date.now() }];
      }
    } catch(e) {
      notes = [{ id: 'default', name: 'Session Note', content: '', created: Date.now() }];
    }
    if (notes.length === 0) notes.push({ id: 'default', name: 'Session Note', content: '', created: Date.now() });

    activeNoteId = localStorage.getItem('tr-active-note-id');
    if (!notes.find(n => n.id === activeNoteId)) activeNoteId = notes[0].id;

    function saveNotes() {
      localStorage.setItem('tr-run-notes-list', JSON.stringify(notes));
      localStorage.setItem('tr-active-note-id', activeNoteId);
      
      // Sync active note to server backend
      if (activeNoteId) {
        const activeNote = notes.find(n => n.id === activeNoteId);
        if (activeNote) {
          fetch('http://localhost:3000/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(activeNote)
          }).catch(e => console.error('Backend sync error:', e));
        }
      }
    }

    function updateEditorStatus() {
      const content = runNotesInput.value;
      if (noteCharCount) noteCharCount.textContent = `${content.length} chars`;
      if (noteLineCount) noteLineCount.textContent = `${(content.match(/\n/g) || []).length + 1} lines`;
    }

    function renderNotesSidebar() {
      notesSidebarList.innerHTML = '';
      if (noteCount) noteCount.textContent = notes.length;

      notes.forEach(n => {
        const item = document.createElement('div');
        item.className = 'ph-note-item' + (n.id === activeNoteId ? ' active' : '');

        const icon = document.createElement('span');
        icon.className = 'ph-note-item-icon';
        icon.textContent = n.id === activeNoteId ? '📝' : '📄';

        const name = document.createElement('span');
        name.className = 'ph-note-item-name';
        name.textContent = n.name;

        const date = document.createElement('span');
        date.className = 'ph-note-item-date';
        if (n.created) {
          const d = new Date(n.created);
          date.textContent = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }

        item.appendChild(icon);
        item.appendChild(name);
        item.appendChild(date);

        item.addEventListener('click', () => {
          activeNoteId = n.id;
          isPreviewMode = true; // Clicking a note shows Preview mode by default
          saveNotes();
          renderNotesSidebar();
        });

        notesSidebarList.appendChild(item);
      });

      const activeNote = notes.find(n => n.id === activeNoteId);
      if (activeNoteTitle && activeNote) activeNoteTitle.textContent = activeNote.name;
      
      const contentVal = activeNote ? activeNote.content : '';
      runNotesInput.value = contentVal;
      runNotesInput.disabled = notes.length === 0;

      if (isPreviewMode) {
        runNotesInput.style.display = 'none';
        if (phFormatToolbar) phFormatToolbar.style.display = 'none';
        notePreviewArea.style.display = 'block';
        notePreviewArea.innerHTML = renderMarkdown(contentVal || '*No content yet.*');
        editorTabs.forEach(t => t.classList.toggle('active', t.dataset.view === 'preview'));
      } else {
        runNotesInput.style.display = 'block';
        if (phFormatToolbar) phFormatToolbar.style.display = 'flex';
        notePreviewArea.style.display = 'none';
        editorTabs.forEach(t => t.classList.toggle('active', t.dataset.view === 'edit'));
      }

      updateEditorStatus();
    }

    renderNotesSidebar();

    // Toggle Tabs listener
    editorTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        if (notes.length === 0) return;
        isPreviewMode = tab.dataset.view === 'preview';
        renderNotesSidebar();
      });
    });

    // Format buttons listener
    document.querySelectorAll('.ph-format-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (isPreviewMode || runNotesInput.disabled) return;
        const format = btn.dataset.format;
        const start = runNotesInput.selectionStart;
        const end = runNotesInput.selectionEnd;
        const selected = runNotesInput.value.substring(start, end);
        let replacement = '';
        let cursorOffset = 0;
        let selectLen = 0;

        switch(format) {
          case 'heading':
            replacement = `\n### ${selected || 'Heading'}`;
            cursorOffset = 5;
            selectLen = selected ? selected.length : 7;
            break;
          case 'bold':
            replacement = `**${selected || 'bold text'}**`;
            cursorOffset = 2;
            selectLen = selected ? selected.length : 9;
            break;
          case 'italic':
            replacement = `_${selected || 'italic text'}_`;
            cursorOffset = 1;
            selectLen = selected ? selected.length : 11;
            break;
          case 'strikethrough':
            replacement = `~~${selected || 'strikethrough'}~~`;
            cursorOffset = 2;
            selectLen = selected ? selected.length : 13;
            break;
          case 'blockquote':
            replacement = `\n> ${selected || 'quote'}`;
            cursorOffset = 3;
            selectLen = selected ? selected.length : 5;
            break;
          case 'code':
            replacement = `\`${selected || 'code'}\``;
            cursorOffset = 1;
            selectLen = selected ? selected.length : 4;
            break;
          case 'codeblock':
            replacement = `\n\`\`\`\n${selected || 'code'}\n\`\`\`\n`;
            cursorOffset = 5;
            selectLen = selected ? selected.length : 4;
            break;
          case 'link':
            replacement = `[${selected || 'link text'}](url)`;
            cursorOffset = 1;
            selectLen = selected ? selected.length : 9;
            break;
          case 'list-ul':
            replacement = `\n- ${selected || 'List item'}`;
            cursorOffset = 3;
            selectLen = selected ? selected.length : 9;
            break;
          case 'list-ol':
            replacement = `\n1. ${selected || 'List item'}`;
            cursorOffset = 4;
            selectLen = selected ? selected.length : 9;
            break;
          case 'task-list':
            replacement = `\n- [ ] ${selected || 'Task'}`;
            cursorOffset = 7;
            selectLen = selected ? selected.length : 4;
            break;
          case 'hr':
            replacement = `\n---\n`;
            cursorOffset = 5;
            selectLen = 0;
            break;
        }

        runNotesInput.setRangeText(replacement, start, end, 'end');
        runNotesInput.focus();
        if (!selected) {
          runNotesInput.setSelectionRange(start + cursorOffset, start + cursorOffset + selectLen);
        }
        
        runNotesInput.dispatchEvent(new Event('input'));
      });
    });

    let saveTimeout;
    runNotesInput.addEventListener('input', () => {
      if (!activeNoteId) return;
      const activeNote = notes.find(n => n.id === activeNoteId);
      if (activeNote) {
        activeNote.content = runNotesInput.value;
        if (noteSaveStatus) noteSaveStatus.textContent = 'Saving…';
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          saveNotes();
          if (noteSaveStatus) noteSaveStatus.textContent = 'Saved ✓';
        }, 600);
        updateEditorStatus();
      }
    });

    btnNewNote.addEventListener('click', () => {
      const name = prompt('Enter a name for the new note:');
      if (name && name.trim()) {
        const newId = 'note_' + Date.now();
        notes.push({ id: newId, name: name.trim(), content: '', created: Date.now() });
        activeNoteId = newId;
        isPreviewMode = false; // Open new note in Edit mode directly so they can write
        saveNotes();
        renderNotesSidebar();
        runNotesInput.focus();
        log('Note created.', 'success');
      }
    });

    btnRenameNote.addEventListener('click', () => {
      if (!activeNoteId) return;
      const activeNote = notes.find(n => n.id === activeNoteId);
      const newName = prompt('Rename note:', activeNote.name);
      if (newName && newName.trim()) {
        const oldName = activeNote.name;
        activeNote.name = newName.trim();
        activeNote.oldName = oldName; // Pass to backend to delete old file
        saveNotes();
        delete activeNote.oldName; // Cleanup
        renderNotesSidebar();
        log('Note renamed.', 'success');
      }
    });

    btnDeleteNote.addEventListener('click', () => {
      if (notes.length <= 1) { log('Cannot delete your last note.', 'warning'); return; }
      const activeNote = notes.find(n => n.id === activeNoteId);
      if (confirm(`Delete "${activeNote.name}"? This cannot be undone.`)) {
        const noteName = activeNote.name;
        notes = notes.filter(n => n.id !== activeNoteId);
        activeNoteId = notes[0].id;
        saveNotes();
        
        // Delete from backend
        fetch('http://localhost:3000/api/notes', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: noteName })
        }).catch(e => console.error(e));

        renderNotesSidebar();
        log('Note deleted.', 'info');
      }
    });

    btnExportNote.addEventListener('click', () => {
      if (!activeNoteId) return;
      const activeNote = notes.find(n => n.id === activeNoteId);
      if (!activeNote.content.trim()) { log('Note is empty.', 'warning'); return; }
      const blob = new Blob([activeNote.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeNote.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      log('Note exported.', 'success');
    });
  }

  // ── Tasks Logic ──
  let currentFilter = 'all';
  let currentPriority = 'none';

  // Quick deadline buttons
  document.querySelectorAll('.ph-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const now = new Date();
      if (btn.dataset.hours) {
        now.setHours(now.getHours() + parseInt(btn.dataset.hours));
      } else if (btn.dataset.preset === 'today') {
        now.setHours(23, 59, 0, 0);
      } else if (btn.dataset.preset === 'tomorrow') {
        now.setDate(now.getDate() + 1);
        now.setHours(17, 0, 0, 0);
      }
      if (newTaskDeadline && newTaskDeadline._flatpickr) {
        newTaskDeadline._flatpickr.setDate(now);
      } else if (newTaskDeadline) {
        const pad = n => String(n).padStart(2, '0');
        newTaskDeadline.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
      }
    });
  });

  // Priority picker
  document.querySelectorAll('.ph-priority-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ph-priority-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPriority = btn.dataset.priority;
    });
  });

  // Initialize Flatpickr for modern UI and 12-hour format
  if (window.flatpickr && newTaskDeadline) {
    flatpickr(newTaskDeadline, {
      enableTime: true,
      dateFormat: "Y-m-d h:i K", // 12-hour format
      time_24hr: false
    });
  }

  // Filter tabs
  document.querySelectorAll('.ph-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ph-filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderTasks();
    });
  });

  // Sort Selector buttons
  const sortSelectorBtns = document.querySelectorAll('.ph-sort-btn');
  sortSelectorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sortSelectorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sortMode = btn.dataset.sort;
      localStorage.setItem('tr-tasks-sort-mode', sortMode);
      renderTasks();
    });
  });

  // Sync UI with current sortMode
  const activeSortBtn = document.querySelector(`.ph-sort-btn[data-sort="${sortMode}"]`);
  if (activeSortBtn) {
    sortSelectorBtns.forEach(b => b.classList.remove('active'));
    activeSortBtn.classList.add('active');
  }

  function updateTaskProgress() {
    if (!taskStats || !taskProgressFill) return;
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    taskStats.textContent = total > 0 ? `${done}/${total} done` : '';
    const pct = total > 0 ? (done / total) * 100 : 0;
    taskProgressFill.style.width = pct + '%';
  }

  function renderTasks() {
    if (!todoList) return;
    todoList.innerHTML = '';

    let filtered = [...tasks];
    if (currentFilter === 'active') filtered = filtered.filter(t => !t.completed);
    if (currentFilter === 'done') filtered = filtered.filter(t => t.completed);

    if (filtered.length === 0) {
      const emptyMsg = currentFilter === 'done' ? 'No completed tasks yet' 
                       : currentFilter === 'active' ? 'All tasks are done! 🎉'
                       : 'No tasks yet';
      todoList.innerHTML = `
        <li class="ph-empty-state">
          <span class="ph-empty-state-icon">${currentFilter === 'active' ? '🎉' : '🎯'}</span>
          <span class="ph-empty-state-text">${emptyMsg}</span>
          <span class="ph-empty-state-hint">Add a task above to get started</span>
        </li>`;
      updateTaskProgress();
      return;
    }

    let sorted = [...filtered];
    if (sortMode === 'auto') {
      sorted.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        // Priority order: high > medium > low > none
        const pOrder = { high: 0, medium: 1, low: 2, none: 3 };
        const pa = pOrder[a.priority || 'none'] ?? 3;
        const pb = pOrder[b.priority || 'none'] ?? 3;
        if (pa !== pb) return pa - pb;
        if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
        if (a.deadline) return -1;
        if (b.deadline) return 1;
        return 0;
      });
    } else {
      // Manual sorting respects the main tasks array order
      sorted.sort((a, b) => {
        return tasks.findIndex(t => t.id === a.id) - tasks.findIndex(t => t.id === b.id);
      });
    }

    sorted.forEach((task) => {
      const idx = tasks.findIndex(t => t.id === task.id);

      const li = document.createElement('li');
      let cls = 'ph-task-item';
      if (task.completed) cls += ' ph-task-item--done';
      if (task.priority && task.priority !== 'none') cls += ` ph-task-item--priority-${task.priority}`;
      if (!task.completed && task.deadline) {
        const diff = new Date(task.deadline) - new Date();
        if (diff < 0) cls += ' ph-task-item--overdue';
        else if (diff < 3600000) cls += ' ph-task-item--urgent';
      }
      li.className = cls;
      li.draggable = true;

      // Drag & Drop event listeners
      li.addEventListener('dragstart', (e) => {
        li.classList.add('dragging');
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
      });

      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        document.querySelectorAll('.ph-task-item').forEach(item => item.classList.remove('drag-over'));
      });

      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const draggingEl = document.querySelector('.ph-task-item.dragging');
        if (draggingEl && draggingEl !== li) {
          li.classList.add('drag-over');
        }
      });

      li.addEventListener('dragleave', () => {
        li.classList.remove('drag-over');
      });

      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        const targetId = task.id;
        if (draggedId && draggedId !== targetId) {
          const fromIndex = tasks.findIndex(t => t.id === draggedId);
          const toIndex = tasks.findIndex(t => t.id === targetId);
          if (fromIndex !== -1 && toIndex !== -1) {
            const [moved] = tasks.splice(fromIndex, 1);
            tasks.splice(toIndex, 0, moved);
            // Switch sort mode to manual automatically
            sortMode = 'manual';
            localStorage.setItem('tr-tasks-sort-mode', sortMode);
            const manualBtn = document.querySelector('.ph-sort-btn[data-sort="manual"]');
            if (manualBtn) {
              document.querySelectorAll('.ph-sort-btn').forEach(b => b.classList.remove('active'));
              manualBtn.classList.add('active');
            }
            saveTasks();
            renderTasks();
          }
        }
      });

      // Main Row
      const main = document.createElement('div');
      main.className = 'ph-task-main';

      // Grip Icon
      const grip = document.createElement('div');
      grip.className = 'ph-task-grip';
      grip.title = 'Drag to reorder';
      grip.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="5" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="9" cy="19" r="1.2"/><circle cx="15" cy="5" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="15" cy="19" r="1.2"/></svg>`;
      main.appendChild(grip);

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.className = 'ph-task-checkbox';
      chk.checked = task.completed;
      chk.addEventListener('change', () => { tasks[idx].completed = chk.checked; saveTasks(); renderTasks(); });

      const text = document.createElement('span');
      text.className = 'ph-task-text' + (task.completed ? ' ph-task-text--done' : '');
      text.textContent = task.text;

      main.appendChild(chk);
      main.appendChild(text);

      // Deadline badge
      if (task.deadline && !task.completed) {
        const badge = document.createElement('span');
        const due = new Date(task.deadline);
        const diff = Math.floor((due - new Date()) / 60000);
        if (diff < 0) {
          badge.className = 'ph-deadline-badge ph-deadline-badge--overdue';
          const abs = Math.abs(diff);
          badge.textContent = abs < 60 ? `${abs}m overdue` : `${Math.floor(abs/60)}h overdue`;
        } else if (diff < 60) {
          badge.className = 'ph-deadline-badge ph-deadline-badge--urgent';
          badge.textContent = `${diff}m left`;
        } else if (diff < 1440) {
          badge.className = 'ph-deadline-badge ph-deadline-badge--normal';
          badge.textContent = due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        } else {
          badge.className = 'ph-deadline-badge ph-deadline-badge--normal';
          badge.textContent = due.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
        main.appendChild(badge);
      }

      // Actions (hover reveal)
      const actions = document.createElement('div');
      actions.className = 'ph-task-actions';

      const btnSub = document.createElement('button');
      btnSub.className = 'ph-task-action-btn';
      btnSub.textContent = '+ sub';
      btnSub.title = 'Add Subtask';
      btnSub.addEventListener('click', () => {
        // Toggle inline subtask input visibility
        const existing = li.querySelector('.ph-subtask-add-row');
        if (existing) { existing.remove(); return; }
        const addRow = document.createElement('div');
        addRow.className = 'ph-subtask-add-row';
        const addInput = document.createElement('input');
        addInput.className = 'ph-subtask-add-input';
        addInput.placeholder = 'Add subtask… (Enter to save)';
        addInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const v = addInput.value.trim();
            if (v) {
              if (!tasks[idx].subtasks) tasks[idx].subtasks = [];
              tasks[idx].subtasks.push({ text: v, completed: false });
              addInput.value = '';
              saveTasks();
              renderTasks();
            }
          }
          if (e.key === 'Escape') addRow.remove();
        });
        addRow.appendChild(addInput);
        li.appendChild(addRow);
        addInput.focus();
      });

      const btnDel = document.createElement('button');
      btnDel.className = 'ph-task-action-btn ph-task-action-btn--del';
      btnDel.textContent = '✕';
      btnDel.title = 'Delete';
      btnDel.addEventListener('click', () => { tasks.splice(idx, 1); saveTasks(); renderTasks(); });

      actions.appendChild(btnSub);
      actions.appendChild(btnDel);
      main.appendChild(actions);
      li.appendChild(main);

      // Subtasks
      if (task.subtasks && task.subtasks.length > 0) {
        const subSection = document.createElement('div');
        subSection.className = 'ph-subtask-section';
        
        const subList = document.createElement('div');
        subList.className = 'ph-subtask-list';

        task.subtasks.forEach((sub, sIdx) => {
          const row = document.createElement('div');
          row.className = 'ph-subtask-row';

          const sChk = document.createElement('input');
          sChk.type = 'checkbox';
          sChk.checked = sub.completed;
          sChk.addEventListener('change', () => { tasks[idx].subtasks[sIdx].completed = sChk.checked; saveTasks(); renderTasks(); });

          const sText = document.createElement('span');
          sText.className = 'ph-subtask-text' + (sub.completed ? ' ph-subtask-text--done' : '');
          sText.textContent = sub.text;

          const sDel = document.createElement('button');
          sDel.className = 'ph-subtask-del';
          sDel.textContent = '✕';
          sDel.addEventListener('click', () => { tasks[idx].subtasks.splice(sIdx, 1); saveTasks(); renderTasks(); });

          row.appendChild(sChk);
          row.appendChild(sText);
          row.appendChild(sDel);
          subList.appendChild(row);
        });
        subSection.appendChild(subList);
        li.appendChild(subSection);
      }

      todoList.appendChild(li);
    });
    updateTaskProgress();
  }

  function saveTasks() {
    localStorage.setItem('tr-run-tasks', JSON.stringify(tasks));
  }

  if (taskForm) {
    try {
      const saved = localStorage.getItem('tr-run-tasks');
      if (saved) tasks = JSON.parse(saved);
      tasks = tasks.map(t => ({
        id: t.id || Date.now().toString() + Math.random(),
        text: t.text,
        completed: t.completed || false,
        deadline: t.deadline || null,
        priority: t.priority || 'none',
        subtasks: t.subtasks || []
      }));
    } catch (e) { console.warn('Failed to parse saved tasks', e); }
    renderTasks();

    taskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = newTaskInput.value.trim();
      if (text) {
        tasks.push({
          id: Date.now().toString(),
          text,
          completed: false,
          deadline: newTaskDeadline ? newTaskDeadline.value || null : null,
          priority: currentPriority,
          subtasks: []
        });
        newTaskInput.value = '';
        if (newTaskDeadline) newTaskDeadline.value = '';
        // Reset priority picker
        currentPriority = 'none';
        document.querySelectorAll('.ph-priority-btn').forEach(b => b.classList.remove('active'));
        const noneBtn = document.querySelector('.ph-priority--none');
        if (noneBtn) noneBtn.classList.add('active');
        saveTasks();
        renderTasks();
      }
    });
  }

  if (btnClearTasks) {
    btnClearTasks.addEventListener('click', () => {
      if (tasks.length === 0) return;
      if (confirm('Clear ALL tasks? This cannot be undone.')) {
        tasks = [];
        saveTasks();
        renderTasks();
        log('All tasks cleared.', 'info');
      }
    });
  }

  // Auto-refresh deadlines every minute
  setInterval(() => { if (tasks.length > 0) renderTasks(); }, 60000);
});
