const express    = require('express');
const router     = express.Router();
const { supabase } = require('../../config/db');
const { auth }   = require('../../middleware/auth');
const cloudinary = require('cloudinary').v2;
const multer     = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

const ALLOWED_MIMES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// GET /api/doc-requirements
// Admin: all requirements + submission stats
// Employee: active requirements + their own submission status
router.get('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;

    let query = supabase
      .from('document_requirements')
      .select('*')
      .eq('organization_id', oId)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (!isAdmin(req.user.role)) query = query.eq('is_active', true);

    const { data: requirements, error } = await query;
    if (error) throw error;

    const reqIds = (requirements || []).map(r => r.id);
    if (!reqIds.length) return res.json([]);

    if (isAdmin(req.user.role)) {
      const { data: subs } = await supabase
        .from('employee_doc_submissions')
        .select('requirement_id, status')
        .in('requirement_id', reqIds)
        .eq('organization_id', oId);

      const statsMap = {};
      (subs || []).forEach(s => {
        if (!statsMap[s.requirement_id]) statsMap[s.requirement_id] = { total: 0, approved: 0, under_review: 0, rejected: 0, re_upload_requested: 0 };
        statsMap[s.requirement_id].total++;
        statsMap[s.requirement_id][s.status] = (statsMap[s.requirement_id][s.status] || 0) + 1;
      });

      return res.json((requirements || []).map(r => ({ ...r, _stats: statsMap[r.id] || { total: 0 } })));
    }

    // Employee: attach their own submission
    const { data: mySubs } = await supabase
      .from('employee_doc_submissions')
      .select('*, reviewer:users!employee_doc_submissions_reviewed_by_fkey(name)')
      .eq('user_id', req.user.id)
      .eq('organization_id', oId)
      .in('requirement_id', reqIds);

    const subMap = {};
    (mySubs || []).forEach(s => { subMap[s.requirement_id] = s; });

    res.json((requirements || []).map(r => ({ ...r, _submission: subMap[r.id] || null })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/doc-requirements/my-activity — employee recent activity
router.get('/my-activity', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { data, error } = await supabase
      .from('doc_submission_activity')
      .select('*, requirement:document_requirements!doc_submission_activity_requirement_id_fkey(name)')
      .eq('user_id', req.user.id)
      .eq('organization_id', oId)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/doc-requirements/verification-queue — HR pending submissions
router.get('/verification-queue', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const oId = req.user.organization_id;

    const { data, error } = await supabase
      .from('employee_doc_submissions')
      .select('*, employee:users(id, name, email, avatar_color, department, designation), requirement:document_requirements!employee_doc_submissions_requirement_id_fkey(id, name, description, category)')
      .eq('organization_id', oId)
      .in('status', ['under_review', 're_upload_requested'])
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/doc-requirements — create requirement (admin only)
router.post('/', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const oId = req.user.organization_id;
    const {
      name, description, category, is_required, applicable_to,
      accepted_formats, max_file_size_mb, expiry_required,
      expiry_reminder_days, verification_required, allow_reupload, display_order,
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: 'Document name is required' });

    const { data, error } = await supabase.from('document_requirements').insert({
      organization_id:      oId,
      name:                 name.trim(),
      description:          description?.trim() || null,
      category:             category || 'other',
      is_required:          is_required !== false,
      applicable_to:        applicable_to || 'everyone',
      accepted_formats:     accepted_formats || ['pdf', 'jpg', 'png'],
      max_file_size_mb:     max_file_size_mb || 10,
      expiry_required:      expiry_required || false,
      expiry_reminder_days: expiry_reminder_days || 30,
      verification_required: verification_required !== false,
      allow_reupload:       allow_reupload !== false,
      display_order:        display_order || 0,
      is_active:            true,
      created_by:           req.user.id,
    }).select().single();

    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/doc-requirements/submissions/:id/review — HR review action
router.patch('/submissions/:id/review', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const oId = req.user.organization_id;
    const { action, reason } = req.body;

    if (!['approved', 'rejected', 're_upload_requested'].includes(action))
      return res.status(400).json({ error: 'Invalid action' });
    if ((action === 'rejected' || action === 're_upload_requested') && !reason?.trim())
      return res.status(400).json({ error: 'Reason is required for rejection or re-upload request' });

    const { data: sub } = await supabase
      .from('employee_doc_submissions')
      .select('*, requirement:document_requirements!employee_doc_submissions_requirement_id_fkey(name)')
      .eq('id', req.params.id)
      .eq('organization_id', oId)
      .single();
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    const updates = {
      status:      action,
      reviewed_by: req.user.id,
      reviewed_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    };
    updates.rejection_reason = (action !== 'approved') ? (reason?.trim() || null) : null;

    const { data, error } = await supabase.from('employee_doc_submissions')
      .update(updates)
      .eq('id', req.params.id)
      .eq('organization_id', oId)
      .select().single();
    if (error) throw error;

    // Log activity
    await supabase.from('doc_submission_activity').insert({
      requirement_id: sub.requirement_id,
      user_id:        sub.user_id,
      organization_id: oId,
      action,
      details: action === 'approved'
        ? `"${sub.requirement?.name}" approved`
        : `"${sub.requirement?.name}" ${action === 'rejected' ? 'rejected' : 're-upload requested'}: ${reason || ''}`,
      actor_id: req.user.id,
    });

    // Notify employee
    const notifTitle = { approved: 'Document Approved', rejected: 'Document Rejected', re_upload_requested: 'Re-upload Requested' }[action];
    const notifMsg = {
      approved:           `Your "${sub.requirement?.name}" has been approved.`,
      rejected:           `Your "${sub.requirement?.name}" was rejected. Reason: ${reason}`,
      re_upload_requested: `Please re-upload "${sub.requirement?.name}". Reason: ${reason}`,
    }[action];

    await supabase.from('notifications').insert({
      user_id: sub.user_id, title: notifTitle, message: notifMsg,
      type: 'document', organization_id: oId,
    });

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/doc-requirements/:id — update requirement (admin only)
router.patch('/:id', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const oId = req.user.organization_id;
    const {
      name, description, category, is_required, applicable_to,
      accepted_formats, max_file_size_mb, expiry_required,
      expiry_reminder_days, verification_required, allow_reupload,
      display_order, is_active,
    } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined)                 updates.name = name;
    if (description !== undefined)          updates.description = description || null;
    if (category !== undefined)             updates.category = category;
    if (is_required !== undefined)          updates.is_required = is_required;
    if (applicable_to !== undefined)        updates.applicable_to = applicable_to;
    if (accepted_formats !== undefined)     updates.accepted_formats = accepted_formats;
    if (max_file_size_mb !== undefined)     updates.max_file_size_mb = max_file_size_mb;
    if (expiry_required !== undefined)      updates.expiry_required = expiry_required;
    if (expiry_reminder_days !== undefined) updates.expiry_reminder_days = expiry_reminder_days;
    if (verification_required !== undefined) updates.verification_required = verification_required;
    if (allow_reupload !== undefined)       updates.allow_reupload = allow_reupload;
    if (display_order !== undefined)        updates.display_order = display_order;
    if (is_active !== undefined)            updates.is_active = is_active;

    const { data, error } = await supabase.from('document_requirements')
      .update(updates)
      .eq('id', req.params.id)
      .eq('organization_id', oId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/doc-requirements/:id — delete requirement (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const { error } = await supabase.from('document_requirements')
      .delete()
      .eq('id', req.params.id)
      .eq('organization_id', req.user.organization_id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/doc-requirements/:id/submit — employee submits/re-submits a document
router.post('/:id/submit', auth, upload.single('file'), async (req, res) => {
  try {
    const oId  = req.user.organization_id;
    const reqId = Number(req.params.id);

    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    if (!ALLOWED_MIMES.includes(req.file.mimetype))
      return res.status(400).json({ error: 'Invalid file type. Only PDF, Images, and Word documents are allowed.' });

    const { data: requirement } = await supabase.from('document_requirements')
      .select('*').eq('id', reqId).eq('organization_id', oId).single();
    if (!requirement)          return res.status(404).json({ error: 'Requirement not found' });
    if (!requirement.is_active) return res.status(400).json({ error: 'This document requirement is no longer active' });

    const { data: existing } = await supabase.from('employee_doc_submissions')
      .select('*').eq('requirement_id', reqId).eq('user_id', req.user.id).maybeSingle();

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: `hrms/${oId}/doc-submissions`, resource_type: 'auto' },
        (err, r) => err ? reject(err) : resolve(r)
      ).end(req.file.buffer);
    });

    // Delete old Cloudinary file if re-uploading
    if (existing?.cloudinary_public_id) {
      try { await cloudinary.uploader.destroy(existing.cloudinary_public_id); } catch {}
    }

    const { expiry_date } = req.body;
    let submission;

    if (existing) {
      const { data, error } = await supabase.from('employee_doc_submissions')
        .update({
          file_url:            result.secure_url,
          file_type:           req.file.mimetype,
          file_size:           req.file.size,
          file_name:           req.file.originalname,
          cloudinary_public_id: result.public_id,
          status:              'under_review',
          rejection_reason:    null,
          expiry_date:         expiry_date || null,
          reviewed_by:         null,
          reviewed_at:         null,
          uploaded_at:         new Date().toISOString(),
          updated_at:          new Date().toISOString(),
          version:             (existing.version || 1) + 1,
        })
        .eq('id', existing.id)
        .select().single();
      if (error) throw error;
      submission = data;

      await supabase.from('doc_submission_activity').insert({
        requirement_id: reqId, user_id: req.user.id, organization_id: oId,
        action: 're_uploaded', details: `Re-uploaded "${requirement.name}"`, actor_id: req.user.id,
      });
    } else {
      const { data, error } = await supabase.from('employee_doc_submissions').insert({
        requirement_id:      reqId,
        user_id:             req.user.id,
        organization_id:     oId,
        file_url:            result.secure_url,
        file_type:           req.file.mimetype,
        file_size:           req.file.size,
        file_name:           req.file.originalname,
        cloudinary_public_id: result.public_id,
        status:              'under_review',
        expiry_date:         expiry_date || null,
        version:             1,
      }).select().single();
      if (error) throw error;
      submission = data;

      await supabase.from('doc_submission_activity').insert({
        requirement_id: reqId, user_id: req.user.id, organization_id: oId,
        action: 'uploaded', details: `Uploaded "${requirement.name}"`, actor_id: req.user.id,
      });
    }

    // Notify HR admins
    supabase.from('users').select('id')
      .eq('organization_id', oId).in('role', ['admin', 'root_admin'])
      .then(({ data: admins }) => {
        if (!admins?.length) return;
        return supabase.from('notifications').insert(admins.map(a => ({
          user_id: a.id,
          title:   'Document Uploaded for Review',
          message: `${req.user.name} uploaded "${requirement.name}". Review in Verification Queue.`,
          type:    'document', organization_id: oId,
        })));
      }).catch(() => {});

    res.json(submission);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
