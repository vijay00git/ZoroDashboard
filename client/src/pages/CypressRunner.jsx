import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlayCircle, Square, SkipForward, XCircle, FolderOpen, Terminal, ListChecks, SlidersHorizontal, Clipboard, Download, Eye, EyeOff, ChevronRight, Search, RotateCcw, FilePlus2, AlertTriangle } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { showConfirm, showPrompt } from '../utils/Alerts';
import ModalPortal from './testcase-dashboard/ModalPortal';
import FileTree from './testcase-dashboard/FileTree';
import ManifestModal from './testcase-dashboard/ManifestModal';
import TagModal from './testcase-dashboard/TagModal';
import BulkTagBar from './testcase-dashboard/BulkTagBar';
import StatsBar from './testcase-dashboard/StatsBar';
import CoverageCard from './testcase-dashboard/CoverageCard';
import RunStatusCard from './testcase-dashboard/RunStatusCard';
import LocalRunStatusCard from './cypress-runner/LocalRunStatusCard';
import RunStatusPill from './cypress-runner/RunStatusPill';
import LogViewer from './cypress-runner/LogViewer';
import RunsList from './cypress-runner/RunsList';
import Lightbox from './cypress-runner/Lightbox';
import CyrHeroStats from './cypress-runner/CyrHeroStats';
import CyrActivityCard from './cypress-runner/CyrActivityCard';
import FlakySpecsCard from './cypress-runner/FlakySpecsCard';
import BugsCard from './cypress-runner/BugsCard';
import QueueProgress from './cypress-runner/QueueProgress';
import CompareRunsModal from './cypress-runner/CompareRunsModal';
import {
  latestCaseResultsForPaths, latestCaseResultsByPath, latestRunStatusByPath,
  localCaseStatus, localRunTally, buildCyrReportText, buildCyrDateReportText, mergeManualIntoResultMap,
  cyrFlakySpecs, cyrAvgDurationByPath, cyrGlobalAvgDuration, cyrEstimateDuration, formatEta,
  CYR_DEFAULT_ESTIMATE_MS, cyrGroupBugLinks,
} from './cypress-runner/helpers';
import { filterHistoryByDate, formatReportDateLabel, todayDateKey, copyText, csvEscape, normCat } from './testcase-dashboard/helpers';
import { useCountUp } from '../hooks/useCountUp';
import cypressRunnerHero from '../assets/hero-banners/cypress-runner-hero.webp';
import cypressRunnerHeroLight from '../assets/hero-banners/cypress-runner-hero-light.webp';
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
  const [manualStatus, setManualStatus] = useState({});
  const [tags, setTags] = useState({});
  const [bugLinks, setBugLinks] = useState({});
  const [selectedCases, setSelectedCases] = useState(new Set());
  const [tagModal, setTagModal] = useState(null); // { caseId, caseTitle }
  const [manifestModalOpen, setManifestModalOpen] = useState(false);
  const [activeCats, setActiveCats] = useState({ OFFLINE: true, ONLINE: true, E2E: true });
  const [issueFilter, setIssueFilter] = useState(null);
  const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem('cyr_search_term') || '');
  const [selectedFiles, setSelectedFiles] = useState(new Map());
  const [openFiles, setOpenFiles] = useState(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  const [runState, setRunState] = useState({ queue: [], active: null, history: [] });
  const [logText, setLogText] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [killing, setKilling] = useState(false);
  const [stoppingAll, setStoppingAll] = useState(false);
  const [viewLog, setViewLog] = useState(null); // { id, log }
  const [lightbox, setLightbox] = useState(null); // { images, startIndex }
  const [compareModal, setCompareModal] = useState(null); // { current, previous }

  const [runStatus, setRunStatus] = useState(null);
  const [runPulling, setRunPulling] = useState(false);
  const [runError, setRunError] = useState(null);

  const [reportDate, setReportDate] = useState(() => todayDateKey());
  const [runsHidden, setRunsHidden] = useState(() => localStorage.getItem('cyr_runs_hidden') === '1');
  const [setupCollapsed, setSetupCollapsed] = useState(() => localStorage.getItem('cyr_setup_collapsed') === '1');

  const logCursorRef = useRef(0);
  const prevActiveIdRef = useRef(null);
  const pollTimeoutRef = useRef(null);
  const pollRef = useRef(null);
  const testrailRunIdInputRef = useRef(null);
  const searchInputRef = useRef(null);

  // Tracks every run id that's entered the queue/active slot since it was
  // last empty — the "batch" the Queue Progress card reports on. State
  // (not a ref) since batchProgress below reads it during render.
  const [batchIds, setBatchIds] = useState(() => new Set());
  const [batchStart, setBatchStart] = useState(null);

  useEffect(() => { localStorage.setItem('cyr_project_path', projectPath); }, [projectPath]);
  useEffect(() => { localStorage.setItem('cyr_spec_path', specPath); }, [specPath]);
  useEffect(() => { localStorage.setItem('cyr_browser', browser); }, [browser]);
  useEffect(() => { localStorage.setItem('cyr_headed', headed ? '1' : '0'); }, [headed]);
  useEffect(() => { localStorage.setItem('cyr_environment', environment); }, [environment]);
  useEffect(() => { localStorage.setItem('cyr_testrail_run_id', testrailRunId); }, [testrailRunId]);
  useEffect(() => { localStorage.setItem('cyr_runs_hidden', runsHidden ? '1' : '0'); }, [runsHidden]);
  useEffect(() => { localStorage.setItem('cyr_setup_collapsed', setupCollapsed ? '1' : '0'); }, [setupCollapsed]);
  useEffect(() => { localStorage.setItem('cyr_search_term', searchTerm); }, [searchTerm]);

  // "/" focuses search (scoped to this page), Escape clears it — same shortcut
  // as the Jenkins-based Test Case Dashboard's search box.
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName || '';
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchTerm('');
        searchInputRef.current.blur();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // A non-2xx response (e.g. the manifest file isn't set up on this
  // machine yet) still returns a JSON body ({ error: '...' }), which has
  // none of the fields (rows, catCounts, ...) every child component here
  // assumes exist — blindly setManifestData()-ing it crashes the whole
  // page (StatsBar etc. reading .rows off it) instead of just showing an
  // empty state. Checking res.ok keeps manifestData at its safe
  // EMPTY_MANIFEST default and surfaces the real error as a toast instead.
  // Also re-run after any manifest add/remove so this page and Jenkins
  // Runner's manifest edits stay reflected without a manual page refresh.
  const fetchManifestData = useCallback(() => {
    fetch('/api/testcases/data', { cache: 'no-store' })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) { showToast(`Couldn't load test cases: ${body.error || 'unknown error'}`, 'error'); return; }
        setManifestData(body);
      })
      .catch(() => {});
  }, [showToast]);

  useEffect(() => {
    fetchManifestData();
    fetch('/api/testcases/manual-status', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setManualStatus)
      .catch(() => {});
    fetch('/api/testcases/tags', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setTags)
      .catch(() => {});
    fetch('/api/testcases/bug-links', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setBugLinks)
      .catch(() => {});
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
  }, [fetchManifestData]);

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

  // Queue Progress's "batch" — every run id seen in queue+active accumulates
  // into batchIds until both drain empty at once, at which point the next
  // enqueue starts a fresh batch, and batchStart is stamped the moment the
  // first item arrives. batchIds is memory of past renders (which ids have
  // ever been live), not something derivable from the current props alone,
  // so this can only be synced from an effect — the set-state-in-effect rule
  // is deliberately silenced for it. Doesn't retroactively count runs
  // already queued/active before this page loaded (batchIds starts empty on
  // mount) — acceptable since a refresh mid-batch is rare on a single-user
  // local tool.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const queueIds = (runState.queue || []).map((q) => q.id);
    const liveIds = runState.active ? [runState.active.id, ...queueIds] : queueIds;
    if (liveIds.length === 0) {
      setBatchIds((prev) => (prev.size === 0 ? prev : new Set()));
      setBatchStart(null);
      return;
    }
    setBatchIds((prev) => {
      const next = new Set(prev);
      liveIds.forEach((id) => next.add(id));
      return next;
    });
    setBatchStart((prev) => prev ?? Date.now());
  }, [runState.queue, runState.active]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Ticks once a second, purely to force the ETA/elapsed display to recount
  // against Date.now() between server polls — no server call of its own.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!runState.active && (runState.queue?.length || 0) === 0) return undefined;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [runState.active, runState.queue]);

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
    const pending = runState.queue?.length || 0;
    const confirmed = await showConfirm(
      pending > 0
        ? `Skip this test? The next queued item (${pending} pending) will start automatically.`
        : 'Stop the running Cypress process?'
    );
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
        showToast(pending > 0 ? 'Skipping…' : 'Stopping run…', 'info');
        fetchState();
      })
      .catch((err) => { setKilling(false); showToast(err.message, 'error'); });
  };

  // "Cancel the whole queue" — stops whatever's currently running (if
  // anything) and drops every not-yet-started queued item in one shot.
  const handleStopAll = async () => {
    const pending = runState.queue?.length || 0;
    const hasActive = !!runState.active;
    if (!hasActive && pending === 0) return;
    const msg = hasActive && pending > 0
      ? `Stop the running test and cancel ${pending} queued item${pending === 1 ? '' : 's'}?`
      : hasActive
        ? 'Stop the running test? The queue is otherwise empty.'
        : `Cancel ${pending} queued item${pending === 1 ? '' : 's'}?`;
    const confirmed = await showConfirm(msg);
    if (!confirmed) return;
    setStoppingAll(true);
    fetch('/api/cypress/stop-all', { method: 'POST' })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => {
        setStoppingAll(false);
        if (!ok) { showToast(body.error || 'Failed to cancel the queue', 'error'); return; }
        showToast('Queue cancelled', 'info');
        setBatchIds(new Set());
        setBatchStart(null);
        fetchState();
      })
      .catch((err) => { setStoppingAll(false); showToast(err.message, 'error'); });
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
    // Manually removed, not run — doesn't count toward the batch.
    setBatchIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
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
    const pathSet = new Set(paths);
    const rowsInScope = manifestData.rows.filter((r) => pathSet.has(r.path));
    const autoResultMap = latestCaseResultsForPaths(runState.history, paths);
    const resultMap = mergeManualIntoResultMap(autoResultMap, rowsInScope, manualStatus);
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

  // Clicking the currently-active status again clears the override (back to
  // whatever the auto-detected status is) instead of leaving it stuck.
  const handleSetManualStatus = (caseId, status) => {
    const next = manualStatus[caseId]?.status === status ? null : status;
    setManualStatus((prev) => {
      const copy = { ...prev };
      if (next) copy[caseId] = { status: next, updatedAt: Date.now() }; else delete copy[caseId];
      return copy;
    });
    fetch('/api/testcases/manual-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, status: next }),
    })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => { if (!ok) showToast(body.error || 'Failed to save status', 'error'); })
      .catch((err) => showToast(err.message, 'error'));
  };

  // Full replace of one case's tags — used by the tag editor modal.
  const handleSaveTags = (caseId, nextTags) => {
    setTags((prev) => {
      const copy = { ...prev };
      if (nextTags.length > 0) copy[caseId] = nextTags; else delete copy[caseId];
      return copy;
    });
    setTagModal(null);
    fetch('/api/testcases/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, tags: nextTags }),
    })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => { if (!ok) showToast(body.error || 'Failed to save tags', 'error'); })
      .catch((err) => showToast(err.message, 'error'));
  };

  // One-click removal of a single tag straight from a row's chip.
  const handleRemoveTag = (caseId, tag) => {
    const next = (tags[caseId] || []).filter((t) => t !== tag);
    handleSaveTags(caseId, next);
  };

  // Shared by both the prompt-based edit and the chip's direct clear button
  // below — optimistic local update ahead of the server ack, same pattern
  // as handleSetManualStatus/handleSaveTags.
  const saveBugLink = (caseId, bugId) => {
    setBugLinks((prev) => {
      const copy = { ...prev };
      if (bugId) copy[caseId] = { bugId, updatedAt: Date.now() }; else delete copy[caseId];
      return copy;
    });
    fetch('/api/testcases/bug-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, bugId }),
    })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => { if (!ok) showToast(body.error || 'Failed to save bug link', 'error'); })
      .catch((err) => showToast(err.message, 'error'));
  };

  // Prompts for a ticket id (pre-filled with the existing one, if any) —
  // submitting blank clears the link, cancelling (null) leaves it untouched.
  const handleEditBugLink = async (caseId) => {
    const current = bugLinks[caseId]?.bugId || '';
    const val = await showPrompt(`Bug ID for ${caseId} (e.g. EVB-1234):`, current);
    if (val === null) return;
    saveBugLink(caseId, val.trim());
  };

  const handleClearBugLink = (caseId) => saveBugLink(caseId, '');

  const toggleCaseSelect = (caseId) => {
    setSelectedCases((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) next.delete(caseId); else next.add(caseId);
      return next;
    });
  };

  // File-wise / section-wise "select all" checkboxes both funnel through
  // here with the full list of case ids they cover.
  const selectManyCases = (caseIds, checked) => {
    setSelectedCases((prev) => {
      const next = new Set(prev);
      caseIds.forEach((id) => { if (checked) next.add(id); else next.delete(id); });
      return next;
    });
  };

  // "Run selected" in the bulk tag bar — maps the selected cases to their
  // (deduped) spec files and queues those, the same as clicking each file's
  // own Run button individually. Cypress can only run whole spec files, so
  // running "N selected cases" really means running every file that contains
  // one of them.
  const handleRunSelectedCases = () => {
    const seenPaths = new Set();
    const items = [];
    manifestData.rows.forEach((r) => {
      if (selectedCases.has(r.id) && !seenPaths.has(r.path)) {
        seenPaths.add(r.path);
        items.push({ path: r.path, cat: normCat(r.cat) });
      }
    });
    enqueuePaths(items);
  };

  // Applies (or removes) one tag across every currently-selected case in a
  // single request, then merges the result into local state optimistically —
  // matches how handleSetManualStatus updates state ahead of the server ack.
  const handleBulkTag = (action, tag) => {
    const caseIds = Array.from(selectedCases);
    if (caseIds.length === 0) return;
    setTags((prev) => {
      const copy = { ...prev };
      caseIds.forEach((caseId) => {
        const current = copy[caseId] || [];
        const next = action === 'add'
          ? Array.from(new Set([...current, tag]))
          : current.filter((t) => t !== tag);
        if (next.length > 0) copy[caseId] = next; else delete copy[caseId];
      });
      return copy;
    });
    fetch('/api/testcases/tags/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseIds, action, tag }),
    })
      .then((res) => res.json().then((body) => ({ ok: res.ok, body })))
      .then(({ ok, body }) => { if (!ok) showToast(body.error || 'Bulk tag update failed', 'error'); })
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

  const handleCopyReport = () => {
    const jobs = filterHistoryByDate(runState.history, reportDate);
    const built = buildCyrDateReportText(jobs, formatReportDateLabel(reportDate));
    if (!built) { showToast(`No runs on ${formatReportDateLabel(reportDate)}`, 'warning'); return; }
    copyText(built.text);
    showToast(`Copied report (${built.count} run${built.count === 1 ? '' : 's'})`, 'success');
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

  const runStatusByPath = useMemo(
    () => latestRunStatusByPath(runState.history),
    [runState.history]
  );

  // Drives "Retry failed" — one entry per file whose most recent run failed,
  // in the same {path, cat} shape enqueuePaths expects. History is
  // newest-first, so the first entry seen per path is that file's last run.
  const failedFileItems = useMemo(() => {
    const seen = new Set();
    const items = [];
    (runState.history || []).forEach((h) => {
      if (!h.specPath || seen.has(h.specPath)) return;
      seen.add(h.specPath);
      if (h.status === 'failed') items.push({ path: h.specPath, cat: h.category || null });
    });
    return items;
  }, [runState.history]);

  const handleRetryFailed = () => {
    if (failedFileItems.length === 0) return;
    enqueuePaths(failedFileItems);
  };

  // Drives the filter bar's Passed/Failed/Blocked/Retest/Untested chips —
  // same per-case verdict (manual override > local run > file's overall
  // status) the status pills and CSV export already use.
  const getCaseStatus = useCallback(
    (r) => localCaseStatus(r, caseResultsByPath, runStatusByPath, manualStatus),
    [caseResultsByPath, runStatusByPath, manualStatus]
  );
  const statusCounts = useMemo(
    () => localRunTally(manifestData.rows, caseResultsByPath, runStatusByPath, manualStatus),
    [manifestData.rows, caseResultsByPath, runStatusByPath, manualStatus]
  );

  const flakySpecs = useMemo(() => cyrFlakySpecs(fileTrendMap), [fileTrendMap]);
  const flakySpecCaseCount = useMemo(() => {
    const paths = new Set(flakySpecs.map((s) => s.path));
    return manifestData.rows.filter((r) => paths.has(r.path)).length;
  }, [flakySpecs, manifestData.rows]);

  const bugGroups = useMemo(() => cyrGroupBugLinks(bugLinks), [bugLinks]);

  const avgDurationByPath = useMemo(() => cyrAvgDurationByPath(runState.history), [runState.history]);
  const globalAvgDuration = useMemo(() => cyrGlobalAvgDuration(runState.history), [runState.history]);

  // "Time estimation calculator" — a live ETA preview for whatever's about
  // to be queued, before the Queue/Retry button is even clicked.
  const selectedEtaMs = useMemo(
    () => cyrEstimateDuration(Array.from(selectedFiles.keys()), avgDurationByPath, globalAvgDuration),
    [selectedFiles, avgDurationByPath, globalAvgDuration]
  );
  const retryEtaMs = useMemo(
    () => cyrEstimateDuration(failedFileItems.map((i) => i.path), avgDurationByPath, globalAvgDuration),
    [failedFileItems, avgDurationByPath, globalAvgDuration]
  );

  // Eases the ETA badges to their new estimate instead of snapping whenever
  // the selection/retry set changes.
  const animSelectedEtaMs = useCountUp(selectedEtaMs);
  const animRetryEtaMs = useCountUp(retryEtaMs);

  // Batch progress for the Queue Progress card — batchIds accumulates run
  // ids in an effect above; "done" is whichever of those ids are no longer
  // in the live queue/active set, looked up in history for their verdict.
  const batchProgress = useMemo(() => {
    if (batchIds.size === 0) return null;
    const liveIds = new Set([...(runState.queue || []).map((q) => q.id), ...(runState.active ? [runState.active.id] : [])]);
    let passed = 0, failed = 0, done = 0;
    batchIds.forEach((id) => {
      if (liveIds.has(id)) return;
      const h = runState.history.find((x) => x.id === id);
      if (!h) return;
      done++;
      if (h.status === 'passed') passed++; else failed++;
    });
    return { total: batchIds.size, done, passed, failed };
  }, [batchIds, runState.queue, runState.active, runState.history]);

  const queueEtaMs = useMemo(() => {
    if (!runState.active && (runState.queue?.length || 0) === 0) return 0;
    let ms = cyrEstimateDuration((runState.queue || []).map((q) => q.path), avgDurationByPath, globalAvgDuration);
    if (runState.active) {
      const specAvg = avgDurationByPath[runState.active.specPath] || globalAvgDuration || CYR_DEFAULT_ESTIMATE_MS;
      const elapsed = nowTick - runState.active.startedAt;
      ms += Math.max(specAvg - elapsed, 3000);
    }
    return ms;
  }, [runState.queue, runState.active, avgDurationByPath, globalAvgDuration, nowTick]);

  const batchElapsedMs = batchProgress && batchStart ? nowTick - batchStart : 0;

  const handleCompare = (h, previous) => setCompareModal({ current: h, previous });

  // Union of tags already present on any currently-selected case — feeds the
  // bulk toolbar's "remove" chips, so it only ever offers to remove a tag
  // that's actually there to remove.
  const selectedCasesTags = useMemo(() => {
    const set = new Set();
    selectedCases.forEach((caseId) => (tags[caseId] || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [selectedCases, tags]);

  const STATUS_LABEL_CSV = { passed: 'Passed', failed: 'Failed', blocked: 'Blocked', retest: 'Retest', untested: 'Untested' };

  // scope 'selected' exports only the currently checked files in the tree
  // (selectedFiles, the same Map the "Queue N selected" button reads) —
  // everything else exports the full manifest.
  const handleExportCsv = (scope) => {
    const rows = scope === 'selected'
      ? manifestData.rows.filter((r) => selectedFiles.has(r.path))
      : manifestData.rows;
    if (rows.length === 0) { showToast('No test cases selected', 'warning'); return; }

    const lines = [['ID', 'Title', 'Status', 'Tags']];
    rows.forEach((r) => {
      const status = STATUS_LABEL_CSV[localCaseStatus(r, caseResultsByPath, runStatusByPath, manualStatus)];
      lines.push([r.id, r.title, status, (tags[r.id] || []).join('; ')]);
    });
    const csv = lines.map((row) => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `local-run-status-${scope}-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`Exported ${rows.length} case${rows.length === 1 ? '' : 's'}`, 'success');
  };

  // Shared with Jenkins Runner (TestCaseDashboard) — both pages read/write
  // this exact same manifest file, so an edit here is reflected there on
  // its next poll, and vice versa.
  const addManifestFile = async (category, group, relPath) => {
    try {
      const res = await fetch('/api/testcases/manifest/add-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, group, path: relPath }),
      });
      const body = await res.json();
      if (!res.ok) { showToast(body.error || "Couldn't add to manifest", 'error'); return; }
      showToast('Added to manifest', 'success');
      fetchManifestData();
    } catch (err) {
      showToast(`Couldn't add to manifest: ${err.message}`, 'error');
    }
  };

  const removeManifestFile = async (category, relPath) => {
    if (!(await showConfirm(`Remove "${relPath}" from the manifest? This only untracks it here — the file itself is unaffected.`))) return;
    try {
      const res = await fetch('/api/testcases/manifest/remove-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, path: relPath }),
      });
      const body = await res.json();
      if (!res.ok) { showToast(body.error || "Couldn't remove from manifest", 'error'); return; }
      showToast('Removed from manifest', 'success');
      fetchManifestData();
    } catch (err) {
      showToast(`Couldn't remove from manifest: ${err.message}`, 'error');
    }
  };

  const handleDownloadManifest = () => {
    window.open('/api/testcases/manifest/download', '_blank');
  };

  const active = runState.active;
  const selectedCount = selectedFiles.size;
  const pendingCount = runState.queue?.length || 0;
  const canStopAll = !!active || pendingCount > 0;

  return (
    <div className="cyr-page">
      <div
        className="cyr-card cyr-setup-card"
        style={{ '--hero-image': `url(${cypressRunnerHero})`, '--hero-image-light': `url(${cypressRunnerHeroLight})` }}
      >
        <div className={`cyr-setup-header${setupCollapsed ? '' : ' open'}`} onClick={() => setSetupCollapsed((v) => !v)}>
          <ChevronRight className="chev" size={16} />
          <h2><span className="cyr-icon-chip"><Terminal size={16} /></span> Cypress Runner</h2>
          {setupCollapsed && (
            <div className="cyr-setup-summary" onClick={(e) => e.stopPropagation()}>
              <span className="cyr-badge cyr-setup-path" title={projectPath || 'No project path set'}>
                {projectPath ? projectPath.split('/').pop() : 'no project set'}
              </span>
              <span className="cyr-badge">{browser}</span>
              <span className="cyr-badge">{headed ? 'headed' : 'headless'}</span>
              {environment && <span className="cyr-badge">{environment}</span>}
              {!active ? (
                <button type="button" className="cyr-btn primary small" onClick={handleRun} disabled={triggering}>
                  <PlayCircle size={13} /> {triggering ? 'Starting…' : 'Run'}
                </button>
              ) : (
                <button
                  type="button"
                  className="cyr-btn danger small"
                  onClick={handleKill}
                  disabled={killing}
                  title={pendingCount > 0 ? 'Skip this test and continue with the queue' : 'Stop the running test'}
                >
                  {pendingCount > 0 ? <SkipForward size={13} /> : <Square size={13} />}
                  {' '}{killing ? 'Working…' : (pendingCount > 0 ? 'Skip' : 'Stop')}
                </button>
              )}
              {canStopAll && (
                <button
                  type="button"
                  className="cyr-btn danger small"
                  onClick={handleStopAll}
                  disabled={stoppingAll}
                  title="Stop the running test (if any) and cancel every queued item"
                >
                  <XCircle size={13} /> {stoppingAll ? 'Cancelling…' : 'Cancel queue'}
                </button>
              )}
              {active && <RunStatusPill status={active.status} />}
            </div>
          )}
        </div>

        {!setupCollapsed && (
        <>
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
            <button
              type="button"
              className="cyr-btn danger"
              onClick={handleKill}
              disabled={killing}
              title={pendingCount > 0 ? 'Skip this test and continue with the queue' : 'Stop the running test'}
            >
              {pendingCount > 0 ? <SkipForward size={15} /> : <Square size={15} />}
              {' '}{killing ? 'Working…' : (pendingCount > 0 ? 'Skip' : 'Stop')}
            </button>
          )}
          {canStopAll && (
            <button
              type="button"
              className="cyr-btn danger"
              onClick={handleStopAll}
              disabled={stoppingAll}
              title="Stop the running test (if any) and cancel every queued item"
            >
              <XCircle size={15} /> {stoppingAll ? 'Cancelling…' : 'Cancel queue'}
            </button>
          )}
          {active && <RunStatusPill status={active.status} />}
        </div>
        </>
        )}
      </div>

      <div className="tcd-hero">
        <div className="tcd-hero-heading"><SlidersHorizontal size={13} /> Overview</div>
        <CyrHeroStats manifestData={manifestData} runState={runState} />
        <div className="tcd-cards-row">
          <CoverageCard data={manifestData} activeCats={activeCats} onToggleCat={toggleCat} />
          <LocalRunStatusCard data={manifestData} caseResultsByPath={caseResultsByPath} statusByPath={runStatusByPath} manualStatus={manualStatus} />
          <RunStatusCard data={manifestData} runStatus={runStatus} onFocusRunId={() => testrailRunIdInputRef.current?.focus()} />
          <CyrActivityCard history={runState.history} />
          <FlakySpecsCard
            specs={flakySpecs}
            caseCount={flakySpecCaseCount}
            onFocusPath={(p) => { setSearchTerm(p); searchInputRef.current?.focus(); }}
          />
          <BugsCard groups={bugGroups} onFocusCase={(caseId) => { setSearchTerm(caseId); searchInputRef.current?.focus(); }} />
        </div>
      </div>

      <StatsBar data={manifestData} activeCats={activeCats} onToggleCat={toggleCat} issueFilter={issueFilter} onToggleIssue={toggleIssue} statusCounts={statusCounts} flakyCount={flakySpecCaseCount} />

      {manifestData.missing && manifestData.missing.length > 0 && (
        <div className="tcd-banner">
          <AlertTriangle size={16} />
          <div>
            <strong>{manifestData.missing.length} path{manifestData.missing.length === 1 ? '' : 's'} not found</strong> in the repo, skipped — open{' '}
            <button type="button" className="tcd-link-btn" onClick={() => setManifestModalOpen(true)}>Manifest</button> to remove them.
          </div>
        </div>
      )}

      {batchProgress && (
        <QueueProgress
          total={batchProgress.total}
          done={batchProgress.done}
          passed={batchProgress.passed}
          failed={batchProgress.failed}
          activeSpec={runState.active ? (runState.active.specPath || 'all specs') : null}
          etaMs={queueEtaMs}
          elapsedMs={batchElapsedMs}
        />
      )}

      <div className={`cyr-layout${(active || !runsHidden) ? '' : ' cyr-layout-single'}`}>
        <div className="cyr-col-left">
          <div className="cyr-card">
            <h3><span className="cyr-icon-chip" style={{ '--chip-accent': 'var(--accent-cyan)' }}><ListChecks size={15} /></span> Test cases</h3>
            {manifestData.e2eRoot && (
              <p className="cyr-e2e-note">
                Queued runs use the same E2E project as Test Cases: <code>{manifestData.e2eRoot}</code>
              </p>
            )}
            <div className="cyr-search-row">
              <Search size={14} className="cyr-search-icon" />
              <input
                ref={searchInputRef}
                className="tcd-search-input cyr-search-input"
                placeholder="Search cases, files, titles… (press /)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="cyr-tree-actions">
              <span className="cyr-sub" style={{ margin: 0 }}>{manifestData.totalCases} test cases across {manifestData.totalFiles} files</span>
              <button
                type="button"
                className="cyr-btn primary small"
                disabled={selectedCount === 0}
                onClick={() => enqueuePaths(Array.from(selectedFiles.entries()).map(([path, cat]) => ({ path, cat })))}
              >
                Queue {selectedCount > 0 ? selectedCount : ''} selected
                {selectedCount > 0 && <span className="cyr-eta-badge">{formatEta(animSelectedEtaMs)}</span>}
              </button>
              <button
                type="button"
                className={`cyr-btn small${failedFileItems.length > 0 ? ' warn' : ''}`}
                disabled={failedFileItems.length === 0}
                title={failedFileItems.length > 0 ? `Re-queue the ${failedFileItems.length} file(s) whose last run failed` : 'No files currently failing their last run'}
                onClick={handleRetryFailed}
              >
                <RotateCcw size={12} /> Retry failed {failedFileItems.length > 0 ? `(${failedFileItems.length})` : ''}
                {failedFileItems.length > 0 && <span className="cyr-eta-badge">{formatEta(animRetryEtaMs)}</span>}
              </button>
              <button type="button" className="cyr-btn small" title="View, add, remove, and download manifest entries" onClick={() => setManifestModalOpen(true)}>
                <FilePlus2 size={12} /> Manifest
              </button>
              <button type="button" className="cyr-btn small" title="Export local run status for every test case" onClick={() => handleExportCsv('all')}>
                <Download size={12} /> Export CSV (all)
              </button>
              <button
                type="button"
                className="cyr-btn small"
                title="Export local run status for the selected files only"
                disabled={selectedCount === 0}
                onClick={() => handleExportCsv('selected')}
              >
                <Download size={12} /> Export CSV ({selectedCount > 0 ? selectedCount : '0'} selected)
              </button>
              <button
                type="button"
                className={`cyr-btn small cyr-history-toggle${runsHidden ? ' active' : ''}`}
                title={runsHidden ? 'Show the Runs history panel' : 'Hide the Runs history panel — test cases expand to full width'}
                onClick={() => setRunsHidden((v) => !v)}
              >
                {runsHidden ? <Eye size={12} /> : <EyeOff size={12} />}
                {runsHidden ? 'Show run history' : 'Hide run history'}
                <span className="cyr-runs-count">{(runState.queue?.length || 0) + (runState.history?.length || 0)}</span>
              </button>
            </div>
            {selectedCases.size > 0 && (
              <BulkTagBar
                count={selectedCases.size}
                existingTags={selectedCasesTags}
                onAddTag={(tag) => handleBulkTag('add', tag)}
                onRemoveTag={(tag) => handleBulkTag('remove', tag)}
                onRun={handleRunSelectedCases}
                onClear={() => setSelectedCases(new Set())}
              />
            )}
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
              manualStatus={manualStatus}
              tags={tags}
              onOpenTagModal={(caseId, caseTitle) => setTagModal({ caseId, caseTitle })}
              onRemoveTag={handleRemoveTag}
              bugLinks={bugLinks}
              onEditBugLink={handleEditBugLink}
              onClearBugLink={handleClearBugLink}
              selectedCases={selectedCases}
              onToggleCaseSelect={toggleCaseSelect}
              onSelectManyCases={selectManyCases}
              onSetManualStatus={handleSetManualStatus}
              getCaseStatus={getCaseStatus}
            />
          </div>
        </div>

        {(active || !runsHidden) && (
          <div className="cyr-col-right">
            {active && (
              <div className="cyr-card">
                <h3>
                  <span className="cyr-icon-chip" style={{ '--chip-accent': 'var(--accent-green)' }}><FolderOpen size={15} /></span>
                  Live output — {active.specPath || 'all specs'} {active.headed ? '(headed)' : '(headless)'}
                </h3>
                <LogViewer text={logText} live />
              </div>
            )}

            {!runsHidden && (
              <div className="cyr-card">
                <div className="cyr-tree-actions">
                  <h3 style={{ margin: 0 }}>
                    Runs
                    <span className="cyr-runs-count">{(runState.queue?.length || 0) + (runState.history?.length || 0)}</span>
                  </h3>
                  <div className="cyr-report-controls">
                    <input
                      type="date"
                      className="tcd-report-date-input"
                      value={reportDate}
                      max={todayDateKey()}
                      onChange={(e) => setReportDate(e.target.value)}
                      title="Report date"
                    />
                    <button type="button" className="cyr-btn small" title="Copy this date's report" onClick={handleCopyReport}>
                      <Clipboard size={12} /> Copy report
                    </button>
                  </div>
                  <button
                    type="button"
                    className="cyr-btn small"
                    title="Hide the Runs history panel — test cases expand to full width"
                    onClick={() => setRunsHidden(true)}
                  >
                    <EyeOff size={12} /> Hide
                  </button>
                </div>
                <RunsList
                  queue={runState.queue}
                  history={runState.history}
                  onDequeue={handleDequeue}
                  onViewLog={handleViewLog}
                  onViewScreenshots={handleViewScreenshots}
                  onSendTelegram={handleSendTelegram}
                  onCompare={handleCompare}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {viewLog && (
        <ModalPortal>
          <div className="cyr-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setViewLog(null); }}>
            <div className="cyr-modal cyr-log-modal" role="dialog" aria-modal="true">
              <h3><span className="cyr-icon-chip"><Terminal size={15} /></span> Run log</h3>
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

      {compareModal && (
        <CompareRunsModal current={compareModal.current} previous={compareModal.previous} onClose={() => setCompareModal(null)} />
      )}

      {tagModal && (
        <TagModal
          caseId={tagModal.caseId}
          caseTitle={tagModal.caseTitle}
          existing={tags[tagModal.caseId]}
          onClose={() => setTagModal(null)}
          onSave={handleSaveTags}
        />
      )}

      {manifestModalOpen && (
        <ManifestModal data={manifestData} onClose={() => setManifestModalOpen(false)} onAdd={addManifestFile} onRemove={removeManifestFile} onDownload={handleDownloadManifest} />
      )}
    </div>
  );
};

export default CypressRunner;
