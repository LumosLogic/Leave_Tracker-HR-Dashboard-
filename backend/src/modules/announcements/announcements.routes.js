const express    = require('express');
const router     = express.Router();
const { supabase } = require('../../config/db');
const { auth }   = require('../../middleware/auth');
const { sendMail, announcementHtml } = require('../../services/emailService');
const { getOrgContext } = require('../../utils/helpers');
const cloudinary = require('cloudinary').v2;
const multer     = require('multer');

// Configure Cloudinary (reads from env)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// For root_admin, allow overriding the org via ?org_id= (GET) or body.org_id (POST)
function resolveOrgId(req, { fromQuery = false } = {}) {
  if (req.user.role === 'root_admin') {
    const override = fromQuery ? req.query.org_id : req.body?.org_id;
    if (override) return parseInt(override, 10);
  }
  return req.user.organization_id;
}

// GET /api/announcements
router.get('/', auth, async (req, res) => {
  try {
    const oId = resolveOrgId(req, { fromQuery: true });
    const today = new Date().toISOString().split('T')[0];
    let q = supabase.from('announcements').select('*').eq('organization_id', oId)
      .order('pinned', { ascending: false }).order('created_at', { ascending: false });
    if (!isAdmin(req.user.role)) {
      q = q.in('target_audience', ['all', 'employees']);
    }
    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) return res.json([]);

    const creatorIds = [...new Set(rows.map(r => r.created_by).filter(Boolean))];
    let creatorMap = {};
    if (creatorIds.length) {
      const { data: creators } = await supabase.from('users').select('id, name').in('id', creatorIds);
      (creators || []).forEach(u => { creatorMap[u.id] = u.name; });
    }

    // Filter expired for non-admins
    const filtered = isAdmin(req.user.role) ? rows : rows.filter(r => !r.expires_at || r.expires_at >= today);

    res.json(filtered.map(r => ({ ...r, creator_name: creatorMap[r.created_by] || 'Admin' })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/announcements/upload — Cloudinary attachment upload
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const oId = req.user.organization_id;
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: `hrms/${oId}/announcements`, resource_type: 'auto' },
        (err, r) => err ? reject(err) : resolve(r)
      ).end(req.file.buffer);
    });

    res.json({
      file_url:  result.secure_url,
      file_name: req.file.originalname,
      file_type: req.file.mimetype,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/announcements
router.post('/', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = resolveOrgId(req);
    const { title, content, type, priority, target_audience, pinned, expires_at, file_url, file_name, file_type } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'title and content required' });

    const payload = {
      title, content,
      type: type || 'general',
      priority: priority || 'normal',
      target_audience: target_audience || 'all',
      pinned: !!pinned,
      expires_at: expires_at || null,
      created_by: req.user.id,
      organization_id: oId,
    };
    if (file_url !== undefined) payload.file_url = file_url;
    if (file_name !== undefined) payload.file_name = file_name;
    if (file_type !== undefined) payload.file_type = file_type;

    const { data, error } = await supabase.from('announcements')
      .insert(payload)
      .select().single();
    if (error) throw error;

    const { data: users } = await supabase.from('users').select('id, email, name, role').eq('organization_id', oId);
    if (users?.length) {
      // In-app notifications — all org users regardless of target_audience
      await supabase.from('notifications').insert(users.map(u => ({
        user_id:         u.id,
        title:           `📢 ${title}`,
        message:         content.length > 100 ? content.substring(0, 100) + '…' : content,
        type:            'announcement',
        reference_id:    data.id,
        reference_type:  'announcement',
        organization_id: oId,
      })));

      // Email — respect target_audience; fire-and-forget (don't block response)
      const audience = target_audience || 'all';
      const emailRecipients = users.filter(u => {
        if (!u.email) return false;
        if (audience === 'employees') return u.role === 'employee';
        if (audience === 'admins')    return u.role === 'admin' || u.role === 'root_admin';
        return true; // 'all'
      });

      const { orgName, orgEmail } = await getOrgContext(oId);
      const annWithCreator = { ...data, creator_name: req.user.name || 'HR' };

      emailRecipients.forEach(u => {
        sendMail({
          to:      u.email,
          subject: `📢 ${title} — ${orgName}`,
          html:    announcementHtml(annWithCreator, orgName, orgEmail),
        }).catch(() => {});
      });
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/announcements/:id
router.put('/:id', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const { title, content, type, priority, target_audience, pinned, expires_at, file_url, file_name, file_type } = req.body;

    const payload = { title, content, type, priority, target_audience, pinned: !!pinned, expires_at: expires_at || null };
    if (file_url !== undefined) payload.file_url = file_url;
    if (file_name !== undefined) payload.file_name = file_name;
    if (file_type !== undefined) payload.file_type = file_type;

    let q = supabase.from('announcements').update(payload).eq('id', req.params.id);
    // Regular admins are restricted to their own org; root_admin can edit any org's announcement
    if (req.user.role !== 'root_admin') q = q.eq('organization_id', req.user.organization_id);
    const { data, error } = await q.select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/announcements/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });

    // Fetch the announcement first to get title, org, and file info
    let fetchQ = supabase.from('announcements').select('id, title, file_url, organization_id').eq('id', req.params.id);
    if (req.user.role !== 'root_admin') fetchQ = fetchQ.eq('organization_id', req.user.organization_id);
    const { data: ann } = await fetchQ.maybeSingle();
    if (!ann) return res.status(404).json({ error: 'Announcement not found' });

    const oId = ann.organization_id;

    // Delete related notifications using reference_id (accurate) with title fallback
    // for legacy notifications created before reference_id was added.
    const notifDelete = supabase.from('notifications')
      .delete()
      .eq('organization_id', oId)
      .eq('type', 'announcement');
    // If reference_id exists in schema, use it; otherwise fall back to title match
    await notifDelete.eq('reference_id', ann.id)
      .then(() => {})
      .catch(() =>
        supabase.from('notifications')
          .delete()
          .eq('organization_id', oId)
          .eq('type', 'announcement')
          .eq('title', `📢 ${ann.title}`)
      );

    // Delete Cloudinary file if present
    if (ann.file_url) {
      try {
        // Extract public_id from Cloudinary URL
        const match = ann.file_url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
        if (match) {
          const publicId = match[1];
          await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' });
        }
      } catch { /* ignore Cloudinary errors — proceed with DB delete */ }
    }

    const { error } = await supabase.from('announcements').delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
