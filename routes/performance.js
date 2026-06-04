const express = require('express');
const router  = express.Router();
const { supabase } = require('../db');

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// ─── Goals ────────────────────────────────────────────────────────────────────
router.get('/goals', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { userId, cycle } = req.query;
    let q = supabase.from('performance_goals').select('*').eq('organization_id', oId).order('created_at', { ascending: false });
    if (!isAdmin(req.user.role)) q = q.eq('user_id', req.user.id);
    else if (userId) q = q.eq('user_id', userId);
    if (cycle) q = q.eq('review_cycle', cycle);
    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) return res.json([]);

    const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    const { data: users } = await supabase.from('users').select('id, name, avatar_color, department').in('id', userIds);
    const uMap = {};
    (users || []).forEach(u => { uMap[u.id] = u; });

    res.json(rows.map(r => ({ ...r, user_name: uMap[r.user_id]?.name || '', user_avatar_color: uMap[r.user_id]?.avatar_color || '' })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/goals', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { title, description, category, target_date, review_cycle, user_id } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const targetUserId = isAdmin(req.user.role) && user_id ? user_id : req.user.id;
    const { data, error } = await supabase.from('performance_goals')
      .insert({ user_id: targetUserId, title, description: description || '', category: category || 'individual', target_date: target_date || null, review_cycle: review_cycle || String(new Date().getFullYear()), created_by: req.user.id, organization_id: oId, progress: 0, status: 'active' })
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/goals/:id', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { title, description, category, target_date, progress, status } = req.body;
    const { data, error } = await supabase.from('performance_goals')
      .update({ title, description, category, target_date, progress: Number(progress) || 0, status })
      .eq('id', req.params.id).eq('organization_id', oId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/goals/:id', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { error } = await supabase.from('performance_goals').delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Reviews ──────────────────────────────────────────────────────────────────
router.get('/reviews', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { userId, cycle } = req.query;
    let q = supabase.from('performance_reviews').select('*').eq('organization_id', oId).order('created_at', { ascending: false });
    if (!isAdmin(req.user.role)) q = q.eq('user_id', req.user.id);
    else if (userId) q = q.eq('user_id', userId);
    if (cycle) q = q.eq('review_cycle', cycle);
    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) return res.json([]);

    const allIds = [...new Set([...rows.map(r => r.user_id), ...rows.map(r => r.reviewer_id)].filter(Boolean))];
    const { data: users } = await supabase.from('users').select('id, name, avatar_color, department, position').in('id', allIds);
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

router.post('/reviews', async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const { user_id, review_cycle, review_type } = req.body;
    if (!user_id || !review_cycle) return res.status(400).json({ error: 'user_id and review_cycle required' });
    const { data, error } = await supabase.from('performance_reviews')
      .insert({ user_id, review_cycle, review_type: review_type || 'annual', reviewer_id: req.user.id, status: 'pending', organization_id: oId })
      .select().single();
    if (error) throw error;
    await supabase.from('notifications').insert({ user_id, title: 'Performance Review Started', message: `Your ${review_cycle} performance review has been initiated.`, type: 'performance', organization_id: oId });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/reviews/:id', async (req, res) => {
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
    const { data, error } = await supabase.from('performance_reviews')
      .update(update).eq('id', req.params.id).eq('organization_id', oId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
