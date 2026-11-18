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
const { Client: SSHClient } = require('ssh2');
const { spawn } = require('child_process');

const upload = multer({ dest: path.join(__dirname, 'uploads') });

const app = express();
const PORT = 3000;

// Locally-hosted, unauthenticated API — restrict CORS to this app's own
// origins (production on :3000, the Vite dev server on :5173) so an
// unrelated page open in the same browser can't read or mutate this data.
const ALLOWED_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];
app.use(cors({ origin: ALLOWED_ORIGINS }));
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
const CYR_DIR = path.join(__dirname, 'data', 'cypress-runs');
const CYR_SCREENSHOTS_DIR = path.join(__dirname, 'data', 'cypress-screenshots');
const RUNNER_VAULT_DIR = path.join(__dirname, 'data', 'runner-vault');
const AF_DIR = path.join(__dirname, 'data', 'automation-finder');
const HT_DIR = path.join(__dirname, 'data', 'helper-tools');
const TRR_DIR = path.join(__dirname, 'data', 'test-runs');
[DATA_DIR, NOTES_DIR, TS_DIR, QL_DIR, CSV_DIR, SS_DIR, TCD_DIR, SETTINGS_DIR, CYR_DIR, CYR_SCREENSHOTS_DIR, RUNNER_VAULT_DIR, AF_DIR, HT_DIR, TRR_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Every persisted file in data/ goes through here instead of a raw
// fs.writeFileSync — writing to a sibling temp file and renaming it into
// place means a crash/power-loss mid-write leaves the *old* file intact
// (a rename onto an existing path is atomic on the same filesystem)
// instead of a half-written, corrupted one.
function writeFileAtomic(filePath, data) {
    const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmpPath, data);
    fs.renameSync(tmpPath, filePath);
}
function writeJsonAtomic(filePath, obj) {
    writeFileAtomic(filePath, JSON.stringify(obj, null, 2));
}

// ── Feature areas ─────────────────────────────────────────────────────────
// Each area lives in routes/<area>.js and registers its own routes. They get the shared setup
// above, plus each other's helpers, through `ctx`. Areas other modules depend on come first;
// no two areas share a route path, so registration order doesn't change routing.
const ctx = {
    express, cors, fs, path, http, https, os, ical, multer, AdmZip, SSHClient, spawn, upload, app,
    PORT, ALLOWED_ORIGINS, DATA_DIR, NOTES_DIR, TS_DIR, QL_DIR, CSV_DIR, SS_DIR, TCD_DIR, SETTINGS_DIR,
    CYR_DIR, CYR_SCREENSHOTS_DIR, RUNNER_VAULT_DIR, AF_DIR, HT_DIR, TRR_DIR, writeFileAtomic,
    writeJsonAtomic, ROOT: __dirname,
};
for (const area of ['jenkinsRunner', 'testrail', 'helperTools', 'testRuns', 'matrices', 'runnerVault', 'csv', 'notes', 'timesheet', 'quicklaunch', 'ai', 'holidays', 'calendar', 'status', 'screenshots', 'backup', 'cypress', 'caseView', 'automationFinder', 'filterRail', 'runmytcs']) {
    Object.assign(ctx, require(`./routes/${area}`)(app, ctx));
}
const { cyrResumeOnBoot, tcdResumeInFlightState } = ctx;


app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 Zoro's Portal Server running at http://localhost:${PORT}`);
    console.log(`✅ App and APIs are active.`);
    console.log(`=================================================\n`);
    tcdResumeInFlightState();
    cyrResumeOnBoot();
});
