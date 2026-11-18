// Runner Vault (Sync Hub snapshots of Cypress / Jenkins / RunMyTCs).
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { RUNNER_VAULT_DIR, fs, path, writeJsonAtomic } = ctx;

    // --- Runner Vault API (SyncHub) ---
    // Lets SyncHub pull a point-in-time snapshot from the Cypress Runner
    // (/api/cypress/state), Jenkins Runner (/api/testcases/job-queue) or RunMyTCs
    // (/api/runmytcs/state + /cases) — all
    // already page-independent, server-held state — and optionally persist that
    // snapshot for later reference. One JSON file per save, same
    // read/write/atomic-rename convention as the matrix vault above.
    app.post('/api/runner-vault/save', (req, res) => {
        const { runner, name, folder, snapshot, summary } = req.body;
        if (!['cypress', 'jenkins', 'runmytcs'].includes(runner)) return res.status(400).json({ error: 'runner must be "cypress", "jenkins" or "runmytcs"' });
        if (!name || !snapshot) return res.status(400).json({ error: 'Missing name or snapshot' });

        const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
        const id = `${runner}_${Date.now()}_${safeName}`;
        const filePath = path.join(RUNNER_VAULT_DIR, `${id}.json`);

        try {
            writeJsonAtomic(filePath, { id, runner, name, folder: folder || 'Uncategorized', savedAt: Date.now(), summary: summary || null, snapshot });
            res.status(200).json({ success: true, id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/runner-vault', (req, res) => {
        const { runner } = req.query;
        try {
            const files = fs.readdirSync(RUNNER_VAULT_DIR).filter(f => f.endsWith('.json'));
            const entries = files.map(f => {
                const content = JSON.parse(fs.readFileSync(path.join(RUNNER_VAULT_DIR, f)));
                return { id: content.id, runner: content.runner, name: content.name, folder: content.folder, savedAt: content.savedAt, summary: content.summary };
            }).filter(e => !runner || e.runner === runner)
              .sort((a, b) => b.savedAt - a.savedAt);
            res.status(200).json({ entries });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/runner-vault/:id', (req, res) => {
        const id = path.basename(req.params.id); // prevents traversal
        const filePath = path.join(RUNNER_VAULT_DIR, `${id}.json`);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Snapshot not found' });
        try {
            res.status(200).json(JSON.parse(fs.readFileSync(filePath)));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/runner-vault/:id', (req, res) => {
        const id = path.basename(req.params.id); // prevents traversal
        const filePath = path.join(RUNNER_VAULT_DIR, `${id}.json`);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Snapshot not found' });
        try {
            fs.unlinkSync(filePath);
            res.status(200).json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    return {};
};
