import { useEffect, useMemo, useState } from 'react';
import ModalPortal from '../testcase-dashboard/ModalPortal';
import { X, Loader2, Search, Tag, UserCheck, CircleCheck, AlertTriangle } from 'lucide-react';
import { showConfirm } from '../../utils/Alerts';

const TITLES = {
  status: { icon: CircleCheck, text: 'Set status' },
  assign: { icon: UserCheck, text: 'Assign' },
  labels: { icon: Tag, text: 'Edit labels' },
};
const CONFIRM_ABOVE = 25;

// One dialog for the three TestRail write actions on a set of tests in the
// current run. Status/assign are posted as results (TestRail's own way of
// recording both); labels are the run's test labels.
const EditModal = ({ kind, rows, runId, statuses, options, optionsError, initial, onDone, onClose }) => {
  const [statusId, setStatusId] = useState(initial?.statusId ?? null);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [defects, setDefects] = useState('');
  const [assignee, setAssignee] = useState(null);
  const [userQ, setUserQ] = useState('');
  const [labelOps, setLabelOps] = useState({}); // labelId -> 'add' | 'remove'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const n = rows.length;
  const settable = statuses.filter((s) => !s.isUntested);

  const users = useMemo(() => {
    const list = (options?.users || []).map((u) => ({ ...u, label: u.name || `User #${u.id}`, me: u.id === options.currentUserId }));
    const term = userQ.trim().toLowerCase();
    return list
      .filter((u) => !term || u.label.toLowerCase().includes(term) || String(u.id).includes(term))
      .sort((a, b) => (b.me - a.me) || (!!b.name - !!a.name) || a.label.localeCompare(b.label));
  }, [options, userQ]);

  // How many of the target tests already carry each label, and how many
  // would exceed TestRail's per-test cap after the pending changes.
  const labelStats = useMemo(() => {
    if (kind !== 'labels' || !options) return { have: new Map(), overCap: 0 };
    const have = new Map();
    rows.forEach((r) => r.labels.forEach((l) => have.set(l, (have.get(l) || 0) + 1)));
    const nameById = new Map(options.labels.map((l) => [l.id, l.name]));
    const adds = Object.entries(labelOps).filter(([, op]) => op === 'add').map(([id]) => nameById.get(Number(id)));
    const removes = new Set(Object.entries(labelOps).filter(([, op]) => op === 'remove').map(([id]) => nameById.get(Number(id))));
    const overCap = rows.filter((r) => new Set([...r.labels.filter((l) => !removes.has(l)), ...adds]).size > options.maxLabels).length;
    return { have, overCap };
  }, [kind, rows, options, labelOps]);

  const pendingLabelOps = Object.values(labelOps).filter(Boolean).length;
  const canApply = !saving && !!options && (
    (kind === 'status' && statusId != null)
    || (kind === 'assign' && assignee != null)
    || (kind === 'labels' && pendingLabelOps > 0 && labelStats.overCap === 0)
  );

  const apply = async () => {
    if (n > CONFIRM_ABOVE && !(await showConfirm(`Update ${n} tests in TestRail run R${runId}? This writes to TestRail and can't be undone from here.`))) return;
    setSaving(true);
    setError(null);
    try {
      const testIds = rows.map((r) => r.id);
      const [url, body] = kind === 'labels'
        ? [`/api/filter-rail/runs/${runId}/labels`, {
          testIds,
          add: Object.entries(labelOps).filter(([, op]) => op === 'add').map(([id]) => Number(id)),
          remove: Object.entries(labelOps).filter(([, op]) => op === 'remove').map(([id]) => Number(id)),
        }]
        : [`/api/filter-rail/runs/${runId}/results`, {
          testIds,
          statusId: kind === 'status' ? statusId : undefined,
          assignedTo: kind === 'assign' ? assignee : undefined,
          comment,
          defects: kind === 'status' ? defects : undefined,
        }];
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Update failed');
      onDone(out);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  const Title = TITLES[kind];
  const statusName = (id) => statuses.find((s) => s.id === id)?.label;

  return (
    <ModalPortal>
    <div className="frl-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="frl-modal frl-edit" role="dialog" aria-modal="true" aria-label={Title.text}>
        <div className="frl-edit-head">
          <h3><Title.icon size={15} /> {Title.text}</h3>
          <button type="button" className="frl-icon-btn" onClick={onClose} disabled={saving} aria-label="Close"><X size={15} /></button>
        </div>
        <p className="frl-muted">
          {n === 1 ? <><span className="frl-mono">C{rows[0].caseId}</span> {rows[0].title}</> : <><strong>{n.toLocaleString()} tests</strong> in run R{runId}</>}
        </p>

        {!options && !optionsError && <p className="frl-muted"><Loader2 size={13} className="frl-spin" /> Loading TestRail options…</p>}
        {optionsError && <p className="frl-error">{optionsError}</p>}

        {options && kind === 'status' && (
          <>
            <div className="frl-edit-statuses" role="radiogroup" aria-label="Status">
              {settable.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={statusId === s.id} className={`frl-edit-status${statusId === s.id ? ' on' : ''}`} style={{ '--st': s.color }} onClick={() => setStatusId(s.id)}>
                  <span className="frl-dot" style={{ background: s.color }} /> {s.label}
                </button>
              ))}
            </div>
            <label className="frl-edit-field">
              <span>Comment <em className="frl-muted">(optional)</em></span>
              <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Added to the result in TestRail" />
            </label>
            <label className="frl-edit-field">
              <span>Defects <em className="frl-muted">(optional, comma-separated)</em></span>
              <input value={defects} onChange={(e) => setDefects(e.target.value)} placeholder="EVB-1234, IC-567" />
            </label>
          </>
        )}

        {options && kind === 'assign' && (
          <>
            <div className="frl-ms-search">
              <Search size={12} />
              <input autoFocus placeholder="Find a person…" value={userQ} onChange={(e) => setUserQ(e.target.value)} />
            </div>
            <ul className="frl-edit-users" role="radiogroup" aria-label="Assignee">
              {users.map((u) => (
                <li key={u.id}>
                  <button type="button" role="radio" aria-checked={assignee === u.id} className={assignee === u.id ? 'on' : ''} onClick={() => setAssignee(u.id)}>
                    <span>{u.label}{u.me && <em className="frl-muted"> (you)</em>}</span>
                    <span className="frl-mono frl-muted">#{u.id}</span>
                  </button>
                </li>
              ))}
              {users.length === 0 && <li className="frl-muted frl-pad">No match.</li>}
            </ul>
            <p className="frl-muted small">
              Only people seen in this run, plus anyone you've named, are listed. Your TestRail key can't list every user.
            </p>
            <label className="frl-edit-field">
              <span>Comment <em className="frl-muted">(optional)</em></span>
              <input value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
          </>
        )}

        {options && kind === 'labels' && (
          <>
            <p className="frl-muted small">These are labels on the tests in this run. The cases in the suite and other runs aren't changed.</p>
            <ul className="frl-edit-labels">
              {options.labels.map((l) => {
                const have = labelStats.have.get(l.name) || 0;
                const op = labelOps[l.id] || '';
                return (
                  <li key={l.id}>
                    <span className="frl-label static">{l.name}</span>
                    <span className="frl-muted small">{have === 0 ? 'none have it' : have === n ? (n === 1 ? 'has it' : 'all have it') : `${have} of ${n} have it`}</span>
                    <div className="frl-edit-seg" role="radiogroup" aria-label={`${l.name} change`}>
                      {[['', 'Keep'], ['add', 'Add'], ['remove', 'Remove']].map(([v, text]) => (
                        <button
                          key={v || 'keep'}
                          type="button"
                          role="radio"
                          aria-checked={op === v}
                          className={`${op === v ? 'on' : ''} ${v}`}
                          disabled={(v === 'add' && have === n) || (v === 'remove' && have === 0)}
                          onClick={() => setLabelOps((o) => ({ ...o, [l.id]: v }))}
                        >{text}</button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            {labelStats.overCap > 0 && (
              <p className="frl-error"><AlertTriangle size={13} /> {labelStats.overCap} test(s) would have more than {options.maxLabels} labels, TestRail's limit.</p>
            )}
          </>
        )}

        {error && <p className="frl-error"><AlertTriangle size={13} /> {error}</p>}

        <div className="frl-modal-actions">
          <span className="frl-muted small frl-edit-summary">
            {kind === 'status' && statusId != null && `Adds a “${statusName(statusId)}” result to ${n === 1 ? 'this test' : `${n} tests`} as you.`}
            {kind === 'assign' && assignee != null && `Assigns ${n === 1 ? 'this test' : `${n} tests`} to ${users.find((u) => u.id === assignee)?.label || `User #${assignee}`}.`}
            {kind === 'labels' && pendingLabelOps > 0 && `${pendingLabelOps} label change${pendingLabelOps === 1 ? '' : 's'} on ${n === 1 ? 'this test' : `${n} tests`}.`}
          </span>
          <button type="button" className="trr-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="trr-btn primary" onClick={apply} disabled={!canApply}>
            {saving ? <><Loader2 size={13} className="frl-spin" /> Saving…</> : `Update in TestRail`}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

export default EditModal;
