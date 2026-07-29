const express = require('express');
const router  = express.Router();
const { supabase, pool } = require('../../config/db');
const { auth, adminOnly, isAdminRole } = require('../../middleware/auth');
const { flat, flatOne, orgId, getSettings, isWorkingDay, getRecipients } = require('../../utils/helpers');
const { sendMail, leaveAppliedHtml, leaveStatusHtml } = require('../../services/emailService');
const gcal = require('../../services/googleCalendar');

// ─── Leave transaction helper ─────────────────────────────────────────────────
// Builds the working-day date array for a leave span (pure calculation, no DB).
function buildWorkingDates(startDate, endDate, settings) {
  const dates = [];
  const start = new Date(startDate + 'T12:00:00');
  const end   = new Date(endDate   + 'T12:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().split('T')[0];
    if (isWorkingDay(ds, settings)) dates.push(ds);
  }
  return dates;
}

// ─── Leaves: Date Conflict Check & Balance ────────────────────────────────────
// Check for date conflicts and return leave balance for the current user
router.get('/date-check', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

    // Check for existing pending/approved leaves on the selected dates for this user.
    // WFH is allowed to coexist with a half-day leave on the same date (different dimensions).
    const { data: rawConflicts } = await supabase.from('leaves')
      .select('id, leave_type, leave_time, status, start_date, end_date')
      .eq('user_id', req.user.id)
      .eq('organization_id', orgId(req))
      .in('status', ['pending', 'approved'])
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    const { leave_time: newLeaveTime, leave_type: newLeaveType } = req.query;
    const newIsWfh  = newLeaveType === 'wfh' || newLeaveTime === 'wfh';
    const newIsHalf = newLeaveTime === 'half';
    const conflicts = (rawConflicts || []).filter(c => {
      const cIsWfh = c.leave_type === 'wfh' || c.leave_time === 'wfh';
      // Allow: existing WFH + new half-day, or existing half-day + new WFH
      if (cIsWfh && newIsHalf) return false;
      if (!cIsWfh && c.leave_time === 'half' && newIsWfh) return false;
      return true;
    });

    // Check for attendance on those dates
    const { data: attendanceRecs } = await supabase.from('attendance')
      .select('date, work_hours')
      .eq('user_id', req.user.id)
      .eq('organization_id', orgId(req))
      .gte('date', startDate)
      .lte('date', endDate)
      .gt('work_hours', 0);

    // Get leave balance per type (approved leaves this year)
    const year = new Date().getFullYear();
    const { data: approved } = await supabase.from('leaves')
      .select('leave_type, start_date, end_date, leave_time')
      .eq('user_id', req.user.id)
      .eq('organization_id', orgId(req))
      .eq('status', 'approved')
      .gte('start_date', `${year}-01-01`)
      .lte('end_date', `${year}-12-31`);

    // Fetch org holidays for this year — used to exclude holidays from leave-day count (HIGH-03)
    const { data: orgHolidays } = await supabase.from('holidays')
      .select('date').eq('organization_id', orgId(req))
      .like('date', `${year}-%`);
    const holidaySet = new Set((orgHolidays || []).map(h => h.date));

    // Count used days per type — skipping weekends AND public holidays
    const usedByType = {};
    for (const l of approved || []) {
      if (!usedByType[l.leave_type]) usedByType[l.leave_type] = 0;
      if (l.leave_time === 'half') {
        usedByType[l.leave_type] += 0.5;
      } else if (l.leave_time !== 'wfh' && l.leave_type !== 'wfh') {
        const s = new Date(l.start_date + 'T12:00:00');
        const e = new Date(l.end_date   + 'T12:00:00');
        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
          const ds  = d.toISOString().split('T')[0];
          const dow = d.getDay();
          if (dow !== 0 && dow !== 6 && !holidaySet.has(ds)) usedByType[l.leave_type] += 1;
        }
      }
    }

    // Get org leave quota — from leave_policies table, falling back to org default
    const { data: policies } = await supabase.from('leave_policies')
      .select('leave_type, annual_quota').eq('organization_id', orgId(req)).eq('active', true);
    const { data: orgRow } = await supabase.from('organizations')
      .select('total_annual_leaves').eq('id', orgId(req)).maybeSingle();
    const policyQuotas = {};
    (policies || []).forEach(p => { policyQuotas[p.leave_type] = p.annual_quota; });
    const totalAnnual = orgRow?.total_annual_leaves || 18;

    res.json({
      conflicts:    conflicts || [],
      hasAttendance: (attendanceRecs || []).length > 0,
      usedByType,
      totalAnnual,
      policyQuotas,  // per-type quotas from leave_policies table
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Leaves: Team Calendar ────────────────────────────────────────────────────
// Team calendar — all approved leaves visible to every authenticated user in the org
router.get('/team', auth, async (req, res) => {
  try {
    const { startDate, endDate, year, month } = req.query;
    let query = supabase.from('leaves')
      .select('id, user_id, start_date, end_date, leave_type, leave_time, users!leaves_user_id_fkey(name, avatar_color, department)')
      .eq('organization_id', orgId(req))
      .eq('status', 'approved')
      .order('start_date', { ascending: true });

    if (startDate && endDate) {
      query = query.lte('start_date', endDate).gte('end_date', startDate);
    } else if (year && month) {
      const ym = `${year}-${String(month).padStart(2, '0')}`;
      query = query.lte('start_date', `${ym}-31`).gte('end_date', `${ym}-01`);
    } else if (year) {
      query = query.lte('start_date', `${year}-12-31`).gte('end_date', `${year}-01-01`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const result = (data || []).map(l => ({
      id: l.id, user_id: l.user_id, start_date: l.start_date, end_date: l.end_date,
      leave_type: l.leave_type, leave_time: l.leave_time,
      name: l.users?.name, avatar_color: l.users?.avatar_color, department: l.users?.department,
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Leaves: List ─────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { userId, year, month } = req.query;
    let query = supabase.from('leaves')
      .select('*, users!leaves_user_id_fkey(name, email, avatar_color, department), approver:users!leaves_approved_by_fkey(name)')
      .eq('organization_id', orgId(req))
      .order('created_at', { ascending: false });

    if (!isAdminRole(req.user.role)) {
      query = query.eq('user_id', req.user.id);
    } else if (userId) {
      query = query.eq('user_id', parseInt(userId));
    }
    if (year && month) {
      const ym = `${year}-${String(month).padStart(2,'0')}`;
      query = query.lte('start_date', `${ym}-31`).gte('end_date', `${ym}-01`);
    } else if (year) {
      query = query.lte('start_date', `${year}-12-31`).gte('end_date', `${year}-01-01`);
    } else if (req.query.startDate && req.query.endDate) {
      query = query.lte('start_date', req.query.endDate).gte('end_date', req.query.startDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const result = (data || []).map(l => ({
      ...l,
      ...l.users,
      approver_name: l.approver?.name,
      users:    undefined,
      approver: undefined,
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Leaves: Create ───────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { start_date, end_date, leave_type, reason, user_id, leave_time, half_type } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ error: 'Start and end dates required' });
    if (start_date > end_date)    return res.status(400).json({ error: 'Start date must be before end date' });

    const targetUserId = (isAdminRole(req.user.role) && user_id) ? parseInt(user_id) : req.user.id;
    const isOnBehalf   = isAdminRole(req.user.role) && targetUserId !== req.user.id;

    // Employee leave submission — single write, no transaction needed
    if (!isOnBehalf) {
      const insertPayload = {
        user_id: targetUserId, start_date, end_date,
        leave_type: leave_type||'casual', reason: reason||'',
        leave_time: leave_time||'full',
        half_type:  leave_time === 'half' ? (half_type||'first_half') : null,
        organization_id: orgId(req),
      };
      const { data, error } = await supabase.from('leaves')
        .insert(insertPayload)
        .select('*, users!leaves_user_id_fkey(name, email, department)').single();
      if (error) throw new Error(error.message);

      if (req.user.role === 'employee') {
        const emp = data.users || {};
        const recipients = await getRecipients(orgId(req));
        if (recipients.length > 0) {
          sendMail({
            to: recipients,
            subject: `${leave_type === 'wfh' ? 'WFH Request' : 'Leave Request'} — ${emp.name || req.user.name} (${leave_type || 'casual'})`,
            html: leaveAppliedHtml(
              { name: emp.name || req.user.name, email: emp.email || req.user.email, department: emp.department || req.user.department },
              data
            ),
          });
        }
      }
      return res.json(flatOne(data));
    }

    // Admin creates on behalf — leave INSERT + attendance upsert must be atomic.
    // If attendance fails, the leave should not exist as 'approved'.
    const settings  = await getSettings(orgId(req));
    const attStatus = leave_time === 'half' ? 'half_day' : (leave_time === 'wfh' || leave_type === 'wfh') ? 'wfh' : 'on_leave';
    const workDates = buildWorkingDates(start_date, end_date, settings);
    const approvedAt = new Date().toISOString();

    const client = await pool.connect();
    let leaveId;
    try {
      await client.query('BEGIN');

      const leaveRes = await client.query(
        `INSERT INTO leaves
           (user_id, start_date, end_date, leave_type, reason, leave_time, half_type,
            status, approved_by, approved_at, organization_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'approved',$8,$9,$10)
         RETURNING id`,
        [targetUserId, start_date, end_date, leave_type||'casual', reason||'',
         leave_time||'full', leave_time === 'half' ? (half_type||'first_half') : null,
         req.user.id, approvedAt, orgId(req)]
      );
      leaveId = leaveRes.rows[0].id;

      for (const ds of workDates) {
        await client.query(
          `INSERT INTO attendance (user_id, date, status, organization_id)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (user_id, date, organization_id) DO UPDATE SET status = EXCLUDED.status`,
          [targetUserId, ds, attStatus, orgId(req)]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Leave creation failed — no changes saved. ' + err.message });
    } finally {
      client.release();
    }

    // Post-transaction fetch for full response payload
    const { data } = await supabase.from('leaves')
      .select('*, users!leaves_user_id_fkey(name, email, department)')
      .eq('id', leaveId).single();

    if (data.users?.email) {
      sendMail({ to: data.users.email, subject: `Leave Added — ${req.user.name || 'HR'}`, html: leaveStatusHtml(data.users, data, 'approved', req.user.name) });
    }
    return res.json(flatOne(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Leaves: Update ───────────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const { data: leave } = await supabase.from('leaves').select('*').eq('id', req.params.id).maybeSingle();
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    if (!isAdminRole(req.user.role) && leave.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (leave.status === 'approved' && !isAdminRole(req.user.role)) return res.status(400).json({ error: 'Cannot edit an approved leave' });

    const { start_date, end_date, leave_type, reason, leave_time, half_type } = req.body;
    if (start_date && end_date && start_date > end_date) return res.status(400).json({ error: 'Start date must be before end date' });

    await supabase.from('leaves').update({
      ...(start_date && { start_date }),
      ...(end_date   && { end_date }),
      ...(leave_type && { leave_type }),
      reason: reason ?? leave.reason,
      leave_time: leave_time || leave.leave_time,
      half_type:  (leave_time || leave.leave_time) === 'half' ? (half_type || leave.half_type || 'first_half') : null,
    }).eq('id', req.params.id);

    const { data } = await supabase.from('leaves').select('*, users!leaves_user_id_fkey(name)').eq('id', req.params.id).single();
    res.json(flatOne(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Leaves: Approve ─────────────────────────────────────────────────────────
router.put('/:id/approve', auth, adminOnly, async (req, res) => {
  // Read leave + settings BEFORE opening the transaction (reads don't need the lock)
  const { data: leave, error: le } = await supabase.from('leaves').select('*').eq('id', req.params.id).single();
  if (le || !leave) return res.status(404).json({ error: 'Leave not found' });
  if (leave.status === 'approved') return res.json(leave);

  const settings   = await getSettings(orgId(req));
  const workDates  = buildWorkingDates(leave.start_date, leave.end_date, settings);
  const attStatus  = leave.leave_time === 'half' ? 'half_day'
    : (leave.leave_time === 'wfh' || leave.leave_type === 'wfh') ? 'wfh'
    : 'on_leave';
  const approvedAt = new Date().toISOString();

  // True PostgreSQL transaction — attendance upsert + leave status change are atomic.
  // If either fails, the whole operation is rolled back and neither write persists.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const ds of workDates) {
      await client.query(
        `INSERT INTO attendance (user_id, date, status, organization_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, date, organization_id)
         DO UPDATE SET status = EXCLUDED.status`,
        [leave.user_id, ds, attStatus, orgId(req)]
      );
    }

    await client.query(
      `UPDATE leaves SET status = 'approved', approved_by = $1, approved_at = $2 WHERE id = $3`,
      [req.user.id, approvedAt, req.params.id]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Approval failed — no changes were saved. ' + err.message });
  } finally {
    client.release();
  }

  // Post-transaction: fetch updated record for response
  const { data } = await supabase.from('leaves')
    .select('*, users!leaves_user_id_fkey(name, email)').eq('id', req.params.id).single();

  // Fire-and-forget side effects (never affect data integrity)
  if (data.users?.email) {
    sendMail({ to: data.users.email, subject: 'Your Leave Request has been Approved — HR Tracker', html: leaveStatusHtml(data.users, leave, 'approved', req.user.name) });
  }
  gcal.createLeaveEvent(leave, data.users?.name || 'Employee')
    .then(gcalId => { if (gcalId) supabase.from('leaves').update({ google_event_id: gcalId }).eq('id', req.params.id).then(() => {}); })
    .catch(() => {});

  res.json(flatOne(data));
});

// ─── Leaves: Reject ───────────────────────────────────────────────────────────
router.put('/:id/reject', auth, adminOnly, async (req, res) => {
  const { data: leave } = await supabase.from('leaves').select('*').eq('id', req.params.id).single();
  if (!leave) return res.status(404).json({ error: 'Leave not found' });
  if (leave.status === 'rejected') return res.json(leave);

  const { remarks } = req.body || {};
  const rejectedAt = new Date().toISOString();

  // Pre-calculate attendance dates to delete (pure JS — no DB writes yet)
  let workDates = [];
  if (leave.status === 'approved') {
    const settings = await getSettings(orgId(req));
    workDates = buildWorkingDates(leave.start_date, leave.end_date, settings);
  }

  // Atomic transaction: attendance deletion + leave status change
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (workDates.length) {
      await client.query(
        `DELETE FROM attendance
         WHERE user_id = $1 AND organization_id = $2
           AND date = ANY($3::text[])
           AND status = ANY(ARRAY['on_leave','half_day','wfh'])`,
        [leave.user_id, orgId(req), workDates]
      );
    }

    // Update leave — always include remarks column (null if not provided)
    await client.query(
      `UPDATE leaves
       SET status = 'rejected', approved_by = $1, approved_at = $2,
           google_event_id = NULL, remarks = $3
       WHERE id = $4`,
      [req.user.id, rejectedAt, remarks || null, req.params.id]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Rejection failed — no changes were saved. ' + err.message });
  } finally {
    client.release();
  }

  // Fire-and-forget side effects
  if (leave.google_event_id) gcal.deleteLeaveEvent(leave.google_event_id);
  const { data } = await supabase.from('leaves')
    .select('*, users!leaves_user_id_fkey(name, email)').eq('id', req.params.id).single();
  if (data.users?.email) {
    sendMail({ to: data.users.email, subject: 'Your Leave Request has been Rejected — Lumens HR', html: leaveStatusHtml(data.users, leave, 'rejected', req.user.name) });
  }
  res.json(flatOne(data));
});

// ─── Leaves: Revert (cancel approved leave) ───────────────────────────────────
router.put('/:id/revert', auth, async (req, res) => {
  const { data: leave } = await supabase.from('leaves').select('*').eq('id', req.params.id).maybeSingle();
  if (!leave) return res.status(404).json({ error: 'Leave not found' });
  if (!isAdminRole(req.user.role) && leave.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
  if (leave.status !== 'approved') return res.status(400).json({ error: 'Only approved leaves can be reverted' });

  const settings  = await getSettings(orgId(req));
  const workDates = buildWorkingDates(leave.start_date, leave.end_date, settings);

  // Atomic transaction: attendance deletion + leave cancellation
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (workDates.length) {
      await client.query(
        `DELETE FROM attendance
         WHERE user_id = $1 AND organization_id = $2
           AND date = ANY($3::text[])
           AND status = ANY(ARRAY['on_leave','half_day','wfh'])`,
        [leave.user_id, orgId(req), workDates]
      );
    }

    await client.query(
      `UPDATE leaves SET status = 'cancelled', google_event_id = NULL WHERE id = $1`,
      [req.params.id]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Revert failed — no changes were saved. ' + err.message });
  } finally {
    client.release();
  }

  if (leave.google_event_id) gcal.deleteLeaveEvent(leave.google_event_id);
  const { data } = await supabase.from('leaves')
    .select('*, users!leaves_user_id_fkey(name, email)').eq('id', req.params.id).single();
  res.json(flatOne(data));
});

// ─── Leaves: Delete ───────────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  const { data: leave } = await supabase.from('leaves').select('*').eq('id', req.params.id).maybeSingle();
  if (!leave) return res.status(404).json({ error: 'Leave not found' });
  if (!isAdminRole(req.user.role) && leave.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
  if (leave.status === 'approved' && !isAdminRole(req.user.role)) return res.status(400).json({ error: 'Cannot cancel approved leave' });

  let workDates = [];
  if (leave.status === 'approved') {
    const settings = await getSettings(orgId(req));
    workDates = buildWorkingDates(leave.start_date, leave.end_date, settings);
  }

  // Atomic transaction: attendance cleanup + leave deletion
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (workDates.length) {
      await client.query(
        `DELETE FROM attendance
         WHERE user_id = $1 AND organization_id = $2
           AND date = ANY($3::text[])
           AND status = ANY(ARRAY['on_leave','half_day','wfh'])`,
        [leave.user_id, orgId(req), workDates]
      );
    }

    await client.query(`DELETE FROM leaves WHERE id = $1`, [req.params.id]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Delete failed — no changes were saved. ' + err.message });
  } finally {
    client.release();
  }

  if (leave.google_event_id) gcal.deleteLeaveEvent(leave.google_event_id);
  res.json({ success: true });
});

module.exports = router;
