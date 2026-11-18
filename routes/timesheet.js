// Timesheet.
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { TS_DIR, fs, path, writeFileAtomic } = ctx;

    // --- Timesheet API ---
    app.get('/api/timesheets', (req, res) => {
        try {
            const files = fs.readdirSync(TS_DIR).filter(f => f.endsWith('.csv'));
            const months = files.map(file => {
                const match = file.match(/_(\d{4}-\d{2})_Timesheet\.csv$/);
                return match ? match[1] : null;
            }).filter(m => m);
            res.status(200).json({ months: Array.from(new Set(months)) });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/timesheet', (req, res) => {
        const { filename, csvData, oldFilename } = req.body;
        if (!filename || !csvData) return res.status(400).json({ error: 'Missing filename or csvData' });

        // If timesheet was renamed (e.g. employee name changed), delete the old file
        if (oldFilename && oldFilename !== filename) {
            const oldSafe = oldFilename.replace(/[^a-z0-9_.-]/gi, '_');
            const oldPath = path.join(TS_DIR, oldSafe);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        const safeName = filename.replace(/[^a-z0-9_.-]/gi, '_');
        const filePath = path.join(TS_DIR, safeName);

        try {
            writeFileAtomic(filePath, csvData);
            res.status(200).json({ success: true, message: 'Timesheet saved successfully.', file: safeName });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/timesheet/:month', (req, res) => {
        const month = req.params.month;
        const empName = req.query.empName;
        if (!month.match(/^\d{4}-\d{2}$/)) return res.status(400).json({ error: 'Invalid month format' });

        try {
            const files = fs.readdirSync(TS_DIR);
            const matches = files.filter(f => f.includes(`_${month}_Timesheet.csv`));
            if (!matches.length) return res.status(404).json({ error: 'Not found' });

            let target = null;
            if (empName) {
                const safeEmp = empName.replace(/ /g, '_').replace(/[^a-z0-9_.-]/gi, '_');
                const specificFile = matches.find(f => f.startsWith(safeEmp + '_'));
                if (specificFile) {
                    target = specificFile;
                }
            }

            if (!target) {
                const namedMatches = matches.filter(f => !f.startsWith('Unknown_Emp_'));
                const listToUse = namedMatches.length > 0 ? namedMatches : matches;
                listToUse.sort((a, b) => {
                    return fs.statSync(path.join(TS_DIR, b)).mtimeMs - fs.statSync(path.join(TS_DIR, a)).mtimeMs;
                });
                target = listToUse[0];
            }

            const data = fs.readFileSync(path.join(TS_DIR, target), 'utf8');
            const lines = data.split('\n');

            // Parse metadata line
            const metaParts = lines[0].split(',');
            const parsedEmpId = metaParts[3] || '';
            const parsedEmpName = metaParts[5] || '';
            const parsedOrg = metaParts[7] || '';

            const rows = [];
            for (let i = 3; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line || line.startsWith('TOTAL')) break;
                const cols = line.split(',');
                rows.push({
                    date: cols[0] || '',
                    day: cols[1] || '',
                    type: cols[2] || '',
                    inTime: cols[3] || '',
                    outTime: cols[4] || '',
                    extra: cols[5] || '0:00:00',
                    proj: cols[6] || '0:00:00',
                    meet: cols[7] || '0:00:00',
                    total: cols[8] || '0:00:00'
                });
            }
            res.status(200).json({ empId: parsedEmpId, empName: parsedEmpName, org: parsedOrg, rows });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    return {};
};
