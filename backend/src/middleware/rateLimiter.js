/**
 * rateLimiter.js — In-memory rate limiter (no external packages required).
 *
 * Uses a Map keyed by "<prefix>:<client-ip>" to count requests within a
 * sliding window. Old entries are pruned every 5 minutes to prevent memory
 * growth on high-traffic servers.
 *
 * Produces standard HTTP 429 responses with:
 *   X-RateLimit-Limit    — max allowed requests
 *   X-RateLimit-Remaining — requests left in the current window
 *   X-RateLimit-Reset     — Unix timestamp when the window resets
 *   Retry-After           — seconds until the client may retry
 *
 * Usage:
 *   const { rateLimiter, LIMITS } = require('./rateLimiter');
 *   router.post('/login', rateLimiter(LIMITS.LOGIN), handler);
 */

// ── Store ─────────────────────────────────────────────────────────────────────
const store = new Map(); // key → { count, resetAt }

// Prune expired entries every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

// ── Client IP resolution ──────────────────────────────────────────────────────
function clientIp(req) {
  // Handles proxied requests (nginx in front of Node on Hostinger VPS)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// ── Core factory ──────────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {number} opts.max       — max requests per window
 * @param {number} opts.windowMs  — window length in milliseconds
 * @param {string} [opts.prefix]  — unique key prefix per route group
 * @param {string} [opts.message] — custom error message
 */
function rateLimiter({ max, windowMs, prefix = 'rl', message = 'Too many requests. Please try again later.' }) {
  return (req, res, next) => {
    const ip  = clientIp(req);
    const key = `${prefix}:${ip}`;
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    const remaining  = Math.max(0, max - entry.count);
    const resetSecs  = Math.ceil(entry.resetAt / 1000);
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit',     max);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset',     resetSecs);

    if (entry.count > max) {
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({ error: message, retryAfter });
    }

    next();
  };
}

// ── Pre-configured limits ─────────────────────────────────────────────────────
const LIMITS = {
  // Auth endpoints — most sensitive, tightest limits
  LOGIN: {
    max: 10, windowMs: 15 * 60 * 1000, prefix: 'login',
    message: 'Too many login attempts. Please wait 15 minutes before trying again.',
  },
  FORGOT_PASSWORD: {
    max: 5, windowMs: 15 * 60 * 1000, prefix: 'forgot-pw',
    message: 'Too many password reset requests. Please wait 15 minutes.',
  },
  RESET_PASSWORD: {
    max: 10, windowMs: 15 * 60 * 1000, prefix: 'reset-pw',
    message: 'Too many password reset attempts. Please wait 15 minutes.',
  },
  SEND_VERIFICATION: {
    max: 5, windowMs: 15 * 60 * 1000, prefix: 'send-verify',
    message: 'Too many verification code requests. Please wait 15 minutes.',
  },
  TOTP_VERIFY: {
    max: 5, windowMs: 5 * 60 * 1000, prefix: 'totp',
    message: 'Too many 2FA attempts. Please wait 5 minutes.',
  },
  // Org registration — public, but costly operation
  ORG_REGISTER: {
    max: 5, windowMs: 60 * 60 * 1000, prefix: 'org-reg',
    message: 'Too many registration attempts. Please wait 1 hour.',
  },
  // General API — soft protection against scripted abuse
  GENERAL_API: {
    max: 300, windowMs: 60 * 1000, prefix: 'api',
    message: 'Request rate exceeded. Please slow down.',
  },
};

module.exports = { rateLimiter, LIMITS };
