const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { auth } = require('../../middleware/auth');

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// GET /api/regularization
router.get('/', auth, async (req, res) => {
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
router.post('/', auth, async (req, res) => {
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
router.put('/:id/review', auth, async (req, res) => {
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

      // Fetch existing attendance record for that date
      const { data: existingAtt } = await supabase.from('attendance')
        .select('*').eq('user_id', reg.user_id).eq('date', reg.date).eq('organization_id', oId).maybeSingle();

      // Determine final check_in / check_out (merge: regularization overrides, existing fills gaps)
      const final_check_in  = reg_check_in  || (existingAtt?.check_in  || null);
      const final_check_out = reg_check_out || (existingAtt?.check_out || null);

      let reg_work_hours = existingAtt?.work_hours || 0;
      if (final_check_in && final_check_out) {
        const [h1, m1] = final_check_in.split(':').map(Number);
        const [h2, m2] = final_check_out.split(':').map(Number);
        const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (mins > 0) {
          const breakMins = existingAtt?.total_break_minutes || 0;
          const effectiveMins = Math.max(0, mins - breakMins);
          reg_work_hours = Math.round((effectiveMins / 60) * 100) / 100;
        }
      }

      const attRecord = {
        user_id: reg.user_id, date: reg.date, organization_id: oId,
        check_in:  final_check_in,
        check_out: final_check_out,
        work_hours: reg_work_hours,
        gross_hours: final_check_in && final_check_out ? (() => {
          const [h1,m1] = final_check_in.split(':').map(Number);
          const [h2,m2] = final_check_out.split(':').map(Number);
          const mins = (h2*60+m2)-(h1*60+m1);
          return mins > 0 ? Math.round((mins/60)*100)/100 : 0;
        })() : (existingAtt?.gross_hours || 0),
        status: 'present',
      };

      if (existingAtt) {
        await supabase.from('attendance').update(attRecord).eq('user_id', reg.user_id).eq('date', reg.date).eq('organization_id', oId);
      } else {
        await supabase.from('attendance').insert(attRecord);
      }

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

// DELETE /api/regularization/:id — root_admin or admin can delete pending; root_admin can delete any
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const oId = req.user.organization_id;

    const { data: reg } = await supabase.from('attendance_regularization')
      .select('id, status').eq('id', req.params.id).eq('organization_id', oId).maybeSingle();
    if (!reg) return res.status(404).json({ error: 'Request not found' });

    // HR admin can only delete pending; root admin can delete any
    if (req.user.role === 'admin' && reg.status !== 'pending') {
      return res.status(403).json({ error: 'HR admin can only delete pending requests' });
    }

    const { error } = await supabase.from('attendance_regularization')
      .delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
