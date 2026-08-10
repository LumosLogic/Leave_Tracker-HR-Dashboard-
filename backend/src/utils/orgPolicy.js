/**
 * orgPolicy.js
 * Cached lookup for org-level attendance_policy.
 * TTL = 5 min so a setting change takes effect within one cache window.
 */

const { pool } = require('../config/db-pg-adapter');

const _cache = new Map(); // orgId → { policy, expiresAt }
const TTL_MS = 5 * 60 * 1000;

async function getOrgPolicy(orgId) {
  const now = Date.now();
  const hit  = _cache.get(orgId);
  if (hit && hit.expiresAt > now) return hit.policy;

  const res  = await pool.query(
    `SELECT attendance_policy FROM organizations WHERE id = $1 LIMIT 1`,
    [orgId]
  );
  const policy = res.rows[0]?.attendance_policy || 'standard';
  _cache.set(orgId, { policy, expiresAt: now + TTL_MS });
  return policy;
}

function invalidateOrgPolicyCache(orgId) {
  if (orgId) _cache.delete(orgId);
  else        _cache.clear();
}

module.exports = { getOrgPolicy, invalidateOrgPolicyCache };
