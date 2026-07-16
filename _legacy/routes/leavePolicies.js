const express = require('express');
const router  = express.Router();
const { supabase } = require('../db');

const DEFAULT_POLICIES = [
  { leave_type: 'annual',    label: 'Annual Leave',    annual_quota: 18, carry_forward: true,  max_carry_forward: 5,  paid: true },
  { leave_type: 'sick',      label: 'Sick Leave',      annual_quota: 12, carry_forward: false, max_carry_forward: 0,  paid: true },
  { leave_type: 'casual',    label: 'Casual Leave',    annual_quota:  8, carry_forward: false, max_carry_forward: 0,  paid: true },
  { leave_type: 'emergency', label: 'Emergency Leave', annual_quota:  3, carry_forward: false, max_carry_forward: 0,  paid: true },
  { leave_type: 'maternity', label: 'Maternity Leave', annual_quota: 180,carry_forward: false, max_carry_forward: 0,  paid: true },
  { leave_type: 'paternity', label: 'Paternity Leave', annual_quota: 15, carry_forward: false, max_carry_forward: 0,  paid: true },
  { leave_type: 'comp_off',  label: 'Comp Off',        annual_quota:  0, carry_forward: false, max_carry_forward: 0,  paid: true },
];

// GET /api/leave-policies
router.get('/', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { data, error } = await supabase.from('leave_policies')
      .select('*').eq('organization_id', oId).order('leave_type');

    // Return defaults if table missing or no rows yet
    if (error || !data || data.length === 0) {
      return res.json(DEFAULT_POLICIES.map(p => ({ ...p, id: null, organization_id: oId, active: true })));
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/leave-policies — upsert all policies at once
router.post('/', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { policies } = req.body;
    if (!Array.isArray(policies)) return res.status(400).json({ error: 'policies array required' });

    // Delete existing and re-insert
    await supabase.from('leave_policies').delete().eq('organization_id', oId);
    const rows = policies.map(p => ({ ...p, organization_id: oId, id: undefined }));
    const { data, error } = await supabase.from('leave_policies').insert(rows).select();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/leave-policies/:id
router.put('/:id', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const fields = req.body;
    delete fields.id; delete fields.organization_id; delete fields.created_at;
    const { data, error } = await supabase.from('leave_policies')
      .update(fields).eq('id', req.params.id).eq('organization_id', oId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
