const express = require('express');
const router  = express.Router();
const { supabase }              = require('../../config/db');
const { auth, isAdminRole } = require('../../middleware/auth');
const { orgId }                 = require('../../utils/helpers');

// GET /api/profile/:id/education
router.get('/:id/education', auth, async (req, res) => {
  try {
    const empId = parseInt(req.params.id);
    if (!isAdminRole(req.user.role) && req.user.id !== empId)
      return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabase.from('employee_qualifications')
      .select('*').eq('user_id', empId).eq('organization_id', orgId(req))
      .order('year_of_passing', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/profile/:id/education
router.post('/:id/education', auth, async (req, res) => {
  try {
    const empId = parseInt(req.params.id);
    if (!isAdminRole(req.user.role) && req.user.id !== empId)
      return res.status(403).json({ error: 'Access denied' });
    const {
      degree_level, institution, board_university, specialization,
      year_of_passing, percentage, cgpa, degree_class,
    } = req.body;
    if (!institution) return res.status(400).json({ error: 'institution is required' });

    const { data, error } = await supabase.from('employee_qualifications').insert({
      user_id: empId, organization_id: orgId(req),
      degree_level, institution, board_university, specialization,
      year_of_passing: year_of_passing || null,
      percentage: percentage || null,
      cgpa: cgpa || null,
      degree_class,
      created_by: req.user.id,
      updated_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/profile/:id/education/:recordId
router.put('/:id/education/:recordId', auth, async (req, res) => {
  try {
    const empId    = parseInt(req.params.id);
    const recordId = parseInt(req.params.recordId);
    if (!isAdminRole(req.user.role) && req.user.id !== empId)
      return res.status(403).json({ error: 'Access denied' });
    const {
      degree_level, institution, board_university, specialization,
      year_of_passing, percentage, cgpa, degree_class,
    } = req.body;

    const { data, error } = await supabase.from('employee_qualifications').update({
      degree_level, institution, board_university, specialization,
      year_of_passing: year_of_passing || null,
      percentage: percentage || null,
      cgpa: cgpa || null,
      degree_class,
      updated_at: new Date().toISOString(), updated_by: req.user.id,
    }).eq('id', recordId).eq('user_id', empId).eq('organization_id', orgId(req)).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/profile/:id/education/:recordId
router.delete('/:id/education/:recordId', auth, async (req, res) => {
  try {
    const empId = parseInt(req.params.id);
    if (!isAdminRole(req.user.role) && req.user.id !== empId)
      return res.status(403).json({ error: 'Access denied' });
    const { error } = await supabase.from('employee_qualifications')
      .delete().eq('id', parseInt(req.params.recordId))
      .eq('user_id', empId).eq('organization_id', orgId(req));
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
