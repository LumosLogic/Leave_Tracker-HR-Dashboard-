const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'leave-tracker-secret-2026';

const ALLOWED_ORIGINS = [
  'https://hrms.lumoslogic.com',
  'https://leavetrackerbylumos.web.app',
  'https://leavetrackerbylumos.firebaseapp.com',
  'https://leavetracker-platform-admin.web.app',
  'https://leavetracker-platform-admin.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
];

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'root_admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

function rootAdminOnly(req, res, next) {
  if (req.user.role !== 'root_admin')
    return res.status(403).json({ error: 'Root admin access required' });
  next();
}

function isAdminRole(role) { return role === 'admin' || role === 'root_admin'; }

// Allows: admins (full access) OR the employee editing their own profile (restricted fields only)
function selfOrAdmin(allowedSelfFields = []) {
  return (req, res, next) => {
    const isAdmin = isAdminRole(req.user.role);
    const isSelf  = parseInt(req.user.id) === parseInt(req.params.id);

    if (!isAdmin && !isSelf)
      return res.status(403).json({ error: 'Access denied' });

    // Employee editing their own profile — restrict to allowed fields
    if (!isAdmin && isSelf && req.method !== 'GET') {
      const forbidden = Object.keys(req.body || {}).filter(f => !allowedSelfFields.includes(f));
      if (forbidden.length)
        return res.status(403).json({ error: 'Cannot edit these fields', forbidden_fields: forbidden });
    }
    next();
  };
}

function platformAdminAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'platform_admin') return res.status(403).json({ error: 'Platform admin access required' });
    req.platformAdmin = decoded;
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

module.exports = { JWT_SECRET, ALLOWED_ORIGINS, auth, adminOnly, rootAdminOnly, isAdminRole, platformAdminAuth, selfOrAdmin };
