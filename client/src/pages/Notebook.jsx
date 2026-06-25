import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import html2pdf from 'html2pdf.js';
import {
  Plus,
  Trash2,
  Edit3,
  FileText,
  Download,
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
  FolderPlus,
  FilePlus,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  GripVertical,
  FileOutput,
  Eye,
  Columns
} from 'lucide-react';
import { showAlert, showConfirm } from '../utils/Alerts';

const Notebook = () => {
  const textareaRef = useRef(null);

  // --- State ---
  const [items, setItems] = useState([]);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [noteMode, setNoteMode] = useState('preview'); // 'edit', 'preview', 'split'
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  
  // Drag & Drop
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [dragOverItemId, setDragOverItemId] = useState(null);

  const LOCAL_NOTES_KEY = 'tr-run-notes-list';
  const LOCAL_ACTIVE_NOTE_KEY = 'tr-active-note-id';

  // --- Initialize ---
  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    let localItems = [];
    const savedNotes = localStorage.getItem(LOCAL_NOTES_KEY);
    if (savedNotes) {
      localItems = JSON.parse(savedNotes);
    } else {
      localItems = [{ 
        id: 'n_default', 
        type: 'note', 
        name: 'Scratchpad Note', 
        content: '# Welcome to your Scratchpad\n\nUse this markdown notebook to organize your daily reports, code snippets, or project notes into folders.', 
        parentId: null, 
        created: Date.now() 
      }];
    }

    try {
      const response = await fetch('http://localhost:3000/api/notes');
      if (response.ok) {
        const backendNotes = await response.json();
        if (backendNotes && backendNotes.length > 0) {
          // Merge backend notes into localItems
          backendNotes.forEach(bn => {
            const safeBnName = bn.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
            const existingMatch = localItems.find(li => li.type === 'note' && li.name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase() === safeBnName);
            
            if (existingMatch) {
              existingMatch.content = bn.content;
            } else {
              localItems.push({
                id: 'n_' + Date.now() + Math.random().toString(36).substr(2, 5),
                type: 'note',
                name: bn.name,
                content: bn.content,
                parentId: null,
                created: bn.created
              });
            }
          });
        }
      }
    } catch (e) {
      console.warn("Failed to load backend notes, using localStorage:", e);
    }

    // Migrate older items
    const migratedItems = localItems.map(item => ({
      ...item,
      type: item.type || 'note',
      parentId: item.parentId || null,
      isExpanded: item.isExpanded !== undefined ? item.isExpanded : true
    }));

    setItems(migratedItems);
    localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(migratedItems));

    const savedActiveNoteId = localStorage.getItem(LOCAL_ACTIVE_NOTE_KEY);
    if (savedActiveNoteId && migratedItems.some(n => n.id === savedActiveNoteId && n.type === 'note')) {
      setActiveNoteId(savedActiveNoteId);
    } else {
      const firstNote = migratedItems.find(n => n.type === 'note');
      if (firstNote) setActiveNoteId(firstNote.id);
    }
  };

  // --- Items Handlers ---
  const saveItemsList = (updated, activeId = activeNoteId) => {
    setItems(updated);
    localStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(updated));
    if (activeId) {
      setActiveNoteId(activeId);
      localStorage.setItem(LOCAL_ACTIVE_NOTE_KEY, activeId);
    }
    // Optionally sync to backend (mocked as original)
    const currentNote = updated.find(n => n.id === activeId);
    if (currentNote && currentNote.type === 'note') {
      fetch('http://localhost:3000/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentNote)
      }).catch(e => console.error('Sync note error:', e));
    }
  };

  const activeNote = items.find(n => n.id === activeNoteId && n.type === 'note') || null;

  // --- Folder & Note Creation ---
  const handleCreateNote = (parentId = null) => {
    const newNote = {
      id: 'n_' + Date.now() + Math.random().toString(36).substr(2, 5),
      type: 'note',
      name: `New Note`,
      content: '# New Note\n\nWrite your thoughts here...',
      parentId: parentId,
      created: Date.now()
    };
    
    // Expand parent folder if not expanded
    let updated = [...items];
    if (parentId) {
      updated = updated.map(item => item.id === parentId ? { ...item, isExpanded: true } : item);
    }
    
    updated.push(newNote);
    saveItemsList(updated, newNote.id);
  };

  const handleCreateFolder = () => {
    const newFolder = {
      id: 'f_' + Date.now() + Math.random().toString(36).substr(2, 5),
      type: 'folder',
      name: `New Folder`,
      parentId: null,
      isExpanded: true,
      created: Date.now()
    };
    const updated = [newFolder, ...items];
    saveItemsList(updated);
  };

  const handleToggleFolder = (e, folderId) => {
    e.stopPropagation();
    const updated = items.map(item => 
      item.id === folderId ? { ...item, isExpanded: !item.isExpanded } : item
    );
    saveItemsList(updated);
  };

  const handleNoteContentChange = (content) => {
    if (!activeNote) return;
    const updated = items.map(n => n.id === activeNote.id ? { ...n, content } : n);
    saveItemsList(updated);
  };

  const handleDeleteItem = async (e, id) => {
    e.stopPropagation();
    const target = items.find(n => n.id === id);
    if (!target) return;

    if (target.type === 'folder') {
      const children = items.filter(n => n.parentId === id);
      if (children.length > 0) {
        if (!(await showConfirm(`This folder contains ${children.length} items. Delete it and all its contents?`))) return;
      } else {
        if (!(await showConfirm("Delete this empty folder?"))) return;
      }
    } else {
      if (!(await showConfirm("Permanently delete this note?"))) return;
    }

    // Identify all IDs to delete (target + children)
    const idsToDelete = [id];
    if (target.type === 'folder') {
      items.filter(n => n.parentId === id).forEach(child => idsToDelete.push(child.id));
    }

    const updated = items.filter(n => !idsToDelete.includes(n.id));
    
    let nextActiveId = activeNoteId;
    if (idsToDelete.includes(activeNoteId)) {
      const nextNote = updated.find(n => n.type === 'note');
      nextActiveId = nextNote ? nextNote.id : null;
    }
    
    if (updated.length === 0 && target.type === 'note') {
      showAlert("You must keep at least one item.");
      return;
    }
    
    saveItemsList(updated, nextActiveId);
  };

  // --- Renaming ---
  const handleStartRename = (e, id, name) => {
    e.stopPropagation();
    setEditingTitleId(id);
    setRenameValue(name);
  };

  const handleSaveRename = (id) => {
    if (!renameValue.trim()) return;
    const updated = items.map(n => n.id === id ? { ...n, name: renameValue } : n);
    saveItemsList(updated);
    setEditingTitleId(null);
  };

  // --- Markdown Tools ---
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

  // --- Exporting ---
  const handleExportMarkdown = () => {
    if (!activeNote) return;
    const element = document.createElement("a");
    const file = new Blob([activeNote.content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${activeNote.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleExportPDF = () => {
    if (!activeNote) return;
    
    // Create a temporary unmounted container for rendering clean HTML for PDF
    const tempContainer = document.createElement('div');
    tempContainer.className = 'markdown-body';
    tempContainer.innerHTML = `
      <div style="padding: 20px 40px; font-family: 'Inter', sans-serif; color: #111;">
        <h1 style="border-bottom: 2px solid #eaeaea; padding-bottom: 10px; margin-bottom: 20px;">${activeNote.name}</h1>
        ${marked(activeNote.content || '')}
      </div>
    `;
    
    // Note: PDF generation needs valid styles applied
    const opt = {
      margin:       10,
      filename:     `${activeNote.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(tempContainer).save();
  };

  // --- Drag and Drop ---
  const handleDragStart = (e, id) => {
    setDraggedItemId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id); // Required for Firefox
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    if (draggedItemId === id) return;
    setDragOverItemId(id);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOverItemId(null);
  };

  const handleDrop = (e, targetId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverItemId(null);
    if (!draggedItemId || draggedItemId === targetId) return;

    const originalDraggedItem = items.find(i => i.id === draggedItemId);
    const targetItem = items.find(i => i.id === targetId);
    
    if (!originalDraggedItem || !targetItem) return;

    // Prevent dropping a folder into itself or its own children
    if (originalDraggedItem.type === 'folder' && targetItem.parentId === originalDraggedItem.id) return;

    const draggedItem = { ...originalDraggedItem };
    let newItems = items.filter(i => i.id !== draggedItemId);

    if (targetItem.type === 'folder') {
      // Drop ONTO a folder: Move dragged item INTO this folder
      draggedItem.parentId = targetItem.id;
      // Also expand the target folder
      newItems = newItems.map(i => i.id === targetItem.id ? { ...i, isExpanded: true } : i);
      // Place right after the folder
      const targetIndex = newItems.findIndex(i => i.id === targetId);
      newItems.splice(targetIndex + 1, 0, draggedItem);
    } else {
      // Drop ONTO a note: Put it next to the note, adopting its parentId
      draggedItem.parentId = targetItem.parentId;
      const targetIndex = newItems.findIndex(i => i.id === targetId);
      newItems.splice(targetIndex + 1, 0, draggedItem); // Insert after target
    }

    saveItemsList(newItems);
    setDraggedItemId(null);
  };

  const handleDropToRoot = (e) => {
    e.preventDefault();
    if (!draggedItemId) return;
    const originalDraggedItem = items.find(i => i.id === draggedItemId);
    if (!originalDraggedItem) return;

    const draggedItem = { ...originalDraggedItem };
    let newItems = items.filter(i => i.id !== draggedItemId);
    
    draggedItem.parentId = null;
    newItems.push(draggedItem);
    saveItemsList(newItems);
    setDraggedItemId(null);
  };

  // --- Rendering Tree ---
  const renderItem = (item, level = 0) => {
    const isEditing = editingTitleId === item.id;
    const isActive = activeNoteId === item.id && item.type === 'note';
    const hasChildren = items.some(i => i.parentId === item.id);
    const isDragOver = dragOverItemId === item.id;

    return (
      <div key={item.id}>
        <div
          draggable={!isEditing}
          onDragStart={(e) => handleDragStart(e, item.id)}
          onDragOver={(e) => handleDragOver(e, item.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, item.id)}
          onClick={() => {
            if (isEditing) return;
            if (item.type === 'note') setActiveNoteId(item.id);
            else handleToggleFolder({ stopPropagation: () => {} }, item.id);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            paddingLeft: `${12 + level * 20}px`,
            background: isActive ? 'linear-gradient(90deg, rgba(168,85,247,0.15), rgba(236,72,153,0.05))' : (isDragOver ? 'rgba(59,130,246,0.2)' : 'transparent'),
            borderRadius: '8px',
            cursor: 'pointer',
            borderLeft: isActive ? '3px solid var(--accent-purple)' : (isDragOver ? '3px solid #3b82f6' : '3px solid transparent'),
            color: isActive ? '#fff' : 'var(--text-secondary)',
            fontWeight: isActive || item.type === 'folder' ? '700' : '500',
            transition: 'all 0.1s ease',
            marginBottom: '2px',
            opacity: draggedItemId === item.id ? 0.4 : 1
          }}
          className="nav-item-hover"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexGrow: 1, overflow: 'hidden' }}>
            <GripVertical size={12} style={{ cursor: 'grab', opacity: 0.3 }} />
            
            {item.type === 'folder' ? (
              <div onClick={(e) => handleToggleFolder(e, item.id)} style={{ display: 'flex', alignItems: 'center' }}>
                {item.isExpanded ? <ChevronDown size={14} style={{ color: 'var(--accent-purple)' }} /> : <ChevronRight size={14} />}
                {item.isExpanded ? <FolderOpen size={14} style={{ color: 'var(--accent-purple)', marginLeft: '4px' }} /> : <Folder size={14} style={{ marginLeft: '4px' }} />}
              </div>
            ) : (
              <FileText size={14} style={{ color: isActive ? 'var(--accent-purple)' : 'var(--text-muted)' }} />
            )}

            {isEditing ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleSaveRename(item.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(item.id)}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--accent-purple)', color: 'var(--text-primary)', fontSize: '0.85rem', padding: '2px 6px', borderRadius: '4px', outline: 'none' }}
              />
            ) : (
              <span onDoubleClick={(e) => handleStartRename(e, item.id, item.name)} style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', userSelect: 'none' }}>
                {item.name}
              </span>
            )}
          </div>

          {!isEditing && (
            <div className="hover-actions" style={{ display: 'flex', gap: '4px' }}>
              {item.type === 'folder' && (
                <button title="New Note" onClick={(e) => { e.stopPropagation(); handleCreateNote(item.id); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', padding: '4px', cursor: 'pointer' }}><Plus size={12} /></button>
              )}
              <button title="Rename" onClick={(e) => handleStartRename(e, item.id, item.name)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', padding: '4px', cursor: 'pointer' }}><Edit3 size={12} /></button>
              <button title="Delete" onClick={(e) => handleDeleteItem(e, item.id)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', padding: '4px', cursor: 'pointer' }}><Trash2 size={12} /></button>
            </div>
          )}
        </div>

        {/* Render Children */}
        {item.type === 'folder' && item.isExpanded && items.filter(i => i.parentId === item.id).map(child => renderItem(child, level + 1))}
      </div>
    );
  };

  const rootItems = items.filter(i => i.parentId === null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>
      <div className="glass-panel" style={{ display: 'flex', height: '100%', minWidth: 0, overflow: 'hidden' }}>

        {/* Sidebar */}
        <div style={{ width: '280px', flexShrink: 0, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.2)' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '800', margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="var(--accent-purple)" />
              Notebook
            </h2>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => handleCreateNote(null)} title="New Note" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: 'var(--text-primary)' }} className="nav-item-hover">
                <FilePlus size={14} />
              </button>
              <button onClick={handleCreateFolder} title="New Folder" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: 'var(--text-primary)' }} className="nav-item-hover">
                <FolderPlus size={14} />
              </button>
            </div>
          </div>

          <div 
            className="custom-scrollbar" 
            style={{ flexGrow: 1, padding: '16px 12px', overflowY: 'auto' }}
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={handleDropToRoot}
          >
            {rootItems.map(item => renderItem(item))}
            
            {/* Empty drop zone for root */}
            <div style={{ height: '50px', marginTop: '10px' }} />
          </div>
        </div>

        {/* Main Editor Area */}
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-primary)' }}>
          {activeNote ? (
            <>
              {/* Top Action Bar */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-tertiary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-primary)' }}>{activeNote.name}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {/* View Toggles */}
                  <div style={{ display: 'flex', background: 'var(--bg-primary)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <button onClick={() => setNoteMode('edit')} style={{ background: noteMode === 'edit' ? 'var(--bg-tertiary)' : 'transparent', color: noteMode === 'edit' ? 'var(--accent-purple)' : 'var(--text-muted)', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Edit3 size={14} /> Edit
                    </button>
                    <button onClick={() => setNoteMode('preview')} style={{ background: noteMode === 'preview' ? 'var(--bg-tertiary)' : 'transparent', color: noteMode === 'preview' ? 'var(--accent-purple)' : 'var(--text-muted)', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Eye size={14} /> View
                    </button>
                    <button onClick={() => setNoteMode('split')} style={{ background: noteMode === 'split' ? 'var(--bg-tertiary)' : 'transparent', color: noteMode === 'split' ? 'var(--accent-purple)' : 'var(--text-muted)', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Columns size={14} /> Split
                    </button>
                  </div>

                  {/* Exports */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleExportMarkdown} title="Export Markdown" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px', borderRadius: '8px', cursor: 'pointer' }} className="nav-item-hover">
                      <Download size={16} />
                    </button>
                    <button onClick={handleExportPDF} title="Export as PDF" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6', padding: '8px', borderRadius: '8px', cursor: 'pointer' }} className="nav-item-hover">
                      <FileOutput size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Workspace */}
              <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
                
                {/* Editor Pane */}
                {(noteMode === 'edit' || noteMode === 'split') && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: noteMode === 'split' ? '1px solid var(--border-color)' : 'none' }}>
                    {/* Toolbar */}
                    <div style={{ display: 'flex', gap: '4px', padding: '8px 16px', background: 'rgba(0,0,0,0.1)', borderBottom: '1px solid var(--border-color)', overflowX: 'auto' }}>
                      <button onClick={() => injectMarkdown('**', '**')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} className="nav-item-hover"><Bold size={14} /></button>
                      <button onClick={() => injectMarkdown('*', '*')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} className="nav-item-hover"><Italic size={14} /></button>
                      <button onClick={() => injectMarkdown('~~', '~~')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} className="nav-item-hover"><Strikethrough size={14} /></button>
                      <div style={{ width: '1px', background: 'var(--border-color)', margin: '0 4px' }}></div>
                      <button onClick={() => injectMarkdown('# ', '')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} className="nav-item-hover"><Heading1 size={14} /></button>
                      <button onClick={() => injectMarkdown('## ', '')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} className="nav-item-hover"><Heading2 size={14} /></button>
                      <button onClick={() => injectMarkdown('> ', '')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} className="nav-item-hover"><Quote size={14} /></button>
                      <div style={{ width: '1px', background: 'var(--border-color)', margin: '0 4px' }}></div>
                      <button onClick={() => injectMarkdown('- ', '')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} className="nav-item-hover"><List size={14} /></button>
                      <button onClick={() => injectMarkdown('1. ', '')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} className="nav-item-hover"><ListOrdered size={14} /></button>
                      <div style={{ width: '1px', background: 'var(--border-color)', margin: '0 4px' }}></div>
                      <button onClick={() => injectMarkdown('```\n', '\n```')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} className="nav-item-hover"><Code size={14} /></button>
                      <button onClick={() => injectMarkdown('[', '](url)')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} className="nav-item-hover"><Link2 size={14} /></button>
                      <button onClick={() => injectMarkdown('![alt text](', 'image_url)')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} className="nav-item-hover"><ImageIcon size={14} /></button>
                      <button onClick={() => injectMarkdown('\n| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n', '')} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', padding: '6px', borderRadius: '4px', cursor: 'pointer' }} className="nav-item-hover"><Table size={14} /></button>
                    </div>
                    
                    <textarea
                      ref={textareaRef}
                      value={activeNote.content}
                      onChange={(e) => handleNoteContentChange(e.target.value)}
                      placeholder="Start typing markdown here..."
                      style={{
                        flexGrow: 1,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        padding: '24px',
                        outline: 'none',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.9rem',
                        lineHeight: '1.6',
                        resize: 'none',
                        width: '100%',
                        overflowY: 'auto'
                      }}
                    />
                  </div>
                )}

                {/* Preview Pane */}
                {(noteMode === 'preview' || noteMode === 'split') && (
                  <div
                    className="markdown-body custom-scrollbar"
                    style={{
                      flex: 1,
                      padding: '32px 40px',
                      overflowY: 'auto',
                      background: 'var(--bg-primary)'
                    }}
                    dangerouslySetInnerHTML={{ __html: marked(activeNote.content || '') }}
                  />
                )}

              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                <FileText size={32} style={{ opacity: 0.5 }} />
              </div>
              <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', marginBottom: '8px' }}>No Note Selected</h3>
              <p style={{ fontSize: '0.9rem', maxWidth: '300px', textAlign: 'center', lineHeight: '1.5' }}>
                Select a note from the sidebar or create a new one to start writing.
              </p>
            </div>
          )}
        </div>

      </div>
      
      {/* CSS For Hover Actions */}
      <style>{`
        .nav-item-hover:hover .hover-actions { opacity: 1 !important; }
        .hover-actions { opacity: 0; transition: opacity 0.2s; }
      `}</style>
    </div>
  );
};

export default Notebook;
