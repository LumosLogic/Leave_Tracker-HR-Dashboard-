'use strict';

// ── API Layer ─────────────────────────────────────────────────────────────────
async function api(method, endpoint, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { 'Authorization': `Bearer ${state.token}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch('/api' + endpoint, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const apiGet    = (ep, qs = {}) => { const q = new URLSearchParams(qs).toString(); return api('GET', ep + (q ? '?' + q : '')); };
const apiPost   = (ep, body)    => api('POST',   ep, body);
const apiPut    = (ep, body)    => api('PUT',    ep, body);
const apiDelete = (ep)          => api('DELETE', ep);
