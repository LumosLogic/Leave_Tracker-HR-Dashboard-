const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { auth, adminOnly } = require('../../middleware/auth');

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// GET /api/exit
router.get('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { userId } = req.query;
    let q = supabase.from('exit_requests').select('*').eq('organization_id', oId).order('created_at', { ascending: false });
    if (!isAdmin(req.user.role)) q = q.eq('user_id', req.user.id);
    else if (userId) q = q.eq('user_id', parseInt(userId));
    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) return res.json([]);

    const allIds = [...new Set([...rows.map(r => r.user_id), ...rows.map(r => r.reviewed_by)].filter(Boolean))];
    const { data: users } = await supabase.from('users').select('id, name, avatar_color, department, position').in('id', allIds);
    const uMap = {};
    (users || []).forEach(u => { uMap[u.id] = u; });

    res.json(rows.map(r => ({
      ...r,
      user_name:         uMap[r.user_id]?.name || '',
      user_avatar_color: uMap[r.user_id]?.avatar_color || '',
      user_department:   uMap[r.user_id]?.department || '',
      reviewer_name:     uMap[r.reviewed_by]?.name || '',
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/exit
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { resignation_date, reason, notice_period_days } = req.body;
    if (!resignation_date) return res.status(400).json({ error: 'resignation_date is required' });

    const rDate = new Date(resignation_date);
    const lwd   = new Date(rDate);
    lwd.setDate(lwd.getDate() + (Number(notice_period_days) || 30));

    const { data, error } = await supabase.from('exit_requests')
      .insert({ user_id: req.user.id, resignation_date, reason: reason || '', notice_period_days: Number(notice_period_days) || 30, last_working_day: lwd.toISOString().split('T')[0], organization_id: oId })
      .select().single();
    if (error) throw error;

    const { data: admins } = await supabase.from('users').select('id').eq('organization_id', oId).in('role', ['admin', 'root_admin']);
    if (admins?.length) {
      await supabase.from('notifications').insert(admins.map(a => ({
        user_id: a.id, title: 'Resignation Submitted',
        message: `${req.user.name} submitted resignation. Last working day: ${lwd.toISOString().split('T')[0]}`,
        type: 'exit', organization_id: oId,
      })));
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/exit/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const { data: existing } = await supabase.from('exit_requests').select('user_id').eq('id', req.params.id).single();
    const updates = { ...req.body };
    delete updates.id; delete updates.organization_id; delete updates.created_at;
    if (updates.status === 'approved' || updates.status === 'rejected') {
      updates.reviewed_by = req.user.id;
      updates.reviewed_at = new Date().toISOString();
    }
    const { data, error } = await supabase.from('exit_requests')
      .update(updates).eq('id', req.params.id).eq('organization_id', oId).select().single();
    if (error) throw error;
    if (existing && (updates.status === 'approved' || updates.status === 'rejected')) {
      await supabase.from('notifications').insert({
        user_id: existing.user_id, title: `Exit Request ${updates.status === 'approved' ? 'Accepted' : 'Reviewed'}`,
        message: `Your resignation has been ${updates.status}.`,
        type: 'exit', organization_id: oId,
      });
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
