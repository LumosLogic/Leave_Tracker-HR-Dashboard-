const { pool } = require('../../config/db-pg-adapter');

/**
 * Reprocess all unprocessed biometric_raw_logs for a given employee PIN.
 * Idempotent: safe to call multiple times; skips already-processed rows.
 * Returns { processed, total, noMapping }
 */
async function reprocessPin(orgId, employeePin) {
  const mapRes = await pool.query(
    `SELECT user_id FROM biometric_employee_map
     WHERE org_id = $1 AND employee_pin = $2 LIMIT 1`,
    [orgId, String(employeePin)]
  );
  if (!mapRes.rows.length) return { processed: 0, total: 0, noMapping: true };
  const userId = mapRes.rows[0].user_id;

  const logsRes = await pool.query(
    `SELECT * FROM biometric_raw_logs
     WHERE org_id = $1 AND employee_pin = $2 AND processed = false
     ORDER BY punch_time`,
    [orgId, String(employeePin)]
  );

  let processed = 0;
  for (const log of logsRes.rows) {
    const punchDate    = new Date(log.punch_time).toISOString().slice(0, 10);
    const punchTimeStr = new Date(log.punch_time).toTimeString().slice(0, 8);

    const attRes = await pool.query(
      `SELECT id, status, check_in, total_break_minutes FROM attendance
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
        const grossHours = parseFloat(((checkOutMs - checkInMs) / 3600000).toFixed(2));
        const breakMins  = att.total_break_minutes || 0;
        const workHours  = parseFloat(Math.max(0, grossHours - breakMins / 60).toFixed(2));
        await pool.query(
          `UPDATE attendance
           SET check_out = $1, gross_hours = $2, work_hours = $3, source = 'biometric'
           WHERE id = $4`,
          [punchTimeStr, grossHours, workHours, att.id]
        );
      } else if (!att) {
        await pool.query(
          `INSERT INTO attendance (user_id, date, check_out, status, source, organization_id)
           VALUES ($1, $2, $3, 'present', 'biometric', $4)
           ON CONFLICT (user_id, date, organization_id) DO UPDATE
             SET check_out = EXCLUDED.check_out, source = 'biometric'`,
          [userId, punchDate, punchTimeStr, orgId]
        );
      }
    }

    await pool.query(`UPDATE biometric_raw_logs SET processed = true WHERE id = $1`, [log.id]);
    processed++;
  }

  return { processed, total: logsRes.rows.length, noMapping: false };
}

module.exports = { reprocessPin };
