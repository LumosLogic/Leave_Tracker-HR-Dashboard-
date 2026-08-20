// Pure CTC-to-salary-breakdown calculator.
// Mirrors the logic used at save time so the form preview is always accurate.

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

export const EARNING_KEYS   = ['basic','hra','da','transport_allowance','medical_allowance','special_allowance','other_allowance'];
export const DEDUCTION_KEYS = ['employee_pf','employee_esi','professional_tax','tds','other_deductions','retention'];
export const EMPLOYER_KEYS  = ['employer_pf','employer_esi'];

export const ALL_COMPONENT_KEYS = [...EARNING_KEYS, ...DEDUCTION_KEYS, ...EMPLOYER_KEYS];

export const DEFAULT_SALARY_RULES = {
  enabled: false,
  components: [
    // ── Earnings ──────────────────────────────────────────────────────────────
    { key: 'basic',               label: 'Basic',               group: 'earning',   enabled: true,  method: 'percentage', value: 40,    base: 'gross',  cap: null, threshold_enabled: false, threshold_type: 'gross_max', threshold_value: null },
    { key: 'hra',                 label: 'HRA',                 group: 'earning',   enabled: true,  method: 'percentage', value: 50,    base: 'basic',  cap: null, threshold_enabled: false, threshold_type: 'gross_max', threshold_value: null },
    { key: 'da',                  label: 'DA',                  group: 'earning',   enabled: false, method: 'percentage', value: 0,     base: 'basic',  cap: null, threshold_enabled: false, threshold_type: 'gross_max', threshold_value: null },
    { key: 'transport_allowance', label: 'Transport Allowance', group: 'earning',   enabled: true,  method: 'fixed',      value: 1600,  base: null,     cap: null, threshold_enabled: false, threshold_type: 'gross_max', threshold_value: null },
    { key: 'medical_allowance',   label: 'Medical Allowance',   group: 'earning',   enabled: true,  method: 'fixed',      value: 1250,  base: null,     cap: null, threshold_enabled: false, threshold_type: 'gross_max', threshold_value: null },
    { key: 'special_allowance',   label: 'Special Allowance',   group: 'earning',   enabled: true,  method: 'remaining',  value: 0,     base: null,     cap: null, threshold_enabled: false, threshold_type: 'gross_max', threshold_value: null },
    { key: 'other_allowance',     label: 'Other Allowance',     group: 'earning',   enabled: false, method: 'manual',     value: 0,     base: null,     cap: null, threshold_enabled: false, threshold_type: 'gross_max', threshold_value: null },
    // ── Employee Deductions ───────────────────────────────────────────────────
    { key: 'employee_pf',         label: 'PF (Employee)',        group: 'deduction', enabled: true,  method: 'percentage', value: 12,    base: 'basic',  cap: 1800, threshold_enabled: false, threshold_type: 'gross_max', threshold_value: null },
    { key: 'employee_esi',        label: 'ESI (Employee)',       group: 'deduction', enabled: true,  method: 'percentage', value: 0.75,  base: 'gross',  cap: null, threshold_enabled: true,  threshold_type: 'gross_max', threshold_value: 21000 },
    { key: 'professional_tax',    label: 'Professional Tax',     group: 'deduction', enabled: true,  method: 'fixed',      value: 200,   base: null,     cap: null, threshold_enabled: false, threshold_type: 'gross_max', threshold_value: null },
    { key: 'tds',                 label: 'TDS',                  group: 'deduction', enabled: false, method: 'manual',     value: 0,     base: null,     cap: null, threshold_enabled: false, threshold_type: 'gross_max', threshold_value: null },
    { key: 'other_deductions',    label: 'Other Deductions',     group: 'deduction', enabled: false, method: 'manual',     value: 0,     base: null,     cap: null, threshold_enabled: false, threshold_type: 'gross_max', threshold_value: null },
    { key: 'retention',           label: 'Retention',            group: 'deduction', enabled: false, method: 'manual',     value: 0,     base: null,     cap: null, threshold_enabled: false, threshold_type: 'gross_max', threshold_value: null },
    // ── Employer Contributions ────────────────────────────────────────────────
    { key: 'employer_pf',         label: 'PF (Employer)',         group: 'employer',  enabled: true,  method: 'percentage', value: 12,    base: 'basic',  cap: 1800, threshold_enabled: false, threshold_type: 'gross_max', threshold_value: null },
    { key: 'employer_esi',        label: 'ESI (Employer)',        group: 'employer',  enabled: true,  method: 'percentage', value: 3.25,  base: 'gross',  cap: null, threshold_enabled: true,  threshold_type: 'gross_max', threshold_value: 21000 },
  ],
};

/** Merge saved DB rules with defaults (adds any missing keys from defaults). */
export function mergeWithDefaults(savedRules) {
  if (!savedRules) return { ...DEFAULT_SALARY_RULES };
  const defaultMap = Object.fromEntries(DEFAULT_SALARY_RULES.components.map(c => [c.key, c]));
  const savedMap   = Object.fromEntries((savedRules.components || []).map(c => [c.key, c]));
  const merged = DEFAULT_SALARY_RULES.components.map(d => ({ ...d, ...(savedMap[d.key] || {}) }));
  return { enabled: savedRules.enabled ?? false, components: merged };
}

/**
 * Calculate a full salary breakdown from CTC + org rules.
 *
 * @param {number} ctc  - monthly CTC (cost to company)
 * @param {object} rules - merged salary_calculation_rules
 * @param {object} manualOverrides - { key: number } for fields with method='manual'
 * @returns {object|null}  Full breakdown, or null if rules disabled / CTC invalid
 */
export function calculateFromCTC(ctc, rules, manualOverrides = {}) {
  if (!ctc || ctc <= 0 || !rules?.enabled) return null;

  const getComp = key => rules.components?.find(c => c.key === key);

  function applyRule(rule, ctx) {
    if (!rule || !rule.enabled) return 0;
    if (rule.method === 'manual')    return r2(manualOverrides[rule.key] ?? 0);
    if (rule.method === 'fixed')     return r2(Number(rule.value || 0));
    if (rule.method === 'remaining') return 0;
    if (rule.method === 'percentage') {
      if (rule.threshold_enabled && rule.threshold_type === 'gross_max' && ctx.gross > Number(rule.threshold_value || 0)) return 0;
      const base = rule.base === 'basic' ? ctx.basic
                 : rule.base === 'gross' ? ctx.gross
                 : rule.base === 'ctc'   ? ctc
                 : 0;
      let v = r2((Number(rule.value || 0) / 100) * base);
      if (rule.cap) v = Math.min(v, r2(Number(rule.cap)));
      return v;
    }
    return 0;
  }

  // ── Iterative solve ──────────────────────────────────────────────────────────
  // Employer contributions depend on basic/gross which depend on CTC - employer.
  // 3 passes converge for all common salary structures.
  let gross = ctc * 0.92;

  for (let pass = 0; pass < 3; pass++) {
    const basicRule = getComp('basic');
    const basicEst  = (basicRule?.method === 'percentage' && basicRule?.enabled)
      ? r2((Number(basicRule.value || 0) / 100) * gross)
      : applyRule(basicRule, { gross, basic: 0 });

    const ctx = { gross, basic: basicEst };
    const empPf  = applyRule(getComp('employer_pf'),  ctx);
    const empEsi = applyRule(getComp('employer_esi'), ctx);
    gross = r2(ctc - empPf - empEsi);
  }

  // ── Final pass: compute every component with settled gross ───────────────────
  const basicRule = getComp('basic');
  const basicVal  = applyRule(basicRule, { gross, basic: 0 });
  const ctx0      = { gross, basic: basicVal };

  const hraVal      = applyRule(getComp('hra'),                 ctx0);
  const daVal       = applyRule(getComp('da'),                  ctx0);
  const transportVal= applyRule(getComp('transport_allowance'), ctx0);
  const medicalVal  = applyRule(getComp('medical_allowance'),   ctx0);
  const otherAllowVal = applyRule(getComp('other_allowance'),   ctx0);

  const sumBeforeRemaining = basicVal + hraVal + daVal + transportVal + medicalVal + otherAllowVal;

  // 'remaining' component fills whatever is left
  const specialRule = getComp('special_allowance');
  const specialVal  = (specialRule?.enabled && specialRule.method === 'remaining')
    ? r2(Math.max(0, gross - sumBeforeRemaining))
    : applyRule(specialRule, ctx0);

  const totalGross = r2(basicVal + hraVal + daVal + transportVal + medicalVal + specialVal + otherAllowVal);
  const ctxFinal   = { gross: totalGross, basic: basicVal };

  // Employee deductions
  const empPfVal  = applyRule(getComp('employee_pf'),       ctxFinal);
  const empEsiVal = applyRule(getComp('employee_esi'),      ctxFinal);
  const ptVal     = applyRule(getComp('professional_tax'),  ctxFinal);
  const tdsVal    = applyRule(getComp('tds'),               ctxFinal);
  const otherDedVal = applyRule(getComp('other_deductions'),ctxFinal);
  const retentionVal= applyRule(getComp('retention'),       ctxFinal);

  const totalDeductions = r2(empPfVal + empEsiVal + ptVal + tdsVal + otherDedVal + retentionVal);
  const netSalary       = r2(Math.max(0, totalGross - totalDeductions));

  // Employer contributions (final)
  const employerPf  = applyRule(getComp('employer_pf'),  ctxFinal);
  const employerEsi = applyRule(getComp('employer_esi'), ctxFinal);
  const totalEmployer = r2(employerPf + employerEsi);

  const finalCtc = r2(totalGross + totalEmployer);

  return {
    basic: basicVal,
    hra: hraVal,
    da: daVal,
    transport_allowance: transportVal,
    medical_allowance: medicalVal,
    special_allowance: specialVal,
    other_allowance: otherAllowVal,
    gross: totalGross,
    employee_pf: empPfVal,
    employee_esi: empEsiVal,
    professional_tax: ptVal,
    tds: tdsVal,
    other_deductions: otherDedVal,
    retention: retentionVal,
    total_deductions: totalDeductions,
    net_salary: netSalary,
    employer_pf: employerPf,
    employer_esi: employerEsi,
    total_employer: totalEmployer,
    final_ctc: finalCtc,
  };
}

/** Describe a rule's calculation method in plain text (for UI labels). */
export function ruleLabel(rule) {
  if (!rule?.enabled) return 'disabled';
  if (rule.method === 'fixed')     return `Fixed ₹${Number(rule.value || 0).toLocaleString('en-IN')}`;
  if (rule.method === 'manual')    return 'Manual entry';
  if (rule.method === 'remaining') return 'Remaining amount';
  if (rule.method === 'percentage') {
    const base = rule.base === 'basic' ? 'Basic' : rule.base === 'gross' ? 'Gross' : rule.base === 'ctc' ? 'CTC' : rule.base;
    let s = `${rule.value}% of ${base}`;
    if (rule.cap)               s += `, max ₹${Number(rule.cap).toLocaleString('en-IN')}`;
    if (rule.threshold_enabled) s += ` (if gross ≤ ₹${Number(rule.threshold_value || 0).toLocaleString('en-IN')})`;
    return s;
  }
  return '';
}
