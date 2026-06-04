const express = require('express');
const router  = express.Router();
const { supabase } = require('../db');

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

const DEFAULT_TASKS = [
  { title: 'Complete personal information form',    assigned_to: 'employee', order_index: 1 },
  { title: 'Upload ID proof and address proof',     assigned_to: 'employee', order_index: 2 },
  { title: 'Provide bank account details',          assigned_to: 'employee', order_index: 3 },
  { title: 'Read and acknowledge company policies', assigned_to: 'employee', order_index: 4 },
  { title: 'Set up work email and tools access',    assigned_to: 'hr',       order_index: 5 },
  { title: 'Laptop and equipment setup',            assigned_to: 'it',       order_index: 6 },
  { title: 'Assign buddy / mentor',                 assigned_to: 'hr',       order_index: 7 },
  { title: 'Complete orientation / induction',      assigned_to: 'employee', order_index: 8 },
  { title: 'Meet with reporting manager',           assigned_to: 'employee', order_index: 9 },
  { title: 'Complete first-week review',            assigned_to: 'hr',       order_index: 10 },
];

// GET /api/onboarding
router.get('/', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { userId } = req.query;
    const targetId = isAdmin(req.user.role) && userId ? userId : req.user.id;
    const { data, error } = await supabase.from('onboarding_checklists')
      .select('*').eq('user_id', targetId).eq('organization_id', oId).order('order_index');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/onboarding/overview
router.get('/overview', async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const { data, error } = await supabase.from('onboarding_checklists')
      .select('*').eq('organization_id', oId).order('created_at', { ascending: false });
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) return res.json([]);

    const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    const { data: users } = await supabase.from('users')
      .select('id, name, avatar_color, department, date_of_joining').in('id', userIds);
    const uMap = {};
    (users || []).forEach(u => { uMap[u.id] = u; });

    const grouped = {};
    rows.forEach(task => {
      const uid = task.user_id;
      if (!grouped[uid]) grouped[uid] = { user: uMap[uid] || { id: uid }, tasks: [], completed: 0, total: 0 };
      grouped[uid].tasks.push(task);
      grouped[uid].total++;
      if (task.completed) grouped[uid].completed++;
    });
    res.json(Object.values(grouped));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/onboarding/init/:userId
router.post('/init/:userId', async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const uid = req.params.userId;
    const { data: existing } = await supabase.from('onboarding_checklists').select('id').eq('user_id', uid).eq('organization_id', oId).limit(1);
    if (existing?.length) return res.status(400).json({ error: 'Onboarding already initialized' });
    const rows = DEFAULT_TASKS.map(t => ({ ...t, user_id: uid, organization_id: oId }));
    const { data, error } = await supabase.from('onboarding_checklists').insert(rows).select();
    if (error) throw error;
    await supabase.from('notifications').insert({ user_id: uid, title: 'Welcome! Your Onboarding Checklist is Ready', message: 'Please complete the onboarding tasks assigned to you.', type: 'onboarding', organization_id: oId });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/onboarding
router.post('/', async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const { user_id, title, description, due_date, assigned_to, order_index } = req.body;
    const { data, error } = await supabase.from('onboarding_checklists')
      .insert({ user_id, title, description: description || '', due_date: due_date || null, assigned_to: assigned_to || 'employee', order_index: order_index || 99, organization_id: oId })
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/onboarding/:id/complete
router.put('/:id/complete', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { completed } = req.body;
    const { data, error } = await supabase.from('onboarding_checklists')
      .update({ completed: !!completed, completed_at: completed ? new Date().toISOString() : null })
      .eq('id', req.params.id).eq('organization_id', oId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/onboarding/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const { error } = await supabase.from('onboarding_checklists').delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
