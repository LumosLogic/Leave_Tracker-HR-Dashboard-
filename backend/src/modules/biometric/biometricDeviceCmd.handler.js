/**
 * biometricDeviceCmd.handler.js
 * POST /iclock/devicecmd
 *
 * ZKTeco devices POST command results here after executing a server-issued
 * command (e.g. after receiving GET ATTLOG, C:DATA UPDATE, etc.).
 *
 * IMPORTANT: /iclock/ paths go through express.text({ type:'*\/*' }) in server.js,
 * so req.body is a raw string, not a parsed object. Additionally, this specific
 * ZKTeco firmware (BYEL194660080) sends all acknowledgment fields in the query
 * string — NOT in the POST body:
 *   POST /iclock/devicecmd?SN=...&ID=1&Return=0&CMD=DATA+CLEAR+ATTLOG
 * We therefore read fields from req.query first, falling back to body.
 *
 * Must respond "OK" immediately — device retries in a tight loop on any
 * non-200 or missing route, blocking the normal heartbeat cycle entirely.
 */

const { pool } = require('../../config/db-pg-adapter');
const biometricEmitter = require('../../utils/biometricEmitter');

// Read a field from query string first (this firmware puts params in query),
// then fall back to url-encoded body (other firmware versions use the body).
function readField(req, field) {
  if (req.query[field] !== undefined) return req.query[field];
  // Body may be a string (from express.text) or a parsed object
  if (typeof req.body === 'string' && req.body) {
    try {
      const params = new URLSearchParams(req.body);
      if (params.has(field)) return params.get(field);
    } catch (_) {}
  }
  if (req.body && typeof req.body === 'object') return req.body[field] ?? null;
  return null;
}

module.exports = async function biometricDeviceCmdHandler(req, res) {
  res.setHeader('Content-Type', 'text/plain');
  res.send('OK');

  const sn    = req.query.SN || readField(req, 'SN');
  const cmdId = readField(req, 'ID');
  const ret   = readField(req, 'Return');
  const cmd   = readField(req, 'CMD');

  if (!sn) return;

  const retCode = ret !== null && ret !== undefined ? parseInt(ret, 10) : null;
  const success = retCode === 0 ? ' ✓ OK' : retCode !== null ? ` ✗ FAILED(${ret})` : '';
  const msg = `[biometric] devicecmd SN=${sn} ID=${cmdId} Return=${ret}${success} CMD=${cmd}`;
  console.log(msg);
  biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });

  // Update last_seen — device is clearly online if it's posting command results
  pool.query(
    `UPDATE biometric_devices SET last_seen = NOW(), status = 'online' WHERE serial_number = $1`,
    [sn]
  ).catch(err => console.error('[biometric] devicecmd DB error:', err.message));
};
