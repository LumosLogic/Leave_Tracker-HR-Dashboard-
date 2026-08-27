'use strict';

/**
 * biometricAutoSyncScheduler.js
 *
 * Automatic Biometric Sync — scheduler.
 * Reuses the existing Historical Sync architecture (no MSSQL, no new pipeline).
 *
 * Frequency logic:
 *   daily   — fires at sync_time_1 (+ sync_time_2) every day
 *              date range: yesterday → today
 *
 *   weekly  — fires at sync_time_1 every Sunday
 *              date range: last Monday → today (full week Mon–Sun)
 *
 *   monthly — fires at sync_time_1 on the 1st of each month
 *              date range: 1st of previous month → last day of previous month
 */

const { pool }              = require('../../config/db-pg-adapter');
const { activateJob }       = require('./biometricHistoricalSync.handler');
const { scheduleSyncForSn } = require('./biometricHeartbeat.handler');

// ─── IST date helper ──────────────────────────────────────────────────────────
function istDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // "YYYY-MM-DD"
}

// ─── Date range per frequency ─────────────────────────────────────────────────
function syncDateRange(frequency) {
  const now = new Date();

  if (frequency === 'week') {
    // Runs on Sunday — covers Mon→Sun of the current week
    // getDay() in IST: 0=Sun,1=Mon,...,6=Sat
    const todayIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const dayOfWeek = todayIST.getDay(); // 0 = Sunday
    const daysToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // days back to Monday
    const monday = new Date(todayIST);
    monday.setDate(todayIST.getDate() - daysToMon);
    const fromDate = monday.toLocaleDateString('en-CA'); // Mon of this week
    const toDate   = todayIST.toLocaleDateString('en-CA'); // today (Sunday)
    return { fromDate, toDate };
  }

  if (frequency === 'month') {
    // Runs on 1st — covers entire previous month
    const todayIST  = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const year      = todayIST.getFullYear();
    const month     = todayIST.getMonth(); // 0-indexed current month
    const firstOfPrev = new Date(year, month - 1, 1);
    const lastOfPrev  = new Date(year, month, 0);   // day 0 of current month = last day of prev month
    const fromDate = firstOfPrev.toLocaleDateString('en-CA');
    const toDate   = lastOfPrev.toLocaleDateString('en-CA');
    return { fromDate, toDate };
  }

  // daily — yesterday → today
  return { fromDate: istDate(-1), toDate: istDate(0) };
}

// ─── Timer helpers ────────────────────────────────────────────────────────────

// ms until next occurrence of HH:MM (today or tomorrow) — used for daily
function msUntilNextDaily(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const now  = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

// ms until next Sunday at HH:MM
function msUntilNextSunday(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const daysUntilSun = now.getDay() === 0 ? 0 : 7 - now.getDay();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSun, h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 7); // already passed today → next Sunday
  return next.getTime() - now.getTime();
}

// ms until 1st of next month at HH:MM
function msUntilNextFirst(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const now  = new Date();
  // Try 1st of current month
  const thisFirst = new Date(now.getFullYear(), now.getMonth(), 1, h, m, 0, 0);
  if (thisFirst > now) return thisFirst.getTime() - now.getTime();
  // Otherwise 1st of next month
  const nextFirst = new Date(now.getFullYear(), now.getMonth() + 1, 1, h, m, 0, 0);
  return nextFirst.getTime() - now.getTime();
}

function getInitialDelay(frequency, hhmm) {
  if (frequency === 'week')  return msUntilNextSunday(hhmm);
  if (frequency === 'month') return msUntilNextFirst(hhmm);
  return msUntilNextDaily(hhmm);
}

function getRepeatDelay(frequency, hhmm) {
  // After firing, recalculate delay dynamically so monthly stays on the correct 1st
  if (frequency === 'week')  return msUntilNextSunday(hhmm);
  if (frequency === 'month') return msUntilNextFirst(hhmm);
  return 24 * 60 * 60 * 1000; // daily: exactly 24h
}

// ─── OrgSchedule ─────────────────────────────────────────────────────────────

class OrgSchedule {
  constructor(orgId, frequency) {
    this.orgId     = orgId;
    this.frequency = frequency;
    this.timers    = [];
    this.active    = true;
  }

  addTime(hhmm) {
    const frequency = this.frequency;
    const delay = getInitialDelay(frequency, hhmm);

    const freqLabel = frequency === 'day' ? 'daily' : frequency === 'week' ? 'every Sunday' : '1st of month';
    console.log(
      `[auto-sync] org=${this.orgId} scheduled at ${hhmm} IST (${freqLabel}) — ` +
      `next run in ${Math.round(delay / 60000)}min`
    );

    const fire = () => {
      if (!this.active) return;
      console.log(`[auto-sync] Scheduled trigger — org=${this.orgId} time=${hhmm} freq=${frequency}`);
      runOrgAutoSync(this.orgId).catch(err =>
        console.error(`[auto-sync] org=${this.orgId} error:`, err.message)
      );
      // Recalculate next delay dynamically (important for monthly accuracy)
      const nextDelay = getRepeatDelay(frequency, hhmm);
      const t = setTimeout(fire, nextDelay);
      this.timers.push(t);
    };

    const t = setTimeout(fire, delay);
    this.timers.push(t);
  }

  cancel() {
    this.active = false;
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
  }
}

const schedules = new Map(); // orgId → OrgSchedule

// ─── Core sync ────────────────────────────────────────────────────────────────

async function runOrgAutoSync(orgId) {
  const cfgRes = await pool.query(
    `SELECT * FROM biometric_auto_sync_config WHERE org_id = $1 LIMIT 1`,
    [orgId]
  );
  const config = cfgRes.rows[0];
  if (!config || !config.enabled) {
    console.log(`[auto-sync] org=${orgId} — config disabled, skipping`);
    return;
  }

  // Compute date range based on frequency
  const { fromDate, toDate } = syncDateRange(config.frequency || 'day');

  // Get registered devices
  const devRes = await pool.query(
    `SELECT id, serial_number, device_name FROM biometric_devices WHERE org_id = $1`,
    [orgId]
  );
  if (!devRes.rows.length) {
    console.log(`[auto-sync] org=${orgId} — no registered devices, skipping`);
    return;
  }

  console.log(
    `[auto-sync] org=${orgId} freq=${config.frequency} — ` +
    `triggering ${devRes.rows.length} device(s) range=${fromDate}→${toDate}`
  );

  await pool.query(
    `UPDATE biometric_auto_sync_config
     SET last_sync_at = NOW(), last_sync_status = 'running', updated_at = NOW()
     WHERE org_id = $1`,
    [orgId]
  );

  let triggered = 0;

  for (const device of devRes.rows) {
    const sn = device.serial_number;

    // Skip if device already has an active job
    const { getActiveJobForSn } = require('./biometricHistoricalSync.handler');
    if (getActiveJobForSn(sn)) {
      console.log(`[auto-sync] SN=${sn} — historical job already active, skipping`);
      continue;
    }
    const conflictRes = await pool.query(
      `SELECT id FROM biometric_historical_sync_jobs
       WHERE device_id = $1 AND status IN ('pending','running') LIMIT 1`,
      [device.id]
    );
    if (conflictRes.rows.length) {
      console.log(`[auto-sync] SN=${sn} — DB job still running, skipping`);
      continue;
    }

    // Create historical sync job (same table as manual sync)
    const jobRes = await pool.query(
      `INSERT INTO biometric_historical_sync_jobs
         (org_id, device_id, serial_number, from_date, to_date, dry_run, status, auto_triggered)
       VALUES ($1, $2, $3, $4, $5, false, 'running', true)
       RETURNING id`,
      [orgId, device.id, sn, fromDate, toDate]
    );
    const jobId = jobRes.rows[0].id;

    // Activate in-memory job with autoReprocess=true (attendance auto-updates after upload)
    await activateJob(sn, jobId, orgId, fromDate, toDate, false, true);

    // Schedule device upload on next heartbeat (date-based query, read-only)
    scheduleSyncForSn(sn, 'query', { startTime: fromDate });

    console.log(`[auto-sync] SN=${sn} — job=${jobId} queued (device uploads on next heartbeat)`);
    triggered++;
  }

  if (!triggered) {
    await pool.query(
      `UPDATE biometric_auto_sync_config
       SET last_sync_status = 'failed',
           last_sync_error = 'All devices busy or unavailable', updated_at = NOW()
       WHERE org_id = $1`,
      [orgId]
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function rescheduleOrg(orgId) {
  const existing = schedules.get(orgId);
  if (existing) { existing.cancel(); schedules.delete(orgId); }

  let config;
  try {
    const res = await pool.query(
      `SELECT * FROM biometric_auto_sync_config WHERE org_id = $1 LIMIT 1`,
      [orgId]
    );
    config = res.rows[0];
  } catch (err) {
    console.error(`[auto-sync] rescheduleOrg error org=${orgId}:`, err.message);
    return;
  }

  if (!config || !config.enabled) {
    console.log(`[auto-sync] org=${orgId} — disabled, no timers set`);
    return;
  }

  const schedule = new OrgSchedule(orgId, config.frequency || 'day');

  if (config.sync_time_1) schedule.addTime(config.sync_time_1);
  // Time 2 only applies to daily frequency
  if (config.frequency === 'day' && config.sync_time_2) schedule.addTime(config.sync_time_2);

  schedules.set(orgId, schedule);
}

async function start() {
  try {
    const res = await pool.query(
      `SELECT org_id FROM biometric_auto_sync_config WHERE enabled = true`
    );
    console.log(`[auto-sync] Scheduler starting — ${res.rows.length} org(s) enabled`);
    for (const { org_id } of res.rows) {
      await rescheduleOrg(org_id).catch(err =>
        console.error(`[auto-sync] Failed to schedule org=${org_id}:`, err.message)
      );
    }
  } catch (err) {
    if (err.code === '42P01' || err.message.includes('does not exist')) {
      console.log('[auto-sync] Scheduler skipped — run migration add_biometric_auto_sync_2026_08_27.sql first');
    } else {
      console.error('[auto-sync] Scheduler start error:', err.message);
    }
  }
}

async function triggerNow(orgId) {
  return runOrgAutoSync(orgId);
}

module.exports = { start, rescheduleOrg, triggerNow };
