/**
 * biometricSecurity.js
 *
 * Two middlewares for /iclock/ routes:
 *
 *  1. biometricSnGuard  — rejects requests with no SN or an unregistered SN.
 *     ZKTeco devices always send ?SN=<serial> on every request.
 *     Unknown SNs get a 403 so they can't probe the system.
 *     Cache TTL matches biometricIpGuard (5 min) to avoid per-request DB hits.
 *
 *  2. biometricAuditLog — fire-and-forget: writes every /iclock/ hit to
 *     biometric_audit_log for forensic visibility.
 */

const { pool } = require('../config/db-pg-adapter');

// ── SN cache ──────────────────────────────────────────────────────────────────
let knownSns   = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getKnownSns() {
  if (knownSns && Date.now() < cacheExpiry) return knownSns;
  try {
    const { rows } = await pool.query('SELECT serial_number FROM biometric_devices WHERE serial_number IS NOT NULL');
    knownSns    = new Set(rows.map(r => r.serial_number.trim()));
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return knownSns;
  } catch {
    return null; // fail open — don't block devices during DB outage
  }
}

function invalidateBiometricSnCache() {
  knownSns    = null;
  cacheExpiry = 0;
}

// ── IP helper (reuse same ::ffff: strip logic) ────────────────────────────────
function resolveIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = (forwarded ? forwarded.split(',')[0] : req.ip || '').trim();
  return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

// ── Middleware 1: SN guard ────────────────────────────────────────────────────
async function biometricSnGuard(req, res, next) {
  const sn = req.query.SN || req.body?.SN;

  if (!sn) {
    writeAudit(req, null, false, 400, 'missing SN');
    return res.status(400).send('FAIL');
  }

  const known = await getKnownSns();

  if (known && !known.has(sn)) {
    console.warn(`[BiometricSecurity] Rejected unknown SN=${sn} from ${resolveIp(req)}`);
    writeAudit(req, sn, false, 403, 'unknown SN');
    return res.status(403).send('FAIL');
  }

  // SN is known (or DB unreachable — fail open)
  req._biometricSn    = sn;
  req._biometricSnKnown = true;
  next();
}

// ── Middleware 2: Audit logger ────────────────────────────────────────────────
function biometricAuditLog(req, res, next) {
  const sn      = req.query.SN || req.body?.SN || null;
  const snKnown = req._biometricSnKnown ?? null;

  // Capture status after response finishes
  res.on('finish', () => {
    writeAudit(req, sn, snKnown, res.statusCode, null);
  });

  next();
}

// ── Fire-and-forget DB write ──────────────────────────────────────────────────
function writeAudit(req, sn, snKnown, status, note) {
  const ip     = resolveIp(req);
  const method = req.method;
  const p      = req.path;

  pool.query(
    `INSERT INTO biometric_audit_log (client_ip, method, path, serial_number, sn_known, status_sent, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [ip, method, p, sn, snKnown, status, note]
  ).catch(() => {}); // never throw — audit must not affect the request
}

module.exports = { biometricSnGuard, biometricAuditLog, invalidateBiometricSnCache };
