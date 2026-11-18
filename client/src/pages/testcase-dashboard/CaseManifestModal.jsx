import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Download, Plus, Trash2, Pin, PinOff } from 'lucide-react';
import ModalPortal from './ModalPortal';

// Case-mode manifest, shared by Cypress Runner and Jenkins Runner: the TestRail
// case IDs we own. Specs aren't stored — each case's spec is found from the
// it() titles, so a case moved into another spec is followed automatically.
const CaseManifestModal = ({ onClose, onChanged }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [ids, setIds] = useState('');
  const [group, setGroup] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('');
  const [view, setView] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/testcases/case-manifest');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      setData(json);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  // Initial load: setState only happens after the fetch resolves.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { load(); }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const post = async (url, body) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      await load();
      if (onChanged) onChanged();
      return json;
    } catch (e) {
      setMessage(`Error: ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const effectiveGroup = group === '__new__' ? newGroup.trim() : group;

  const handleAdd = async () => {
    const r = await post('/api/testcases/case-manifest/add', { ids, grp: effectiveGroup, note });
    if (!r) return;
    setIds('');
    setNote('');
    const parts = [`Added ${r.added.length}`];
    if (r.skipped.length) parts.push(`${r.skipped.length} already owned`);
    if (r.notInRepo.length) parts.push(`not in any spec yet: ${r.notInRepo.join(', ')}`);
    setMessage(parts.join(' · '));
  };

  const handleRemove = async (list) => {
    if (!list.length) return;
    if (!window.confirm(`Stop owning ${list.length} case${list.length === 1 ? '' : 's'}? They will no longer be shown or run.`)) return;
    const r = await post('/api/testcases/case-manifest/remove', { ids: list });
    if (r) { setSelected(new Set()); setMessage(`Removed ${r.removed.length}`); }
  };

  const pin = (id, paths) => post('/api/testcases/case-manifest/update', { id, paths });

  const term = filter.trim().toLowerCase();
  const cases = useMemo(() => {
    if (!data) return [];
    return data.cases.filter((c) => {
      const live = c.locations.filter((l) => !l.commented);
      if (view === 'unresolved' && c.locations.length) return false;
      if (view === 'multi' && new Set(live.map((l) => l.path)).size < 2) return false;
      if (view === 'commented' && !(c.locations.length && live.length === 0)) return false;
      if (!term) return true;
      return c.id.toLowerCase().includes(term) || c.grp.toLowerCase().includes(term)
        || c.locations.some((l) => l.path.toLowerCase().includes(term) || l.title.toLowerCase().includes(term));
    });
  }, [data, view, term]);

  const byGroup = useMemo(() => {
    const m = {};
    cases.forEach((c) => { (m[c.grp || 'Ungrouped'] = m[c.grp || 'Ungrouped'] || []).push(c); });
    return Object.entries(m).sort(([a], [b]) => a.localeCompare(b));
  }, [cases]);

  const counts = useMemo(() => {
    const all = data ? data.cases : [];
    return {
      all: all.length,
      unresolved: all.filter((c) => !c.locations.length).length,
      multi: all.filter((c) => new Set(c.locations.filter((l) => !l.commented).map((l) => l.path)).size > 1).length,
      commented: all.filter((c) => c.locations.length && c.locations.every((l) => l.commented)).length,
    };
  }, [data]);

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <ModalPortal>
      <div className="tcd-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="tcd-modal full manifest-modal" role="dialog" aria-modal="true">
          <div className="manifest-modal-header">
            <h3>Case manifest {data ? `(${data.cases.length} cases)` : ''}</h3>
            <div className="manifest-modal-header-actions">
              {selected.size > 0 && (
                <button type="button" className="tcd-btn" disabled={busy} onClick={() => handleRemove([...selected])}>
                  <Trash2 size={14} /> Remove {selected.size}
                </button>
              )}
              <button type="button" className="tcd-btn" onClick={() => window.open('/api/testcases/case-manifest/download', '_blank')}>
                <Download size={14} /> Download .json
              </button>
              <button type="button" className="tcd-icon-btn" onClick={onClose} aria-label="Close">
                <X size={16} />
              </button>
            </div>
          </div>

          <p className="tcd-modal-hint">
            Cases we own. Each case's spec is looked up from the it() titles on every refresh, and runs pass
            <code> grepTags=@C… @setup</code> so only these cases run inside shared specs.
            {data && <> File: <code>{data.path}</code></>}
          </p>

          <div className="manifest-add-row">
            <input
              type="text"
              className="manifest-path-input"
              value={ids}
              onChange={(e) => setIds(e.target.value)}
              placeholder="Case IDs — C2262789, C2262790 … (paste any text containing them)"
            />
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">Group…</option>
              {(data ? data.groups : []).map((g) => <option key={g} value={g}>{g}</option>)}
              <option value="__new__">+ New group…</option>
            </select>
            {group === '__new__' && (
              <input type="text" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="New group name" />
            )}
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
            <button type="button" className="tcd-btn primary" disabled={busy || !ids.trim()} onClick={handleAdd}>
              <Plus size={14} /> {busy ? 'Saving…' : 'Add'}
            </button>
          </div>
          {message && <p className="tcd-modal-hint">{message}</p>}
          {error && <p className="tcd-modal-hint">Error: {error}</p>}

          <div className="manifest-add-row">
            {[['all', 'All'], ['unresolved', 'Not in any spec'], ['multi', 'In 2+ specs'], ['commented', 'Commented out']].map(([k, label]) => (
              <button key={k} type="button" className={`tcd-btn${view === k ? ' primary' : ''}`} onClick={() => setView(k)}>
                {label} ({counts[k]})
              </button>
            ))}
            <input
              type="text"
              className="tcd-search-input manifest-filter-input"
              placeholder="Filter by ID, title, group or spec…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <div className="manifest-list">
            {!data && !error && <p className="tcd-modal-hint">Loading…</p>}
            {data && byGroup.length === 0 && <p className="tcd-modal-hint">No cases match.</p>}
            {byGroup.map(([grp, list]) => (
              <div key={grp} className="manifest-group">
                <h4 className="manifest-group-title">{grp} <span>({list.length})</span></h4>
                {list.map((c) => {
                  const livePaths = [...new Set(c.locations.filter((l) => !l.commented).map((l) => l.path))];
                  const title = (c.locations[0] || {}).title || '';
                  return (
                    <div key={c.id} className={`manifest-row${c.locations.length ? '' : ' missing'}`}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.id}`} />
                      <strong>{c.id}</strong>
                      <span title={title}>{title.length > 90 ? `${title.slice(0, 89)}…` : title}</span>
                      {c.locations.length === 0 && <span className="manifest-missing-badge">not in any spec</span>}
                      {c.locations.length > 0 && livePaths.length === 0 && <span className="manifest-missing-badge">commented out</span>}
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {[...new Set(c.locations.map((l) => l.path))].map((p) => {
                          const pinned = c.paths && c.paths.includes(p);
                          return (
                            <span key={p} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <code style={{ opacity: c.paths && !pinned ? 0.45 : 1 }}>{p.replace('cypress/e2e/functional_tests/Regression/', '')}</code>
                              {livePaths.length > 1 && (
                                <button
                                  type="button"
                                  className="tcd-icon-btn"
                                  title={pinned ? 'Unpin (run in every spec it appears in)' : 'Run only this spec for this case'}
                                  onClick={() => pin(c.id, pinned ? [] : [p])}
                                >
                                  {pinned ? <PinOff size={12} /> : <Pin size={12} />}
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </span>
                      {c.note && <span className="manifest-count" title={c.note}>note</span>}
                      <button type="button" className="tcd-icon-btn" title="Remove from manifest" aria-label={`Remove ${c.id}`} onClick={() => handleRemove([c.id])}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default CaseManifestModal;
