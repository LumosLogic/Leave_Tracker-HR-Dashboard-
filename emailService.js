require('dotenv').config();
const nodemailer = require('nodemailer');

// Transporter is created lazily so missing creds don't crash the server on startup
let _transporter = null;
function getTransporter() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  if (!_transporter) {
    // Remove spaces from App Password (Google shows it with spaces, but SMTP needs it without)
    const pass = (process.env.SMTP_PASS || '').replace(/\s/g, '');
    _transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',   // works for both @gmail.com and Google Workspace
      port: 587,
      secure: false,
      auth: { user: process.env.SMTP_USER, pass },
    });
  }
  return _transporter;
}

async function sendMail({ to, subject, html }) {
  const transport = getTransporter();
  if (!transport) return; // SMTP not configured — silently skip
  try {
    await transport.sendMail({
      from: `"HR Tracker" <${process.env.SMTP_USER}>`,
      to: Array.isArray(to) ? [...new Set(to.filter(Boolean))].join(', ') : to,
      subject,
      html,
    });
  } catch (err) {
    console.error('[Email] Failed to send:', err.message);
  }
}

// ─── Notification recipients ───────────────────────────────────────────────────
function getNotifyList() {
  return [
    process.env.HR_EMAIL,
    process.env.COMPANY_HEAD_1_EMAIL,
    process.env.COMPANY_HEAD_2_EMAIL,
  ].filter(Boolean);
}

// ─── Templates ────────────────────────────────────────────────────────────────

const HEADER = (title, sub) => `
<div style="background:linear-gradient(135deg,#3525cd,#712ae2);padding:24px 32px;border-radius:12px 12px 0 0;">
  <h1 style="color:#fff;margin:0;font-size:20px;font-family:Arial,sans-serif;">${title}</h1>
  <p  style="color:rgba(255,255,255,.75);margin:4px 0 0;font-size:13px;font-family:Arial,sans-serif;">${sub}</p>
</div>`;

const FOOTER = `<p style="margin:20px 0 0;font-size:11px;color:#94a3b8;font-family:Arial,sans-serif;">
  This is an automated message from HR Tracker. Please do not reply to this email.
</p>`;

const WRAP = (inner) => `<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0f3ff;">
<div style="max-width:580px;margin:0 auto;">${inner}</div></body></html>`;

const BODY = (content) => `
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;padding:24px 32px;border-radius:0 0 12px 12px;font-family:Arial,sans-serif;color:#1e293b;">
  ${content}
</div>`;

const ROW = (label, value) => `
<tr>
  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;width:38%;vertical-align:top;">${label}</td>
  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;">${value}</td>
</tr>`;

const LEAVE_TYPE_LABEL = {
  annual:'Annual Leave', sick:'Sick Leave', casual:'Casual Leave',
  emergency:'Emergency Leave', other:'Other Leave',
};

// Email to HR + company heads when an employee applies for leave
function leaveAppliedHtml(employee, leave) {
  const type     = LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type;
  const duration = leave.leave_time === 'half'
    ? `Half Day — ${leave.half_type === 'first_half' ? 'First Half' : 'Second Half'}`
    : leave.leave_time === 'wfh'
      ? 'Work from Home'
      : `${leave.start_date} to ${leave.end_date}`;

  return WRAP(
    HEADER('New Leave Request', 'HR Tracker — Action Required') +
    BODY(`
      <p style="margin:0 0 16px;">A new leave request requires your review and approval.</p>
      <table style="width:100%;border-collapse:collapse;">
        ${ROW('Employee',   `<strong>${employee.name}</strong>`)}
        ${ROW('Email',      employee.email || '-')}
        ${ROW('Department', employee.department || '-')}
        ${ROW('Leave Type', type)}
        ${ROW('Duration',   duration)}
        ${ROW('From Date',  leave.start_date)}
        ${ROW('To Date',    leave.end_date)}
        ${ROW('Reason',     `<em style="color:#475569;">${leave.reason || 'No reason provided'}</em>`)}
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="${process.env.FRONTEND_URL || 'https://hrms.lumoslogic.com'}/leaves" 
           style="display:inline-block;background:linear-gradient(135deg,#3525cd,#712ae2);color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 28px;border-radius:8px;box-shadow:0 4px 12px rgba(53,37,205,0.25);">
          Review Leave Request →
        </a>
      </div>

      ${FOOTER}
    `)
  );
}

// Email to employee when leave is approved or rejected
function leaveStatusHtml(employee, leave, status, approverName) {
  const approved = status === 'approved';
  const color    = approved ? '#10b981' : '#ef4444';
  const badge    = approved ? '#dcfce7' : '#fee2e2';
  const type     = LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type;
  const msg      = approved
    ? 'Great news! Your leave request has been approved.'
    : 'Unfortunately, your leave request has been rejected.';

  return WRAP(
    HEADER(`Leave Request ${approved ? 'Approved' : 'Rejected'}`, 'HR Tracker — Leave Status Update') +
    BODY(`
      <div style="display:inline-block;background:${badge};color:${color};padding:5px 14px;border-radius:20px;font-weight:bold;font-size:13px;margin-bottom:16px;">${approved ? 'Approved' : 'Rejected'}</div>
      <p style="margin:0 0 16px;">Dear <strong>${employee.name}</strong>, ${msg}</p>
      <table style="width:100%;border-collapse:collapse;">
        ${ROW('Leave Type', type)}
        ${ROW('From Date',  leave.start_date)}
        ${ROW('To Date',    leave.end_date)}
        ${ROW('Decision by', approverName || 'HR')}
      </table>
      ${approved
        ? `<div style="margin-top:20px;padding:12px 16px;background:#f0fdf4;border-left:4px solid #10b981;border-radius:4px;font-size:13px;color:#14532d;">Your attendance records have been updated accordingly.</div>`
        : `<div style="margin-top:20px;padding:12px 16px;background:#fff1f2;border-left:4px solid #ef4444;border-radius:4px;font-size:13px;color:#7f1d1d;">If you have any questions, please contact your HR manager.</div>`
      }
      ${FOOTER}
    `)
  );
}

// Welcome email to new employees with credentials
function welcomeEmployeeHtml(employee, plainPassword) {
  return WRAP(
    HEADER('Welcome to HR Tracker!', 'Your employee account has been created') +
    BODY(`
      <p style="margin:0 0 16px;">Hello <strong>${employee.name}</strong>, your HR Tracker account is ready to use.</p>
      <div style="background:#fff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin-bottom:16px;">
        <p style="margin:0 0 10px;font-size:13px;color:#1e40af;font-weight:bold;">Your Login Credentials</p>
        <p style="margin:0 0 6px;font-size:14px;"><span style="color:#64748b;">Email:</span> &nbsp;<strong>${employee.email}</strong></p>
        <p style="margin:0;font-size:14px;"><span style="color:#64748b;">Password:</span> &nbsp;<code style="background:#f1f5f9;padding:3px 10px;border-radius:4px;font-family:monospace;">${plainPassword}</code></p>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${ROW('Department', employee.department || '-')}
        ${ROW('Position',   employee.position   || '-')}
      </table>
      <div style="margin-top:20px;padding:12px 16px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;font-size:13px;color:#78350f;">
        For security, you will be prompted to change your password on first login.
      </div>
      ${FOOTER}
    `)
  );
}

// Birthday wish email to the employee
function birthdayWishHtml(employee) {
  return WRAP(
    `<div style="background:linear-gradient(135deg,#3525cd,#712ae2);padding:24px 32px;border-radius:12px 12px 0 0;text-align:center;">
      <div style="font-size:48px;margin-bottom:8px;">🎂</div>
      <h1 style="color:#fff;margin:0;font-size:22px;font-family:Arial,sans-serif;">Happy Birthday!</h1>
      <p style="color:rgba(255,255,255,.75);margin:6px 0 0;font-size:13px;font-family:Arial,sans-serif;">From everyone at the team</p>
    </div>` +
    BODY(`
      <p style="margin:0 0 16px;font-size:15px;text-align:center;">
        🎉 <strong>Happy Birthday, ${employee.name}!</strong> 🎉
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#475569;text-align:center;line-height:1.6;">
        Wishing you a wonderful birthday filled with joy and happiness.<br />
        The whole team is glad to have you with us!
      </p>
      <div style="margin:24px 0;padding:16px;background:#f0f3ff;border-radius:10px;text-align:center;border:1px solid #c7c4d8;">
        <p style="margin:0;font-size:13px;color:#3525cd;font-weight:bold;">Have a fantastic day! 🌟</p>
      </div>
      ${FOOTER}
    `)
  );
}

// Birthday reminder email to HR (day before)
function birthdayReminderHtml(employees) {
  const names = employees.map(e => `<strong>${e.name}</strong>`).join(', ');
  return WRAP(
    HEADER('Birthday Reminder', 'Lumens HR — Upcoming Birthday Alert') +
    BODY(`
      <p style="margin:0 0 16px;">🎂 Reminder: Tomorrow is the birthday of ${names}.</p>
      <p style="margin:0 0 16px;font-size:13px;color:#475569;">
        Consider sending a birthday wish or organizing a small celebration for your team members!
      </p>
      <table style="width:100%;border-collapse:collapse;">
        ${employees.map(e => ROW(e.name, `<span style="color:#3525cd;">${e.department || 'N/A'}</span>`)).join('')}
      </table>
      ${FOOTER}
    `)
  );
}

// Holiday reminder email to all employees (day before)
function holidayReminderHtml(holiday) {
  return WRAP(
    HEADER(`Tomorrow is a Holiday — ${holiday.name}`, 'Lumens HR — Holiday Reminder') +
    BODY(`
      <p style="margin:0 0 16px;">Hello Team,</p>
      <p style="margin:0 0 16px;">This is a friendly reminder that <strong>tomorrow is a holiday</strong>.</p>
      <table style="width:100%;border-collapse:collapse;">
        ${ROW('Holiday',     `<strong>${holiday.name}</strong>`)}
        ${ROW('Date',        holiday.date)}
        ${ROW('Type',        holiday.type || 'Public Holiday')}
        ${holiday.description ? ROW('Note', `<em>${holiday.description}</em>`) : ''}
      </table>
      <div style="margin-top:20px;padding:12px 16px;background:#f0f3ff;border-left:4px solid #3525cd;border-radius:4px;font-size:13px;color:#1e1b4b;">
        Enjoy your holiday! 🎉
      </div>
      ${FOOTER}
    `)
  );
}

// Org registration request received — notify platform admin
function orgRequestReceivedHtml(req) {
  return WRAP(
    HEADER('New Organization Request', 'A company has requested to join LeaveTracker') +
    BODY(`
      <p style="margin:0 0 16px;">A new organization registration request has been submitted and is awaiting your review.</p>
      <table style="width:100%;border-collapse:collapse;">
        ${ROW('Company Name',  `<strong>${req.company_name}</strong>`)}
        ${ROW('Contact Person', req.contact_name)}
        ${ROW('Email',          req.email)}
        ${req.phone   ? ROW('Phone',   req.phone)   : ''}
        ${req.website ? ROW('Website', req.website) : ''}
        ${req.message ? ROW('Message', `<em>${req.message}</em>`) : ''}
        ${ROW('Submitted',     new Date(req.created_at || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }))}
      </table>
      <div style="margin-top:20px;padding:12px 16px;background:#f0f3ff;border-left:4px solid #3525cd;border-radius:4px;font-size:13px;color:#1e1b4b;">
        Please log in to the Platform Admin Dashboard to approve or reject this request.
      </div>
      ${FOOTER}
    `)
  );
}

// Org approved — sent to the registrant with credentials
function orgApprovedHtml(req, orgSlug, tempPassword) {
  return WRAP(
    HEADER('Welcome to LeaveTracker! 🎉', 'Your organization has been approved') +
    BODY(`
      <p style="margin:0 0 16px;">Dear <strong>${req.contact_name}</strong>,</p>
      <p style="margin:0 0 16px;">Great news! Your organization <strong>${req.company_name}</strong> has been approved and is now active on LeaveTracker.</p>
      <div style="background:#fff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin-bottom:16px;">
        <p style="margin:0 0 10px;font-size:13px;color:#1e40af;font-weight:bold;">Your Login Credentials</p>
        <p style="margin:0 0 6px;font-size:14px;"><span style="color:#64748b;">Login URL:</span> &nbsp;<a href="https://leavetrackerbylumos.web.app/login" style="color:#3525cd;">leavetrackerbylumos.web.app/login</a></p>
        <p style="margin:0 0 6px;font-size:14px;"><span style="color:#64748b;">Organization Slug:</span> &nbsp;<code style="background:#f1f5f9;padding:3px 10px;border-radius:4px;font-family:monospace;">${orgSlug}</code></p>
        <p style="margin:0 0 6px;font-size:14px;"><span style="color:#64748b;">Email:</span> &nbsp;<strong>${req.email}</strong></p>
        <p style="margin:0;font-size:14px;"><span style="color:#64748b;">Temporary Password:</span> &nbsp;<code style="background:#f1f5f9;padding:3px 10px;border-radius:4px;font-family:monospace;">${tempPassword}</code></p>
      </div>
      <div style="margin-top:16px;padding:12px 16px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;font-size:13px;color:#78350f;">
        For security, you will be asked to change your password on first login.
      </div>
      <p style="margin-top:16px;font-size:13px;color:#64748b;">Share your organization slug <code style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-family:monospace;">${orgSlug}</code> with your employees when they log in.</p>
      ${FOOTER}
    `)
  );
}

// Org rejected — sent to the registrant
function orgRejectedHtml(req, notes) {
  return WRAP(
    HEADER('Organization Request Update', 'LeaveTracker Registration') +
    BODY(`
      <p style="margin:0 0 16px;">Dear <strong>${req.contact_name}</strong>,</p>
      <p style="margin:0 0 16px;">Thank you for your interest in LeaveTracker. Unfortunately, we were unable to approve your organization registration for <strong>${req.company_name}</strong> at this time.</p>
      ${notes ? `<div style="margin-bottom:16px;padding:12px 16px;background:#fff1f2;border-left:4px solid #ef4444;border-radius:4px;font-size:13px;color:#7f1d1d;"><strong>Reason:</strong> ${notes}</div>` : ''}
      <p style="font-size:13px;color:#64748b;">If you believe this was an error or would like to re-apply, please contact us at <a href="mailto:platform@lumoslogic.com" style="color:#3525cd;">platform@lumoslogic.com</a>.</p>
      ${FOOTER}
    `)
  );
}

// Password reset email
function passwordResetHtml(user, resetLink) {
  return WRAP(
    HEADER('Reset Your Password', 'HR Tracker — Password Reset Request') +
    BODY(`
      <p style="margin:0 0 16px;">Hello <strong>${user.name || 'User'}</strong>,</p>
      <p style="margin:0 0 16px;">We received a request to reset your HR Tracker account password. Click the button below to set a new password. This link will expire in <strong>1 hour</strong>.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${resetLink}"
           style="display:inline-block;background:#3525cd;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px;font-family:Arial,sans-serif;">
          Reset My Password
        </a>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#64748b;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 16px;font-size:12px;word-break:break-all;"><a href="${resetLink}" style="color:#3525cd;">${resetLink}</a></p>
      <div style="margin-top:20px;padding:12px 16px;background:#fff1f2;border-left:4px solid #ef4444;border-radius:4px;font-size:13px;color:#7f1d1d;">
        <strong>Security notice:</strong> If you did not request a password reset, please ignore this email. Your password will not be changed.
      </div>
      ${FOOTER}
    `)
  );
}

module.exports = { sendMail, getNotifyList, leaveAppliedHtml, leaveStatusHtml, welcomeEmployeeHtml, birthdayWishHtml, birthdayReminderHtml, holidayReminderHtml, orgRequestReceivedHtml, orgApprovedHtml, orgRejectedHtml, passwordResetHtml };
