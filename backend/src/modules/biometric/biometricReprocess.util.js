const { pool } = require('../../config/db-pg-adapter');
const { getOrgPolicy } = require('../../utils/orgPolicy');

/**
 * Compute and upsert one day's attendance using first-in / last-out logic.
 * dayLogs  – ALL punch records for this employee+date (processed or not).
 * existingAtt – current attendance row from DB, or null.
 *
 * Semantics:
 *   check_in            = first punch of day (regardless of punch_type)
 *   check_out           = last punch of day  (regardless of punch_type)
 *   total_break_minutes = sum of consecutive out(1)→in(0) gaps (non-working time)
 *   gross_hours         = check_out − check_in
 *   work_hours          = gross_hours − gap_hours
 */
async function applyFILODay(userId, date, orgId, dayLogs, existingAtt) {
  if (!dayLogs.length) return;

  const sorted = [...dayLogs].sort((a, b) =>
    new Date(a.punch_time) - new Date(b.punch_time)
  );

  const firstTime = new Date(sorted[0].punch_time);
  const lastTime  = new Date(sorted[sorted.length - 1].punch_time);

  const checkInStr  = firstTime.toTimeString().slice(0, 8);
  // Only set check_out when there are at least 2 punches
  const checkOutStr = sorted.length > 1 ? lastTime.toTimeString().slice(0, 8) : null;

  const grossMs    = checkOutStr ? lastTime - firstTime : 0;
  const grossHours = parseFloat((grossMs / 3600000).toFixed(2));

  // Non-working gaps: consecutive out(1) → in(0) pairs
  let gapMinutes = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const currType = parseInt(sorted[i].punch_type,     10);
    const nextType = parseInt(sorted[i + 1].punch_type, 10);
    if (currType === 1 && nextType === 0) {
      gapMinutes += Math.round(
        (new Date(sorted[i + 1].punch_time) - new Date(sorted[i].punch_time)) / 60000
      );
    }
  }

  const workHours = parseFloat(Math.max(0, grossHours - gapMinutes / 60).toFixed(2));

  if (existingAtt) {
    await pool.query(
      `UPDATE attendance
       SET check_in = $1, check_out = $2, gross_hours = $3, work_hours = $4,
           total_break_minutes = $5, source = 'biometric'
       WHERE id = $6`,
      [checkInStr, checkOutStr, grossHours, workHours, gapMinutes, existingAtt.id]
    );
  } else {
    await pool.query(
      `INSERT INTO attendance
         (user_id, date, check_in, check_out, gross_hours, work_hours,
          total_break_minutes, status, source, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'present', 'biometric', $8)
       ON CONFLICT (user_id, date, organization_id) DO UPDATE
         SET check_in            = EXCLUDED.check_in,
             check_out           = EXCLUDED.check_out,
             gross_hours         = EXCLUDED.gross_hours,
             work_hours          = EXCLUDED.work_hours,
             total_break_minutes = EXCLUDED.total_break_minutes,
             source              = 'biometric'`,
      [userId, date, checkInStr, checkOutStr, grossHours, workHours, gapMinutes, orgId]
    );
  }
}

/**
 * Reprocess all unprocessed biometric_raw_logs for a given employee PIN.
 * Policy-aware: FILO logic for first_in_last_out orgs, original logic for standard.
 * Returns { processed, total, noMapping }
 */
async function reprocessPin(orgId, employeePin) {
  const [mapRes, policy] = await Promise.all([
    pool.query(
      `SELECT user_id FROM biometric_employee_map
       WHERE org_id = $1 AND employee_pin = $2 LIMIT 1`,
      [orgId, String(employeePin)]
    ),
    getOrgPolicy(orgId),
  ]);

  if (!mapRes.rows.length) return { processed: 0, total: 0, noMapping: true };
  const userId = mapRes.rows[0].user_id;

  // ── FILO mode ──────────────────────────────────────────────────────────────
  if (policy === 'first_in_last_out') {
    // Find unique dates that have unprocessed logs
    const datesRes = await pool.query(
      `SELECT DISTINCT punch_time::date AS d
       FROM biometric_raw_logs
       WHERE org_id = $1 AND employee_pin = $2 AND processed = false
       ORDER BY d`,
      [orgId, String(employeePin)]
    );
    if (!datesRes.rows.length) return { processed: 0, total: 0, noMapping: false };

    let processed = 0;
    for (const { d: date } of datesRes.rows) {
      // Fetch ALL logs for this date (processed + unprocessed) so FILO sees the full picture
      const allLogsRes = await pool.query(
        `SELECT id, punch_time, punch_type, processed
         FROM biometric_raw_logs
         WHERE org_id = $1 AND employee_pin = $2
           AND punch_time >= $3::date
           AND punch_time <  $3::date + INTERVAL '1 day'
         ORDER BY punch_time`,
        [orgId, String(employeePin), date]
      );
      const dayLogs         = allLogsRes.rows;
      const unprocessedLogs = dayLogs.filter(l => !l.processed);
      if (!unprocessedLogs.length) continue;

      // Leave guard
      const attRes = await pool.query(
        `SELECT id, status FROM attendance WHERE user_id = $1 AND date = $2 LIMIT 1`,
        [userId, date]
      );
      const att = attRes.rows[0] || null;

      if (att && ['on_leave', 'half_day', 'wfh'].includes(att.status)) {
        await pool.query(
          `UPDATE biometric_raw_logs SET processed = true
           WHERE org_id = $1 AND employee_pin = $2
             AND punch_time::date = $3 AND processed = false`,
          [orgId, String(employeePin), date]
        );
        processed += unprocessedLogs.length;
        continue;
      }

      await applyFILODay(userId, date, orgId, dayLogs, att);

      await pool.query(
        `UPDATE biometric_raw_logs SET processed = true
         WHERE org_id = $1 AND employee_pin = $2
           AND punch_time::date = $3 AND processed = false`,
        [orgId, String(employeePin), date]
      );
      processed += unprocessedLogs.length;
    }

    return { processed, total: processed, noMapping: false };
  }

  // ── Standard mode (original logic — untouched) ─────────────────────────────
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

module.exports = { reprocessPin, applyFILODay };
