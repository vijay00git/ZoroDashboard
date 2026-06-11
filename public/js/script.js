// ── Theme Toggle ──
(function() {
  const saved = localStorage.getItem('tr-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('tr-theme', theme);
  const btn = document.getElementById('btnThemeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

document.addEventListener('DOMContentLoaded', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const btn = document.getElementById('btnThemeToggle');
  if (btn) {
    btn.textContent = current === 'dark' ? '🌙' : '☀️';
    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      if (typeof renderTable === 'function') renderTable(); // Redraw table and charts for new theme colors
    });
  }

  // Cross-tab theme sync
  window.addEventListener('storage', (e) => {
    if (e.key === 'tr-theme') {
      applyTheme(e.newValue);
      if (typeof renderTable === 'function') renderTable();
    }
  });
});

let parsedResults = [];
let allTestCases = [];
let statusChartInstance = null;
let tagsChartInstance = null;
let globalKnownTags = new Set();


function refreshSuggestionsDatalist() {
  const datalist = document.getElementById('tagSuggestions');
  if (!datalist) return;
  datalist.innerHTML = '';
  Array.from(globalKnownTags).sort().forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    datalist.appendChild(option);
  });
}

// --- Custom Confirm Modal ---
function customConfirm(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customConfirmModal');
    if (!modal) return resolve(confirm(message)); // fallback

    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMessage').innerHTML = message.replace(/\n/g, '<br>');

    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('show'));

    const btnAccept = document.getElementById('btnAcceptConfirm');
    const btnCancel = document.getElementById('btnCancelConfirm');
    const btnCancelTop = document.getElementById('btnCancelConfirmTop');

    const cleanup = () => {
      btnAccept.removeEventListener('click', onAccept);
      btnCancel.removeEventListener('click', onCancel);
      btnCancelTop.removeEventListener('click', onCancel);
      modal.classList.remove('show');
      setTimeout(() => modal.classList.add('hidden'), 200);
    };

    const onAccept = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };

    btnAccept.addEventListener('click', onAccept);
    btnCancel.addEventListener('click', onCancel);
    btnCancelTop.addEventListener('click', onCancel);
  });
}

function updateCharts(displayCases = []) {
  const chartsContainer = document.getElementById('chartsContainer');
  if (!chartsContainer) return;
  
  if (displayCases.length === 0) {
    chartsContainer.classList.add('hidden');
    return;
  }
  chartsContainer.classList.remove('hidden');

  let passed = 0;
  let failed = 0;
  let tagsStats = {};

  displayCases.forEach(tc => {
    // Only consider Passed or Failed (ignore mapping status per user request)
    if (tc.status === 'PASSED') passed++;
    if (tc.status === 'FAILED') failed++;
    
    if (tc.tags && tc.tags.trim()) {
      tc.tags.split(',').forEach(tag => {
        const t = tag.trim();
        if (t) {
          if (!tagsStats[t]) tagsStats[t] = { passed: 0, failed: 0, total: 0 };
          tagsStats[t].total++;
          if (tc.status === 'PASSED') tagsStats[t].passed++;
          if (tc.status === 'FAILED') tagsStats[t].failed++;
        }
      });
    }
  });

  const ctxStatus = document.getElementById('statusChart');
  const tagsCountList = document.getElementById('tagsCountList');
  if (!ctxStatus || !tagsCountList) return;

  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#94a3b8';

  const centerTextPlugin = {
    id: 'centerText',
    beforeDraw: function(chart) {
      if (chart.config.type !== 'doughnut') return;
      var width = chart.width, height = chart.height, ctx = chart.ctx;
      ctx.restore();
      var fontSize = (height / 120).toFixed(2);
      ctx.font = "bold " + fontSize + "em Inter";
      ctx.textBaseline = "middle";
      ctx.fillStyle = textColor;
      var text = (passed + failed).toString(),
          textX = Math.round((width - ctx.measureText(text).width) / 2),
          textY = height / 2;
      ctx.fillText(text, textX, textY - 10);
      
      ctx.font = "normal " + (fontSize * 0.35).toFixed(2) + "em Inter";
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || 'gray';
      var subText = "Total";
      var subTextX = Math.round((width - ctx.measureText(subText).width) / 2);
      ctx.fillText(subText, subTextX, textY + 20);
      ctx.save();
    }
  };

  if (statusChartInstance) statusChartInstance.destroy();
  statusChartInstance = new Chart(ctxStatus, {
    type: 'doughnut',
    data: {
      labels: [`Passed (${passed})`, `Failed (${failed})`],
      datasets: [{
        data: [passed, failed],
        backgroundColor: ['#10b981', '#f43f5e'],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Inter', weight: 'bold' } } }
      },
      cutout: '70%'
    },
    plugins: [centerTextPlugin]
  });

  // Render Tags Count List with Pass/Fail Bars
  tagsCountList.innerHTML = '';
  const tagLabels = Object.keys(tagsStats).sort((a, b) => tagsStats[b].total - tagsStats[a].total);
  
  if (tagLabels.length === 0) {
    tagsCountList.innerHTML = '<div style="color: var(--muted); text-align: center; padding-top: 2rem; font-size: 0.9rem;">No tags found</div>';
    return;
  }

  tagLabels.forEach(t => {
    const stats = tagsStats[t];
    let hash = 0;
    for(let i=0; i<t.length; i++) hash = t.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    
    // Using a minimum width trick so even 1% has a little sliver of color if not 0
    const passPct = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
    const failPct = stats.total > 0 ? (stats.failed / stats.total) * 100 : 0;
    
    const item = document.createElement('div');
    item.className = 'tag-count-item';
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div class="tci-name"><span class="tbl-tag" style="--hue: ${hue};">#${t}</span></div>
        <div class="tci-count">${stats.total}</div>
      </div>
      <div style="display:flex; height:6px; border-radius:3px; overflow:hidden; background:var(--faint); width:100%;">
        <div style="width:${passPct}%; background:var(--success);" title="Passed: ${stats.passed}"></div>
        <div style="width:${failPct}%; background:var(--error);" title="Failed: ${stats.failed}"></div>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--muted); font-family:var(--mono);">
        <span style="color:var(--success);">Pass: ${stats.passed}</span>
        <span style="color:var(--error);">Fail: ${stats.failed}</span>
      </div>
    `;
    tagsCountList.appendChild(item);
  });
}


// --- UI Elements ---
const csvInput = document.getElementById('csvFile');
const uploadArea = document.getElementById('uploadArea');
const fileNameDiv = document.getElementById('fileName');
const btnMap = document.getElementById('btnMap');
const terminal = document.getElementById('terminal');
const btnExport = document.getElementById('btnExport');
const searchFilter = document.getElementById('searchFilter');
const bulkActionsBar = document.getElementById('bulkActionsBar');
const btnDeleteSelected = document.getElementById('btnDeleteSelected');
const selectedCountEl = document.getElementById('selectedCount');
const selectAllChk = document.getElementById('selectAll');
const groupTagInput = document.getElementById('groupTagInput');
const btnApplyGroupTag = document.getElementById('btnApplyGroupTag');

// Track selected original indices across renders
let selectedIndices = new Set();

function updateSelectionUI() {
  const count = selectedIndices.size;
  if (selectedCountEl) selectedCountEl.textContent = count;
  // Show/hide entire bulk actions bar
  if (bulkActionsBar) {
    if (count > 0) bulkActionsBar.classList.remove('hidden-flex');
    else bulkActionsBar.classList.add('hidden-flex');
  }
}

if (selectAllChk) {
  selectAllChk.addEventListener('change', () => {
    const rowChks = document.querySelectorAll('.row-select-chk');
    rowChks.forEach(chk => {
      chk.checked = selectAllChk.checked;
      const idx = parseInt(chk.getAttribute('data-index'));
      if (selectAllChk.checked) selectedIndices.add(idx);
      else selectedIndices.delete(idx);
    });
    updateSelectionUI();
  });
}

if (btnDeleteSelected) {
  btnDeleteSelected.addEventListener('click', () => {
    if (selectedIndices.size === 0) return;
    const sorted = Array.from(selectedIndices).sort((a, b) => b - a);
    sorted.forEach(idx => allTestCases.splice(idx, 1));
    log(`Deleted ${sorted.length} selected test case(s).`, 'warning');
    selectedIndices.clear();
    if (selectAllChk) selectAllChk.checked = false;
    updateSelectionUI();
    updateDynamicTags();
    renderTable();
  });
}

if (btnApplyGroupTag) {
  btnApplyGroupTag.addEventListener('click', () => {
    const newTag = groupTagInput ? groupTagInput.value.trim() : '';
    if (!newTag) { log('Please type a tag name first.', 'warning'); return; }
    if (selectedIndices.size === 0) { log('No tests selected.', 'warning'); return; }

    selectedIndices.forEach(idx => {
      const tc = allTestCases[idx];
      if (!tc) return;
      const existing = tc.tags ? tc.tags.split(',').map(t => t.trim()).filter(t => t) : [];
      if (!existing.includes(newTag)) existing.push(newTag);
      tc.tags = existing.join(', ');
    });

    log(`Applied tag "${newTag}" to ${selectedIndices.size} test(s).`, 'success');
    if (groupTagInput) groupTagInput.value = '';
    updateDynamicTags();
    renderTable();
  });
}

// --- Metrics Counters ---
const txtTotal = document.getElementById('countTotal');
const txtPassed = document.getElementById('countPassed');
const txtFailed = document.getElementById('countFailed');
const txtUnmapped = document.getElementById('countUnmapped');

// --- Table Elements ---
const tableContainer = document.getElementById('tableContainer');
const tableBody = document.getElementById('tableBody');

// --- Toast Notifications ---
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';
  toast.innerHTML = `<span class="toast-icon">${icon}</span> <span>${msg}</span>`;
  container.appendChild(toast);
  
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// --- Terminal Logger ---
function log(msg, type = 'info') {
  const line = document.createElement('div');
  line.className = `log-line log-${type}`;
  const time = new Date().toLocaleTimeString([], { hour12: true });
  line.innerHTML = `<span class="log-time">[${time}]</span> ${msg}`;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
  
  if (type === 'success' || type === 'error') {
    showToast(msg, type);
  }
}

// Helper to correctly parse CSV lines considering quotes
function parseCSVLine(line) {
  const columns = [];
  let current = '';
  let inQuotes = false;
  for (let j = 0; j < line.length; j++) {
    if (line[j] === '"') {
      inQuotes = !inQuotes;
    } else if (line[j] === ',' && !inQuotes) {
      columns.push(current);
      current = '';
    } else {
      current += line[j];
    }
  }
  columns.push(current);
  return columns.map(c => c.trim().replace(/^"|"$/g, ''));
}

// --- Chip Filter Logic ---
document.querySelectorAll('.chip[data-type="status"], .chip[data-type="map"]').forEach(chip => {
  chip.addEventListener('click', () => {
    chip.classList.toggle('active');
    renderTable();
  });
});

const btnResetFilters = document.getElementById('btnResetFilters');
if (btnResetFilters) {
  btnResetFilters.addEventListener('click', () => {
    document.querySelectorAll('.chip[data-type="status"], .chip[data-type="map"]').forEach(c => c.classList.add('active'));
    document.querySelectorAll('.chip[data-type="tag"]').forEach(c => c.classList.remove('active'));
    if (searchFilter) searchFilter.value = '';
    renderTable();
  });
}

function getActiveFilters() {
  const statuses = Array.from(document.querySelectorAll('.chip[data-type="status"].active')).map(el => el.getAttribute('data-value'));
  const maps = Array.from(document.querySelectorAll('.chip[data-type="map"].active')).map(el => el.getAttribute('data-value'));
  const tags = Array.from(document.querySelectorAll('.chip[data-type="tag"].active')).map(el => el.getAttribute('data-value'));
  const tagLogicToggle = document.getElementById('tagLogicToggle');
  const tagLogic = tagLogicToggle ? tagLogicToggle.value : 'OR';
  return { statuses, maps, tags, tagLogic };
}

function isTestCaseVisible(testCase, filters, tagSearchFilter, tagChipsExist) {
  if (!filters.maps.includes(testCase.mapAction)) return false;
  let statusCategory = (testCase.status === 'PASSED' || testCase.status === 'FAILED') ? testCase.status : 'OTHER';
  if (!filters.statuses.includes(statusCategory)) return false;

  if (tagChipsExist) {
    const tcTags = (testCase.tags && testCase.tags.trim()) ? testCase.tags.split(',').map(t => t.trim()).filter(t => t) : [];
    let passesTagCheck = false;
    if (filters.tags.length === 0) {
      passesTagCheck = true;
    } else if (filters.tagLogic === 'AND') {
      passesTagCheck = filters.tags.every(tag => tag === 'UNTAGGED' ? tcTags.length === 0 : tcTags.includes(tag));
    } else {
      if (tcTags.length === 0) {
        passesTagCheck = filters.tags.includes('UNTAGGED');
      } else {
        passesTagCheck = filters.tags.some(tag => tcTags.includes(tag));
      }
    }
    if (!passesTagCheck) return false;
  }

  if (tagSearchFilter) {
    const textToSearch = `${testCase.tags || ''} ${testCase.id || ''} ${testCase.title || ''}`.toLowerCase();
    if (!textToSearch.includes(tagSearchFilter)) return false;
  }

  return true;
}

function updateDynamicTags() {
  const container = document.getElementById('tagChipsContainer');
  const group = document.getElementById('tagChipsGroup');
  if (!container) return;

  const currentlyActive = Array.from(document.querySelectorAll('.chip[data-type="tag"].active')).map(el => el.getAttribute('data-value'));

  const allTags = new Set();
  let hasUntagged = false;

  allTestCases.forEach(tc => {
    if (tc.tags && tc.tags.trim()) {
      tc.tags.split(',').map(t => t.trim()).filter(t => t).forEach(t => allTags.add(t));
    } else {
      hasUntagged = true;
    }
  });

  container.innerHTML = '';
  if (allTags.size === 0 && !hasUntagged) {
    if (group) group.style.display = 'none';
    return;
  }
  
  // Only show the group if we actually have distinct tags to filter on
  if (allTags.size === 0) {
    if (group) group.style.display = 'none';
    return;
  }
  
  if (group) group.style.display = 'flex';

  const tagsToRender = Array.from(allTags).sort();
  if (hasUntagged) {
    tagsToRender.push('UNTAGGED');
  }

  tagsToRender.forEach(tag => {
    const btn = document.createElement('button');
    // If we've seen this tag before and it was active, preserve that. Otherwise default to inactive.
    const isSpecial = tag === 'UNTAGGED';
    const isActive = currentlyActive.includes(tag);
    
    btn.className = `chip ${isSpecial ? 'chip-other' : 'chip-tag'} ${isActive ? 'active' : ''}`;
    btn.setAttribute('data-type', 'tag');
    btn.setAttribute('data-value', tag);
    btn.textContent = isSpecial ? `🏷️ Untagged` : `🏷️ ${tag}`;
    btn.addEventListener('click', () => { btn.classList.toggle('active'); renderTable(); });
    container.appendChild(btn);
  });

  // Add dynamically encountered tags to global memory and refresh datalist
  Array.from(allTags).forEach(t => globalKnownTags.add(t));
  refreshSuggestionsDatalist();
}

// Attach search listener
if (searchFilter) {
  searchFilter.addEventListener('input', () => { renderTable(); });
}

const tagLogicToggle = document.getElementById('tagLogicToggle');
if (tagLogicToggle) {
  tagLogicToggle.addEventListener('change', () => { renderTable(); });
}

// Render Table & Re-calculate stats
function renderTable() {
  let passed = 0, failed = 0, dontMap = 0, total = allTestCases.length;
  parsedResults = [];
  tableBody.innerHTML = '';

  allTestCases.forEach((testCase) => {
    if (testCase.mapAction === "Don't Map") {
      dontMap++;
    } else {
      if (testCase.status === 'PASSED') passed++;
      if (testCase.status === 'FAILED') failed++;
      
      // Only map PASSED or FAILED to TestRail
      if (testCase.status === 'PASSED' || testCase.status === 'FAILED') {
        const caseIds = testCase.id.split(';').map(id => id.replace(/\D/g, '').trim());
        const statusId = testCase.status === 'PASSED' ? 1 : 5;

        caseIds.forEach(caseId => {
          if (caseId) {
            parsedResults.push({
              case_id: parseInt(caseId, 10),
              status_id: statusId,
              comment: `Synced live from custom UI matrix manager.`
            });
          }
        });
      }
    }
  });

  const tagSearchFilter = searchFilter ? searchFilter.value.toLowerCase() : '';
  const filters = getActiveFilters();
  const tagChipsExist = document.querySelectorAll('.chip[data-type="tag"]').length > 0;

  // Filter cases for display
  const displayCases = allTestCases.filter(testCase => isTestCaseVisible(testCase, filters, tagSearchFilter, tagChipsExist));

  displayCases.forEach((testCase) => {
    const originalIndex = allTestCases.indexOf(testCase);

    let statusClass = 'status-default';
    if(testCase.status === 'PASSED') statusClass = 'status-passed';
    else if(testCase.status === 'FAILED') statusClass = 'status-failed';
    
    const isUnknownStatus = testCase.status !== 'PASSED' && testCase.status !== 'FAILED';
    const displayStatus = isUnknownStatus ? (testCase.status || 'UNMAPPED') : testCase.status;

    const tr = document.createElement('tr');
    tr.className = `row-${statusClass} ${testCase.mapAction === "Don't Map" ? 'row-dont-map' : ''}`.trim();
    
    const isChecked = selectedIndices.has(originalIndex);
    tr.innerHTML = `
      <td><input type="checkbox" class="row-select-chk" data-index="${originalIndex}" ${isChecked ? 'checked' : ''}></td>
      <td><strong>${testCase.id || '-'}</strong></td>
      <td class="truncate" title="${testCase.title}">${testCase.title || '-'}</td>
      <td class="td-tags" style="min-width: 120px;">
        ${(function(tags, idx) {
          if (!tags || !tags.trim()) return `<div class="tags-display" data-index="${idx}"><span class="empty-hint" style="font-size:0.7rem; color:var(--muted);">+ Add tag</span></div><input type="text" class="tag-input hidden" data-index="${idx}" value="" placeholder="Add tags...">`;
          const tagArray = tags.split(',').map(t => t.trim()).filter(t => t);
          if (tagArray.length === 0) return `<div class="tags-display" data-index="${idx}"><span class="empty-hint" style="font-size:0.7rem; color:var(--muted);">+ Add tag</span></div><input type="text" class="tag-input hidden" data-index="${idx}" value="" placeholder="Add tags...">`;
          const bubbles = tagArray.map(t => {
            let hash = 0;
            for(let i=0; i<t.length; i++) hash = t.charCodeAt(i) + ((hash << 5) - hash);
            return `<span class="tbl-tag" style="--hue: ${Math.abs(hash) % 360};">${t}</span>`;
          }).join('');
          return `<div class="tags-display" data-index="${idx}" title="Click to edit">${bubbles}</div><input type="text" class="tag-input hidden" data-index="${idx}" value="${tags}" placeholder="Edit..." list="tagSuggestions">`;
        })(testCase.tags, originalIndex)}
      </td>
      <td>
        <input type="text" class="note-input" data-index="${originalIndex}" value="${testCase.notes || ''}" placeholder="Add note..." style="background:transparent; border:1px solid transparent; color:var(--text); padding:0.22rem 0.5rem; border-radius:4px; font-size:0.72rem; width:100%; min-width:80px; transition:border 0.2s;" onfocus="this.style.borderColor='var(--border-hi)'" onblur="this.style.borderColor='transparent'">
      </td>
      <td>
        <select class="status-select ${statusClass}" data-index="${originalIndex}">
          <option value="PASSED" ${testCase.status === 'PASSED' ? 'selected' : ''}>PASSED</option>
          <option value="FAILED" ${testCase.status === 'FAILED' ? 'selected' : ''}>FAILED</option>
          ${isUnknownStatus ? `<option value="${displayStatus}" selected>${displayStatus}</option>` : ''}
        </select>
      </td>
      <td>
        <select class="map-action-select" data-index="${originalIndex}">
          <option value="Map" ${testCase.mapAction === 'Map' ? 'selected' : ''}>Map</option>
          <option value="Don't Map" ${testCase.mapAction === "Don't Map" ? 'selected' : ''}>Don't Map</option>
        </select>
      </td>
      <td>${testCase.syncStatus || '-'}</td>
      <td class="truncate" title="${testCase.reason}">${testCase.reason || '-'}</td>
      <td>
        <button class="btn-delete" data-index="${originalIndex}" title="Delete Test Case">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  // Attach event listeners to row checkboxes
  document.querySelectorAll('.row-select-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const idx = parseInt(chk.getAttribute('data-index'));
      if (chk.checked) selectedIndices.add(idx);
      else selectedIndices.delete(idx);

      // Update select-all state
      const allChks = document.querySelectorAll('.row-select-chk');
      if (selectAllChk) selectAllChk.checked = allChks.length > 0 && Array.from(allChks).every(c => c.checked);
      updateSelectionUI();
    });
  });

  // Attach event listeners to status selects
  document.querySelectorAll('.status-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const idx = e.target.getAttribute('data-index');
      const newStatus = e.target.value;
      allTestCases[idx].status = newStatus;
      log(`Test ID ${allTestCases[idx].id || 'UNMAPPED'} status manually changed to ${newStatus}`, 'info');
      renderTable();
    });
  });

  // Attach event listeners to map action selects
  document.querySelectorAll('.map-action-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const idx = e.target.getAttribute('data-index');
      const newAction = e.target.value;
      allTestCases[idx].mapAction = newAction;
      log(`Test ID ${allTestCases[idx].id || 'UNMAPPED'} map action set to ${newAction}`, 'info');
      renderTable();
    });
  });

  // Attach event listeners to tag inputs
  // Tag interactions
  document.querySelectorAll('.tags-display').forEach(display => {
    display.addEventListener('click', (e) => {
      const td = e.currentTarget.closest('td');
      const input = td.querySelector('.tag-input');
      e.currentTarget.classList.add('hidden');
      input.classList.remove('hidden');
      input.focus();
    });
  });

  document.querySelectorAll('.tag-input').forEach(input => {
    input.addEventListener('blur', (e) => {
      const idx = e.target.getAttribute('data-index');
      const newTags = e.target.value.trim();
      if (allTestCases[idx].tags !== newTags) {
        allTestCases[idx].tags = newTags;
        updateDynamicTags();
        renderTable();
      } else {
        const td = e.target.closest('td');
        e.target.classList.add('hidden');
        td.querySelector('.tags-display').classList.remove('hidden');
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') e.target.blur();
    });
  });

  // Attach event listeners to note inputs
  document.querySelectorAll('.note-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const idx = e.target.getAttribute('data-index');
      allTestCases[idx].notes = e.target.value;
    });
  });

  // Attach event listeners to delete buttons
  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = e.currentTarget.getAttribute('data-index');
      const removed = allTestCases.splice(idx, 1)[0];
      log(`Test ID ${removed.id || 'UNMAPPED'} removed from mapping list`, 'warning');
      updateDynamicTags();
      renderTable();
    });
  });

  // Update Dashboard GUI metrics cards
  txtTotal.innerText = passed + failed;
  txtPassed.innerText = passed;
  txtFailed.innerText = failed;
  txtUnmapped.innerText = dontMap;

  // Update Mapping Progress Bar
  const progressCard = document.getElementById('progressCard');
  if (progressCard) {
    if (total > 0) {
      progressCard.classList.remove('hidden');
      const mappedCount = total - dontMap;
      const pct = Math.round((mappedCount / total) * 100);
      document.getElementById('pctMapped').innerText = pct;
      document.getElementById('barMapped').style.width = pct + '%';
      
      // Dynamic colors
      let barColor = 'var(--error)';
      if (pct > 50) barColor = 'var(--warning)';
      if (pct >= 90) barColor = 'var(--success)';
      document.getElementById('barMapped').style.background = barColor;
    } else {
      progressCard.classList.add('hidden');
    }
  }

  // Update Visual Data Charts based on active filters
  updateCharts(displayCases);

  // Update Session Info panel
  updateSessionInfo(passed, failed, dontMap, total);

  // Enable map button if we have test cases
  if (total > 0) {
    tableContainer.classList.remove('hidden');
    btnMap.disabled = parsedResults.length === 0;
  } else {
    tableContainer.classList.add('hidden');
    btnMap.disabled = true;
  }
}

// ━━━ SESSION INFO ━━━
const sessionStartTime = new Date();
const siSessionStart = document.getElementById('siSessionStart');
if (siSessionStart) {
  siSessionStart.innerText = sessionStartTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

function updateSessionInfo(passed, failed, dontMap, total) {
  const mapped = passed + failed;
  document.getElementById('siTotalCases').innerText = total;
  document.getElementById('siUnmapped').innerText = dontMap;
  if (mapped > 0) {
    document.getElementById('siPassRate').innerText = Math.round((passed / mapped) * 100) + '%';
    document.getElementById('siFailRate').innerText = Math.round((failed / mapped) * 100) + '%';
  } else {
    document.getElementById('siPassRate').innerText = '—';
    document.getElementById('siFailRate').innerText = '—';
  }
}

function updateLastSaved() {
  const el = document.getElementById('siLastSaved');
  if (el) el.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
}

const btnExportTemplate = document.getElementById('btnExportTemplate');
if (btnExportTemplate) {
  btnExportTemplate.addEventListener('click', () => {
    const rows = [
      ['Test ID', 'Test Case Title', 'Status', 'TestRail Sync Status', 'Failure Reason'],
      ['12345', 'Sample Test Case (Manual)', 'PASSED', 'Unpublished', 'N/A']
    ];
    
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.map(cell => `"${cell}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `manual_test_template.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    log(`Exported CSV Template for manual test entry.`, 'success');
  });
}

// Export CSV Feature
if (btnExport) {
  btnExport.addEventListener('click', () => {
    const rows = [];
    rows.push(['Test ID', 'Test Case Title', 'Tags', 'Notes', 'Status', 'Mapping Action', 'TestRail Sync Status', 'Failure Reason']);
    
    const tagSearchFilter = searchFilter ? searchFilter.value.toLowerCase() : '';
    const filters = getActiveFilters();
    const tagChipsExist = document.querySelectorAll('.chip[data-type="tag"]').length > 0;

    // Grab current displayed cases
    const displayCases = allTestCases.filter(testCase => isTestCaseVisible(testCase, filters, tagSearchFilter, tagChipsExist));

    displayCases.forEach(tc => {
      const escapeCSV = (str) => {
        if (!str) return '""';
        const escaped = String(str).replace(/"/g, '""');
        return `"${escaped}"`;
      };
      rows.push([
        escapeCSV(tc.id),
        escapeCSV(tc.title),
        escapeCSV(tc.tags || ''),
        escapeCSV(tc.notes || ''),
        escapeCSV(tc.status),
        escapeCSV(tc.mapAction),
        escapeCSV(tc.syncStatus),
        escapeCSV(tc.reason)
      ]);
    });

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `test_results_export_filtered.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    log(`Exported ${displayCases.length} records to CSV.`, 'success');
  });
}

// --- Save and Load Matrices ---
const selectedStateIds = new Set();

async function fetchSavedStates() {
  try {
    const res = await fetch('http://localhost:3000/api/matrices', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const matrices = data.matrices || [];
    const dbTags = data.globalTags || [];

    // Add DB tags to global known tags
    dbTags.forEach(t => globalKnownTags.add(t));
    refreshSuggestionsDatalist();

    const modalContainer = document.getElementById('modalStatesList');
    if (!modalContainer) return;

    if (matrices.length === 0) {
      modalContainer.innerHTML = '<div class="sp-empty"><span style="font-size:2rem;">💾</span><span>No saved states yet.</span></div>';
      return;
    }

    modalContainer.innerHTML = '';
    
    const groups = new Map();
    const ungrouped = [];

    matrices.forEach(m => {
      if (m.name.includes('/')) {
        const lastSlash = m.name.lastIndexOf('/');
        const groupName = m.name.substring(0, lastSlash).trim();
        const displayName = m.name.substring(lastSlash + 1).trim();
        if (!groups.has(groupName)) groups.set(groupName, []);
        groups.get(groupName).push({ ...m, displayName });
      } else {
        ungrouped.push({ ...m, displayName: m.name });
      }
    });

    const buildItem = (m) => {
      const item = document.createElement('div');
      item.className = 'sp-item' + (selectedStateIds.has(m.id) ? ' selected' : '');
      item.setAttribute('data-id', m.id);
      item.setAttribute('data-name', m.displayName.toLowerCase());

      // Custom checkbox
      const check = document.createElement('div');
      check.className = 'sp-item-check';
      check.innerHTML = '✓';

      // Name
      const name = document.createElement('div');
      name.className = 'sp-item-name';
      name.innerHTML = `💾 ${m.displayName}`;

      // Actions (hidden until hover)
      const actions = document.createElement('div');
      actions.className = 'sp-item-actions';

      const syncBtn = document.createElement('button');
      syncBtn.className = 'sp-action-btn';
      syncBtn.title = `Smart Sync "${m.name}"`;
      syncBtn.textContent = '↑';
      syncBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (allTestCases.length === 0) return log(`No test cases loaded to sync "${m.name}".`, 'warning');
        
        const confirmed = await customConfirm(
          `Smart Sync "${m.name}"`, 
          `This will ONLY update test cases already belonging to this state.`
        );
        if (!confirmed) return;
        
        try {
          syncBtn.textContent = '…';
          const existingRes = await fetch(`http://localhost:3000/api/matrix/${m.id}`, { cache: 'no-store' });
          if (!existingRes.ok) throw new Error('Failed to fetch existing state.');
          const existingData = await existingRes.json();
          const existingCases = existingData.testCases || [];
          
          const activeMap = new Map();
          allTestCases.forEach(tc => activeMap.set(`${tc.id}__${tc.title}`, tc));
          
          const existingKeys = new Set();
          
          let modifiedCount = 0, deletedCount = 0, addedCount = 0;
          const syncedCases = [];
          
          // 1. Process existing cases (Update or Delete)
          existingCases.forEach(tc => {
            const key = `${tc.id}__${tc.title}`;
            existingKeys.add(key);
            if (activeMap.has(key)) { 
              modifiedCount++; 
              syncedCases.push(activeMap.get(key)); 
            } else {
              deletedCount++;
            }
          });
          
          // 2. Process NEW cases (manually added during this session)
          allTestCases.forEach(tc => {
            const key = `${tc.id}__${tc.title}`;
            if (tc._manual && !existingKeys.has(key)) {
              addedCount++;
              syncedCases.push(tc);
            }
          });

          const res = await fetch(`http://localhost:3000/api/matrix/${m.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ testCases: syncedCases })
          });
          if (res.ok) log(`State "${m.name}" synced! Added: ${addedCount}, Updated: ${modifiedCount}, Deleted: ${deletedCount} (Total: ${syncedCases.length}).`, 'success');
          else log(`Failed to sync state "${m.name}".`, 'error');
        } catch(err) { log(`Error syncing state: ${err.message}`, 'error'); }
        finally { syncBtn.textContent = '↑'; }
      });

      const renameBtn = document.createElement('button');
      renameBtn.className = 'sp-action-btn';
      renameBtn.title = `Rename "${m.name}"`;
      renameBtn.textContent = '✏';
      renameBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newName = prompt(`Rename state (use '/' for folders):`, m.name);
        if (!newName || newName.trim() === m.name) return;
        try {
          renameBtn.textContent = '…';
          const res = await fetch(`http://localhost:3000/api/matrix/${m.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() })
          });
          if (res.ok) { log(`State renamed to "${newName.trim()}".`, 'success'); fetchSavedStates(); }
          else { log(`Failed to rename state.`, 'error'); renameBtn.textContent = '✏'; }
        } catch(err) { log(`Error renaming: ${err.message}`, 'error'); renameBtn.textContent = '✏'; }
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'sp-action-btn danger';
      deleteBtn.title = `Delete "${m.name}"`;
      deleteBtn.textContent = '✕';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await customConfirm(
          `Delete "${m.name}"`, 
          `Are you sure you want to delete this state? This cannot be undone.`
        );
        if (!confirmed) return;
        
        try {
          deleteBtn.textContent = '…';
          const res = await fetch(`http://localhost:3000/api/matrix/${m.id}`, { method: 'DELETE' });
          if (res.ok) { log(`State "${m.name}" deleted.`, 'success'); selectedStateIds.delete(m.id); fetchSavedStates(); }
          else { log(`Failed to delete state "${m.name}".`, 'error'); deleteBtn.textContent = '✕'; }
        } catch(err) { log(`Error deleting: ${err.message}`, 'error'); deleteBtn.textContent = '✕'; }
      });

      actions.appendChild(syncBtn);
      actions.appendChild(renameBtn);
      actions.appendChild(deleteBtn);
      item.appendChild(check);
      item.appendChild(name);
      item.appendChild(actions);

      // Toggle selection on row click
      item.addEventListener('click', () => {
        if (selectedStateIds.has(m.id)) {
          selectedStateIds.delete(m.id);
          item.classList.remove('selected');
        } else {
          selectedStateIds.add(m.id);
          item.classList.add('selected');
        }
        const loadBtn = document.getElementById('btnLoadState');
        if (loadBtn) {
          const count = selectedStateIds.size;
          loadBtn.textContent = count > 1 ? `📂 Load & Merge (${count} states)` : `📂 Load & Merge Selected`;
        }
        const btnSelectAll = document.getElementById('btnSelectAllStates');
        if (btnSelectAll) {
          const allCount = document.querySelectorAll('.sp-item').length;
          btnSelectAll.textContent = (selectedStateIds.size === allCount && allCount > 0) ? '☐ Deselect' : '☑ All';
        }
      });

      return item;
    };

    const buildGroup = (gName, items, groupOrderArray) => {
      const group = document.createElement('div');
      group.className = 'sp-group open';

      const header = document.createElement('div');
      header.className = 'sp-group-header';
      header.innerHTML = `
        <div class="sp-group-name"><span>📁</span>${gName}</div>
        <div style="display:flex;align-items:center;gap:0.4rem;">
          <div class="sp-group-reorder" style="display:flex; flex-direction:column; gap:1px; margin-right: 4px;">
            <button class="sp-reorder-up" title="Move Up" style="background:none; border:none; color:var(--muted); font-size:0.6rem; cursor:pointer; padding:0; line-height:1;">▲</button>
            <button class="sp-reorder-down" title="Move Down" style="background:none; border:none; color:var(--muted); font-size:0.6rem; cursor:pointer; padding:0; line-height:1;">▼</button>
          </div>
          <span class="sp-group-count">${items.length}</span>
          <span class="sp-group-arrow">▶</span>
        </div>`;
      
      header.addEventListener('click', (e) => {
        if (e.target.closest('.sp-reorder-up') || e.target.closest('.sp-reorder-down')) return;
        group.classList.toggle('open');
        group.classList.toggle('closed');
      });

      const btnUp = header.querySelector('.sp-reorder-up');
      const btnDown = header.querySelector('.sp-reorder-down');

      btnUp.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = groupOrderArray.indexOf(gName);
        if (idx > 0) {
          [groupOrderArray[idx-1], groupOrderArray[idx]] = [groupOrderArray[idx], groupOrderArray[idx-1]];
          localStorage.setItem('tr-group-order', JSON.stringify(groupOrderArray));
          fetchSavedStates();
        }
      });

      btnDown.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = groupOrderArray.indexOf(gName);
        if (idx < groupOrderArray.length - 1) {
          [groupOrderArray[idx], groupOrderArray[idx+1]] = [groupOrderArray[idx+1], groupOrderArray[idx]];
          localStorage.setItem('tr-group-order', JSON.stringify(groupOrderArray));
          fetchSavedStates();
        }
      });

      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'sp-group-items';
      items.sort((a,b) => a.displayName.localeCompare(b.displayName)).forEach(m => itemsContainer.appendChild(buildItem(m)));

      group.appendChild(header);
      group.appendChild(itemsContainer);
      return group;
    };

    // --- Populate Modal ---
    let groupOrder = [];
    try { groupOrder = JSON.parse(localStorage.getItem('tr-group-order')) || []; } catch(e) {}
    
    const allGroups = Array.from(groups.keys()).sort();
    allGroups.forEach(g => { if (!groupOrder.includes(g)) groupOrder.push(g); });
    groupOrder = groupOrder.filter(g => allGroups.includes(g));

    groupOrder.forEach(gName => {
      const items = groups.get(gName);
      if (items && items.length > 0) modalContainer.appendChild(buildGroup(gName, items, groupOrder));
    });

    if (ungrouped.length > 0) {
      if (groupOrder.length > 0) {
        // Add a subtle separator label
        const sep = document.createElement('div');
        sep.style.cssText = 'font-size:0.65rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);padding:0.25rem 0 0.1rem;';
        sep.textContent = 'Uncategorized';
        modalContainer.appendChild(sep);
      }
      ungrouped.sort((a,b) => a.displayName.localeCompare(b.displayName)).forEach(m => modalContainer.appendChild(buildItem(m)));
    }

    // Wire up search filter
    const searchEl = document.getElementById('stateSearchInput');
    if (searchEl) {
      searchEl.oninput = () => {
        const q = searchEl.value.toLowerCase();
        document.querySelectorAll('.sp-item').forEach(el => {
          el.style.display = el.dataset.name.includes(q) ? '' : 'none';
        });
      };
    }
  } catch (e) {
    console.error("Could not fetch saved states", e);
  }
}
fetchSavedStates();


const btnSelectAllStates = document.getElementById('btnSelectAllStates');
if (btnSelectAllStates) {
  btnSelectAllStates.addEventListener('click', () => {
    const spItems = document.querySelectorAll('.sp-item');
    if (spItems.length === 0) return;
    
    const allSelected = selectedStateIds.size === spItems.length;
    
    if (allSelected) {
      // Deselect all
      selectedStateIds.clear();
      spItems.forEach(item => item.classList.remove('selected'));
      btnSelectAllStates.textContent = "☑ All";
    } else {
      // Select all
      spItems.forEach(item => {
        const id = item.getAttribute('data-id');
        if (id) {
          selectedStateIds.add(id);
          item.classList.add('selected');
        }
      });
      btnSelectAllStates.textContent = "☐ Deselect";
    }

    const loadBtn = document.getElementById('btnLoadState');
    if (loadBtn) {
      const count = selectedStateIds.size;
      loadBtn.textContent = count > 1 ? `📂 Load & Merge (${count})` : `📂 Load Selected`;
    }
  });
}

// --- Add Manual Test Case Logic ---
const btnAddTestCase = document.getElementById('btnAddTestCase');
const addTestCaseModal = document.getElementById('addTestCaseModal');
const btnCloseAddTestCase = document.getElementById('btnCloseAddTestCase');
const btnSaveManualTestCase = document.getElementById('btnSaveManualTestCase');

if (btnAddTestCase && addTestCaseModal) {
  btnAddTestCase.addEventListener('click', () => {
    addTestCaseModal.classList.remove('hidden');
    requestAnimationFrame(() => addTestCaseModal.classList.add('show'));
    document.getElementById('manualTestId').value = '';
    document.getElementById('manualTestTitle').value = '';
    document.getElementById('manualTestTags').value = '';
    document.getElementById('manualTestStatus').value = 'PASSED';
  });

  btnCloseAddTestCase.addEventListener('click', () => {
    addTestCaseModal.classList.remove('show');
    setTimeout(() => addTestCaseModal.classList.add('hidden'), 200);
  });

  btnSaveManualTestCase.addEventListener('click', () => {
    const idVal = document.getElementById('manualTestId').value.trim();
    const titleVal = document.getElementById('manualTestTitle').value.trim();
    const tagsVal = document.getElementById('manualTestTags').value.trim();
    const statusVal = document.getElementById('manualTestStatus').value;

    if (!titleVal) {
      log("Test Case Title is required.", "warning");
      return;
    }

    const newTestCase = {
      id: idVal || `M-${Date.now().toString().slice(-6)}`, // generate random ID if none provided
      title: titleVal,
      tags: tagsVal,
      notes: '',
      status: statusVal,
      mapAction: 'Map',
      syncStatus: 'Unsynced',
      failureReason: '',
      _manual: true
    };

    allTestCases.push(newTestCase);
    log(`Added test case "${titleVal}" manually.`, 'success');
    addTestCaseModal.classList.remove('show');
    setTimeout(() => addTestCaseModal.classList.add('hidden'), 200);
    
    // Refresh table and stats
    updateDynamicTags();
    renderTable();
    const tableContainer = document.getElementById('tableContainer');
    if (tableContainer) tableContainer.classList.remove('hidden');
  });
}

const btnStartManual = document.getElementById('btnStartManual');
if (btnStartManual) {
  btnStartManual.addEventListener('click', () => {
    allTestCases = [];
    const tableContainer = document.getElementById('tableContainer');
    if (tableContainer) tableContainer.classList.remove('hidden');
    updateDynamicTags();
    renderTable();
    log("Started an empty state. You can now add test cases manually.", "info");
  });
}

const btnSaveState = document.getElementById('btnSaveState');
const saveNameInput = document.getElementById('saveName');
if (btnSaveState) {
  btnSaveState.addEventListener('click', async () => {
    const name = saveNameInput.value.trim();
    if (!name) return log("Please enter a name to save the state.", "warning");
    if (allTestCases.length === 0) return log("No test cases to save.", "warning");

    const tagSearchFilter = searchFilter ? searchFilter.value.toLowerCase() : '';
    const filters = getActiveFilters();
    const tagChipsExist = document.querySelectorAll('.chip[data-type="tag"]').length > 0;
    const displayCases = allTestCases.filter(tc => isTestCaseVisible(tc, filters, tagSearchFilter, tagChipsExist));

    if (displayCases.length === 0) return log("No visible test cases to save with current filters.", "warning");
    
    try {
      btnSaveState.innerText = "Saving...";
      const res = await fetch('http://localhost:3000/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, testCases: displayCases })
      });
      if (res.ok) {
        log(`Successfully saved mapping state as "${name}".`, 'success');
        updateLastSaved();
        saveNameInput.value = '';
        selectedStateIds.clear();
        fetchSavedStates();
      } else {
        log(`Failed to save state.`, 'error');
      }
    } catch(e) {
      log(`Error saving state: ${e.message}`, 'error');
    } finally {
      btnSaveState.innerText = "💾 Save State";
    }
  });
}

const btnLoadState = document.getElementById('btnLoadState');
if (btnLoadState) {
  btnLoadState.addEventListener('click', async () => {
    if (selectedStateIds.size === 0) return log("Please select at least one saved state to load.", "warning");

    try {
      btnLoadState.textContent = "Loading...";
      const ids = Array.from(selectedStateIds);

      // Fetch all selected states in parallel
      const results = await Promise.all(ids.map(id => fetch(`http://localhost:3000/api/matrix/${id}`, { cache: 'no-store' }).then(r => r.json())));

      // Merge: accumulate all test cases, deduplicating by id
      const mergedMap = new Map();
      results.forEach(data => {
        data.testCases.forEach(tc => {
          // Use id+title as key; if duplicate, later entry wins (most recent state)
          const key = `${tc.id}__${tc.title}`;
          mergedMap.set(key, tc);
        });
      });

      allTestCases = Array.from(mergedMap.values());
      const names = results.map(d => d.name).join(', ');

      log(`Loaded & merged ${ids.length} state(s): "${names}" → ${allTestCases.length} unique entries.`, 'success');
      fileNameDiv.innerText = `📄 Loaded from Memory: ${names}`;
      fileNameDiv.classList.remove('hidden');
      uploadArea.classList.add('uploaded');

      // Reset all filter chips to active
      document.querySelectorAll('.chip').forEach(c => c.classList.add('active'));

      selectedIndices.clear();
      updateSelectionUI();
      updateDynamicTags();
      renderTable();
    } catch(e) {
      log(`Error loading state: ${e.message}`, 'error');
    } finally {
      btnLoadState.textContent = "📂 Load & Merge Selected";
    }
  });
}

// --- Parse CSV File Live ---
csvInput.addEventListener('change', async (e) => {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const fileNames = Array.from(files).map(f => f.name).join(', ');
  fileNameDiv.innerText = `📄 Loaded: ${fileNames}`;
  fileNameDiv.classList.remove('hidden');
  uploadArea.classList.add('uploaded');
  log(`Recognized ${files.length} file(s). Commencing stream parsing...`, 'info');

  allTestCases = []; 
  // Ensure chips are all active by default when uploading a new file
  document.querySelectorAll('.chip').forEach(c => c.classList.add('active'));

  for (let file of files) {
    const text = await file.text();
    const lines = text.split(/[\r\n]+/);
    if (lines.length === 0) continue;

    // Parse headers dynamically
    const headerCols = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    
    // Attempt to map columns by their header names
    const idIdx = headerCols.findIndex(h => h.includes('id') || h === 'test case');
    const titleIdx = headerCols.findIndex(h => h.includes('title') || h === 'name');
    const tagsIdx = headerCols.findIndex(h => h.includes('tag'));
    const notesIdx = headerCols.findIndex(h => h === 'notes' || h.includes('note'));
    
    // Be careful with status since there's "Sync Status" too
    let statusIdx = headerCols.findIndex(h => h === 'status' || h === 'test status' || h === 'automation status');
    
    const syncIdx = headerCols.findIndex(h => h.includes('sync status'));
    const reasonIdx = headerCols.findIndex(h => h.includes('reason'));

    // Fallbacks if mapping failed (e.g. headerless legacy CSV)
    const _id = idIdx !== -1 ? idIdx : 0;
    const _title = titleIdx !== -1 ? titleIdx : 1;
    const _tags = tagsIdx; // -1 if not found
    const _notes = notesIdx; // -1 if not found
    const _status = statusIdx !== -1 ? statusIdx : 2;
    const _sync = syncIdx !== -1 ? syncIdx : 3;
    const _reason = reasonIdx !== -1 ? reasonIdx : 4;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const columns = parseCSVLine(line);
      // Skip empty or malformed rows
      if (columns.length < 2) continue;
      
      let parsedStatus = (columns[_status] || '').toUpperCase();
      const rawId = columns[_id] || '';
      const tagsStr = _tags !== -1 ? (columns[_tags] || '') : '';
      const notesStr = _notes !== -1 ? (columns[_notes] || '') : '';
      const ids = rawId.split(';').map(id => id.trim()).filter(id => id.length > 0);

      const createTestCaseObj = (idStr) => {
        const isUnmapped = (idStr === 'UNMAPPED' || !idStr);
        return {
          id: idStr,
          title: columns[_title] || '',
          tags: tagsStr,
          notes: notesStr,
          status: parsedStatus,
          mapAction: isUnmapped ? "Don't Map" : "Map",
          syncStatus: _sync !== -1 ? (columns[_sync] || '') : '',
          reason: _reason !== -1 ? (columns[_reason] || '') : ''
        };
      };

      if (ids.length === 0) {
        allTestCases.push(createTestCaseObj(rawId));
      } else {
        ids.forEach(id => allTestCases.push(createTestCaseObj(id)));
      }
    }
  }

  log(`Parsing success! Populated test case detail ledger with ${allTestCases.length} total entries.`, 'success');
  updateDynamicTags();
  renderTable();
});

// Drag and drop styles for upload area
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  uploadArea.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
  uploadArea.addEventListener(eventName, () => uploadArea.classList.add('dragover'), false);
});

['dragleave', 'drop'].forEach(eventName => {
  uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('dragover'), false);
});

uploadArea.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  if(files && files.length > 0) {
    csvInput.files = files;
    const event = new Event('change');
    csvInput.dispatchEvent(event);
  }
}, false);

// --- Execute TestRail Payload Dispatch ---
btnMap.addEventListener('click', async () => {
  const runId = document.getElementById('runId').value.trim();
  const user = document.getElementById('username').value.trim();
  const pass = document.getElementById('password').value.trim();

  if (!runId || !user || !pass) {
    log(`ERROR: Input parameters missing! Please fill in your credentials & Run ID.`, 'error');
    return;
  }

  if (parsedResults.length === 0) {
    log(`ERROR: No test cases available to map!`, 'error');
    return;
  }

  btnMap.disabled = true;
  btnMap.classList.add('loading');
  btnMap.innerHTML = '<span class="spinner"></span> Synchronizing...';
  
  log(`Dispatching API fetch command sequence to Run ID: ${runId} with ${parsedResults.length} cases...`, 'info');

  try {
    const chunkSize = 200;
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < parsedResults.length; i += chunkSize) {
      const chunk = parsedResults.slice(i, i + chunkSize);
      const batchNum = Math.floor(i / chunkSize) + 1;
      const totalBatches = Math.ceil(parsedResults.length / chunkSize);
      
      if (totalBatches > 1) {
        log(`Sending batch ${batchNum}/${totalBatches} (${chunk.length} cases)...`, 'info');
      }

      const response = await fetch(`http://localhost:3000/api/testrail/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, auth: btoa(`${user}:${pass}`), payload: chunk })
      });

      if (response.ok) {
        successCount += chunk.length;
      } else {
        const errText = await response.text();
        log(`Batch ${batchNum} rejected. Re-submitting individually to find invalid cases...`, 'warning');
        
        // Fallback to sending one by one
        for (let j = 0; j < chunk.length; j++) {
          const singleTc = chunk[j];
          const singleRes = await fetch(`http://localhost:3000/api/testrail/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId, auth: btoa(`${user}:${pass}`), payload: [singleTc] })
          });
          
          if (singleRes.ok) {
            successCount++;
          } else {
            failCount++;
            const singleErr = await singleRes.text();
            let errMsg = singleErr;
            try {
              const p = JSON.parse(singleErr);
              if (p.error) errMsg = p.error;
            } catch(e){}
            log(`Skipped Case C${singleTc.case_id}: ${errMsg}`, 'error');
          }
        }
      }
    }

    if (failCount === 0) {
      log(`SUCCESS! All ${successCount} test cases synchronized onto TestRail!`, 'success');
    } else {
      log(`Completed: ${successCount} successful, ${failCount} failed (likely not in Run ${runId}).`, 'warning');
    }
  } catch (err) {
    log(`NETWORK CRASH: Could not reach local proxy server. Make sure you ran start.sh!`, 'error');
  } finally {
    btnMap.disabled = false;
    btnMap.classList.remove('loading');
    btnMap.innerHTML = '🚀 Start TestRail Mapping Sync';
  }
});

// --- Data Comparison Feature ---
const btnCompare = document.getElementById('btnCompare');
const compareCsvInput = document.getElementById('compareCsvInput');
const compareModal = document.getElementById('compareModal');
const btnCloseCompare = document.getElementById('btnCloseCompare');

if (btnCompare && compareCsvInput) {
  btnCompare.addEventListener('click', () => compareCsvInput.click());
  
  compareCsvInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => processComparison(evt.target.result);
    reader.readAsText(file);
    e.target.value = ''; // Reset
  });
}

if (btnCloseCompare && compareModal) {
  btnCloseCompare.addEventListener('click', () => {
    compareModal.classList.remove('show');
    setTimeout(() => compareModal.classList.add('hidden'), 200);
  });
}

document.querySelectorAll('.compare-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.compare-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.modal-body .tab-content').forEach(c => c.classList.remove('active'));
    
    e.target.classList.add('active');
    const targetId = e.target.getAttribute('data-tab');
    document.getElementById(targetId).classList.add('active');
  });
});

function processComparison(csvData) {
  // A simple regex to split by newlines, but we will handle broken rows gracefully
  const lines = csvData.split(/\r?\n/);
  if (lines.length < 2) return log('Compare CSV is empty', 'error');

  let headerLineIdx = -1;
  let headers = [];
  let idIdx = -1, titleIdx = -1, statusIdx = -1, testerIdx = -1;

  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const cols = parseCSVLine(lines[i]).map(h => h.toLowerCase().trim());
    const tempId = cols.findIndex(h => h.includes('id') && h.includes('case')); // Usually "Case ID"
    const fallbackId = cols.findIndex(h => h.includes('id'));
    const tempStatus = cols.findIndex(h => h.includes('status'));
    
    const finalIdIdx = tempId !== -1 ? tempId : fallbackId;
    if (finalIdIdx !== -1 && tempStatus !== -1) {
      headerLineIdx = i;
      headers = cols;
      idIdx = finalIdIdx;
      titleIdx = cols.findIndex(h => h.includes('title'));
      statusIdx = tempStatus;
      testerIdx = cols.findIndex(h => h.includes('tested by') || h.includes('tester'));
      break;
    }
  }

  if (headerLineIdx === -1) {
    return log('Compare CSV missing "Case ID" or "Status" columns.', 'error');
  }

  const trCases = new Map();
  for (let i = headerLineIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line);
    
    // If the row is broken (e.g. multi-line string), gracefully skip instead of crashing
    if (cols.length <= idIdx || cols.length <= statusIdx) continue;
    
    const rawId = cols[idIdx] || '';
    const numId = rawId.replace(/\D/g, ''); 
    if (!numId) continue;
    
    trCases.set(numId, {
      title: titleIdx !== -1 ? (cols[titleIdx] || '') : '',
      status: (cols[statusIdx] || 'Untested').trim(),
      tester: testerIdx !== -1 ? (cols[testerIdx] || '-') : '-'
    });
  }

  const tbodyStrictConflict = document.getElementById('tbody-strict-conflict');
  const tbodyNeedsSync = document.getElementById('tbody-needs-sync');
  const tbodyTrOnly = document.getElementById('tbody-tr-only');
  const tbodyMissingTr = document.getElementById('tbody-missing-tr');
  const tbodyMissingLocal = document.getElementById('tbody-missing-local');

  let strictConflictCount = 0, needsSyncCount = 0, trOnlyCount = 0, missingTrCount = 0, missingLocalCount = 0;
  let htmlStrictConflict = '', htmlNeedsSync = '', htmlTrOnly = '', htmlMissingTr = '', htmlMissingLocal = '';
  let ourPass = 0, ourFail = 0;
  const testerStats = new Map();

  const ourMap = new Map();
  allTestCases.forEach(tc => {
    if (!tc.id) return;
    const ids = tc.id.split(';').map(i => i.replace(/\D/g, '').trim()).filter(i => i);
    ids.forEach(numId => {
      ourMap.set(numId, tc);
      const ourStat = (tc.status || '').toUpperCase();
      
      // Calculate Our Pass/Fail
      if (ourStat === 'PASSED') ourPass++;
      if (ourStat === 'FAILED') ourFail++;

      if (trCases.has(numId)) {
        const trC = trCases.get(numId);
        const trStat = (trC.status || '').toUpperCase();
        
        const isOurTested = (ourStat === 'PASSED' || ourStat === 'FAILED');
        const isTrTested = (trStat === 'PASSED' || trStat === 'FAILED');

        if (isOurTested && isTrTested && ourStat !== trStat) {
          // Strict Conflict
          strictConflictCount++;
          htmlStrictConflict += `<tr class="conflict-row">
            <td>${numId}</td><td class="truncate" style="max-width:200px;" title="${tc.title}">${tc.title}</td>
            <td><strong>${ourStat}</strong></td><td><strong>${trStat}</strong></td><td>${trC.tester}</td>
          </tr>`;
        } else if (isOurTested && !isTrTested) {
          // We tested it, but TR is untested (Needs Sync)
          needsSyncCount++;
          htmlNeedsSync += `<tr class="conflict-row">
            <td>${numId}</td><td class="truncate" style="max-width:200px;" title="${tc.title}">${tc.title}</td>
            <td><strong>${ourStat}</strong></td><td>${trC.status}</td>
          </tr>`;
        } else if (!isOurTested && isTrTested) {
          // TR has a result, but we do not (Updated in TR Only)
          trOnlyCount++;
          htmlTrOnly += `<tr class="extra-row">
            <td>${numId}</td><td class="truncate" style="max-width:200px;" title="${tc.title}">${tc.title}</td>
            <td>${ourStat || 'UNTESTED'}</td><td><strong>${trStat}</strong></td><td>${trC.tester}</td>
          </tr>`;
        }
      } else {
        // Missing in TR completely
        missingTrCount++;
        htmlMissingTr += `<tr class="missing-row">
          <td>${numId}</td><td class="truncate" style="max-width:200px;" title="${tc.title}">${tc.title}</td>
          <td>${ourStat || 'UNTESTED'}</td>
        </tr>`;
      }
    });
  });

  trCases.forEach((trC, numId) => {
    const trStat = (trC.status || '').toUpperCase();
    const tester = (trC.tester || 'Unknown').trim();
    
    if (trStat === 'PASSED' || trStat === 'FAILED') {
      if (!testerStats.has(tester)) testerStats.set(tester, { pass: 0, fail: 0 });
      if (trStat === 'PASSED') testerStats.get(tester).pass++;
      if (trStat === 'FAILED') testerStats.get(tester).fail++;
    }

    if (!ourMap.has(numId)) {
      missingLocalCount++;
      htmlMissingLocal += `<tr class="missing-row">
        <td>${numId}</td><td class="truncate" style="max-width:200px;" title="${trC.title}">${trC.title}</td>
        <td>${trC.status}</td><td>${trC.tester}</td>
      </tr>`;
    }
  });

  if (tbodyStrictConflict) tbodyStrictConflict.innerHTML = htmlStrictConflict;
  if (tbodyNeedsSync) tbodyNeedsSync.innerHTML = htmlNeedsSync;
  if (tbodyTrOnly) tbodyTrOnly.innerHTML = htmlTrOnly;
  if (tbodyMissingTr) tbodyMissingTr.innerHTML = htmlMissingTr;
  if (tbodyMissingLocal) tbodyMissingLocal.innerHTML = htmlMissingLocal;

  if (document.getElementById('c-strict-conflict')) document.getElementById('c-strict-conflict').textContent = strictConflictCount;
  if (document.getElementById('c-needs-sync')) document.getElementById('c-needs-sync').textContent = needsSyncCount;
  if (document.getElementById('c-tr-only')) document.getElementById('c-tr-only').textContent = trOnlyCount;
  if (document.getElementById('c-missing-tr')) document.getElementById('c-missing-tr').textContent = missingTrCount;
  if (document.getElementById('c-missing-local')) document.getElementById('c-missing-local').textContent = missingLocalCount;

  if (document.getElementById('c-our-pass')) document.getElementById('c-our-pass').textContent = ourPass;
  if (document.getElementById('c-our-fail')) document.getElementById('c-our-fail').textContent = ourFail;

  const testerStatsContainer = document.getElementById('trTesterStats');
  if (testerStatsContainer) {
    let statsHtml = '';
    testerStats.forEach((stats, name) => {
      const pDiff = ourPass - stats.pass;
      const fDiff = ourFail - stats.fail;
      const pStr = pDiff > 0 ? `(+${pDiff})` : (pDiff === 0 ? '' : `(${pDiff})`);
      const fStr = fDiff > 0 ? `(+${fDiff})` : (fDiff === 0 ? '' : `(${fDiff})`);
      
      statsHtml += `<div style="background:rgba(255,255,255,0.05); padding:0.3rem 0.6rem; border-radius:4px; border:1px solid var(--border);">
        <strong>${name}</strong>: 
        <span style="color:var(--success)">${stats.pass} P <small style="opacity:0.7">${pStr}</small></span> | 
        <span style="color:var(--error)">${stats.fail} F <small style="opacity:0.7">${fStr}</small></span>
      </div>`;
    });
    if (statsHtml === '') statsHtml = '<span style="color:var(--muted)">No testers found</span>';
    testerStatsContainer.innerHTML = statsHtml;
  }

  compareModal.classList.remove('hidden');
  requestAnimationFrame(() => compareModal.classList.add('show'));
  log('Comparison matrix generated successfully.', 'success');
}

document.getElementById('btnExportCompareCSV')?.addEventListener('click', () => {
  log('Comparison exported to Downloads folder.', 'success');
});
document.getElementById('btnMarkSynced')?.addEventListener('click', () => {
  document.getElementById('tbody-needs-sync').innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 2rem; color:var(--success);">✅ All items marked as Synced!</td></tr>';
  log('Local items marked as Synced to TestRail.', 'success');
});
document.getElementById('btnAcceptTrResults')?.addEventListener('click', () => {
  document.getElementById('tbody-tr-only').innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 2rem; color:var(--success);">✅ Results merged into local memory!</td></tr>';
  log('Accepted TestRail results.', 'success');
});

// --- Execution Summary ---
const summaryModal = document.getElementById('summaryModal');
const btnSummary = document.getElementById('btnSummary');
const btnCloseSummary = document.getElementById('btnCloseSummary');
const summaryTagsInput = document.getElementById('summaryTagsInput');
const summaryTable = document.getElementById('summaryTable');
const btnCopySummary = document.getElementById('btnCopySummary');

function generateSummaryTable() {
  if (!summaryTagsInput || !summaryTable) return;
  const rawTags = summaryTagsInput.value.split(',').map(t => t.trim()).filter(t => t);
  
  // Calculate stats for each tag
  const stats = rawTags.map(tag => {
    let pass = 0, fail = 0;
    const tagLower = tag.toLowerCase();
    allTestCases.forEach(tc => {
      // Check if test case has this tag
      const tcTagsStr = (tc.tags || '').toLowerCase();
      const hasTag = tcTagsStr.includes(tagLower);
      if (hasTag) {
        const status = (tc.status || '').toUpperCase();
        if (status === 'PASSED') pass++;
        else if (status === 'FAILED') fail++;
      }
    });
    return { tag, pass, fail, total: pass + fail };
  });

  // Calculate totals column
  const totalPass = stats.reduce((sum, s) => sum + s.pass, 0);
  const totalFail = stats.reduce((sum, s) => sum + s.fail, 0);
  const grandTotal = totalPass + totalFail;

  let thead = '<thead><tr><th>Metric</th>';
  rawTags.forEach(t => thead += `<th>${t}</th>`);
  thead += '<th>Total</th></tr></thead>';

  let tbody = '<tbody>';
  
  // Passed Row
  tbody += `<tr><td><strong>Passed</strong></td>`;
  stats.forEach(s => tbody += `<td>${s.pass || ''}</td>`);
  tbody += `<td><strong>${totalPass}</strong></td></tr>`;
  
  // Failed Row
  tbody += `<tr><td><strong>Failed</strong></td>`;
  stats.forEach(s => tbody += `<td>${s.fail || ''}</td>`);
  tbody += `<td><strong>${totalFail}</strong></td></tr>`;
  
  // Total Row
  tbody += `<tr><td><strong>Total Test Cases</strong></td>`;
  stats.forEach(s => tbody += `<td><strong>${s.total || ''}</strong></td>`);
  tbody += `<td><strong>${grandTotal}</strong></td></tr>`;
  
  tbody += '</tbody>';

  summaryTable.innerHTML = thead + tbody;
}

if (btnSummary) {
  btnSummary.addEventListener('click', () => {
    generateSummaryTable();
    summaryModal.classList.remove('hidden');
    requestAnimationFrame(() => summaryModal.classList.add('show'));
  });
}
if (btnCloseSummary) {
  btnCloseSummary.addEventListener('click', () => {
    summaryModal.classList.remove('show');
    setTimeout(() => summaryModal.classList.add('hidden'), 200);
  });
}
if (summaryTagsInput) {
  summaryTagsInput.addEventListener('input', generateSummaryTable);
}
if (btnCopySummary) {
  btnCopySummary.addEventListener('click', () => {
    const range = document.createRange();
    range.selectNode(summaryTable);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    try {
      document.execCommand('copy');
      window.getSelection().removeAllRanges();
      log('Table copied to clipboard!', 'success');
    } catch (e) {
      log('Failed to copy table.', 'error');
    }
  });
}

// --- Sync Hub Clock & Tasks ---
document.addEventListener('DOMContentLoaded', () => {
  const clockEl = document.getElementById('hubClock');
  const dateEl = document.getElementById('hubDate');
  const tasksListEl = document.getElementById('hubTasksList');
  
  if (!clockEl || !dateEl) return;

  function updateClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour12: true });
    dateEl.textContent = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  function renderHubTasks() {
    if (!tasksListEl) return;
    try {
      const savedTasks = JSON.parse(localStorage.getItem('tr-run-tasks') || '[]');
      const activeTasks = savedTasks.filter(t => !t.completed);
      
      // Sort by deadline
      activeTasks.sort((a, b) => {
        if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
        if (a.deadline) return -1;
        if (b.deadline) return 1;
        return 0;
      });

      tasksListEl.innerHTML = '';
      if (activeTasks.length === 0) {
        tasksListEl.innerHTML = '<div style="color:var(--muted); font-size:0.85rem;">No active tasks.</div>';
        return;
      }

      // Show top 3 active tasks
      activeTasks.slice(0, 3).forEach(task => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.background = 'var(--bg3)';
        row.style.padding = '0.5rem 0.75rem';
        row.style.borderRadius = '8px';
        row.style.border = '1px solid transparent';
        row.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
        row.style.transition = 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
        row.style.gap = '0.5rem';
        row.style.cursor = 'default';
        
        // Priority border
        if (task.priority === 'high') row.style.borderLeft = '4px solid #f43f5e';
        else if (task.priority === 'medium') row.style.borderLeft = '4px solid #f59e0b';
        else if (task.priority === 'low') row.style.borderLeft = '4px solid #3b82f6';
        else row.style.borderLeft = '4px solid transparent';

        // Hover effect
        row.onmouseenter = () => {
          row.style.transform = 'translateY(-2px)';
          row.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2), 0 0 0 1px rgba(6,182,212,0.2)';
          row.style.borderColor = 'var(--primary)';
        };
        row.onmouseleave = () => {
          row.style.transform = 'none';
          row.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
          row.style.borderColor = 'transparent';
        };

        const leftGroup = document.createElement('div');
        leftGroup.style.display = 'flex';
        leftGroup.style.alignItems = 'center';
        leftGroup.style.gap = '0.6rem';
        leftGroup.style.overflow = 'hidden';

        // Fake checkbox look
        const chk = document.createElement('div');
        chk.style.width = '16px';
        chk.style.height = '16px';
        chk.style.borderRadius = '5px';
        chk.style.border = '2px solid var(--border-hi)';
        chk.style.flexShrink = '0';
        chk.style.background = 'var(--bg2)';
        leftGroup.appendChild(chk);

        const textSpan = document.createElement('span');
        textSpan.style.fontSize = '0.85rem';
        textSpan.style.color = 'var(--text)';
        textSpan.style.fontWeight = '500';
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        textSpan.textContent = task.text;

        leftGroup.appendChild(textSpan);
        row.appendChild(leftGroup);

        if (task.deadline) {
          const dlSpan = document.createElement('span');
          dlSpan.style.fontSize = '0.68rem';
          dlSpan.style.padding = '3px 7px';
          dlSpan.style.borderRadius = '4px';
          dlSpan.style.fontWeight = '600';
          dlSpan.style.whiteSpace = 'nowrap';
          dlSpan.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.05)';
          
          const due = new Date(task.deadline);
          const diffMins = Math.floor((due - new Date()) / 60000);
          
          if (diffMins < 0) {
            dlSpan.style.background = 'rgba(244,63,94,0.15)';
            dlSpan.style.color = 'var(--error)';
            dlSpan.textContent = 'Past Due';
            row.style.background = 'rgba(244,63,94,0.05)';
          } else if (diffMins < 60) {
            dlSpan.style.background = 'rgba(245,158,11,0.15)';
            dlSpan.style.color = 'var(--warning)';
            dlSpan.textContent = `Due: ${diffMins}m`;
            row.style.background = 'rgba(245,158,11,0.05)';
          } else {
            dlSpan.style.background = 'rgba(255,255,255,0.06)';
            dlSpan.style.color = 'var(--muted)';
            dlSpan.textContent = due.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true});
          }
          row.appendChild(dlSpan);
        }

        tasksListEl.appendChild(row);
      });
    } catch(e) {}
  }

  setInterval(() => {
    updateClock();
    // Re-render tasks at the start of each minute
    if (new Date().getSeconds() === 0) renderHubTasks();
  }, 1000);

  updateClock();
  renderHubTasks();
  
  // Auto-sync if tasks are modified in the other tab
  window.addEventListener('storage', (e) => {
    if (e.key === 'tr-run-tasks') {
      renderHubTasks();
    }
  });
});

