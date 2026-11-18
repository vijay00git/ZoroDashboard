// Daily Status: templates + Claude EOD report.
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { fs, path, tcdJenkinsGetJsonWithRetry, tcdLoadJenkinsConfig, writeFileAtomic, ROOT } = ctx;

    // --- Daily Status Templates API (Markdown Files) ---
    const TEMPLATE_DIR = path.join(ROOT, 'data', 'templates');
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
                    writeFileAtomic(path.join(TEMPLATE_DIR, `${t.id}.md`), fileContent);
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

    // EOD status mail — "Claude EOD report" mode of the Daily Status page (see eod-report.js).
    // Git, local runs and Jenkins are collected in code; only Bitbucket + Jira go through a small
    // read-only Claude (Haiku) run over the user's MCP servers.
    const createEodReport = require('../eod-report');
    const eodReport = createEodReport({
        dataDir: path.join(ROOT, 'data'),
        jenkins: {
            loadConfig: () => tcdLoadJenkinsConfig(),
            // A build without a JUnit report 404s — don't spend the retry back-off on it.
            getJson: (url, auth) => tcdJenkinsGetJsonWithRetry(url, auth, url.includes('/testReport/') ? 1 : 3),
        },
    });
    app.post('/api/status/eod/start', (req, res) => {
        try { res.json(eodReport.start(req.body || {})); } catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.get('/api/status/eod/job/:id', (req, res) => {
        const job = eodReport.get(req.params.id);
        if (!job) return res.status(404).json({ error: 'EOD job not found (the server may have restarted)' });
        res.json(job);
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
                writeFileAtomic(path.join(TEMPLATE_DIR, `${t.id}.md`), fileContent);
            });

            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    return {};
};
