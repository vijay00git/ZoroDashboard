// Holidays proxy.
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {

    // --- Holidays Proxy API ---
    app.get('/api/holidays/:year/:country', async (req, res) => {
        try {
            const { year, country } = req.params;

            // Nager.Date does not support India (IN), so we use a hardcoded fallback
            if (country.toUpperCase() === 'IN') {
                const inHolidays = {
                    "2026": [
                        { date: "2026-01-01", name: "New Year's Day", countryCode: "IN" },
                        { date: "2026-01-26", name: "Republic Day", countryCode: "IN" },
                        { date: "2026-03-04", name: "Holi", countryCode: "IN" },
                        { date: "2026-04-03", name: "Good Friday", countryCode: "IN" },
                        { date: "2026-05-01", name: "May Day", countryCode: "IN" },
                        { date: "2026-08-15", name: "Independence Day", countryCode: "IN" },
                        { date: "2026-10-02", name: "Gandhi Jayanti", countryCode: "IN" },
                        { date: "2026-10-19", name: "Dussehra", countryCode: "IN" },
                        { date: "2026-11-08", name: "Diwali", countryCode: "IN" },
                        { date: "2026-12-25", name: "Christmas Day", countryCode: "IN" }
                    ]
                };
                return res.status(200).json(inHolidays[year] || []);
            }

            const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
            });

            if (response.status === 204) {
                return res.status(200).json([]); // Handle 204 explicitly
            }

            if (!response.ok) {
                return res.status(response.status).json({ error: 'Failed to fetch holidays from Nager API' });
            }

            const data = await response.json();
            res.status(200).json(data);
        } catch (error) {
            console.error("Holiday API proxy error:", error);
            res.status(500).json({ error: error.message });
        }
    });

    return {};
};
