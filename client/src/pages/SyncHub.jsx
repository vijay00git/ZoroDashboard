import React, { useState, useEffect } from 'react';
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
  const [activeCompareTab, setActiveCompareTab] = useState('needsSync');

  // Sync Log
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [syncLogs, setSyncLogs] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);

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

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    setFileName(file.name);
    addLog(`Loading CSV file: ${file.name}...`, 'info');

    const text = await file.text();
    const lines = text.split(/[\r\n]+/);
    if (lines.length < 2) {
      addLog('Empty or invalid CSV file.', 'error');
      return;
    }

    const headerCols = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());

    // All columns optional — missing ones get safe defaults
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
      // Accept rows with at least 1 column (every column is optional)
      if (cols.length < 1) continue;

      const col = (idx) => (idx !== -1 && cols[idx] !== undefined) ? cols[idx] : '';

      const rawId     = col(idIdx);
      const title     = col(titleIdx);
      const tags      = col(tagsIdx);
      const notes     = col(notesIdx);
      const status    = statusIdx !== -1 && col(statusIdx) ? col(statusIdx).toUpperCase() : 'UNTESTED';
      const syncStatus = col(syncIdx) || 'Unsynced';
      const reason    = col(reasonIdx);
      const mappingRaw = col(mappingIdx);

      // Support multi-id delimited by semicolon
      const ids = rawId.split(';').map(id => id.trim()).filter(id => id);

      if (ids.length === 0) {
        parsedCases.push({
          id: '',
          title,
          tags,
          notes,
          status,
          mapAction: mappingRaw || "Don't Map",
          syncStatus,
          reason
        });
      } else {
        ids.forEach(id => {
          parsedCases.push({
            id,
            title,
            tags,
            notes,
            status,
            mapAction: mappingRaw || 'Map',
            syncStatus,
            reason
          });
        });
      }
    }

    setTestCases(parsedCases.map((tc, idx) => ({ ...tc, _uid: Date.now() + '_' + idx })));
    addLog(`Parsed ${parsedCases.length} test cases from CSV.`, 'success');
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
    setTestCases([...testCases, ...newCases]);
    setFileName(`Loaded Multiple: ${names.join(', ')}`);
    addLog(`Loaded ${newCases.length} test cases from multiple states.`, 'success');
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

  // Sync test execution results to TestRail proxy API
  const handleStartSync = async () => {
    if (!runId || !username || !password) {
      alert("Missing TestRail credentials or Run ID.");
      return;
    }

    const payload = testCases
      .filter(tc => tc.mapAction === 'Map' && tc.id)
      .map(tc => {
        let status_id = 5; // Default failed
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
      showAlert("No test cases marked as 'Map' with valid IDs.");
      return;
    }

    setIsSyncing(true);
    addLog(`Initiating synchronization run on Run ID: ${runId} (${payload.length} cases)...`, 'info');

    try {
      const response = await fetch('http://localhost:3000/api/testrail/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId,
          auth: btoa(`${username}:${password}`),
          payload
        })
      });

      if (response.ok) {
        addLog(`Synchronized ${payload.length} test cases onto TestRail!`, 'success');

        // Mark synced in local list
        const updated = testCases.map(tc => {
          if (tc.mapAction === 'Map' && tc.id) {
            return { ...tc, syncStatus: 'Synced' };
          }
          return tc;
        });
        setTestCases(updated);
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
  const handleCompareFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split(/[\r\n]+/);
    if (lines.length < 2) return;

    addLog(`Comparing local matrix against ${file.name}...`, 'info');

    // Simple comparison metrics compiler
    const headerCols = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const idIdx     = headerCols.findIndex(h => h.includes('id') || h === 'test case');
    const statusIdx = headerCols.findIndex(h => h.includes('status'));
    const titleIdx  = headerCols.findIndex(h => h.includes('title') || h === 'name');

    if (idIdx === -1 || statusIdx === -1) {
      showAlert("Compare CSV is missing Case ID or Status headers.");
      return;
    }

    const trCases = new Map();
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (cols.length <= idIdx || cols.length <= statusIdx) continue;
      const numId = cols[idIdx].replace(/\D/g, '');
      if (numId) {
        trCases.set(numId, {
          title: (titleIdx !== -1 ? cols[titleIdx] : cols[1]) || '',
          status: cols[statusIdx].toUpperCase()
        });
      }
    }

    // Process sets
    const strictConflicts = [];
    const needsSync = [];
    const missingTr = [];
    const matched = [];

    testCases.forEach(tc => {
      const numId = tc.id.replace(/\D/g, '');
      if (!numId) return;

      if (trCases.has(numId)) {
        const trVal = trCases.get(numId);
        if (tc.status !== trVal.status) {
          strictConflicts.push({ id: numId, title: tc.title, local: tc.status, remote: trVal.status });
        } else {
          matched.push({ id: numId, title: tc.title, status: tc.status });
        }
      } else {
        missingTr.push({ id: numId, title: tc.title, status: tc.status });
      }
    });

    trCases.forEach((val, id) => {
      const existsLocally = testCases.some(tc => tc.id.replace(/\D/g, '') === id);
      if (!existsLocally) {
        needsSync.push({ id, title: val.title, status: val.status });
      }
    });

    setCompareData({ strictConflicts, needsSync, missingTr, matched });
    setCompareModalOpen(true);
  };

  // Global totals (unfiltered) — used for progress bar only
  const totalCases = testCases.length;
  const mappedPct = totalCases > 0 ? Math.round((testCases.filter(t => t.mapAction === 'Map').length / totalCases) * 100) : 0;

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
          onClick={handleStartSync}
          data-cy="start-sync-btn"
          disabled={isSyncing || testCases.length === 0}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Credentials Card */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '12px' }}>TestRail Credentials</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Run ID</label>
                  <input
                    type="text"
                    data-cy="run-id-input"
                    value={runId}
                    onChange={(e) => setRunId(e.target.value)}
                    placeholder="e.g. 8181"
                    style={{
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

                <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: '600' }}>Username</label>
                  <input
                    type="email"
                    data-cy="username-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="zoro@dev.com"
                    style={{
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
                onChange={(e) => handleFileUpload(e.target.files)}
                style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0, cursor: 'pointer' }}
              />
              <Upload size={18} style={{ color: 'var(--accent-purple)' }} />
              <div style={{ textAlign: 'left' }}>
                <h4 style={{ fontWeight: 'bold', fontSize: '0.8rem', margin: 0 }}>Drop CSV Here</h4>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0 }}>Or click to browse</p>
              </div>
            </div>

            <button onClick={() => setTestCases([])} data-cy="start-empty-state-btn" style={{ width: '100%', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px', fontSize: '0.75rem', color: 'var(--text-primary)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.2s ease' }} onMouseOver={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'} onMouseOut={(e) => e.target.style.background = 'transparent'}>
              📝 Start Empty State
            </button>
            {fileName && (
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
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ position: 'relative', flexGrow: 1 }}>
                  <input
                    type="text"
                    data-cy="save-state-name-input"
                    placeholder="Save current state as..."
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    style={{
                      width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                      padding: '10px 14px', borderRadius: '8px', outline: 'none', fontSize: '0.85rem', transition: 'border-color 0.2s ease'
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--accent-purple)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                  />
                </div>
                <div style={{ position: 'relative', width: '140px' }}>
                  <Folder style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={14} />
                  <input
                    type="text"
                    data-cy="save-state-folder-input"
                    placeholder="Folder..."
                    value={saveFolder}
                    onChange={(e) => setSaveFolder(e.target.value)}
                    style={{
                      width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                      padding: '10px 10px 10px 30px', borderRadius: '8px', outline: 'none', fontSize: '0.85rem', transition: 'border-color 0.2s ease'
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
                    border: 'none', color: '#fff', borderRadius: '8px', padding: '0 16px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <Save size={16} /> Save
                </button>
              </div>

              {/* Add Folder */}
              <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                <div style={{ position: 'relative', flexGrow: 1 }}>
                  <FolderPlus style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} size={14} />
                  <input
                    type="text"
                    data-cy="add-folder-input"
                    placeholder="Create new folder..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px dashed var(--border-color)', color: 'var(--text-primary)',
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
              <button
                onClick={handleLoadMultipleStates}
                className="glow-btn"
                style={{
                  background: 'rgba(168,85,247,0.15)', border: '1px solid var(--accent-purple)', color: 'var(--accent-purple)',
                  borderRadius: '8px', padding: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', width: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => { e.target.style.background = 'var(--accent-purple)'; e.target.style.color = '#fff'; }}
                onMouseOut={(e) => { e.target.style.background = 'rgba(168,85,247,0.15)'; e.target.style.color = 'var(--accent-purple)'; }}
              >
                <Database size={16} /> Load Selected ({selectedStateIds.size})
              </button>
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
                        <GripVertical size={12} style={{ cursor: 'grab', opacity: 0.3 }} />
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {isExpanded ? <ChevronDown size={14} style={{ color: 'var(--accent-purple)' }} /> : <ChevronRight size={14} />}
                          {isExpanded ? <FolderOpen size={14} style={{ color: 'var(--accent-purple)', marginLeft: '4px' }} /> : <Folder size={14} style={{ marginLeft: '4px' }} />}
                        </div>
                        <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', userSelect: 'none' }}>
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
                                <GripVertical size={12} style={{ cursor: 'grab', opacity: 0.3 }} />
                                <Database size={14} style={{ color: isSelected ? 'var(--accent-purple)' : (isPinned ? 'var(--accent-pink)' : 'var(--text-muted)') }} />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
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
              .nav-item-hover .hover-actions {
                opacity: 0;
                transform: translateX(10px);
                transition: all 0.2s ease;
              }
              .nav-item-hover:hover .hover-actions {
                opacity: 1;
                transform: translateX(0);
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
                        <tr key={tc._uid} style={{ borderBottom: '1px solid var(--border-color)', background: selectedCaseUids.includes(tc._uid) ? 'rgba(168,85,247,0.05)' : 'transparent' }}>
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
                          <td style={{ padding: '10px', fontWeight: 'bold' }}>{tc.id || 'UNMAPPED'}</td>
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
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div className="glass-panel" style={{ padding: '24px', width: '640px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>Compare Matrix Diagnostics</h3>

            {/* Summary strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[
                { label: 'Matched',        count: compareData.matched.length,        color: '#10b981', bg: 'rgba(16,185,129,0.08)'  },
                { label: 'Conflicts',      count: compareData.strictConflicts.length, color: '#f43f5e', bg: 'rgba(244,63,94,0.08)'   },
                { label: 'Needs Sync',     count: compareData.needsSync.length,       color: '#f59e0b', bg: 'rgba(245,158,11,0.08)'  },
                { label: 'Missing Remote', count: compareData.missingTr.length,       color: '#6b7280', bg: 'rgba(107,114,128,0.08)' },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}30`, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: '800', color: s.color }}>{s.count}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', padding: '2px', borderRadius: '8px' }}>
              {[
                { id: 'matched',   label: `✓ Matched (${compareData.matched.length})` },
                { id: 'needsSync', label: `Needs Sync (${compareData.needsSync.length})` },
                { id: 'conflicts', label: `Conflicts (${compareData.strictConflicts.length})` },
                { id: 'missingTr', label: `Missing (${compareData.missingTr.length})` }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveCompareTab(tab.id)}
                  style={{
                    flex: 1,
                    background: activeCompareTab === tab.id ? 'var(--bg-primary)' : 'transparent',
                    border: 'none',
                    color: activeCompareTab === tab.id ? 'var(--accent-purple)' : 'var(--text-secondary)',
                    padding: '8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: '600'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ height: '250px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px' }}>

              {activeCompareTab === 'matched' && (
                compareData.matched.length === 0
                  ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No perfectly matched cases found.</div>
                  : <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                          <th style={{ textAlign: 'left', padding: '4px' }}>Case ID</th>
                          <th style={{ textAlign: 'left', padding: '4px' }}>Title</th>
                          <th style={{ textAlign: 'left', padding: '4px' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compareData.matched.map((c, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '6px 4px', fontWeight: 'bold' }}>{c.id}</td>
                            <td style={{ padding: '6px 4px' }}>{c.title}</td>
                            <td style={{ padding: '6px 4px' }}>
                              <span style={{ color: '#10b981', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                ✓ {c.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
              )}

              {activeCompareTab === 'needsSync' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ textAlign: 'left', padding: '4px' }}>Case ID</th>
                      <th style={{ textAlign: 'left', padding: '4px' }}>Remote Title</th>
                      <th style={{ textAlign: 'left', padding: '4px' }}>Remote Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareData.needsSync.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '6px 4px', fontWeight: 'bold' }}>{c.id}</td>
                        <td style={{ padding: '6px 4px' }}>{c.title}</td>
                        <td style={{ padding: '6px 4px', color: 'var(--accent-pink)', fontWeight: 'bold' }}>{c.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeCompareTab === 'conflicts' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ textAlign: 'left', padding: '4px' }}>Case ID</th>
                      <th style={{ textAlign: 'left', padding: '4px' }}>Title</th>
                      <th style={{ textAlign: 'left', padding: '4px' }}>Local</th>
                      <th style={{ textAlign: 'left', padding: '4px' }}>Remote</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareData.strictConflicts.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '6px 4px', fontWeight: 'bold' }}>{c.id}</td>
                        <td style={{ padding: '6px 4px' }}>{c.title}</td>
                        <td style={{ padding: '6px 4px', color: 'var(--accent-green)', fontWeight: 'bold' }}>{c.local}</td>
                        <td style={{ padding: '6px 4px', color: 'var(--accent-red)', fontWeight: 'bold' }}>{c.remote}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {activeCompareTab === 'missingTr' && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ textAlign: 'left', padding: '4px' }}>Case ID</th>
                      <th style={{ textAlign: 'left', padding: '4px' }}>Title</th>
                      <th style={{ textAlign: 'left', padding: '4px' }}>Local Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareData.missingTr.map((c, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '6px 4px', fontWeight: 'bold' }}>{c.id}</td>
                        <td style={{ padding: '6px 4px' }}>{c.title}</td>
                        <td style={{ padding: '6px 4px' }}>{c.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setCompareModalOpen(false)}
                className="glow-btn"
                style={{ padding: '8px 16px' }}
              >
                Done
              </button>
            </div>
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

      {/* Global Tags Datalist */}
      <datalist id="global-tags-list">
        {globalTags.map((tag, idx) => (
          <option key={idx} value={tag} />
        ))}
      </datalist>

    </div>
  );
};

export default SyncHub;
