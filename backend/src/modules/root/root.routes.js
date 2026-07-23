const express = require('express');
const router  = express.Router();
const bcrypt   = require('bcryptjs');
const { supabase } = require('../../config/db');
const { auth, adminOnly, rootAdminOnly } = require('../../middleware/auth');
const { flat, orgId } = require('../../utils/helpers');
const { sendMail, welcomeEmployeeHtml } = require('../../services/emailService');
const { sendPushToUsers } = require('../../services/pushService');

// ─── Root Admin: Send Email to All / One User ─────────────────────────────────
router.post('/send-email', auth, adminOnly, async (req, res) => {
  try {
    const { subject, message, target_user_id } = req.body;
    if (!subject?.trim() || !message?.trim()) return res.status(400).json({ error: 'Subject and message required' });
    let recipients;
    if (target_user_id) {
      const { data: u } = await supabase.from('users').select('email').eq('id', parseInt(target_user_id)).single();
      if (!u) return res.status(404).json({ error: 'User not found' });
      recipients = [u.email];
    } else {
      const { data: users } = await supabase.from('users').select('email').neq('role', 'root_admin');
      recipients = (users || []).map(u => u.email).filter(Boolean);
    }
    const html = `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:linear-gradient(135deg,#3525cd,#4f46e5);border-radius:12px;padding:24px;margin-bottom:20px;">
        <h2 style="color:white;margin:0;font-size:20px;">📢 ${subject.trim()}</h2>
        <p style="color:rgba(255,255,255,.8);margin:8px 0 0;font-size:13px;">From Lumos Logic HR System</p>
      </div>
      <div style="background:#f8fafc;border-radius:12px;padding:20px;border:1px solid #e2e8f0;">
        <p style="color:#334155;line-height:1.7;margin:0;">${message.trim().replace(/\n/g, '<br/>')}</p>
      </div>
      <p style="color:#94a3b8;font-size:12px;margin-top:20px;text-align:center;">— Lumos Logic HR Management System</p>
    </div>`;
    for (const email of recipients) {
      sendMail({ to: email, subject: subject.trim(), html });
    }
    res.json({ success: true, sent: recipients.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Root Admin: System-wide Stats ───────────────────────────────────────────
router.get('/stats', auth, rootAdminOnly, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const year  = new Date().getFullYear();

    const [
      { count: totalEmployees },
      { count: totalHR },
      { count: pendingLeaves },
      { count: presentToday },
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'employee').eq('organization_id', orgId(req)),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'admin').eq('organization_id', orgId(req)),
      supabase.from('leaves').select('*', { count: 'exact', head: true }).eq('status', 'pending').eq('organization_id', orgId(req)),
      supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('date', today).eq('organization_id', orgId(req)).in('status', ['present', 'half_day', 'wfh']),
    ]);

    const [
      { data: recentLeavesRaw },
      { data: pendingLeavesRaw },
      { data: todayAttendance },
      { data: yearLeaves },
    ] = await Promise.all([
      supabase.from('leaves')
        .select('*, users!leaves_user_id_fkey(name, email, department, avatar_color)')
        .eq('organization_id', orgId(req))
        .order('created_at', { ascending: false }).limit(8),
      supabase.from('leaves')
        .select('*, users!leaves_user_id_fkey(name, email, department, avatar_color)')
        .eq('organization_id', orgId(req)).eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(15),
      supabase.from('attendance')
        .select('status')
        .eq('date', today).eq('organization_id', orgId(req)),
      supabase.from('leaves')
        .select('leave_type, leave_time')
        .eq('organization_id', orgId(req)).eq('status', 'approved')
        .gte('start_date', `${year}-01-01`).lte('end_date', `${year}-12-31`),
    ]);

    // Attendance breakdown by status
    const attendanceBreakdown = {};
    for (const r of todayAttendance || []) {
      attendanceBreakdown[r.status] = (attendanceBreakdown[r.status] || 0) + 1;
    }

    // Leave count by type (approved this year, excluding WFH)
    const leavesByType = {};
    for (const r of yearLeaves || []) {
      if (r.leave_time === 'wfh') continue;
      leavesByType[r.leave_type] = (leavesByType[r.leave_type] || 0) + 1;
    }

    res.json({
      totalEmployees, totalHR, pendingLeaves, presentToday,
      recentLeaves:      flat(recentLeavesRaw),
      pendingLeavesData: flat(pendingLeavesRaw),
      attendanceBreakdown,
      leavesByType,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Root Admin: List Organizations ──────────────────────────────────────────
router.get('/organizations', auth, rootAdminOnly, async (req, res) => {
  try {
    const { data } = await supabase.from('organizations').select('id, name, slug').order('name', { ascending: true });
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Root Admin: Comprehensive Dashboard ─────────────────────────────────────
router.get('/dashboard', auth, rootAdminOnly, async (req, res) => {
  try {
    const now   = new Date();
    const today = now.toISOString().split('T')[0];
    const year  = now.getFullYear();
    const oid   = orgId(req);

    const d30 = new Date(now); d30.setDate(d30.getDate() - 29);
    const fromDate = d30.toISOString().split('T')[0];
    const d30ahead = new Date(now); d30ahead.setDate(d30ahead.getDate() + 30);
    const toDate = d30ahead.toISOString().split('T')[0];

    const [
      { count: totalEmployees },
      { count: totalHR },
      { count: pendingLeaves },
      { data: recentLeavesRaw },
      { data: pendingLeavesRaw },
      { data: todayAttendance },
      { data: yearLeaves },
      { data: last30Att },
      { data: allEmployees },
      { data: upcomingHolidays },
      { data: upcomingEventsRaw },
      { count: pendingReg },
      { count: pendingExp },
      { count: totalDepartments },
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'employee').eq('organization_id', oid),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'admin').eq('organization_id', oid),
      supabase.from('leaves').select('*', { count: 'exact', head: true }).eq('status', 'pending').eq('organization_id', oid),
      supabase.from('leaves')
        .select('id, user_id, leave_type, status, start_date, end_date, reason, created_at, users!leaves_user_id_fkey(name, email, department, avatar_color)')
        .eq('organization_id', oid).order('created_at', { ascending: false }).limit(10),
      supabase.from('leaves')
        .select('id, leave_type, status, start_date, end_date, reason, created_at, users!leaves_user_id_fkey(name, email, department, avatar_color)')
        .eq('organization_id', oid).eq('status', 'pending').order('created_at', { ascending: false }).limit(15),
      supabase.from('attendance').select('user_id, status, check_in').eq('date', today).eq('organization_id', oid),
      supabase.from('leaves').select('leave_type, leave_time').eq('organization_id', oid).eq('status', 'approved')
        .gte('start_date', `${year}-01-01`).lte('end_date', `${year}-12-31`),
      supabase.from('attendance').select('date, user_id, status').eq('organization_id', oid)
        .gte('date', fromDate).lte('date', today),
      supabase.from('users')
        .select('id, name, department, position, avatar_color, created_at, role, date_of_birth, joining_date, employee_status')
        .eq('organization_id', oid).in('role', ['employee', 'admin']).order('name'),
      supabase.from('holidays').select('id, name, date, type').eq('organization_id', oid)
        .gte('date', today).order('date', { ascending: true }).limit(5),
      supabase.from('events').select('id, title, date').eq('organization_id', oid)
        .gte('date', today).order('date', { ascending: true }).limit(5),
      supabase.from('attendance_regularization').select('*', { count: 'exact', head: true })
        .eq('status', 'pending').eq('organization_id', oid),
      supabase.from('expenses').select('*', { count: 'exact', head: true })
        .eq('status', 'pending').eq('organization_id', oid),
      supabase.from('departments').select('*', { count: 'exact', head: true })
        .eq('organization_id', oid),
    ]);

    // Attendance breakdown today
    const attendanceBreakdown = {};
    for (const r of todayAttendance || []) {
      attendanceBreakdown[r.status] = (attendanceBreakdown[r.status] || 0) + 1;
    }
    const presentToday = (attendanceBreakdown.present || 0) + (attendanceBreakdown.wfh || 0) + (attendanceBreakdown.half_day || 0);

    // Leave count by type (approved this year, excluding WFH)
    const leavesByType = {};
    for (const r of yearLeaves || []) {
      if (r.leave_time === 'wfh') continue;
      leavesByType[r.leave_type] = (leavesByType[r.leave_type] || 0) + 1;
    }

    // Attendance trend (last 30 days)
    const trendByDate = {};
    for (const r of last30Att || []) {
      if (!trendByDate[r.date]) trendByDate[r.date] = { present: 0, total: 0 };
      trendByDate[r.date].total++;
      if (['present', 'wfh', 'half_day'].includes(r.status)) trendByDate[r.date].present++;
    }
    const attendanceTrend = [];
    for (let i = 29; i >= 0; i--) {
      const d  = new Date(now); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const e  = trendByDate[ds] || { present: 0, total: 0 };
      attendanceTrend.push({ date: ds, pct: e.total > 0 ? Math.round((e.present / e.total) * 100) : 0, present: e.present, total: e.total });
    }

    // Department health — use org's departments table as source of truth to prevent cross-org contamination
    const empIdList = (allEmployees || []).map(e => e.id);

    // Fetch only this org's departments
    const { data: orgDepts } = await supabase.from('departments')
      .select('id, name')
      .eq('organization_id', oid);

    // Initialize deptMap keyed by department ID so only org departments appear
    const deptMap = {};
    for (const dept of orgDepts || []) {
      deptMap[dept.id] = { name: dept.name, empIdSet: new Set() };
    }

    // Build name→id lookup for fallback matching
    const orgDeptNameToId = {};
    for (const dept of orgDepts || []) {
      orgDeptNameToId[dept.name] = dept.id;
    }

    // Primary: junction table assignments filtered by org
    let userDeptRows = [];
    if (empIdList.length > 0) {
      const { data: ud } = await supabase.from('user_departments')
        .select('user_id, department_id')
        .in('user_id', empIdList)
        .eq('organization_id', oid);
      userDeptRows = ud || [];
    }
    for (const ud of userDeptRows) {
      if (deptMap[ud.department_id]) {
        deptMap[ud.department_id].empIdSet.add(ud.user_id);
      }
    }

    // Fallback: employees with no junction entry — match by users.department text field to org departments only
    const junctionUserIds = new Set(userDeptRows.map(ud => ud.user_id));
    for (const emp of allEmployees || []) {
      if (!junctionUserIds.has(emp.id)) {
        const deptId = orgDeptNameToId[emp.department];
        if (deptId !== undefined && deptMap[deptId]) {
          deptMap[deptId].empIdSet.add(emp.id);
        }
      }
    }

    const presentSet = new Set((todayAttendance || []).filter(a => ['present','wfh','half_day'].includes(a.status)).map(a => a.user_id));
    const onLeaveSet = new Set((todayAttendance || []).filter(a => a.status === 'on_leave').map(a => a.user_id));
    const departmentHealth = Object.values(deptMap).map(d => {
      const empIds = [...d.empIdSet];
      const tot = empIds.length;
      const pre = empIds.filter(id => presentSet.has(id)).length;
      const lv  = empIds.filter(id => onLeaveSet.has(id)).length;
      const pct = tot > 0 ? Math.round((pre / tot) * 100) : 0;
      return { name: d.name, total: tot, present: pre, onLeave: lv, attendancePct: pct,
        productivity: pct >= 90 ? 'High' : pct >= 70 ? 'Medium' : 'Low' };
    }).sort((a, b) => b.total - a.total);

    // Headcount growth (cumulative by month this year)
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let base = (allEmployees || []).filter(e => new Date(e.created_at).getFullYear() < year).length;
    const headcountGrowth = months.map((month, i) => {
      const joined = (allEmployees || []).filter(e => {
        const d = new Date(e.created_at);
        return d.getFullYear() === year && d.getMonth() === i;
      }).length;
      base += joined;
      return { month, joined, total: base };
    });

    // Live activity feed (check-ins + recent leaves)
    const empById = {};
    for (const e of allEmployees || []) empById[e.id] = e;
    const liveActivity = [];
    for (const a of (todayAttendance || []).filter(x => x.check_in).slice(0, 5)) {
      const emp = empById[a.user_id];
      if (emp) liveActivity.push({ type: 'checkin', user_id: emp.id, name: emp.name, department: emp.department, avatar_color: emp.avatar_color,
        time: `${today}T${a.check_in}`,
        detail: a.status === 'wfh' ? 'started working from home' : a.status === 'half_day' ? 'marked half day' : 'checked in' });
    }
    for (const l of flat(recentLeavesRaw || []).slice(0, 6)) {
      liveActivity.push({ type: 'leave', user_id: l.user_id, name: l.name, department: l.department, avatar_color: l.avatar_color,
        time: l.created_at, detail: `applied for ${l.leave_type} leave`, status: l.status });
    }
    const recentJoiners = (allEmployees || []).filter(e => e.role === 'employee')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3);
    for (const emp of recentJoiners) {
      liveActivity.push({ type: 'joined', user_id: emp.id, name: emp.name, department: emp.department, avatar_color: emp.avatar_color,
        time: emp.created_at, detail: 'joined the organization' });
    }
    liveActivity.sort((a, b) => new Date(b.time) - new Date(a.time));

    // Action center items
    const actionCenter = [];
    if (pendingLeaves > 0) actionCenter.push({ type: 'leaves', label: `${pendingLeaves} leave approval${pendingLeaves !== 1 ? 's' : ''} pending`, priority: pendingLeaves > 5 ? 'High' : 'Medium', link: '/root/leaves' });
    if (pendingReg > 0)   actionCenter.push({ type: 'attendance', label: `${pendingReg} attendance correction${pendingReg !== 1 ? 's' : ''}`, priority: 'Medium', link: '/root/regularization' });
    if (pendingExp > 0)   actionCenter.push({ type: 'expenses', label: `${pendingExp} expense${pendingExp !== 1 ? 's' : ''} awaiting approval`, priority: 'Medium', link: '/root/expenses' });
    if (actionCenter.length === 0) actionCenter.push({ type: 'all_clear', label: 'All tasks up to date', priority: 'Low' });

    // Upcoming events (merge holidays + events)
    const upcomingEvents = [
      ...(upcomingHolidays || []).map(h => ({ id: `h-${h.id}`, title: h.name, date: h.date, type: 'holiday' })),
      ...(upcomingEventsRaw || []).map(e => ({ id: `e-${e.id}`, title: e.title, date: e.date, type: 'event' })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 5);

    // Birthdays today
    const todayMD  = today.slice(5);
    const birthdays = (allEmployees || []).filter(e => e.date_of_birth && e.date_of_birth.slice(5) === todayMD)
      .map(e => ({ id: e.id, name: e.name, avatar_color: e.avatar_color, department: e.department }));

    // Work anniversaries today (joining_date matches today MM-DD, at least 1 year ago)
    const anniversaries = (allEmployees || []).filter(e =>
      e.joining_date && e.joining_date.slice(5) === todayMD && new Date(e.joining_date).getFullYear() < year
    ).map(e => ({
      id: e.id, name: e.name, avatar_color: e.avatar_color, department: e.department,
      years: year - new Date(e.joining_date).getFullYear(),
    }));

    // Recent joiners (top 5 for section)
    const recentJoiners5 = (allEmployees || []).filter(e => e.role === 'employee')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)
      .map(({ id, name, department, position, avatar_color, created_at }) => ({ id, name, department, position, avatar_color, created_at }));

    res.json({
      totalEmployees, totalHR, pendingLeaves, presentToday,
      totalDepartments: totalDepartments || 0,
      recentLeaves:      flat(recentLeavesRaw),
      pendingLeavesData: flat(pendingLeavesRaw),
      attendanceBreakdown, leavesByType,
      attendanceTrend, departmentHealth, headcountGrowth,
      liveActivity, actionCenter, upcomingEvents,
      recentJoiners: recentJoiners5, birthdays, anniversaries,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Root Admin: Yearly Leave Summary ────────────────────────────────────────
router.get('/yearly-leaves', auth, rootAdminOnly, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    // Get total leaves from org settings (default 18)
    const { data: orgRow } = await supabase.from('organizations').select('total_annual_leaves').eq('id', orgId(req)).single();
    const TOTAL_LEAVES = orgRow?.total_annual_leaves || 18;

    const [{ data: employees }, { data: leaves }] = await Promise.all([
      supabase.from('users')
        .select('id, name, department, position, avatar_color')
        .eq('role', 'employee').eq('organization_id', orgId(req))
        .order('name'),
      supabase.from('leaves')
        .select('user_id, start_date, end_date, leave_type, leave_time, status')
        .eq('status', 'approved').eq('organization_id', orgId(req))
        .lte('start_date', `${year}-12-31`)
        .gte('end_date',   `${year}-01-01`),
    ]);

    const yearStart = new Date(`${year}-01-01T12:00:00`);
    const yearEnd   = new Date(`${year}-12-31T12:00:00`);

    const fmtIST = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);

    const result = (employees || []).map(emp => {
      const empLeaves = (leaves || []).filter(l => l.user_id === emp.id);
      let usedDays = 0;
      const countedDays = new Set(); // prevent double-counting overlapping leaves
      const byType = {};

      for (const l of empLeaves) {
        if (l.leave_time === 'wfh') continue;
        const start = new Date(Math.max(new Date(l.start_date + 'T12:00:00'), yearStart));
        const end   = new Date(Math.min(new Date(l.end_date   + 'T12:00:00'), yearEnd));
        if (start > end) continue;

        if (l.leave_time === 'half') {
          const ds = fmtIST(start);
          if (!countedDays.has(ds)) {
            usedDays += 0.5;
            countedDays.add(ds);
          }
        } else {
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dow = d.getDay();
            if (dow !== 0 && dow !== 6) {
              const ds = fmtIST(d);
              if (!countedDays.has(ds)) {
                usedDays++;
                countedDays.add(ds);
              }
            }
          }
        }
        byType[l.leave_type] = (byType[l.leave_type] || 0) + 1;
      }

      return {
        ...emp,
        usedDays,
        remainingDays: Math.max(0, TOTAL_LEAVES - usedDays),
        totalDays: TOTAL_LEAVES,
        byType,
      };
    });

    res.json({ employees: result, year, totalLeaves: TOTAL_LEAVES });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Root Admin: List HR Admins ───────────────────────────────────────────────
router.get('/hr', auth, rootAdminOnly, async (req, res) => {
  try {
    const { data } = await supabase.from('users')
      .select('id, name, email, department, position, avatar_color, created_at')
      .eq('role', 'admin').eq('organization_id', orgId(req)).order('name');
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Root Admin: Create HR Admin ──────────────────────────────────────────────
router.post('/hr', auth, rootAdminOnly, async (req, res) => {
  try {
    const { name, email, password, department, position, avatar_color } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
    const hashed = bcrypt.hashSync(password, 10);
    const { data, error } = await supabase.from('users')
      .insert({ name, email: email.toLowerCase(), password: hashed, role: 'admin', department: department||'Human Resources', position: position||'HR Manager', avatar_color: avatar_color||'#3525cd', force_password_change: true, organization_id: orgId(req) })
      .select('id, name, email, role, department, position, avatar_color').single();
    if (error?.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    if (error) throw new Error(error.message);
    sendMail({ to: email, subject: 'Welcome to Lumens HR — Your HR Admin Account', html: welcomeEmployeeHtml({ name, email, department: department||'Human Resources', position: position||'HR Manager' }, password) });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Root Admin: Update HR Admin ──────────────────────────────────────────────
router.put('/hr/:id', auth, rootAdminOnly, async (req, res) => {
  try {
    const { name, email, department, position, avatar_color, password } = req.body;
    const update = { name, department, position, avatar_color };
    if (email) update.email = email.toLowerCase();
    if (password) update.password = bcrypt.hashSync(password, 10);
    const { data, error } = await supabase.from('users').update(update)
      .eq('id', req.params.id).eq('organization_id', orgId(req))
      .select('id, name, email, role, department, position, avatar_color').single();
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Root Admin: Delete HR Admin ──────────────────────────────────────────────
router.delete('/hr/:id', auth, rootAdminOnly, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await supabase.from('users').delete().eq('id', req.params.id).eq('role', 'admin').eq('organization_id', orgId(req));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Root Admin: List Root Admins ─────────────────────────────────────────────
router.get('/root-admins', auth, rootAdminOnly, async (req, res) => {
  try {
    const { data } = await supabase.from('users')
      .select('id, name, email, department, position, avatar_color, created_at')
      .eq('role', 'root_admin').eq('organization_id', orgId(req)).order('name');
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Root Admin: Soft-delete a Root Admin ─────────────────────────────────────
// Soft-delete a root admin (demote to employee + mark inactive)
// Requires ≥2 root admins in org; self-deletion blocked.
router.delete('/root-admins/:id', auth, rootAdminOnly, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const oid      = orgId(req);

    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'You cannot remove your own root admin access.' });
    }

    // Count active root admins in this org
    const { data: rootAdmins, error: cntErr } = await supabase
      .from('users').select('id')
      .eq('role', 'root_admin').eq('organization_id', oid);
    if (cntErr) throw cntErr;

    if (!rootAdmins || rootAdmins.length <= 1) {
      return res.status(400).json({
        error: 'Cannot remove the last root admin. Assign at least one other root admin first.',
      });
    }

    const isTarget = (rootAdmins || []).some(r => r.id === targetId);
    if (!isTarget) {
      return res.status(404).json({ error: 'Root admin not found in this organisation.' });
    }

    // Soft delete: demote role + deactivate
    const { error: updErr } = await supabase.from('users')
      .update({ role: 'employee', employee_status: 'inactive' })
      .eq('id', targetId).eq('organization_id', oid);
    if (updErr) throw updErr;

    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Root Admin: Change Password for Another Root Admin ──────────────────────
router.put('/root-admins/:id/password', auth, rootAdminOnly, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    const oid      = orgId(req);
    if (targetId === req.user.id) return res.status(400).json({ error: 'Use your profile page to change your own password.' });
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const { data: target } = await supabase.from('users').select('id').eq('id', targetId).eq('role', 'root_admin').eq('organization_id', oid).maybeSingle();
    if (!target) return res.status(404).json({ error: 'Root admin not found in this organisation.' });
    const hashed = bcrypt.hashSync(password, 10);
    await supabase.from('users').update({ password: hashed }).eq('id', targetId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Notification Recipients (Root Admin) ─────────────────────────────────────
router.get('/notify-recipients', auth, rootAdminOnly, async (req, res) => {
  try {
    const { data } = await supabase.from('notification_recipients')
      .select('*').eq('organization_id', orgId(req)).order('created_at', { ascending: true });
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/notify-recipients', auth, rootAdminOnly, async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    const { data, error } = await supabase.from('notification_recipients')
      .insert({ email: email.toLowerCase().trim(), name: name || '', organization_id: orgId(req) })
      .select().single();
    if (error?.code === '23505') return res.status(400).json({ error: 'Email already in the list' });
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/notify-recipients/:id', auth, rootAdminOnly, async (req, res) => {
  try {
    const { active, name } = req.body;
    const { data, error } = await supabase.from('notification_recipients')
      .update({ ...(active !== undefined && { active }), ...(name !== undefined && { name }) })
      .eq('id', req.params.id).eq('organization_id', orgId(req)).select().single();
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/notify-recipients/:id', auth, rootAdminOnly, async (req, res) => {
  try {
    await supabase.from('notification_recipients').delete().eq('id', req.params.id).eq('organization_id', orgId(req));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
