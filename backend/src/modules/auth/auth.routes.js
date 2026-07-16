const express = require('express');
const router  = express.Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { supabase } = require('../../config/db');
const { JWT_SECRET, auth } = require('../../middleware/auth');
const { orgId, getRecipients } = require('../../utils/helpers');
const { sendMail, passwordResetHtml } = require('../../services/emailService');

// ─── Auth: Login ──────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
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
      JWT_SECRET, { expiresIn: '7d' }
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

// ─── Auth: Get Current User ───────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  const { data } = await supabase.from('users')
    .select('id, name, email, role, department, position, avatar_color').eq('id', req.user.id).single();
  res.json(data);
});

// ─── Auth: Update Profile ─────────────────────────────────────────────────────
router.put('/profile', auth, async (req, res) => {
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

// ─── Auth: Change Password ────────────────────────────────────────────────────
router.put('/change-password', auth, async (req, res) => {
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

// ─── Auth: Forgot Password ────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, org_slug } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    let query = supabase.from('users').select('id, name, email').eq('email', email.toLowerCase().trim());
    if (org_slug) {
      const { data: org } = await supabase.from('organizations').select('id').eq('slug', org_slug.toLowerCase().trim()).maybeSingle();
      if (org) query = query.eq('organization_id', org.id);
    }
    const { data: user } = await query.maybeSingle();

    // Always respond with success to prevent email enumeration
    if (!user) return res.json({ success: true });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    await supabase.from('users').update({
      password_reset_token:   token,
      password_reset_expires: expires,
    }).eq('id', user.id);

    const baseUrl   = process.env.FRONTEND_URL || 'https://leavetrackerbylumos.web.app';
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    sendMail({
      to:      user.email,
      subject: 'HR Tracker — Reset Your Password',
      html:    passwordResetHtml(user, resetLink),
    });

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Auth: Reset Password ─────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and new password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const { data: user } = await supabase.from('users')
      .select('id, password_reset_token, password_reset_expires')
      .eq('password_reset_token', token)
      .maybeSingle();

    if (!user) return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    if (new Date(user.password_reset_expires) < new Date())
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });

    await supabase.from('users').update({
      password:               bcrypt.hashSync(password, 10),
      password_reset_token:   null,
      password_reset_expires: null,
      force_password_change:  false,
    }).eq('id', user.id);

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Auth: Send Email Verification Code ──────────────────────────────────────
router.post('/send-verification', auth, async (req, res) => {
  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await supabase.from('users').update({ email_verify_code: code }).eq('id', req.user.id);
    sendMail({
      to: req.user.email,
      subject: 'Email Verification Code — Lumens HR Tracker',
      html: `<p>Your email verification code is: <strong>${code}</strong></p>`
    });
    res.json({ success: true, message: 'Verification code sent to email' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Auth: Verify Email ───────────────────────────────────────────────────────
router.post('/verify-email', auth, async (req, res) => {
  try {
    const { code } = req.body;
    const { data: user } = await supabase.from('users').select('email_verify_code').eq('id', req.user.id).single();
    if (!code || user?.email_verify_code !== code) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }
    await supabase.from('users').update({ email_verified: true, email_verify_code: null }).eq('id', req.user.id);
    res.json({ success: true, message: 'Email verified successfully!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Auth: Deactivate Account ─────────────────────────────────────────────────
router.post('/deactivate', auth, async (req, res) => {
  try {
    await supabase.from('users').update({ status: 'inactive' }).eq('id', req.user.id);
    res.json({ success: true, message: 'Account deactivated successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Auth: Request Account Deletion (GDPR) ───────────────────────────────────
router.post('/request-deletion', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const recipients = await getRecipients(orgId(req));
    sendMail({
      to: recipients,
      subject: `GDPR Account Deletion Request — ${req.user.name}`,
      html: `<p>Employee <strong>${req.user.name}</strong> (${req.user.email}) has requested account deletion.</p><p>Reason: ${reason || 'None provided'}</p>`
    });
    res.json({ success: true, message: 'Account deletion request submitted to HR' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
