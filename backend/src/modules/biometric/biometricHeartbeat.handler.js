/**
 * biometricHeartbeat.handler.js
 * ADMS keep-alive for ZKTeco devices — GET /iclock/getrequest
 *
 * Normally responds "OK". If a force-sync has been scheduled for this
 * device's SN (via scheduleSyncForSn), responds with "C:DATA UPDATE"
 * instead, which tells the ZKTeco device to re-upload all stored
 * attendance records to POST /iclock/cdata.
 */

const { pool } = require('../../config/db-pg-adapter');

// SNs that need a one-shot force-sync on next heartbeat
const pendingSyncs = new Set();

function scheduleSyncForSn(sn) {
  pendingSyncs.add(sn);
  console.log(`[biometric] Force-sync scheduled for SN=${sn}`);
}

module.exports = async function biometricHeartbeatHandler(req, res) {
  const sn = req.query.SN;

  if (sn) {
    pool.query(
      `UPDATE biometric_devices SET last_seen = NOW(), status = 'online'
       WHERE serial_number = $1`,
      [sn]
    ).catch(err => console.error('[biometric] Heartbeat DB error:', err.message));
  }

  res.setHeader('Content-Type', 'text/plain');

  if (sn && pendingSyncs.has(sn)) {
    pendingSyncs.delete(sn);
    console.log(`[biometric] Sending C:DATA UPDATE to SN=${sn}`);
    return res.status(200).send('C:DATA UPDATE');
  }

  res.status(200).send('OK');
};

module.exports.scheduleSyncForSn = scheduleSyncForSn;
