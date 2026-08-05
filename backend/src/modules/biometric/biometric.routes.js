const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const { pool } = require('../../config/db-pg-adapter');
const { auth, adminOnly } = require('../../middleware/auth');
const { invalidateBiometricIpCache } = require('../../middleware/biometricIpGuard');
const { scheduleSyncForSn } = require('./biometricHeartbeat.handler');
const { processAttlogLine } = require('./biometricPush.handler');
const biometricEmitter = require('../../utils/biometricEmitter');
const { reprocessPin } = require('./biometricReprocess.util');
const { importEasyWDMS } = require('./biometricEasyWDMSImport.handler');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(xlsx|xls|csv|tsv|txt)$/i;
    cb(null, allowed.test(file.originalname));
  },
});

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
    invalidateBiometricIpCache(); // new device IP must take effect immediately
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
    invalidateBiometricIpCache(); // IP change must take effect immediately
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DELETE /api/biometric/devices/:id ───────────────────────────────────────
router.delete('/devices/:id', auth, adminOnly, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `DELETE FROM biometric_devices WHERE id = $1 AND org_id = $2 RETURNING id, device_name`,
      [req.params.id, orgId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Device not found' });
    invalidateBiometricIpCache();
    res.json({ ok: true, deleted: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/biometric/live-logs ─────────────────────────────────────────────
router.get('/live-logs', auth, adminOnly, async (req, res) => {
  const orgId = req.user.organization_id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Load allowed SNs for this organization
  let allowedSns = new Set();
  try {
    const devRes = await pool.query(`SELECT serial_number FROM biometric_devices WHERE org_id = $1`, [orgId]);
    devRes.rows.forEach(d => { if (d.serial_number) allowedSns.add(d.serial_number); });
  } catch (err) {
    console.error('[biometric] SSE DB error:', err);
  }

  const logListener = (data) => {
    // Only send logs if they belong to this org's devices
    if (!data.sn || allowedSns.has(data.sn)) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  biometricEmitter.on('log', logListener);

  const keepAlive = setInterval(() => {
    res.write(':\n\n');
  }, 15000);

  req.on('close', () => {
    biometricEmitter.off('log', logListener);
    clearInterval(keepAlive);
  });
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

// ─── POST /api/biometric/devices/:id/force-sync ──────────────────────────────
// Schedules a C:DATA UPDATE command for the device's next heartbeat,
// forcing it to re-upload all stored attendance records.
router.post('/devices/:id/force-sync', auth, adminOnly, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const devRes = await pool.query(
      `SELECT serial_number, device_name FROM biometric_devices WHERE id = $1 AND org_id = $2`,
      [req.params.id, orgId]
    );
    if (!devRes.rows.length) return res.status(404).json({ error: 'Device not found' });
    const { serial_number, device_name } = devRes.rows[0];
    scheduleSyncForSn(serial_number);
    res.json({ ok: true, message: `Force-sync scheduled for ${device_name} (${serial_number}). Will trigger on next heartbeat (~60s).` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/biometric/reprocess ───────────────────────────────────────────
router.post('/reprocess', auth, adminOnly, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { employee_pin } = req.body;
    if (!employee_pin) return res.status(400).json({ error: 'employee_pin is required' });

    const result = await reprocessPin(orgId, employee_pin);
    if (result.noMapping) return res.status(404).json({ error: 'No employee mapping found for this PIN' });
    res.json({ ok: true, processed: result.processed, total: result.total });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/biometric/collector-push ──────────────────────────────────────
// Authenticated bulk-import from the EasyWDMS collector agent running on the
// client's Windows machine. Uses a static API key — no JWT (service account).
//
// Body: { device_serial: "BYEL194660080", punches: [{ employee_pin, punch_time, punch_type }] }
router.post('/collector-push', async (req, res) => {
  try {
    // ── API key auth ──────────────────────────────────────────────────────────
    const key = req.headers['x-collector-key'];
    if (!key || key !== process.env.BIOMETRIC_COLLECTOR_KEY) {
      return res.status(401).json({ error: 'Invalid or missing collector API key' });
    }
    if (!process.env.BIOMETRIC_COLLECTOR_KEY) {
      return res.status(503).json({ error: 'BIOMETRIC_COLLECTOR_KEY not configured on server' });
    }

    const { device_serial, punches } = req.body;
    if (!device_serial || typeof device_serial !== 'string')
      return res.status(400).json({ error: 'device_serial is required' });
    if (!Array.isArray(punches) || punches.length === 0)
      return res.status(400).json({ error: 'punches must be a non-empty array' });
    if (punches.length > 5000)
      return res.status(400).json({ error: 'Max 5000 punches per request' });

    // ── Look up device ────────────────────────────────────────────────────────
    const devRes = await pool.query(
      'SELECT id, org_id FROM biometric_devices WHERE serial_number = $1 LIMIT 1',
      [device_serial.trim()]
    );
    if (!devRes.rows.length)
      return res.status(404).json({ error: `Device ${device_serial} not registered in HRMS` });

    const { id: deviceId, org_id: orgId } = devRes.rows[0];

    // Mark device online
    await pool.query(
      `UPDATE biometric_devices SET last_seen = NOW(), status = 'online' WHERE id = $1`,
      [deviceId]
    );

    // ── Process each punch ────────────────────────────────────────────────────
    let imported = 0;
    let skipped  = 0;
    const errors = [];

    for (const punch of punches) {
      const { employee_pin, punch_time, punch_type } = punch;

      if (!employee_pin || !punch_time) { skipped++; continue; }

      const pt = new Date(punch_time);
      if (isNaN(pt.getTime())) { skipped++; continue; }

      // Hard cutoff: Strictly ignore any punches before August 1st, 2026 (Go-Live Date)
      if (pt < new Date('2026-08-01T00:00:00+05:30')) { 
        skipped++; 
        continue; 
      }

      // Format as ATTLOG line (PIN\tTime\tType) — same format the device uses
      const punchTypeInt = parseInt(punch_type ?? 0, 10);
      const timeStr      = pt.toISOString().replace('T', ' ').slice(0, 19); // "YYYY-MM-DD HH:MM:SS"
      const attlogLine   = `${String(employee_pin).trim()}\t${timeStr}\t${punchTypeInt}`;

      try {
        await processAttlogLine(attlogLine, orgId, device_serial.trim());
        imported++;
      } catch (err) {
        skipped++;
        if (errors.length < 5) errors.push(`PIN ${employee_pin}: ${err.message}`);
      }
    }

    const msg = `[collector] ${device_serial}: imported ${imported}, skipped ${skipped} of ${punches.length}`;
    console.log(msg);
    biometricEmitter.emit('log', { sn: device_serial, message: msg, timestamp: new Date().toISOString() });

    res.json({ ok: true, imported, skipped, total: punches.length, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/biometric/collector-ping ──────────────────────────────────────
// Called by the collector every poll cycle (even when no new records exist) to
// keep the device's last_seen timestamp fresh so the UI shows it as online.
router.post('/collector-ping', async (req, res) => {
  try {
    const key = req.headers['x-collector-key'];
    if (!key || key !== process.env.BIOMETRIC_COLLECTOR_KEY) {
      return res.status(401).json({ error: 'Invalid or missing collector API key' });
    }

    const { device_serial } = req.body;
    if (!device_serial || typeof device_serial !== 'string')
      return res.status(400).json({ error: 'device_serial is required' });

    const result = await pool.query(
      `UPDATE biometric_devices SET last_seen = NOW(), status = 'online'
       WHERE serial_number = $1 RETURNING id`,
      [device_serial.trim()]
    );
    if (!result.rows.length)
      return res.status(404).json({ error: `Device ${device_serial} not registered in HRMS` });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/biometric/bulk-import ─────────────────────────────────────────
// One-time or scheduled historical data import. Accepts raw EasyWDMS records
// (same schema as att_attlog) and processes them exactly like collector-push.
//
// Body: {
//   records: [{ employee_pin, punch_time, punch_type, device_serial }],
//   dry_run: false   // if true, validates without writing
// }
//
// Auth: same x-collector-key as collector-push (no JWT needed — runs server-to-server)
router.post('/bulk-import', async (req, res) => {
  try {
    const key = req.headers['x-collector-key'];
    if (!key || key !== process.env.BIOMETRIC_COLLECTOR_KEY) {
      return res.status(401).json({ error: 'Invalid or missing collector API key' });
    }

    const { records, dry_run = false } = req.body;
    if (!Array.isArray(records) || !records.length)
      return res.status(400).json({ error: 'records must be a non-empty array' });
    if (records.length > 50000)
      return res.status(400).json({ error: 'Max 50000 records per request' });

    // Group by device_serial
    const byDevice = {};
    let skippedValidation = 0;
    for (const r of records) {
      const sn  = (r.device_serial || '').trim();
      const pin = (r.employee_pin  || '').trim();
      if (!sn || !pin || !r.punch_time) { skippedValidation++; continue; }
      if (!byDevice[sn]) byDevice[sn] = [];
      byDevice[sn].push({ employee_pin: pin, punch_time: r.punch_time, punch_type: parseInt(r.punch_type ?? 0, 10) });
    }

    if (dry_run) {
      return res.json({
        ok: true,
        dry_run: true,
        devices: Object.keys(byDevice),
        valid: records.length - skippedValidation,
        skipped_validation: skippedValidation,
        total: records.length,
      });
    }

    let totalImported = 0;
    let totalSkipped  = 0;
    const errors      = [];

    for (const [sn, punches] of Object.entries(byDevice)) {
      const devRes = await pool.query(
        'SELECT id, org_id FROM biometric_devices WHERE serial_number = $1 LIMIT 1',
        [sn]
      );
      if (!devRes.rows.length) {
        errors.push(`Device ${sn} not registered — skipped ${punches.length} records`);
        totalSkipped += punches.length;
        continue;
      }
      const { org_id: orgId } = devRes.rows[0];

      for (const punch of punches) {
        const pt = new Date(punch.punch_time);
        if (isNaN(pt.getTime())) { totalSkipped++; continue; }
        if (pt < new Date('2026-08-01T00:00:00+05:30')) { totalSkipped++; continue; }

        const timeStr    = pt.toISOString().replace('T', ' ').slice(0, 19);
        const attlogLine = `${punch.employee_pin}\t${timeStr}\t${punch.punch_type}`;
        try {
          await processAttlogLine(attlogLine, orgId, sn);
          totalImported++;
        } catch (err) {
          totalSkipped++;
          if (errors.length < 10) errors.push(`PIN ${punch.employee_pin}: ${err.message}`);
        }
      }

      // Mark device online after any data from it
      await pool.query(
        `UPDATE biometric_devices SET last_seen = NOW(), status = 'online' WHERE serial_number = $1`,
        [sn]
      );
    }

    console.log(`[bulk-import] imported=${totalImported} skipped=${totalSkipped} of ${records.length}`);
    res.json({ ok: true, imported: totalImported, skipped: totalSkipped, total: records.length, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/biometric/import-easywdms ─────────────────────────────────────
// Upload an EasyWDMS Transaction Report file (.xlsx/.xls/.csv/.tsv/.txt).
// Parses, inserts historical raw logs (bypassing go-live cutoff), auto-reprocesses.
router.post('/import-easywdms', auth, adminOnly, upload.single('file'), importEasyWDMS);

// ─── GET /api/biometric/import-batches ───────────────────────────────────────
router.get('/import-batches', auth, adminOnly, async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const result = await pool.query(
      `SELECT b.*, u.name AS imported_by_name
       FROM biometric_import_batches b
       LEFT JOIN users u ON u.id = b.imported_by
       WHERE b.org_id = $1
       ORDER BY b.created_at DESC
       LIMIT 50`,
      [orgId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DELETE /api/biometric/import-batches/:id ────────────────────────────────
// Rollback: deletes raw logs for this batch and marks the batch rolled_back.
// Attendance records already created are left in place (admin must fix manually).
router.delete('/import-batches/:id', auth, adminOnly, async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const batchRes = await pool.query(
      `SELECT * FROM biometric_import_batches WHERE id = $1 AND org_id = $2 LIMIT 1`,
      [req.params.id, orgId]
    );
    if (!batchRes.rows.length) return res.status(404).json({ error: 'Batch not found' });
    if (batchRes.rows[0].status === 'rolled_back') {
      return res.status(409).json({ error: 'Batch already rolled back' });
    }

    const deleted = await pool.query(
      `DELETE FROM biometric_raw_logs
       WHERE import_batch_id = $1 AND org_id = $2
       RETURNING id`,
      [req.params.id, orgId]
    );

    await pool.query(
      `UPDATE biometric_import_batches SET status = 'rolled_back' WHERE id = $1`,
      [req.params.id]
    );

    console.log(`[import-rollback] batch=${req.params.id} deleted ${deleted.rowCount} raw logs`);
    res.json({ ok: true, deleted_logs: deleted.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
