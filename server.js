const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const ical = require('node-ical');
const multer = require('multer');
const AdmZip = require('adm-zip');

const upload = multer({ dest: path.join(__dirname, 'uploads') });

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'client/dist')));

// Ensure data directories exist
const DATA_DIR = path.join(__dirname, 'data', 'matrices');
const NOTES_DIR = path.join(__dirname, 'data', 'notes');
const TS_DIR = path.join(__dirname, 'data', 'timesheets');
const QL_DIR = path.join(__dirname, 'data', 'quicklaunch');
[DATA_DIR, NOTES_DIR, TS_DIR, QL_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.post('/api/save', (req, res) => {
    const { name, folder, testCases } = req.body;
    if (!name || !testCases) return res.status(400).json({ error: 'Missing name or testCases' });

    const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const filePath = path.join(DATA_DIR, `${safeName}.json`);

    try {
        fs.writeFileSync(filePath, JSON.stringify({ name, folder: folder || 'Uncategorized', testCases }, null, 2));
        res.status(200).json({ success: true, message: 'Saved successfully.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/matrices', (req, res) => {
    try {
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
        const globalTags = new Set();
        const matrices = files.map(f => {
            const filePath = path.join(DATA_DIR, f);
            const stat = fs.statSync(filePath);
            const content = JSON.parse(fs.readFileSync(filePath));

            const statusCounts = { PASSED: 0, FAILED: 0, UNTESTED: 0, OTHER: 0 };
            if (content.testCases) {
                content.testCases.forEach(tc => {
                    if (tc.tags) {
                        tc.tags.split(',').forEach(tag => {
                            const t = tag.trim();
                            if (t) globalTags.add(t);
                        });
                    }
                    const s = tc.status;
                    if (s === 'PASSED' || s === 'FAILED' || s === 'UNTESTED') {
                        statusCounts[s]++;
                    } else {
                        statusCounts.OTHER++;
                    }
                });
            }
            return {
                id: f.replace('.json', ''),
                name: content.name,
                folder: content.folder || 'Uncategorized',
                testCaseCount: content.testCases ? content.testCases.length : 0,
                mtime: stat.mtimeMs,
                statusCounts
            };
        });
        res.status(200).json({ matrices, globalTags: Array.from(globalTags) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/matrix/:id', (req, res) => {
    const { id } = req.params;
    const filePath = path.join(DATA_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Matrix not found' });

    try {
        const content = JSON.parse(fs.readFileSync(filePath));
        res.status(200).json(content);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/matrix/:id', (req, res) => {
    const { id } = req.params;
    const { testCases, name, folder } = req.body;

    const filePath = path.join(DATA_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Matrix not found' });

    try {
        const existing = JSON.parse(fs.readFileSync(filePath));
        if (testCases) existing.testCases = testCases;
        if (name) existing.name = name;
        if (folder !== undefined) existing.folder = folder;
        fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
        res.status(200).json({ success: true, message: 'Updated successfully.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/matrix/:id', (req, res) => {
    const { id } = req.params;
    const filePath = path.join(DATA_DIR, `${id}.json`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Matrix not found' });
    }

    try {
        fs.unlinkSync(filePath);
        res.status(200).json({ success: true, message: 'Deleted successfully.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Notes API ---
app.get('/api/notes', (req, res) => {
    try {
        const files = fs.readdirSync(NOTES_DIR).filter(f => f.endsWith('.md'));
        const notes = files.map(file => {
            const filePath = path.join(NOTES_DIR, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const stat = fs.statSync(filePath);
            const id = file.replace(/\.md$/, '');
            const name = id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            return {
                id,
                name,
                content,
                created: stat.birthtimeMs || Date.now()
            };
        });
        res.status(200).json(notes);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/notes', (req, res) => {
    const { id, name, content, created, oldName } = req.body;
    if (!name || !id) return res.status(400).json({ error: 'Missing name or id' });

    // If note was renamed, delete the old file
    if (oldName && oldName !== name) {
        const oldSafe = oldName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
        const oldPath = path.join(NOTES_DIR, `${oldSafe}.md`);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase() || 'untitled';
    const filePath = path.join(NOTES_DIR, `${safeName}.md`);

    try {
        // We'll write it as a simple markdown file to satisfy "saved in local machine with correct file name"
        fs.writeFileSync(filePath, content || '');
        res.status(200).json({ success: true, message: 'Note saved successfully.', file: `${safeName}.md` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/notes', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Missing name' });

    const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const filePath = path.join(NOTES_DIR, `${safeName}.md`);

    if (fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
            return res.status(200).json({ success: true });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }
    res.status(404).json({ error: 'Note not found' });
});

app.post('/api/testrail/sync', async (req, res) => {
    const { runId, auth, payload } = req.body;

    if (!runId || !auth || !payload) {
        return res.status(400).json({ error: 'Missing runId, auth, or payload.' });
    }

    try {
        const response = await fetch(`https://elosystemsteam.testrail.com/index.php?/api/v2/add_results_for_cases/${runId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ results: payload })
        });

        const data = await response.text();

        if (response.ok) {
            res.status(200).send(data);
        } else {
            res.status(response.status).send(data);
        }
    } catch (error) {
        console.error("Proxy error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- Timesheet API ---
app.get('/api/timesheets', (req, res) => {
    try {
        const files = fs.readdirSync(TS_DIR).filter(f => f.endsWith('.csv'));
        const months = files.map(file => {
            const match = file.match(/_(\d{4}-\d{2})_Timesheet\.csv$/);
            return match ? match[1] : null;
        }).filter(m => m);
        res.status(200).json({ months: Array.from(new Set(months)) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/timesheet', (req, res) => {
    const { filename, csvData, oldFilename } = req.body;
    if (!filename || !csvData) return res.status(400).json({ error: 'Missing filename or csvData' });

    // If timesheet was renamed (e.g. employee name changed), delete the old file
    if (oldFilename && oldFilename !== filename) {
        const oldSafe = oldFilename.replace(/[^a-z0-9_.-]/gi, '_');
        const oldPath = path.join(TS_DIR, oldSafe);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const safeName = filename.replace(/[^a-z0-9_.-]/gi, '_');
    const filePath = path.join(TS_DIR, safeName);

    try {
        fs.writeFileSync(filePath, csvData);
        res.status(200).json({ success: true, message: 'Timesheet saved successfully.', file: safeName });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/timesheet/:month', (req, res) => {
    const month = req.params.month;
    const empName = req.query.empName;
    if (!month.match(/^\d{4}-\d{2}$/)) return res.status(400).json({ error: 'Invalid month format' });

    try {
        const files = fs.readdirSync(TS_DIR);
        const matches = files.filter(f => f.includes(`_${month}_Timesheet.csv`));
        if (!matches.length) return res.status(404).json({ error: 'Not found' });

        let target = null;
        if (empName) {
            const safeEmp = empName.replace(/ /g, '_').replace(/[^a-z0-9_.-]/gi, '_');
            const specificFile = matches.find(f => f.startsWith(safeEmp + '_'));
            if (specificFile) {
                target = specificFile;
            }
        }

        if (!target) {
            const namedMatches = matches.filter(f => !f.startsWith('Unknown_Emp_'));
            const listToUse = namedMatches.length > 0 ? namedMatches : matches;
            listToUse.sort((a, b) => {
                return fs.statSync(path.join(TS_DIR, b)).mtimeMs - fs.statSync(path.join(TS_DIR, a)).mtimeMs;
            });
            target = listToUse[0];
        }

        const data = fs.readFileSync(path.join(TS_DIR, target), 'utf8');
        const lines = data.split('\n');

        // Parse metadata line
        const metaParts = lines[0].split(',');
        const parsedEmpId = metaParts[3] || '';
        const parsedEmpName = metaParts[5] || '';
        const parsedOrg = metaParts[7] || '';

        const rows = [];
        for (let i = 3; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith('TOTAL')) break;
            const cols = line.split(',');
            rows.push({
                date: cols[0] || '',
                day: cols[1] || '',
                type: cols[2] || '',
                inTime: cols[3] || '',
                outTime: cols[4] || '',
                extra: cols[5] || '0:00:00',
                proj: cols[6] || '0:00:00',
                meet: cols[7] || '0:00:00',
                total: cols[8] || '0:00:00'
            });
        }
        res.status(200).json({ empId: parsedEmpId, empName: parsedEmpName, org: parsedOrg, rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Quick Launch API ---
app.get('/api/quicklaunch', (req, res) => {
    const filePath = path.join(QL_DIR, 'data.json');
    if (!fs.existsSync(filePath)) {
        return res.status(200).json([]);
    }
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        res.status(200).json(JSON.parse(content));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/quicklaunch', (req, res) => {
    const filePath = path.join(QL_DIR, 'data.json');
    try {
        fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
        res.status(200).json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- AI Proxy API (Gemini) ---

// List available models for the user's key
app.get('/api/ai/models', async (req, res) => {
    const key = req.query.key;
    if (!key) return res.status(400).json({ error: 'Missing key' });
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
        );
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json({ error: data?.error?.message });
        const models = (data.models || [])
            .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
            .map(m => ({ id: m.name.replace('models/', ''), displayName: m.displayName }));
        res.json({ models });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/ai/chat', async (req, res) => {
    const { key, model, system, prompt } = req.body;

    if (!key || !prompt) {
        return res.status(400).json({ error: 'Missing key or prompt' });
    }

    const modelId = model || 'gemini-1.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`;

    const body = {
        contents: [
            { role: 'user', parts: [{ text: prompt }] }
        ],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048
        }
    };

    if (system) {
        body.systemInstruction = {
            parts: [{ text: system }]
        };
    }

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            const errMsg = data?.error?.message || `Gemini API error ${response.status}`;
            return res.status(response.status).json({ error: errMsg });
        }

        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        res.status(200).json({ text });
    } catch (err) {
        console.error('AI Proxy error:', err);
        res.status(500).json({ error: err.message });
    }
});



// --- Holidays Proxy API ---
app.get('/api/holidays/:year/:country', async (req, res) => {
    try {
        const { year, country } = req.params;

        // Nager.Date does not support India (IN), so we use a hardcoded fallback
        if (country.toUpperCase() === 'IN') {
            const inHolidays = {
                "2026": [
                    { date: "2026-01-01", name: "New Year's Day", countryCode: "IN" },
                    { date: "2026-01-26", name: "Republic Day", countryCode: "IN" },
                    { date: "2026-03-04", name: "Holi", countryCode: "IN" },
                    { date: "2026-04-03", name: "Good Friday", countryCode: "IN" },
                    { date: "2026-05-01", name: "May Day", countryCode: "IN" },
                    { date: "2026-08-15", name: "Independence Day", countryCode: "IN" },
                    { date: "2026-10-02", name: "Gandhi Jayanti", countryCode: "IN" },
                    { date: "2026-10-19", name: "Dussehra", countryCode: "IN" },
                    { date: "2026-11-08", name: "Diwali", countryCode: "IN" },
                    { date: "2026-12-25", name: "Christmas Day", countryCode: "IN" }
                ]
            };
            return res.status(200).json(inHolidays[year] || []);
        }

        const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });

        if (response.status === 204) {
            return res.status(200).json([]); // Handle 204 explicitly
        }

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Failed to fetch holidays from Nager API' });
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (error) {
        console.error("Holiday API proxy error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- Google Calendar ICS Proxy ---
app.use('/api/calendar/upload', express.text({ limit: '10mb', type: '*/*' }));

app.post('/api/calendar/upload', (req, res) => {
    try {
        if (!req.body) return res.status(400).json({ error: 'No content' });
        fs.writeFileSync(path.join(__dirname, 'data', 'calendar.ics'), req.body, 'utf-8');
        res.status(200).json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/calendar/local', (req, res) => {
    try {
        const p = path.join(__dirname, 'data', 'calendar.ics');
        if (fs.existsSync(p)) fs.unlinkSync(p);
        res.status(200).json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Daily Status Templates API (Markdown Files) ---
const TEMPLATE_DIR = path.join(__dirname, 'data', 'templates');
if (!fs.existsSync(TEMPLATE_DIR)) {
    fs.mkdirSync(TEMPLATE_DIR, { recursive: true });
}

const DEFAULT_TEMPLATES = [
    {
        id: "std-standup",
        name: "Standard Daily Standup",
        content: `# Daily Status Report - {DATE}\n\n## ✅ Completed Today\n{TASKS_COMPLETED}\n\n## 🚧 In Progress / Next Steps\n{TASKS_IN_PROGRESS}\n\n## 🚫 Blockers / Concerns\n{TASKS_BLOCKED}\n\n---\n*Generated from today's work logs*`
    },
    {
        id: "tech-status",
        name: "Detailed Technical Status (with Table)",
        content: `# Tech Status Progress - {DATE}\n\n## Task Breakdown\n| Task / Activity | Project / Module | Status | Details / Notes / Links |\n| --- | --- | --- | --- |\n| {TASKS_TABLE_ROW} |\n\n## Summary of Accomplishments\n1. All code committed and verified locally.\n2. Zoro Productivity Workstation sync successful.\n3. Key artifacts updated and reviewed.\n\n## Key Links & References\n- PR: https://bitbucket.org/elosystemsteam/ic-tokyo/pull-requests/1361/diff\n- Jenkins Offline: http://10.42.24.115:8080/job/Vj_offline_01/17/console\n- Jenkins Online: http://10.42.24.115:8080/job/Vj_online_01/lastBuild/console`
    },
    {
        id: "exec-matrix",
        name: "Executive Summary & Metrics",
        content: `# Executive Status Summary - {DATE}\n\n## Deliverables Health\n| Stream | Key Progress Metrics | Status Health |\n| --- | --- | --- |\n| Engineering Deliverables | Completed: **{TASKS_COMPLETED_COUNT}** | ✅ On Track |\n| In Flight Workstreams | Active: **{TASKS_IN_PROGRESS_COUNT}** | 🔄 Active |\n| Impediments & Blockers | Blocked: **{TASKS_BLOCKED_COUNT}** | {HEALTH_STATUS} |\n\n## Strategic Highlights\n- Accomplished today's core deliverables. See detailed task list for notes.\n- Aligned with team on status priorities.\n- Maintained quality checks and test coverage.\n- Reviewed PRs and provided feedback.\n\n## Risk / Action Items\n| Risk / Item | Owner | ETA |\n| --- | --- | --- |\n| {BLOCKER_ITEM} | TBD | TBD |`
    }
];

function seedTemplatesIfEmpty() {
    try {
        const files = fs.readdirSync(TEMPLATE_DIR);
        const mdFiles = files.filter(f => f.endsWith('.md'));
        if (mdFiles.length === 0) {
            DEFAULT_TEMPLATES.forEach(t => {
                const fileContent = `<!-- name: ${t.name} -->\n${t.content}`;
                fs.writeFileSync(path.join(TEMPLATE_DIR, `${t.id}.md`), fileContent, 'utf-8');
            });
        }
    } catch (err) {
        console.error("Failed to seed templates:", err);
    }
}
seedTemplatesIfEmpty();

app.get('/api/status/templates', (req, res) => {
    try {
        const files = fs.readdirSync(TEMPLATE_DIR);
        const mdFiles = files.filter(f => f.endsWith('.md'));
        const templates = mdFiles.map(file => {
            const filePath = path.join(TEMPLATE_DIR, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const id = file.replace(/\.md$/, '');

            let name = id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            let cleanContent = content;
            const nameMatch = content.match(/^<!-- name:\s*(.*?)\s*-->/);
            if (nameMatch) {
                name = nameMatch[1];
                cleanContent = content.substring(nameMatch[0].length).trim();
            }

            return { id, name, content: cleanContent };
        });
        res.json(templates);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/status/templates', (req, res) => {
    try {
        const { templates } = req.body;
        if (!templates || !Array.isArray(templates)) {
            return res.status(400).json({ error: 'Invalid or missing templates array' });
        }

        const existingFiles = fs.readdirSync(TEMPLATE_DIR).filter(f => f.endsWith('.md'));
        const newIds = templates.map(t => `${t.id}.md`);

        existingFiles.forEach(file => {
            if (!newIds.includes(file)) {
                fs.unlinkSync(path.join(TEMPLATE_DIR, file));
            }
        });

        templates.forEach(t => {
            const fileContent = `<!-- name: ${t.name} -->\n${t.content}`;
            fs.writeFileSync(path.join(TEMPLATE_DIR, `${t.id}.md`), fileContent, 'utf-8');
        });

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/calendar/upcoming', async (req, res) => {
    try {
        const url = req.query.url;
        const useLocal = req.query.local === 'true';

        if (!url && !useLocal) return res.status(400).json({ error: 'Missing calendar source' });

        let events;
        if (useLocal) {
            const p = path.join(__dirname, 'data', 'calendar.ics');
            if (!fs.existsSync(p)) return res.status(404).json({ error: 'Local calendar not found' });
            const data = fs.readFileSync(p, 'utf-8');
            events = ical.parseICS(data);
        } else {
            events = await ical.async.fromURL(url);
        }

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        // Fetch up to 1 year in advance to ensure we find at least 6 events
        const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const rangeEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

        let output = [];
        for (const k in events) {
            if (!Object.hasOwn(events, k)) continue;
            const ev = events[k];
            if (ev.type !== 'VEVENT') continue;

            const title = ev.summary;
            const start = ev.start;

            if (typeof ev.rrule === 'undefined') {
                if (start >= rangeStart && start <= rangeEnd) {
                    output.push({ date: start.toISOString(), name: title });
                }
            } else {
                const dates = ev.rrule.between(rangeStart, rangeEnd);
                for (const date of dates) {
                    output.push({ date: date.toISOString(), name: title });
                }
            }
        }

        // Sort ascending
        output.sort((a, b) => a.date.localeCompare(b.date));

        // Return up to 20 to be safe (frontend will limit to 6 or more)
        res.status(200).json(output.slice(0, 20));
    } catch (e) {
        console.error("Upcoming Calendar API error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/calendar/:year/:month', async (req, res) => {
    try {
        const { year, month } = req.params;
        const url = req.query.url;
        const useLocal = req.query.local === 'true';

        if (!url && !useLocal) return res.status(400).json({ error: 'Missing calendar source' });

        let events;
        if (useLocal) {
            const p = path.join(__dirname, 'data', 'calendar.ics');
            if (!fs.existsSync(p)) return res.status(404).json({ error: 'Local calendar not found' });
            const data = fs.readFileSync(p, 'utf-8');
            events = ical.parseICS(data);
        } else {
            events = await ical.async.fromURL(url);
        }
        // month is 1-indexed from frontend
        const rangeStart = new Date(year, parseInt(month) - 1, 1);
        const rangeEnd = new Date(year, parseInt(month), 0, 23, 59, 59);

        const output = [];

        for (const k in events) {
            if (!Object.hasOwn(events, k)) continue;
            const ev = events[k];
            if (ev.type !== 'VEVENT') continue;

            const title = ev.summary;
            const start = ev.start;

            if (typeof ev.rrule === 'undefined') {
                if (start >= rangeStart && start <= rangeEnd) {
                    output.push({ date: start.toISOString(), name: title });
                }
            } else {
                const dates = ev.rrule.between(rangeStart, rangeEnd);
                for (const date of dates) {
                    output.push({ date: date.toISOString(), name: title });
                }
            }
        }
        res.status(200).json(output);
    } catch (e) {
        console.error("Calendar API error:", e);
        res.status(500).json({ error: e.message });
    }
});

// ════════════════════════════════════════════
// SETTINGS / BACKUP ENDPOINTS
// ════════════════════════════════════════════

app.post('/api/backup', (req, res) => {
    try {
        const dataPath = path.join(__dirname, 'data');
        if (!fs.existsSync(dataPath)) {
            fs.mkdirSync(dataPath, { recursive: true });
        }
        
        // Save localStorage data sent from client
        if (req.body && req.body.localStorageData) {
            fs.writeFileSync(
                path.join(dataPath, 'local_storage.json'), 
                JSON.stringify(req.body.localStorageData, null, 2)
            );
        }

        const zip = new AdmZip();
        zip.addLocalFolder(dataPath, 'data');

        const zipBuffer = zip.toBuffer();
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', 'attachment; filename="zoro_dashboard_backup.zip"');
        res.send(zipBuffer);
    } catch (e) {
        console.error("Backup generation failed:", e);
        res.status(500).json({ error: 'Failed to generate backup' });
    }
});

app.post('/api/restore', upload.single('backup'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No backup file uploaded' });
    }

    try {
        const zip = new AdmZip(req.file.path);
        const extractPath = __dirname;

        // Extract the zip to the root (since we backed up 'data' folder inside)
        // Overwrite existing files
        zip.extractAllTo(extractPath, true);

        // Cleanup uploaded file
        fs.unlinkSync(req.file.path);

        // Check if localStorage backup exists
        let localStorageData = null;
        const lsBackupPath = path.join(__dirname, 'data', 'local_storage.json');
        if (fs.existsSync(lsBackupPath)) {
            try {
                localStorageData = JSON.parse(fs.readFileSync(lsBackupPath, 'utf8'));
                // Optional: remove after reading so it doesn't clutter
                fs.unlinkSync(lsBackupPath);
            } catch (e) {
                console.error("Failed to parse local_storage.json", e);
            }
        }

        res.status(200).json({ 
            success: true, 
            message: 'Backup restored successfully',
            localStorageData 
        });
    } catch (e) {
        console.error("Backup restoration failed:", e);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Failed to restore backup' });
    }
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 Zoro's Portal Server running at http://localhost:${PORT}`);
    console.log(`✅ App and APIs are active.`);
    console.log(`=================================================\n`);
});
