const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { auth, adminOnly } = require('../../middleware/auth');
const { orgId } = require('../../utils/helpers');

// ─── Settings: Get Work Schedule + Clockify Config ────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { data: schedule } = await supabase.from('work_schedule').select('*').eq('organization_id', orgId(req)).limit(1).single();
    // Get Clockify config (mask API key)
    const { data: orgRow } = await supabase.from('organizations')
      .select('clockify_api_key, clockify_workspace_id, clockify_last_synced')
      .eq('id', orgId(req) || 1).maybeSingle();
    const clockify = orgRow
      ? { api_key: orgRow.clockify_api_key, workspace_id: orgRow.clockify_workspace_id, last_synced: orgRow.clockify_last_synced }
      : null;
    res.json({ schedule, clockify: { workspace_id: clockify?.workspace_id || '', api_key: clockify?.api_key ? '***' : '' } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Settings: Update Work Schedule ──────────────────────────────────────────
router.put('/', auth, adminOnly, async (req, res) => {
  try {
    const { start_time, end_time, late_threshold, early_exit_threshold, half_day_hours, work_days } = req.body;
    // Try to update existing; insert if none
    const { data: existing } = await supabase.from('work_schedule').select('id').eq('organization_id', orgId(req)).limit(1).maybeSingle();
    let data;
    if (existing) {
      const res2 = await supabase.from('work_schedule')
        .update({ start_time, end_time, late_threshold, early_exit_threshold, half_day_hours, work_days })
        .eq('id', existing.id).select().single();
      data = res2.data;
    } else {
      const res2 = await supabase.from('work_schedule')
        .insert({ start_time, end_time, late_threshold, early_exit_threshold, half_day_hours, work_days, organization_id: orgId(req) }).select().single();
      data = res2.data;
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Settings: Update Clockify Config ─────────────────────────────────────────
router.put('/clockify', auth, adminOnly, async (req, res) => {
  try {
    const { api_key, workspace_id } = req.body;
    const update = { clockify_workspace_id: workspace_id };
    if (api_key && api_key.trim() !== '') update.clockify_api_key = api_key.trim();
    await supabase.from('organizations').update(update).eq('id', orgId(req));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
