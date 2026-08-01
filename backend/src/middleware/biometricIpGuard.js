/**
 * biometricIpGuard.js
 *
 * Allows only known biometric device IPs to call /iclock/ endpoints.
 * Devices are identified by their registered IP in the biometric_devices table.
 * Additional IPs can be added via the BIOMETRIC_IP_WHITELIST env var (comma-separated).
 *
 * Fail-OPEN: if the DB is unreachable, the request is allowed through rather than
 * blocking a legitimate device during a DB outage.
 *
 * Cache: device IPs are cached for 5 minutes to avoid hitting the DB on every punch.
 */

const { pool } = require('../config/db-pg-adapter');

let cachedIps   = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getWhitelistedIps() {
  if (cachedIps && Date.now() < cacheExpiry) return cachedIps;

  try {
    const result = await pool.query(
      `SELECT device_ip FROM biometric_devices WHERE device_ip IS NOT NULL`
    );

    const dbIps = result.rows.map(d => d.device_ip.trim()).filter(Boolean);

    // Static IPs from environment (office static IP, VPN, test machine, etc.)
    const envIps = (process.env.BIOMETRIC_IP_WHITELIST || '')
      .split(',').map(ip => ip.trim()).filter(Boolean);

    // Always allow localhost (dev + scheduler)
    const localIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

    cachedIps   = new Set([...dbIps, ...envIps, ...localIps]);
    cacheExpiry = Date.now() + CACHE_TTL_MS;
    return cachedIps;
  } catch {
    // DB unreachable — fail open so devices are never blocked during outages
    return null;
  }
}

// Call this to force a cache refresh when a new device is registered
function invalidateBiometricIpCache() {
  cachedIps   = null;
  cacheExpiry = 0;
}

async function biometricIpGuard(req, res, next) {
  const allowedIps = await getWhitelistedIps();

  // Fail open — cannot determine allowed IPs, let the request through
  if (!allowedIps) return next();

  // Resolve the real client IP (behind nginx proxy or direct)
  // Strip IPv4-mapped IPv6 prefix (::ffff:1.2.3.4 → 1.2.3.4) for consistent matching
  const forwarded = req.headers['x-forwarded-for'];
  const rawIp    = (forwarded ? forwarded.split(',')[0] : req.ip || '').trim();
  const clientIp = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;

  if (allowedIps.has(clientIp)) return next();

  console.warn(`[BiometricGuard] Blocked request from unknown IP: ${clientIp} → ${req.method} ${req.path}`);
  return res.status(403).send('ACCESS DENIED');
}

module.exports = { biometricIpGuard, invalidateBiometricIpCache };
