const express = require('express');
const router  = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { supabase } = require('../../config/db');
const { pool }     = require('../../config/db-pg-adapter');
const { JWT_SECRET, platformAdminAuth } = require('../../middleware/auth');
const { sendMail, orgApprovedHtml, orgRejectedHtml } = require('../../services/emailService');
const { generateUniqueSlug } = require('../../utils/helpers');
const { seedSystemRolesForOrg } = require('../../services/permissionService');

// ─── All Feature Keys ─────────────────────────────────────────────────────────
const ALL_FEATURE_KEYS = [
  'announcements','regularization','leave_policies','shifts','onboarding',
  'exit_management','payroll','expenses','assets','reports',
  'performance','documents','google_calendar','push_notifications',
  'biometric','branches','statutory',
];

// Features that are off by default; only enabled when plan explicitly includes them
const BIOMETRIC_FEATURES = ['biometric', 'branches', 'statutory'];

// Plan → feature preset map (platinum now includes biometric suite)
const PLAN_FEATURES = {
  free:     { announcements: true, documents: true, regularization: false, leave_policies: false, shifts: false, onboarding: false, exit_management: false, payroll: false, expenses: false, assets: false, reports: false, performance: false, google_calendar: false, push_notifications: false, biometric: false, branches: false, statutory: false },
  gold:     { announcements: true, documents: true, regularization: true, leave_policies: true, shifts: true, reports: true, performance: true, payroll: true, onboarding: false, exit_management: false, expenses: false, assets: false, google_calendar: false, push_notifications: false, biometric: false, branches: false, statutory: false },
  platinum: Object.fromEntries(ALL_FEATURE_KEYS.map(k => [k, true])),
};

// Orgs that cannot be deleted (platform-owner orgs)
const PROTECTED_ORG_SLUGS = ['lumoslogic', 'sanghavi-association'];

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
      const count = (allOrgs || []).filter(o => {
        if (!o.created_at) return false;
        const d = new Date(o.created_at);
        return d.getFullYear() === y && d.getMonth() + 1 === parseInt(m, 10);
      }).length;
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
      .select('id, name, slug, domain, status, plan, created_at, google_calendar_id, total_annual_leaves')
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
    const [{ data: orgRow }, { data: featureRows }] = await Promise.all([
      supabase.from('organizations').select('plan').eq('id', orgId).maybeSingle(),
      supabase.from('organization_features').select('feature_key, enabled').eq('organization_id', orgId),
    ]);
    const plan = (orgRow?.plan || 'free').toLowerCase();
    const map = {};
    for (const row of featureRows || []) map[row.feature_key] = row.enabled;
    // Biometric features default off except for Platinum orgs that have no explicit flag
    const flags = {};
    for (const key of ALL_FEATURE_KEYS) {
      if (key in map) {
        flags[key] = map[key];
      } else if (BIOMETRIC_FEATURES.includes(key)) {
        flags[key] = plan === 'platinum';
      } else {
        flags[key] = true;
      }
    }
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
    // Auto-delete rejected requests older than 7 days
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('org_registration_requests')
      .delete().eq('status', 'rejected').lt('reviewed_at', cutoff);

    const status = req.query.status || 'pending';
    let q = supabase.from('org_registration_requests').select('*').order('created_at', { ascending: false });
    if (status !== 'all') q = q.eq('status', status);
    const { data } = await q;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Platform Admin: Delete a Registration Request ────────────────────────────
// Allowed for rejected or pending requests; approved requests are blocked.
router.delete('/requests/:id', platformAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { data: request } = await supabase.from('org_registration_requests')
      .select('id, status, company_name').eq('id', id).maybeSingle();
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status === 'approved') {
      return res.status(400).json({ error: 'Approved requests cannot be deleted — they have an active organization linked to them.' });
    }
    await supabase.from('org_registration_requests').delete().eq('id', id);
    res.json({ ok: true, deleted: request.company_name });
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

    // Collision-safe slug — never reuses an existing slug
    const slug = await generateUniqueSlug(request.company_name);

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

    // Seed RBAC system roles for the new org (fire-and-forget — non-critical)
    seedSystemRolesForOrg(org.id, user.id).catch(err =>
      console.error('[platform] seedSystemRolesForOrg failed for org', org.id, err.message)
    );

    // Seed default feature flags — biometric suite OFF by default on free plan
    const defaultFeatureFlags = ALL_FEATURE_KEYS.map(key => ({
      organization_id: org.id,
      feature_key: key,
      enabled: !BIOMETRIC_FEATURES.includes(key), // biometric/branches/statutory = false
      updated_at: new Date().toISOString(),
    }));
    await supabase.from('organization_features')
      .upsert(defaultFeatureFlags, { onConflict: 'organization_id,feature_key' });

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

// ─── Platform Admin: Delete Organization (cascade) ───────────────────────────
// Permanently deletes an org and ALL its data. Protected orgs are blocked.
router.delete('/organizations/:id', platformAdminAuth, async (req, res) => {
  const orgId = parseInt(req.params.id);
  if (isNaN(orgId)) return res.status(400).json({ error: 'Invalid organization ID' });

  const { data: org } = await supabase.from('organizations')
    .select('id, name, slug').eq('id', orgId).maybeSingle();
  if (!org) return res.status(404).json({ error: 'Organization not found' });
  if (PROTECTED_ORG_SLUGS.includes(org.slug)) {
    return res.status(403).json({ error: `"${org.name}" is a protected organization and cannot be deleted.` });
  }

  const client = await pool.connect();
  const safe = async (sql, params = []) => {
    try { await client.query(sql, params); }
    catch (err) { if (err.code !== '42P01') throw err; } // ignore missing tables
  };

  try {
    await client.query('BEGIN');

    // Biometric
    await safe(`DELETE FROM biometric_import_batches        WHERE org_id = $1`, [orgId]);
    await safe(`DELETE FROM biometric_historical_sync_jobs  WHERE org_id = $1`, [orgId]);
    await safe(`DELETE FROM biometric_raw_logs              WHERE org_id = $1`, [orgId]);
    await safe(`DELETE FROM biometric_employee_map          WHERE org_id = $1`, [orgId]);
    await safe(`DELETE FROM biometric_devices               WHERE org_id = $1`, [orgId]);

    // Attendance
    await safe(`DELETE FROM attendance_breaks WHERE attendance_id IN (SELECT id FROM attendance WHERE organization_id = $1)`, [orgId]);
    await safe(`DELETE FROM attendance_regularization WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM attendance              WHERE organization_id = $1`, [orgId]);

    // Leaves
    await safe(`DELETE FROM leave_balances   WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM leaves           WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM leave_policies   WHERE organization_id = $1`, [orgId]);

    // Payroll
    await safe(`DELETE FROM payslips       WHERE payroll_run_id IN (SELECT id FROM payroll_runs WHERE organization_id = $1)`, [orgId]);
    await safe(`DELETE FROM payroll_runs   WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM salary_structures WHERE organization_id = $1`, [orgId]);

    // Finance
    await safe(`DELETE FROM expenses    WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM assets      WHERE organization_id = $1`, [orgId]);

    // Comms & docs
    await safe(`DELETE FROM announcements WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM notifications WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM documents    WHERE organization_id = $1`, [orgId]);

    // HR modules
    await safe(`DELETE FROM performance_reviews  WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM onboarding_tasks     WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM exit_requests        WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM shift_assignments    WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM shifts               WHERE organization_id = $1`, [orgId]);

    // Employee profile sub-tables (all keyed by user_id)
    const profileTables = [
      'employee_personal','employee_professional','employee_family',
      'employee_emergency_contacts','employee_education','employee_experience',
      'employee_skills','employee_banking','employee_nominees',
      'employee_government_docs','employee_immigration','employee_statutory',
      'employee_health','employee_training','employee_certifications',
    ];
    for (const t of profileTables) {
      await safe(`DELETE FROM ${t} WHERE user_id IN (SELECT id FROM users WHERE organization_id = $1)`, [orgId]);
    }

    // User junction tables
    await safe(`DELETE FROM user_departments WHERE user_id IN (SELECT id FROM users WHERE organization_id = $1)`, [orgId]);
    await safe(`DELETE FROM user_roles       WHERE user_id IN (SELECT id FROM users WHERE organization_id = $1)`, [orgId]);

    // RBAC
    await safe(`DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE organization_id = $1)`, [orgId]);
    await safe(`DELETE FROM roles            WHERE organization_id = $1`, [orgId]);

    // Org config
    await safe(`DELETE FROM departments         WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM designations        WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM holidays            WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM branches            WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM work_schedule       WHERE organization_id = $1`, [orgId]);
    await safe(`DELETE FROM organization_features WHERE organization_id = $1`, [orgId]);

    // Delink registration requests (preserve history, unlink from deleted org)
    await safe(`UPDATE org_registration_requests SET organization_id = NULL WHERE organization_id = $1`, [orgId]);

    // Users (after all child tables)
    await client.query(`DELETE FROM users WHERE organization_id = $1`, [orgId]);

    // Finally the org itself
    await client.query(`DELETE FROM organizations WHERE id = $1`, [orgId]);

    await client.query('COMMIT');

    // Log (fire-and-forget — not part of transaction)
    supabase.from('platform_activity').insert({
      event_type:  'org_deleted',
      description: `Organization "${org.name}" (ID: ${orgId}) permanently deleted by platform admin`,
      metadata:    { org_id: orgId, org_name: org.name, org_slug: org.slug },
    }).then(() => {}).catch(() => {});

    res.json({ ok: true, deleted: org.name });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[platform] org-delete error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
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
