import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, Smartphone, AlertTriangle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { showConfirm } from '../../utils/Alerts';
import NodeModal from './NodeModal';

const STATUS_META = {
  device: { label: 'Online', cls: 'ht-status-online' },
  offline: { label: 'Offline', cls: 'ht-status-offline' },
  unauthorized: { label: 'Unauthorized', cls: 'ht-status-unauth' },
};
function statusMeta(status) {
  return STATUS_META[status] || { label: status, cls: 'ht-status-unknown' };
}

// SSH into each saved node on demand (never polled automatically — adb
// commands over SSH aren't free, and a lab node going briefly unreachable
// shouldn't spam errors) and list its connected Android devices.
const DeviceCheckerTool = () => {
  const { showToast } = useToast();
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalNode, setModalNode] = useState(null); // null = closed, {} = add, {...node} = edit
  const [checkingId, setCheckingId] = useState(null);
  const [results, setResults] = useState({}); // nodeId -> { devices, checkedAt } | { error }

  // The server persists each node's most recent check result (lastCheck), so
  // a result stays on screen across a page reload or navigating away and
  // back — it's only ever replaced by clicking "Check devices" again. Seeds
  // local state from it without clobbering anything a check already placed
  // there in this session (never happens in practice since the server
  // always saves lastCheck right before responding to a check, but cheap
  // to guard anyway).
  const fetchNodes = () => {
    fetch('/api/helper-tools/nodes', { cache: 'no-store' })
      .then((r) => r.json())
      .then((list) => {
        setNodes(list);
        setResults((prev) => {
          const next = { ...prev };
          list.forEach((n) => { if (!(n.id in next) && n.lastCheck) next[n.id] = n.lastCheck; });
          return next;
        });
      })
      .catch(() => showToast('Failed to load saved nodes', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchNodes(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheck = async (node) => {
    setCheckingId(node.id);
    try {
      const res = await fetch(`/api/helper-tools/nodes/${node.id}/check-devices`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setResults((prev) => ({ ...prev, [node.id]: { error: body.error || 'Check failed' } }));
        showToast(body.error || 'Check failed', 'error');
        return;
      }
      setResults((prev) => ({ ...prev, [node.id]: { devices: body.devices, checkedAt: body.checkedAt } }));
    } catch (err) {
      setResults((prev) => ({ ...prev, [node.id]: { error: err.message } }));
      showToast(err.message, 'error');
    } finally {
      setCheckingId(null);
    }
  };

  const handleSaveNode = async (form, editingId) => {
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/helper-tools/nodes/${editingId}` : '/api/helper-tools/nodes';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const body = await res.json();
    if (!res.ok) { showToast(body.error || "Couldn't save node", 'error'); return; }
    showToast(editingId ? 'Node updated' : 'Node added', 'success');
    setModalNode(null);
    fetchNodes();
  };

  const handleDeleteNode = async (node) => {
    if (!(await showConfirm(`Remove node "${node.name}" (${node.host})? This only removes it from this tool — the machine itself is unaffected.`))) return;
    const res = await fetch(`/api/helper-tools/nodes/${node.id}`, { method: 'DELETE' });
    if (!res.ok) { showToast("Couldn't delete node", 'error'); return; }
    showToast('Node removed', 'success');
    setResults((prev) => { const copy = { ...prev }; delete copy[node.id]; return copy; });
    fetchNodes();
  };

  return (
    <div className="ht-tool">
      <div className="ht-tool-header">
        <div>
          <h2><Smartphone size={16} /> Node Device Checker</h2>
          <p>SSH into a saved node and list which Android devices are connected — status, model, and Android version.</p>
        </div>
        <button type="button" className="ht-btn primary" onClick={() => setModalNode({})}>
          <Plus size={14} /> Add node
        </button>
      </div>

      {loading ? (
        <p className="ht-empty">Loading saved nodes…</p>
      ) : nodes.length === 0 ? (
        <p className="ht-empty">No nodes saved yet — click "Add node" to save your first one.</p>
      ) : (
        <div className="ht-node-list">
          {nodes.map((node) => {
            const result = results[node.id];
            const isChecking = checkingId === node.id;
            return (
              <div key={node.id} className="ht-node-card">
                <div className="ht-node-card-head">
                  <div className="ht-node-info">
                    <span className="ht-node-name">{node.name}</span>
                    <span className="ht-node-sub">{node.username}@{node.host}:{node.port}</span>
                  </div>
                  <div className="ht-node-actions">
                    <button type="button" className="ht-btn primary small" disabled={isChecking} onClick={() => handleCheck(node)}>
                      <RefreshCw size={12} className={isChecking ? 'ht-spin' : ''} /> {isChecking ? 'Checking…' : 'Check devices'}
                    </button>
                    <button type="button" className="ht-icon-btn" title="Edit node" aria-label="Edit node" onClick={() => setModalNode(node)}>
                      <Pencil size={13} />
                    </button>
                    <button type="button" className="ht-icon-btn" title="Delete node" aria-label="Delete node" onClick={() => handleDeleteNode(node)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {result && (
                  <div className="ht-node-result">
                    {result.error ? (
                      <div className="ht-result-error"><AlertTriangle size={13} /> {result.error}</div>
                    ) : result.devices.length === 0 ? (
                      <p className="ht-empty">No devices connected.</p>
                    ) : (
                      <table className="ht-device-table">
                        <thead>
                          <tr><th>Serial</th><th>Status</th><th>Model</th><th>Android</th></tr>
                        </thead>
                        <tbody>
                          {result.devices.map((d) => {
                            const meta = statusMeta(d.status);
                            return (
                              <tr key={d.serial}>
                                <td className="ht-mono">{d.serial}</td>
                                <td><span className={`ht-status-pill ${meta.cls}`}>{meta.label}</span></td>
                                <td>{d.model || '—'}</td>
                                <td>{d.androidVersion || '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    {result.checkedAt && <div className="ht-checked-at">Checked {new Date(result.checkedAt).toLocaleTimeString()}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalNode && (
        <NodeModal
          node={modalNode.id ? modalNode : null}
          onClose={() => setModalNode(null)}
          onSave={handleSaveNode}
        />
      )}
    </div>
  );
};

export default DeviceCheckerTool;
