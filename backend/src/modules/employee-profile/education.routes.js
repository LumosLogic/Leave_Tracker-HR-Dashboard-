const express = require('express');
const router  = express.Router();
const { supabase }              = require('../../config/db');
const { auth, isAdminRole } = require('../../middleware/auth');
const { orgId }                 = require('../../utils/helpers');

// GET /api/profile/:id/education
router.get('/:id/education', auth, async (req, res) => {
  try {
    const empId = parseInt(req.params.id);
    if (!isAdminRole(req.user.role) && parseInt(req.user.id) !== empId)
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
    if (!isAdminRole(req.user.role) && parseInt(req.user.id) !== empId)
      return res.status(403).json({ error: 'Access denied' });
    const {
      degree_level, institution, board_university, specialization,
      year_of_passing, percentage, cgpa, degree_class,
    } = req.body;
    if (!institution) return res.status(400).json({ error: 'institution is required' });
    // BUG_050: Academic field validation
    if (!/[a-zA-Z]/.test(institution)) return res.status(400).json({ error: 'Institution name must contain alphabetic characters.' });
    const currentYear = new Date().getFullYear();
    if (year_of_passing && (Number(year_of_passing) < 1950 || Number(year_of_passing) > currentYear)) {
      return res.status(400).json({ error: `Year of passing must be between 1950 and ${currentYear}.` });
    }
    if (percentage !== undefined && percentage !== null && percentage !== '' && (Number(percentage) < 0 || Number(percentage) > 100)) {
      return res.status(400).json({ error: 'Percentage must be between 0 and 100.' });
    }
    if (cgpa !== undefined && cgpa !== null && cgpa !== '' && (Number(cgpa) < 0 || Number(cgpa) > 10)) {
      return res.status(400).json({ error: 'CGPA must be between 0 and 10.' });
    }

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
    if (!isAdminRole(req.user.role) && parseInt(req.user.id) !== empId)
      return res.status(403).json({ error: 'Access denied' });
    const {
      degree_level, institution, board_university, specialization,
      year_of_passing, percentage, cgpa, degree_class,
    } = req.body;

    // BUG_050: Validate on update too
    if (institution && !/[a-zA-Z]/.test(institution)) return res.status(400).json({ error: 'Institution name must contain letters.' });
    const currentYear = new Date().getFullYear();
    if (year_of_passing && (year_of_passing < 1950 || year_of_passing > currentYear))
      return res.status(400).json({ error: `Year of passing must be between 1950 and ${currentYear}.` });
    if (percentage != null && percentage !== '' && (percentage < 0 || percentage > 100))
      return res.status(400).json({ error: 'Percentage must be between 0 and 100.' });
    if (cgpa != null && cgpa !== '' && (cgpa < 0 || cgpa > 10))
      return res.status(400).json({ error: 'CGPA must be between 0 and 10.' });

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
    if (!isAdminRole(req.user.role) && parseInt(req.user.id) !== empId)
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
