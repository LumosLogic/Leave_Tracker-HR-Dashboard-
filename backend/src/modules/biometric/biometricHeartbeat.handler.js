/**
 * biometricHeartbeat.handler.js
 * ADMS keep-alive for ZKTeco devices — GET /iclock/getrequest
 *
 * Normally responds "OK". Two sync modes available via scheduleSyncForSn:
 *  - 'attlog' : responds "GET ATTLOG Stamp=0" — device re-uploads ALL records
 *  - 'update' : responds "C:DATA UPDATE" — device uploads new/pending records
 */

const { pool } = require('../../config/db-pg-adapter');
const biometricEmitter = require('../../utils/biometricEmitter');

// SN → sync mode ('attlog' | 'update')
const pendingSyncs = new Map();

function scheduleSyncForSn(sn, mode = 'attlog') {
  pendingSyncs.set(sn, mode);
  const msg = `[biometric] Force-sync scheduled for SN=${sn} mode=${mode}`;
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
    const mode = pendingSyncs.get(sn);
    pendingSyncs.delete(sn);

    if (mode === 'attlog') {
      // GET ATTLOG Stamp=0 is the correct ZKTeco ADMS command for full re-upload.
      // C:N:DATA QUERY is a device-push format — many firmware versions don't understand it
      // and enter a command-wait state, killing heartbeats. Always use GET ATTLOG Stamp=0.
      const msg = `[biometric] Sending GET ATTLOG Stamp=0 to SN=${sn} (full re-upload)`;
      console.log(msg);
      biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });
      return res.status(200).send('GET ATTLOG Stamp=0');
    } else {
      const msg = `[biometric] Sending C:DATA UPDATE to SN=${sn}`;
      console.log(msg);
      biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });
      return res.status(200).send('C:DATA UPDATE');
    }
  }

  res.status(200).send('OK');
};

module.exports.scheduleSyncForSn = scheduleSyncForSn;
