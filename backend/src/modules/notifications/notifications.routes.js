const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');

// GET /api/notifications — user's own notifications
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('notifications')
      .select('*').eq('user_id', req.user.id)
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res) => {
  try {
    const { count, error } = await supabase.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id).eq('is_read', false);
    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', async (req, res) => {
  try {
    const { error } = await supabase.from('notifications')
      .update({ is_read: true }).eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/mark-all-read
router.put('/mark-all-read', async (req, res) => {
  try {
    const { error } = await supabase.from('notifications')
      .update({ is_read: true }).eq('user_id', req.user.id).eq('is_read', false);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/notifications/:id
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('notifications')
      .delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
