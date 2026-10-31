import { memo, useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, Search, ChevronsDownUp, ChevronsUpDown, Layers } from 'lucide-react';

// TestRail-style folder sidebar. Counts are the tests in each folder's
// whole subtree that match the current filters (ignoring the folder pick
// itself), with a thin status bar showing that subtree's status mix.
const SectionTree = ({ idx, counts, totalCount, statuses, selectedId, onSelect, expanded, onToggle, onSetExpanded }) => {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();

  // While searching, show matching folders plus their ancestors, all open.
  const visible = useMemo(() => {
    if (!term) return null;
    const keep = new Set();
    idx.byId.forEach((s) => {
      if (!s.name.toLowerCase().includes(term)) return;
      let cur = s;
      while (cur && !keep.has(cur.id)) { keep.add(cur.id); cur = idx.byId.get(cur.parentId); }
    });
    return keep;
  }, [idx, term]);

  const expandAll = () => onSetExpanded(new Set(idx.byId.keys()));
  const collapseAll = () => onSetExpanded(new Set());

  const renderNodes = (parentId, depth) => (idx.children.get(parentId) || []).map((s) => {
    if (visible && !visible.has(s.id)) return null;
    const kids = idx.children.get(s.id) || [];
    const hasKids = kids.length > 0;
    const isOpen = visible ? true : expanded.has(s.id);
    const c = counts.get(s.id);
    const n = c ? c.total : 0;
    return (
      <li key={s.id} role="treeitem" aria-expanded={hasKids ? isOpen : undefined} aria-selected={selectedId === s.id}>
        <div
          className={`frl-tree-row${selectedId === s.id ? ' selected' : ''}${n === 0 ? ' empty' : ''}`}
          style={{ '--depth': depth }}
        >
          <button
            type="button"
            className="frl-tree-caret"
            onClick={() => hasKids && onToggle(s.id)}
            tabIndex={hasKids ? 0 : -1}
            aria-label={hasKids ? (isOpen ? 'Collapse' : 'Expand') : undefined}
            style={{ visibility: hasKids ? 'visible' : 'hidden' }}
          >
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <button type="button" className="frl-tree-name" title={idx.pathOf(s.id)} onClick={() => onSelect(selectedId === s.id ? null : s.id)}>
            {selectedId === s.id || (isOpen && hasKids) ? <FolderOpen size={14} /> : <Folder size={14} />}
            <span className="frl-tree-label">{s.name}</span>
            {c && c.total > 0 && (
              <span className="frl-tree-bar" aria-hidden="true">
                {statuses.filter((st) => c.byStatus[st.id]).map((st) => (
                  <span key={st.id} style={{ flexGrow: c.byStatus[st.id], background: st.color }} />
                ))}
              </span>
            )}
            <span className="frl-tree-count">{n.toLocaleString()}</span>
          </button>
        </div>
        {hasKids && isOpen && <ul role="group">{renderNodes(s.id, depth + 1)}</ul>}
      </li>
    );
  });

  return (
    <aside className="frl-tree">
      <div className="frl-tree-head">
        <span className="frl-tree-title">Sections</span>
        <button type="button" className="frl-icon-btn" title="Expand all" onClick={expandAll}><ChevronsUpDown size={14} /></button>
        <button type="button" className="frl-icon-btn" title="Collapse all" onClick={collapseAll}><ChevronsDownUp size={14} /></button>
      </div>
      <div className="frl-tree-search">
        <Search size={12} />
        <input placeholder="Find a section…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="frl-tree-scroll">
        <button type="button" className={`frl-tree-row frl-tree-all${selectedId === null ? ' selected' : ''}`} onClick={() => onSelect(null)}>
          <Layers size={14} />
          <span className="frl-tree-label">All sections</span>
          <span className="frl-tree-count">{totalCount.toLocaleString()}</span>
        </button>
        <ul role="tree" className="frl-tree-list">{renderNodes(null, 0)}</ul>
        {visible && visible.size === 0 && <p className="frl-muted frl-pad">No section matches “{q}”.</p>}
      </div>
    </aside>
  );
};

export default memo(SectionTree);
