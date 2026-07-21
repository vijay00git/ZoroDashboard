import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, ChevronsDown, ChevronsUp, Copy, Download, FilePlus2, AlertTriangle, Search,
  Settings as SettingsIcon, BookmarkPlus, X, FolderSearch, SlidersHorizontal,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { showPrompt, showConfirm } from '../utils/Alerts';
import StatsBar from './testcase-dashboard/StatsBar';
import HeroStats from './testcase-dashboard/HeroStats';
import CoverageCard from './testcase-dashboard/CoverageCard';
import RunStatusCard from './testcase-dashboard/RunStatusCard';
import JobActivityCard from './testcase-dashboard/JobActivityCard';
import FileTree from './testcase-dashboard/FileTree';
import RunsPanel from './testcase-dashboard/RunsPanel';
import AddManifestModal from './testcase-dashboard/AddManifestModal';
import RunModal from './testcase-dashboard/RunModal';
import NoteModal from './testcase-dashboard/NoteModal';
import RunDetailsModal from './testcase-dashboard/RunDetailsModal';
import SendReportModal, { ATTACHMENT_CAP } from './testcase-dashboard/SendReportModal';
import ModalPortal from './testcase-dashboard/ModalPortal';
import {
  csvEscape, normCat, timeAgo, copyText, SORT_OPTIONS, isImageArtifact,
  todayDateKey, filterHistoryByDate, formatReportDateLabel, buildReportText, buildJobReportBlock,
} from './testcase-dashboard/helpers';
import './testcase-dashboard/TestCaseDashboard.css';

const EMPTY_DATA = { rows: [], missing: [], catCounts: {}, fileCounts: {}, totalCases: 0, totalFiles: 0, unknownIds: [], caseIdCheck: {}, manifestPath: '', e2eRoot: '' };

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('tcd_prefs') || '{}'); } catch { return {}; }
}

function loadPresets() {
  try { return JSON.parse(localStorage.getItem('tcd_presets') || '[]'); } catch { return []; }
}

const TestCaseDashboard = () => {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState(EMPTY_DATA);
  const [connOk, setConnOk] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now()); // ticks every second for the "updated Xs ago" label

  const [activeCats, setActiveCats] = useState(() => loadPrefs().activeCats || { OFFLINE: true, ONLINE: true, E2E: true });
  const [issueFilter, setIssueFilter] = useState(() => loadPrefs().issueFilter || null);
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set(loadPrefs().collapsedGroups || []));
  const [searchTerm, setSearchTerm] = useState(() => loadPrefs().searchTerm || '');
  const [runsCollapsed, setRunsCollapsed] = useState(() => !!loadPrefs().runsCollapsed);
  const [sortMode, setSortMode] = useState(() => loadPrefs().sortMode || 'name');
  const [isLoading, setIsLoading] = useState(true);
  const [connStatus, setConnStatus] = useState({ testrail: null, jenkins: null });
  const [presets, setPresets] = useState(loadPresets);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [reportDate, setReportDate] = useState(() => todayDateKey());
  const [reportSelectMode, setReportSelectMode] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState(new Set());

  const [openFiles, setOpenFiles] = useState(new Set());
  const [selectedFiles, setSelectedFiles] = useState(new Map());
  const [visiblePaths, setVisiblePaths] = useState([]);

  const [runIdInput, setRunIdInput] = useState(() => localStorage.getItem('tcd_run_id') || '');
  const [runStatus, setRunStatus] = useState(null);
  const [runPulling, setRunPulling] = useState(false);
  const [runError, setRunError] = useState(null);

  const [jenkinsConfig, setJenkinsConfig] = useState({ jobs: { OFFLINE: [], ONLINE: [], E2E: [] }, defaultEnvironment: 'qa', environments: ['qa'], testrailUrl: null });
  const [runsState, setRunsState] = useState({ queue: [], running: [], history: [] });
  const [notes, setNotes] = useState({});

  const [modal, setModal] = useState(null); // { type: 'addManifest'|'run'|'note'|'runDetails', ...props }

  const searchInputRef = useRef(null);
  const runIdInputRef = useRef(null);

  const savePrefs = useCallback((patch) => {
    const next = {
      activeCats, issueFilter, collapsedGroups: Array.from(collapsedGroups), searchTerm, runsCollapsed, sortMode,
      ...patch,
    };
    localStorage.setItem('tcd_prefs', JSON.stringify(next));
  }, [activeCats, issueFilter, collapsedGroups, searchTerm, runsCollapsed, sortMode]);

  /* ── Data polling ── */
  const fetchData = useCallback(() => {
    fetch('/api/testcases/data', { cache: 'no-store' })
      .then((res) => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then((json) => {
        setConnOk(true);
        setLastFetchedAt(Date.now());
        setData(json);
      })
      .catch(() => setConnOk(false))
      .finally(() => setIsLoading(false));
  }, [setConnOk, setLastFetchedAt, setData, setIsLoading]);

  const fetchJenkinsConfig = useCallback(() => {
    fetch('/api/testcases/jenkins-jobs', { cache: 'no-store' }).then((r) => r.json()).then(setJenkinsConfig).catch(() => {});
  }, [setJenkinsConfig]);

  const fetchConnStatus = useCallback(() => {
    fetch('/api/integrations/config/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((r) => r.json())
      .then((result) => setConnStatus({ testrail: result.testrail?.ok ?? null, jenkins: result.jenkins?.ok ?? null }))
      .catch(() => {});
  }, [setConnStatus]);

  const fetchNotes = useCallback(() => {
    fetch('/api/testcases/notes', { cache: 'no-store' }).then((r) => r.json()).then(setNotes).catch(() => {});
  }, [setNotes]);

  // Self-scheduling rather than a fixed setInterval so it can poll faster
  // (2s) while anything is actually queued/running — that's exactly when a
  // status transition (queued → building → done) is imminent — and back off
  // to 5s the rest of the time. Also fires immediately on tab focus, since a
  // backgrounded tab's timers get throttled by the browser and can otherwise
  // sit stale for a while after a build actually changed state.
  const runsPollTimeoutRef = useRef(null);
  const pollRunsRef = useRef(null);
  const fetchRunsState = useCallback(() => {
    if (runsPollTimeoutRef.current) { clearTimeout(runsPollTimeoutRef.current); runsPollTimeoutRef.current = null; }
    fetch('/api/testcases/job-queue', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        setRunsState(json);
        const active = (json.running || []).length > 0 || (json.queue || []).length > 0;
        runsPollTimeoutRef.current = setTimeout(() => pollRunsRef.current(), active ? 2000 : 5000);
      })
      .catch(() => { runsPollTimeoutRef.current = setTimeout(() => pollRunsRef.current(), 5000); });
  }, [setRunsState]);
  useEffect(() => { pollRunsRef.current = fetchRunsState; }, [fetchRunsState]);

  useEffect(() => {
    fetchData(); fetchJenkinsConfig(); fetchNotes(); fetchRunsState(); fetchConnStatus();
    const dData = setInterval(fetchData, 60000);
    const dTick = setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchRunsState(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(dData); clearInterval(dTick);
      if (runsPollTimeoutRef.current) clearTimeout(runsPollTimeoutRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchData, fetchJenkinsConfig, fetchNotes, fetchRunsState, fetchConnStatus]);

  const pullRunStatus = useCallback((runId) => {
    if (!/^\d+$/.test(runId)) { searchInputRef.current?.focus(); return; }
    localStorage.setItem('tcd_run_id', runId);
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
  }, [setRunPulling, setRunError, setRunStatus]);

  // Deferred to a microtask rather than called synchronously in the effect
  // body, since pullRunStatus sets state immediately (setRunPulling) before
  // its fetch resolves.
  useEffect(() => {
    if (!runIdInput) return;
    Promise.resolve().then(() => pullRunStatus(runIdInput));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Filter / selection handlers ── */
  const toggleCat = (cat) => {
    setActiveCats((prev) => {
      const next = { ...prev, [cat]: !prev[cat] };
      if (!Object.values(next).some(Boolean)) next[cat] = true;
      savePrefs({ activeCats: next });
      return next;
    });
  };

  const toggleIssue = (issue) => {
    setIssueFilter((prev) => {
      const next = prev === issue ? null : issue;
      savePrefs({ issueFilter: next });
      return next;
    });
  };

  const handleSortChange = (e) => {
    setSortMode(e.target.value);
    savePrefs({ sortMode: e.target.value });
  };

  const savePresets = (next) => {
    setPresets(next);
    localStorage.setItem('tcd_presets', JSON.stringify(next));
  };

  const saveCurrentAsPreset = async () => {
    const name = await showPrompt('Name this filter preset:', searchTerm || 'My filter');
    if (!name) return;
    const preset = { id: `${Date.now()}`, name, searchTerm, activeCats, issueFilter };
    savePresets([...presets.filter((p) => p.name !== name), preset]);
    showToast('Preset saved', 'success');
  };

  const applyPreset = (preset) => {
    setSearchTerm(preset.searchTerm || '');
    setActiveCats(preset.activeCats || { OFFLINE: true, ONLINE: true, E2E: true });
    setIssueFilter(preset.issueFilter || null);
    savePrefs({ searchTerm: preset.searchTerm || '', activeCats: preset.activeCats, issueFilter: preset.issueFilter || null });
  };

  const removePreset = (id) => {
    savePresets(presets.filter((p) => p.id !== id));
  };

  const toggleGroupCollapse = (groupKey) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
      savePrefs({ collapsedGroups: Array.from(next) });
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

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    savePrefs({ searchTerm: e.target.value });
  };

  /* ── Keyboard: "/" focuses search (scoped to this page) ── */
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName || '';
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchTerm('');
        savePrefs({ searchTerm: '' });
        searchInputRef.current.blur();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Manifest / notes / jobs actions ── */
  const addManifestFile = async (category, group, relPath) => {
    try {
      const res = await fetch('/api/testcases/manifest/add-file', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, group, path: relPath }),
      });
      const body = await res.json();
      if (!res.ok) { showToast(body.error || "Couldn't add to manifest", 'error'); return; }
      setModal(null);
      showToast('Added to manifest', 'success');
      fetchData();
    } catch (err) {
      showToast(`Couldn't add to manifest: ${err.message}`, 'error');
    }
  };

  const saveNote = async (caseId, text) => {
    try {
      const res = await fetch('/api/testcases/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, text }),
      });
      const r = await res.json();
      setNotes((prev) => {
        const next = { ...prev };
        if (r.note) next[caseId] = r.note; else delete next[caseId];
        return next;
      });
      setModal(null);
      showToast(text ? 'Note saved' : 'Note cleared', 'success');
    } catch {
      showToast("Couldn't save note", 'error');
    }
  };

  const queueBuilds = async (items, environment, runId) => {
    try {
      const res = await fetch('/api/testcases/queue-jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, environment, runId }),
      });
      const body = await res.json();
      setModal(null);
      if (res.ok) {
        showToast(`Queued ${items.length} build${items.length === 1 ? '' : 's'}`, 'success');
        setSelectedFiles(new Map());
        fetchRunsState();
      } else {
        showToast(`Queue failed: ${body.error || 'unknown error'}`, 'error');
      }
    } catch (err) {
      setModal(null);
      showToast(`Queue failed: ${err.message}`, 'error');
    }
  };

  const cancelJob = async (item) => {
    const isBuilding = item.status === 'building';
    if (isBuilding) {
      const ok = await showConfirm(`Stop the running build for "${item.path}"? This aborts it on Jenkins.`);
      if (!ok) return;
    }
    try {
      const res = await fetch('/api/testcases/cancel-job', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }),
      });
      const body = await res.json();
      if (!res.ok) { showToast(body.error || "Couldn't cancel", 'error'); return; }
      showToast(isBuilding ? 'Stopping build…' : 'Removed from queue', 'success');
      fetchRunsState();
    } catch (err) {
      showToast(`Couldn't cancel: ${err.message}`, 'error');
    }
  };

  const removeHistoryItem = async (id) => {
    try {
      const res = await fetch('/api/testcases/remove-history', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setRunsState((prev) => ({ ...prev, history: prev.history.filter((h) => h.id !== id) }));
      } else {
        showToast("Couldn't remove that entry", 'error');
      }
    } catch {
      showToast("Couldn't remove that entry", 'error');
    }
  };

  const recheckIds = () => {
    fetch('/api/testcases/recheck-ids', { cache: 'no-store' }).catch(() => {});
    showToast('Rechecking against TestRail…', 'info');
  };

  /* ── Bulk toolbar actions ── */
  const expandAll = () => setOpenFiles(new Set(visiblePaths));
  const collapseAll = () => setOpenFiles(new Set());
  const copyVisible = () => {
    if (visiblePaths.length === 0) { showToast('Nothing visible to copy', 'warning'); return; }
    copyText(visiblePaths.join('\n'));
    showToast(`Copied ${visiblePaths.length} path${visiblePaths.length === 1 ? '' : 's'}`, 'success');
  };

  // Explicit job selection always wins over the date picker — checking any
  // box is an unambiguous "report exactly these," so there's no separate
  // mode toggle to get out of sync with what's actually selected.
  const getReportJobs = () => {
    if (selectedJobIds.size > 0) return runsState.history.filter((h) => selectedJobIds.has(h.id));
    return filterHistoryByDate(runsState.history, reportDate);
  };

  const buildCurrentReport = () => {
    const jobs = getReportJobs();
    const label = selectedJobIds.size > 0 ? `${jobs.length} selected job${jobs.length === 1 ? '' : 's'}` : formatReportDateLabel(reportDate);
    return buildReportText(jobs, label);
  };

  const toggleJobSelected = (id) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearJobSelection = () => setSelectedJobIds(new Set());

  const toggleReportSelectMode = () => {
    setReportSelectMode((v) => !v);
    setSelectedJobIds(new Set());
  };

  const copyTodayReport = () => {
    const report = buildCurrentReport();
    if (!report) { showToast('No jobs match — pick another date or selection', 'info'); return; }
    copyText(report.text);
    showToast(`Copied report (${report.count} job${report.count === 1 ? '' : 's'})`, 'success');
  };

  const openSendReportModal = () => {
    const report = buildCurrentReport();
    if (!report) { showToast('No jobs match — pick another date or selection', 'info'); return; }
    setModal({ type: 'sendReport' });
  };

  // Each job goes out as its own message: that job's text plus that job's
  // own screenshots/CSV, sent sequentially — so a multi-job report reads as
  // "job A + its evidence, then job B + its evidence," never one combined
  // text block followed by an undifferentiated pile of images from
  // whichever jobs happened to be in the report. The 30-per-type cap is
  // shared across the whole report (not per job), so one job with 40
  // screenshots doesn't crowd out every other job's evidence.
  const sendTodayReportToTelegram = async ({ includeScreenshots, includeCsv }) => {
    const jobs = getReportJobs();
    if (jobs.length === 0) { showToast('No jobs match — pick another date or selection', 'info'); return; }

    const label = selectedJobIds.size > 0 ? `${jobs.length} selected job${jobs.length === 1 ? '' : 's'}` : formatReportDateLabel(reportDate);
    const overview = `Test Run Report — ${label}\n${jobs.length} job${jobs.length === 1 ? '' : 's'} · sent one message per job below`;

    let screenshotsUsed = 0, csvUsed = 0, truncated = false;
    const perJob = jobs.map((h) => {
      const attachments = [];
      (h.artifacts || []).forEach((a) => {
        if (includeScreenshots && isImageArtifact(a.name)) {
          if (screenshotsUsed >= ATTACHMENT_CAP) { truncated = true; return; }
          attachments.push({ type: 'photo', url: a.url, filename: a.name });
          screenshotsUsed++;
        } else if (includeCsv && /\.csv$/i.test(a.name)) {
          if (csvUsed >= ATTACHMENT_CAP) { truncated = true; return; }
          attachments.push({ type: 'document', url: a.url, filename: a.name });
          csvUsed++;
        }
      });
      return { text: buildJobReportBlock(h), attachments };
    });

    setSendingTelegram(true);
    try {
      const res = await fetch('/api/integrations/telegram/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overview, jobs: perJob }),
      });
      const body = await res.json();
      if (!res.ok) { showToast(body.error || "Couldn't send to Telegram", 'error'); return; }
      setModal(null);
      const fileNote = (screenshotsUsed || csvUsed) ? `, ${screenshotsUsed + csvUsed} file${screenshotsUsed + csvUsed === 1 ? '' : 's'}${truncated ? ' (capped)' : ''}` : '';
      showToast(`Sent to Telegram (${jobs.length} job${jobs.length === 1 ? '' : 's'}${fileNote})`, 'success');
    } catch (err) {
      showToast(`Couldn't send to Telegram: ${err.message}`, 'error');
    } finally {
      setSendingTelegram(false);
    }
  };

  const exportCsv = () => {
    const term = searchTerm.trim().toLowerCase();
    const unknownIdSet = new Set((data.unknownIds || []).map((u) => u.id));
    const lines = [['ID', 'Title', 'Status', 'Tags', 'Notes']];
    data.rows.forEach((r) => {
      const cat = normCat(r.cat);
      if (!activeCats[cat]) return;
      if (term && `${r.id} ${r.title} ${r.path} ${r.club || ''}`.toLowerCase().indexOf(term) === -1) return;
      if (issueFilter === 'commented' && !r.commented) return;
      if (issueFilter === 'unknown' && !unknownIdSet.has(r.id)) return;
      let status = '';
      if (runStatus) {
        const entry = runStatus.statuses[String(r.id).replace(/^C/i, '')];
        status = entry ? entry.status : 'Not in run';
      }
      lines.push([r.id, r.title, status, cat, r.path]);
    });
    const csv = lines.map((row) => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `testcases-${stamp}${runStatus ? `-run${runStatus.runId}` : ''}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /* ── Live status label ── */
  let liveLabel = 'Connecting…';
  if (!connOk) liveLabel = 'Server unreachable';
  else if (lastFetchedAt) {
    const secs = Math.round((now - lastFetchedAt) / 1000);
    liveLabel = secs < 2 ? 'Updated just now' : `Updated ${secs}s ago`;
  }

  const check = data.caseIdCheck;
  const unknown = data.unknownIds || [];

  return (
    <div className="tcd">
      {!connOk && (
        <div className="tcd-conn-banner">
          Can't reach the dashboard server. Make sure the Zoro server (<code>node server.js</code>) is still running.
        </div>
      )}

      <div className="tcd-toolbar">
        <div className="tcd-toolbar-row">
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              ref={searchInputRef}
              className="tcd-search-input"
              style={{ width: '100%', paddingLeft: '1.9rem' }}
              placeholder="Search cases, files, titles… (press /)"
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>
          <select className="tcd-sort-select" value={sortMode} onChange={handleSortChange} title="Sort files by">
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>Sort: {o.label}</option>)}
          </select>
          <span className="tcd-toolbar-divider" />
          <div className="tcd-btn-group">
            <button className="tcd-btn" title="Expand all" onClick={expandAll}><ChevronsDown size={14} /></button>
            <button className="tcd-btn" title="Collapse all" onClick={collapseAll}><ChevronsUp size={14} /></button>
            <button className="tcd-btn" title="Refresh now" onClick={fetchData}><RefreshCw size={14} /></button>
          </div>
          <div className="tcd-btn-group">
            <button className="tcd-btn" title="Copy visible file paths" onClick={copyVisible}><Copy size={14} /> Copy</button>
            <button className="tcd-btn" title="Export filtered cases as CSV" onClick={exportCsv}><Download size={14} /> CSV</button>
          </div>
          <button className="tcd-btn primary" onClick={() => setModal({ type: 'addManifest' })}><FilePlus2 size={14} /> Add to manifest</button>
          <button className="tcd-btn" title="TestRail, Jenkins &amp; Telegram credentials (Settings → Integrations)" onClick={() => navigate('/settings?tab=integrations')}><SettingsIcon size={14} /></button>
        </div>

        <div className="tcd-toolbar-row">
          <div className="tcd-run-pull">
            <input
              ref={runIdInputRef}
              className="tcd-run-id-input"
              inputMode="numeric"
              placeholder="TestRail run ID"
              value={runIdInput}
              onChange={(e) => setRunIdInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') pullRunStatus(runIdInput.trim()); }}
            />
            <button className="tcd-btn" disabled={runPulling} onClick={() => pullRunStatus(runIdInput.trim())}>
              {runPulling ? 'Pulling…' : 'Pull status'}
            </button>
          </div>
          <span className="tcd-live-status">
            <span className={`tcd-live-dot ${connOk ? 'ok' : 'fail'}`} /> {liveLabel}
          </span>
          <div className="tcd-conn-badges">
            <span className={`tcd-conn-badge ${connStatus.testrail === null ? '' : connStatus.testrail ? 'ok' : 'fail'}`} title="TestRail reachability — from the last credentials test">
              <span className="dot" /> TestRail
            </span>
            <span className={`tcd-conn-badge ${connStatus.jenkins === null ? '' : connStatus.jenkins ? 'ok' : 'fail'}`} title="Jenkins reachability — from the last credentials test">
              <span className="dot" /> Jenkins
            </span>
          </div>
          <div className="tcd-spacer" />
          <span className="tcd-result-count">{visiblePaths.length} file{visiblePaths.length === 1 ? '' : 's'} shown of {data.totalFiles}</span>
        </div>

        <div className="tcd-toolbar-row tcd-presets-row">
          <button className="tcd-btn small" title="Save current search + filters as a preset" onClick={saveCurrentAsPreset}>
            <BookmarkPlus size={13} /> Save preset
          </button>
          {presets.map((p) => (
            <span key={p.id} className="tcd-preset-chip" onClick={() => applyPreset(p)} title="Apply this preset">
              {p.name}
              <button type="button" onClick={(e) => { e.stopPropagation(); removePreset(p.id); }} title="Remove preset"><X size={11} /></button>
            </span>
          ))}
        </div>

        {isLoading ? (
          <div className="tcd-filter-bar">
            <div className="tcd-skeleton" style={{ height: '28px', width: '100%' }} />
          </div>
        ) : (
          <StatsBar data={data} activeCats={activeCats} onToggleCat={toggleCat} issueFilter={issueFilter} onToggleIssue={toggleIssue} />
        )}
      </div>

      <div className="tcd-hero">
        <div className="tcd-hero-heading"><SlidersHorizontal size={13} /> Overview</div>
        {isLoading ? (
          <div className="tcd-hero-kpis">
            {Array.from({ length: 5 }, (_, i) => <div key={i} className="tcd-kpi tcd-skeleton" style={{ height: '58px' }} />)}
          </div>
        ) : (
          <HeroStats data={data} runsState={runsState} runStatus={runStatus} onRecheck={recheckIds} />
        )}
        {isLoading ? (
          <div className="tcd-cards-row">
            {Array.from({ length: 3 }, (_, i) => <div key={i} className="tcd-card tcd-skeleton" style={{ height: '180px' }} />)}
          </div>
        ) : (
          <div className="tcd-cards-row">
            <CoverageCard data={data} />
            <RunStatusCard data={data} runStatus={runStatus} onFocusRunId={() => runIdInputRef.current?.focus()} />
            <JobActivityCard runsState={runsState} />
          </div>
        )}
      </div>

      {runError && <div className="tcd-conn-banner">Couldn't pull run status: {runError}</div>}

      {data.missing && data.missing.length > 0 && (
        <div className="tcd-banner">
          <AlertTriangle size={16} />
          <div>
            <strong>{data.missing.length} path{data.missing.length === 1 ? '' : 's'} not found</strong> in the repo, skipped:{' '}
            {data.missing.map((m, i) => <span key={i}><code>{m.path}</code>{i < data.missing.length - 1 ? ', ' : ''}</span>)}
          </div>
        </div>
      )}

      {!isLoading && connOk && data.totalCases === 0 ? (
        <div className="tcd-empty-manifest">
          <FolderSearch size={28} style={{ marginBottom: '0.6rem', color: 'var(--text-muted)' }} />
          <div className="big">No test cases found</div>
          <p>The manifest has no matched cases yet. Zoro is currently watching:</p>
          <p>Manifest: <code>{data.manifestPath}</code></p>
          <p>E2E root: <code>{data.e2eRoot}</code></p>
          <p>Use "Add to manifest" above, or check that the manifest file exists and lists real paths under the E2E root.</p>
        </div>
      ) : (
        <>
          {check && check.available && unknown.length > 0 && (
            <div className="tcd-idcheck-banner">
              <AlertTriangle size={16} />
              <div>
                <strong>{unknown.length} case ID{unknown.length === 1 ? '' : 's'} in the codebase {unknown.length === 1 ? "isn't" : "aren't"} in TestRail</strong>
                {' '}(checked {timeAgo(check.checkedAt)}, {check.knownCount} known cases) — typo, or the case was deleted/moved.{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); recheckIds(); }} style={{ color: 'inherit', textDecoration: 'underline' }}>Recheck</a>
                <div className="tcd-idlist">
                  {unknown.slice(0, 40).map((u, i) => <code key={i} title={u.path}>{u.id}</code>)}
                  {unknown.length > 40 && <span> …+{unknown.length - 40} more</span>}
                </div>
              </div>
            </div>
          )}

          <div className="tcd-layout">
            <FileTree
              data={data}
              activeCats={activeCats}
              issueFilter={issueFilter}
              searchTerm={searchTerm}
              runStatus={runStatus}
              notes={notes}
              jenkinsConfig={jenkinsConfig}
              selectedFiles={selectedFiles}
              onToggleFileSelect={toggleFileSelect}
              onToggleManySelect={toggleManySelect}
              openFiles={openFiles}
              onToggleFileOpen={toggleFileOpen}
              collapsedGroups={collapsedGroups}
              onToggleGroupCollapse={toggleGroupCollapse}
              fileTrendMap={(() => {
                const byPath = {};
                (runsState.history || []).forEach((h) => { (byPath[h.path] = byPath[h.path] || []).push(h); });
                const map = {};
                Object.keys(byPath).forEach((p) => { map[p] = byPath[p].slice().reverse(); });
                return map;
              })()}
              onRunFile={(path, cat) => setModal({ type: 'run', filesToRun: [{ path, cat }] })}
              onOpenNote={(caseId, caseTitle) => setModal({ type: 'note', caseId, caseTitle })}
              onVisiblePathsChange={setVisiblePaths}
              showToast={showToast}
              sortMode={sortMode}
              testrailUrl={jenkinsConfig.testrailUrl}
            />
            <RunsPanel
              runsState={runsState}
              collapsed={runsCollapsed}
              onToggleCollapsed={() => setRunsCollapsed((c) => { const next = !c; savePrefs({ runsCollapsed: next }); return next; })}
              onRemoveHistory={removeHistoryItem}
              onOpenDetails={(item) => setModal({ type: 'runDetails', item })}
              onCopyTodayReport={copyTodayReport}
              onSendTelegramReport={openSendReportModal}
              onCancelJob={cancelJob}
              reportDate={reportDate}
              onReportDateChange={setReportDate}
              reportSelectMode={reportSelectMode}
              onToggleReportSelectMode={toggleReportSelectMode}
              selectedJobIds={selectedJobIds}
              onToggleJobSelected={toggleJobSelected}
              onClearJobSelection={clearJobSelection}
            />
          </div>

          {selectedFiles.size > 0 && (
            <ModalPortal>
              <div className="tcd-selection-bar">
                <div className="tcd-selection-bar-inner">
                  <span>{selectedFiles.size} file{selectedFiles.size === 1 ? '' : 's'} selected</span>
                  <button className="tcd-btn small" onClick={() => setSelectedFiles(new Map())}>Clear</button>
                  <button
                    className="tcd-btn small primary"
                    onClick={() => setModal({ type: 'run', filesToRun: Array.from(selectedFiles.entries()).map(([path, cat]) => ({ path, cat })) })}
                  >
                    Run selected
                  </button>
                </div>
              </div>
            </ModalPortal>
          )}
        </>
      )}

      {modal?.type === 'addManifest' && (
        <AddManifestModal data={data} onClose={() => setModal(null)} onSubmit={addManifestFile} />
      )}
      {modal?.type === 'sendReport' && (
        <SendReportModal
          report={buildCurrentReport()}
          jobs={getReportJobs()}
          onClose={() => setModal(null)}
          onSend={sendTodayReportToTelegram}
          sending={sendingTelegram}
        />
      )}
      {modal?.type === 'run' && (
        <RunModal
          filesToRun={modal.filesToRun}
          jenkinsConfig={jenkinsConfig}
          currentRunId={runIdInput}
          onClose={() => setModal(null)}
          onSubmit={queueBuilds}
        />
      )}
      {modal?.type === 'note' && (
        <NoteModal
          caseId={modal.caseId}
          caseTitle={modal.caseTitle}
          existing={notes[modal.caseId]}
          onClose={() => setModal(null)}
          onSave={saveNote}
        />
      )}
      {modal?.type === 'runDetails' && (
        <RunDetailsModal
          item={modal.item}
          onClose={() => setModal(null)}
          onRetry={(item) => setModal({ type: 'run', filesToRun: [{ path: item.path, cat: item.category }] })}
        />
      )}
    </div>
  );
};

export default TestCaseDashboard;
