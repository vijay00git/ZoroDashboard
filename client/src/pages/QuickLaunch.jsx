import React, { useState, useEffect } from 'react';
import { 
  FolderPlus, 
  Link, 
  Trash2, 
  Edit3, 
  ExternalLink,
  Plus, 
  X,
  Copy
} from 'lucide-react';

const QuickLaunch = () => {
  // --- State ---
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState('default');

  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [targetFolderId, setTargetFolderId] = useState(null);
  const [editingLinkId, setEditingLinkId] = useState(null);
  const [linkEmoji, setLinkEmoji] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const LOCAL_STORAGE_KEY = 'tr-quicklaunch-data';

  // Preset Colors
  const COLORS = [
    { name: 'Default', value: 'default', bg: 'var(--bg-tertiary)', border: 'var(--border-color)' },
    { name: 'Red', value: '#ef4444', bg: '#ef4444', border: 'transparent' },
    { name: 'Orange', value: '#f97316', bg: '#f97316', border: 'transparent' },
    { name: 'Yellow', value: '#eab308', bg: '#eab308', border: 'transparent' },
    { name: 'Green', value: '#22c55e', bg: '#22c55e', border: 'transparent' },
    { name: 'Blue', value: '#3b82f6', bg: '#3b82f6', border: 'transparent' },
    { name: 'Purple', value: '#a855f7', bg: '#a855f7', border: 'transparent' },
    { name: 'Pink', value: '#ec4899', bg: '#ec4899', border: 'transparent' }
  ];

  // Emojis for copy
  const EMOJIS = [
    '🔗', '🌟', '📁', '💻', '🚀', '🔥', '📊', '📈', '🛠️', '⚙️',
    '⚡', '✨', '📝', '💡', '📌', '📎', '📚', '🎯', '🎨', '☕',
    '❤️', '✅', '❌', '💯', '👍', '👏', '🧠', '👑', '💼', '🏢',
    '🌐', '🔍', '🛡️', '📦', '📱', '📞', '📧', '📅', '🗑️', '🔑', 
    '🔒', '🎉', '🏆', '⭐', '🧩', '🔔', '💬', '📢', '🎧', '🎤'
  ];

  // --- Load Data ---
  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3000/api/quicklaunch');
      let serverData = [];
      if (res.ok) {
        serverData = await res.json();
      }
      
      if (!serverData || serverData.length === 0) {
        const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (localData) {
          const parsed = JSON.parse(localData);
          if (parsed && parsed.length > 0) {
            setFolders(parsed);
            saveData(parsed);
          }
        } else {
          // Default seed
          const defaults = [
            {
              id: 'folder_default',
              name: 'Favorites',
              color: 'default',
              links: [
                { id: 'link_1', name: 'GitHub', url: 'https://github.com', emoji: '🐙', clicks: 0 },
                { id: 'link_2', name: 'TestRail', url: 'https://elosystemsteam.testrail.com/', emoji: '🚂', clicks: 0 }
              ]
            }
          ];
          setFolders(defaults);
          saveData(defaults);
        }
      } else {
        setFolders(serverData);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serverData));
      }
    } catch (e) {
      console.error(e);
      const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (localData) setFolders(JSON.parse(localData));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveData = async (updated) => {
    setFolders(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    try {
      await fetch('http://localhost:3000/api/quicklaunch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (e) {
      console.error(e);
    }
  };

  // --- Handlers ---
  const handleOpenFolderModal = (folderId = null) => {
    if (folderId) {
      const f = folders.find(x => x.id === folderId);
      setEditingFolderId(folderId);
      setFolderName(f.name);
      setFolderColor(f.color || 'default');
    } else {
      setEditingFolderId(null);
      setFolderName('');
      setFolderColor('default');
    }
    setFolderModalOpen(true);
  };

  const handleSaveFolder = (e) => {
    e.preventDefault();
    if (!folderName.trim()) return;

    let updated;
    if (editingFolderId) {
      updated = folders.map(f => {
        if (f.id === editingFolderId) {
          return { ...f, name: folderName, color: folderColor };
        }
        return f;
      });
    } else {
      updated = [
        ...folders,
        {
          id: 'folder_' + Date.now(),
          name: folderName,
          color: folderColor,
          links: []
        }
      ];
    }

    saveData(updated);
    setFolderModalOpen(false);
  };

  const handleDeleteFolder = (id) => {
    if (window.confirm("Delete this folder and all its links?")) {
      const updated = folders.filter(f => f.id !== id);
      saveData(updated);
    }
  };

  const handleOpenLinkModal = (folderId, linkId = null) => {
    setTargetFolderId(folderId);
    if (linkId) {
      const f = folders.find(x => x.id === folderId);
      const l = f.links.find(x => x.id === linkId);
      setEditingLinkId(linkId);
      setLinkEmoji(l.emoji || '');
      setLinkName(l.name);
      setLinkUrl(l.url);
    } else {
      setEditingLinkId(null);
      setLinkEmoji('');
      setLinkName('');
      setLinkUrl('');
    }
    setLinkModalOpen(true);
  };

  const handleSaveLink = (e) => {
    e.preventDefault();
    if (!linkName.trim() || !linkUrl.trim()) return;

    let cleanUrl = linkUrl.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = 'https://' + cleanUrl;
    }

    const updated = folders.map(f => {
      if (f.id === targetFolderId) {
        let newLinks = [...(f.links || [])];
        if (editingLinkId) {
          newLinks = newLinks.map(l => {
            if (l.id === editingLinkId) {
              return { ...l, emoji: linkEmoji, name: linkName, url: cleanUrl };
            }
            return l;
          });
        } else {
          newLinks.push({
            id: 'link_' + Date.now(),
            emoji: linkEmoji,
            name: linkName,
            url: cleanUrl,
            clicks: 0
          });
        }
        return { ...f, links: newLinks };
      }
      return f;
    });

    saveData(updated);
    setLinkModalOpen(false);
  };

  const handleDeleteLink = (folderId, linkId) => {
    if (window.confirm("Delete this link?")) {
      const updated = folders.map(f => {
        if (f.id === folderId) {
          return { ...f, links: f.links.filter(l => l.id !== linkId) };
        }
        return f;
      });
      saveData(updated);
    }
  };

  const handleCardClick = (folderId, linkId) => {
    const updated = folders.map(f => {
      if (f.id === folderId) {
        return {
          ...f,
          links: f.links.map(l => {
            if (l.id === linkId) {
              return { ...l, clicks: (l.clicks || 0) + 1 };
            }
            return l;
          })
        };
      }
      return f;
    });
    saveData(updated);
  };

  const getFaviconUrl = (url) => {
    try {
      const hostname = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    } catch(e) {
      return '';
    }
  };

  const handleEmojiClick = (emoji) => {
    if (linkModalOpen) {
      setLinkEmoji(emoji);
    } else {
      navigator.clipboard.writeText(emoji);
    }
  };

  // Smart Folder: Most Used Links
  const getMostUsed = () => {
    const list = [];
    folders.forEach(f => {
      if (f.links) {
        f.links.forEach(l => {
          if (l.clicks && l.clicks > 0) {
            list.push({ ...l, folderId: f.id });
          }
        });
      }
    });
    return list.sort((a, b) => b.clicks - a.clicks).slice(0, 5);
  };

  const mostUsed = getMostUsed();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '4px' }}>
            Quick-<span className="gradient-text">Launch</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>Organize and launch your work links with a single click.</p>
        </div>
        
        <button 
          onClick={() => handleOpenFolderModal()}
          className="glow-btn"
        >
          <Plus size={16} />
          New Folder
        </button>
      </div>

      {/* Main Grid split */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '3fr 1fr',
        gap: '24px',
        alignItems: 'start'
      }}>
        
        {/* Folders List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Most Used Smart Folder */}
          {mostUsed.length > 0 && (
            <div className="glass-panel" style={{ padding: '20px', borderLeft: '4px solid var(--accent-pink)' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '1.2rem' }}>🔥</span>
                <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Most Used</h3>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {mostUsed.map(link => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleCardClick(link.folderId, link.id)}
                    className="glass-panel"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 16px',
                      textDecoration: 'none',
                      color: 'var(--text-primary)',
                      borderRadius: '12px',
                      fontSize: '0.9rem',
                      fontWeight: '500'
                    }}
                  >
                    <span>{link.emoji || <img src={getFaviconUrl(link.url)} style={{ width: '16px', height: '16px' }} alt="" />}</span>
                    <span>{link.name}</span>
                    <ExternalLink size={12} style={{ opacity: 0.5 }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Regular Folders */}
          {folders.length === 0 ? (
            <div className="glass-panel" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <FolderPlus size={48} style={{ opacity: 0.5, marginBottom: '12px' }} />
              <h3>No folders created</h3>
              <p style={{ fontSize: '0.85rem' }}>Create a folder using the top button to start adding links.</p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: '20px'
            }}>
              {folders.map(folder => {
                const borderAccent = folder.color && folder.color !== 'default' ? folder.color : 'var(--border-color)';
                return (
                  <div 
                    key={folder.id} 
                    className="glass-panel"
                    style={{ 
                      padding: '20px', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '16px',
                      borderTop: `4px solid ${borderAccent}`
                    }}
                  >
                    
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>📁</span>
                        {folder.name}
                      </h3>
                      
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button 
                          onClick={() => handleOpenLinkModal(folder.id)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                          title="Add link"
                        >
                          <Plus size={16} />
                        </button>
                        <button 
                          onClick={() => handleOpenFolderModal(folder.id)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                          title="Edit Folder"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button 
                          onClick={() => handleDeleteFolder(folder.id)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-red)' }}
                          title="Delete Folder"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Links List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {(!folder.links || folder.links.length === 0) ? (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>
                          Empty. Click "+" to add a link.
                        </p>
                      ) : (
                        folder.links.map(link => (
                          <div 
                            key={link.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              background: 'var(--bg-tertiary)',
                              padding: '8px 12px',
                              borderRadius: '8px'
                            }}
                          >
                            <a 
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => handleCardClick(folder.id, link.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                textDecoration: 'none',
                                color: 'var(--text-primary)',
                                fontSize: '0.85rem',
                                fontWeight: '500',
                                flexGrow: 1
                              }}
                            >
                              <span>{link.emoji || <img src={getFaviconUrl(link.url)} style={{ width: '14px', height: '14px' }} alt="" />}</span>
                              <span>{link.name}</span>
                            </a>

                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button 
                                onClick={() => handleOpenLinkModal(folder.id, link.id)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                              >
                                <Edit3 size={12} />
                              </button>
                              <button 
                                onClick={() => handleDeleteLink(folder.id, link.id)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-red)' }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Emoji Sidebar */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>Emoji Helper</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Click an emoji to copy or inject into open link modal.</p>
          
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '8px'
          }}>
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => handleEmojiClick(emoji)}
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  padding: '6px',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Folder Modal */}
      {folderModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div className="glass-panel" style={{ padding: '24px', width: '360px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
              {editingFolderId ? 'Edit Folder' : 'New Folder'}
            </h3>
            
            <form onSubmit={handleSaveFolder} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Folder Name</label>
                <input 
                  type="text" 
                  value={folderName} 
                  onChange={(e) => setFolderName(e.target.value)} 
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    outline: 'none'
                  }}
                  placeholder="e.g. Daily QA, Tools"
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Theme Accent</label>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setFolderColor(c.value)}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: c.bg,
                        border: folderColor === c.value ? '2px solid var(--accent-purple)' : `1px solid ${c.border}`,
                        cursor: 'pointer'
                      }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button 
                  type="button" 
                  onClick={() => setFolderModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="glow-btn"
                  style={{ padding: '8px 16px' }}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Link Modal */}
      {linkModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div className="glass-panel" style={{ padding: '24px', width: '380px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
              {editingLinkId ? 'Edit Link' : 'Add Link'}
            </h3>
            
            <form onSubmit={handleSaveLink} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Emoji (optional)</label>
                <input 
                  type="text" 
                  value={linkEmoji} 
                  onChange={(e) => setLinkEmoji(e.target.value)} 
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    outline: 'none'
                  }}
                  placeholder="e.g. 🛠️"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Link Name</label>
                <input 
                  type="text" 
                  value={linkName} 
                  onChange={(e) => setLinkName(e.target.value)} 
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    outline: 'none'
                  }}
                  placeholder="e.g. Jenkins QA"
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: '600' }}>URL</label>
                <input 
                  type="text" 
                  value={linkUrl} 
                  onChange={(e) => setLinkUrl(e.target.value)} 
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    outline: 'none'
                  }}
                  placeholder="https://example.com"
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button 
                  type="button" 
                  onClick={() => setLinkModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="glow-btn"
                  style={{ padding: '8px 16px' }}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default QuickLaunch;
