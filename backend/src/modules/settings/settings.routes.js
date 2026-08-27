const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { auth } = require('../../middleware/auth');
const { hasPermission } = require('../../middleware/permissions');
const { orgId } = require('../../utils/helpers');

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
