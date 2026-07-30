const express = require('express');
const router  = express.Router();
const { supabase, pool } = require('../../config/db');
const { auth, adminOnly, rootAdminOnly, isAdminRole } = require('../../middleware/auth');
const { flat, flatOne, orgId, getSettings, isWorkingDay, getRecipients } = require('../../utils/helpers');
const { sendMail, leaveAppliedHtml, leaveStatusHtml, leaveDeptApprovalHtml, leaveForwardedToRootHtml } = require('../../services/emailService');
const gcal = require('../../services/googleCalendar');

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// Find the department head user_id for a given employee.
// Returns null if: no department, no dept head, or employee IS the dept head.
async function findDeptHead(userId, oId) {
  const { data: user } = await supabase
    .from('users')
    .select('department_id')
    .eq('id', userId)
    .eq('organization_id', oId)
    .maybeSingle();
  if (!user?.department_id) return null;

  const { data: dept } = await supabase
    .from('departments')
    .select('head_user_id')
    .eq('id', user.department_id)
    .eq('organization_id', oId)
    .maybeSingle();

  const headId = dept?.head_user_id;
  if (!headId || headId === userId) return null;
  return headId;
}

// Append an immutable audit record to leave_approval_log.
function logApprovalAction({ leaveId, oId, actorId, actorName, action, fromStatus, toStatus, notes }) {
  return supabase.from('leave_approval_log').insert({
    leave_id:    leaveId,
    org_id:      oId,
    actor_id:    actorId,
    actor_name:  actorName || null,
    action,
    from_status: fromStatus || null,
    to_status:   toStatus   || null,
    notes:       notes      || null,
  }).then(() => {});
}

// Send an in-app notification (fire-and-forget).
function notify(userId, title, message, oId) {
  supabase.from('notifications').insert({
    user_id: userId, title, message, type: 'leave', organization_id: oId,
  }).then(() => {});
}

// ─── ROUTE 1: GET /date-check ─────────────────────────────────────────────────
router.get('/date-check', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

    const { data: rawConflicts } = await supabase.from('leaves')
      .select('id, leave_type, leave_time, status, start_date, end_date')
      .eq('user_id', req.user.id)
      .eq('organization_id', orgId(req))
      .in('status', ['pending','pending_dept','pending_root','approved'])
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    const { leave_time: newLeaveTime, leave_type: newLeaveType } = req.query;
    const newIsWfh  = newLeaveType === 'wfh' || newLeaveTime === 'wfh';
    const newIsHalf = newLeaveTime === 'half';
    const conflicts = (rawConflicts || []).filter(c => {
      const cIsWfh = c.leave_type === 'wfh' || c.leave_time === 'wfh';
      if (cIsWfh && newIsHalf) return false;
      if (!cIsWfh && c.leave_time === 'half' && newIsWfh) return false;
      return true;
    });

    const { data: attendanceRecs } = await supabase.from('attendance')
      .select('date, work_hours')
      .eq('user_id', req.user.id)
      .eq('organization_id', orgId(req))
      .gte('date', startDate)
      .lte('date', endDate)
      .gt('work_hours', 0);

    const year = new Date().getFullYear();
    const { data: approved } = await supabase.from('leaves')
      .select('leave_type, start_date, end_date, leave_time')
      .eq('user_id', req.user.id)
      .eq('organization_id', orgId(req))
      .eq('status', 'approved')
      .gte('start_date', `${year}-01-01`)
      .lte('end_date', `${year}-12-31`);

    const { data: orgHolidays } = await supabase.from('holidays')
      .select('date').eq('organization_id', orgId(req))
      .like('date', `${year}-%`);
    const holidaySet = new Set((orgHolidays || []).map(h => h.date));

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

    const { data: policies } = await supabase.from('leave_policies')
      .select('leave_type, annual_quota').eq('organization_id', orgId(req)).eq('active', true);
    const { data: orgRow } = await supabase.from('organizations')
      .select('total_annual_leaves').eq('id', orgId(req)).maybeSingle();
    const policyQuotas = {};
    (policies || []).forEach(p => { policyQuotas[p.leave_type] = p.annual_quota; });
    const totalAnnual = orgRow?.total_annual_leaves || 18;

    res.json({
      conflicts: conflicts || [],
      hasAttendance: (attendanceRecs || []).length > 0,
      usedByType,
      totalAnnual,
      policyQuotas,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ROUTE 2: GET /team ───────────────────────────────────────────────────────
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

    res.json((data || []).map(l => ({
      id: l.id, user_id: l.user_id, start_date: l.start_date, end_date: l.end_date,
      leave_type: l.leave_type, leave_time: l.leave_time,
      name: l.users?.name, avatar_color: l.users?.avatar_color, department: l.users?.department,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ROUTE 3: GET /is-dept-head ───────────────────────────────────────────────
// Returns whether the calling user is a department head in their org.
// MUST be before GET /:id.
router.get('/is-dept-head', auth, async (req, res) => {
  try {
    const oId = orgId(req);
    const { data: dept } = await supabase
      .from('departments')
      .select('id, name')
      .eq('head_user_id', req.user.id)
      .eq('organization_id', oId)
      .maybeSingle();

    if (!dept) return res.json({ is_dept_head: false });
    res.json({ is_dept_head: true, department_id: dept.id, department_name: dept.name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ROUTE 4: GET /pending-department ────────────────────────────────────────
// Dept Head: leaves from their department employees pending dept approval.
// MUST be before GET /:id.
router.get('/pending-department', auth, async (req, res) => {
  try {
    const oId = orgId(req);

    // Find department(s) where this user is the head
    const { data: myDepts } = await supabase
      .from('departments')
      .select('id, name')
      .eq('head_user_id', req.user.id)
      .eq('organization_id', oId);

    if (!myDepts?.length) return res.json([]);

    const deptIds = myDepts.map(d => d.id);

    // Find employees in those departments (via primary department_id FK)
    const empRes = await pool.query(
      `SELECT id FROM users WHERE department_id = ANY($1::bigint[]) AND organization_id = $2 AND id != $3`,
      [deptIds, oId, req.user.id]
    );
    if (!empRes.rows.length) return res.json([]);

    const empIds = empRes.rows.map(r => r.id);

    const { data, error } = await supabase
      .from('leaves')
      .select('*, users!leaves_user_id_fkey(id, name, email, department, avatar_color, position)')
      .eq('organization_id', oId)
      .eq('status', 'pending_dept')
      .is('deleted_at', null)
      .in('user_id', empIds)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json((data || []).map(l => ({ ...l, ...l.users, users: undefined })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ROUTE 5: GET /pending-root ───────────────────────────────────────────────
// Root Admin: all leaves pending final approval.
// MUST be before GET /:id.
router.get('/pending-root', auth, adminOnly, async (req, res) => {
  try {
    const oId = orgId(req);
    const { data, error } = await supabase
      .from('leaves')
      .select('*, users!leaves_user_id_fkey(id, name, email, department, avatar_color, position)')
      .eq('organization_id', oId)
      .eq('status', 'pending_root')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json((data || []).map(l => ({ ...l, ...l.users, users: undefined })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ROUTE 6: GET / — list leaves ────────────────────────────────────────────
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

    res.json((data || []).map(l => ({
      ...l, ...l.users,
      approver_name: l.approver?.name,
      users: undefined, approver: undefined,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ROUTE 7: POST / — create leave ──────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { start_date, end_date, leave_type, reason, user_id, leave_time, half_type } = req.body;
    if (!start_date || !end_date) return res.status(400).json({ error: 'Start and end dates required' });
    if (start_date > end_date)    return res.status(400).json({ error: 'Start date must be before end date' });

    if (leave_time !== 'wfh' && leave_type !== 'wfh') {
      const settings = await getSettings(orgId(req));
      const checkDates = buildWorkingDates(start_date, end_date, settings);
      if (checkDates.length === 0) {
        return res.status(400).json({ error: 'The selected date range contains no working days.' });
      }
    }

    const targetUserId = (isAdminRole(req.user.role) && user_id) ? parseInt(user_id) : req.user.id;
    const isOnBehalf   = isAdminRole(req.user.role) && targetUserId !== req.user.id;

    // ── Admin creates on behalf → auto-approve (existing behavior unchanged) ──
    if (isOnBehalf) {
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
              status, approved_by, approved_at, organization_id,
              dept_head_status, root_admin_status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'approved',$8,$9,$10,'approved','approved')
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
        return res.status(500).json({ error: 'Leave creation failed. ' + err.message });
      } finally { client.release(); }

      const { data } = await supabase.from('leaves')
        .select('*, users!leaves_user_id_fkey(name, email, department)')
        .eq('id', leaveId).single();

      if (data.users?.email) {
        sendMail({ to: data.users.email, subject: `Leave Added — ${req.user.name || 'HR'}`, html: leaveStatusHtml(data.users, data, 'approved', req.user.name) });
      }
      return res.json(flatOne(data));
    }

    // ── Employee self-submit: determine initial status via dept head lookup ────
    const deptHeadId   = await findDeptHead(targetUserId, orgId(req));
    const initialStatus = deptHeadId ? 'pending_dept' : 'pending_root';

    const insertPayload = {
      user_id: targetUserId, start_date, end_date,
      leave_type: leave_type||'casual', reason: reason||'',
      leave_time: leave_time||'full',
      half_type:  leave_time === 'half' ? (half_type||'first_half') : null,
      organization_id: orgId(req),
      status: initialStatus,
    };

    const { data, error } = await supabase.from('leaves')
      .insert(insertPayload)
      .select('*, users!leaves_user_id_fkey(name, email, department)')
      .single();
    if (error) throw new Error(error.message);

    const leaveId  = data.id;
    const emp      = data.users || {};
    const empName  = emp.name || req.user.name;
    const empEmail = emp.email || req.user.email;

    // Audit log
    logApprovalAction({
      leaveId, oId: orgId(req), actorId: req.user.id, actorName: empName,
      action: 'submitted', fromStatus: null, toStatus: initialStatus,
    });

    // Notifications + email
    if (deptHeadId) {
      // Notify dept head
      notify(deptHeadId,
        `New Leave Request from ${empName}`,
        `${empName} has applied for ${leave_type || 'casual'} leave from ${start_date} to ${end_date}. Your approval is required.`,
        orgId(req)
      );
      // Email dept head if they have an email
      const { data: dhUser } = await supabase.from('users').select('name, email').eq('id', deptHeadId).maybeSingle();
      if (dhUser?.email && typeof leaveDeptApprovalHtml === 'function') {
        sendMail({
          to: dhUser.email,
          subject: `Leave Request Pending Your Approval — ${empName}`,
          html: leaveDeptApprovalHtml({ name: empName, email: empEmail, department: emp.department }, data, dhUser.name),
        });
      }
    } else {
      // No dept head → notify root admins directly
      const recipients = await getRecipients(orgId(req));
      if (recipients.length > 0) {
        sendMail({
          to: recipients,
          subject: `${leave_type === 'wfh' ? 'WFH Request' : 'Leave Request'} — ${empName}`,
          html: leaveAppliedHtml({ name: empName, email: empEmail, department: emp.department }, data),
        });
      }
    }

    return res.json(flatOne(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ROUTE 8: PUT /:id — edit leave ──────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const { data: leave } = await supabase.from('leaves').select('*').eq('id', req.params.id).eq('organization_id', orgId(req)).maybeSingle();
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    if (!isAdminRole(req.user.role) && leave.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (['approved','rejected'].includes(leave.status) && !isAdminRole(req.user.role)) {
      return res.status(400).json({ error: 'Cannot edit an approved or rejected leave' });
    }

    const { start_date, end_date, leave_type, reason, leave_time, half_type } = req.body;
    if (start_date && end_date && start_date > end_date) return res.status(400).json({ error: 'Start date must be before end date' });

    await supabase.from('leaves').update({
      ...(start_date && { start_date }),
      ...(end_date   && { end_date }),
      ...(leave_type && { leave_type }),
      reason: reason ?? leave.reason,
      leave_time: leave_time || leave.leave_time,
      half_type:  (leave_time || leave.leave_time) === 'half' ? (half_type || leave.half_type || 'first_half') : null,
    }).eq('id', req.params.id).eq('organization_id', orgId(req));

    const { data } = await supabase.from('leaves').select('*, users!leaves_user_id_fkey(name)').eq('id', req.params.id).eq('organization_id', orgId(req)).single();
    res.json(flatOne(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ROUTE 9: PUT /:id/approve — existing approve (backward compat) ───────────
// Handles: status='pending' (old flow) → direct approve by admin.
// Handles: status='pending_root' → treated as final-approve (same logic).
// Blocks:  status='pending_dept' → dept head must act first.
router.put('/:id/approve', auth, adminOnly, async (req, res) => {
  const { data: leave, error: le } = await supabase.from('leaves').select('*').eq('id', req.params.id).eq('organization_id', orgId(req)).single();
  if (le || !leave) return res.status(404).json({ error: 'Leave not found' });

  if (leave.status === 'approved') return res.json(leave);

  if (leave.status === 'pending_dept') {
    return res.status(400).json({
      error: 'This leave is waiting for Department Head approval. The Department Head must forward it before you can approve.',
      current_status: 'pending_dept',
    });
  }

  if (leave.status === 'rejected' || leave.status === 'cancelled') {
    return res.status(409).json({
      error: `Cannot approve a ${leave.status} leave.`,
      current_status: leave.status,
    });
  }

  // For pending_root and legacy pending: only root_admin performs final approve
  if (leave.status === 'pending_root' && req.user.role !== 'root_admin') {
    return res.status(403).json({ error: 'Only Root Admin can give final approval. This leave is pending root admin decision.' });
  }

  const settings   = await getSettings(orgId(req));
  const workDates  = buildWorkingDates(leave.start_date, leave.end_date, settings);
  const attStatus  = leave.leave_time === 'half' ? 'half_day'
    : (leave.leave_time === 'wfh' || leave.leave_type === 'wfh') ? 'wfh'
    : 'on_leave';
  const approvedAt = new Date().toISOString();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const ds of workDates) {
      await client.query(
        `INSERT INTO attendance (user_id, date, status, organization_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, date, organization_id) DO UPDATE SET status = EXCLUDED.status`,
        [leave.user_id, ds, attStatus, orgId(req)]
      );
    }
    await client.query(
      `UPDATE leaves SET
         status = 'approved', approved_by = $1, approved_at = $2,
         root_admin_status = 'approved', root_admin_id = $1, root_admin_reviewed_at = $2
       WHERE id = $3 AND organization_id = $4`,
      [req.user.id, approvedAt, req.params.id, orgId(req)]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Approval failed. ' + err.message });
  } finally { client.release(); }

  logApprovalAction({
    leaveId: leave.id, oId: orgId(req), actorId: req.user.id, actorName: req.user.name,
    action: 'root_approved', fromStatus: leave.status, toStatus: 'approved',
  });

  const { data } = await supabase.from('leaves')
    .select('*, users!leaves_user_id_fkey(name, email)').eq('id', req.params.id).eq('organization_id', orgId(req)).single();

  notify(leave.user_id, 'Leave Approved', `Your leave request from ${leave.start_date} to ${leave.end_date} has been approved.`, orgId(req));

  if (data.users?.email) {
    sendMail({ to: data.users.email, subject: 'Your Leave Request has been Approved', html: leaveStatusHtml(data.users, leave, 'approved', req.user.name) });
  }
  gcal.createLeaveEvent(leave, data.users?.name || 'Employee')
    .then(gcalId => { if (gcalId) supabase.from('leaves').update({ google_event_id: gcalId }).eq('id', req.params.id).eq('organization_id', orgId(req)).then(() => {}); })
    .catch(() => {});

  res.json(flatOne(data));
});

// ─── ROUTE 10: PUT /:id/reject ────────────────────────────────────────────────
router.put('/:id/reject', auth, adminOnly, async (req, res) => {
  const { data: leave } = await supabase.from('leaves').select('*').eq('id', req.params.id).eq('organization_id', orgId(req)).single();
  if (!leave) return res.status(404).json({ error: 'Leave not found' });
  if (leave.status === 'rejected') return res.json(leave);

  if (leave.status === 'pending_dept') {
    return res.status(400).json({
      error: 'This leave has not been forwarded by the Department Head yet. Only Root Admin can reject after dept head review.',
      current_status: 'pending_dept',
    });
  }

  if (leave.status === 'pending_root' && req.user.role !== 'root_admin') {
    return res.status(403).json({ error: 'Only Root Admin can make the final decision.' });
  }

  const { remarks } = req.body || {};
  const rejectedAt = new Date().toISOString();

  let workDates = [];
  if (leave.status === 'approved') {
    const settings = await getSettings(orgId(req));
    workDates = buildWorkingDates(leave.start_date, leave.end_date, settings);
  }

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
      `UPDATE leaves SET
         status = 'rejected', approved_by = $1, approved_at = $2,
         google_event_id = NULL, remarks = $3,
         root_admin_status = 'rejected', root_admin_id = $1, root_admin_reviewed_at = $2
       WHERE id = $4 AND organization_id = $5`,
      [req.user.id, rejectedAt, remarks || null, req.params.id, orgId(req)]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Rejection failed. ' + err.message });
  } finally { client.release(); }

  logApprovalAction({
    leaveId: leave.id, oId: orgId(req), actorId: req.user.id, actorName: req.user.name,
    action: 'root_rejected', fromStatus: leave.status, toStatus: 'rejected', notes: remarks,
  });

  if (leave.google_event_id) gcal.deleteLeaveEvent(leave.google_event_id);

  notify(leave.user_id, 'Leave Request Rejected', `Your leave request from ${leave.start_date} to ${leave.end_date} has been rejected.`, orgId(req));

  const { data } = await supabase.from('leaves')
    .select('*, users!leaves_user_id_fkey(name, email)').eq('id', req.params.id).eq('organization_id', orgId(req)).single();
  if (data.users?.email) {
    sendMail({ to: data.users.email, subject: 'Your Leave Request has been Rejected', html: leaveStatusHtml(data.users, leave, 'rejected', req.user.name) });
  }
  res.json(flatOne(data));
});

// ─── ROUTE 11: PUT /:id/revert ────────────────────────────────────────────────
router.put('/:id/revert', auth, async (req, res) => {
  const { data: leave } = await supabase.from('leaves').select('*').eq('id', req.params.id).eq('organization_id', orgId(req)).maybeSingle();
  if (!leave) return res.status(404).json({ error: 'Leave not found' });
  if (!isAdminRole(req.user.role) && leave.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
  if (leave.status !== 'approved') return res.status(400).json({ error: 'Only approved leaves can be reverted' });

  const settings  = await getSettings(orgId(req));
  const workDates = buildWorkingDates(leave.start_date, leave.end_date, settings);

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
      `UPDATE leaves SET status = 'cancelled', google_event_id = NULL WHERE id = $1 AND organization_id = $2`,
      [req.params.id, orgId(req)]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Revert failed. ' + err.message });
  } finally { client.release(); }

  logApprovalAction({
    leaveId: leave.id, oId: orgId(req), actorId: req.user.id, actorName: req.user.name,
    action: 'cancelled', fromStatus: 'approved', toStatus: 'cancelled',
  });

  if (leave.google_event_id) gcal.deleteLeaveEvent(leave.google_event_id);
  const { data } = await supabase.from('leaves')
    .select('*, users!leaves_user_id_fkey(name, email)').eq('id', req.params.id).eq('organization_id', orgId(req)).single();
  res.json(flatOne(data));
});

// ─── ROUTE 12: DELETE /:id ────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  const { data: leave } = await supabase.from('leaves').select('*').eq('id', req.params.id).eq('organization_id', orgId(req)).maybeSingle();
  if (!leave) return res.status(404).json({ error: 'Leave not found' });
  if (!isAdminRole(req.user.role) && leave.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
  if (leave.status === 'approved' && !isAdminRole(req.user.role)) return res.status(400).json({ error: 'Cannot cancel approved leave' });

  let workDates = [];
  if (leave.status === 'approved') {
    const settings = await getSettings(orgId(req));
    workDates = buildWorkingDates(leave.start_date, leave.end_date, settings);
  }

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
    await client.query(`DELETE FROM leaves WHERE id = $1 AND organization_id = $2`, [req.params.id, orgId(req)]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Delete failed. ' + err.message });
  } finally { client.release(); }

  if (leave.google_event_id) gcal.deleteLeaveEvent(leave.google_event_id);
  res.json({ success: true });
});

// ─── ROUTE 13: POST /:id/department-approve ───────────────────────────────────
// Department Head forwards leave to Root Admin for final decision.
// Dept head CANNOT reject — only recommend and forward.
router.post('/:id/department-approve', auth, async (req, res) => {
  try {
    const oId     = orgId(req);
    const leaveId = parseInt(req.params.id, 10);
    if (!leaveId) return res.status(400).json({ error: 'Invalid leave ID' });

    const { data: leave } = await supabase.from('leaves')
      .select('*, users!leaves_user_id_fkey(name, email, department, department_id)')
      .eq('id', leaveId)
      .eq('organization_id', oId)
      .maybeSingle();

    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    if (leave.status !== 'pending_dept') {
      return res.status(400).json({
        error: `This leave is not pending department approval. Current status: ${leave.status}`,
        current_status: leave.status,
      });
    }

    // Security: verify the caller is the dept head for THIS employee's department
    const empDeptId = leave.users?.department_id;
    if (!empDeptId) {
      return res.status(400).json({ error: 'Employee has no department assigned. Cannot process department approval.' });
    }

    const { data: dept } = await supabase.from('departments')
      .select('id, head_user_id, name')
      .eq('id', empDeptId)
      .eq('organization_id', oId)
      .maybeSingle();

    if (!dept?.head_user_id || dept.head_user_id !== req.user.id) {
      return res.status(403).json({ error: 'You are not the Department Head for this employee\'s department.' });
    }

    const now = new Date().toISOString();
    const { notes } = req.body || {};

    const { error: updateError } = await supabase.from('leaves').update({
      status:                 'pending_root',
      dept_head_status:       'approved',
      dept_head_id:           req.user.id,
      dept_head_reviewed_at:  now,
    }).eq('id', leaveId).eq('organization_id', oId);

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update leave status. ' + updateError.message });
    }

    // Audit log
    logApprovalAction({
      leaveId, oId, actorId: req.user.id, actorName: req.user.name,
      action: 'dept_approved', fromStatus: 'pending_dept', toStatus: 'pending_root', notes,
    });

    const empName = leave.users?.name || 'Employee';

    // Notify employee: dept head approved, now waiting for root admin
    notify(leave.user_id,
      'Department Head Approved Your Leave',
      `${req.user.name} (${dept.name} Head) has forwarded your leave request to the Root Admin for final approval.`,
      oId
    );

    // Notify root admins: new leave waiting for final decision
    const rootAdmins = await pool.query(
      `SELECT id, name FROM users WHERE role = 'root_admin' AND organization_id = $1`,
      [oId]
    );
    for (const ra of rootAdmins.rows) {
      notify(ra.id,
        `Leave Request Awaiting Final Approval — ${empName}`,
        `${empName}'s leave (${leave.start_date} to ${leave.end_date}) has been approved by the Department Head and requires your final decision.`,
        oId
      );
    }

    // Email root admins
    const recipients = await getRecipients(oId);
    if (recipients.length > 0 && typeof leaveForwardedToRootHtml === 'function') {
      sendMail({
        to: recipients,
        subject: `Leave Forwarded for Final Approval — ${empName}`,
        html: leaveForwardedToRootHtml(
          { name: empName, email: leave.users?.email, department: leave.users?.department },
          leave,
          req.user.name
        ),
      });
    }

    // Fetch updated leave for response
    const { data: updated } = await supabase.from('leaves')
      .select('*').eq('id', leaveId).eq('organization_id', oId).single();
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ROUTE 14: POST /:id/final-approve ───────────────────────────────────────
// Root Admin gives final approval to a leave in pending_root status.
router.post('/:id/final-approve', auth, rootAdminOnly, async (req, res) => {
  try {
    const oId     = orgId(req);
    const leaveId = parseInt(req.params.id, 10);
    if (!leaveId) return res.status(400).json({ error: 'Invalid leave ID' });

    const { data: leave } = await supabase.from('leaves')
      .select('*').eq('id', leaveId).eq('organization_id', oId).maybeSingle();
    if (!leave) return res.status(404).json({ error: 'Leave not found' });

    if (leave.status === 'approved') return res.json(leave); // idempotent

    if (leave.status !== 'pending_root') {
      return res.status(400).json({
        error: `Cannot final-approve a leave with status '${leave.status}'. Must be 'pending_root'.`,
        current_status: leave.status,
      });
    }

    const settings   = await getSettings(oId);
    const workDates  = buildWorkingDates(leave.start_date, leave.end_date, settings);
    const attStatus  = leave.leave_time === 'half' ? 'half_day'
      : (leave.leave_time === 'wfh' || leave.leave_type === 'wfh') ? 'wfh'
      : 'on_leave';
    const approvedAt = new Date().toISOString();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const ds of workDates) {
        await client.query(
          `INSERT INTO attendance (user_id, date, status, organization_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, date, organization_id) DO UPDATE SET status = EXCLUDED.status`,
          [leave.user_id, ds, attStatus, oId]
        );
      }
      await client.query(
        `UPDATE leaves SET
           status = 'approved', approved_by = $1, approved_at = $2,
           root_admin_status = 'approved', root_admin_id = $1, root_admin_reviewed_at = $2
         WHERE id = $3 AND organization_id = $4`,
        [req.user.id, approvedAt, leaveId, oId]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Final approval failed. ' + err.message });
    } finally { client.release(); }

    logApprovalAction({
      leaveId, oId, actorId: req.user.id, actorName: req.user.name,
      action: 'root_approved', fromStatus: 'pending_root', toStatus: 'approved',
    });

    const { data } = await supabase.from('leaves')
      .select('*, users!leaves_user_id_fkey(name, email)').eq('id', leaveId).eq('organization_id', oId).single();

    notify(leave.user_id, 'Leave Approved', `Your leave from ${leave.start_date} to ${leave.end_date} has been approved by ${req.user.name}.`, oId);

    if (data.users?.email) {
      sendMail({ to: data.users.email, subject: 'Your Leave Request has been Approved', html: leaveStatusHtml(data.users, leave, 'approved', req.user.name) });
    }
    gcal.createLeaveEvent(leave, data.users?.name || 'Employee')
      .then(gcalId => { if (gcalId) supabase.from('leaves').update({ google_event_id: gcalId }).eq('id', leaveId).eq('organization_id', oId).then(() => {}); })
      .catch(() => {});

    res.json(flatOne(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ROUTE 15: POST /:id/final-reject ────────────────────────────────────────
// Root Admin rejects a leave (pending_root or legacy pending).
router.post('/:id/final-reject', auth, rootAdminOnly, async (req, res) => {
  try {
    const oId     = orgId(req);
    const leaveId = parseInt(req.params.id, 10);
    if (!leaveId) return res.status(400).json({ error: 'Invalid leave ID' });

    const { data: leave } = await supabase.from('leaves')
      .select('*').eq('id', leaveId).eq('organization_id', oId).maybeSingle();
    if (!leave) return res.status(404).json({ error: 'Leave not found' });

    if (leave.status === 'rejected') return res.json(leave); // idempotent

    if (!['pending_root', 'pending'].includes(leave.status)) {
      return res.status(400).json({
        error: `Cannot reject a leave with status '${leave.status}'.`,
        current_status: leave.status,
      });
    }

    const { remarks } = req.body || {};
    const rejectedAt = new Date().toISOString();

    let workDates = [];
    if (leave.status === 'approved') {
      const settings = await getSettings(oId);
      workDates = buildWorkingDates(leave.start_date, leave.end_date, settings);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (workDates.length) {
        await client.query(
          `DELETE FROM attendance
           WHERE user_id = $1 AND organization_id = $2
             AND date = ANY($3::text[])
             AND status = ANY(ARRAY['on_leave','half_day','wfh'])`,
          [leave.user_id, oId, workDates]
        );
      }
      await client.query(
        `UPDATE leaves SET
           status = 'rejected', approved_by = $1, approved_at = $2,
           google_event_id = NULL, remarks = $3,
           root_admin_status = 'rejected', root_admin_id = $1, root_admin_reviewed_at = $2
         WHERE id = $4 AND organization_id = $5`,
        [req.user.id, rejectedAt, remarks || null, leaveId, oId]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Rejection failed. ' + err.message });
    } finally { client.release(); }

    logApprovalAction({
      leaveId, oId, actorId: req.user.id, actorName: req.user.name,
      action: 'root_rejected', fromStatus: leave.status, toStatus: 'rejected', notes: remarks,
    });

    if (leave.google_event_id) gcal.deleteLeaveEvent(leave.google_event_id);

    notify(leave.user_id, 'Leave Request Rejected', `Your leave from ${leave.start_date} to ${leave.end_date} has been rejected.`, oId);

    const { data } = await supabase.from('leaves')
      .select('*, users!leaves_user_id_fkey(name, email)').eq('id', leaveId).eq('organization_id', oId).single();
    if (data.users?.email) {
      sendMail({ to: data.users.email, subject: 'Your Leave Request has been Rejected', html: leaveStatusHtml(data.users, leave, 'rejected', req.user.name) });
    }
    res.json(flatOne(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ROUTE 16: GET /:id/history ───────────────────────────────────────────────
// Approval audit trail for a specific leave.
router.get('/:id/history', auth, async (req, res) => {
  try {
    const oId     = orgId(req);
    const leaveId = parseInt(req.params.id, 10);
    if (!leaveId) return res.status(400).json({ error: 'Invalid leave ID' });

    // Verify the user can see this leave
    const { data: leave } = await supabase.from('leaves')
      .select('id, user_id').eq('id', leaveId).eq('organization_id', oId).maybeSingle();
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    if (!isAdminRole(req.user.role) && leave.user_id !== req.user.id) {
      const { data: employee } = await supabase.from('users')
        .select('department_id')
        .eq('id', leave.user_id)
        .eq('organization_id', oId)
        .maybeSingle();

      let isDeptHead = false;
      if (employee?.department_id) {
        const { data: dept } = await supabase.from('departments')
          .select('head_user_id')
          .eq('id', employee.department_id)
          .eq('organization_id', oId)
          .maybeSingle();
        isDeptHead = dept?.head_user_id === req.user.id;
      }

      if (!isDeptHead) return res.status(403).json({ error: 'Not authorized' });
    }

    const { data, error } = await supabase.from('leave_approval_log')
      .select('*')
      .eq('leave_id', leaveId)
      .eq('org_id', oId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
