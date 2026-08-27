'use strict';

/**
 * biometricAutoSyncScheduler.js
 *
 * Automatic Biometric Sync — scheduler.
 *
 * Architecture: reuses the EXISTING Historical Sync flow (biometricHistoricalSync.handler.js).
 * At each configured time, for every biometric device in the org:
 *   1. Creates a biometric_historical_sync_jobs record (same table as manual historical sync)
 *   2. Calls activateJob() — same as the manual /devices/:id/historical-sync endpoint
 *   3. Calls scheduleSyncForSn(sn, 'query', { startTime }) — device picks this up on next heartbeat
 *   4. Device uploads via /iclock/cdata → processHistoricalLine() → biometric_raw_logs
 *   5. 90s quiet period → _finalizeJob() → auto-reprocess (autoReprocess=true)
 *
 * Nothing new in the data path. The only addition is the schedule trigger and the
 * autoReprocess flag added to activateJob().
 *
 * Biometric-enabled orgs only. Relitrade-scoped for now (orgs with registered devices).
 */

const { pool }          = require('../../config/db-pg-adapter');
const { activateJob }   = require('./biometricHistoricalSync.handler');
const { scheduleSyncForSn } = require('./biometricHeartbeat.handler');

// ─── Timer helpers ─────────────────────────────────────────────────────────────

function msUntilNext(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const now  = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function repeatMs(frequency) {
  if (frequency === 'week')  return 7  * 24 * 60 * 60 * 1000;
  if (frequency === 'month') return 30 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000; // daily (default)
}

// ─── Per-org schedule state ────────────────────────────────────────────────────

class OrgSchedule {
  constructor(orgId, frequency) {
    this.orgId     = orgId;
    this.frequency = frequency;
    this.timers    = [];
    this.active    = true;
  }

  addTime(hhmm) {
    const interval = repeatMs(this.frequency);
    const delay    = msUntilNext(hhmm);
    console.log(
      `[auto-sync] org=${this.orgId} scheduled at ${hhmm} IST — ` +
      `next run in ${Math.round(delay / 60000)}min (${this.frequency})`
    );

    const fire = () => {
      if (!this.active) return;
      console.log(`[auto-sync] Scheduled trigger — org=${this.orgId} time=${hhmm}`);
      runOrgAutoSync(this.orgId).catch(err =>
        console.error(`[auto-sync] org=${this.orgId} error:`, err.message)
      );
      const t = setTimeout(fire, interval);
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

// ─── Core sync logic ──────────────────────────────────────────────────────────

async function runOrgAutoSync(orgId) {
  // Load config
  const cfgRes = await pool.query(
    `SELECT * FROM biometric_auto_sync_config WHERE org_id = $1 LIMIT 1`,
    [orgId]
  );
  const config = cfgRes.rows[0];
  if (!config || !config.enabled) {
    console.log(`[auto-sync] org=${orgId} — config disabled, skipping`);
    return;
  }

  // Determine date range
  const toDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // "YYYY-MM-DD"

  let fromDate;
  if (config.last_sync_date) {
    fromDate = config.last_sync_date instanceof Date
      ? config.last_sync_date.toISOString().slice(0, 10)
      : String(config.last_sync_date).slice(0, 10);
  } else {
    // First ever sync: go back 2 days as a safe starting window
    const d = new Date();
    d.setDate(d.getDate() - 2);
    fromDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }

  // Get all registered devices for this org
  const devRes = await pool.query(
    `SELECT id, serial_number, device_name FROM biometric_devices WHERE org_id = $1`,
    [orgId]
  );

  if (!devRes.rows.length) {
    console.log(`[auto-sync] org=${orgId} — no registered devices, skipping`);
    return;
  }

  console.log(
    `[auto-sync] org=${orgId} — triggering ${devRes.rows.length} device(s) ` +
    `range=${fromDate}→${toDate}`
  );

  // Mark as running
  await pool.query(
    `UPDATE biometric_auto_sync_config
     SET last_sync_at = NOW(), last_sync_status = 'running', updated_at = NOW()
     WHERE org_id = $1`,
    [orgId]
  );

  let triggered = 0;

  for (const device of devRes.rows) {
    const sn = device.serial_number;

    // Skip if this device already has an active job running
    const { getActiveJobForSn } = require('./biometricHistoricalSync.handler');
    if (getActiveJobForSn(sn)) {
      console.log(`[auto-sync] SN=${sn} — active historical job in progress, skipping this device`);
      continue;
    }
    const conflictRes = await pool.query(
      `SELECT id FROM biometric_historical_sync_jobs
       WHERE device_id = $1 AND status IN ('pending','running') LIMIT 1`,
      [device.id]
    );
    if (conflictRes.rows.length) {
      console.log(`[auto-sync] SN=${sn} — DB job still running, skipping this device`);
      continue;
    }

    // Create historical sync job (same table/logic as manual sync)
    const jobRes = await pool.query(
      `INSERT INTO biometric_historical_sync_jobs
         (org_id, device_id, serial_number, from_date, to_date, dry_run, status, auto_triggered)
       VALUES ($1, $2, $3, $4, $5, false, 'running', true)
       RETURNING id`,
      [orgId, device.id, sn, fromDate, toDate]
    );
    const jobId = jobRes.rows[0].id;

    // Activate in-memory job with autoReprocess=true so attendance is updated automatically
    await activateJob(sn, jobId, orgId, fromDate, toDate, false, true);

    // Tell device to upload its ATTLOG on next heartbeat (date-based query, read-only)
    scheduleSyncForSn(sn, 'query', { startTime: fromDate });

    console.log(`[auto-sync] SN=${sn} — job=${jobId} scheduled (device will upload on next heartbeat)`);
    triggered++;
  }

  if (!triggered) {
    // All devices were busy — restore status
    await pool.query(
      `UPDATE biometric_auto_sync_config
       SET last_sync_status = 'failed', last_sync_error = 'All devices busy or no devices available',
           updated_at = NOW()
       WHERE org_id = $1`,
      [orgId]
    );
    console.warn(`[auto-sync] org=${orgId} — no devices triggered`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Cancel existing schedule for an org and rebuild from current DB config.
 * Call after every config PUT.
 */
async function rescheduleOrg(orgId) {
  const existing = schedules.get(orgId);
  if (existing) {
    existing.cancel();
    schedules.delete(orgId);
  }

  let config;
  try {
    const res = await pool.query(
      `SELECT * FROM biometric_auto_sync_config WHERE org_id = $1 LIMIT 1`,
      [orgId]
    );
    config = res.rows[0];
  } catch (err) {
    console.error(`[auto-sync] rescheduleOrg config load error org=${orgId}:`, err.message);
    return;
  }

  if (!config || !config.enabled) {
    console.log(`[auto-sync] org=${orgId} — disabled, no timers`);
    return;
  }

  const schedule = new OrgSchedule(orgId, config.frequency || 'day');
  if (config.sync_time_1) schedule.addTime(config.sync_time_1);
  if (config.sync_time_2) schedule.addTime(config.sync_time_2);
  schedules.set(orgId, schedule);
}

/**
 * Load all enabled orgs and start their schedules.
 * Called once on server startup. Tolerates missing table (pre-migration).
 */
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

/**
 * Run an immediate sync for an org (manual trigger from UI).
 */
async function triggerNow(orgId) {
  return runOrgAutoSync(orgId);
}

module.exports = { start, rescheduleOrg, triggerNow };
