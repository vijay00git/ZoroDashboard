// Data Archive Vault (backup / restore).
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { AdmZip, TCD_CASE_MANIFEST_PATH, TCD_MANIFEST_PATH, fs, os, path, tcdResetConfigCaches, upload, writeJsonAtomic, ROOT } = ctx;

    // ════════════════════════════════════════════
    // SETTINGS / BACKUP ENDPOINTS
    // ════════════════════════════════════════════

    app.post('/api/backup', (req, res) => {
        try {
            const dataPath = path.join(ROOT, 'data');
            if (!fs.existsSync(dataPath)) {
                fs.mkdirSync(dataPath, { recursive: true });
            }
            
            // Save localStorage data sent from client
            if (req.body && req.body.localStorageData) {
                writeJsonAtomic(path.join(dataPath, 'local_storage.json'), req.body.localStorageData);
            }

            const zip = new AdmZip();
            zip.addLocalFolder(dataPath, 'data');

            // The Cypress Runner / Test Case Dashboard manifest (TCD_MANIFEST_PATH,
            // normally ~/.claude/ic-tokyo-file-manifest.md) lives outside data/
            // entirely, so it's otherwise silently left out of every backup —
            // bundle it at the zip root under a distinct name so /api/restore can
            // recognize it and put it back at that same external path.
            if (fs.existsSync(TCD_MANIFEST_PATH)) {
                zip.addLocalFile(TCD_MANIFEST_PATH, '', 'external-ic-tokyo-file-manifest.md');
            }
            if (fs.existsSync(TCD_CASE_MANIFEST_PATH)) {
                zip.addLocalFile(TCD_CASE_MANIFEST_PATH, '', 'external-ic-tokyo-case-manifest.json');
            }

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

        // Extract into an isolated temp directory first — never straight onto
        // the app root — so a malformed/malicious zip can only ever land inside
        // data/ (and the manifest path below), never overwrite server.js,
        // package.json, or anything else in the project.
        const tempExtractDir = path.join(os.tmpdir(), `zoro-restore-${Date.now()}-${Math.round(Math.random() * 1e6)}`);

        try {
            const zip = new AdmZip(req.file.path);
            fs.mkdirSync(tempExtractDir, { recursive: true });
            zip.extractAllTo(tempExtractDir, true);

            // Cleanup uploaded file
            fs.unlinkSync(req.file.path);

            // Only two things are ever expected in a backup zip (see /api/backup
            // above): the data/ folder, and the bundled external manifest file.
            // Copy just those into place — anything else in the zip is ignored.
            const extractedDataDir = path.join(tempExtractDir, 'data');
            const dataPath = path.join(ROOT, 'data');
            if (fs.existsSync(extractedDataDir)) {
                fs.mkdirSync(dataPath, { recursive: true });
                fs.cpSync(extractedDataDir, dataPath, { recursive: true, force: true });
            }

            const bundledManifestPath = path.join(tempExtractDir, 'external-ic-tokyo-file-manifest.md');
            if (fs.existsSync(bundledManifestPath)) {
                fs.mkdirSync(path.dirname(TCD_MANIFEST_PATH), { recursive: true });
                fs.copyFileSync(bundledManifestPath, TCD_MANIFEST_PATH);
            }
            const bundledCaseManifestPath = path.join(tempExtractDir, 'external-ic-tokyo-case-manifest.json');
            if (fs.existsSync(bundledCaseManifestPath)) {
                fs.mkdirSync(path.dirname(TCD_CASE_MANIFEST_PATH), { recursive: true });
                fs.copyFileSync(bundledCaseManifestPath, TCD_CASE_MANIFEST_PATH);
            }

            fs.rmSync(tempExtractDir, { recursive: true, force: true });

            // A restore can silently replace data/settings/integrations.local.json
            // out from under the running server — invalidate every cache derived
            // from it, same as the PUT /api/integrations/config route does, so
            // the restored credentials/jobs take effect on the very next request
            // instead of needing a server restart.
            tcdResetConfigCaches();

            // Check if localStorage backup exists
            let localStorageData = null;
            const lsBackupPath = path.join(ROOT, 'data', 'local_storage.json');
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
            fs.rmSync(tempExtractDir, { recursive: true, force: true });
            res.status(500).json({ error: 'Failed to restore backup' });
        }
    });

    return {};
};
