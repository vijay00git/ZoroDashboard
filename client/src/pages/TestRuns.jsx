import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, X, AlertTriangle, ExternalLink, Link2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { showPrompt } from '../utils/Alerts';
import RunDetail from './test-runs/RunDetail';
import { StatusBar } from './test-runs/Charts';
import { orderedStatuses, parseRunIds, fmtNum, fmtPct, timeAgo } from './test-runs/helpers';
import './test-runs/TestRuns.css';

const LS_SELECTED = 'tr-test-runs-selected';
const ACTIVE_STATES = new Set(['queued', 'running']);

function JobProgress({ job }) {
  if (!job) return null;
  if (job.state === 'queued') return <span className="trr-muted">Queued{job.queuePosition ? ` (#${job.queuePosition})` : ''}…</span>;
  const pctDone = job.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : null;
  return (
    <div className="trr-job">
      <span className="trr-job-phase">
        {job.phase}{job.total ? ` — ${fmtNum(job.done)} / ${fmtNum(job.total)}` : job.done ? ` — ${fmtNum(job.done)} so far` : ''}
      </span>
      <div className="trr-progress-track">
        <div className={`trr-progress-fill ${pctDone === null ? 'indeterminate' : ''}`} style={pctDone === null ? undefined : { width: `${pctDone}%` }} />
      </div>
    </div>
  );
}

function CompareTable({ runIds, runs, onSelect }) {
  const loaded = runIds.filter((id) => runs[id]?.summary);
  if (loaded.length < 2) return null;
  const statuses = orderedStatuses(runs[loaded[0]].summary);
  const outcome = statuses.filter((s) => !s.isUntested);
  return (
    <div className="trr-card trr-section">
      <div className="trr-section-head"><span className="trr-section-title">Compare runs</span></div>
      <div className="trr-table-wrap">
        <table className="trr-table">
          <thead>
            <tr>
              <th>Run</th>
              <th className="num">Total</th>
              <th className="num">Progress</th>
              <th className="num">Pass rate</th>
              <th className="bar-col wide">Status mix</th>
              {outcome.map((s) => <th key={s.id} className="num">{s.label}</th>)}
              <th className="num">Untested</th>
              <th className="num">Testers</th>
              <th className="num">Bugs</th>
            </tr>
          </thead>
          <tbody>
            {loaded.map((id) => {
              const s = runs[id].summary;
              return (
                <tr key={id} className="trr-clickable" onClick={() => onSelect(id)}>
                  <td><span className="trr-mono-plain">R{id}</span> <span className="trr-run-name">{s.name}</span></td>
                  <td className="num strong">{fmtNum(s.total)}</td>
                  <td className="num">{fmtPct(s.executed, s.total)}</td>
                  <td className="num">{fmtPct(s.statusCounts[1] || 0, s.executed)}</td>
                  <td className="bar-col wide"><StatusBar statuses={statuses} counts={s.statusCounts} total={s.total} title={`R${id}`} /></td>
                  {outcome.map((st) => <td key={st.id} className="num">{fmtNum(s.statusCounts[st.id] || 0)}</td>)}
                  <td className="num">{fmtNum(s.untested)}</td>
                  <td className="num">{s.testers.filter((t) => t.userId !== 0).length}</td>
                  <td className="num">{s.defects.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TestRuns = () => {
  const { showToast } = useToast();
  const [settings, setSettings] = useState({ userNames: {}, jiraUrl: '', testrailUrl: null, savedRunIds: [] });
  const [runIds, setRunIds] = useState([]);
  const [runs, setRuns] = useState({}); // runId -> { summary, job }
  const [selected, setSelected] = useState(() => {
    try { return Number(localStorage.getItem(LS_SELECTED)) || null; } catch { return null; }
  });
  const [input, setInput] = useState('');
  const pollRef = useRef(null);

  const saveSettings = useCallback(async (patch) => {
    const res = await fetch('/api/test-runs/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Failed to save');
    const next = await res.json();
    setSettings((prev) => ({ ...prev, ...next }));
    return next;
  }, []);

  const loadRun = useCallback(async (id) => {
    const r = await fetch(`/api/test-runs/${id}`).then((x) => x.json());
    setRuns((prev) => ({ ...prev, [id]: { summary: r.summary, job: r.job } }));
    return r;
  }, []);

  const refreshRun = useCallback(async (id) => {
    await fetch(`/api/test-runs/${id}/refresh`, { method: 'POST' });
    return loadRun(id);
  }, [loadRun]);

  // Initial load: settings (incl. the saved run list), then each run's cache.
  useEffect(() => {
    fetch('/api/test-runs/settings').then((r) => r.json()).then(async (s) => {
      setSettings(s);
      const ids = s.savedRunIds || [];
      setRunIds(ids);
      setSelected((cur) => (ids.includes(cur) ? cur : ids[0] || null));
      for (const id of ids) {
        const r = await loadRun(id);
        if (!r.summary && !r.job) refreshRun(id);
      }
    }).catch(() => showToast('Could not reach the server', 'error'));
  }, [loadRun, refreshRun, showToast]);

  // Poll only while something is queued/running; reload the summary when a
  // job finishes.
  const anyActive = Object.values(runs).some((r) => r.job && ACTIVE_STATES.has(r.job.state));
  useEffect(() => {
    if (!anyActive) return undefined;
    pollRef.current = setInterval(() => {
      Object.entries(runs).forEach(([id, r]) => {
        if (r.job && ACTIVE_STATES.has(r.job.state)) {
          loadRun(Number(id)).then((next) => {
            if (next.job?.state === 'error') showToast(`R${id}: ${next.job.error}`, 'error');
            else if (next.job?.state === 'done') showToast(`R${id} loaded`, 'success');
          });
        }
      });
    }, 2000);
    return () => clearInterval(pollRef.current);
  }, [anyActive, runs, loadRun, showToast]);

  useEffect(() => {
    try { if (selected) localStorage.setItem(LS_SELECTED, String(selected)); } catch { /* storage unavailable */ }
  }, [selected]);

  const addRuns = async () => {
    const ids = parseRunIds(input).filter((id) => !runIds.includes(id));
    if (!ids.length) { showToast('Enter one or more new run IDs (e.g. 8941, 8950)', 'warning'); return; }
    const next = [...runIds, ...ids];
    setRunIds(next);
    setSelected(ids[0]);
    setInput('');
    saveSettings({ savedRunIds: next }).catch(() => showToast('Could not save the run list', 'warning'));
    for (const id of ids) {
      const r = await loadRun(id);
      if (!r.summary && !(r.job && ACTIVE_STATES.has(r.job.state))) refreshRun(id);
    }
  };

  const removeRun = (id) => {
    const next = runIds.filter((x) => x !== id);
    setRunIds(next);
    if (selected === id) setSelected(next[0] || null);
    saveSettings({ savedRunIds: next }).catch(() => {});
  };

  const refreshAll = () => runIds.forEach((id) => refreshRun(id));

  const renameUser = async (id) => {
    const name = await showPrompt(`Name for TestRail user #${id} (leave blank to clear)`, settings.userNames?.[id] || '');
    if (name === null || name === undefined) return;
    saveSettings({ userNames: { [id]: name } }).catch(() => showToast('Failed to save name', 'error'));
  };

  const editJiraUrl = async () => {
    const url = await showPrompt('Jira base URL used for bug links', settings.jiraUrl || '');
    if (url === null || url === undefined) return;
    saveSettings({ jiraUrl: url }).then(() => showToast('Jira URL saved', 'success')).catch(() => showToast('Failed to save', 'error'));
  };

  const current = selected ? runs[selected] : null;

  return (
    <div className="trr">
      <div className="trr-title-hero">
        <h1>Test Runs</h1>
        <p>Add one or more TestRail run IDs to see each run's status mix, who tested what, linked bugs, and what still needs attention. Results are cached and only re-fetched when you refresh.</p>
      </div>

      <div className="trr-card trr-toolbar">
        <div className="trr-input-wrap grow">
          <input
            className="trr-input"
            placeholder="Run IDs, e.g. 8941, 8950 9001"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addRuns(); }}
          />
        </div>
        <button className="trr-btn primary" onClick={addRuns}><Plus size={14} /> Add runs</button>
        <button className="trr-btn" onClick={refreshAll} disabled={!runIds.length || anyActive}>
          <RefreshCw size={14} className={anyActive ? 'trr-spin' : ''} /> Refresh all
        </button>
        <button className="trr-btn small" onClick={editJiraUrl} title={settings.jiraUrl || 'Not set'}><Link2 size={12} /> Jira URL</button>
      </div>

      {runIds.length > 0 && (
        <div className="trr-tabs">
          {runIds.map((id) => {
            const r = runs[id];
            const active = r?.job && ACTIVE_STATES.has(r.job.state);
            const err = r?.job?.state === 'error';
            return (
              <div key={id} className={`trr-tab ${selected === id ? 'active' : ''}`}>
                <button className="trr-tab-main" onClick={() => setSelected(id)} title={r?.summary?.name || ''}>
                  {active && <RefreshCw size={11} className="trr-spin" />}
                  {err && <AlertTriangle size={11} className="trr-err-icon" />}
                  <span className="trr-mono-plain">R{id}</span>
                  {r?.summary && <span className="trr-tab-name">{r.summary.name}</span>}
                  {r?.summary && <span className="trr-tab-pct">{fmtPct(r.summary.executed, r.summary.total)}</span>}
                </button>
                <button className="trr-tab-close" onClick={() => removeRun(id)} title="Remove from list"><X size={12} /></button>
              </div>
            );
          })}
        </div>
      )}

      <CompareTable runIds={runIds} runs={runs} onSelect={setSelected} />

      {runIds.length === 0 && (
        <div className="trr-card trr-empty big">No runs yet — enter a TestRail run ID above (for example <span className="trr-mono-plain">8941</span>).</div>
      )}

      {current && (
        <>
          <div className="trr-card trr-toolbar">
            {current.summary
              ? <span className="trr-muted small">Fetched {timeAgo(current.summary.fetchedAt)} · {fmtNum(current.summary.resultCount)} status results, {fmtNum(current.summary.commentOnlyCount)} comment-only entries</span>
              : <span className="trr-muted small">Not fetched yet</span>}
            {current.job?.state === 'error' && <span className="trr-error"><AlertTriangle size={13} /> {current.job.error}</span>}
            <div className="trr-spacer" />
            {current.job && ACTIVE_STATES.has(current.job.state)
              ? <JobProgress job={current.job} />
              : <button className="trr-btn small" onClick={() => refreshRun(selected)}><RefreshCw size={12} /> Refresh R{selected}</button>}
            {settings.testrailUrl && (
              <a className="trr-btn small" href={`${settings.testrailUrl}/index.php?/runs/view/${selected}`} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open in TestRail</a>
            )}
          </div>
          {current.summary
            ? <RunDetail summary={current.summary} settings={settings} onRename={renameUser} />
            : !current.job || current.job.state === 'error'
              ? null
              : <div className="trr-card trr-empty big">Fetching R{selected} — a large run (~12k tests) takes a minute or two.</div>}
        </>
      )}
    </div>
  );
};

export default TestRuns;
