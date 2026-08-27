'use strict';
/**
 * attendanceEmailService.js
 *
 * Independent automation layer — reads attendance data, sends emails, writes audit logs.
 * NEVER modifies attendance, leave, payroll, or any other module's data.
 *
 * Entry points called by attendanceEmailScheduler.js:
 *   processLateEmails(oId, settings, schedule, orgContext)
 *   processDailySummaryEmails(oId, settings, schedule, orgContext)
 *   processAppreciationEmails(oId, settings, schedule, orgContext)
 */

const { pool }   = require('../config/db');
const { sendMail, lateCheckinHtml, dailyAttendanceSummaryHtml, workAppreciationHtml } = require('./emailService');

// ─── IST helpers ─────────────────────────────────────────────────────────────
function istDateStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

function fmtTime12(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (isNaN(h)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function fmtHoursFromDecimal(h) {
  if (!h && h !== 0) return '—';
  const hrs  = Math.floor(Math.abs(h));
  const mins = Math.round((Math.abs(h) - hrs) * 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

function fmtMins(m) {
  if (!m || m <= 0) return '0 Minutes';
  const hrs  = Math.floor(m / 60);
  const mins = m % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins} Minutes`;
}

// ─── Audit log helpers ────────────────────────────────────────────────────────

async function alreadySent(oId, empId, type, date) {
  try {
    const res = await pool.query(
      `SELECT 1 FROM attendance_email_logs
        WHERE organization_id = $1 AND employee_id = $2
          AND email_type = $3 AND attendance_date = $4
        LIMIT 1`,
      [oId, empId, type, date]
    );
    return res.rows.length > 0;
  } catch { return false; }
}

async function logEmail(oId, empId, type, date, status = 'sent', errorMessage = null) {
  try {
    await pool.query(
      `INSERT INTO attendance_email_logs
         (organization_id, employee_id, email_type, attendance_date, status, error_message)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (organization_id, employee_id, email_type, attendance_date) DO NOTHING`,
      [oId, empId, type, date, status, errorMessage]
    );
  } catch (err) {
    console.error('[AttEmail] Log insert error:', err.message);
  }
}

// ─── 1. Late Check-in Emails ──────────────────────────────────────────────────
// Reads today's late attendance records, sends email for each that hasn't been sent yet.
async function processLateEmails(oId, settings, schedule, { orgName, orgEmail }) {
  if (!settings.late_email_enabled) return;

  const today = istDateStr();
  const lateThreshold = schedule?.late_threshold || null;
  const workStartTime  = schedule?.start_time     || null;

  // Fetch all late check-ins today for active employees
  const attRes = await pool.query(
    `SELECT a.user_id, a.check_in, a.is_late,
            u.name, u.email, u.employee_id AS emp_code
       FROM attendance a
       JOIN users u ON u.id = a.user_id
      WHERE a.organization_id = $1
        AND a.date = $2
        AND a.is_late = true
        AND a.check_in IS NOT NULL
        AND u.email IS NOT NULL
        AND u.email <> ''
        AND COALESCE(u.employee_status, 'active') NOT IN ('inactive','resigned','terminated')`,
    [oId, today]
  );

  for (const row of attRes.rows) {
    if (await alreadySent(oId, row.user_id, 'late', today)) continue;

    try {
      // Calculate late minutes
      let lateMinutes = 0;
      if (lateThreshold && row.check_in) {
        const [th, tm] = lateThreshold.split(':').map(Number);
        const [ch, cm] = String(row.check_in).split(':').map(Number);
        lateMinutes = Math.max(0, (ch * 60 + cm) - (th * 60 + tm));
      }

      const html = lateCheckinHtml(
        { name: row.name, email: row.email, employee_id: row.emp_code },
        {
          date:          today,
          workStartTime: fmtTime12(workStartTime),
          lateThreshold: fmtTime12(lateThreshold),
          checkInTime:   fmtTime12(row.check_in),
          lateMinutes,
        },
        orgName,
        orgEmail
      );

      await sendMail({
        to:      row.email,
        subject: `Late Check-in Recorded — ${today}`,
        html,
      });

      await logEmail(oId, row.user_id, 'late', today, 'sent');
      console.log(`[AttEmail] Late email sent: ${row.name} (org ${oId})`);
    } catch (err) {
      console.error(`[AttEmail] Late email failed for user ${row.user_id}:`, err.message);
      await logEmail(oId, row.user_id, 'late', today, 'failed', err.message);
    }
  }
}

// ─── 2. Daily Attendance Summary Emails ───────────────────────────────────────
async function processDailySummaryEmails(oId, settings, schedule, { orgName, orgEmail }) {
  if (!settings.daily_summary_enabled) return;

  const today = istDateStr();
  const lateThreshold  = schedule?.late_threshold       || null;
  const earlyThreshold = schedule?.early_exit_threshold || null;

  // Fetch active employees only — HR/Root Admin are excluded from personal daily summaries
  const empRes = await pool.query(
    `SELECT u.id, u.name, u.email
       FROM users u
      WHERE u.organization_id = $1
        AND u.email IS NOT NULL AND u.email <> ''
        AND u.role = 'employee'
        AND COALESCE(u.employee_status,'active') NOT IN ('inactive','resigned','terminated')`,
    [oId]
  );

  for (const emp of empRes.rows) {
    if (await alreadySent(oId, emp.id, 'daily_summary', today)) continue;

    try {
      // Fetch today's attendance record (may be null = absent)
      const attRes = await pool.query(
        `SELECT check_in, check_out, work_hours, gross_hours,
                total_break_minutes, status, is_late, is_early_exit
           FROM attendance
          WHERE user_id = $1 AND organization_id = $2 AND date = $3
          LIMIT 1`,
        [emp.id, oId, today]
      );
      const att = attRes.rows[0] || null;

      // Skip if employee has no check-in record today — nothing to summarize
      if (!att || !att.check_in) {
        await logEmail(oId, emp.id, 'daily_summary', today, 'skipped');
        continue;
      }

      // Check approved leave
      const leaveRes = await pool.query(
        `SELECT leave_time, leave_type FROM leaves
          WHERE user_id = $1 AND organization_id = $2 AND status = 'approved'
            AND start_date <= $3 AND end_date >= $3
          LIMIT 1`,
        [emp.id, oId, today]
      );
      const leave = leaveRes.rows[0] || null;

      // Determine status label
      let status = att?.status || (leave ? 'on_leave' : 'absent');

      // Calculate late minutes
      let lateMinutes = 0;
      if (att?.is_late && lateThreshold && att.check_in) {
        const [th, tm] = lateThreshold.split(':').map(Number);
        const [ch, cm] = String(att.check_in).split(':').map(Number);
        lateMinutes = Math.max(0, (ch * 60 + cm) - (th * 60 + tm));
      }

      // Calculate early exit minutes
      let earlyExitMinutes = 0;
      if (att?.is_early_exit && earlyThreshold && att.check_out) {
        const [th, tm] = earlyThreshold.split(':').map(Number);
        const [ch, cm] = String(att.check_out).split(':').map(Number);
        earlyExitMinutes = Math.max(0, (th * 60 + tm) - (ch * 60 + cm));
      }

      const workHrs  = parseFloat(att?.work_hours  || 0);
      const grossHrs = parseFloat(att?.gross_hours  || 0);
      const breakMins = parseInt(att?.total_break_minutes || 0, 10);

      const html = dailyAttendanceSummaryHtml(
        { name: emp.name, email: emp.email },
        {
          date:             today,
          checkIn:          att?.check_in  ? fmtTime12(att.check_in)  : null,
          checkOut:         att?.check_out ? fmtTime12(att.check_out) : null,
          workingHours:     workHrs  > 0 ? fmtHoursFromDecimal(workHrs)  : null,
          breakHours:       breakMins > 0 ? fmtMins(breakMins) : null,
          totalDuration:    grossHrs > 0 ? fmtHoursFromDecimal(grossHrs) : null,
          lateMinutes,
          earlyExitMinutes,
          status,
        },
        orgName,
        orgEmail
      );

      await sendMail({
        to:      emp.email,
        subject: `Your Attendance Summary — ${today}`,
        html,
      });

      await logEmail(oId, emp.id, 'daily_summary', today, 'sent');
      console.log(`[AttEmail] Summary email sent: ${emp.name} (org ${oId})`);
    } catch (err) {
      console.error(`[AttEmail] Summary email failed for user ${emp.id}:`, err.message);
      await logEmail(oId, emp.id, 'daily_summary', today, 'failed', err.message);
    }
  }
}

// ─── 3. Work Appreciation Emails ──────────────────────────────────────────────
async function processAppreciationEmails(oId, settings, schedule, { orgName, orgEmail }) {
  if (!settings.appreciation_email_enabled) return;

  const threshold = parseFloat(settings.appreciation_threshold_hours || 8);
  const today     = istDateStr();

  // Fetch employees who exceeded the threshold today
  const attRes = await pool.query(
    `SELECT a.user_id, a.work_hours,
            u.name, u.email
       FROM attendance a
       JOIN users u ON u.id = a.user_id
      WHERE a.organization_id = $1
        AND a.date = $2
        AND CAST(a.work_hours AS NUMERIC) >= $3
        AND a.check_out IS NOT NULL
        AND u.email IS NOT NULL AND u.email <> ''
        AND COALESCE(u.employee_status,'active') NOT IN ('inactive','resigned','terminated')`,
    [oId, today, threshold]
  );

  for (const row of attRes.rows) {
    if (await alreadySent(oId, row.user_id, 'appreciation', today)) continue;

    try {
      const workHrs = parseFloat(row.work_hours || 0);
      const html = workAppreciationHtml(
        { name: row.name, email: row.email },
        {
          date:          today,
          workingHours:  fmtHoursFromDecimal(workHrs),
          thresholdHours: threshold,
        },
        orgName,
        orgEmail
      );

      await sendMail({
        to:      row.email,
        subject: `Well Done Today, ${row.name} — ${today}`,
        html,
      });

      await logEmail(oId, row.user_id, 'appreciation', today, 'sent');
      console.log(`[AttEmail] Appreciation email sent: ${row.name} (org ${oId})`);
    } catch (err) {
      console.error(`[AttEmail] Appreciation email failed for user ${row.user_id}:`, err.message);
      await logEmail(oId, row.user_id, 'appreciation', today, 'failed', err.message);
    }
  }
}

module.exports = { processLateEmails, processDailySummaryEmails, processAppreciationEmails };
