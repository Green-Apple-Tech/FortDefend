const API_BASE = '';

function getToken() {
  return localStorage.getItem('accessToken');
}

export async function api(path, options = {}) {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(data?.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function setAccessToken(token) {
  if (token) localStorage.setItem('accessToken', token);
  else localStorage.removeItem('accessToken');
}

export function clearSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('user');
  localStorage.removeItem('org');
}

export function getStoredUser() {
  try {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
}

export function getStoredOrg() {
  try {
    const o = localStorage.getItem('org');
    return o ? JSON.parse(o) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  if (user) localStorage.setItem('user', JSON.stringify(user));
  else localStorage.removeItem('user');
}

export function setStoredOrg(org) {
  if (org) localStorage.setItem('org', JSON.stringify(org));
  else localStorage.removeItem('org');
}

export function statusColor(status) {
  if (status === 'current' || status === 'healthy') return 'bg-green-100 text-green-800';
  if (status === 'outdated') return 'bg-amber-100 text-amber-800';
  if (status === 'failed') return 'bg-red-100 text-red-800';
  return 'bg-slate-100 text-slate-700';
}

export function patchActionLabel(action) {
  const map = {
    fresh_install: 'Installed',
    installed: 'Installed',
    updated: 'Updated',
    skipped_current: 'Current',
    skipped_newer: 'Newer',
    skipped: 'Skipped',
    failed: 'Failed',
  };
  return map[action] || action || '—';
}

export function patchActionColor(action) {
  if (action === 'fresh_install' || action === 'installed') return 'bg-green-100 text-green-800';
  if (action === 'updated') return 'bg-blue-100 text-blue-800';
  if (action === 'skipped_current' || action === 'skipped') return 'bg-slate-100 text-slate-700';
  if (action === 'skipped_newer') return 'bg-amber-100 text-amber-800';
  if (action === 'failed') return 'bg-red-100 text-red-800';
  return 'bg-slate-100 text-slate-700';
}

export function exportCsv(filename, rows) {
  if (!rows?.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
