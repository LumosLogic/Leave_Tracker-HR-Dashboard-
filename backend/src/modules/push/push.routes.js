const express = require('express');
const router  = express.Router();
const { supabase } = require('../../config/db');
const { auth, adminOnly } = require('../../middleware/auth');
const { orgId } = require('../../utils/helpers');
const { sendPushToUsers } = require('../../services/pushService');

// ─── Push: Subscribe ──────────────────────────────────────────────────────────
router.post('/subscribe', auth, async (req, res) => {
  try {
    const { subscription, endpoint, userAgent } = req.body;
    if (!subscription || !endpoint) return res.status(400).json({ error: 'Subscription and endpoint required' });
    await supabase.from('push_subscriptions').upsert(
      { user_id: req.user.id, endpoint, subscription, user_agent: userAgent || null, organization_id: orgId(req) },
      { onConflict: 'user_id' }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Push: Unsubscribe ────────────────────────────────────────────────────────
router.delete('/unsubscribe', auth, async (req, res) => {
  try {
    await supabase.from('push_subscriptions').delete().eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Push: Send Notification (admin) ─────────────────────────────────────────
router.post('/send', auth, adminOnly, async (req, res) => {
  try {
    const { title, body, url, target_user_id } = req.body;
    if (!title?.trim() || !body?.trim()) return res.status(400).json({ error: 'Title and body required' });
    const userIds = target_user_id ? [parseInt(target_user_id)] : null;
    const sent = await sendPushToUsers(userIds, { title: title.trim(), body: body.trim(), url: url || '/' });
    try {
      await supabase.from('notifications_log').insert({
        title: title.trim(), body: body.trim(), url: url || null,
        target_user_id: target_user_id ? parseInt(target_user_id) : null,
        sent_by: req.user.id, sent_count: sent || 0,
      });
    } catch { /* log insert failure is non-fatal */ }
    res.json({ success: true, sent: sent || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
