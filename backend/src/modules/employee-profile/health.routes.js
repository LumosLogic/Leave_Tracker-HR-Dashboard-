const express = require('express');
const router  = express.Router();
const { supabase }              = require('../../config/db');
const { auth, adminOnly, isAdminRole, selfOrAdmin } = require('../../middleware/auth');
const { orgId }                 = require('../../utils/helpers');

const SELF_EDITABLE = [
  'blood_group','height','weight','allergies','medical_conditions',
  'disabilities','emergency_medical_notes',
];

// GET /api/profile/:id/health
router.get('/:id/health', auth, async (req, res) => {
  try {
    const empId = parseInt(req.params.id);
    if (!isAdminRole(req.user.role) && req.user.id !== empId)
      return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabase.from('employee_health')
      .select('*').eq('employee_id', empId).eq('organization_id', orgId(req)).maybeSingle();
    if (error) throw error;
    res.json(data || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/profile/:id/health  — upsert (one record per employee)
router.put('/:id/health', auth, selfOrAdmin(SELF_EDITABLE), async (req, res) => {
  try {
    const empId   = parseInt(req.params.id);
    const isAdmin = isAdminRole(req.user.role);
    const {
      blood_group, height, weight, allergies, medical_conditions, disabilities,
      health_insurance_provider, health_insurance_number, health_insurance_expiry,
      emergency_medical_notes,
    } = req.body;

    const record = {
      employee_id: empId, organization_id: orgId(req),
      blood_group: blood_group || null, height: height || null, weight: weight || null,
      allergies: allergies || null, medical_conditions: medical_conditions || null,
      disabilities: disabilities || null,
      emergency_medical_notes: emergency_medical_notes || null,
      updated_at: new Date().toISOString(), updated_by: req.user.id,
    };

    // Insurance fields — admin only
    if (isAdmin) {
      record.health_insurance_provider  = health_insurance_provider  || null;
      record.health_insurance_number    = health_insurance_number    || null;
      record.health_insurance_expiry    = health_insurance_expiry    || null;
    }

    const { data, error } = await supabase.from('employee_health')
      .upsert(record, { onConflict: 'employee_id,organization_id' }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
