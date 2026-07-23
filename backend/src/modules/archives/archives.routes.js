const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { auth, adminOnly } = require('../../middleware/auth');
const { orgId } = require('../../utils/helpers');

// ─── Archives: List ───────────────────────────────────────────────────────────
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const { data, error } = await supabase.from('archives')
      .select('*')
      .eq('organization_id', orgId(req))
      .order('archived_at', { ascending: false });
    if (error) throw new Error(error.message);
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Archives: Restore ────────────────────────────────────────────────────────
router.post('/:id/restore', auth, adminOnly, async (req, res) => {
  try {
    const { data: item, error: fe } = await supabase.from('archives')
      .select('*').eq('id', req.params.id).eq('organization_id', orgId(req)).single();
    if (fe || !item) return res.status(404).json({ error: 'Archive record not found' });
    const { id: _, ...recordToInsert } = item.record;
    const { error: ie } = await supabase.from(item.table_name).insert(recordToInsert);
    if (ie) throw new Error(ie.message);
    await supabase.from('archives').delete().eq('id', req.params.id);
    res.json({ success: true, message: 'Record restored successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
