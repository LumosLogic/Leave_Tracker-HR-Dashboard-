require('dotenv').config();
const nodemailer = require('nodemailer');

// ─── Centralized SMTP transport ───────────────────────────────────────────────
// One transport for the entire platform. All orgs share this SMTP config.
// Credentials come from env vars only — org-level SMTP settings are ignored.
let _transporter = null;
function getTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  if (!_transporter) {
    const pass = (process.env.SMTP_PASS || '').replace(/\s/g, '');
    _transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user: process.env.SMTP_USER, pass },
    });
  }
  return _transporter;
}

// Reset cached transport (call if SMTP env vars change at runtime)
function resetTransporter() { _transporter = null; }

// ─── Core send function ───────────────────────────────────────────────────────
// attachments: nodemailer attachment array (optional)
// replyTo: override reply-to address (optional)
async function sendMail({ to, subject, html, attachments, replyTo } = {}) {
  const transport = getTransporter();
  if (!transport) {
    console.warn('[Email] SMTP not configured (SMTP_USER / SMTP_PASS missing) — skipping');
    return;
  }
  const fromName = process.env.SMTP_FROM_NAME || 'Lumos Logic HRMS';
  const fromAddr = process.env.SMTP_FROM      || `"${fromName}" <${process.env.SMTP_USER}>`;
  try {
    await transport.sendMail({
      from:    fromAddr,
      to:      Array.isArray(to) ? [...new Set(to.filter(Boolean))].join(', ') : to,
      subject,
      html,
      ...(replyTo     ? { replyTo }     : {}),
      ...(attachments ? { attachments } : {}),
    });
  } catch (err) {
    console.error('[Email] Failed to send to', to, '—', err.message);
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────
// Theme: deep purple header (#1e1456), accent #3525cd, light purple highlights

const WRAP = (inner) => `<!DOCTYPE html>
<html><body style="margin:0;padding:24px 16px;background:#eef0f8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:0 auto;">${inner}</div>
</body></html>`;

// icon: emoji string shown in the circle below the org name
const HEADER = (orgName, title, subtitle, icon = '📋') => `
<div style="background:linear-gradient(135deg,#3525cd 0%,#5a3ce8 50%,#712ae2 100%);padding:40px 32px 36px;border-radius:12px 12px 0 0;text-align:center;">
  <p style="margin:0 0 4px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:4px;color:rgba(255,255,255,0.55);font-family:Arial,sans-serif;">HRMS BY LUMOSLOGIC</p>
  <h1 style="margin:0 0 4px;font-size:32px;font-weight:900;color:#ffffff;font-family:Arial,sans-serif;letter-spacing:-0.5px;">${orgName || 'HR System'}</h1>
  <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:3px;color:rgba(255,255,255,0.45);font-family:Arial,sans-serif;">HUMAN RESOURCE MANAGEMENT SYSTEM</p>
  <div style="border-top:1px solid rgba(255,255,255,0.2);margin:24px auto;max-width:360px;"></div>
  <div style="display:inline-block;width:64px;height:64px;line-height:64px;border-radius:50%;background:rgba(255,255,255,0.15);font-size:28px;margin-bottom:16px;">${icon}</div>
  <h2 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#ffffff;font-family:Arial,sans-serif;">${title}</h2>
  <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.7);font-family:Arial,sans-serif;">${subtitle}</p>
</div>`;

const BODY = (content) => `
<div style="background:#ffffff;padding:32px;font-family:Arial,sans-serif;color:#1e293b;border-left:1px solid #dde1f0;border-right:1px solid #dde1f0;">
  ${content}
</div>`;

// Table row with icon — icon is an emoji, label is bold left col, value is right col
const ROW = (icon, label, value) => `
<tr>
  <td style="width:42%;padding:13px 16px;border-bottom:1px solid #e8eaf6;border-right:1px solid #e8eaf6;background:#f7f8ff;vertical-align:middle;">
    <div style="display:inline-block;width:26px;height:26px;line-height:26px;background:#ede9fe;border-radius:6px;font-size:13px;text-align:center;vertical-align:middle;margin-right:8px;">${icon}</div><span style="font-size:13px;font-weight:700;color:#1e1456;vertical-align:middle;font-family:Arial,sans-serif;">${label}</span>
  </td>
  <td style="padding:13px 16px;border-bottom:1px solid #e8eaf6;font-size:13px;color:#334155;vertical-align:middle;font-family:Arial,sans-serif;">${value}</td>
</tr>`;

const TABLE = (rows) => `
<div style="border:1px solid #e8eaf6;border-radius:8px;overflow:hidden;margin:20px 0;">
  <table style="width:100%;border-collapse:collapse;">${rows}</table>
</div>`;

const BTN = (href, label) => `
<div style="text-align:center;margin:28px 0 4px;">
  <a href="${href}" style="display:inline-block;background:#3525cd;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 36px;border-radius:8px;font-family:Arial,sans-serif;letter-spacing:0.3px;">${label} &rarr;</a>
</div>`;

const GREETING = (name) => name
  ? `<p style="margin:0 0 16px;font-size:15px;font-weight:700;color:#1e1456;font-family:Arial,sans-serif;">Hello ${name},</p>`
  : `<p style="margin:0 0 16px;font-size:15px;font-weight:700;color:#1e1456;font-family:Arial,sans-serif;">Hello,</p>`;

const FOOTER = (orgEmail = '', orgName = '') => `
<div style="background:#f0f3ff;border:1px solid #dde1f0;border-top:none;padding:24px 32px 28px;border-radius:0 0 12px 12px;font-family:Arial,sans-serif;">
  <table style="width:100%;border-collapse:collapse;">
    <tr>
      <td style="width:64px;vertical-align:top;padding-right:16px;">
        <div style="width:52px;height:52px;line-height:52px;border-radius:50%;background:#ede9fe;text-align:center;font-size:22px;">🎧</div>
      </td>
      <td style="vertical-align:top;">
        <p style="margin:0 0 8px;font-size:15px;font-weight:800;color:#1e1456;font-family:Arial,sans-serif;">Need Help?</p>
        <p style="margin:0 0 4px;font-size:13px;color:#475569;font-family:Arial,sans-serif;">✉&nbsp;&nbsp;Email:&nbsp;&nbsp;<a href="mailto:${orgEmail || process.env.SMTP_USER || ''}" style="color:#3525cd;text-decoration:none;font-weight:600;">${orgEmail || process.env.SMTP_USER || 'hr@company.com'}</a></p>
        <p style="margin:0;font-size:13px;color:#475569;font-family:Arial,sans-serif;">🌐&nbsp;&nbsp;Website:&nbsp;&nbsp;<a href="https://hrms.lumoslogic.com/" style="color:#3525cd;text-decoration:none;font-weight:600;">https://hrms.lumoslogic.com/</a></p>
      </td>
    </tr>
  </table>
  <div style="border-top:1px solid #c7c4d8;margin:20px 0 16px;"></div>
  <p style="margin:0 0 4px;font-size:12px;color:#64748b;text-align:center;font-family:Arial,sans-serif;">This is an automated email from <strong>HRMS by LumosLogic</strong>.</p>
  <p style="margin:0 0 12px;font-size:12px;color:#64748b;text-align:center;font-family:Arial,sans-serif;">Please do not reply to this email.</p>
  <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;font-family:Arial,sans-serif;">© ${new Date().getFullYear()} HRMS By Lumos Logic</p>
</div>`;

const LEAVE_TYPE_LABEL = {
  annual:'Annual Leave', sick:'Sick Leave', casual:'Casual Leave',
  emergency:'Emergency Leave', other:'Other Leave',
};

// ── Leave Applied — sent to HR / approver ─────────────────────────────────────
function leaveAppliedHtml(employee, leave, orgName = '', orgEmail = '') {
  const type = LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type;
  const duration = leave.leave_time === 'half'
    ? `Half Day (${leave.half_type === 'first_half' ? 'First Half' : 'Second Half'})`
    : leave.leave_time === 'wfh' ? 'Work from Home'
    : `${leave.start_date} → ${leave.end_date}`;
  return WRAP(
    HEADER(orgName, 'New Leave Request', 'Action Required — Please Review', '📋') +
    BODY(`
      ${GREETING('HR Team')}
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;">A new leave request has been submitted and requires your review and approval.</p>
      ${TABLE(
        ROW('👤', 'Employee',   `<strong>${employee.name}</strong>`) +
        ROW('📧', 'Email',      employee.email || '—') +
        ROW('🏢', 'Department', employee.department || '—') +
        ROW('📅', 'Leave Type', type) +
        ROW('⏱️', 'Duration',   duration) +
        ROW('🗓️', 'From Date',  leave.start_date) +
        ROW('🗓️', 'To Date',    leave.end_date) +
        ROW('📝', 'Reason',     `<em style="color:#475569;">${leave.reason || 'No reason provided'}</em>`)
      )}
      ${BTN('https://hrms.lumoslogic.com/leaves', 'Review Leave Request')}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// ── Leave Status — approved or rejected, sent to employee ─────────────────────
function leaveStatusHtml(employee, leave, status, approverName, orgName = '', orgEmail = '') {
  const approved  = status === 'approved';
  const statusClr = approved ? '#10b981' : '#ef4444';
  const statusBg  = approved ? '#ecfdf5' : '#fff1f2';
  const type      = LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type;
  return WRAP(
    HEADER(orgName,
      approved ? 'Leave Request Approved' : 'Leave Request Rejected',
      approved ? 'Your leave has been approved ✓' : 'Your leave has been rejected ✗',
      approved ? '✅' : '❌'
    ) +
    BODY(`
      ${GREETING(employee.name)}
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;">
        ${approved
          ? `Great news! Your <strong>${type}</strong> request has been <strong style="color:#10b981;">approved</strong> by ${approverName || 'HR'}.`
          : `Your <strong>${type}</strong> request has been <strong style="color:#ef4444;">rejected</strong> by ${approverName || 'HR'}.`
        }
      </p>
      ${TABLE(
        ROW('📅', 'Leave Type',  type) +
        ROW('🗓️', 'From Date',   leave.start_date) +
        ROW('🗓️', 'To Date',     leave.end_date) +
        ROW('👤', 'Decision by', approverName || 'HR')
      )}
      <div style="margin-top:20px;padding:14px 18px;background:${statusBg};border-left:4px solid ${statusClr};border-radius:6px;font-size:13px;color:${approved ? '#14532d' : '#7f1d1d'};">
        ${approved
          ? '✓ Your attendance records have been updated. Enjoy your time off!'
          : 'If you have any questions, please reach out to your HR manager directly.'}
      </div>
      ${BTN('https://hrms.lumoslogic.com/portal/leaves', 'View My Leaves')}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// ── Welcome Email — new employee ──────────────────────────────────────────────
function welcomeEmployeeHtml(employee, plainPassword, orgName = '', orgEmail = '') {
  return WRAP(
    HEADER(orgName, 'Welcome to the Team!', `We're glad to have you with us`, '🎉') +
    BODY(`
      ${GREETING(employee.name)}
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;">Welcome to <strong>${orgName || 'the team'}</strong>! Your HR account is ready. Use the credentials below to log in for the first time.</p>
      <div style="background:#f0f3ff;border:1px solid #c7c4d8;border-radius:10px;padding:20px 24px;margin-bottom:20px;">
        <p style="margin:0 0 12px;font-size:11px;font-weight:800;color:#3525cd;text-transform:uppercase;letter-spacing:2px;">Your Login Credentials</p>
        ${TABLE(
          ROW('📧', 'Email',    `<strong>${employee.email}</strong>`) +
          ROW('🔑', 'Password', `<code style="background:#fff;border:1px solid #c7c4d8;padding:3px 10px;border-radius:4px;font-family:monospace;font-size:13px;">${plainPassword}</code>`) +
          ROW('🏢', 'Department', employee.department || '—') +
          ROW('💼', 'Position',   employee.position   || '—')
        )}
      </div>
      <div style="padding:13px 18px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px;font-size:13px;color:#78350f;">
        🔒 You will be required to change your password on first login for security.
      </div>
      ${BTN('https://hrms.lumoslogic.com/login', 'Log In to Your Account')}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// ── Birthday Wish — sent to the employee ─────────────────────────────────────
function birthdayWishHtml(employee, orgName = '', orgEmail = '') {
  return WRAP(
    HEADER(orgName, `Happy Birthday, ${employee.name}!`, `Wishing you a wonderful day 🎂`, '🎂') +
    BODY(`
      ${GREETING(employee.name)}
      <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.8;text-align:center;">
        🎉 &nbsp;On behalf of everyone at <strong>${orgName || 'the team'}</strong>, we wish you a very <strong>Happy Birthday!</strong> &nbsp;🎉
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#64748b;text-align:center;line-height:1.7;">
        Wishing you a day filled with joy, laughter, and wonderful moments.<br/>
        Your dedication and hard work make our team truly special.
      </p>
      <div style="padding:20px;background:linear-gradient(135deg,#f0f3ff,#ede9fe);border-radius:10px;text-align:center;border:1px solid #c7c4d8;">
        <p style="margin:0;font-size:16px;color:#3525cd;font-weight:800;">🌟 Have a fantastic birthday! 🌟</p>
      </div>
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// ── Birthday Reminder — sent to HR the day before ────────────────────────────
function birthdayReminderHtml(employees, orgName = '', orgEmail = '') {
  const names = employees.map(e => `<strong>${e.name}</strong>`).join(' &amp; ');
  return WRAP(
    HEADER(orgName, 'Birthday Reminder', `Tomorrow${employees.length > 1 ? "'s birthdays" : "'s birthday"}`, '🎂') +
    BODY(`
      ${GREETING('HR Team')}
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;">
        This is a friendly reminder that tomorrow is the birthday of ${names}. Consider sending a wish or organizing a small celebration!
      </p>
      ${TABLE(employees.map(e =>
        ROW('🎂', e.name, `<span style="color:#3525cd;font-weight:600;">${e.department || 'N/A'}</span>`)
      ).join(''))}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// ── Holiday Reminder — sent to employees the day before ──────────────────────
function holidayReminderHtml(holiday, orgName = '', orgEmail = '') {
  const dateObj  = holiday.date ? new Date(holiday.date + 'T12:00:00') : null;
  const dateStr  = dateObj ? dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }) : holiday.date;
  return WRAP(
    HEADER(orgName, `Tomorrow is a Holiday`, `${holiday.name} — Holiday Reminder`, '🏖️') +
    BODY(`
      ${GREETING('Team')}
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;">
        This is to inform you that tomorrow, <strong>${dateStr}</strong>, will be observed as a holiday on account of <strong>${holiday.name}</strong>. Please plan your work and leaves accordingly.
      </p>
      ${TABLE(
        ROW('🗓️', 'Date',          dateStr) +
        ROW('🎯', 'Occasion',      `<strong>${holiday.name}</strong>`) +
        ROW('🏢', 'Applicable To', 'All Employees') +
        (holiday.description ? ROW('📝', 'Note', holiday.description) : '')
      )}
      ${BTN('https://hrms.lumoslogic.com/portal/team-calendar', 'View Holiday Calendar')}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// ── Dept Head Approval — leave forwarded to dept head ────────────────────────
function leaveDeptApprovalHtml(employee, leave, deptHeadName, orgName = '', orgEmail = '') {
  const type = LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type;
  return WRAP(
    HEADER(orgName, 'Leave Request — Your Approval Needed', 'Department Head Action Required', '👥') +
    BODY(`
      ${GREETING(deptHeadName || 'Department Head')}
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;">
        A leave request from your department requires your review before it proceeds to final approval.
      </p>
      ${TABLE(
        ROW('👤', 'Employee',   `<strong>${employee.name}</strong>`) +
        ROW('🏢', 'Department', employee.department || '—') +
        ROW('📅', 'Leave Type', type) +
        ROW('🗓️', 'From Date',  leave.start_date) +
        ROW('🗓️', 'To Date',    leave.end_date) +
        ROW('⏱️', 'Duration',   leave.leave_time === 'half' ? 'Half Day' : `${leave.start_date} → ${leave.end_date}`) +
        ROW('📝', 'Reason',     `<em style="color:#475569;">${leave.reason || 'No reason provided'}</em>`)
      )}
      <div style="margin-top:16px;padding:13px 18px;background:#f0f3ff;border-left:4px solid #3525cd;border-radius:6px;font-size:13px;color:#1e1b4b;">
        💡 You can forward this request for final approval. Only the admin can reject.
      </div>
      ${BTN('https://hrms.lumoslogic.com/portal/dept-approvals', 'Review Leave Request')}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// ── Forwarded to Root Admin ───────────────────────────────────────────────────
function leaveForwardedToRootHtml(employee, leave, deptHeadName, orgName = '', orgEmail = '') {
  const type = LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type;
  return WRAP(
    HEADER(orgName, 'Leave Request — Final Approval Needed', 'Forwarded by Department Head', '🔄') +
    BODY(`
      ${GREETING('Admin')}
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;">
        A leave request has been reviewed and forwarded by the Department Head and now requires <strong>your final decision</strong>.
      </p>
      ${TABLE(
        ROW('👤', 'Employee',     `<strong>${employee.name}</strong>`) +
        ROW('🏢', 'Department',   employee.department || '—') +
        ROW('📅', 'Leave Type',   type) +
        ROW('🗓️', 'From Date',    leave.start_date) +
        ROW('🗓️', 'To Date',      leave.end_date) +
        ROW('📝', 'Reason',       `<em style="color:#475569;">${leave.reason || 'No reason provided'}</em>`) +
        ROW('🔄', 'Forwarded By', `<strong>${deptHeadName}</strong> (Dept. Head)`)
      )}
      ${BTN('https://hrms.lumoslogic.com/root/pending-approvals', 'Give Final Decision')}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// ── New Org Registration — sent to platform admin ─────────────────────────────
function orgRequestReceivedHtml(req) {
  return WRAP(
    HEADER('HRMS by LumosLogic', 'New Organization Request', 'Awaiting your review', '🏢') +
    BODY(`
      ${GREETING('Platform Admin')}
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;">A new organization registration has been submitted and is awaiting your approval.</p>
      ${TABLE(
        ROW('🏢', 'Company Name',   `<strong>${req.company_name}</strong>`) +
        ROW('👤', 'Contact Person', req.contact_name) +
        ROW('📧', 'Email',          req.email) +
        (req.phone   ? ROW('📞', 'Phone',   req.phone)   : '') +
        (req.website ? ROW('🌐', 'Website', req.website) : '') +
        (req.message ? ROW('📝', 'Message', `<em>${req.message}</em>`) : '') +
        ROW('🕐', 'Submitted', new Date(req.created_at || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }))
      )}
      <div style="margin-top:16px;padding:13px 18px;background:#f0f3ff;border-left:4px solid #3525cd;border-radius:6px;font-size:13px;color:#1e1b4b;">
        Log in to the Platform Admin Dashboard to approve or reject this request.
      </div>
    `) +
    FOOTER(process.env.SMTP_USER || '', 'HRMS by LumosLogic')
  );
}

// ── Org Approved — sent to registrant ────────────────────────────────────────
function orgApprovedHtml(req, orgSlug, tempPassword) {
  return WRAP(
    HEADER('HRMS by LumosLogic', 'Organization Approved!', `${req.company_name} is now live on HRMS`, '🎉') +
    BODY(`
      ${GREETING(req.contact_name)}
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;">
        Congratulations! Your organization <strong>${req.company_name}</strong> has been approved and is now active. Use the credentials below to get started.
      </p>
      ${TABLE(
        ROW('🌐', 'Login URL',  `<a href="https://hrms.lumoslogic.com/login" style="color:#3525cd;font-weight:600;">https://hrms.lumoslogic.com/login</a>`) +
        ROW('📧', 'Email',      `<strong>${req.email}</strong>`) +
        ROW('🔑', 'Temp Password', `<code style="background:#f0f3ff;border:1px solid #c7c4d8;padding:3px 10px;border-radius:4px;font-family:monospace;">${tempPassword}</code>`)
      )}
      <div style="padding:13px 18px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px;font-size:13px;color:#78350f;margin-top:4px;">
        🔒 You will be asked to change your password on first login.
      </div>
      ${BTN('https://hrms.lumoslogic.com/login', 'Log In Now')}
    `) +
    FOOTER(process.env.SMTP_USER || '', 'HRMS by LumosLogic')
  );
}

// ── Org Rejected — sent to registrant ────────────────────────────────────────
function orgRejectedHtml(req, notes) {
  return WRAP(
    HEADER('HRMS by LumosLogic', 'Registration Update', 'Organization Request Status', '📋') +
    BODY(`
      ${GREETING(req.contact_name)}
      <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.7;">
        Thank you for your interest in HRMS by LumosLogic. Unfortunately, we were unable to approve the registration for <strong>${req.company_name}</strong> at this time.
      </p>
      ${notes ? `<div style="margin-bottom:16px;padding:13px 18px;background:#fff1f2;border-left:4px solid #ef4444;border-radius:6px;font-size:13px;color:#7f1d1d;"><strong>Reason:</strong>&nbsp;${notes}</div>` : ''}
      <p style="font-size:13px;color:#64748b;line-height:1.7;">For questions or to re-apply, please contact us at <a href="mailto:platform@lumoslogic.com" style="color:#3525cd;font-weight:600;">platform@lumoslogic.com</a>.</p>
    `) +
    FOOTER(process.env.SMTP_USER || '', 'HRMS by LumosLogic')
  );
}

// ── Password Reset ────────────────────────────────────────────────────────────
function passwordResetHtml(user, resetLink, orgName = '', orgEmail = '') {
  return WRAP(
    HEADER(orgName, 'Reset Your Password', 'We received a password reset request', '🔐') +
    BODY(`
      ${GREETING(user.name || 'User')}
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;">
        We received a request to reset your <strong>${orgName || 'HR'}</strong> account password. Click the button below to set a new password. This link will expire in <strong>1 hour</strong>.
      </p>
      ${BTN(resetLink, 'Reset My Password')}
      <p style="margin:20px 0 6px;font-size:12px;color:#64748b;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 20px;font-size:11px;word-break:break-all;background:#f7f8ff;padding:10px 14px;border-radius:6px;border:1px solid #e0e0f0;"><a href="${resetLink}" style="color:#3525cd;">${resetLink}</a></p>
      <div style="padding:13px 18px;background:#fff1f2;border-left:4px solid #ef4444;border-radius:6px;font-size:13px;color:#7f1d1d;">
        🔒 <strong>Security Notice:</strong> If you did not request this, please ignore this email. Your password will not be changed.
      </div>
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// ── Pre-Onboarding Document Request ──────────────────────────────────────────
function preOnboardingRequestHtml({ name, orgName, portalUrl, orgEmail = '' }) {
  const docs = [
    'Government-issued Photo ID (Aadhaar / Passport)',
    'PAN Card',
    'Educational Certificates (10th, 12th, Degree)',
    'Bank Passbook / Cancelled Cheque (for salary transfer)',
    'Passport-size Photograph',
    'Address Proof (utility bill / rent agreement)',
    'Previous Employment Documents (offer letter, relieving letter, if applicable)',
  ];
  return WRAP(
    HEADER(orgName, `Welcome, ${name}!`, 'Action Required Before Your First Day', '📄') +
    BODY(`
      ${GREETING(name)}
      <p style="margin:0 0 16px;font-size:14px;color:#334155;line-height:1.7;">
        We're excited to have you join <strong>${orgName}</strong>! Before onboarding begins, please upload the following documents so HR can verify them.
      </p>
      <p style="font-size:13px;font-weight:700;color:#1e1456;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.5px;">Required Documents:</p>
      <ul style="margin:0 0 24px;padding-left:22px;font-size:13px;color:#334155;line-height:2.2;">
        ${docs.map(d => `<li>${d}</li>`).join('')}
      </ul>
      ${BTN(portalUrl, 'Upload Documents Now')}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// ── Announcement ──────────────────────────────────────────────────────────────
const ANNTYPE = {
  general:     { icon: '📢', label: 'General',      bg: '#f0f3ff', border: '#3525cd', color: '#3525cd' },
  urgent:      { icon: '🚨', label: 'Urgent',        bg: '#fff1f2', border: '#ef4444', color: '#b91c1c' },
  policy:      { icon: '📋', label: 'Policy Update', bg: '#fffbeb', border: '#f59e0b', color: '#92400e' },
  celebration: { icon: '🎉', label: 'Celebration',   bg: '#ecfdf5', border: '#10b981', color: '#065f46' },
};

function announcementHtml(ann, orgName = '', orgEmail = '') {
  const cfg    = ANNTYPE[ann.type] || ANNTYPE.general;
  const expiry = ann.expires_at
    ? `<p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">⏳ This announcement expires on <strong>${ann.expires_at}</strong>.</p>`
    : '';
  return WRAP(
    HEADER(orgName, ann.title, 'New Announcement', cfg.icon) +
    BODY(`
      <div style="display:inline-block;background:${cfg.bg};border:1px solid ${cfg.border};color:${cfg.color};font-size:11px;font-weight:800;padding:4px 14px;border-radius:20px;margin-bottom:20px;text-transform:uppercase;letter-spacing:1px;">${cfg.icon}&nbsp;&nbsp;${cfg.label}</div>
      <p style="margin:0 0 20px;font-size:14px;white-space:pre-wrap;line-height:1.8;color:#1e293b;">${ann.content}</p>
      ${ann.file_url
        ? `<div style="margin-bottom:16px;">
             <a href="${ann.file_url}" style="display:inline-flex;align-items:center;gap:8px;background:#f0f3ff;border:1px solid #c7c4d8;color:#3525cd;text-decoration:none;font-weight:700;font-size:13px;padding:10px 18px;border-radius:8px;">📎&nbsp;&nbsp;View Attachment</a>
           </div>`
        : ''
      }
      <div style="padding:12px 16px;background:#f7f8ff;border-radius:8px;border:1px solid #e0e0f0;">
        <p style="margin:0;font-size:12px;color:#64748b;">Posted by&nbsp;&nbsp;<strong style="color:#1e1456;">${ann.creator_name || 'HR'}</strong></p>
      </div>
      ${expiry}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

module.exports = {
  sendMail, getTransporter, resetTransporter,
  leaveAppliedHtml, leaveStatusHtml, leaveDeptApprovalHtml, leaveForwardedToRootHtml,
  welcomeEmployeeHtml, birthdayWishHtml, birthdayReminderHtml, holidayReminderHtml,
  orgRequestReceivedHtml, orgApprovedHtml, orgRejectedHtml, passwordResetHtml,
  preOnboardingRequestHtml, announcementHtml,
};
