const { supabase } = require('../config/db');
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

  const { data: orgs } = await supabase.from('organizations').select('id, name').eq('status', 'active');

  for (const org of orgs || []) {
    const oId = org.id;
    const { orgName, orgEmail } = await getOrgContext(oId);
    const { data: employees } = await supabase.from('users')
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
      const { data: hrAdmins } = await supabase.from('users')
        .select('id').eq('organization_id', oId).in('role', ['admin', 'root_admin']);
      const hrIds = (hrAdmins || []).map(a => a.id);

      for (const emp of anniversariesToday) {
        const years      = parseInt(today.slice(0, 4)) - parseInt(emp.joining_date.slice(0, 4));
        const yearsLabel = `${years} year${years !== 1 ? 's' : ''}`;

        // Notify the employee
        supabase.from('notifications').insert({
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
          await supabase.from('notifications').insert(hrIds.map(id => ({
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

    const { data: tmrHolidays } = await supabase.from('holidays').select('*').eq('date', tmrStr).eq('organization_id', oId);
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
  const { data: orgs } = await supabase.from('organizations').select('id').eq('status', 'active');

  for (const org of (orgs || [])) {
    const oId = org.id;
    try {
      // Fetch org work schedule to know working days
      const { data: sched } = await supabase.from('organization_settings')
        .select('work_days').eq('organization_id', oId).maybeSingle();
      const workDays = sched?.work_days
        ? sched.work_days.split(',').map(Number)
        : [1, 2, 3, 4, 5]; // Mon–Fri default
      if (!workDays.includes(dayOfWeek)) continue; // not a working day, skip

      // Fetch all active employees
      const { data: employees } = await supabase.from('users')
        .select('id').eq('organization_id', oId)
        .in('role', ['employee', 'admin'])
        .or('employee_status.is.null,employee_status.in.(active,probation)');

      if (!employees?.length) continue;
      const empIds = employees.map(e => e.id);

      // Find employees who checked in today
      const { data: checkedIn } = await supabase.from('attendance')
        .select('user_id').eq('organization_id', oId).eq('date', today)
        .in('user_id', empIds);
      const checkedInIds = new Set((checkedIn || []).map(r => r.user_id));

      // Find employees with approved leave or WFH today
      const { data: onLeave } = await supabase.from('leaves')
        .select('user_id').eq('organization_id', oId)
        .lte('start_date', today).gte('end_date', today)
        .in('status', ['approved']).in('user_id', empIds);
      const onLeaveIds = new Set((onLeave || []).map(r => r.user_id));

      // Find employees with a holiday today
      const { data: holidays } = await supabase.from('holidays')
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
      await supabase.from('attendance').upsert(absentRecords, { onConflict: 'user_id,date', ignoreDuplicates: true });
      console.log(`[AutoAbsent] Marked ${absentIds.length} absent for org ${oId} on ${today}`);
    } catch (err) {
      console.error(`[AutoAbsent] Error for org ${oId}:`, err.message);
    }
  }
}

module.exports = { scheduleDailyAt, runDailyNotifications, runAutoMarkAbsent };
