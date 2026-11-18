import { useEffect, useRef, useState } from 'react';
import { Bot, CheckCircle2, Circle, Loader2, AlertTriangle, XCircle, MinusCircle, Sparkles } from 'lucide-react';

// "Claude EOD report" mode of the Daily Status page. The backend (eod-report.js) collects the
// day's work — git, local runs and Jenkins in code, Bitbucket + Jira through a small Claude run —
// and fills the EOD mail template; the result lands in the page's normal Final Report panel.

const API = 'http://localhost:3000/api/status/eod';
const SHEETS = ['Automation Tracker Sheet', 'Test Metrics Sheet', 'Polaris Tracking Sheet'];
const STEPS = [
  { key: 'git', label: 'Git work (automated / fixed cases, helpers, locators)' },
  { key: 'local', label: 'Local Cypress runs' },
  { key: 'jenkins', label: 'Jenkins builds' },
  { key: 'claude', label: 'Bitbucket PRs + Jira tickets (Claude)' },
];
const today = () => new Date().toLocaleDateString('en-CA');
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

const StepIcon = ({ status }) => {
  if (status === 'done') return <CheckCircle2 size={15} color="var(--accent-green)" />;
  if (status === 'running') return <Loader2 size={15} className="dsw-eod-spin" color="var(--accent-cyan)" />;
  if (status === 'failed') return <XCircle size={15} color="var(--accent-red)" />;
  if (status === 'skipped') return <MinusCircle size={15} color="var(--text-muted)" />;
  return <Circle size={15} color="var(--text-muted)" />;
};

const field = { width: '100%', background: 'var(--bg-input, rgba(255,255,255,0.04))', border: '1px solid var(--border-color, rgba(255,255,255,0.1))', borderRadius: '8px', padding: '8px 10px', color: 'var(--text-primary)', fontSize: '0.85rem' };
const label = { fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: '4px' };

export default function ClaudeEodPanel({ onReport }) {
  const [date, setDate] = useState(today());
  const [scrum, setScrum] = useState(() => load('tr-eod-scrum', true));
  const [manualTeam, setManualTeam] = useState('');
  const [sheets, setSheets] = useState(() => load('tr-eod-sheets', []));
  const [notes, setNotes] = useState('');
  const [skipClaude, setSkipClaude] = useState(false);
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const delivered = useRef(null);

  useEffect(() => { localStorage.setItem('tr-eod-scrum', JSON.stringify(scrum)); }, [scrum]);
  useEffect(() => { localStorage.setItem('tr-eod-sheets', JSON.stringify(sheets)); }, [sheets]);

  // Poll the running job; resume one that was in flight when the page reloaded.
  const jobId = job?.id || load('tr-eod-job', null);
  useEffect(() => {
    if (!jobId) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`${API}/job/${jobId}`);
        if (!res.ok) { localStorage.removeItem('tr-eod-job'); if (!stop) setJob(null); return; }
        const j = await res.json();
        if (stop) return;
        setJob(j);
        if (j.status === 'done' && delivered.current !== j.id) { delivered.current = j.id; localStorage.removeItem('tr-eod-job'); onReport(j.report, j.date); }
        if (j.status === 'failed') { localStorage.removeItem('tr-eod-job'); setError(j.error || 'Report failed'); }
        if (j.status === 'running') setTimeout(tick, 2000);
      } catch (e) { if (!stop) setError(`Backend not reachable: ${e.message}`); }
    };
    tick();
    return () => { stop = true; };
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const running = job?.status === 'running';
  const start = async () => {
    setError('');
    try {
      const res = await fetch(`${API}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date, scrum, manualTeam, sheets, notes, skipClaude }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const { id } = await res.json();
      localStorage.setItem('tr-eod-job', JSON.stringify(id));
      delivered.current = null;
      setJob({ id, status: 'running', steps: {} });
    } catch (e) { setError(e.message.includes('404') ? 'Restart the backend (node server.js) to load the EOD routes.' : e.message); }
  };
  const toggleSheet = (s) => setSheets((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]));

  return (
    <div className="glass-panel dsw-card is-open" style={{ '--step-color': 'var(--accent-cyan)' }}>
      <div className="dsw-card-header" style={{ cursor: 'default' }}>
        <div className="dsw-card-badge"><Bot size={14} /></div>
        <div className="dsw-card-title">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>Claude EOD report</h3>
          <div className="dsw-card-subtitle">Collects today's work and fills your EOD mail format</div>
        </div>
      </div>
      <div className="dsw-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <span style={label}>Date</span>
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} style={{ ...field, width: 'auto' }} />
        </div>

        <div>
          <span style={label}>Only you know these</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: '8px' }}>
            <input type="checkbox" checked={scrum} onChange={(e) => setScrum(e.target.checked)} /> Attended the scrum call
          </label>
          <input value={manualTeam} onChange={(e) => setManualTeam(e.target.value)} placeholder="Manual-team discussion (one line, blank = none)" style={field} />
        </div>

        <div>
          <span style={label}>Tracking sheets updated</span>
          {SHEETS.map((s) => (
            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: '4px' }}>
              <input type="checkbox" checked={sheets.includes(s)} onChange={() => toggleSheet(s)} /> {s}
            </label>
          ))}
        </div>

        <div>
          <span style={label}>Extra points (one per line, added to the overview)</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...field, resize: 'vertical' }} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={skipClaude} onChange={(e) => setSkipClaude(e.target.checked)} /> Skip Bitbucket + Jira (no Claude call, free)
        </label>

        <button onClick={start} disabled={running} className="glow-btn" style={{ justifyContent: 'center', padding: '14px', fontWeight: 'bold' }}>
          {running ? <><Loader2 size={18} className="dsw-eod-spin" /> Collecting…</> : <><Sparkles size={18} /> Generate EOD report</>}
        </button>

        {job && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem' }}>
            {STEPS.map(({ key, label: l }) => {
              const st = job.steps?.[key];
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <StepIcon status={st?.status} />
                  <span style={{ flex: 1 }}>{l}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{st?.detail}</span>
                </div>
              );
            })}
            {job.status === 'running' && job.steps?.claude?.status === 'running' && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>The Claude step usually takes 1–3 minutes.</div>
            )}
          </div>
        )}

        {job?.warnings?.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', padding: '10px 12px', borderRadius: '8px', background: 'color-mix(in srgb, var(--accent-yellow) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-yellow) 28%, transparent)', color: 'var(--accent-yellow)', fontSize: '0.78rem' }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
            <ul style={{ margin: 0, paddingLeft: '16px' }}>{job.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        )}
        {error && <div style={{ color: 'var(--accent-red)', fontSize: '0.8rem' }}>{error}</div>}
      </div>
    </div>
  );
}
