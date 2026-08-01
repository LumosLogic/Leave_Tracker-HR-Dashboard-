/**
 * biometricHeartbeat.handler.js
 * ADMS keep-alive for ZKTeco devices — GET /iclock/getrequest
 *
 * Normally responds "OK". Two sync modes available via scheduleSyncForSn:
 *  - 'attlog' : responds "GET ATTLOG Stamp=0" — device re-uploads ALL records
 *  - 'update' : responds "C:DATA UPDATE" — device uploads new/pending records
 */

const { pool } = require('../../config/db-pg-adapter');

// SN → sync mode ('attlog' | 'update')
const pendingSyncs = new Map();

function scheduleSyncForSn(sn, mode = 'attlog') {
  pendingSyncs.set(sn, mode);
  console.log(`[biometric] Force-sync scheduled for SN=${sn} mode=${mode}`);
}

module.exports = async function biometricHeartbeatHandler(req, res) {
  const sn    = req.query.SN;
  const stamp = req.query.Stamp;

  if (sn) {
    console.log(`[biometric] Heartbeat SN=${sn} Stamp=${stamp}`);
    pool.query(
      `UPDATE biometric_devices SET last_seen = NOW(), status = 'online'
       WHERE serial_number = $1`,
      [sn]
    ).catch(err => console.error('[biometric] Heartbeat DB error:', err.message));
  }

  res.setHeader('Content-Type', 'text/plain');

  if (sn && pendingSyncs.has(sn)) {
    const mode = pendingSyncs.get(sn);
    pendingSyncs.delete(sn);

    if (mode === 'attlog') {
      // Tells device to re-upload ALL stored ATTLOG records from record 0
      console.log(`[biometric] Sending GET ATTLOG Stamp=0 to SN=${sn} (full re-upload)`);
      return res.status(200).send('GET ATTLOG Stamp=0');
    } else {
      console.log(`[biometric] Sending C:DATA UPDATE to SN=${sn}`);
      return res.status(200).send('C:DATA UPDATE');
    }
  }

  res.status(200).send('OK');
};

module.exports.scheduleSyncForSn = scheduleSyncForSn;
