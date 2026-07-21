import { useMemo, useState } from 'react';
import { CAT_ORDER, CAT_LABELS, normCat } from './helpers';
import ModalPortal from './ModalPortal';

const AddManifestModal = ({ data, onClose, onSubmit }) => {
  const [category, setCategory] = useState(CAT_ORDER[0]);
  const [group, setGroup] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [relPath, setRelPath] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const groups = useMemo(() => {
    const set = new Set();
    data.rows.forEach((r) => { if (normCat(r.cat) === category) set.add(r.grp); });
    return Array.from(set).sort();
  }, [data.rows, category]);

  const effectiveGroup = group === '__new__' ? newGroup.trim() : group;

  const handleSubmit = async () => {
    if (!effectiveGroup) return;
    if (!relPath.trim()) return;
    setSubmitting(true);
    await onSubmit(category, effectiveGroup, relPath.trim());
    setSubmitting(false);
  };

  return (
    <ModalPortal>
    <div className="tcd-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tcd-modal" role="dialog" aria-modal="true">
        <h3>Add file to manifest</h3>
        <p className="tcd-modal-hint">Adds a path to the manifest directly — the file doesn't need to exist yet, but it'll show up under "missing" until it does.</p>
        <div className="tcd-field">
          <label>Category</label>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setGroup(''); }}>
            {CAT_ORDER.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
          </select>
        </div>
        <div className="tcd-field">
          <label>Group</label>
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="" disabled>Select a group…</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            <option value="__new__">+ New group…</option>
          </select>
        </div>
        {group === '__new__' && (
          <div className="tcd-field">
            <label>New group name</label>
            <input type="text" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="e.g. Group Settings / Configuration_3" />
          </div>
        )}
        <div className="tcd-field">
          <label>File path (relative to cypress/)</label>
          <input type="text" value={relPath} onChange={(e) => setRelPath(e.target.value)} placeholder="cypress/integration/regression/.../offline.ts" />
        </div>
        <div className="tcd-modal-actions">
          <button className="tcd-btn" onClick={onClose}>Cancel</button>
          <button className="tcd-btn primary" disabled={submitting} onClick={handleSubmit}>
            {submitting ? 'Adding…' : 'Add to manifest'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

export default AddManifestModal;
