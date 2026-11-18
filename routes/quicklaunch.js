// Quick Launch.
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { QL_DIR, fs, path, writeJsonAtomic } = ctx;

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
            writeJsonAtomic(filePath, req.body);
            res.status(200).json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    return {};
};
