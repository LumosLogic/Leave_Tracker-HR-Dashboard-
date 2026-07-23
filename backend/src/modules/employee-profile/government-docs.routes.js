const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const { supabase }              = require('../../config/db');
const { auth, adminOnly, isAdminRole } = require('../../middleware/auth');
const { orgId }                 = require('../../utils/helpers');

let cloudinary;
try { cloudinary = require('../../config/cloudinary'); } catch { cloudinary = null; }

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function uploadFile(file, empId, oId) {
  if (!cloudinary || !file) return null;
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: `hrms/${oId}/gov-docs/${empId}`, resource_type: 'auto' },
      (err, result) => err ? reject(err) : resolve(result.secure_url)
    ).end(file.buffer);
  });
}

// GET /api/profile/:id/government-docs
router.get('/:id/government-docs', auth, async (req, res) => {
  try {
    const empId = parseInt(req.params.id);
    if (!isAdminRole(req.user.role) && req.user.id !== empId)
      return res.status(403).json({ error: 'Access denied' });

    const { data, error } = await supabase.from('employee_government_documents')
      .select('*').eq('employee_id', empId).eq('organization_id', orgId(req))
      .order('document_type');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/profile/:id/government-docs  (with optional file upload)
router.post('/:id/government-docs', auth, adminOnly, upload.single('file'), async (req, res) => {
  try {
    const empId = parseInt(req.params.id);
    const { document_type, document_number, issue_date, expiry_date, issuing_authority, remarks } = req.body;
    if (!document_type) return res.status(400).json({ error: 'document_type is required' });

    const file_url = req.file ? await uploadFile(req.file, empId, orgId(req)) : null;

    const { data, error } = await supabase.from('employee_government_documents').insert({
      employee_id: empId, organization_id: orgId(req),
      document_type, document_number: document_number || null,
      issue_date: issue_date || null, expiry_date: expiry_date || null,
      issuing_authority: issuing_authority || null,
      file_url, verification_status: 'pending',
      remarks: remarks || null,
      created_by: req.user.id, updated_at: new Date().toISOString(),
    }).select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Document of this type already exists. Update the existing record instead.' });
      throw error;
    }
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/profile/:id/government-docs/:recordId
router.put('/:id/government-docs/:recordId', auth, adminOnly, upload.single('file'), async (req, res) => {
  try {
    const empId    = parseInt(req.params.id);
    const recordId = parseInt(req.params.recordId);
    const { document_number, issue_date, expiry_date, issuing_authority, remarks } = req.body;

    const file_url = req.file ? await uploadFile(req.file, empId, orgId(req)) : undefined;
    const update = {
      document_number: document_number || null,
      issue_date: issue_date || null, expiry_date: expiry_date || null,
      issuing_authority: issuing_authority || null,
      remarks: remarks || null,
      updated_at: new Date().toISOString(), updated_by: req.user.id,
    };
    if (file_url !== undefined) update.file_url = file_url;

    const { data, error } = await supabase.from('employee_government_documents')
      .update(update).eq('id', recordId).eq('employee_id', empId)
      .eq('organization_id', orgId(req)).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/profile/:id/government-docs/:recordId/verify  — admin set verification status
router.patch('/:id/government-docs/:recordId/verify', auth, adminOnly, async (req, res) => {
  try {
    const { verification_status } = req.body;
    if (!['pending','verified','rejected'].includes(verification_status))
      return res.status(400).json({ error: 'Invalid status' });

    const { data, error } = await supabase.from('employee_government_documents').update({
      verification_status,
      verified_by: req.user.id,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', parseInt(req.params.recordId))
      .eq('employee_id', parseInt(req.params.id))
      .eq('organization_id', orgId(req)).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/profile/:id/government-docs/:recordId
router.delete('/:id/government-docs/:recordId', auth, adminOnly, async (req, res) => {
  try {
    const { error } = await supabase.from('employee_government_documents')
      .delete().eq('id', parseInt(req.params.recordId))
      .eq('employee_id', parseInt(req.params.id)).eq('organization_id', orgId(req));
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
