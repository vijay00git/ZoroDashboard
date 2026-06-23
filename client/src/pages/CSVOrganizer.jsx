import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileSpreadsheet, FilePlus, Upload, Save, Download, Trash2, Plus,
  Undo2, Redo2, Search, X, RefreshCw, Edit2, ChevronUp, ChevronDown,
  BarChart2, Hash, AlignLeft, Calendar, CheckSquare, Square,
  Columns, Rows, ArrowUpDown
} from 'lucide-react';
import { showAlert, showConfirm, showPrompt } from '../utils/Alerts';

/* ── CSV helpers ─────────────────────────────────────────────── */
function parseLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return { headers: ['Column A'], rows: [['']] };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const cols = parseLine(l);
    while (cols.length < headers.length) cols.push('');
    return cols.slice(0, headers.length);
  });
  return { headers, rows: rows.length ? rows : [headers.map(() => '')] };
}

function serializeCSV(headers, rows) {
  const esc = v => {
    const s = v == null ? '' : String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map(r => r.map(esc).join(',')).join('\n');
}

function blankGrid(cols = 6, rowCount = 12) {
  const headers = Array.from({ length: cols }, (_, i) => `Column ${String.fromCharCode(65 + i)}`);
  return { headers, rows: Array.from({ length: rowCount }, () => Array(cols).fill('')) };
}

/* ── Column stats ────────────────────────────────────────────── */
function colStats(headers, rows, ci) {
  if (ci < 0 || ci >= headers.length) return null;
  const vals = rows.map(r => (r[ci] ?? '').trim());
  const filled = vals.filter(v => v !== '');
  const nums = filled.map(Number).filter(n => !isNaN(n) && n !== '');
  const unique = new Set(filled);
  const freq = {};
  filled.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
  const [topVal, topCnt] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
  const isNum = filled.length > 0 && nums.length / filled.length >= 0.8;
  return {
    name: headers[ci],
    total: rows.length,
    filled: filled.length,
    empty: rows.length - filled.length,
    unique: unique.size,
    isNum,
    min: isNum && nums.length ? Math.min(...nums) : null,
    max: isNum && nums.length ? Math.max(...nums) : null,
    avg: isNum && nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length) : null,
    topVal,
    topCnt,
  };
}

const MAX_UNDO = 30;
const API = 'http://localhost:3000';

/* ── Component ───────────────────────────────────────────────── */
export default function CSVOrganizer() {
  const init = blankGrid();
  const [headers, setHeaders] = useState(init.headers);
  const [rows,    setRows]    = useState(init.rows);

  // Selection / editing
  const [selCell,     setSelCell]     = useState({ r: 0, c: 0 });
  const [editCell,    setEditCell]    = useState(null);
  const [editVal,     setEditVal]     = useState('');
  const [editHeader,  setEditHeader]  = useState(null);
  const [editHdrVal,  setEditHdrVal]  = useState('');
  const [selRows,     setSelRows]     = useState(new Set());

  // Undo / redo
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Filter / sort
  const [filter,    setFilter]    = useState('');
  const [sortCfg,   setSortCfg]   = useState(null); // {col, dir}
  const [showSearch, setShowSearch] = useState(false);

  // File management
  const [fileName,    setFileName]    = useState('untitled');
  const [activeId,    setActiveId]    = useState(null);
  const [dirty,       setDirty]       = useState(false);
  const [savedFiles,  setSavedFiles]  = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  // Right panel
  const [showPanel, setShowPanel] = useState(true);

  const gridRef    = useRef(null);
  const editRef    = useRef(null);
  const hdrRef     = useRef(null);
  const fileInput  = useRef(null);

  /* ── API ──────────────────────────────────────────────────── */
  const fetchFiles = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await fetch(`${API}/api/csvfiles`);
      if (r.ok) setSavedFiles((await r.json()).files || []);
    } catch (_) {}
    setLoadingList(false);
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  /* ── Undo / redo ──────────────────────────────────────────── */
  const snapshot = useCallback(() => ({ headers: [...headers], rows: rows.map(r => [...r]) }), [headers, rows]);

  const pushUndo = useCallback((h, r) => {
    setUndoStack(prev => [...prev.slice(-(MAX_UNDO - 1)), { headers: h, rows: r }]);
    setRedoStack([]);
    setDirty(true);
  }, []);

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (!prev.length) return prev;
      const s = prev[prev.length - 1];
      setRedoStack(rd => [...rd, snapshot()]);
      setHeaders(s.headers); setRows(s.rows); setDirty(true);
      return prev.slice(0, -1);
    });
  }, [snapshot]);

  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (!prev.length) return prev;
      const s = prev[prev.length - 1];
      setUndoStack(ud => [...ud, snapshot()]);
      setHeaders(s.headers); setRows(s.rows); setDirty(true);
      return prev.slice(0, -1);
    });
  }, [snapshot]);

  /* ── Cell editing ─────────────────────────────────────────── */
  const startEdit = (r, c, replaceWith = null) => {
    setEditCell({ r, c });
    setEditVal(replaceWith !== null ? replaceWith : (rows[r]?.[c] ?? ''));
    setTimeout(() => editRef.current?.focus(), 0);
  };

  const commitEdit = useCallback(() => {
    if (!editCell) return;
    const { r: fr, c } = editCell;
    const origIdx = visibleRows[fr]?.orig;
    if (origIdx === undefined) { setEditCell(null); return; }
    pushUndo(headers, rows);
    setRows(prev => prev.map((row, ri) => ri === origIdx ? row.map((v, ci) => ci === c ? editVal : v) : row));
    setEditCell(null); setEditVal('');
    gridRef.current?.focus();
  }, [editCell, editVal, rows, headers, pushUndo]); // eslint-disable-line

  const cancelEdit = () => { setEditCell(null); setEditVal(''); gridRef.current?.focus(); };

  /* ── Header editing ───────────────────────────────────────── */
  const startEditHeader = (c) => {
    setEditHeader(c); setEditHdrVal(headers[c]);
    setTimeout(() => hdrRef.current?.focus(), 0);
  };
  const commitHeader = () => {
    if (editHeader === null) return;
    pushUndo(headers, rows);
    setHeaders(h => h.map((v, i) => i === editHeader ? editHdrVal : v));
    setEditHeader(null); gridRef.current?.focus();
  };

  /* ── Grid / column ops ────────────────────────────────────── */
  const addRow = () => { pushUndo(headers, rows); setRows(r => [...r, Array(headers.length).fill('')]); };

  const deleteSelRows = async () => {
    if (!selRows.size) return;
    if (!(await showConfirm(`Delete ${selRows.size} selected row(s)?`))) return;
    pushUndo(headers, rows);
    setRows(r => r.filter((_, i) => !selRows.has(i)));
    setSelRows(new Set());
  };

  const addColumn = () => {
    pushUndo(headers, rows);
    const name = `Column ${String.fromCharCode(65 + (headers.length % 26))}`;
    setHeaders(h => [...h, name]);
    setRows(r => r.map(row => [...row, '']));
  };

  const deleteColumn = async (ci) => {
    if (headers.length <= 1) return showAlert('Cannot delete the last column.');
    if (!(await showConfirm(`Delete column "${headers[ci]}"?`))) return;
    pushUndo(headers, rows);
    setHeaders(h => h.filter((_, i) => i !== ci));
    setRows(r => r.map(row => row.filter((_, i) => i !== ci)));
  };

  /* ── Sort ─────────────────────────────────────────────────── */
  const handleSort = (ci) => {
    setSortCfg(prev => {
      if (prev?.col === ci) return prev.dir === 'asc' ? { col: ci, dir: 'desc' } : null;
      return { col: ci, dir: 'asc' };
    });
  };

  /* ── Filtered + sorted view ───────────────────────────────── */
  const visibleRows = (() => {
    let list = rows.map((row, orig) => ({ row, orig }));
    if (filter.trim()) {
      const t = filter.toLowerCase();
      list = list.filter(({ row }) => row.some(c => c.toLowerCase().includes(t)));
    }
    if (sortCfg) {
      list.sort((a, b) => {
        const va = a.row[sortCfg.col] ?? '', vb = b.row[sortCfg.col] ?? '';
        const na = Number(va), nb = Number(vb);
        const num = !isNaN(na) && !isNaN(nb) && va !== '' && vb !== '';
        const cmp = num ? na - nb : va.localeCompare(vb);
        return sortCfg.dir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  })();

  /* ── Keyboard nav ─────────────────────────────────────────── */
  const handleGridKey = (e) => {
    if (editCell || editHeader !== null) return;
    const { r, c } = selCell;
    const R = visibleRows.length, C = headers.length;

    if (e.key === 'ArrowUp')    { e.preventDefault(); setSelCell({ r: Math.max(0, r - 1), c }); }
    else if (e.key === 'ArrowDown')  { e.preventDefault(); setSelCell({ r: Math.min(R - 1, r + 1), c }); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); setSelCell({ r, c: Math.max(0, c - 1) }); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setSelCell({ r, c: Math.min(C - 1, c + 1) }); }
    else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) setSelCell({ r, c: c > 0 ? c - 1 : c });
      else setSelCell({ r: c < C - 1 ? r : Math.min(R - 1, r + 1), c: c < C - 1 ? c + 1 : 0 });
    }
    else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(r, c); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const orig = visibleRows[r]?.orig;
      if (orig === undefined) return;
      pushUndo(headers, rows);
      setRows(prev => prev.map((row, ri) => ri === orig ? row.map((v, ci) => ci === c ? '' : v) : row));
    }
    else if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
    else if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }
    else if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSave(); }
    else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      startEdit(r, c, e.key);
    }
  };

  const handleCellKey = (e) => {
    if (e.key === 'Escape') { cancelEdit(); }
    else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); commitEdit();
      setSelCell(s => ({ ...s, r: Math.min(visibleRows.length - 1, s.r + 1) }));
    }
    else if (e.key === 'Tab') {
      e.preventDefault(); commitEdit();
      setSelCell(s => ({ ...s, c: s.c < headers.length - 1 ? s.c + 1 : s.c }));
    }
  };

  /* ── File ops ─────────────────────────────────────────────── */
  const handleNew = () => {
    const g = blankGrid();
    setHeaders(g.headers); setRows(g.rows);
    setFileName('untitled'); setActiveId(null); setDirty(false);
    setUndoStack([]); setRedoStack([]); setSelCell({ r: 0, c: 0 });
  };

  const handleUpload = async (file) => {
    if (!file) return;
    const text = await file.text();
    const { headers: h, rows: r } = parseCSV(text);
    setHeaders(h); setRows(r);
    setFileName(file.name.replace(/\.csv$/i, ''));
    setActiveId(null); setDirty(true);
    setUndoStack([]); setSelCell({ r: 0, c: 0 });
  };

  const handleSave = async (forceName) => {
    let name = forceName || fileName;
    if (!name || name === 'untitled') {
      const n = await showPrompt('Name this CSV file:', '');
      if (!n?.trim()) return;
      name = n.trim(); setFileName(name);
    }
    const content = serializeCSV(headers, rows);
    try {
      if (activeId) {
        const r = await fetch(`${API}/api/csvfiles/${activeId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        if (r.ok) { setDirty(false); fetchFiles(); }
        else showAlert('Save failed.');
      } else {
        const r = await fetch(`${API}/api/csvfiles`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, content })
        });
        if (r.ok) { const d = await r.json(); setActiveId(d.id); setDirty(false); fetchFiles(); }
        else showAlert('Save failed.');
      }
    } catch (e) { showAlert('Network error: ' + e.message); }
  };

  const handleRename = async (fileId, oldName) => {
    const n = await showPrompt('Rename file to:', oldName.replace(/\.csv$/i, ''));
    if (!n?.trim()) return;
    const r = await fetch(`${API}/api/csvfiles/${fileId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName: n.trim() })
    });
    if (r.ok) {
      const d = await r.json();
      if (activeId === fileId) { setActiveId(d.id); setFileName(n.trim()); }
      fetchFiles();
    }
  };

  const handleLoad = async (fileId, name) => {
    const r = await fetch(`${API}/api/csvfiles/${fileId}`);
    if (!r.ok) return showAlert('Failed to load.');
    const { headers: h, rows: rv } = parseCSV((await r.json()).content);
    setHeaders(h); setRows(rv);
    setFileName(name.replace(/\.csv$/i, ''));
    setActiveId(fileId); setDirty(false);
    setUndoStack([]); setSelCell({ r: 0, c: 0 });
  };

  const handleDelete = async (fileId, e) => {
    e.stopPropagation();
    if (!(await showConfirm('Delete this CSV file permanently?'))) return;
    await fetch(`${API}/api/csvfiles/${fileId}`, { method: 'DELETE' });
    if (activeId === fileId) handleNew();
    fetchFiles();
  };

  const handleExport = () => {
    const blob = new Blob([serializeCSV(headers, rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${fileName || 'export'}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Stats ────────────────────────────────────────────────── */
  const stats = colStats(headers, rows, selCell.c);

  const passBadge = (val) => {
    if (val === null || val === undefined) return null;
    const s = String(val);
    if (s === 'PASSED') return '#10b981';
    if (s === 'FAILED') return '#f43f5e';
    if (s === 'BLOCKED') return '#f59e0b';
    if (s === 'UNTESTED') return '#6b7280';
    return null;
  };

  const fmtSize = (bytes) => bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(1)}KB`;
  const fmtDate = (ms) => new Date(ms).toLocaleDateString();

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', gap: '16px', height: 'calc(100vh - 116px)', overflow: 'hidden' }}>

      {/* ── Left: File Browser ─────────────────────────────── */}
      <div className="glass-panel" style={{ width: '220px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0', overflow: 'hidden', padding: 0 }}>
        {/* Header */}
        <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={15} style={{ color: 'var(--accent-purple)' }} />
            <span style={{ fontWeight: '700', fontSize: '0.85rem' }}>CSV Files</span>
          </div>
          <button onClick={fetchFiles} title="Refresh" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}>
            <RefreshCw size={13} style={{ animation: loadingList ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>

        {/* Actions */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '6px' }}>
          <button onClick={handleNew} title="New file" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: 'var(--accent-purple)', borderRadius: '7px', padding: '6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '600' }}>
            <FilePlus size={13} /> New
          </button>
          <button onClick={() => fileInput.current?.click()} title="Upload CSV" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '7px', padding: '6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '600' }}>
            <Upload size={13} /> Upload
          </button>
          <input ref={fileInput} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { handleUpload(e.target.files[0]); e.target.value = ''; }} />
        </div>

        {/* File list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }} className="custom-scrollbar">
          {savedFiles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              <FileSpreadsheet size={28} style={{ opacity: 0.2, margin: '0 auto 8px', display: 'block' }} />
              No saved files yet
            </div>
          ) : savedFiles.map(f => {
            const isActive = activeId === f.id;
            return (
              <div
                key={f.id}
                onClick={() => handleLoad(f.id, f.name)}
                style={{ padding: '9px 10px', borderRadius: '8px', cursor: 'pointer', marginBottom: '4px', background: isActive ? 'linear-gradient(135deg,rgba(168,85,247,0.15),rgba(236,72,153,0.08))' : 'transparent', border: `1px solid ${isActive ? 'rgba(168,85,247,0.3)' : 'transparent'}`, transition: 'all 0.15s' }}
                className="nav-item-hover"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: isActive ? '700' : '500', color: isActive ? 'var(--accent-purple)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>{f.rows} rows · {f.cols} cols · {fmtSize(f.size)}</div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{fmtDate(f.mtime)}</div>
                  </div>
                  <div className="hover-actions" style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginLeft: '4px' }}>
                    <button onClick={(e) => { e.stopPropagation(); handleRename(f.id, f.name); }} title="Rename" style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}><Edit2 size={11} /></button>
                    <button onClick={(e) => handleDelete(f.id, e)} title="Delete" style={{ background: 'transparent', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '2px' }}><Trash2 size={11} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Center: Editor ─────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden', minWidth: 0 }}>

        {/* Toolbar */}
        <div className="glass-panel" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flexShrink: 0 }}>
          {/* File name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1 1 160px' }}>
            <FileSpreadsheet size={16} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
            <input
              value={fileName}
              onChange={e => { setFileName(e.target.value); setDirty(true); }}
              onBlur={() => { if (!fileName.trim()) setFileName('untitled'); }}
              style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: '700', width: '140px' }}
            />
            {dirty && <span style={{ color: 'var(--accent-orange)', fontSize: '1rem', lineHeight: 1 }} title="Unsaved changes">●</span>}
          </div>

          <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', flexShrink: 0 }} />

          {/* Undo / Redo */}
          <button onClick={undo} disabled={!undoStack.length} title="Undo (Ctrl+Z)" style={{ background: 'transparent', border: 'none', color: undoStack.length ? 'var(--text-primary)' : 'var(--text-muted)', cursor: undoStack.length ? 'pointer' : 'not-allowed', padding: '4px', display: 'flex' }}><Undo2 size={16} /></button>
          <button onClick={redo} disabled={!redoStack.length} title="Redo (Ctrl+Y)" style={{ background: 'transparent', border: 'none', color: redoStack.length ? 'var(--text-primary)' : 'var(--text-muted)', cursor: redoStack.length ? 'pointer' : 'not-allowed', padding: '4px', display: 'flex' }}><Redo2 size={16} /></button>

          <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', flexShrink: 0 }} />

          {/* Row / Col ops */}
          <button onClick={addRow} title="Add row" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}><Rows size={13} /> + Row</button>
          <button onClick={addColumn} title="Add column" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}><Columns size={13} /> + Col</button>
          {selRows.size > 0 && (
            <button onClick={deleteSelRows} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(244,63,94,0.1)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}>
              <Trash2 size={13} /> Delete ({selRows.size})
            </button>
          )}

          <div style={{ flex: 1 }} />

          {/* Search */}
          <button onClick={() => setShowSearch(s => !s)} title="Search/Filter" style={{ background: showSearch ? 'rgba(168,85,247,0.15)' : 'transparent', border: `1px solid ${showSearch ? 'var(--accent-purple)' : 'var(--border-color)'}`, color: showSearch ? 'var(--accent-purple)' : 'var(--text-secondary)', borderRadius: '7px', padding: '5px 8px', cursor: 'pointer', display: 'flex' }}><Search size={14} /></button>
          <button onClick={() => setShowPanel(s => !s)} title="Column stats" style={{ background: showPanel ? 'rgba(168,85,247,0.15)' : 'transparent', border: `1px solid ${showPanel ? 'var(--accent-purple)' : 'var(--border-color)'}`, color: showPanel ? 'var(--accent-purple)' : 'var(--text-secondary)', borderRadius: '7px', padding: '5px 8px', cursor: 'pointer', display: 'flex' }}><BarChart2 size={14} /></button>

          <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', flexShrink: 0 }} />

          {/* File ops */}
          <button onClick={() => handleSave()} className="glow-btn" style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 12px', fontSize: '0.78rem' }}><Save size={13} /> Save</button>
          <button onClick={handleExport} title="Download CSV" style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}><Download size={13} /> Export</button>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '8px 14px', flexShrink: 0 }}>
            <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              autoFocus
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filter rows by any value…"
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.85rem' }}
            />
            {filter && (
              <>
                <span style={{ fontSize: '0.75rem', color: 'var(--accent-purple)', fontWeight: '700' }}>{visibleRows.length} of {rows.length}</span>
                <button onClick={() => setFilter('')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}><X size={14} /></button>
              </>
            )}
          </div>
        )}

        {/* Grid */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div
            ref={gridRef}
            tabIndex={0}
            onKeyDown={handleGridKey}
            style={{ flex: 1, overflow: 'auto', outline: 'none', border: '1px solid var(--border-color)', borderRadius: '12px', background: 'var(--bg-secondary)' }}
            className="custom-scrollbar"
          >
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8rem', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '42px' }} />
                <col style={{ width: '36px' }} />
                {headers.map((_, i) => <col key={i} style={{ width: `${Math.max(100, Math.floor((window.innerWidth - 600) / headers.length))}px` }} />)}
              </colgroup>

              {/* Header */}
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                {/* Column letter row */}
                <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ width: '42px', padding: '6px 4px', borderRight: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', position: 'sticky', left: 0, zIndex: 11 }}>
                    <input type="checkbox"
                      checked={selRows.size === rows.length && rows.length > 0}
                      onChange={e => setSelRows(e.target.checked ? new Set(rows.map((_, i) => i)) : new Set())}
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th style={{ width: '36px', padding: '6px 0', borderRight: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: '600', textAlign: 'center', position: 'sticky', left: '42px', zIndex: 11 }}>#</th>
                  {headers.map((_, ci) => (
                    <th key={ci} onClick={() => handleSort(ci)} style={{ padding: '6px 8px', borderRight: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: '700', textAlign: 'center', cursor: 'pointer', userSelect: 'none', letterSpacing: '0.5px', background: 'var(--bg-tertiary)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        {String.fromCharCode(65 + ci)}
                        {sortCfg?.col === ci ? (sortCfg.dir === 'asc' ? <ChevronUp size={10} style={{ color: 'var(--accent-purple)' }} /> : <ChevronDown size={10} style={{ color: 'var(--accent-purple)' }} />) : <ArrowUpDown size={9} style={{ opacity: 0.3 }} />}
                      </span>
                    </th>
                  ))}
                </tr>

                {/* Editable header name row */}
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '2px solid var(--accent-purple)', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  <th style={{ width: '42px', position: 'sticky', left: 0, zIndex: 11, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }} />
                  <th style={{ width: '36px', position: 'sticky', left: '42px', zIndex: 11, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)' }} />
                  {headers.map((h, ci) => (
                    <th key={ci}
                      onDoubleClick={() => startEditHeader(ci)}
                      style={{ padding: '0', borderRight: '1px solid var(--border-color)', background: ci === selCell.c ? 'rgba(168,85,247,0.08)' : 'var(--bg-secondary)', position: 'relative' }}
                    >
                      {editHeader === ci ? (
                        <input ref={hdrRef} value={editHdrVal} onChange={e => setEditHdrVal(e.target.value)}
                          onBlur={commitHeader} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commitHeader(); } if (e.key === 'Escape') { setEditHeader(null); gridRef.current?.focus(); } }}
                          style={{ width: '100%', background: 'rgba(168,85,247,0.1)', border: 'none', outline: '2px solid var(--accent-purple)', color: 'var(--text-primary)', padding: '7px 8px', fontWeight: '700', fontSize: '0.78rem', boxSizing: 'border-box' }}
                        />
                      ) : (
                        <div style={{ padding: '7px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px', cursor: 'default' }} title="Double-click to rename">
                          <span style={{ fontWeight: '700', fontSize: '0.78rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h}</span>
                          <button onClick={e => { e.stopPropagation(); deleteColumn(ci); }} title={`Delete column "${h}"`}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '1px', opacity: 0, transition: 'opacity 0.15s', flexShrink: 0 }}
                            className="col-del-btn"
                          ><X size={10} /></button>
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Body */}
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr><td colSpan={headers.length + 2} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {filter ? `No rows match "${filter}"` : 'Empty — add rows or upload a CSV'}
                  </td></tr>
                ) : visibleRows.map(({ row, orig }, ri) => {
                  const isSelRow = selRows.has(orig);
                  return (
                    <tr key={orig} style={{ background: isSelRow ? 'rgba(168,85,247,0.06)' : ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', borderBottom: '1px solid var(--border-color)' }}>
                      {/* Checkbox */}
                      <td style={{ padding: '4px', textAlign: 'center', borderRight: '1px solid var(--border-color)', position: 'sticky', left: 0, background: isSelRow ? 'rgba(168,85,247,0.1)' : ri % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-tertiary)', zIndex: 2 }}>
                        <input type="checkbox" checked={isSelRow} onChange={e => {
                          const ns = new Set(selRows);
                          e.target.checked ? ns.add(orig) : ns.delete(orig);
                          setSelRows(ns);
                        }} style={{ cursor: 'pointer' }} />
                      </td>
                      {/* Row number */}
                      <td style={{ padding: '4px 6px', textAlign: 'center', borderRight: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: '500', position: 'sticky', left: '42px', background: isSelRow ? 'rgba(168,85,247,0.1)' : ri % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-tertiary)', zIndex: 2, userSelect: 'none' }}>
                        {orig + 1}
                      </td>
                      {/* Cells */}
                      {row.map((val, ci) => {
                        const isSel = selCell.r === ri && selCell.c === ci;
                        const isEdit = editCell?.r === ri && editCell?.c === ci;
                        const badge = passBadge(val);
                        return (
                          <td key={ci}
                            onClick={() => { setSelCell({ r: ri, c: ci }); cancelEdit(); }}
                            onDoubleClick={() => startEdit(ri, ci)}
                            style={{
                              padding: isEdit ? 0 : '5px 8px',
                              borderRight: '1px solid var(--border-color)',
                              outline: isSel ? '2px solid var(--accent-purple)' : 'none',
                              outlineOffset: '-1px',
                              background: isSel ? 'rgba(168,85,247,0.1)' : 'transparent',
                              cursor: 'cell',
                              maxWidth: '200px',
                              overflow: 'hidden',
                              position: 'relative',
                            }}
                          >
                            {isEdit ? (
                              <input
                                ref={editRef}
                                value={editVal}
                                onChange={e => setEditVal(e.target.value)}
                                onKeyDown={handleCellKey}
                                onBlur={commitEdit}
                                style={{ width: '100%', height: '100%', background: 'var(--bg-primary)', border: 'none', outline: '2px solid var(--accent-purple)', color: 'var(--text-primary)', padding: '5px 8px', fontSize: '0.8rem', boxSizing: 'border-box' }}
                              />
                            ) : badge ? (
                              <span style={{ display: 'inline-block', background: `${badge}18`, border: `1px solid ${badge}40`, color: badge, borderRadius: '4px', padding: '2px 7px', fontSize: '0.72rem', fontWeight: '700' }}>{val}</span>
                            ) : (
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', color: val ? 'var(--text-primary)' : 'var(--text-muted)' }} title={val}>
                                {val || ''}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Status bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '6px 12px', fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '0 0 8px 8px', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
            <span><b style={{ color: 'var(--text-primary)' }}>{rows.length}</b> rows × <b style={{ color: 'var(--text-primary)' }}>{headers.length}</b> cols</span>
            {filter && <span style={{ color: 'var(--accent-purple)' }}>Filtered: {visibleRows.length} visible</span>}
            {selRows.size > 0 && <span style={{ color: 'var(--accent-orange)' }}>{selRows.size} selected</span>}
            {sortCfg && <span>Sorted by <b>{headers[sortCfg.col]}</b> {sortCfg.dir}</span>}
            <span style={{ marginLeft: 'auto' }}>Cell: <b style={{ color: 'var(--text-primary)' }}>{String.fromCharCode(65 + selCell.c)}{selCell.r + 1}</b></span>
            <span>Ctrl+S to save · F2 to edit · Del to clear</span>
          </div>
        </div>
      </div>

      {/* ── Right: Column Stats ─────────────────────────────── */}
      {showPanel && (
        <div className="glass-panel" style={{ width: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0', overflow: 'hidden', padding: 0 }}>
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart2 size={14} style={{ color: 'var(--accent-purple)' }} />
            <span style={{ fontWeight: '700', fontSize: '0.82rem' }}>Column Stats</span>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '14px' }} className="custom-scrollbar">
            {stats ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Column name */}
                <div>
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700', marginBottom: '4px' }}>Column</div>
                  <div style={{ fontWeight: '800', fontSize: '0.95rem', color: 'var(--accent-purple)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stats.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '4px' }}>
                    {stats.isNum ? <Hash size={11} style={{ color: '#f59e0b' }} /> : <AlignLeft size={11} style={{ color: '#06b6d4' }} />}
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{stats.isNum ? 'Numeric' : 'Text'}</span>
                  </div>
                </div>

                {/* Fill rate bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    <span>Fill rate</span>
                    <span style={{ color: '#10b981', fontWeight: '700' }}>{stats.total > 0 ? Math.round((stats.filled / stats.total) * 100) : 0}%</span>
                  </div>
                  <div style={{ height: '5px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${stats.total > 0 ? (stats.filled / stats.total) * 100 : 0}%`, background: 'linear-gradient(90deg, #10b981, #06b6d4)', transition: 'width 0.4s' }} />
                  </div>
                </div>

                {/* Stats grid */}
                {[
                  { label: 'Total',   value: stats.total },
                  { label: 'Filled',  value: stats.filled, color: '#10b981' },
                  { label: 'Empty',   value: stats.empty,  color: stats.empty > 0 ? '#f59e0b' : undefined },
                  { label: 'Unique',  value: stats.unique, color: '#8b5cf6' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.label}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: s.color || 'var(--text-primary)' }}>{s.value}</span>
                  </div>
                ))}

                {/* Numeric extras */}
                {stats.isNum && stats.min !== null && (
                  <>
                    {[
                      { label: 'Min', value: stats.min },
                      { label: 'Max', value: stats.max },
                      { label: 'Avg', value: Number(stats.avg).toFixed(2) },
                    ].map(s => (
                      <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.label}</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#f59e0b' }}>{s.value}</span>
                      </div>
                    ))}
                  </>
                )}

                {/* Most common */}
                {stats.topVal && (
                  <div>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700', marginBottom: '6px' }}>Most Common</div>
                    <div style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: '7px', padding: '8px' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stats.topVal}>{stats.topVal}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--accent-purple)', marginTop: '2px' }}>{stats.topCnt} occurrences</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 8px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Click a cell to see column stats
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inline styles for hover effects */}
      <style>{`
        td:hover .col-del-btn, th:hover .col-del-btn { opacity: 1 !important; }
        .nav-item-hover:hover { background: rgba(255,255,255,0.05) !important; }
        .nav-item-hover .hover-actions { opacity: 0; transition: opacity 0.2s; }
        .nav-item-hover:hover .hover-actions { opacity: 1; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
