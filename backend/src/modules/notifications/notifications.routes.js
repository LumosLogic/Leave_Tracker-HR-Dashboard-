const express = require('express');
const router  = express.Router();
const { db } = require('../../config/db');
const { auth } = require('../../middleware/auth');

// GET /api/notifications — user's own notifications (EHN_NOT_005: archived param)
router.get('/', auth, async (req, res) => {
  try {
    const archived = req.query.archived === 'true';
    let q = db.from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(100);
    if (archived) {
      q = q.eq('is_archived', true);
    } else {
      q = q.or('is_archived.is.null,is_archived.eq.false');
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/notifications/unread-count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const { count, error } = await db.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id).eq('is_read', false);
    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const { error } = await db.from('notifications')
      .update({ is_read: true }).eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/mark-all-read
router.put('/mark-all-read', auth, async (req, res) => {
  try {
    const { error } = await db.from('notifications')
      .update({ is_read: true }).eq('user_id', req.user.id).eq('is_read', false);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/notifications/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const { error } = await db.from('notifications')
      .delete().eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/archive-read — EHN_NOT_005: archive all read notifications
router.put('/archive-read', auth, async (req, res) => {
  try {
    const { error } = await db.from('notifications').update({ is_archived: true }).eq('user_id', req.user.id).eq('is_read', true);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/notifications/:id/archive — EHN_NOT_005: archive single notification
router.put('/:id/archive', auth, async (req, res) => {
  try {
    const { error } = await db.from('notifications').update({ is_archived: true }).eq('id', req.params.id).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
