const express = require('express');
const router  = express.Router();
const { db, pool } = require('../../config/db');
const { auth } = require('../../middleware/auth');
const { hasPermission } = require('../../middleware/permissions');

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// GET /api/regularization
router.get('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const uid = req.user.id;
    let q = db.from('attendance_regularization')
      .select('*')
      .eq('organization_id', oId)
      .order('created_at', { ascending: false });
    if (!isAdmin(req.user.role)) q = q.eq('user_id', uid);
    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    if (rows.length === 0) return res.json([]);

    // Fetch user names separately
    const userIds     = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
    const reviewerIds = [...new Set(rows.map(r => r.reviewed_by).filter(Boolean))];
    const allIds      = [...new Set([...userIds, ...reviewerIds])];

    const { data: users } = await db.from('users')
      .select('id, name, avatar_color, department, position')
      .in('id', allIds);
    const userMap = {};
    (users || []).forEach(u => { userMap[u.id] = u; });

    res.json(rows.map(r => ({
      ...r,
      user_name:          userMap[r.user_id]?.name || '',
      user_avatar_color:  userMap[r.user_id]?.avatar_color || '',
      user_department:    userMap[r.user_id]?.department || '',
      user_position:      userMap[r.user_id]?.position || '',
      reviewer_name:      userMap[r.reviewed_by]?.name || '',
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/regularization
router.post('/', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { date, requested_check_in, requested_check_out, reason } = req.body;
    if (!date || !reason) return res.status(400).json({ error: 'date and reason are required' });
    const { data, error } = await db.from('attendance_regularization')
      .insert({ user_id: req.user.id, date, requested_check_in: requested_check_in || null, requested_check_out: requested_check_out || null, reason, organization_id: oId })
      .select().single();
    if (error) {
      if (error.code === '23505' || (error.message && error.message.includes('unique constraint'))) {
        return res.status(409).json({ error: 'You already have a pending request for this date. Please wait for it to be reviewed before submitting another.' });
      }
      throw error;
    }

    // Notify admins
    const { data: admins } = await db.from('users')
      .select('id').eq('organization_id', oId).in('role', ['admin', 'root_admin']);
    if (admins?.length) {
      await db.from('notifications').insert(admins.map(a => ({
        user_id: a.id,
        title: 'Regularization Request',
        message: `${req.user.name} requested attendance correction for ${date}`,
        type: 'regularization',
        organization_id: oId,
      })));
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/regularization/:id/review
router.put('/:id/review', auth, hasPermission('attendance', 'approve_regularization'), async (req, res) => {
  if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
  const oId = req.user.organization_id;
  const { status, reviewer_notes } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  // All writes inside a single transaction with SELECT FOR UPDATE to prevent
  // concurrent double-approval of the same regularization request.
  const client = await pool.connect();
  let finalReg;
  try {
    await client.query('BEGIN');

    // Lock the row — any concurrent review of the same request blocks until COMMIT/ROLLBACK
    const lockRes = await client.query(
      `SELECT * FROM attendance_regularization
       WHERE id = $1 AND organization_id = $2
       FOR UPDATE`,
      [req.params.id, oId]
    );
    if (!lockRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Request not found' });
    }
    const reg = lockRes.rows[0];

    // Idempotency guard — prevent double-approval
    if (reg.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `Request already ${reg.status}. No changes made.`,
        current_status: reg.status,
      });
    }

    // 1. Update regularization status
    const reviewedAt = new Date().toISOString();
    const updRes = await client.query(
      `UPDATE attendance_regularization
       SET status = $1, reviewer_notes = $2, reviewed_by = $3, reviewed_at = $4
       WHERE id = $5
       RETURNING *`,
      [status, reviewer_notes || '', req.user.id, reviewedAt, req.params.id]
    );
    finalReg = updRes.rows[0];

    if (status === 'approved') {
      // 2. Fetch existing attendance (inside transaction so we see latest state)
      const attRes = await client.query(
        `SELECT * FROM attendance
         WHERE user_id = $1 AND date = $2 AND organization_id = $3`,
        [reg.user_id, reg.date, oId]
      );
      const existingAtt = attRes.rows[0] || null;

      const final_check_in  = reg.requested_check_in  || existingAtt?.check_in  || null;
      const final_check_out = reg.requested_check_out || existingAtt?.check_out || null;

      let gross_hours = existingAtt?.gross_hours || 0;
      let work_hours  = existingAtt?.work_hours  || 0;
      if (final_check_in && final_check_out) {
        const [h1, m1] = final_check_in.split(':').map(Number);
        const [h2, m2] = final_check_out.split(':').map(Number);
        const totalMins   = (h2 * 60 + m2) - (h1 * 60 + m1);
        const breakMins   = existingAtt?.total_break_minutes || 0;
        const effectiveMins = Math.max(0, totalMins - breakMins);
        gross_hours = totalMins   > 0 ? Math.round((totalMins    / 60) * 100) / 100 : 0;
        work_hours  = effectiveMins > 0 ? Math.round((effectiveMins / 60) * 100) / 100 : 0;
      }

      // 3. Upsert attendance record
      if (existingAtt) {
        await client.query(
          `UPDATE attendance
           SET check_in = $1, check_out = $2, work_hours = $3, gross_hours = $4, status = 'present'
           WHERE user_id = $5 AND date = $6 AND organization_id = $7`,
          [final_check_in, final_check_out, work_hours, gross_hours, reg.user_id, reg.date, oId]
        );
      } else {
        await client.query(
          `INSERT INTO attendance (user_id, date, check_in, check_out, work_hours, gross_hours, status, organization_id)
           VALUES ($1,$2,$3,$4,$5,$6,'present',$7)
           ON CONFLICT (user_id, date, organization_id) DO UPDATE
             SET check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out,
                 work_hours = EXCLUDED.work_hours, gross_hours = EXCLUDED.gross_hours, status = 'present'`,
          [reg.user_id, reg.date, final_check_in, final_check_out, work_hours, gross_hours, oId]
        );
      }

      // 4. Cancel any approved leaves overlapping this date (balance recalculates automatically)
      await client.query(
        `UPDATE leaves SET status = 'cancelled'
         WHERE user_id = $1 AND organization_id = $2 AND status = 'approved'
           AND start_date <= $3 AND end_date >= $3`,
        [reg.user_id, oId, reg.date]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Review failed — no changes saved. ' + err.message });
  } finally {
    client.release();
  }

  // Fire-and-forget notification (after COMMIT — failure doesn't affect data)
  db.from('notifications').insert({
    user_id: finalReg.user_id,
    title:   `Regularization ${status === 'approved' ? 'Approved' : 'Rejected'}`,
    message: `Your attendance correction for ${finalReg.date} was ${status}.${reviewer_notes ? ` Note: ${reviewer_notes}` : ''}`,
    type:    'regularization',
    organization_id: oId,
  }).then(() => {});

  res.json(finalReg);
});

// DELETE /api/regularization/:id — root_admin or admin can delete pending; root_admin can delete any
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    const oId = req.user.organization_id;

    const { data: reg } = await db.from('attendance_regularization')
      .select('id, status').eq('id', req.params.id).eq('organization_id', oId).maybeSingle();
    if (!reg) return res.status(404).json({ error: 'Request not found' });

    // HR admin can only delete pending; root admin can delete any
    if (req.user.role === 'admin' && reg.status !== 'pending') {
      return res.status(403).json({ error: 'HR admin can only delete pending requests' });
    }

    const { error } = await db.from('attendance_regularization')
      .delete().eq('id', req.params.id).eq('organization_id', oId);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
