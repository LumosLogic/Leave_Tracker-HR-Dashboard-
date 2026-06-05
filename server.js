require('dotenv').config();
// Set IST timezone before any Date usage so all local-time helpers return IST
process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const SERVER_VERSION = '2.2.0-platform-admin-2026-06-02';
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const axios    = require('axios');
const path     = require('path');
const webpush  = require('web-push');
const { supabase, seed } = require('./db');
const { sendMail, getNotifyList, leaveAppliedHtml, leaveStatusHtml, welcomeEmployeeHtml, birthdayWishHtml, birthdayReminderHtml, holidayReminderHtml, orgRequestReceivedHtml, orgApprovedHtml, orgRejectedHtml } = require('./emailService');

// ─── VAPID / Push Notification Setup ─────────────────────────────────────────
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    'mailto:' + (process.env.SMTP_USER || 'admin@lumoslogic.com'),
    VAPID_PUBLIC, VAPID_PRIVATE
  );
} else {
  console.warn('[Push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — push notifications disabled');
}
const gcal = require('./googleCalendarService');

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'leave-tracker-secret-2026';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS — allow Firebase Hosting and local dev
const ALLOWED_ORIGINS = [
  'https://leavetrackerbylumos.web.app',
  'https://leavetrackerbylumos.firebaseapp.com',
  'https://leavetracker-platform-admin.web.app',
  'https://leavetracker-platform-admin.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin)) {
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Send web push notification to a list of users (null = all users)
async function sendPushToUsers(userIds, payload) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;
  let query = supabase.from('push_subscriptions').select('user_id, endpoint, subscription');
  if (userIds && userIds.length > 0) query = query.in('user_id', userIds);
  const { data: subs } = await query;
  if (!subs?.length) return 0;
  const payloadStr = JSON.stringify(payload);
  let sent = 0;
  await Promise.allSettled(subs.map(async s => {
    try {
      await webpush.sendNotification(s.subscription, payloadStr);
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        try { await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint); } catch { /* ignore */ }
      }
    }
  }));
  return sent;
}

// Returns YYYY-MM-DD in IST (Asia/Kolkata). Always use this instead of toISOString().split('T')[0]
function localDateStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}
// Returns HH:MM in IST
function localTimeStr(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const h = parts.find(p => p.type === 'hour')?.value ?? '00';
  const m = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${h.padStart(2,'0')}:${m.padStart(2,'0')}`;
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
}
// Both HR admin and root admin can manage HR-level operations
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'root_admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}
// Only the root admin can access root-level operations
function rootAdminOnly(req, res, next) {
  if (req.user.role !== 'root_admin')
    return res.status(403).json({ error: 'Root admin access required' });
  next();
}
// True for HR admin or root admin — used for data-scope checks
function isAdminRole(role) { return role === 'admin' || role === 'root_admin'; }
// Flatten Supabase join: { ...record, users: { name, ... } } → { ...record, name, ... }
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
  let q = supabase.from('work_schedule').select('*').limit(1);
  if (orgId) q = q.eq('organization_id', orgId);
  try {
    const { data } = await q.single();
    if (data) return data;
  } catch { /* not found — fall through to fallback */ }
  try {
    const { data: fallback } = await supabase.from('work_schedule').select('*').limit(1).single();
    return fallback || null;
  } catch { return null; }
}

// Helper: get org_id from request (defaults to 1 for backward compat)
function orgId(req) { return req.user?.organization_id || 1; }

// Helper: get clockify config from organizations table
async function getClockifyConfig(oId) {
  const { data } = await supabase.from('organizations')
    .select('clockify_api_key, clockify_workspace_id, clockify_last_synced')
    .eq('id', oId || 1).maybeSingle();
  if (!data) return null;
  return { api_key: data.clockify_api_key, workspace_id: data.clockify_workspace_id, last_synced: data.clockify_last_synced };
}
function toMinutes(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + m;
}
function isWorkingDay(dateStr, settings) {
  const day = new Date(dateStr + 'T12:00:00').getDay();
  return (settings.work_days || '1,2,3,4,5').split(',').map(Number).includes(day);
}

// ─── Dynamic notification recipients ─────────────────────────────────────────
async function getRecipients(oId) {
  try {
    let q = supabase.from('notification_recipients').select('email').eq('active', true);
    if (oId) q = q.eq('organization_id', oId);
    const { data } = await q;
    if (data && data.length > 0) return data.map(r => r.email).filter(Boolean);
  } catch { /* fall back to env */ }
  return [
    process.env.HR_EMAIL,
    process.env.COMPANY_HEAD_1_EMAIL,
    process.env.COMPANY_HEAD_2_EMAIL,
  ].filter(Boolean);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, org_slug } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    let userQuery = supabase.from('users')
      .select('*, organizations(id, name, slug, logo_url)')
      .eq('email', email.toLowerCase().trim());

    // If org_slug provided, scope the login to that specific organization
    if (org_slug) {
      const { data: org } = await supabase.from('organizations').select('id').eq('slug', org_slug.toLowerCase().trim()).maybeSingle();
      if (!org) return res.status(401).json({ error: 'Organization not found' });
      userQuery = userQuery.eq('organization_id', org.id);
    }

    const { data: user } = await userQuery.maybeSingle();

    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Invalid email or password' });

    const org = user.organizations || {};
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, organization_id: user.organization_id || 1, organization_slug: org.slug || 'lumoslogic' },
      JWT_SECRET, { expiresIn: '24h' }
    );
    res.json({
      token,
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role,
        department: user.department, position: user.position, avatar_color: user.avatar_color,
        force_password_change: user.force_password_change || false,
        organization_id: user.organization_id || 1,
        organization_name: org.name || 'LumosLogic',
        organization_slug: org.slug || 'lumoslogic',
        organization_logo: org.logo_url || '',
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Organization Registration (creates pending request, not live org) ────────
app.post('/api/register-org', async (req, res) => {
  try {
    const { company_name, name, email, phone, website, message } = req.body;
    if (!company_name || !name || !email)
      return res.status(400).json({ error: 'Company name, your name, and email are required' });

    const norm = email.toLowerCase().trim();
    const slug = company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Reject duplicate pending/approved requests for same email or slug
    const { data: dupEmail } = await supabase.from('org_registration_requests')
      .select('id').eq('email', norm).in('status', ['pending', 'approved']).maybeSingle();
    if (dupEmail) return res.status(400).json({ error: 'A request with this email is already pending or approved.' });

    const { data: dupSlug } = await supabase.from('org_registration_requests')
      .select('id').eq('company_name', company_name.trim()).in('status', ['pending', 'approved']).maybeSingle();
    if (dupSlug) return res.status(400).json({ error: 'A request for this company name is already pending or approved.' });

    const { data: existingOrg } = await supabase.from('organizations').select('id').eq('slug', slug).maybeSingle();
    if (existingOrg) return res.status(400).json({ error: `An organization named "${company_name}" already exists.` });

    const { data: existingUser } = await supabase.from('users').select('id').eq('email', norm).maybeSingle();
    if (existingUser) return res.status(400).json({ error: 'An account with this email already exists.' });

    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;

    const { data: request, error: reqErr } = await supabase.from('org_registration_requests')
      .insert({ company_name: company_name.trim(), contact_name: name.trim(), email: norm, phone: phone || null, website: website || null, message: message || null, ip_address: ip })
      .select().single();
    if (reqErr) throw new Error(reqErr.message);

    // Log activity
    await supabase.from('platform_activity').insert({
      event_type: 'org_request_submitted',
      description: `New registration request from ${name.trim()} (${company_name.trim()})`,
      metadata: { request_id: request.id, email: norm, company: company_name.trim() },
    });

    // Notify platform admin via email (using LumosLogic SMTP)
    const platformAdminEmail = process.env.PLATFORM_ADMIN_EMAIL || process.env.SMTP_USER;
    if (platformAdminEmail) {
      sendMail({ to: platformAdminEmail, subject: `[LeaveTracker] New Org Request: ${company_name.trim()}`, html: orgRequestReceivedHtml(request) });
    }

    res.json({ success: true, message: 'Your registration request has been submitted. Our team will review and email you within 24 hours.', request_id: request.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin Auth Middleware ──────────────────────────────────────────
function platformAdminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'platform_admin') return res.status(403).json({ error: 'Platform admin access required' });
    req.platformAdmin = decoded;
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

// ─── Platform Admin: Login ────────────────────────────────────────────────────
app.post('/api/platform/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { data: admin } = await supabase.from('platform_admins')
      .select('*').eq('email', email.toLowerCase().trim()).maybeSingle();
    if (!admin || !bcrypt.compareSync(password, admin.password))
      return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name, role: 'platform_admin' },
      JWT_SECRET, { expiresIn: '12h' }
    );
    res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin: Stats ────────────────────────────────────────────────────
app.get('/api/platform/stats', platformAdminAuth, async (req, res) => {
  try {
    const [
      { count: totalOrgs },
      { count: pendingReqs },
      { count: totalUsers },
      { count: approvedOrgs },
    ] = await Promise.all([
      supabase.from('organizations').select('id', { count: 'exact', head: true }),
      supabase.from('org_registration_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('org_registration_requests').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
    ]);

    const { data: recentOrgs } = await supabase.from('organizations')
      .select('id, name, slug, status, plan, created_at').order('created_at', { ascending: false }).limit(5);

    const { data: recentRequests } = await supabase.from('org_registration_requests')
      .select('id, company_name, contact_name, email, status, created_at').order('created_at', { ascending: false }).limit(5);

    res.json({ totalOrgs: totalOrgs || 0, pendingRequests: pendingReqs || 0, totalUsers: totalUsers || 0, approvedOrgs: approvedOrgs || 0, recentOrgs: recentOrgs || [], recentRequests: recentRequests || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin: All Organizations ───────────────────────────────────────
app.get('/api/platform/organizations', platformAdminAuth, async (req, res) => {
  try {
    const { data: orgs } = await supabase.from('organizations')
      .select('id, name, slug, domain, status, plan, created_at').order('created_at', { ascending: false });

    const orgsWithCounts = await Promise.all((orgs || []).map(async org => {
      const { count: userCount } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('organization_id', org.id);
      return { ...org, userCount: userCount || 0 };
    }));

    res.json(orgsWithCounts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin: Registration Requests ───────────────────────────────────
app.get('/api/platform/requests', platformAdminAuth, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    let q = supabase.from('org_registration_requests').select('*').order('created_at', { ascending: false });
    if (status !== 'all') q = q.eq('status', status);
    const { data } = await q;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin: Approve Request ─────────────────────────────────────────
app.post('/api/platform/requests/:id/approve', platformAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const { data: request } = await supabase.from('org_registration_requests').select('*').eq('id', id).single();
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: `Request is already ${request.status}` });

    const slug = request.company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Create organization
    const { data: org, error: orgErr } = await supabase.from('organizations')
      .insert({ name: request.company_name, slug, status: 'active', plan: 'free' })
      .select().single();
    if (orgErr) throw new Error(orgErr.message);

    // Generate temp password + create root_admin user
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!';
    const tempPassword = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const hashed = bcrypt.hashSync(tempPassword, 10);

    const { data: user, error: userErr } = await supabase.from('users')
      .insert({
        name: request.contact_name, email: request.email, password: hashed,
        role: 'root_admin', organization_id: org.id,
        department: 'Management', position: 'Owner',
        avatar_color: '#3525cd', force_password_change: true,
      })
      .select('id, name, email, role').single();
    if (userErr) {
      await supabase.from('organizations').delete().eq('id', org.id);
      throw new Error(userErr.message);
    }

    // Create default work schedule
    await supabase.from('work_schedule').insert({
      organization_id: org.id,
      start_time: '09:00', end_time: '18:00',
      late_threshold: '09:30', early_exit_threshold: '17:00',
      half_day_hours: 4.5, work_days: '1,2,3,4,5',
    });

    // Update request status
    await supabase.from('org_registration_requests').update({
      status: 'approved', reviewed_at: new Date().toISOString(),
      reviewer_notes: notes || null, organization_id: org.id,
    }).eq('id', id);

    // Log activity
    await supabase.from('platform_activity').insert({
      event_type: 'org_approved',
      description: `Organization "${request.company_name}" approved by platform admin`,
      metadata: { request_id: Number(id), org_id: org.id, email: request.email },
    });

    // Send approval email (LumosLogic SMTP)
    sendMail({
      to: request.email,
      subject: `Welcome to LeaveTracker — Your organization "${request.company_name}" is approved!`,
      html: orgApprovedHtml(request, slug, tempPassword),
    });

    res.json({ success: true, organization: { id: org.id, name: org.name, slug }, user: { id: user.id, email: user.email } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin: Reject Request ──────────────────────────────────────────
app.post('/api/platform/requests/:id/reject', platformAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const { data: request } = await supabase.from('org_registration_requests').select('*').eq('id', id).single();
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: `Request is already ${request.status}` });

    await supabase.from('org_registration_requests').update({
      status: 'rejected', reviewed_at: new Date().toISOString(), reviewer_notes: notes || null,
    }).eq('id', id);

    await supabase.from('platform_activity').insert({
      event_type: 'org_rejected',
      description: `Organization request from "${request.company_name}" rejected`,
      metadata: { request_id: Number(id), email: request.email, notes: notes || '' },
    });

    sendMail({
      to: request.email,
      subject: `LeaveTracker — Update on your registration request`,
      html: orgRejectedHtml(request, notes),
    });

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin: Activity Feed ───────────────────────────────────────────
app.get('/api/platform/activity', platformAdminAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const { data } = await supabase.from('platform_activity')
      .select('*').order('created_at', { ascending: false }).limit(limit);
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin: Organization Members ─────────────────────────────────────
app.get('/api/platform/organizations/:id/members', platformAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: org } = await supabase.from('organizations')
      .select('id, name, slug, domain, status, plan, created_at, smtp_user, smtp_from, google_calendar_id, total_annual_leaves')
      .eq('id', id).single();
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { data: members } = await supabase.from('users')
      .select('id, name, email, role, department, position, avatar_color, created_at')
      .eq('organization_id', id)
      .order('role', { ascending: true })
      .order('name', { ascending: true });

    const { count: leaveCount } = await supabase.from('leaves')
      .select('id', { count: 'exact', head: true }).eq('organization_id', id);

    const { count: attendanceCount } = await supabase.from('attendance')
      .select('id', { count: 'exact', head: true }).eq('organization_id', id);

    res.json({ org, members: members || [], stats: { leaveCount: leaveCount || 0, attendanceCount: attendanceCount || 0 } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Organization Settings (get / update) ─────────────────────────────────────
app.get('/api/org/settings', auth, async (req, res) => {
  try {
    const { data } = await supabase.from('organizations')
      .select('id, name, slug, domain, logo_url, smtp_host, smtp_port, smtp_user, smtp_from, google_client_id, google_calendar_id, clockify_workspace_id, vapid_public_key, total_annual_leaves, plan, status, created_at')
      .eq('id', orgId(req)).single();
    if (!data) return res.status(404).json({ error: 'Organization not found' });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/org/settings', auth, async (req, res) => {
  try {
    if (req.user.role !== 'root_admin') return res.status(403).json({ error: 'Root admin access required' });
    const {
      name, domain, logo_url,
      smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from,
      google_client_id, google_client_secret, google_refresh_token, google_calendar_id,
      clockify_api_key, clockify_workspace_id,
      vapid_public_key, vapid_private_key,
      total_annual_leaves,
    } = req.body;

    const update = {};
    if (name)               update.name = name.trim();
    if (domain !== undefined) update.domain = domain;
    if (logo_url !== undefined) update.logo_url = logo_url;
    if (smtp_host !== undefined) update.smtp_host = smtp_host;
    if (smtp_port !== undefined) update.smtp_port = parseInt(smtp_port) || 587;
    if (smtp_user !== undefined) update.smtp_user = smtp_user;
    if (smtp_pass && smtp_pass.trim() !== '') update.smtp_pass = smtp_pass.trim();
    if (smtp_from !== undefined) update.smtp_from = smtp_from;
    if (google_client_id !== undefined) update.google_client_id = google_client_id;
    if (google_client_secret && google_client_secret.trim() !== '') update.google_client_secret = google_client_secret.trim();
    if (google_refresh_token && google_refresh_token.trim() !== '') update.google_refresh_token = google_refresh_token.trim();
    if (google_calendar_id !== undefined) update.google_calendar_id = google_calendar_id;
    if (clockify_api_key && clockify_api_key.trim() !== '') update.clockify_api_key = clockify_api_key.trim();
    if (clockify_workspace_id !== undefined) update.clockify_workspace_id = clockify_workspace_id;
    if (vapid_public_key !== undefined) update.vapid_public_key = vapid_public_key;
    if (vapid_private_key && vapid_private_key.trim() !== '') update.vapid_private_key = vapid_private_key.trim();
    if (total_annual_leaves) update.total_annual_leaves = parseInt(total_annual_leaves) || 18;

    const { data, error } = await supabase.from('organizations')
      .update(update).eq('id', orgId(req))
      .select('id, name, slug, domain, logo_url, smtp_host, smtp_port, smtp_user, smtp_from, google_client_id, google_calendar_id, clockify_workspace_id, vapid_public_key, total_annual_leaves, plan, status').single();
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const { data } = await supabase.from('users')
    .select('id, name, email, role, department, position, avatar_color').eq('id', req.user.id).single();
  res.json(data);
});

app.put('/api/auth/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const { data: user } = await supabase.from('users').select('password').eq('id', req.user.id).single();
    if (!bcrypt.compareSync(currentPassword, user.password))
      return res.status(400).json({ error: 'Current password is incorrect' });
    const { error: pwErr } = await supabase.from('users').update({ password: bcrypt.hashSync(newPassword, 10), force_password_change: false }).eq('id', req.user.id);
    if (pwErr) throw new Error(pwErr.message);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/auth/profile', auth, async (req, res) => {
  try {
    const { name, avatar_color, email } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const update = { name, avatar_color };
    if (email) {
      const norm = email.toLowerCase().trim();
      const { data: dup } = await supabase.from('users').select('id').eq('email', norm).maybeSingle();
      if (dup && dup.id !== req.user.id) return res.status(400).json({ error: 'Email already in use by another account' });
      update.email = norm;
    }
    const { data, error } = await supabase.from('users')
      .update(update)
      .eq('id', req.user.id)
      .select('id, name, email, role, department, position, avatar_color').single();
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Dashboard ────────────────────────────────────────────────────────────────
app.get('/api/dashboard', auth, async (req, res) => {
  let _step = 'init';
  try {
    const realToday = localDateStr();
    const today     = req.query.date || realToday;   // use date filter if provided
    const isToday   = today === realToday;

    // ── 1. Get all employees (never include admin) ───────────────────────────
    _step = 'employees';
    const { data: allEmployees } = await supabase.from('users')
      .select('id, name, avatar_color, department, clockify_user_id')
      .eq('role', 'employee').eq('organization_id', orgId(req));
    const totalEmployees = (allEmployees || []).length;
    const empIds         = (allEmployees || []).map(e => e.id);

    // ── 2. Selected date attendance — employees only ─────────────────────────
    _step = 'attendance';
    let todayRecords = [];
    if (empIds.length > 0) {
      const { data: todayRaw } = await supabase.from('attendance')
        .select('*, users(name, avatar_color, department)')
        .eq('date', today).eq('organization_id', orgId(req))
        .in('user_id', empIds);
      todayRecords = flat(todayRaw);
    }

    // ── 3. Clockify live — only meaningful for today ──────────────────────────
    _step = 'clockify';
    const clockifyActiveIds = new Set();
    const clockifyStartTimes = {}; // empId → 'HH:MM' local time from Clockify timer start
    if (isToday) {
      try {
        const config = await getClockifyConfig(orgId(req));
        if (config?.api_key && config.api_key !== '' && config?.workspace_id) {
          await Promise.all(allEmployees.filter(e => e.clockify_user_id).map(async emp => {
            try {
              const resp = await axios.get(
                `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${emp.clockify_user_id}/time-entries`,
                { headers: { 'X-Api-Key': config.api_key }, params: { 'in-progress': true, 'page-size': 1 } }
              );
              const active = (resp.data || []).find(e => !e.timeInterval?.end);
              if (active) {
                clockifyActiveIds.add(emp.id);
                if (active.timeInterval?.start) {
                  const d = new Date(active.timeInterval.start);
                  clockifyStartTimes[emp.id] = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                }
              }
            } catch { /* individual failure is ok */ }
          }));
        }
      } catch { /* Clockify unavailable — degrade gracefully */ }
    }

    // ── 4. Calculate stats ────────────────────────────────────────────────────
    const onLeaveIds = new Set(todayRecords.filter(r => r.status === 'on_leave').map(r => r.user_id));

    // Persist Clockify check-ins to attendance DB so MyAttendance and all views stay in sync
    if (isToday && clockifyActiveIds.size > 0) {
      const settings = await getSettings(orgId(req));
      await Promise.all([...clockifyActiveIds].map(async id => {
        if (onLeaveIds.has(id)) return; // employee is on leave — skip
        const checkInTime = clockifyStartTimes[id] || null;
        const is_late = checkInTime && settings ? toMinutes(checkInTime) > toMinutes(settings.late_threshold) : false;
        const existing = todayRecords.find(r => r.user_id === id);
        if (!existing) {
          // No attendance record yet — create one from Clockify start time
          try {
            const { data: inserted } = await supabase.from('attendance')
              .insert({ user_id: id, date: today, check_in: checkInTime, status: 'present', is_late, organization_id: orgId(req) })
              .select().single();
            if (inserted) {
              const emp = (allEmployees || []).find(e => e.id === id);
              todayRecords.push({ ...inserted, name: emp?.name, avatar_color: emp?.avatar_color, department: emp?.department });
            }
          } catch { /* insert failed — skip */ }
        } else if (!existing.check_in) {
          // Record exists but no manual check-in — set from Clockify (never overwrite manual check-ins)
          try {
            await supabase.from('attendance')
              .update({ check_in: checkInTime, status: 'present', is_late })
              .eq('id', existing.id);
          } catch { /* update failed — skip */ }
          existing.check_in = checkInTime;
          existing.status   = 'present';
          existing.is_late  = is_late;
        }
      }));
    }

    const onLeaveToday  = onLeaveIds.size;
    const presentToday  = Math.max(0, totalEmployees - onLeaveToday);
    const onClockify    = isToday ? [...clockifyActiveIds].filter(id => !onLeaveIds.has(id)).length : null;
    const notOnClockify = isToday ? Math.max(0, presentToday - onClockify) : null;
    const lateToday      = todayRecords.filter(r => r.is_late).length;
    const earlyExitToday = todayRecords.filter(r => r.is_early_exit).length;
    const halfDayToday   = todayRecords.filter(r => r.status === 'half_day').length;
    const wfhToday       = todayRecords.filter(r => r.status === 'wfh').length;

    // ── 5. Activity for selected date ─────────────────────────────────────────
    const activityMap = new Map();
    for (const r of todayRecords) {
      activityMap.set(r.user_id, { ...r, clockify_live: clockifyActiveIds.has(r.user_id) });
    }
    // Fallback: Clockify-active users that failed to insert (edge case)
    if (isToday) {
      for (const id of clockifyActiveIds) {
        if (!activityMap.has(id) && !onLeaveIds.has(id)) {
          const emp = allEmployees.find(e => e.id === id);
          if (emp) activityMap.set(id, { user_id: emp.id, name: emp.name, avatar_color: emp.avatar_color, department: emp.department, status: 'present', check_in: clockifyStartTimes[id] || null, clockify_live: true });
        }
      }
    }
    const recentActivity = [...activityMap.values()].slice(0, 15);

    // ── 6. Pending leaves ────────────────────────────────────────────────────
    _step = 'leaves';
    const { count: pendingLeaves } = await supabase.from('leaves')
      .select('*', { count: 'exact', head: true }).eq('status', 'pending').eq('organization_id', orgId(req));

    let pendingLeaveList;
    if (isAdminRole(req.user.role)) {
      const { data: plRaw } = await supabase.from('leaves')
        .select('*, users!leaves_user_id_fkey(name, email, department, avatar_color)')
        .eq('status', 'pending').eq('organization_id', orgId(req))
        .order('created_at', { ascending: false }).limit(5);
      pendingLeaveList = flat(plRaw);
    } else {
      const { data: plRaw } = await supabase.from('leaves')
        .select('*, users!leaves_user_id_fkey(name)').eq('user_id', req.user.id).eq('organization_id', orgId(req))
        .order('created_at', { ascending: false }).limit(5);
      pendingLeaveList = flat(plRaw);
    }

    _step = 'myToday';
    const { data: myToday } = await supabase.from('attendance')
      .select('*').eq('user_id', req.user.id).eq('date', today).maybeSingle();

    res.json({ totalEmployees, presentToday, onLeaveToday, onClockify, notOnClockify, lateToday, earlyExitToday, halfDayToday, wfhToday, pendingLeaves, recentActivity, pendingLeaveList, myToday, today, isToday });
  } catch (err) {
    console.error(`[Dashboard] step="${_step}" error:`, err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

// ─── Employees ────────────────────────────────────────────────────────────────
app.get('/api/employees', auth, async (req, res) => {
  try {
    // root_admin sees all non-root users (HR admins + employees); others see only employees
    const roleFilter = req.user.role === 'root_admin' ? ['admin', 'employee'] : ['employee'];
    const { data: users } = await supabase.from('users')
      .select('id, name, email, role, department, position, avatar_color, date_of_birth, created_at')
      .eq('organization_id', orgId(req))
      .in('role', roleFilter)
      .order('name');

    // Attach multi-department assignments
    const ids = (users || []).map(u => u.id);
    let deptMap = {};
    if (ids.length > 0) {
      const { data: ud } = await supabase.from('user_departments')
        .select('user_id, department_id, role_in_dept, departments(id, name)')
        .in('user_id', ids);
      (ud || []).forEach(r => {
        if (!deptMap[r.user_id]) deptMap[r.user_id] = [];
        deptMap[r.user_id].push({ id: r.department_id, name: r.departments?.name || '', role: r.role_in_dept });
      });
    }

    res.json((users || []).map(u => ({ ...u, departments: deptMap[u.id] || [] })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employees', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role, department, position, avatar_color, date_of_birth } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });
    if (role === 'root_admin' && req.user.role !== 'root_admin') {
      return res.status(403).json({ error: 'Only root admins can create root_admin accounts' });
    }
    const hashed = bcrypt.hashSync(password, 10);
    const { data, error } = await supabase.from('users')
      .insert({ name, email: email.toLowerCase(), password: hashed, role: role||'employee', department: department||'General', position: position||'Staff', avatar_color: avatar_color||'#4F46E5', date_of_birth: date_of_birth||null, force_password_change: true, organization_id: orgId(req) })
      .select('id, name, email, role, department, position, avatar_color, date_of_birth').single();
    if (error?.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    if (error) throw new Error(error.message);
    sendMail({ to: email, subject: 'Welcome to Lumens HR — Your Account Details', html: welcomeEmployeeHtml({ name, email, department: department||'General', position: position||'Staff' }, password) });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employees/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, role, department, position, avatar_color, password, date_of_birth, department_ids } = req.body;
    if (role === 'root_admin' && req.user.role !== 'root_admin') {
      return res.status(403).json({ error: 'Only root admins can assign the root_admin role' });
    }
    const update = { name, email, role, department, position, avatar_color, date_of_birth: date_of_birth||null };
    if (password) update.password = bcrypt.hashSync(password, 10);
    const { data, error } = await supabase.from('users').update(update)
      .eq('id', req.params.id).eq('organization_id', orgId(req))
      .select('id, name, email, role, department, position, avatar_color, date_of_birth').single();
    if (error) throw new Error(error.message);

    // Sync multi-department assignments if provided
    if (Array.isArray(department_ids)) {
      await supabase.from('user_departments').delete().eq('user_id', req.params.id);
      if (department_ids.length > 0) {
        await supabase.from('user_departments').insert(
          department_ids.map(dId => ({ user_id: parseInt(req.params.id), department_id: dId, role_in_dept: 'Member', organization_id: orgId(req) }))
        );
      }
    }

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/employees/:id', auth, adminOnly, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await supabase.from('users').delete().eq('id', req.params.id).eq('organization_id', orgId(req));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance ───────────────────────────────────────────────────────────────
app.get('/api/attendance', auth, async (req, res) => {
  try {
    const { year, month, date, userId } = req.query;

    let query = supabase.from('attendance')
      .select('*, users!inner(name, email, avatar_color, department, position)')
      .eq('organization_id', orgId(req))
      .order('date', { ascending: true });

    if (!isAdminRole(req.user.role)) {
      query = query.eq('user_id', req.user.id);
    } else if (userId && userId !== 'all') {
      query = query.eq('user_id', parseInt(userId));
    }

    if (date) {
      query = query.eq('date', date);
    } else if (year && month) {
      query = query.like('date', `${year}-${String(month).padStart(2,'0')}-%`);
    } else if (year) {
      query = query.like('date', `${year}-%`);
    } else if (req.query.startDate && req.query.endDate) {
      query = query.gte('date', req.query.startDate).lte('date', req.query.endDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    res.json(flat(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/attendance/today', auth, async (req, res) => {
  try {
    const today = localDateStr();
    const { data } = await supabase.from('attendance')
      .select('*').eq('user_id', req.user.id).eq('date', today).maybeSingle();
    res.json(data || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/attendance/checkin', auth, async (req, res) => {
  try {
    const today   = localDateStr();
    const timeStr = localTimeStr();
    const settings = await getSettings();

    const { data: existing } = await supabase.from('attendance')
      .select('*').eq('user_id', req.user.id).eq('date', today).maybeSingle();

    if (existing?.check_in) return res.status(400).json({ error: 'Already checked in today' });

    const is_late = toMinutes(timeStr) > toMinutes(settings.late_threshold);

    let record;
    if (existing) {
      const { data } = await supabase.from('attendance')
        .update({ check_in: timeStr, status: 'present', is_late })
        .eq('id', existing.id).select().single();
      record = data;
    } else {
      const { data } = await supabase.from('attendance')
        .insert({ user_id: req.user.id, date: today, check_in: timeStr, status: 'present', is_late })
        .select().single();
      record = data;
    }
    res.json({ record, message: is_late ? 'Checked in (Late)' : 'Checked in successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/attendance/checkout', auth, async (req, res) => {
  try {
    const today   = localDateStr();
    const timeStr = localTimeStr();
    const settings = await getSettings();

    const { data: record } = await supabase.from('attendance')
      .select('*').eq('user_id', req.user.id).eq('date', today).maybeSingle();

    if (!record?.check_in) return res.status(400).json({ error: 'You have not checked in today' });
    if (record.check_out)  return res.status(400).json({ error: 'Already checked out today' });

    const workHours    = Math.max(0, (toMinutes(timeStr) - toMinutes(record.check_in)) / 60);
    const is_early_exit = toMinutes(timeStr) < toMinutes(settings.early_exit_threshold);
    const status       = workHours < settings.half_day_hours ? 'half_day' : 'present';

    const { data: updated } = await supabase.from('attendance')
      .update({ check_out: timeStr, work_hours: Math.round(workHours * 100) / 100, status, is_early_exit })
      .eq('id', record.id).select().single();

    const msgs = [];
    if (is_early_exit)        msgs.push('Early exit noted');
    if (status === 'half_day') msgs.push('Half day recorded');
    res.json({ record: updated, message: msgs.length ? msgs.join(', ') : 'Checked out successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/attendance/:id', auth, adminOnly, async (req, res) => {
  try {
    const { check_in, check_out, status, is_late, is_early_exit, notes } = req.body;
    const work_hours = check_in && check_out
      ? Math.max(0, (toMinutes(check_out) - toMinutes(check_in)) / 60) : 0;
    const { data } = await supabase.from('attendance')
      .update({ check_in, check_out, status, is_late: !!is_late, is_early_exit: !!is_early_exit, work_hours: Math.round(work_hours * 100) / 100, notes })
      .eq('id', req.params.id).select().single();
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/attendance/mark-absent', auth, adminOnly, async (req, res) => {
  try {
    const { user_id, date } = req.body;
    await supabase.from('attendance')
      .upsert({ user_id, date, status: 'absent' }, { onConflict: 'user_id,date' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin create or fully edit any attendance record
app.post('/api/attendance/admin-edit', auth, adminOnly, async (req, res) => {
  try {
    const { user_id, date, check_in, check_out, status, is_late, is_early_exit, notes } = req.body;
    if (!user_id || !date) return res.status(400).json({ error: 'user_id and date required' });
    const work_hours = check_in && check_out
      ? Math.max(0, (toMinutes(check_out) - toMinutes(check_in)) / 60) : 0;
    const { data, error } = await supabase.from('attendance')
      .upsert({
        user_id: parseInt(user_id), date,
        check_in:      check_in      || null,
        check_out:     check_out     || null,
        status:        status        || 'present',
        is_late:       !!is_late,
        is_early_exit: !!is_early_exit,
        work_hours:    Math.round(work_hours * 100) / 100,
        notes:         notes         || null,
      }, { onConflict: 'user_id,date' })
      .select().single();
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mark late come / early exit for an employee on a given date
app.post('/api/attendance/late-early', auth, adminOnly, async (req, res) => {
  try {
    const { user_id, date, late_come, late_come_time, early_exit, early_exit_time } = req.body;
    if (!user_id || !date) return res.status(400).json({ error: 'user_id and date are required' });

    // Fetch existing record for the day
    const { data: existing } = await supabase.from('attendance')
      .select('*').eq('user_id', user_id).eq('date', date).maybeSingle();

    const updates = {};
    if (late_come === 'yes' && late_come_time)  { updates.is_late      = true;  updates.check_in  = late_come_time;  }
    if (late_come === 'none')                    { updates.is_late      = false; }
    if (early_exit === 'yes' && early_exit_time){ updates.is_early_exit = true;  updates.check_out = early_exit_time; }
    if (early_exit === 'none')                   { updates.is_early_exit = false; }

    // Recalculate work hours if both times known
    const ci = updates.check_in  || existing?.check_in;
    const co = updates.check_out || existing?.check_out;
    if (ci && co) {
      const work_hours = Math.max(0, (toMinutes(co) - toMinutes(ci)) / 60);
      updates.work_hours = Math.round(work_hours * 100) / 100;
    }

    if (existing) {
      await supabase.from('attendance').update(updates).eq('id', existing.id);
    } else {
      // No record yet — create one with status present
      await supabase.from('attendance').insert({
        user_id, date,
        status: 'present',
        is_late:       updates.is_late      ?? false,
        is_early_exit: updates.is_early_exit ?? false,
        check_in:      updates.check_in  || null,
        check_out:     updates.check_out || null,
        work_hours:    updates.work_hours || 0,
      });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Return attendance records where is_late or is_early_exit, joined with user info
app.get('/api/attendance/late-early', auth, async (req, res) => {
  try {
    // Scope to employees only (never show admin in this list)
    const { data: empRows } = await supabase.from('users').select('id').eq('role', 'employee');
    const empIds = (empRows || []).map(e => e.id);

    let query = supabase.from('attendance')
      .select('*, users(name, email, avatar_color, department)')
      .or('is_late.eq.true,is_early_exit.eq.true')
      .in('user_id', empIds)
      .order('date', { ascending: false });

    // Optional date filter
    if (req.query.date) query = query.eq('date', req.query.date);

    // Employees see only their own records
    if (!isAdminRole(req.user.role)) query = query.eq('user_id', req.user.id);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const result = (data || []).map(r => ({ ...r, ...r.users, users: undefined }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update late/early flags on an existing attendance record
app.put('/api/attendance/late-early/:id', auth, adminOnly, async (req, res) => {
  try {
    const { late_come, late_come_time, early_exit, early_exit_time } = req.body;

    const { data: existing, error: fetchErr } = await supabase.from('attendance')
      .select('*').eq('id', req.params.id).single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Record not found' });

    const updates = {};
    if (late_come === 'yes' && late_come_time)   { updates.is_late       = true;  updates.check_in  = late_come_time;  }
    if (late_come === 'none')                     { updates.is_late       = false; updates.check_in  = null; }
    if (early_exit === 'yes' && early_exit_time) { updates.is_early_exit = true;  updates.check_out = early_exit_time; }
    if (early_exit === 'none')                   { updates.is_early_exit = false; updates.check_out = null; }

    const ci = updates.check_in  ?? existing.check_in;
    const co = updates.check_out ?? existing.check_out;
    if (ci && co) updates.work_hours = Math.round(Math.max(0, (toMinutes(co) - toMinutes(ci)) / 60) * 100) / 100;

    await supabase.from('attendance').update(updates).eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Clear late/early flags from an attendance record
app.delete('/api/attendance/late-early/:id', auth, adminOnly, async (req, res) => {
  try {
    const { data: existing } = await supabase.from('attendance')
      .select('*').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ error: 'Record not found' });

    await supabase.from('attendance')
      .update({ is_late: false, is_early_exit: false, check_in: null, check_out: null })
      .eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Leaves ───────────────────────────────────────────────────────────────────

// Check for date conflicts and return leave balance for the current user
app.get('/api/leaves/date-check', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

    // Check for existing pending/approved leaves on the selected dates for this user
    const { data: conflicts } = await supabase.from('leaves')
      .select('id, leave_type, status, start_date, end_date')
      .eq('user_id', req.user.id)
      .eq('organization_id', orgId(req))
      .in('status', ['pending', 'approved'])
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    // Check for Clockify attendance on those dates
    const { data: attendanceRecs } = await supabase.from('attendance')
      .select('date, clockify_hours, work_hours')
      .eq('user_id', req.user.id)
      .eq('organization_id', orgId(req))
      .gte('date', startDate)
      .lte('date', endDate)
      .gt('work_hours', 0);

    // Get leave balance per type (approved leaves this year)
    const year = new Date().getFullYear();
    const { data: approved } = await supabase.from('leaves')
      .select('leave_type, start_date, end_date, leave_time')
      .eq('user_id', req.user.id)
      .eq('organization_id', orgId(req))
      .eq('status', 'approved')
      .gte('start_date', `${year}-01-01`)
      .lte('end_date', `${year}-12-31`);

    // Count used days per type
    const usedByType = {};
    for (const l of approved || []) {
      if (!usedByType[l.leave_type]) usedByType[l.leave_type] = 0;
      if (l.leave_time === 'half') {
        usedByType[l.leave_type] += 0.5;
      } else if (l.leave_time !== 'wfh') {
        const s = new Date(l.start_date + 'T12:00:00');
        const e = new Date(l.end_date   + 'T12:00:00');
        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
          const dow = d.getDay();
          if (dow !== 0 && dow !== 6) usedByType[l.leave_type] += 1;
        }
      }
    }

    // Get org leave quota
    const { data: orgRow } = await supabase.from('organizations')
      .select('total_annual_leaves').eq('id', orgId(req)).maybeSingle();
    const totalAnnual = orgRow?.total_annual_leaves || 18;

    res.json({
      conflicts: conflicts || [],
      hasAttendance: (attendanceRecs || []).length > 0,
      usedByType,
      totalAnnual,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/leaves', auth, async (req, res) => {
  try {
    const { userId, year, month } = req.query;
    let query = supabase.from('leaves')
      .select('*, users!leaves_user_id_fkey(name, email, avatar_color, department), approver:users!leaves_approved_by_fkey(name)')
      .eq('organization_id', orgId(req))
      .order('created_at', { ascending: false });

    if (!isAdminRole(req.user.role)) {
      query = query.eq('user_id', req.user.id);
    } else if (userId) {
      query = query.eq('user_id', parseInt(userId));
    }
    if (year && month) {
      const ym = `${year}-${String(month).padStart(2,'0')}`;
      query = query.lte('start_date', `${ym}-31`).gte('end_date', `${ym}-01`);
    } else if (year) {
      query = query.lte('start_date', `${year}-12-31`).gte('end_date', `${year}-01-01`);
    } else if (req.query.startDate && req.query.endDate) {
      query = query.lte('start_date', req.query.endDate).gte('end_date', req.query.startDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const result = (data || []).map(l => ({
      ...l,
      ...l.users,
      approver_name: l.approver?.name,
      users:    undefined,
      approver: undefined,
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/leaves', auth, async (req, res) => {
  try {
    const { start_date, end_date, leave_type, reason, user_id, leave_time, half_type } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ error: 'Start and end dates required' });
    if (start_date > end_date)    return res.status(400).json({ error: 'Start date must be before end date' });

    // Admin can apply leave on behalf of any employee
    const targetUserId = (isAdminRole(req.user.role) && user_id) ? parseInt(user_id) : req.user.id;

    const { data, error } = await supabase.from('leaves')
      .insert({
        user_id: targetUserId, start_date, end_date,
        leave_type: leave_type||'casual', reason: reason||'',
        leave_time: leave_time||'full',
        half_type:  leave_time === 'half' ? (half_type||'first_half') : null,
        organization_id: orgId(req),
      })
      .select('*, users!leaves_user_id_fkey(name, email, department)').single();
    if (error) throw new Error(error.message);

    // Notify HR + company heads when an employee submits a leave request
    if (req.user.role === 'employee') {
      const emp = data.users || {};
      const recipients = await getRecipients(orgId(req));
      if (recipients.length > 0) {
        sendMail({
          to: recipients,
          subject: `Leave Request — ${emp.name || req.user.name} (${leave_type || 'casual'})`,
          html: leaveAppliedHtml(
            { name: emp.name || req.user.name, email: emp.email || req.user.email, department: emp.department || req.user.department },
            data
          ),
        });
      }
    }

    res.json(flatOne(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/leaves/:id', auth, async (req, res) => {
  try {
    const { data: leave } = await supabase.from('leaves').select('*').eq('id', req.params.id).maybeSingle();
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    if (!isAdminRole(req.user.role) && leave.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (leave.status === 'approved' && !isAdminRole(req.user.role)) return res.status(400).json({ error: 'Cannot edit an approved leave' });

    const { start_date, end_date, leave_type, reason, leave_time, half_type } = req.body;
    if (start_date && end_date && start_date > end_date) return res.status(400).json({ error: 'Start date must be before end date' });

    await supabase.from('leaves').update({
      ...(start_date && { start_date }),
      ...(end_date   && { end_date }),
      ...(leave_type && { leave_type }),
      reason: reason ?? leave.reason,
      leave_time: leave_time || leave.leave_time,
      half_type:  (leave_time || leave.leave_time) === 'half' ? (half_type || leave.half_type || 'first_half') : null,
    }).eq('id', req.params.id);

    const { data } = await supabase.from('leaves').select('*, users!leaves_user_id_fkey(name)').eq('id', req.params.id).single();
    res.json(flatOne(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/leaves/:id/approve', auth, adminOnly, async (req, res) => {
  try {
    const { data: leave, error: le } = await supabase.from('leaves').select('*').eq('id', req.params.id).single();
    if (le) return res.status(404).json({ error: 'Leave not found' });
    if (leave.status === 'approved') return res.json(leave); // already approved — skip duplicate email

    await supabase.from('leaves').update({ status: 'approved', approved_by: req.user.id, approved_at: new Date().toISOString() }).eq('id', req.params.id);

    // Mark attendance days as on_leave
    const settings = await getSettings(orgId(req));
    const start = new Date(leave.start_date + 'T12:00:00');
    const end   = new Date(leave.end_date   + 'T12:00:00');
    const upserts = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      if (isWorkingDay(ds, settings)) upserts.push({ user_id: leave.user_id, date: ds, status: leave.leave_time === 'half' ? 'half_day' : leave.leave_time === 'wfh' ? 'wfh' : 'on_leave', organization_id: orgId(req) });
    }
    if (upserts.length) await supabase.from('attendance').upsert(upserts, { onConflict: 'user_id,date,organization_id' });

    const { data } = await supabase.from('leaves').select('*, users!leaves_user_id_fkey(name, email)').eq('id', req.params.id).single();
    // Email the employee
    if (data.users?.email) {
      sendMail({ to: data.users.email, subject: 'Your Leave Request has been Approved — HR Tracker', html: leaveStatusHtml(data.users, leave, 'approved', req.user.name) });
    }
    // Sync to Google Calendar
    const gcalId = await gcal.createLeaveEvent(leave, data.users?.name || 'Employee');
    if (gcalId) await supabase.from('leaves').update({ google_event_id: gcalId }).eq('id', req.params.id);
    res.json(flatOne(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/leaves/:id/reject', auth, adminOnly, async (req, res) => {
  try {
    const { data: leave } = await supabase.from('leaves').select('*').eq('id', req.params.id).single();
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    if (leave.status === 'rejected') return res.json(leave); // already rejected — skip duplicate email
    await supabase.from('leaves').update({ status: 'rejected', approved_by: req.user.id, approved_at: new Date().toISOString(), google_event_id: null }).eq('id', req.params.id);
    // Remove from Google Calendar if it was synced
    if (leave.google_event_id) gcal.deleteLeaveEvent(leave.google_event_id);
    const { data } = await supabase.from('leaves').select('*, users!leaves_user_id_fkey(name, email)').eq('id', req.params.id).single();
    // Email the employee
    if (data.users?.email) {
      sendMail({ to: data.users.email, subject: 'Your Leave Request has been Rejected — Lumens HR', html: leaveStatusHtml(data.users, leave, 'rejected', req.user.name) });
    }
    res.json(flatOne(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Clean up attendance records with leave-based status but no approved leave backing them
app.post('/api/attendance/cleanup-orphaned', auth, async (req, res) => {
  try {
    const { data: leaveAttendance } = await supabase.from('attendance')
      .select('id, user_id, date, status')
      .in('status', ['on_leave', 'half_day', 'wfh']);

    if (!leaveAttendance?.length) return res.json({ removed: 0 });

    const { data: approvedLeaves } = await supabase.from('leaves')
      .select('user_id, start_date, end_date, leave_time')
      .eq('status', 'approved');

    const toDelete = [];
    for (const att of leaveAttendance) {
      const hasLeave = (approvedLeaves || []).some(l => {
        if (l.user_id !== att.user_id) return false;
        if (att.date < l.start_date || att.date > l.end_date) return false;
        const expected = l.leave_time === 'half' ? 'half_day' : l.leave_time === 'wfh' ? 'wfh' : 'on_leave';
        return att.status === expected;
      });
      if (!hasLeave) toDelete.push(att.id);
    }

    if (toDelete.length) await supabase.from('attendance').delete().in('id', toDelete);
    res.json({ removed: toDelete.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/leaves/:id', auth, async (req, res) => {
  try {
    const { data: leave } = await supabase.from('leaves').select('*').eq('id', req.params.id).maybeSingle();
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    if (!isAdminRole(req.user.role) && leave.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (leave.status === 'approved' && !isAdminRole(req.user.role)) return res.status(400).json({ error: 'Cannot cancel approved leave' });

    // If leave was approved, remove the attendance records that were created for those dates
    if (leave.status === 'approved') {
      const settings = await getSettings();
      const start = new Date(leave.start_date + 'T12:00:00');
      const end   = new Date(leave.end_date   + 'T12:00:00');
      const dates = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split('T')[0];
        if (isWorkingDay(ds, settings)) dates.push(ds);
      }
      if (dates.length) {
        await supabase.from('attendance')
          .delete()
          .eq('user_id', leave.user_id)
          .in('date', dates);
      }
    }

    // Delete Google Calendar event if leave was synced
    if (leave.google_event_id) gcal.deleteLeaveEvent(leave.google_event_id);

    await supabase.from('leaves').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Settings ─────────────────────────────────────────────────────────────────
app.get('/api/settings', auth, async (req, res) => {
  try {
    const { data: schedule } = await supabase.from('work_schedule').select('*').eq('organization_id', orgId(req)).limit(1).single();
    const clockify = await getClockifyConfig(orgId(req));
    res.json({ schedule, clockify: { workspace_id: clockify?.workspace_id || '', api_key: clockify?.api_key ? '***' : '' } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/settings', auth, adminOnly, async (req, res) => {
  try {
    const { start_time, end_time, late_threshold, early_exit_threshold, half_day_hours, work_days } = req.body;
    // Try to update existing; insert if none
    const { data: existing } = await supabase.from('work_schedule').select('id').eq('organization_id', orgId(req)).limit(1).maybeSingle();
    let data;
    if (existing) {
      const res2 = await supabase.from('work_schedule')
        .update({ start_time, end_time, late_threshold, early_exit_threshold, half_day_hours, work_days })
        .eq('id', existing.id).select().single();
      data = res2.data;
    } else {
      const res2 = await supabase.from('work_schedule')
        .insert({ start_time, end_time, late_threshold, early_exit_threshold, half_day_hours, work_days, organization_id: orgId(req) }).select().single();
      data = res2.data;
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/settings/clockify', auth, adminOnly, async (req, res) => {
  try {
    const { api_key, workspace_id } = req.body;
    const update = { clockify_workspace_id: workspace_id };
    if (api_key && api_key.trim() !== '') update.clockify_api_key = api_key.trim();
    await supabase.from('organizations').update(update).eq('id', orgId(req));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Clockify helpers ─────────────────────────────────────────────────────────
async function syncClockifyForDate(targetDate, config, settings) {
  // Use IST (UTC+5:30) midnight boundaries so the date range covers the correct calendar day
  const startISO = targetDate + 'T00:00:00+05:30';
  const endISO   = targetDate + 'T23:59:59+05:30';

  const { data: cUsersResp } = await axios.get(
    `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/users`,
    { headers: { 'X-Api-Key': config.api_key } }
  );
  const cUsers = cUsersResp?.data || cUsersResp || [];

  const results = [];
  for (const cUser of cUsers) {
    const { data: localUser } = await supabase.from('users').select('*').ilike('email', cUser.email).maybeSingle();
    if (!localUser) continue;

    const { data: entriesResp } = await axios.get(
      `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${cUser.id}/time-entries`,
      { headers: { 'X-Api-Key': config.api_key }, params: { start: startISO, end: endISO } }
    );
    const entries = entriesResp?.data || entriesResp || [];

    let totalSeconds = 0;
    let firstStart   = null;
    let lastEnd      = null;

    for (const e of entries) {
      const match = (e.timeInterval?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (match) totalSeconds += (parseInt(match[1]||0)*3600) + (parseInt(match[2]||0)*60) + parseInt(match[3]||0);
      if (e.timeInterval?.start) {
        const d   = new Date(e.timeInterval.start);
        const str = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        if (!firstStart || str < firstStart) firstStart = str;
      }
      if (e.timeInterval?.end) {
        const d   = new Date(e.timeInterval.end);
        const str = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        if (!lastEnd || str > lastEnd) lastEnd = str;
      }
    }
    const clockify_hours = Math.round((totalSeconds / 3600) * 100) / 100;

    const { data: existing } = await supabase.from('attendance')
      .select('id, check_in, check_out').eq('user_id', localUser.id).eq('date', targetDate).maybeSingle();

    if (existing) {
      const upd = { clockify_hours };
      if (!existing.check_in  && firstStart) { upd.check_in  = firstStart; upd.status = 'present'; }
      if (!existing.check_out && lastEnd)    upd.check_out = lastEnd;
      await supabase.from('attendance').update(upd).eq('id', existing.id);
    } else if (clockify_hours > 0 || firstStart) {
      const is_late = firstStart ? toMinutes(firstStart) > toMinutes(settings.late_threshold) : false;
      const work_hours = firstStart && lastEnd
        ? Math.max(0, Math.round((toMinutes(lastEnd) - toMinutes(firstStart)) / 60 * 100) / 100)
        : clockify_hours;
      await supabase.from('attendance').insert({
        user_id: localUser.id, date: targetDate, status: 'present',
        check_in: firstStart, check_out: lastEnd || null,
        is_late, work_hours, clockify_hours,
      });
    }
    results.push({ user: localUser.name, clockify_hours });
  }
  return results;
}

// ─── Clockify routes ──────────────────────────────────────────────────────────
app.get('/api/clockify/workspaces', auth, adminOnly, async (req, res) => {
  try {
    const config = await getClockifyConfig(orgId(req));
    if (!config?.api_key || config.api_key === '') return res.status(400).json({ error: 'Clockify API key not configured' });
    const response = await axios.get('https://api.clockify.me/api/v1/workspaces', { headers: { 'X-Api-Key': config.api_key } });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: 'Clockify error: ' + (err.response?.data?.message || err.message) }); }
});

// Live timers — who is currently tracking right now in Clockify
app.get('/api/clockify/live', auth, async (req, res) => {
  try {
    const config = await getClockifyConfig(orgId(req));
    if (!config?.api_key || config.api_key === '') return res.json({ timers: {} });

    const { data: employees } = await supabase.from('users')
      .select('id, clockify_user_id').eq('role', 'employee').eq('organization_id', orgId(req));

    const timers = {};
    await Promise.all((employees || []).map(async emp => {
      if (!emp.clockify_user_id) return;
      try {
        const resp = await axios.get(
          `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${emp.clockify_user_id}/time-entries`,
          { headers: { 'X-Api-Key': config.api_key }, params: { 'in-progress': true, 'page-size': 1 } }
        );
        const entries = resp.data || [];
        const active  = entries.find(e => !e.timeInterval?.end);
        timers[emp.id] = active
          ? { running: true,  start: active.timeInterval.start, description: active.description || '' }
          : { running: false };
      } catch { timers[emp.id] = { running: false }; }
    }));

    res.json({ timers });
  } catch (err) { res.json({ timers: {} }); }
});

// Fetch total hours per employee for a specific past date directly from Clockify
app.get('/api/clockify/day', auth, async (req, res) => {
  try {
    const config = await getClockifyConfig(orgId(req));
    if (!config?.api_key || !config?.workspace_id) return res.json({ hours: {} });

    const date     = req.query.date || localDateStr();
    const startISO = date + 'T00:00:00+05:30';
    const endISO   = date + 'T23:59:59+05:30';

    const { data: employees } = await supabase.from('users')
      .select('id, clockify_user_id').eq('role', 'employee').eq('organization_id', orgId(req));

    const hours = {};
    await Promise.all((employees || []).filter(e => e.clockify_user_id).map(async emp => {
      try {
        const resp = await axios.get(
          `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${emp.clockify_user_id}/time-entries`,
          { headers: { 'X-Api-Key': config.api_key }, params: { start: startISO, end: endISO, 'page-size': 50 } }
        );
        const entries = resp.data || [];
        let totalSeconds = 0;
        for (const e of entries) {
          const m = (e.timeInterval?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
          if (m) totalSeconds += (parseInt(m[1]||0)*3600) + (parseInt(m[2]||0)*60) + parseInt(m[3]||0);
        }
        if (totalSeconds > 0) hours[emp.id] = Math.round((totalSeconds / 3600) * 100) / 100;
      } catch { /* individual failure ok */ }
    }));

    res.json({ hours });
  } catch (err) { res.json({ hours: {} }); }
});

// Timeline: full list of Clockify time entries for a specific user + date (admin/HR only)
app.get('/api/clockify/user-entries', auth, adminOnly, async (req, res) => {
  try {
    const config = await getClockifyConfig(orgId(req));
    if (!config?.api_key || !config?.workspace_id) return res.json({ entries: [] });

    const { userId, date } = req.query;
    if (!userId || !date) return res.status(400).json({ error: 'userId and date required' });

    const { data: userRow } = await supabase.from('users')
      .select('clockify_user_id').eq('id', parseInt(userId)).eq('organization_id', orgId(req)).maybeSingle();
    if (!userRow?.clockify_user_id) return res.json({ entries: [] });

    const startISO = date + 'T00:00:00+05:30';
    const endISO   = date + 'T23:59:59+05:30';

    const resp = await axios.get(
      `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${userRow.clockify_user_id}/time-entries`,
      { headers: { 'X-Api-Key': config.api_key }, params: { start: startISO, end: endISO, 'page-size': 50 } }
    );

    const raw = resp.data || [];
    const entries = raw
      .filter(e => e.timeInterval?.start)
      .sort((a, b) => new Date(a.timeInterval.start) - new Date(b.timeInterval.start))
      .map(e => {
        const start = new Date(e.timeInterval.start);
        const end   = e.timeInterval.end ? new Date(e.timeInterval.end) : null;
        const fmt   = d => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        const durMatch = (e.timeInterval?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        const durSec = durMatch ? (parseInt(durMatch[1]||0)*3600 + parseInt(durMatch[2]||0)*60 + parseInt(durMatch[3]||0)) : 0;
        return {
          id:          e.id,
          description: e.description || '',
          start:       fmt(start),
          end:         end ? fmt(end) : null,
          durationMin: Math.round(durSec / 60),
        };
      });

    res.json({ entries });
  } catch (err) { res.json({ entries: [] }); }
});

// Employee self-service: get their own Clockify total hours per day for a month
// Uses the org's API key + the employee's clockify_user_id — no adminOnly required
app.get('/api/my-clockify-hours', auth, async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'year and month required' });

    // Get org Clockify config
    const config = await getClockifyConfig(orgId(req));
    if (!config?.api_key || !config?.workspace_id) return res.json({ hours: {} });

    // Get this user's clockify_user_id
    const { data: userRow } = await supabase.from('users')
      .select('clockify_user_id').eq('id', req.user.id).maybeSingle();
    if (!userRow?.clockify_user_id) return res.json({ hours: {} });

    const ym     = `${year}-${String(month).padStart(2, '0')}`;
    const startISO = `${ym}-01T00:00:00+05:30`;
    const lastDay  = new Date(parseInt(year), parseInt(month), 0).getDate();
    const endISO   = `${ym}-${String(lastDay).padStart(2, '0')}T23:59:59+05:30`;

    const resp = await axios.get(
      `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${userRow.clockify_user_id}/time-entries`,
      { headers: { 'X-Api-Key': config.api_key }, params: { start: startISO, end: endISO, 'page-size': 500 } }
    );

    const entries = resp.data || [];
    const hours   = {}; // date string → total hours

    for (const e of entries) {
      if (!e.timeInterval?.start) continue;
      const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(e.timeInterval.start));
      const m = (e.timeInterval?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!m) continue;
      const sec = (parseInt(m[1]||0)*3600) + (parseInt(m[2]||0)*60) + parseInt(m[3]||0);
      hours[dateStr] = Math.round(((hours[dateStr] || 0) + sec / 3600) * 100) / 100;
    }

    res.json({ hours });
  } catch (err) { res.json({ hours: {} }); }
});

app.post('/api/clockify/sync', auth, adminOnly, async (req, res) => {
  try {
    const config = await getClockifyConfig(orgId(req));
    if (!config?.api_key || !config?.workspace_id) return res.status(400).json({ error: 'Clockify API key and Workspace ID required' });

    const targetDate = req.body.date || new Date().toISOString().split('T')[0];
    const settings   = await getSettings(orgId(req));
    const results    = await syncClockifyForDate(targetDate, config, settings);

    await supabase.from('organizations').update({ clockify_last_synced: new Date().toISOString() }).eq('id', orgId(req));
    res.json({ success: true, synced: results.length, results });
  } catch (err) { res.status(500).json({ error: 'Clockify sync failed: ' + (err.response?.data?.message || err.message) }); }
});

// ─── Push Notifications ───────────────────────────────────────────────────────
app.post('/api/push/subscribe', auth, async (req, res) => {
  try {
    const { subscription, endpoint, userAgent } = req.body;
    if (!subscription || !endpoint) return res.status(400).json({ error: 'Subscription and endpoint required' });
    await supabase.from('push_subscriptions').upsert(
      { user_id: req.user.id, endpoint, subscription, user_agent: userAgent || null, organization_id: orgId(req) },
      { onConflict: 'user_id' }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/push/unsubscribe', auth, async (req, res) => {
  try {
    await supabase.from('push_subscriptions').delete().eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notifications/send', auth, adminOnly, async (req, res) => {
  try {
    const { title, body, url, target_user_id } = req.body;
    if (!title?.trim() || !body?.trim()) return res.status(400).json({ error: 'Title and body required' });
    const userIds = target_user_id ? [parseInt(target_user_id)] : null;
    const sent = await sendPushToUsers(userIds, { title: title.trim(), body: body.trim(), url: url || '/' });
    try {
      await supabase.from('notifications_log').insert({
        title: title.trim(), body: body.trim(), url: url || null,
        target_user_id: target_user_id ? parseInt(target_user_id) : null,
        sent_by: req.user.id, sent_count: sent || 0,
      });
    } catch { /* log insert failure is non-fatal */ }
    res.json({ success: true, sent: sent || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Root Admin: Send Email ───────────────────────────────────────────────────
app.post('/api/root/send-email', auth, adminOnly, async (req, res) => {
  try {
    const { subject, message, target_user_id } = req.body;
    if (!subject?.trim() || !message?.trim()) return res.status(400).json({ error: 'Subject and message required' });
    let recipients;
    if (target_user_id) {
      const { data: u } = await supabase.from('users').select('email').eq('id', parseInt(target_user_id)).single();
      if (!u) return res.status(404).json({ error: 'User not found' });
      recipients = [u.email];
    } else {
      const { data: users } = await supabase.from('users').select('email').neq('role', 'root_admin');
      recipients = (users || []).map(u => u.email).filter(Boolean);
    }
    const html = `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:linear-gradient(135deg,#3525cd,#4f46e5);border-radius:12px;padding:24px;margin-bottom:20px;">
        <h2 style="color:white;margin:0;font-size:20px;">📢 ${subject.trim()}</h2>
        <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:13px;">From Lumos Logic HR System</p>
      </div>
      <div style="background:#f8fafc;border-radius:12px;padding:20px;border:1px solid #e2e8f0;">
        <p style="color:#334155;line-height:1.7;margin:0;">${message.trim().replace(/\n/g, '<br/>')}</p>
      </div>
      <p style="color:#94a3b8;font-size:12px;margin-top:20px;text-align:center;">— Lumos Logic HR Management System</p>
    </div>`;
    for (const email of recipients) {
      sendMail({ to: email, subject: subject.trim(), html });
    }
    res.json({ success: true, sent: recipients.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Culture (Birthdays / Holidays / Events) ──────────────────────────────────
app.get('/api/culture', auth, async (req, res) => {
  try {
    const today    = localDateStr();
    const todayMD  = today.slice(5); // MM-DD

    // Upcoming 30 days
    const future30 = new Date(); future30.setDate(future30.getDate() + 30);
    const f30Str   = localDateStr(future30);

    // Birthdays from employees
    const { data: users } = await supabase.from('users')
      .select('id, name, avatar_color, department, date_of_birth').eq('role', 'employee').eq('organization_id', orgId(req));

    const birthdaysToday    = (users || []).filter(u => u.date_of_birth && u.date_of_birth.slice(5) === todayMD);
    const upcomingBirthdays = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const mm   = String(d.getMonth() + 1).padStart(2, '0');
      const dd   = String(d.getDate()).padStart(2, '0');
      const mmdd = `${mm}-${dd}`;
      const ds   = d.toISOString().split('T')[0];
      (users || []).filter(u => u.date_of_birth && u.date_of_birth.slice(5) === mmdd)
        .forEach(u => upcomingBirthdays.push({ ...u, birthday_date: ds, days_until: i }));
    }

    // Holidays & Events in next 30 days
    const [{ data: holidays }, { data: events }] = await Promise.all([
      supabase.from('holidays').select('*').eq('organization_id', orgId(req)).gte('date', today).lte('date', f30Str).order('date').limit(10),
      supabase.from('events').select('*').eq('organization_id', orgId(req)).gte('date', today).lte('date', f30Str).order('date').limit(10),
    ]);

    res.json({ birthdaysToday: birthdaysToday || [], upcomingBirthdays, holidays: holidays || [], events: events || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/my-stats', auth, async (req, res) => {
  try {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth() + 1;
    const ym    = `${year}-${String(month).padStart(2, '0')}`;
    const [{ data: att }, { data: lvs }] = await Promise.all([
      supabase.from('attendance').select('status, is_late').eq('user_id', req.user.id).eq('organization_id', orgId(req)).like('date', `${ym}-%`),
      supabase.from('leaves').select('id').eq('user_id', req.user.id).eq('organization_id', orgId(req)).eq('status', 'approved')
        .lte('start_date', `${ym}-31`).gte('end_date', `${ym}-01`),
    ]);
    const presentCount = (att || []).filter(r => ['present','half_day','wfh'].includes(r.status)).length;
    const leavesCount  = (lvs || []).length;
    const lateCount    = (att || []).filter(r => r.is_late).length;
    res.json({ presentCount, leavesCount, lateCount, month, year });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Holidays CRUD ────────────────────────────────────────────────────────────
app.get('/api/holidays', auth, async (req, res) => {
  const { data } = await supabase.from('holidays').select('*').eq('organization_id', orgId(req)).order('date');
  res.json(data || []);
});
app.post('/api/holidays', auth, adminOnly, async (req, res) => {
  try {
    const { name, date, type, description, specific_msg } = req.body;
    if (!name || !date) return res.status(400).json({ error: 'Name and date required' });
    const { data, error } = await supabase.from('holidays').insert({ name, date, type: type||'public', description: description||'', specific_msg: specific_msg||null, organization_id: orgId(req) }).select().single();
    if (error) throw new Error(error.message);
    const gcalId = await gcal.createHolidayEvent(data);
    if (gcalId) await supabase.from('holidays').update({ google_event_id: gcalId }).eq('id', data.id);
    res.json({ ...data, google_event_id: gcalId || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/holidays/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, date, type, description, specific_msg } = req.body;
    const { data: existing } = await supabase.from('holidays').select('google_event_id').eq('id', req.params.id).maybeSingle();
    const { data } = await supabase.from('holidays').update({ name, date, type, description, specific_msg: specific_msg||null }).eq('id', req.params.id).select().single();
    if (existing?.google_event_id) gcal.updateHolidayEvent(existing.google_event_id, data);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/holidays/:id', auth, adminOnly, async (req, res) => {
  try {
    const { data: existing } = await supabase.from('holidays').select('google_event_id').eq('id', req.params.id).maybeSingle();
    if (existing?.google_event_id) gcal.deleteHolidayEvent(existing.google_event_id);
    await supabase.from('holidays').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Events CRUD ──────────────────────────────────────────────────────────────
app.get('/api/events', auth, async (req, res) => {
  const { data } = await supabase.from('events').select('*').eq('organization_id', orgId(req)).order('date');
  res.json(data || []);
});
app.post('/api/events', auth, adminOnly, async (req, res) => {
  try {
    const { title, date, end_date, description } = req.body;
    if (!title || !date) return res.status(400).json({ error: 'Title and date required' });
    const { data, error } = await supabase.from('events').insert({ title, date, end_date: end_date||null, description: description||'', created_by: req.user.id, organization_id: orgId(req) }).select().single();
    if (error) throw new Error(error.message);
    const gcalId = await gcal.createCompanyEvent(data);
    if (gcalId) await supabase.from('events').update({ google_event_id: gcalId }).eq('id', data.id);
    res.json({ ...data, google_event_id: gcalId || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.put('/api/events/:id', auth, adminOnly, async (req, res) => {
  try {
    const { title, date, end_date, description } = req.body;
    const { data: existing } = await supabase.from('events').select('google_event_id').eq('id', req.params.id).maybeSingle();
    const { data } = await supabase.from('events').update({ title, date, end_date: end_date||null, description }).eq('id', req.params.id).select().single();
    if (existing?.google_event_id) gcal.updateCompanyEvent(existing.google_event_id, data);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.delete('/api/events/:id', auth, adminOnly, async (req, res) => {
  try {
    const { data: existing } = await supabase.from('events').select('google_event_id').eq('id', req.params.id).maybeSingle();
    if (existing?.google_event_id) gcal.deleteCompanyEvent(existing.google_event_id);
    await supabase.from('events').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Analytics ───────────────────────────────────────────────────────────────
app.get('/api/analytics', auth, adminOnly, async (req, res) => {
  try {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth() + 1;
    const ym    = `${year}-${String(month).padStart(2, '0')}`;

    const [{ data: allLeaves }, { data: monthAtt }] = await Promise.all([
      supabase.from('leaves').select('status, leave_type').eq('organization_id', orgId(req)),
      supabase.from('attendance').select('status').eq('organization_id', orgId(req)).like('date', `${ym}-%`),
    ]);

    const leaveByStatus = { approved: 0, pending: 0, rejected: 0, cancelled: 0 };
    (allLeaves || []).forEach(l => { if (leaveByStatus[l.status] !== undefined) leaveByStatus[l.status]++; });

    const leaveByType = {};
    (allLeaves || []).forEach(l => { leaveByType[l.leave_type] = (leaveByType[l.leave_type] || 0) + 1; });

    const attByStatus = { present: 0, on_leave: 0, absent: 0, wfh: 0, half_day: 0 };
    (monthAtt || []).forEach(r => { if (attByStatus[r.status] !== undefined) attByStatus[r.status]++; });

    res.json({ leaveByStatus, leaveByType, attByStatus, month, year });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Leave Balance ────────────────────────────────────────────────────────────
app.get('/api/leave-balance', auth, async (req, res) => {
  try {
    const year   = parseInt(req.query.year) || new Date().getFullYear();
    const userId = (isAdminRole(req.user.role) && req.query.userId)
      ? parseInt(req.query.userId)
      : req.user.id;

    const { data: approvedLeaves } = await supabase.from('leaves')
      .select('start_date, end_date, leave_time, leave_type')
      .eq('user_id', userId).eq('organization_id', orgId(req))
      .eq('status', 'approved')
      .gte('start_date', `${year}-01-01`)
      .lte('end_date',   `${year}-12-31`);

    const { count: totalHolidays } = await supabase.from('holidays')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId(req))
      .like('date', `${year}-%`);

    let usedLeaveDays = 0;
    for (const l of approvedLeaves || []) {
      if (l.leave_time === 'wfh') continue;
      if (l.leave_time === 'half') {
        usedLeaveDays += 0.5;
      } else {
        const start = new Date(l.start_date + 'T12:00:00');
        const end   = new Date(l.end_date   + 'T12:00:00');
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dow = d.getDay();
          if (dow !== 0 && dow !== 6) usedLeaveDays++;
        }
      }
    }

    res.json({
      userId, year,
      totalLeaves:     18,
      usedLeaves:      usedLeaveDays,
      remainingLeaves: Math.max(0, 18 - usedLeaveDays),
      totalHolidays:   12,
      usedHolidays:    Math.min(totalHolidays || 0, 12),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Root Admin ───────────────────────────────────────────────────────────────

// System-wide stats for root admin overview
app.get('/api/root/stats', auth, rootAdminOnly, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [
      { count: totalEmployees },
      { count: totalHR },
      { count: pendingLeaves },
      { count: presentToday },
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'employee').eq('organization_id', orgId(req)),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'admin').eq('organization_id', orgId(req)),
      supabase.from('leaves').select('*', { count: 'exact', head: true }).eq('status', 'pending').eq('organization_id', orgId(req)),
      supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('date', today).eq('organization_id', orgId(req)).in('status', ['present', 'half_day', 'wfh']),
    ]);

    const { data: recentLeavesRaw } = await supabase.from('leaves')
      .select('*, users!leaves_user_id_fkey(name, email, department, avatar_color)')
      .eq('organization_id', orgId(req))
      .order('created_at', { ascending: false }).limit(8);

    const { data: hrAdmins } = await supabase.from('users')
      .select('id, name, email, department, position, avatar_color, created_at')
      .eq('role', 'admin').eq('organization_id', orgId(req)).order('name');

    res.json({
      totalEmployees, totalHR, pendingLeaves, presentToday,
      recentLeaves: flat(recentLeavesRaw),
      hrAdmins: hrAdmins || [],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Yearly leave summary for all employees
app.get('/api/root/yearly-leaves', auth, rootAdminOnly, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    // Get total leaves from org settings (default 18)
    const { data: orgRow } = await supabase.from('organizations').select('total_annual_leaves').eq('id', orgId(req)).single();
    const TOTAL_LEAVES = orgRow?.total_annual_leaves || 18;

    const [{ data: employees }, { data: leaves }] = await Promise.all([
      supabase.from('users')
        .select('id, name, department, position, avatar_color')
        .eq('role', 'employee').eq('organization_id', orgId(req))
        .order('name'),
      supabase.from('leaves')
        .select('user_id, start_date, end_date, leave_type, leave_time, status')
        .eq('status', 'approved').eq('organization_id', orgId(req))
        .lte('start_date', `${year}-12-31`)
        .gte('end_date',   `${year}-01-01`),
    ]);

    const yearStart = new Date(`${year}-01-01T12:00:00`);
    const yearEnd   = new Date(`${year}-12-31T12:00:00`);

    const fmtIST = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

    const result = (employees || []).map(emp => {
      const empLeaves = (leaves || []).filter(l => l.user_id === emp.id);
      let usedDays = 0;
      const countedDays = new Set(); // prevent double-counting overlapping leaves
      const byType = {};

      for (const l of empLeaves) {
        if (l.leave_time === 'wfh') continue;
        const start = new Date(Math.max(new Date(l.start_date + 'T12:00:00'), yearStart));
        const end   = new Date(Math.min(new Date(l.end_date   + 'T12:00:00'), yearEnd));
        if (start > end) continue;

        if (l.leave_time === 'half') {
          const ds = fmtIST(start);
          if (!countedDays.has(ds)) {
            usedDays += 0.5;
            countedDays.add(ds);
          }
        } else {
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dow = d.getDay();
            if (dow !== 0 && dow !== 6) {
              const ds = fmtIST(d);
              if (!countedDays.has(ds)) {
                usedDays++;
                countedDays.add(ds);
              }
            }
          }
        }
        byType[l.leave_type] = (byType[l.leave_type] || 0) + 1;
      }

      return {
        ...emp,
        usedDays,
        remainingDays: Math.max(0, TOTAL_LEAVES - usedDays),
        totalDays: TOTAL_LEAVES,
        byType,
      };
    });

    res.json({ employees: result, year, totalLeaves: TOTAL_LEAVES });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List HR admins
app.get('/api/root/hr', auth, rootAdminOnly, async (req, res) => {
  try {
    const { data } = await supabase.from('users')
      .select('id, name, email, department, position, avatar_color, created_at')
      .eq('role', 'admin').eq('organization_id', orgId(req)).order('name');
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create HR admin
app.post('/api/root/hr', auth, rootAdminOnly, async (req, res) => {
  try {
    const { name, email, password, department, position, avatar_color } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
    const hashed = bcrypt.hashSync(password, 10);
    const { data, error } = await supabase.from('users')
      .insert({ name, email: email.toLowerCase(), password: hashed, role: 'admin', department: department||'Human Resources', position: position||'HR Manager', avatar_color: avatar_color||'#3525cd', force_password_change: true, organization_id: orgId(req) })
      .select('id, name, email, role, department, position, avatar_color').single();
    if (error?.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    if (error) throw new Error(error.message);
    sendMail({ to: email, subject: 'Welcome to Lumens HR — Your HR Admin Account', html: welcomeEmployeeHtml({ name, email, department: department||'Human Resources', position: position||'HR Manager' }, password) });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update HR admin
app.put('/api/root/hr/:id', auth, rootAdminOnly, async (req, res) => {
  try {
    const { name, email, department, position, avatar_color, password } = req.body;
    const update = { name, department, position, avatar_color };
    if (email) update.email = email.toLowerCase();
    if (password) update.password = bcrypt.hashSync(password, 10);
    const { data, error } = await supabase.from('users').update(update)
      .eq('id', req.params.id).eq('organization_id', orgId(req))
      .select('id, name, email, role, department, position, avatar_color').single();
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete HR admin
app.delete('/api/root/hr/:id', auth, rootAdminOnly, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await supabase.from('users').delete().eq('id', req.params.id).eq('role', 'admin').eq('organization_id', orgId(req));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List root admins of this org
app.get('/api/root/root-admins', auth, rootAdminOnly, async (req, res) => {
  try {
    const { data } = await supabase.from('users')
      .select('id, name, email, department, position, avatar_color, created_at')
      .eq('role', 'root_admin').eq('organization_id', orgId(req)).order('name');
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Notification Recipients (Root Admin) ─────────────────────────────────────
app.get('/api/root/notify-recipients', auth, rootAdminOnly, async (req, res) => {
  try {
    const { data } = await supabase.from('notification_recipients')
      .select('*').eq('organization_id', orgId(req)).order('created_at', { ascending: true });
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/root/notify-recipients', auth, rootAdminOnly, async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const { data, error } = await supabase.from('notification_recipients')
      .insert({ email: email.toLowerCase().trim(), name: name || '', organization_id: orgId(req) })
      .select().single();
    if (error?.code === '23505') return res.status(400).json({ error: 'Email already in the list' });
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/root/notify-recipients/:id', auth, rootAdminOnly, async (req, res) => {
  try {
    const { active, name } = req.body;
    const { data, error } = await supabase.from('notification_recipients')
      .update({ ...(active !== undefined && { active }), ...(name !== undefined && { name }) })
      .eq('id', req.params.id).eq('organization_id', orgId(req)).select().single();
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/root/notify-recipients/:id', auth, rootAdminOnly, async (req, res) => {
  try {
    await supabase.from('notification_recipients').delete().eq('id', req.params.id).eq('organization_id', orgId(req));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Daily Cron Scheduler ─────────────────────────────────────────────────────
function scheduleDailyAt(hour, minute, fn) {
  function msUntil() {
    const now  = new Date();
    const next = new Date();
    // setHours uses local (IST after TZ=Asia/Kolkata) so this fires at the correct IST time
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }
  function tick() {
    fn().catch(e => console.error('[Cron] Error:', e.message));
    setTimeout(tick, msUntil());
  }
  setTimeout(tick, msUntil());
}

async function runDailyNotifications() {
  const today    = localDateStr();
  const todayMD  = today.slice(5);
  const tmrDate  = new Date(); tmrDate.setDate(tmrDate.getDate() + 1);
  const tmrStr   = localDateStr(tmrDate);
  const tomorrowMD = `${String(tmrDate.getMonth()+1).padStart(2,'0')}-${String(tmrDate.getDate()).padStart(2,'0')}`;

  const { data: employees } = await supabase.from('users')
    .select('id, name, email, department, date_of_birth').eq('role', 'employee');

  // Birthday wishes to employees whose birthday is today
  for (const emp of employees || []) {
    if (emp.date_of_birth && emp.date_of_birth.slice(5) === todayMD) {
      if (emp.email) {
        sendMail({ to: emp.email, subject: `Happy Birthday, ${emp.name}! 🎂`, html: birthdayWishHtml(emp) });
      }
      // Push notification on their device
      await sendPushToUsers([emp.id], {
        title: `🎂 Happy Birthday, ${emp.name}!`,
        body:  `Wishing you a wonderful birthday filled with joy and happiness! 🎉`,
        url:   '/portal/home',
      }).catch(() => {});
    }
  }

  // Birthday reminder to HR for tomorrow's birthdays
  const birthdaysTmr = (employees || []).filter(e => e.date_of_birth && e.date_of_birth.slice(5) === tomorrowMD);
  if (birthdaysTmr.length > 0) {
    const hrList = await getRecipients();
    if (hrList.length) {
      sendMail({
        to: hrList,
        subject: `Birthday Reminder — ${birthdaysTmr.map(e => e.name).join(', ')}`,
        html: birthdayReminderHtml(birthdaysTmr),
      });
    }
  }

  // Holiday reminder to all employees for tomorrow's holidays
  const { data: tmrHolidays } = await supabase.from('holidays').select('*').eq('date', tmrStr);
  if (tmrHolidays?.length) {
    const allEmails  = (employees || []).map(e => e.email).filter(Boolean);
    const hrEmails   = await getRecipients();
    const recipients = [...new Set([...allEmails, ...hrEmails])];
    for (const holiday of tmrHolidays) {
      if (recipients.length) {
        sendMail({ to: recipients, subject: `Tomorrow is a Holiday — ${holiday.name}`, html: holidayReminderHtml(holiday) });
      }
      // Push notification to all employees
      await sendPushToUsers(null, {
        title: `🏖️ Tomorrow is a Holiday — ${holiday.name}`,
        body:  holiday.specific_msg || holiday.description || `Enjoy the ${holiday.name} holiday tomorrow!`,
        url:   '/portal/home',
      }).catch(() => {});
    }
  }

  console.log(`[Cron] Daily notifications sent for ${today}`);
}

// Clockify syncs every 10 minutes between 8 AM – 10 PM IST
function startClockifyIntervalSync() {
  async function trySync() {
    const hour = new Date().getHours(); // IST after TZ setting
    if (hour < 8 || hour >= 22) return;
    try {
      const { data: config } = await supabase.from('clockify_config').select('*').limit(1).maybeSingle();
      if (!config?.api_key || !config?.workspace_id) return;
      const targetDate = localDateStr();
      const settings   = await getSettings();
      const results    = await syncClockifyForDate(targetDate, config, settings);
      await supabase.from('clockify_config').update({ last_synced: new Date().toISOString() }).eq('id', config.id);
      if (results.length > 0) console.log(`[Clockify] Synced ${results.length} users for ${targetDate}`);
    } catch (err) {
      console.error('[Clockify] Interval sync failed:', err.message);
    }
  }
  trySync();
  setInterval(trySync, 10 * 60 * 1000); // every 10 minutes
}

// ─── HRMS Extended Routes ─────────────────────────────────────────────────────
const departmentsRouter   = require('./routes/departments');
const designationsRouter  = require('./routes/designations');
const holidaysRouter      = require('./routes/holidays');
const leavePoliciesRouter = require('./routes/leavePolicies');
const regularizationRouter= require('./routes/regularization');
const notificationsRouter = require('./routes/notifications');
const reportsRouter       = require('./routes/reports');
const documentsRouter     = require('./routes/documents');
const payrollRouter       = require('./routes/payroll');
const assetsRouter        = require('./routes/assets');
const expensesRouter      = require('./routes/expenses');
const announcementsRouter = require('./routes/announcements');
const shiftsRouter        = require('./routes/shifts');
const performanceRouter   = require('./routes/performance');
const onboardingRouter    = require('./routes/onboarding');
const exitRouter          = require('./routes/exitManagement');

app.use('/api/departments',    auth, departmentsRouter);
app.use('/api/designations',   auth, designationsRouter);
app.use('/api/holidays',       auth, holidaysRouter);
app.use('/api/leave-policies', auth, leavePoliciesRouter);
app.use('/api/regularization', auth, regularizationRouter);
app.use('/api/notifications',  auth, notificationsRouter);
app.use('/api/reports',        auth, adminOnly, reportsRouter);
app.use('/api/documents',      auth, documentsRouter);
app.use('/api/payroll',        auth, payrollRouter);
app.use('/api/assets',         auth, assetsRouter);
app.use('/api/expenses',       auth, expensesRouter);
app.use('/api/announcements',  auth, announcementsRouter);
app.use('/api/shifts',         auth, shiftsRouter);
app.use('/api/performance',    auth, performanceRouter);
app.use('/api/onboarding',     auth, onboardingRouter);
app.use('/api/exit',           auth, exitRouter);

// ─── Frontend fallback (must be AFTER all API routes) ────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await seed();
    app.listen(PORT, () => {
      console.log(`\n🚀 Lumens HR v${SERVER_VERSION} running at http://localhost:${PORT}\n`);
    });
    scheduleDailyAt(8, 0, runDailyNotifications);  // 8 AM IST — birthday wishes & holiday reminders
    startClockifyIntervalSync();                    // every 10 min, 8 AM – 10 PM IST
  } catch (err) {
    console.error('Failed to start:', err.message);
    process.exit(1);
  }
}

start();
