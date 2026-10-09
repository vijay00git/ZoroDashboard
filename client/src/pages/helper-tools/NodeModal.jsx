import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// node === null means "add"; a real node object means "edit". The password
// field never gets pre-filled on edit (the server never sends it back) —
// leaving it blank on save keeps whatever password is already stored.
const NodeModal = ({ node, onClose, onSave }) => {
  const isEdit = !!node;
  const [name, setName] = useState(node?.name || '');
  const [host, setHost] = useState(node?.host || '');
  const [port, setPort] = useState(node?.port || 22);
  const [username, setUsername] = useState(node?.username || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !host.trim() || !username.trim() || (!isEdit && !password.trim())) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        host: host.trim(),
        port: port || 22,
        username: username.trim(),
        password: password.trim() || undefined,
      }, node?.id);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="ht-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ht-modal" role="dialog" aria-modal="true">
        <div className="ht-modal-head">
          <h3>{isEdit ? 'Edit node' : 'Add node'}</h3>
          <button type="button" className="ht-icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="ht-modal-form">
          <label className="ht-field">
            <span>Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lab Node 1" required />
          </label>
          <div className="ht-field-row">
            <label className="ht-field ht-field-wide">
              <span>Host</span>
              <input type="text" value={host} onChange={(e) => setHost(e.target.value)} placeholder="10.42.24.115" required />
            </label>
            <label className="ht-field ht-field-narrow">
              <span>Port</span>
              <input type="number" value={port} onChange={(e) => setPort(e.target.value)} />
            </label>
          </div>
          <label className="ht-field">
            <span>Username</span>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="elo" required />
          </label>
          <label className="ht-field">
            <span>Password {isEdit && <em>(leave blank to keep the existing one)</em>}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? '••••••••' : ''}
              required={!isEdit}
            />
          </label>
          <div className="ht-modal-actions">
            <button type="button" className="ht-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="ht-btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default NodeModal;
