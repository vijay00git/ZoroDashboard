import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlayCircle, Square, FolderOpen, Terminal, ListChecks, SlidersHorizontal } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { showConfirm, showPrompt } from '../utils/Alerts';
import ModalPortal from './testcase-dashboard/ModalPortal';
import FileTree from './testcase-dashboard/FileTree';
import StatsBar from './testcase-dashboard/StatsBar';
import CoverageCard from './testcase-dashboard/CoverageCard';
import RunStatusCard from './testcase-dashboard/RunStatusCard';
import RunStatusPill from './cypress-runner/RunStatusPill';
import LogViewer from './cypress-runner/LogViewer';
import RunsList from './cypress-runner/RunsList';
import Lightbox from './cypress-runner/Lightbox';
import CyrHeroStats from './cypress-runner/CyrHeroStats';
import CyrActivityCard from './cypress-runner/CyrActivityCard';
import { latestCaseResultsForPaths, latestCaseResultsByPath, buildCyrReportText } from './cypress-runner/helpers';
import './testcase-dashboard/TestCaseDashboard.css';
import './cypress-runner/CypressRunner.css';

const BROWSERS = ['electron', 'chrome', 'firefox', 'edge'];
const EMPTY_MANIFEST = { rows: [], catCounts: {}, fileCounts: {}, totalCases: 0, totalFiles: 0, unknownIds: [], e2eRoot: '' };

// cyr's own (lowercase) statuses -> the Jenkins-style uppercase statuses
// trendDotClass (testcase-dashboard/helpers.js) already knows how to color,
// so the manifest tree's per-file trend dots work unmodified.
const CYR_TO_JENKINS_STATUS = { passed: 'SUCCESS', failed: 'FAILURE', killed: 'ABORTED', interrupted: 'ERROR' };

const CypressRunner = () => {
  const { showToast } = useToast();

  const [projectPath, setProjectPath] = useState(() => localStorage.getItem('cyr_project_path') || '');
  const [specPath, setSpecPath] = useState(() => localStorage.getItem('cyr_spec_path') || '');
  const [browser, setBrowser] = useState(() => localStorage.getItem('cyr_browser') || 'electron');
  const [headed, setHeaded] = useState(() => localStorage.getItem('cyr_headed') === '1');
  const [environment, setEnvironment] = useState(() => localStorage.getItem('cyr_environment') || '');
  const [testrailRunId, setTestrailRunId] = useState(() => localStorage.getItem('cyr_testrail_run_id') || '');

  const [envConfig, setEnvConfig] = useState({ environments: [], defaultEnvironment: 'qa', testrailUrl: null });

  const [manifestData, setManifestData] = useState(EMPTY_MANIFEST);
  const [activeCats, setActiveCats] = useState({ OFFLINE: true, ONLINE: true, E2E: true });
  const [issueFilter, setIssueFilter] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFiles, setSelectedFiles] = useState(new Map());
  const [openFiles, setOpenFiles] = useState(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  const [runState, setRunState] = useState({ queue: [], active: null, history: [] });
  const [logText, setLogText] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [killing, setKilling] = useState(false);
  const [viewLog, setViewLog] = useState(null); // { id, log }
  const [lightbox, setLightbox] = useState(null); // { images, startIndex }

  const [runStatus, setRunStatus] = useState(null);
  const [runPulling, setRunPulling] = useState(false);
  const [runError, setRunError] = useState(null);

  const logCursorRef = useRef(0);
  const prevActiveIdRef = useRef(null);
  const pollTimeoutRef = useRef(null);
  const pollRef = useRef(null);
  const testrailRunIdInputRef = useRef(null);

  useEffect(() => { localStorage.setItem('cyr_project_path', projectPath); }, [projectPath]);
  useEffect(() => { localStorage.setItem('cyr_spec_path', specPath); }, [specPath]);
  useEffect(() => { localStorage.setItem('cyr_browser', browser); }, [browser]);
  useEffect(() => { localStorage.setItem('cyr_headed', headed ? '1' : '0'); }, [headed]);
  useEffect(() => { localStorage.setItem('cyr_environment', environment); }, [environment]);
  useEffect(() => { localStorage.setItem('cyr_testrail_run_id', testrailRunId); }, [testrailRunId]);

  useEffect(() => {
    fetch('/api/testcases/data', { cache: 'no-store' }).then((r) => r.json()).then(setManifestData).catch(() => {});
    fetch('/api/testcases/jenkins-jobs', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        setEnvConfig({
          environments: json.environments || [],
          defaultEnvironment: json.defaultEnvironment || 'qa',
          testrailUrl: json.testrailUrl || null,
        });
        setEnvironment((prev) => prev || json.defaultEnvironment || 'qa');
      })
      .catch(() => {});
  }, []);

  // Reuses the same TestRail Run ID field already collected for syncing
  // results, to also pull that run's live status — same endpoint/shape the
  // Jenkins page's RunStatusCard already knows how to render.
  const pullRunStatus = useCallback((runId) => {
    if (!/^\d+$/.test(runId)) { testrailRunIdInputRef.current?.focus(); return; }
    setRunPulling(true);
    setRunError(null);
    fetch(`/api/testcases/run-status?runId=${encodeURIComponent(runId)}`, { cache: 'no-store' })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        setRunPulling(false);
        if (!ok) { setRunError(body.error || 'unknown error'); return; }
        setRunStatus(body);
      })
      .catch((err) => { setRunPulling(false); setRunError(err.message); });
  }, []);

  // Deferred to a microtask rather than called synchronously in the effect
  // body, since pullRunStatus sets state immediately (setRunPulling) before
  // its fetch resolves.
  useEffect(() => {
    if (!testrailRunId) return;
    Promise.resolve().then(() => pullRunStatus(testrailRunId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Self-scheduling poll: faster (1.5s) while a run is active, since that's
  // exactly when a status transition is imminent, backing off to 5s idle.
  const fetchState = useCallback(() => {
    if (pollTimeoutRef.current) { clearTimeout(pollTimeoutRef.current); pollTimeoutRef.current = null; }
    fetch('/api/cypress/state', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        setRunState(json);
        pollTimeoutRef.current = setTimeout(() => pollRef.current(), json.active ? 1500 : 5000);
      })
      .catch(() => { pollTimeoutRef.current = setTimeout(() => pollRef.current(), 5000); });
  }, []);
  useEffect(() => { pollRef.current = fetchState; }, [fetchState]);

  useEffect(() => {
    fetchState();
    const onVisible = () => { if (document.visibilityState === 'visible') fetchState(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchState]);

  // Resets the live log buffer when a new run starts, and grabs one final
  // tail fetch the moment a run drops out of `active` — the state poll and
  // the 1s log poll below don't line up exactly, so the very last chunk of
  // output can otherwise be missed.
  useEffect(() => {
    const id = runState.active?.id || null;
    if (id) {
      if (prevActiveIdRef.current !== id) {
        logCursorRef.current = 0;
        setLogText('');
      }
      prevActiveIdRef.current = id;
    } else if (prevActiveIdRef.current) {
      const finishedId = prevActiveIdRef.current;
      prevActiveIdRef.current = null;
      fetch(`/api/cypress/logs/${finishedId}?cursor=${logCursorRef.current}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((json) => { if (json.log) setLogText((prev) => prev + json.log); })
        .catch(() => {});
    }
  }, [runState.active]);

  useEffect(() => {
    const id = runState.active?.id;
    if (!id) return undefined;
    let cancelled = false;
    const poll = () => {
      fetch(`/api/cypress/logs/${id}?cursor=${logCursorRef.current}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((json) => {
          if (cancelled) return;
          if (json.log) setLogText((prev) => prev + json.log);
          logCursorRef.current = json.cursor;
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [runState.active?.id]);

  const handleRun = () => {
    if (!projectPath.trim()) { showToast('Enter a Cypress project path first', 'warning'); return; }
    setTriggering(true);
    fetch('/api/cypress/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectPath.trim(), specPath: specPath.trim(), browser, headed,
        environment, testrailRunId: testrailRunId.trim(),
      }),
    })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        setTriggering(false);
        if (!ok) { showToast(body.error || 'Failed to start run', 'error'); return; }
        showToast('Cypress run started', 'success');
        fetchState();
      })
      .catch((err) => { setTriggering(false); showToast(err.message, 'error'); });
  };

  const handleKill = async () => {
    if (!runState.active) return;
    const confirmed = await showConfirm('Stop the running Cypress process?');
    if (!confirmed) return;
    setKilling(true);
    fetch('/api/cypress/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: runState.active.id }),
    })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        setKilling(false);
        if (!ok) { showToast(body.error || 'Failed to stop run', 'error'); return; }
        showToast('Stopping run…', 'info');
        fetchState();
      })
      .catch((err) => { setKilling(false); showToast(err.message, 'error'); });
  };

  const enqueuePaths = (items) => {
    if (!items || items.length === 0) return;
    fetch('/api/cypress/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, browser, headed, environment, testrailRunId: testrailRunId.trim() }),
    })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) { showToast(body.error || 'Failed to queue', 'error'); return; }
        showToast(`Queued ${items.length} file${items.length === 1 ? '' : 's'}`, 'success');
        setSelectedFiles(new Map());
        fetchState();
      })
      .catch((err) => showToast(err.message, 'error'));
  };

  const handleDequeue = (id) => {
    fetch('/api/cypress/dequeue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) { showToast(body.error || 'Failed to remove from queue', 'error'); return; }
        fetchState();
      })
      .catch((err) => showToast(err.message, 'error'));
  };

  // Manual sync from a file/group/category button in the tree — always
  // asks for the TestRail run ID at click time (rather than relying on the
  // page-level field, which may be blank or pointed at a different run),
  // pre-filled with whatever's currently in that field as a convenience.
  const handleSyncPaths = async (paths, label) => {
    const resultMap = latestCaseResultsForPaths(runState.history, paths);
    const caseCount = Object.keys(resultMap).length;
    if (caseCount === 0) { showToast(`No local run results yet for ${label}`, 'warning'); return; }
    const runId = await showPrompt(`Enter TestRail Run ID to sync ${caseCount} case result${caseCount === 1 ? '' : 's'} for ${label}:`, testrailRunId);
    if (!runId || !runId.trim()) return;
    fetch('/api/cypress/sync-testrail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testrailRunId: runId.trim(), resultMap }),
    })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) { showToast(body.error || 'Sync failed', 'error'); return; }
        showToast(`Synced ${body.posted} result${body.posted === 1 ? '' : 's'} to TestRail #${runId.trim()}`, 'success');
      })
      .catch((err) => showToast(err.message, 'error'));
  };

  const handleViewLog = (h) => {
    fetch(`/api/cypress/logs/${h.id}?cursor=0`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => setViewLog({ id: h.id, log: json.log || '' }))
      .catch(() => showToast('Failed to load log', 'error'));
  };

  const handleViewScreenshots = (h) => {
    if (!h.screenshots || h.screenshots.length === 0) return;
    setLightbox({ images: h.screenshots, startIndex: 0 });
  };

  const handleSendTelegram = (h) => {
    fetch('/api/cypress/telegram/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ runId: h.id, text: buildCyrReportText(h), attachScreenshots: true }),
    })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) { showToast(body.error || 'Failed to send to Telegram', 'error'); return; }
        showToast('Sent to Telegram', 'success');
      })
      .catch((err) => showToast(err.message, 'error'));
  };

  const toggleCat = (cat) => {
    setActiveCats((prev) => {
      const next = { ...prev, [cat]: !prev[cat] };
      if (!Object.values(next).some(Boolean)) next[cat] = true;
      return next;
    });
  };

  const toggleIssue = (issue) => {
    setIssueFilter((prev) => (prev === issue ? null : issue));
  };

  const toggleFileSelect = (path, cat) => {
    setSelectedFiles((prev) => {
      const next = new Map(prev);
      if (next.has(path)) next.delete(path); else next.set(path, cat);
      return next;
    });
  };

  const toggleManySelect = (paths, cat, checked) => {
    setSelectedFiles((prev) => {
      const next = new Map(prev);
      paths.forEach((p) => { if (checked) next.set(p, cat); else next.delete(p); });
      return next;
    });
  };

  const toggleFileOpen = (path) => {
    setOpenFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const toggleGroupCollapse = (groupKey) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      return next;
    });
  };

  const fileTrendMap = useMemo(() => {
    const byPath = {};
    (runState.history || []).forEach((h) => {
      if (!h.specPath) return;
      (byPath[h.specPath] = byPath[h.specPath] || []).push({ ...h, status: CYR_TO_JENKINS_STATUS[h.status] || h.status });
    });
    const map = {};
    Object.keys(byPath).forEach((p) => { map[p] = byPath[p].slice().reverse(); });
    return map;
  }, [runState.history]);

  const caseResultsByPath = useMemo(
    () => latestCaseResultsByPath(runState.history),
    [runState.history]
  );

  const active = runState.active;
  const selectedCount = selectedFiles.size;

  return (
    <div className="cyr-page">
      <div className="cyr-card">
        <h2><Terminal size={18} /> Cypress Runner</h2>
        <p className="cyr-sub">
          Trigger a local <code>cypress run</code> against a project on this machine — headed or headless,
          with live logs, stats, and failure screenshots.
        </p>

        <div className="cyr-form-grid">
          <label className="cyr-field cyr-field-wide">
            <span>Project path</span>
            <input
              type="text"
              placeholder="/home/you/path/to/cypress-project"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              disabled={!!active}
            />
          </label>
          <label className="cyr-field cyr-field-wide">
            <span>Spec pattern (optional)</span>
            <input
              type="text"
              placeholder="cypress/e2e/**/*.cy.js"
              value={specPath}
              onChange={(e) => setSpecPath(e.target.value)}
              disabled={!!active}
            />
          </label>
          <label className="cyr-field">
            <span>Browser</span>
            <select value={browser} onChange={(e) => setBrowser(e.target.value)} disabled={!!active}>
              {BROWSERS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label className="cyr-field cyr-field-toggle">
            <span>Mode</span>
            <button
              type="button"
              className={`cyr-toggle${headed ? ' on' : ''}`}
              onClick={() => setHeaded((v) => !v)}
              disabled={!!active}
              title="Toggle headed/headless"
            >
              {headed ? 'Headed' : 'Headless'}
            </button>
          </label>
          <label className="cyr-field">
            <span>Environment</span>
            {envConfig.environments.length > 0 ? (
              <select value={environment} onChange={(e) => setEnvironment(e.target.value)} disabled={!!active}>
                {envConfig.environments.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            ) : (
              <input
                type="text"
                placeholder="qa"
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                disabled={!!active}
              />
            )}
          </label>
          <label className="cyr-field">
            <span>TestRail Run ID (optional)</span>
            <div className="tcd-run-pull">
              <input
                ref={testrailRunIdInputRef}
                type="text"
                inputMode="numeric"
                placeholder="e.g. 1234"
                value={testrailRunId}
                onChange={(e) => setTestrailRunId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') pullRunStatus(testrailRunId.trim()); }}
                disabled={!!active}
              />
              <button type="button" className="cyr-btn small" disabled={runPulling} onClick={() => pullRunStatus(testrailRunId.trim())}>
                {runPulling ? 'Pulling…' : 'Pull status'}
              </button>
            </div>
          </label>
        </div>
        {runError && <div className="tcd-conn-banner">Couldn't pull run status: {runError}</div>}

        <div className="cyr-actions">
          {!active ? (
            <button type="button" className="cyr-btn primary" onClick={handleRun} disabled={triggering}>
              <PlayCircle size={15} /> {triggering ? 'Starting…' : 'Run'}
            </button>
          ) : (
            <button type="button" className="cyr-btn danger" onClick={handleKill} disabled={killing}>
              <Square size={15} /> {killing ? 'Stopping…' : 'Stop'}
            </button>
          )}
          {active && <RunStatusPill status={active.status} />}
        </div>
      </div>

      <StatsBar data={manifestData} activeCats={activeCats} onToggleCat={toggleCat} issueFilter={issueFilter} onToggleIssue={toggleIssue} />

      <div className="tcd-hero">
        <div className="tcd-hero-heading"><SlidersHorizontal size={13} /> Overview</div>
        <CyrHeroStats manifestData={manifestData} runState={runState} />
        <div className="tcd-cards-row">
          <CoverageCard data={manifestData} />
          <RunStatusCard data={manifestData} runStatus={runStatus} onFocusRunId={() => testrailRunIdInputRef.current?.focus()} />
          <CyrActivityCard history={runState.history} />
        </div>
      </div>

      <div className="cyr-layout">
        <div className="cyr-col-left">
          <div className="cyr-card">
            <h3><ListChecks size={15} /> Test cases</h3>
            {manifestData.e2eRoot && (
              <p className="cyr-e2e-note">
                Queued runs use the same E2E project as Test Cases: <code>{manifestData.e2eRoot}</code>
              </p>
            )}
            <div className="cyr-tree-actions">
              <span className="cyr-sub" style={{ margin: 0 }}>{manifestData.totalCases} test cases across {manifestData.totalFiles} files</span>
              <button
                type="button"
                className="cyr-btn primary small"
                disabled={selectedCount === 0}
                onClick={() => enqueuePaths(Array.from(selectedFiles.entries()).map(([path, cat]) => ({ path, cat })))}
              >
                Queue {selectedCount > 0 ? selectedCount : ''} selected
              </button>
            </div>
            <FileTree
              data={manifestData}
              activeCats={activeCats}
              issueFilter={issueFilter}
              searchTerm={searchTerm}
              runStatus={null}
              notes={{}}
              jenkinsConfig={{ jobs: { OFFLINE: ['local'], ONLINE: ['local'], E2E: ['local'] } }}
              selectedFiles={selectedFiles}
              onToggleFileSelect={toggleFileSelect}
              onToggleManySelect={toggleManySelect}
              openFiles={openFiles}
              onToggleFileOpen={toggleFileOpen}
              collapsedGroups={collapsedGroups}
              onToggleGroupCollapse={toggleGroupCollapse}
              fileTrendMap={fileTrendMap}
              onRunFile={(path, cat) => enqueuePaths([{ path, cat }])}
              onOpenNote={() => {}}
              onVisiblePathsChange={() => {}}
              showToast={showToast}
              sortMode="name"
              testrailUrl={envConfig.testrailUrl}
              runLabel="Run locally with Cypress"
              onSyncFile={(path) => handleSyncPaths([path], path)}
              onSyncGroup={(paths) => handleSyncPaths(paths, `this group (${paths.length} file${paths.length === 1 ? '' : 's'})`)}
              onSyncCategory={(paths, cat) => handleSyncPaths(paths, `${cat} (${paths.length} file${paths.length === 1 ? '' : 's'})`)}
              caseResultsByPath={caseResultsByPath}
            />
          </div>
        </div>

        <div className="cyr-col-right">
          {active && (
            <div className="cyr-card">
              <h3>
                <FolderOpen size={15} /> Live output — {active.specPath || 'all specs'} {active.headed ? '(headed)' : '(headless)'}
              </h3>
              <LogViewer text={logText} />
            </div>
          )}

          <div className="cyr-card">
            <h3>Runs</h3>
            <RunsList
              queue={runState.queue}
              history={runState.history}
              onDequeue={handleDequeue}
              onViewLog={handleViewLog}
              onViewScreenshots={handleViewScreenshots}
              onSendTelegram={handleSendTelegram}
            />
          </div>
        </div>
      </div>

      {viewLog && (
        <ModalPortal>
          <div className="cyr-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setViewLog(null); }}>
            <div className="cyr-modal cyr-log-modal" role="dialog" aria-modal="true">
              <h3><Terminal size={15} /> Run log</h3>
              <LogViewer text={viewLog.log} />
              <div className="cyr-modal-actions">
                <button className="cyr-btn primary" onClick={() => setViewLog(null)}>Close</button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {lightbox && (
        <Lightbox images={lightbox.images} startIndex={lightbox.startIndex} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
};

export default CypressRunner;
