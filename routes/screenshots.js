// SS Bucket (screenshots).
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { AdmZip, SS_DIR, fs, multer, path, writeJsonAtomic, ROOT } = ctx;

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
            writeJsonAtomic(SS_META, { groups });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // Upload a screenshot image
    const ssUpload = multer({ dest: path.join(ROOT, 'uploads') });
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

    // Bundle a chosen set of screenshots into a zip for bulk download
    app.post('/api/screenshots/zip', (req, res) => {
        try {
            const { items } = req.body;
            if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items must be a non-empty array' });
            const zip = new AdmZip();
            items.forEach(({ filename, name }, idx) => {
                if (!filename) return;
                const safeFilename = path.basename(filename);
                const fp = path.join(SS_DIR, safeFilename);
                if (!fs.existsSync(fp)) return;
                const ext = path.extname(safeFilename);
                const safeName = (name || safeFilename).replace(/[^a-z0-9_-]/gi, '_');
                zip.addLocalFile(fp, '', `${String(idx + 1).padStart(2, '0')}_${safeName}${ext}`);
            });
            const zipBuffer = zip.toBuffer();
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', 'attachment; filename="screenshots.zip"');
            res.send(zipBuffer);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    return {};
};
