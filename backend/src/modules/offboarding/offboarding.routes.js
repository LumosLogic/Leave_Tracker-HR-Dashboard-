const express = require('express');
const router  = express.Router();
const { db, pool } = require('../../config/db');
const { auth } = require('../../middleware/auth');
const { hasPermission } = require('../../middleware/permissions');
const { orgId } = require('../../utils/helpers');

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// GET /api/offboarding
// Admins: see all offboarding tasks or filter by ?userId=X
// Employees: see only their own tasks
router.get('/', auth, async (req, res) => {
  try {
    const oId = orgId(req);
    const { userId } = req.query;

    let query = db
      .from('offboarding_checklists')
      .select('*, users!offboarding_checklists_user_id_fkey(id, name, avatar_color, position)')
      .eq('organization_id', oId)
      .order('order_index', { ascending: true });

    if (isAdmin(req.user.role)) {
      if (userId) query = query.eq('user_id', parseInt(userId, 10));
    } else {
      query = query.eq('user_id', req.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/offboarding/overview — HR: grouped view per departing employee
router.get('/overview', auth, hasPermission('exit', 'manage'), async (req, res) => {
  try {
    const oId = orgId(req);
    const { data, error } = await db
      .from('offboarding_checklists')
      .select('*, users!offboarding_checklists_user_id_fkey(id, name, avatar_color, position, department)')
      .eq('organization_id', oId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const rows = data || [];
    if (!rows.length) return res.json([]);

    // Group by user
    const grouped = {};
    for (const task of rows) {
      const uid = task.user_id;
      if (!grouped[uid]) {
        grouped[uid] = {
          user:      task.users || { id: uid },
          tasks:     [],
          completed: 0,
          total:     0,
        };
      }
      grouped[uid].tasks.push(task);
      grouped[uid].total++;
      if (task.completed) grouped[uid].completed++;
    }
    res.json(Object.values(grouped));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/offboarding/:id/complete — mark a task complete or incomplete
router.put('/:id/complete', auth, async (req, res) => {
  try {
    const oId       = orgId(req);
    const { completed } = req.body;
    const taskId    = parseInt(req.params.id, 10);

    const { data: task, error: fetchErr } = await db
      .from('offboarding_checklists')
      .select('user_id, assigned_to')
      .eq('id', taskId)
      .eq('organization_id', oId)
      .single();

    if (fetchErr || !task) return res.status(404).json({ error: 'Task not found' });

    // Employees can only complete tasks assigned to them
    if (!isAdmin(req.user.role)) {
      if (task.user_id !== req.user.id) return res.status(403).json({ error: 'Access denied' });
      if (task.assigned_to !== 'employee') return res.status(403).json({ error: 'Only HR can complete this task' });
    }

    const { data, error } = await db
      .from('offboarding_checklists')
      .update({
        completed:    !!completed,
        completed_at: completed ? new Date().toISOString() : null,
        completed_by: completed ? req.user.id : null,
      })
      .eq('id', taskId)
      .eq('organization_id', oId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
