'use strict';

const { pool } = require('../config/db');

const CHUNK_SIZE     = parseInt(process.env.PAYROLL_EMAIL_CHUNK_SIZE     || '10', 10);
const CHUNK_DELAY_MS = parseInt(process.env.PAYROLL_EMAIL_CHUNK_DELAY_MS || '500', 10);
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function sleep(ms)   { return new Promise(r => setTimeout(r, ms)); }
function fmtINR(n)   { return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }

// ─── Lazy SMTP transport ──────────────────────────────────────────────────────
// Reuses the same env vars as emailService.js — no separate credentials needed.
let _transport = null;
function getTransport() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  if (_transport) return _transport;
  const nodemailer = require('nodemailer');
  const pass = (process.env.SMTP_PASS || '').replace(/\s/g, '');
  _transport = nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth:   { user: process.env.SMTP_USER, pass },
  });
  return _transport;
}

// ─── PDF generation ───────────────────────────────────────────────────────────
// Requires pdfkit: npm install pdfkit
// Gracefully returns null if pdfkit is not installed — email is sent without attachment.
async function generatePayslipPDF(payslip, employee, orgName) {
  let PDFDocument;
  try { PDFDocument = require('pdfkit'); }
  catch { return null; }

  return new Promise((resolve, reject) => {
    const chunks = [];

    const pwdEnabled = process.env.PAYROLL_PDF_PASSWORD_ENABLED === 'true';
    const usePassword = pwdEnabled && Boolean(employee.employee_id);
    const password   = usePassword ? `${employee.employee_id}${payslip.year}` : undefined;

    const opts = { margin: 40, size: 'A4', bufferPages: true };
    if (usePassword) { opts.userPassword = password; opts.ownerPassword = password; }

    const doc = new PDFDocument(opts);
    doc.on('data',  c => chunks.push(c));
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const monthLabel = MONTHS[parseInt(String(payslip.month), 10) - 1] || payslip.month;
    const period     = `${monthLabel} ${payslip.year}`;
    const W          = 515; // usable width between margins

    // ── Header ────────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#3525cd')
       .text(orgName, 40, 40, { width: W, align: 'center' });
    doc.font('Helvetica').fontSize(11).fillColor('#464555')
       .text(`Pay Slip — ${period}`, { width: W, align: 'center' });
    doc.moveDown(0.4);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(1.5).strokeColor('#3525cd').stroke();
    doc.moveDown(0.5);

    // ── Employee Block ────────────────────────────────────────────────────────
    const ey = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor('#777587');
    doc.text('Employee Name', 40, ey);
    doc.text('Employee ID',   40, ey + 14);
    doc.text('Department',    40, ey + 28);
    doc.text('Pay Period',   300, ey);
    doc.font('Helvetica-Bold').fillColor('#151c27');
    doc.text(employee.name        || '—', 145, ey);
    doc.text(employee.employee_id || '—', 145, ey + 14);
    doc.text(employee.department  || '—', 145, ey + 28);
    doc.text(period,                       370, ey);
    doc.moveDown(3);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(0.5).strokeColor('#c7c4d8').stroke();
    doc.moveDown(0.5);

    // ── Table Header ──────────────────────────────────────────────────────────
    const tY = doc.y;
    const c1=40, c2=215, c3=295, c4=470;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#3525cd');
    doc.text('Earnings',   c1, tY, { width: 170 });
    doc.text('Amount',     c2, tY, { width: 75, align: 'right' });
    doc.text('Deductions', c3, tY, { width: 170 });
    doc.text('Amount',     c4, tY, { width: 80, align: 'right' });
    doc.moveDown(0.25);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(0.5).strokeColor('#c7c4d8').stroke();

    const earnings = [
      ['Basic',             payslip.basic],
      ['HRA',               payslip.hra],
      ['Dearness Allow.',   payslip.da],
      ['Transport Allow.',  payslip.transport_allowance],
      ['Medical Allow.',    payslip.medical_allowance],
      ['Special Allow.',    payslip.special_allowance  || 0],
      ['Other Allow.',      payslip.other_allowances   || 0],
    ].filter(([, v]) => Number(v) > 0);

    const deductions = [
      ['PF (Employee)',      payslip.pf_employee],
      ['ESI (Employee)',     payslip.esi_employee],
      ['Professional Tax',   payslip.professional_tax],
      ['TDS',                payslip.tds],
      ['Other Deductions',   payslip.other_deductions],
      [`LOP (${Number(payslip.lop_days || 0)} day${Number(payslip.lop_days) === 1 ? '' : 's'})`, payslip.lop_amount],
    ].filter(([, v]) => Number(v) > 0);

    let rY = doc.y + 5;
    doc.font('Helvetica').fontSize(9).fillColor('#151c27');
    const maxRows = Math.max(earnings.length, deductions.length);
    for (let i = 0; i < maxRows; i++) {
      const e = earnings[i];
      const d = deductions[i];
      if (e) {
        doc.text(e[0], c1, rY, { width: 170 });
        doc.text(fmtINR(e[1]), c2, rY, { width: 75, align: 'right' });
      }
      if (d) {
        doc.text(d[0], c3, rY, { width: 170 });
        doc.text(fmtINR(d[1]), c4, rY, { width: 80, align: 'right' });
      }
      rY += 13;
    }

    rY += 4;
    doc.moveTo(40, rY).lineTo(555, rY).lineWidth(0.5).strokeColor('#c7c4d8').stroke();
    rY += 6;

    // ── Totals ────────────────────────────────────────────────────────────────
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#151c27');
    doc.text('Gross Salary',      c1, rY, { width: 170 });
    doc.text(fmtINR(payslip.gross_salary),    c2, rY, { width: 75, align: 'right' });
    doc.text('Total Deductions',  c3, rY, { width: 170 });
    doc.text(fmtINR(payslip.total_deductions),c4, rY, { width: 80, align: 'right' });
    rY += 16;
    doc.moveTo(40, rY).lineTo(555, rY).lineWidth(2).strokeColor('#3525cd').stroke();
    rY += 8;

    doc.font('Helvetica-Bold').fontSize(13).fillColor('#3525cd');
    doc.text('Net Salary', c1, rY);
    doc.text(fmtINR(payslip.net_salary), c1, rY, { width: W, align: 'right' });
    rY += 26;

    // ── Attendance summary ────────────────────────────────────────────────────
    doc.moveTo(40, rY).lineTo(555, rY).lineWidth(0.5).strokeColor('#e2e0f0').stroke();
    rY += 7;
    doc.font('Helvetica').fontSize(8).fillColor('#777587');
    doc.text(
      `Working Days: ${payslip.working_days || 0}  |  Present: ${Number(payslip.present_days || 0)}  |  ` +
      `Absent: ${payslip.absent_days || 0}  |  LOP Days: ${Number(payslip.lop_days || 0)}`,
      40, rY, { width: W, align: 'center' }
    );
    rY += 20;

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.moveTo(40, rY).lineTo(555, rY).lineWidth(0.5).strokeColor('#e2e0f0').stroke();
    rY += 7;
    doc.fontSize(7).fillColor('#aaaaaa');
    doc.text('This is a computer-generated payslip and does not require a signature.', 40, rY, { width: W, align: 'center' });
    if (usePassword) {
      doc.moveDown(0.3);
      doc.text(`PDF password: Employee ID + Year  (e.g. ${employee.employee_id}${payslip.year})`, { width: W, align: 'center' });
    }

    doc.end();
  });
}

// ─── HTML email body ──────────────────────────────────────────────────────────
function payslipEmailHtml(payslip, employee, orgName, period) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:20px;background:#f0f3ff;font-family:Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;">
  <div style="background:#3525cd;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h2 style="color:#fff;margin:0;font-size:17px;">${orgName}</h2>
    <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:12px;">Payslip for ${period}</p>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e2e0f0;border-top:none;border-radius:0 0 8px 8px;">
    <p style="color:#151c27;margin:0 0 12px;">Dear <strong>${employee.name}</strong>,</p>
    <p style="color:#464555;margin:0 0 16px;font-size:13px;">Your payslip for <strong>${period}</strong> has been generated. Please find the PDF attached.</p>
    <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;background:#f9f9ff;">
      <tr><td style="padding:9px 14px;color:#777587;font-size:12px;">Gross Salary</td>
          <td style="padding:9px 14px;text-align:right;font-weight:bold;color:#151c27;">${fmtINR(payslip.gross_salary)}</td></tr>
      <tr style="background:#fff;"><td style="padding:9px 14px;color:#777587;font-size:12px;">Total Deductions</td>
          <td style="padding:9px 14px;text-align:right;font-weight:bold;color:#e53e3e;">${fmtINR(payslip.total_deductions)}</td></tr>
      <tr style="border-top:2px solid #3525cd;background:#f0f3ff;">
          <td style="padding:11px 14px;color:#3525cd;font-weight:900;font-size:14px;">Net Salary</td>
          <td style="padding:11px 14px;text-align:right;color:#3525cd;font-weight:900;font-size:14px;">${fmtINR(payslip.net_salary)}</td></tr>
    </table>
    <p style="margin-top:18px;font-size:11px;color:#777587;">This is an automated email. Please do not reply.</p>
  </div>
</div></body></html>`;
}

// ─── Send one payslip email ───────────────────────────────────────────────────
async function sendOnePayslipEmail({ transport, payslip, employee, orgName, month, year }) {
  const monthLabel = MONTHS[month - 1] || String(month);
  const period     = `${monthLabel} ${year}`;
  const fromAddr   = process.env.SMTP_FROM || `"${orgName}" <${process.env.SMTP_USER}>`;
  const safeName   = (employee.employee_id || employee.name || 'employee').replace(/\W+/g, '_');
  const filename   = `Payslip_${safeName}_${String(month).padStart(2, '0')}_${year}.pdf`;

  const pdfBuffer  = await generatePayslipPDF(payslip, employee, orgName);
  const attachments = pdfBuffer
    ? [{ filename, content: pdfBuffer, contentType: 'application/pdf' }]
    : [];

  await transport.sendMail({
    from:    fromAddr,
    to:      employee.email,
    subject: `Your Payslip for ${period} — ${orgName}`,
    html:    payslipEmailHtml(payslip, employee, orgName, period),
    ...(attachments.length ? { attachments } : {}),
  });
}

// ─── Batch email sending ──────────────────────────────────────────────────────
async function sendPayslipsBatch({ organizationId, runId, month, year }) {
  const transport = getTransport();
  if (!transport) {
    console.warn('[PayrollEmail] SMTP not configured — skipping email delivery');
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const orgRes  = await pool.query('SELECT name FROM organizations WHERE id = $1', [organizationId]);
  const orgName = orgRes.rows[0]?.name || 'Company';

  const { rows } = await pool.query(
    `SELECT pre.user_id, pre.payslip_id,
            u.name, u.email, u.employee_id, u.department,
            ps.gross_salary, ps.total_deductions, ps.net_salary,
            ps.basic, ps.hra, ps.da, ps.transport_allowance, ps.medical_allowance,
            ps.special_allowance, ps.other_allowances,
            ps.pf_employee, ps.esi_employee, ps.professional_tax, ps.tds,
            ps.other_deductions, ps.lop_days, ps.lop_amount,
            ps.working_days, ps.present_days, ps.absent_days, ps.month, ps.year
       FROM payroll_run_employees pre
       JOIN  users    u  ON u.id   = pre.user_id
       JOIN  payslips ps ON ps.id  = pre.payslip_id
      WHERE pre.payroll_run_id  = $1
        AND pre.organization_id = $2
        AND pre.status          = 'success'
        AND u.email IS NOT NULL AND u.email != ''
      ORDER BY u.name ASC`,
    [runId, organizationId]
  );

  let sent = 0, failed = 0, skipped = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);

    await Promise.all(chunk.map(async emp => {
      try {
        await sendOnePayslipEmail({
          transport,
          payslip:  emp,
          employee: { name: emp.name, email: emp.email, employee_id: emp.employee_id, department: emp.department },
          orgName,
          month,
          year,
        });

        await pool.query(
          `INSERT INTO payroll_email_log
             (organization_id, payroll_run_id, payslip_id, user_id, email_address, status)
           VALUES ($1,$2,$3,$4,$5,'sent')`,
          [organizationId, runId, emp.payslip_id, emp.user_id, emp.email]
        );
        sent++;
      } catch (err) {
        const msg = (err.message || 'Unknown').substring(0, 500);
        await pool.query(
          `INSERT INTO payroll_email_log
             (organization_id, payroll_run_id, payslip_id, user_id, email_address, status, error_message)
           VALUES ($1,$2,$3,$4,$5,'failed',$6)`,
          [organizationId, runId, emp.payslip_id, emp.user_id, emp.email, msg]
        ).catch(() => {});
        failed++;
        console.error(`[PayrollEmail] Failed → ${emp.email}:`, err.message);
      }
    }));

    if (i + CHUNK_SIZE < rows.length) await sleep(CHUNK_DELAY_MS);
  }

  console.log(`[PayrollEmail] Org ${organizationId} run ${runId}: sent=${sent} failed=${failed} skipped=${skipped}`);
  return { sent, failed, skipped };
}

module.exports = { sendPayslipsBatch, generatePayslipPDF };
