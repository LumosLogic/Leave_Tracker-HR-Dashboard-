const express    = require('express');
const router     = express.Router();
const { supabase } = require('../../config/db');
const { auth } = require('../../middleware/auth');
const { hasPermission } = require('../../middleware/permissions');
const cloudinary = require('cloudinary').v2;
const multer     = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// Enrich documents with owner (user_id) and uploader (uploaded_by) user info.
async function attachUserInfo(docs, oId) {
  if (!docs || !docs.length) return docs;
  const userIds = [...new Set([
    ...docs.map(d => d.user_id),
    ...docs.map(d => d.uploaded_by),
  ].filter(Boolean))];
  if (!userIds.length) return docs;
  const { data: users } = await supabase
    .from('users')
    .select('id, name, avatar_color')
    .in('id', userIds)
    .eq('organization_id', oId);
  const userMap = {};
  (users || []).forEach(u => { userMap[u.id] = u; });
  return docs.map(d => ({
    ...d,
    owner:    userMap[d.user_id]    || null,
    uploader: userMap[d.uploaded_by] || null,
  }));
}

// Fetch shares for a list of document IDs and attach them as document_shares array.
// Replaces the broken `document_shares(shared_with_user_id)` inline join — the
// pg-adapter inferred the wrong FK column (document_share_id vs document_id).
async function attachShares(docs, oId) {
  if (!docs || !docs.length) return docs;
  const ids = docs.map(d => d.id);
  const { data: shares } = await supabase
    .from('document_shares')
    .select('document_id, shared_with_user_id')
    .in('document_id', ids)
    .eq('organization_id', oId);
  const shareMap = {};
  (shares || []).forEach(s => {
    if (!shareMap[s.document_id]) shareMap[s.document_id] = [];
    shareMap[s.document_id].push({ shared_with_user_id: s.shared_with_user_id });
  });
  return docs.map(d => ({ ...d, document_shares: shareMap[d.id] || [] }));
}

// GET /api/documents/colleagues — lightweight employee list for sharing picker
router.get('/colleagues', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { data, error } = await supabase
      .from('users')
      .select('id, name, avatar_color, department')
      .eq('organization_id', oId)
      .eq('role', 'employee')
      .neq('id', req.user.id)
      .order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/documents
router.get('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { userId } = req.query;

    if (isAdmin(req.user.role)) {
      let query = supabase
        .from('employee_documents')
        .select('*')
        .eq('organization_id', oId)
        .order('created_at', { ascending: false });
      if (userId) query = query.eq('user_id', userId);
      const { data, error } = await query;
      if (error) throw error;
      const docs = await attachShares(data || [], oId);
      return res.json(await attachUserInfo(docs, oId));
    }

    // Employee: own docs + visibility='all' + specifically shared docs
    const myId = req.user.id;

    const { data: myShares } = await supabase
      .from('document_shares')
      .select('document_id')
      .eq('shared_with_user_id', myId)
      .eq('organization_id', oId);

    const sharedIds = (myShares || []).map(s => s.document_id);
    const orFilters = [`user_id.eq.${myId}`, 'visibility.eq.all'];
    if (sharedIds.length > 0) orFilters.push(`id.in.(${sharedIds.join(',')})`);

    const { data, error } = await supabase
      .from('employee_documents')
      .select('*')
      .eq('organization_id', oId)
      .neq('visibility', 'admin_only')
      .or(orFilters.join(','))
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(await attachShares(data || [], oId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/documents/upload
router.post('/upload', auth, hasPermission('documents', 'upload'), upload.single('file'), async (req, res) => {
  try {
    const oId = req.user.organization_id;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const allowedMIMEs = [
      'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    if (!allowedMIMEs.includes(req.file.mimetype))
      return res.status(400).json({ error: 'Invalid file type. Only PDF, Images, and Word documents are permitted.' });

    const { name, category, userId, expiry_date, visibility, shared_with } = req.body;
    const targetId = isAdmin(req.user.role) && userId ? Number(userId) : req.user.id;

    // Check for duplicate document (same name + category for same user)
    const { data: dupDoc } = await supabase.from('employee_documents')
      .select('id').eq('organization_id', oId).eq('user_id', targetId)
      .eq('name', name || req.file.originalname).eq('category', category || 'other').maybeSingle();
    if (dupDoc) {
      return res.status(409).json({ error: `A document named "${name || req.file.originalname}" in this category already exists for this employee. Please rename it or delete the existing document first.` });
    }

    // Resolve visibility
    let docVisibility = 'self';
    if (isAdmin(req.user.role)) {
      if (['self', 'all', 'specific', 'admin_only'].includes(visibility)) docVisibility = visibility;
    } else {
      docVisibility = visibility === 'specific' ? 'specific' : 'self';
    }

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: `hrms/${oId}/documents`, resource_type: 'auto' },
        (err, r) => err ? reject(err) : resolve(r)
      ).end(req.file.buffer);
    });

    const { data: doc, error } = await supabase.from('employee_documents').insert({
      user_id:         targetId,
      name:            name || req.file.originalname,
      category:        category || 'other',
      file_url:        result.secure_url,
      file_type:       req.file.mimetype,
      file_size:       req.file.size,
      expiry_date:     expiry_date || null,
      uploaded_by:     req.user.id,
      organization_id: oId,
      visibility:      docVisibility,
    }).select().single();
    if (error) throw error;

    // Notify HR admins when a non-admin employee uploads a document (pre-onboarding or regular)
    if (!isAdmin(req.user.role)) {
      supabase.from('users').select('id').eq('organization_id', oId).in('role', ['admin', 'root_admin'])
        .then(({ data: admins }) => {
          if (!admins?.length) return;
          return supabase.from('notifications').insert(admins.map(a => ({
            user_id: a.id,
            title:   'Employee Document Uploaded',
            message: `${req.user.name} uploaded "${doc.name}" (${doc.category}). Please review in the Documents section.`,
            type:    'document', organization_id: oId,
          })));
        }).catch(() => {});
    }

    // Insert shares for 'specific' visibility
    if (docVisibility === 'specific' && shared_with) {
      let userIds = [];
      try { userIds = JSON.parse(shared_with); } catch { userIds = []; }
      if (userIds.length > 0) {
        await supabase.from('document_shares').insert(
          userIds.map(uid => ({
            document_id:         doc.id,
            shared_with_user_id: Number(uid),
            organization_id:     oId,
          }))
        );
      }
    }

    res.json(doc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/documents/:id/shares — update visibility and shared recipients (admin only)
router.patch('/:id/shares', auth, hasPermission('documents', 'manage'), async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const oId = req.user.organization_id;
    const { visibility, shared_with } = req.body;

    if (!['self', 'all', 'specific', 'admin_only'].includes(visibility))
      return res.status(400).json({ error: 'Invalid visibility value' });

    const { error: upErr } = await supabase.from('employee_documents')
      .update({ visibility })
      .eq('id', req.params.id)
      .eq('organization_id', oId);
    if (upErr) throw upErr;

    // Replace all existing shares
    await supabase.from('document_shares').delete().eq('document_id', Number(req.params.id));

    if (visibility === 'specific' && Array.isArray(shared_with) && shared_with.length > 0) {
      await supabase.from('document_shares').insert(
        shared_with.map(uid => ({
          document_id:         Number(req.params.id),
          shared_with_user_id: Number(uid),
          organization_id:     oId,
        }))
      );
    }

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/documents/:id/status — admin only
router.patch('/:id/status', auth, hasPermission('documents', 'manage'), async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const { status } = req.body;
    if (!['pending_review', 'verified', 'rejected'].includes(status))
      return res.status(400).json({ error: 'Invalid status' });
    const { data, error } = await supabase.from('employee_documents')
      .update({ status })
      .eq('id', req.params.id)
      .eq('organization_id', req.user.organization_id)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/documents/:id — edit metadata, visibility/shares, and optionally replace the file
router.patch('/:id', auth, upload.single('file'), async (req, res) => {
  try {
    const oId = req.user.organization_id;

    const { data: doc } = await supabase.from('employee_documents')
      .select('*').eq('id', req.params.id).eq('organization_id', oId).single();
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    if (!isAdmin(req.user.role) && doc.user_id !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });

    const { name, category, expiry_date, visibility, shared_with, targetUserId } = req.body;

    // Resolve visibility (employees can only use self/specific)
    let newVisibility = doc.visibility || 'self';
    if (isAdmin(req.user.role)) {
      if (['self', 'all', 'specific', 'admin_only'].includes(visibility)) newVisibility = visibility;
    } else {
      if (['self', 'specific'].includes(visibility)) newVisibility = visibility;
    }

    const updates = {
      name:        name        || doc.name,
      category:    category    || doc.category,
      expiry_date: expiry_date !== undefined ? (expiry_date || null) : doc.expiry_date,
      visibility:  newVisibility,
    };

    // Admin can re-assign the target employee for 'self' visibility
    if (isAdmin(req.user.role) && newVisibility === 'self' && targetUserId) {
      updates.user_id = Number(targetUserId);
    }

    // ── File replacement ────────────────────────────────────────────────────────
    if (req.file) {
      const allowedMIMEs = [
        'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      if (!allowedMIMEs.includes(req.file.mimetype))
        return res.status(400).json({ error: 'Invalid file type.' });

      // Delete old file from Cloudinary
      const oldPublicId = doc.file_url.split('/').slice(-2).join('/').replace(/\.[^.]+$/, '');
      try { await cloudinary.uploader.destroy(oldPublicId); } catch { /* already gone */ }

      // Upload new file
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { folder: `hrms/${oId}/documents`, resource_type: 'auto' },
          (err, r) => err ? reject(err) : resolve(r)
        ).end(req.file.buffer);
      });

      updates.file_url  = result.secure_url;
      updates.file_type = req.file.mimetype;
      updates.file_size = req.file.size;
    }

    // ── Update document row ─────────────────────────────────────────────────────
    const { data: updated, error } = await supabase.from('employee_documents')
      .update(updates)
      .eq('id', req.params.id)
      .eq('organization_id', oId)
      .select().single();
    if (error) throw error;

    // ── Update shares when visibility changed ───────────────────────────────────
    if (newVisibility === 'specific' || doc.visibility === 'specific') {
      await supabase.from('document_shares').delete().eq('document_id', Number(req.params.id));

      if (newVisibility === 'specific' && shared_with) {
        let userIds = [];
        try { userIds = JSON.parse(shared_with); } catch { userIds = []; }
        if (userIds.length > 0) {
          await supabase.from('document_shares').insert(
            userIds.map(uid => ({
              document_id:         Number(req.params.id),
              shared_with_user_id: Number(uid),
              organization_id:     oId,
            }))
          );
        }
      }
    }

    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/documents/:id/request-delete — HR admin requests Root Admin to delete a document
router.post('/:id/request-delete', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;

    // Only HR admin (admin role, NOT root_admin) can use this endpoint
    if (!isAdmin(req.user.role))
      return res.status(403).json({ error: 'Forbidden' });
    if (req.user.role === 'root_admin')
      return res.status(400).json({ error: 'Root Admin can delete directly. Use the delete action instead.' });

    const { data: doc } = await supabase.from('employee_documents')
      .select('id, name, category')
      .eq('id', req.params.id)
      .eq('organization_id', oId)
      .single();
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    const { reason } = req.body;
    if (!reason?.trim())
      return res.status(400).json({ error: 'Reason is required for a deletion request.' });

    // Notify all root_admins in the org
    const { data: rootAdmins } = await supabase.from('users')
      .select('id')
      .eq('organization_id', oId)
      .eq('role', 'root_admin');

    if (rootAdmins?.length) {
      await supabase.from('notifications').insert(
        rootAdmins.map(a => ({
          user_id:         a.id,
          title:           'Document Deletion Request',
          message:         `HR ${req.user.name} requested deletion of document "${doc.name}". Reason: ${reason.trim()}`,
          type:            'document',
          organization_id: oId,
        }))
      );
    }

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/documents/:id — only root_admin can delete shared docs (with mandatory reason)
router.delete('/:id', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { data: doc } = await supabase.from('employee_documents')
      .select('*').eq('id', req.params.id).eq('organization_id', oId).single();
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // HR Admin cannot delete — only Root Admin allowed
    if (isAdmin(req.user.role) && req.user.role !== 'root_admin')
      return res.status(403).json({ error: 'Only Root Admin can delete documents. HR Admin can view, download, approve, reject, or request re-upload.' });

    // Non-admins can only delete their own (no UI, kept for API compatibility)
    if (!isAdmin(req.user.role) && doc.user_id !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });

    const { reason } = req.body;
    if (isAdmin(req.user.role) && !reason?.trim())
      return res.status(400).json({ error: 'Deletion reason is required.' });

    const publicId = doc.file_url.split('/').slice(-2).join('/').replace(/\.[^.]+$/, '');
    try { await cloudinary.uploader.destroy(publicId); } catch { /* already gone */ }

    // Delete dependent rows first to avoid FK constraint violations
    await supabase.from('document_shares').delete().eq('document_id', req.params.id);

    const { error } = await supabase.from('employee_documents').delete().eq('id', req.params.id);
    if (error) throw error;

    // Audit log — notify all admins of deletion with reason
    if (reason?.trim()) {
      supabase.from('users').select('id').eq('organization_id', oId).in('role', ['admin', 'root_admin'])
        .then(({ data: admins }) => {
          if (!admins?.length) return;
          return supabase.from('notifications').insert(admins.map(a => ({
            user_id:         a.id,
            title:           'Document Deleted',
            message:         `Document "${doc.name}" was deleted by ${req.user.name}. Reason: ${reason.trim()}`,
            type:            'document',
            organization_id: oId,
          })));
        }).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
