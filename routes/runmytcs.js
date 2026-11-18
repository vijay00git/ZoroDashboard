// RunMyTCs engine routes.
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { PORT, path, tcdLoadJenkinsConfig, tcdSendTelegramMessage, writeJsonAtomic, ROOT } = ctx;

    // ── RunMyTCs ────────────────────────────────────────────────────────────────
    // Unattended rerun → triage → fix loop over the manifest's specs against one TestRail
    // run. Logic lives in runmytcs-engine.js; it drives this server's own Jenkins/local
    // queues over HTTP and keeps its results in data/runmytcs/ (separate from the
    // Cypress Runner / Jenkins Runner stores).
    const runMyTcs = require('../runmytcs-engine').createRunMyTcs({
        baseUrl: `http://localhost:${PORT}`,
        dataDir: path.join(ROOT, 'data'),
        loadJenkinsConfig: () => tcdLoadJenkinsConfig(),
        writeJsonAtomic,
        sendTelegram: (text) => tcdSendTelegramMessage(text, null),
    });
    const rmtWrap = (fn) => async (req, res) => {
        try { res.set('Cache-Control', 'no-store'); res.json(await fn(req)); } catch (err) { res.status(400).json({ error: String(err.message || err) }); }
    };
    app.get('/api/runmytcs/defaults', rmtWrap(() => runMyTcs.defaults()));
    app.get('/api/runmytcs/state', rmtWrap((req) => runMyTcs.getState(Number(req.query.sinceLog) || 0)));
    app.get('/api/runmytcs/report', rmtWrap(() => runMyTcs.report() || {}));
    app.get('/api/runmytcs/history', rmtWrap(() => runMyTcs.history()));
    app.get('/api/runmytcs/cases', rmtWrap((req) => runMyTcs.caseTable(req.query.runId)));
    app.get('/api/runmytcs/run-status', rmtWrap((req) => runMyTcs.runStatus(req.query.runId)));
    app.post('/api/runmytcs/import', rmtWrap((req) => runMyTcs.importFrom(req.body.source, !!req.body.overwrite)));
    app.get('/api/runmytcs/case/:caseId/results', rmtWrap((req) => runMyTcs.caseResults(req.params.caseId)));
    app.post('/api/runmytcs/case',rmtWrap((req) => runMyTcs.editCase(req.body.caseId, req.body)));
    app.get('/api/runmytcs/evidence', rmtWrap((req) => runMyTcs.evidence(String(req.query.ref || ''))));
    app.get('/api/runmytcs/evidence-file', (req, res) => {
        try { res.sendFile(runMyTcs.evidenceFile(req.query.f)); } catch (err) { res.status(404).json({ error: String(err.message || err) }); }
    });
    app.get('/api/runmytcs/presets', rmtWrap(() => runMyTcs.presets()));
    app.post('/api/runmytcs/presets', rmtWrap((req) => runMyTcs.savePreset(req.body.name, req.body.config)));
    app.post('/api/runmytcs/presets/delete', rmtWrap((req) => runMyTcs.deletePreset(String(req.body.name || ''))));
    app.get('/api/runmytcs/failures', rmtWrap(() => runMyTcs.failures()));
    app.post('/api/runmytcs/analyse', rmtWrap((req) => runMyTcs.analyse(String(req.body.path || ''))));
    app.post('/api/runmytcs/proposal', rmtWrap((req) => runMyTcs.approveProposal(req.body.fixId, req.body.approve !== false, req.body.note)));
    app.post('/api/runmytcs/preview', rmtWrap((req) => runMyTcs.preview(req.body || {})));
    app.post('/api/runmytcs/fix-review', rmtWrap((req) => runMyTcs.reviewFix(req.body.fixId, req.body.action)));
    app.get('/api/runmytcs/report.md', rmtWrap(() => ({ markdown: runMyTcs.reportMarkdown() })));
    app.post('/api/runmytcs/report/telegram', rmtWrap(() => runMyTcs.sendReport()));
    app.post('/api/runmytcs/start', rmtWrap((req) => ({ id: runMyTcs.start(req.body || {}) })));
    app.post('/api/runmytcs/pause', rmtWrap(() => { runMyTcs.pause(); return { ok: true }; }));
    app.post('/api/runmytcs/resume', rmtWrap(() => { runMyTcs.resume(); return { ok: true }; }));
    app.post('/api/runmytcs/stop', rmtWrap(async () => { await runMyTcs.stop(); return { ok: true }; }));
    app.post('/api/runmytcs/approve', rmtWrap((req) => { runMyTcs.approve(req.body.fixId, req.body.approve !== false); return { ok: true }; }));
    app.post('/api/runmytcs/message', rmtWrap((req) => { runMyTcs.postMessage(req.body.text, req.body.answerTo); return { ok: true }; }));
    app.post('/api/runmytcs/finish', rmtWrap(() => { runMyTcs.finishNow(); return { ok: true }; }));
    app.post('/api/runmytcs/fix-approval', rmtWrap((req) => { runMyTcs.setFixApproval(req.body.mode); return { ok: true }; }));

    return {};
};
