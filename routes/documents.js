const express    = require('express');
const router     = express.Router();
const { supabase } = require('../db');
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

// GET /api/documents?userId=
router.get('/', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { userId } = req.query;

    let query = supabase.from('employee_documents')
      .select('*, uploaded_by_user:users!employee_documents_uploaded_by_fkey(name), owner:users!employee_documents_user_id_fkey(name, avatar_color, department)')
      .eq('organization_id', oId)
      .order('created_at', { ascending: false });

    if (isAdmin(req.user.role)) {
      // Admin/Root: filter by specific employee if requested, else return all org docs
      if (userId) query = query.eq('user_id', userId);
    } else {
      // Employees see only their own documents
      query = query.eq('user_id', req.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/documents/upload — multipart upload
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const oId = req.user.organization_id;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const allowedMIMEs = [
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (!allowedMIMEs.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Invalid file type. Only PDF, Images (JPG, PNG, WEBP), and Word documents are permitted.' });
    }

    const { name, category, userId, expiry_date } = req.body;
    const targetId = isAdmin(req.user.role) && userId ? Number(userId) : req.user.id;


    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: `hrms/${oId}/documents`, resource_type: 'auto' },
        (err, r) => err ? reject(err) : resolve(r)
      ).end(req.file.buffer);
    });

    const { data, error } = await supabase.from('employee_documents').insert({
      user_id: targetId,
      name: name || req.file.originalname,
      category: category || 'other',
      file_url:  result.secure_url,
      file_type: req.file.mimetype,
      file_size: req.file.size,
      expiry_date: expiry_date || null,
      uploaded_by: req.user.id,
      organization_id: oId,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/documents/:id/status — admin only: set verified | pending_review | rejected
router.patch('/:id/status', async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const { status } = req.body;
    if (!['pending_review', 'verified', 'rejected'].includes(status))
      return res.status(400).json({ error: 'Invalid status' });
    const { data, error } = await supabase.from('employee_documents')
      .update({ status })
      .eq('id', req.params.id)
      .eq('organization_id', req.user.organization_id)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/documents/:id
router.delete('/:id', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { data: doc } = await supabase.from('employee_documents')
      .select('*').eq('id', req.params.id).eq('organization_id', oId).single();
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (!isAdmin(req.user.role) && doc.user_id !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });

    // Delete from Cloudinary
    const publicId = doc.file_url.split('/').slice(-2).join('/').replace(/\.[^.]+$/, '');
    try { await cloudinary.uploader.destroy(publicId); } catch { /* ignore if already gone */ }

    const { error } = await supabase.from('employee_documents')
      .delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
