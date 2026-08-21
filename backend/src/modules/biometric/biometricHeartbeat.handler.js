/**
 * biometricHeartbeat.handler.js
 * ADMS keep-alive for ZKTeco devices — GET /iclock/getrequest
 *
 * Normally responds "OK". Three sync modes available via scheduleSyncForSn:
 *  - 'attlog' : responds "GET ATTLOG Stamp=0" — device re-uploads ALL records by stamp
 *  - 'query'  : responds "C:DATA QUERY tableName:AttLog,Stime:...,Etime:..."
 *               bypasses stamp tracking — retrieves records by actual date range
 *               Use this when the device previously synced to another server (EasyWDMS)
 *               and the stamp tracking prevents re-upload of historical records.
 *  - 'update' : responds "C:DATA UPDATE" — device uploads new/pending records
 */

const { pool } = require('../../config/db-pg-adapter');
const biometricEmitter = require('../../utils/biometricEmitter');

// SN → { mode, fromDate?, toDate? }
const pendingSyncs = new Map();

function scheduleSyncForSn(sn, mode = 'attlog', options = {}) {
  pendingSyncs.set(sn, { mode, ...options });
  const msg = `[biometric] Force-sync scheduled for SN=${sn} mode=${mode}` +
    (options.fromDate ? ` from=${options.fromDate} to=${options.toDate}` : '');
  console.log(msg);
  biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });
}

module.exports = async function biometricHeartbeatHandler(req, res) {
  const sn    = req.query.SN;
  const stamp = req.query.Stamp;

  if (sn) {
    const msg = `[biometric] Heartbeat SN=${sn} Stamp=${stamp}`;
    console.log(msg);
    biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });
    pool.query(
      `UPDATE biometric_devices SET last_seen = NOW(), status = 'online'
       WHERE serial_number = $1`,
      [sn]
    ).catch(err => console.error('[biometric] Heartbeat DB error:', err.message));
  }

  res.setHeader('Content-Type', 'text/plain');

  if (sn && pendingSyncs.has(sn)) {
    const syncData = pendingSyncs.get(sn);
    // Support both old string format and new object format (backward compat)
    const mode     = typeof syncData === 'string' ? syncData : syncData.mode;
    const fromDate = typeof syncData === 'object' ? syncData.fromDate : null;
    const toDate   = typeof syncData === 'object' ? syncData.toDate   : null;
    pendingSyncs.delete(sn);

    // Update sync status to 'syncing' — command is now en-route to the device
    pool.query(
      `UPDATE biometric_devices SET last_sync_status = 'syncing' WHERE serial_number = $1`,
      [sn]
    ).catch(err => console.error('[biometric] Sync status update error:', err.message));

    if (mode === 'query' && fromDate) {
      // C:DATA QUERY — requests records by date range, ignores stamp tracking.
      // Safe to use: device pushes matching ATTLOG records via the normal POST /iclock/cdata path.
      // Our existing processAttlogLine handles them with full duplicate protection.
      const stime = `${fromDate} 00:00:00`;
      const etime = `${toDate || new Date().toISOString().slice(0,10)} 23:59:59`;
      const cmd   = `C:DATA QUERY tableName:AttLog,Stime:${stime},Etime:${etime}`;
      const msg   = `[biometric] Sending ${cmd} to SN=${sn}`;
      console.log(msg);
      biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });
      return res.status(200).send(cmd);
    }

    if (mode === 'attlog') {
      // GET ATTLOG Stamp=0 — device re-uploads all records from stamp 0.
      const msg = `[biometric] Sending GET ATTLOG Stamp=0 to SN=${sn} (full historical re-upload)`;
      console.log(msg);
      biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });
      return res.status(200).send('GET ATTLOG Stamp=0');
    }

    if (mode === 'update') {
      const msg = `[biometric] Sending C:DATA UPDATE to SN=${sn}`;
      console.log(msg);
      biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });
      return res.status(200).send('C:DATA UPDATE');
    }
  }

  res.status(200).send('OK');
};

module.exports.scheduleSyncForSn = scheduleSyncForSn;
