const { db } = require('../config/db');

function localDateStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

function localTimeStr(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const h = parts.find(p => p.type === 'hour')?.value ?? '00';
  const m = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${h.padStart(2,'0')}:${m.padStart(2,'0')}`;
}

function flat(records, joinKey = 'users') {
  return (records || []).map(r => {
    const joined = r[joinKey] || {};
    const copy   = { ...r, ...joined };
    delete copy[joinKey];
    return copy;
  });
}

function flatOne(record, joinKey = 'users') {
  if (!record) return null;
  const joined = record[joinKey] || {};
  const copy   = { ...record, ...joined };
  delete copy[joinKey];
  return copy;
}

async function getSettings(orgId) {
  let q = db.from('work_schedule').select('*').limit(1);
  if (orgId) q = q.eq('organization_id', orgId);
  try {
    const { data } = await q.single();
    if (data) return data;
  } catch { }
  try {
    const { data: fallback } = await db.from('work_schedule').select('*').limit(1).single();
    return fallback || null;
  } catch { return null; }
}

function orgId(req) { return req.user?.organization_id || 1; }

function toMinutes(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + m;
}

function isWorkingDay(dateStr, settings) {
  const day = new Date(dateStr + 'T12:00:00').getDay();
  return (settings.work_days || '1,2,3,4,5').split(',').map(Number).includes(day);
}

async function getRecipients(oId) {
  try {
    let q = db.from('notification_recipients').select('email').eq('active', true);
    if (oId) q = q.eq('organization_id', oId);
    const { data } = await q;
    if (data && data.length > 0) return data.map(r => r.email).filter(Boolean);
  } catch { }
  try {
    let adminQuery = db.from('users').select('email').in('role', ['admin', 'root_admin']);
    if (oId) adminQuery = adminQuery.eq('organization_id', oId);
    const { data: admins } = await adminQuery;
    if (admins && admins.length > 0) return admins.map(a => a.email).filter(Boolean);
  } catch { }
  return [];
}

// Generates a URL-safe slug from a company name, guaranteed unique in the organizations table.
// Tries: base → base-YYYY → base-2 … base-99 → base-<timestamp>
async function generateUniqueSlug(companyName) {
  const base = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const taken = async (slug) => {
    const { data } = await db.from('organizations').select('id').eq('slug', slug).maybeSingle();
    return !!data;
  };

  if (!(await taken(base))) return base;

  const withYear = `${base}-${new Date().getFullYear()}`;
  if (!(await taken(withYear))) return withYear;

  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    if (!(await taken(candidate))) return candidate;
  }

  return `${base}-${Date.now()}`;
}

// Returns { orgName, orgEmail } for use in email templates.
// orgEmail is the first active HR admin (role='admin') email — not root_admin.
async function getOrgContext(oId) {
  try {
    const [orgRes, hrRes] = await Promise.all([
      db.from('organizations').select('name').eq('id', oId).maybeSingle(),
      db.from('users')
        .select('email')
        .eq('organization_id', oId)
        .eq('role', 'admin')
        .neq('status', 'inactive')
        .order('created_at', { ascending: true })
        .limit(1),
    ]);
    const hrEmails = Array.isArray(hrRes.data) ? hrRes.data : (hrRes.data ? [hrRes.data] : []);
    return {
      orgName:  orgRes.data?.name || '',
      orgEmail: hrEmails[0]?.email || process.env.SMTP_USER || '',
    };
  } catch {
    return { orgName: '', orgEmail: process.env.SMTP_USER || '' };
  }
}

module.exports = { localDateStr, localTimeStr, flat, flatOne, getSettings, orgId, toMinutes, isWorkingDay, getRecipients, generateUniqueSlug, getOrgContext };
