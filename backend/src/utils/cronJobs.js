const { db } = require('../config/db');
const { localDateStr, getRecipients, getOrgContext } = require('./helpers');
const { sendMail, birthdayWishHtml, birthdayReminderHtml, holidayReminderHtml } = require('../services/emailService');
const { sendPushToUsers } = require('../services/pushService');

function scheduleDailyAt(hour, minute, fn) {
  function msUntilNext() {
    const now  = new Date();
    const next = new Date();
    next.setHours(hour, minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
  }
  setTimeout(function tick() {
    fn().catch(console.error);
    setTimeout(tick, 24 * 60 * 60 * 1000);
  }, msUntilNext());
}

async function runDailyNotifications() {
  const today    = localDateStr();
  const todayMD  = today.slice(5);
  const tmr      = new Date(); tmr.setDate(tmr.getDate() + 1);
  const tmrStr   = localDateStr(tmr);
  const tomorrowMD = tmrStr.slice(5);

  const { data: orgs } = await db.from('organizations').select('id, name').eq('status', 'active');

  for (const org of orgs || []) {
    const oId = org.id;
    const { orgName, orgEmail } = await getOrgContext(oId);
    const { data: employees } = await db.from('users')
      .select('id, name, email, department, date_of_birth, joining_date')
      .eq('role', 'employee').eq('organization_id', oId);

    for (const emp of employees || []) {
      if (emp.date_of_birth && emp.date_of_birth.slice(5) === todayMD) {
        if (emp.email) sendMail({ to: emp.email, subject: `Happy Birthday, ${emp.name}! 🎂`, html: birthdayWishHtml(emp, orgName, orgEmail) });
        await sendPushToUsers([emp.id], { title: `🎂 Happy Birthday, ${emp.name}!`, body: `Wishing you a wonderful birthday!`, url: '/portal/home' }).catch(() => {});
      }
    }

    // ── Work anniversaries (joining_date MM-DD === today, year must differ) ──────
    const anniversariesToday = (employees || []).filter(e =>
      e.joining_date && e.joining_date.slice(5) === todayMD && e.joining_date.slice(0, 4) !== today.slice(0, 4)
    );
    if (anniversariesToday.length > 0) {
      const { data: hrAdmins } = await db.from('users')
        .select('id').eq('organization_id', oId).in('role', ['admin', 'root_admin']);
      const hrIds = (hrAdmins || []).map(a => a.id);

      for (const emp of anniversariesToday) {
        const years      = parseInt(today.slice(0, 4)) - parseInt(emp.joining_date.slice(0, 4));
        const yearsLabel = `${years} year${years !== 1 ? 's' : ''}`;

        // Notify the employee
        db.from('notifications').insert({
          user_id: emp.id, title: '🎉 Happy Work Anniversary!',
          message: `Congratulations on ${yearsLabel} with us! Your contributions make a real difference.`,
          type: 'general', organization_id: oId,
        }).then(() => {});
        sendPushToUsers([emp.id], {
          title: `🎉 ${years} Year${years !== 1 ? 's' : ''} Work Anniversary!`,
          body:  `Congratulations on ${yearsLabel} with the company, ${emp.name}!`,
          url:   '/portal/home',
        }).catch(() => {});

        // Notify HR admins
        if (hrIds.length) {
          await db.from('notifications').insert(hrIds.map(id => ({
            user_id: id, title: `Work Anniversary — ${emp.name}`,
            message: `${emp.name} completes ${yearsLabel} today. Consider recognising their contribution.`,
            type: 'general', organization_id: oId,
          })));
        }
      }
    }

    const birthdaysTmr = (employees || []).filter(e => e.date_of_birth && e.date_of_birth.slice(5) === tomorrowMD);
    if (birthdaysTmr.length > 0) {
      const hrList = await getRecipients(oId);
      if (hrList.length) sendMail({ to: hrList, subject: `Birthday Reminder — ${birthdaysTmr.map(e => e.name).join(', ')}`, html: birthdayReminderHtml(birthdaysTmr, orgName, orgEmail) });
    }

    const { data: tmrHolidays } = await db.from('holidays').select('*').eq('date', tmrStr).eq('organization_id', oId);
    if (tmrHolidays?.length) {
      const allEmails  = (employees || []).map(e => e.email).filter(Boolean);
      const hrEmails   = await getRecipients(oId);
      const recipients = [...new Set([...allEmails, ...hrEmails])];
      // HIGH-24: Never pass null — scope push to this org's employee IDs only
      const empIds = (employees || []).map(e => e.id);
      for (const holiday of tmrHolidays) {
        if (recipients.length) sendMail({ to: recipients, subject: `Tomorrow is a Holiday — ${holiday.name}`, html: holidayReminderHtml(holiday, orgName, orgEmail) });
        if (empIds.length) {
          await sendPushToUsers(empIds, { title: `🏖️ Tomorrow is a Holiday — ${holiday.name}`, body: holiday.specific_msg || holiday.description || `Enjoy the ${holiday.name} holiday!`, url: '/portal/home' }).catch(() => {});
        }
      }
    }
  }
  console.log(`[Cron] Daily notifications sent for ${today}`);
}

// BUG_072: Auto-mark absent — runs nightly after work hours end
// For each active employee with no attendance record and no approved leave for that day,
// inserts an 'absent' attendance record so the calendar/reports show the correct status.
async function runAutoMarkAbsent() {
  const today = localDateStr();
  // Determine if today was a working day for each org (skip weekends by default)
  const dayOfWeek = new Date().getDay(); // 0=Sun, 6=Sat
  const { data: orgs } = await db.from('organizations').select('id').eq('status', 'active');

  for (const org of (orgs || [])) {
    const oId = org.id;
    try {
      // Fetch org work schedule to know working days
      const { data: sched } = await db.from('organization_settings')
        .select('work_days').eq('organization_id', oId).maybeSingle();
      const workDays = sched?.work_days
        ? sched.work_days.split(',').map(Number)
        : [1, 2, 3, 4, 5]; // Mon–Fri default
      if (!workDays.includes(dayOfWeek)) continue; // not a working day, skip

      // Fetch all active employees
      const { data: employees } = await db.from('users')
        .select('id').eq('organization_id', oId)
        .in('role', ['employee', 'admin'])
        .not('employee_status', 'in', ['inactive', 'resigned', 'terminated']);

      if (!employees?.length) continue;
      const empIds = employees.map(e => e.id);

      // Find employees who checked in today
      const { data: checkedIn } = await db.from('attendance')
        .select('user_id').eq('organization_id', oId).eq('date', today)
        .in('user_id', empIds);
      const checkedInIds = new Set((checkedIn || []).map(r => r.user_id));

      // Find employees with approved leave or WFH today
      const { data: onLeave } = await db.from('leaves')
        .select('user_id').eq('organization_id', oId)
        .lte('start_date', today).gte('end_date', today)
        .in('status', ['approved']).in('user_id', empIds);
      const onLeaveIds = new Set((onLeave || []).map(r => r.user_id));

      // Find employees with a holiday today
      const { data: holidays } = await db.from('holidays')
        .select('id').eq('organization_id', oId).eq('date', today).limit(1);
      if (holidays?.length) continue; // org-wide holiday, skip absent marking

      // Mark absent: employees not checked in and not on leave
      const absentIds = empIds.filter(id => !checkedInIds.has(id) && !onLeaveIds.has(id));
      if (!absentIds.length) continue;

      // Insert absent records (skip if already exists)
      const absentRecords = absentIds.map(uid => ({
        user_id: uid, organization_id: oId, date: today, status: 'absent',
        check_in: null, check_out: null,
      }));
      await db.from('attendance').upsert(absentRecords, { onConflict: 'user_id,date', ignoreDuplicates: true });
      console.log(`[AutoAbsent] Marked ${absentIds.length} absent for org ${oId} on ${today}`);
    } catch (err) {
      console.error(`[AutoAbsent] Error for org ${oId}:`, err.message);
    }
  }
}

// Probation expiry check — runs daily.
// Part 1: promotes employees whose probation has ended → active + full_time
// Part 2: for orgs with scope='all', auto-applies probation to newly joined employees
async function runProbationExpiryCheck() {
  const today = localDateStr();
  const { data: orgs } = await db.from('organizations').select('id').eq('status', 'active');

  for (const org of (orgs || [])) {
    const oId = org.id;
    try {
      // ── Part 1: promote expired probations → active ───────────────────────
      const { data: expired } = await db.from('users')
        .select('id, name')
        .eq('organization_id', oId)
        .eq('probation_applicable', true)
        .eq('employee_status', 'probation')
        .not('probation_end_date', 'is', null)
        .lte('probation_end_date', today);

      if (expired?.length) {
        for (const emp of expired) {
          await db.from('users')
            .update({ employee_status: 'active', employment_type: 'full_time' })
            .eq('id', emp.id)
            .eq('organization_id', oId);

          const { data: admins } = await db.from('users')
            .select('id').eq('organization_id', oId).in('role', ['admin', 'root_admin']);
          if (admins?.length) {
            await db.from('notifications').insert(
              admins.map(a => ({
                user_id:         a.id,
                title:           `Probation Completed — ${emp.name}`,
                message:         `${emp.name}'s probation period has ended. Status updated to Full Time (Active).`,
                type:            'general',
                organization_id: oId,
              }))
            );
          }
        }
        console.log(`[Probation] Promoted ${expired.length} employee(s) in org ${oId}`);
      }

      // ── Part 2: scope='all' — auto-apply to newly joined employees ─────────
      const { data: ps } = await db.from('payroll_settings')
        .select('probation_enabled, default_probation_months, probation_scope')
        .eq('organization_id', oId).maybeSingle();

      if (!ps?.probation_enabled || ps?.probation_scope !== 'all') continue;

      const months = Number(ps.default_probation_months) || 3;

      const { data: newEmps } = await db.from('users')
        .select('id, joining_date')
        .eq('organization_id', oId)
        .eq('role', 'employee')
        .eq('probation_applicable', false)
        .not('employee_status', 'in', ['inactive', 'resigned', 'terminated', 'probation'])
        .not('joining_date', 'is', null);

      for (const emp of (newEmps || [])) {
        const startDate = typeof emp.joining_date === 'string'
          ? emp.joining_date.slice(0, 10)
          : new Date(emp.joining_date).toISOString().split('T')[0];

        const endD = new Date(startDate + 'T12:00:00Z');
        endD.setMonth(endD.getMonth() + months);
        const endDate = endD.toISOString().split('T')[0];

        if (endDate <= today) continue; // already past — do not change status

        await db.from('users').update({
          probation_applicable: true,
          probation_months:     months,
          probation_start_date: startDate,
          probation_end_date:   endDate,
          employee_status:      'probation',
        }).eq('id', emp.id).eq('organization_id', oId);
      }
    } catch (err) {
      console.error(`[Probation] Error for org ${oId}:`, err.message);
    }
  }
}

module.exports = { scheduleDailyAt, runDailyNotifications, runAutoMarkAbsent, runProbationExpiryCheck };
