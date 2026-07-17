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

module.exports = async function biometricPushHandler(req, res) {
  // Always respond immediately
  res.send('OK');

  const sn    = req.query.SN    || req.body.SN;
  const table = req.query.table || req.body.table;

  if (!sn) return;                   // nothing to do
  if (table && table !== 'ATTLOG') return; // ignore non-attendance payloads

  // The attendance lines are in the raw body text (after the URL-encoded fields).
  // express.urlencoded() puts the KV pairs in req.body; for ZKTeco the log lines
  // come as the value of a key that matches "PIN\t..." or as separate body text.
  // ZKTeco ADMS actually POSTs the lines as the raw body content with
  // Content-Type: text/plain or as part of the form body keyed by the first field.
  // We handle both: check all body values + the raw text.
  const rawLines = extractAttlogLines(req.body, req.query);

  if (!rawLines.length) return;

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
// Depending on firmware, these can appear as:
//   - KEYS in URL-encoded body (when line has no '=' separator)
//   - VALUES in URL-encoded body
//   - Query string parameters
function extractAttlogLines(body, query = {}) {
  const lines = [];

  function parseLine(text) {
    if (!text || typeof text !== 'string') return;
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      // Valid ATTLOG line: starts with numeric PIN, tab-separated
      if (trimmed && trimmed.includes('\t') && /^\d+\t/.test(trimmed)) {
        lines.push(trimmed);
      }
    }
  }

  // Check keys (attendance lines with no '=' become keys with empty values)
  for (const key of Object.keys(body)) {
    if (/^\d+\t/.test(key)) parseLine(key);
  }
  // Check values (some firmware versions encode lines as values)
  for (const val of Object.values(body)) {
    parseLine(val);
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
    `SELECT id, status, check_in, check_out FROM attendance
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
      const workHours  = parseFloat(((checkOutMs - checkInMs) / 3600000).toFixed(2));
      await pool.query(
        `UPDATE attendance SET check_out = $1, work_hours = $2, source = 'biometric'
         WHERE id = $3`,
        [punchTimeStr, workHours, att.id]
      );
    }
    // If no check_in exists — record the check_out anyway for later reconciliation
    else if (!att) {
      await pool.query(
        `INSERT INTO attendance (user_id, date, check_out, status, source, organization_id)
         VALUES ($1, $2, $3, 'present', 'biometric', $4)
         ON CONFLICT (user_id, date) DO UPDATE SET check_out = EXCLUDED.check_out, source = 'biometric'`,
        [userId, punchDate, punchTimeStr, orgId]
      );
    }
  }

  // 8. Mark raw log processed
  await pool.query(`UPDATE biometric_raw_logs SET processed = true WHERE id = $1`, [rawLogId]);
}
