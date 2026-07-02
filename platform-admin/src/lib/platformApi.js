// API_BASE points to the Cloud Run backend — set via VITE_API_URL in .env
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const getPAToken = () => localStorage.getItem('pa_token');

async function paFetch(method, endpoint, body = null) {
  const token = getPAToken();
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(`${API_BASE}/api/platform${endpoint}`, opts);
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent('pa-auth:expired'));
    throw new Error('Session expired. Please log in again.');
  }

  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const paGet    = (ep, qs = {}) => {
  const q = new URLSearchParams(qs).toString();
  return paFetch('GET', ep + (q ? '?' + q : ''));
};
export const paPost   = (ep, body) => paFetch('POST',  ep, body);
export const paPut    = (ep, body) => paFetch('PUT',   ep, body);
export const paPatch  = (ep, body) => paFetch('PATCH', ep, body);
export const paDelete = (ep)       => paFetch('DELETE', ep);

// Direct login call (no auth token needed)
export async function platformLogin(email, password) {
  const res  = await fetch(`${API_BASE}/api/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}
