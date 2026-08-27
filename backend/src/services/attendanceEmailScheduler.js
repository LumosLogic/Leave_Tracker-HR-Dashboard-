'use strict';
/**
 * attendanceEmailScheduler.js
 *
 * Independent automation scheduler — runs every TICK_MS (default 5 min).
 * On each tick:
 *   1. runLateSweep()     — send late check-in emails for today's late records
 *   2. runEndOfDayCheck() — send daily summary + appreciation emails when it's time per org
 *
 * Never modifies attendance, payroll, leave, or biometric data.
 * Reads attendance_email_settings per org; writes only to attendance_email_logs.
 */

const { pool }          = require('../config/db');
const { getOrgContext } = require('../utils/helpers');
const {
  processLateEmails,
  processDailySummaryEmails,
  processAppreciationEmails,
} = require('./attendanceEmailService');

const TICK_MS      = parseInt(process.env.ATT_EMAIL_TICK_MS || String(5 * 60 * 1000), 10); // 5 min
const WINDOW_MINS  = 6; // match daily_summary_time within ±6 minutes of current time

// ─── IST time helper ─────────────────────────────────────────────────────────
function istNow() {
  const now   = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const h = parseInt(parts.find(p => p.type === 'hour')?.value   || '0', 10);
  const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return { hour: h, minute: m, totalMins: h * 60 + m };
}

// Parse 'HH:MM' or 'HH:MM:SS' → total minutes since midnight
function parseTimeMins(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return (isNaN(h) || isNaN(m)) ? null : h * 60 + m;
}

// ─── Fetch all orgs with their email automation settings ─────────────────────
async function fetchOrgSettings() {
  try {
    const res = await pool.query(
      `SELECT o.id AS org_id, o.name,
              aes.late_email_enabled,
              aes.daily_summary_enabled,
              aes.daily_summary_time,
              aes.appreciation_email_enabled,
              ws.start_time, ws.end_time,
              ws.late_threshold, ws.early_exit_threshold,
              COALESCE(ws.full_day_hours, 8) AS full_day_hours
         FROM organizations o
         LEFT JOIN attendance_email_settings aes ON aes.organization_id = o.id
         LEFT JOIN work_schedule ws ON ws.organization_id = o.id
        WHERE o.status = 'active'`
    );
    return res.rows;
  } catch (err) {
    console.error('[AttEmail] fetchOrgSettings error:', err.message);
    return [];
  }
}

// ─── Tick handlers ────────────────────────────────────────────────────────────

async function runLateSweep(orgs, now) {
  for (const org of orgs) {
    if (!org.late_email_enabled) continue;
    const settings = { late_email_enabled: org.late_email_enabled };
    const schedule = {
      start_time:    org.start_time,
      late_threshold: org.late_threshold,
    };
    try {
      const ctx = await getOrgContext(org.org_id);
      await processLateEmails(org.org_id, settings, schedule, ctx);
    } catch (err) {
      console.error(`[AttEmail] Late sweep error (org ${org.org_id}):`, err.message);
    }
  }
}

async function runEndOfDayCheck(orgs, now) {
  for (const org of orgs) {
    const needsSummary     = org.daily_summary_enabled;
    const needsAppreciation = org.appreciation_email_enabled;
    if (!needsSummary && !needsAppreciation) continue;

    const summaryMins = parseTimeMins(org.daily_summary_time);
    if (summaryMins === null) continue;

    // Only trigger when current IST time is within ±WINDOW_MINS of the configured send time
    if (Math.abs(now.totalMins - summaryMins) > WINDOW_MINS) continue;

    const settings = {
      daily_summary_enabled:        org.daily_summary_enabled,
      appreciation_email_enabled:   org.appreciation_email_enabled,
      appreciation_threshold_hours: parseFloat(org.full_day_hours || 8),
    };
    const schedule = {
      start_time:           org.start_time,
      late_threshold:       org.late_threshold,
      early_exit_threshold: org.early_exit_threshold,
    };

    try {
      const ctx = await getOrgContext(org.org_id);
      if (needsSummary)     await processDailySummaryEmails(org.org_id, settings, schedule, ctx);
      if (needsAppreciation) await processAppreciationEmails(org.org_id, settings, schedule, ctx);
    } catch (err) {
      console.error(`[AttEmail] End-of-day check error (org ${org.org_id}):`, err.message);
    }
  }
}

async function tick() {
  try {
    const orgs = await fetchOrgSettings();
    if (!orgs.length) return;
    const now = istNow();
    await runLateSweep(orgs, now);
    await runEndOfDayCheck(orgs, now);
  } catch (err) {
    console.error('[AttEmail] Tick error:', err.message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
function start() {
  // Delay first run by 60 s to let the server fully warm up
  setTimeout(() => {
    tick();
    setInterval(tick, TICK_MS);
  }, 60_000);
  console.log(`[AttEmail] Scheduler started — tick every ${TICK_MS / 60000} min`);
}

module.exports = { start };
