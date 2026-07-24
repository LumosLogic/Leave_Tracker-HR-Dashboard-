const express   = require('express');
const router    = express.Router();
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const multer    = require('multer');
const cloudinary = require('cloudinary').v2;
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const { supabase } = require('../../config/db');
const { JWT_SECRET, auth } = require('../../middleware/auth');
const { orgId, getRecipients } = require('../../utils/helpers');
const { sendMail, passwordResetHtml } = require('../../services/emailService');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

    // Record login history (fire and forget)
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    supabase.from('users').update({ last_login_at: new Date().toISOString(), last_login_ip: clientIp, last_login_ua: userAgent }).eq('id', user.id).then(() => {});
    supabase.from('login_history').insert({ user_id: user.id, organization_id: user.organization_id, ip_address: clientIp, user_agent: userAgent, status: 'success' }).then(() => {});

    // If TOTP is enabled, return a short-lived totp-pending session
    if (user.totp_enabled) {
      const totpSession = jwt.sign({ user_id: user.id, purpose: 'totp-pending' }, JWT_SECRET, { expiresIn: '5m' });
      return res.json({ requires2FA: true, totp_session: totpSession });
    }

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
        avatar_url: user.avatar_url || '', email_verified: user.email_verified || false,
        employee_id: user.employee_id || null, totp_enabled: user.totp_enabled || false,
        last_login_at: user.last_login_at || null,
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
    .select('id, name, email, role, department, position, avatar_color, avatar_url, email_verified, employee_id, totp_enabled, last_login_at, password_changed_at, created_at')
    .eq('id', req.user.id).single();
  res.json(data);
});

// ─── Auth: Update Profile ─────────────────────────────────────────────────────
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, avatar_color, email, avatar_url } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const update = { name, avatar_color };
    if (avatar_url !== undefined) update.avatar_url = avatar_url;
    if (email) {
      const norm = email.toLowerCase().trim();
      const { data: dup } = await supabase.from('users').select('id').eq('email', norm).maybeSingle();
      if (dup && dup.id !== req.user.id) return res.status(400).json({ error: 'Email already in use by another account' });
      update.email = norm;
    }
    const { data, error } = await supabase.from('users')
      .update(update)
      .eq('id', req.user.id)
      .select('id, name, email, role, department, position, avatar_color, avatar_url').single();
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Auth: Upload Avatar Photo ────────────────────────────────────────────────
router.post('/upload-avatar', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: `hrms/${req.user.organization_id}/avatars`, resource_type: 'image', transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }] },
        (err, r) => err ? reject(err) : resolve(r)
      ).end(req.file.buffer);
    });
    await supabase.from('users').update({ avatar_url: result.secure_url }).eq('id', req.user.id);
    res.json({ avatar_url: result.secure_url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Auth: Change Password ────────────────────────────────────────────────────
router.put('/change-password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Current and new password required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const { data: user } = await supabase.from('users')
      .select('password, password_history').eq('id', req.user.id).single();

    if (!bcrypt.compareSync(currentPassword, user.password))
      return res.status(400).json({ error: 'Current password is incorrect' });

    // Check last 5 passwords for reuse
    const history = Array.isArray(user.password_history) ? user.password_history : [];
    const isReused = history.some(h => bcrypt.compareSync(newPassword, h));
    if (isReused) return res.status(400).json({ error: 'Cannot reuse one of your last 5 passwords' });

    const newHash = bcrypt.hashSync(newPassword, 10);
    const newHistory = [user.password, ...history].slice(0, 5); // keep last 5

    const { error: pwErr } = await supabase.from('users').update({
      password: newHash,
      force_password_change: false,
      password_changed_at: new Date().toISOString(),
      password_history: newHistory,
    }).eq('id', req.user.id);
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

    const baseUrl   = process.env.FRONTEND_URL || 'https://hrms.lumoslogic.com';
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

// ─── 2FA: Setup (generate QR + secret) ──────────────────────────────────────
router.post('/totp/setup', auth, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users').select('email, totp_enabled').eq('id', req.user.id).single();
    if (user.totp_enabled) return res.status(400).json({ error: '2FA is already enabled' });
    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, 'Lumos Logic HRMS', secret);
    const qrDataUrl = await qrcode.toDataURL(otpauthUrl);
    // Store secret temporarily (not yet enabled)
    await supabase.from('users').update({ totp_secret: secret }).eq('id', req.user.id);
    res.json({ secret, qrDataUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── 2FA: Enable (verify code + activate) ────────────────────────────────────
router.post('/totp/enable', auth, async (req, res) => {
  try {
    const { token: totpToken } = req.body;
    if (!totpToken) return res.status(400).json({ error: 'TOTP code required' });
    const { data: user } = await supabase.from('users').select('totp_secret').eq('id', req.user.id).single();
    if (!user.totp_secret) return res.status(400).json({ error: 'Run /totp/setup first' });
    if (!authenticator.check(totpToken, user.totp_secret))
      return res.status(400).json({ error: 'Invalid code. Please try again.' });
    await supabase.from('users').update({ totp_enabled: true }).eq('id', req.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── 2FA: Disable ────────────────────────────────────────────────────────────
router.post('/totp/disable', auth, async (req, res) => {
  try {
    const { password: currentPassword } = req.body;
    if (!currentPassword) return res.status(400).json({ error: 'Password required to disable 2FA' });
    const { data: user } = await supabase.from('users').select('password').eq('id', req.user.id).single();
    if (!bcrypt.compareSync(currentPassword, user.password))
      return res.status(400).json({ error: 'Incorrect password' });
    await supabase.from('users').update({ totp_enabled: false, totp_secret: null }).eq('id', req.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── 2FA: Verify login step ───────────────────────────────────────────────────
router.post('/totp/verify-login', async (req, res) => {
  try {
    const { totp_session, token: totpToken } = req.body;
    if (!totp_session || !totpToken) return res.status(400).json({ error: 'Missing parameters' });
    let decoded;
    try { decoded = jwt.verify(totp_session, JWT_SECRET); }
    catch { return res.status(401).json({ error: 'TOTP session expired. Please login again.' }); }
    if (decoded.purpose !== 'totp-pending') return res.status(401).json({ error: 'Invalid session' });

    const { data: user } = await supabase.from('users')
      .select('*, organizations(id, name, slug, logo_url)')
      .eq('id', decoded.user_id).maybeSingle();
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (!authenticator.check(totpToken, user.totp_secret))
      return res.status(400).json({ error: 'Invalid authenticator code' });

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
        avatar_url: user.avatar_url || '', email_verified: user.email_verified || false,
        employee_id: user.employee_id || null, totp_enabled: true,
        force_password_change: user.force_password_change || false,
        organization_id: user.organization_id || 1,
        organization_name: org.name || 'LumosLogic',
        organization_slug: org.slug || 'lumoslogic',
        organization_logo: org.logo_url || '',
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Login History ────────────────────────────────────────────────────────────
router.get('/login-history', auth, async (req, res) => {
  try {
    const { data } = await supabase.from('login_history')
      .select('id, ip_address, user_agent, status, logged_in_at')
      .eq('user_id', req.user.id)
      .order('logged_in_at', { ascending: false })
      .limit(15);
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Download My Data (GDPR) ──────────────────────────────────────────────────
router.get('/download-data', auth, async (req, res) => {
  try {
    const { data: user } = await supabase.from('users')
      .select('id, name, email, role, department, position, avatar_color, employee_id, created_at, last_login_at, email_verified')
      .eq('id', req.user.id).single();
    const { data: leaves } = await supabase.from('leaves').select('*').eq('user_id', req.user.id);
    const { data: attendance } = await supabase.from('attendance').select('date, check_in, check_out, status, work_hours').eq('user_id', req.user.id).limit(365);
    const { data: history } = await supabase.from('login_history').select('ip_address, user_agent, logged_in_at, status').eq('user_id', req.user.id).limit(50);

    const exportData = {
      exported_at: new Date().toISOString(),
      profile: user,
      leaves: leaves || [],
      attendance: attendance || [],
      login_history: history || [],
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="my-data-${user.name?.replace(/\s/g, '_')}-${Date.now()}.json"`);
    res.json(exportData);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
