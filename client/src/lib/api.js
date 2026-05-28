const getToken = () => localStorage.getItem('lt_token');

async function apiFetch(method, endpoint, body = null) {
  const token = getToken();
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch('/api' + endpoint, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const apiGet    = (ep, qs = {}) => {
  const q = new URLSearchParams(qs).toString();
  return apiFetch('GET', ep + (q ? '?' + q : ''));
};
export const apiPost   = (ep, body) => apiFetch('POST',   ep, body);
export const apiPut    = (ep, body) => apiFetch('PUT',    ep, body);
export const apiDelete = (ep)       => apiFetch('DELETE', ep);
