import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import {
  Plus,
  Trash2,
  Edit3,
  CheckSquare,
  Square,
  FileText,
  Calendar,
  Sparkles,
  ChevronRight,
  Download,
  AlertCircle,
  Bold,
  Italic,
  Code,
  Link2,
  Heading1,
  Heading2,
  Quote,
  List,
  ListOrdered,
  Image as ImageIcon,
  Strikethrough,
  Table,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-react';

const Notebook = () => {
  const textareaRef = useRef(null);

  // --- Notes State ---
  const [notes, setNotes] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [noteMode, setNoteMode] = useState('preview'); // 'edit', 'preview', 'split'
  const [editingTitleNoteId, setEditingTitleNoteId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const LOCAL_NOTES_KEY = 'tr-run-notes-list';
  const LOCAL_ACTIVE_NOTE_KEY = 'tr-active-note-id';

  // --- Initialize ---
  useEffect(() => {
    // Load Notes
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/notes');
      if (response.ok) {
        const backendNotes = await response.json();
        if (backendNotes && backendNotes.length > 0) {
          setNotes(backendNotes);
          const savedActiveNoteId = localStorage.getItem(LOCAL_ACTIVE_NOTE_KEY);
          if (savedActiveNoteId && backendNotes.some(n => n.id === savedActiveNoteId)) {
            setActiveNoteId(savedActiveNoteId);
          } else {
            setActiveNoteId(backendNotes[0].id);
          }
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to load backend notes, trying localStorage:", e);
    }

    const savedNotes = localStorage.getItem(LOCAL_NOTES_KEY);
    let loadedNotes = [];
    if (savedNotes) {
      loadedNotes = JSON.parse(savedNotes);
      setNotes(loadedNotes);
    } else {
      loadedNotes = [{ id: 'n_default', name: 'Scratchpad Note', content: '# Welcome to your Scratchpad\n\nUse this markdown notes manager to save your daily reports, code snippets, or project notes.', created: Date.now() }];
      setNotes(loadedNotes);
      localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(loadedNotes));
    }

    const savedActiveNoteId = localStorage.getItem(LOCAL_ACTIVE_NOTE_KEY);
    if (savedActiveNoteId && loadedNotes.some(n => n.id === savedActiveNoteId)) {
      setActiveNoteId(savedActiveNoteId);
    } else if (loadedNotes.length > 0) {
      setActiveNoteId(loadedNotes[0].id);
    }
  };

  // --- Notes Handlers ---
  const saveNotesList = (updated, activeId = activeNoteId) => {
    setNotes(updated);
    localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(updated));
    if (activeId) {
      setActiveNoteId(activeId);
      localStorage.setItem(LOCAL_ACTIVE_NOTE_KEY, activeId);
    }

    const currentNote = updated.find(n => n.id === activeId);
    if (currentNote) {
      fetch('http://localhost:3000/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentNote)
      }).catch(e => console.error('Sync note error:', e));
    }
  };

  const activeNote = notes.find(n => n.id === activeNoteId) || null;

  const injectMarkdown = (prefix, suffix = '') => {
    if (!textareaRef.current || !activeNote) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const text = activeNote.content || '';
    const newText = text.substring(0, start) + prefix + text.substring(start, end) + suffix + text.substring(end);
    handleNoteContentChange(newText);
    setTimeout(() => {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(start + prefix.length, end + prefix.length);
    }, 0);
  };

  const handleCreateNote = () => {
    const newNote = {
      id: 'n_' + Date.now(),
      name: `New Note (${notes.length + 1})`,
      content: '# New Note\n\nWrite your thoughts here...',
      created: Date.now()
    };
    const updated = [...notes, newNote];
    saveNotesList(updated, newNote.id);
  };

  const handleNoteContentChange = (content) => {
    if (!activeNote) return;
    const updated = notes.map(n => {
      if (n.id === activeNote.id) {
        return { ...n, content };
      }
      return n;
    });
    saveNotesList(updated);
  };

  const handleDeleteNote = async (id) => {
    if (notes.length <= 1) {
      alert("You must keep at least one note.");
      return;
    }
    const target = notes.find(n => n.id === id);
    if (!target) return;

    if (window.confirm("Permanently delete this note?")) {
      try {
        await fetch('http://localhost:3000/api/notes', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: target.name })
        });
      } catch (e) {
        console.error("Failed to delete note from backend:", e);
      }

      const updated = notes.filter(n => n.id !== id);
      const nextActiveId = updated[0].id;
      saveNotesList(updated, nextActiveId);
    }
  };

  const handleStartRename = (id, name) => {
    setEditingTitleNoteId(id);
    setRenameValue(name);
  };

  const handleSaveRename = (id) => {
    if (!renameValue.trim()) return;
    const oldNote = notes.find(n => n.id === id);
    if (!oldNote) return;

    const updated = notes.map(n => {
      if (n.id === id) {
        return { ...n, name: renameValue };
      }
      return n;
    });

    setNotes(updated);
    localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(updated));
    setEditingTitleNoteId(null);

    const activeNote = updated.find(n => n.id === id);
    if (activeNote) {
      fetch('http://localhost:3000/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...activeNote,
          oldName: oldNote.name
        })
      }).catch(e => console.error('Sync note error:', e));
    }
  };

  const handleExportNote = () => {
    if (!activeNote) return;
    const element = document.createElement("a");
    const file = new Blob([activeNote.content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${activeNote.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', gap: '20px', minHeight: 'calc(100vh - 150px)', minWidth: 0 }}>

          {/* Notes Sidebar */}
          <div className="custom-scrollbar" style={{
            width: '240px',
            minWidth: '240px',
            flexShrink: 0,
            borderRight: '1px solid rgba(255,255,255,0.05)',
            paddingRight: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '800', color: 'var(--text-muted)' }}>Notebooks</span>
              <button
                onClick={handleCreateNote}
                style={{ background: 'rgba(168,85,247,0.15)', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', color: 'var(--accent-purple)', display: 'flex', alignItems: 'center', transition: 'all 0.2s ease' }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'var(--accent-purple)'; e.currentTarget.style.color = '#fff'; }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.15)'; e.currentTarget.style.color = 'var(--accent-purple)'; }}
              >
                <Plus size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flexGrow: 1, paddingRight: '4px' }}>
              {notes.map(note => {
                const isActive = note.id === activeNoteId;
                const isRenaming = editingTitleNoteId === note.id;

                return (
                  <div
                    key={note.id}
                    onClick={() => !isRenaming && setActiveNoteId(note.id)}
                    style={{
                      background: isActive ? 'linear-gradient(90deg, rgba(168,85,247,0.15), rgba(236,72,153,0.05))' : 'transparent',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderLeft: isActive ? '3px solid var(--accent-purple)' : '3px solid transparent',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    }}
                    onMouseOut={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {isRenaming ? (
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleSaveRename(note.id)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(note.id)}
                        autoFocus
                        style={{
                          width: '100%',
                          background: 'rgba(0,0,0,0.2)',
                          border: '1px solid var(--accent-purple)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem',
                          padding: '4px 6px',
                          borderRadius: '6px',
                          outline: 'none'
                        }}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexGrow: 1, overflow: 'hidden' }}>
                        <FileText size={14} style={{ color: isActive ? 'var(--accent-purple)' : 'var(--text-muted)' }} />
                        <span
                          onDoubleClick={() => handleStartRename(note.id, note.name)}
                          style={{
                            fontSize: '0.85rem',
                            fontWeight: isActive ? '700' : '500',
                            color: isActive ? '#fff' : 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {note.name}
                        </span>
                      </div>
                    )}

                    {!isRenaming && (
                      <div style={{ display: 'flex', gap: '4px', opacity: isActive ? 1 : 0.4, transition: 'opacity 0.2s' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleStartRename(note.id, note.name); }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', borderRadius: '4px' }}
                          onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
                          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-red)', padding: '4px', borderRadius: '4px' }}
                          onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(244,63,94,0.15)'; }}
                          onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Note Editor & Preview */}
          {activeNote ? (
            <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>

              {/* Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', padding: '2px', borderRadius: '8px' }}>
                  {[
                    { id: 'edit', label: 'Edit' },
                    { id: 'preview', label: 'Preview' },
                    { id: 'split', label: 'Split View' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setNoteMode(tab.id)}
                      style={{
                        background: noteMode === tab.id ? 'var(--bg-primary)' : 'transparent',
                        border: 'none',
                        color: noteMode === tab.id ? 'var(--accent-purple)' : 'var(--text-secondary)',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: '600'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleExportNote}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Download size={12} />
                  Export .md
                </button>
              </div>

              {/* Editor Workspace */}
              <div style={{ display: 'flex', gap: '16px', flexGrow: 1, height: '100%', minHeight: '400px', minWidth: 0 }}>
                {(noteMode === 'edit' || noteMode === 'split') && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '8px', padding: '8px', background: 'rgba(0,0,0,0.15)', borderRadius: '12px 12px 0 0', border: '1px solid var(--border-color)', borderBottom: 'none' }}>
                      <button onClick={() => injectMarkdown('**', '**')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}><Bold size={14} /></button>
                      <button onClick={() => injectMarkdown('*', '*')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}><Italic size={14} /></button>
                      <button onClick={() => injectMarkdown('~~', '~~')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}><Strikethrough size={14} /></button>

                      <div style={{ width: '1px', background: 'var(--border-color)', margin: '0 4px' }}></div>

                      <button onClick={() => injectMarkdown('# ', '')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}><Heading1 size={14} /></button>
                      <button onClick={() => injectMarkdown('## ', '')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}><Heading2 size={14} /></button>
                      <button onClick={() => injectMarkdown('> ', '')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}><Quote size={14} /></button>

                      <div style={{ width: '1px', background: 'var(--border-color)', margin: '0 4px' }}></div>

                      <button onClick={() => injectMarkdown('- ', '')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}><List size={14} /></button>
                      <button onClick={() => injectMarkdown('1. ', '')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}><ListOrdered size={14} /></button>

                      <div style={{ width: '1px', background: 'var(--border-color)', margin: '0 4px' }}></div>

                      <button onClick={() => injectMarkdown('```\n', '\n```')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}><Code size={14} /></button>
                      <button onClick={() => injectMarkdown('[', '](url)')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}><Link2 size={14} /></button>
                      <button onClick={() => injectMarkdown('![alt text](', 'image_url)')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}><ImageIcon size={14} /></button>
                      <button onClick={() => injectMarkdown('\n| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n', '')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }} onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}><Table size={14} /></button>
                    </div>
                    <textarea
                      ref={textareaRef}
                      value={activeNote.content}
                      onChange={(e) => handleNoteContentChange(e.target.value)}
                      placeholder="Write markdown here..."
                      style={{
                        flex: 1,
                        minWidth: 0,
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        borderRadius: '0 0 12px 12px',
                        padding: '16px',
                        outline: 'none',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.85rem',
                        lineHeight: '1.5',
                        resize: 'none'
                      }}
                    />
                  </div>
                )}

                {(noteMode === 'preview' || noteMode === 'split') && (
                  <div
                    className="markdown-body"
                    dangerouslySetInnerHTML={{ __html: marked(activeNote.content || '') }}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      borderRadius: '12px',
                      padding: '16px',
                      overflowY: 'auto',
                      overflowX: 'auto'
                    }}
                  />
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1, color: 'var(--text-muted)' }}>
              <FileText size={48} style={{ strokeWidth: '1.5', opacity: 0.5 }} />
              <span>Select a note from the sidebar</span>
            </div>
          )}
        </div>
    </div>
  );
};

export default Notebook;
