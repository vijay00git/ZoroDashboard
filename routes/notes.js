// Notebook.
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { NOTES_DIR, fs, path, writeFileAtomic } = ctx;

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
            writeFileAtomic(filePath, content || '');
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

    return {};
};
