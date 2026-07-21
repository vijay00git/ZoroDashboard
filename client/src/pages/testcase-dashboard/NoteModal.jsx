import { useState } from 'react';
import ModalPortal from './ModalPortal';

const NoteModal = ({ caseId, caseTitle, existing, onClose, onSave }) => {
  const [text, setText] = useState(existing ? existing.text : '');
  const [saving, setSaving] = useState(false);

  const save = async (value) => {
    setSaving(true);
    await onSave(caseId, value);
    setSaving(false);
  };

  return (
    <ModalPortal>
    <div className="tcd-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tcd-modal" role="dialog" aria-modal="true">
        <h3>Note on {caseId}</h3>
        <div className="tcd-modal-path">{caseTitle}</div>
        <div className="tcd-field">
          <label>Note</label>
          <textarea
            rows={4}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Known flaky, ticket JIRA-123"
          />
        </div>
        <div className="tcd-modal-actions">
          {existing && <button className="tcd-btn" style={{ marginRight: 'auto' }} disabled={saving} onClick={() => save('')}>Clear note</button>}
          <button className="tcd-btn" onClick={onClose}>Cancel</button>
          <button className="tcd-btn primary" disabled={saving} onClick={() => save(text.trim())}>Save note</button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

export default NoteModal;
