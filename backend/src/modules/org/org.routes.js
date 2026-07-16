const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { auth } = require('../../middleware/auth');
const { orgId } = require('../../utils/helpers');
const { sendMail, orgRequestReceivedHtml } = require('../../services/emailService');

// ─── Organization Registration (creates pending request, not live org) ────────
router.post('/register-org', async (req, res) => {
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

// ─── Organization Settings: GET ───────────────────────────────────────────────
router.get('/settings', auth, async (req, res) => {
  try {
    let targetOrgId = orgId(req);
    if (req.user.role === 'root_admin' && req.query.org_id) {
      targetOrgId = Number(req.query.org_id);
    }
    const { data } = await supabase.from('organizations')
      .select('id, name, slug, domain, logo_url, smtp_host, smtp_port, smtp_user, smtp_from, google_client_id, google_calendar_id, clockify_workspace_id, vapid_public_key, total_annual_leaves, plan, status, created_at')
      .eq('id', targetOrgId).single();
    if (!data) return res.status(404).json({ error: 'Organization not found' });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Organization Settings: PUT ───────────────────────────────────────────────
router.put('/settings', auth, async (req, res) => {
  try {
    if (req.user.role !== 'root_admin') return res.status(403).json({ error: 'Root admin access required' });
    const {
      org_id,
      name, domain, logo_url,
      smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from,
      google_client_id, google_client_secret, google_refresh_token, google_calendar_id,
      clockify_api_key, clockify_workspace_id,
      vapid_public_key, vapid_private_key,
      total_annual_leaves,
    } = req.body;

    const targetOrgId = org_id ? Number(org_id) : orgId(req);

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
      .update(update).eq('id', targetOrgId)
      .select('id, name, slug, domain, logo_url, smtp_host, smtp_port, smtp_user, smtp_from, google_client_id, google_calendar_id, clockify_workspace_id, vapid_public_key, total_annual_leaves, plan, status').single();
    if (error) throw new Error(error.message);

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Organization HR Contact ──────────────────────────────────────────────────
router.get('/hr-contact', auth, async (req, res) => {
  try {
    const { data } = await supabase.from('users')
      .select('email, name')
      .eq('organization_id', orgId(req))
      .eq('role', 'admin')
      .order('created_at')
      .limit(1)
      .maybeSingle();
    res.json(data ? { email: data.email, name: data.name } : { email: null, name: null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Org Feature Flags (for client app) ──────────────────────────────────────
// Returns a key→boolean map of all features for the caller's organization.
// Missing features default to true (enabled).
router.get('/features', auth, async (req, res) => {
  try {
    const { data } = await supabase.from('organization_features')
      .select('feature_key, enabled').eq('organization_id', orgId(req));
    const flags = {};
    for (const row of data || []) flags[row.feature_key] = row.enabled;
    res.json(flags);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
