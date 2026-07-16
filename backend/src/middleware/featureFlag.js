const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth');
const { supabase } = require('../config/db');

const FEATURE_ROUTE_MAP = {
  '/payroll':               'payroll',
  '/expenses':              'expenses',
  '/assets':                'assets',
  '/reports':               'reports',
  '/performance':           'performance',
  '/documents':             'documents',
  '/onboarding':            'onboarding',
  '/exit-management':       'exit_management',
  '/announcements':         'announcements',
  '/attendance/late-early': 'regularization',
  '/shifts':                'shifts',
  '/roster':                'shifts',
  '/leave-policies':        'leave_policies',
  '/clockify':              'clockify',
  '/push':                  'push_notifications',
};

async function isFeatureEnabled(organizationId, featureKey) {
  if (!organizationId || !featureKey) return true;
  try {
    const { data } = await supabase.from('organization_features')
      .select('enabled').eq('organization_id', organizationId).eq('feature_key', featureKey).maybeSingle();
    return data ? data.enabled : true;
  } catch { return true; }
}

function featureGate(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  const matched = Object.entries(FEATURE_ROUTE_MAP).find(([prefix]) => req.path.startsWith(prefix));
  if (!matched) return next();
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();
  try {
    const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
    if (decoded.organization_id) {
      return isFeatureEnabled(decoded.organization_id, matched[1]).then(enabled => {
        if (!enabled) return res.status(403).json({ error: 'Feature not available for your organization.', feature: matched[1] });
        next();
      });
    }
  } catch { /* invalid token — let auth middleware handle */ }
  next();
}

module.exports = { FEATURE_ROUTE_MAP, isFeatureEnabled, featureGate };
