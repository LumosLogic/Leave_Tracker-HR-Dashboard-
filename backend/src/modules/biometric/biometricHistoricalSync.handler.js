/**
 * biometricHistoricalSync.handler.js
 *
 * Phase 2 — Historical attendance recovery from ZKTeco devices.
 *
 * Flow:
 *   POST /api/biometric/devices/:id/historical-sync
 *       ↓  Creates DB job record + activates in-memory slot
 *       ↓  Calls scheduleSyncForSn(sn) → device heartbeat → "GET ATTLOG Stamp=0"
 *       ↓  Device replays all stored ATTLOGs → POST /iclock/cdata
 *       ↓  biometricPush.handler.js detects active job → routes here
 *       ↓  processHistoricalLine() — date-range filter → insert as 'historical_recovery'
 *       ↓  90 s after last batch → job auto-completes
 *
 * ISOLATION GUARANTEE
 *   • processAttlogLine() (live path) is NOT modified
 *   • The Aug-1 hard cutoff on the live path is NOT removed
 *   • Out-of-range punches during historical mode fall back to the live path
 *     so no live punch is ever dropped while a historical job is active
 *   • Historical records are inserted with processed=false — admin must run
 *     /api/biometric/reprocess-all to create attendance records from them
 */

'use strict';

const { pool } = require('../../config/db-pg-adapter');

// ── Active historical sync jobs (in-memory, per server process) ───────────────
// Map: serial_number → jobState
const activeJobs = new Map();

// Job state shape:
// {
//   jobId:      UUID string
//   orgId:      number
//   fromDate:   Date (start of from_date 00:00:00 IST)
//   toDate:     Date (end   of to_date   23:59:59 IST)
//   dryRun:     boolean
//   stats:      { received, in_range, inserted, duplicate, ignored }
//   timer:      NodeJS timeout handle  (auto-completes after COMPLETION_TIMEOUT_MS)
// }

const COMPLETION_TIMEOUT_MS = 90_000; // 90 s quiet period → job complete

// ── Public API ────────────────────────────────────────────────────────────────

function getActiveJobForSn(sn) {
  return activeJobs.get(sn) || null;
}

/**
 * Activate a historical sync job in memory.
 * Call this AFTER the DB record is created and BEFORE scheduleSyncForSn.
 */
async function activateJob(sn, jobId, orgId, fromDate, toDate, dryRun) {
  // Build IST-aware date boundaries
  const fromTs = new Date(fromDate + 'T00:00:00+05:30');
  const toTs   = new Date(toDate   + 'T23:59:59.999+05:30');

  const job = {
    jobId,
    orgId,
    fromDate: fromTs,
    toDate:   toTs,
    dryRun,
    stats: { received: 0, in_range: 0, inserted: 0, duplicate: 0, ignored: 0 },
    timer: null,
  };

  activeJobs.set(sn, job);
  _resetTimer(sn);

  const mode = dryRun ? 'DRY RUN' : 'LIVE';
  console.log(`[historical-sync] ${mode} job ${jobId} activated — SN=${sn} range=${fromDate}→${toDate}`);
}

/**
 * Process one ATTLOG line during a historical sync.
 *
 * Returns true  → line was handled by historical path (caller must NOT re-process)
 * Returns false → line is outside the requested range; caller should run live path
 *
 * biometricPush.handler.js calls this for each line, then routes false-returns
 * through the unchanged processAttlogLine() so no live punch is ever lost.
 */
async function processHistoricalLine(line, sn, job) {
  const parts = line.split('\t');
  if (parts.length < 3) return true;  // malformed — skip silently, don't double-process

  const pin       = parts[0].trim();
  const timeStr   = parts[1].trim();
  const punchType = parseInt(parts[2].trim(), 10) || 0;

  const punchTime = new Date(timeStr);
  if (isNaN(punchTime.getTime())) return true;

  // Count ALL lines the device sends during this historical session
  job.stats.received++;

  // ── Date-range gate ────────────────────────────────────────────────────────
  if (punchTime < job.fromDate || punchTime > job.toDate) {
    // Out of requested range — signal caller to use live path (handles dedup itself)
    return false;
  }

  job.stats.in_range++;

  // ── Dry run — count only, zero DB writes ─────────────────────────────────
  if (job.dryRun) {
    try {
      const dupRes = await pool.query(
        `SELECT 1 FROM biometric_raw_logs
         WHERE device_serial = $1 AND punch_time = $2::timestamptz AND employee_pin = $3
         LIMIT 1`,
        [sn, punchTime.toISOString(), pin]
      );
      if (dupRes.rows.length > 0) job.stats.duplicate++;
      else                        job.stats.inserted++;  // "would insert"
    } catch (_) {
      job.stats.ignored++;
    }
    return true;
  }

  // ── Real insert — duplicate-safe via existing UNIQUE constraint ───────────
  // UNIQUE (device_serial, punch_time, employee_pin) + ON CONFLICT DO NOTHING
  // means a record already received via live ADMS is silently skipped here.
  try {
    const logRes = await pool.query(
      `INSERT INTO biometric_raw_logs
         (org_id, device_serial, employee_pin, punch_time, punch_type, processed, source)
       VALUES ($1, $2, $3, $4::timestamptz, $5, false, 'historical_recovery')
       ON CONFLICT (device_serial, punch_time, employee_pin) DO NOTHING
       RETURNING id`,
      [job.orgId, sn, pin, punchTime.toISOString(), punchType]
    );

    if (logRes.rows.length > 0) job.stats.inserted++;
    else                        job.stats.duplicate++;
  } catch (err) {
    job.stats.ignored++;
    console.error(`[historical-sync] Insert error SN=${sn} PIN=${pin}:`, err.message);
  }

  return true;
}

/**
 * Called by biometricPush.handler.js after finishing each ATTLOG batch.
 * Resets the completion timer so a multi-batch sync does not time out early.
 */
function onBatchComplete(sn, batchCount) {
  const job = activeJobs.get(sn);
  if (!job) return;
  _resetTimer(sn);
  const s = job.stats;
  console.log(
    `[historical-sync] SN=${sn} batch done — batch_lines=${batchCount} ` +
    `total: received=${s.received} in_range=${s.in_range} ` +
    `inserted=${s.inserted} dup=${s.duplicate} ignored=${s.ignored}`
  );
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _resetTimer(sn) {
  const job = activeJobs.get(sn);
  if (!job) return;
  clearTimeout(job.timer);
  job.timer = setTimeout(() => _finalizeJob(sn, null), COMPLETION_TIMEOUT_MS);
}

async function _finalizeJob(sn, error) {
  const job = activeJobs.get(sn);
  if (!job) return;

  clearTimeout(job.timer);
  activeJobs.delete(sn);

  const status = error ? 'failed' : 'completed';
  const s = job.stats;

  try {
    await pool.query(
      `UPDATE biometric_historical_sync_jobs
       SET status            = $1,
           completed_at      = NOW(),
           records_received  = $2,
           records_in_range  = $3,
           records_inserted  = $4,
           records_duplicate = $5,
           records_ignored   = $6,
           error             = $7
       WHERE id = $8`,
      [status, s.received, s.in_range, s.inserted, s.duplicate, s.ignored, error || null, job.jobId]
    );
  } catch (err) {
    console.error('[historical-sync] Failed to persist job completion:', err.message);
  }

  console.log(
    `[historical-sync] Job ${job.jobId} ${status} — ` +
    `received=${s.received} in_range=${s.in_range} inserted=${s.inserted} ` +
    `duplicate=${s.duplicate} ignored=${s.ignored}${error ? ' err=' + error : ''}`
  );
}

module.exports = { getActiveJobForSn, activateJob, processHistoricalLine, onBatchComplete };
