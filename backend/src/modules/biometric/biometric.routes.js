const express = require('express');
const router  = express.Router();
const { pool } = require('../../config/db-pg-adapter');
const { auth, adminOnly } = require('../../middleware/auth');

// ─── GET /api/biometric/devices ───────────────────────────────────────────────
router.get('/devices', auth, adminOnly, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT d.*, b.name AS branch_name
       FROM biometric_devices d
       LEFT JOIN branches b ON b.id = d.branch_id
       WHERE d.org_id = $1
       ORDER BY d.device_name`,
      [orgId]
    );
    const now = Date.now();
    const devices = result.rows.map(d => ({
      ...d,
      online: d.last_seen
        ? (now - new Date(d.last_seen).getTime()) < 5 * 60 * 1000
        : false,
    }));
    res.json(devices);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/biometric/devices ─────────────────────────────────────────────
router.post('/devices', auth, adminOnly, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { device_name, serial_number, location, branch_id, area_code, device_ip } = req.body;
    if (!serial_number) return res.status(400).json({ error: 'serial_number is required' });

    const result = await pool.query(
      `INSERT INTO biometric_devices
         (org_id, serial_number, device_name, location, branch_id, area_code, device_ip, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'offline')
       RETURNING *`,
      [orgId, serial_number, device_name || null, location || null,
       branch_id || null, area_code || null, device_ip || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A device with this serial number already exists' });
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/biometric/devices/:id ──────────────────────────────────────────
router.put('/devices/:id', auth, adminOnly, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { device_name, location, branch_id, area_code, device_ip } = req.body;
    const result = await pool.query(
      `UPDATE biometric_devices
       SET device_name = $1, location = $2, branch_id = $3, area_code = $4, device_ip = $5
       WHERE id = $6 AND org_id = $7
       RETURNING *`,
      [device_name || null, location || null, branch_id || null,
       area_code || null, device_ip || null, req.params.id, orgId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Device not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/biometric/logs ──────────────────────────────────────────────────
router.get('/logs', auth, adminOnly, async (req, res) => {
  try {
    const orgId  = req.user.organization_id;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(200, parseInt(req.query.limit) || 50);
    const offset = (page - 1) * limit;

    // Build filter conditions with a shared params array (only filter values, no limit/offset)
    const filterParams = [orgId];
    let where = 'WHERE l.org_id = $1';
    let idx = 2;

    if (req.query.device_serial) {
      where += ` AND l.device_serial = $${idx++}`;
      filterParams.push(req.query.device_serial);
    }
    if (req.query.employee_pin) {
      where += ` AND l.employee_pin = $${idx++}`;
      filterParams.push(req.query.employee_pin);
    }
    if (req.query.processed !== undefined && req.query.processed !== '') {
      where += ` AND l.processed = $${idx++}`;
      filterParams.push(req.query.processed === 'true');
    }
    if (req.query.date_from) {
      where += ` AND l.punch_time >= $${idx++}`;
      filterParams.push(req.query.date_from);
    }
    if (req.query.date_to) {
      where += ` AND l.punch_time <= $${idx++}`;
      filterParams.push(req.query.date_to + ' 23:59:59');
    }

    const [result, countRes] = await Promise.all([
      pool.query(
        `SELECT l.*, u.name AS employee_name
         FROM biometric_raw_logs l
         LEFT JOIN biometric_employee_map m ON m.org_id = l.org_id AND m.employee_pin = l.employee_pin
         LEFT JOIN users u ON u.id = m.user_id
         ${where}
         ORDER BY l.punch_time DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...filterParams, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*) FROM biometric_raw_logs l ${where}`,
        filterParams
      ),
    ]);

    res.json({
      data: result.rows,
      page,
      limit,
      total: parseInt(countRes.rows[0].count, 10),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/biometric/employee-map ─────────────────────────────────────────
router.get('/employee-map', auth, adminOnly, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT m.id, m.employee_pin, m.user_id, m.created_at,
              u.name AS employee_name, u.department, u.device_enrollment_id
       FROM biometric_employee_map m
       JOIN users u ON u.id = m.user_id
       WHERE m.org_id = $1
       ORDER BY m.employee_pin::int NULLS LAST`,
      [orgId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/biometric/employee-map ────────────────────────────────────────
router.post('/employee-map', auth, adminOnly, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { employee_pin, user_id } = req.body;
    if (!employee_pin || !user_id) {
      return res.status(400).json({ error: 'employee_pin and user_id are required' });
    }
    const result = await pool.query(
      `INSERT INTO biometric_employee_map (org_id, employee_pin, user_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [orgId, String(employee_pin), user_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This PIN is already mapped to an employee' });
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/biometric/employee-map/:id ──────────────────────────────────
router.delete('/employee-map/:id', auth, adminOnly, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `DELETE FROM biometric_employee_map WHERE id = $1 AND org_id = $2 RETURNING id`,
      [req.params.id, orgId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Mapping not found' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/biometric/reprocess ───────────────────────────────────────────
router.post('/reprocess', auth, adminOnly, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { employee_pin } = req.body;
    if (!employee_pin) return res.status(400).json({ error: 'employee_pin is required' });

    const mapRes = await pool.query(
      `SELECT user_id FROM biometric_employee_map WHERE org_id = $1 AND employee_pin = $2 LIMIT 1`,
      [orgId, String(employee_pin)]
    );
    if (!mapRes.rows.length) {
      return res.status(404).json({ error: 'No employee mapping found for this PIN' });
    }
    const userId = mapRes.rows[0].user_id;

    const logsRes = await pool.query(
      `SELECT * FROM biometric_raw_logs
       WHERE org_id = $1 AND employee_pin = $2 AND processed = false
       ORDER BY punch_time`,
      [orgId, String(employee_pin)]
    );

    let processed = 0;
    for (const log of logsRes.rows) {
      const punchDate    = new Date(log.punch_time).toISOString().slice(0, 10);
      const punchTimeStr = new Date(log.punch_time).toTimeString().slice(0, 8);

      const attRes = await pool.query(
        `SELECT id, status, check_in FROM attendance
         WHERE user_id = $1 AND date = $2 LIMIT 1`,
        [userId, punchDate]
      );
      const att = attRes.rows[0] || null;

      if (att && ['on_leave', 'half_day', 'wfh'].includes(att.status)) {
        await pool.query(`UPDATE biometric_raw_logs SET processed = true WHERE id = $1`, [log.id]);
        processed++;
        continue;
      }

      if (log.punch_type === 0 || log.punch_type === '0') {
        if (!att) {
          await pool.query(
            `INSERT INTO attendance (user_id, date, check_in, status, source, organization_id)
             VALUES ($1, $2, $3, 'present', 'biometric', $4)
             ON CONFLICT (user_id, date, organization_id) DO NOTHING`,
            [userId, punchDate, punchTimeStr, orgId]
          );
        }
      } else if (log.punch_type === 1 || log.punch_type === '1') {
        if (att && att.check_in) {
          const checkInMs  = new Date(`${punchDate}T${att.check_in}`).getTime();
          const checkOutMs = new Date(log.punch_time).getTime();
          const workHours  = parseFloat(((checkOutMs - checkInMs) / 3600000).toFixed(2));
          await pool.query(
            `UPDATE attendance SET check_out = $1, work_hours = $2, source = 'biometric' WHERE id = $3`,
            [punchTimeStr, workHours, att.id]
          );
        }
      }

      await pool.query(`UPDATE biometric_raw_logs SET processed = true WHERE id = $1`, [log.id]);
      processed++;
    }

    res.json({ ok: true, processed, total: logsRes.rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
