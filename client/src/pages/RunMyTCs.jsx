import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot, Play, Pause, PlayCircle, Square, FileBarChart, Settings2, ChevronDown, ChevronRight, Search,
  CheckCircle2, XCircle, Ban, CircleDashed, Bug, StickyNote, Check, X, FileDiff, ScrollText, Cpu, History, RefreshCw,
  MessageSquare, Send, Flag, Download, Bell, Copy, Trash2, BadgeCheck, Eye, Image as ImageIcon,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { showPrompt } from '../utils/Alerts';
import ModalPortal from './testcase-dashboard/ModalPortal';
import FileTree from './testcase-dashboard/FileTree';
import { CAT_ORDER, CAT_LABELS } from './testcase-dashboard/helpers';
import './testcase-dashboard/TestCaseDashboard.css';
import './runmytcs/RunMyTCs.css';

const API = '/api/runmytcs';
const STATUS_META = {
  passed: { icon: CheckCircle2, cls: 'ok', label: 'Passed' },
  failed: { icon: XCircle, cls: 'bad', label: 'Failed' },
  blocked: { icon: Ban, cls: 'warn', label: 'Blocked' },
  retest: { icon: RefreshCw, cls: 'info', label: 'Retest' },
  untested: { icon: CircleDashed, cls: 'muted', label: 'Untested' },
};
const FIX_STATE_LABEL = {
  'awaiting-approval': 'Awaiting approval', proposed: 'Fix proposed — your call', dismissed: 'Dismissed', 'awaiting-input': 'Waiting for your answer', queued: 'Queued', fixing: 'Claude fixing…', diagnosing: 'Claude diagnosing…',
  'verify-pending': 'Waiting to verify', verifying: 'Verifying locally…', verified: 'Fixed + verified', 'failed-verify': 'Fix did not verify',
  'no-change': 'No fix applied', diagnosed: 'Diagnosed', skipped: 'Skipped', 'over-cap': 'Over fix cap', error: 'Error',
};

async function call(path, body) {
  const res = await fetch(API + path, body === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
const FIX_ORDER = ['proposed', 'awaiting-input', 'awaiting-approval', 'fixing', 'diagnosing', 'verifying', 'verify-pending', 'queued', 'verified', 'failed-verify', 'diagnosed', 'no-change', 'over-cap', 'skipped', 'error'];
async function copyTextRaw(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
const ALL_STATUSES = ['failed', 'untested', 'passed', 'retest', 'blocked', 'notinrun'];
const fmtDate = (t) => (t ? new Date(t).toLocaleString([], { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

// One dot per recorded result, oldest → newest; hover shows date, run, build.
function ResultDots({ results }) {
  if (!results || !results.length) return <span className="rmt-muted rmt-xs">—</span>;
  return (
    <span className="rmt-dots">{results.map((r, i) => (
      <span key={i} className={`rmt-dot rmt-dot-${r.result}`}
        title={`${r.result.toUpperCase()} · ${fmtDate(r.t)}${r.runId ? ` · run ${r.runId}` : ''} · ${r.ref || ''} (${r.source || ''})`} />))}
    </span>
  );
}

const evFile = (f) => `/api/runmytcs/evidence-file?f=${encodeURIComponent(f)}`;
// What a failed build left behind: per-case error + stack, Robot failures, screenshots, full log.
function EvidenceView({ ev, caseId }) {
  const [big, setBig] = useState(null);
  if (!ev) return <p className="rmt-muted">No evidence recorded for this failure.</p>;
  const errs = caseId ? [[caseId, ev.error || (ev.errors && (ev.errors[caseId] || ev.errors._hooks))]] : Object.entries(ev.errors || {});
  return (
    <div className="rmt-evidence">
      <div className="rmt-ev-links">
        <span className="rmt-muted">{ev.ref}</span>
        {ev.buildUrl && <a href={ev.buildUrl} target="_blank" rel="noreferrer">Jenkins build ↗</a>}
        {ev.buildUrl && <a href={`${ev.buildUrl}console`} target="_blank" rel="noreferrer">Console ↗</a>}
        {ev.log && <a href={evFile(ev.log)} target="_blank" rel="noreferrer">Full log (as Claude saw it) ↗</a>}
      </div>
      {errs.filter(([, t]) => t).map(([k, t]) => <div key={k}><b className="rmt-xs">{k === '_hooks' ? 'Hook failures' : k}</b><pre className="rmt-err">{t}</pre></div>)}
      {ev.robot && ev.robot.length > 0 && <div><b className="rmt-xs">Robot (device-side) failures</b><pre className="rmt-err">{ev.robot.join('\n')}</pre></div>}
      {ev.shots && ev.shots.length > 0 && <div className="rmt-shots">{ev.shots.map((f) => (
        <img key={f} src={evFile(f)} alt={f} title={f.split('/').pop()} onClick={() => setBig(f)} />))}</div>}
      {big && <div className="rmt-overlay" onClick={() => setBig(null)}><img className="rmt-shot-big" src={evFile(big)} alt={big} /></div>}
    </div>
  );
}

const fmtDur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const kTok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);
const CLS_TONE = { 'test-bug': 'bad', 'product-bug': 'warn', environment: 'info', flaky: 'info', 'human-needed': 'warn', unclear: 'muted' };

// ── live lanes: what runs where right now ──
function LanesCard({ st, items, lanes, progress, active, onFixApproval }) {
  const total = items.length;
  const done = items.filter((i) => ['done', 'skipped'].includes(i.state)).length;
  const running = items.filter((i) => ['queued', 'running'].includes(i.state));
  const pending = items.filter((i) => i.state === 'pending').length;
  const ourPaths = new Set(items.map((i) => i.path));
  const jRun = (lanes.jq.running || []).filter((r) => ourPaths.has(r.path));
  const localActive = lanes.cs.active;
  // average spec duration so far in this run → rough time left for the tests still to run
  const durs = items.map((i) => (i.submittedAt && i.history && i.history[0] ? i.history[0].at - i.submittedAt : 0)).filter((x) => x > 0);
  const avg = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : 0;
  const par = Math.max(1, (st.config && st.config.maxParallelJenkins) || 2);
  const eta = avg && (pending + running.length) ? (avg * (pending + running.length)) / par : 0;
  return (
    <div className="rmt-card rmt-lanes">
      <div className="rmt-lanes-head">
        <h3><Cpu size={15} /> Live run</h3>
        <div className="rmt-lanes-stats">
          <span><b>{done}</b>/{total} specs done</span>
          <span><b>{running.length}</b> running</span>
          <span><b>{pending}</b> waiting</span>
          {eta > 0 && active && <span>≈ <b>{fmtDur(eta)}</b> left (tests only)</span>}
          {st.config?.onFailure === 'fix' && active && (
            <label className="rmt-inline">Fix approval
              <select value={st.config.fixApproval} onChange={(e) => onFixApproval(e.target.value)}>
                <option value="auto">Automatic</option><option value="manual">Ask me per fix</option>
              </select></label>)}
          {st.config?.onFailure === 'collect' && <span className="rmt-pill">collect-only · no Claude</span>}
        </div>
      </div>
      <div className="rmt-bigbar"><div style={{ width: `${total ? (done / total) * 100 : 0}%` }} /><div className="rmt-bar-run" style={{ width: `${total ? (running.length / total) * 100 : 0}%` }} /></div>
      <div className="rmt-catbars">{Object.entries(progress).map(([cat, p]) => (
        <div key={cat} className="rmt-catbar"><span>{cat}</span><div className="rmt-bar"><div style={{ width: `${(p.done / p.total) * 100}%` }} /><div className="rmt-bar-run" style={{ width: `${(p.running / p.total) * 100}%` }} /></div><span className="rmt-muted">{p.done}/{p.total}</span></div>))}
      </div>
      <div className="rmt-lane-list">
        {jRun.map((r) => (
          <div key={r.id || r.path} className="rmt-lane"><span className="rmt-lane-tag">Jenkins</span><b>{r.jobName || 'waiting for a job'}</b>
            <span className="rmt-lane-spec">{shortPath(r.path)}</span><span className="rmt-muted">{r.startedAt ? fmtDur(lanes.at - r.startedAt) : 'queued'}</span>
            {r.buildUrl && <a href={`${r.buildUrl}console`} target="_blank" rel="noreferrer">console ↗</a>}</div>))}
        {localActive && (
          <div className="rmt-lane"><span className="rmt-lane-tag rmt-lane-dev">Device</span><b>{localActive.label || (ourPaths.has(localActive.specPath) ? 'RunMyTCs' : 'other run')}</b>
            <span className="rmt-lane-spec">{shortPath(localActive.specPath)}</span><span className="rmt-muted">{fmtDur(lanes.at - localActive.startedAt)}</span></div>)}
        {!jRun.length && !localActive && <p className="rmt-muted">{active ? 'Nothing executing this moment — waiting for a free job/device or for Claude.' : 'No run active.'}</p>}
      </div>
    </div>
  );
}

// ── failures with inline evidence ──
function FailuresCard({ failures, onEvidence, onAnalyse, onShot }) {
  const [open, setOpen] = useState({});
  const busy = new Set(['queued', 'fixing', 'diagnosing', 'proposed', 'verify-pending', 'verifying', 'awaiting-input']);
  return (
    <div className="rmt-card">
      <h3><XCircle size={15} /> Failures <span className="rmt-muted">{failures.length ? `${failures.length} spec(s) · ${failures.reduce((n, f) => n + f.cases.length, 0)} case(s)` : ''}</span></h3>
      {!failures.length && <p className="rmt-muted">No failures recorded in this run.</p>}
      <div className="rmt-stack">{failures.map((f) => {
        const isOpen = open[f.path] ?? failures.length <= 3;
        return (
          <div key={f.path} className="rmt-fcard">
            <button className="rmt-fcard-head" onClick={() => setOpen((o) => ({ ...o, [f.path]: !isOpen }))}>
              {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span className="rmt-cat">{f.cat}</span><b className="rmt-ellipsis">{shortPath(f.path)}</b>
              <span className="rmt-muted rmt-xs">{f.cases.length} failed{f.at ? ` · ${fmtTime(f.at)}` : ''}</span>
              {f.fix && <span className={`rmt-pill rmt-fx-${f.fix.state}`}>{FIX_STATE_LABEL[f.fix.state] || f.fix.state}</span>}
            </button>
            {isOpen && <div className="rmt-fcard-body">
              {(f.caseInfo || []).map((c) => (
                <div key={c.id} className="rmt-fcase">
                  <div><b>{c.id}</b> <span className="rmt-muted rmt-xs">{c.title}</span>{c.cls && <span className={`rmt-chip rmt-${CLS_TONE[c.cls] || 'muted'}`}>{c.cls}</span>}</div>
                  {c.error && <code className="rmt-errline">{c.error}</code>}
                </div>))}
              {f.hook && <code className="rmt-errline">hook: {f.hook}</code>}
              {(f.robot || []).map((r, i) => <code key={i} className="rmt-errline rmt-robot">robot: {r}</code>)}
              {(f.shots || []).length > 0 && <div className="rmt-thumbs">{f.shots.map((sh) => <img key={sh} src={evFile(sh)} alt="" onClick={() => onShot(sh)} />)}</div>}
              <div className="rmt-fix-row">
                <button className="rmt-btn rmt-sm" onClick={() => onEvidence(f.ref, `Evidence — ${shortPath(f.path)} (${f.ref})`)}><ImageIcon size={13} />All evidence</button>
                {f.buildUrl && <a className="rmt-btn rmt-sm" href={f.buildUrl} target="_blank" rel="noreferrer">Jenkins ↗</a>}
                {f.fix && busy.has(f.fix.state) ? null : <button className="rmt-btn rmt-sm rmt-primary" title="Claude reads the evidence and proposes a fix — nothing changes until you approve" onClick={() => onAnalyse(f.path)}><Bot size={13} />Analyse with Claude</button>}
              </div>
            </div>}
          </div>);
      })}</div>
    </div>
  );
}

// ── fixes with a timeline ──
const TRAIL_STEPS = [['analyse', 'Analyse', ['queued', 'diagnosing']], ['proposed', 'Proposed', ['proposed']], ['fix', 'Fixing', ['fixing']], ['check', 'Check', ['verify-pending', 'verifying']], ['result', 'Result', ['verified', 'failed-verify', 'no-change', 'diagnosed', 'dismissed', 'over-cap', 'skipped', 'error']]];
function FixTimeline({ f }) {
  const seen = new Set((f.trail || []).map((t) => t.s).concat(f.state));
  const curIdx = TRAIL_STEPS.findIndex(([, , st]) => st.includes(f.state));
  const steps = f.userRequested ? TRAIL_STEPS : TRAIL_STEPS.filter(([k]) => k !== 'proposed');
  return (
    <ol className="rmt-trail">{steps.map(([k, l, st]) => {
      const idx = TRAIL_STEPS.findIndex(([kk]) => kk === k);
      const hit = st.some((x) => seen.has(x));
      const cls = idx === curIdx ? (['failed-verify', 'error'].includes(f.state) ? 'bad' : f.state === 'verified' ? 'ok' : 'now') : (hit || idx < curIdx ? 'done' : '');
      const when = (f.trail || []).find((t) => st.includes(t.s));
      return <li key={k} className={cls} title={when ? fmtDate(when.t) : ''}>{l}{k === 'result' && idx === curIdx ? `: ${FIX_STATE_LABEL[f.state] || f.state}` : ''}</li>;
    })}</ol>
  );
}
function FixesCard({ fixes, usage, awaiting, onAct, onEvidence, onModal, onCopyVerified }) {
  const tok = (id) => usage.filter((u) => u.tag === id).reduce((a, u) => ({ calls: a.calls + 1, in: a.in + u.inTok, turns: a.turns + (u.turns || 0) }), { calls: 0, in: 0, turns: 0 });
  return (
    <div className="rmt-card">
      <h3><FileDiff size={15} /> Fixes {awaiting.length ? <span className="rmt-pill rmt-st-paused">{awaiting.length} waiting on you</span> : null}
        {fixes.some((f) => f.state === 'verified' && f.diff && f.review !== 'discarded') && <span className="rmt-h3-actions">
          <button className="rmt-btn rmt-sm" onClick={onCopyVerified}><Copy size={13} />Copy verified diffs</button></span>}
      </h3>
      {!fixes.length && <p className="rmt-muted">No fixes yet. In collect-only runs, use “Analyse with Claude” on a failure.</p>}
      <div className="rmt-stack">{[...fixes].sort((a, b) => FIX_ORDER.indexOf(a.state) - FIX_ORDER.indexOf(b.state)).map((f) => {
        const t = tok(f.id);
        return (
          <div key={f.id} className={`rmt-fixcard2 rmt-fx-border-${f.state}`}>
            <div className="rmt-fixcard2-head">
              <b className="rmt-ellipsis">{shortPath(f.path)}</b>
              <span className="rmt-muted rmt-xs">{f.cases.length} case{f.cases.length > 1 ? 's' : ''} · {f.userRequested ? 'you asked' : f.mode}</span>
              {f.shared && f.shared.length ? <span className="rmt-shared" title={f.shared.join('\n')}>⚠ shared code</span> : null}
              {f.review && <span className={`rmt-pill rmt-rev-${f.review}`}>{f.review}</span>}
            </div>
            <FixTimeline f={f} />
            {f.summary && <p className="rmt-note rmt-fix-sum">{f.summary}</p>}
            <div className="rmt-fixmeta">
              {f.files && f.files.length > 0 && <span title={f.files.join('\n')}>📄 {f.files.length} file{f.files.length > 1 ? 's' : ''}: {f.files.map((x) => x.split('/').pop()).join(', ')}</span>}
              {t.calls > 0 && <span>🤖 {t.calls} call{t.calls > 1 ? 's' : ''} · {t.turns} turns · {kTok(t.in)} tokens</span>}
            </div>
            <div className="rmt-fix-row">
              {f.state === 'proposed' && <>
                <button className="rmt-btn rmt-sm rmt-primary" onClick={() => onModal({ type: 'proposal', f })}><Check size={13} />Review &amp; approve…</button>
                <button className="rmt-btn rmt-sm" onClick={() => onAct('/proposal', { fixId: f.id, approve: false }, 'Proposal dismissed')}><X size={13} />Dismiss</button>
              </>}
              {f.state === 'awaiting-approval' && <>
                <button className="rmt-btn rmt-sm rmt-primary" onClick={() => onAct('/approve', { fixId: f.id, approve: true }, 'Fix approved')}><Check size={13} />Approve</button>
                <button className="rmt-btn rmt-sm" onClick={() => onAct('/approve', { fixId: f.id, approve: false }, 'Fix skipped')}><X size={13} />Skip</button>
              </>}
              <button className="rmt-btn rmt-sm" onClick={() => onEvidence(f.ref, `Evidence — ${shortPath(f.path)} (${f.ref})`)}><ImageIcon size={13} />Evidence</button>
              {f.verifyEvRef && <button className="rmt-btn rmt-sm" onClick={() => onEvidence(f.verifyEvRef, `Fix check evidence — ${shortPath(f.path)}`)}><ImageIcon size={13} />Check evidence</button>}
              {f.diff && <button className="rmt-btn rmt-sm" onClick={() => onModal({ type: 'diff', f })}><Eye size={13} />Diff</button>}
              {f.diff && !f.review && <>
                <button className="rmt-btn rmt-sm" onClick={() => onAct('/fix-review', { fixId: f.id, action: 'keep' }, 'Fix kept')}><BadgeCheck size={13} />Keep</button>
                <button className="rmt-btn rmt-sm rmt-danger" onClick={() => window.confirm(`Discard the fix for ${shortPath(f.path)}? Its changes are reverted in the worktree.`) && onAct('/fix-review', { fixId: f.id, action: 'discard' }, 'Fix discarded')}><Trash2 size={13} />Discard</button>
              </>}
            </div>
          </div>);
      })}</div>
    </div>
  );
}

// ── Claude activity ──
function ClaudeCard({ st, fixes }) {
  const u = st.usage || [];
  const tot = u.reduce((a, x) => ({ in: a.in + x.inTok, out: a.out + x.outTok }), { in: 0, out: 0 });
  const label = (tag) => { if (!tag) return ''; if (tag.startsWith('triage')) return 'triage batch'; const f = fixes.find((x) => x.id === tag); return f ? shortPath(f.path).split('/').slice(-2).join('/') : tag; };
  const busy = st.claudeBusy;
  return (
    <div className="rmt-card">
      <h3><Bot size={15} /> Claude activity <span className="rmt-muted">{u.length} call(s) · {kTok(tot.in)} in · {kTok(tot.out)} out</span></h3>
      {busy ? <div className="rmt-claude-now"><span className="rmt-dotpulse" />Working: <b>{busy.kind}</b> ({busy.model}){busy.tag ? ` — ${label(busy.tag)}` : ''} · since {fmtTime(busy.startedAt)}</div>
        : <p className="rmt-muted">{st.config?.onFailure === 'collect' ? 'Idle — collect-only run; Claude starts only when you ask.' : 'Idle.'}</p>}
      {u.length > 0 && <table className="rmt-table rmt-results-table rmt-calls"><thead><tr><th>Time</th><th>Step</th><th>For</th><th>Turns</th><th>Tokens</th><th /></tr></thead>
        <tbody>{u.slice(-8).reverse().map((x, i) => (
          <tr key={i} className={x.inTok > 1e6 ? 'rmt-heavy' : ''}><td>{fmtTime(x.t)}</td><td>{x.kind} <span className="rmt-muted rmt-xs">{x.model}</span></td><td className="rmt-ellipsis">{label(x.tag)}</td>
            <td>{x.turns}</td><td title={`${x.inTok} in / ${x.outTok} out`}>{kTok(x.inTok)}{x.inTok > 1e6 ? ' ⚠' : ''}</td><td>{x.ok ? '✓' : '✗'}</td></tr>))}
        </tbody></table>}
    </div>
  );
}

// ── chat: questions, answers, notes ──
function ChatPanel({ messages, onSend, enabled, fixes, onOpenFix }) {
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [onlyQs, setOnlyQs] = useState(false);
  const box = useRef(null);
  const open = messages.filter((m) => m.from === 'claude' && m.open);
  const shown = onlyQs ? messages.filter((m) => m.from === 'claude') : messages;
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [messages.length]);
  const send = async (e) => {
    if (e) e.preventDefault();
    const t = text.trim();
    if (!t) return;
    if (await onSend(t, replyTo && replyTo.id)) { setText(''); setReplyTo(null); }
  };
  return (
    <div className="rmt-card rmt-chat">
      <h3><MessageSquare size={15} /> Chat with Claude {open.length ? <span className="rmt-pill rmt-st-paused">{open.length} question{open.length > 1 ? 's' : ''} for you</span> : null}
        <span className="rmt-h3-actions"><button className={`rmt-tab ${onlyQs ? 'on' : ''}`} onClick={() => setOnlyQs((v) => !v)}>Questions only</button></span></h3>
      <div className="rmt-chat-box" ref={box}>
        {!shown.length && <div className="rmt-chat-empty"><Bot size={22} /><p>Claude asks here when a fix needs something only you know — the run keeps going meanwhile.<br />Leave notes any time: Claude reads them on every later call.</p>
          <div className="rmt-chips">{['Use LoadFormData fields, never hardcode values', 'Prefer fixing the spec over shared helpers', 'Skip Enterprise-account cases — no account available'].map((c) => <button key={c} className="rmt-chip-btn" disabled={!enabled} onClick={() => setText(c)}>{c}</button>)}</div></div>}
        {shown.map((m) => {
          const fx = m.fixId && fixes.find((f) => f.id === m.fixId);
          return (
            <div key={m.id} className={`rmt-msg2 rmt-msg2-${m.from}${m.open ? ' open' : ''}`}>
              <div className="rmt-avatar">{m.from === 'claude' ? <Bot size={14} /> : 'You'}</div>
              <div className="rmt-bubble">
                <div className="rmt-msg-meta">{m.from === 'claude' ? <>Claude · {m.path}{m.cases ? ` · ${m.cases.join(', ')}` : ''}</> : <>{m.answerTo ? 'Answer' : 'Note for Claude'}</>} · {fmtTime(m.t)}{m.from === 'claude' && !m.open ? ' · answered' : ''}</div>
                <div className="rmt-bubble-text">{m.text}</div>
                {m.from === 'claude' && <div className="rmt-fix-row">
                  {m.open && <button className="rmt-btn rmt-sm rmt-primary" onClick={() => setReplyTo(m)}>Answer</button>}
                  {fx && (fx.diff || fx.state === 'proposed') && <button className="rmt-btn rmt-sm" onClick={() => onOpenFix(fx)}><Eye size={12} />Open fix</button>}
                </div>}
              </div>
            </div>);
        })}
      </div>
      <form className="rmt-chat-input" onSubmit={send}>
        {replyTo && <div className="rmt-replying">↪ Answering: {replyTo.text} <button type="button" onClick={() => setReplyTo(null)}><X size={12} /></button></div>}
        <textarea rows={2} value={text} disabled={!enabled}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          onChange={(e) => setText(e.target.value)}
          placeholder={enabled ? (replyTo ? 'Your answer… (Enter to send, Shift+Enter for a new line)' : 'Note for Claude… (Enter to send)') : 'Start a run to chat'} />
        <button className="rmt-btn rmt-primary" disabled={!enabled || !text.trim()}><Send size={14} />{replyTo ? 'Answer' : 'Send'}</button>
      </form>
    </div>
  );
}

function ResultsHistory({ caseId }) {
  const [data, setData] = useState(null);
  useEffect(() => { call(`/case/${caseId}/results`).then(setData).catch(() => setData({ results: [] })); }, [caseId]);
  if (!data) return <p className="rmt-muted">Loading results…</p>;
  const rs = data.results.slice().reverse();
  const pass = rs.filter((r) => r.result === 'passed').length;
  return (
    <div className="rmt-results">
      <h4>Pass/fail record ({rs.length}){rs.length ? <span className="rmt-muted"> · {Math.round((pass / rs.length) * 100)}% passed</span> : null}</h4>
      {!rs.length ? <p className="rmt-muted">No results recorded by RunMyTCs yet.</p> : (
        <table className="rmt-table rmt-results-table"><thead><tr><th>Date</th><th>Result</th><th>TestRail run</th><th>Build / run</th><th>Source</th></tr></thead>
          <tbody>{rs.map((r, i) => (
            <tr key={i}><td>{fmtDate(r.t)}</td><td><StatusChip s={r.result} /></td><td>{r.runId}</td><td className="rmt-muted">{r.ref}</td><td className="rmt-muted">{r.source}</td></tr>))}
          </tbody></table>)}
    </div>
  );
}

const fmtTime = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
const shortPath = (p) => String(p || '').split('functional_tests/').pop();

function StatusChip({ s }) {
  const m = STATUS_META[s] || STATUS_META.untested;
  const Icon = m.icon;
  return <span className={`rmt-chip rmt-${m.cls}`}><Icon size={12} />{m.label}</span>;
}

const PRESETS = [
  { key: 'collect', label: 'Run & collect', hint: 'no Claude — you pick what to analyse', patch: { statuses: ['failed', 'untested'], onFailure: 'collect', include: [] } },
  { key: 'finish', label: 'Finish a run', hint: 'failed + untested, fix on', patch: { statuses: ['failed', 'untested'], onFailure: 'fix', include: [] } },
  { key: 'failures', label: 'Failures only', hint: 'failed, diagnose only', patch: { statuses: ['failed'], onFailure: 'diagnose', include: [] } },
  { key: 'full', label: 'Full regression', hint: 'all manifest cases, report only', patch: { statuses: ['failed', 'untested', 'passed', 'retest', 'blocked', 'notinrun'], onFailure: 'report', include: [] } },
];

// One-line description of a saved preset, shown under its name.
const presetHint = (c) => [c.runId ? `run ${c.runId}` : null, c.statuses && (c.statuses.length >= 6 ? 'all cases' : c.statuses.join('+')),
  c.cats && c.cats.join('/'), c.onFailure, c.include && c.include.length ? `only ${c.include.length} spec(s)` : null,
  c.exclude && c.exclude.length ? `skip ${c.exclude.length}` : null].filter(Boolean).join(' · ');

function ConfigForm({ cfg, setCfg, jobs, disabled, presets = [], onSavePreset, onDeletePreset }) {
  const toggle = (key, val) => setCfg((c) => ({ ...c, [key]: c[key].includes(val) ? c[key].filter((x) => x !== val) : [...c[key], val] }));
  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const par = cfg.maxParallelJenkins ?? 2;
  return (
    <>
    {!disabled && (
      <div className="rmt-presets">
        <span className="rmt-muted">Quick start:</span>
        {PRESETS.map((p) => (
          <button key={p.key} type="button" className="rmt-preset" onClick={() => setCfg((c) => ({ ...c, ...p.patch }))}>
            <b>{p.label}</b><span>{p.hint}</span>
          </button>))}
      </div>
    )}
    {!disabled && (
      <div className="rmt-presets">
        <span className="rmt-muted">My presets:</span>
        {presets.map((p) => (
          <span key={p.name} className="rmt-preset rmt-preset-mine">
            <button type="button" className="rmt-preset-apply" title="Apply this preset" onClick={() => setCfg((c) => ({ ...c, ...p.config, models: { ...c.models, ...(p.config.models || {}) }, runId: p.config.runId || c.runId }))}>
              <b>⭐ {p.name}</b><span>{presetHint(p.config)}</span>
            </button>
            <button type="button" className="rmt-preset-del" title={`Delete preset "${p.name}"`} onClick={() => onDeletePreset(p.name)}><X size={12} /></button>
          </span>))}
        {!presets.length && <span className="rmt-muted rmt-xs">none yet</span>}
        <button type="button" className="rmt-btn rmt-sm" onClick={onSavePreset}>＋ Save current as preset…</button>
      </div>
    )}
    {par > 3 && <div className="rmt-warn-banner">⚠ {par} parallel Jenkins builds on one Jenkins host caused page-load / login timeouts in earlier runs — 2 is the safe default.</div>}
    <fieldset className="rmt-form" disabled={disabled}>
      <div className="rmt-group-label rmt-wide">What to run</div>
      <label className="rmt-field"><span>TestRail run ID</span>
        <input value={cfg.runId} onChange={(e) => set('runId', e.target.value.replace(/\D/g, ''))} placeholder="9039" />
      </label>
      <div className="rmt-field"><span>Statuses <button type="button" className="rmt-link" onClick={() => set('statuses', ALL_STATUSES)}>all cases</button>
        · <button type="button" className="rmt-link" onClick={() => set('statuses', ['failed', 'untested'])}>failed + untested</button></span>
        <div className="rmt-checks">{ALL_STATUSES.map((s) => (
          <label key={s}><input type="checkbox" checked={cfg.statuses.includes(s)} onChange={() => toggle('statuses', s)} />{s === 'notinrun' ? 'not in run' : s}</label>))}
        </div>
      </div>
      <div className="rmt-field"><span>Types</span>
        <div className="rmt-checks">{['offline', 'online', 'e2e'].map((s) => (
          <label key={s}><input type="checkbox" checked={cfg.cats.includes(s)} onChange={() => toggle('cats', s)} />{s}</label>))}
        </div>
      </div>
      <div className="rmt-group-label rmt-wide">When a case fails</div>
      <label className="rmt-field"><span>On failure</span>
        <select value={cfg.onFailure} onChange={(e) => set('onFailure', e.target.value)}>
          <option value="fix">Diagnose + fix + verify locally</option>
          <option value="diagnose">Diagnose only (no code changes)</option>
          <option value="report">Triage + report only</option>
          <option value="collect">Run + collect evidence only (no Claude)</option>
        </select>
      </label>
      <label className="rmt-field"><span>Fix approval</span>
        <select value={cfg.fixApproval} onChange={(e) => set('fixApproval', e.target.value)} disabled={cfg.onFailure !== 'fix'}>
          <option value="auto">Automatic</option>
          <option value="manual">Ask me per fix</option>
        </select>
      </label>
      <label className="rmt-field"><span>Max Claude fixes</span>
        <input type="number" min="0" max="50" value={cfg.maxFixes} onChange={(e) => set('maxFixes', Number(e.target.value) || 0)} />
      </label>
      <label className="rmt-field"><span>Max parallel Jenkins builds</span>
        <input type="number" min="1" max="10" value={cfg.maxParallelJenkins ?? 2} onChange={(e) => set('maxParallelJenkins', Number(e.target.value) || 1)} />
      </label>
      <div className="rmt-group-label rmt-wide">Claude &amp; resources</div>
      <div className="rmt-field"><span>Claude</span>
        <div className="rmt-checks">
          <label><input type="checkbox" checked={cfg.jira} onChange={(e) => set('jira', e.target.checked)} />Check Jira</label>
          <label><input type="checkbox" checked={cfg.rerunFlakyOnce} onChange={(e) => set('rerunFlakyOnce', e.target.checked)} />Rerun flaky once</label>
        </div>
      </div>
      <label className="rmt-field"><span>Triage model</span>
        <select value={cfg.models.triage} onChange={(e) => setCfg((c) => ({ ...c, models: { ...c.models, triage: e.target.value } }))}>
          <option value="haiku">Haiku (cheapest)</option><option value="sonnet">Sonnet</option><option value="opus">Opus</option>
        </select>
      </label>
      <label className="rmt-field"><span>Fix model</span>
        <select value={cfg.models.fix} onChange={(e) => setCfg((c) => ({ ...c, models: { ...c.models, fix: e.target.value } }))}>
          <option value="sonnet">Sonnet</option><option value="opus">Opus</option><option value="haiku">Haiku</option>
        </select>
      </label>
      <div className="rmt-field"><span>Resources</span>
        <div className="rmt-checks">
          <label title={Object.entries(jobs || {}).map(([k, v]) => `${k}: ${v.join(', ')}`).join('\n')}>
            <input type="checkbox" checked={cfg.useJenkins} onChange={(e) => set('useJenkins', e.target.checked)} />My Jenkins jobs{cfg.useLocal && cfg.useJenkins ? ' (overflow)' : ''}
          </label>
          <label><input type="checkbox" checked={cfg.useLocal} onChange={(e) => set('useLocal', e.target.checked)} />Local runner / attached device{cfg.useLocal && cfg.useJenkins ? ' (first)' : ''}</label>
        </div>
      </div>
      <label className="rmt-field"><span>E2E runs on</span>
        <select value={cfg.e2eTarget} onChange={(e) => set('e2eTarget', e.target.value)}>
          <option value="local">Attached device (local)</option><option value="jenkins">Jenkins E2E job</option>
        </select>
      </label>
      <label className="rmt-field rmt-wide"><span>Only these specs (path endings, comma-separated — empty = all)</span>
        <input value={(cfg.include || []).join(', ')} onChange={(e) => set('include', e.target.value.split(','))} placeholder="EVP-5273/offline.ts" />
      </label>
      <label className="rmt-field rmt-wide"><span>Exclude specs (path endings, comma-separated)</span>
        <input value={(cfg.exclude || []).join(', ')} onChange={(e) => set('exclude', e.target.value.split(','))} placeholder="EVP-8309/online.ts" />
      </label>
    </fieldset>
    </>
  );
}

// ── summary strip + stage stepper ──
const STAGES = [['plan', 'Plan'], ['run', 'Run'], ['triage', 'Triage'], ['fix', 'Fix'], ['verify', 'Verify'], ['finish', 'Finish']];
function stageOf(st) {
  if (!st || st.status === 'idle') return null;
  if (st.stage === 'planning') return 'plan';
  if (st.stage === 'done' || st.stage === 'finishing' || st.status === 'stopped') return 'finish';
  const fx = st.fixes || [];
  if (st.claudeBusy) return st.claudeBusy.kind === 'triage' ? 'triage' : 'fix';
  if (fx.some((f) => f.state === 'verifying')) return 'verify';
  return 'run';
}
function Stepper({ st }) {
  const cur = stageOf(st);
  const idx = STAGES.findIndex(([k]) => k === cur);
  return (
    <ol className="rmt-stepper">{STAGES.map(([k, l], i) => (
      <li key={k} className={i < idx ? 'done' : i === idx ? (st.status === 'paused' ? 'paused' : 'now') : ''}><span>{i + 1}</span>{l}</li>))}
    </ol>
  );
}
function Kpi({ label, value, sub, tone }) {
  return <div className={`rmt-kpi ${tone ? `rmt-kpi-${tone}` : ''}`}><span className="rmt-kpi-label">{label}</span><b>{value}</b>{sub ? <span className="rmt-kpi-sub">{sub}</span> : null}</div>;
}
function KpiStrip({ st, cases }) {
  const r = st.report;
  const fx = st.fixes || [];
  const count = (pred) => cases.filter(pred).length;
  const usage = (r && r.usage) || { calls: 0, inTok: 0 };
  const nowT = r ? r.now || {} : {};
  return (
    <div className="rmt-kpis">
      <Kpi label="Manifest" value={cases.length} sub={`${count((c) => c.status === 'passed')} passed · ${count((c) => c.status === 'failed')} failed`} />
      <Kpi label="This run" value={r && r.total ? r.total : '—'} sub={r && r.total ? `cases worked · ${r.inFlight || 0} in flight` : 'no run yet'} />
      <Kpi label="Now passing" value={r ? (r.nowPassing || []).length : '—'} sub="newly, this run" tone="ok" />
      <Kpi label="Still failing" value={r ? nowT.failed || 0 : '—'} tone="bad" />
      <Kpi label="Blocked" value={r ? nowT.blocked || 0 : '—'} sub="needs a person" tone="warn" />
      <Kpi label="Fixes verified" value={fx.filter((f) => f.state === 'verified').length} sub={`of ${fx.filter((f) => f.mode === 'fix' && f.attempted).length} tried by Claude`} tone="info" />
      <Kpi label="Claude" value={usage.calls} sub={`${(usage.inTok / 1e6).toFixed(1)}M tokens in`} />
    </div>
  );
}

function ReportView({ r }) {
  if (!r || !r.total) return <p className="rmt-muted">No report yet.</p>;
  const line = (o) => Object.entries(o || {}).map(([k, v]) => `${k} ${v}`).join(' · ');
  const list = (title, rows) => rows && rows.length ? (
    <div className="rmt-rep-sec"><h4>{title} ({rows.length})</h4>
      <ul>{rows.map((c) => <li key={c.id}><b>{c.id}</b> <span className="rmt-muted">{c.path}</span>{c.bug ? <> · 🐞 {c.bug}</> : null}{c.note ? <div className="rmt-note">{c.note}</div> : null}</li>)}</ul>
    </div>) : null;
  return (
    <div className="rmt-report">
      <p><b>Run {r.runId}</b> {r.runName && <>— {r.runName}</>} · {r.status} / {r.stage} · {r.total} cases worked</p>
      <p>Before: {line(r.before)}<br />Now: {line(r.now)}</p>
      <p>Claude: {r.usage.calls} call(s) {Object.entries(r.usage.byKind).map(([k, v]) => `${k}×${v}`).join(', ')} · {(r.usage.inTok / 1000).toFixed(1)}k in / {(r.usage.outTok / 1000).toFixed(1)}k out tokens</p>
      {r.inFlight ? <p className="rmt-muted">{r.inFlight} build(s) still in flight</p> : null}
      {list('Now passing', r.nowPassing)}
      {list('Still failing', r.stillFailing)}
      {list('Blocked — needs a person', r.blocked)}
      {list('Bugs linked', r.bugs)}
      {r.fixes && r.fixes.length ? <div className="rmt-rep-sec"><h4>Fixes ({r.fixes.length})</h4>
        <ul>{r.fixes.map((f) => <li key={f.id}><b>{f.path}</b> — {FIX_STATE_LABEL[f.state] || f.state}{f.summary ? `: ${f.summary}` : ''}</li>)}</ul></div> : null}
    </div>
  );
}

export default function RunMyTCs() {
  const toast = useToast();
  const [defaults, setDefaults] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [st, setSt] = useState({ status: 'idle' });
  const [logs, setLogs] = useState([]);
  const [cases, setCases] = useState([]);
  const [hist, setHist] = useState([]);
  const [showCfg, setShowCfg] = useState(true);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [view, setView] = useState('tree');
  const [manifest, setManifest] = useState({ rows: [], unknownIds: [] });
  const [activeCats, setActiveCats] = useState({ OFFLINE: true, ONLINE: true, E2E: true });
  const [statusFilter, setStatusFilter] = useState(null);
  const [openFiles, setOpenFiles] = useState(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [runOnly, setRunOnly] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState(new Map()); // spec path -> category, from the tree checkboxes
  const [nowTs, setNowTs] = useState(0); // refreshed by the poller (keeps render pure)
  const [tab, setTab] = useState(null); // overview | cases | activity — null = pick by run state
  const [modal, setModal] = useState(null); // {type:'report'|'diff'|'edit', ...}
  const lastLog = useRef(0);
  const logBox = useRef(null);

  const active = st.status === 'running' || st.status === 'paused';
  const runId = (active || st.config) ? st.config?.runId : cfg?.runId;

  useEffect(() => {
    call('/defaults').then((d) => {
      setDefaults(d);
      setCfg({ ...d.defaults, ...(d.last || {}), models: { ...d.defaults.models, ...((d.last || {}).models || {}) } });
      setShowCfg(!d.last); // returning users land on results, settings one click away
    }).catch((e) => toast?.showToast(e.message, 'error'));
    call('/history').then(setHist).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // once: the toast context object changes on every toast, which would reset the form

  const [notify, setNotify] = useState(() => { try { return localStorage.getItem('rmt_notify') === '1' && Notification.permission === 'granted'; } catch { return false; } });
  const notifyRef = useRef(notify);
  const seenEvt = useRef({ qs: null, status: null });
  const toggleNotify = async () => {
    try {
      if (notify) { setNotify(false); notifyRef.current = false; localStorage.setItem('rmt_notify', '0'); return; }
      const perm = await Notification.requestPermission();
      const on = perm === 'granted';
      setNotify(on); notifyRef.current = on; localStorage.setItem('rmt_notify', on ? '1' : '0');
      if (!on) toast?.showToast('Notifications are blocked in this browser', 'error');
    } catch { toast?.showToast('Notifications are not available here', 'error'); }
  };
  const ping = (title, body) => { try { if (notifyRef.current) new Notification(title, { body, tag: 'runmytcs' }); } catch { /* ignore */ } };
  const poll = useCallback(async () => {
    try {
      const s = await call(`/state?sinceLog=${lastLog.current}`);
      if (s.log && s.log.length) {
        lastLog.current = s.log[s.log.length - 1].t;
        setLogs((l) => { const seen = new Set(l.map((x) => `${x.t}|${x.msg}`)); return [...l, ...s.log.filter((x) => !seen.has(`${x.t}|${x.msg}`))].slice(-600); }); // dev StrictMode runs two pollers
      }
      setSt(s);
      setNowTs(Date.now());
      // fire once per new question / run end; first poll only records the baseline
      const qIds = [...(s.messages || []).filter((m) => m.from === 'claude' && m.open).map((m) => m.id),
        ...(s.fixes || []).filter((f) => f.state === 'proposed').map((f) => `p:${f.id}`)];
      const prev = seenEvt.current;
      if (prev.qs) {
        qIds.filter((id) => !prev.qs.includes(id)).forEach((id) => (id.startsWith('p:')
          ? ping('RunMyTCs: Claude proposed a fix', `${shortPath(((s.fixes || []).find((f) => `p:${f.id}` === id) || {}).path)} — approve or dismiss`)
          : ping('RunMyTCs: Claude needs your input', ((s.messages || []).find((m) => m.id === id) || {}).text || '')));
        if (prev.status && prev.status !== s.status && ['done', 'stopped'].includes(s.status)) ping(`RunMyTCs run ${s.config?.runId} ${s.status}`, 'Summary is ready — open the Report.');
      }
      seenEvt.current = { qs: qIds, status: s.status };
      document.title = qIds.length ? `(${qIds.length}) RunMyTCs — needs you` : (['running', 'paused'].includes(s.status) ? '▶ RunMyTCs' : 'RunMyTCs');
      if (s.status === 'running' || s.status === 'paused') setShowCfg(false);
    } catch { /* server restarting */ }
  }, []);
  useEffect(() => { poll(); const t = setInterval(poll, 4000); return () => clearInterval(t); }, [poll]);

  const loadCases = useCallback(() => {
    call(`/cases?runId=${runId || ''}`).then(setCases).catch(() => {});
  }, [runId]);
  useEffect(() => {
    fetch('/api/testcases/data', { cache: 'no-store' }).then((r) => r.json()).then(setManifest).catch(() => {});
  }, []);

  // ── maps the Cypress-Runner-style tree reads (all from RunMyTCs' own store) ──
  const byId = useMemo(() => Object.fromEntries(cases.map((c) => [c.id, c])), [cases]);
  const marks = useMemo(() => Object.fromEntries(cases.filter((c) => c.rmt).map((c) => [c.id, { status: c.rmt, updatedAt: c.updatedAt }])), [cases]);
  const notesMap = useMemo(() => Object.fromEntries(cases.filter((c) => c.note).map((c) => [c.id, { text: c.note, updatedAt: c.updatedAt }])), [cases]);
  const bugMap = useMemo(() => Object.fromEntries(cases.filter((c) => c.bug).map((c) => [c.id, { bugId: c.bug, updatedAt: c.updatedAt }])), [cases]);
  const runStatusObj = useMemo(() => {
    const statuses = {};
    cases.forEach((c) => { if (c.testrail && c.testrail !== 'not in run') statuses[c.id.slice(1)] = { status: c.testrail[0].toUpperCase() + c.testrail.slice(1) }; });
    return { statuses };
  }, [cases]);
  // Drives the file-card colours (green all passed / red all failed / amber mixed) and each
  // case's pill, exactly as on Cypress Runner. Per case: a RunMyTCs mark wins, else the newest
  // recorded result, else the TestRail run's status. Untested cases are left out so they
  // don't colour a card.
  const STATUS_TO_ID = { passed: 1, blocked: 2, retest: 4, failed: 5 };
  const caseResultsByPath = useMemo(() => {
    const m = {};
    cases.forEach((c) => {
      const last = (c.results || []).at(-1);
      const s = c.rmt || (last && last.result) || c.testrail;
      const id = STATUS_TO_ID[s];
      if (!id) return;
      (m[c.path] = m[c.path] || {})[c.id.slice(1)] = id;
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases]);
  // per-file trend dots: one per recorded build/run, failed if any case in it failed
  const fileTrendMap = useMemo(() => {
    const byPath = {};
    cases.forEach((c) => (c.results || []).forEach((r) => {
      const runs = (byPath[c.path] = byPath[c.path] || {});
      const k = r.ref || String(r.t);
      const prev = runs[k];
      runs[k] = { completedAt: r.t, jobName: r.ref, status: (prev && prev.status === 'FAILURE') || r.result === 'failed' ? 'FAILURE' : 'SUCCESS' };
    }));
    const out = {};
    Object.entries(byPath).forEach(([p, runs]) => { out[p] = Object.values(runs).sort((a, b) => a.completedAt - b.completedAt).slice(-12); });
    return out;
  }, [cases]);
  // "This run only" narrows the tree to the cases the current/last run worked; markers show what changed
  const treeData = useMemo(() => (runOnly ? { ...manifest, rows: manifest.rows.filter((r) => byId[r.id]?.inRun) } : manifest), [runOnly, manifest, byId]);
  const markers = useMemo(() => {
    const m = {};
    cases.forEach((c) => {
      const f = c.flags; if (!f) return;
      const t = [];
      if (f.fixed) t.push('🛠 fixed'); else if (f.newPass) t.push('🆕 now passing');
      if (f.regression) t.push('🔁 regression');
      if (t.length) m[c.id] = t;
    });
    return m;
  }, [cases]);
  const toggleFileSelect = (path, cat) => setSelectedFiles((prev) => { const n = new Map(prev); if (n.has(path)) n.delete(path); else n.set(path, cat); return n; });
  const toggleManySelect = (paths, cat, checked) => setSelectedFiles((prev) => { const n = new Map(prev); paths.forEach((p) => { if (checked) n.set(p, cat); else n.delete(p); }); return n; });
  // Turns the checked specs into the run's whitelist (include) or blocklist (exclude). Whitelisting
  // also ticks the selected specs' types, or a checked E2E spec would be filtered out by "Types".
  const applySelection = (mode) => {
    const paths = [...selectedFiles.keys()];
    const cats = [...new Set([...selectedFiles.values()].map((c) => String(c).toLowerCase()))];
    setCfg((c) => (mode === 'include'
      ? { ...c, include: paths, exclude: (c.exclude || []).filter((x) => !paths.includes(x)), cats: [...new Set([...c.cats, ...cats])] }
      : { ...c, exclude: [...new Set([...(c.exclude || []), ...paths])], include: (c.include || []).filter((x) => !paths.includes(x)) }));
    setSelectedFiles(new Map());
    toast?.showToast(mode === 'include' ? `Whitelist set: next run covers only these ${paths.length} spec(s)` : `${paths.length} spec(s) added to the blocklist`, 'success');
  };
  const getCaseStatus = useCallback((r) => (byId[r.id] ? byId[r.id].status : 'untested'), [byId]);

  const editCase = async (caseId, patch, msg) => {
    try { await call('/case', { caseId, ...patch }); if (msg) toast?.showToast(msg, 'success'); loadCases(); } catch (e) { toast?.showToast(e.message, 'error'); }
  };
  // same toggle semantics as Cypress Runner: clicking the active status clears the mark
  const setManual = (caseId, status) => editCase(caseId, { status: marks[caseId]?.status === status ? '' : status });
  const editBug = async (caseId) => {
    const val = await showPrompt(`Bug ID for ${caseId} (e.g. IC-43463):`, bugMap[caseId]?.bugId || '');
    if (val !== null) editCase(caseId, { bug: val.trim() });
  };
  const editNote = async (caseId) => {
    const val = await showPrompt(`Note for ${caseId}:`, notesMap[caseId]?.text || '');
    if (val !== null) editCase(caseId, { note: val });
  };
  const runOneFile = (path, cat) => {
    if (active) { toast?.showToast('A RunMyTCs run is active — add files to it via Settings next time, or stop it first', 'error'); return; }
    if (!cfg.runId) { toast?.showToast('Enter a TestRail run ID in Settings first', 'error'); return; }
    setLogs([]); lastLog.current = 0;
    act('/start', { ...cfg, include: [path], statuses: ALL_STATUSES, cats: [String(cat).toLowerCase()] }, `RunMyTCs started for ${shortPath(path)}`);
  };
  const importFrom = async (source) => {
    const overwrite = window.confirm(`Pull marks, bug links and notes from the ${source === 'jenkins' ? 'Jenkins' : 'Cypress'} Runner page.\n\nOK = overwrite existing RunMyTCs marks\nCancel = only fill cases that have no RunMyTCs mark yet`);
    setImporting(true);
    try {
      const n = await call('/import', { source, overwrite });
      toast?.showToast(`Imported ${n.status} status, ${n.bug} bug(s), ${n.note} note(s), ${n.results} dated result(s)`, 'success');
      loadCases();
    } catch (e) { toast?.showToast(e.message, 'error'); }
    setImporting(false);
  };
  const toggleSet = (setter) => (key) => setter((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  useEffect(() => { loadCases(); const t = setInterval(loadCases, 30000); return () => clearInterval(t); }, [loadCases]);
  useEffect(() => { if (logBox.current) logBox.current.scrollTop = logBox.current.scrollHeight; }, [logs]);

  const copyText = async (text, msg) => { const ok = await copyTextRaw(text); toast?.showToast(ok ? msg : 'Copy failed — clipboard blocked', ok ? 'success' : 'error'); };
  const [presets, setPresets] = useState([]);
  useEffect(() => { call('/presets').then(setPresets).catch(() => {}); }, []);
  const savePreset = async () => {
    const name = await showPrompt('Name for this preset (saving under an existing name replaces it):', '');
    if (name === null || !name.trim()) return;
    if (presets.some((p) => p.name === name.trim()) && !window.confirm(`Replace the existing preset "${name.trim()}"?`)) return;
    const withRun = cfg.runId ? window.confirm(`Include TestRail run ID ${cfg.runId} in the preset?\n\nOK = include it · Cancel = keep whatever run ID is entered when you apply it`) : false;
    try { setPresets(await call('/presets', { name: name.trim(), config: { ...cfg, runId: withRun ? cfg.runId : '' } })); toast?.showToast(`Preset "${name.trim()}" saved`, 'success'); }
    catch (e) { toast?.showToast(e.message, 'error'); }
  };
  const deletePreset = async (name) => {
    if (!window.confirm(`Delete preset "${name}"?`)) return;
    try { setPresets(await call('/presets/delete', { name })); toast?.showToast(`Preset "${name}" deleted`, 'success'); } catch (e) { toast?.showToast(e.message, 'error'); }
  };
  const [failures, setFailures] = useState([]);
  const [lanes, setLanes] = useState({ jq: {}, cs: {}, at: 0 });
  useEffect(() => {
    if (!active) return undefined;
    const load = async () => {
      try { const [jq, cs] = await Promise.all([fetch('/api/testcases/job-queue').then((r) => r.json()), fetch('/api/cypress/state').then((r) => r.json())]); setLanes({ jq, cs, at: Date.now() }); } catch { /* server busy */ }
    };
    load(); const t = setInterval(load, 8000); return () => clearInterval(t);
  }, [active]);
  useEffect(() => {
    const load = () => call('/failures').then(setFailures).catch(() => {});
    load(); const t = setInterval(load, 10000); return () => clearInterval(t);
  }, []);
  const analyse = async (p) => {
    try { await call('/analyse', { path: p }); toast?.showToast(`Claude is analysing ${shortPath(p)} — it will propose, not change`, 'success'); poll(); setFailures(await call('/failures')); }
    catch (e) { toast?.showToast(e.message, 'error'); }
  };
  const analyseSelected = async () => {
    const paths = failures.filter((f) => selectedFiles.has(f.path)).map((f) => f.path);
    for (const p of paths) { try { await call('/analyse', { path: p }); } catch (e) { toast?.showToast(`${shortPath(p)}: ${e.message}`, 'error'); } }
    toast?.showToast(`Queued ${paths.length} spec(s) for Claude analysis`, 'success'); setSelectedFiles(new Map()); setTab('overview'); poll();
  };
  const openEvidence = async (ref, title) => {
    try { setModal({ type: 'evidence', title, ev: await call(`/evidence?ref=${encodeURIComponent(ref)}`) }); } catch (e) { toast?.showToast(e.message, 'error'); }
  };
  const act = async (path, body, msg) => {
    try { await call(path, body ?? {}); if (msg) toast?.showToast(msg, 'success'); poll(); } catch (e) { toast?.showToast(e.message, 'error'); }
  };
  const start = () => {
    setModal(null);
    setLogs([]); lastLog.current = 0;
    act('/start', cfg, `RunMyTCs started on run ${cfg.runId}`);
  };
  // Start opens a preview of what the run will do; the run itself starts from the preview.
  const previewStart = async () => {
    if (!cfg.runId) { toast?.showToast('Enter a TestRail run ID', 'error'); return; }
    setModal({ type: 'preview', loading: true });
    try { setModal({ type: 'preview', p: await call('/preview', cfg) }); } catch (e) { setModal(null); toast?.showToast(e.message, 'error'); }
  };

  const items = useMemo(() => st.items || [], [st.items]);
  const fixes = st.fixes || [];
  const awaiting = fixes.filter((f) => f.state === 'awaiting-approval' || f.state === 'proposed');
  const progress = useMemo(() => {
    const by = {};
    items.forEach((it) => {
      const k = it.cat; by[k] = by[k] || { total: 0, done: 0, running: 0 };
      by[k].total++; if (it.state === 'done' || it.state === 'skipped') by[k].done++; if (it.state === 'queued' || it.state === 'running') by[k].running++;
    });
    return by;
  }, [items]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cases.filter((c) => {
      if (filter === 'run' && !c.inRun) return false;
      if (filter === 'notpassed' && c.status === 'passed') return false;
      if (filter === 'failed' && c.status !== 'failed') return false;
      if (filter === 'blocked' && c.status !== 'blocked') return false;
      if (filter === 'bugs' && !c.bug) return false;
      if (filter === 'notes' && !c.note) return false;
      if (!needle) return true;
      return `${c.id} ${c.title} ${c.path} ${c.note} ${c.bug}`.toLowerCase().includes(needle);
    });
  }, [cases, filter, q]);
  const counts = useMemo(() => cases.reduce((m, c) => { m[c.status] = (m[c.status] || 0) + 1; return m; }, {}), [cases]);

  const saveEdit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await call('/case', { caseId: modal.c.id, status: f.get('status'), note: f.get('note'), bug: f.get('bug') });
      setModal(null); loadCases(); toast?.showToast(`${modal.c.id} updated`, 'success');
    } catch (err) { toast?.showToast(err.message, 'error'); }
  };

  if (!cfg) return <div className="rmt-page"><p className="rmt-muted">Loading RunMyTCs…</p></div>;

  const openQs = (st.messages || []).filter((m) => m.from === 'claude' && m.open).length;
  const proposals = (st.fixes || []).filter((f) => f.state === 'proposed').length;
  const curTab = tab || (active ? 'overview' : 'cases');
  const elapsed = st.startedAt ? Math.max(0, Math.round(((st.finishedAt || nowTs || st.startedAt) - st.startedAt) / 60000)) : 0;
  return (
    <div className="rmt-page">
      <header className="rmt-head rmt-sticky">
        <div className="rmt-title"><Bot size={22} /><div><h1>RunMyTCs {st.status !== 'idle' && <span className={`rmt-pill rmt-st-${st.status}`}>{st.status}</span>}</h1>
          <p className="rmt-muted">{st.config ? <>Run <b>{st.config.runId}</b>{st.runName ? ` · ${st.runName}` : ''} · {elapsed} min{st.claudeBusy ? ` · Claude ${st.claudeBusy.kind} (${st.claudeBusy.model})…` : ''}</> : 'Rerun your manifest specs against a TestRail run, triage failures with Claude, fix and verify — unattended.'}</p></div></div>
        <div className="rmt-controls">
          {!active && <button className="rmt-btn rmt-primary" onClick={previewStart}><Play size={15} />Start…</button>}
          <button className={`rmt-btn ${notify ? 'rmt-on' : ''}`} title={notify ? 'Browser notifications on' : 'Notify me when Claude asks something or the run ends'} onClick={toggleNotify}><Bell size={15} /></button>
          {st.status === 'running' && <button className="rmt-btn" onClick={() => act('/pause', {}, 'Paused')}><Pause size={15} />Pause</button>}
          {st.status === 'paused' && <button className="rmt-btn rmt-primary" onClick={() => act('/resume', {}, 'Resumed')}><PlayCircle size={15} />Resume</button>}
          {active && <button className="rmt-btn" title="Skip anything waiting on you, reconcile with TestRail and write the summary" onClick={() => window.confirm('Finish now? Fixes waiting for your approval or answer are skipped.') && act('/finish', {}, 'Finishing')}><Flag size={15} />Finish now</button>}
          {active && <button className="rmt-btn rmt-danger" onClick={() => window.confirm('Stop this RunMyTCs run? Builds already queued will still finish.') && act('/stop', {}, 'Stopped')}><Square size={15} />Stop</button>}
          <button className="rmt-btn" onClick={async () => { try { setModal({ type: 'report', r: await call('/report') }); } catch (e) { toast?.showToast(e.message, 'error'); } }}><FileBarChart size={15} />Report</button>
        </div>
      </header>

      {proposals > 0 && (
        <button className="rmt-q-banner" onClick={() => setTab('overview')}><Bot size={16} /> Claude proposed {proposals} fix{proposals > 1 ? 'es' : ''} — nothing has changed yet. <u>Review &amp; approve on the Fixes card</u></button>
      )}
      {openQs > 0 && (
        <button className="rmt-q-banner" onClick={() => setTab('overview')}><MessageSquare size={16} /> Claude asked you {openQs} question{openQs > 1 ? 's' : ''} — the rest of the run keeps going. <u>Answer in the chat</u></button>
      )}
      <KpiStrip st={st} cases={cases} />
      {st.status !== 'idle' && <Stepper st={st} />}

      <section className="rmt-card">
        <button className="rmt-card-toggle" onClick={() => setShowCfg((v) => !v)}>
          {showCfg ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<Settings2 size={15} /> Settings {active && <span className="rmt-muted">(locked while a run is active)</span>}
          {!showCfg && (() => { const c = active ? { ...cfg, ...st.config } : cfg; return <span className="rmt-muted rmt-cfg-sum">run {c.runId || '—'} · {c.statuses.length === ALL_STATUSES.length ? 'all cases' : c.statuses.join('+')} · {c.cats.join('/')} · on failure: {c.onFailure}{c.onFailure === 'fix' ? ` (${c.fixApproval}, cap ${c.maxFixes})` : ''} · {c.maxParallelJenkins ?? 2} parallel{c.include?.length ? ` · only ${c.include.length} spec(s)` : ''}</span>; })()}
        </button>
        {showCfg && <ConfigForm cfg={active ? { ...cfg, ...st.config } : cfg} setCfg={setCfg} jobs={defaults?.jobs} disabled={active}
          presets={presets} onSavePreset={savePreset} onDeletePreset={deletePreset} />}
      </section>

      <nav className="rmt-tabs">
        {[['overview', 'Overview', fixes.length ? `${fixes.length} fixes` : ''], ['cases', 'Cases', `${cases.length}`], ['activity', 'Activity', '']].map(([k, l, b]) => (
          <button key={k} className={curTab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}{b ? <span className="rmt-tab-badge">{b}</span> : null}{k === 'overview' && openQs ? <span className="rmt-tab-dot" /> : null}</button>))}
      </nav>

      {curTab === 'overview' && <div className="rmt-ov">
        <LanesCard st={st} items={items} lanes={lanes} progress={progress} active={active}
          onFixApproval={(mode) => act('/fix-approval', { mode })} />
        <div className="rmt-ov-grid">
          <FailuresCard failures={failures} onEvidence={openEvidence} onAnalyse={analyse} onShot={(f) => setModal({ type: 'shot', f })} />
          <FixesCard fixes={fixes} usage={st.usage || []} awaiting={awaiting} onAct={act} onEvidence={openEvidence} onModal={setModal}
            onCopyVerified={() => copyText(fixes.filter((f) => f.state === 'verified' && f.diff && f.review !== 'discarded').map((f) => `# ${shortPath(f.path)} — ${f.summary || ''}\n${f.diff}`).join('\n\n'), 'Verified diffs copied')} />
        </div>
        <div className="rmt-ov-grid">
          <ClaudeCard st={st} fixes={fixes} />
          <ChatPanel messages={st.messages || []} enabled={!!st.config} fixes={fixes} onOpenFix={(f) => setModal(f.state === 'proposed' ? { type: 'proposal', f } : { type: 'diff', f })}
            onSend={async (text, answerTo) => { try { await call('/message', { text, answerTo }); poll(); return true; } catch (e) { toast?.showToast(e.message, 'error'); return false; } }} />
        </div>
      </div>}

      {curTab === 'cases' && <section className="rmt-card">
        <h3><ScrollText size={15} /> Cases <span className="rmt-muted">(manifest · TestRail run {runId || '—'} · RunMyTCs marks)</span>
          <span className="rmt-h3-actions">
            <button className={`rmt-tab ${view === 'tree' ? 'on' : ''}`} onClick={() => setView('tree')}>Tree</button>
            <button className={`rmt-tab ${view === 'table' ? 'on' : ''}`} onClick={() => setView('table')}>Table</button>
            <button className="rmt-btn rmt-sm" disabled={importing} onClick={() => importFrom('jenkins')}><Download size={13} />Pull from Jenkins Runner</button>
            <button className="rmt-btn rmt-sm" disabled={importing} onClick={() => importFrom('cypress')}><Download size={13} />Pull from Cypress Runner</button>
            <button className="rmt-btn rmt-sm" onClick={loadCases} title="Reload"><RefreshCw size={13} /></button>
          </span>
        </h3>
        {view === 'tree' ? (<>
          <div className="rmt-filters">
            {CAT_ORDER.map((cat) => (
              <button key={cat} className={`rmt-tab ${activeCats[cat] ? 'on' : ''}`} onClick={() => setActiveCats((a) => ({ ...a, [cat]: !a[cat] }))}>{CAT_LABELS[cat]}</button>))}
            <span className="rmt-sep" />
            <button className={`rmt-tab ${runOnly ? 'on' : ''}`} disabled={!cases.some((c) => c.inRun)} onClick={() => setRunOnly((v) => !v)} title="Only the cases the current / last run worked">This run only</button>
            <span className="rmt-sep" />
            {[[null, 'All'], ['passed', 'Passed'], ['failed', 'Failed'], ['blocked', 'Blocked'], ['retest', 'Retest'], ['untested', 'Untested']].map(([k, l]) => (
              <button key={l} className={`rmt-tab ${statusFilter === k ? 'on' : ''}`} onClick={() => setStatusFilter(k)}>{l}{k && counts[k] ? ` ${counts[k]}` : ''}</button>))}
            <span className="rmt-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search id, title, spec…" /></span>
          </div>
          {selectedFiles.size > 0 && (
            <div className="rmt-selbar">
              <b>{selectedFiles.size} spec{selectedFiles.size > 1 ? 's' : ''} selected</b>
              <span className="rmt-muted">{manifest.rows.filter((r) => selectedFiles.has(r.path)).length} cases</span>
              <button className="rmt-btn rmt-sm rmt-primary" disabled={active} onClick={() => applySelection('include')} title="Whitelist: the next run covers only these specs">Run only these</button>
              <button className="rmt-btn rmt-sm" disabled={!failures.some((f) => selectedFiles.has(f.path))} onClick={analyseSelected} title="Claude analyses the recorded failure of each selected spec and proposes a fix — nothing changes until you approve"><Bot size={13} />Analyse failures with Claude</button>
              <button className="rmt-btn rmt-sm" disabled={active} onClick={() => applySelection('exclude')} title="Blocklist: the next run skips these specs">Exclude these</button>
              <button className="rmt-btn rmt-sm" onClick={() => setSelectedFiles(new Map())}>Clear</button>
              {active && <span className="rmt-muted">(a run is active — apply after it ends)</span>}
            </div>
          )}
          {cfg && (cfg.include?.length > 0 || cfg.exclude?.length > 0) && (
            <div className="rmt-listbar">
              {cfg.include?.length > 0 && <span>✅ Whitelist: <b>{cfg.include.length}</b> spec{cfg.include.length > 1 ? 's' : ''} <button className="rmt-link" disabled={active} onClick={() => setCfg((c) => ({ ...c, include: [] }))}>clear</button></span>}
              {cfg.exclude?.length > 0 && <span>⛔ Blocklist: <b>{cfg.exclude.length}</b> spec{cfg.exclude.length > 1 ? 's' : ''} <button className="rmt-link" disabled={active} onClick={() => setCfg((c) => ({ ...c, exclude: [] }))}>clear</button></span>}
              <span className="rmt-muted">used by the next Start</span>
            </div>
          )}
          <div className="rmt-tree">
            <FileTree
              data={treeData} activeCats={activeCats} issueFilter={statusFilter} searchTerm={q}
              tags={markers}
              runStatus={runId ? runStatusObj : null} notes={notesMap}
              jenkinsConfig={{ jobs: { OFFLINE: ['rmt'], ONLINE: ['rmt'], E2E: ['rmt'] } }}
              selectedFiles={selectedFiles} onToggleFileSelect={toggleFileSelect} onToggleManySelect={toggleManySelect}
              openFiles={openFiles} onToggleFileOpen={toggleSet(setOpenFiles)}
              collapsedGroups={collapsedGroups} onToggleGroupCollapse={toggleSet(setCollapsedGroups)}
              fileTrendMap={fileTrendMap} onRunFile={runOneFile} onOpenNote={editNote} onVisiblePathsChange={() => {}}
              showToast={toast?.showToast} sortMode="name" testrailUrl={defaults?.testrailUrl} runLabel="Run this spec with RunMyTCs"
              caseResultsByPath={caseResultsByPath} manualStatus={marks} onSetManualStatus={setManual}
              getCaseStatus={getCaseStatus} bugLinks={bugMap} onEditBugLink={editBug} onClearBugLink={(id) => editCase(id, { bug: '' })}
              onViewHistory={(path) => setModal({ type: 'filehist', path })}
            />
          </div>
        </>) : (<>
        <div className="rmt-filters">
          {[['run', 'This run'], ['notpassed', 'Not passed'], ['failed', 'Failed'], ['blocked', 'Blocked'], ['bugs', 'With bug'], ['notes', 'With note'], ['all', 'All manifest']].map(([k, l]) => (
            <button key={k} className={`rmt-tab ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>))}
          <span className="rmt-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search id, title, spec, note…" /></span>
          <span className="rmt-muted">{Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}</span>
        </div>
        <div className="rmt-table-wrap">
          <table className="rmt-table">
            <thead><tr><th>Case</th><th>Spec</th><th>Status</th><th>TestRail</th><th>Recent results</th><th>Class</th><th>Bug</th><th>Note</th><th /></tr></thead>
            <tbody>{shown.slice(0, 400).map((c) => (
              <tr key={c.id} className={c.commented ? 'rmt-dim' : ''}>
                <td><b>{c.id}</b><div className="rmt-muted rmt-ellipsis" title={c.title}>{c.title}</div></td>
                <td className="rmt-ellipsis" title={c.path}><span className="rmt-cat">{c.cat}</span> {shortPath(c.path)}</td>
                <td><StatusChip s={c.status} />{c.rmt && c.rmt !== c.testrail ? <div className="rmt-muted rmt-xs">RunMyTCs mark</div> : null}</td>
                <td className="rmt-muted">{c.testrail}</td>
                <td><ResultDots results={c.results} /></td>
                <td>{c.cls &&<span className="rmt-cls">{c.cls}</span>}</td>
                <td>{c.bug && <span className="rmt-bug"><Bug size={12} />{c.bug}</span>}</td>
                <td className="rmt-note-cell" title={c.note}>{c.note && <><StickyNote size={12} /> {c.note}</>}</td>
                <td><button className="rmt-btn rmt-sm" onClick={() => setModal({ type: 'edit', c })}>Open</button></td>
              </tr>))}
            </tbody>
          </table>
          {shown.length > 400 && <p className="rmt-muted">Showing 400 of {shown.length} — narrow with a filter or search.</p>}
          {!shown.length && <p className="rmt-muted">No cases match.</p>}
        </div>
        </>)}
      </section>}

      {curTab === 'activity' && <section className="rmt-grid">
        <div className="rmt-card">
          <h3><ScrollText size={15} /> Live log</h3>
          <div className="rmt-log" ref={logBox}>{logs.map((l, i) => (
            <div key={i} className={`rmt-log-${l.level}`}><span className="rmt-muted">{fmtTime(l.t)}</span> {l.msg}</div>))}
          </div>
        </div>
        <div className="rmt-card">
          <h3><History size={15} /> Past runs</h3>
          {!hist.length && <p className="rmt-muted">None yet.</p>}
          <ul className="rmt-hist">{hist.map((h) => (
            <li key={h.id}><b>Run {h.runId}</b> <span className="rmt-muted">{new Date(h.startedAt).toLocaleString()} · {h.status}</span>
              {h.summary && <div className="rmt-muted">now: {Object.entries(h.summary.now || {}).map(([k, v]) => `${k} ${v}`).join(' · ')}</div>}</li>))}
          </ul>
        </div>
      </section>}

      {modal && (
        <ModalPortal>
          <div className="rmt-overlay" onClick={() => setModal(null)}>
            <div className="rmt-modal" onClick={(e) => e.stopPropagation()}>
              <button className="rmt-close" onClick={() => setModal(null)}><X size={16} /></button>
              {modal.type === 'filehist' && (() => {
                const fileCases = cases.filter((c) => c.path === modal.path);
                return <><h3><History size={16} /> {shortPath(modal.path)}</h3>
                  <p className="rmt-muted">Dated pass/fail record per case (newest last, up to 12 shown — open a case in Table view for its full record).</p>
                  <table className="rmt-table rmt-results-table"><thead><tr><th>Case</th><th>Now</th><th>Record</th><th>Last result</th></tr></thead>
                    <tbody>{fileCases.map((c) => {
                      const last = (c.results || []).at(-1);
                      return <tr key={c.id}><td><b>{c.id}</b><div className="rmt-muted rmt-xs">{c.title}</div></td><td><StatusChip s={c.status} /></td>
                        <td><ResultDots results={c.results} /></td><td className="rmt-muted">{last ? `${last.result} · ${fmtDate(last.t)}` : '—'}
                          {c.evidence && <button className="rmt-btn rmt-sm" style={{ marginLeft: 6 }} onClick={() => setModal({ type: 'evidence', title: `Evidence — ${c.id}`, ev: { ...c.evidence, errors: { [c.id]: c.evidence.error } } })}><ImageIcon size={12} />Evidence</button>}</td></tr>;
                    })}</tbody></table></>;
              })()}
              {modal.type === 'report' && <><h3><FileBarChart size={16} /> RunMyTCs report
                <span className="rmt-h3-actions">
                  <button className="rmt-btn rmt-sm" onClick={async () => { try { copyText((await call('/report.md')).markdown, 'Report copied as Markdown'); } catch (e) { toast?.showToast(e.message, 'error'); } }}><Copy size={13} />Copy Markdown</button>
                  <button className="rmt-btn rmt-sm" onClick={() => window.confirm('Send this report to your Telegram?') && act('/report/telegram', {}, 'Report sent to Telegram')}><Send size={13} />Send to Telegram</button>
                </span></h3><ReportView r={modal.r} /></>}
              {modal.type === 'proposal' && <form className="rmt-edit" onSubmit={async (e) => { e.preventDefault(); const note = new FormData(e.target).get('note'); setModal(null); await act('/proposal', { fixId: modal.f.id, approve: true, note }, 'Approved — Claude is applying the fix, then it is verified locally'); }}>
                <h3><Bot size={16} /> Claude's proposed fix — {shortPath(modal.f.path)}</h3>
                <p className="rmt-muted">{modal.f.cases.join(', ')} · {modal.f.summary}</p>
                <pre className="rmt-diff">{(modal.f.proposal || '').split('\n').map((l, i) => <div key={i} className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : ''}>{l}</div>)}</pre>
                <label>Note for Claude (optional — e.g. "use LoadFormData.enterpriseUser instead")<textarea name="note" rows={2} /></label>
                <div className="rmt-edit-actions">
                  <button type="button" className="rmt-btn" onClick={() => openEvidence(modal.f.ref, `Evidence — ${shortPath(modal.f.path)}`)}><ImageIcon size={14} />Evidence</button>
                  <button type="button" className="rmt-btn" onClick={() => { setModal(null); act('/proposal', { fixId: modal.f.id, approve: false }, 'Proposal dismissed'); }}><X size={14} />Dismiss</button>
                  <button type="submit" className="rmt-btn rmt-primary"><Check size={14} />Approve &amp; apply</button>
                </div>
              </form>}
              {modal.type === 'shot' && <img className="rmt-shot-big" src={evFile(modal.f)} alt={modal.f} />}
              {modal.type === 'evidence' && <><h3><ImageIcon size={16} /> {modal.title}</h3><EvidenceView ev={modal.ev} /></>}
              {modal.type === 'preview' && (modal.loading ? <p className="rmt-muted">Sizing the run…</p> : <>
                <h3><Play size={16} /> Start run {cfg.runId}{modal.p.runName ? ` — ${modal.p.runName}` : ''}?</h3>
                <div className="rmt-kpis">
                  <Kpi label="Spec files" value={modal.p.specs} />
                  <Kpi label="Cases" value={modal.p.cases} sub={Object.entries(modal.p.statusCount).map(([k, v]) => `${v} ${k}`).join(' · ')} />
                  {modal.p.byTarget.auto
                    ? <Kpi label="Local first" value={modal.p.byTarget.auto} sub="local runner when free · Jenkins takes the overflow" tone="info" />
                    : <><Kpi label="On Jenkins" value={modal.p.byTarget.jenkins.offline + modal.p.byTarget.jenkins.online + modal.p.byTarget.jenkins.e2e} sub={`${modal.p.byTarget.jenkins.offline} offline · ${modal.p.byTarget.jenkins.online} online · ${modal.p.byTarget.jenkins.e2e} e2e`} />
                      <Kpi label="On device" value={modal.p.byTarget.local} /></>}
                  {modal.p.byTarget.auto > 0 && modal.p.specs - modal.p.byTarget.auto > 0 && <Kpi label="Pinned" value={modal.p.specs - modal.p.byTarget.auto} sub="local-only or Jenkins-only" />}
                  <Kpi label="Estimated" value={modal.p.etaMin >= 60 ? `${Math.floor(modal.p.etaMin / 60)}h ${modal.p.etaMin % 60}m` : `${modal.p.etaMin}m`} sub={`runs only, at ${cfg.maxParallelJenkins ?? 2} parallel${modal.p.noHistory ? ` · ${modal.p.noHistory} spec(s) guessed` : ''}`} tone="info" />
                </div>
                <p className="rmt-muted">On failure: {cfg.onFailure}{cfg.onFailure === 'fix' ? ` (${cfg.fixApproval} approval, cap ${cfg.maxFixes})` : ''} · Jira {cfg.jira ? 'on' : 'off'}{modal.p.dropped ? ` · ${modal.p.dropped} spec(s) skipped — their resource is off` : ''}. Fix time comes on top of the estimate.</p>
                {!modal.p.specs ? <p className="rmt-warn-banner">Nothing matches these settings.</p> : null}
                <div className="rmt-edit-actions"><button className="rmt-btn" onClick={() => setModal(null)}>Cancel</button> <button className="rmt-btn rmt-primary" disabled={!modal.p.specs} onClick={start}><Play size={14} />Start run</button></div>
              </>)}
              {modal.type === 'diff' && <><h3><FileDiff size={16} /> {shortPath(modal.f.path)}</h3>
                <p className="rmt-muted">Uncommitted, in {modal.f.worktree} — review before merging.</p>
                <pre className="rmt-diff">{modal.f.diff.split('\n').map((l, i) => <div key={i} className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : ''}>{l}</div>)}</pre></>}
              {modal.type === 'edit' && <form onSubmit={saveEdit} className="rmt-edit">
                <h3>{modal.c.id} <span className="rmt-muted">{modal.c.title}</span></h3>
                <label>Status (RunMyTCs mark)<select name="status" defaultValue={modal.c.rmt || ''}>
                  <option value="">— use TestRail ({modal.c.testrail})</option>
                  {['passed', 'failed', 'blocked', 'retest'].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
                <label>Bug (Jira key)<input name="bug" defaultValue={modal.c.bug} placeholder="IC-43463" /></label>
                <label>Note<textarea name="note" rows={4} defaultValue={modal.c.note} /></label>
                {modal.c.evidence && <><h4 className="rmt-sub">Failure evidence</h4><EvidenceView ev={modal.c.evidence} caseId={modal.c.id} /></>}
                <ResultsHistory caseId={modal.c.id} />
                {modal.c.history?.length ? <details><summary>Notes &amp; marks history ({modal.c.history.length})</summary>
                  <ul className="rmt-xs">{modal.c.history.slice().reverse().map((h, i) => <li key={i}>{new Date(h.t).toLocaleString()} · {h.src}{h.runId ? ` · run ${h.runId}` : ''}{h.status ? ` · ${h.status}` : ''}{h.bug ? ` · ${h.bug}` : ''}{h.note ? ` · ${h.note}` : ''}</li>)}</ul></details> : null}
                <div className="rmt-edit-actions"><button type="submit" className="rmt-btn rmt-primary">Save</button></div>
              </form>}
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
