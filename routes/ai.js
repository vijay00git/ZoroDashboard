// AI proxy (Gemini + Groq).
// Moved verbatim out of server.js; shared setup and other areas' helpers arrive through `ctx`.

module.exports = function register(app, ctx) {

    // --- AI Proxy API (Gemini + Groq) ---

    const GROQ_MODELS = [
        { id: 'llama-3.3-70b-versatile',  displayName: 'Llama 3.3 70B Versatile (Best)' },
        { id: 'llama-3.1-8b-instant',     displayName: 'Llama 3.1 8B Instant (Fastest)' },
        { id: 'gemma2-9b-it',             displayName: 'Gemma 2 9B (Google, Free)' },
        { id: 'llama3-8b-8192',           displayName: 'Llama 3 8B 8192' },
    ];

    // List available models for the user's key
    app.get('/api/ai/models', async (req, res) => {
        const { key, provider } = req.query;
        if (!key) return res.status(400).json({ error: 'Missing key' });

        if (provider === 'groq') {
            try {
                const response = await fetch('https://api.groq.com/openai/v1/models', {
                    headers: { 'Authorization': `Bearer ${key}` }
                });
                const data = await response.json();
                if (!response.ok) return res.status(response.status).json({ error: data?.error?.message || `Groq API error ${response.status}` });
                const models = (data.data || [])
                    .filter(m => !m.id.includes('whisper') && !m.id.includes('tts') && !m.id.includes('guard'))
                    .map(m => ({ id: m.id, displayName: m.id }));
                return res.json({ models: models.length ? models : GROQ_MODELS });
            } catch (err) {
                console.warn('Groq live model list failed, falling back to static list:', err.message);
                return res.json({ models: GROQ_MODELS });
            }
        }

        // Gemini
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`
            );
            const data = await response.json();
            if (!response.ok) return res.status(response.status).json({ error: data?.error?.message });
            const models = (data.models || [])
                .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                .map(m => ({ id: m.name.replace('models/', ''), displayName: m.displayName }));
            res.json({ models });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/ai/chat', async (req, res) => {
        const { key, model, system, prompt, provider } = req.body;

        if (!key || !prompt) {
            return res.status(400).json({ error: 'Missing key or prompt' });
        }

        // --- Groq (OpenAI-compatible) ---
        if (provider === 'groq') {
            const messages = [];
            if (system) messages.push({ role: 'system', content: system });
            messages.push({ role: 'user', content: prompt });

            try {
                const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`
                    },
                    body: JSON.stringify({
                        model: model || 'llama-3.3-70b-versatile',
                        messages,
                        temperature: 0.7,
                        max_tokens: 2048
                    })
                });
                const data = await response.json();
                if (!response.ok) {
                    const errMsg = data?.error?.message || `Groq API error ${response.status}`;
                    return res.status(response.status).json({ error: errMsg });
                }
                const text = data?.choices?.[0]?.message?.content || '';
                return res.status(200).json({ text });
            } catch (err) {
                console.error('Groq Proxy error:', err);
                return res.status(500).json({ error: err.message });
            }
        }

        // --- Gemini ---
        const modelId = model || 'gemini-1.5-flash';
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`;

        const body = {
            contents: [
                { role: 'user', parts: [{ text: prompt }] }
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2048
            }
        };

        if (system) {
            body.systemInstruction = {
                parts: [{ text: system }]
            };
        }

        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await response.json();

            if (!response.ok) {
                const errMsg = data?.error?.message || `Gemini API error ${response.status}`;
                return res.status(response.status).json({ error: errMsg });
            }

            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            res.status(200).json({ text });
        } catch (err) {
            console.error('Gemini Proxy error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return {};
};
