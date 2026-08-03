/**
 * biometricPush.handler.js
 * ADMS receiver for ZKTeco devices — POST /iclock/cdata
 *
 * ZKTeco sends application/x-www-form-urlencoded:
 *   SN=<serial>  table=ATTLOG  + body lines:
 *   PIN\tTime\tStatus\tVerify\tWorkCode\tReserved
 *   e.g.: 431\t2026-07-08 09:14:23\t0\t1\t0\t0
 *
 * Rules:
 *  - Respond 'OK' immediately (device requires < 2 s)
 *  - setImmediate for all async processing
 *  - Use pool.query() directly (precise ON CONFLICT control)
 */

const { pool } = require('../../config/db-pg-adapter');
const biometricEmitter = require('../../utils/biometricEmitter');

module.exports = async function biometricPushHandler(req, res) {
  // Always respond immediately — ZKTeco requires response within 2s
  res.send('OK');

  const sn    = req.query.SN    || (typeof req.body === 'object' ? req.body.SN : null);
  const table = req.query.table || (typeof req.body === 'object' ? req.body.table : null);

  if (!sn) return;
  if (table && table !== 'ATTLOG') return;

  const rawLines = extractAttlogLines(req.body, req.query);

  const msg = `[biometric] SN=${sn} received ${rawLines.length} ATTLOG lines`;
  console.log(msg);
  biometricEmitter.emit('log', { sn, message: msg, timestamp: new Date().toISOString() });

  if (!rawLines.length) {
    const debugBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const debugMsg = `[biometric] REJECTED/EMPTY PAYLOAD SN=${sn}: ${debugBody}`;
    console.log(debugMsg);
    biometricEmitter.emit('log', { sn, message: debugMsg, timestamp: new Date().toISOString() });
    return;
  }

  setImmediate(async () => {
    try {
      // 1. Look up device by serial number
      const devRes = await pool.query(
        'SELECT id, org_id FROM biometric_devices WHERE serial_number = $1 LIMIT 1',
        [sn]
      );
      if (!devRes.rows.length) {
        console.warn(`[biometric] Unknown device SN=${sn}`);
        return;
      }
      const device = devRes.rows[0];
      const orgId  = device.org_id;

      // 2. Update device last_seen + status
      await pool.query(
        `UPDATE biometric_devices SET last_seen = NOW(), status = 'online' WHERE id = $1`,
        [device.id]
      );

      for (const line of rawLines) {
        await processAttlogLine(line, orgId, sn);
      }
    } catch (err) {
      console.error('[biometric] Push processing error:', err.message);
    }
  });
};

// ─── Parse ATTLOG lines ────────────────────────────────────────────────────────
// ZKTeco sends attendance data as tab-separated lines.
// Depending on firmware, body arrives as:
//   - A raw string (express.text middleware, Content-Type: text/plain)
//   - KEYS in URL-encoded body (when line has no '=' separator)
//   - VALUES in URL-encoded body
//   - Query string parameters
function extractAttlogLines(body, query = {}) {
  const lines = [];

  function parseLine(text) {
    if (!text || typeof text !== 'string') return;
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      // Valid ATTLOG line: starts with alphanumeric PIN, tab-separated
      if (trimmed && trimmed.includes('\t') && /^[a-zA-Z0-9_\-]+\t/.test(trimmed)) {
        lines.push(trimmed);
      }
    }
  }

  // Raw string body (express.text captured it — most reliable path)
  if (typeof body === 'string') {
    parseLine(body);
    return lines;
  }

  if (body && typeof body === 'object') {
    // Check keys (attendance lines with no '=' become keys with empty values)
    for (const key of Object.keys(body)) {
      if (/^[a-zA-Z0-9_\-]+\t/.test(key)) parseLine(key);
    }
    // Check values (some firmware versions encode lines as values)
    for (const val of Object.values(body)) {
      parseLine(val);
    }
  }

  // Check query string (some firmware sends lines via query params)
  for (const val of Object.values(query)) {
    parseLine(val);
  }

  return lines;
}

// ─── Process a single ATTLOG line ─────────────────────────────────────────────
async function processAttlogLine(line, orgId, deviceSerial) {
  const parts = line.split('\t');
  if (parts.length < 3) return;

  const pin       = parts[0].trim();
  const timeStr   = parts[1].trim();   // "2026-07-08 09:14:23"
  const punchType = parseInt(parts[2].trim(), 10); // 0=in, 1=out

  const punchTime = new Date(timeStr);
  if (isNaN(punchTime.getTime())) {
    console.warn('[biometric] Invalid punch time:', timeStr);
    return;
  }

  const punchDate    = punchTime.toISOString().slice(0, 10);          // YYYY-MM-DD
  const punchTimeStr = punchTime.toTimeString().slice(0, 8);          // HH:MM:SS

  // 3. Upsert raw log (idempotent via ON CONFLICT DO NOTHING)
  // device_serial is part of the UNIQUE(device_serial, punch_time, employee_pin) constraint
  let rawLogId;
  try {
    const logRes = await pool.query(
      `INSERT INTO biometric_raw_logs
         (org_id, device_serial, employee_pin, punch_time, punch_type, processed)
       VALUES ($1, $2, $3, $4, $5, false)
       ON CONFLICT (device_serial, punch_time, employee_pin) DO NOTHING
       RETURNING id`,
      [orgId, deviceSerial, pin, punchTime.toISOString(), punchType]
    );
    if (!logRes.rows.length) {
      // Row already existed — already processed
      return;
    }
    rawLogId = logRes.rows[0].id;
  } catch (err) {
    console.error('[biometric] Raw log upsert error:', err.message);
    return;
  }

  // 4. Look up employee mapping
  const mapRes = await pool.query(
    `SELECT user_id FROM biometric_employee_map
     WHERE org_id = $1 AND employee_pin = $2 LIMIT 1`,
    [orgId, pin]
  );
  if (!mapRes.rows.length) {
    // No mapping — leave the raw log unprocessed for later reprocessing
    return;
  }
  const userId = mapRes.rows[0].user_id;

  // 5. Leave guard — skip if employee is on leave / half_day / wfh
  const attRes = await pool.query(
    `SELECT id, status, check_in, check_out, total_break_minutes FROM attendance
     WHERE user_id = $1 AND date = $2 LIMIT 1`,
    [userId, punchDate]
  );
  const att = attRes.rows[0] || null;

  if (att && ['on_leave', 'half_day', 'wfh'].includes(att.status)) {
    // Mark raw log processed (we intentionally skipped it)
    await pool.query(`UPDATE biometric_raw_logs SET processed = true WHERE id = $1`, [rawLogId]);
    return;
  }

  // 6. Check-in (punch_type = 0)
  if (punchType === 0) {
    if (!att) {
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_in, status, source, organization_id)
         VALUES ($1, $2, $3, 'present', 'biometric', $4)
         ON CONFLICT (user_id, date, organization_id) DO NOTHING`,
        [userId, punchDate, punchTimeStr, orgId]
      );
    }
    // If att exists and check_in already set — ignore duplicate check-in
  }

  // 7. Check-out (punch_type = 1)
  if (punchType === 1) {
    if (att && att.check_in) {
      const checkInMs  = new Date(`${punchDate}T${att.check_in}`).getTime();
      const checkOutMs = punchTime.getTime();
      const grossHours = parseFloat(((checkOutMs - checkInMs) / 3600000).toFixed(2));
      // Subtract accumulated break minutes to get effective work hours
      const breakMins  = att.total_break_minutes || 0;
      const workHours  = parseFloat(Math.max(0, grossHours - breakMins / 60).toFixed(2));
      await pool.query(
        `UPDATE attendance
         SET check_out = $1, gross_hours = $2, work_hours = $3, source = 'biometric'
         WHERE id = $4`,
        [punchTimeStr, grossHours, workHours, att.id]
      );
    }
    // If no check_in exists — record the check_out for later reconciliation.
    // Uses the correct 3-column unique constraint (user_id, date, organization_id).
    else if (!att) {
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_out, status, source, organization_id)
         VALUES ($1, $2, $3, 'present', 'biometric', $4)
         ON CONFLICT (user_id, date, organization_id) DO UPDATE
           SET check_out = EXCLUDED.check_out, source = 'biometric'`,
        [userId, punchDate, punchTimeStr, orgId]
      );
    }
  }

  // 8. Mark raw log processed
  await pool.query(`UPDATE biometric_raw_logs SET processed = true WHERE id = $1`, [rawLogId]);
}
