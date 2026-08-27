const express = require('express');
const router  = express.Router();
const { db } = require('../../config/db');
const { auth } = require('../../middleware/auth');
const { hasPermission } = require('../../middleware/permissions');

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// ─── Goals ────────────────────────────────────────────────────────────────────
router.get('/goals', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { userId, cycle } = req.query;
    let q = db.from('performance_goals').select('*').eq('organization_id', oId).order('created_at', { ascending: false });
    if (!isAdmin(req.user.role)) q = q.eq('user_id', req.user.id);
    else if (userId) q = q.eq('user_id', userId);
    if (cycle) q = q.eq('review_cycle', cycle);
    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) return res.json([]);

    const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    const { data: users } = await db.from('users').select('id, name, avatar_color, department').in('id', userIds);
    const uMap = {};
    (users || []).forEach(u => { uMap[u.id] = u; });

    res.json(rows.map(r => ({ ...r, user_name: uMap[r.user_id]?.name || '', user_avatar_color: uMap[r.user_id]?.avatar_color || '' })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/goals', auth, hasPermission('performance', 'create'), async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { title, description, category, target_date, review_cycle, user_id, progress } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    // BUG_082: enforce title max length
    if (title.length > 150) return res.status(400).json({ error: 'Goal Title must be 150 characters or less.' });
    if (description && description.length > 1000) return res.status(400).json({ error: 'Description must be 1000 characters or less.' });
    if (target_date) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (new Date(target_date) < today) return res.status(400).json({ error: 'Target date cannot be in the past.' });
    }
    const targetUserId = isAdmin(req.user.role) && user_id ? user_id : req.user.id;
    const cycle = review_cycle || String(new Date().getFullYear());
    // Duplicate check: same title + category for same user in same cycle
    const { data: existing } = await db.from('performance_goals')
      .select('id').eq('organization_id', oId).eq('user_id', targetUserId)
      .ilike('title', title.trim()).eq('category', category || 'individual').eq('review_cycle', cycle).maybeSingle();
    if (existing) return res.status(400).json({ error: 'A goal with the same title and category already exists for this cycle.' });
    const cappedProgress = Math.min(100, Math.max(0, Number(progress) || 0));
    const autoStatus = cappedProgress >= 100 ? 'completed' : 'active';
    const { data, error } = await db.from('performance_goals')
      .insert({ user_id: targetUserId, title: title.trim(), description: description || '', category: category || 'individual', target_date: target_date || null, review_cycle: cycle, created_by: req.user.id, organization_id: oId, progress: cappedProgress, status: autoStatus })
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admins can update all fields; employees can update all fields on their own goals.
router.put('/goals/:id', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { title, description, category, target_date, review_cycle, progress, status } = req.body;

    // BUG_082: enforce title max length on update
    if (title && title.length > 150) return res.status(400).json({ error: 'Goal Title must be 150 characters or less.' });
    if (description && description.length > 1000) return res.status(400).json({ error: 'Description must be 1000 characters or less.' });

    // Fetch goal first to enforce ownership for employees
    const { data: goal } = await db.from('performance_goals')
      .select('user_id').eq('id', req.params.id).eq('organization_id', oId).maybeSingle();
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    if (!isAdmin(req.user.role) && goal.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const cappedProgress = Math.min(100, Math.max(0, Number(progress) || 0));
    // Auto-complete when progress hits 100
    const autoStatus = cappedProgress >= 100 ? 'completed' : (status || 'active');

    let updatePayload;
    // BUG_084: include review_cycle so editing target_date also updates the cycle
    const cycle = review_cycle || (target_date ? target_date.substring(0, 4) : undefined);
    updatePayload = { title, description, category, target_date, progress: cappedProgress, status: autoStatus };
    if (cycle) updatePayload.review_cycle = cycle;

    const { data, error } = await db.from('performance_goals')
      .update(updatePayload)
      .eq('id', req.params.id).eq('organization_id', oId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/goals/:id', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    // Employees can delete their own goals; admins can delete any goal (BUG_034 fix)
    const { data: goal } = await db.from('performance_goals')
      .select('user_id').eq('id', req.params.id).eq('organization_id', oId).maybeSingle();
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    if (!isAdmin(req.user.role) && goal.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own goals.' });
    }
    const { error } = await db.from('performance_goals').delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Reviews ──────────────────────────────────────────────────────────────────
router.get('/reviews', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { userId, cycle } = req.query;
    let q = db.from('performance_reviews').select('*').eq('organization_id', oId).order('created_at', { ascending: false });
    if (!isAdmin(req.user.role)) q = q.eq('user_id', req.user.id);
    else if (userId) q = q.eq('user_id', userId);
    if (cycle) q = q.eq('review_cycle', cycle);
    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) return res.json([]);

    const allIds = [...new Set([...rows.map(r => r.user_id), ...rows.map(r => r.reviewer_id)].filter(Boolean))];
    const { data: users } = await db.from('users').select('id, name, avatar_color, department, position').in('id', allIds);
    const uMap = {};
    (users || []).forEach(u => { uMap[u.id] = u; });

    res.json(rows.map(r => ({
      ...r,
      user_name:         uMap[r.user_id]?.name || '',
      user_avatar_color: uMap[r.user_id]?.avatar_color || '',
      user_department:   uMap[r.user_id]?.department || '',
      reviewer_name:     uMap[r.reviewer_id]?.name || '',
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/reviews', auth, hasPermission('performance', 'create'), async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const { user_id, review_cycle, review_type } = req.body;
    if (!user_id || !review_cycle) return res.status(400).json({ error: 'user_id and review_cycle required' });
    const { data, error } = await db.from('performance_reviews')
      .insert({ user_id, review_cycle, review_type: review_type || 'annual', reviewer_id: req.user.id, status: 'pending', organization_id: oId })
      .select().single();
    if (error) throw error;
    await db.from('notifications').insert({ user_id, title: 'Performance Review Started', message: `Your ${review_cycle} performance review has been initiated.`, type: 'performance', organization_id: oId });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/reviews/:id', auth, hasPermission('performance', 'manage'), async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { self_rating, self_comments, manager_rating, manager_comments, strengths, improvements, final_rating, status } = req.body;
    const update = {};
    if (self_rating !== undefined)     { update.self_rating = self_rating; update.self_comments = self_comments || ''; }
    if (isAdmin(req.user.role)) {
      if (manager_rating !== undefined) update.manager_rating = manager_rating;
      if (manager_comments)             update.manager_comments = manager_comments;
      if (strengths)                    update.strengths = strengths;
      if (improvements)                 update.improvements = improvements;
      if (final_rating !== undefined)   update.final_rating = final_rating;
      if (status)                       update.status = status;
    }
    const { data, error } = await db.from('performance_reviews')
      .update(update).eq('id', req.params.id).eq('organization_id', oId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
