const express    = require('express');
const router     = express.Router();
const { db } = require('../../config/db');
const { auth } = require('../../middleware/auth');
const { hasPermission } = require('../../middleware/permissions');
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
// Admins: see all org expenses.
// Employees: see their own claims + any claims where they are the manager (for the approval queue).
router.get('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { status } = req.query;
    let q = db.from('expenses').select('*').eq('organization_id', oId).order('created_at', { ascending: false });
    if (!isAdmin(req.user.role)) {
      q = q.or(`user_id.eq.${req.user.id},manager_id.eq.${req.user.id}`);
    }
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) return res.json([]);

    const userIds = [...new Set(
      [...rows.map(r => r.user_id), ...rows.map(r => r.reviewed_by), ...rows.map(r => r.manager_id)].filter(Boolean)
    )];
    const { data: users } = await db.from('users').select('id, name, avatar_color, department').in('id', userIds);
    const uMap = {};
    (users || []).forEach(u => { uMap[u.id] = u; });

    res.json(rows.map(r => ({
      ...r,
      user_name:         uMap[r.user_id]?.name  || '',
      user_avatar_color: uMap[r.user_id]?.avatar_color || '',
      user_department:   uMap[r.user_id]?.department   || '',
      reviewer_name:     uMap[r.reviewed_by]?.name     || '',
      manager_name:      uMap[r.manager_id]?.name      || '',
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/expenses — any authenticated user can submit their own expense claim.
// Admins can submit on behalf of another user by passing user_id in the body.
router.post('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { title, category, amount, expense_date, description, receipt_url, user_id } = req.body;
    if (!title || !amount || !expense_date) return res.status(400).json({ error: 'title, amount and date required' });
    if (Number(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than zero' });

    // Employees always submit for themselves; admins may specify a target user.
    let targetUserId = req.user.id;
    if (isAdmin(req.user.role) && user_id) {
      const { data: targetUser } = await db.from('users')
        .select('id').eq('id', parseInt(user_id)).eq('organization_id', oId).maybeSingle();
      if (!targetUser) return res.status(400).json({ error: 'Employee not found in your organization' });
      targetUserId = targetUser.id;
    }

    // Look up the submitter's reporting manager — determines whether 2-level approval applies.
    const { data: empUser } = await db.from('users')
      .select('reporting_to').eq('id', targetUserId).maybeSingle();
    const managerId = empUser?.reporting_to || null;

    const { data, error } = await db.from('expenses')
      .insert({
        user_id: targetUserId, title, category: category || 'other',
        amount: Number(amount), expense_date,
        description: description || '', receipt_url: receipt_url || '',
        organization_id: oId,
        manager_id: managerId,
      })
      .select().single();
    if (error) throw error;

    // Notify manager (primary approver) if one is configured
    if (managerId) {
      db.from('notifications').insert({
        user_id: managerId,
        title:   'Expense Claim — Your Approval Needed',
        message: `${req.user.name} submitted an expense claim of ₹${amount} for "${title}". Please review and approve.`,
        type:    'expense', organization_id: oId,
      }).then(() => {});
    }

    // Always notify HR admins (for visibility — direct review if no manager)
    const { data: admins } = await db.from('users').select('id').eq('organization_id', oId).in('role', ['admin', 'root_admin']);
    if (admins?.length) {
      await db.from('notifications').insert(admins.map(a => ({
        user_id: a.id, title: 'New Expense Claim',
        message: managerId
          ? `${req.user.name} submitted ₹${amount} for "${title}" — awaiting manager approval.`
          : `${req.user.name} submitted ₹${amount} for "${title}" — no manager assigned, direct review needed.`,
        type: 'expense', organization_id: oId,
      })));
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/expenses/upload-receipt
router.post('/upload-receipt', auth, upload.single('file'), async (req, res) => {
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

// PUT /api/expenses/:id/manager-approve — the expense's assigned manager approves or rejects.
// Gate: caller must be expense.manager_id exactly. Expense must still be pending.
router.put('/:id/manager-approve', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { action, notes } = req.body;
    if (!['approve', 'reject'].includes(action))
      return res.status(400).json({ error: "action must be 'approve' or 'reject'" });

    const { data: exp } = await db.from('expenses')
      .select('user_id, title, amount, status, manager_id')
      .eq('id', req.params.id).eq('organization_id', oId).maybeSingle();
    if (!exp) return res.status(404).json({ error: 'Expense not found' });
    if (exp.manager_id !== req.user.id)
      return res.status(403).json({ error: 'You are not the assigned approver for this expense' });
    if (exp.status !== 'pending')
      return res.status(400).json({ error: 'This expense has already been reviewed' });

    const newStatus = action === 'approve' ? 'manager_approved' : 'rejected';
    const { data, error } = await db.from('expenses')
      .update({ status: newStatus, manager_approved_at: new Date().toISOString(), manager_notes: notes || '' })
      .eq('id', req.params.id).eq('organization_id', oId).select().single();
    if (error) throw error;

    // Notify the employee of the outcome
    db.from('notifications').insert({
      user_id: exp.user_id,
      title:   action === 'approve' ? 'Expense Approved by Manager' : 'Expense Rejected by Manager',
      message: action === 'approve'
        ? `Your expense "${exp.title}" (₹${exp.amount}) was approved by your manager and sent to HR for processing.${notes ? ' Note: ' + notes : ''}`
        : `Your expense "${exp.title}" (₹${exp.amount}) was rejected by your manager.${notes ? ' Reason: ' + notes : ''}`,
      type: 'expense', organization_id: oId,
    }).then(() => {});

    // On approval: notify HR admins so they can process the now-approved claim
    if (action === 'approve') {
      db.from('users').select('id').eq('organization_id', oId).in('role', ['admin', 'root_admin'])
        .then(({ data: admins }) => {
          if (!admins?.length) return;
          return db.from('notifications').insert(admins.map(a => ({
            user_id: a.id,
            title:   'Expense Ready for HR Review',
            message: `Manager approved ${exp.title} (₹${exp.amount}) — ready for your processing.`,
            type:    'expense', organization_id: oId,
          })));
        }).catch(() => {});
    }

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/expenses/:id/review
router.put('/:id/review', auth, hasPermission('expenses', 'approve'), async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const { status, reviewer_notes } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const oId = req.user.organization_id;
    // Org-scoped pre-fetch prevents cross-tenant data read and spurious notifications
    const { data: exp } = await db.from('expenses')
      .select('user_id, title, amount').eq('id', req.params.id).eq('organization_id', oId).maybeSingle();
    if (!exp) return res.status(404).json({ error: 'Expense not found' });
    const { data, error } = await db.from('expenses')
      .update({ status, reviewer_notes: reviewer_notes || '', reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('organization_id', oId).select().single();
    if (error) throw error;
    await db.from('notifications').insert({
      user_id: exp.user_id, title: `Expense ${status === 'approved' ? 'Approved' : 'Rejected'}`,
      message: `Your expense claim "${exp.title}" of ₹${exp.amount} was ${status}.`,
      type: 'expense', organization_id: oId,
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/expenses/:id — owner can edit pending; admins can edit any
router.put('/:id', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    // Org-scoped pre-fetch prevents cross-tenant authz decisions and writes
    const { data: exp } = await db.from('expenses')
      .select('user_id, status').eq('id', req.params.id).eq('organization_id', oId).maybeSingle();
    if (!exp || (exp.user_id !== req.user.id && !isAdmin(req.user.role))) return res.status(403).json({ error: 'Forbidden' });
    if (exp.status !== 'pending' && !isAdmin(req.user.role)) return res.status(400).json({ error: 'Cannot edit a reviewed expense' });
    const { title, category, amount, expense_date, description, receipt_url } = req.body;
    const { data, error } = await db.from('expenses')
      .update({ title, category, amount: Number(amount), expense_date, description: description || '', receipt_url: receipt_url || '' })
      .eq('id', req.params.id).eq('organization_id', oId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/expenses/:id — owner can delete pending; admins can delete any pending
router.delete('/:id', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    // Org-scoped pre-fetch and delete prevent cross-tenant deletion
    const { data: exp } = await db.from('expenses')
      .select('user_id, status').eq('id', req.params.id).eq('organization_id', oId).maybeSingle();
    if (!exp || (exp.user_id !== req.user.id && !isAdmin(req.user.role))) return res.status(403).json({ error: 'Forbidden' });
    if (exp.status !== 'pending') return res.status(400).json({ error: 'Cannot delete a reviewed expense' });
    const { error } = await db.from('expenses').delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
