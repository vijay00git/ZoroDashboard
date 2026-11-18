import { useCallback, useEffect, useState } from 'react';
import { X, ExternalLink, Play, Copy, Search, Trash2, Archive, ArchiveRestore, Bug } from 'lucide-react';
import { showConfirm, showPrompt } from '../../utils/Alerts';
import ModalPortal from './ModalPortal';
import { testRailCaseUrl, copyText, CASE_EVENT_STYLE } from './helpers';

const short = (p) => String(p || '').replace('cypress/e2e/functional_tests/Regression/', '');
const fmt = (ms) => (ms ? new Date(ms).toLocaleString() : '—');
const KIND_COLOR = { tracker: 'var(--accent-orange)', local: 'var(--accent-cyan)', jenkins: 'var(--accent-purple)', manual: 'var(--accent-yellow)', bug: 'var(--accent-red)', manifest: 'var(--accent-green)' };
const KIND_LABEL = { tracker: 'Tracker', local: 'Local run', jenkins: 'Jenkins', manual: 'Manual mark', bug: 'Bug link', manifest: 'Manifest' };
const TRACKER_LABEL = {
  case_added: 'Found in spec', case_missing: 'Removed from codebase', case_restored: 'Back in codebase',
  case_moved: 'Moved to another spec', case_commented: 'Commented out', case_uncommented: 'Uncommented',
  cases_owned: 'Added to case manifest', cases_disowned: 'Removed from case manifest', case_dismissed: 'Dismissed',
  case_retired: 'Marked intentionally removed', case_unretired: 'Un-retired',
};

// Slide-in detail for one case: everything the overview knows, plus its full
// timeline (tracker events, local runs, Jenkins jobs, manual marks, bugs).
const CaseDetailDrawer = ({ c, status, testrailUrl, onClose, onRun, onChanged, onClosed, showToast, environment }) => {
  const [locate, setLocate] = useState(null);
  const [locating, setLocating] = useState(false);
  const [timeline, setTimeline] = useState(null);
  const [deps, setDeps] = useState((c.deps || []).join(', '));
  const [grp, setGrp] = useState(c.grp);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/cases/history/${c.id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((body) => setTimeline(body.timeline || []))
      .catch(() => setTimeline([]));
  }, [c.id]);
  useEffect(() => { load(); }, [load]);

  const save = async (body) => {
    setSaving(true);
    try {
      const res = await fetch('/api/testcases/case-manifest/update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || res.statusText);
      if (showToast) showToast(`Saved ${c.id}`, 'success');
      if (onChanged) onChanged();
    } catch (e) {
      if (showToast) showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const trUrl = testRailCaseUrl(testrailUrl, c.id);
  const runUrl = (id) => (testrailUrl ? `${testrailUrl.replace(/\/+$/, '')}/index.php?/runs/view/${id}` : null);
  const trClass = (st) => (['passed', 'failed', 'blocked', 'retest', 'untested'].includes(String(st).toLowerCase()) ? String(st).toLowerCase() : 'none');
  const isMissing = c.unresolved || c.tracking.status === 'missing' || !!c.retired;

  const findIt = async () => {
    setLocating(true);
    try {
      const res = await fetch(`/api/cases/locate/${c.id}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Search failed');
      setLocate(body);
    } catch (e) {
      if (showToast) showToast(e.message, 'error');
    } finally {
      setLocating(false);
    }
  };
  const post = async (url, body, msg) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { if (showToast) showToast(json.error || 'Failed', 'error'); return false; }
    if (showToast) showToast(msg, 'success');
    return true;
  };
  // Interactive debug: `cypress open` filtered to this case + its setup, so the
  // command log and snapshots stay available (run mode clears them).
  const openInCypress = async () => {
    const res = await fetch('/api/cypress/open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specPath: c.path, cases: [c.id], environment: environment || 'qa' }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { if (showToast) showToast(body.error || 'Could not open Cypress', 'error'); return; }
    if (showToast) showToast(`Cypress is opening (${environment || 'qa'}) — click ${short(c.path).split('/').slice(-2).join('/')} in its spec list. Filter: ${body.grepTags}`, 'success');
  };
  const removeFromManifest = async () => {
    if (!(await showConfirm(`Remove ${c.id} from the case manifest? It will no longer be shown, run or tracked.`))) return;
    if (await post('/api/testcases/case-manifest/remove', { ids: [c.id] }, `${c.id} removed from the manifest`) && onClosed) onClosed();
  };
  const retire = async () => {
    const note = await showPrompt(`Why was ${c.id} removed on purpose? (optional)`, '');
    if (note === null || note === undefined) return;
    if (await post('/api/cases/retire', { id: c.id, note }, `${c.id} marked as intentionally removed`) && onClosed) onClosed();
  };
  const unretire = async () => {
    if (await post('/api/cases/retire', { id: c.id, restore: true }, `${c.id} restored`) && onClosed) onClosed();
  };

  return (
    <ModalPortal>
      <div className="ct-drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="ct-drawer" role="dialog" aria-modal="true">
          <h3>
            <span className="ct-id">{c.id}</span>
            <span className={`ct-status ${status || 'none'}`}>{status || 'no status'}</span>
            <span style={{ flex: 1 }} />
            {trUrl && <a className="tcd-icon-btn" href={trUrl} target="_blank" rel="noreferrer" title="Open in TestRail"><ExternalLink size={15} /></a>}
            <button type="button" className="tcd-icon-btn" title="Copy ID" onClick={() => copyText(c.id)}><Copy size={15} /></button>
            <button type="button" className="tcd-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
          </h3>
          <div>{c.title || <span className="ct-muted">(not found in any spec)</span>}</div>

          {onRun && !c.unresolved && !c.commented && (
            <div>
              <button type="button" className="tcd-btn primary" onClick={() => onRun([c])}>
                <Play size={14} /> Run this case (+ setup{c.deps.length ? ` + ${c.deps.length} dep${c.deps.length === 1 ? '' : 's'}` : ''})
              </button>{' '}
              <button type="button" className="tcd-btn" onClick={openInCypress} title="Opens cypress open (interactive) filtered to this case + its setup blocks; keeps the full command log and snapshots. Don't run it while another run uses the same account.">
                <Bug size={14} /> Open in Cypress (debug)
              </button>
            </div>
          )}

          <div className="ct-section-title">Details</div>
          <div className="ct-drawer-grid">
            <div>Group</div><div>{c.grp}</div>
            <div>Category</div><div>{c.cat || '—'}</div>
            <div>Spec{c.paths.length > 1 ? 's' : ''}</div>
            <div>{c.paths.length ? c.paths.map((p) => (
              <div key={p}><code>{short(p)}</code>{c.livePaths.includes(p) ? '' : ' (commented)'}{c.pinned && c.pinned.includes(p) ? ' 📌' : ''}</div>
            )) : '—'}</div>
            {c.club && (<><div>Clubbed with</div><div><code>{c.club}</code></div></>)}
            <div>Shared spec</div><div>{c.sharedSpec ? 'Yes — other people\'s cases are in this spec' : 'No'}</div>
            <div>Owned since</div><div>{c.addedAt || '—'} <span className="ct-muted">({c.source || 'manual'})</span></div>
            <div>First seen</div><div>{fmt(c.tracking.firstSeenAt && Date.parse(c.tracking.firstSeenAt))}</div>
            {c.tracking.movedFrom && (<><div>Last move</div><div><code>{short(c.tracking.movedFrom)}</code> → <code>{short(c.path)}</code> <span className="ct-muted">({fmt(Date.parse(c.tracking.movedAt))})</span></div></>)}
            {c.tracking.status === 'missing' && (<><div>Missing</div><div className="ct-badge red">{c.tracking.reason} since {fmt(Date.parse(c.tracking.missingSince))}</div></>)}
            <div>Local runs</div><div>{c.local.runs} ({c.local.passes} passed, {c.local.fails} failed){c.local.flaky ? ' — flaky' : ''}</div>
            <div>Last local</div><div>{c.local.last ? `${c.local.last.result} — ${fmt(c.local.last.at)}` : 'never'}</div>
            <div>Last pass / fail</div><div>{fmt(c.local.lastPassAt)} / {fmt(c.local.lastFailAt)}</div>
            <div>Last Jenkins</div><div>{c.jenkins.last ? <>{c.jenkins.last.status} — {fmt(c.jenkins.last.at)} {c.jenkins.last.url && <a href={c.jenkins.last.url} target="_blank" rel="noreferrer">#{c.jenkins.last.build}</a>}{c.jenkins.last.narrowed ? '' : ' (whole spec)'}</> : 'never'}</div>
            <div>Manual mark</div><div>{c.manual.local ? `local: ${c.manual.local.status}` : ''}{c.manual.local && c.manual.jenkins ? ' · ' : ''}{c.manual.jenkins ? `jenkins: ${c.manual.jenkins.status}` : ''}{!c.manual.local && !c.manual.jenkins ? '—' : ''}</div>
            <div>Bugs</div><div>{[c.bugs.local && `local: ${c.bugs.local.bugId}`, c.bugs.jenkins && `jenkins: ${c.bugs.jenkins.bugId}`].filter(Boolean).join(' · ') || '—'}</div>
            <div>Tags</div><div>{c.tags.length ? c.tags.join(', ') : '—'}</div>
            {c.note && (<><div>Note</div><div style={{ whiteSpace: 'pre-wrap' }}>{c.note}</div></>)}
            {c.manifestNote && (<><div>Manifest note</div><div>{c.manifestNote}</div></>)}
            {c.setupWarnings.length > 0 && (<><div>Setup warning</div><div className="ct-badge orange">{c.setupWarnings.length} non-case it() block(s) without a setup tag — they won't run in a filtered run</div></>)}
          </div>

          {isMissing && (
            <>
              <div className="ct-section-title" style={{ color: 'var(--accent-red)' }}>
                {c.retired ? `Retired ${new Date(c.retired.at).toLocaleDateString()}${c.retired.note ? ` — ${c.retired.note}` : ''}` : 'This case is not in any spec — fix it'}
              </div>
              <div className="ct-inline-form">
                <button type="button" className="tcd-btn" disabled={locating} onClick={findIt}><Search size={13} /> {locating ? 'Searching git…' : 'Find where it went'}</button>
                {!c.retired && <button type="button" className="tcd-btn" onClick={retire}><Archive size={13} /> Mark intentionally removed</button>}
                {c.retired && <button type="button" className="tcd-btn" onClick={unretire}><ArchiveRestore size={13} /> Restore (un-retire)</button>}
                <button type="button" className="tcd-btn" onClick={removeFromManifest}><Trash2 size={13} /> Remove from manifest</button>
              </div>
              {locate && (
                <div className="ct-timeline">
                  <div className="ct-muted">In the working tree now ({locate.matches.length}):</div>
                  {locate.matches.length === 0 && <span className="ct-muted">Not found anywhere under cypress/ or e2e/.</span>}
                  {locate.matches.map((m, i) => (
                    <div key={i}><code>{short(m.path)}:{m.line}</code> {m.commented ? <span className="ct-badge yellow">commented</span> : <span className="ct-badge cyan">live</span>} <span className="ct-muted">{m.text.slice(0, 120)}</span></div>
                  ))}
                  <div className="ct-muted" style={{ marginTop: 6 }}>Commits that added/removed it (all branches, newest first):</div>
                  {locate.commits.length === 0 && <span className="ct-muted">No commits found.</span>}
                  {locate.commits.map((cm) => (
                    <div key={cm.hash} className="ct-tl-row">
                      <span className="when">{cm.date}</span>
                      <span className="kind"><code>{cm.hash}</code></span>
                      <span>{cm.subject} <span className="ct-muted">— {cm.author}{cm.refs ? ` · ${cm.refs}` : ''}</span>
                        {(cm.files || []).map((f, i) => <div key={i} className="ct-sub">{f.change} in {short(f.path)}</div>)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="ct-section-title">TestRail runs synced ({(c.testrail || []).length})</div>
          {(c.testrail || []).length === 0
            ? <span className="ct-muted" style={{ fontSize: '0.8rem' }}>No runs synced yet — enter a run ID next to "Sync run" above the table.</span>
            : (
              <div className="ct-timeline">
                {c.testrail.map((e) => (
                  <div key={e.runId} className="ct-tl-row">
                    <span className="when">{fmt(e.syncedAt)}</span>
                    <span><span className={`ct-status ${trClass(e.status)}`}>{e.status}</span></span>
                    <span>
                      {runUrl(e.runId) ? <a href={runUrl(e.runId)} target="_blank" rel="noreferrer">#{e.runId}</a> : `#${e.runId}`} {e.runName}
                    </span>
                  </div>
                ))}
              </div>
            )}

          <div className="ct-section-title">Run settings</div>
          <div className="ct-inline-form">
            <input value={grp} onChange={(e) => setGrp(e.target.value)} placeholder="Group" />
            <button type="button" className="tcd-btn" disabled={saving || grp === c.grp} onClick={() => save({ grp })}>Save group</button>
          </div>
          <div className="ct-inline-form">
            <input value={deps} onChange={(e) => setDeps(e.target.value)} placeholder="Depends on (cases that must run first), e.g. C2262789" />
            <button type="button" className="tcd-btn" disabled={saving} onClick={() => save({ deps })}>Save deps</button>
          </div>
          <p className="tcd-modal-hint" style={{ margin: 0 }}>
            A run of this case always includes the spec's <code>@setup</code> / precondition blocks, plus these dependency cases.
          </p>

          <div className="ct-section-title">History ({timeline ? timeline.length : '…'})</div>
          <div className="ct-timeline">
            {!timeline && <span className="ct-muted">Loading…</span>}
            {timeline && timeline.length === 0 && <span className="ct-muted">Nothing recorded yet.</span>}
            {timeline && timeline.map((t, i) => (
              <div key={i} className="ct-tl-row" style={{ '--tl-color': t.kind === 'tracker' ? ((CASE_EVENT_STYLE[t.type] || {}).color || KIND_COLOR.tracker) : KIND_COLOR[t.kind] }}>
                <span className="when">{fmt(t.at)}</span>
                <span className="kind">{KIND_LABEL[t.kind] || t.kind}</span>
                <span>
                  {t.kind === 'tracker' ? <span className="ct-ev" style={{ color: (CASE_EVENT_STYLE[t.type] || {}).color }}>{(CASE_EVENT_STYLE[t.type] || {}).label || TRACKER_LABEL[t.type] || t.type}</span> : <span className={`ct-status ${t.type}`}>{t.type}</span>}
                  {t.kind === 'tracker' && t.type === 'case_moved' && <> — <code>{short(t.from)}</code> → <code>{short(t.path)}</code></>}
                  {t.kind === 'tracker' && t.type !== 'case_moved' && t.path && <> — <code>{short(t.path)}</code></>}
                  {t.reason && <> ({t.reason})</>}
                  {t.kind === 'local' && <> — <code>{short(t.path)}</code>{t.environment ? ` · ${t.environment}` : ''}{t.label ? ` · ${t.label}` : ''}</>}
                  {t.kind === 'jenkins' && <> — {t.job} {t.url ? <a href={t.url} target="_blank" rel="noreferrer">#{t.build}</a> : ''}{t.runId ? ` · run ${t.runId}` : ''}{t.narrowed ? '' : ' · whole spec'}{t.error ? ` · ${t.error.slice(0, 80)}` : ''}</>}
                  {(t.kind === 'manual' || t.kind === 'bug') && <> — {t.where}</>}
                  {t.kind === 'manifest' && t.source && <> — {t.source}</>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default CaseDetailDrawer;
