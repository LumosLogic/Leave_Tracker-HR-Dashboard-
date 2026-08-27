const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { pool }     = require('../../config/db');
const { auth } = require('../../middleware/auth');
const { hasPermission } = require('../../middleware/permissions');
const { orgId } = require('../../utils/helpers');

function isRootAdmin(role) { return role === 'root_admin'; }

// ─── Settings: Get Work Schedule ─────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { data: schedule } = await supabase.from('work_schedule').select('*').eq('organization_id', orgId(req)).limit(1).maybeSingle();
    res.json({ schedule: schedule || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Settings: Update Work Schedule ──────────────────────────────────────────
router.put('/', auth, hasPermission('settings', 'manage'), async (req, res) => {
  try {
    const { start_time, end_time, late_threshold, early_exit_threshold, half_day_hours, work_days, full_day_hours, max_early_leave_count } = req.body;
    // Try to update existing; insert if none
    const { data: existing } = await supabase.from('work_schedule').select('id').eq('organization_id', orgId(req)).limit(1).maybeSingle();
    const fields = { start_time, end_time, late_threshold, early_exit_threshold, half_day_hours, work_days, full_day_hours, max_early_leave_count };
    let data, err;
    if (existing) {
      const res2 = await supabase.from('work_schedule')
        .update(fields)
        .eq('id', existing.id).select().single();
      data = res2.data; err = res2.error;
    } else {
      const res2 = await supabase.from('work_schedule')
        .insert({ ...fields, organization_id: orgId(req) }).select().single();
      data = res2.data; err = res2.error;
    }
    if (err) throw new Error(err.message);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Settings: Email Automation — GET ────────────────────────────────────────
router.get('/email-automation', auth, async (req, res) => {
  if (!isRootAdmin(req.user.role)) return res.status(403).json({ error: 'Root admin only' });
  try {
    const oId = orgId(req);
    const result = await pool.query(
      `SELECT * FROM attendance_email_settings WHERE organization_id = $1 LIMIT 1`,
      [oId]
    );
    res.json(result.rows[0] || {
      late_email_enabled: false,
      daily_summary_enabled: false,
      daily_summary_time: '18:30',
      appreciation_email_enabled: false,
      appreciation_threshold_hours: 8,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Settings: Email Automation — PUT ────────────────────────────────────────
router.put('/email-automation', auth, async (req, res) => {
  if (!isRootAdmin(req.user.role)) return res.status(403).json({ error: 'Root admin only' });
  try {
    const oId = orgId(req);
    const {
      late_email_enabled,
      daily_summary_enabled,
      daily_summary_time,
      appreciation_email_enabled,
      appreciation_threshold_hours,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO attendance_email_settings
         (organization_id, late_email_enabled, daily_summary_enabled, daily_summary_time,
          appreciation_email_enabled, appreciation_threshold_hours, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (organization_id) DO UPDATE SET
         late_email_enabled           = EXCLUDED.late_email_enabled,
         daily_summary_enabled        = EXCLUDED.daily_summary_enabled,
         daily_summary_time           = EXCLUDED.daily_summary_time,
         appreciation_email_enabled   = EXCLUDED.appreciation_email_enabled,
         appreciation_threshold_hours = EXCLUDED.appreciation_threshold_hours,
         updated_at                   = NOW()
       RETURNING *`,
      [oId, !!late_email_enabled, !!daily_summary_enabled,
       daily_summary_time || '18:30',
       !!appreciation_email_enabled,
       parseFloat(appreciation_threshold_hours) || 8]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Settings: Biometric Config ───────────────────────────────────────────────
router.get('/biometric-config', auth, hasPermission('biometric', 'view'), (req, res) => {
  const ip   = process.env.BIOMETRIC_SERVER_IP   || '';
  const port = process.env.BIOMETRIC_SERVER_PORT  || '8080';
  res.json({
    server_ip:   ip,
    server_port: port,
    adms_url:    ip ? `http://${ip}:${port}/iclock` : '',
  });
});

module.exports = router;
