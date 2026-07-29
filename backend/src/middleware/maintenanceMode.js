const jwt = require('jsonwebtoken');

// Always allowed regardless of maintenance (health checks, app status)
const ALWAYS_ALLOWED_EXACT = ['/health', '/status'];

// API paths always exempted so admins can log in to use the bypass
const API_ALWAYS_ALLOWED_PREFIX = [
  '/api/auth/login',
  '/api/auth/totp/verify-login',
];

function maintenanceMiddleware(req, res, next) {
  if (process.env.MAINTENANCE_MODE !== 'true') return next();

  const path = req.path;

  // Health/status endpoints are always available
  if (ALWAYS_ALLOWED_EXACT.includes(path)) return next();

  // Biometric ADMS: ZKTeco devices write to the attendance table.
  // During attendance-schema migrations set MAINTENANCE_BLOCK_BIOMETRIC=true to prevent
  // write conflicts. Default: allowed (devices buffer locally and retry automatically).
  if (path.startsWith('/iclock/')) {
    if (process.env.MAINTENANCE_BLOCK_BIOMETRIC !== 'true') return next();
    // When blocked, reply with a plain-text 503 that ZKTeco firmware understands
    return res.status(503).type('text').send('Maintenance');
  }

  // Browser page requests pass through — the SPA loads and shows the maintenance UI
  if (!path.startsWith('/api/')) return next();

  // Login endpoints always work so admins can authenticate for the admin bypass
  if (API_ALWAYS_ALLOWED_PREFIX.some(p => path.startsWith(p))) return next();

  // Root-admin bypass — decode JWT without any DB query (JWT is stateless)
  if (process.env.MAINTENANCE_ADMIN_BYPASS === 'true') {
    const token = req.headers.authorization?.split(' ')[1];
    const secret = process.env.JWT_SECRET;
    if (token && secret) {
      try {
        const decoded = jwt.verify(token, secret);
        if (decoded.role === 'root_admin') return next();
      } catch {
        // Invalid or expired token — fall through to maintenance response
      }
    }
  }

  res.setHeader('Retry-After', '1800');
  return res.status(503).json({
    success: false,
    maintenance: true,
    message: process.env.MAINTENANCE_MESSAGE || 'The system is currently under scheduled maintenance. Please try again later.',
  });
}

module.exports = { maintenanceMiddleware };
