'use strict';
/**
 * payrollBankService.js — Phase 3.6
 * Generates bank transfer files for salary disbursement.
 *
 * Supported formats: generic | hdfc | icici | sbi | axis
 * Architecture: each format is a pure function (rows → CSV string).
 * Adding a new bank = add one entry to FORMATS and one formatter function.
 *
 * Bank account details are pulled from users.bank_account_number and
 * users.bank_ifsc_code if those columns exist; falls back to empty strings.
 */

const { pool } = require('../config/db');

function esc(v) {
  const s = String(v ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

function amt(v) { return Number(v || 0).toFixed(2); }

// ── Data fetch ────────────────────────────────────────────────────────────────
async function fetchDisbursementRows(organizationId, runId) {
  const { rows } = await pool.query(
    `SELECT
         u.name            AS employee_name,
         u.employee_id,
         u.email,
         u.bank_account_number,
         u.bank_ifsc_code,
         u.bank_name,
         u.department,
         ps.net_salary,
         ps.adjustment_total,
         (ps.net_salary + COALESCE(ps.adjustment_total, 0)) AS payable_amount,
         ps.month,
         ps.year
       FROM payslips ps
       JOIN users u ON u.id = ps.user_id
      WHERE ps.payroll_run_id  = $1
        AND ps.organization_id = $2
        AND ps.status IN ('generated', 'published')
      ORDER BY u.name ASC`,
    [runId, Number(organizationId)]
  );
  return rows;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatGeneric(rows) {
  const header = 'Employee Name,Employee ID,Bank Account,IFSC Code,Bank Name,Payable Amount,Month,Year\n';
  const body   = rows.map(r =>
    [r.employee_name, r.employee_id, r.bank_account_number || '', r.bank_ifsc_code || '',
     r.bank_name || '', amt(r.payable_amount), r.month, r.year
    ].map(esc).join(',')
  ).join('\n');
  return header + body + '\n';
}

function formatHdfc(rows) {
  // HDFC Corporate Salary Upload format
  const header = 'Beneficiary Account Number,Beneficiary Name,Amount,Beneficiary IFSC Code,Payment Date,Remarks\n';
  const today  = new Date().toLocaleDateString('en-GB').split('/').join('-');
  const body   = rows.map(r =>
    [
      r.bank_account_number || '',
      r.employee_name,
      amt(r.payable_amount),
      r.bank_ifsc_code || '',
      today,
      `Salary ${r.month}/${r.year}`,
    ].map(esc).join(',')
  ).join('\n');
  return header + body + '\n';
}

function formatIcici(rows) {
  // ICICI Corporate Salary format
  const header = 'SrNo,TransactionType,BeneName,AccountNumber,IFSCCode,Amount,Remarks\n';
  const body   = rows.map((r, i) =>
    [
      i + 1,
      'NEFT',
      r.employee_name,
      r.bank_account_number || '',
      r.bank_ifsc_code || '',
      amt(r.payable_amount),
      `Salary ${r.month}/${r.year}`,
    ].map(esc).join(',')
  ).join('\n');
  return header + body + '\n';
}

function formatSbi(rows) {
  // SBI Corporate Banking format
  const header = 'Beneficiary Account Number,Beneficiary Name,Beneficiary Bank,Beneficiary IFSC,Payment Mode,Amount,Customer Reference\n';
  const body   = rows.map(r =>
    [
      r.bank_account_number || '',
      r.employee_name,
      r.bank_name || '',
      r.bank_ifsc_code || '',
      'NEFT',
      amt(r.payable_amount),
      `SAL-${r.employee_id}-${r.month}${r.year}`,
    ].map(esc).join(',')
  ).join('\n');
  return header + body + '\n';
}

function formatAxis(rows) {
  // Axis Bank salary upload format
  const header = 'Beneficiary Code,Beneficiary Name,Credit Account Number,Credit Amount,Debit Account Number,Beneficiary IFSC,Payment Ref\n';
  const body   = rows.map(r =>
    [
      r.employee_id || '',
      r.employee_name,
      r.bank_account_number || '',
      amt(r.payable_amount),
      '',  // debit account filled by bank portal
      r.bank_ifsc_code || '',
      `SAL${r.month}${r.year}${r.employee_id}`,
    ].map(esc).join(',')
  ).join('\n');
  return header + body + '\n';
}

const FORMATS = {
  generic: formatGeneric,
  hdfc:    formatHdfc,
  icici:   formatIcici,
  sbi:     formatSbi,
  axis:    formatAxis,
};

// ── Public API ────────────────────────────────────────────────────────────────
async function generateBankFile({ organizationId, runId, format = 'generic' }) {
  const formatter = FORMATS[format.toLowerCase()];
  if (!formatter) {
    throw Object.assign(
      new Error(`Unsupported bank format '${format}'. Supported: ${Object.keys(FORMATS).join(', ')}`),
      { status: 400 }
    );
  }

  const rows = await fetchDisbursementRows(organizationId, runId);
  if (!rows.length) {
    throw Object.assign(new Error('No published payslips found for this payroll run'), { status: 404 });
  }

  const csv = formatter(rows);
  return {
    csv,
    format,
    rowCount: rows.length,
    totalAmount: rows.reduce((s, r) => s + Number(r.payable_amount || 0), 0),
    filename: `salary_${format}_run${runId}_${new Date().toISOString().split('T')[0]}.csv`,
  };
}

module.exports = {
  generateBankFile,
  SUPPORTED_FORMATS: Object.keys(FORMATS),
};
