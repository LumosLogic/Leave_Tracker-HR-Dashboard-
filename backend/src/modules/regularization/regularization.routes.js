const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// GET /api/regularization
router.get('/', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const uid = req.user.id;
    let q = supabase.from('attendance_regularization')
      .select('*')
      .eq('organization_id', oId)
      .order('created_at', { ascending: false });
    if (!isAdmin(req.user.role)) q = q.eq('user_id', uid);
    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) return res.json([]);

    // Fetch user names separately
    const userIds     = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    const reviewerIds = [...new Set(rows.map(r => r.reviewed_by).filter(Boolean))];
    const allIds      = [...new Set([...userIds, ...reviewerIds])];

    const { data: users } = await supabase.from('users')
      .select('id, name, avatar_color, department, position')
      .in('id', allIds);
    const userMap = {};
    (users || []).forEach(u => { userMap[u.id] = u; });

    res.json(rows.map(r => ({
      ...r,
      user_name:          userMap[r.user_id]?.name || '',
      user_avatar_color:  userMap[r.user_id]?.avatar_color || '',
      user_department:    userMap[r.user_id]?.department || '',
      user_position:      userMap[r.user_id]?.position || '',
      reviewer_name:      userMap[r.reviewed_by]?.name || '',
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/regularization
router.post('/', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { date, requested_check_in, requested_check_out, reason } = req.body;
    if (!date || !reason) return res.status(400).json({ error: 'date and reason are required' });
    const { data, error } = await supabase.from('attendance_regularization')
      .insert({ user_id: req.user.id, date, requested_check_in: requested_check_in || null, requested_check_out: requested_check_out || null, reason, organization_id: oId })
      .select().single();
    if (error) throw error;

    // Notify admins
    const { data: admins } = await supabase.from('users')
      .select('id').eq('organization_id', oId).in('role', ['admin', 'root_admin']);
    if (admins?.length) {
      await supabase.from('notifications').insert(admins.map(a => ({
        user_id: a.id,
        title: 'Regularization Request',
        message: `${req.user.name} requested attendance correction for ${date}`,
        type: 'regularization',
        organization_id: oId,
      })));
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/regularization/:id/review
router.put('/:id/review', async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const oId = req.user.organization_id;
    const { status, reviewer_notes } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const { data: reg } = await supabase.from('attendance_regularization')
      .select('*').eq('id', req.params.id).eq('organization_id', oId).single();
    if (!reg) return res.status(404).json({ error: 'Request not found' });

    const { data, error } = await supabase.from('attendance_regularization')
      .update({ status, reviewer_notes: reviewer_notes || '', reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;

    if (status === 'approved') {
      const reg_check_in  = reg.requested_check_in  || null;
      const reg_check_out = reg.requested_check_out || null;
      let reg_work_hours  = 0;
      if (reg_check_in && reg_check_out) {
        const [h1, m1] = reg_check_in.split(':').map(Number);
        const [h2, m2] = reg_check_out.split(':').map(Number);
        const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (mins > 0) reg_work_hours = Math.round((mins / 60) * 100) / 100;
      }
      // Update/insert attendance record as present
      await supabase.from('attendance').upsert({
        user_id: reg.user_id, date: reg.date,
        check_in: reg_check_in,
        check_out: reg_check_out,
        work_hours: reg_work_hours,
        status: 'present', organization_id: oId,
      }, { onConflict: 'user_id,date' });

      // Revert any approved leave that overlaps this date and restore the balance
      const { data: overlappingLeaves } = await supabase.from('leaves')
        .select('id, leave_type, start_date, end_date, half_day')
        .eq('user_id', reg.user_id)
        .eq('organization_id', oId)
        .eq('status', 'approved')
        .lte('start_date', reg.date)
        .gte('end_date', reg.date);

      for (const leave of (overlappingLeaves || [])) {
        // Cancel the leave
        await supabase.from('leaves').update({ status: 'cancelled' }).eq('id', leave.id);

        // Restore leave balance: calculate days to restore
        const start = new Date(leave.start_date + 'T12:00:00');
        const end   = new Date(leave.end_date   + 'T12:00:00');
        let daysToRestore = 0;
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dow = d.getDay();
          if (dow !== 0 && dow !== 6) daysToRestore++; // skip weekends
        }
        if (leave.half_day) daysToRestore = 0.5;

        if (daysToRestore > 0) {
          const { data: balance } = await supabase.from('leave_balances')
            .select('id, used_days')
            .eq('user_id', reg.user_id)
            .eq('organization_id', oId)
            .eq('leave_type', leave.leave_type)
            .maybeSingle();

          if (balance) {
            const newUsed = Math.max(0, (balance.used_days || 0) - daysToRestore);
            await supabase.from('leave_balances')
              .update({ used_days: newUsed })
              .eq('id', balance.id);
          }
        }
      }
    }

    await supabase.from('notifications').insert({
      user_id: reg.user_id,
      title: `Regularization ${status === 'approved' ? 'Approved' : 'Rejected'}`,
      message: `Your attendance correction for ${reg.date} was ${status}.${reviewer_notes ? ` Note: ${reviewer_notes}` : ''}`,
      type: 'regularization',
      organization_id: oId,
    });

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
