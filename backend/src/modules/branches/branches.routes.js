const express = require('express');
const router  = express.Router();
const { pool } = require('../../config/db-pg-adapter');
const { auth, adminOnly } = require('../../middleware/auth');

// GET /api/branches
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM branches WHERE org_id = $1 ORDER BY name`,
      [req.user.organization_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/branches
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, code, location, address, is_active } = req.body;
    if (!name) return res.status(400).json({ error: 'Branch name is required' });
    const result = await pool.query(
      `INSERT INTO branches (org_id, name, code, location, address, is_active)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.organization_id, name, code || null, location || null,
       address || null, is_active !== false]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/branches/:id
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, code, location, address, is_active } = req.body;
    const result = await pool.query(
      `UPDATE branches SET name=$1, code=$2, location=$3, address=$4, is_active=$5
       WHERE id=$6 AND org_id=$7 RETURNING *`,
      [name, code || null, location || null, address || null,
       is_active !== false, req.params.id, req.user.organization_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Branch not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/branches/:id
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const empCheck = await pool.query(
      `SELECT id FROM users WHERE branch_id=$1 AND organization_id=$2 LIMIT 1`,
      [req.params.id, req.user.organization_id]
    );
    if (empCheck.rows.length) {
      return res.status(400).json({ error: 'Cannot delete: employees are assigned to this branch' });
    }
    const result = await pool.query(
      `DELETE FROM branches WHERE id=$1 AND org_id=$2 RETURNING id`,
      [req.params.id, req.user.organization_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Branch not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
