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
// Employees submit their own resignation; admins can submit on behalf of any employee
// within the SAME organization only.
router.post('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { resignation_date, reason, notice_period_days, user_id } = req.body;
    if (!resignation_date) return res.status(400).json({ error: 'resignation_date is required' });

    // Employees always submit for themselves; admins may specify a target employee.
    let targetUserId = req.user.id;
    let targetName   = req.user.name;

    if (isAdmin(req.user.role) && user_id) {
      // Validate that the target user belongs to this org — prevents cross-org IDOR.
      const { data: targetUser } = await supabase.from('users')
        .select('id, name').eq('id', parseInt(user_id)).eq('organization_id', oId).maybeSingle();
      if (!targetUser) return res.status(400).json({ error: 'Employee not found in your organization.' });
      targetUserId = targetUser.id;
      targetName   = targetUser.name;
    }

    // Prevent a duplicate open resignation for the same employee.
    const { data: existing } = await supabase.from('exit_requests')
      .select('id, status').eq('user_id', targetUserId).eq('organization_id', oId)
      .in('status', ['pending', 'approved']).maybeSingle();
    if (existing) return res.status(400).json({ error: 'An active resignation request already exists for this employee.' });

    const rDate = new Date(resignation_date);
    const lwd   = new Date(rDate);
    lwd.setDate(lwd.getDate() + (Number(notice_period_days) || 30));

    const { data, error } = await supabase.from('exit_requests')
      .insert({
        user_id: targetUserId, resignation_date,
        reason: reason || '', notice_period_days: Number(notice_period_days) || 30,
        last_working_day: lwd.toISOString().split('T')[0],
        organization_id: oId,
      })
      .select().single();
    if (error) throw error;

    // Notify all HR admins and root admins with the correct employee name.
    const { data: admins } = await supabase.from('users').select('id').eq('organization_id', oId).in('role', ['admin', 'root_admin']);
    if (admins?.length) {
      await supabase.from('notifications').insert(admins.map(a => ({
        user_id: a.id, title: 'Resignation Submitted',
        message: `${targetName} submitted a resignation. Last working day: ${lwd.toISOString().split('T')[0]}`,
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
    const updates = { ...req.body };
    delete updates.id; delete updates.organization_id; delete updates.created_at;
    const isStatusChange = updates.status === 'approved' || updates.status === 'rejected';

    if (isStatusChange) {
      // Fetch current state to enforce idempotency — prevent double-approval
      const { data: current } = await supabase.from('exit_requests')
        .select('id, status, user_id').eq('id', req.params.id).eq('organization_id', oId).single();
      if (!current) return res.status(404).json({ error: 'Exit request not found' });
      if (current.status === updates.status) {
        // Already in the target status — return current record idempotently
        const { data: existing } = await supabase.from('exit_requests').select('*').eq('id', req.params.id).single();
        return res.json(existing);
      }
      if (current.status === 'approved' || current.status === 'rejected') {
        return res.status(409).json({
          error: `Request already ${current.status}. Cannot change status again.`,
          current_status: current.status,
        });
      }
      updates.reviewed_by = req.user.id;
      updates.reviewed_at = new Date().toISOString();
    }

    const { data, error } = await supabase.from('exit_requests')
      .update(updates).eq('id', req.params.id).eq('organization_id', oId).select().single();
    if (error) throw error;

    // Fire-and-forget notification after successful update
    if (isStatusChange) {
      supabase.from('notifications').insert({
        user_id: data.user_id,
        title:   `Exit Request ${updates.status === 'approved' ? 'Accepted' : 'Reviewed'}`,
        message: `Your resignation has been ${updates.status}.`,
        type:    'exit', organization_id: oId,
      }).then(() => {});
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
