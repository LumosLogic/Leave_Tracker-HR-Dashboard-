const express = require('express');
const router  = express.Router();
const axios    = require('axios');
const { supabase } = require('../../config/db');
const { auth, adminOnly, isAdminRole } = require('../../middleware/auth');
const { localDateStr, localTimeStr, flat, orgId, toMinutes, getSettings, isWorkingDay } = require('../../utils/helpers');

// ─── Clockify config helper (local) ───────────────────────────────────────────
async function getClockifyConfig(oId) {
  const { data } = await supabase.from('organizations')
    .select('clockify_api_key, clockify_workspace_id, clockify_last_synced')
    .eq('id', oId || 1).maybeSingle();
  if (!data) return null;
  return { api_key: data.clockify_api_key, workspace_id: data.clockify_workspace_id, last_synced: data.clockify_last_synced };
}

async function autoLinkClockifyUser(userId, email, config) {
  try {
    const resp = await axios.get(
      `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/users`,
      { headers: { 'X-Api-Key': config.api_key }, params: { memberships: 'WORKSPACE', 'page-size': 500 } }
    );
    const map = {};
    for (const u of (resp.data || [])) {
      if (u.email && u.id) map[u.email.toLowerCase()] = u.id;
    }
    const clockifyId = map[email?.toLowerCase()];
    if (!clockifyId) return null;
    await supabase.from('users').update({ clockify_user_id: clockifyId }).eq('id', userId);
    return clockifyId;
  } catch { return null; }
}

// ─── Attendance: List ─────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { year, month, date, userId } = req.query;

    let query = supabase.from('attendance')
      .select('*, users!inner(name, email, avatar_color, department, position)')
      .eq('organization_id', orgId(req))
      .order('date', { ascending: true });

    if (!isAdminRole(req.user.role)) {
      query = query.eq('user_id', req.user.id);
    } else if (userId && userId !== 'all') {
      query = query.eq('user_id', parseInt(userId));
    }

    if (date) {
      query = query.eq('date', date);
    } else if (year && month) {
      query = query.like('date', `${year}-${String(month).padStart(2,'0')}-%`);
    } else if (year) {
      query = query.like('date', `${year}-%`);
    } else if (req.query.startDate && req.query.endDate) {
      query = query.gte('date', req.query.startDate).lte('date', req.query.endDate);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    res.json(flat(data));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance: Today (for current user, with Clockify enrichment) ───────────
router.get('/today', auth, async (req, res) => {
  try {
    const today = localDateStr();
    const { data: existing } = await supabase.from('attendance')
      .select('*').eq('user_id', req.user.id).eq('date', today).maybeSingle();

    if (existing) {
      // For Clockify users, enrich the DB record with real-time session data from Clockify
      // so the UI shows accurate gross/break/effective hours without waiting for the 10-min sync
      try {
        const config = await getClockifyConfig(orgId(req));
        if (config?.api_key && config?.workspace_id) {
          const { data: uRow } = await supabase.from('users')
            .select('clockify_user_id').eq('id', req.user.id).maybeSingle();
          if (uRow?.clockify_user_id) {
            const startISO = today + 'T00:00:00+05:30';
            const endISO   = today + 'T23:59:59+05:30';
            const resp = await axios.get(
              `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${uRow.clockify_user_id}/time-entries`,
              { headers: { 'X-Api-Key': config.api_key }, params: { start: startISO, end: endISO, 'page-size': 50 } }
            );
            const entries = resp.data || [];
            let totalSec = 0, firstStart = null, lastEnd = null, hasRunning = false;
            let runningEntryStartISO = null; // ISO start of the currently-running entry
            for (const e of entries) {
              // Add duration of COMPLETED entries
              const m = (e.timeInterval?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
              if (m) totalSec += (parseInt(m[1]||0)*3600) + (parseInt(m[2]||0)*60) + parseInt(m[3]||0);
              if (e.timeInterval?.start) {
                const d = new Date(e.timeInterval.start);
                const s = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                if (!firstStart || s < firstStart) firstStart = s;
              }
              if (e.timeInterval?.end) {
                const d = new Date(e.timeInterval.end);
                const s = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                if (!lastEnd || s > lastEnd) lastEnd = s;
              } else {
                hasRunning = true;
                // Capture the ISO start of the running entry to compute its elapsed time
                if (e.timeInterval?.start) runningEntryStartISO = e.timeInterval.start;
              }
            }

            // CRITICAL FIX: Add the currently-running session's elapsed time to effective seconds.
            // Without this, the running session time gets counted as "break" (gross - completed_only = inflated).
            if (hasRunning && runningEntryStartISO) {
              const runningElapsedMs = Date.now() - new Date(runningEntryStartISO).getTime();
              if (runningElapsedMs > 0) totalSec += Math.floor(runningElapsedMs / 1000);
            }

            const eff = Math.round((totalSec / 3600) * 100) / 100;
            // gross = full span from first check-in to now (includes all gaps)
            // breaks = gross - eff = only actual idle gaps between sessions (correct now)
            const now = localTimeStr();
            const refEnd = (!hasRunning && lastEnd) ? lastEnd : now;
            const gross  = firstStart ? Math.max(0, Math.round((toMinutes(refEnd) - toMinutes(firstStart)) / 60 * 100) / 100) : 0;
            const breaks = Math.max(0, Math.round((gross - eff) * 60));
            // Return enriched record without writing to DB (sync will persist every 10 min)
            return res.json({
              ...existing,
              check_in:            firstStart || existing.check_in,
              check_out:           (!hasRunning && lastEnd) ? lastEnd : null,
              clockify_hours:      eff,
              work_hours:          eff,
              gross_hours:         gross,
              total_break_minutes: breaks,
            });
          }
        }
      } catch { /* Clockify live enrich failed — return plain DB record */ }
      return res.json(existing);
    }

    // No record yet — check if employee has an active Clockify timer and auto-create
    try {
      const config = await getClockifyConfig(orgId(req));
      if (config?.api_key && config?.workspace_id) {
        const { data: uRow } = await supabase.from('users')
          .select('clockify_user_id').eq('id', req.user.id).maybeSingle();
        if (uRow?.clockify_user_id) {
          const resp = await axios.get(
            `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${uRow.clockify_user_id}/time-entries`,
            { headers: { 'X-Api-Key': config.api_key }, params: { 'in-progress': true, 'page-size': 1 } }
          );
          const active = (resp.data || []).find(e => !e.timeInterval?.end);
          if (active?.timeInterval?.start) {
            const d = new Date(active.timeInterval.start);
            const checkInTime = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            const settings = await getSettings(orgId(req));
            const is_late = settings ? toMinutes(checkInTime) > toMinutes(settings.late_threshold) : false;
            const { data: created } = await supabase.from('attendance')
              .insert({ user_id: req.user.id, date: today, check_in: checkInTime, status: 'present', is_late, organization_id: orgId(req) })
              .select().single();
            return res.json(created || null);
          }
        }
      }
    } catch { /* Clockify check failed — fall through to null */ }

    res.json(null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance: Check-in Mode (does this org use Clockify?) ─────────────────
// Returns whether the org has Clockify configured and if this employee is linked
router.get('/checkin-mode', auth, async (req, res) => {
  try {
    const config = await getClockifyConfig(orgId(req));
    const has_clockify = !!(config?.api_key && config?.workspace_id);
    let user_clockify_id = null;
    if (has_clockify) {
      const { data: u } = await supabase.from('users').select('clockify_user_id, email').eq('id', req.user.id).maybeSingle();
      user_clockify_id = u?.clockify_user_id || null;
      // Auto-link by email if not yet set
      if (!user_clockify_id && u?.email) {
        user_clockify_id = await autoLinkClockifyUser(req.user.id, u.email, config);
      }
    }
    res.json({ has_clockify, user_clockify_id, syncs_clockify: has_clockify && !!user_clockify_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance: Check-in ─────────────────────────────────────────────────────
router.post('/checkin', auth, async (req, res) => {
  try {
    const today   = localDateStr();
    const timeStr = localTimeStr();
    const settings = await getSettings(orgId(req));

    const { data: existing } = await supabase.from('attendance')
      .select('*').eq('user_id', req.user.id).eq('date', today).maybeSingle();

    if (existing?.check_in && !existing?.check_out) return res.status(400).json({ error: 'Already checked in today' });

    // Clockify re-checkin: allow resuming after a break (check_in + check_out both set)
    if (existing?.check_in && existing?.check_out) {
      const config = await getClockifyConfig(orgId(req));
      const { data: uRow } = await supabase.from('users').select('clockify_user_id').eq('id', req.user.id).maybeSingle();
      const isClockifyUser = !!(config?.api_key && config?.workspace_id && uRow?.clockify_user_id);
      if (!isClockifyUser) return res.status(400).json({ error: 'You have already checked out today' });

      let clockify_synced = false;
      let entryId = null;
      try {
        const resp = await axios.post(
          `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${uRow.clockify_user_id}/time-entries`,
          { start: new Date().toISOString(), description: '' },
          { headers: { 'X-Api-Key': config.api_key } }
        );
        if (resp.data?.id) entryId = resp.data.id;
        clockify_synced = true;
      } catch { /* Clockify unavailable */ }

      const updateFields = { check_out: null };
      if (entryId) updateFields.clockify_entry_id = entryId;
      const { data: resumed } = await supabase.from('attendance')
        .update(updateFields).eq('id', existing.id).select().single();
      return res.json({ record: resumed, clockify_synced, message: clockify_synced ? 'Timer resumed in Clockify' : 'Resumed working today' });
    }

    const is_late = toMinutes(timeStr) > toMinutes(settings.late_threshold);

    let record;
    if (existing) {
      const { data } = await supabase.from('attendance')
        .update({ check_in: timeStr, status: 'present', is_late, organization_id: orgId(req) })
        .eq('id', existing.id).select().single();
      record = data;
    } else {
      const { data } = await supabase.from('attendance')
        .insert({ user_id: req.user.id, date: today, check_in: timeStr, status: 'present', is_late, organization_id: orgId(req) })
        .select().single();
      record = data;
    }

    // Attempt Clockify sync: start a timer for this employee if Clockify is configured
    let clockify_synced = false;
    try {
      const config = await getClockifyConfig(orgId(req));
      if (config?.api_key && config?.workspace_id) {
        const { data: userRow } = await supabase.from('users').select('clockify_user_id').eq('id', req.user.id).maybeSingle();
        if (userRow?.clockify_user_id) {
          const resp = await axios.post(
            `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${userRow.clockify_user_id}/time-entries`,
            { start: new Date().toISOString(), description: '' },
            { headers: { 'X-Api-Key': config.api_key } }
          );
          if (resp.data?.id) {
            await supabase.from('attendance').update({ clockify_entry_id: resp.data.id }).eq('id', record.id);
            record = { ...record, clockify_entry_id: resp.data.id };
          }
          clockify_synced = true;
        }
      }
    } catch { /* Clockify unavailable — standalone attendance saved */ }

    const baseMsg = is_late ? 'Checked in (Late)' : 'Checked in successfully';
    res.json({ record, clockify_synced, message: clockify_synced ? `${baseMsg} · Synced to Clockify` : baseMsg });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance: Check-out ────────────────────────────────────────────────────
router.post('/checkout', auth, async (req, res) => {
  try {
    const today   = localDateStr();
    const timeStr = localTimeStr();
    const settings = await getSettings(orgId(req));

    const { data: record } = await supabase.from('attendance')
      .select('*').eq('user_id', req.user.id).eq('date', today).maybeSingle();

    if (!record?.check_in) return res.status(400).json({ error: 'You have not checked in today' });
    if (record.check_out)  return res.status(400).json({ error: 'Already checked out today' });

    const grossHours = Math.max(0, (toMinutes(timeStr) - toMinutes(record.check_in)) / 60);
    // Auto-close any open break at checkout time
    let totalBreakMins = record.total_break_minutes || 0;
    const breakUpdateFields = {};
    if (record.break_start && !record.break_end) {
      const autoBreakMins = Math.max(0, toMinutes(timeStr) - toMinutes(record.break_start));
      totalBreakMins += autoBreakMins;
      breakUpdateFields.break_end = timeStr;
      breakUpdateFields.total_break_minutes = totalBreakMins;
    }
    const effectiveHours = Math.max(0, grossHours - totalBreakMins / 60);
    const is_early_exit = toMinutes(timeStr) < toMinutes(settings.early_exit_threshold);
    const status        = effectiveHours < settings.half_day_hours ? 'half_day' : 'present';

    const { data: updated } = await supabase.from('attendance')
      .update({ check_out: timeStr, gross_hours: Math.round(grossHours * 100) / 100, work_hours: Math.round(effectiveHours * 100) / 100, status, is_early_exit, ...breakUpdateFields })
      .eq('id', record.id).select().single();

    // Attempt Clockify sync: stop the running timer for this employee
    let clockify_synced = false;
    try {
      const config = await getClockifyConfig(orgId(req));
      if (config?.api_key && config?.workspace_id) {
        const { data: userRow } = await supabase.from('users').select('clockify_user_id').eq('id', req.user.id).maybeSingle();
        if (userRow?.clockify_user_id) {
          await axios.patch(
            `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${userRow.clockify_user_id}/time-entries`,
            { end: new Date().toISOString() },
            { headers: { 'X-Api-Key': config.api_key } }
          );
          clockify_synced = true;
        }
      }
    } catch { /* Clockify unavailable — local checkout saved */ }

    const msgs = [];
    if (is_early_exit)        msgs.push('Early exit noted');
    if (status === 'half_day') msgs.push('Half day recorded');
    if (clockify_synced)       msgs.push('Synced to Clockify');
    res.json({ record: updated, clockify_synced, message: msgs.length ? msgs.join(' · ') : 'Checked out successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance: Break In ─────────────────────────────────────────────────────
// Break In — employee starts a break (non-Clockify standalone mode)
router.post('/break-in', auth, async (req, res) => {
  try {
    const today   = localDateStr();
    const timeStr = localTimeStr();
    const { data: record } = await supabase.from('attendance')
      .select('*').eq('user_id', req.user.id).eq('date', today).maybeSingle();
    if (!record?.check_in)                           return res.status(400).json({ error: 'You have not checked in today' });
    if (record.check_out)                            return res.status(400).json({ error: 'You have already checked out today' });
    if (record.break_start && !record.break_end)     return res.status(400).json({ error: 'You are already on a break' });
    const { data: updated } = await supabase.from('attendance')
      .update({ break_start: timeStr, break_end: null, total_break_minutes: 0 })
      .eq('id', record.id).select().single();
    res.json({ record: updated, message: 'Break started' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance: Break Out ────────────────────────────────────────────────────
// Break Out — employee ends a break
router.post('/break-out', auth, async (req, res) => {
  try {
    const today   = localDateStr();
    const timeStr = localTimeStr();
    const { data: record } = await supabase.from('attendance')
      .select('*').eq('user_id', req.user.id).eq('date', today).maybeSingle();
    if (!record?.check_in)                    return res.status(400).json({ error: 'You have not checked in today' });
    if (!record.break_start || record.break_end) return res.status(400).json({ error: 'No active break found' });
    const breakMins = Math.max(0, toMinutes(timeStr) - toMinutes(record.break_start));
    const { data: updated } = await supabase.from('attendance')
      .update({ break_end: timeStr, total_break_minutes: breakMins })
      .eq('id', record.id).select().single();
    const hrs = Math.floor(breakMins / 60), mins = breakMins % 60;
    const dur = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    res.json({ record: updated, message: `Break ended · ${dur} break taken` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance: Admin Edit (by ID) ──────────────────────────────────────────
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { check_in, check_out, status, is_late, is_early_exit, notes } = req.body;
    const work_hours = check_in && check_out
      ? Math.max(0, (toMinutes(check_out) - toMinutes(check_in)) / 60) : 0;
    const { data } = await supabase.from('attendance')
      .update({ check_in, check_out, status, is_late: !!is_late, is_early_exit: !!is_early_exit, work_hours: Math.round(work_hours * 100) / 100, notes })
      .eq('id', req.params.id).select().single();
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance: Mark Absent ──────────────────────────────────────────────────
router.post('/mark-absent', auth, adminOnly, async (req, res) => {
  try {
    const { user_id, date } = req.body;
    await supabase.from('attendance')
      .upsert({ user_id, date, status: 'absent' }, { onConflict: 'user_id,date' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance: Admin Create or Full Edit ────────────────────────────────────
// Admin create or fully edit any attendance record
router.post('/admin-edit', auth, adminOnly, async (req, res) => {
  try {
    const { user_id, date, check_in, check_out, status, is_late, is_early_exit, notes } = req.body;
    if (!user_id || !date) return res.status(400).json({ error: 'user_id and date required' });
    const work_hours = check_in && check_out
      ? Math.max(0, (toMinutes(check_out) - toMinutes(check_in)) / 60) : 0;
    const { data, error } = await supabase.from('attendance')
      .upsert({
        user_id: parseInt(user_id), date,
        check_in:      check_in      || null,
        check_out:     check_out     || null,
        status:        status        || 'present',
        is_late:       !!is_late,
        is_early_exit: !!is_early_exit,
        work_hours:    Math.round(work_hours * 100) / 100,
        notes:         notes         || null,
      }, { onConflict: 'user_id,date' })
      .select().single();
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance: Mark Late/Early (POST — create/update) ──────────────────────
// Mark late come / early exit for an employee on a given date
router.post('/late-early', auth, adminOnly, async (req, res) => {
  try {
    const { user_id, date, late_come, late_come_time, early_exit, early_exit_time } = req.body;
    if (!user_id || !date) return res.status(400).json({ error: 'user_id and date are required' });

    // Fetch existing record for the day
    const { data: existing } = await supabase.from('attendance')
      .select('*').eq('user_id', user_id).eq('date', date).maybeSingle();

    const updates = {};
    if (late_come === 'yes' && late_come_time)  { updates.is_late      = true;  updates.check_in  = late_come_time;  }
    if (late_come === 'none')                    { updates.is_late      = false; }
    if (early_exit === 'yes' && early_exit_time){ updates.is_early_exit = true;  updates.check_out = early_exit_time; }
    if (early_exit === 'none')                   { updates.is_early_exit = false; }

    // Recalculate work hours if both times known
    const ci = updates.check_in  || existing?.check_in;
    const co = updates.check_out || existing?.check_out;
    if (ci && co) {
      const work_hours = Math.max(0, (toMinutes(co) - toMinutes(ci)) / 60);
      updates.work_hours = Math.round(work_hours * 100) / 100;
    }

    if (existing) {
      await supabase.from('attendance').update(updates).eq('id', existing.id);
    } else {
      // No record yet — create one with status present
      await supabase.from('attendance').insert({
        user_id, date,
        status: 'present',
        is_late:       updates.is_late      ?? false,
        is_early_exit: updates.is_early_exit ?? false,
        check_in:      updates.check_in  || null,
        check_out:     updates.check_out || null,
        work_hours:    updates.work_hours || 0,
      });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance: Late/Early List (GET) ────────────────────────────────────────
// Return attendance records where is_late or is_early_exit, joined with user info
router.get('/late-early', auth, async (req, res) => {
  try {
    // Scope to employees only (never show admin in this list)
    const { data: empRows } = await supabase.from('users').select('id').eq('role', 'employee');
    const empIds = (empRows || []).map(e => e.id);

    let query = supabase.from('attendance')
      .select('*, users(name, email, avatar_color, department)')
      .or('is_late.eq.true,is_early_exit.eq.true')
      .in('user_id', empIds)
      .order('date', { ascending: false });

    // Optional date filter
    if (req.query.date) query = query.eq('date', req.query.date);

    // Employees see only their own records
    if (!isAdminRole(req.user.role)) query = query.eq('user_id', req.user.id);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const result = (data || []).map(r => ({ ...r, ...r.users, users: undefined }));
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance: Update Late/Early Flags (PUT by ID) ─────────────────────────
// Update late/early flags on an existing attendance record
router.put('/late-early/:id', auth, adminOnly, async (req, res) => {
  try {
    const { late_come, late_come_time, early_exit, early_exit_time } = req.body;

    const { data: existing, error: fetchErr } = await supabase.from('attendance')
      .select('*').eq('id', req.params.id).single();
    if (fetchErr || !existing) return res.status(404).json({ error: 'Record not found' });

    const updates = {};
    if (late_come === 'yes' && late_come_time)   { updates.is_late       = true;  updates.check_in  = late_come_time;  }
    if (late_come === 'none')                     { updates.is_late       = false; updates.check_in  = null; }
    if (early_exit === 'yes' && early_exit_time) { updates.is_early_exit = true;  updates.check_out = early_exit_time; }
    if (early_exit === 'none')                   { updates.is_early_exit = false; updates.check_out = null; }

    const ci = updates.check_in  ?? existing.check_in;
    const co = updates.check_out ?? existing.check_out;
    if (ci && co) updates.work_hours = Math.round(Math.max(0, (toMinutes(co) - toMinutes(ci)) / 60) * 100) / 100;

    await supabase.from('attendance').update(updates).eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance: Clear Late/Early Flags (DELETE by ID) ───────────────────────
// Clear late/early flags from an attendance record
router.delete('/late-early/:id', auth, adminOnly, async (req, res) => {
  try {
    const { data: existing } = await supabase.from('attendance')
      .select('*').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ error: 'Record not found' });

    await supabase.from('attendance')
      .update({ is_late: false, is_early_exit: false, check_in: null, check_out: null })
      .eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Attendance: Cleanup Orphaned Leave Records ───────────────────────────────
// Clean up attendance records with leave-based status on weekends or with no approved leave backing them
router.post('/cleanup-orphaned', auth, async (req, res) => {
  try {
    const oid = orgId(req);

    const { data: leaveAttendance } = await supabase.from('attendance')
      .select('id, user_id, date, status')
      .eq('organization_id', oid)
      .in('status', ['on_leave', 'half_day', 'wfh']);

    if (!leaveAttendance?.length) return res.json({ removed: 0 });

    const { data: approvedLeaves } = await supabase.from('leaves')
      .select('user_id, start_date, end_date, leave_time')
      .eq('organization_id', oid)
      .eq('status', 'approved');

    const toDelete = [];
    for (const att of leaveAttendance) {
      const d = new Date(att.date + 'T12:00:00');
      const dow = d.getDay();
      // Delete if on weekend (Saturday = 6, Sunday = 0)
      if (dow === 0 || dow === 6) {
        toDelete.push(att.id);
        continue;
      }
      const hasLeave = (approvedLeaves || []).some(l => {
        if (l.user_id !== att.user_id) return false;
        if (att.date < l.start_date || att.date > l.end_date) return false;
        const expected = l.leave_time === 'half' ? 'half_day' : l.leave_time === 'wfh' ? 'wfh' : 'on_leave';
        return att.status === expected;
      });
      if (!hasLeave) toDelete.push(att.id);
    }

    if (toDelete.length) await supabase.from('attendance').delete().eq('organization_id', oid).in('id', toDelete);
    res.json({ removed: toDelete.length, success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
