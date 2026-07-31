const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { auth } = require('../../middleware/auth');
const { orgId } = require('../../utils/helpers');
const { sendMail, orgRequestReceivedHtml } = require('../../services/emailService');
const { rateLimiter, LIMITS } = require('../../middleware/rateLimiter');

// GST format: 2-digit state code + 10-char PAN + entity digit + 'Z' + check char (15 chars total)
const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// ─── Organization Registration (creates pending request, not live org) ────────
router.post('/register-org', rateLimiter(LIMITS.ORG_REGISTER), async (req, res) => {
  try {
    const { company_name, name, email, phone, website, message, gst_number, company_size, industry } = req.body;
    if (!company_name || !name || !email)
      return res.status(400).json({ error: 'Company name, your name, and email are required' });

    const norm        = email.toLowerCase().trim();
    const companyTrim = company_name.trim();

    // ── 1. Validate GST format if provided ───────────────────────────────────
    const gstNorm = gst_number ? gst_number.trim().toUpperCase() : null;
    if (gstNorm && !GST_REGEX.test(gstNorm))
      return res.status(400).json({ error: 'Invalid GST number format. Expected format: 22AAAAA0000A1Z5' });

    // ── 2. Block duplicate contact email ─────────────────────────────────────
    const { data: dupEmail } = await supabase.from('org_registration_requests')
      .select('id').eq('email', norm).in('status', ['pending', 'approved']).maybeSingle();
    if (dupEmail) return res.status(400).json({ error: 'A registration request with this email is already pending or approved.' });

    // ── 3. Block duplicate company name (case-insensitive) across requests ───
    const { data: dupName } = await supabase.from('org_registration_requests')
      .select('id').ilike('company_name', companyTrim).in('status', ['pending', 'approved']).maybeSingle();
    if (dupName) return res.status(400).json({ error: 'This organization is already registered or has a pending request. Please contact support if you believe this is incorrect.' });

    // ── 4. Block duplicate company name against live organizations ───────────
    const { data: existingOrg } = await supabase.from('organizations')
      .select('id').ilike('name', companyTrim).maybeSingle();
    if (existingOrg) return res.status(400).json({ error: 'This organization is already registered. Please contact support if you believe this is incorrect.' });

    // ── 5. Block if admin email already has a user account ───────────────────
    const { data: existingUser } = await supabase.from('users').select('id').eq('email', norm).maybeSingle();
    if (existingUser) return res.status(400).json({ error: 'An account with this email already exists on the platform.' });

    // ── 6. Unique GST check across pending/approved requests ─────────────────
    if (gstNorm) {
      const { data: dupGst } = await supabase.from('org_registration_requests')
        .select('id').eq('gst_number', gstNorm).in('status', ['pending', 'approved']).maybeSingle();
      if (dupGst) return res.status(400).json({ error: 'A registration request with this GST number already exists.' });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;

    const { data: request, error: reqErr } = await supabase.from('org_registration_requests')
      .insert({
        company_name: companyTrim, contact_name: name.trim(), email: norm,
        phone:        phone        || null,
        website:      website      || null,
        message:      message      || null,
        gst_number:   gstNorm      || null,
        company_size: company_size || null,
        industry:     industry     || null,
        ip_address:   ip,
      })
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
router.get('/org/settings', auth, async (req, res) => {
  try {
    let targetOrgId = orgId(req);
    if (req.user.role === 'root_admin' && req.query.org_id) {
      targetOrgId = Number(req.query.org_id);
    }
    const { data, error } = await supabase.from('organizations')
      .select('id, name, slug, domain, logo_url, google_client_id, google_calendar_id, vapid_public_key, total_annual_leaves, plan, status, created_at')
      .eq('id', targetOrgId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'Organization not found' });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Organization Settings: PUT ───────────────────────────────────────────────
router.put('/org/settings', auth, async (req, res) => {
  try {
    if (req.user.role !== 'root_admin') return res.status(403).json({ error: 'Root admin access required' });
    const {
      org_id,
      name, domain, logo_url,
      google_client_id, google_client_secret, google_refresh_token, google_calendar_id,
      vapid_public_key, vapid_private_key,
      total_annual_leaves,
    } = req.body;

    const targetOrgId = org_id ? Number(org_id) : orgId(req);

    const update = {};
    if (name)               update.name = name.trim();
    if (domain !== undefined) update.domain = domain;
    if (logo_url !== undefined) update.logo_url = logo_url;
    if (google_client_id !== undefined) update.google_client_id = google_client_id;
    if (google_client_secret && google_client_secret.trim() !== '') update.google_client_secret = google_client_secret.trim();
    if (google_refresh_token && google_refresh_token.trim() !== '') update.google_refresh_token = google_refresh_token.trim();
    if (google_calendar_id !== undefined) update.google_calendar_id = google_calendar_id;
    if (vapid_public_key !== undefined) update.vapid_public_key = vapid_public_key;
    if (vapid_private_key && vapid_private_key.trim() !== '') update.vapid_private_key = vapid_private_key.trim();
    if (total_annual_leaves) update.total_annual_leaves = parseInt(total_annual_leaves) || 18;

    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'No fields to update' });

    const { data, error } = await supabase.from('organizations')
      .update(update).eq('id', targetOrgId)
      .select('id, name, slug, domain, logo_url, google_client_id, google_calendar_id, vapid_public_key, total_annual_leaves, plan, status').single();
    if (error) throw new Error(error.message);

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Organization HR Contact ──────────────────────────────────────────────────
router.get('/org/hr-contact', auth, async (req, res) => {
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
