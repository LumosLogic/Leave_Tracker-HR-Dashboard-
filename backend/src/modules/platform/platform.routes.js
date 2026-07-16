const express = require('express');
const router  = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { supabase } = require('../../config/db');
const { JWT_SECRET, platformAdminAuth } = require('../../middleware/auth');
const { sendMail, orgApprovedHtml, orgRejectedHtml } = require('../../services/emailService');

// ─── All Feature Keys ─────────────────────────────────────────────────────────
const ALL_FEATURE_KEYS = [
  'announcements','regularization','leave_policies','shifts','onboarding',
  'exit_management','payroll','expenses','assets','reports',
  'performance','documents','clockify','google_calendar','push_notifications',
];

// Plan → feature preset map
const PLAN_FEATURES = {
  free:     { announcements: true, documents: true, regularization: false, leave_policies: false, shifts: false, onboarding: false, exit_management: false, payroll: false, expenses: false, assets: false, reports: false, performance: false, clockify: false, google_calendar: false, push_notifications: false },
  gold:     { announcements: true, documents: true, regularization: true, leave_policies: true, shifts: true, reports: true, performance: true, payroll: true, onboarding: false, exit_management: false, expenses: false, assets: false, clockify: false, google_calendar: false, push_notifications: false },
  platinum: Object.fromEntries(['announcements','regularization','leave_policies','shifts','onboarding','exit_management','payroll','expenses','assets','reports','performance','documents','clockify','google_calendar','push_notifications'].map(k => [k, true])),
};

// ─── Platform Admin: Login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const { data: admin } = await supabase.from('platform_admins')
      .select('*').eq('email', email.toLowerCase().trim()).maybeSingle();
    if (!admin || !bcrypt.compareSync(password, admin.password))
      return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { id: admin.id, email: admin.email, name: admin.name, role: 'platform_admin' },
      JWT_SECRET, { expiresIn: '7d' }
    );
    res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin: Stats ────────────────────────────────────────────────────
router.get('/stats', platformAdminAuth, async (req, res) => {
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

    // Plan distribution
    const { data: allOrgs } = await supabase.from('organizations').select('plan, status, created_at');
    const planDist = {};
    const statusDist = {};
    (allOrgs || []).forEach(o => {
      const p = (o.plan || 'free').toLowerCase();
      planDist[p]   = (planDist[p] || 0) + 1;
      const s = o.status || 'active';
      statusDist[s] = (statusDist[s] || 0) + 1;
    });

    // Monthly org growth — last 6 months
    const monthlyGrowth = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
      const count = (allOrgs || []).filter(o => o.created_at && o.created_at.startsWith(`${y}-${m}`)).length;
      monthlyGrowth.push({ label, count });
    }

    res.json({
      totalOrgs: totalOrgs || 0, pendingRequests: pendingReqs || 0,
      totalUsers: totalUsers || 0, approvedOrgs: approvedOrgs || 0,
      recentOrgs: recentOrgs || [], recentRequests: recentRequests || [],
      planDistribution: planDist, statusDistribution: statusDist, monthlyGrowth,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin: All Organizations ───────────────────────────────────────
router.get('/organizations', platformAdminAuth, async (req, res) => {
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

// ─── Platform Admin: Organization Members & Details ───────────────────────────
router.get('/organizations/:id/members', platformAdminAuth, async (req, res) => {
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

// ─── Platform Admin: Get Feature Flags for an Org ────────────────────────────
router.get('/organizations/:id/features', platformAdminAuth, async (req, res) => {
  try {
    const orgId = parseInt(req.params.id);
    const { data } = await supabase.from('organization_features')
      .select('feature_key, enabled').eq('organization_id', orgId);
    const map = {};
    for (const row of data || []) map[row.feature_key] = row.enabled;
    // Fill missing keys with default true
    const flags = {};
    for (const key of ALL_FEATURE_KEYS) flags[key] = key in map ? map[key] : true;
    res.json(flags);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin: Update Feature Flags for an Org ─────────────────────────
router.put('/organizations/:id/features', platformAdminAuth, async (req, res) => {
  try {
    const orgId = parseInt(req.params.id);
    const updates = req.body; // { payroll: true, expenses: false, ... }
    const upserts = Object.entries(updates)
      .filter(([key]) => ALL_FEATURE_KEYS.includes(key))
      .map(([feature_key, enabled]) => ({
        organization_id: orgId,
        feature_key,
        enabled: Boolean(enabled),
        updated_at: new Date().toISOString(),
      }));
    if (upserts.length) {
      await supabase.from('organization_features')
        .upsert(upserts, { onConflict: 'organization_id,feature_key' });
    }
    res.json({ success: true, updated: upserts.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin: Update Org Plan (apply preset feature flags) ─────────────
router.patch('/organizations/:id/plan', platformAdminAuth, async (req, res) => {
  try {
    const orgId = parseInt(req.params.id);
    const { plan } = req.body;
    const planKey = (plan || '').toLowerCase();
    if (!PLAN_FEATURES[planKey]) return res.status(400).json({ error: 'Invalid plan. Use free, gold, or platinum.' });
    await supabase.from('organizations').update({ plan }).eq('id', orgId);
    const featureMap = PLAN_FEATURES[planKey];
    const upserts = Object.entries(featureMap).map(([feature_key, enabled]) => ({
      organization_id: orgId, feature_key, enabled, updated_at: new Date().toISOString(),
    }));
    await supabase.from('organization_features').upsert(upserts, { onConflict: 'organization_id,feature_key' });
    res.json({ success: true, plan, featuresApplied: upserts.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin: Registration Requests ───────────────────────────────────
router.get('/requests', platformAdminAuth, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    let q = supabase.from('org_registration_requests').select('*').order('created_at', { ascending: false });
    if (status !== 'all') q = q.eq('status', status);
    const { data } = await q;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin: Approve Request ─────────────────────────────────────────
router.post('/requests/:id/approve', platformAdminAuth, async (req, res) => {
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
router.post('/requests/:id/reject', platformAdminAuth, async (req, res) => {
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
router.get('/activity', platformAdminAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const orgId  = req.query.orgId ? parseInt(req.query.orgId) : null;
    let query = supabase.from('platform_activity').select('*').order('created_at', { ascending: false }).limit(limit);
    if (orgId) query = query.eq('organization_id', orgId);
    const { data } = await query;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
