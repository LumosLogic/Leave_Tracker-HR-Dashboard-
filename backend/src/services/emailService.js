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

// BUG (email improvements): Compact layout — full width, smaller header, no emojis in icons
const WRAP = (inner) => `<!DOCTYPE html>
<html><body style="margin:0;padding:16px 8px;background:#eef0f8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:680px;margin:0 auto;">${inner}</div>
</body></html>`;

// Compact header — reduced height, removed large icon circle, smaller org name
const HEADER = (orgName, title, subtitle) => `
<div style="background:linear-gradient(135deg,#3525cd 0%,#5a3ce8 100%);padding:20px 28px 18px;border-radius:10px 10px 0 0;">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
    <div style="background:rgba(255,255,255,0.18);border-radius:8px;padding:6px 12px;display:inline-block;">
      <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:3px;color:rgba(255,255,255,0.85);font-family:Arial,sans-serif;">HRMS</span>
    </div>
    <span style="font-size:14px;font-weight:700;color:rgba(255,255,255,0.7);font-family:Arial,sans-serif;">${orgName || 'Lumos Logic'}</span>
  </div>
  <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#ffffff;font-family:Arial,sans-serif;">${title}</h2>
  <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.75);font-family:Arial,sans-serif;">${subtitle}</p>
</div>`;

const BODY = (content) => `
<div style="background:#ffffff;padding:24px 28px;font-family:Arial,sans-serif;color:#1e293b;border-left:1px solid #dde1f0;border-right:1px solid #dde1f0;">
  ${content}
</div>`;

// Table row — uses a simple dash label prefix instead of emojis (email-client-safe)
const ROW = (icon, label, value) => `
<tr>
  <td style="width:38%;padding:10px 14px;border-bottom:1px solid #e8eaf6;border-right:1px solid #e8eaf6;background:#f7f8ff;vertical-align:middle;">
    <span style="font-size:13px;font-weight:700;color:#1e1456;font-family:Arial,sans-serif;">${label}</span>
  </td>
  <td style="padding:10px 14px;border-bottom:1px solid #e8eaf6;font-size:13px;color:#334155;vertical-align:middle;font-family:Arial,sans-serif;">${value}</td>
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
<div style="background:#f0f3ff;border:1px solid #dde1f0;border-top:none;padding:16px 28px 18px;border-radius:0 0 10px 10px;font-family:Arial,sans-serif;">
  <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1e1456;font-family:Arial,sans-serif;">Need Help?</p>
  <p style="margin:0 0 3px;font-size:12px;color:#475569;font-family:Arial,sans-serif;">Email: <a href="mailto:${orgEmail || process.env.SMTP_USER || ''}" style="color:#3525cd;text-decoration:none;font-weight:600;">${orgEmail || process.env.SMTP_USER || 'hr@company.com'}</a></p>
  <p style="margin:0 0 12px;font-size:12px;color:#475569;font-family:Arial,sans-serif;">Portal: <a href="https://hrms.lumoslogic.com/" style="color:#3525cd;text-decoration:none;font-weight:600;">hrms.lumoslogic.com</a></p>
  <div style="border-top:1px solid #c7c4d8;margin:0 0 10px;"></div>
  <p style="margin:0;font-size:11px;color:#94a3b8;text-align:center;font-family:Arial,sans-serif;">Automated email from HRMS by LumosLogic &nbsp;&middot;&nbsp; Please do not reply &nbsp;&middot;&nbsp; &copy; ${new Date().getFullYear()}</p>
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
    HEADER(orgName, 'New Leave Request', 'Action Required — Please Review') +
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
      approved ? 'Your leave has been approved' : 'Your leave has been rejected'
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
    HEADER(orgName, 'Welcome to the Team!', "We're glad to have you with us") +
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
    HEADER(orgName, `Happy Birthday, ${employee.name}!`, 'Wishing you a wonderful day') +
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
    HEADER(orgName, 'Birthday Reminder', "Upcoming team birthday") +
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
    HEADER(orgName, `Tomorrow is a Holiday`, 'Plan your day accordingly') +
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
    HEADER(orgName, 'Leave Request — Your Approval Needed', 'Department Head Action Required') +
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
    HEADER(orgName, 'Leave Request — Final Approval Needed', 'Forwarded by Department Head') +
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
    HEADER('HRMS by LumosLogic', 'New Organization Request', 'Awaiting your review') +
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
    HEADER('HRMS by LumosLogic', 'Organization Approved!', 'Your organization is now live on HRMS') +
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
    HEADER('HRMS by LumosLogic', 'Registration Update', 'Organization Request Status') +
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
    HEADER(orgName, 'Reset Your Password', 'We received a password reset request') +
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
    HEADER(orgName, `Welcome, ${name}!`, 'Action Required Before Your First Day') +
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
    HEADER(orgName, ann.title, `New Announcement — ${cfg.label}`) +
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

// ── Send Login Credentials — admin-initiated temp password ────────────────────
function credentialsEmailHtml({ employee, tempPassword, orgName = '', orgEmail = '', portalUrl = 'https://hrms.lumoslogic.com' }) {
  return WRAP(
    HEADER(orgName, 'Your Login Credentials', 'Welcome — Your account is ready to access') +
    BODY(`
      ${GREETING(employee.name)}
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;">
        Your HR admin has set up access to the <strong>${orgName || 'HR'} portal</strong>. Use the credentials below to log in for the first time.
      </p>
      <div style="background:#f0f3ff;border:1px solid #c7c4d8;border-radius:10px;padding:20px 24px;margin-bottom:20px;">
        <p style="margin:0 0 12px;font-size:11px;font-weight:800;color:#3525cd;text-transform:uppercase;letter-spacing:2px;">Your Login Details</p>
        ${TABLE(
          ROW('🌐', 'Portal URL',  `<a href="${portalUrl}" style="color:#3525cd;font-weight:600;">${portalUrl}</a>`) +
          ROW('📧', 'Login Email', `<strong>${employee.email}</strong>`) +
          ROW('🔑', 'Temp Password', `<code style="background:#fff;border:1px solid #c7c4d8;padding:4px 12px;border-radius:6px;font-family:monospace;font-size:14px;letter-spacing:1px;">${tempPassword}</code>`) +
          (employee.department ? ROW('🏢', 'Department', employee.department) : '') +
          (employee.position   ? ROW('💼', 'Position',   employee.position)   : '')
        )}
      </div>
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:6px;padding:14px 18px;margin-bottom:20px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#92400e;">First Login Instructions</p>
        <ol style="margin:0;padding-left:18px;font-size:13px;color:#78350f;line-height:2;">
          <li>Click the Portal URL above or visit <a href="${portalUrl}" style="color:#3525cd;">${portalUrl}</a></li>
          <li>Enter your login email and the temporary password above</li>
          <li>You will be asked to <strong>set a new password</strong> immediately</li>
          <li>After changing your password, you'll be redirected to your dashboard</li>
        </ol>
      </div>
      <div style="background:#fff1f2;border-left:4px solid #ef4444;border-radius:6px;padding:12px 16px;">
        <p style="margin:0;font-size:12px;color:#7f1d1d;">🔒 <strong>Security:</strong> This temporary password expires once you set a new one. Do not share it with anyone.</p>
      </div>
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// ── Attendance: Late Check-in — sent to the employee ─────────────────────────
function lateCheckinHtml(employee, { date, workStartTime, lateThreshold, checkInTime, lateMinutes }, orgName = '', orgEmail = '') {
  const hrs  = Math.floor(lateMinutes / 60);
  const mins = lateMinutes % 60;
  const lateDuration = hrs > 0 ? `${hrs}h ${mins}m late` : `${mins} minutes late`;
  return WRAP(
    HEADER(orgName, 'Late Check-in Recorded', 'You checked in after the scheduled start time') +
    BODY(`
      ${GREETING(employee.name)}
      <p style="margin:0 0 16px;font-size:13px;color:#475569;line-height:1.6;">
        Our records show that your check-in today was <strong style="color:#f97316;">late</strong>. Please ensure timely attendance going forward.
      </p>
      ${TABLE(
        ROW('&ndash;', 'Date',                 date) +
        ROW('&ndash;', 'Scheduled Start',      workStartTime || '—') +
        ROW('&ndash;', 'Late Entry After',      lateThreshold || '—') +
        ROW('&ndash;', 'Actual Check-in',      `<strong style="color:#f97316;">${checkInTime}</strong>`) +
        ROW('&ndash;', 'Late by',              `<strong style="color:#ef4444;">${lateDuration}</strong>`)
      )}
      <div style="padding:11px 15px;background:#fff7ed;border-left:3px solid #f97316;border-radius:6px;font-size:12px;color:#7c2d12;margin-top:4px;">
        Please ensure you check in on time. Repeated late arrivals may impact your attendance record.
      </div>
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// ── Attendance: Daily Summary — sent to the employee only ────────────────────
// Status row removed. Late/Early Exit rows shown only if applicable (> 0).
// Compact 2-column grid layout replaces tall single-column table.
function dailyAttendanceSummaryHtml(employee, { date, checkIn, checkOut, workingHours, breakHours, totalDuration, lateMinutes, earlyExitMinutes }, orgName = '', orgEmail = '') {
  function fmtM(m) {
    if (!m || m <= 0) return null;
    const h = Math.floor(m / 60), mn = m % 60;
    return h > 0 ? `${h}h ${mn}m` : `${mn} min`;
  }

  // Compact 2-column card row — no emoji, flat labels
  const GR = (l1, v1, l2, v2) => `
  <tr>
    <td style="padding:10px 16px;border-bottom:1px solid #e8edf5;border-right:1px solid #e8edf5;width:50%;vertical-align:top;background:#f9faff;">
      <div style="font-size:10px;font-weight:700;color:#8896a5;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:3px;">${l1}</div>
      <div style="font-size:14px;font-weight:700;color:#1e293b;">${v1}</div>
    </td>
    <td style="padding:10px 16px;border-bottom:1px solid #e8edf5;width:50%;vertical-align:top;">
      ${l2 != null ? `<div style="font-size:10px;font-weight:700;color:#8896a5;text-transform:uppercase;letter-spacing:0.7px;margin-bottom:3px;">${l2}</div>
      <div style="font-size:14px;font-weight:700;color:#1e293b;">${v2 != null ? v2 : '—'}</div>` : ''}
    </td>
  </tr>`;

  const lateFmt  = fmtM(lateMinutes);
  const earlyFmt = fmtM(earlyExitMinutes);

  // Alert row — only rendered when at least one value is present
  let alertRow = '';
  if (lateFmt || earlyFmt) {
    alertRow = GR(
      lateFmt ? 'Late Duration' : 'Early Exit',
      lateFmt
        ? `<span style="color:#ef4444;font-weight:800;">${lateFmt}</span>`
        : `<span style="color:#f97316;font-weight:800;">${earlyFmt}</span>`,
      lateFmt && earlyFmt ? 'Early Exit' : null,
      lateFmt && earlyFmt ? `<span style="color:#f97316;font-weight:800;">${earlyFmt}</span>` : null
    );
  }

  return WRAP(
    HEADER(orgName, 'Attendance Summary', `Daily report — ${date}`) +
    BODY(`
      ${GREETING(employee.name)}
      <p style="margin:0 0 16px;font-size:13px;color:#475569;line-height:1.6;">Here is your attendance summary for today. Please contact HR if you notice any discrepancies.</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e8edf5;border-radius:8px;overflow:hidden;margin-bottom:16px;font-family:Arial,sans-serif;">
        ${GR('Date', date, 'Check-In', checkIn || '<span style="color:#94a3b8;">—</span>')}
        ${GR('Check-Out', checkOut || '<span style="color:#94a3b8;">—</span>', 'Working Hours', workingHours || '—')}
        ${GR('Break', breakHours || '—', 'Total Duration', totalDuration || '—')}
        ${alertRow}
      </table>
      <div style="padding:11px 15px;background:#f0f3ff;border-left:3px solid #3525cd;border-radius:6px;font-size:12px;color:#1e1456;margin-bottom:16px;">
        If you believe any data is incorrect, please submit an attendance regularization request.
      </div>
      ${BTN('https://hrms.lumoslogic.com/portal/attendance', 'View My Attendance')}
    `) +
    FOOTER(orgEmail, orgName)
  );
}

// ── Attendance: Work Appreciation — sent to the employee ─────────────────────
function workAppreciationHtml(employee, { date, workingHours, thresholdHours }, orgName = '', orgEmail = '') {
  return WRAP(
    HEADER(orgName, 'Thank You for Your Dedication!', `Outstanding effort today — ${date}`) +
    BODY(`
      ${GREETING(employee.name)}
      <p style="margin:0 0 20px;font-size:14px;color:#334155;line-height:1.7;">
        We want to take a moment to recognize your exceptional effort today. Your commitment and hard work inspire the entire team!
      </p>
      <div style="background:linear-gradient(135deg,#f0f3ff,#ede9fe);border:1px solid #c7c4d8;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#3525cd;text-transform:uppercase;letter-spacing:2px;">You Completed</p>
        <p style="margin:0;font-size:36px;font-weight:900;color:#1e1456;">${workingHours}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#64748b;">of productive work today</p>
      </div>
      ${TABLE(
        ROW('📅', 'Date',                date) +
        ROW('⏱️', 'Total Working Hours', `<strong style="color:#10b981;">${workingHours}</strong>`) +
        ROW('🎯', 'Appreciation Threshold', `${thresholdHours} Hours`)
      )}
      <div style="padding:16px 20px;background:#ecfdf5;border-left:4px solid #10b981;border-radius:6px;font-size:14px;color:#14532d;margin-top:8px;text-align:center;">
        🌟 Your dedication makes a real difference. Keep up the excellent work!
      </div>
    `) +
    FOOTER(orgEmail, orgName)
  );
}

module.exports = {
  sendMail, getTransporter, resetTransporter,
  leaveAppliedHtml, leaveStatusHtml, leaveDeptApprovalHtml, leaveForwardedToRootHtml,
  welcomeEmployeeHtml, birthdayWishHtml, birthdayReminderHtml, holidayReminderHtml,
  orgRequestReceivedHtml, orgApprovedHtml, orgRejectedHtml, passwordResetHtml,
  preOnboardingRequestHtml, announcementHtml, credentialsEmailHtml,
  lateCheckinHtml, dailyAttendanceSummaryHtml, workAppreciationHtml,
};
