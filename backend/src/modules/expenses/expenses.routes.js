const express    = require('express');
const router     = express.Router();
const { supabase } = require('../../config/db');
const cloudinary = require('cloudinary').v2;
const multer     = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// GET /api/expenses
router.get('/', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { status } = req.query;
    let q = supabase.from('expenses').select('*').eq('organization_id', oId).order('created_at', { ascending: false });
    if (!isAdmin(req.user.role)) q = q.eq('user_id', req.user.id);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) return res.json([]);

    const userIds = [...new Set([...rows.map(r => r.user_id), ...rows.map(r => r.reviewed_by)].filter(Boolean))];
    const { data: users } = await supabase.from('users').select('id, name, avatar_color, department').in('id', userIds);
    const uMap = {};
    (users || []).forEach(u => { uMap[u.id] = u; });

    res.json(rows.map(r => ({
      ...r,
      user_name:       uMap[r.user_id]?.name || '',
      user_avatar_color: uMap[r.user_id]?.avatar_color || '',
      user_department: uMap[r.user_id]?.department || '',
      reviewer_name:   uMap[r.reviewed_by]?.name || '',
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/expenses
router.post('/', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { title, category, amount, expense_date, description, receipt_url } = req.body;
    if (!title || !amount || !expense_date) return res.status(400).json({ error: 'title, amount and date required' });
    const { data, error } = await supabase.from('expenses')
      .insert({ user_id: req.user.id, title, category: category || 'other', amount: Number(amount), expense_date, description: description || '', receipt_url: receipt_url || '', organization_id: oId })
      .select().single();
    if (error) throw error;

    const { data: admins } = await supabase.from('users').select('id').eq('organization_id', oId).in('role', ['admin', 'root_admin']);
    if (admins?.length) {
      await supabase.from('notifications').insert(admins.map(a => ({
        user_id: a.id, title: 'New Expense Claim',
        message: `${req.user.name} submitted an expense claim of ₹${amount} for "${title}"`,
        type: 'expense', organization_id: oId,
      })));
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/expenses/upload-receipt
router.post('/upload-receipt', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const oId = req.user.organization_id;
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: `hrms/${oId}/receipts`, resource_type: 'auto' },
        (err, r) => err ? reject(err) : resolve(r)
      ).end(req.file.buffer);
    });
    res.json({ url: result.secure_url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/expenses/:id/review
router.put('/:id/review', async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const { status, reviewer_notes } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const oId = req.user.organization_id;
    const { data: exp } = await supabase.from('expenses').select('user_id, title, amount').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('expenses')
      .update({ status, reviewer_notes: reviewer_notes || '', reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('organization_id', oId).select().single();
    if (error) throw error;
    if (exp) {
      await supabase.from('notifications').insert({
        user_id: exp.user_id, title: `Expense ${status === 'approved' ? 'Approved' : 'Rejected'}`,
        message: `Your expense claim "${exp.title}" of ₹${exp.amount} was ${status}.`,
        type: 'expense', organization_id: oId,
      });
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/expenses/:id
router.put('/:id', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { data: exp } = await supabase.from('expenses').select('user_id, status').eq('id', req.params.id).single();
    if (!exp || (exp.user_id !== req.user.id && !isAdmin(req.user.role))) return res.status(403).json({ error: 'Forbidden' });
    if (exp.status !== 'pending' && !isAdmin(req.user.role)) return res.status(400).json({ error: 'Cannot edit a reviewed expense' });
    const { title, category, amount, expense_date, description, receipt_url } = req.body;
    const { data, error } = await supabase.from('expenses')
      .update({ title, category, amount: Number(amount), expense_date, description: description || '', receipt_url: receipt_url || '' })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/expenses/:id
router.delete('/:id', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { data: exp } = await supabase.from('expenses').select('user_id, status').eq('id', req.params.id).single();
    if (!exp || (exp.user_id !== req.user.id && !isAdmin(req.user.role))) return res.status(403).json({ error: 'Forbidden' });
    if (exp.status !== 'pending') return res.status(400).json({ error: 'Cannot delete a reviewed expense' });
    const { error } = await supabase.from('expenses').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
