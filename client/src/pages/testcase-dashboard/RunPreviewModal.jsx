import { useEffect, useState } from 'react';
import { X, Play, Copy, AlertTriangle } from 'lucide-react';
import ModalPortal from './ModalPortal';
import { copyText } from './helpers';

const short = (p) => String(p || '').replace('cypress/e2e/functional_tests/Regression/', '');

// Shown before any case run is queued: per spec, the exact grepTags string and
// the it() blocks it will select, so a missing tag or a case that isn't in that
// spec is caught before a long run.
const RunPreviewModal = ({ items, target, onConfirm, onClose }) => {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/cases/run-preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.map((i) => ({ path: i.path, cat: i.cat, cases: i.cases })), target }),
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => { if (!ok) throw new Error(body.error || 'Preview failed'); setPreview(body); })
      .catch((e) => setError(e.message));
  }, [items, target]);

  const problems = preview ? preview.items.filter((i) => i.error || (i.notFound && i.notFound.length) || i.caseTests === 0) : [];
  const totals = preview ? preview.items.reduce((t, i) => ({ tests: t.tests + (i.expectedTests || 0), cases: t.cases + (i.caseTests || 0), setup: t.setup + (i.setupTests || 0) }), { tests: 0, cases: 0, setup: 0 }) : null;
  const jk = preview && preview.jenkins;

  return (
    <ModalPortal>
      <div className="tcd-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="tcd-modal full" role="dialog" aria-modal="true">
          <div className="manifest-modal-header">
            <h3>Run preview — {items.length} spec{items.length === 1 ? '' : 's'} on {target === 'jenkins' ? 'Jenkins' : 'local Cypress'}</h3>
            <button type="button" className="tcd-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </div>
          {error && <p className="tcd-modal-hint">Error: {error}</p>}
          {!preview && !error && <p className="tcd-modal-hint">Checking tags…</p>}
          {preview && (
            <>
              <p className="tcd-modal-hint">
                Will run <b>{totals.tests}</b> it() block{totals.tests === 1 ? '' : 's'}: <b>{totals.cases}</b> case test{totals.cases === 1 ? '' : 's'} + <b>{totals.setup}</b> setup/precondition block{totals.setup === 1 ? '' : 's'}.
                {problems.length > 0 && <span style={{ color: 'var(--accent-red)' }}> {problems.length} spec{problems.length === 1 ? ' has' : 's have'} a problem — see below.</span>}
              </p>
              {target === 'jenkins' && jk && (
                <div className="ct-alerts" style={{ borderColor: jk.missing && jk.missing.length === 0 ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                  <div className="ct-alerts-head">
                    <AlertTriangle size={14} />
                    {jk.checkedAt === null && <span>Jenkins jobs haven&apos;t been checked for a <code>GREP_TAGS</code> parameter yet — without it Jenkins ignores the tags and runs the whole spec (other people&apos;s cases too).</span>}
                    {jk.checkedAt && jk.missing && jk.missing.length > 0 && <span>{jk.missing.length} Jenkins job{jk.missing.length === 1 ? '' : 's'} have no <code>GREP_TAGS</code> parameter ({jk.missing.join(', ')}) — those run the whole spec.</span>}
                    {jk.checkedAt && jk.missing && jk.missing.length === 0 && <span>All Jenkins jobs accept <code>GREP_TAGS</code> (checked {new Date(jk.checkedAt).toLocaleString()}).</span>}
                  </div>
                </div>
              )}
              <div className="ct-table-wrap" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                <table className="ct-table">
                  <thead>
                    <tr><th>Spec</th><th>grepTags</th><th>Will run</th><th>Checks</th></tr>
                  </thead>
                  <tbody>
                    {preview.items.map((i) => (
                      <tr key={i.path}>
                        <td style={{ maxWidth: 320 }}>
                          <div className="ct-sub" style={{ marginTop: 0 }}>{short(i.path)}</div>
                          <div className="ct-badges" style={{ marginTop: 4 }}>
                            {i.requested.map((c) => <span key={c} className="ct-badge purple">{c}</span>)}
                            {(i.deps || []).map((c) => <span key={c} className="ct-badge cyan" title="Dependency">{c}</span>)}
                          </div>
                        </td>
                        <td>
                          <code style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>{i.grepTags}</code>
                          <button type="button" className="tcd-icon-btn" title="Copy" onClick={() => copyText(i.grepTags)}><Copy size={11} /></button>
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {i.error ? '—' : <><b>{i.expectedTests}</b> of {i.specTests}<div className="ct-sub">{i.caseTests} case · {i.setupTests} setup</div></>}
                        </td>
                        <td>
                          <div className="ct-badges">
                            {i.error && <span className="ct-badge red">{i.error}</span>}
                            {i.notFound && i.notFound.length > 0 && <span className="ct-badge red">no tagged it() for {i.notFound.join(', ')}</span>}
                            {!i.error && i.setupTests === 0 && <span className="ct-badge orange">no setup blocks selected</span>}
                            {i.extraCases && i.extraCases.length > 0 && <span className="ct-badge yellow">also runs {i.extraCases.join(', ')} (clubbed)</span>}
                            {i.sharedOtherCases > 0 && <span className="ct-badge" title="Tag filtering keeps them out">shared spec: {i.sharedOtherCases} other case{i.sharedOtherCases === 1 ? '' : 's'} skipped</span>}
                            {!i.error && !(i.notFound && i.notFound.length) && i.setupTests > 0 && <span className="ct-badge cyan">OK</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="tcd-modal-actions">
            <button type="button" className="tcd-btn" onClick={onClose}>Cancel</button>
            <button type="button" className="tcd-btn primary" disabled={!preview} onClick={onConfirm}>
              <Play size={13} /> {problems.length ? 'Queue anyway' : 'Queue'} {items.length} spec{items.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default RunPreviewModal;
