import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Database,
  Upload,
  Play,
  Trash2,
  Plus,
  RefreshCw,
  Check,
  Search,
  AlertTriangle,
  Pin,
  Clipboard,
  FileText,
  FileSpreadsheet,
  Download,
  Info,
  Folder,
  FolderPlus,
  Save,
  Edit2,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  GripVertical
} from 'lucide-react';
import { showAlert, showConfirm, showPrompt } from '../utils/Alerts';

const SyncHub = () => {
  // TestRail credentials
  const [runId, setRunId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // States list from API
  const [states, setStates] = useState([]);
  const [globalTags, setGlobalTags] = useState([]);
  const [selectedStateIds, setSelectedStateIds] = useState(() => {
    try {
      const saved = sessionStorage.getItem('tr-sync-selectedStateIds');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });
  const [pinnedStateId, setPinnedStateId] = useState(localStorage.getItem('tr-sync-pinned') || '');
  const [saveName, setSaveName] = useState('');
  const [saveFolder, setSaveFolder] = useState('');

  // Ledger items
  const [testCases, setTestCases] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('tr-sync-testcases') || '[]'); } catch { return []; }
  });
  const [customFolders, setCustomFolders] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('tr-sync-customFolders') || '["Uncategorized"]'); } catch { return ['Uncategorized']; }
  });
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedCaseUids, setSelectedCaseUids] = useState([]);
  const [draggedStateId, setDraggedStateId] = useState('');
  const [draggedFolder, setDraggedFolder] = useState('');
  const [folderOrder, setFolderOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tr-folder-order') || '[]'); } catch { return []; }
  });
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [fileName, setFileName] = useState(() => sessionStorage.getItem('tr-sync-filename') || '');
  const [loadedFiles, setLoadedFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState(() => sessionStorage.getItem('tr-sync-statusFilter') || 'ALL');
  const [selectedTags, setSelectedTags] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('tr-sync-selectedTags') || '[]'); } catch { return []; }
  });
  const [tagLogic, setTagLogic] = useState(() => sessionStorage.getItem('tr-sync-tagLogic') || 'OR');
  const [searchTerm, setSearchTerm] = useState(() => sessionStorage.getItem('tr-sync-searchTerm') || '');
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [expandedFolders, setExpandedFolders] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tr-sync-expandedFolders') || '[]'); } catch { return []; }
  });

  useEffect(() => { sessionStorage.setItem('tr-sync-selectedStateIds', JSON.stringify([...selectedStateIds])); }, [selectedStateIds]);
  useEffect(() => { sessionStorage.setItem('tr-sync-testcases', JSON.stringify(testCases)); }, [testCases]);
  useEffect(() => { sessionStorage.setItem('tr-sync-customFolders', JSON.stringify(customFolders)); }, [customFolders]);
  useEffect(() => { sessionStorage.setItem('tr-sync-filename', fileName); }, [fileName]);
  useEffect(() => { sessionStorage.setItem('tr-sync-statusFilter', statusFilter); }, [statusFilter]);
  useEffect(() => { sessionStorage.setItem('tr-sync-selectedTags', JSON.stringify(selectedTags)); }, [selectedTags]);
  useEffect(() => { sessionStorage.setItem('tr-sync-tagLogic', tagLogic); }, [tagLogic]);
  useEffect(() => { sessionStorage.setItem('tr-sync-searchTerm', searchTerm); }, [searchTerm]);
  useEffect(() => { localStorage.setItem('tr-sync-expandedFolders', JSON.stringify(expandedFolders)); }, [expandedFolders]);

  const handleToggleFolder = (e, folderName) => {
    e.stopPropagation();
    setExpandedFolders(prev =>
      prev.includes(folderName) ? prev.filter(f => f !== folderName) : [...prev, folderName]
    );
  };

  // Manual Test Case Modal
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [mId, setMId] = useState('');
  const [mTitle, setMTitle] = useState('');
  const [mTags, setMTags] = useState('');
  const [mStatus, setMStatus] = useState('PASSED');

  // Compare Modal
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareData, setCompareData] = useState(null);
  const [activeCompareTab, setActiveCompareTab] = useState('conflicts');
  const [compareFileName, setCompareFileName] = useState('');
  const [compareSource, setCompareSource] = useState('filtered');
  const [compareRemoteData, setCompareRemoteData] = useState(null);
  const [compareSearch, setCompareSearch] = useState('');

  // Sync Preview Modal
  const [syncPreviewOpen, setSyncPreviewOpen] = useState(false);

  // Live Run Compare
  const [isLiveFetching, setIsLiveFetching] = useState(false);

  // Missing Remote selection (for delete)
  const [missingTrSelected, setMissingTrSelected] = useState(new Set());

  // Send to Matrix
  const [sendToModalOpen, setSendToModalOpen] = useState(false);
  const [sendToDestId, setSendToDestId] = useState('');
  const [isSendingTo, setIsSendingTo] = useState(false);
  const [sendToSearch, setSendToSearch] = useState('');

  // Duplicates Modal
  const [duplicatesModalOpen, setDuplicatesModalOpen] = useState(false);

  // Sync Log
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [syncLogs, setSyncLogs] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Sync success animation
  const [syncSuccessAnim, setSyncSuccessAnim] = useState(null);
  const [syncAnimCounts, setSyncAnimCounts] = useState({ total: 0, PASSED: 0, FAILED: 0, BLOCKED: 0, UNTESTED: 0, RETEST: 0 });
  const syncAnimRef = useRef(null);

  useEffect(() => {
    if (syncAnimRef.current) {
      clearInterval(syncAnimRef.current.tick);
      clearTimeout(syncAnimRef.current.dismiss);
    }
    if (!syncSuccessAnim) {
      setSyncAnimCounts({ total: 0, PASSED: 0, FAILED: 0, BLOCKED: 0, UNTESTED: 0, RETEST: 0 });
      return;
    }
    let frame = 0;
    const FRAMES = 55;
    const t = syncSuccessAnim;
    const tick = setInterval(() => {
      frame++;
      const p = frame / FRAMES;
      const e = 1 - Math.pow(1 - p, 3);
      setSyncAnimCounts({
        total:    Math.round(t.total    * e),
        PASSED:   Math.round((t.PASSED   || 0) * e),
        FAILED:   Math.round((t.FAILED   || 0) * e),
        BLOCKED:  Math.round((t.BLOCKED  || 0) * e),
        UNTESTED: Math.round((t.UNTESTED || 0) * e),
        RETEST:   Math.round((t.RETEST   || 0) * e),
      });
      if (frame >= FRAMES) clearInterval(tick);
    }, 28);
    syncAnimRef.current = { tick };
    return () => { clearInterval(tick); };
  }, [syncSuccessAnim]);

  // Load credential defaults
  useEffect(() => {
    setRunId(localStorage.getItem('tr-run-id') || '');
    setUsername(localStorage.getItem('tr-username') || '');
    setPassword(localStorage.getItem('tr-password') || '');
    fetchSavedStates();
  }, []);

  const fetchSavedStates = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/matrices');
      if (response.ok) {
        const data = await response.json();
        const matrices = data.matrices || [];
        setStates(matrices);
        setGlobalTags(data.globalTags || []);
        // Auto-expand all folders so matrices are visible by default
        setExpandedFolders(prev => {
          if (matrices.length === 0) return prev;
          const allFolderNames = Array.from(new Set(matrices.map(m => m.folder || 'Uncategorized')));
          const missing = allFolderNames.filter(f => !prev.includes(f));
          if (missing.length === 0) return prev;
          const next = [...prev, ...missing];
          localStorage.setItem('tr-sync-expandedFolders', JSON.stringify(next));
          return next;
        });
      }
    } catch (e) {
      console.error("Failed to load saved states:", e);
    }
  };

  const handleSaveCredentials = () => {
    localStorage.setItem('tr-run-id', runId);
    localStorage.setItem('tr-username', username);
    localStorage.setItem('tr-password', password);
    addLog('API credentials saved locally.', 'success');
  };

  const addLog = (msg, type = 'info') => {
    setSyncLogs(prev => [{ id: Date.now(), msg, type }, ...prev]);
  };

  // CSV parsing logic
  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  };

  const parseSingleCSV = async (file) => {
    const text = await file.text();
    const lines = text.split(/[\r\n]+/);
    if (lines.length < 2) {
      addLog(`Empty or invalid CSV file: ${file.name}`, 'error');
      return [];
    }

    const headerCols = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());

    const idIdx      = headerCols.findIndex(h => h.includes('id') || h === 'test case');
    const titleIdx   = headerCols.findIndex(h => h.includes('title') || h === 'name');
    const tagsIdx    = headerCols.findIndex(h => h.includes('tag'));
    const notesIdx   = headerCols.findIndex(h => h === 'notes' || h.includes('note'));
    const statusIdx  = headerCols.findIndex(h => h === 'status' || h === 'test status' || h === 'automation status');
    const mappingIdx = headerCols.findIndex(h => h.includes('mapping') || h === 'map action');
    const syncIdx    = headerCols.findIndex(h => h.includes('sync status'));
    const reasonIdx  = headerCols.findIndex(h => h.includes('reason'));

    const parsedCases = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = parseCSVLine(line);
      if (cols.length < 1) continue;

      const col = (idx) => (idx !== -1 && cols[idx] !== undefined) ? cols[idx] : '';

      const rawId      = col(idIdx);
      const title      = col(titleIdx);
      const tags       = col(tagsIdx);
      const notes      = col(notesIdx);
      const status     = statusIdx !== -1 && col(statusIdx) ? col(statusIdx).toUpperCase() : 'UNTESTED';
      const syncStatus = col(syncIdx) || 'Unsynced';
      const reason     = col(reasonIdx);
      const mappingRaw = col(mappingIdx);

      const ids = rawId.split(';').map(id => id.trim()).filter(id => id);

      if (ids.length === 0) {
        parsedCases.push({ id: '', title, tags, notes, status, mapAction: mappingRaw || "Don't Map", syncStatus, reason });
      } else {
        ids.forEach(id => {
          parsedCases.push({ id, title, tags, notes, status, mapAction: mappingRaw || 'Map', syncStatus, reason });
        });
      }
    }

    return parsedCases;
  };

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    addLog(`Loading ${fileArray.length} CSV file${fileArray.length > 1 ? 's' : ''}...`, 'info');

    const allParsed = [];
    const fileInfos = [];

    for (const file of fileArray) {
      const cases = await parseSingleCSV(file);
      allParsed.push(...cases);
      fileInfos.push({ name: file.name, count: cases.length });
      addLog(`  • ${file.name}: ${cases.length} cases`, 'info');
    }

    setTestCases(allParsed.map((tc, idx) => ({ ...tc, _uid: Date.now() + '_' + idx })));
    setLoadedFiles(fileInfos);
    setFileName(fileArray.map(f => f.name).join(', '));
    addLog(`Merged ${allParsed.length} total test cases from ${fileArray.length} file${fileArray.length > 1 ? 's' : ''}.`, 'success');
  };

  // Drag-and-drop triggers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  // State controls
  const handleSaveState = async () => {
    if (!saveName.trim()) return showAlert("Please enter a matrix state name.");
    if (testCases.length === 0) return showAlert("No test cases loaded to save.");

    try {
      const response = await fetch('http://localhost:3000/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: saveName, folder: saveFolder, testCases })
      });

      if (response.ok) {
        addLog(`Saved matrix state as "${saveName}" in folder "${saveFolder || 'Uncategorized'}".`, 'success');
        setSaveName('');
        setSaveFolder('');
        fetchSavedStates();
      } else {
        addLog('Failed to save matrix state.', 'error');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoadState = async (id) => {
    try {
      const response = await fetch(`http://localhost:3000/api/matrix/${id}`);
      if (response.ok) {
        const data = await response.json();
        const newCases = (data.testCases || []).map((tc, idx) => ({ ...tc, _uid: Date.now() + '_' + idx }));
        setTestCases(newCases);
        setFileName(`Loaded State: ${data.name}`);
        addLog(`Loaded state matrix "${data.name}" with ${data.testCases?.length || 0} cases.`, 'success');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoadMultipleStates = async () => {
    if (selectedStateIds.size === 0) return;
    const allCases = [];
    const names = [];
    for (let id of selectedStateIds) {
      try {
        const response = await fetch(`http://localhost:3000/api/matrix/${id}`);
        if (response.ok) {
          const data = await response.json();
          allCases.push(...(data.testCases || []));
          names.push(data.name);
        }
      } catch (e) { console.error(e); }
    }
    const newCases = allCases.map((tc, idx) => ({ ...tc, _uid: Date.now() + '_' + idx }));
    setTestCases(newCases);
    setLoadedFiles([]);
    setFileName(`Merged: ${names.join(', ')}`);
    addLog(`Merged ${newCases.length} test cases from ${names.length} state${names.length > 1 ? 's' : ''}: ${names.join(', ')}.`, 'success');
    setSelectedStateIds(new Set());
  };

  const handleDropToFolder = async (folderName, stateId) => {
    try {
      await fetch(`http://localhost:3000/api/matrix/${stateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: folderName })
      });
      fetchSavedStates();
      addLog(`Moved state to folder "${folderName}".`, 'success');
    } catch (e) { console.error(e); }
  };

  const handleRenameState = async (state, e) => {
    e.stopPropagation();
    const newName = await showPrompt("Enter new name for the matrix:", state.name);
    if (!newName || newName.trim() === '' || newName === state.name) return;
    try {
      await fetch(`http://localhost:3000/api/matrix/${state.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() })
      });
      fetchSavedStates();
      addLog(`Renamed state to "${newName}".`, 'success');
    } catch (e) { console.error(e); }
  };

  const handleUpdateState = async (state, e) => {
    e.stopPropagation();
    if (testCases.length === 0) {
      showAlert("No test cases currently loaded to update with.");
      return;
    }
    if (!(await showConfirm(`Update matrix "${state.name}" with the ${testCases.length} currently loaded test cases?`))) return;
    try {
      await fetch(`http://localhost:3000/api/matrix/${state.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testCases })
      });
      fetchSavedStates();
      addLog(`Updated matrix "${state.name}" with current test cases.`, 'success');
    } catch (e) { console.error(e); }
  };

  const handleDeleteState = async (id, e) => {
    e.stopPropagation();
    if (!(await showConfirm("Permanently delete this saved state?"))) return;
    try {
      const response = await fetch(`http://localhost:3000/api/matrix/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        addLog('State matrix deleted.', 'success');
        fetchSavedStates();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handlePinState = (id, e) => {
    e.stopPropagation();
    if (pinnedStateId === id) {
      setPinnedStateId('');
      localStorage.removeItem('tr-sync-pinned');
    } else {
      setPinnedStateId(id);
      localStorage.setItem('tr-sync-pinned', id);
    }
  };

  // Sync test execution results to TestRail proxy API — operates on filtered cases only
  const handleStartSync = async () => {
    if (!runId || !username || !password) {
      alert("Missing TestRail credentials or Run ID.");
      return;
    }

    const toSync = filteredCases.filter(tc => tc.mapAction === 'Map' && tc.id);

    const payload = toSync.map(tc => {
      let status_id = 5;
      const s = (tc.status || '').toUpperCase();
      if (s === 'PASSED') status_id = 1;
      else if (s === 'BLOCKED') status_id = 2;
      else if (s === 'UNTESTED') status_id = 3;
      else if (s === 'RETEST') status_id = 4;
      else if (s === 'FAILED') status_id = 5;
      return {
        case_id: parseInt(tc.id.replace(/\D/g, '')),
        status_id,
        comment: tc.notes || 'Synced live from Zoro Portal.'
      };
    });

    if (payload.length === 0) {
      showAlert("No test cases marked as 'Map' with valid IDs in the current view.");
      return;
    }

    setSyncPreviewOpen(false);
    setIsSyncing(true);
    const filterDesc = filterActive
      ? ` [filtered: ${statusFilter !== 'ALL' ? statusFilter : ''}${selectedTags.length > 0 ? ` tags:${selectedTags.join('+')}` : ''}${searchTerm ? ` search:"${searchTerm}"` : ''}]`
      : '';
    addLog(`Initiating sync on Run ID: ${runId} — ${payload.length} cases${filterDesc}`, 'info');

    try {
      const response = await fetch('http://localhost:3000/api/testrail/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, auth: btoa(`${username}:${password}`), payload })
      });

      if (response.ok) {
        addLog(`Synchronized ${payload.length} test cases onto TestRail!`, 'success');
        const syncedUids = new Set(toSync.map(tc => tc._uid));
        setTestCases(prev => prev.map(tc => syncedUids.has(tc._uid) ? { ...tc, syncStatus: 'Synced' } : tc));
        const byStatus = { PASSED: 0, FAILED: 0, BLOCKED: 0, UNTESTED: 0, RETEST: 0 };
        toSync.forEach(tc => { const k = (tc.status || 'UNTESTED').toUpperCase(); if (k in byStatus) byStatus[k]++; });
        setSyncSuccessAnim({ total: payload.length, ...byStatus, runId, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
      } else {
        const err = await response.text();
        addLog(`Sync rejected: ${err}`, 'error');
      }
    } catch (e) {
      addLog(`Network failed to reach local proxy: ${e.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddManualTestCase = (e) => {
    e.preventDefault();
    if (!mTitle.trim()) return;

    const newCase = {
      id: mId || `M_${Date.now().toString().slice(-4)}`,
      title: mTitle,
      tags: mTags,
      notes: '',
      status: mStatus,
      mapAction: mId ? 'Map' : 'Don\'t Map',
      syncStatus: 'Unsynced',
      reason: '',
      _uid: Date.now() + '_' + Math.random().toString(36).substr(2, 5)
    };

    setTestCases([...testCases, newCase]);
    setManualModalOpen(false);
    setMId('');
    setMTitle('');
    setMTags('');
    addLog(`Added manual test case "${mTitle}".`, 'success');
  };

  const handleBulkAddTags = () => {
    if (!bulkTagInput.trim() || selectedCaseUids.length === 0) return;
    const newTags = bulkTagInput.split(',').map(t => t.trim()).filter(Boolean);
    const updated = testCases.map(tc => {
      if (selectedCaseUids.includes(tc._uid)) {
        const existingTags = tc.tags ? tc.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        const merged = Array.from(new Set([...existingTags, ...newTags])).join(', ');
        return { ...tc, tags: merged };
      }
      return tc;
    });
    setTestCases(updated);
    setBulkTagInput('');
    addLog(`Added tags to ${selectedCaseUids.length} selected cases.`, 'info');
  };

  const handleDeleteSelected = async () => {
    if (selectedCaseUids.length === 0) return;
    if (!(await showConfirm(`Delete ${selectedCaseUids.length} selected cases?`))) return;
    const filtered = testCases.filter(tc => !selectedCaseUids.includes(tc._uid));
    setTestCases(filtered);
    setSelectedCaseUids([]);
    addLog(`Deleted ${selectedCaseUids.length} test cases.`, 'info');
  };

  // Compare file logic
  const runComparison = (localCases, remoteArray) => {
    const trCases = new Map(remoteArray.map(r => [r.id, { title: r.title, status: r.status }]));
    const strictConflicts = [], needsSync = [], missingTr = [], matched = [];

    localCases.forEach(tc => {
      const numId = (tc.id || '').replace(/\D/g, '');
      if (!numId) return;
      if (trCases.has(numId)) {
        const trVal = trCases.get(numId);
        if (tc.status !== trVal.status) {
          strictConflicts.push({ id: numId, title: tc.title, local: tc.status, remote: trVal.status, _uid: tc._uid });
        } else {
          matched.push({ id: numId, title: tc.title, status: tc.status, _uid: tc._uid });
        }
      } else {
        missingTr.push({ id: numId, title: tc.title, status: tc.status, _uid: tc._uid });
      }
    });

    trCases.forEach((val, id) => {
      if (!localCases.some(tc => (tc.id || '').replace(/\D/g, '') === id)) {
        needsSync.push({ id, title: val.title, status: val.status });
      }
    });

    return { strictConflicts, needsSync, missingTr, matched };
  };

  const handleCompareFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split(/[\r\n]+/);
    if (lines.length < 2) return;

    addLog(`Comparing against ${file.name}...`, 'info');

    const headerCols = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const idIdx     = headerCols.findIndex(h => h.includes('id') || h === 'test case');
    const statusIdx = headerCols.findIndex(h => h.includes('status'));
    const titleIdx  = headerCols.findIndex(h => h.includes('title') || h === 'name');

    if (idIdx === -1 || statusIdx === -1) {
      showAlert("Compare CSV is missing Case ID or Status headers.");
      return;
    }

    const remoteArray = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (cols.length <= idIdx || cols.length <= statusIdx) continue;
      const numId = cols[idIdx].replace(/\D/g, '');
      if (numId) {
        remoteArray.push({
          id: numId,
          title: (titleIdx !== -1 ? cols[titleIdx] : cols[1]) || '',
          status: cols[statusIdx].toUpperCase()
        });
      }
    }

    setCompareFileName(file.name);
    setCompareRemoteData(remoteArray);
    const localCases = compareSource === 'filtered' ? filteredCases : testCases;
    const result = runComparison(localCases, remoteArray);
    setCompareData(result);
    setActiveCompareTab(result.strictConflicts.length > 0 ? 'conflicts' : result.needsSync.length > 0 ? 'needsSync' : 'matched');
    setCompareSearch('');
    setCompareModalOpen(true);
    e.target.value = '';
  };

  const handleCompareSourceChange = (newSource) => {
    setCompareSource(newSource);
    setMissingTrSelected(new Set());
    if (compareRemoteData) {
      const localCases = newSource === 'filtered' ? filteredCases : testCases;
      const result = runComparison(localCases, compareRemoteData);
      setCompareData(result);
    }
  };

  const handleDeleteMissingFromLocal = (uids) => {
    const uidSet = new Set(uids);
    setTestCases(prev => prev.filter(tc => !uidSet.has(tc._uid)));
    setCompareData(prev => ({
      ...prev,
      missingTr: prev.missingTr.filter(c => !uidSet.has(c._uid))
    }));
    setMissingTrSelected(new Set());
    addLog(`Deleted ${uids.length} local-only case(s) from matrix.`, 'info');
  };

  const handleSendToMatrix = async () => {
    if (!sendToDestId) return;
    const dest = states.find(s => s.id === sendToDestId);
    if (!dest) return;

    setIsSendingTo(true);
    try {
      const res = await fetch(`http://localhost:3000/api/matrix/${sendToDestId}`);
      if (!res.ok) throw new Error('Failed to load destination matrix');
      const data = await res.json();
      const existingCases = data.testCases || [];
      const existingIds = new Set(
        existingCases.map(tc => (tc.id || '').replace(/\D/g, '')).filter(Boolean)
      );

      const casesToSend = testCases.filter(tc => selectedCaseUids.includes(tc._uid));
      const toAdd = casesToSend.filter(tc => {
        const numId = (tc.id || '').replace(/\D/g, '');
        return numId && !existingIds.has(numId);
      });
      const skipped = casesToSend.length - toAdd.length;

      const withNewUids = toAdd.map((tc, i) => ({
        ...tc,
        _uid: `sent_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`
      }));

      const saveRes = await fetch(`http://localhost:3000/api/matrix/${sendToDestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testCases: [...existingCases, ...withNewUids] })
      });
      if (!saveRes.ok) throw new Error('Failed to save destination matrix');

      const skipNote = skipped > 0 ? ` (${skipped} duplicate ID${skipped > 1 ? 's' : ''} skipped)` : '';
      addLog(`Sent ${toAdd.length} case(s) to "${dest.name}"${skipNote}.`, 'success');
      fetchSavedStates();
      setSendToModalOpen(false);
      setSendToDestId('');
      setSelectedCaseUids([]);
    } catch (e) {
      showAlert(`Send failed: ${e.message}`);
    } finally {
      setIsSendingTo(false);
    }
  };

  const handleLiveRunCompare = async () => {
    if (!runId) { showAlert('Please enter a TestRail Run ID first.'); return; }
    if (!username || !password) { showAlert('Please enter TestRail credentials first.'); return; }
    if (testCases.length === 0) { showAlert('Load a matrix first before comparing.'); return; }

    setIsLiveFetching(true);
    addLog(`Fetching tests from TestRail Run #${runId}…`, 'info');

    try {
      const auth = btoa(`${username}:${password}`);
      const response = await fetch('http://localhost:3000/api/testrail/fetch-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, auth })
      });

      const data = await response.json();
      if (!response.ok) {
        showAlert(`TestRail API error: ${data.error || response.statusText}`);
        addLog(`Live compare failed: ${data.error}`, 'error');
        return;
      }

      const remoteArray = data.tests || [];
      addLog(`Fetched ${data.total} tests from Run #${runId}. Running comparison…`, 'success');

      setCompareFileName(`TestRail Run #${runId} (live)`);
      setCompareRemoteData(remoteArray);
      const localCases = compareSource === 'filtered' ? filteredCases : testCases;
      const result = runComparison(localCases, remoteArray);
      setCompareData(result);
      setActiveCompareTab(result.strictConflicts.length > 0 ? 'conflicts' : result.needsSync.length > 0 ? 'needsSync' : 'matched');
      setCompareSearch('');
      setCompareModalOpen(true);
    } catch (err) {
      showAlert(`Network error: ${err.message}`);
      addLog(`Live compare error: ${err.message}`, 'error');
    } finally {
      setIsLiveFetching(false);
    }
  };

  const handleApplyRemoteStatus = (caseId, remoteStatus) => {
    setTestCases(prev => prev.map(tc =>
      (tc.id || '').replace(/\D/g, '') === caseId ? { ...tc, status: remoteStatus } : tc
    ));
    setCompareData(prev => {
      const conflict = prev.strictConflicts.find(c => c.id === caseId);
      return {
        ...prev,
        strictConflicts: prev.strictConflicts.filter(c => c.id !== caseId),
        matched: conflict ? [...prev.matched, { id: caseId, title: conflict.title, status: remoteStatus }] : prev.matched
      };
    });
    addLog(`Applied remote status "${remoteStatus}" to case C${caseId}.`, 'success');
  };

  const handleAddToLocalFromRemote = (remoteCase) => {
    const newCase = {
      id: `C${remoteCase.id}`,
      title: remoteCase.title,
      tags: '', notes: '', status: remoteCase.status,
      mapAction: 'Map', syncStatus: 'Unsynced', reason: '',
      _uid: Date.now() + '_' + Math.random().toString(36).substr(2, 5)
    };
    setTestCases(prev => [...prev, newCase]);
    setCompareData(prev => ({ ...prev, needsSync: prev.needsSync.filter(c => c.id !== remoteCase.id) }));
    addLog(`Added C${remoteCase.id} from remote to local matrix.`, 'success');
  };

  const exportComparisonCSV = () => {
    if (!compareData) return;
    const q = v => `"${(v || '').replace(/"/g, '""')}"`;
    const rows = [
      ['Category', 'Case ID', 'Title', 'Local Status', 'Remote Status'],
      ...compareData.matched.map(c => ['Matched', c.id, q(c.title), c.status, c.status]),
      ...compareData.strictConflicts.map(c => ['Conflict', c.id, q(c.title), c.local, c.remote]),
      ...compareData.needsSync.map(c => ['Needs Sync', c.id, q(c.title), '', c.status]),
      ...compareData.missingTr.map(c => ['Missing Remote', c.id, q(c.title), c.status, '']),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `comparison-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    addLog('Exported comparison report as CSV.', 'success');
  };

  // Global totals (unfiltered) — used for progress bar only
  const totalCases = testCases.length;
  const mappedPct = totalCases > 0 ? Math.round((testCases.filter(t => t.mapAction === 'Map').length / totalCases) * 100) : 0;

  // Duplicate test ID detection
  const idFrequency = {};
  testCases.forEach(tc => {
    if (tc.id && tc.id.trim()) {
      idFrequency[tc.id] = (idFrequency[tc.id] || 0) + 1;
    }
  });
  const duplicateIds = new Set(Object.keys(idFrequency).filter(id => idFrequency[id] > 1));
  const hasDuplicates = duplicateIds.size > 0;
  const duplicateGroups = Object.entries(idFrequency)
    .filter(([, count]) => count > 1)
    .map(([id]) => ({ id, cases: testCases.filter(tc => tc.id === id) }));

  // Tag pill list always comes from ALL cases so filters don't hide tags
  const availableTags = Array.from(new Set(testCases.flatMap(tc => tc.tags ? tc.tags.split(',').map(t => t.trim()).filter(Boolean) : []))).sort();

  // Build filtered list first — all derived stats come from this
  const filteredCases = testCases.filter(tc => {
    if (statusFilter !== 'ALL' && tc.status !== statusFilter) return false;
    if (selectedTags.length > 0) {
      const tcTags = tc.tags ? tc.tags.split(',').map(t => t.trim()) : [];
      if (tagLogic === 'OR') {
        if (!selectedTags.some(t => tcTags.includes(t))) return false;
      } else {
        if (!selectedTags.every(t => tcTags.includes(t))) return false;
      }
    }
    if (searchTerm && !tc.title.toLowerCase().includes(searchTerm.toLowerCase()) && !tc.id.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Optionally sort the visible list
  const sortedFilteredCases = sortCol ? [...filteredCases].sort((a, b) => {
    let va = (a[sortCol] || '').toString().toLowerCase();
    let vb = (b[sortCol] || '').toString().toLowerCase();
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  }) : filteredCases;

  const filterActive = statusFilter !== 'ALL' || selectedTags.length > 0 || searchTerm.trim() !== '';

  // Live counts derived from FILTERED (visible) cases
  const fTotal = filteredCases.length;
  const fPassed  = filteredCases.filter(t => t.status === 'PASSED').length;
  const fFailed  = filteredCases.filter(t => t.status === 'FAILED').length;
  const fBlocked = filteredCases.filter(t => t.status === 'BLOCKED').length;
  const fUntested = filteredCases.filter(t => t.status === 'UNTESTED').length;
  const fMapped  = filteredCases.filter(t => t.mapAction === 'Map').length;
  const fUnmapped = filteredCases.filter(t => t.mapAction === "Don't Map").length;

  // Legacy aliases used in the report modal
  const passedCases  = fPassed;
  const failedCases  = fFailed;
  const mappedCases  = fMapped;
  const unmappedCases = fUnmapped;

  // Tag stats from FILTERED cases so sidebar updates with the table
  const tagStats = {};
  filteredCases.forEach(tc => {
    if (tc.tags) {
      tc.tags.split(',').map(t => t.trim()).filter(Boolean).forEach(tag => {
        if (!tagStats[tag]) tagStats[tag] = { passed: 0, failed: 0, blocked: 0, untested: 0, total: 0 };
        tagStats[tag].total++;
        if (tc.status === 'PASSED')   tagStats[tag].passed++;
        if (tc.status === 'FAILED')   tagStats[tag].failed++;
        if (tc.status === 'BLOCKED')  tagStats[tag].blocked++;
        if (tc.status === 'UNTESTED') tagStats[tag].untested++;
      });
    }
  });
  const tagList = Object.entries(tagStats).sort((a, b) => b[1].total - a[1].total);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const clearFilters = () => {
    setStatusFilter('ALL');
    setSelectedTags([]);
    setSearchTerm('');
  };

  const downloadTemplate = () => {
    const header = 'ID,Title,Tags,Status,Mapping,Notes,Sync Status,Reason';
    const example = 'C12345,"Verify login with valid credentials","regression,smoke",PASSED,Map,"Passes on Chrome",Unsynced,""';
    const blob = new Blob([header + '\n' + example], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'synchub-template.csv'; a.click();
    URL.revokeObjectURL(url);
    addLog('Downloaded CSV template.', 'success');
  };

  const exportFilteredCSV = () => {
    // Canonical format: ID,Title,Tags,Status,Mapping,Notes,Sync Status,Reason
    const headers = ['ID', 'Title', 'Tags', 'Status', 'Mapping', 'Notes', 'Sync Status', 'Reason'];
    const q = (v) => `"${(v || '').replace(/"/g, '""')}"`;
    const rows = sortedFilteredCases.map(tc => [
      tc.id || '',
      q(tc.title),
      q(tc.tags),
      tc.status || '',
      tc.mapAction || '',
      q(tc.notes),
      tc.syncStatus || '',
      q(tc.reason)
    ].join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synchub-${filterActive ? 'filtered-' : ''}${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addLog(`Exported ${sortedFilteredCases.length} cases to CSV.`, 'success');
  };

  const handleBulkStatusChange = (newStatus) => {
    setTestCases(testCases.map(tc =>
      selectedCaseUids.includes(tc._uid) ? { ...tc, status: newStatus } : tc
    ));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: '800', marginBottom: '4px' }}>
            Sync <span className="gradient-text">Hub</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>Map cypress run reports into TestRail results automatically.</p>
        </div>

        <button
          onClick={() => setSyncPreviewOpen(true)}
          data-cy="start-sync-btn"
          disabled={isSyncing || filteredCases.length === 0}
          className="glow-btn"
          style={{
            background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))',
            boxShadow: '0 4px 15px var(--glow-purple)'
          }}
        >
          {isSyncing ? (
            <>
              <div className="spinner" style={{ width: '14px', height: '14px', marginRight: '6px' }} />
              Syncing...
            </>
          ) : (
            <>
              <Play size={16} />
              Start TestRail Sync
            </>
          )}
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '0.9fr 3.1fr 1.1fr',
        gap: '24px',
        alignItems: 'start'
      }}>

        {/* Left Column: API parameters & saved states */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: 0 }}>

          {/* Credentials Card */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '12px' }}>TestRail Credentials</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Run ID</label>
                  <input
                    type="text"
                    data-cy="run-id-input"
                    value={runId}
                    onChange={(e) => setRunId(e.target.value)}
                    placeholder="e.g. 8181"
                    style={{
                      width: '100%', minWidth: 0,
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      outline: 'none',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ flex: 1.5, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Username</label>
                  <input
                    type="email"
                    data-cy="username-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="zoro@dev.com"
                    style={{
                      width: '100%', minWidth: 0,
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      outline: 'none',
                      fontSize: '0.85rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>API Key / Secret</label>
                <input
                  type="password"
                  data-cy="password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%', minWidth: 0, boxSizing: 'border-box',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    outline: 'none',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <button
                onClick={handleSaveCredentials}
                data-cy="save-credentials-btn"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  borderRadius: '8px',
                  padding: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.8rem',
                  marginTop: '4px'
                }}
              >
              </button>
            </div>
          </div>

          {/* Uploader Zone */}
          <div className="glass-panel" style={{ padding: '16px' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>CSV Upload</span>
              <button onClick={downloadTemplate} title="Download CSV template" style={{ fontSize: '0.7rem', color: 'var(--accent-purple)', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}>📥 Template</button>
            </h3>
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              style={{
                border: `1.5px dashed ${dragActive ? 'var(--accent-purple)' : 'var(--border-color)'}`,
                borderRadius: '8px',
                padding: '12px',
                background: dragActive ? 'rgba(168,85,247,0.05)' : 'rgba(255,255,255,0.01)',
                cursor: 'pointer',
                position: 'relative',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px'
              }}
            >
              <input
                type="file"
                data-cy="file-upload-input"
                accept=".csv"
                multiple
                onChange={(e) => handleFileUpload(e.target.files)}
                style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0, cursor: 'pointer' }}
              />
              <Upload size={18} style={{ color: 'var(--accent-purple)' }} />
              <div style={{ textAlign: 'left' }}>
                <h4 style={{ fontWeight: 'bold', fontSize: '0.8rem', margin: 0 }}>Drop CSV(s) Here</h4>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0 }}>Select one or multiple files to merge</p>
              </div>
            </div>

            <button onClick={() => { setTestCases([]); setLoadedFiles([]); setFileName(''); }} data-cy="start-empty-state-btn" style={{ width: '100%', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px', fontSize: '0.75rem', color: 'var(--text-primary)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.2s ease' }} onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.target.style.background = 'transparent'}>
              📝 Start Empty State
            </button>
            {loadedFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px', maxHeight: '130px', overflowY: 'auto' }}>
                {loadedFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '6px', padding: '4px 8px' }}>
                    <span style={{ fontSize: '0.7rem', color: '#10b981', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>📄 {f.name}</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '6px', flexShrink: 0 }}>{f.count} cases</span>
                  </div>
                ))}
                {loadedFiles.length > 1 && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', paddingTop: '2px' }}>
                    {loadedFiles.reduce((s, f) => s + f.count, 0)} total merged
                  </div>
                )}
              </div>
            )}
            {!loadedFiles.length && fileName && (
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '6px', padding: '4px', fontSize: '0.7rem', marginTop: '8px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📄 {fileName}
              </div>
            )}
          </div>
          {/* Saved States Card */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', overflow: 'hidden' }}>
            {/* Background embellishment */}
            <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.2), rgba(236,72,153,0.2))', padding: '8px', borderRadius: '8px' }}>
                <Database size={18} style={{ color: 'var(--accent-purple)' }} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800', letterSpacing: '0.5px' }}>Saved Matrix Vault</h3>
            </div>

            {/* Action Bar (Save & New Folder) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>

              {/* Save State */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  data-cy="save-state-name-input"
                  placeholder="Save current state as..."
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  style={{
                    width: '100%', minWidth: 0, boxSizing: 'border-box',
                    background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                    padding: '9px 12px', borderRadius: '8px', outline: 'none', fontSize: '0.82rem', transition: 'border-color 0.2s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--accent-purple)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    <Folder style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={13} />
                    <input
                      type="text"
                      data-cy="save-state-folder-input"
                      placeholder="Folder..."
                      value={saveFolder}
                      onChange={(e) => setSaveFolder(e.target.value)}
                      style={{
                        width: '100%', minWidth: 0, boxSizing: 'border-box',
                        background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                        padding: '9px 8px 9px 26px', borderRadius: '8px', outline: 'none', fontSize: '0.82rem', transition: 'border-color 0.2s ease'
                      }}
                      onFocus={(e) => e.target.style.borderColor = 'var(--accent-purple)'}
                      onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                    />
                  </div>
                  <button
                    onClick={handleSaveState}
                    data-cy="save-state-btn"
                    className="glow-btn"
                    style={{
                      background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))',
                      border: 'none', color: '#fff', borderRadius: '8px', padding: '0 14px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 'bold',
                      display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0
                    }}
                  >
                    <Save size={14} /> Save
                  </button>
                </div>
              </div>

              {/* Add Folder */}
              <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                <div style={{ position: 'relative', flexGrow: 1, minWidth: 0 }}>
                  <FolderPlus style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={14} />
                  <input
                    type="text"
                    data-cy="add-folder-input"
                    placeholder="Create new folder..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    style={{
                      width: '100%', minWidth: 0, boxSizing: 'border-box',
                      background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border-color)', color: 'var(--text-primary)',
                      padding: '8px 10px 8px 30px', borderRadius: '8px', outline: 'none', fontSize: '0.8rem', transition: 'all 0.2s ease'
                    }}
                    onFocus={(e) => { e.target.style.borderColor = 'var(--accent-purple)'; e.target.style.background = 'var(--bg-tertiary)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'var(--border-color)'; e.target.style.background = 'rgba(255,255,255,0.03)'; }}
                  />
                </div>
                <button
                  onClick={() => {
                    if (newFolderName && !customFolders.includes(newFolderName)) setCustomFolders([...customFolders, newFolderName]);
                    setNewFolderName('');
                  }}
                  data-cy="add-folder-btn"
                  style={{
                    background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                    borderRadius: '8px', padding: '0 12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => { e.target.style.background = 'rgba(255,255,255,0.1)'; e.target.style.borderColor = 'var(--text-muted)'; }}
                  onMouseOut={(e) => { e.target.style.background = 'transparent'; e.target.style.borderColor = 'var(--border-color)'; }}
                >
                  Add Folder
                </button>
              </div>
            </div>

            {selectedStateIds.size > 0 && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={handleLoadMultipleStates}
                  className="glow-btn"
                  style={{
                    flexGrow: 1, background: 'rgba(168,85,247,0.15)', border: '1px solid var(--accent-purple)', color: 'var(--accent-purple)',
                    borderRadius: '8px', padding: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s ease, color 0.2s ease'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = 'var(--accent-purple)'; e.currentTarget.style.color = '#fff'; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(168,85,247,0.15)'; e.currentTarget.style.color = 'var(--accent-purple)'; }}
                >
                  <Database size={16} /> Merge &amp; Load ({selectedStateIds.size})
                </button>
                <button
                  onClick={() => setSelectedStateIds(new Set())}
                  title="Clear selection"
                  style={{
                    background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)',
                    borderRadius: '8px', padding: '0 12px', cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0,
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--accent-red)'; e.currentTarget.style.color = 'var(--accent-red)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Folder List */}
            <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '8px' }}>
              {(() => {
                const allFolders = Array.from(new Set([...customFolders, ...states.map(s => s.folder || 'Uncategorized')]));
                const sortedFolders = [...allFolders].sort((a, b) => {
                  let idxA = folderOrder.indexOf(a);
                  let idxB = folderOrder.indexOf(b);
                  if (idxA === -1) idxA = Infinity;
                  if (idxB === -1) idxB = Infinity;
                  if (idxA === idxB) return a.localeCompare(b);
                  return idxA - idxB;
                });
                return sortedFolders;
              })().map(folderName => {
                const folderStates = states.filter(s => (s.folder || 'Uncategorized') === folderName);
                if (folderStates.length === 0 && !customFolders.includes(folderName)) return null;

                const isExpanded = expandedFolders.includes(folderName);

                const allFolderSelected = folderStates.length > 0 && folderStates.every(s => selectedStateIds.has(s.id));
                const someFolderSelected = folderStates.some(s => selectedStateIds.has(s.id));

                return (
                  <div key={folderName} style={{ display: 'flex', flexDirection: 'column' }}>
                    <div
                      draggable
                      onDragStart={(e) => {
                        if (draggedStateId) return;
                        e.stopPropagation();
                        e.dataTransfer.setData('text/plain', folderName);
                        setDraggedFolder(folderName);
                      }}
                      onDragEnd={() => setDraggedFolder('')}
                      onClick={(e) => handleToggleFolder(e, folderName)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'transparent',
                        borderRadius: '8px', cursor: 'pointer',
                        color: 'var(--text-secondary)', fontWeight: '700',
                        marginBottom: '2px', transition: 'all 0.1s ease',
                        borderLeft: '3px solid transparent'
                      }}
                      className="nav-item-hover folder-drop-zone"
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.background = 'rgba(59,130,246,0.2)'; e.currentTarget.style.borderLeft = '3px solid #3b82f6'; }}
                      onDragLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderLeft = '3px solid transparent'; }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderLeft = '3px solid transparent';

                        if (draggedStateId) {
                          handleDropToFolder(folderName, draggedStateId);
                          setDraggedStateId('');
                        } else if (draggedFolder && draggedFolder !== folderName) {
                          const allF = Array.from(new Set([...customFolders, ...states.map(s => s.folder || 'Uncategorized')]));
                          const newOrder = [...allF].sort((a, b) => {
                            let idxA = folderOrder.indexOf(a);
                            let idxB = folderOrder.indexOf(b);
                            if (idxA === -1) idxA = Infinity;
                            if (idxB === -1) idxB = Infinity;
                            if (idxA === idxB) return a.localeCompare(b);
                            return idxA - idxB;
                          });

                          const fromIdx = newOrder.indexOf(draggedFolder);
                          const toIdx = newOrder.indexOf(folderName);
                          if (fromIdx !== -1 && toIdx !== -1) {
                            newOrder.splice(fromIdx, 1);
                            newOrder.splice(toIdx, 0, draggedFolder);
                            setFolderOrder(newOrder);
                            localStorage.setItem('tr-folder-order', JSON.stringify(newOrder));
                          }
                          setDraggedFolder('');
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexGrow: 1, overflow: 'hidden' }}>
                        <GripVertical size={12} className="vault-grip" style={{ cursor: 'grab' }} />
                        {folderStates.length > 0 && (
                          <input
                            type="checkbox"
                            checked={allFolderSelected}
                            ref={(el) => { if (el) el.indeterminate = someFolderSelected && !allFolderSelected; }}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              const newSet = new Set(selectedStateIds);
                              if (allFolderSelected) {
                                folderStates.forEach(s => newSet.delete(s.id));
                              } else {
                                folderStates.forEach(s => newSet.add(s.id));
                              }
                              setSelectedStateIds(newSet);
                            }}
                            style={{ cursor: 'pointer', accentColor: 'var(--accent-purple)', flexShrink: 0 }}
                          />
                        )}
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {isExpanded ? <ChevronDown size={14} style={{ color: 'var(--accent-purple)' }} /> : <ChevronRight size={14} />}
                          {isExpanded ? <FolderOpen size={14} style={{ color: 'var(--accent-purple)', marginLeft: '4px' }} /> : <Folder size={14} style={{ marginLeft: '4px' }} />}
                        </div>
                        <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', userSelect: 'none', minWidth: 0 }}>
                          {folderName.toUpperCase()}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          {folderStates.length}
                        </span>
                      </div>
                    </div>

                    {/* Children Items */}
                    {isExpanded && (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {folderStates.length === 0 && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0', paddingLeft: '32px' }}>
                            Empty Folder
                          </div>
                        )}
                        {folderStates.map(state => {
                          const isPinned = pinnedStateId === state.id;
                          const isSelected = selectedStateIds.has(state.id);
                          return (
                            <div
                              key={state.id}
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation();
                                e.dataTransfer.setData('text/plain', state.id);
                                setDraggedStateId(state.id);
                              }}
                              onDragEnd={(e) => {
                                e.stopPropagation();
                                setDraggedStateId('');
                              }}
                              onClick={(e) => {
                                // if ctrl or shift are pressed, handle multi select. otherwise load
                                if (e.ctrlKey || e.metaKey) {
                                  const newSet = new Set(selectedStateIds);
                                  if (newSet.has(state.id)) newSet.delete(state.id);
                                  else newSet.add(state.id);
                                  setSelectedStateIds(newSet);
                                } else {
                                  handleLoadState(state.id);
                                }
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '8px 12px', paddingLeft: '32px',
                                background: isSelected ? 'linear-gradient(90deg, rgba(168,85,247,0.15), rgba(236,72,153,0.05))' : 'transparent',
                                borderRadius: '8px', cursor: 'pointer',
                                borderLeft: isSelected ? '3px solid var(--accent-purple)' : (isPinned ? '3px solid var(--accent-pink)' : '3px solid transparent'),
                                color: isSelected ? '#fff' : 'var(--text-secondary)',
                                fontWeight: isSelected ? '700' : '500',
                                marginBottom: '2px', transition: 'all 0.1s ease',
                                opacity: draggedStateId === state.id ? 0.4 : 1
                              }}
                              className="nav-item-hover"
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexGrow: 1, overflow: 'hidden' }}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    const newSet = new Set(selectedStateIds);
                                    if (newSet.has(state.id)) newSet.delete(state.id);
                                    else newSet.add(state.id);
                                    setSelectedStateIds(newSet);
                                  }}
                                  style={{ cursor: 'pointer', accentColor: 'var(--accent-purple)', flexShrink: 0 }}
                                />
                                <GripVertical size={12} className="vault-grip" style={{ cursor: 'grab' }} />
                                <Database size={14} style={{ color: isSelected ? 'var(--accent-purple)' : (isPinned ? 'var(--accent-pink)' : 'var(--text-muted)') }} />
                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                  <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', userSelect: 'none' }}>
                                    {state.name}
                                  </span>
                                  {state.testCaseCount > 0 && (
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', lineHeight: '1' }}>{state.testCaseCount} cases</span>
                                  )}
                                </div>
                              </div>

                              <div className="hover-actions" style={{ display: 'flex', gap: '4px' }}>
                                <button title="Update" onClick={(e) => { e.stopPropagation(); handleUpdateState(state, e); }} style={{ background: 'transparent', border: 'none', color: 'var(--accent-purple)', padding: '4px', cursor: 'pointer' }}><RefreshCw size={12} /></button>
                                <button title="Rename" onClick={(e) => { e.stopPropagation(); handleRenameState(state, e); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', padding: '4px', cursor: 'pointer' }}><Edit2 size={12} /></button>
                                <button title={isPinned ? "Unpin" : "Pin to top"} onClick={(e) => { e.stopPropagation(); handlePinState(state.id, e); }} style={{ background: 'transparent', border: 'none', color: isPinned ? 'var(--accent-pink)' : 'var(--text-muted)', padding: '4px', cursor: 'pointer' }}><Pin size={12} fill={isPinned ? "currentColor" : "none"} /></button>
                                <button title="Delete" onClick={(e) => { e.stopPropagation(); handleDeleteState(state.id, e); }} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', padding: '4px', cursor: 'pointer' }}><Trash2 size={12} /></button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Embedded CSS for hover effects */}
            <style dangerouslySetInnerHTML={{
              __html: `
              .nav-item-hover .vault-grip {
                opacity: 0;
                max-width: 0;
                overflow: hidden;
                flex-shrink: 0;
                transition: opacity 0.2s ease, max-width 0.2s ease;
              }
              .nav-item-hover:hover .vault-grip {
                opacity: 0.4;
                max-width: 18px;
              }
              .nav-item-hover .hover-actions {
                opacity: 0;
                max-width: 0;
                overflow: hidden;
                flex-shrink: 0;
                transition: opacity 0.2s ease, max-width 0.2s ease;
              }
              .nav-item-hover:hover .hover-actions {
                opacity: 1;
                max-width: 120px;
              }
              .nav-item-hover:hover {
                background: rgba(255,255,255,0.05) !important;
              }
              .folder-drop-zone:hover {
                background: rgba(59,130,246,0.1) !important;
              }
              .custom-scrollbar::-webkit-scrollbar {
                width: 6px;
              }
              .custom-scrollbar::-webkit-scrollbar-track {
                background: rgba(0,0,0,0.1);
                border-radius: 4px;
              }
              .custom-scrollbar::-webkit-scrollbar-thumb {
                background: rgba(255,255,255,0.1);
                border-radius: 4px;
              }
              .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                background: rgba(255,255,255,0.2);
              }
              @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}} />
          </div>

        </div>

        {/* Right Column: Ledger Dashboard & Uploader */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Progress Bar */}
          {totalCases > 0 && (
            <div className="glass-panel" style={{ padding: '16px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Mapping Progress</span>
                <span style={{ color: 'var(--accent-purple)' }}>{mappedPct}% Mapped</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${mappedPct}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-purple), var(--accent-pink))', transition: 'width 0.5s ease' }} />
              </div>
            </div>
          )}

          {/* Metrics Row — live counts from visible (filtered) cases */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))', gap: '12px' }}>
            {[
              { label: 'Visible', value: fTotal, sub: filterActive ? `of ${totalCases} total` : 'all cases', accent: '#06b6d4', bg: 'rgba(6,182,212,0.08)' },
              { label: 'Passed',  value: fPassed,  sub: fTotal > 0 ? `${Math.round((fPassed/fTotal)*100)}% pass rate` : '—', accent: '#10b981', bg: 'rgba(16,185,129,0.08)' },
              { label: 'Failed',  value: fFailed,  sub: fTotal > 0 ? `${Math.round((fFailed/fTotal)*100)}% fail rate` : '—', accent: '#f43f5e', bg: 'rgba(244,63,94,0.08)' },
              { label: 'Blocked', value: fBlocked, sub: 'blocked cases', accent: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
              { label: 'Ignored', value: fUnmapped, sub: "don't map", accent: '#8b5cf6', bg: 'rgba(139,92,246,0.08)' },
            ].map(card => (
              <div key={card.label} className="glass-panel" style={{ padding: '14px', borderTop: `3px solid ${card.accent}`, background: card.bg, position: 'relative', overflow: 'hidden' }}>
                {filterActive && <div style={{ position: 'absolute', top: '6px', right: '6px', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-purple)', boxShadow: '0 0 6px var(--accent-purple)' }} />}
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{card.label}</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', color: card.accent, margin: '4px 0', lineHeight: 1 }}>{card.value}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{card.sub}</div>
              </div>
            ))}
          </div>

          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '520px' }}>


            {/* Ledger filters & Table */}
            {testCases.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Duplicate IDs Banner */}
                {hasDuplicates && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)',
                    borderRadius: '10px', padding: '11px 16px'
                  }}>
                    <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#f59e0b' }}>
                        Duplicate Test IDs Detected
                      </span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                        {duplicateIds.size} ID{duplicateIds.size > 1 ? 's' : ''} appear more than once
                        ({testCases.filter(tc => duplicateIds.has(tc.id)).length} total rows affected)
                      </span>
                    </div>
                    <button
                      onClick={() => setDuplicatesModalOpen(true)}
                      style={{
                        background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
                        color: '#f59e0b', padding: '5px 14px', borderRadius: '7px', cursor: 'pointer',
                        fontSize: '0.78rem', fontWeight: '700', whiteSpace: 'nowrap'
                      }}
                    >
                      Review Duplicates →
                    </button>
                  </div>
                )}

                {/* Filter controls */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>

                    {/* Search */}
                    <div style={{ position: 'relative', flexGrow: 1, minWidth: '150px' }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        placeholder="Search ID / title..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                          width: '100%',
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-primary)',
                          padding: '6px 10px 6px 30px',
                          borderRadius: '8px',
                          outline: 'none',
                          fontSize: '0.8rem'
                        }}
                      />
                    </div>

                    {/* Status Bubbles */}
                    <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      {[
                        { val: 'ALL', label: 'All' },
                        { val: 'PASSED', label: 'Passed', color: 'var(--accent-green)' },
                        { val: 'FAILED', label: 'Failed', color: 'var(--accent-red)' },
                        { val: 'UNTESTED', label: 'Untested', color: 'var(--text-secondary)' },
                        { val: 'BLOCKED', label: 'Blocked', color: 'var(--accent-orange)' }
                      ].map(status => (
                        <button
                          key={status.val}
                          onClick={() => setStatusFilter(status.val)}
                          style={{
                            background: statusFilter === status.val ? (status.color || 'var(--accent-purple)') : 'transparent',
                            color: statusFilter === status.val ? '#fff' : 'var(--text-primary)',
                            border: 'none',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: statusFilter === status.val ? 'bold' : 'normal',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {status.label}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setManualModalOpen(true)}
                      data-cy="add-row-btn"
                      style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Plus size={12} />
                      Add Row
                    </button>

                    {/* Compare Trigger */}
                    <input
                      type="file"
                      accept=".csv"
                      id="compare-csv-uploader"
                      data-cy="compare-csv-input"
                      onChange={handleCompareFile}
                      style={{ display: 'none' }}
                    />
                    <label
                      htmlFor="compare-csv-uploader"
                      style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <AlertTriangle size={12} />
                      Compare CSV
                    </label>

                    {/* Compare with live TestRail run */}
                    <button
                      onClick={handleLiveRunCompare}
                      disabled={isLiveFetching || testCases.length === 0}
                      title="Fetch live test statuses from TestRail and compare against the current matrix"
                      style={{
                        background: isLiveFetching
                          ? 'var(--bg-tertiary)'
                          : 'linear-gradient(135deg, #1a6b4a 0%, #0f4d36 100%)',
                        border: '1px solid ' + (isLiveFetching ? 'var(--border-color)' : '#2a8a5e'),
                        color: isLiveFetching ? 'var(--text-muted)' : '#7effc4',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        cursor: isLiveFetching || testCases.length === 0 ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        opacity: testCases.length === 0 ? 0.45 : 1,
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {isLiveFetching ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                          </svg>
                          Fetching…
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                          </svg>
                          Compare Live Run
                        </>
                      )}
                    </button>

                    {selectedCaseUids.length > 0 && (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Bulk status change */}
                        <select
                          defaultValue=""
                          onChange={(e) => { if (e.target.value) { handleBulkStatusChange(e.target.value); e.target.value = ''; }}}
                          style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--accent-purple)', color: 'var(--text-primary)', padding: '6px 10px', borderRadius: '8px', fontSize: '0.8rem', outline: 'none', cursor: 'pointer' }}
                        >
                          <option value="" disabled>Set status…</option>
                          <option value="PASSED">→ PASSED</option>
                          <option value="FAILED">→ FAILED</option>
                          <option value="BLOCKED">→ BLOCKED</option>
                          <option value="UNTESTED">→ UNTESTED</option>
                        </select>
                        <div style={{ display: 'flex', border: '1px solid var(--accent-purple)', borderRadius: '8px', overflow: 'hidden' }}>
                          <input
                            type="text"
                            placeholder="Add tags..."
                            value={bulkTagInput}
                            onChange={(e) => setBulkTagInput(e.target.value)}
                            list="global-tags-list"
                            style={{ background: 'var(--bg-tertiary)', border: 'none', color: 'var(--text-primary)', padding: '6px 10px', outline: 'none', fontSize: '0.8rem', width: '110px' }}
                          />
                          <button onClick={handleBulkAddTags} style={{ background: 'var(--accent-purple)', color: '#fff', border: 'none', padding: '0 10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}>+Tags</button>
                        </div>
                        <button onClick={handleDeleteSelected} data-cy="delete-selected-btn" style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                          <Trash2 size={12} /> Delete ({selectedCaseUids.length})
                        </button>
                        <button
                          onClick={() => { setSendToDestId(''); setSendToSearch(''); setSendToModalOpen(true); }}
                          disabled={states.length === 0}
                          style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.45)', color: '#a78bfa', borderRadius: '8px', padding: '6px 12px', cursor: states.length === 0 ? 'not-allowed' : 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', opacity: states.length === 0 ? 0.5 : 1 }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                          Send to Matrix
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Tags Filter + Showing count */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    {availableTags.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)' }}>TAGS</span>
                        <select value={tagLogic} data-cy="tag-logic-select" onChange={(e) => setTagLogic(e.target.value)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '3px 6px', borderRadius: '6px', outline: 'none', fontSize: '0.72rem', cursor: 'pointer' }}>
                          <option value="OR">OR</option>
                          <option value="AND">AND</option>
                        </select>
                        {availableTags.map(tag => (
                          <button key={tag} onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                            style={{ background: selectedTags.includes(tag) ? 'var(--accent-purple)' : 'var(--bg-tertiary)', color: selectedTags.includes(tag) ? '#fff' : 'var(--text-primary)', border: `1px solid ${selectedTags.includes(tag) ? 'var(--accent-purple)' : 'var(--border-color)'}`, padding: '3px 8px', borderRadius: '16px', fontSize: '0.73rem', cursor: 'pointer', transition: 'all 0.15s' }}>
                            {tag}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                      {filterActive && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-tertiary)', padding: '3px 10px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                          Showing <b style={{ color: 'var(--accent-purple)' }}>{fTotal}</b> of {totalCases}
                        </span>
                      )}
                      {filterActive && (
                        <button onClick={clearFilters} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '3px 10px', borderRadius: '8px', fontSize: '0.73rem', cursor: 'pointer' }}>
                          ✕ Clear
                        </button>
                      )}
                      {selectedTags.length > 0 && (
                        <button onClick={() => setReportModalOpen(true)} style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid var(--accent-purple)', color: 'var(--accent-purple)', borderRadius: '8px', padding: '3px 10px', cursor: 'pointer', fontSize: '0.73rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                          <FileText size={11} /> Report
                        </button>
                      )}
                      <button onClick={exportFilteredCSV} title="Export visible cases as CSV" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', borderRadius: '8px', padding: '3px 10px', cursor: 'pointer', fontSize: '0.73rem', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                        <Download size={11} /> Export
                      </button>
                    </div>
                  </div>
                </div>

                {/* Table ledger */}
                <div style={{ maxHeight: '2500px', overflowX: 'auto', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '10px', textAlign: 'center', width: '40px' }}>
                          <input
                            type="checkbox"
                            checked={sortedFilteredCases.length > 0 && selectedCaseUids.length === sortedFilteredCases.length}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedCaseUids(sortedFilteredCases.map(tc => tc._uid));
                              else setSelectedCaseUids([]);
                            }}
                          />
                        </th>
                        {[
                          { key: 'id',         label: 'Test ID', width: '90px' },
                          { key: 'title',      label: 'Title',   width: null },
                          { key: 'tags',       label: 'Tags',    width: '120px' },
                          { key: 'status',     label: 'Status',  width: '100px' },
                          { key: 'mapAction',  label: 'Mapping', width: '100px' },
                          { key: 'syncStatus', label: 'Sync',    width: '90px' },
                        ].map(col => (
                          <th key={col.key} onClick={() => handleSort(col.key)} style={{ padding: '10px', textAlign: 'left', width: col.width || undefined, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {col.label}
                              {sortCol === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : <span style={{ opacity: 0.25 }}>↕</span>}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFilteredCases.map((tc) => (
                        <tr key={tc._uid} style={{ borderBottom: '1px solid var(--border-color)', background: selectedCaseUids.includes(tc._uid) ? 'rgba(168,85,247,0.05)' : duplicateIds.has(tc.id) ? 'rgba(245,158,11,0.04)' : 'transparent' }}>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              data-cy={`row-checkbox-${tc.id}`}
                              checked={selectedCaseUids.includes(tc._uid)}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedCaseUids([...selectedCaseUids, tc._uid]);
                                else setSelectedCaseUids(selectedCaseUids.filter(id => id !== tc._uid));
                              }}
                            />
                          </td>
                          <td style={{ padding: '10px', fontWeight: 'bold', color: duplicateIds.has(tc.id) ? '#f59e0b' : undefined, whiteSpace: 'nowrap' }}>
                            {duplicateIds.has(tc.id) && (
                              <AlertTriangle size={11} style={{ color: '#f59e0b', marginRight: '4px', display: 'inline', verticalAlign: 'middle' }} />
                            )}
                            {tc.id || 'UNMAPPED'}
                          </td>
                          <td style={{ padding: '10px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tc.title}>
                            {tc.title}
                          </td>
                          <td style={{ padding: '10px', fontSize: '0.75rem' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {tc.tags ? tc.tags.split(',').map(t => t.trim()).filter(Boolean).map((t, i) => (
                                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', padding: '2px 4px 2px 7px', borderRadius: '4px', color: 'var(--accent-purple)' }}>
                                  {t}
                                  <button
                                    onClick={() => {
                                      const remaining = tc.tags.split(',').map(x => x.trim()).filter(x => x && x !== t).join(', ');
                                      setTestCases(testCases.map(c => c._uid === tc._uid ? { ...c, tags: remaining } : c));
                                    }}
                                    title={`Remove tag "${t}"`}
                                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--accent-purple)', cursor: 'pointer', padding: '0', lineHeight: 1, fontSize: '0.75rem', opacity: 0.6 }}
                                    onMouseOver={e => e.currentTarget.style.opacity = '1'}
                                    onMouseOut={e => e.currentTarget.style.opacity = '0.6'}
                                  >
                                    ×
                                  </button>
                                </span>
                              )) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </div>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <select
                              value={tc.status}
                              data-cy={`row-status-select-${tc.id}`}
                              onChange={(e) => {
                                const updated = testCases.map(t => t._uid === tc._uid ? { ...t, status: e.target.value } : t);
                                setTestCases(updated);
                              }}
                              style={{
                                background: tc.status === 'PASSED' ? 'rgba(16, 185, 129, 0.15)' : tc.status === 'FAILED' ? 'rgba(244, 63, 94, 0.15)' : tc.status === 'BLOCKED' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                border: '1px solid',
                                borderColor: tc.status === 'PASSED' ? 'rgba(16, 185, 129, 0.3)' : tc.status === 'FAILED' ? 'rgba(244, 63, 94, 0.3)' : tc.status === 'BLOCKED' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                                color: tc.status === 'PASSED' ? '#10b981' : tc.status === 'FAILED' ? '#f43f5e' : tc.status === 'BLOCKED' ? '#f59e0b' : 'var(--text-secondary)',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                outline: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <option value="PASSED" style={{ color: '#10b981', background: 'var(--bg-tertiary)' }}>PASSED</option>
                              <option value="FAILED" style={{ color: '#f43f5e', background: 'var(--bg-tertiary)' }}>FAILED</option>
                              <option value="UNTESTED" style={{ color: 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}>UNTESTED</option>
                              <option value="BLOCKED" style={{ color: '#f59e0b', background: 'var(--bg-tertiary)' }}>BLOCKED</option>
                            </select>
                          </td>
                          <td style={{ padding: '10px' }}>
                            <select
                              value={tc.mapAction}
                              data-cy={`row-map-select-${tc.id}`}
                              onChange={(e) => {
                                const updated = testCases.map(t => t._uid === tc._uid ? { ...t, mapAction: e.target.value } : t);
                                setTestCases(updated);
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-primary)',
                                fontSize: '0.8rem',
                                outline: 'none',
                                cursor: 'pointer'
                              }}
                            >
                              <option value="Map">Map</option>
                              <option value="Don't Map">Ignore</option>
                            </select>
                          </td>
                          <td style={{
                            padding: '10px',
                            color: tc.syncStatus === 'Synced' ? 'var(--accent-green)' : 'var(--text-muted)',
                            fontWeight: 'bold'
                          }}>
                            {tc.syncStatus}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Status Overview & Tag Counts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Multi-segment Donut — live filtered counts */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: 0 }}>Status Overview</h3>
              {filterActive && <span style={{ fontSize: '0.65rem', background: 'rgba(168,85,247,0.15)', color: 'var(--accent-purple)', padding: '2px 8px', borderRadius: '10px', fontWeight: '700', border: '1px solid rgba(168,85,247,0.3)' }}>Filtered</span>}
            </div>
            <div style={{ position: 'relative', width: '150px', height: '150px' }}>
              {(() => {
                const r = 15.91549430918954;
                const base = fTotal > 0 ? fTotal : 1;
                const rawSegs = [
                  { pct: (fPassed   / base) * 100, color: '#10b981', label: 'Passed',   count: fPassed },
                  { pct: (fFailed   / base) * 100, color: '#f43f5e', label: 'Failed',   count: fFailed },
                  { pct: (fBlocked  / base) * 100, color: '#f59e0b', label: 'Blocked',  count: fBlocked },
                  { pct: (fUntested / base) * 100, color: '#6b7280', label: 'Untested', count: fUntested },
                  { pct: (fUnmapped / base) * 100, color: '#8b5cf6', label: 'Ignored',  count: fUnmapped },
                ];
                let cum = 0;
                const segs = rawSegs.map(s => { const o = cum; cum += s.pct; return { ...s, offset: o }; }).filter(s => s.pct > 0);
                const passRate = fTotal > 0 ? Math.round((fPassed / fTotal) * 100) : 0;
                return (
                  <>
                    <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                      <circle cx="18" cy="18" r={r} fill="transparent" stroke="var(--bg-tertiary)" strokeWidth="4" />
                      {fTotal === 0 && <circle cx="18" cy="18" r={r} fill="transparent" stroke="var(--bg-tertiary)" strokeWidth="4" strokeDasharray="100 0" />}
                      {segs.map((seg, i) => (
                        <circle key={i} cx="18" cy="18" r={r} fill="transparent" stroke={seg.color} strokeWidth="4"
                          strokeDasharray={`${seg.pct} ${100 - seg.pct}`}
                          strokeDashoffset={-seg.offset}
                          style={{ transition: 'stroke-dasharray 0.5s ease, stroke-dashoffset 0.5s ease' }}
                        />
                      ))}
                    </svg>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '1.6rem', fontWeight: '800', lineHeight: 1 }}>{fTotal}</span>
                      <span style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: '700' }}>{passRate}% pass</span>
                    </div>
                  </>
                );
              })()}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', marginTop: '16px', justifyContent: 'center' }}>
              {[
                { label: 'Passed',   count: fPassed,   color: '#10b981' },
                { label: 'Failed',   count: fFailed,   color: '#f43f5e' },
                { label: 'Blocked',  count: fBlocked,  color: '#f59e0b' },
                { label: 'Untested', count: fUntested, color: '#6b7280' },
                { label: 'Ignored',  count: fUnmapped, color: '#8b5cf6' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', fontWeight: '600' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                  <span style={{ color: item.color }}>{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tag Breakdown — from filtered cases */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--text-secondary)', margin: 0 }}>Tag Breakdown</h3>
              {filterActive && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{fTotal} visible</span>}
            </div>
            {tagList.length === 0 ? (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>No tags in current view.</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '380px', overflowY: 'auto' }} className="custom-scrollbar">
                {tagList.map(([tag, stats]) => {
                  const passedPct = (stats.passed  / stats.total) * 100;
                  const failedPct = (stats.failed  / stats.total) * 100;
                  const blockedPct = (stats.blocked / stats.total) * 100;
                  const untestedPct = Math.max(0, 100 - passedPct - failedPct - blockedPct);
                  return (
                    <div key={tag} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button
                          onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                          style={{ background: selectedTags.includes(tag) ? 'rgba(168,85,247,0.25)' : 'rgba(168,85,247,0.08)', color: 'var(--accent-purple)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', border: `1px solid ${selectedTags.includes(tag) ? 'var(--accent-purple)' : 'transparent'}`, cursor: 'pointer' }}>
                          #{tag}
                        </button>
                        <span style={{ fontSize: '0.85rem', fontWeight: '800' }}>{stats.total}</span>
                      </div>
                      <div style={{ display: 'flex', width: '100%', height: '5px', borderRadius: '3px', overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
                        <div style={{ width: `${passedPct}%`, background: '#10b981', transition: 'width 0.4s' }} />
                        <div style={{ width: `${failedPct}%`, background: '#f43f5e', transition: 'width 0.4s' }} />
                        <div style={{ width: `${blockedPct}%`, background: '#f59e0b', transition: 'width 0.4s' }} />
                        <div style={{ width: `${untestedPct}%`, background: '#6b7280', transition: 'width 0.4s' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '10px', fontSize: '0.62rem', fontWeight: '600' }}>
                        {stats.passed  > 0 && <span style={{ color: '#10b981' }}>✓{stats.passed}</span>}
                        {stats.failed  > 0 && <span style={{ color: '#f43f5e' }}>✗{stats.failed}</span>}
                        {stats.blocked > 0 && <span style={{ color: '#f59e0b' }}>⊘{stats.blocked}</span>}
                        {stats.untested > 0 && <span style={{ color: '#6b7280' }}>?{stats.untested}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sync Console Logs */}
          <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold' }}>Sync Console Log</h3>
            <div style={{
              background: 'var(--bg-tertiary)',
              padding: '12px',
              borderRadius: '10px',
              height: '150px',
              overflowY: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              {syncLogs.length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>Console idle... Ready for upload or sync.</span>
              ) : (
                syncLogs.map(log => (
                  <div key={log.id} style={{
                    color: log.type === 'success' ? 'var(--accent-green)' : (log.type === 'error' ? 'var(--accent-red)' : 'var(--text-primary)')
                  }}>
                    &gt; {log.msg}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Manual Test Case Modal */}
      {manualModalOpen && createPortal(
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div className="glass-panel" style={{ padding: '24px', width: '400px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Add Manual Test Entry</h3>

            <form onSubmit={handleAddManualTestCase} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Case ID (Numerical)</label>
                <input
                  type="text"
                  value={mId}
                  onChange={(e) => setMId(e.target.value)}
                  placeholder="e.g. C2262191"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Test Title</label>
                <input
                  type="text"
                  value={mTitle}
                  onChange={(e) => setMTitle(e.target.value)}
                  placeholder="e.g. Verify account password reset validation"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', outline: 'none' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Tags (comma-separated)</label>
                <input
                  type="text"
                  value={mTags}
                  onChange={(e) => setMTags(e.target.value)}
                  placeholder="regression, password"
                  list="global-tags-list"
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Initial Status</label>
                <select
                  value={mStatus}
                  onChange={(e) => setMStatus(e.target.value)}
                  style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 12px', borderRadius: '8px', outline: 'none' }}
                >
                  <option value="PASSED">PASSED</option>
                  <option value="FAILED">FAILED</option>
                  <option value="UNTESTED">UNTESTED</option>
                  <option value="BLOCKED">BLOCKED</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setManualModalOpen(false)}
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="glow-btn"
                  style={{ padding: '8px 16px' }}
                >
                  Add Entry
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Comparison Matrix Modal */}
      {compareModalOpen && compareData && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div className="glass-panel" style={{ width: '900px', maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, borderRadius: '16px' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', marginBottom: '3px' }}>
                  Compare <span className="gradient-text">Matrix Diagnostics</span>
                </h3>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span>{compareFileName.startsWith('TestRail Run #') ? '🟢' : '📄'} {compareFileName}</span>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span>{compareData.matched.length + compareData.strictConflicts.length + compareData.missingTr.length} local cases compared</span>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span>{compareData.needsSync.length} remote-only cases</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-tertiary)', padding: '3px', borderRadius: '8px', flexShrink: 0 }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', paddingLeft: '8px', fontWeight: '600' }}>Compare:</span>
                {[{ key: 'filtered', label: `Filtered (${filteredCases.length})` }, { key: 'all', label: `All (${testCases.length})` }].map(opt => (
                  <button key={opt.key} onClick={() => handleCompareSourceChange(opt.key)} style={{ background: compareSource === opt.key ? 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))' : 'transparent', border: 'none', color: compareSource === opt.key ? '#fff' : 'var(--text-secondary)', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', transition: 'all 0.2s ease' }}>{opt.label}</button>
                ))}
              </div>
              <button onClick={() => { setCompareModalOpen(false); setMissingTrSelected(new Set()); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1rem' }}>✕</button>
            </div>

            {/* Summary Cards — clickable tab selectors */}
            {(() => {
              const total = compareData.matched.length + compareData.strictConflicts.length + compareData.needsSync.length + compareData.missingTr.length || 1;
              const cards = [
                { key: 'matched',   label: 'Matched',       count: compareData.matched.length,         color: '#10b981', bg: 'rgba(16,185,129,0.09)',  icon: '✓', hint: 'Same status in both' },
                { key: 'conflicts', label: 'Conflicts',      count: compareData.strictConflicts.length, color: '#f43f5e', bg: 'rgba(244,63,94,0.09)',   icon: '⚡', hint: 'Status mismatch' },
                { key: 'needsSync', label: 'Needs Sync',     count: compareData.needsSync.length,       color: '#f59e0b', bg: 'rgba(245,158,11,0.09)',  icon: '↓', hint: 'Remote only' },
                { key: 'missingTr', label: 'Missing Remote', count: compareData.missingTr.length,       color: '#6b7280', bg: 'rgba(107,114,128,0.09)', icon: '?', hint: 'Local only' },
              ];
              return (
                <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                  {cards.map(s => {
                    const pct = Math.round((s.count / total) * 100);
                    const active = activeCompareTab === s.key;
                    return (
                      <button key={s.key} onClick={() => { setActiveCompareTab(s.key); setCompareSearch(''); }} style={{ background: active ? s.bg : 'rgba(255,255,255,0.02)', border: `1.5px solid ${active ? s.color + '70' : 'var(--border-color)'}`, borderRadius: '10px', padding: '12px 14px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s ease', transform: active ? 'translateY(-1px)' : 'none', boxShadow: active ? `0 4px 16px ${s.color}20` : 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontSize: '1rem' }}>{s.icon}</span>
                          <span style={{ fontSize: '0.65rem', color: s.color, fontWeight: '700', background: s.bg, padding: '2px 6px', borderRadius: '4px' }}>{pct}%</span>
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: '800', color: s.color, lineHeight: 1 }}>{s.count}</div>
                        <div style={{ fontSize: '0.7rem', fontWeight: '700', color: 'var(--text-secondary)', marginTop: '2px' }}>{s.label}</div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '1px' }}>{s.hint}</div>
                        <div style={{ marginTop: '8px', height: '3px', background: 'var(--bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: s.color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* Toolbar */}
            <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input type="text" placeholder="Search by case ID or title…" value={compareSearch} onChange={e => setCompareSearch(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '7px 10px 7px 32px', borderRadius: '8px', outline: 'none', fontSize: '0.8rem' }} />
              </div>
              {activeCompareTab === 'conflicts' && compareData.strictConflicts.length > 0 && (
                <button onClick={() => { [...compareData.strictConflicts].forEach(c => handleApplyRemoteStatus(c.id, c.remote)); }} style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.35)', color: '#f43f5e', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, whiteSpace: 'nowrap' }}>⚡ Apply All Remote</button>
              )}
              {activeCompareTab === 'needsSync' && compareData.needsSync.length > 0 && (
                <button onClick={() => { [...compareData.needsSync].forEach(c => handleAddToLocalFromRemote(c)); }} style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, whiteSpace: 'nowrap' }}>↓ Import All</button>
              )}
              {activeCompareTab === 'missingTr' && missingTrSelected.size > 0 && (
                <button onClick={() => handleDeleteMissingFromLocal([...missingTrSelected])} style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.4)', color: '#f43f5e', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  🗑 Delete Selected ({missingTrSelected.size})
                </button>
              )}
              {activeCompareTab === 'missingTr' && compareData.missingTr.length > 0 && missingTrSelected.size === 0 && (
                <button onClick={() => setMissingTrSelected(new Set(compareData.missingTr.map(c => c._uid)))} style={{ background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.35)', color: '#9ca3af', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, whiteSpace: 'nowrap' }}>☐ Select All</button>
              )}
              <button onClick={exportComparisonCSV} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '8px', padding: '7px 12px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}><Download size={13} /> Export</button>
            </div>

            {/* Table */}
            {(() => {
              const statusBadge = (status) => {
                const map = { PASSED: '#10b981', FAILED: '#f43f5e', BLOCKED: '#f59e0b', UNTESTED: '#6b7280', RETEST: '#8b5cf6' };
                const c = map[status] || '#6b7280';
                return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '700', background: c + '20', color: c, border: `1px solid ${c}40` }}>{status || '—'}</span>;
              };
              const s = compareSearch.trim().toLowerCase();
              const thSt = { textAlign: 'left', padding: '8px 12px', fontSize: '0.68rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', position: 'sticky', top: 0, zIndex: 1 };
              const tdSt = { padding: '9px 12px', fontSize: '0.78rem', borderBottom: '1px solid var(--border-color)', verticalAlign: 'middle' };
              const emptyState = (icon, msg) => <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '160px', gap: '8px', color: 'var(--text-muted)' }}><span style={{ fontSize: '2rem' }}>{icon}</span><span style={{ fontSize: '0.85rem' }}>{msg}</span></div>;
              const banner = (color, bg, msg) => <div style={{ padding: '9px 16px', fontSize: '0.72rem', color, background: bg, borderBottom: `1px solid ${color}25` }} dangerouslySetInnerHTML={{ __html: msg }} />;

              return (
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  {activeCompareTab === 'matched' && (() => {
                    const rows = compareData.matched.filter(c => !s || c.id.includes(s) || (c.title||'').toLowerCase().includes(s));
                    if (!rows.length) return emptyState('✓', s ? 'No matches for your search.' : 'No matched cases found.');
                    return <>{banner('#10b981','rgba(16,185,129,0.06)', 'Cases in <strong>both sources with the same status</strong> — fully in sync, no action needed.')}<table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={thSt}>Case ID</th><th style={thSt}>Title</th><th style={thSt}>Status</th></tr></thead><tbody>{rows.map((c,i)=><tr key={i} style={{ background: i%2?'rgba(255,255,255,0.01)':'transparent' }}><td style={{ ...tdSt, fontWeight:'700', color:'var(--text-secondary)', width:'90px' }}>C{c.id}</td><td style={{ ...tdSt }}><span style={{ overflow:'hidden', textOverflow:'ellipsis', display:'block', whiteSpace:'nowrap', maxWidth:'500px' }}>{c.title}</span></td><td style={tdSt}>{statusBadge(c.status)}</td></tr>)}</tbody></table></>;
                  })()}
                  {activeCompareTab === 'conflicts' && (() => {
                    const rows = compareData.strictConflicts.filter(c => !s || c.id.includes(s) || (c.title||'').toLowerCase().includes(s));
                    if (!rows.length) return emptyState('⚡', s ? 'No matches for your search.' : 'No conflicts — all shared cases match!');
                    return <>{banner('#f43f5e','rgba(244,63,94,0.06)', 'Cases in <strong>both sources with different statuses</strong>. Use "Use Remote ↗" per row or bulk-apply all above.')}<table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={thSt}>Case ID</th><th style={thSt}>Title</th><th style={thSt}>Local</th><th style={thSt}>Remote</th><th style={thSt}>Action</th></tr></thead><tbody>{rows.map((c,i)=><tr key={i} style={{ background: i%2?'rgba(255,255,255,0.01)':'transparent' }}><td style={{ ...tdSt, fontWeight:'700', color:'var(--text-secondary)', width:'90px' }}>C{c.id}</td><td style={tdSt}><span style={{ overflow:'hidden', textOverflow:'ellipsis', display:'block', whiteSpace:'nowrap', maxWidth:'340px' }}>{c.title}</span></td><td style={tdSt}>{statusBadge(c.local)}</td><td style={tdSt}>{statusBadge(c.remote)}</td><td style={{ ...tdSt, width:'130px' }}><button onClick={()=>handleApplyRemoteStatus(c.id,c.remote)} style={{ background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.3)', color:'#f43f5e', borderRadius:'6px', padding:'4px 10px', cursor:'pointer', fontSize:'0.72rem', fontWeight:'600', whiteSpace:'nowrap' }}>Use Remote ↗</button></td></tr>)}</tbody></table></>;
                  })()}
                  {activeCompareTab === 'needsSync' && (() => {
                    const rows = compareData.needsSync.filter(c => !s || c.id.includes(s) || (c.title||'').toLowerCase().includes(s));
                    if (!rows.length) return emptyState('↓', s ? 'No matches for your search.' : 'No remote-only cases found.');
                    return <>{banner('#f59e0b','rgba(245,158,11,0.06)', 'Cases in the <strong>remote CSV only</strong>. Import them into your local matrix to track them.')}<table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={thSt}>Case ID</th><th style={thSt}>Title</th><th style={thSt}>Remote Status</th><th style={thSt}>Action</th></tr></thead><tbody>{rows.map((c,i)=><tr key={i} style={{ background: i%2?'rgba(255,255,255,0.01)':'transparent' }}><td style={{ ...tdSt, fontWeight:'700', color:'var(--text-secondary)', width:'90px' }}>C{c.id}</td><td style={tdSt}><span style={{ overflow:'hidden', textOverflow:'ellipsis', display:'block', whiteSpace:'nowrap', maxWidth:'400px' }}>{c.title}</span></td><td style={tdSt}>{statusBadge(c.status)}</td><td style={{ ...tdSt, width:'145px' }}><button onClick={()=>handleAddToLocalFromRemote(c)} style={{ background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', color:'#f59e0b', borderRadius:'6px', padding:'4px 10px', cursor:'pointer', fontSize:'0.72rem', fontWeight:'600', whiteSpace:'nowrap' }}>+ Add to Matrix</button></td></tr>)}</tbody></table></>;
                  })()}
                  {activeCompareTab === 'missingTr' && (() => {
                    const rows = compareData.missingTr.filter(c => !s || c.id.includes(s) || (c.title||'').toLowerCase().includes(s));
                    if (!rows.length) return emptyState('?', s ? 'No matches for your search.' : 'All local cases are present in the remote.');
                    const allRowsSelected = rows.length > 0 && rows.every(c => missingTrSelected.has(c._uid));
                    const someSelected = rows.some(c => missingTrSelected.has(c._uid));
                    const toggleAll = () => {
                      if (allRowsSelected) {
                        setMissingTrSelected(prev => { const n = new Set(prev); rows.forEach(c => n.delete(c._uid)); return n; });
                      } else {
                        setMissingTrSelected(prev => { const n = new Set(prev); rows.forEach(c => n.add(c._uid)); return n; });
                      }
                    };
                    const toggleRow = (uid) => setMissingTrSelected(prev => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
                    return (
                      <>
                        {banner('#6b7280','rgba(107,114,128,0.06)', 'Cases in your <strong>local matrix only</strong> — not found in the remote. Select rows and delete any that are no longer needed.')}
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={{ ...thSt, width: '36px', textAlign: 'center' }}>
                                <input type="checkbox" checked={allRowsSelected} ref={el => { if (el) el.indeterminate = someSelected && !allRowsSelected; }} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: '#f43f5e' }} />
                              </th>
                              <th style={thSt}>Case ID</th>
                              <th style={thSt}>Title</th>
                              <th style={thSt}>Local Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((c, i) => {
                              const sel = missingTrSelected.has(c._uid);
                              return (
                                <tr key={i} onClick={() => toggleRow(c._uid)} style={{ background: sel ? 'rgba(244,63,94,0.07)' : i%2 ? 'rgba(255,255,255,0.01)' : 'transparent', cursor: 'pointer', transition: 'background 0.1s' }}>
                                  <td style={{ ...tdSt, width: '36px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                    <input type="checkbox" checked={sel} onChange={() => toggleRow(c._uid)} style={{ cursor: 'pointer', accentColor: '#f43f5e' }} />
                                  </td>
                                  <td style={{ ...tdSt, fontWeight: '700', color: 'var(--text-secondary)', width: '90px' }}>C{c.id}</td>
                                  <td style={tdSt}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', whiteSpace: 'nowrap', maxWidth: '420px' }}>{c.title}</span></td>
                                  <td style={tdSt}>{statusBadge(c.status)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </>
                    );
                  })()}
                </div>
              );
            })()}

            {/* Footer */}
            <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {(() => {
                  const s = compareSearch.trim().toLowerCase();
                  const map = { matched: compareData.matched, conflicts: compareData.strictConflicts, needsSync: compareData.needsSync, missingTr: compareData.missingTr };
                  const all = map[activeCompareTab] || [];
                  const shown = s ? all.filter(c => c.id.includes(s) || (c.title||'').toLowerCase().includes(s)) : all;
                  const labels = { matched: 'matched', conflicts: 'conflict', needsSync: 'remote-only', missingTr: 'local-only' };
                  return `Showing ${shown.length} of ${all.length} ${labels[activeCompareTab] || ''} cases`;
                })()}
              </span>
              <button onClick={() => { setCompareModalOpen(false); setMissingTrSelected(new Set()); }} className="glow-btn" style={{ background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}>Done</button>
            </div>

          </div>
        </div>,
        document.body
      )}

      {/* Send to Matrix Modal */}
      {sendToModalOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setSendToModalOpen(false); } }}>
          <div className="glass-panel" style={{ width: '460px', maxWidth: '96vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, borderRadius: '16px' }}>

            {/* Header */}
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '800', marginBottom: '2px' }}>
                  Send to <span className="gradient-text">Matrix</span>
                </h3>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                  {selectedCaseUids.length} case{selectedCaseUids.length !== 1 ? 's' : ''} selected · duplicate IDs will be skipped automatically
                </p>
              </div>
              <button onClick={() => setSendToModalOpen(false)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: '8px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '1rem' }}>✕</button>
            </div>

            {/* Search */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ position: 'relative' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input
                  type="text"
                  placeholder="Search matrices…"
                  value={sendToSearch}
                  onChange={e => setSendToSearch(e.target.value)}
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '7px 10px 7px 32px', borderRadius: '8px', outline: 'none', fontSize: '0.8rem' }}
                />
              </div>
            </div>

            {/* Matrix list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {(() => {
                const q = sendToSearch.trim().toLowerCase();
                const filtered = states.filter(m => !q || m.name.toLowerCase().includes(q) || (m.folder || '').toLowerCase().includes(q));
                if (filtered.length === 0) return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '120px', color: 'var(--text-muted)', gap: '6px' }}>
                    <span style={{ fontSize: '1.5rem' }}>🗂</span>
                    <span style={{ fontSize: '0.8rem' }}>{q ? 'No matrices match your search.' : 'No saved matrices found.'}</span>
                  </div>
                );

                // Group by folder
                const folders = {};
                filtered.forEach(m => {
                  const f = m.folder || 'Uncategorized';
                  if (!folders[f]) folders[f] = [];
                  folders[f].push(m);
                });

                return Object.entries(folders).map(([folder, mats]) => (
                  <div key={folder}>
                    <div style={{ padding: '6px 18px 3px', fontSize: '0.65rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{folder}</div>
                    {mats.map(m => {
                      const selected = sendToDestId === m.id;
                      return (
                        <div
                          key={m.id}
                          onClick={() => setSendToDestId(m.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 18px', cursor: 'pointer', background: selected ? 'rgba(139,92,246,0.12)' : 'transparent', borderLeft: selected ? '3px solid var(--accent-purple)' : '3px solid transparent', transition: 'all 0.15s' }}
                        >
                          <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: `2px solid ${selected ? 'var(--accent-purple)' : 'var(--border-color)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                            {selected && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-purple)' }} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: '600', color: selected ? '#c4b5fd' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{m.testCaseCount} case{m.testCaseCount !== 1 ? 's' : ''}</div>
                          </div>
                          {selected && (
                            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                              {[['PASSED', '#10b981'], ['FAILED', '#f43f5e'], ['UNTESTED', '#6b7280']].map(([st, col]) => m.statusCounts[st] > 0 && (
                                <span key={st} style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: col + '20', color: col, fontWeight: '700' }}>{m.statusCounts[st]}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {sendToDestId ? `→ ${states.find(s => s.id === sendToDestId)?.name}` : 'Select a destination above'}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setSendToModalOpen(false)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '8px', padding: '7px 16px', cursor: 'pointer', fontSize: '0.82rem' }}>Cancel</button>
                <button
                  onClick={handleSendToMatrix}
                  disabled={!sendToDestId || isSendingTo}
                  style={{ background: sendToDestId && !isSendingTo ? 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))' : 'var(--bg-tertiary)', border: 'none', color: sendToDestId && !isSendingTo ? '#fff' : 'var(--text-muted)', borderRadius: '8px', padding: '7px 18px', cursor: sendToDestId && !isSendingTo ? 'pointer' : 'not-allowed', fontSize: '0.82rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                >
                  {isSendingTo ? (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Sending…</>
                  ) : (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Send {selectedCaseUids.length} Case{selectedCaseUids.length !== 1 ? 's' : ''}</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Sync Preview Modal */}
      {syncPreviewOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div className="glass-panel" style={{ width: '580px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, borderRadius: '16px' }}>
            {(() => {
              const toSync    = filteredCases.filter(tc => tc.mapAction === 'Map' && tc.id);
              const skipped   = filteredCases.filter(tc => tc.mapAction !== 'Map' || !tc.id);
              const outside   = testCases.length - filteredCases.length;
              const byStatus  = { PASSED: 0, FAILED: 0, BLOCKED: 0, UNTESTED: 0, RETEST: 0 };
              toSync.forEach(tc => { const k = (tc.status || 'UNTESTED').toUpperCase(); if (byStatus[k] !== undefined) byStatus[k]++; });
              const statusColor = { PASSED: '#10b981', FAILED: '#f43f5e', BLOCKED: '#f59e0b', UNTESTED: '#6b7280', RETEST: '#8b5cf6' };

              const activeFilters = [];
              if (statusFilter !== 'ALL') activeFilters.push({ label: 'Status', value: statusFilter });
              if (selectedTags.length > 0) activeFilters.push({ label: 'Tags', value: selectedTags.join(', ') });
              if (searchTerm.trim()) activeFilters.push({ label: 'Search', value: `"${searchTerm}"` });

              return (
                <>
                  {/* Header */}
                  <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '3px' }}>
                        Sync <span className="gradient-text">Preview</span>
                      </h3>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Review what will be pushed to TestRail Run <strong style={{ color: 'var(--text-primary)' }}>#{runId}</strong></p>
                    </div>
                    <button onClick={() => setSyncPreviewOpen(false)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', cursor: 'pointer', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>✕</button>
                  </div>

                  <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    {/* Active filter banner */}
                    {filterActive && (
                      <div style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: '10px', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--accent-purple)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>⚡</span> Filter Active — syncing visible cases only
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {activeFilters.map((f, i) => (
                            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: '6px', padding: '3px 8px', color: 'var(--text-secondary)' }}>
                              <span style={{ color: 'var(--accent-purple)', fontWeight: '600' }}>{f.label}:</span> {f.value}
                            </span>
                          ))}
                        </div>
                        {outside > 0 && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            ⚠ {outside} case{outside !== 1 ? 's' : ''} outside this filter will <strong>not</strong> be synced.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Cases to sync count */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '14px 18px' }}>
                      <div style={{ fontSize: '2.4rem', fontWeight: '800', background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1 }}>{toSync.length}</div>
                      <div>
                        <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-primary)' }}>cases will be synced</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {skipped.length > 0 && `${skipped.length} skipped (unmapped or no ID)`}
                          {skipped.length === 0 && 'all mapped cases in the current view'}
                        </div>
                      </div>
                    </div>

                    {/* Status breakdown */}
                    {toSync.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status Breakdown</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {Object.entries(byStatus).filter(([, v]) => v > 0).map(([status, count]) => {
                            const pct = Math.round((count / toSync.length) * 100);
                            const c = statusColor[status];
                            return (
                              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ width: '72px', fontSize: '0.72rem', fontWeight: '700', color: c }}>{status}</span>
                                <div style={{ flex: 1, height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: c, borderRadius: '4px', transition: 'width 0.4s ease' }} />
                                </div>
                                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: c, width: '28px', textAlign: 'right' }}>{count}</span>
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', width: '36px' }}>{pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Empty state */}
                    {toSync.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px dashed var(--border-color)' }}>
                        No mapped cases with valid IDs in the current view.<br />
                        <span style={{ fontSize: '0.72rem' }}>Set cases to "Map" and ensure they have a Case ID.</span>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setSyncPreviewOpen(false)} style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '8px', padding: '8px 18px', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
                    <button
                      onClick={handleStartSync}
                      disabled={toSync.length === 0 || isSyncing}
                      className="glow-btn"
                      style={{ background: toSync.length === 0 ? 'var(--bg-tertiary)' : 'linear-gradient(135deg, var(--accent-purple), var(--accent-pink))', border: 'none', color: '#fff', borderRadius: '8px', padding: '8px 20px', cursor: toSync.length === 0 ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Play size={14} /> Confirm &amp; Sync {toSync.length > 0 ? `(${toSync.length})` : ''}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* Report Modal */}
      {reportModalOpen && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)' }}>
          <div className="glass-panel" style={{ width: '600px', maxWidth: '90vw', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileSpreadsheet size={18} style={{ color: 'var(--accent-purple)' }} />
                Execution Summary
              </h2>
              <button onClick={() => setReportModalOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
            </div>
            
            <div id="report-table-container" style={{ overflowX: 'auto', background: '#fff', color: '#000', padding: '16px', borderRadius: '8px', border: '1px solid #ccc' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '8px', fontSize: '14px', fontFamily: 'sans-serif' }}>Please find Execution Summary</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'sans-serif', fontSize: '13px' }}>
                <thead>
                  <tr>
                    <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>Metric</th>
                    {selectedTags.map(tag => (
                      <th key={tag} style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{tag}</th>
                    ))}
                    <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '8px', fontWeight: 'bold' }}>Passed</td>
                    {selectedTags.map(tag => {
                      const passed = testCases.filter(tc => tc.mapAction === 'Map' && tc.status === 'PASSED' && (tc.tags || '').split(',').map(t => t.trim()).includes(tag)).length;
                      return <td key={tag} style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>{passed}</td>;
                    })}
                    <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>
                      {selectedTags.reduce((sum, tag) => sum + testCases.filter(tc => tc.mapAction === 'Map' && tc.status === 'PASSED' && (tc.tags || '').split(',').map(t => t.trim()).includes(tag)).length, 0)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '8px', fontWeight: 'bold' }}>Failed</td>
                    {selectedTags.map(tag => {
                      const failed = testCases.filter(tc => tc.mapAction === 'Map' && tc.status === 'FAILED' && (tc.tags || '').split(',').map(t => t.trim()).includes(tag)).length;
                      return <td key={tag} style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>{failed}</td>;
                    })}
                    <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>
                      {selectedTags.reduce((sum, tag) => sum + testCases.filter(tc => tc.mapAction === 'Map' && tc.status === 'FAILED' && (tc.tags || '').split(',').map(t => t.trim()).includes(tag)).length, 0)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid #000', padding: '8px', fontWeight: 'bold' }}>Total Test Cases</td>
                    {selectedTags.map(tag => {
                      const total = testCases.filter(tc => tc.mapAction === 'Map' && (tc.tags || '').split(',').map(t => t.trim()).includes(tag)).length;
                      return <td key={tag} style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>{total}</td>;
                    })}
                    <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>
                      {selectedTags.reduce((sum, tag) => sum + testCases.filter(tc => tc.mapAction === 'Map' && (tc.tags || '').split(',').map(t => t.trim()).includes(tag)).length, 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <button
                onClick={() => {
                  const node = document.getElementById('report-table-container');
                  const range = document.createRange();
                  range.selectNode(node);
                  window.getSelection().removeAllRanges();
                  window.getSelection().addRange(range);
                  document.execCommand('copy');
                  window.getSelection().removeAllRanges();
                  addLog('Table copied to clipboard!', 'success');
                  setReportModalOpen(false);
                  showAlert('Table copied to clipboard!');
                }}
                className="glow-btn"
                style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Clipboard size={14} />
                Copy Table
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Duplicate IDs Review Modal */}
      {duplicatesModalOpen && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-panel" style={{ padding: '28px', width: '700px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>

            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <AlertTriangle size={22} style={{ color: '#f59e0b', marginTop: '2px', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', margin: '0 0 4px' }}>Duplicate Test IDs</h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                  {duplicateGroups.length} duplicate ID{duplicateGroups.length !== 1 ? 's' : ''} found — review each group and decide which entries to keep or remove.
                </p>
              </div>
              {duplicateGroups.length > 0 && (
                <button
                  onClick={() => {
                    const uidsToDelete = duplicateGroups.flatMap(g => g.cases.slice(1).map(tc => tc._uid));
                    setTestCases(prev => prev.filter(tc => !uidsToDelete.includes(tc._uid)));
                    addLog(`Auto-resolved: kept first occurrence of each duplicate ID, removed ${uidsToDelete.length} entr${uidsToDelete.length !== 1 ? 'ies' : 'y'}.`, 'success');
                  }}
                  style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981', padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '700', whiteSpace: 'nowrap' }}
                >
                  Keep First, Remove Rest
                </button>
              )}
            </div>

            {/* Duplicate Groups */}
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', paddingRight: '4px' }} className="custom-scrollbar">
              {duplicateGroups.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#10b981', fontSize: '0.92rem', fontWeight: '600' }}>
                  ✓ No duplicates remaining — all Test IDs are unique.
                </div>
              ) : duplicateGroups.map(group => (
                <div key={group.id} style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.22)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Group Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: '800', color: '#f59e0b' }}>{group.id}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.2)' }}>
                        {group.cases.length} entries
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const uidsToDelete = group.cases.slice(1).map(tc => tc._uid);
                        setTestCases(prev => prev.filter(tc => !uidsToDelete.includes(tc._uid)));
                        addLog(`Kept first occurrence of ${group.id}, removed ${uidsToDelete.length} duplicate(s).`, 'success');
                      }}
                      style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.73rem', fontWeight: '700' }}
                    >
                      Keep First Only
                    </button>
                  </div>

                  {/* Rows in group */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {group.cases.map((tc, i) => (
                      <div key={tc._uid} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: i === 0 ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.02)', borderRadius: '7px', padding: '9px 12px', border: `1px solid ${i === 0 ? 'rgba(16,185,129,0.2)' : 'var(--border-color)'}` }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: '800', color: i === 0 ? '#10b981' : 'var(--text-muted)', minWidth: '32px', background: i === 0 ? 'rgba(16,185,129,0.12)' : 'var(--bg-tertiary)', padding: '2px 6px', borderRadius: '4px', textAlign: 'center' }}>
                          {i === 0 ? '1st' : `#${i + 1}`}
                        </span>
                        <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tc.title}>
                          {tc.title || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No title</span>}
                        </span>
                        {tc.tags && (
                          <span style={{ fontSize: '0.68rem', color: 'var(--accent-purple)', background: 'rgba(168,85,247,0.08)', padding: '2px 6px', borderRadius: '4px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tc.tags}>
                            {tc.tags}
                          </span>
                        )}
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', minWidth: '64px', textAlign: 'center', color: tc.status === 'PASSED' ? '#10b981' : tc.status === 'FAILED' ? '#f43f5e' : tc.status === 'BLOCKED' ? '#f59e0b' : 'var(--text-muted)' }}>
                          {tc.status}
                        </span>
                        <button
                          onClick={() => {
                            setTestCases(prev => prev.filter(c => c._uid !== tc._uid));
                            addLog(`Deleted entry for ${tc.id}${tc.title ? ` — "${tc.title}"` : ''}.`, 'info');
                          }}
                          title="Delete this entry"
                          style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.22)', color: '#f43f5e', padding: '4px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: '700', whiteSpace: 'nowrap' }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
              <button
                onClick={() => setDuplicatesModalOpen(false)}
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 22px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Global Tags Datalist */}
      <datalist id="global-tags-list">
        {globalTags.map((tag, idx) => (
          <option key={idx} value={tag} />
        ))}
      </datalist>

      {/* ── Sync Success Animation Overlay ── */}
      {syncSuccessAnim && createPortal(
        <div
          onClick={() => setSyncSuccessAnim(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.93)',
            backgroundImage: [
              'linear-gradient(rgba(16,185,129,0.035) 1px, transparent 1px)',
              'linear-gradient(90deg, rgba(16,185,129,0.035) 1px, transparent 1px)'
            ].join(','),
            backgroundSize: '48px 48px',
            backdropFilter: 'blur(6px)',
            cursor: 'pointer',
          }}
        >
          <style>{`
            @keyframes syncRingPulse {
              0%   { transform: scale(1);   opacity: 0.7; }
              100% { transform: scale(2.8); opacity: 0; }
            }
            @keyframes syncCircleDraw {
              to { stroke-dashoffset: 0; }
            }
            @keyframes syncFadeSlideUp {
              from { opacity: 0; transform: translateY(28px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            @keyframes syncCardPop {
              from { opacity: 0; transform: translateY(22px) scale(0.92); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
            @keyframes syncOrbFloat {
              0%, 100% { transform: translateY(0px) scale(1); }
              50%       { transform: translateY(-18px) scale(1.04); }
            }
            @keyframes syncParticleRise {
              0%   { transform: translateY(0px);   opacity: var(--p-opacity); }
              100% { transform: translateY(-120px); opacity: 0; }
            }
            @keyframes syncShimmer {
              0%   { background-position: -400px 0; }
              100% { background-position: 400px 0; }
            }
          `}</style>

          {/* Background glow orbs */}
          <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.09) 0%, transparent 70%)', animation: 'syncOrbFloat 6s ease-in-out infinite', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '-100px', left: '-100px', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)', animation: 'syncOrbFloat 8s 2s ease-in-out infinite', pointerEvents: 'none' }} />

          {/* Floating particles */}
          {Array.from({ length: 18 }, (_, i) => {
            const left = ((i * 61.8033) % 100).toFixed(1);
            const top  = ((i * 97.463) % 100).toFixed(1);
            const size = (i % 3) + 1;
            const opacity = (0.18 + (i % 5) * 0.06).toFixed(2);
            const dur  = (3.5 + (i % 6) * 0.7).toFixed(1);
            const delay = (-(i * 0.85)).toFixed(1);
            const color = i % 3 === 0 ? '#10b981' : i % 3 === 1 ? '#a78bfa' : '#6ee7b7';
            return (
              <div key={i} style={{
                position: 'absolute',
                left: `${left}%`, top: `${top}%`,
                width: `${size}px`, height: `${size}px`,
                borderRadius: '50%',
                background: color,
                '--p-opacity': opacity,
                opacity,
                animation: `syncParticleRise ${dur}s ${delay}s linear infinite`,
                pointerEvents: 'none',
              }} />
            );
          })}

          {/* Center content */}
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0', maxWidth: '600px', width: '100%', padding: '0 24px' }}>

            {/* Pulsing rings + SVG check */}
            <div style={{ position: 'relative', width: '148px', height: '148px', marginBottom: '28px' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  border: '1.5px solid rgba(16,185,129,0.55)',
                  animation: `syncRingPulse 2.4s ${i * 0.8}s ease-out infinite`,
                }} />
              ))}
              <svg viewBox="0 0 120 120" width="148" height="148" style={{ position: 'absolute', inset: 0 }}>
                {/* Outer track */}
                <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(16,185,129,0.1)" strokeWidth="2" />
                {/* Animated stroke circle */}
                <circle
                  cx="60" cy="60" r="54"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="339.3"
                  strokeDashoffset="339.3"
                  transform="rotate(-90 60 60)"
                  style={{ animation: 'syncCircleDraw 1.1s cubic-bezier(0.4,0,0.2,1) 0.1s forwards' }}
                />
                {/* Inner glow fill */}
                <circle cx="60" cy="60" r="48" fill="rgba(16,185,129,0.06)" />
                {/* Checkmark */}
                <path
                  d="M32 62 L50 82 L88 40"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="90"
                  strokeDashoffset="90"
                  style={{ animation: 'syncCircleDraw 0.55s cubic-bezier(0.4,0,0.2,1) 1s forwards' }}
                />
              </svg>
            </div>

            {/* Counter */}
            <div style={{
              fontSize: '5.5rem', fontWeight: '900', lineHeight: 1,
              background: 'linear-gradient(135deg, #10b981 0%, #6ee7b7 50%, #34d399 100%)',
              backgroundClip: 'text', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              animation: 'syncFadeSlideUp 0.5s 0.3s ease both',
              letterSpacing: '-2px',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {syncAnimCounts.total}
            </div>

            <div style={{
              fontSize: '0.75rem', fontWeight: '800', letterSpacing: '3px', color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase', marginTop: '6px', marginBottom: '28px',
              animation: 'syncFadeSlideUp 0.5s 0.45s ease both',
            }}>
              Cases Synced to TestRail
            </div>

            {/* Status breakdown cards */}
            {(() => {
              const STATUSES = [
                { key: 'PASSED',   label: 'Passed',   color: '#10b981', glow: 'rgba(16,185,129,0.25)',  icon: '✓' },
                { key: 'FAILED',   label: 'Failed',   color: '#f43f5e', glow: 'rgba(244,63,94,0.25)',  icon: '✕' },
                { key: 'BLOCKED',  label: 'Blocked',  color: '#f59e0b', glow: 'rgba(245,158,11,0.25)', icon: '⊘' },
                { key: 'RETEST',   label: 'Retest',   color: '#8b5cf6', glow: 'rgba(139,92,246,0.25)', icon: '↺' },
                { key: 'UNTESTED', label: 'Untested', color: '#6b7280', glow: 'rgba(107,114,128,0.2)',  icon: '–' },
              ];
              const active = STATUSES.filter(s => syncSuccessAnim[s.key] > 0);
              if (active.length === 0) return null;
              return (
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '24px' }}>
                  {active.map((s, i) => (
                    <div key={s.key} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid ${s.color}40`,
                      borderRadius: '14px',
                      padding: '14px 20px',
                      minWidth: '80px',
                      boxShadow: `0 0 20px ${s.glow}`,
                      animation: `syncCardPop 0.45s ${0.6 + i * 0.1}s cubic-bezier(0.34,1.56,0.64,1) both`,
                    }}>
                      <span style={{ fontSize: '1.1rem', color: s.color, fontWeight: '900', lineHeight: 1 }}>{s.icon}</span>
                      <span style={{ fontSize: '1.9rem', fontWeight: '900', color: s.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                        {syncAnimCounts[s.key]}
                      </span>
                      <span style={{ fontSize: '0.62rem', fontWeight: '700', color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                        {s.label}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Proportional stacked bar */}
            {syncSuccessAnim.total > 0 && (() => {
              const BARS = [
                { key: 'PASSED', color: '#10b981' }, { key: 'FAILED', color: '#f43f5e' },
                { key: 'BLOCKED', color: '#f59e0b' }, { key: 'RETEST', color: '#8b5cf6' },
                { key: 'UNTESTED', color: '#4b5563' },
              ];
              return (
                <div style={{ width: '100%', maxWidth: '440px', height: '5px', borderRadius: '3px', overflow: 'hidden', display: 'flex', marginBottom: '22px', gap: '1px', animation: 'syncFadeSlideUp 0.5s 1.1s ease both' }}>
                  {BARS.map(b => {
                    const pct = ((syncSuccessAnim[b.key] || 0) / syncSuccessAnim.total) * 100;
                    if (pct === 0) return null;
                    return <div key={b.key} style={{ flex: `0 0 ${pct}%`, height: '100%', background: b.color, borderRadius: '2px' }} />;
                  })}
                </div>
              );
            })()}

            {/* Run info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', animation: 'syncFadeSlideUp 0.5s 1.2s ease both' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '5px 12px' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: '#10b981' }}><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'rgba(255,255,255,0.6)' }}>Run #{syncSuccessAnim.runId}</span>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>·</span>
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.38)' }}>{syncSuccessAnim.time}</span>
            </div>

            {/* Dismiss hint */}
            <div style={{ marginTop: '26px', animation: 'syncFadeSlideUp 0.5s 1.4s ease both' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '20px', padding: '7px 16px', cursor: 'pointer' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'rgba(255,255,255,0.4)' }}><path d="M18 6L6 18M6 6l12 12"/></svg>
                <span style={{ fontSize: '0.72rem', fontWeight: '600', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.3px' }}>Click anywhere to dismiss</span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default SyncHub;
