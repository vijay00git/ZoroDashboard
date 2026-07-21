const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');
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
const CSV_DIR = path.join(__dirname, 'data', 'csv-organizer');
const SS_DIR  = path.join(__dirname, 'data', 'screenshots');
const TCD_DIR = path.join(__dirname, 'data', 'testcase-dashboard');
const SETTINGS_DIR = path.join(__dirname, 'data', 'settings');
[DATA_DIR, NOTES_DIR, TS_DIR, QL_DIR, CSV_DIR, SS_DIR, TCD_DIR, SETTINGS_DIR].forEach(dir => {
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

// --- CSV Organizer API ---
app.get('/api/csvfiles', (req, res) => {
    try {
        const files = fs.readdirSync(CSV_DIR).filter(f => f.endsWith('.csv'));
        const list = files.map(f => {
            const fp = path.join(CSV_DIR, f);
            const stat = fs.statSync(fp);
            const content = fs.readFileSync(fp, 'utf-8');
            const lines = content.split(/[\r\n]+/).filter(Boolean);
            const cols = lines[0] ? lines[0].split(',').length : 0;
            return {
                id: f.replace(/\.csv$/i, ''),
                name: f,
                rows: Math.max(0, lines.length - 1),
                cols,
                size: stat.size,
                mtime: stat.mtimeMs
            };
        });
        res.json({ files: list });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/csvfiles/:id', (req, res) => {
    const fp = path.join(CSV_DIR, `${req.params.id}.csv`);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    try { res.json({ content: fs.readFileSync(fp, 'utf-8') }); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/csvfiles', (req, res) => {
    const { name, content } = req.body;
    if (!name || content === undefined) return res.status(400).json({ error: 'Missing name or content' });
    const safe = name.replace(/[^a-z0-9_\-]/gi, '_').replace(/\.csv$/i, '');
    const fp = path.join(CSV_DIR, `${safe}.csv`);
    try {
        fs.writeFileSync(fp, content, 'utf-8');
        res.json({ success: true, id: safe });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/csvfiles/:id', (req, res) => {
    const { content, newName } = req.body;
    const fp = path.join(CSV_DIR, `${req.params.id}.csv`);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    try {
        if (content !== undefined) fs.writeFileSync(fp, content, 'utf-8');
        if (newName) {
            const safe = newName.replace(/[^a-z0-9_\-]/gi, '_').replace(/\.csv$/i, '');
            const newFp = path.join(CSV_DIR, `${safe}.csv`);
            fs.renameSync(fp, newFp);
            return res.json({ success: true, id: safe });
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/csvfiles/:id', (req, res) => {
    const fp = path.join(CSV_DIR, `${req.params.id}.csv`);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    try { fs.unlinkSync(fp); res.json({ success: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
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

// --- TestRail: Fetch all tests in a run ---
app.post('/api/testrail/fetch-run', async (req, res) => {
    const { runId, auth } = req.body;

    if (!runId || !auth) {
        return res.status(400).json({ error: 'Missing runId or auth.' });
    }

    const STATUS_MAP = { 1: 'PASSED', 2: 'BLOCKED', 3: 'UNTESTED', 4: 'RETEST', 5: 'FAILED' };
    const BASE = 'https://elosystemsteam.testrail.com/index.php?/api/v2';
    let allTests = [];
    let offset = 0;
    const LIMIT = 250;

    try {
        while (true) {
            const url = `${BASE}/get_tests/${runId}&limit=${LIMIT}&offset=${offset}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errText = await response.text();
                return res.status(response.status).json({ error: errText });
            }

            const data = await response.json();
            const tests = Array.isArray(data) ? data : (data.tests || []);
            allTests.push(...tests);
            if (tests.length < LIMIT) break;
            offset += LIMIT;
        }

        const normalized = allTests.map(t => ({
            id: String(t.case_id),
            title: t.title || '',
            status: STATUS_MAP[t.status_id] || 'UNTESTED',
            status_id: t.status_id
        }));

        res.json({ tests: normalized, total: normalized.length });
    } catch (error) {
        console.error("Fetch-run proxy error:", error);
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

// --- AI Proxy API (Gemini + Groq) ---

const GROQ_MODELS = [
    { id: 'llama-3.3-70b-versatile',  displayName: 'Llama 3.3 70B Versatile (Best)' },
    { id: 'llama-3.1-8b-instant',     displayName: 'Llama 3.1 8B Instant (Fastest)' },
    { id: 'gemma2-9b-it',             displayName: 'Gemma 2 9B (Google, Free)' },
    { id: 'llama3-8b-8192',           displayName: 'Llama 3 8B 8192' },
];

// List available models for the user's key
app.get('/api/ai/models', async (req, res) => {
    const { key, provider } = req.query;
    if (!key) return res.status(400).json({ error: 'Missing key' });

    if (provider === 'groq') {
        return res.json({ models: GROQ_MODELS });
    }

    // Gemini
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
    const { key, model, system, prompt, provider } = req.body;

    if (!key || !prompt) {
        return res.status(400).json({ error: 'Missing key or prompt' });
    }

    // --- Groq (OpenAI-compatible) ---
    if (provider === 'groq') {
        const messages = [];
        if (system) messages.push({ role: 'system', content: system });
        messages.push({ role: 'user', content: prompt });

        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: model || 'llama-3.3-70b-versatile',
                    messages,
                    temperature: 0.7,
                    max_tokens: 2048
                })
            });
            const data = await response.json();
            if (!response.ok) {
                const errMsg = data?.error?.message || `Groq API error ${response.status}`;
                return res.status(response.status).json({ error: errMsg });
            }
            const text = data?.choices?.[0]?.message?.content || '';
            return res.status(200).json({ text });
        } catch (err) {
            console.error('Groq Proxy error:', err);
            return res.status(500).json({ error: err.message });
        }
    }

    // --- Gemini ---
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
        console.error('Gemini Proxy error:', err);
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
// SS BUCKET — SCREENSHOTS
// ════════════════════════════════════════════

const SS_META = path.join(SS_DIR, 'meta.json');

// Read groups metadata (no image data — filenames only)
app.get('/api/screenshots/meta', (req, res) => {
    try {
        if (!fs.existsSync(SS_META)) return res.json({ groups: [] });
        res.json(JSON.parse(fs.readFileSync(SS_META, 'utf-8')));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Save groups metadata — keep a rolling 5-version backup before every write
const SS_META_BAK = (n) => SS_META.replace(/\.json$/, `.bak${n}.json`);
app.post('/api/screenshots/meta', (req, res) => {
    try {
        const { groups } = req.body;
        if (!Array.isArray(groups)) return res.status(400).json({ error: 'groups must be an array' });
        // Don't overwrite real data with an empty array if the current file has content
        if (groups.length === 0 && fs.existsSync(SS_META)) {
            try {
                const current = JSON.parse(fs.readFileSync(SS_META, 'utf-8'));
                const totalShots = (current.groups || []).reduce((s, g) => s + (g.screenshots || []).length, 0);
                if (totalShots > 0) return res.status(409).json({ error: 'Refusing to overwrite non-empty metadata with empty groups' });
            } catch { /* parse error — allow write */ }
        }
        // Rotate backups: bak4 ← bak3 ← bak2 ← bak1 ← bak0 ← current
        if (fs.existsSync(SS_META)) {
            for (let i = 4; i > 0; i--) {
                if (fs.existsSync(SS_META_BAK(i - 1))) fs.copyFileSync(SS_META_BAK(i - 1), SS_META_BAK(i));
            }
            fs.copyFileSync(SS_META, SS_META_BAK(0));
        }
        fs.writeFileSync(SS_META, JSON.stringify({ groups }, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Upload a screenshot image
const ssUpload = multer({ dest: path.join(__dirname, 'uploads') });
app.post('/api/screenshots/upload', ssUpload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const id = (req.body.id || `ss_${Date.now()}`).replace(/[^a-z0-9_-]/gi, '_');
    const ext = (req.file.mimetype.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const filename = `${id}.${ext}`;
    const dest = path.join(SS_DIR, filename);
    try {
        fs.renameSync(req.file.path, dest);
        res.json({ id, filename });
    } catch (e) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: e.message });
    }
});

// Serve a screenshot image
app.get('/api/screenshots/img/:filename', (req, res) => {
    const filename = path.basename(req.params.filename); // prevents traversal
    const fp = path.join(SS_DIR, filename);
    if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
    res.sendFile(fp);
});

// Delete a screenshot image
app.delete('/api/screenshots/img/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const fp = path.join(SS_DIR, filename);
    try {
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        res.json({ success: true });
    } catch (e) {
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

// ════════════════════════════════════════════
// TEST CASE DASHBOARD — E2E manifest / TestRail / Jenkins
// Ported from the standalone ~/.claude/testcase-dashboard tool. Reads a
// manually-maintained manifest of Cypress/Robot files, cross-references
// their it() blocks against TestRail, and can trigger/track Jenkins builds
// for them. Notes/history live in data/testcase-dashboard/; the TestRail/
// Jenkins/Telegram credentials themselves live in data/settings/ since
// they're shared infrastructure usable from any page (Settings' Integrations
// tab), not just this one.
// ════════════════════════════════════════════

const INTEGRATIONS_CONFIG_PATH = path.join(SETTINGS_DIR, 'integrations.local.json');
const TCD_NOTES_PATH = path.join(TCD_DIR, 'notes.json');
const TCD_HISTORY_PATH = path.join(TCD_DIR, 'job-history.json');
const TCD_QUEUE_STATE_PATH = path.join(TCD_DIR, 'queue-state.json');
const TCD_MANIFEST_PATH = process.env.TCD_MANIFEST_PATH || path.join(os.homedir(), '.claude', 'ic-tokyo-file-manifest.md');
const TCD_E2E_ROOT = process.env.TCD_E2E_ROOT || path.join(os.homedir(), 'ic-tokyo', 'services', 'polaris-web-client', 'e2e');

let tcdNotesCache = null;
function tcdLoadNotes() {
    if (tcdNotesCache) return tcdNotesCache;
    try {
        tcdNotesCache = JSON.parse(fs.readFileSync(TCD_NOTES_PATH, 'utf8'));
    } catch (e) {
        tcdNotesCache = {};
    }
    return tcdNotesCache;
}
function tcdSaveNotes() {
    try {
        fs.writeFileSync(TCD_NOTES_PATH, JSON.stringify(tcdNotesCache || {}, null, 2));
    } catch (e) {
        console.error('[testcases] failed to save notes:', e.message);
    }
}

let TCD_TR_CONFIG = null;
function tcdLoadTrConfig() {
    if (TCD_TR_CONFIG) return TCD_TR_CONFIG;
    const raw = JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
    TCD_TR_CONFIG = {
        url: raw.TESTRAIL_URL.replace(/\/+$/, ''),
        auth: Buffer.from(`${raw.TESTRAIL_USERNAME}:${raw.TESTRAIL_API_KEY}`).toString('base64'),
        projectId: raw.TESTRAIL_PROJECT_ID,
        suiteId: raw.TESTRAIL_SUITE_ID,
    };
    return TCD_TR_CONFIG;
}

function tcdTrGet(endpoint) {
    const { url, auth } = tcdLoadTrConfig();
    return new Promise((resolve, reject) => {
        const req = https.get(url + endpoint, {
            headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                if (res.statusCode === 429) {
                    reject(new Error('TestRail rate limit hit (429) — wait a bit and try again'));
                    return;
                }
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    reject(new Error(`TestRail ${res.statusCode}: ${body.slice(0, 300)}`));
                    return;
                }
                try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => req.destroy(new Error('TestRail request timed out after 15s')));
    });
}

let TCD_JENKINS_CONFIG = null;
function tcdLoadJenkinsConfig() {
    if (TCD_JENKINS_CONFIG) return TCD_JENKINS_CONFIG;
    const raw = JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
    TCD_JENKINS_CONFIG = {
        url: raw.JENKINS_URL.replace(/\/+$/, ''),
        auth: Buffer.from(`${raw.JENKINS_USERNAME}:${raw.JENKINS_API_TOKEN}`).toString('base64'),
        jobs: raw.JENKINS_JOBS || { ONLINE: [], OFFLINE: [], E2E: [] },
        defaultEnvironment: raw.JENKINS_DEFAULT_ENVIRONMENT || 'qa',
    };
    return TCD_JENKINS_CONFIG;
}

let tcdEnvironmentChoicesCache = null;

// Generic request helper — Jenkins may be plain HTTP on an internal host, so
// the transport is picked from the URL itself.
function tcdHttpRequest(urlStr, { method = 'GET', headers = {}, body = null, timeoutMs = 15000 } = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const transport = u.protocol === 'https:' ? https : http;
        const req = transport.request(u, { method, headers }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => req.destroy(new Error(`Request to ${urlStr} timed out after ${timeoutMs}ms`)));
        if (body) req.write(body);
        req.end();
    });
}

// Same as tcdHttpRequest but accumulates the response as a Buffer instead of
// a string — needed for anything binary (screenshots). tcdHttpRequest's
// `data += chunk` string concatenation silently corrupts binary bytes, since
// it forces a text encoding on every chunk.
function tcdHttpRequestBinary(urlStr, { method = 'GET', headers = {}, timeoutMs = 20000 } = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const transport = u.protocol === 'https:' ? https : http;
        const req = transport.request(u, { method, headers }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => req.destroy(new Error(`Request to ${urlStr} timed out after ${timeoutMs}ms`)));
        req.end();
    });
}

// Reads the real ENVIRONMENT choice list from the job's own Jenkins
// parameter definition, instead of guessing/hardcoding valid values.
async function tcdGetEnvironmentChoices() {
    if (tcdEnvironmentChoicesCache) return tcdEnvironmentChoicesCache;
    const { url, auth, jobs, defaultEnvironment } = tcdLoadJenkinsConfig();
    const anyJob = (jobs.OFFLINE || [])[0] || (jobs.ONLINE || [])[0];
    if (!anyJob) return [defaultEnvironment];
    try {
        const res = await tcdHttpRequest(
            `${url}/job/${encodeURIComponent(anyJob)}/api/json?tree=property[parameterDefinitions[name,choices]]`,
            { headers: { Authorization: `Basic ${auth}` } }
        );
        const json = JSON.parse(res.body);
        const defs = (json.property && json.property[0] && json.property[0].parameterDefinitions) || [];
        const envDef = defs.find((d) => d.name === 'ENVIRONMENT' && d.choices);
        tcdEnvironmentChoicesCache = envDef ? envDef.choices : [defaultEnvironment];
    } catch (e) {
        tcdEnvironmentChoicesCache = [defaultEnvironment];
    }
    return tcdEnvironmentChoicesCache;
}

// Jenkins CSRF protection issues a crumb tied to the requesting session/IP;
// fetched fresh per trigger rather than cached, since crumbs can be
// invalidated and a stale one just fails the build request outright.
async function tcdGetJenkinsCrumb() {
    const { url, auth } = tcdLoadJenkinsConfig();
    try {
        const res = await tcdHttpRequest(`${url}/crumbIssuer/api/json`, {
            headers: { Authorization: `Basic ${auth}` },
        });
        if (res.statusCode !== 200) return null;
        const json = JSON.parse(res.body);
        return { field: json.crumbRequestField, value: json.crumb };
    } catch (e) {
        return null; // crumb issuer disabled/unavailable — proceed without one
    }
}

async function tcdTriggerJenkinsJob(jobName, params) {
    const { url, auth, jobs } = tcdLoadJenkinsConfig();
    const known = [].concat(jobs.ONLINE || [], jobs.OFFLINE || [], jobs.E2E || []);
    if (!known.includes(jobName)) {
        throw new Error(`"${jobName}" is not a configured Jenkins job`);
    }

    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') qs.set(k, v); });

    const crumb = await tcdGetJenkinsCrumb();
    const headers = { Authorization: `Basic ${auth}` };
    if (crumb) headers[crumb.field] = crumb.value;

    const res = await tcdHttpRequest(`${url}/job/${encodeURIComponent(jobName)}/buildWithParameters?${qs.toString()}`, {
        method: 'POST',
        headers,
    });

    if (res.statusCode !== 201 && res.statusCode !== 200) {
        throw new Error(`Jenkins ${res.statusCode}: ${res.body.slice(0, 300)}`);
    }
    return { jobName, queueUrl: res.headers.location || null, jobUrl: `${url}/job/${encodeURIComponent(jobName)}/` };
}

// =======================================================================
// Job queue — a worker-pool over Jenkins' own job set, not one shared job.
// Each queued item names a *category* (OFFLINE/ONLINE/E2E); at dispatch time
// the pump picks whichever job in that category's pool is actually idle on
// Jenkins right now. Runs server-side (not tied to a browser tab) so
// dispatch keeps happening even if the dashboard isn't open.
// =======================================================================

const TCD_HISTORY_MAX = 200;
const TCD_PUMP_INTERVAL_MS = 10000; // safety-net repoll

let tcdJobQueue = [];
let tcdRunningJobs = [];
let tcdJobHistory = [];
let tcdPumpInFlight = false;

(function tcdLoadHistoryOnBoot() {
    try {
        tcdJobHistory = JSON.parse(fs.readFileSync(TCD_HISTORY_PATH, 'utf8'));
    } catch (e) {
        tcdJobHistory = [];
    }
    let changed = false;
    tcdJobHistory.forEach((h) => {
        if (!h.id) { h.id = `${h.completedAt || Date.now()}-${Math.random().toString(36).slice(2, 8)}`; changed = true; }
    });
    if (changed) tcdSaveHistory();
})();

function tcdSaveQueueState() {
    try {
        fs.writeFileSync(TCD_QUEUE_STATE_PATH, JSON.stringify({ queue: tcdJobQueue, running: tcdRunningJobs }, null, 2));
    } catch (e) {
        console.error('[testcases] failed to save queue state:', e.message);
    }
}

function tcdSaveHistory() {
    try {
        fs.writeFileSync(TCD_HISTORY_PATH, JSON.stringify(tcdJobHistory.slice(0, TCD_HISTORY_MAX), null, 2));
    } catch (e) {
        console.error('[testcases] failed to save history:', e.message);
    }
}

function tcdSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Jenkins' buildWithParameters only hands back a *queue* item — the real
// build number doesn't exist until Jenkins schedules an executor for it.
// A poll failure just costs a retry slot instead of ending the whole thing.
async function tcdPollQueueItem(queueUrl, jenkinsAuth) {
    let misses = 0;
    for (let i = 0; i < 60; i++) { // up to ~3 minutes of real (non-error) attempts
        try {
            const res = await tcdHttpRequest(`${queueUrl}api/json`, { headers: { Authorization: `Basic ${jenkinsAuth}` }, timeoutMs: 30000 });
            if (res.statusCode === 200) {
                const json = JSON.parse(res.body);
                if (json.cancelled) throw new Error('Build was cancelled while queued');
                if (json.executable) return json.executable; // { number, url }
            }
        } catch (e) {
            if (e.message === 'Build was cancelled while queued') throw e;
            misses++;
            console.error(`[testcases] pollQueueItem transient failure (${misses}): ${e.message}`);
            if (misses >= 20) throw new Error(`Gave up waiting for an executor after ${misses} failed polls: ${e.message}`);
        }
        await tcdSleep(3000);
    }
    throw new Error('Timed out waiting for Jenkins to start the build (still queued after 3 minutes)');
}

async function tcdPollBuildUntilDone(buildUrl, jenkinsAuth) {
    let misses = 0;
    for (let i = 0; i < 900; i++) { // up to ~2 hours of real (non-error) attempts
        try {
            const res = await tcdHttpRequest(`${buildUrl}api/json`, { headers: { Authorization: `Basic ${jenkinsAuth}` }, timeoutMs: 30000 });
            if (res.statusCode === 200) {
                const json = JSON.parse(res.body);
                if (!json.building) return { result: json.result, duration: json.duration };
                misses = 0; // a good response resets the transient-failure counter
            }
        } catch (e) {
            misses++;
            console.error(`[testcases] pollBuildUntilDone transient failure (${misses}): ${e.message}`);
            if (misses >= 30) throw new Error(`Gave up polling the build after ${misses} consecutive failed requests: ${e.message}`);
        }
        await tcdSleep(8000);
    }
    throw new Error('Timed out waiting for the build to finish (still running after 2 hours)');
}

async function tcdJenkinsGetJsonWithRetry(url, jenkinsAuth, attempts = 4) {
    for (let i = 1; i <= attempts; i++) {
        try {
            const res = await tcdHttpRequest(url, { headers: { Authorization: `Basic ${jenkinsAuth}` }, timeoutMs: 30000 });
            if (res.statusCode === 200) return JSON.parse(res.body);
            throw new Error(`Jenkins ${res.statusCode}`);
        } catch (e) {
            if (i === attempts) throw e;
            await tcdSleep(3000 * i);
        }
    }
}

// Cypress screenshot filenames carry the full spec title verbatim — brackets,
// parens, spaces — which Jenkins' server rejects outright if passed through
// unencoded. Each path segment needs its own encodeURIComponent pass.
function tcdEncodeArtifactPath(relativePath) {
    return relativePath.split('/').map(encodeURIComponent).join('/');
}

// Jenkins' artifacts tree API exposes no timestamp, but ArtifactArchiver
// preserves each file's original workspace mtime as the Last-Modified
// header — a cheap HEAD request per file recovers it.
async function tcdGetArtifactTime(url, jenkinsAuth) {
    try {
        const res = await tcdHttpRequest(url, { method: 'HEAD', headers: { Authorization: `Basic ${jenkinsAuth}` }, timeoutMs: 15000 });
        const lastModified = res.headers['last-modified'];
        return lastModified ? new Date(lastModified).getTime() : null;
    } catch (e) {
        return null;
    }
}

async function tcdGetBuildArtifacts(buildUrl, jenkinsAuth) {
    try {
        const json = await tcdJenkinsGetJsonWithRetry(`${buildUrl}api/json?tree=artifacts[fileName,relativePath]`, jenkinsAuth);
        const artifacts = (json.artifacts || []).map((a) => ({ name: a.fileName, url: `${buildUrl}artifact/${tcdEncodeArtifactPath(a.relativePath)}` }));
        const times = await Promise.all(artifacts.map((a) => tcdGetArtifactTime(a.url, jenkinsAuth)));
        artifacts.forEach((a, i) => { a.time = times[i]; });
        return artifacts;
    } catch (e) {
        console.error(`[testcases] getBuildArtifacts failed after retries: ${e.message}`);
        return [];
    }
}

async function tcdJenkinsGetTextWithRetry(url, jenkinsAuth, attempts = 4) {
    for (let i = 1; i <= attempts; i++) {
        try {
            const res = await tcdHttpRequest(url, { headers: { Authorization: `Basic ${jenkinsAuth}` }, timeoutMs: 30000 });
            if (res.statusCode === 200) return res.body;
            throw new Error(`Jenkins ${res.statusCode}`);
        } catch (e) {
            if (i === attempts) throw e;
            await tcdSleep(3000 * i);
        }
    }
}

// The CSV ends with an "=== EXECUTION SUMMARY ===" block of quoted
// "Label","Value" rows — parsed with a small regex per label since this
// one section's shape is fixed.
function tcdParseCsvSummary(text) {
    const field = (label) => {
        const m = text.match(new RegExp(`"${label.replace(/\//g, '\\/')}"\\s*,\\s*"([^"]*)"`));
        return m ? m[1] : null;
    };
    const toNum = (v) => (v == null ? 0 : parseInt(v, 10) || 0);
    const tests = field('Total Tests');
    if (tests === null) return null; // no summary block found — not our CSV shape
    return {
        tests: toNum(tests),
        passes: toNum(field('Passed')),
        failures: toNum(field('Failed')),
        pending: toNum(field('Skipped/Pending')),
        duration: null,
    };
}

// Pass/fail counts come from whichever report the job actually archived.
// master-report.json (mochawesome) is preferred; test-results.csv's own
// "EXECUTION SUMMARY" footer is the fallback source.
async function tcdGetTestStats(artifacts, jenkinsAuth) {
    const reportArtifact = artifacts.find((a) => a.name === 'master-report.json');
    if (reportArtifact) {
        try {
            const json = await tcdJenkinsGetJsonWithRetry(reportArtifact.url, jenkinsAuth);
            const stats = json.stats || {};
            return {
                tests: stats.tests || 0,
                passes: stats.passes || 0,
                failures: stats.failures || 0,
                pending: stats.pending || 0,
                duration: stats.duration || 0,
            };
        } catch (e) {
            console.error(`[testcases] getTestStats (master-report.json) failed after retries: ${e.message}`);
        }
    }

    const csvArtifact = artifacts.find((a) => a.name === 'test-results.csv');
    if (csvArtifact) {
        try {
            const text = await tcdJenkinsGetTextWithRetry(csvArtifact.url, jenkinsAuth);
            return tcdParseCsvSummary(text);
        } catch (e) {
            console.error(`[testcases] getTestStats (test-results.csv) failed after retries: ${e.message}`);
        }
    }

    return null;
}

// True if this Jenkins job has no build currently running. A job with no
// prior builds (404 on lastBuild) counts as free.
async function tcdIsJobFree(jobName) {
    const { url, auth } = tcdLoadJenkinsConfig();
    try {
        const res = await tcdHttpRequest(`${url}/job/${encodeURIComponent(jobName)}/lastBuild/api/json?tree=building`, {
            headers: { Authorization: `Basic ${auth}` },
        });
        if (res.statusCode === 404) return true;
        if (res.statusCode !== 200) return false; // unknown state — don't risk double-booking
        const json = JSON.parse(res.body);
        return !json.building;
    } catch (e) {
        return false;
    }
}

// Shared by both the "stop a build" and "cancel a queued item" cancel paths
// below — Jenkins' crumb-issuer requirement applies to any POST, not just
// buildWithParameters.
async function tcdJenkinsAuthHeaders() {
    const { auth } = tcdLoadJenkinsConfig();
    const headers = { Authorization: `Basic ${auth}` };
    const crumb = await tcdGetJenkinsCrumb();
    if (crumb) headers[crumb.field] = crumb.value;
    return headers;
}

async function tcdStopBuildOnJenkins(buildUrl) {
    const headers = await tcdJenkinsAuthHeaders();
    await tcdHttpRequest(`${buildUrl}stop`, { method: 'POST', headers, timeoutMs: 15000 });
}

async function tcdCancelQueueItemOnJenkins(queueUrl) {
    const { url } = tcdLoadJenkinsConfig();
    const headers = await tcdJenkinsAuthHeaders();
    const m = String(queueUrl).match(/\/queue\/item\/(\d+)/);
    if (!m) return;
    await tcdHttpRequest(`${url}/queue/cancelItem?id=${m[1]}`, { method: 'POST', headers, timeoutMs: 15000 });
}

// Cancels a job that's already in `tcdRunningJobs` (still waiting for an
// executor, or actually building). Doesn't finalize it itself — that stays
// the job of tcdRunToCompletion's normal polling loop, which will notice
// the cancellation (Jenkins marks a stopped build's result 'ABORTED', and a
// cancelled queue item as `cancelled: true`) on its very next poll and
// finish exactly like any other terminal build. `cancelRequested` covers
// the brief window before a queueUrl even exists yet (mid buildWithParameters
// call) — tcdRunToCompletion checks it the moment one arrives.
async function tcdCancelRunningJob(id) {
    const running = tcdRunningJobs.find((r) => r.id === id);
    if (!running) return { ok: false, error: 'Job not found (it may have already finished)' };

    running.cancelRequested = true;
    try {
        if (running.buildUrl) await tcdStopBuildOnJenkins(running.buildUrl);
        else if (running.queueUrl) await tcdCancelQueueItemOnJenkins(running.queueUrl);
    } catch (e) {
        // Jenkins may already 404 here if the build/queue item is already
        // gone — the polling loop below still notices and finalizes it.
    }
    return { ok: true };
}

// Carries a `running` record through to completion from wherever it's
// currently at — used both for a freshly-dispatched item and for one being
// resumed after a server restart.
async function tcdRunToCompletion(running) {
    const { auth } = tcdLoadJenkinsConfig();

    try {
        if (!running.buildUrl) {
            if (!running.queueUrl) {
                const triggered = await tcdTriggerJenkinsJob(running.jobName, {
                    SPEC_PATH: running.path,
                    ENVIRONMENT: running.environment,
                    RUN_ID: running.runId || '',
                });
                running.jobUrl = triggered.jobUrl;
                running.queueUrl = triggered.queueUrl;
                running.status = 'queued-on-jenkins';
                tcdSaveQueueState();
                if (!running.queueUrl) throw new Error('Jenkins did not return a queue location — cannot track this build');
                // Cancel arrived while buildWithParameters was still in flight —
                // honor it now that there's finally a queue item to cancel.
                if (running.cancelRequested) await tcdCancelQueueItemOnJenkins(running.queueUrl).catch(() => {});
            }
            const executable = await tcdPollQueueItem(running.queueUrl, auth);
            running.buildNumber = executable.number;
            running.buildUrl = executable.url;
            running.status = 'building';
            tcdSaveQueueState();
        }

        const { result, duration } = await tcdPollBuildUntilDone(running.buildUrl, auth);
        running.status = result || 'UNKNOWN';
        running.duration = duration;
        running.artifacts = await tcdGetBuildArtifacts(running.buildUrl, auth);
        running.testStats = await tcdGetTestStats(running.artifacts, auth);
    } catch (err) {
        // A user-initiated cancel while still queued surfaces here as
        // tcdPollQueueItem's "cancelled while queued" throw — report it as
        // ABORTED (same terminal bucket Jenkins itself uses for a stopped
        // build) rather than a generic ERROR.
        running.status = running.cancelRequested ? 'ABORTED' : 'ERROR';
        running.error = err.message;
    }

    running.completedAt = Date.now();
    tcdJobHistory.unshift(running);
    tcdSaveHistory();
    tcdRunningJobs = tcdRunningJobs.filter((r) => r !== running);
    tcdSaveQueueState();
    tcdNotifyBuildResult(running); // fire-and-forget — never let a Telegram hiccup affect queue processing
    tcdPumpQueue(); // a slot just freed up — see if anything queued can use it
}

// Fire-and-forget: sends a Telegram alert for a build that just finished,
// gated independently by TELEGRAM_NOTIFY_ON_FAILURE / TELEGRAM_NOTIFY_ON_SUCCESS.
// Which artifact types ride along is the user's call too — every screenshot
// (TELEGRAM_ATTACH_SCREENSHOTS) and CSV report (TELEGRAM_ATTACH_CSV) get
// attached when their toggle is on and the build produced any (default true
// for both, so existing setups keep today's behavior until explicitly
// turned off). Falls back to plain text if there's nothing to attach, or if
// the attachment upload fails for any reason. Swallows its own errors since
// a notification failure must never affect the job queue itself.
function tcdNotifyBuildResult(running) {
    const status = String(running.status || '').toUpperCase();
    const isFailure = ['FAILURE', 'ERROR', 'ABORTED'].includes(status);
    const isSuccess = status === 'SUCCESS';
    if (!isFailure && !isSuccess) return;

    let cfg;
    try {
        cfg = JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
    } catch (e) {
        return;
    }
    if (!cfg.TELEGRAM_BOT_TOKEN || !cfg.TELEGRAM_CHAT_ID) return;
    if (isFailure && !cfg.TELEGRAM_NOTIFY_ON_FAILURE) return;
    if (isSuccess && !cfg.TELEGRAM_NOTIFY_ON_SUCCESS) return;

    const lines = [
        `${isSuccess ? '🟢' : '🔴'} Build ${running.status}`,
        running.path,
        `Job: ${running.jobName || '?'}${running.buildNumber ? ` #${running.buildNumber}` : ''}${running.runId ? ` | TestRail #${running.runId}` : ''}`,
    ];
    if (running.testStats) lines.push(`${running.testStats.passes} passed, ${running.testStats.failures} failed`);
    if (running.error) lines.push(`Error: ${running.error}`);
    if (running.buildUrl) lines.push(running.buildUrl);
    const text = lines.join('\n');

    const artifacts = running.artifacts || [];
    const attachScreenshots = cfg.TELEGRAM_ATTACH_SCREENSHOTS !== false; // default on
    const attachCsv = cfg.TELEGRAM_ATTACH_CSV !== false; // default on

    const attachments = [];
    if (attachScreenshots) {
        artifacts.filter((a) => /\.(png|jpe?g|gif|webp)$/i.test(a.name))
            .forEach((a) => attachments.push({ type: 'photo', url: a.url, filename: a.name }));
    }
    if (attachCsv) {
        artifacts.filter((a) => /\.csv$/i.test(a.name))
            .forEach((a) => attachments.push({ type: 'document', url: a.url, filename: a.name }));
    }

    if (attachments.length > 0) {
        tcdSendTelegramAttachments(attachments, text, cfg).catch((err) => {
            console.error('[testcases] Telegram attachment notify failed, falling back to text:', err.message);
            tcdSendTelegramMessage(text, cfg).catch((err2) => {
                console.error('[testcases] Telegram text fallback also failed:', err2.message);
            });
        });
    } else {
        tcdSendTelegramMessage(text, cfg).catch((err) => {
            console.error('[testcases] Telegram build notify failed:', err.message);
        });
    }
}

async function tcdDispatchJob(item, jobName) {
    // Reuse the queued item's own id (assigned in tcdEnqueueJobs) so a
    // client can hold onto one id across the whole queued → running →
    // history lifecycle — needed to cancel a job that gets dispatched out
    // from under it. Falls back to a fresh id for any pre-existing queue
    // item that predates this (e.g. one resumed from an older queue-state.json).
    const id = item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const running = { ...item, id, jobName, status: 'triggering', startedAt: Date.now() };
    tcdRunningJobs.push(running);
    tcdSaveQueueState();
    await tcdRunToCompletion(running);
}

// Called once at startup. Anything still in `running` when the process last
// exited was mid-build (or mid-trigger) and gets its polling resumed from
// exactly where it left off; anything still in `queue` just goes back
// through the normal pump.
function tcdResumeInFlightState() {
    try {
        const saved = JSON.parse(fs.readFileSync(TCD_QUEUE_STATE_PATH, 'utf8'));
        tcdJobQueue = saved.queue || [];
        // Backfill an id onto any queue entry saved before cancel support
        // existed — same pattern as tcdLoadHistoryOnBoot's id backfill —
        // so every queued item is cancellable, not just newly-enqueued ones.
        let idsAdded = false;
        tcdJobQueue.forEach((q) => {
            if (!q.id) { q.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; idsAdded = true; }
        });
        const savedRunning = saved.running || [];
        savedRunning.forEach((running) => {
            tcdRunningJobs.push(running);
            console.log(`[testcases] resuming tracking for ${running.path} (${running.jobName}, status was ${running.status})`);
            tcdRunToCompletion(running);
        });
        if (idsAdded) tcdSaveQueueState();
        if (tcdJobQueue.length || savedRunning.length) tcdPumpQueue();
    } catch (e) {
        tcdJobQueue = [];
    }
}

// Scans the queue in order and dispatches every item whose category pool has
// a job that's genuinely idle on Jenkins right now. Re-scans from the start
// after each dispatch since the busy-set changed.
async function tcdPumpQueue() {
    if (tcdPumpInFlight) return;
    tcdPumpInFlight = true;
    try {
        let progressed = true;
        while (progressed && tcdJobQueue.length > 0) {
            progressed = false;
            const { jobs } = tcdLoadJenkinsConfig();
            const busy = new Set(tcdRunningJobs.map((r) => r.jobName));
            for (let i = 0; i < tcdJobQueue.length; i++) {
                const item = tcdJobQueue[i];
                const pool = item.pinnedJob ? [item.pinnedJob] : (jobs[item.category] || []);
                const candidates = pool.filter((j) => !busy.has(j));
                if (candidates.length === 0) continue;

                let freeJob = null;
                for (const cand of candidates) {
                    if (await tcdIsJobFree(cand)) { freeJob = cand; break; }
                }
                if (!freeJob) continue;

                tcdJobQueue.splice(i, 1);
                busy.add(freeJob);
                tcdDispatchJob(item, freeJob); // not awaited — runs concurrently, calls tcdPumpQueue() again on completion
                progressed = true;
                break; // queue mutated — restart the scan
            }
        }
    } finally {
        tcdPumpInFlight = false;
    }
}

function tcdEnqueueJobs(items) {
    const now = Date.now();
    items.forEach((item) => tcdJobQueue.push({
        ...item, queuedAt: now, id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    }));
    tcdSaveQueueState();
    tcdPumpQueue();
}

setInterval(tcdPumpQueue, TCD_PUMP_INTERVAL_MS);

const TCD_DEFAULT_STATUSES = {
    1: 'Passed', 2: 'Blocked', 3: 'Untested', 4: 'Retest', 5: 'Failed',
};
let tcdStatusNameCache = null;

async function tcdGetStatusNames() {
    if (tcdStatusNameCache) return tcdStatusNameCache;
    try {
        const list = await tcdTrGet('/index.php?/api/v2/get_statuses');
        const map = {};
        (Array.isArray(list) ? list : []).forEach((s) => { map[s.id] = s.label || s.name; });
        tcdStatusNameCache = Object.keys(map).length ? map : TCD_DEFAULT_STATUSES;
    } catch (e) {
        tcdStatusNameCache = TCD_DEFAULT_STATUSES;
    }
    return tcdStatusNameCache;
}

const TCD_PAGE_SIZE = 250;
const TCD_PAGE_CONCURRENCY = 5;

async function tcdGetRunStatuses(runId) {
    const [statusNames, run] = await Promise.all([
        tcdGetStatusNames(),
        tcdTrGet(`/index.php?/api/v2/get_run/${runId}`).catch(() => null),
    ]);

    const statuses = {};
    function ingest(tests) {
        tests.forEach((t) => {
            statuses[String(t.case_id)] = {
                status_id: t.status_id,
                status: statusNames[t.status_id] || `Status ${t.status_id}`,
            };
        });
    }

    // get_run's own *_count fields sum to the run's total test count, letting
    // us fetch every offset concurrently instead of walking _links.next one
    // page at a time.
    const total = run
        ? Object.keys(run).filter((k) => k.endsWith('_count')).reduce((s, k) => s + (run[k] || 0), 0)
        : 0;

    if (total > 0) {
        const totalPages = Math.ceil(total / TCD_PAGE_SIZE);
        console.log(`[testcases] run ${runId}: ~${total} tests, ${totalPages} pages, concurrency ${TCD_PAGE_CONCURRENCY}`);
        let nextPage = 0;
        const worker = async () => {
            while (nextPage < totalPages) {
                const p = nextPage++;
                const offset = p * TCD_PAGE_SIZE;
                const page = await tcdTrGet(`/index.php?/api/v2/get_tests/${runId}&limit=${TCD_PAGE_SIZE}&offset=${offset}`);
                ingest(Array.isArray(page) ? page : (page.tests || []));
            }
        };
        await Promise.all(Array.from({ length: Math.min(TCD_PAGE_CONCURRENCY, totalPages) }, worker));
    } else {
        // Fallback when get_run didn't return usable counts — walk
        // _links.next sequentially.
        let endpoint = `/index.php?/api/v2/get_tests/${runId}&limit=${TCD_PAGE_SIZE}`;
        while (endpoint) {
            const page = await tcdTrGet(endpoint);
            ingest(Array.isArray(page) ? page : (page.tests || []));
            const next = !Array.isArray(page) && page._links && page._links.next;
            endpoint = next ? '/index.php?' + next.replace(/^\/+/, '') : null;
        }
    }

    return {
        runId: Number(runId),
        runName: run ? run.name : null,
        completed: run ? !!run.is_completed : null,
        statuses,
        fetchedAt: new Date().toISOString(),
    };
}

// A page fetch can fail transiently — retried with backoff so a failure is
// never silently mistaken for "no more pages".
async function tcdFetchCasesPage(projectId, suiteId, offset, attempt) {
    attempt = attempt || 1;
    try {
        const p = await tcdTrGet(`/index.php?/api/v2/get_cases/${projectId}&suite_id=${suiteId}&limit=${TCD_PAGE_SIZE}&offset=${offset}`);
        return (p && p.cases) || [];
    } catch (e) {
        if (attempt >= 3) throw new Error(`get_cases offset=${offset} failed after 3 attempts: ${e.message}`);
        await tcdSleep(800 * attempt);
        return tcdFetchCasesPage(projectId, suiteId, offset, attempt + 1);
    }
}

// Fetches every case ID that actually exists in TestRail, so /api/testcases/data
// can flag manifest case IDs that aren't real. If any page fails even after
// retries, the whole fetch throws rather than returning a partial result —
// tcdEnsureCaseIdsFresh() keeps the last known-good cache in that case.
async function tcdFetchAllCaseIds() {
    const { projectId, suiteId } = tcdLoadTrConfig();
    if (!projectId || !suiteId) return new Set();

    const ids = new Set();
    let offset = 0;
    let done = false;
    while (!done) {
        const offsets = Array.from({ length: TCD_PAGE_CONCURRENCY }, (_, i) => offset + i * TCD_PAGE_SIZE);
        const pages = await Promise.all(offsets.map((o) => tcdFetchCasesPage(projectId, suiteId, o)));
        pages.forEach((p) => p.forEach((c) => ids.add(c.id)));
        if (pages.some((p) => p.length < TCD_PAGE_SIZE)) done = true;
        offset += TCD_PAGE_CONCURRENCY * TCD_PAGE_SIZE;
    }
    return ids;
}

const TCD_CASE_ID_TTL_MS = 10 * 60 * 1000;
let tcdCaseIdCache = null;
let tcdCaseIdCacheAt = 0;
let tcdCaseIdFetchInFlight = null;

// Fire-and-forget refresh: /api/testcases/data never blocks on this.
function tcdEnsureCaseIdsFresh() {
    if (tcdCaseIdFetchInFlight) return;
    if (tcdCaseIdCache && Date.now() - tcdCaseIdCacheAt < TCD_CASE_ID_TTL_MS) return;
    tcdCaseIdFetchInFlight = tcdFetchAllCaseIds()
        .then((ids) => { tcdCaseIdCache = ids; tcdCaseIdCacheAt = Date.now(); })
        .catch((err) => { console.error('[testcases] case-id refresh failed:', err.message); })
        .finally(() => { tcdCaseIdFetchInFlight = null; });
}

function tcdParseManifest(md) {
    const lines = md.split('\n');
    const entries = []; // { cat, grp, relPath }
    let cat = null;
    let grp = null;
    for (const raw of lines) {
        const line = raw.trimEnd();
        if (/^## /.test(line)) {
            cat = line.replace(/^## /, '').trim();
            grp = null;
            continue;
        }
        if (/^### /.test(line)) {
            const m = line.match(/^###\s*\d+\.\s*(.+?)\s*\(\d+\)\s*$/);
            grp = m ? m[1].trim() : line.replace(/^### /, '').trim();
            continue;
        }
        const bullet = line.match(/^-\s+(.+)$/);
        if (bullet && cat && grp) {
            const relPath = bullet[1].trim();
            if (relPath.startsWith('*')) continue; // placeholder lines like "*(pending)*"
            entries.push({ cat, grp, relPath });
        }
    }
    return entries;
}

const TCD_CAT_HEADING = { OFFLINE: 'Offline', ONLINE: 'Online', E2E: 'E2E' };

// Inserts a new file path into the manifest under the given category/group,
// editing the raw markdown text directly so existing manual formatting —
// numbering, "(N)" counts, section order — stays intact everywhere except
// the one line/count that actually changed.
function tcdAddFileToManifest(md, category, group, relPath) {
    const heading = TCD_CAT_HEADING[category];
    if (!heading) throw new Error(`Unknown category "${category}"`);
    group = group.trim();
    relPath = relPath.trim();
    if (!relPath) throw new Error('File path is required');

    const lines = md.split('\n');
    const catRe = new RegExp(`^##\\s+${heading}\\s*$`);
    let catStart = lines.findIndex((l) => catRe.test(l.trim()));
    if (catStart === -1) throw new Error(`Couldn't find "## ${heading}" section in the manifest`);

    let catEnd = lines.length;
    for (let i = catStart + 1; i < lines.length; i++) {
        if (/^##\s+/.test(lines[i].trim())) { catEnd = i; break; }
    }

    // Duplicate check across the whole category section.
    for (let i = catStart; i < catEnd; i++) {
        const bullet = lines[i].trim().match(/^-\s+(.+)$/);
        if (bullet && bullet[1].trim() === relPath) {
            throw new Error(`"${relPath}" is already in the manifest under ${heading}`);
        }
    }

    // Lenient on purpose: some hand-edited headings have no trailing "(N)"
    // count at all — treating it as optional metadata to update-or-add
    // avoids colliding with those headings when picking the next free
    // group number.
    const groupHeadRe = /^###\s*(\d+)\.\s*(.+?)\s*$/;
    const countRe = /\s*\((\d+)\)\s*$/;
    let groupHeadingIdx = -1;
    let groupBulletsEnd = -1;
    let maxGroupNum = 0;

    for (let i = catStart + 1; i < catEnd; i++) {
        const m = lines[i].trim().match(groupHeadRe);
        if (!m) continue;
        maxGroupNum = Math.max(maxGroupNum, parseInt(m[1], 10));
        const nameOnly = m[2].replace(countRe, '').trim();
        if (nameOnly === group) {
            groupHeadingIdx = i;
            let j = i + 1;
            // A real bullet is "- " plus content; a bare "---" divider also
            // starts with "-" but has no space after it.
            while (j < catEnd && (/^-\s+\S/.test(lines[j].trim()) || lines[j].trim() === '')) {
                if (/^-\s+\S/.test(lines[j].trim())) groupBulletsEnd = j;
                j++;
            }
            if (groupBulletsEnd === -1) groupBulletsEnd = i; // heading with no bullets yet
        }
    }

    if (groupHeadingIdx !== -1) {
        // Existing group — bump its count (or add one if it never had it)
        // and append the new bullet after its last one.
        const bulletCount = lines.slice(groupHeadingIdx + 1, groupBulletsEnd + 1)
            .filter((l) => /^-\s+\S/.test(l.trim())).length;
        const m = lines[groupHeadingIdx].trim().match(groupHeadRe);
        const nameOnly = m[2].replace(countRe, '').trim();
        lines[groupHeadingIdx] = `### ${m[1]}. ${nameOnly} (${bulletCount + 1})`;
        lines.splice(groupBulletsEnd + 1, 0, `- ${relPath}`);
    } else {
        // New group — append it at the end of the category's section,
        // before the next "## " heading (or a trailing "---" divider
        // immediately before it).
        let insertAt = catEnd;
        while (insertAt > catStart + 1 && lines[insertAt - 1].trim() === '') insertAt--;
        if (insertAt > catStart + 1 && lines[insertAt - 1].trim() === '---') insertAt--;
        while (insertAt > catStart + 1 && lines[insertAt - 1].trim() === '') insertAt--;
        const block = ['', `### ${maxGroupNum + 1}. ${group} (1)`, `- ${relPath}`];
        lines.splice(insertAt, 0, ...block);
    }

    return lines.join('\n');
}

const TCD_IT_RE = /it\(\s*(['"`])((?:(?!\1).)*)\1/gs;
const TCD_LEADING_ID_RE = /^\s*(C\d{5,})\s*/;
// Some clubbed titles separate their leading IDs with "|"; others use a
// bare space. The "|" is optional here so both are recognized.
const TCD_NEXT_ID_RE = /^\s*\|?\s*(C\d{5,})\s*/;

// Cypress intercept URL patterns like '*/devices**' contain a literal "/*"
// or "*/" — a naive comment scan misreads those as real comment delimiters.
// Tokenizing block/line comments and string literals together (in source
// order) makes the scanner skip over a whole string atomically.
const TCD_TOKEN_RE = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g;

function tcdFindCommentSpans(content) {
    const spans = [];
    let m;
    TCD_TOKEN_RE.lastIndex = 0;
    while ((m = TCD_TOKEN_RE.exec(content)) !== null) {
        if (m[0].startsWith('/*') || m[0].startsWith('//')) {
            spans.push([m.index, m.index + m[0].length]);
        }
    }
    return spans;
}

function tcdIsCommented(idx, commentSpans) {
    return commentSpans.some(([s, e]) => idx >= s && idx < e);
}

function tcdExtractFromFile(content) {
    const rows = [];
    const commentSpans = tcdFindCommentSpans(content);
    let m;
    TCD_IT_RE.lastIndex = 0;
    while ((m = TCD_IT_RE.exec(content)) !== null) {
        const title = m[2];
        const commented = tcdIsCommented(m.index, commentSpans);
        const ids = [];
        let rest = title;
        const first = rest.match(TCD_LEADING_ID_RE);
        if (!first) continue;
        ids.push(first[1]);
        rest = rest.slice(first[0].length);
        let pm;
        while ((pm = rest.match(TCD_NEXT_ID_RE)) !== null) {
            ids.push(pm[1]);
            rest = rest.slice(pm[0].length);
        }
        rest = rest.trim();

        if (ids.length === 1) {
            rows.push({ id: ids[0], title: rest, club: '', commented });
            continue;
        }
        const segments = rest.split('|').map((s) => s.trim());
        const clubLabel = ids.join(' | ');
        if (segments.length === ids.length) {
            ids.forEach((id, i) => rows.push({ id, title: segments[i], club: clubLabel, commented }));
        } else {
            ids.forEach((id) => rows.push({ id, title: rest, club: clubLabel, commented }));
        }
    }
    return rows;
}

function tcdBuildData() {
    const md = fs.readFileSync(TCD_MANIFEST_PATH, 'utf8');
    const entries = tcdParseManifest(md);

    const rows = [];
    const missing = [];
    const fileSet = {};
    const catCounts = {};

    for (const { cat, grp, relPath } of entries) {
        const fullPath = path.join(TCD_E2E_ROOT, relPath);
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
            missing.push({ cat, grp, path: relPath });
            continue;
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        const fileRows = tcdExtractFromFile(content);
        fileSet[cat] = fileSet[cat] || new Set();
        fileSet[cat].add(relPath);
        for (const r of fileRows) {
            rows.push({ cat, grp, path: relPath, id: r.id, title: r.title, club: r.club, commented: r.commented });
            catCounts[cat] = (catCounts[cat] || 0) + 1;
        }
    }

    const fileCounts = {};
    for (const k of Object.keys(fileSet)) fileCounts[k] = fileSet[k].size;
    const totalFiles = Object.values(fileCounts).reduce((a, b) => a + b, 0);

    tcdEnsureCaseIdsFresh();
    let unknownIds = [];
    let caseIdCheck = { available: false, checkedAt: null, knownCount: 0 };
    if (tcdCaseIdCache) {
        const seen = new Set();
        rows.forEach((r) => {
            const numId = Number(String(r.id).replace(/^C/i, ''));
            if (tcdCaseIdCache.has(numId) || seen.has(numId)) return;
            seen.add(numId);
            unknownIds.push({ id: r.id, title: r.title, path: r.path, cat: r.cat });
        });
        caseIdCheck = { available: true, checkedAt: new Date(tcdCaseIdCacheAt).toISOString(), knownCount: tcdCaseIdCache.size };
    }

    return {
        rows,
        missing,
        catCounts,
        fileCounts,
        totalCases: rows.length,
        totalFiles,
        unknownIds,
        caseIdCheck,
        manifestPath: TCD_MANIFEST_PATH,
        e2eRoot: TCD_E2E_ROOT,
        generatedAt: new Date().toISOString(),
    };
}

app.get('/api/testcases/data', (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(tcdBuildData());
    } catch (err) {
        res.status(500).json({ error: String(err && err.message || err) });
    }
});

app.post('/api/testcases/manifest/add-file', (req, res) => {
    const { category, group, path: relPath } = req.body;
    if (!category || !group || !relPath) {
        return res.status(400).json({ error: 'category, group, and path are all required' });
    }
    try {
        const md = fs.readFileSync(TCD_MANIFEST_PATH, 'utf8');
        const updated = tcdAddFileToManifest(md, category, group, relPath);
        fs.writeFileSync(TCD_MANIFEST_PATH, updated);
        res.json({ added: relPath });
    } catch (err) {
        res.status(400).json({ error: String(err && err.message || err) });
    }
});

app.get('/api/testcases/notes', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(tcdLoadNotes());
});

app.post('/api/testcases/notes', (req, res) => {
    const { caseId, text } = req.body;
    if (!caseId) return res.status(400).json({ error: 'caseId is required' });
    const notes = tcdLoadNotes();
    const trimmed = (text || '').trim();
    if (trimmed) {
        notes[caseId] = { text: trimmed, updatedAt: Date.now() };
    } else {
        delete notes[caseId]; // blank text clears the note
    }
    tcdSaveNotes();
    res.json({ caseId, note: notes[caseId] || null });
});

app.get('/api/testcases/recheck-ids', (req, res) => {
    tcdCaseIdCache = null; // force tcdEnsureCaseIdsFresh() to refetch on the next /api/testcases/data call
    tcdCaseIdCacheAt = 0;
    res.status(202).json({ started: true });
});

app.get('/api/testcases/jenkins-jobs', async (req, res) => {
    const { jobs, defaultEnvironment } = tcdLoadJenkinsConfig();
    // TestRail's base URL (not a secret) rides along so the client can build
    // "open in TestRail" deep links without fetching the full credentials.
    let testrailUrl = null;
    try { testrailUrl = tcdLoadTrConfig().url; } catch (e) { /* config not set up yet */ }
    try {
        const environments = await tcdGetEnvironmentChoices();
        res.json({ jobs, defaultEnvironment, environments, testrailUrl });
    } catch (err) {
        res.json({ jobs, defaultEnvironment, environments: [defaultEnvironment], testrailUrl });
    }
});

app.post('/api/testcases/queue-jobs', (req, res) => {
    const { items, environment, runId } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items[] is required' });
    }
    const { defaultEnvironment, jobs } = tcdLoadJenkinsConfig();
    const bad = items.find((it) => !it.path || !it.category || !jobs[it.category]);
    if (bad) {
        return res.status(400).json({ error: 'each item needs path and a valid category' });
    }
    tcdEnqueueJobs(items.map((it) => ({
        path: it.path,
        category: it.category,
        pinnedJob: it.pinnedJob || null, // set only if the user overrode auto-selection
        environment: environment || defaultEnvironment,
        runId: runId || '',
    })));
    res.status(202).json({ queued: items.length });
});

app.get('/api/testcases/job-queue', (req, res) => {
    res.set('Cache-Control', 'no-store');
    // Full history (not truncated) — the client needs every run per file for
    // trend tracking, not just the most recent handful.
    res.json({ queue: tcdJobQueue, running: tcdRunningJobs, history: tcdJobHistory });
});

// Cancels a not-yet-dispatched queue entry (just dropped, no Jenkins call
// needed) or an in-flight one (still queued on Jenkins, or actually
// building — either way tcdCancelRunningJob asks Jenkins to stop/cancel it,
// and the existing polling loop in tcdRunToCompletion finalizes it into
// history as ABORTED on its own next poll).
app.post('/api/testcases/cancel-job', async (req, res) => {
    const id = req.body && req.body.id;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const queueIdx = tcdJobQueue.findIndex((q) => q.id === id);
    if (queueIdx !== -1) {
        tcdJobQueue.splice(queueIdx, 1);
        tcdSaveQueueState();
        return res.json({ success: true, mode: 'dequeued' });
    }

    try {
        const result = await tcdCancelRunningJob(id);
        if (!result.ok) return res.status(404).json({ error: result.error });
        tcdSaveQueueState();
        res.json({ success: true, mode: 'stopping' });
    } catch (err) {
        res.status(502).json({ error: String(err && err.message || err) });
    }
});

app.post('/api/testcases/remove-history', (req, res) => {
    const before = tcdJobHistory.length;
    tcdJobHistory = tcdJobHistory.filter((h) => h.id !== req.body.id);
    if (tcdJobHistory.length === before) {
        return res.status(404).json({ error: 'No history entry with that id' });
    }
    tcdSaveHistory();
    res.json({ removed: req.body.id });
});

app.get('/api/testcases/run-status', async (req, res) => {
    const runId = req.query.runId;
    if (!runId || !/^\d+$/.test(runId)) {
        return res.status(400).json({ error: 'Provide a numeric ?runId=' });
    }
    const deadline = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timed out pulling run status after 60s — check server console for which page stalled')), 60000)
    );
    try {
        const result = await Promise.race([tcdGetRunStatuses(runId), deadline]);
        res.set('Cache-Control', 'no-store');
        res.json(result);
    } catch (err) {
        res.status(502).json({ error: String(err && err.message || err) });
    }
});

app.get('/api/testcases/artifact-proxy', (req, res) => {
    const artifactUrl = req.query.url || '';
    const { url: jenkinsBase, auth } = tcdLoadJenkinsConfig();
    // Browsers won't send Jenkins' session cookie on a cross-origin <img>
    // subresource request, so screenshots 401 unless the server — which
    // already holds the Jenkins API token — fetches them and streams the
    // bytes through. Restricting to URLs under the configured Jenkins base
    // also keeps this from becoming an open proxy.
    if (!artifactUrl.startsWith(jenkinsBase + '/')) {
        return res.status(400).type('text/plain').send('Artifact URL must be under the configured Jenkins host');
    }
    const target = new URL(artifactUrl);
    const transport = target.protocol === 'https:' ? https : http;
    const proxyReq = transport.request(target, { headers: { Authorization: `Basic ${auth}` } }, (proxyRes) => {
        res.status(proxyRes.statusCode);
        res.set('Content-Type', proxyRes.headers['content-type'] || 'application/octet-stream');
        res.set('Cache-Control', 'no-store');
        proxyRes.pipe(res);
    });
    proxyReq.on('error', (err) => {
        res.status(502).type('text/plain').send(`Artifact proxy error: ${err.message}`);
    });
    proxyReq.end();
});

// Reads the config file straight through, and writing it invalidates every
// cache derived from it (TestRail/Jenkins auth, environment choices, status
// names, case-ID cache) so a saved change takes effect on the very next
// request — no server restart needed.
app.get('/api/integrations/config', (req, res) => {
    try {
        res.json(JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8')));
    } catch (err) {
        res.status(500).json({ error: String(err && err.message || err) });
    }
});

app.put('/api/integrations/config', (req, res) => {
    const body = req.body || {};
    const required = ['TESTRAIL_URL', 'TESTRAIL_USERNAME', 'TESTRAIL_API_KEY', 'TESTRAIL_PROJECT_ID', 'TESTRAIL_SUITE_ID', 'JENKINS_URL', 'JENKINS_USERNAME', 'JENKINS_API_TOKEN'];
    const missing = required.filter((k) => body[k] === undefined || body[k] === null || String(body[k]).trim() === '');
    if (missing.length) {
        return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
    }
    const jobs = body.JENKINS_JOBS || {};
    // Telegram fields are optional — this integration may not be set up yet,
    // so nothing here is required the way TestRail/Jenkins fields are.
    const digestTime = String(body.TELEGRAM_DIGEST_TIME || '18:00').trim();
    const merged = {
        TESTRAIL_URL: String(body.TESTRAIL_URL).trim(),
        TESTRAIL_USERNAME: String(body.TESTRAIL_USERNAME).trim(),
        TESTRAIL_API_KEY: String(body.TESTRAIL_API_KEY).trim(),
        TESTRAIL_PROJECT_ID: Number(body.TESTRAIL_PROJECT_ID),
        TESTRAIL_SUITE_ID: Number(body.TESTRAIL_SUITE_ID),
        JENKINS_URL: String(body.JENKINS_URL).trim(),
        JENKINS_USERNAME: String(body.JENKINS_USERNAME).trim(),
        JENKINS_API_TOKEN: String(body.JENKINS_API_TOKEN).trim(),
        JENKINS_DEFAULT_ENVIRONMENT: String(body.JENKINS_DEFAULT_ENVIRONMENT || 'qa').trim(),
        JENKINS_JOBS: {
            OFFLINE: Array.isArray(jobs.OFFLINE) ? jobs.OFFLINE.map(String) : [],
            ONLINE: Array.isArray(jobs.ONLINE) ? jobs.ONLINE.map(String) : [],
            E2E: Array.isArray(jobs.E2E) ? jobs.E2E.map(String) : [],
        },
        TELEGRAM_BOT_TOKEN: String(body.TELEGRAM_BOT_TOKEN || '').trim(),
        TELEGRAM_CHAT_ID: String(body.TELEGRAM_CHAT_ID || '').trim(),
        TELEGRAM_NOTIFY_ON_FAILURE: !!body.TELEGRAM_NOTIFY_ON_FAILURE,
        TELEGRAM_NOTIFY_ON_SUCCESS: !!body.TELEGRAM_NOTIFY_ON_SUCCESS,
        TELEGRAM_ATTACH_SCREENSHOTS: !!body.TELEGRAM_ATTACH_SCREENSHOTS,
        TELEGRAM_ATTACH_CSV: !!body.TELEGRAM_ATTACH_CSV,
        TELEGRAM_DIGEST_ENABLED: !!body.TELEGRAM_DIGEST_ENABLED,
        TELEGRAM_DIGEST_TIME: /^\d{2}:\d{2}$/.test(digestTime) ? digestTime : '18:00',
    };
    try {
        fs.writeFileSync(INTEGRATIONS_CONFIG_PATH, JSON.stringify(merged, null, 2));
    } catch (err) {
        return res.status(500).json({ error: String(err && err.message || err) });
    }
    TCD_TR_CONFIG = null;
    TCD_JENKINS_CONFIG = null;
    tcdEnvironmentChoicesCache = null;
    tcdStatusNameCache = null;
    tcdCaseIdCache = null;
    tcdCaseIdCacheAt = 0;
    res.json({ success: true, config: merged });
});

// Accepts an optional body with the same shape as the config file so the
// credentials modal can test values the user has typed but not saved yet;
// falls back to whatever's currently on disk when no body is sent. Uses
// tcdHttpRequest directly rather than tcdTrGet/tcdLoadJenkinsConfig so a
// transient test never touches (or is affected by) the cached config.
async function tcdTestConnections(raw) {
    const cfg = raw || JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
    const result = { testrail: { ok: false }, jenkins: { ok: false } };

    try {
        const trUrl = String(cfg.TESTRAIL_URL || '').replace(/\/+$/, '');
        const trAuth = Buffer.from(`${cfg.TESTRAIL_USERNAME}:${cfg.TESTRAIL_API_KEY}`).toString('base64');
        const res = await tcdHttpRequest(`${trUrl}/index.php?/api/v2/get_statuses`, { headers: { Authorization: `Basic ${trAuth}` }, timeoutMs: 10000 });
        if (res.statusCode >= 200 && res.statusCode < 300) result.testrail.ok = true;
        else result.testrail.error = `TestRail responded ${res.statusCode}`;
    } catch (err) {
        result.testrail.error = err.message;
    }

    try {
        const jUrl = String(cfg.JENKINS_URL || '').replace(/\/+$/, '');
        const jAuth = Buffer.from(`${cfg.JENKINS_USERNAME}:${cfg.JENKINS_API_TOKEN}`).toString('base64');
        const res = await tcdHttpRequest(`${jUrl}/api/json`, { headers: { Authorization: `Basic ${jAuth}` }, timeoutMs: 10000 });
        if (res.statusCode >= 200 && res.statusCode < 300) result.jenkins.ok = true;
        else result.jenkins.error = `Jenkins responded ${res.statusCode}`;
    } catch (err) {
        result.jenkins.error = err.message;
    }

    return result;
}

app.post('/api/integrations/config/test', async (req, res) => {
    try {
        const hasBody = req.body && Object.keys(req.body).length > 0;
        res.json(await tcdTestConnections(hasBody ? req.body : null));
    } catch (err) {
        res.status(500).json({ error: String(err && err.message || err) });
    }
});

// ════════════════════════════════════════════
// TELEGRAM — manual send, build-failure alerts, daily digest
// ════════════════════════════════════════════

// Telegram's HTML parse_mode only understands a small fixed tag set (b, i,
// u, s, a, code, pre, blockquote) — feeding it a generic markdown-to-HTML
// render (headings, <ul>/<li>, <table>, <p>) gets a 400 "unsupported tag".
// This instead converts just that supported subset by hand, so a Daily
// Status report (or a job report line) renders with real bold/italic/code
// instead of showing literal **/##/`` characters. Markdown tables get
// rendered as a monospaced <pre> block since Telegram has no <table>.
function tcdMarkdownToTelegramHtml(md) {
    const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
    const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
    const parseRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const renderTable = (rows) => {
        const header = rows[0];
        const body = rows.slice(1);
        const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => (r[i] || '').length), 3));
        const pad = (cells) => cells.map((c, i) => (c || '').padEnd(widths[i])).join(' | ');
        const sep = widths.map((w) => '-'.repeat(w)).join('-+-');
        return [pad(header), sep, ...body.map(pad)].join('\n');
    };

    // Pull fenced code blocks and markdown tables out into placeholders
    // first so none of the later inline substitutions (bold/italic/etc)
    // ever touch their content.
    const blocks = [];
    const lines = String(md || '').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
        if (isTableRow(lines[i]) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
            const rows = [parseRow(lines[i])];
            let j = i + 2;
            while (j < lines.length && isTableRow(lines[j])) { rows.push(parseRow(lines[j])); j++; }
            blocks.push(escapeHtml(renderTable(rows)));
            out.push(`  BLOCK${blocks.length - 1}  `);
            i = j;
        } else {
            out.push(lines[i]);
            i++;
        }
    }
    let text = out.join('\n').replace(/```([\s\S]*?)```/g, (_, code) => {
        blocks.push(escapeHtml(code.replace(/^\n/, '').replace(/\n$/, '')));
        return `  BLOCK${blocks.length - 1}  `;
    });

    text = escapeHtml(text);

    text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    text = text.replace(/__([^_\n]+)__/g, '<b>$1</b>');
    text = text.replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
    text = text.replace(/(?<![a-zA-Z0-9])_([^_\n]+)_(?![a-zA-Z0-9])/g, '<i>$1</i>');
    text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
    text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');
    text = text.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');
    text = text.replace(/^(\s*)[-*]\s+(.+)$/gm, '$1• $2');
    text = text.replace(/^(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '─'.repeat(11));

    text = text.replace(/ BLOCK(\d+) /g, (_, n) => `<pre>${blocks[Number(n)]}</pre>`);

    return text;
}

// Telegram caps sendMessage text at 4096 chars — split on line boundaries
// (never mid-tag, since each chunk is converted to HTML independently)
// so a long report sends as a few messages instead of erroring outright.
function tcdChunkPlainText(text, maxLen = 3500) {
    if (text.length <= maxLen) return [text];
    const lines = text.split('\n');
    const chunks = [];
    let cur = '';
    for (const line of lines) {
        const candidate = cur ? `${cur}\n${line}` : line;
        if (candidate.length > maxLen && cur) {
            chunks.push(cur);
            cur = line;
        } else {
            cur = candidate;
        }
    }
    if (cur) chunks.push(cur);
    return chunks;
}

async function tcdSendTelegramMessage(text, cfgOverride) {
    const cfg = cfgOverride || JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
    const token = cfg.TELEGRAM_BOT_TOKEN;
    const chatId = cfg.TELEGRAM_CHAT_ID;
    if (!token || !chatId) throw new Error('Telegram bot token / chat ID not configured');

    for (const chunk of tcdChunkPlainText(String(text || ''))) {
        const res = await tcdHttpRequest(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: tcdMarkdownToTelegramHtml(chunk), parse_mode: 'HTML', disable_web_page_preview: true }),
            timeoutMs: 10000,
        });
        if (res.statusCode < 200 || res.statusCode >= 300) {
            let message = `Telegram API responded ${res.statusCode}`;
            try { message = JSON.parse(res.body).description || message; } catch (e) { /* keep default */ }
            throw new Error(message);
        }
    }
}

// Builds a multipart/form-data body by hand — no form-data lib in this
// project's dependencies, and the shape needed here (a few text fields plus
// zero or more binary file parts) isn't worth adding one for.
function tcdBuildMultipartBody(fields, fileParts) {
    const boundary = `ZoroTelegram${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
    const parts = [];
    Object.entries(fields).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
    });
    (fileParts || []).forEach((filePart) => {
        parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${filePart.name}"; filename="${filePart.filename}"\r\n` +
            `Content-Type: ${filePart.contentType}\r\n\r\n`
        ));
        parts.push(filePart.data);
        parts.push(Buffer.from('\r\n'));
    });
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    return { body: Buffer.concat(parts), boundary };
}

async function tcdPostTelegramMultipart(endpoint, token, fields, fileParts) {
    const { body, boundary } = tcdBuildMultipartBody(fields, fileParts);
    const res = await tcdHttpRequest(`https://api.telegram.org/bot${token}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
        body,
        timeoutMs: 30000,
    });
    if (res.statusCode < 200 || res.statusCode >= 300) {
        let message = `Telegram API responded ${res.statusCode}`;
        try { message = JSON.parse(res.body).description || message; } catch (e) { /* keep default */ }
        throw new Error(message);
    }
}

// Sends one or more screenshots/documents together. Telegram's sendPhoto/
// sendDocument also accept a plain URL and fetch it server-side, but that
// only works for URLs Telegram's own servers can reach — Jenkins here is
// usually on a private/internal host, so every attachment has to be
// downloaded first (with our own Jenkins auth) and re-uploaded as multipart
// data. A single attachment uses sendPhoto/sendDocument directly; 2+ go
// through sendMediaGroup (Telegram's "album" endpoint), batched at 10 items
// per call since that's its hard limit — only the very first item across
// all batches carries the caption, matching how Telegram albums display it.
// An attachment Jenkins won't serve (network blip, expired build) is
// skipped rather than failing the whole notification.
async function tcdSendTelegramAttachments(attachments, caption, cfgOverride) {
    const cfg = cfgOverride || JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
    const token = cfg.TELEGRAM_BOT_TOKEN;
    const chatId = cfg.TELEGRAM_CHAT_ID;
    if (!token || !chatId) throw new Error('Telegram bot token / chat ID not configured');
    if (!attachments || attachments.length === 0) throw new Error('No attachments to send');

    const { auth: jenkinsAuth } = tcdLoadJenkinsConfig();
    const fetchAttachment = async (item) => {
        const fetched = await tcdHttpRequestBinary(item.url, { headers: { Authorization: `Basic ${jenkinsAuth}` }, timeoutMs: 20000 });
        if (fetched.statusCode < 200 || fetched.statusCode >= 300) return null;
        const contentType = fetched.headers['content-type'] || (item.type === 'photo' ? 'image/png' : 'application/octet-stream');
        return { name: item.type === 'photo' ? 'photo' : 'document', filename: item.filename, contentType, data: fetched.body };
    };

    // Sends one homogeneous (all-photo or all-document) group: a single item
    // uses sendPhoto/sendDocument directly, 2+ go through sendMediaGroup in
    // batches of at most 10 (Telegram's per-call limit). `getCap(isFirstSent)`
    // decides the caption per item so the *overall* first successfully-sent
    // attachment across every group gets it, not just the first per group.
    const sendGroup = async (items, getCap) => {
        if (items.length === 1) {
            const filePart = await fetchAttachment(items[0]);
            if (!filePart) throw new Error(`Couldn't fetch ${items[0].filename} from Jenkins`);
            const endpoint = items[0].type === 'photo' ? 'sendPhoto' : 'sendDocument';
            const cap = getCap(true);
            await tcdPostTelegramMultipart(endpoint, token, { chat_id: chatId, caption: cap, ...(cap ? { parse_mode: 'HTML' } : {}) }, [filePart]);
            return;
        }
        const batches = [];
        for (let i = 0; i < items.length; i += 10) batches.push(items.slice(i, i + 10));
        for (let b = 0; b < batches.length; b++) {
            const batch = batches[b];
            const media = [];
            const fileParts = [];
            for (let i = 0; i < batch.length; i++) {
                const filePart = await fetchAttachment(batch[i]);
                if (!filePart) continue; // skip what we can't reach rather than fail the whole album
                const attachName = `file${b}_${i}`;
                const mediaItem = { type: batch[i].type, media: `attach://${attachName}` };
                const cap = getCap(b === 0 && fileParts.length === 0);
                if (cap) { mediaItem.caption = cap; mediaItem.parse_mode = 'HTML'; }
                media.push(mediaItem);
                fileParts.push({ ...filePart, name: attachName });
            }
            if (media.length === 0) continue;
            if (media.length === 1) {
                // Fetch failures thinned this batch to one — sendMediaGroup needs 2+.
                const endpoint = media[0].type === 'photo' ? 'sendPhoto' : 'sendDocument';
                await tcdPostTelegramMultipart(endpoint, token, { chat_id: chatId, caption: media[0].caption, ...(media[0].caption ? { parse_mode: 'HTML' } : {}) }, [{ ...fileParts[0], name: media[0].type === 'photo' ? 'photo' : 'document' }]);
                continue;
            }
            await tcdPostTelegramMultipart('sendMediaGroup', token, { chat_id: chatId, media: JSON.stringify(media) }, fileParts);
        }
    };

    // Telegram's sendMediaGroup rejects mixing photos with documents in the
    // same album, so each type gets its own message/album — the caption
    // still only ever lands on the first attachment actually sent overall.
    // Converted to Telegram's HTML subset up front so every caller (single
    // sendPhoto/sendDocument or an album item) gets the same formatting.
    const trimmedCaption = tcdMarkdownToTelegramHtml((caption || '').slice(0, 1024));
    const photos = attachments.filter((a) => a.type === 'photo');
    const documents = attachments.filter((a) => a.type !== 'photo');
    let captionClaimed = false;
    const getCap = (isFirstInGroup) => {
        if (!isFirstInGroup || captionClaimed || !trimmedCaption) return undefined;
        captionClaimed = true;
        return trimmedCaption;
    };

    if (photos.length > 0) await sendGroup(photos, getCap);
    if (documents.length > 0) await sendGroup(documents, getCap);
}

// Attachment URLs come from the client (the manual "send report" flow lets
// the user pick a date/selection whose screenshots then get fetched
// server-side with our Jenkins auth attached) — restricting to the
// configured Jenkins host keeps this from being used to make the server
// fetch-and-relay arbitrary internal URLs with that credential.
function tcdSanitizeTelegramAttachments(list) {
    const { url: jenkinsBase } = tcdLoadJenkinsConfig();
    return (Array.isArray(list) ? list : [])
        .filter((a) => a && typeof a.url === 'string' && a.url.startsWith(`${jenkinsBase}/`) && (a.type === 'photo' || a.type === 'document'));
}

app.post('/api/integrations/telegram/send', async (req, res) => {
    const jobs = Array.isArray(req.body && req.body.jobs) ? req.body.jobs : null;

    // Per-job mode: an optional overview message, then each job's own text
    // + its own screenshots/CSV as a separate, sequential message/album —
    // so a multi-job report never dumps one undifferentiated pile of images
    // with no indication of which job each one came from.
    if (jobs) {
        const overview = ((req.body && req.body.overview) || '').trim();
        if (jobs.length === 0 && !overview) return res.status(400).json({ error: 'Nothing to send' });
        try {
            if (overview) await tcdSendTelegramMessage(overview, null);
            for (const job of jobs) {
                const jobText = ((job && job.text) || '').trim();
                const attachments = tcdSanitizeTelegramAttachments(job && job.attachments);
                if (attachments.length > 0) {
                    await tcdSendTelegramAttachments(attachments, jobText, null);
                } else if (jobText) {
                    await tcdSendTelegramMessage(jobText, null);
                }
            }
            res.json({ success: true });
        } catch (err) {
            res.status(502).json({ error: String(err && err.message || err) });
        }
        return;
    }

    // Plain single-message mode — used by anything that just wants to send
    // one block of text with no per-job breakdown (e.g. a future simple
    // "send this text" caller).
    const text = ((req.body && req.body.text) || '').trim();
    const attachments = tcdSanitizeTelegramAttachments(req.body && req.body.attachments);
    if (!text && attachments.length === 0) return res.status(400).json({ error: 'text is required' });
    try {
        if (attachments.length > 0) {
            await tcdSendTelegramAttachments(attachments, text, null);
        } else {
            await tcdSendTelegramMessage(text, null);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(502).json({ error: String(err && err.message || err) });
    }
});

app.post('/api/integrations/telegram/test', async (req, res) => {
    try {
        const hasBody = req.body && Object.keys(req.body).length > 0;
        await tcdSendTelegramMessage('✅ Zoro Test Case Dashboard is connected to this chat.', hasBody ? req.body : null);
        res.json({ success: true });
    } catch (err) {
        res.status(502).json({ error: String(err && err.message || err) });
    }
});

// Telegram bots can't be messaged proactively without knowing a chat ID
// first, and the only way to discover one otherwise is hand-parsing the
// getUpdates JSON in a browser — this does that server-side instead. Only
// surfaces chats the bot has actually seen (i.e. someone already messaged
// it), which is exactly the precondition sendMessage needs anyway.
async function tcdDiscoverTelegramChats(cfgOverride) {
    const cfg = cfgOverride || JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
    const token = cfg.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('Telegram bot token not configured');

    const res = await tcdHttpRequest(`https://api.telegram.org/bot${token}/getUpdates?limit=100`, { timeoutMs: 10000 });
    if (res.statusCode < 200 || res.statusCode >= 300) {
        let message = `Telegram API responded ${res.statusCode}`;
        try { message = JSON.parse(res.body).description || message; } catch (e) { /* keep default */ }
        throw new Error(message);
    }

    const json = JSON.parse(res.body);
    const seen = new Map();
    (json.result || []).forEach((update) => {
        const msg = update.message || update.channel_post || update.edited_message;
        const chat = msg && msg.chat;
        if (!chat || seen.has(chat.id)) return;
        const name = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ').trim() || chat.username || String(chat.id);
        seen.set(chat.id, { id: chat.id, type: chat.type, label: `${name} (${chat.type})` });
    });
    return Array.from(seen.values());
}

app.post('/api/integrations/telegram/discover-chats', async (req, res) => {
    try {
        const hasBody = req.body && Object.keys(req.body).length > 0;
        const chats = await tcdDiscoverTelegramChats(hasBody ? req.body : null);
        res.json({ chats });
    } catch (err) {
        res.status(502).json({ error: String(err && err.message || err) });
    }
});

// Same report shape as the client's "copy today's report" button, built
// server-side so the daily digest can send it without a browser open.
function tcdBuildTodayReportText() {
    const todayStr = new Date().toDateString();
    const todays = tcdJobHistory
        .filter((h) => { const ts = h.completedAt || h.startedAt || h.queuedAt; return ts && new Date(ts).toDateString() === todayStr; })
        .slice().reverse();
    if (todays.length === 0) return null;

    const lines = [];
    lines.push(`Test Run Report — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`);
    lines.push(`${todays.length} job${todays.length === 1 ? '' : 's'} run today`);
    lines.push('');
    todays.forEach((h) => {
        const s = String(h.status || '').toUpperCase();
        const verdict = s === 'SUCCESS' ? 'PASS' : (['FAILURE', 'ERROR', 'ABORTED'].includes(s) ? 'FAIL' : (s || 'UNKNOWN'));
        const statsStr = h.testStats
            ? `${h.testStats.passes} passed, ${h.testStats.failures} failed${h.testStats.pending ? `, ${h.testStats.pending} pending` : ''}`
            : 'no pass/fail data';
        lines.push(`[${verdict}] ${h.path}`);
        lines.push(`  Job: ${h.jobName || '?'}${h.buildNumber ? ` #${h.buildNumber}` : ''}${h.runId ? ` | TestRail #${h.runId}` : ''}`);
        lines.push(`  ${statsStr}`);
        if (h.buildUrl) lines.push(`  ${h.buildUrl}`);
        lines.push('');
    });
    return lines.join('\n').trim();
}

const TCD_TELEGRAM_STATE_PATH = path.join(TCD_DIR, 'telegram-state.json');
let tcdTelegramState = { lastDigestDate: null };
(function tcdLoadTelegramStateOnBoot() {
    try {
        tcdTelegramState = JSON.parse(fs.readFileSync(TCD_TELEGRAM_STATE_PATH, 'utf8'));
    } catch (e) {
        tcdTelegramState = { lastDigestDate: null };
    }
})();

function tcdSaveTelegramState() {
    try {
        fs.writeFileSync(TCD_TELEGRAM_STATE_PATH, JSON.stringify(tcdTelegramState, null, 2));
    } catch (e) {
        console.error('[testcases] failed to save telegram state:', e.message);
    }
}

// Polled every 5 minutes rather than scheduled precisely — simple, survives
// restarts, and a several-minute slop on a "daily summary" is irrelevant.
// lastDigestDate guards against sending twice after the time threshold is
// crossed; it's only set once a report actually goes out, so a day with no
// builds yet keeps retrying (harmlessly) until something has run.
async function tcdCheckDailyDigest() {
    let cfg;
    try {
        cfg = JSON.parse(fs.readFileSync(INTEGRATIONS_CONFIG_PATH, 'utf8'));
    } catch (e) {
        return;
    }
    if (!cfg.TELEGRAM_DIGEST_ENABLED || !cfg.TELEGRAM_BOT_TOKEN || !cfg.TELEGRAM_CHAT_ID) return;

    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (tcdTelegramState.lastDigestDate === todayKey) return;

    const [h, m] = String(cfg.TELEGRAM_DIGEST_TIME || '18:00').split(':').map(Number);
    const digestMinutes = (h || 0) * 60 + (m || 0);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    if (nowMinutes < digestMinutes) return;

    const report = tcdBuildTodayReportText();
    if (!report) return;

    try {
        await tcdSendTelegramMessage(`📋 Daily digest\n\n${report}`, cfg);
        tcdTelegramState.lastDigestDate = todayKey;
        tcdSaveTelegramState();
    } catch (err) {
        console.error('[testcases] daily digest send failed:', err.message);
    }
}

setInterval(tcdCheckDailyDigest, 5 * 60 * 1000);

app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 Zoro's Portal Server running at http://localhost:${PORT}`);
    console.log(`✅ App and APIs are active.`);
    console.log(`=================================================\n`);
    tcdResumeInFlightState();
});
