// CSV Organizer.
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { CSV_DIR, fs, path, writeFileAtomic } = ctx;

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
        const fp = path.join(CSV_DIR, `${path.basename(req.params.id)}.csv`); // prevents traversal
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
            writeFileAtomic(fp, content);
            res.json({ success: true, id: safe });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.put('/api/csvfiles/:id', (req, res) => {
        const { content, newName } = req.body;
        const fp = path.join(CSV_DIR, `${path.basename(req.params.id)}.csv`); // prevents traversal
        if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
        try {
            if (content !== undefined) writeFileAtomic(fp, content);
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
        const fp = path.join(CSV_DIR, `${path.basename(req.params.id)}.csv`); // prevents traversal
        if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Not found' });
        try { fs.unlinkSync(fp); res.json({ success: true }); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    return {};
};
