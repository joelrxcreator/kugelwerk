// Kleiner RPC-Client für Supabase (ohne Bibliothek).
(function () {
  const C = window.KW_CONFIG;
  class ApiError extends Error {
    constructor(code, msg) { super(msg || code); this.code = code; }
  }
  async function rpc(fn, args = {}, { timeout = 15000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    let res;
    try {
      res = await fetch(`${C.url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: C.key, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(args),
        signal: ctrl.signal,
        cache: 'no-store'
      });
    } catch (e) {
      throw new ApiError('offline', 'Keine Verbindung');
    } finally { clearTimeout(t); }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const m = (data && (data.message || data.hint)) || `HTTP ${res.status}`;
      throw new ApiError(String(m).split(' ')[0], m);
    }
    return data;
  }
  window.KW_API = { rpc, ApiError };
})();
