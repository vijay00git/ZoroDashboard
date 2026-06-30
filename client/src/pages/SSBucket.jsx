import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Trash2, Copy, Edit2, Check, X,
  Clipboard, ZoomIn, Search, Download,
  ImageOff, Plus, Move, Loader, MessageSquare,
  ChevronLeft, ChevronRight, FolderPlus, GripVertical,
} from 'lucide-react';
import { showConfirm, showPrompt } from '../utils/Alerts';

const API = 'http://localhost:3000';
const GROUP_COLORS = ['#e8a825', '#e8538a', '#5bc4f5', '#2de886', '#f07830', '#a78bfa', '#f05050', '#34d399'];

const makeId = (prefix = 'id') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const imgUrl  = (filename) => `${API}/api/screenshots/img/${encodeURIComponent(filename)}`;

// ─── Main page ────────────────────────────────────────────────────────────────
const SSBucket = () => {
  const [groups,     setGroups]     = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lightbox,   setLightbox]   = useState(null);
  const [copiedId,   setCopiedId]   = useState(null);
  const [renamingId,      setRenamingId]      = useState(null);
  const [renameVal,        setRenameVal]        = useState('');
  const [renamingGroupId,  setRenamingGroupId]  = useState(null);
  const [renameGroupVal,   setRenameGroupVal]   = useState('');
  const [hoveredGroupId,   setHoveredGroupId]   = useState(null);
  const [colorPickerId,    setColorPickerId]    = useState(null);
  const [isPasting,  setIsPasting]  = useState(false);
  const [isLoading,  setIsLoading]  = useState(true);
  const [isSaving,   setIsSaving]   = useState(false);
  // folder reorder drag
  const [dragGrpId,  setDragGrpId]  = useState(null);
  const [dropBefore, setDropBefore] = useState(null);
  // screenshot drag
  const [dragSsId,    setDragSsId]    = useState(null);
  const [dragFromGrp, setDragFromGrp] = useState(null);
  const [dropOnGrpId, setDropOnGrpId] = useState(null);
  const ssRenameRef  = useRef(null);
  const grpRenameRef = useRef(null);
  const saveTimer    = useRef(null);

  // ── Load metadata from server on mount ──
  useEffect(() => {
    setIsLoading(true);
    fetch(`${API}/api/screenshots/meta`)
      .then(r => r.json())
      .then(data => {
        const raw = Array.isArray(data.groups) ? data.groups : [];
        // Sanitize: parentId must be a string group-id or null — never an event object
        const loaded = raw.map(g => ({
          ...g,
          parentId: typeof g.parentId === 'string' ? g.parentId : null,
        }));
        // Set flag BEFORE setGroups so the saveMeta effect can fire on next render
        hasLoadedRef.current = true;
        setGroups(loaded);
        setSelectedId(loaded[0]?.id ?? null);
      })
      .catch(() => setGroups([]))
      .finally(() => setIsLoading(false));
  }, []);

  // ── Debounced metadata save ──
  const saveMeta = useCallback((nextGroups) => {
    clearTimeout(saveTimer.current);
    setIsSaving(true);
    saveTimer.current = setTimeout(() => {
      fetch(`${API}/api/screenshots/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: nextGroups }),
      })
        .catch(() => {})
        .finally(() => setIsSaving(false));
    }, 600);
  }, []);

  // Sync groups → server only after the initial fetch has completed.
  // isFirstRender breaks under React StrictMode (double-invoke) — use a
  // hasLoaded ref that is only set to true inside the fetch .then() callback.
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    saveMeta(groups);
  }, [groups, saveMeta]);

  // Focus rename inputs
  useEffect(() => { if (renamingId      && ssRenameRef.current)  ssRenameRef.current.focus();  }, [renamingId]);
  useEffect(() => { if (renamingGroupId && grpRenameRef.current) grpRenameRef.current.focus(); }, [renamingGroupId]);

  // ── Global paste listener ──
  const handlePaste = useCallback(async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) return;
      setIsPasting(true);

      try {
        const objectUrl = URL.createObjectURL(file);
        const { w, h } = await new Promise((resolve) => {
          const img = new window.Image();
          img.onload  = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(objectUrl); };
          img.onerror = () => { resolve({ w: 0, h: 0 }); URL.revokeObjectURL(objectUrl); };
          img.src = objectUrl;
        });

        const id = makeId('ss');
        const formData = new FormData();
        formData.append('image', file);
        formData.append('id', id);

        const res  = await fetch(`${API}/api/screenshots/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');

        const shot = {
          id,
          name: `Screenshot ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
          filename: data.filename,
          timestamp: Date.now(),
          w,
          h,
          sizeKb: Math.round(file.size / 1024),
          note: '',
        };

        setGroups(prev => {
          const targetId = selectedId ?? prev[0]?.id;
          if (!targetId) {
            const first = { id: makeId('grp'), name: 'General', color: '#e8a825', screenshots: [shot] };
            setSelectedId(first.id);
            return [first];
          }
          return prev.map(g => g.id === targetId ? { ...g, screenshots: [shot, ...g.screenshots] } : g);
        });
      } catch { /* upload failed silently */ } finally {
        setIsPasting(false);
      }
      break;
    }
  }, [selectedId]);

  useEffect(() => {
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  // ── Group actions ──
  const addGroup = async (parentId = null) => {
    const name = await showPrompt('Group name:', parentId ? 'New Sub-folder' : 'New Group');
    if (!name?.trim()) return;
    const id    = makeId('grp');
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length];
    setGroups(prev => [...prev, { id, name: name.trim(), color, parentId: parentId ?? null, screenshots: [] }]);
    setSelectedId(id);
  };

  const deleteGroup = async (gId) => {
    const group = groups.find(g => g.id === gId);
    if (!group) return;
    const children = groups.filter(g => g.parentId === gId);
    const allCount = group.screenshots.length + children.reduce((s, c) => s + c.screenshots.length, 0);
    const msg = allCount > 0
      ? `Delete "${group.name}" (${allCount} screenshot(s) including sub-folders)?`
      : `Delete "${group.name}"?`;
    if (!await showConfirm(msg)) return;
    [group, ...children].forEach(g =>
      g.screenshots.forEach(s =>
        fetch(`${API}/api/screenshots/img/${encodeURIComponent(s.filename)}`, { method: 'DELETE' }).catch(() => {})
      )
    );
    setGroups(prev => {
      const ids = new Set([gId, ...children.map(c => c.id)]);
      const next = prev.filter(g => !ids.has(g.id));
      if (ids.has(selectedId)) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  };

  const startRenameGroup = (g) => { setRenamingGroupId(g.id); setRenameGroupVal(g.name); };
  const commitRenameGroup = () => {
    if (renameGroupVal.trim())
      setGroups(prev => prev.map(g => g.id === renamingGroupId ? { ...g, name: renameGroupVal.trim() } : g));
    setRenamingGroupId(null);
  };

  const setGroupColor = (gId, color) => {
    setGroups(prev => prev.map(g => g.id === gId ? { ...g, color } : g));
    setColorPickerId(null);
  };

  // ── Screenshot actions ──
  const effectiveSelectedId = groups.find(g => g.id === selectedId)?.id ?? groups[0]?.id ?? null;

  const deleteScreenshot = async (ssId, filename) => {
    if (!await showConfirm('Delete this screenshot?')) return;
    fetch(`${API}/api/screenshots/img/${encodeURIComponent(filename)}`, { method: 'DELETE' }).catch(() => {});
    setGroups(prev => prev.map(g =>
      g.id === effectiveSelectedId ? { ...g, screenshots: g.screenshots.filter(s => s.id !== ssId) } : g
    ));
  };

  const startRename = (ss) => { setRenamingId(ss.id); setRenameVal(ss.name); };
  const commitRename = () => {
    if (renameVal.trim())
      setGroups(prev => prev.map(g => ({
        ...g,
        screenshots: g.screenshots.map(s => s.id === renamingId ? { ...s, name: renameVal.trim() } : s),
      })));
    setRenamingId(null);
  };

  const copyToClipboard = async (ss) => {
    try {
      const res  = await fetch(imgUrl(ss.filename));
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      setCopiedId(ss.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* unsupported in some browsers */ }
  };

  const downloadScreenshot = (ss) => {
    const a = document.createElement('a');
    a.href = imgUrl(ss.filename);
    a.download = `${ss.name.replace(/[^a-z0-9_-]/gi, '_')}.png`;
    a.click();
  };

  const moveToGroup = (ssId, toGroupId, fromGroupId = null) => {
    const srcId = fromGroupId ?? effectiveSelectedId;
    let shot;
    setGroups(prev => {
      const next = prev.map(g => {
        if (g.id === srcId) {
          shot = g.screenshots.find(s => s.id === ssId);
          return { ...g, screenshots: g.screenshots.filter(s => s.id !== ssId) };
        }
        return g;
      });
      return next.map(g => g.id === toGroupId && shot ? { ...g, screenshots: [shot, ...g.screenshots] } : g);
    });
  };

  const copyToGroup = (ssId, fromGroupId, toGroupId) => {
    const shot = groups.find(g => g.id === fromGroupId)?.screenshots.find(s => s.id === ssId);
    if (!shot) return;
    const newShot = { ...shot, id: makeId('ss') };
    setGroups(prev => prev.map(g => g.id === toGroupId ? { ...g, screenshots: [newShot, ...g.screenshots] } : g));
  };

  // ── Folder drag-reorder handlers ──
  const handleGrpDragStart = (e, gId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('ssb-drag-type', 'group');
    e.dataTransfer.setData('ssb-grp-id', gId);
    setDragGrpId(gId);
  };

  const handleGrpDragEnd = () => {
    setDragGrpId(null);
    setDropBefore(null);
  };

  const handleGrpReorderDrop = (e, beforeId) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('ssb-grp-id');
    if (!id || id === beforeId) { setDragGrpId(null); setDropBefore(null); return; }
    const dragged = groups.find(g => g.id === id);
    const target  = beforeId ? groups.find(g => g.id === beforeId) : null;
    // only reorder within same level
    if (dragged && target && (dragged.parentId ?? null) !== (target.parentId ?? null)) {
      setDragGrpId(null); setDropBefore(null); return;
    }
    setGroups(prev => {
      const without = prev.filter(g => g.id !== id);
      if (!beforeId) return [...without, dragged];
      const idx = without.findIndex(g => g.id === beforeId);
      if (idx === -1) return [...without, dragged];
      return [...without.slice(0, idx), dragged, ...without.slice(idx)];
    });
    setDragGrpId(null);
    setDropBefore(null);
  };

  const updateNote = (ssId, note) => {
    setGroups(prev => prev.map(g => ({
      ...g,
      screenshots: g.screenshots.map(s => s.id === ssId ? { ...s, note } : s),
    })));
  };

  const selectedGroup = groups.find(g => g.id === effectiveSelectedId);
  const filtered = (selectedGroup?.screenshots ?? []).filter(ss =>
    !searchTerm || ss.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalShots = groups.reduce((s, g) => s + g.screenshots.length, 0);

  const lightboxIdx = lightbox ? filtered.findIndex(s => s.id === lightbox.id) : -1;

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') {
        const idx = filtered.findIndex(s => s.id === lightbox.id);
        if (idx < filtered.length - 1) setLightbox(filtered[idx + 1]);
      } else if (e.key === 'ArrowLeft') {
        const idx = filtered.findIndex(s => s.id === lightbox.id);
        if (idx > 0) setLightbox(filtered[idx - 1]);
      } else if (e.key === 'Escape') {
        setLightbox(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, filtered]);

  // ── Render ──
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '16px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '50%', border: '3px solid rgba(192,132,252,0.2)', borderTopColor: '#c084fc', animation: 'spin 0.9s linear infinite' }} />
        <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontWeight: 500 }}>Loading screenshots…</span>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes ssbPulse    { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes ssbSlideUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ssbFadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes ssbNoteGlow { 0%,100%{box-shadow:0 0 0 0 rgba(192,132,252,0.4)} 50%{box-shadow:0 0 0 4px rgba(192,132,252,0)} }
        .ssb-grp-item:hover .ssb-grp-actions { opacity: 1 !important; }
        .ssb-card:hover .ssb-card-actions    { opacity: 1 !important; transform: translateY(0) !important; }
        .ssb-card:hover .ssb-card-img        { transform: scale(1.03); }
        .ssb-card-actions { transform: translateY(4px); transition: opacity 0.18s ease, transform 0.18s ease; }
        .ssb-note-pill:hover { background: rgba(192,132,252,0.32) !important; border-color: rgba(192,132,252,0.75) !important; }
        .ssb-add-note:hover  { border-color: #c084fc !important; color: #c084fc !important; background: rgba(192,132,252,0.1) !important; }
        .ssb-grp-item-active { background: var(--bg-tertiary) !important; border-color: var(--border-hover) !important; }
        .ssb-action-btn:hover { background: rgba(192,132,252,0.12) !important; border-color: rgba(192,132,252,0.35) !important; color: #c084fc !important; }
        .ssb-del-btn:hover    { background: rgba(240,80,80,0.16) !important; border-color: rgba(240,80,80,0.5) !important; color: #f05050 !important; }
        .ssb-search-input:focus { border-color: rgba(192,132,252,0.6) !important; box-shadow: 0 0 0 2px rgba(192,132,252,0.12) !important; }
        .ssb-grp-item[draggable]:active { cursor: grabbing; }
        .ssb-drop-active { background: rgba(91,196,245,0.12) !important; border-color: #5bc4f5 !important; box-shadow: 0 0 0 1px rgba(91,196,245,0.3) !important; }
      `}</style>

      <div style={{ display: 'flex', gap: '16px', height: 'calc(100vh - var(--header-h) - 48px)', minHeight: 0 }}>

        {/* ── Groups sidebar ── */}
        <div style={{ width: '214px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', paddingLeft: '4px' }}>
            Groups
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {(() => {
              // build flat display tree: roots then their children
              const roots = groups.filter(g => typeof g.parentId !== 'string' || !g.parentId);
              const tree = [];
              roots.forEach(root => {
                tree.push({ g: root, depth: 0 });
                groups.filter(c => c.parentId === root.id)
                  .forEach(child => tree.push({ g: child, depth: 1 }));
              });
              return tree.map(({ g, depth }, treeIdx) => {
                const isActive   = effectiveSelectedId === g.id;
                const isSsDrop   = dropOnGrpId === g.id && dragSsId;
                const dotSize    = depth === 1 ? '9px' : '12px';
                const itemContent = (
                  <div
                    key={g.id}
                    className={`ssb-grp-item${isSsDrop ? ' ssb-drop-active' : ''}`}
                    draggable={true}
                    onClick={() => { if (renamingGroupId !== g.id) setSelectedId(g.id); }}
                    onMouseEnter={() => setHoveredGroupId(g.id)}
                    onMouseLeave={() => setHoveredGroupId(null)}
                    onDragStart={e => handleGrpDragStart(e, g.id)}
                    onDragEnd={handleGrpDragEnd}
                    onDragOver={e => {
                      // screenshot drop target
                      if (e.dataTransfer.types.includes('ssb-drag-type')) {
                        e.preventDefault();
                        setDropOnGrpId(g.id);
                      }
                    }}
                    onDragLeave={() => setDropOnGrpId(null)}
                    onDrop={e => {
                      e.preventDefault();
                      const type = e.dataTransfer.getData('ssb-drag-type');
                      if (type === 'screenshot' && dragSsId && dragFromGrp && g.id !== dragFromGrp) {
                        if (e.ctrlKey || e.metaKey) {
                          copyToGroup(dragSsId, dragFromGrp, g.id);
                        } else {
                          moveToGroup(dragSsId, g.id, dragFromGrp);
                        }
                      }
                      setDropOnGrpId(null);
                      setDragSsId(null);
                      setDragFromGrp(null);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: `7px 8px 7px ${depth === 1 ? '6px' : '5px'}`,
                      borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      background: isSsDrop ? 'rgba(91,196,245,0.12)' : isActive ? 'var(--bg-tertiary)' : 'transparent',
                      border: `1px solid ${isSsDrop ? '#5bc4f5' : isActive ? 'var(--border-hover)' : 'transparent'}`,
                      borderLeft: `3px solid ${isSsDrop ? '#5bc4f5' : isActive ? g.color : 'transparent'}`,
                      boxShadow: isSsDrop ? '0 0 0 1px rgba(91,196,245,0.3)' : isActive ? `inset 0 0 20px ${g.color}10` : 'none',
                      transition: 'all 0.15s ease',
                      position: 'relative', userSelect: 'none',
                      opacity: dragGrpId === g.id ? 0.4 : 1,
                    }}
                  >
                    {/* Drag handle */}
                    <GripVertical size={11} style={{ color: 'var(--text-muted)', cursor: 'grab', flexShrink: 0, opacity: hoveredGroupId === g.id ? 0.65 : 0, transition: 'opacity 0.15s' }} />

                    {/* Color dot */}
                    <div
                      onClick={e => { e.stopPropagation(); setColorPickerId(colorPickerId === g.id ? null : g.id); }}
                      title="Change color"
                      style={{ width: dotSize, height: dotSize, borderRadius: '50%', background: g.color, flexShrink: 0, cursor: 'pointer', boxShadow: `0 0 6px ${g.color}80` }}
                    />

                    {/* Color picker portal */}
                    {colorPickerId === g.id && createPortal(
                      <div onClick={() => setColorPickerId(null)} style={{ position: 'fixed', inset: 0, zIndex: 9000 }}>
                        <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', left: '230px', top: '50%', transform: 'translateY(-50%)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '10px', boxShadow: 'var(--card-shadow)', zIndex: 9001, display: 'flex', gap: '6px', flexWrap: 'wrap', width: '132px' }}>
                          {GROUP_COLORS.map(c => (
                            <div key={c} onClick={() => setGroupColor(g.id, c)} style={{ width: '24px', height: '24px', borderRadius: '50%', background: c, cursor: 'pointer', border: g.color === c ? '2px solid white' : '2px solid transparent', transition: 'transform var(--transition-fast)' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'} />
                          ))}
                        </div>
                      </div>,
                      document.body
                    )}

                    {/* Name */}
                    {renamingGroupId === g.id ? (
                      <input ref={grpRenameRef} value={renameGroupVal} onChange={e => setRenameGroupVal(e.target.value)} onBlur={commitRenameGroup} onKeyDown={e => { if (e.key === 'Enter') commitRenameGroup(); if (e.key === 'Escape') setRenamingGroupId(null); }} onClick={e => e.stopPropagation()} style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px solid var(--accent-purple)', outline: 'none', color: 'var(--text-primary)', fontSize: '0.82rem', fontFamily: 'var(--font-sans)', padding: '1px 0' }} />
                    ) : (
                      <span style={{ flex: 1, fontSize: depth === 1 ? '0.79rem' : '0.83rem', fontWeight: isActive ? 700 : 400, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.name}
                      </span>
                    )}

                    {/* Count badge */}
                    {hoveredGroupId !== g.id && (
                      <span style={{ fontSize: '0.65rem', color: g.color, background: `${g.color}18`, border: `1px solid ${g.color}40`, borderRadius: '10px', padding: '1px 5px', flexShrink: 0, fontWeight: 600 }}>
                        {g.screenshots.length}
                      </span>
                    )}

                    {/* Hover actions */}
                    <div className="ssb-grp-actions" onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '2px', opacity: 0, transition: 'opacity var(--transition-fast)', flexShrink: 0 }}>
                      {depth === 0 && (
                        <button onClick={() => addGroup(g.id)} title="Add sub-folder" style={iconBtnStyle}><FolderPlus size={10} /></button>
                      )}
                      <button onClick={() => startRenameGroup(g)} title="Rename" style={iconBtnStyle}><Edit2 size={10} /></button>
                      <button onClick={() => deleteGroup(g.id)} title="Delete" style={{ ...iconBtnStyle, color: 'var(--accent-red)' }}><Trash2 size={10} /></button>
                    </div>
                  </div>
                );

                return (
                  <React.Fragment key={g.id}>
                    {/* Drop indicator before this item */}
                    <div
                      onDragOver={e => { if (dragGrpId && dragGrpId !== g.id) { e.preventDefault(); setDropBefore(g.id); } }}
                      onDrop={e => handleGrpReorderDrop(e, g.id)}
                      style={{ height: '3px', borderRadius: '2px', margin: '1px 4px', background: dropBefore === g.id && dragGrpId ? 'linear-gradient(90deg, #c084fc, #a855f7)' : 'transparent', transition: 'background 0.12s', boxShadow: dropBefore === g.id && dragGrpId ? '0 0 6px rgba(192,132,252,0.6)' : 'none' }}
                    />
                    {depth === 1 ? (
                      <div style={{ paddingLeft: '14px', borderLeft: '1px solid rgba(255,255,255,0.07)', marginLeft: '8px' }}>
                        {itemContent}
                      </div>
                    ) : itemContent}
                  </React.Fragment>
                );
              });
            })()}
            {/* Drop zone at end of list */}
            <div
              onDragOver={e => { if (dragGrpId) { e.preventDefault(); setDropBefore('__end__'); } }}
              onDrop={e => handleGrpReorderDrop(e, null)}
              style={{ height: '3px', borderRadius: '2px', margin: '1px 4px', background: dropBefore === '__end__' && dragGrpId ? 'linear-gradient(90deg, #c084fc, #a855f7)' : 'transparent', transition: 'background 0.12s' }}
            />
          </div>
          {/* Drag hint */}
          {dragSsId && (
            <div style={{ padding: '8px 10px', background: 'rgba(91,196,245,0.1)', border: '1px solid rgba(91,196,245,0.35)', borderRadius: '8px', fontSize: '0.68rem', color: '#5bc4f5', textAlign: 'center', marginBottom: '4px', animation: 'ssbFadeIn 0.15s ease' }}>
              Drop on a group to <strong>move</strong><br/>
              <span style={{ opacity: 0.7 }}>Hold Ctrl to copy instead</span>
            </div>
          )}

          {/* Add group */}
          <button
            onClick={() => addGroup()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', background: 'transparent', border: '1px dashed rgba(192,132,252,0.3)', borderRadius: 'var(--radius-md)', color: 'rgba(192,132,252,0.6)', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'var(--font-sans)', width: '100%', transition: 'all var(--transition-fast)', marginTop: '4px' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#c084fc'; e.currentTarget.style.color = '#c084fc'; e.currentTarget.style.background = 'rgba(192,132,252,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(192,132,252,0.3)'; e.currentTarget.style.color = 'rgba(192,132,252,0.6)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <Plus size={13} /> New Group
          </button>

          {/* Stats footer */}
          <div style={{ paddingTop: '10px', borderTop: '1px solid var(--border-color)', marginTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)' }}>
                {totalShots} screenshot{totalShots !== 1 ? 's' : ''}
              </span>
              {isSaving && (
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '9px', height: '9px', borderRadius: '50%', border: '1.5px solid rgba(232,168,37,0.3)', borderTopColor: '#e8a825', animation: 'spin 0.9s linear infinite' }} /> saving
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '3px' }}>
              Stored in <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px', color: '#5bc4f5' }}>data/screenshots/</code>
            </div>
          </div>
        </div>

        {/* ── Main panel ── */}
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 18px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
            {selectedGroup && (
              <>
                <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: selectedGroup.color, flexShrink: 0, boxShadow: `0 0 10px ${selectedGroup.color}80` }} />
                <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{selectedGroup.name}</span>
                <span style={{ fontSize: '0.72rem', color: selectedGroup.color, background: `${selectedGroup.color}18`, border: `1px solid ${selectedGroup.color}40`, borderRadius: '10px', padding: '2px 8px', fontWeight: 600 }}>
                  {selectedGroup.screenshots.length} shot{selectedGroup.screenshots.length !== 1 ? 's' : ''}
                </span>
              </>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {filtered.length > 0 && (
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{filtered.length} shown</span>
              )}
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  className="ssb-search-input"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search…"
                  style={{ paddingLeft: '28px', paddingRight: '10px', paddingTop: '6px', paddingBottom: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.78rem', outline: 'none', width: '180px', fontFamily: 'var(--font-sans)', transition: 'border-color 0.18s, box-shadow 0.18s' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 11px', background: 'rgba(91,196,245,0.1)', border: '1px solid rgba(91,196,245,0.35)', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', color: '#5bc4f5', fontWeight: 600 }}>
                <Clipboard size={11} /> Ctrl+V to paste
              </div>
            </div>
          </div>

          {/* Paste indicator */}
          {isPasting && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', background: 'rgba(232,168,37,0.1)', borderBottom: '1px solid rgba(232,168,37,0.3)', flexShrink: 0 }}>
              <div style={{ width: '16px', height: '16px', border: '2px solid #e8a825', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: '0.84rem', color: '#fbbf24', fontWeight: 600 }}>Uploading screenshot…</span>
              <div style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'rgba(232,168,37,0.6)' }}>Please wait</div>
            </div>
          )}

          {/* Grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
            {filtered.length === 0 ? (
              <EmptyState hasSearch={!!searchTerm} hasGroups={groups.length > 0} />
            ) : (
              <div style={{ columns: '220px', columnGap: '14px' }}>
                {filtered.map(ss => (
                  <ScreenshotCard
                    key={ss.id}
                    ss={ss}
                    groups={groups}
                    selectedGroupId={effectiveSelectedId}
                    groupColor={selectedGroup?.color ?? '#a78bfa'}
                    isCopied={copiedId === ss.id}
                    isRenaming={renamingId === ss.id}
                    renameVal={renameVal}
                    renameRef={ssRenameRef}
                    onRenameStart={() => startRename(ss)}
                    onRenameChange={e => setRenameVal(e.target.value)}
                    onRenameCommit={commitRename}
                    onRenameCancel={() => setRenamingId(null)}
                    onCopy={() => copyToClipboard(ss)}
                    onDelete={() => deleteScreenshot(ss.id, ss.filename)}
                    onLightbox={() => setLightbox(ss)}
                    onDownload={() => downloadScreenshot(ss)}
                    onMove={toId => moveToGroup(ss.id, toId)}
                    onNoteCommit={note => updateNote(ss.id, note)}
                    isDragging={dragSsId === ss.id}
                    onDragStart={() => { setDragSsId(ss.id); setDragFromGrp(effectiveSelectedId); }}
                    onDragEnd={() => { setDragSsId(null); setDragFromGrp(null); setDropOnGrpId(null); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Lightbox ── */}
      {lightbox && createPortal(
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 99998, padding: '24px', animation: 'ssbFadeIn 0.2s ease' }}
        >
          {/* Top action bar */}
          <div style={{ position: 'absolute', top: '0', left: '0', right: '0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'white', letterSpacing: '0.3px' }}>{lightbox.name}</span>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                {lightbox.w ?? '?'}×{lightbox.h ?? '?'} · {lightbox.sizeKb ?? '?'} KB
                {filtered.length > 1 && (
                  <span style={{ marginLeft: '10px', color: 'rgba(192,132,252,0.8)', fontWeight: 600 }}>
                    {lightboxIdx + 1} / {filtered.length}
                  </span>
                )}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={e => { e.stopPropagation(); copyToClipboard(lightbox); }} style={lbBtnStyle}>
                {copiedId === lightbox.id ? <><Check size={14} color="#2de886" /> Copied</> : <><Copy size={14} /> Copy</>}
              </button>
              <button onClick={e => { e.stopPropagation(); downloadScreenshot(lightbox); }} style={lbBtnStyle}>
                <Download size={14} /> Save
              </button>
              <button onClick={() => setLightbox(null)} style={{ ...lbBtnStyle, padding: '8px 10px' }}><X size={16} /></button>
            </div>
          </div>

          {/* Left nav arrow */}
          {filtered.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); if (lightboxIdx > 0) setLightbox(filtered[lightboxIdx - 1]); }}
              style={{
                position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)',
                width: '48px', height: '48px', borderRadius: '50%',
                background: lightboxIdx === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: lightboxIdx === 0 ? 'rgba(255,255,255,0.2)' : 'white',
                cursor: lightboxIdx === 0 ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(8px)', transition: 'all 0.18s ease',
                zIndex: 2,
              }}
              onMouseEnter={e => { if (lightboxIdx > 0) e.currentTarget.style.background = 'rgba(192,132,252,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = lightboxIdx === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)'; }}
              title="Previous (←)"
            >
              <ChevronLeft size={22} />
            </button>
          )}

          {/* Right nav arrow */}
          {filtered.length > 1 && (
            <button
              onClick={e => { e.stopPropagation(); if (lightboxIdx < filtered.length - 1) setLightbox(filtered[lightboxIdx + 1]); }}
              style={{
                position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)',
                width: '48px', height: '48px', borderRadius: '50%',
                background: lightboxIdx === filtered.length - 1 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: lightboxIdx === filtered.length - 1 ? 'rgba(255,255,255,0.2)' : 'white',
                cursor: lightboxIdx === filtered.length - 1 ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backdropFilter: 'blur(8px)', transition: 'all 0.18s ease',
                zIndex: 2,
              }}
              onMouseEnter={e => { if (lightboxIdx < filtered.length - 1) e.currentTarget.style.background = 'rgba(192,132,252,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = lightboxIdx === filtered.length - 1 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)'; }}
              title="Next (→)"
            >
              <ChevronRight size={22} />
            </button>
          )}

          {/* Image */}
          <img
            key={lightbox.id}
            src={imgUrl(lightbox.filename)}
            alt={lightbox.name}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '80vw', maxHeight: '75vh', objectFit: 'contain', borderRadius: '10px', boxShadow: '0 30px 80px rgba(0,0,0,0.7)', animation: 'ssbSlideUp 0.18s ease-out' }}
          />

          {/* Note */}
          {lightbox.note && (
            <div
              onClick={e => e.stopPropagation()}
              style={{ marginTop: '18px', maxWidth: '68ch', background: 'rgba(192,132,252,0.18)', border: '1px solid rgba(192,132,252,0.5)', borderRadius: '10px', padding: '12px 18px', display: 'flex', alignItems: 'flex-start', gap: '10px', animation: 'ssbSlideUp 0.3s ease-out' }}
            >
              <MessageSquare size={14} style={{ color: '#c084fc', flexShrink: 0, marginTop: '2px' }} />
              <span style={{ fontSize: '0.82rem', color: '#e9d5ff', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontWeight: 500 }}>
                {lightbox.note}
              </span>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
};

// ─── Screenshot card ──────────────────────────────────────────────────────────
const ScreenshotCard = ({
  ss, groups, selectedGroupId, groupColor, isCopied,
  isRenaming, renameVal, renameRef,
  onRenameStart, onRenameChange, onRenameCommit, onRenameCancel,
  onCopy, onDelete, onLightbox, onDownload, onMove, onNoteCommit,
  isDragging, onDragStart, onDragEnd,
}) => {
  const [hovered,       setHovered]       = useState(false);
  const [moveOpen,      setMoveOpen]      = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [localNote,     setLocalNote]     = useState(ss.note || '');
  const otherGroups = groups.filter(g => g.id !== selectedGroupId);

  const commitNote = () => {
    setIsEditingNote(false);
    onNoteCommit(localNote);
  };

  const tsLabel = ss.timestamp
    ? new Date(ss.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div
      className="ssb-card"
      draggable={true}
      onDragStart={e => { e.dataTransfer.setData('ssb-drag-type', 'screenshot'); onDragStart?.(); }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMoveOpen(false); }}
      style={{
        breakInside: 'avoid', marginBottom: '14px',
        borderRadius: '12px',
        border: `1px solid ${hovered ? 'rgba(192,132,252,0.35)' : 'var(--border-color)'}`,
        background: 'var(--bg-tertiary)', overflow: 'visible',
        transition: 'all 0.22s ease',
        boxShadow: hovered ? '0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(192,132,252,0.1)' : 'none',
        animation: 'ssbSlideUp 0.25s ease-out',
        position: 'relative',
        opacity: isDragging ? 0.4 : 1,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      {/* Colored top accent bar */}
      <div style={{ height: '3px', background: `linear-gradient(90deg, ${groupColor}, ${groupColor}66)`, borderRadius: '12px 12px 0 0' }} />

      {/* Thumbnail */}
      <div onClick={onLightbox} style={{ position: 'relative', overflow: 'hidden', borderRadius: '0', background: 'var(--bg-primary)', cursor: 'zoom-in' }}>
        <img
          className="ssb-card-img"
          src={imgUrl(ss.filename)}
          alt={ss.name}
          loading="lazy"
          style={{ width: '100%', display: 'block', maxHeight: '240px', objectFit: 'cover', objectPosition: 'top left', transition: 'transform 0.25s ease' }}
        />
        {hovered && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0,0,0,0.5) 0%, rgba(91,196,245,0.15) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.25)' }}>
              <ZoomIn size={22} color="white" />
            </div>
          </div>
        )}
        {ss.w > 0 && ss.h > 0 && (
          <div style={{ position: 'absolute', top: '6px', left: '6px', background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.85)', fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-mono)', backdropFilter: 'blur(4px)' }}>
            {ss.w}×{ss.h}
          </div>
        )}
        {ss.sizeKb > 0 && (
          <div style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.75)', fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', fontFamily: 'var(--font-mono)', backdropFilter: 'blur(4px)' }}>
            {ss.sizeKb} KB
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 12px 12px', borderTop: '1px solid var(--border-color)' }}>
        {isRenaming ? (
          <input
            ref={renameRef}
            value={renameVal}
            onChange={onRenameChange}
            onBlur={onRenameCommit}
            onKeyDown={e => { if (e.key === 'Enter') onRenameCommit(); if (e.key === 'Escape') onRenameCancel(); }}
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid #c084fc', outline: 'none', color: 'var(--text-primary)', fontSize: '0.82rem', fontFamily: 'var(--font-sans)', padding: '2px 0', marginBottom: '2px' }}
          />
        ) : (
          <div
            onDoubleClick={onRenameStart}
            title="Double-click to rename"
            style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
          >
            {ss.name}
          </div>
        )}

        {tsLabel && (
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '8px', marginTop: '2px' }}>
            {tsLabel}
          </div>
        )}

        {/* Note */}
        {isEditingNote ? (
          <textarea
            autoFocus
            value={localNote}
            onChange={e => setLocalNote(e.target.value)}
            onBlur={commitNote}
            onKeyDown={e => {
              if (e.key === 'Escape') { setLocalNote(ss.note || ''); setIsEditingNote(false); }
              if (e.key === 'Enter' && e.ctrlKey) commitNote();
            }}
            onClick={e => e.stopPropagation()}
            placeholder="Add a note… (Ctrl+Enter to save)"
            style={{
              width: '100%', boxSizing: 'border-box', display: 'block',
              minHeight: '72px', resize: 'vertical',
              background: 'rgba(192,132,252,0.08)',
              border: '1px solid #c084fc',
              borderRadius: '8px',
              color: '#f3e8ff',
              fontSize: '0.74rem', lineHeight: '1.55',
              padding: '8px 10px', marginBottom: '8px',
              outline: 'none',
              fontFamily: 'var(--font-sans)',
              boxShadow: '0 0 0 3px rgba(192,132,252,0.2), 0 0 16px rgba(192,132,252,0.1)',
            }}
          />
        ) : ss.note ? (
          <div
            className="ssb-note-pill"
            onClick={e => { e.stopPropagation(); setLocalNote(ss.note); setIsEditingNote(true); }}
            title="Click to edit note"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '6px',
              marginBottom: '8px', padding: '7px 9px',
              background: 'rgba(192,132,252,0.18)',
              border: '1px solid rgba(192,132,252,0.45)',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              animation: 'ssbNoteGlow 2.5s ease-in-out 1',
            }}
          >
            <MessageSquare size={12} style={{ color: '#c084fc', flexShrink: 0, marginTop: '1px' }} />
            <span style={{
              fontSize: '0.72rem', color: '#d8b4fe', lineHeight: '1.5', fontWeight: 500,
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              wordBreak: 'break-word',
            }}>
              {ss.note}
            </span>
          </div>
        ) : hovered ? (
          <button
            className="ssb-add-note"
            onClick={e => { e.stopPropagation(); setLocalNote(''); setIsEditingNote(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              marginBottom: '8px', padding: '4px 9px',
              background: 'transparent', border: '1px dashed rgba(192,132,252,0.4)',
              borderRadius: '7px', cursor: 'pointer',
              color: 'rgba(192,132,252,0.7)', fontSize: '0.7rem',
              fontFamily: 'var(--font-sans)', fontWeight: 500,
              transition: 'all 0.18s ease',
            }}
          >
            <MessageSquare size={10} /> Add note
          </button>
        ) : null}

        {/* Actions */}
        <div
          className="ssb-card-actions"
          style={{ display: 'flex', gap: '4px', opacity: hovered ? 1 : 0 }}
        >
          <button
            onClick={e => { e.stopPropagation(); onCopy(); }}
            title={isCopied ? 'Copied!' : 'Copy to clipboard'}
            style={{ flex: 1, padding: '6px 4px', background: isCopied ? 'rgba(45,232,134,0.12)' : 'var(--bg-secondary)', border: `1px solid ${isCopied ? 'rgba(45,232,134,0.4)' : 'var(--border-color)'}`, borderRadius: '7px', color: isCopied ? '#2de886' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '0.7rem', fontFamily: 'var(--font-sans)', transition: 'all 0.18s ease' }}
          >
            {isCopied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>

          <button className="ssb-action-btn" onClick={e => { e.stopPropagation(); onRenameStart(); }} title="Rename" style={cardActionBtn}><Edit2 size={12} /></button>
          <button className="ssb-action-btn" onClick={e => { e.stopPropagation(); onDownload(); }} title="Download" style={cardActionBtn}><Download size={12} /></button>

          {otherGroups.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button className="ssb-action-btn" onClick={e => { e.stopPropagation(); setMoveOpen(p => !p); }} title="Move to group" style={cardActionBtn}><Move size={12} /></button>
              {moveOpen && (
                <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', right: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', boxShadow: '0 12px 40px rgba(0,0,0,0.4)', zIndex: 200, minWidth: '154px', overflow: 'hidden', animation: 'ssbSlideUp 0.15s ease-out' }}>
                  <div style={{ padding: '6px 12px', fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)' }}>Move to</div>
                  {otherGroups.map(g => (
                    <button key={g.id} onClick={e => { e.stopPropagation(); onMove(g.id); setMoveOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'var(--font-sans)', textAlign: 'left', transition: 'background var(--transition-fast)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: g.color, flexShrink: 0, boxShadow: `0 0 5px ${g.color}80` }} />
                      {g.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            className="ssb-del-btn"
            onClick={e => { e.stopPropagation(); onDelete(); }}
            title="Delete"
            style={{ ...cardActionBtn, color: '#f05050', background: 'rgba(240,80,80,0.08)', borderColor: 'rgba(240,80,80,0.25)' }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Empty state ──────────────────────────────────────────────────────────────
const EmptyState = ({ hasSearch, hasGroups }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '320px', gap: '20px', color: 'var(--text-muted)' }}>
    <div style={{ width: '88px', height: '88px', borderRadius: '24px', background: 'linear-gradient(135deg, rgba(192,132,252,0.12), rgba(91,196,245,0.06))', border: '2px dashed rgba(192,132,252,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <ImageOff size={32} strokeWidth={1.2} style={{ color: 'rgba(192,132,252,0.6)' }} />
    </div>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
        {hasSearch ? 'No matches' : hasGroups ? 'No screenshots yet' : 'Create a group to get started'}
      </div>
      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        {hasSearch ? 'Try a different name' : hasGroups ? 'Paste a screenshot from your clipboard' : 'Click "New Group" on the left'}
      </div>
    </div>
    {!hasSearch && hasGroups && (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'rgba(91,196,245,0.1)', border: '1px dashed rgba(91,196,245,0.4)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: '#5bc4f5', fontWeight: 600, animation: 'ssbPulse 2.5s ease-in-out infinite' }}>
        <Clipboard size={14} />
        <span>Press <kbd style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '1px 7px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-primary)' }}>Ctrl+V</kbd> anywhere on this page</span>
      </div>
    )}
  </div>
);

// ─── Shared styles ────────────────────────────────────────────────────────────
const iconBtnStyle = {
  padding: '3px 5px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-xs)', color: 'var(--text-muted)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', transition: 'all 0.18s ease',
};
const cardActionBtn = {
  padding: '6px 8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
  borderRadius: '7px', color: 'var(--text-muted)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', transition: 'all 0.18s ease',
};
const lbBtnStyle = {
  padding: '8px 16px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: '10px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
  gap: '6px', fontSize: '0.8rem', fontFamily: 'var(--font-sans)', transition: 'all 0.18s ease',
};

export default SSBucket;
