/**
 * biometricHeartbeat.handler.js
 * ADMS keep-alive for ZKTeco devices — GET /iclock/getrequest
 *
 * Normally responds "OK". Sync modes via scheduleSyncForSn(sn, mode, opts):
 *
 *  'attlog'  → "GET ATTLOG Stamp=0"
 *               Uses the device's upload-pointer mechanism.
 *               After a prior successful sync, the device's pointer is advanced
 *               so this only returns records the device considers unacknowledged.
 *               Used by the force-sync endpoint (/devices/:id/force-sync).
 *
 *  'query'   → "C:N:DATA QUERY ATTLOG StartTime=YYYY-MM-DD HH:MM:SS"  ← KEY
 *               Date-based table query — completely independent of the upload
 *               pointer. Device queries its ATTLOG by timestamp and uploads
 *               ALL matching records regardless of prior sync state.
 *               Read-only: does NOT modify the device's upload pointer or data.
 *               opts.startTime: "YYYY-MM-DD" from the historical sync job.
 *               Used by the historical-sync endpoint.
 *
 *  'update'  → "C:DATA UPDATE"
 *               Live sync — device uploads only new/pending records.
 *
 * WHY 'query' instead of 'attlog' for historical sync:
 *   After the Aug 21 2026 force-sync, the device's upload-pointer was advanced
 *   to the last acknowledged record. GET ATTLOG Stamp=0 now returns only the
 *   1 new punch since then. C:N:DATA QUERY ATTLOG bypasses the pointer entirely
 *   by querying the device table directly by date.
 *
 * NEVER use C:N:DATA CLEAR ATTLOG — it deletes device records.
 */

const { pool } = require('../../config/db-pg-adapter');
const biometricEmitter = require('../../utils/biometricEmitter');

// SN → { mode, opts }
const pendingSyncs = new Map();

// Incrementing command sequence for C:<id>:<cmd> ADMS format
let _cmdSeq = 1;
function nextCmdId() { return _cmdSeq++; }

/**
 * @param {string} sn      Device serial number
 * @param {string} mode    'attlog' | 'query' | 'update'  (default: 'attlog')
 * @param {object} opts    Optional. For 'query': { startTime: 'YYYY-MM-DD' }
 */
function scheduleSyncForSn(sn, mode, opts) {
  mode = mode || 'attlog';
  pendingSyncs.set(sn, { mode, opts: opts || {} });
  const msg = `[biometric] Sync scheduled SN=${sn} mode=${mode}${opts && opts.startTime ? ` startTime=${opts.startTime}` : ''}`;
  console.log(msg);
  biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });
}

module.exports = async function biometricHeartbeatHandler(req, res) {
  const sn    = req.query.SN;
  const stamp = req.query.Stamp;

  if (sn) {
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
    const { mode, opts } = pendingSyncs.get(sn);
    pendingSyncs.delete(sn);

    // ── Date-based query — bypasses upload pointer, read-only ─────────────────
    if (mode === 'query') {
      const cmdId = nextCmdId();
      // Format: C:N:DATA QUERY ATTLOG StartTime=YYYY-MM-DD HH:MM:SS
      // This tells the device to query its ATTLOG table by timestamp and push
      // all matching records to /iclock/cdata — independent of upload-pointer state.
      const startDate = (opts.startTime || '2020-01-01');
      const cmd = `C:${cmdId}:DATA QUERY ATTLOG StartTime=${startDate} 00:00:00`;
      const msg = `[historical-sync] Sending ${cmd} to SN=${sn} `
        + `(date-query bypasses upload-pointer; read-only; devicecmd Return=0 means supported)`;
      console.log(msg);
      biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });

      pool.query(
        `UPDATE biometric_devices SET last_sync_status = 'syncing' WHERE serial_number = $1`,
        [sn]
      ).catch(() => {});

      return res.status(200).send(cmd);
    }

    // ── Upload-pointer based — returns only unacknowledged records ────────────
    if (mode === 'attlog') {
      const msg = `[historical-sync] Sending GET ATTLOG Stamp=0 to SN=${sn} DeviceStamp=${stamp}`;
      console.log(msg);
      biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });

      pool.query(
        `UPDATE biometric_devices SET last_sync_status = 'syncing' WHERE serial_number = $1`,
        [sn]
      ).catch(() => {});

      return res.status(200).send('GET ATTLOG Stamp=0');
    }

    // ── Live sync — new/pending records only ──────────────────────────────────
    const msg = `[biometric] Sending C:DATA UPDATE to SN=${sn}`;
    console.log(msg);
    biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });
    return res.status(200).send('C:DATA UPDATE');
  }

  res.status(200).send('OK');
};

module.exports.scheduleSyncForSn = scheduleSyncForSn;
