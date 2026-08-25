/**
 * biometricHeartbeat.handler.js
 * ADMS keep-alive for ZKTeco devices — GET /iclock/getrequest
 *
 * Normally responds "OK". Sync modes via scheduleSyncForSn:
 *
 *  'attlog'    → "GET ATTLOG Stamp=0"
 *                Device uploads all records it considers unacknowledged.
 *                Works correctly only if the device's internal upload-pointer
 *                has NOT been advanced by a prior successful upload cycle.
 *
 *  'update'    → "C:DATA UPDATE"
 *                Live sync — device uploads only new/pending records.
 *
 *  'dataclear' → TWO-STEP historical recovery (the correct path after any prior sync):
 *                Step 1 (this heartbeat): "C:N:DATA CLEAR ATTLOG"
 *                  Resets the device's internal upload-pointer so it treats
 *                  ALL stored records as "not yet uploaded to this server".
 *                  Does NOT delete any records from the device.
 *                  Next heartbeat is queued as 'attlog' before this returns.
 *                Step 2 (next heartbeat): "GET ATTLOG Stamp=0"
 *                  Device (with cleared pointer) re-uploads its entire ATTLOG.
 *
 * WHY 'dataclear' is needed for historical recovery:
 *   After a prior force-sync (Aug 21 2026), the device marked all ~2568
 *   records it uploaded as "acknowledged by server". Subsequent GET ATTLOG
 *   Stamp=0 calls return only the 1 new punch added since that sync.
 *   DATA CLEAR ATTLOG resets that pointer so full history flows again.
 */

const { pool } = require('../../config/db-pg-adapter');
const biometricEmitter = require('../../utils/biometricEmitter');

// SN → sync mode ('attlog' | 'update' | 'dataclear')
const pendingSyncs = new Map();

// Incrementing command sequence for C:<id>:<cmd> ADMS format
let _cmdSeq = 1;
function nextCmdId() { return _cmdSeq++; }

function scheduleSyncForSn(sn, mode) {
  mode = mode || 'attlog';
  pendingSyncs.set(sn, mode);
  const msg = `[biometric] Sync scheduled SN=${sn} mode=${mode}`;
  console.log(msg);
  biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });
}

module.exports = async function biometricHeartbeatHandler(req, res) {
  const sn    = req.query.SN;
  const stamp = req.query.Stamp;

  if (sn) {
    // Include live historical-job stats in heartbeat log if a job is active
    const historicalSync = require('./biometricHistoricalSync.handler');
    const activeJob = historicalSync.getActiveJobForSn(sn);
    const tag = activeJob ? '[historical-sync]' : '[biometric]';
    const jobInfo = activeJob
      ? ` JobReceived=${activeJob.stats.received} InRange=${activeJob.stats.in_range}`
      : '';
    const msg = `${tag} Heartbeat SN=${sn} DeviceStamp=${stamp}${jobInfo}`;
    console.log(msg);
    biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });

    pool.query(
      `UPDATE biometric_devices SET last_seen = NOW(), status = 'online' WHERE serial_number = $1`,
      [sn]
    ).catch(err => console.error('[biometric] Heartbeat DB error:', err.message));
  }

  res.setHeader('Content-Type', 'text/plain');

  if (sn && pendingSyncs.has(sn)) {
    const mode = pendingSyncs.get(sn);
    pendingSyncs.delete(sn);

    // ── Step 1/2: Reset device upload-pointer — historical recovery ──────────
    if (mode === 'dataclear') {
      const cmdId = nextCmdId();
      const msg = `[historical-sync] Step 1/2 — Sending C:${cmdId}:DATA CLEAR ATTLOG to SN=${sn} `
        + `(resets device upload-pointer without deleting records; next heartbeat sends GET ATTLOG Stamp=0)`;
      console.log(msg);
      biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });

      // Queue 'attlog' BEFORE returning — next heartbeat will send GET ATTLOG Stamp=0
      scheduleSyncForSn(sn, 'attlog');

      pool.query(
        `UPDATE biometric_devices SET last_sync_status = 'clearing' WHERE serial_number = $1`,
        [sn]
      ).catch(() => {});

      return res.status(200).send(`C:${cmdId}:DATA CLEAR ATTLOG`);
    }

    // ── Step 2/2 (or direct attlog): Full re-upload from device ─────────────
    if (mode === 'attlog') {
      const msg = `[historical-sync] Step 2/2 — Sending GET ATTLOG Stamp=0 to SN=${sn} `
        + `(DeviceStamp=${stamp}; device will re-upload all stored ATTLOG)`;
      console.log(msg);
      biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });

      pool.query(
        `UPDATE biometric_devices SET last_sync_status = 'syncing' WHERE serial_number = $1`,
        [sn]
      ).catch(() => {});

      return res.status(200).send('GET ATTLOG Stamp=0');
    }

    // ── Live sync: device uploads only new/pending records ───────────────────
    const msg = `[biometric] Sending C:DATA UPDATE to SN=${sn}`;
    console.log(msg);
    biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });
    return res.status(200).send('C:DATA UPDATE');
  }

  res.status(200).send('OK');
};

module.exports.scheduleSyncForSn = scheduleSyncForSn;
