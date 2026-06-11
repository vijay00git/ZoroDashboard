// Daily Status Workstation JS Logic

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const templateSelect = document.getElementById('templateSelect');
  const templateContent = document.getElementById('templateContent');
  const btnNewTemplate = document.getElementById('btnNewTemplate');
  const btnDeleteTemplate = document.getElementById('btnDeleteTemplate');

  const rawWorkNotes = document.getElementById('rawWorkNotes');
  const btnImportActivities = document.getElementById('btnImportActivities');

  const btnGenerateReport = document.getElementById('btnGenerateReport');
  const generationLoader = document.getElementById('generationLoader');
  
  const reportPreview = document.getElementById('reportPreview');
  const reportSource = document.getElementById('reportSource');
  const btnToggleView = document.getElementById('btnToggleView');

  const btnCopyReport = document.getElementById('btnCopyReport');
  const btnExportMarkdown = document.getElementById('btnExportMarkdown');
  const btnExportPDF = document.getElementById('btnExportPDF');

  // ── Theme Manager ──
  const btnThemeToggle = document.getElementById('btnThemeToggle');
  if (btnThemeToggle) {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    btnThemeToggle.textContent = currentTheme === 'dark' ? '🌙' : '☀️';
    btnThemeToggle.addEventListener('click', () => {
      const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('tr-theme', nextTheme);
      btnThemeToggle.textContent = nextTheme === 'dark' ? '🌙' : '☀️';
    });
  }

  // Cross-tab theme sync
  window.addEventListener('storage', (e) => {
    if (e.key === 'tr-theme') {
      const nextTheme = e.newValue || 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);
      if (btnThemeToggle) {
        btnThemeToggle.textContent = nextTheme === 'dark' ? '🌙' : '☀️';
      }
    }
  });

  // State
  let templates = [];
  let generatedReport = "";

  const DEFAULT_TEMPLATES = [
    {
      id: "std-standup",
      name: "Standard Daily Standup",
      content: `# Daily Status Report - {DATE}

## ✅ Completed Today
{TASKS_COMPLETED}

## 🚧 In Progress / Next Steps
{TASKS_IN_PROGRESS}

## 🚫 Blockers / Concerns
{TASKS_BLOCKED}

---
*Generated from today's work logs*`
    },
    {
      id: "tech-sprint",
      name: "Detailed Technical Status (with Table)",
      content: `# Tech Sprint Progress - {DATE}

## Task Breakdown
| Task / Activity | Project / Module | Status | Details / Notes / Links |
| --- | --- | --- | --- |
| {TASKS_TABLE_ROW} |

## Summary of Accomplishments
1. All code committed and verified locally.
2. Zoro Productivity Workstation sync successful.
3. Key artifacts updated and reviewed.

## Key Links & References
- PR: https://bitbucket.org/elosystemsteam/ic-tokyo/pull-requests/1361/diff
- Jenkins Offline: http://10.42.24.115:8080/job/Vj_offline_01/17/console
- Jenkins Online: http://10.42.24.115:8080/job/Vj_online_01/lastBuild/console`
    },
    {
      id: "exec-matrix",
      name: "Executive Summary & Metrics",
      content: `# Executive Status Summary - {DATE}

## Deliverables Health
| Stream | Key Progress Metrics | Status Health |
| --- | --- | --- |
| Engineering Deliverables | Completed: **{TASKS_COMPLETED_COUNT}** | ✅ On Track |
| In Flight Workstreams | Active: **{TASKS_IN_PROGRESS_COUNT}** | 🔄 Active |
| Impediments & Blockers | Blocked: **{TASKS_BLOCKED_COUNT}** | {HEALTH_STATUS} |

## Strategic Highlights
- Accomplished today's core deliverables. See detailed task list for notes.
- Aligned with team on sprint priorities.
- Maintained quality checks and test coverage.
- Reviewed PRs and provided feedback.

## Risk / Action Items
| Risk / Item | Owner | ETA |
| --- | --- | --- |
| {BLOCKER_ITEM} | TBD | TBD |`
    }
  ];

  // ── 1. Templates Management ──
  // ── 1. Templates Management ──
  async function initTemplates() {
    try {
      const response = await fetch('/api/status/templates');
      if (response.ok) {
        templates = await response.json();
      } else {
        templates = [...DEFAULT_TEMPLATES];
      }
    } catch (e) {
      console.warn("Could not fetch templates from backend, falling back to local storage:", e);
      try {
        const saved = localStorage.getItem('zoro-status-templates');
        if (saved) {
          templates = JSON.parse(saved);
        } else {
          templates = [...DEFAULT_TEMPLATES];
        }
      } catch (err) {
        templates = [...DEFAULT_TEMPLATES];
      }
    }
    renderTemplatesDropdown();
  }

  async function saveTemplatesToBackend() {
    try {
      localStorage.setItem('zoro-status-templates', JSON.stringify(templates));
      await fetch('/api/status/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates })
      });
    } catch (e) {
      console.error("Failed to save templates to backend:", e);
    }
  }

  function renderTemplatesDropdown(selectedId = "") {
    templateSelect.innerHTML = "";
    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      templateSelect.appendChild(opt);
    });
    
    if (selectedId) {
      templateSelect.value = selectedId;
    }
    loadSelectedTemplate();
  }

  function loadSelectedTemplate() {
    const id = templateSelect.value;
    const t = templates.find(item => item.id === id);
    if (t) {
      templateContent.value = t.content;
    } else {
      templateContent.value = "";
    }
  }

  function saveCurrentTemplateChanges() {
    const id = templateSelect.value;
    const idx = templates.findIndex(item => item.id === id);
    if (idx !== -1) {
      templates[idx].content = templateContent.value;
      saveTemplatesToBackend();
    }
  }

  templateSelect.addEventListener('change', loadSelectedTemplate);
  templateContent.addEventListener('input', saveCurrentTemplateChanges);

  btnNewTemplate.addEventListener('click', async () => {
    const name = prompt("Enter template name:", "Custom Template");
    if (name && name.trim()) {
      const newId = "custom-" + Date.now();
      templates.push({
        id: newId,
        name: name.trim(),
        content: `${name.trim()} - {DATE}\n\nIntroduce status notes here...`
      });
      await saveTemplatesToBackend();
      renderTemplatesDropdown(newId);
      showToast(`Created template "${name.trim()}"`, "success");
    }
  });

  btnDeleteTemplate.addEventListener('click', async () => {
    const id = templateSelect.value;
    if (id.startsWith('std-')) {
      alert("Standard system templates cannot be deleted.");
      return;
    }
    if (confirm("Are you sure you want to delete this template?")) {
      templates = templates.filter(item => item.id !== id);
      await saveTemplatesToBackend();
      renderTemplatesDropdown();
      showToast("Template deleted", "info");
    }
  });

  // ── 2. Raw Work Notes Persistence ──
  function initRawNotes() {
    const saved = localStorage.getItem('zoro-status-raw-notes');
    if (saved) {
      rawWorkNotes.value = saved;
    } else {
      // Seed with user's dummy placeholder text to guide
      rawWorkNotes.value = `Attended scrum meeting 1 hr
Discussed with the manual team regarding testcases steps
Ran jenkins job
offline
http://10.42.24.115:8080/job/Vj_offline_01/17/console 
Online
http://10.42.24.115:8080/job/Vj_online_01/lastBuild/console 
http://10.42.24.115:8080/job/Vj_online_01/23/console 
http://10.42.24.115:8080/job/Vj_online_01/24/console 
http://10.42.24.115:8080/job/Vj_online_01/25/console 
Test rail mapping
Offline: Run 8051
Online: Run 8052

Compared Abhishek's and my test runs on the Electra and Aston Martin modules

Attended team sync-up call - 1 hr
Raised a PR
Pr reviewed
https://bitbucket.org/elosystemsteam/ic-tokyo/pull-requests/1361/diff 
Worked on the EVA 
Automated 4 test cases (C2698176, C2698342, C2698354, C2698356).`;
    }
  }

  rawWorkNotes.addEventListener('input', () => {
    localStorage.setItem('zoro-status-raw-notes', rawWorkNotes.value);
  });

  // ── 3. Auto-Import from Dashboard & Timesheet ──
  btnImportActivities.addEventListener('click', () => {
    let importedText = "";
    
    // Import 1: Task Manager tasks (tr-run-tasks)
    try {
      const tasksStr = localStorage.getItem('tr-run-tasks');
      if (tasksStr) {
        const tasks = JSON.parse(tasksStr);
        if (tasks.length > 0) {
          importedText += "Tasks from Productivity:\n";
          tasks.forEach(t => {
            importedText += `- [${t.completed ? 'Completed' : 'In Progress'}] ${t.text}\n`;
          });
          importedText += "\n";
        }
      }
    } catch(e) {
      console.warn("Could not import productivity tasks:", e);
    }

    // Import 2: Today's Timesheet status (ts-data-YYYY-MM)
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const todayStr = `${String(now.getDate()).padStart(2, '0')}-${month}-${year}`;
      const monthKey = `ts-data-${year}-${month}`;
      
      const tsStr = localStorage.getItem(monthKey);
      if (tsStr) {
        const tsData = JSON.parse(tsStr);
        const todayRow = tsData.rows.find(r => r.date === todayStr);
        if (todayRow && (todayRow.inTime || todayRow.type !== 'Office')) {
          importedText += "Timesheet details:\n";
          importedText += `- Checked in at ${todayRow.inTime || '--:--'}`;
          if (todayRow.outTime) importedText += `, checked out at ${todayRow.outTime}`;
          importedText += ` (${todayRow.type})\n`;
          if (todayRow.proj !== "0:00:00") importedText += `- Total project hours logged: ${todayRow.proj}\n`;
          importedText += "\n";
        }
      }
    } catch(e) {
      console.warn("Could not import timesheet details:", e);
    }

    if (importedText.trim()) {
      const separator = rawWorkNotes.value.trim() ? "\n\n" : "";
      rawWorkNotes.value = rawWorkNotes.value + separator + importedText.trim();
      localStorage.setItem('zoro-status-raw-notes', rawWorkNotes.value);
      showToast("Imported dashboard activities!", "success");
    } else {
      showToast("No new dashboard activities found to import.", "info");
    }
  });

  btnGenerateReport.addEventListener('click', async () => {
    const rawNotesVal = rawWorkNotes.value.trim();
    if (!rawNotesVal) {
      alert("Please enter your raw work logs / notes before generating the report.");
      return;
    }

    if (!window.ZoroAI || !window.ZoroAI.hasKey()) {
      alert("AI Assistant API Key is missing. Please click the 🤖 floating button in the bottom right corner, open Settings ⚙️, and paste your Gemini API Key first!");
      window.ZoroAI.openPanel();
      return;
    }

    generationLoader.classList.remove('hidden');

    const selectedTemplateContent = templateContent.value;
    const todayDateStr = new Date().toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Prompt preparation
    const systemPrompt = `You are a high-performance Daily Status Standup Report generator for Zoro.
Your task is to take the user's raw daily work log / notes and generate a complete, comprehensive daily standup report matching the structure of the selected template.

CRITICAL FORMATTING RULES:
- USE FULL MARKDOWN. Use # headings, **bold**, *italic*, bullet lists with -, numbered lists, tables with pipes |, links [text](url), code blocks with backticks.
- Do NOT truncate or shorten the output. Every single work log activity, automated test case, Jenkins job URL, and PR link must be represented.
- Do NOT output placeholder tags like {DATE} or {TASKS_COMPLETED} in the final report. Fill them all in.

User's Raw Daily Logs:
"""
${rawNotesVal}
"""

Current Date:
${todayDateStr}

Selected Template Content:
"""
${selectedTemplateContent}
"""

Instructions:
1. Parse the user's raw daily logs and extract every single task, link, PR, and duration.
2. If the selected Template Content contains placeholders (e.g. {DATE}, {TASKS_COMPLETED}, {TASKS_TABLE_ROW}, {TASKS_IN_PROGRESS}, {TASKS_BLOCKED}, {TASKS_COMPLETED_COUNT}, {TASKS_IN_PROGRESS_COUNT}, {TASKS_BLOCKED_COUNT}), substitute them:
   - {DATE} -> ${todayDateStr}
   - {TASKS_COMPLETED} -> A clean bulleted list of today's completed tasks.
   - {TASKS_IN_PROGRESS} -> A clean bulleted list of today's in-progress tasks.
   - {TASKS_BLOCKED} -> A clean bulleted list of today's blocked tasks.
   - {TASKS_TABLE_ROW} -> Markdown table rows (one row per task) using the structure of the table in the template.
   - {TASKS_COMPLETED_COUNT} -> Count of completed tasks.
   - {TASKS_IN_PROGRESS_COUNT} -> Count of in-progress tasks.
   - {TASKS_BLOCKED_COUNT} -> Count of blocked tasks.
3. If the selected Template Content does NOT contain placeholders (meaning it is a sample/example report structure), treat it as a style guide. Rewrite the sample report's details to match today's actual activities:
   - Keep the exact sections, headings, bullet style, and list structure.
   - Replace the example activities under each section with today's parsed work logs.
   - Replace any example dates (like '19 May 2026') with today's date (${todayDateStr}).
4. Ensure the output is a complete report and is NOT truncated. Stop only when the entire template content has been processed and filled.
5. Output ONLY the finished markdown status report. Do not put markdown code block syntax (like \`\`\`markdown) around it. Start immediately with the report content.`;

    try {
      const reply = await window.ZoroAI.call(systemPrompt, "Daily Status Workstation Context: Generate full report");
      
      generatedReport = reply.trim();
      reportSource.value = generatedReport;
      reportPreview.innerHTML = (window.ZoroAI && window.ZoroAI.mdToHtml ? window.ZoroAI.mdToHtml(generatedReport) : escapeHtml(generatedReport));
      
      // Show preview, hide empty state
      const emptyState = document.getElementById('emptyPreviewState');
      if (emptyState) emptyState.classList.add('hidden');
      reportPreview.classList.remove('hidden');
      reportSource.classList.add('hidden');
      reportSource.classList.remove('source-mode');
      updateModeIndicator('preview');
      
      showToast("Report generated successfully!", "success");
      
      if (window.ZoroActivity) {
        window.ZoroActivity.log('productivity', `Generated standup report`, 'success');
      }
    } catch(err) {
      console.error(err);
      alert("Error generating report: " + err.message);
    } finally {
      generationLoader.classList.add('hidden');
    }
  });

  function updateModeIndicator(mode) {
    const label = document.getElementById('previewModeLabel');
    if (!label) return;
    if (mode === 'source') {
      label.innerHTML = '<span class="mode-dot mode-source"></span> Markdown Source';
    } else {
      label.innerHTML = '<span class="mode-dot mode-preview"></span> Rich Preview';
    }
  }

  btnToggleView.addEventListener('click', () => {
    const emptyState = document.getElementById('emptyPreviewState');
    const isPreviewHidden = reportPreview.classList.contains('hidden');
    if (isPreviewHidden) {
      // Switching to Preview: render current content from the source editor
      const mdText = reportSource.value;
      if (mdText.trim()) {
        reportPreview.innerHTML = (window.ZoroAI && window.ZoroAI.mdToHtml ? window.ZoroAI.mdToHtml(mdText) : escapeHtml(mdText));
        if (emptyState) emptyState.classList.add('hidden');
        reportPreview.classList.remove('hidden');
      }
      reportSource.classList.add('hidden');
      reportSource.classList.remove('source-mode');
      updateModeIndicator('preview');
      btnToggleView.classList.remove('active-toggle');
    } else {
      // Switching to Source: show raw markdown text area
      reportPreview.classList.add('hidden');
      reportSource.classList.remove('hidden');
      reportSource.classList.add('source-mode');
      if (emptyState) emptyState.classList.add('hidden');
      updateModeIndicator('source');
      btnToggleView.classList.add('active-toggle');
    }
  });

  btnCopyReport.addEventListener('click', async () => {
    const isSourceActive = !reportSource.classList.contains('hidden');
    let plainText = "";
    let htmlContent = "";

    if (isSourceActive) {
      plainText = reportSource.value;
      htmlContent = window.ZoroAI && window.ZoroAI.mdToHtml ? window.ZoroAI.mdToHtml(plainText) : escapeHtml(plainText);
    } else {
      htmlContent = reportPreview.innerHTML;
      plainText = reportPreview.innerText;
    }

    if (!plainText.trim()) {
      alert("No report content to copy.");
      return;
    }

    try {
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([plainText], { type: 'text/plain' });

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob
          })
        ]);
        showToast("Copied as Rich Text! 📋 (Paste to Slack/Teams/Email)", "success");
      } else {
        await navigator.clipboard.writeText(plainText);
        showToast("Copied as Plain Text! 📋", "success");
      }
    } catch (err) {
      console.error(err);
      navigator.clipboard.writeText(plainText)
        .then(() => showToast("Copied to clipboard!", "success"))
        .catch(e => alert("Failed to copy: " + e));
    }
  });

  btnExportMarkdown.addEventListener('click', () => {
    const isSourceActive = !reportSource.classList.contains('hidden');
    const text = isSourceActive ? reportSource.value : reportPreview.innerText;
    if (!text.trim()) {
      alert("No report content to export.");
      return;
    }
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `Daily_Status_${new Date().toISOString().slice(0, 10)}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Exported markdown file!", "success");
  });

  btnExportPDF.addEventListener('click', () => {
    // Get HTML content - prefer rendered preview over raw text
    let htmlContent = '';
    const mdSource = reportSource.value || '';
    if (reportPreview.innerHTML.trim()) {
      htmlContent = reportPreview.innerHTML;
    } else if (mdSource.trim()) {
      htmlContent = window.ZoroAI && window.ZoroAI.mdToHtml ? window.ZoroAI.mdToHtml(mdSource) : escapeHtml(mdSource);
    }

    if (!htmlContent.trim() && !mdSource.trim()) {
      alert("No report content to export.");
      return;
    }

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 18;
      const contentWidth = pageWidth - margin * 2;
      let y = 20;

      // Helper: check page overflow
      function checkPage(needed) {
        if (y + needed > 275) {
          doc.addPage();
          y = 20;
        }
      }

      // Parse the HTML into a temporary container
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;

      // Iterate top-level nodes
      function renderNodes(nodes) {
        nodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE) {
            const txt = node.textContent.trim();
            if (txt) {
              checkPage(8);
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              doc.setTextColor(30, 30, 30);
              const lines = doc.splitTextToSize(txt, contentWidth);
              lines.forEach(line => { checkPage(5); doc.text(line, margin, y); y += 5; });
              y += 2;
            }
            return;
          }
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          const tag = node.tagName.toLowerCase();

          if (tag === 'h1') {
            checkPage(14);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(10, 10, 10);
            const lines = doc.splitTextToSize(node.textContent.trim(), contentWidth);
            lines.forEach(line => { checkPage(8); doc.text(line, margin, y); y += 8; });
            doc.setDrawColor(6, 182, 212);
            doc.setLineWidth(0.6);
            doc.line(margin, y, pageWidth - margin, y);
            y += 6;
          }
          else if (tag === 'h2') {
            checkPage(12);
            y += 3;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(6, 130, 160);
            const lines = doc.splitTextToSize(node.textContent.trim(), contentWidth);
            lines.forEach(line => { checkPage(7); doc.text(line, margin, y); y += 7; });
            y += 3;
          }
          else if (tag === 'h3') {
            checkPage(10);
            y += 2;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11.5);
            doc.setTextColor(50, 50, 50);
            const lines = doc.splitTextToSize(node.textContent.trim(), contentWidth);
            lines.forEach(line => { checkPage(6); doc.text(line, margin, y); y += 6; });
            y += 2;
          }
          else if (tag === 'p') {
            checkPage(8);
            doc.setFontSize(10);
            doc.setTextColor(30, 30, 30);
            renderInlineText(doc, node, margin, contentWidth);
            y += 3;
          }
          else if (tag === 'ul' || tag === 'ol') {
            const items = node.querySelectorAll(':scope > li');
            items.forEach((li, idx) => {
              checkPage(6);
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(10);
              doc.setTextColor(30, 30, 30);
              const bullet = tag === 'ol' ? `${idx + 1}.` : '•';
              const text = li.textContent.trim();
              const lines = doc.splitTextToSize(text, contentWidth - 8);
              lines.forEach((line, li2) => {
                checkPage(5);
                if (li2 === 0) {
                  doc.text(`${bullet}  ${line}`, margin + 4, y);
                } else {
                  doc.text(line, margin + 10, y);
                }
                y += 5;
              });
            });
            y += 2;
          }
          else if (tag === 'table') {
            checkPage(15);
            const headers = [];
            const rows = [];
            node.querySelectorAll('thead th').forEach(th => headers.push(th.textContent.trim()));
            node.querySelectorAll('tbody tr').forEach(tr => {
              const row = [];
              tr.querySelectorAll('td').forEach(td => row.push(td.textContent.trim()));
              if (row.length) rows.push(row);
            });
            if (headers.length || rows.length) {
              doc.autoTable({
                startY: y,
                head: headers.length ? [headers] : undefined,
                body: rows,
                margin: { left: margin, right: margin },
                styles: { fontSize: 8.5, cellPadding: 3, font: 'helvetica', textColor: [30,30,30] },
                headStyles: { fillColor: [6, 182, 212], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
                alternateRowStyles: { fillColor: [245, 247, 250] },
                theme: 'grid'
              });
              y = doc.lastAutoTable.finalY + 6;
            }
          }
          else if (tag === 'hr') {
            checkPage(6);
            doc.setDrawColor(180, 180, 180);
            doc.setLineWidth(0.3);
            doc.line(margin, y, pageWidth - margin, y);
            y += 5;
          }
          else if (tag === 'blockquote') {
            checkPage(10);
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.setDrawColor(6, 182, 212);
            doc.setLineWidth(1);
            doc.line(margin, y - 3, margin, y + 4);
            const lines = doc.splitTextToSize(node.textContent.trim(), contentWidth - 10);
            lines.forEach(line => { checkPage(5); doc.text(line, margin + 6, y); y += 5; });
            y += 3;
          }
          else if (tag === 'strong' || tag === 'b') {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(30, 30, 30);
            const lines = doc.splitTextToSize(node.textContent.trim(), contentWidth);
            lines.forEach(line => { checkPage(5); doc.text(line, margin, y); y += 5; });
          }
          else {
            // Generic: render children
            if (node.childNodes.length) {
              renderNodes(Array.from(node.childNodes));
            } else {
              const text = node.textContent.trim();
              if (text) {
                checkPage(6);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.setTextColor(30, 30, 30);
                const lines = doc.splitTextToSize(text, contentWidth);
                lines.forEach(line => { checkPage(5); doc.text(line, margin, y); y += 5; });
                y += 2;
              }
            }
          }
        });
      }

      function renderInlineText(doc, element, x, maxWidth) {
        let combinedText = '';
        element.childNodes.forEach(child => {
          if (child.nodeType === Node.TEXT_NODE) {
            combinedText += child.textContent;
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            const childTag = child.tagName.toLowerCase();
            if (childTag === 'strong' || childTag === 'b' || childTag === 'em' || childTag === 'a' || childTag === 'code') {
              combinedText += child.textContent;
            } else {
              combinedText += child.textContent;
            }
          }
        });
        combinedText = combinedText.trim();
        if (combinedText) {
          doc.setFont('helvetica', 'normal');
          const lines = doc.splitTextToSize(combinedText, maxWidth);
          lines.forEach(line => { checkPage(5); doc.text(line, x, y); y += 5; });
        }
      }

      renderNodes(Array.from(tempDiv.childNodes));

      // Footer on each page
      const totalPages = doc.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(150, 150, 150);
        doc.text(`Generated via ZORO Dashboard • ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, margin, 290);
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin - 20, 290);
      }

      doc.save(`Daily_Status_${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast("Exported formatted PDF! 📄", "success");
    } catch(e) {
      console.error(e);
      alert("Failed to export PDF: " + e.message);
    }
  });

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Helper functions ──
  function showToast(msg, type = "info") {
    if (window.showGlobalToast) {
      window.showGlobalToast(msg, type);
    } else {
      let container = document.getElementById('zoro-global-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'zoro-global-toast-container';
        document.body.appendChild(container);
      }
      const toast = document.createElement('div');
      toast.className = `zoro-toast ${type} show`;
      toast.innerHTML = `<span>${msg}</span>`;
      container.appendChild(toast);
      setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
      }, 3500);
    }
  }

  // Initialize
  initTemplates();
  initRawNotes();
});
