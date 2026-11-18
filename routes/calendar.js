// Calendar (ICS upload, upcoming events, month view).
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {
    const { express, fs, ical, path, writeFileAtomic, ROOT } = ctx;

    // --- Google Calendar ICS Proxy ---
    app.use('/api/calendar/upload', express.text({ limit: '10mb', type: '*/*' }));

    app.post('/api/calendar/upload', (req, res) => {
        try {
            if (!req.body) return res.status(400).json({ error: 'No content' });
            writeFileAtomic(path.join(ROOT, 'data', 'calendar.ics'), req.body);
            res.status(200).json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.delete('/api/calendar/local', (req, res) => {
        try {
            const p = path.join(ROOT, 'data', 'calendar.ics');
            if (fs.existsSync(p)) fs.unlinkSync(p);
            res.status(200).json({ success: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/calendar/upcoming', async (req, res) => {
        try {
            const url = req.query.url;
            const useLocal = req.query.local === 'true';

            if (!url && !useLocal) return res.status(400).json({ error: 'Missing calendar source' });

            let events;
            if (useLocal) {
                const p = path.join(ROOT, 'data', 'calendar.ics');
                if (!fs.existsSync(p)) return res.status(404).json({ error: 'Local calendar not found' });
                const data = fs.readFileSync(p, 'utf-8');
                events = ical.parseICS(data);
            } else {
                events = await ical.async.fromURL(url);
            }

            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            // Fetch up to 1 year in advance to ensure we find at least 6 events
            const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const rangeEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

            let output = [];
            for (const k in events) {
                if (!Object.hasOwn(events, k)) continue;
                const ev = events[k];
                if (ev.type !== 'VEVENT') continue;

                const title = ev.summary;
                const start = ev.start;

                if (typeof ev.rrule === 'undefined') {
                    if (start >= rangeStart && start <= rangeEnd) {
                        output.push({ date: start.toISOString(), name: title });
                    }
                } else {
                    const dates = ev.rrule.between(rangeStart, rangeEnd);
                    for (const date of dates) {
                        output.push({ date: date.toISOString(), name: title });
                    }
                }
            }

            // Sort ascending
            output.sort((a, b) => a.date.localeCompare(b.date));

            // Return up to 20 to be safe (frontend will limit to 6 or more)
            res.status(200).json(output.slice(0, 20));
        } catch (e) {
            console.error("Upcoming Calendar API error:", e);
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/calendar/:year/:month', async (req, res) => {
        try {
            const { year, month } = req.params;
            const url = req.query.url;
            const useLocal = req.query.local === 'true';

            if (!url && !useLocal) return res.status(400).json({ error: 'Missing calendar source' });

            let events;
            if (useLocal) {
                const p = path.join(ROOT, 'data', 'calendar.ics');
                if (!fs.existsSync(p)) return res.status(404).json({ error: 'Local calendar not found' });
                const data = fs.readFileSync(p, 'utf-8');
                events = ical.parseICS(data);
            } else {
                events = await ical.async.fromURL(url);
            }
            // month is 1-indexed from frontend
            const rangeStart = new Date(year, parseInt(month) - 1, 1);
            const rangeEnd = new Date(year, parseInt(month), 0, 23, 59, 59);

            const output = [];

            for (const k in events) {
                if (!Object.hasOwn(events, k)) continue;
                const ev = events[k];
                if (ev.type !== 'VEVENT') continue;

                const title = ev.summary;
                const start = ev.start;

                if (typeof ev.rrule === 'undefined') {
                    if (start >= rangeStart && start <= rangeEnd) {
                        output.push({ date: start.toISOString(), name: title });
                    }
                } else {
                    const dates = ev.rrule.between(rangeStart, rangeEnd);
                    for (const date of dates) {
                        output.push({ date: date.toISOString(), name: title });
                    }
                }
            }
            res.status(200).json(output);
        } catch (e) {
            console.error("Calendar API error:", e);
            res.status(500).json({ error: e.message });
        }
    });

    return {};
};
