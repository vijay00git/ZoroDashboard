import { useCallback, useState } from 'react';

// Every page in this app hand-rolls its own version of "await fetch, check
// res.ok, parse the JSON body, catch a network error" — each with a subtly
// different shape. This standardizes just the fetch mechanics; how a caller
// *reacts* to failure (toast, blocking alert, silent console.warn) stays up
// to it, since different pages already use different UX conventions there.
//
// Returns [request, loading]. request(url, options?) resolves to
// { ok, status, body } and never throws — a network failure (no response at
// all, e.g. the server is down) comes back as { ok: false, status: 0,
// body: { error: <message> } } so callers can handle both cases identically
// instead of needing a separate try/catch around every call.
//
// Pass initialLoading=true for a component that fetches immediately on
// mount, so the first render doesn't show an empty/"no data" state for one
// frame before the mount effect flips loading on.
export function useApi(initialLoading = false) {
  const [loading, setLoading] = useState(initialLoading);

  const request = useCallback(async (url, options) => {
    setLoading(true);
    try {
      const res = await fetch(url, options);
      let body = null;
      try { body = await res.json(); } catch { /* no/invalid JSON body */ }
      return { ok: res.ok, status: res.status, body };
    } catch (e) {
      return { ok: false, status: 0, body: { error: e.message || 'Network error' } };
    } finally {
      setLoading(false);
    }
  }, []);

  return [request, loading];
}
