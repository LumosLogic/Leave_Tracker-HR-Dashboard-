const express = require('express');
const router  = express.Router();
const axios    = require('axios');
const { supabase } = require('../../config/db');
const { auth, isAdminRole } = require('../../middleware/auth');
const { localDateStr, localTimeStr, flat, orgId, toMinutes, getSettings } = require('../../utils/helpers');

// ─── Clockify helpers (local to dashboard — read org config) ──────────────────
async function getClockifyConfig(oId) {
  const { data } = await supabase.from('organizations')
    .select('clockify_api_key, clockify_workspace_id, clockify_last_synced')
    .eq('id', oId || 1).maybeSingle();
  if (!data) return null;
  return { api_key: data.clockify_api_key, workspace_id: data.clockify_workspace_id, last_synced: data.clockify_last_synced };
}

async function getClockifyMembersByEmail(config) {
  try {
    const resp = await axios.get(
      `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/users`,
      { headers: { 'X-Api-Key': config.api_key }, params: { memberships: 'WORKSPACE', 'page-size': 500 } }
    );
    const map = {};
    for (const u of (resp.data || [])) {
      if (u.email && u.id) map[u.email.toLowerCase()] = u.id;
    }
    return map;
  } catch { return {}; }
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  let _step = 'init';
  try {
    const realToday = localDateStr();
    const today     = req.query.date || realToday;   // use date filter if provided
    const isToday   = today === realToday;

    // ── 1. Get all employees (never include admin) ───────────────────────────
    _step = 'employees';
    const { data: allEmployees } = await supabase.from('users')
      .select('id, name, avatar_color, department, clockify_user_id, created_at')
      .eq('role', 'employee').eq('organization_id', orgId(req));
    const totalEmployees = (allEmployees || []).length;
    const empIds         = (allEmployees || []).map(e => e.id);

    // ── 2. Selected date attendance — employees only ─────────────────────────
    _step = 'attendance';
    let todayRecords = [];
    if (empIds.length > 0) {
      const { data: todayRaw } = await supabase.from('attendance')
        .select('*, users(name, avatar_color, department)')
        .eq('date', today).eq('organization_id', orgId(req))
        .in('user_id', empIds);
      todayRecords = flat(todayRaw);
    }

    // ── 3. Clockify live — only meaningful for today ──────────────────────────
    _step = 'clockify';
    const clockifyActiveIds = new Set();
    const clockifyStartTimes = {}; // empId → 'HH:MM' local time from Clockify timer start
    if (isToday) {
      try {
        const config = await getClockifyConfig(orgId(req));
        if (config?.api_key && config.api_key !== '' && config?.workspace_id) {
          // Auto-link any employees missing their Clockify ID using email matching
          const unlinked = allEmployees.filter(e => !e.clockify_user_id);
          if (unlinked.length > 0) {
            const emailMap = await getClockifyMembersByEmail(config);
            const { data: unlinkedFull } = await supabase.from('users')
              .select('id, email').in('id', unlinked.map(e => e.id));
            await Promise.all((unlinkedFull || []).map(async u => {
              const cId = emailMap[u.email?.toLowerCase()];
              if (cId) {
                await supabase.from('users').update({ clockify_user_id: cId }).eq('id', u.id);
                const emp = allEmployees.find(e => e.id === u.id);
                if (emp) emp.clockify_user_id = cId; // update in-memory for this request
              }
            }));
          }
          await Promise.all(allEmployees.filter(e => e.clockify_user_id).map(async emp => {
            try {
              const resp = await axios.get(
                `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${emp.clockify_user_id}/time-entries`,
                { headers: { 'X-Api-Key': config.api_key }, params: { 'in-progress': true, 'page-size': 1 } }
              );
              const active = (resp.data || []).find(e => !e.timeInterval?.end);
              if (active) {
                clockifyActiveIds.add(emp.id);
                if (active.timeInterval?.start) {
                  const d = new Date(active.timeInterval.start);
                  clockifyStartTimes[emp.id] = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                }
              }
            } catch { /* individual failure is ok */ }
          }));
        }
      } catch { /* Clockify unavailable — degrade gracefully */ }
    }

    // ── 4. Calculate stats ────────────────────────────────────────────────────
    // Attendance statuses that Clockify must never overwrite
    const LEAVE_ATT_STATUSES = new Set(['on_leave', 'half_day', 'wfh']);

    // onLeaveIds — pure on_leave only, used for dashboard counts (WFH/half_day still count as present)
    const onLeaveIds = new Set(todayRecords.filter(r => r.status === 'on_leave').map(r => r.user_id));

    // clockifyGuardIds — broader: prevents Clockify from creating/overwriting ANY leave attendance record.
    // Also cross-checks the leaves table so employees with approved leaves but missing attendance
    // records are protected too (e.g. leave approved after the last Clockify sync).
    const clockifyGuardIds = new Set(todayRecords.filter(r => LEAVE_ATT_STATUSES.has(r.status)).map(r => r.user_id));

    // Fetch today's approved leaves to fill in missing attendance records (WFH, half_day, on_leave)
    let todayApprovedLeaves = [];
    if (empIds.length > 0) {
      const { data: tal } = await supabase.from('leaves')
        .select('user_id, leave_type, leave_time')
        .eq('organization_id', orgId(req))
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today)
        .in('user_id', empIds);
      todayApprovedLeaves = tal || [];
      for (const l of todayApprovedLeaves) clockifyGuardIds.add(l.user_id);
    }

    // Persist Clockify check-ins to attendance DB so MyAttendance and all views stay in sync
    if (isToday && clockifyActiveIds.size > 0) {
      const settings = await getSettings(orgId(req));
      await Promise.all([...clockifyActiveIds].map(async id => {
        if (clockifyGuardIds.has(id)) return; // employee is on leave — skip Clockify sync entirely
        const checkInTime = clockifyStartTimes[id] || null;
        const is_late = checkInTime && settings ? toMinutes(checkInTime) > toMinutes(settings.late_threshold) : false;
        const existing = todayRecords.find(r => r.user_id === id);
        if (!existing) {
          // No attendance record yet — create one from Clockify start time
          try {
            const { data: inserted } = await supabase.from('attendance')
              .insert({ user_id: id, date: today, check_in: checkInTime, status: 'present', is_late, organization_id: orgId(req) })
              .select().single();
            if (inserted) {
              const emp = (allEmployees || []).find(e => e.id === id);
              todayRecords.push({ ...inserted, name: emp?.name, avatar_color: emp?.avatar_color, department: emp?.department });
            }
          } catch { /* insert failed — skip */ }
        } else if (!existing.check_in && !LEAVE_ATT_STATUSES.has(existing.status)) {
          // Record exists, no manual check-in, and not a leave record — sync from Clockify
          try {
            await supabase.from('attendance')
              .update({ check_in: checkInTime, status: 'present', is_late })
              .eq('id', existing.id);
          } catch { /* update failed — skip */ }
          existing.check_in = checkInTime;
          existing.status   = 'present';
          existing.is_late  = is_late;
        }
      }));
    }

    // Build a wfhIds set from attendance records + approved WFH leaves (in case attendance record is missing)
    const wfhIds = new Set(todayRecords.filter(r => r.status === 'wfh').map(r => r.user_id));
    for (const l of todayApprovedLeaves) {
      if (l.leave_time === 'wfh' || l.leave_type === 'wfh') wfhIds.add(l.user_id);
    }
    // Also add to onLeaveIds any approved on_leave without an attendance record
    for (const l of todayApprovedLeaves) {
      if (l.leave_time !== 'wfh' && l.leave_type !== 'wfh' && l.leave_time !== 'half') {
        onLeaveIds.add(l.user_id);
      }
    }

    const onLeaveToday   = onLeaveIds.size;
    const wfhOnlyCount   = [...wfhIds].filter(id => !onLeaveIds.has(id)).length;
    const presentToday   = Math.max(0, totalEmployees - onLeaveToday - wfhOnlyCount);
    const onClockify     = isToday ? [...clockifyActiveIds].filter(id => !clockifyGuardIds.has(id)).length : null;
    const notOnClockify  = isToday ? Math.max(0, presentToday - onClockify) : null;
    const lateToday      = todayRecords.filter(r => r.is_late).length;
    const earlyExitToday = todayRecords.filter(r => r.is_early_exit).length;
    const halfDayToday   = todayRecords.filter(r => r.status === 'half_day').length;
    const wfhToday       = wfhIds.size;
    const checkedInToday = todayRecords.filter(r => r.check_in).length;
    const _now = new Date();
    const _ms  = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-01`;
    const newThisMonth   = (allEmployees || []).filter(e => e.created_at >= _ms).length;
    const _7dAgo = new Date(); _7dAgo.setDate(_7dAgo.getDate() - 7);
    const newJoiners = (allEmployees || [])
      .filter(e => new Date(e.created_at) >= _7dAgo)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)
      .map(({ id, name, department, avatar_color, created_at, position }) => ({ id, name, department, avatar_color, created_at, position }));

    // ── 5. Activity for selected date ─────────────────────────────────────────
    const activityMap = new Map();
    for (const r of todayRecords) {
      activityMap.set(r.user_id, { ...r, clockify_live: clockifyActiveIds.has(r.user_id) });
    }
    // Fallback: Clockify-active users that failed to insert (edge case)
    if (isToday) {
      for (const id of clockifyActiveIds) {
        if (!activityMap.has(id) && !clockifyGuardIds.has(id)) {
          const emp = allEmployees.find(e => e.id === id);
          if (emp) activityMap.set(id, { user_id: emp.id, name: emp.name, avatar_color: emp.avatar_color, department: emp.department, status: 'present', check_in: clockifyStartTimes[id] || null, clockify_live: true });
        }
      }
    }
    const recentActivity = [...activityMap.values()].slice(0, 15);

    // ── 6. Pending leaves ────────────────────────────────────────────────────
    _step = 'leaves';
    const { count: pendingLeaves } = await supabase.from('leaves')
      .select('*', { count: 'exact', head: true }).eq('status', 'pending').eq('organization_id', orgId(req));

    let pendingLeaveList;
    if (isAdminRole(req.user.role)) {
      const { data: plRaw } = await supabase.from('leaves')
        .select('*, users!leaves_user_id_fkey(name, email, department, avatar_color)')
        .eq('status', 'pending').eq('organization_id', orgId(req))
        .order('created_at', { ascending: false }).limit(5);
      pendingLeaveList = flat(plRaw);
    } else {
      const { data: plRaw } = await supabase.from('leaves')
        .select('*, users!leaves_user_id_fkey(name)').eq('user_id', req.user.id).eq('organization_id', orgId(req))
        .order('created_at', { ascending: false }).limit(5);
      pendingLeaveList = flat(plRaw);
    }

    _step = 'myToday';
    const { data: myToday } = await supabase.from('attendance')
      .select('*').eq('user_id', req.user.id).eq('date', today).maybeSingle();

    res.json({ totalEmployees, presentToday, onLeaveToday, onClockify, notOnClockify, lateToday, earlyExitToday, halfDayToday, wfhToday, checkedInToday, newThisMonth, pendingLeaves, recentActivity, pendingLeaveList, myToday, today, isToday, newJoiners });
  } catch (err) {
    console.error(`[Dashboard] step="${_step}" error:`, err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
