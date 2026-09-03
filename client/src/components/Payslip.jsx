/**
 * Payslip.jsx — Common org-independent payslip component.
 *
 * Layout based on the Relitrade payslip format (the reference design).
 * All org-specific data is fetched dynamically:
 *   • Org name       ← GET /org/settings           (organizations.name)
 *   • Address / CIN  ← GET /payroll/settings        (payslip_company_*)
 *   • Footer note    ← GET /payroll/settings        (payslip_footer_note)
 *   • System logo    ← /LogoWithoutName.svg          (public asset, not org logo)
 *
 * Payslip values come exclusively from the stored payslips snapshot — no
 * salary recalculation happens here. The single source of truth is:
 *   Payroll run → payslips snapshot → this component renders it.
 */
import React, { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, X } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { MONTHS } from '@/lib/utils';

const num    = n => Number(n || 0);
const fmtAmt = n =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Number to words (Indian system) ──────────────────────────────────────────
function toWords(amount) {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
    'Seventeen','Eighteen','Nineteen'];
  const tens  = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];

  function convert(n) {
    if (n < 20)       return ones[n];
    if (n < 100)      return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000)     return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 100000)   return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  }

  const rupees = Math.floor(amount);
  const paise  = Math.round((amount - rupees) * 100);
  let words    = 'Rupees ' + (rupees > 0 ? convert(rupees) : 'Zero');
  if (paise > 0) words += ' and ' + convert(paise) + ' Paise';
  return words + ' Only';
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Payslip({ payslipId, onClose }) {
  const printRef = useRef(null);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: slip, isLoading } = useQuery({
    queryKey: ['payslip-details', payslipId],
    queryFn:  () => apiGet(`/payroll/payslips/${payslipId}/details`),
    enabled:  Boolean(payslipId),
  });

  // Org name + logo from organizations table
  const { data: orgSettings, isFetched: orgFetched } = useQuery({
    queryKey: ['org-settings'],
    queryFn:  () => apiGet('/org/settings'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Payslip branding fields from payroll_settings
  const { data: payrollSettings } = useQuery({
    queryKey: ['payroll-settings'],
    queryFn:  () => apiGet('/payroll/settings'),
    staleTime: 5 * 60 * 1000,
  });

  // Employee statutory info
  const { data: statutory } = useQuery({
    queryKey: ['emp-statutory', slip?.user_id],
    queryFn:  () => apiGet(`/profile/${slip.user_id}/statutory`),
    enabled:  !!slip?.user_id,
  });

  // Employee banking info
  const { data: bankingData } = useQuery({
    queryKey: ['emp-banking', slip?.user_id],
    queryFn:  () => apiGet(`/profile/${slip.user_id}/banking`),
    enabled:  !!slip?.user_id,
  });
  const banking = Array.isArray(bankingData) ? bankingData[0] : bankingData;

  // ── Org-specific details (dynamic, graceful if unconfigured) ──────────────
  const orgName    = orgSettings?.name || '';
  const orgAddress = payrollSettings?.payslip_company_address || '';
  const orgCin     = payrollSettings?.payslip_company_cin || '';
  const footerNote = payrollSettings?.payslip_footer_note ||
    'This is a computer generated salary slip and does not require a signature.';

  // ── Print handler ─────────────────────────────────────────────────────────
  function handlePrint() {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(`<!DOCTYPE html><html><head><title>Payslip - ${slip?.name || ''}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:Arial,sans-serif;font-size:10px;color:#000;background:#fff}
        .payslip{max-width:800px;margin:10px auto;padding:20px;border:1px solid #ccc}
        table{width:100%;border-collapse:collapse;font-size:9.5px}
        th,td{border:1px solid #aaa;padding:3px 6px}
        th{background:#e8e8e8;font-weight:bold;text-align:left}
        .tright{text-align:right}
        .bold{font-weight:bold}
        .bg{background:#f0f0f0}
        .note{font-size:8px;text-align:center;margin-top:12px;color:#555;border-top:1px solid #ddd;padding-top:6px}
        @page{size:A4;margin:10mm}
        @media print{body{-webkit-print-color-adjust:exact}}
      </style></head><body>${content}</body></html>`);
    win.document.close();
    win.focus();
    // Wait for all images to load before printing so logo isn't blank
    const imgs = win.document.images;
    if (imgs.length === 0) { win.print(); win.close(); return; }
    let loaded = 0;
    const total = imgs.length;
    const done = () => { if (++loaded >= total) { win.print(); win.close(); } };
    Array.from(imgs).forEach(img => {
      if (img.complete) { done(); }
      else { img.onload = done; img.onerror = done; }
    });
  }

  if (isLoading || !orgFetched) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl p-8 flex items-center gap-3">
        <span className="w-5 h-5 border-2 border-[#3525cd]/20 border-t-[#3525cd] rounded-full animate-spin" />
        <span className="text-sm text-[#464555]">Loading payslip…</span>
      </div>
    </div>
  );

  if (!slip) return null;

  // ── Computed values ───────────────────────────────────────────────────────
  const monthNum   = typeof slip.month === 'string' ? parseInt(slip.month, 10) : num(slip.month);
  const monthLabel = MONTHS[monthNum - 1] || slip.month;

  const earningRows = [
    { label: 'Basic',             value: num(slip.basic) },
    { label: 'HRA',               value: num(slip.hra) },
    { label: 'DA',                value: num(slip.da) },
    { label: 'Conveyance',        value: num(slip.transport_allowance) },
    { label: 'Medical Allowance', value: num(slip.medical_allowance) },
    { label: 'Special Allowance', value: num(slip.special_allowance) },
    { label: 'Other Allowance',   value: num(slip.other_allowances) },
  ].filter(r => r.value > 0);

  const deductionRows = [
    { label: 'PF (Employee)',    value: num(slip.pf_employee) },
    { label: 'ESI (Employee)',   value: num(slip.esi_employee) },
    { label: 'PT',               value: num(slip.professional_tax) },
    { label: 'TDS',              value: num(slip.tds) },
    { label: 'Retention',        value: num(slip.retention) },
    { label: 'Other Deductions', value: num(slip.other_deductions) },
    { label: `LOP (${num(slip.lop_days)} day${num(slip.lop_days) === 1 ? '' : 's'})`,
      value: num(slip.lop_amount) },
  ].filter(r => r.value > 0);

  const maxRows    = Math.max(earningRows.length, deductionRows.length);
  const grossSalary = num(slip.gross_salary);
  const totalDed    = num(slip.total_deductions);
  const netSalary   = num(slip.net_salary);

  const pan       = statutory?.pan_number   || '';
  const uan       = statutory?.uan_no        || '';
  const esiNo     = statutory?.esi_no        || 'N/A';
  const pfNo      = statutory?.pf_no         || '';
  const bankName  = banking?.bank_name        || '';
  const accNo     = banking?.account_number   || '';
  const maskedAcc = accNo
    ? accNo.slice(0, -4).replace(/\d/g, '*') + accNo.slice(-4)
    : '';

  let attSnap = {};
  try {
    attSnap = typeof slip.attendance_snapshot === 'string'
      ? JSON.parse(slip.attendance_snapshot)
      : (slip.attendance_snapshot || {});
  } catch {}

  const presentFull  = attSnap.presentFull  ?? num(slip.present_days);
  const presentHalf  = attSnap.presentHalf  ?? 0;
  const weekoff      = attSnap.weekoff      ?? 0;
  const paidHoliday  = attSnap.holiday      ?? 0;
  const paidLeave    = attSnap.paidLeave    ?? num(slip.leave_days);
  const lopDays      = num(slip.lop_days);
  const totalCalDays = num(slip.working_days) + weekoff + paidHoliday;
  const presentStr   = (presentFull + presentHalf * 0.5).toFixed(presentHalf ? 1 : 0);

  // Org logo — use uploaded logo if available, else fall back to system logo
  const orgLogoUrl = orgSettings?.logo_url
    || (typeof window !== 'undefined' ? `${window.location.origin}/LogoWithoutName.svg` : '/LogoWithoutName.svg');

  // Build right-side org header lines (graceful degradation when fields are empty)
  const orgHeaderLines = [
    orgName    ? `<div style="font-size:12px;font-weight:bold">${orgName}</div>` : '',
    orgCin     ? `<div style="font-size:9px;color:#444;margin-top:2px">${orgCin}</div>` : '',
    ...(orgAddress
      ? orgAddress.split('\n').map(line =>
          `<div style="font-size:9px;color:#444;margin-top:1px">${line}</div>`)
      : []),
  ].filter(Boolean).join('');

  // ── Print HTML (inline, no React classes — must survive popup window) ─────
  const payslipHtml = `
  <div class="payslip">
    <table style="border:none;margin-bottom:12px">
      <tr>
        <td style="border:none;width:38%;vertical-align:top">
          <img src="${orgLogoUrl}" alt="${orgName}"
            style="max-width:160px;max-height:60px;object-fit:contain" />
        </td>
        <td style="border:none;width:62%;text-align:right;vertical-align:top">
          ${orgHeaderLines || `<div style="font-size:12px;font-weight:bold">${orgName || 'Organization'}</div>`}
        </td>
      </tr>
    </table>

    <div style="text-align:center;font-weight:bold;font-size:11px;border-top:1px solid #999;border-bottom:1px solid #999;padding:4px 0;margin:8px 0">
      Salary Slip for the Month of ${monthLabel} ${slip.year}
    </div>

    <table style="border:none;margin-bottom:8px;font-size:9.5px">
      <tr>
        <td style="border:none;font-weight:bold;padding:2px 4px;width:15%">Employee ID</td>
        <td style="border:none;padding:2px 4px;width:35%">: ${slip.employee_id || slip.user_id}</td>
        <td style="border:none;font-weight:bold;padding:2px 4px;width:18%">Company P.F. No</td>
        <td style="border:none;padding:2px 4px"></td>
      </tr>
      <tr>
        <td style="border:none;font-weight:bold;padding:2px 4px">Employee Name</td>
        <td style="border:none;padding:2px 4px">: ${slip.name}</td>
        <td style="border:none;font-weight:bold;padding:2px 4px">P.F. No</td>
        <td style="border:none;padding:2px 4px">: ${pfNo}</td>
      </tr>
      <tr>
        <td style="border:none;font-weight:bold;padding:2px 4px">Designation</td>
        <td style="border:none;padding:2px 4px">: ${slip.position || '—'}</td>
        <td style="border:none;font-weight:bold;padding:2px 4px">UAN No.</td>
        <td style="border:none;padding:2px 4px">: ${uan}</td>
      </tr>
      <tr>
        <td style="border:none;font-weight:bold;padding:2px 4px">Department</td>
        <td style="border:none;padding:2px 4px">: ${slip.department || '—'}</td>
        <td style="border:none;font-weight:bold;padding:2px 4px">ESI No.</td>
        <td style="border:none;padding:2px 4px">: ${esiNo}</td>
      </tr>
      <tr>
        <td style="border:none;font-weight:bold;padding:2px 4px">Bank Name</td>
        <td style="border:none;padding:2px 4px">: ${bankName || '—'}</td>
        <td style="border:none;font-weight:bold;padding:2px 4px">PAN No.</td>
        <td style="border:none;padding:2px 4px">: ${pan}</td>
      </tr>
      <tr>
        <td style="border:none;font-weight:bold;padding:2px 4px">Bank A/c No.</td>
        <td style="border:none;padding:2px 4px">: ${maskedAcc || '—'}</td>
        <td style="border:none;font-weight:bold;padding:2px 4px">Attendance</td>
        <td style="border:none;padding:2px 4px">: ${presentStr} out of ${totalCalDays}</td>
      </tr>
    </table>

    <table>
      <thead>
        <tr>
          <th style="width:25%">Actuals</th>
          <th style="width:12%;text-align:right">Amount(Rs)</th>
          <th style="width:25%">Earnings</th>
          <th style="width:12%;text-align:right">Amount(Rs)</th>
          <th style="width:15%">Deductions</th>
          <th style="width:11%;text-align:right">Amount(Rs)</th>
        </tr>
      </thead>
      <tbody>
        ${Array.from({ length: maxRows }).map((_, i) => {
          const er = earningRows[i];
          const dr = deductionRows[i];
          return `<tr>
            <td>${er?.label || ''}</td>
            <td class="tright">${er ? fmtAmt(er.value) : ''}</td>
            <td>${er?.label || ''}</td>
            <td class="tright">${er ? fmtAmt(er.value) : ''}</td>
            <td>${dr?.label || ''}</td>
            <td class="tright">${dr ? fmtAmt(dr.value) : ''}</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr class="bg bold">
          <td>Total</td>
          <td class="tright">${fmtAmt(grossSalary)}</td>
          <td>Gross</td>
          <td class="tright">${fmtAmt(grossSalary)}</td>
          <td>Deduction</td>
          <td class="tright">${fmtAmt(totalDed)}</td>
        </tr>
        <tr>
          <td colspan="4" style="font-size:9px;font-style:italic">
            In Word: ${toWords(netSalary)}
          </td>
          <td class="bold bg">Net Salary</td>
          <td class="tright bold">${fmtAmt(netSalary)}</td>
        </tr>
      </tfoot>
    </table>

    <div style="font-size:8.5px;margin-top:6px;color:#444;border-top:1px solid #ddd;padding-top:4px">
      P+OD: ${(presentFull + presentHalf * 0.5).toFixed(2)}&nbsp;
      W/Off: ${weekoff.toFixed(2)}&nbsp;
      WOP: ${weekoff.toFixed(2)}&nbsp;
      LWP\\LOP: ${lopDays.toFixed(2)}&nbsp;
      RHP: 0.00&nbsp;
      HL: ${paidHoliday.toFixed(2)}&nbsp;
      C/Off: 0.00&nbsp;
      CL: ${paidLeave.toFixed(2)}&nbsp;
      PL: 0.00&nbsp; SL: 0.00&nbsp; AL: 0.00&nbsp; EL: 0.00&nbsp; VL: 0.00
    </div>

    <div class="note">${footerNote}</div>
    <div style="text-align:center;font-size:7.5px;color:#aaa;margin-top:4px">HRMS by Lumos Logic</div>
  </div>`;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(4,6,14,.7)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#e7eefe] flex-shrink-0">
          <div>
            <p className="font-black text-[#151c27] text-sm">Salary Slip — {slip.name}</p>
            <p className="text-xs text-[#777587]">{monthLabel} {slip.year}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 bg-[#3525cd] text-white rounded-xl text-xs font-bold hover:bg-[#2a1fb0] transition-colors">
              <Printer size={13} /> Print / Save PDF
            </button>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-[#f0f3ff] flex items-center justify-center">
              <X size={16} className="text-[#777587]" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-4 bg-[#f8f9ff]">
          <div ref={printRef} className="bg-white shadow-sm"
            dangerouslySetInnerHTML={{ __html: payslipHtml }} />
        </div>
      </div>
    </div>
  );
}
