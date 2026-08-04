/**
 * biometricDeviceCmd.handler.js
 * POST /iclock/devicecmd
 *
 * ZKTeco devices POST command results here after executing a server-issued
 * command (e.g. after receiving GET ATTLOG, C:DATA UPDATE, etc.).
 * Body (url-encoded): ID=<cmdId>&Return=<code>&CMD=<commandText>
 *
 * Must respond "OK" immediately — device retries in a tight loop on any
 * non-200 or missing route, blocking the normal heartbeat cycle entirely.
 */

const { pool } = require('../../config/db-pg-adapter');
const biometricEmitter = require('../../utils/biometricEmitter');

module.exports = async function biometricDeviceCmdHandler(req, res) {
  res.setHeader('Content-Type', 'text/plain');
  res.send('OK');

  const sn     = req.query.SN    || (typeof req.body === 'object' ? req.body.SN : null);
  const cmdId  = typeof req.body === 'object' ? req.body.ID     : null;
  const ret    = typeof req.body === 'object' ? req.body.Return : null;
  const cmd    = typeof req.body === 'object' ? req.body.CMD    : null;

  if (!sn) return;

  const msg = `[biometric] devicecmd SN=${sn} ID=${cmdId} Return=${ret} CMD=${cmd}`;
  console.log(msg);
  biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });

  // Update last_seen — device is clearly online if it's posting command results
  pool.query(
    `UPDATE biometric_devices SET last_seen = NOW(), status = 'online' WHERE serial_number = $1`,
    [sn]
  ).catch(err => console.error('[biometric] devicecmd DB error:', err.message));
};
