import { useMemo, useState } from 'react';
import { X, Download, Plus, Trash2 } from 'lucide-react';
import { CAT_ORDER, CAT_LABELS, normCat, buildTree } from './helpers';
import ModalPortal from './ModalPortal';

// Single popup shared by Cypress Runner and Jenkins Runner for viewing,
// adding, removing, and downloading the manifest — both pages read/write
// this exact same manifest file, so an edit here is reflected on the other
// page on its next poll.
const ManifestModal = ({ data, onClose, onAdd, onRemove, onDownload }) => {
  const [category, setCategory] = useState(CAT_ORDER[0]);
  const [group, setGroup] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [relPath, setRelPath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('');

  const tree = useMemo(() => buildTree(data.rows), [data.rows]);

  const groupsForCategory = useMemo(() => {
    const set = new Set();
    data.rows.forEach((r) => { if (normCat(r.cat) === category) set.add(r.grp); });
    return Array.from(set).sort();
  }, [data.rows, category]);

  const missingByCat = useMemo(() => {
    const m = {};
    (data.missing || []).forEach((entry) => {
      const cat = normCat(entry.cat);
      m[cat] = m[cat] || {};
      m[cat][entry.grp] = m[cat][entry.grp] || [];
      m[cat][entry.grp].push(entry.path);
    });
    return m;
  }, [data.missing]);

  const effectiveGroup = group === '__new__' ? newGroup.trim() : group;

  const handleAdd = async () => {
    if (!effectiveGroup || !relPath.trim()) return;
    setSubmitting(true);
    await onAdd(category, effectiveGroup, relPath.trim());
    setRelPath('');
    setSubmitting(false);
  };

  const term = filter.trim().toLowerCase();

  const sections = CAT_ORDER.map((cat) => {
    const groups = tree[cat] || {};
    const missingGroups = missingByCat[cat] || {};
    const groupNames = Array.from(new Set([...Object.keys(groups), ...Object.keys(missingGroups)])).sort();

    const groupBlocks = groupNames.map((grp) => {
      const existingPaths = Object.keys(groups[grp] || {});
      const missingPaths = missingGroups[grp] || [];
      const rows = [
        ...existingPaths.map((p) => ({ path: p, count: groups[grp][p].length, missing: false })),
        ...missingPaths.map((p) => ({ path: p, count: 0, missing: true })),
      ].filter((r) => !term || r.path.toLowerCase().includes(term));
      if (rows.length === 0) return null;
      return (
        <div key={grp} className="manifest-group">
          <h4 className="manifest-group-title">{grp} <span>({rows.length})</span></h4>
          {rows.map((r) => (
            <div key={r.path} className={`manifest-row${r.missing ? ' missing' : ''}`}>
              <code>{r.path}</code>
              {r.missing
                ? <span className="manifest-missing-badge">missing</span>
                : <span className="manifest-count">{r.count} case{r.count === 1 ? '' : 's'}</span>}
              <button
                type="button"
                className="tcd-icon-btn"
                title="Remove from manifest"
                aria-label={`Remove ${r.path} from manifest`}
                onClick={() => onRemove(cat, r.path)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      );
    }).filter(Boolean);

    if (groupBlocks.length === 0) return null;
    return (
      <section key={cat} className="manifest-cat-section">
        <h3 className="manifest-cat-title">{CAT_LABELS[cat]}</h3>
        {groupBlocks}
      </section>
    );
  }).filter(Boolean);

  return (
    <ModalPortal>
      <div className="tcd-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="tcd-modal full manifest-modal" role="dialog" aria-modal="true">
          <div className="manifest-modal-header">
            <h3>Manifest</h3>
            <div className="manifest-modal-header-actions">
              <button type="button" className="tcd-btn" onClick={onDownload}>
                <Download size={14} /> Download .md
              </button>
              <button type="button" className="tcd-icon-btn" onClick={onClose} aria-label="Close">
                <X size={16} />
              </button>
            </div>
          </div>

          <p className="tcd-modal-hint">Adds a path directly — the file doesn't need to exist yet, but it'll show up as "missing" until it does.</p>

          <div className="manifest-add-row">
            <select value={category} onChange={(e) => { setCategory(e.target.value); setGroup(''); }}>
              {CAT_ORDER.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
            </select>
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="" disabled>Group…</option>
              {groupsForCategory.map((g) => <option key={g} value={g}>{g}</option>)}
              <option value="__new__">+ New group…</option>
            </select>
            {group === '__new__' && (
              <input type="text" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="New group name" />
            )}
            <input
              type="text"
              className="manifest-path-input"
              value={relPath}
              onChange={(e) => setRelPath(e.target.value)}
              placeholder="cypress/integration/regression/.../offline.ts"
            />
            <button type="button" className="tcd-btn primary" disabled={submitting || !effectiveGroup || !relPath.trim()} onClick={handleAdd}>
              <Plus size={14} /> {submitting ? 'Adding…' : 'Add'}
            </button>
          </div>

          <input
            type="text"
            className="tcd-search-input manifest-filter-input"
            placeholder="Filter paths…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />

          <div className="manifest-list">
            {sections.length === 0 ? <p className="tcd-modal-hint">No files match.</p> : sections}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default ManifestModal;
