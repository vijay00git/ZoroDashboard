import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Trash2, Copy, Edit2, Check, X,
  Clipboard, ZoomIn, Search, Download,
  ImageOff, Plus, Move, Loader,
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
  const ssRenameRef  = useRef(null);
  const grpRenameRef = useRef(null);
  const saveTimer    = useRef(null);

  // ── Load metadata from server on mount ──
  useEffect(() => {
    setIsLoading(true);
    fetch(`${API}/api/screenshots/meta`)
      .then(r => r.json())
      .then(data => {
        const loaded = Array.isArray(data.groups) ? data.groups : [];
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

  // Sync groups → server whenever they change (after initial load)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
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
        // Read dimensions from a temporary object URL
        const objectUrl = URL.createObjectURL(file);
        const { w, h } = await new Promise((resolve) => {
          const img = new window.Image();
          img.onload  = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(objectUrl); };
          img.onerror = () => { resolve({ w: 0, h: 0 }); URL.revokeObjectURL(objectUrl); };
          img.src = objectUrl;
        });

        // Upload image file to server
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
  const addGroup = async () => {
    const name = await showPrompt('Group name:', 'New Group');
    if (!name?.trim()) return;
    const id    = makeId('grp');
    const color = GROUP_COLORS[groups.length % GROUP_COLORS.length];
    setGroups(prev => [...prev, { id, name: name.trim(), color, screenshots: [] }]);
    setSelectedId(id);
  };

  const deleteGroup = async (gId) => {
    const group = groups.find(g => g.id === gId);
    if (!group) return;
    const msg = group.screenshots.length
      ? `Delete "${group.name}" and all ${group.screenshots.length} screenshot(s)?`
      : `Delete group "${group.name}"?`;
    if (!await showConfirm(msg)) return;

    // Delete all image files in this group
    group.screenshots.forEach(s => {
      fetch(`${API}/api/screenshots/img/${encodeURIComponent(s.filename)}`, { method: 'DELETE' }).catch(() => {});
    });

    setGroups(prev => {
      const next = prev.filter(g => g.id !== gId);
      if (selectedId === gId) setSelectedId(next[0]?.id ?? null);
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

  const moveToGroup = (ssId, toGroupId) => {
    let shot;
    setGroups(prev => {
      const next = prev.map(g => {
        if (g.id === effectiveSelectedId) {
          shot = g.screenshots.find(s => s.id === ssId);
          return { ...g, screenshots: g.screenshots.filter(s => s.id !== ssId) };
        }
        return g;
      });
      return next.map(g => g.id === toGroupId && shot ? { ...g, screenshots: [shot, ...g.screenshots] } : g);
    });
  };

  const selectedGroup = groups.find(g => g.id === effectiveSelectedId);
  const filtered = (selectedGroup?.screenshots ?? []).filter(ss =>
    !searchTerm || ss.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalShots = groups.reduce((s, g) => s + g.screenshots.length, 0);

  // ── Render ──
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: '12px', color: 'var(--text-muted)' }}>
        <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ fontSize: '0.9rem' }}>Loading screenshots…</span>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes ssbPulse    { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes ssbSlideUp  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .ssb-grp-item:hover .ssb-grp-actions { opacity: 1 !important; }
        .ssb-card:hover .ssb-card-actions    { opacity: 1 !important; }
        .ssb-card:hover .ssb-card-img        { transform: scale(1.025); }
      `}</style>

      <div style={{ display: 'flex', gap: '16px', height: 'calc(100vh - var(--header-h) - 48px)', minHeight: 0 }}>

        {/* ── Groups sidebar ── */}
        <div style={{ width: '210px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px', paddingLeft: '2px' }}>
            Groups
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {groups.map(g => (
              <div
                key={g.id}
                className="ssb-grp-item"
                onClick={() => { if (renamingGroupId !== g.id) setSelectedId(g.id); }}
                onMouseEnter={() => setHoveredGroupId(g.id)}
                onMouseLeave={() => setHoveredGroupId(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 10px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  background: effectiveSelectedId === g.id ? 'var(--bg-tertiary)' : 'transparent',
                  border: `1px solid ${effectiveSelectedId === g.id ? 'var(--border-hover)' : 'transparent'}`,
                  transition: 'background var(--transition-fast), border-color var(--transition-fast)',
                  position: 'relative', userSelect: 'none',
                }}
              >
                {/* Color dot */}
                <div
                  onClick={e => { e.stopPropagation(); setColorPickerId(colorPickerId === g.id ? null : g.id); }}
                  title="Change color"
                  style={{ width: '9px', height: '9px', borderRadius: '50%', background: g.color, flexShrink: 0, cursor: 'pointer' }}
                />

                {/* Color picker portal */}
                {colorPickerId === g.id && createPortal(
                  <div onClick={() => setColorPickerId(null)} style={{ position: 'fixed', inset: 0, zIndex: 9000 }}>
                    <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', left: '226px', top: '50%', transform: 'translateY(-50%)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '10px', boxShadow: 'var(--card-shadow)', zIndex: 9001, display: 'flex', gap: '6px', flexWrap: 'wrap', width: '132px' }}>
                      {GROUP_COLORS.map(c => (
                        <div key={c} onClick={() => setGroupColor(g.id, c)} style={{ width: '24px', height: '24px', borderRadius: '50%', background: c, cursor: 'pointer', border: g.color === c ? '2px solid white' : '2px solid transparent', transition: 'transform var(--transition-fast)' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'} />
                      ))}
                    </div>
                  </div>,
                  document.body
                )}

                {/* Name */}
                {renamingGroupId === g.id ? (
                  <input ref={grpRenameRef} value={renameGroupVal} onChange={e => setRenameGroupVal(e.target.value)} onBlur={commitRenameGroup} onKeyDown={e => { if (e.key === 'Enter') commitRenameGroup(); if (e.key === 'Escape') setRenamingGroupId(null); }} onClick={e => e.stopPropagation()} style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px solid var(--accent-purple)', outline: 'none', color: 'var(--text-primary)', fontSize: '0.83rem', fontFamily: 'var(--font-sans)', padding: '1px 0' }} />
                ) : (
                  <span style={{ flex: 1, fontSize: '0.83rem', fontWeight: effectiveSelectedId === g.id ? 600 : 400, color: effectiveSelectedId === g.id ? 'var(--text-primary)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.name}
                  </span>
                )}

                {/* Count badge — hidden when hovering to make room for actions */}
                {hoveredGroupId !== g.id && (
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', background: 'var(--bg-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '1px 6px', flexShrink: 0 }}>
                    {g.screenshots.length}
                  </span>
                )}

                {/* Hover actions */}
                <div className="ssb-grp-actions" onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '2px', opacity: 0, transition: 'opacity var(--transition-fast)', flexShrink: 0 }}>
                  <button onClick={() => startRenameGroup(g)} title="Rename" style={iconBtnStyle}><Edit2 size={11} /></button>
                  <button onClick={() => deleteGroup(g.id)} title="Delete" style={{ ...iconBtnStyle, color: 'var(--accent-red)' }}><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
          </div>

          {/* Add group */}
          <button onClick={addGroup} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', background: 'transparent', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'var(--font-sans)', width: '100%', transition: 'all var(--transition-fast)', marginTop: '4px' }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
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
                  <Loader size={9} style={{ animation: 'spin 1s linear infinite' }} /> saving
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '3px' }}>
              Stored in <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: '3px' }}>data/screenshots/</code>
            </div>
          </div>
        </div>

        {/* ── Main panel ── */}
        <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
            {selectedGroup && (
              <>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: selectedGroup.color, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-primary)' }}>{selectedGroup.name}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {selectedGroup.screenshots.length} screenshot{selectedGroup.screenshots.length !== 1 ? 's' : ''}
                </span>
              </>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search…" style={{ paddingLeft: '28px', paddingRight: '10px', paddingTop: '6px', paddingBottom: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: '0.78rem', outline: 'none', width: '150px', fontFamily: 'var(--font-sans)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', background: 'rgba(232,168,37,0.07)', border: '1px solid rgba(232,168,37,0.2)', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', color: 'var(--accent-purple)', fontWeight: 600 }}>
                <Clipboard size={11} /> Ctrl+V to paste
              </div>
            </div>
          </div>

          {/* Paste indicator */}
          {isPasting && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 18px', background: 'rgba(232,168,37,0.07)', borderBottom: '1px solid rgba(232,168,37,0.15)', flexShrink: 0 }}>
              <div style={{ width: '14px', height: '14px', border: '2px solid var(--accent-purple)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', color: 'var(--accent-purple)' }}>Uploading screenshot…</span>
            </div>
          )}

          {/* Grid */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px' }}>
            {filtered.length === 0 ? (
              <EmptyState hasSearch={!!searchTerm} hasGroups={groups.length > 0} />
            ) : (
              <div style={{ columns: '220px', columnGap: '12px' }}>
                {filtered.map(ss => (
                  <ScreenshotCard
                    key={ss.id}
                    ss={ss}
                    groups={groups}
                    selectedGroupId={effectiveSelectedId}
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
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Lightbox ── */}
      {lightbox && createPortal(
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 99998, padding: '24px' }}>
          <div style={{ position: 'absolute', top: '20px', right: '20px', display: 'flex', gap: '8px' }}>
            <button onClick={e => { e.stopPropagation(); copyToClipboard(lightbox); }} style={lbBtnStyle}>
              {copiedId === lightbox.id ? <><Check size={14} color="#2de886" /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
            <button onClick={e => { e.stopPropagation(); downloadScreenshot(lightbox); }} style={lbBtnStyle}>
              <Download size={14} /> Save
            </button>
            <button onClick={() => setLightbox(null)} style={{ ...lbBtnStyle, padding: '8px' }}><X size={16} /></button>
          </div>
          <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginBottom: '10px', fontFamily: 'var(--font-mono)' }}>
            {lightbox.name} · {lightbox.w ?? '?'}×{lightbox.h ?? '?'} · {lightbox.sizeKb ?? '?'} KB
          </div>
          <img
            src={imgUrl(lightbox.filename)}
            alt={lightbox.name}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 30px 80px rgba(0,0,0,0.7)', animation: 'ssbSlideUp 0.2s ease-out' }}
          />
        </div>,
        document.body
      )}
    </>
  );
};

// ─── Screenshot card ──────────────────────────────────────────────────────────
const ScreenshotCard = ({
  ss, groups, selectedGroupId, isCopied,
  isRenaming, renameVal, renameRef,
  onRenameStart, onRenameChange, onRenameCommit, onRenameCancel,
  onCopy, onDelete, onLightbox, onDownload, onMove,
}) => {
  const [hovered,  setHovered]  = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const otherGroups = groups.filter(g => g.id !== selectedGroupId);

  return (
    <div
      className="ssb-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMoveOpen(false); }}
      style={{
        breakInside: 'avoid', marginBottom: '12px',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${hovered ? 'var(--border-hover)' : 'var(--border-color)'}`,
        background: 'var(--bg-tertiary)', overflow: 'visible',
        transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
        boxShadow: hovered ? 'var(--card-shadow)' : 'none',
        animation: 'ssbSlideUp 0.2s ease-out',
        position: 'relative',
      }}
    >
      {/* Thumbnail */}
      <div onClick={onLightbox} style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', background: 'var(--bg-primary)', cursor: 'zoom-in' }}>
        <img
          className="ssb-card-img"
          src={imgUrl(ss.filename)}
          alt={ss.name}
          loading="lazy"
          style={{ width: '100%', display: 'block', maxHeight: '240px', objectFit: 'cover', objectPosition: 'top left', transition: 'transform 0.22s ease' }}
        />
        {hovered && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'inherit' }}>
            <ZoomIn size={26} color="rgba(255,255,255,0.9)" />
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
      <div style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--border-color)' }}>
        {isRenaming ? (
          <input ref={renameRef} value={renameVal} onChange={onRenameChange} onBlur={onRenameCommit} onKeyDown={e => { if (e.key === 'Enter') onRenameCommit(); if (e.key === 'Escape') onRenameCancel(); }} onClick={e => e.stopPropagation()} style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--accent-purple)', outline: 'none', color: 'var(--text-primary)', fontSize: '0.78rem', fontFamily: 'var(--font-sans)', padding: '2px 0', marginBottom: '6px' }} />
        ) : (
          <div onDoubleClick={onRenameStart} title="Double-click to rename" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', marginBottom: '6px' }}>
            {ss.name}
          </div>
        )}

        {/* Actions */}
        <div className="ssb-card-actions" style={{ display: 'flex', gap: '4px', opacity: hovered ? 1 : 0, transition: 'opacity var(--transition-fast)' }}>
          <button onClick={e => { e.stopPropagation(); onCopy(); }} title={isCopied ? 'Copied!' : 'Copy to clipboard'} style={{ flex: 1, padding: '5px 4px', background: isCopied ? 'rgba(45,232,134,0.12)' : 'var(--bg-secondary)', border: `1px solid ${isCopied ? 'rgba(45,232,134,0.35)' : 'var(--border-color)'}`, borderRadius: 'var(--radius-xs)', color: isCopied ? 'var(--accent-green)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', fontSize: '0.7rem', fontFamily: 'var(--font-sans)', transition: 'all var(--transition-fast)' }}>
            {isCopied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
          </button>

          <button onClick={e => { e.stopPropagation(); onRenameStart(); }} title="Rename" style={cardActionBtn}><Edit2 size={12} /></button>
          <button onClick={e => { e.stopPropagation(); onDownload(); }} title="Download" style={cardActionBtn}><Download size={12} /></button>

          {otherGroups.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button onClick={e => { e.stopPropagation(); setMoveOpen(p => !p); }} title="Move to group" style={cardActionBtn}><Move size={12} /></button>
              {moveOpen && (
                <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', right: 0, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--card-shadow)', zIndex: 200, minWidth: '148px', overflow: 'hidden', animation: 'ssbSlideUp 0.15s ease-out' }}>
                  <div style={{ padding: '5px 10px', fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)' }}>Move to</div>
                  {otherGroups.map(g => (
                    <button key={g.id} onClick={e => { e.stopPropagation(); onMove(g.id); setMoveOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'var(--font-sans)', textAlign: 'left', transition: 'background var(--transition-fast)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                      {g.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button onClick={e => { e.stopPropagation(); onDelete(); }} title="Delete" style={{ ...cardActionBtn, color: 'var(--accent-red)', background: 'rgba(240,80,80,0.08)', borderColor: 'rgba(240,80,80,0.2)' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Empty state ──────────────────────────────────────────────────────────────
const EmptyState = ({ hasSearch, hasGroups }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '320px', gap: '18px', color: 'var(--text-muted)' }}>
    <div style={{ width: '76px', height: '76px', borderRadius: '20px', background: 'var(--bg-tertiary)', border: '2px dashed var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <ImageOff size={30} strokeWidth={1.2} />
    </div>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
        {hasSearch ? 'No matches' : hasGroups ? 'No screenshots yet' : 'Create a group to get started'}
      </div>
      <div style={{ fontSize: '0.82rem' }}>
        {hasSearch ? 'Try a different name' : hasGroups ? 'Paste a screenshot from your clipboard' : 'Click "New Group" on the left'}
      </div>
    </div>
    {!hasSearch && hasGroups && (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'rgba(232,168,37,0.06)', border: '1px dashed rgba(232,168,37,0.28)', borderRadius: 'var(--radius-md)', fontSize: '0.82rem', color: 'var(--accent-purple)', animation: 'ssbPulse 2.5s ease-in-out infinite' }}>
        <Clipboard size={14} />
        <span>Press <kbd style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '1px 7px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>Ctrl+V</kbd> anywhere on this page</span>
      </div>
    )}
  </div>
);

// ─── Shared styles ────────────────────────────────────────────────────────────
const iconBtnStyle = {
  padding: '3px 5px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-xs)', color: 'var(--text-muted)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', transition: 'all var(--transition-fast)',
};
const cardActionBtn = {
  padding: '5px 7px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius-xs)', color: 'var(--text-muted)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', transition: 'all var(--transition-fast)',
};
const lbBtnStyle = {
  padding: '8px 14px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
  borderRadius: '8px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
  gap: '6px', fontSize: '0.8rem', fontFamily: 'var(--font-sans)',
};

export default SSBucket;
