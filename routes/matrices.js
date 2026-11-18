// Matrix save/load (Sync Hub matrices).
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { DATA_DIR, fs, path, writeJsonAtomic } = ctx;

    app.post('/api/save', (req, res) => {
        const { name, folder, testCases } = req.body;
        if (!name || !testCases) return res.status(400).json({ error: 'Missing name or testCases' });

        const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
        const filePath = path.join(DATA_DIR, `${safeName}.json`);

        try {
            writeJsonAtomic(filePath, { name, folder: folder || 'Uncategorized', testCases });
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
        const id = path.basename(req.params.id); // prevents traversal
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
        const id = path.basename(req.params.id); // prevents traversal
        const { testCases, name, folder } = req.body;

        const filePath = path.join(DATA_DIR, `${id}.json`);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Matrix not found' });

        try {
            const existing = JSON.parse(fs.readFileSync(filePath));
            if (testCases) existing.testCases = testCases;
            if (name) existing.name = name;
            if (folder !== undefined) existing.folder = folder;
            writeJsonAtomic(filePath, existing);
            res.status(200).json({ success: true, message: 'Updated successfully.' });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/matrix/:id', (req, res) => {
        const id = path.basename(req.params.id); // prevents traversal
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

    return {};
};
