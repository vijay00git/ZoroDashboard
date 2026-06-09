// ══════════════════════════════════════════════
//  Quick-Launch — JS
// ══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // ── Theme Toggle ──
  const savedTheme = localStorage.getItem('tr-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const btnTheme = document.getElementById('btnThemeToggle');
  if (btnTheme) {
    btnTheme.textContent = savedTheme === 'dark' ? '🌙' : '☀️';
    btnTheme.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', current);
      localStorage.setItem('tr-theme', current);
      btnTheme.textContent = current === 'dark' ? '🌙' : '☀️';
    });
  }
  window.addEventListener('storage', (e) => {
    if (e.key === 'tr-theme') {
      document.documentElement.setAttribute('data-theme', e.newValue);
      if (btnTheme) btnTheme.textContent = e.newValue === 'dark' ? '🌙' : '☀️';
    }
  });

  // ── Data Management ──
  let folders = [];
  const LOCAL_STORAGE_KEY = 'tr-quicklaunch-data';

  async function loadData() {
    try {
      const res = await fetch('http://localhost:3000/api/quicklaunch');
      let serverData = [];
      if (res.ok) {
        serverData = await res.json();
      }
      
      if (!serverData || serverData.length === 0) {
        // Server is empty, check localStorage for existing data
        const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localData) {
          const parsedLocal = JSON.parse(localData);
          if (parsedLocal && parsedLocal.length > 0) {
            folders = parsedLocal;
            // Migrate local data to server
            saveData();
          }
        }
        
        // If still empty after checking local storage, use default data
        if (!folders || folders.length === 0) {
          folders = [
            {
              id: 'folder_' + Date.now(),
              name: 'Favorites',
              links: [
                { id: 'link_1', name: 'GitHub', url: 'https://github.com', emoji: '🐙' },
                { id: 'link_2', name: 'TestRail', url: 'https://elosystemsteam.testrail.com/', emoji: '🚂' }
              ]
            }
          ];
          saveData(); // Save default to server and local
        }
      } else {
        folders = serverData;
        // Keep local cache up to date with server
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(folders));
      }
    } catch (e) {
      console.error("Failed to load quicklaunch data from server", e);
      // Fallback to local storage if server completely fails
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (data) folders = JSON.parse(data);
      else folders = [];
    }
    renderFolders();
  }

  async function saveData() {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(folders)); // keep local backup
    try {
      await fetch('http://localhost:3000/api/quicklaunch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(folders)
      });
    } catch (e) {
      console.error("Failed to save quicklaunch data to server", e);
    }
  }

  // ── UI Elements ──
  const foldersContainer = document.getElementById('foldersContainer');
  const btnAddFolder = document.getElementById('btnAddFolder');

  const folderModal = document.getElementById('folderModal');
  const folderNameInput = document.getElementById('folderNameInput');
  const btnCancelFolder = document.getElementById('btnCancelFolder');
  const btnSaveFolder = document.getElementById('btnSaveFolder');
  const folderModalTitle = document.getElementById('folderModalTitle');
  let editingFolderId = null;

  const linkModal = document.getElementById('linkModal');
  const linkModalTitle = document.getElementById('linkModalTitle');
  const linkFolderIdInput = document.getElementById('linkFolderId');
  const linkIdInput = document.getElementById('linkId');
  const linkEmojiInput = document.getElementById('linkEmojiInput');
  const linkNameInput = document.getElementById('linkNameInput');
  const linkUrlInput = document.getElementById('linkUrlInput');
  const btnCancelLink = document.getElementById('btnCancelLink');
  const btnSaveLink = document.getElementById('btnSaveLink');

  // ── Render ──
  function renderFolders() {
    foldersContainer.innerHTML = '';
    
    if (folders.length === 0) {
      foldersContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px; color: var(--text-muted);">
          <div style="font-size: 48px; margin-bottom: 16px;">📁</div>
          <h3>No folders yet</h3>
          <p>Create a folder to start saving your quick-launch links.</p>
        </div>
      `;
      return;
    }

    folders.forEach((folder, index) => {
      const folderEl = document.createElement('div');
      folderEl.className = 'ql-folder';
      folderEl.draggable = true;
      folderEl.dataset.id = folder.id;

      // Drag events for folder re-ordering
      folderEl.addEventListener('dragstart', (e) => {
        folderEl.classList.add('dragging');
        e.dataTransfer.setData('text/plain', folder.id);
        e.dataTransfer.effectAllowed = 'move';
      });

      folderEl.addEventListener('dragend', () => {
        folderEl.classList.remove('dragging');
        document.querySelectorAll('.ql-folder').forEach(el => el.classList.remove('drag-over'));
      });

      folderEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const draggingEl = document.querySelector('.ql-folder.dragging');
        if (draggingEl && draggingEl !== folderEl) {
          folderEl.classList.add('drag-over');
        }
      });

      folderEl.addEventListener('dragleave', () => {
        folderEl.classList.remove('drag-over');
      });

      folderEl.addEventListener('drop', (e) => {
        e.preventDefault();
        folderEl.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== folder.id) {
          const fromIndex = folders.findIndex(f => f.id === draggedId);
          const toIndex = folders.findIndex(f => f.id === folder.id);
          if (fromIndex !== -1 && toIndex !== -1) {
            const [moved] = folders.splice(fromIndex, 1);
            folders.splice(toIndex, 0, moved);
            saveData();
            renderFolders();
          }
        }
      });

      // Header
      const header = document.createElement('div');
      header.className = 'ql-folder-header';
      
      const title = document.createElement('div');
      title.className = 'ql-folder-title';
      title.innerHTML = `<span>📁</span> ${folder.name}`;

      const actions = document.createElement('div');
      actions.className = 'ql-folder-actions';

      const btnAdd = document.createElement('button');
      btnAdd.className = 'ql-action-btn';
      btnAdd.title = 'Add Link';
      btnAdd.textContent = '➕';
      btnAdd.addEventListener('click', (e) => {
        e.stopPropagation();
        openLinkModal(folder.id);
      });

      const btnEdit = document.createElement('button');
      btnEdit.className = 'ql-action-btn';
      btnEdit.title = 'Edit Folder';
      btnEdit.textContent = '✏️';
      btnEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        openFolderModal(folder.id);
      });

      const btnDel = document.createElement('button');
      btnDel.className = 'ql-action-btn del';
      btnDel.title = 'Delete Folder';
      btnDel.textContent = '🗑️';
      btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete folder "${folder.name}" and all its links?`)) {
          folders.splice(index, 1);
          saveData();
          renderFolders();
        }
      });

      actions.appendChild(btnAdd);
      actions.appendChild(btnEdit);
      actions.appendChild(btnDel);

      header.appendChild(title);
      header.appendChild(actions);
      folderEl.appendChild(header);

      // Links Grid
      const linksGrid = document.createElement('div');
      linksGrid.className = 'ql-links-grid';

      if (!folder.links || folder.links.length === 0) {
        linksGrid.innerHTML = `<div style="grid-column: 1 / -1; font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 12px;">No links. Click ➕ to add.</div>`;
      } else {
        folder.links.forEach((link, lIndex) => {
          const card = document.createElement('a');
          card.className = 'ql-link-card';
          card.href = link.url;
          card.target = '_blank';
          card.rel = 'noopener noreferrer';

          const emoji = document.createElement('div');
          emoji.className = 'ql-link-emoji';
          emoji.textContent = link.emoji || '🔗';

          const name = document.createElement('div');
          name.className = 'ql-link-name';
          name.textContent = link.name;
          name.title = link.name; // tooltip

          const linkActions = document.createElement('div');
          linkActions.className = 'ql-link-actions';

          const btnEditLink = document.createElement('button');
          btnEditLink.className = 'ql-action-btn';
          btnEditLink.title = 'Edit Link';
          btnEditLink.innerHTML = '✏️';
          btnEditLink.style.fontSize = '10px';
          btnEditLink.style.padding = '2px';
          btnEditLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openLinkModal(folder.id, link.id);
          });

          const btnDelLink = document.createElement('button');
          btnDelLink.className = 'ql-action-btn del';
          btnDelLink.title = 'Delete Link';
          btnDelLink.innerHTML = '✕';
          btnDelLink.style.fontSize = '10px';
          btnDelLink.style.padding = '2px';
          btnDelLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm(`Delete link "${link.name}"?`)) {
              folder.links.splice(lIndex, 1);
              saveData();
              renderFolders();
            }
          });

          linkActions.appendChild(btnEditLink);
          linkActions.appendChild(btnDelLink);

          card.appendChild(linkActions);
          card.appendChild(emoji);
          card.appendChild(name);
          linksGrid.appendChild(card);
        });
      }

      folderEl.appendChild(linksGrid);
      foldersContainer.appendChild(folderEl);
    });
  }

  // ── Modals Logic ──
  function openFolderModal(id = null) {
    editingFolderId = id;
    if (id) {
      const folder = folders.find(f => f.id === id);
      folderModalTitle.textContent = 'Edit Folder';
      folderNameInput.value = folder.name;
    } else {
      folderModalTitle.textContent = 'New Folder';
      folderNameInput.value = '';
    }
    folderModal.classList.remove('hidden');
    folderNameInput.focus();
  }

  function closeFolderModal() {
    folderModal.classList.add('hidden');
    folderNameInput.value = '';
    editingFolderId = null;
  }

  function openLinkModal(folderId, linkId = null) {
    linkFolderIdInput.value = folderId;
    linkIdInput.value = linkId || '';
    
    if (linkId) {
      const folder = folders.find(f => f.id === folderId);
      const link = folder.links.find(l => l.id === linkId);
      linkModalTitle.textContent = 'Edit Link';
      linkEmojiInput.value = link.emoji || '🔗';
      linkNameInput.value = link.name;
      linkUrlInput.value = link.url;
    } else {
      linkModalTitle.textContent = 'Add Link';
      linkEmojiInput.value = '';
      linkNameInput.value = '';
      linkUrlInput.value = '';
    }
    linkModal.classList.remove('hidden');
    linkNameInput.focus();
  }

  function closeLinkModal() {
    linkModal.classList.add('hidden');
    linkFolderIdInput.value = '';
    linkIdInput.value = '';
    linkEmojiInput.value = '';
    linkNameInput.value = '';
    linkUrlInput.value = '';
  }

  // ── Event Listeners ──
  btnAddFolder.addEventListener('click', () => openFolderModal());
  btnCancelFolder.addEventListener('click', closeFolderModal);
  
  btnSaveFolder.addEventListener('click', () => {
    const name = folderNameInput.value.trim();
    if (!name) return;
    
    if (editingFolderId) {
      const folder = folders.find(f => f.id === editingFolderId);
      if (folder) folder.name = name;
    } else {
      folders.push({
        id: 'folder_' + Date.now(),
        name: name,
        links: []
      });
    }
    saveData();
    renderFolders();
    closeFolderModal();
  });

  btnCancelLink.addEventListener('click', closeLinkModal);

  btnSaveLink.addEventListener('click', () => {
    const folderId = linkFolderIdInput.value;
    const linkId = linkIdInput.value;
    const emoji = linkEmojiInput.value.trim() || '🔗';
    const name = linkNameInput.value.trim();
    let url = linkUrlInput.value.trim();

    if (!folderId || !name || !url) return;

    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    if (linkId) {
      const link = folder.links.find(l => l.id === linkId);
      if (link) {
        link.emoji = emoji;
        link.name = name;
        link.url = url;
      }
    } else {
      if (!folder.links) folder.links = [];
      folder.links.push({
        id: 'link_' + Date.now(),
        emoji: emoji,
        name: name,
        url: url
      });
    }
    saveData();
    renderFolders();
    closeLinkModal();
  });

  // Close modals on clicking outside
  folderModal.addEventListener('click', (e) => {
    if (e.target === folderModal) closeFolderModal();
  });
  linkModal.addEventListener('click', (e) => {
    if (e.target === linkModal) closeLinkModal();
  });

  // Allow Enter key to save
  folderNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSaveFolder.click();
  });
  linkUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSaveLink.click();
  });

  // ── Emoji Sidebar Logic ──
  const EMOJIS = [
    // Core & Tech
    '🔗', '🌟', '📁', '💻', '🚀', '🔥', '📊', '📈', '🛠️', '⚙️',
    '⚡', '✨', '📝', '📅', '💡', '📌', '📎', '📚', '🎯', '🎨',
    '🕹️', '📱', '🎧', '📸', '🎬', '🎵', '⚽', '🏆', '🍔', '☕',
    // Life & Nature
    '🍺', '🛒', '💰', '💳', '✈️', '🌍', '🏠', '🏢', '🚗', '🚢',
    '⏰', '⏳', '🌈', '☀️', '🌙', '☁️', '❄️', '💧', '🌿', '🐾',
    '🐶', '🐱', '🦋', '🍎', '🍓', '🥑', '🎁', '🎈', '🎉', '💎',
    // Hearts & Faces
    '❤️', '💙', '💚', '💛', '💜', '🖤', '🤍', '🤎', '✅', '❌',
    '💯', '👍', '👎', '👏', '🙌', '🤝', '💪', '🧠', '👀', '🗣️',
    '🤖', '👽', '👻', '🎃', '👑', '💍', '💼', '🎒', '🕶️', '🎓',
    '🏥', '🏦', '🏨', '🏪',
    // Numbers
    '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟',
    // Symbols & Arrows
    '❗', '❓', '⁉️', '❕', '✔️', '✖️', '➕', '➖', '➗', '💲', '©', '®', '™',
    '🅰️', '🅱️', '🆎', '🅾️', 'ℹ️', '🅿️', '#️⃣', '*️⃣',
    '⬆️', '⬇️', '⬅️', '➡️', '↗️', '↖️', '↘️', '↙️', '↔️', '↕️', '🔄', '🔃'
  ];

  const emojiGrid = document.getElementById('emojiGrid');
  const emojiToast = document.getElementById('emojiToast');
  let toastTimeout;

  function renderEmojis() {
    if (!emojiGrid) return;
    emojiGrid.innerHTML = '';
    EMOJIS.forEach(emoji => {
      const el = document.createElement('div');
      el.className = 'emoji-item';
      el.textContent = emoji;
      el.title = 'Click to copy';
      
      el.addEventListener('click', () => {
        // If modal is open, auto-fill it
        if (!linkModal.classList.contains('hidden')) {
          linkEmojiInput.value = emoji;
        }

        // Copy to clipboard
        navigator.clipboard.writeText(emoji).then(() => {
          emojiToast.textContent = `Copied ${emoji}`;
          emojiToast.classList.add('show');
          clearTimeout(toastTimeout);
          toastTimeout = setTimeout(() => {
            emojiToast.classList.remove('show');
          }, 1500);
        }).catch(err => {
          console.error("Failed to copy emoji: ", err);
        });
      });

      emojiGrid.appendChild(el);
    });
  }

  // Init
  renderEmojis();
  loadData();
});
