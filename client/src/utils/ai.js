// Centralised AI provider config — reads from localStorage so all pages stay in sync.

export const getAIConfig = () => {
  const provider = localStorage.getItem('zoro-ai-provider') || 'gemini';
  if (provider === 'groq') {
    return {
      provider: 'groq',
      key: localStorage.getItem('zoro-groq-key') || '',
      model: localStorage.getItem('zoro-groq-model') || 'llama-3.3-70b-versatile',
    };
  }
  return {
    provider: 'gemini',
    key: localStorage.getItem('zoro-ai-key') || '',
    model: localStorage.getItem('zoro-ai-model') || 'gemini-1.5-flash-8b',
  };
};

export const noKeyMessage = (provider) =>
  provider === 'groq'
    ? 'Please set your Groq API key in Settings → AI.'
    : 'Please set your Gemini API key in Settings → AI.';
