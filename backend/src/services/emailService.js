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

const WRAP = (inner) => `<!DOCTYPE html>
<html><body style="margin:0;padding:20px;background:#f0f3ff;font-family:Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;border-radius:12px;box-shadow:0 4px 24px rgba(53,37,205,0.10);">${inner}</div>
</body></html>`;

// orgName is shown large at top; title is the email subject line
const HEADER = (orgName, title, subtitle) => `
<div style="background:linear-gradient(135deg,#3525cd,#712ae2);padding:32px;border-radius:12px 12px 0 0;text-align:center;">
  <p style="margin:0 0 2px;font-size:10px;text-transform:uppercase;letter-spacing:3px;color:rgba(255,255,255,0.55);font-family:Arial,sans-serif;">HRMS by LumosLogic</p>
  <h1 style="margin:0 0 2px;font-size:26px;font-weight:900;color:#ffffff;font-family:Arial,sans-serif;">${orgName || 'HR System'}</h1>
  <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,0.5);font-family:Arial,sans-serif;">Human Resource Management System</p>
  <div style="border-top:1px solid rgba(255,255,255,0.2);margin:20px 0;"></div>
  <h2 style="margin:0 0 6px;font-size:19px;font-weight:bold;color:#ffffff;font-family:Arial,sans-serif;">${title}</h2>
  <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.75);font-family:Arial,sans-serif;">${subtitle}</p>
</div>`;

const BODY = (content) => `
<div style="background:#ffffff;padding:28px 32px;font-family:Arial,sans-serif;color:#1e293b;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
  ${content}
</div>`;

// orgEmail = org's HR admin email; fixed website + copyright
const FOOTER = (orgEmail = '', orgName = '') => `
<div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;padding:20px 32px 24px;border-radius:0 0 12px 12px;font-family:Arial,sans-serif;text-align:center;">
  <p style="margin:0 0 4px;font-size:12px;font-weight:bold;color:#475569;">Need Help?</p>
  <p style="margin:0 0 2px;font-size:12px;color:#64748b;">Email: <a href="mailto:${orgEmail || process.env.SMTP_USER || ''}" style="color:#3525cd;text-decoration:none;">${orgEmail || process.env.SMTP_USER || 'hr@company.com'}</a></p>
  <p style="margin:0 0 14px;font-size:12px;color:#64748b;">Website: <a href="https://hrms.lumoslogic.com/" style="color:#3525cd;text-decoration:none;">https://hrms.lumoslogic.com/</a></p>
  <div style="border-top:1px solid #e2e8f0;padding-top:14px;">
    <p style="margin:0 0 4px;font-size:11px;color:#94a3b8;">This is an automated email from HRMS by LumosLogic.<br/>Please do not reply to this email.</p>
    <p style="margin:6px 0 0;font-size:11px;color:#cbd5e1;">© ${new Date().getFullYear()} HRMS By Lumos Logic</p>
  </div>
</div>`;

const BTN = (href, label) => `
<div style="text-align:center;margin:24px 0 8px;">
  <a href="${href}" style="display:inline-block;background:linear-gradient(135deg,#3525cd,#712ae2);color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:13px 30px;border-radius:8px;box-shadow:0 4px 12px rgba(53,37,205,0.25);font-family:Arial,sans-serif;">${label}</a>
</div>`;

const ROW = (label, value) => `
<tr>
  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;width:38%;vertical-align:top;">${label}</td>
  <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${value}</td>
</tr>`;

const LEAVE_TYPE_LABEL = {
  annual:'Annual Leave', sick:'Sick Leave', casual:'Casual Leave',
  emergency:'Emergency Leave', other:'Other Leave',
};

// Email to HR when employee applies for leave
function leaveAppliedHtml(employee, leave, orgName = '', orgEmail = '') {
  const type = LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type;
  const duration = leave.leave_time === 'half'
    ? `Half Day — ${leave.half_type === 'first_half' ? 'First Half' : 'Second Half'}`
    : leave.leave_time === 'wfh' ? 'Work from Home'
    : `${leave.start_date} to ${leave.end_date}`;
  return WRAP(
    HEADER(orgName, 'New Leave Request', 'Action Required — Review & Approve') +
    BODY(`
      <p style="margin:0 0 16px;font-size:14px;">A new leave request requires your review and approval.</p>
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
      ${BTN('https://hrms.lumoslogic.com/leaves', 'Review Leave Request →')}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// Email to employee when leave is approved or rejected
function leaveStatusHtml(employee, leave, status, approverName, orgName = '', orgEmail = '') {
  const approved = status === 'approved';
  const color    = approved ? '#10b981' : '#ef4444';
  const badge    = approved ? '#dcfce7' : '#fee2e2';
  const type     = LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type;
  const msg      = approved ? 'Your leave request has been approved.' : 'Your leave request has been rejected.';
  return WRAP(
    HEADER(orgName, `Leave Request ${approved ? 'Approved ✓' : 'Rejected ✗'}`, 'Leave Status Update') +
    BODY(`
      <p style="margin:0 0 12px;font-size:14px;">Hello <strong>${employee.name}</strong>,</p>
      <div style="display:inline-block;background:${badge};color:${color};padding:5px 16px;border-radius:20px;font-weight:bold;font-size:13px;margin-bottom:16px;">${approved ? '✓ Approved' : '✗ Rejected'}</div>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;">${msg}</p>
      <table style="width:100%;border-collapse:collapse;">
        ${ROW('Leave Type',  type)}
        ${ROW('From Date',   leave.start_date)}
        ${ROW('To Date',     leave.end_date)}
        ${ROW('Decision by', approverName || 'HR')}
      </table>
      <div style="margin-top:16px;padding:12px 16px;background:${approved ? '#f0fdf4' : '#fff1f2'};border-left:4px solid ${color};border-radius:4px;font-size:13px;color:${approved ? '#14532d' : '#7f1d1d'};">
        ${approved ? 'Your attendance records have been updated accordingly.' : 'If you have questions, please contact your HR manager.'}
      </div>
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// Welcome email to new employees
function welcomeEmployeeHtml(employee, plainPassword, orgName = '', orgEmail = '') {
  return WRAP(
    HEADER(orgName, 'Welcome to the Team! 🎉', 'Your HR account has been created') +
    BODY(`
      <p style="margin:0 0 16px;font-size:14px;">Hello <strong>${employee.name}</strong>, welcome to ${orgName || 'the team'}! Your HR account is ready to use.</p>
      <div style="background:#f0f3ff;border:1px solid #c7c4d8;border-radius:8px;padding:16px 20px;margin-bottom:16px;">
        <p style="margin:0 0 10px;font-size:12px;font-weight:bold;color:#3525cd;text-transform:uppercase;letter-spacing:1px;">Your Login Credentials</p>
        <p style="margin:0 0 6px;font-size:14px;"><span style="color:#64748b;">Email:</span>&nbsp;&nbsp;<strong>${employee.email}</strong></p>
        <p style="margin:0;font-size:14px;"><span style="color:#64748b;">Password:</span>&nbsp;&nbsp;<code style="background:#ffffff;border:1px solid #c7c4d8;padding:3px 10px;border-radius:4px;font-family:monospace;">${plainPassword}</code></p>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${ROW('Department', employee.department || '-')}
        ${ROW('Position',   employee.position   || '-')}
      </table>
      <div style="margin-top:16px;padding:12px 16px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;font-size:13px;color:#78350f;">
        You will be prompted to change your password on first login.
      </div>
      ${BTN('https://hrms.lumoslogic.com/login', 'Log In to Your Account →')}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// Birthday wish email to employee
function birthdayWishHtml(employee, orgName = '', orgEmail = '') {
  return WRAP(
    HEADER(orgName, '🎂 Happy Birthday!', `Wishing you a wonderful day`) +
    BODY(`
      <p style="margin:0 0 16px;font-size:15px;text-align:center;">🎉 <strong>Happy Birthday, ${employee.name}!</strong> 🎉</p>
      <p style="margin:0 0 16px;font-size:14px;color:#475569;text-align:center;line-height:1.7;">
        Wishing you a wonderful birthday filled with joy and happiness.<br/>
        The whole ${orgName || 'team'} is glad to have you with us!
      </p>
      <div style="padding:16px;background:#f0f3ff;border-radius:10px;text-align:center;border:1px solid #c7c4d8;">
        <p style="margin:0;font-size:14px;color:#3525cd;font-weight:bold;">Have a fantastic day! 🌟</p>
      </div>
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// Birthday reminder to HR (day before)
function birthdayReminderHtml(employees, orgName = '', orgEmail = '') {
  const names = employees.map(e => `<strong>${e.name}</strong>`).join(', ');
  return WRAP(
    HEADER(orgName, '🎂 Birthday Reminder', 'Upcoming birthday tomorrow') +
    BODY(`
      <p style="margin:0 0 12px;font-size:14px;">Reminder: Tomorrow is the birthday of ${names}.</p>
      <p style="margin:0 0 16px;font-size:13px;color:#475569;">Consider sending a birthday wish or organizing a small celebration!</p>
      <table style="width:100%;border-collapse:collapse;">
        ${employees.map(e => ROW(e.name, `<span style="color:#3525cd;">${e.department || 'N/A'}</span>`)).join('')}
      </table>
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// Holiday reminder to employees (day before)
function holidayReminderHtml(holiday, orgName = '', orgEmail = '') {
  return WRAP(
    HEADER(orgName, `Tomorrow is a Holiday — ${holiday.name}`, 'Holiday Reminder') +
    BODY(`
      <p style="margin:0 0 8px;font-size:14px;">Hello Team,</p>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;">This is a reminder that <strong>tomorrow is a holiday</strong>. We hope you enjoy the day!</p>
      <table style="width:100%;border-collapse:collapse;">
        ${ROW('Holiday', `<strong>${holiday.name}</strong>`)}
        ${ROW('Date',    holiday.date)}
        ${ROW('Type',    holiday.type || 'Public Holiday')}
        ${holiday.description ? ROW('Note', `<em>${holiday.description}</em>`) : ''}
      </table>
      ${BTN('https://hrms.lumoslogic.com/portal/team-calendar', 'View Holiday Calendar →')}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// Email to dept head when leave needs their review
function leaveDeptApprovalHtml(employee, leave, deptHeadName, orgName = '', orgEmail = '') {
  const type = LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type;
  return WRAP(
    HEADER(orgName, 'Leave Request — Your Approval Needed', 'Department Head Action Required') +
    BODY(`
      <p style="margin:0 0 8px;font-size:14px;">Hello <strong>${deptHeadName || 'Department Head'}</strong>,</p>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;">A leave request from your department requires your review.</p>
      <table style="width:100%;border-collapse:collapse;">
        ${ROW('Employee',   `<strong>${employee.name}</strong>`)}
        ${ROW('Department', employee.department || '-')}
        ${ROW('Leave Type', type)}
        ${ROW('From Date',  leave.start_date)}
        ${ROW('To Date',    leave.end_date)}
        ${ROW('Duration',   leave.leave_time === 'half' ? 'Half Day' : `${leave.start_date} to ${leave.end_date}`)}
        ${ROW('Reason',     `<em style="color:#475569;">${leave.reason || 'No reason provided'}</em>`)}
      </table>
      <div style="margin-top:16px;padding:12px 16px;background:#f0f3ff;border-left:4px solid #3525cd;border-radius:4px;font-size:13px;color:#1e1b4b;">
        You can forward this request to the Root Admin for final approval.
      </div>
      ${BTN('https://hrms.lumoslogic.com/portal/dept-approvals', 'Review Leave Request →')}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// Email to root admin when dept head forwards leave
function leaveForwardedToRootHtml(employee, leave, deptHeadName, orgName = '', orgEmail = '') {
  const type = LEAVE_TYPE_LABEL[leave.leave_type] || leave.leave_type;
  return WRAP(
    HEADER(orgName, 'Leave Request — Final Approval Needed', 'Forwarded by Department Head') +
    BODY(`
      <p style="margin:0 0 20px;font-size:14px;color:#475569;">A leave request has been reviewed by the Department Head and requires your final decision.</p>
      <table style="width:100%;border-collapse:collapse;">
        ${ROW('Employee',     `<strong>${employee.name}</strong>`)}
        ${ROW('Department',   employee.department || '-')}
        ${ROW('Leave Type',   type)}
        ${ROW('From Date',    leave.start_date)}
        ${ROW('To Date',      leave.end_date)}
        ${ROW('Reason',       `<em style="color:#475569;">${leave.reason || 'No reason provided'}</em>`)}
        ${ROW('Forwarded By', `<strong>${deptHeadName}</strong> (Department Head)`)}
      </table>
      ${BTN('https://hrms.lumoslogic.com/root/pending-approvals', 'Give Final Decision →')}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// Org registration request — platform admin notification
function orgRequestReceivedHtml(req) {
  return WRAP(
    HEADER('HRMS by LumosLogic', 'New Organization Request', 'A company has requested to join') +
    BODY(`
      <p style="margin:0 0 16px;font-size:14px;">A new organization registration request has been submitted and is awaiting your review.</p>
      <table style="width:100%;border-collapse:collapse;">
        ${ROW('Company Name',   `<strong>${req.company_name}</strong>`)}
        ${ROW('Contact Person', req.contact_name)}
        ${ROW('Email',          req.email)}
        ${req.phone   ? ROW('Phone',   req.phone)   : ''}
        ${req.website ? ROW('Website', req.website) : ''}
        ${req.message ? ROW('Message', `<em>${req.message}</em>`) : ''}
        ${ROW('Submitted',      new Date(req.created_at || Date.now()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }))}
      </table>
      <div style="margin-top:16px;padding:12px 16px;background:#f0f3ff;border-left:4px solid #3525cd;border-radius:4px;font-size:13px;color:#1e1b4b;">
        Log in to the Platform Admin Dashboard to approve or reject this request.
      </div>
    `) +
    FOOTER(process.env.SMTP_USER || '', 'HRMS by LumosLogic')
  );
}

// Org approved — sent to registrant
function orgApprovedHtml(req, orgSlug, tempPassword) {
  return WRAP(
    HEADER('HRMS by LumosLogic', 'Organization Approved! 🎉', `${req.company_name} is now active`) +
    BODY(`
      <p style="margin:0 0 16px;font-size:14px;">Dear <strong>${req.contact_name}</strong>,</p>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;">Your organization <strong>${req.company_name}</strong> has been approved and is now active.</p>
      <div style="background:#f0f3ff;border:1px solid #c7c4d8;border-radius:8px;padding:16px 20px;margin-bottom:16px;">
        <p style="margin:0 0 10px;font-size:12px;font-weight:bold;color:#3525cd;text-transform:uppercase;letter-spacing:1px;">Your Login Credentials</p>
        <p style="margin:0 0 6px;font-size:14px;"><span style="color:#64748b;">Login URL:</span>&nbsp;&nbsp;<a href="https://hrms.lumoslogic.com/login" style="color:#3525cd;">https://hrms.lumoslogic.com/login</a></p>
        <p style="margin:0 0 6px;font-size:14px;"><span style="color:#64748b;">Email:</span>&nbsp;&nbsp;<strong>${req.email}</strong></p>
        <p style="margin:0;font-size:14px;"><span style="color:#64748b;">Temp Password:</span>&nbsp;&nbsp;<code style="background:#ffffff;border:1px solid #c7c4d8;padding:3px 10px;border-radius:4px;font-family:monospace;">${tempPassword}</code></p>
      </div>
      <div style="padding:12px 16px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;font-size:13px;color:#78350f;">
        You will be asked to change your password on first login.
      </div>
      ${BTN('https://hrms.lumoslogic.com/login', 'Log In Now →')}
    `) +
    FOOTER(process.env.SMTP_USER || '', 'HRMS by LumosLogic')
  );
}

// Org rejected — sent to registrant
function orgRejectedHtml(req, notes) {
  return WRAP(
    HEADER('HRMS by LumosLogic', 'Organization Request Update', 'Registration Status') +
    BODY(`
      <p style="margin:0 0 16px;font-size:14px;">Dear <strong>${req.contact_name}</strong>,</p>
      <p style="margin:0 0 16px;font-size:14px;color:#475569;">Thank you for your interest. Unfortunately, we were unable to approve the registration for <strong>${req.company_name}</strong> at this time.</p>
      ${notes ? `<div style="margin-bottom:16px;padding:12px 16px;background:#fff1f2;border-left:4px solid #ef4444;border-radius:4px;font-size:13px;color:#7f1d1d;"><strong>Reason:</strong> ${notes}</div>` : ''}
      <p style="font-size:13px;color:#64748b;">To re-apply or for any questions, contact us at <a href="mailto:platform@lumoslogic.com" style="color:#3525cd;">platform@lumoslogic.com</a>.</p>
    `) +
    FOOTER(process.env.SMTP_USER || '', 'HRMS by LumosLogic')
  );
}

// Password reset email
function passwordResetHtml(user, resetLink, orgName = '', orgEmail = '') {
  return WRAP(
    HEADER(orgName, 'Reset Your Password', 'Password reset request') +
    BODY(`
      <p style="margin:0 0 12px;font-size:14px;">Hello <strong>${user.name || 'User'}</strong>,</p>
      <p style="margin:0 0 20px;font-size:14px;color:#475569;">We received a request to reset your HR account password. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
      ${BTN(resetLink, 'Reset My Password')}
      <p style="margin:16px 0 4px;font-size:12px;color:#64748b;">If the button doesn't work, copy this link into your browser:</p>
      <p style="margin:0 0 16px;font-size:11px;word-break:break-all;"><a href="${resetLink}" style="color:#3525cd;">${resetLink}</a></p>
      <div style="padding:12px 16px;background:#fff1f2;border-left:4px solid #ef4444;border-radius:4px;font-size:13px;color:#7f1d1d;">
        <strong>Security notice:</strong> If you did not request this, ignore this email. Your password will not change.
      </div>
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// Pre-onboarding document request
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
    HEADER(orgName, `Welcome, ${name}! 👋`, 'Action Required Before Day 1') +
    BODY(`
      <p style="margin:0 0 16px;font-size:14px;">We're excited to have you join <strong>${orgName}</strong>! Please upload the following documents so HR can verify them before onboarding begins.</p>
      <p style="font-weight:bold;margin:0 0 8px;font-size:14px;">Required Documents:</p>
      <ul style="margin:0 0 20px;padding-left:20px;font-size:13px;color:#475569;line-height:2;">
        ${docs.map(d => `<li>${d}</li>`).join('')}
      </ul>
      ${BTN(portalUrl, 'Upload Documents →')}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

const TYPE_COLORS = {
  general:     { bg: '#f0f3ff', border: '#3525cd', text: '#3525cd', label: 'General' },
  urgent:      { bg: '#fff1f2', border: '#ef4444', text: '#b91c1c', label: 'Urgent' },
  policy:      { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', label: 'Policy Update' },
  celebration: { bg: '#ecfdf5', border: '#10b981', text: '#065f46', label: 'Celebration' },
};

// Announcement email to org members
function announcementHtml(ann, orgName = '', orgEmail = '') {
  const cfg    = TYPE_COLORS[ann.type] || TYPE_COLORS.general;
  const expiry = ann.expires_at
    ? `<p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">Expires on ${ann.expires_at}.</p>`
    : '';
  return WRAP(
    HEADER(orgName, `📢 ${ann.title}`, 'New Announcement') +
    BODY(`
      <div style="display:inline-block;background:${cfg.bg};border:1px solid ${cfg.border};color:${cfg.text};font-size:11px;font-weight:bold;padding:3px 12px;border-radius:20px;margin-bottom:16px;text-transform:uppercase;letter-spacing:.5px;">${cfg.label}</div>
      <p style="margin:0 0 16px;font-size:14px;white-space:pre-wrap;line-height:1.7;color:#1e293b;">${ann.content}</p>
      ${ann.file_url ? `<p style="margin:0 0 16px;font-size:13px;"><a href="${ann.file_url}" style="color:#3525cd;font-weight:bold;">View Attachment →</a></p>` : ''}
      <p style="margin:0;font-size:12px;color:#64748b;">Posted by <strong>${ann.creator_name || 'HR'}</strong></p>
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
