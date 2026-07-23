const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { auth, adminOnly, isAdminRole } = require('../../middleware/auth');
const { flat, flatOne, orgId, getSettings, isWorkingDay, getRecipients } = require('../../utils/helpers');
const { sendMail, leaveAppliedHtml, leaveStatusHtml } = require('../../services/emailService');
const gcal = require('../../services/googleCalendar');

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

    // Count used days per type
    const usedByType = {};
    for (const l of approved || []) {
      if (!usedByType[l.leave_type]) usedByType[l.leave_type] = 0;
      if (l.leave_time === 'half') {
        usedByType[l.leave_type] += 0.5;
      } else if (l.leave_time !== 'wfh' && l.leave_type !== 'wfh') {
        const s = new Date(l.start_date + 'T12:00:00');
        const e = new Date(l.end_date   + 'T12:00:00');
        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
          const dow = d.getDay();
          if (dow !== 0 && dow !== 6) usedByType[l.leave_type] += 1;
        }
      }
    }

    // Get org leave quota
    const { data: orgRow } = await supabase.from('organizations')
      .select('total_annual_leaves').eq('id', orgId(req)).maybeSingle();
    const totalAnnual = orgRow?.total_annual_leaves || 18;

    res.json({
      conflicts: conflicts || [],
      hasAttendance: (attendanceRecs || []).length > 0,
      usedByType,
      totalAnnual,
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

    // Admin can apply leave on behalf of any employee
    const targetUserId = (isAdminRole(req.user.role) && user_id) ? parseInt(user_id) : req.user.id;
    const isOnBehalf   = isAdminRole(req.user.role) && targetUserId !== req.user.id;

    const insertPayload = {
      user_id: targetUserId, start_date, end_date,
      leave_type: leave_type||'casual', reason: reason||'',
      leave_time: leave_time||'full',
      half_type:  leave_time === 'half' ? (half_type||'first_half') : null,
      organization_id: orgId(req),
    };

    // Auto-approve when admin creates leave on behalf of another employee
    if (isOnBehalf) {
      insertPayload.status      = 'approved';
      insertPayload.approved_by = req.user.id;
      insertPayload.approved_at = new Date().toISOString();
    }

    const { data, error } = await supabase.from('leaves')
      .insert(insertPayload)
      .select('*, users!leaves_user_id_fkey(name, email, department)').single();
    if (error) throw new Error(error.message);

    // When auto-approving, create attendance records for the leave dates
    if (isOnBehalf) {
      const settings = await getSettings(orgId(req));
      const start = new Date(start_date + 'T12:00:00');
      const end   = new Date(end_date   + 'T12:00:00');
      const upserts = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split('T')[0];
        const attStatus = leave_time === 'half' ? 'half_day' : (leave_time === 'wfh' || leave_type === 'wfh') ? 'wfh' : 'on_leave';
        if (!settings || isWorkingDay(ds, settings)) {
          upserts.push({ user_id: targetUserId, date: ds, status: attStatus, organization_id: orgId(req) });
        }
      }
      if (upserts.length) {
        await supabase.from('attendance').upsert(upserts, { onConflict: 'user_id,date,organization_id' });
      }
      // Notify the employee about the approved leave
      if (data.users?.email) {
        sendMail({
          to: data.users.email,
          subject: `Leave Added — ${req.user.name || 'HR'}`,
          html: leaveStatusHtml(data.users, data, 'approved', req.user.name),
        });
      }
    } else if (req.user.role === 'employee') {
      // Notify HR when employee applies leave
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

    res.json(flatOne(data));
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
  try {
    const { data: leave, error: le } = await supabase.from('leaves').select('*').eq('id', req.params.id).single();
    if (le) return res.status(404).json({ error: 'Leave not found' });
    if (leave.status === 'approved') return res.json(leave); // already approved — skip duplicate email

    await supabase.from('leaves').update({ status: 'approved', approved_by: req.user.id, approved_at: new Date().toISOString() }).eq('id', req.params.id);

    // Mark attendance days as on_leave
    const settings = await getSettings(orgId(req));
    const start = new Date(leave.start_date + 'T12:00:00');
    const end   = new Date(leave.end_date   + 'T12:00:00');
    const upserts = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      const attStatus = leave.leave_time === 'half' ? 'half_day' : (leave.leave_time === 'wfh' || leave.leave_type === 'wfh') ? 'wfh' : 'on_leave';
      if (isWorkingDay(ds, settings)) upserts.push({ user_id: leave.user_id, date: ds, status: attStatus, organization_id: orgId(req) });
    }
    if (upserts.length) await supabase.from('attendance').upsert(upserts, { onConflict: 'user_id,date,organization_id' });

    const { data } = await supabase.from('leaves').select('*, users!leaves_user_id_fkey(name, email)').eq('id', req.params.id).single();
    // Email the employee
    if (data.users?.email) {
      sendMail({ to: data.users.email, subject: 'Your Leave Request has been Approved — HR Tracker', html: leaveStatusHtml(data.users, leave, 'approved', req.user.name) });
    }
    // Sync to Google Calendar
    const gcalId = await gcal.createLeaveEvent(leave, data.users?.name || 'Employee');
    if (gcalId) await supabase.from('leaves').update({ google_event_id: gcalId }).eq('id', req.params.id);
    res.json(flatOne(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Leaves: Reject ───────────────────────────────────────────────────────────
router.put('/:id/reject', auth, adminOnly, async (req, res) => {
  try {
    const { data: leave } = await supabase.from('leaves').select('*').eq('id', req.params.id).single();
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    if (leave.status === 'rejected') return res.json(leave); // already rejected — skip duplicate email

    // If the leave was previously approved, remove the attendance records it created.
    // This prevents orphaned on_leave/wfh/half_day records staying in the attendance table.
    if (leave.status === 'approved') {
      const settings = await getSettings(orgId(req));
      const start = new Date(leave.start_date + 'T12:00:00');
      const end   = new Date(leave.end_date   + 'T12:00:00');
      const dates = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split('T')[0];
        if (isWorkingDay(ds, settings)) dates.push(ds);
      }
      if (dates.length) {
        await supabase.from('attendance')
          .delete()
          .eq('user_id', leave.user_id)
          .eq('organization_id', orgId(req))
          .in('date', dates)
          .in('status', ['on_leave', 'half_day', 'wfh']); // only remove leave-status records, not manual check-ins
      }
    }

    const { remarks } = req.body || {};
    await supabase.from('leaves').update({ status: 'rejected', approved_by: req.user.id, approved_at: new Date().toISOString(), google_event_id: null, ...(remarks ? { remarks } : {}) }).eq('id', req.params.id);
    // Remove from Google Calendar if it was synced
    if (leave.google_event_id) gcal.deleteLeaveEvent(leave.google_event_id);
    const { data } = await supabase.from('leaves').select('*, users!leaves_user_id_fkey(name, email)').eq('id', req.params.id).single();
    // Email the employee
    if (data.users?.email) {
      sendMail({ to: data.users.email, subject: 'Your Leave Request has been Rejected — Lumens HR', html: leaveStatusHtml(data.users, leave, 'rejected', req.user.name) });
    }
    res.json(flatOne(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Leaves: Revert (cancel approved leave) ───────────────────────────────────
router.put('/:id/revert', auth, async (req, res) => {
  try {
    const { data: leave } = await supabase.from('leaves').select('*').eq('id', req.params.id).maybeSingle();
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    if (!isAdminRole(req.user.role) && leave.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (leave.status !== 'approved') return res.status(400).json({ error: 'Only approved leaves can be reverted' });

    await supabase.from('leaves').update({ status: 'cancelled', google_event_id: null }).eq('id', req.params.id);

    const settings = await getSettings(orgId(req));
    const start = new Date(leave.start_date + 'T12:00:00');
    const end   = new Date(leave.end_date   + 'T12:00:00');
    const dates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      if (isWorkingDay(ds, settings)) dates.push(ds);
    }
    if (dates.length) {
      await supabase.from('attendance')
        .delete()
        .eq('user_id', leave.user_id)
        .in('date', dates);
    }

    if (leave.google_event_id) gcal.deleteLeaveEvent(leave.google_event_id);

    const { data } = await supabase.from('leaves').select('*, users!leaves_user_id_fkey(name, email)').eq('id', req.params.id).single();
    res.json(flatOne(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Leaves: Delete ───────────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const { data: leave } = await supabase.from('leaves').select('*').eq('id', req.params.id).maybeSingle();
    if (!leave) return res.status(404).json({ error: 'Leave not found' });
    if (!isAdminRole(req.user.role) && leave.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (leave.status === 'approved' && !isAdminRole(req.user.role)) return res.status(400).json({ error: 'Cannot cancel approved leave' });

    // If leave was approved, remove the attendance records that were created for those dates
    if (leave.status === 'approved') {
      const settings = await getSettings();
      const start = new Date(leave.start_date + 'T12:00:00');
      const end   = new Date(leave.end_date   + 'T12:00:00');
      const dates = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = d.toISOString().split('T')[0];
        if (isWorkingDay(ds, settings)) dates.push(ds);
      }
      if (dates.length) {
        await supabase.from('attendance')
          .delete()
          .eq('user_id', leave.user_id)
          .in('date', dates);
      }
    }

    // Delete Google Calendar event if leave was synced
    if (leave.google_event_id) gcal.deleteLeaveEvent(leave.google_event_id);

    await supabase.from('leaves').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
