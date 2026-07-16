const express = require('express');
const router  = express.Router();
const axios    = require('axios');
const { supabase } = require('../../config/db');
const { auth, adminOnly } = require('../../middleware/auth');
const { localDateStr, localTimeStr, orgId, toMinutes, getSettings } = require('../../utils/helpers');

// ─── Clockify config helper (local) ───────────────────────────────────────────
async function getClockifyConfig(oId) {
  const { data } = await supabase.from('organizations')
    .select('clockify_api_key, clockify_workspace_id, clockify_last_synced')
    .eq('id', oId || 1).maybeSingle();
  if (!data) return null;
  return { api_key: data.clockify_api_key, workspace_id: data.clockify_workspace_id, last_synced: data.clockify_last_synced };
}

// ─── Clockify sync helper ─────────────────────────────────────────────────────
async function syncClockifyForDate(targetDate, config, settings) {
  // Use IST (UTC+5:30) midnight boundaries so the date range covers the correct calendar day
  const startISO = targetDate + 'T00:00:00+05:30';
  const endISO   = targetDate + 'T23:59:59+05:30';

  const { data: cUsersResp } = await axios.get(
    `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/users`,
    { headers: { 'X-Api-Key': config.api_key } }
  );
  const cUsers = cUsersResp?.data || cUsersResp || [];

  const results = [];
  for (const cUser of cUsers) {
    const { data: localUser } = await supabase.from('users').select('*').ilike('email', cUser.email).maybeSingle();
    if (!localUser) continue;

    const { data: entriesResp } = await axios.get(
      `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${cUser.id}/time-entries`,
      { headers: { 'X-Api-Key': config.api_key }, params: { start: startISO, end: endISO } }
    );
    const entries = entriesResp?.data || entriesResp || [];

    let totalSeconds        = 0;
    let firstStart          = null;
    let lastEnd             = null;
    let hasRunningTimer     = false; // true if any entry has no end (timer currently active)
    let runningEntryStartISO = null; // ISO start of the currently-running entry

    for (const e of entries) {
      // Sum effective seconds from COMPLETED entries (those with a duration field)
      const match = (e.timeInterval?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (match) totalSeconds += (parseInt(match[1]||0)*3600) + (parseInt(match[2]||0)*60) + parseInt(match[3]||0);

      // Track earliest start across all entries → check-in time
      if (e.timeInterval?.start) {
        const d   = new Date(e.timeInterval.start);
        const str = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        if (!firstStart || str < firstStart) firstStart = str;
      }
      // Track latest end from completed entries only → check-out time
      if (e.timeInterval?.end) {
        const d   = new Date(e.timeInterval.end);
        const str = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        if (!lastEnd || str > lastEnd) lastEnd = str;
      } else {
        hasRunningTimer = true;
        if (e.timeInterval?.start) runningEntryStartISO = e.timeInterval.start;
      }
    }

    // CRITICAL FIX: Add the elapsed time of the currently-running session to totalSeconds.
    // Without this, break_time = gross - completed_only = includes running session = hugely inflated.
    // With this fix: eff = completed + running, breaks = gross - eff = only real idle gaps.
    if (hasRunningTimer && runningEntryStartISO) {
      const runningElapsedMs = Date.now() - new Date(runningEntryStartISO).getTime();
      if (runningElapsedMs > 0) totalSeconds += Math.floor(runningElapsedMs / 1000);
    }

    // clockify_hours = total effective working time (completed sessions + current running session)
    const clockify_hours = Math.round((totalSeconds / 3600) * 100) / 100;

    // gross_hours = full day span from first start to last end/now (includes break gaps)
    // total_break_minutes = gross - effective = only actual idle time between sessions
    let gross_hours         = 0;
    let total_break_minutes = 0;
    if (firstStart && lastEnd && !hasRunningTimer) {
      gross_hours         = Math.max(0, Math.round((toMinutes(lastEnd) - toMinutes(firstStart)) / 60 * 100) / 100);
      total_break_minutes = Math.max(0, Math.round((gross_hours - clockify_hours) * 60));
    } else if (firstStart && hasRunningTimer) {
      const nowStr        = localTimeStr();
      gross_hours         = Math.max(0, Math.round((toMinutes(nowStr) - toMinutes(firstStart)) / 60 * 100) / 100);
      total_break_minutes = Math.max(0, Math.round((gross_hours - clockify_hours) * 60));
    }

    const { data: existing } = await supabase.from('attendance')
      .select('id, check_in, check_out').eq('user_id', localUser.id).eq('date', targetDate).maybeSingle();

    if (existing) {
      const upd = {
        clockify_hours,
        work_hours: Math.round(clockify_hours * 100) / 100, // effective = sum of Clockify sessions
        gross_hours,
        total_break_minutes,
      };
      // Always update check_in from Clockify (first timer start = true check-in time)
      if (firstStart) { upd.check_in = firstStart; upd.status = 'present'; }
      // check_out = last timer stop, but ONLY when no timer is running right now
      // If timer is running (employee back from break / mid-session) → clear any stale check_out
      if (!hasRunningTimer && lastEnd) upd.check_out = lastEnd;
      if (hasRunningTimer)             upd.check_out = null;
      await supabase.from('attendance').update(upd).eq('id', existing.id);
    } else if (clockify_hours > 0 || firstStart) {
      const is_late = firstStart ? toMinutes(firstStart) > toMinutes(settings.late_threshold) : false;
      await supabase.from('attendance').insert({
        user_id:             localUser.id,
        date:                targetDate,
        status:              'present',
        check_in:            firstStart,
        check_out:           (!hasRunningTimer && lastEnd) ? lastEnd : null,
        is_late,
        work_hours:          clockify_hours,   // effective (NOT gross span)
        gross_hours,
        total_break_minutes,
        clockify_hours,
      });
    }
    results.push({ user: localUser.name, clockify_hours });
  }
  return results;
}

// ─── Clockify: List Workspaces ────────────────────────────────────────────────
router.get('/workspaces', auth, adminOnly, async (req, res) => {
  try {
    const config = await getClockifyConfig(orgId(req));
    if (!config?.api_key || config.api_key === '') return res.status(400).json({ error: 'Clockify API key not configured' });
    const response = await axios.get('https://api.clockify.me/api/v1/workspaces', { headers: { 'X-Api-Key': config.api_key } });
    res.json(response.data);
  } catch (err) { res.status(500).json({ error: 'Clockify error: ' + (err.response?.data?.message || err.message) }); }
});

// ─── Clockify: Live Timers ────────────────────────────────────────────────────
// Live timers — who is currently tracking right now in Clockify
router.get('/live', auth, async (req, res) => {
  try {
    const config = await getClockifyConfig(orgId(req));
    if (!config?.api_key || config.api_key === '') return res.json({ timers: {} });

    const { data: employees } = await supabase.from('users')
      .select('id, clockify_user_id').eq('role', 'employee').eq('organization_id', orgId(req));

    const timers = {};
    await Promise.all((employees || []).map(async emp => {
      if (!emp.clockify_user_id) return;
      try {
        const resp = await axios.get(
          `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${emp.clockify_user_id}/time-entries`,
          { headers: { 'X-Api-Key': config.api_key }, params: { 'in-progress': true, 'page-size': 1 } }
        );
        const entries = resp.data || [];
        const active  = entries.find(e => !e.timeInterval?.end);
        timers[emp.id] = active
          ? { running: true,  start: active.timeInterval.start, description: active.description || '' }
          : { running: false };
      } catch { timers[emp.id] = { running: false }; }
    }));

    res.json({ timers });
  } catch (err) { res.json({ timers: {} }); }
});

// ─── Clockify: Day Hours ──────────────────────────────────────────────────────
// Fetch total hours per employee for a specific past date directly from Clockify
router.get('/day', auth, async (req, res) => {
  try {
    const config = await getClockifyConfig(orgId(req));
    if (!config?.api_key || !config?.workspace_id) return res.json({ hours: {} });

    const date     = req.query.date || localDateStr();
    const startISO = date + 'T00:00:00+05:30';
    const endISO   = date + 'T23:59:59+05:30';

    const { data: employees } = await supabase.from('users')
      .select('id, clockify_user_id').eq('role', 'employee').eq('organization_id', orgId(req));

    const hours = {};
    await Promise.all((employees || []).filter(e => e.clockify_user_id).map(async emp => {
      try {
        const resp = await axios.get(
          `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${emp.clockify_user_id}/time-entries`,
          { headers: { 'X-Api-Key': config.api_key }, params: { start: startISO, end: endISO, 'page-size': 50 } }
        );
        const entries = resp.data || [];
        let totalSeconds = 0;
        for (const e of entries) {
          const m = (e.timeInterval?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
          if (m) totalSeconds += (parseInt(m[1]||0)*3600) + (parseInt(m[2]||0)*60) + parseInt(m[3]||0);
        }
        if (totalSeconds > 0) hours[emp.id] = Math.round((totalSeconds / 3600) * 100) / 100;
      } catch { /* individual failure ok */ }
    }));

    res.json({ hours });
  } catch (err) { res.json({ hours: {} }); }
});

// ─── Clockify: User Entries (timeline) ───────────────────────────────────────
// Timeline: full list of Clockify time entries for a specific user + date (admin/HR only)
router.get('/user-entries', auth, adminOnly, async (req, res) => {
  try {
    const config = await getClockifyConfig(orgId(req));
    if (!config?.api_key || !config?.workspace_id) return res.json({ entries: [] });

    const { userId, date } = req.query;
    if (!userId || !date) return res.status(400).json({ error: 'userId and date required' });

    const { data: userRow } = await supabase.from('users')
      .select('clockify_user_id').eq('id', parseInt(userId)).eq('organization_id', orgId(req)).maybeSingle();
    if (!userRow?.clockify_user_id) return res.json({ entries: [] });

    const startISO = date + 'T00:00:00+05:30';
    const endISO   = date + 'T23:59:59+05:30';

    const resp = await axios.get(
      `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${userRow.clockify_user_id}/time-entries`,
      { headers: { 'X-Api-Key': config.api_key }, params: { start: startISO, end: endISO, 'page-size': 50 } }
    );

    const raw = resp.data || [];
    const entries = raw
      .filter(e => e.timeInterval?.start)
      .sort((a, b) => new Date(a.timeInterval.start) - new Date(b.timeInterval.start))
      .map(e => {
        const start = new Date(e.timeInterval.start);
        const end   = e.timeInterval.end ? new Date(e.timeInterval.end) : null;
        const fmt   = d => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
        const durMatch = (e.timeInterval?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        const durSec = durMatch ? (parseInt(durMatch[1]||0)*3600 + parseInt(durMatch[2]||0)*60 + parseInt(durMatch[3]||0)) : 0;
        return {
          id:          e.id,
          description: e.description || '',
          start:       fmt(start),
          end:         end ? fmt(end) : null,
          durationMin: Math.round(durSec / 60),
        };
      });

    res.json({ entries });
  } catch (err) { res.json({ entries: [] }); }
});

// ─── Clockify: My Hours (employee self-service) ───────────────────────────────
// Employee self-service: get their own Clockify total hours per day for a month
// Uses the org's API key + the employee's clockify_user_id — no adminOnly required
router.get('/my-hours', auth, async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ error: 'year and month required' });

    // Get org Clockify config
    const config = await getClockifyConfig(orgId(req));
    if (!config?.api_key || !config?.workspace_id) return res.json({ hours: {} });

    // Get this user's clockify_user_id
    const { data: userRow } = await supabase.from('users')
      .select('clockify_user_id').eq('id', req.user.id).maybeSingle();
    if (!userRow?.clockify_user_id) return res.json({ hours: {} });

    const ym     = `${year}-${String(month).padStart(2, '0')}`;
    const startISO = `${ym}-01T00:00:00+05:30`;
    const lastDay  = new Date(parseInt(year), parseInt(month), 0).getDate();
    const endISO   = `${ym}-${String(lastDay).padStart(2, '0')}T23:59:59+05:30`;

    const resp = await axios.get(
      `https://api.clockify.me/api/v1/workspaces/${config.workspace_id}/user/${userRow.clockify_user_id}/time-entries`,
      { headers: { 'X-Api-Key': config.api_key }, params: { start: startISO, end: endISO, 'page-size': 500 } }
    );

    const entries = resp.data || [];
    const hours   = {}; // date string → total hours

    for (const e of entries) {
      if (!e.timeInterval?.start) continue;
      const startDate = new Date(e.timeInterval.start);
      const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(startDate);
      let sec = 0;
      if (e.timeInterval?.end) {
        // Completed entry — use duration field
        const m = (e.timeInterval?.duration || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (m) sec = (parseInt(m[1]||0)*3600) + (parseInt(m[2]||0)*60) + parseInt(m[3]||0);
      } else {
        // Running entry — calculate elapsed from start until now
        sec = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 1000));
      }
      if (sec > 0) hours[dateStr] = Math.round(((hours[dateStr] || 0) + sec / 3600) * 100) / 100;
    }

    res.json({ hours });
  } catch (err) { res.json({ hours: {} }); }
});

// ─── Clockify: Manual Sync (admin) ───────────────────────────────────────────
router.post('/sync', auth, adminOnly, async (req, res) => {
  try {
    const config = await getClockifyConfig(orgId(req));
    if (!config?.api_key || !config?.workspace_id) return res.status(400).json({ error: 'Clockify API key and Workspace ID required' });

    const targetDate = req.body.date || new Date().toISOString().split('T')[0];
    const settings   = await getSettings(orgId(req));
    const results    = await syncClockifyForDate(targetDate, config, settings);

    await supabase.from('organizations').update({ clockify_last_synced: new Date().toISOString() }).eq('id', orgId(req));
    res.json({ success: true, synced: results.length, results });
  } catch (err) { res.status(500).json({ error: 'Clockify sync failed: ' + (err.response?.data?.message || err.message) }); }
});

module.exports = router;
