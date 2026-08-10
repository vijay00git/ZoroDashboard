import { useState } from 'react';
import ModalPortal from './ModalPortal';
import TagChipInput from './TagChipInput';

const TagModal = ({ caseId, caseTitle, existing, onClose, onSave }) => {
  const [tags, setTags] = useState(existing || []);
  const [saving, setSaving] = useState(false);

  const save = async (next) => {
    setSaving(true);
    await onSave(caseId, next);
    setSaving(false);
  };

  return (
    <ModalPortal>
      <div className="tcd-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="tcd-modal" role="dialog" aria-modal="true">
          <h3>Tags on {caseId}</h3>
          <div className="tcd-modal-path">{caseTitle}</div>
          <div className="tcd-field">
            <label>Tags</label>
            <TagChipInput tags={tags} onChange={setTags} autoFocus placeholder="e.g. smoke, flaky, regression" />
            <p className="tcd-modal-hint">Press Enter or comma to add a tag.</p>
          </div>
          <div className="tcd-modal-actions">
            {tags.length > 0 && <button className="tcd-btn" style={{ marginRight: 'auto' }} disabled={saving} onClick={() => setTags([])}>Clear all</button>}
            <button className="tcd-btn" onClick={onClose}>Cancel</button>
            <button className="tcd-btn primary" disabled={saving} onClick={() => save(tags)}>Save tags</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default TagModal;
