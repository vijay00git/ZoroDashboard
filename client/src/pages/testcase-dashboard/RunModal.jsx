import { useState } from 'react';
import { CAT_LABELS } from './helpers';
import ModalPortal from './ModalPortal';

const RunModal = ({ filesToRun, jenkinsConfig, currentRunId, onClose, onSubmit }) => {
  const cats = Array.from(new Set(filesToRun.map((f) => f.cat)));
  const [pinByCat, setPinByCat] = useState(() => Object.fromEntries(cats.map((c) => [c, ''])));
  const [environment, setEnvironment] = useState(() => localStorage.getItem('tcd_last_env') || jenkinsConfig.defaultEnvironment);
  const [runId, setRunId] = useState(currentRunId || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    localStorage.setItem('tcd_last_env', environment);
    setSubmitting(true);
    await onSubmit(
      filesToRun.map((f) => ({ path: f.path, category: f.cat, pinnedJob: pinByCat[f.cat] || null })),
      environment,
      runId.trim()
    );
    setSubmitting(false);
  };

  return (
    <ModalPortal>
    <div className="tcd-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tcd-modal" role="dialog" aria-modal="true">
        <h3>Run on Jenkins{filesToRun.length > 1 ? ` — ${filesToRun.length} files` : ''}</h3>
        <div className="tcd-modal-path" style={filesToRun.length > 1 ? { maxHeight: '8rem', overflowY: 'auto' } : undefined}>
          {filesToRun.length === 1 ? filesToRun[0].path : filesToRun.map((f) => f.path).join('\n')}
        </div>

        {cats.map((cat) => {
          const jobOptions = jenkinsConfig.jobs[cat] || [];
          const countInCat = filesToRun.filter((f) => f.cat === cat).length;
          const autoNote = jobOptions.length > 1 ? ' — auto-picks whichever\'s free' : '';
          return (
            <div className="tcd-field" key={cat}>
              <label>{CAT_LABELS[cat]} job ({countInCat} file{countInCat === 1 ? '' : 's'}){autoNote}</label>
              <select value={pinByCat[cat]} onChange={(e) => setPinByCat((p) => ({ ...p, [cat]: e.target.value }))}>
                <option value="">Auto (recommended)</option>
                {jobOptions.map((j) => <option key={j} value={j}>Pin to {j}</option>)}
              </select>
            </div>
          );
        })}

        <div className="tcd-field">
          <label>Environment</label>
          <select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
            {jenkinsConfig.environments.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>

        <div className="tcd-field">
          <label>TestRail run ID (optional — results sync to this run)</label>
          <input type="text" inputMode="numeric" value={runId} onChange={(e) => setRunId(e.target.value)} placeholder="e.g. 8401" />
        </div>

        {filesToRun.length > 1 && <p className="tcd-modal-hint">Each build starts as soon as a job in its tier is free — multiple can run at once.</p>}

        <div className="tcd-modal-actions">
          <button className="tcd-btn" onClick={onClose}>Cancel</button>
          <button className="tcd-btn primary" disabled={submitting} onClick={handleSubmit}>
            {submitting ? 'Queuing…' : (filesToRun.length > 1 ? `Queue ${filesToRun.length} builds` : 'Trigger build')}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
};

export default RunModal;
