import { useEffect, useState } from 'react';
import ModalPortal from '../testcase-dashboard/ModalPortal';
import { X, ExternalLink, Copy, Loader2, CircleCheck, UserCheck, Tag, GitCompareArrows } from 'lucide-react';
import { copyText } from '../testcase-dashboard/helpers';
import { fmtTested } from './helpers';
import { CY_BY_KEY } from './cypressCompare';

const Field = ({ label, children }) => (
  <div className="frl-dw-field">
    <span className="frl-dw-field-label">{label}</span>
    <span className="frl-dw-field-value">{children || '—'}</span>
  </div>
);

// Side panel for one test: the cached row's fields immediately, then the
// case content and full result history fetched from TestRail on open.
const TestDrawer = ({ row, ctx, onClose, onFilter, onEdit }) => {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/filter-rail/tests/${row.id}`)
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (ok) setDetail(body); else setError(body.error || 'Could not load details');
      })
      .catch(() => { if (!cancelled) setError('Could not reach the server'); });
    return () => { cancelled = true; };
  }, [row.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const status = ctx.statusById.get(row.statusId);

  return (
    <ModalPortal>
    <div className="frl-dw-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="frl-dw" role="dialog" aria-modal="true" aria-label={`Test T${row.id}`}>
        <header className="frl-dw-head">
          <div className="frl-dw-ids">
            {ctx.testUrl(row.id)
              ? <a href={ctx.testUrl(row.id)} target="_blank" rel="noreferrer">T{row.id} <ExternalLink size={11} /></a>
              : <span>T{row.id}</span>}
            {ctx.caseUrl(row.caseId)
              ? <a href={ctx.caseUrl(row.caseId)} target="_blank" rel="noreferrer">C{row.caseId} <ExternalLink size={11} /></a>
              : <span>C{row.caseId}</span>}
            <button type="button" className="frl-icon-btn" title="Copy case ID" onClick={() => copyText(`C${row.caseId}`)}><Copy size={13} /></button>
          </div>
          <button type="button" className="frl-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <h2 className="frl-dw-title">{row.title}</h2>
        <div className="frl-dw-path">{ctx.idx.pathOf(row.sectionId) || 'Unknown section'}</div>
        <div className="frl-dw-actions">
          <button type="button" className="trr-btn small" onClick={() => onEdit('status')}><CircleCheck size={12} /> Set status</button>
          <button type="button" className="trr-btn small" onClick={() => onEdit('assign')}><UserCheck size={12} /> Assign</button>
          <button type="button" className="trr-btn small" onClick={() => onEdit('labels')}><Tag size={12} /> Labels</button>
        </div>

        <div className="frl-dw-grid">
          <Field label="Status">
            {status && <span className="frl-status" style={{ '--st': status.color }}>{status.label}</span>}
          </Field>
          <Field label="Assignee">
            <button type="button" className="frl-link" onClick={() => onFilter('assignee', row.assignedTo ?? '__none')}>{ctx.userName(row.assignedTo)}</button>
          </Field>
          <Field label="Tested by">
            {row.testedBy != null
              ? <button type="button" className="frl-link" onClick={() => onFilter('tester', row.testedBy)}>{ctx.userName(row.testedBy)}</button>
              : 'Not tested'}
          </Field>
          <Field label="Tested on">{fmtTested(row.testedOn)}</Field>
          <Field label="Priority">{ctx.priorityName(row.priorityId)}</Field>
          <Field label="Type">{ctx.typeName(row.typeId)}</Field>
          <Field label="Automated">{row.automation ? 'Yes' : 'No'}</Field>
          <Field label="Estimate">{row.estimate}</Field>
          <Field label="Elapsed">{row.elapsed}</Field>
          <Field label="Version">{row.version}</Field>
          <Field label="References">{ctx.renderRefs(row.refs)}</Field>
          <Field label="Defects">{ctx.renderDefects(row.defects)}</Field>
        </div>
        {ctx.cyCategory && (() => {
          const cat = CY_BY_KEY.get(ctx.cyCategory(row));
          const info = ctx.cyInfo(row);
          return (
            <section className="frl-dw-section">
              <h3><GitCompareArrows size={12} /> Cypress Runner</h3>
              <span className="frl-cy-pill static" style={{ '--cy': cat.color }}>{cat.label}</span>
              {info && (
                <ul className="frl-dw-files">
                  {info.files.map((f) => (
                    <li key={f.path} className="frl-mono">{f.path}{f.commented && <em className="frl-muted"> · commented out</em>}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })()}
        {row.labels.length > 0 && (
          <div className="frl-dw-labels">
            {row.labels.map((l) => (
              <button key={l} type="button" className="frl-label" onClick={() => onFilter('label', l)}>{l}</button>
            ))}
          </div>
        )}

        {error && <p className="frl-error">{error}</p>}
        {!detail && !error && <p className="frl-muted"><Loader2 size={13} className="frl-spin" /> Loading case content and history…</p>}
        {detail && (
          <>
            {[['Preconditions', detail.preconds], ['Steps', detail.steps], ['Expected result', detail.expected]].map(([h, text]) => (
              text ? (
                <section key={h} className="frl-dw-section">
                  <h3>{h}</h3>
                  <p className="frl-dw-text">{text}</p>
                </section>
              ) : null
            ))}
            <section className="frl-dw-section">
              <h3>Result history <span className="frl-muted">({detail.results.length})</span></h3>
              {detail.results.length === 0 ? <p className="frl-muted">No results yet.</p> : (
                <ol className="frl-dw-timeline">
                  {detail.results.map((r) => {
                    const st = ctx.statusById.get(r.statusId);
                    return (
                      <li key={r.id}>
                        <span className="frl-dw-tl-dot" style={{ background: st ? st.color : 'var(--text-muted)' }} />
                        <div>
                          <div className="frl-dw-tl-head">
                            {st ? <span className="frl-status" style={{ '--st': st.color }}>{st.label}</span> : <span className="frl-muted">Comment</span>}
                            <span>{ctx.userName(r.createdBy)}</span>
                            <span className="frl-muted">{fmtTested(r.createdOn)}</span>
                            {r.elapsed && <span className="frl-muted">· {r.elapsed}</span>}
                          </div>
                          {r.defects && <div className="frl-dw-tl-defects">{ctx.renderDefects(r.defects.split(',').map((d) => d.trim()).filter(Boolean))}</div>}
                          {r.assignedTo != null && <div className="frl-muted small">Assigned to {ctx.userName(r.assignedTo)}</div>}
                          {r.comment && <p className="frl-dw-text small">{r.comment}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
    </ModalPortal>
  );
};

export default TestDrawer;
