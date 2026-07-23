const express = require('express');
const router  = express.Router();
const { supabase }              = require('../../config/db');
const { auth, isAdminRole } = require('../../middleware/auth');
const { orgId }                 = require('../../utils/helpers');

function checkAccess(req, empId) {
  return isAdminRole(req.user.role) || parseInt(req.user.id) === empId;
}

// GET /api/profile/:id/family
router.get('/:id/family', auth, async (req, res) => {
  try {
    const empId = parseInt(req.params.id);
    if (!checkAccess(req, empId)) return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabase.from('employee_family_members')
      .select('*').eq('employee_id', empId).eq('organization_id', orgId(req))
      .order('relationship').order('created_at');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/profile/:id/family
router.post('/:id/family', auth, async (req, res) => {
  try {
    const empId = parseInt(req.params.id);
    if (!isAdminRole(req.user.role) && req.user.id !== empId)
      return res.status(403).json({ error: 'Access denied' });
    const { relationship, name, date_of_birth, gender, occupation, contact_number, dependent } = req.body;
    if (!relationship || !name) return res.status(400).json({ error: 'relationship and name are required' });

    const { data, error } = await supabase.from('employee_family_members').insert({
      employee_id: empId, organization_id: orgId(req),
      relationship, name, date_of_birth: date_of_birth || null,
      gender, occupation, contact_number, dependent: dependent || false,
      created_by: req.user.id, updated_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/profile/:id/family/:recordId
router.put('/:id/family/:recordId', auth, async (req, res) => {
  try {
    const empId    = parseInt(req.params.id);
    const recordId = parseInt(req.params.recordId);
    if (!isAdminRole(req.user.role) && req.user.id !== empId)
      return res.status(403).json({ error: 'Access denied' });
    const { relationship, name, date_of_birth, gender, occupation, contact_number, dependent } = req.body;

    const { data, error } = await supabase.from('employee_family_members').update({
      relationship, name, date_of_birth: date_of_birth || null,
      gender, occupation, contact_number, dependent,
      updated_at: new Date().toISOString(), updated_by: req.user.id,
    }).eq('id', recordId).eq('employee_id', empId).eq('organization_id', orgId(req)).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/profile/:id/family/:recordId
router.delete('/:id/family/:recordId', auth, async (req, res) => {
  try {
    const empId    = parseInt(req.params.id);
    const recordId = parseInt(req.params.recordId);
    if (!isAdminRole(req.user.role) && req.user.id !== empId)
      return res.status(403).json({ error: 'Access denied' });
    const { error } = await supabase.from('employee_family_members')
      .delete().eq('id', recordId).eq('employee_id', empId).eq('organization_id', orgId(req));
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
