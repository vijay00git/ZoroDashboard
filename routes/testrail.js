// TestRail helpers: quality_rating field, tests in a run.
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {

    // --- TestRail: mandatory `quality_rating` result field ---
    // TestRail made the system "Quality Rating" field required on every result.
    // Its value is a JSON object of {dimension_machine_name: 0-5 stars}, with at
    // least one score >= 1. We fill a default derived from the status when the
    // caller didn't supply one: Passed=5, Failed=1, anything else=3.
    function trWithQualityRating(result) {
        if (!result || result.quality_rating) return result;
        const stars = result.status_id === 1 ? 5 : result.status_id === 5 ? 1 : 3;
        return { ...result, quality_rating: { functional_correctness: stars } };
    }

    app.post('/api/testrail/sync', async (req, res) => {
        const { runId, auth, payload } = req.body;

        if (!runId || !auth || !payload) {
            return res.status(400).json({ error: 'Missing runId, auth, or payload.' });
        }

        try {
            const response = await fetch(`https://elosystemsteam.testrail.com/index.php?/api/v2/add_results_for_cases/${runId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ results: payload.map(trWithQualityRating) })
            });

            const data = await response.text();

            if (response.ok) {
                res.status(200).send(data);
            } else {
                res.status(response.status).send(data);
            }
        } catch (error) {
            console.error("Proxy error:", error);
            res.status(500).json({ error: error.message });
        }
    });

    // --- TestRail: Fetch all tests in a run ---
    app.post('/api/testrail/fetch-run', async (req, res) => {
        const { runId, auth } = req.body;

        if (!runId || !auth) {
            return res.status(400).json({ error: 'Missing runId or auth.' });
        }

        const STATUS_MAP = { 1: 'PASSED', 2: 'BLOCKED', 3: 'UNTESTED', 4: 'RETEST', 5: 'FAILED' };
        const BASE = 'https://elosystemsteam.testrail.com/index.php?/api/v2';
        let allTests = [];
        let offset = 0;
        const LIMIT = 250;

        try {
            while (true) {
                const url = `${BASE}/get_tests/${runId}&limit=${LIMIT}&offset=${offset}`;
                const response = await fetch(url, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    const errText = await response.text();
                    return res.status(response.status).json({ error: errText });
                }

                const data = await response.json();
                const tests = Array.isArray(data) ? data : (data.tests || []);
                allTests.push(...tests);
                if (tests.length < LIMIT) break;
                offset += LIMIT;
            }

            const normalized = allTests.map(t => ({
                id: String(t.case_id),
                title: t.title || '',
                status: STATUS_MAP[t.status_id] || 'UNTESTED',
                status_id: t.status_id
            }));

            res.json({ tests: normalized, total: normalized.length });
        } catch (error) {
            console.error("Fetch-run proxy error:", error);
            res.status(500).json({ error: error.message });
        }
    });

    return { trWithQualityRating };
};
