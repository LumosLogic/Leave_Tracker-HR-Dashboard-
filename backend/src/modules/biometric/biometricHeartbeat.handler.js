/**
 * biometricHeartbeat.handler.js
 * ADMS keep-alive for ZKTeco devices — GET /iclock/getrequest
 *
 * ZKTeco devices poll this endpoint periodically.
 * We update last_seen + status='online' and respond with HTTP 200 "OK".
 */

const { pool } = require('../../config/db-pg-adapter');

module.exports = async function biometricHeartbeatHandler(req, res) {
  const sn = req.query.SN;

  if (sn) {
    // Fire-and-forget — don't block the response
    pool.query(
      `UPDATE biometric_devices SET last_seen = NOW(), status = 'online'
       WHERE serial_number = $1`,
      [sn]
    ).catch(err => console.error('[biometric] Heartbeat DB error:', err.message));
  }

  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('OK');
};
