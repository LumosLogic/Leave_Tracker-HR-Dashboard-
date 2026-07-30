'use strict';
/**
 * statutoryCalculationService.js — Phase 3.7
 * Pure calculation functions for Indian statutory compliance.
 * No DB writes. All functions return plain objects.
 *
 * Calculations:
 *   PF   — Employee PF, Employer EPF, EPS, VPF
 *   ESI  — Employee & Employer ESI
 *   PT   — Professional Tax (state-wise slab)
 *   TDS  — Monthly income tax deduction (old/new regime)
 *   LWF  — Labour Welfare Fund
 *   Gratuity — Monthly accrual
 */

const { pool } = require('../config/db');

function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

// ── Indian Financial Year helpers ────────────────────────────────────────────
// FY starts April (month=4). FY 2024-25: April 2024 – March 2025.
function getFY(month, year) {
  return month >= 4
    ? `${year}-${String(year + 1).slice(-2)}`
    : `${year - 1}-${String(year).slice(-2)}`;
}

function monthInFY(month, year, fyStartMonth = 4) {
  // Returns 1-based position in FY (April = 1, March = 12)
  const pos = ((month - fyStartMonth + 12) % 12) + 1;
  return pos;
}

function remainingFYMonths(month, year, fyStartMonth = 4) {
  return 12 - monthInFY(month, year, fyStartMonth) + 1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PF CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate PF for one employee in one month.
 * @param {object} pfConfig  Row from statutory_pf_config
 * @param {object} salary    Row from employee_salary_structures
 * @returns {{ employeePF, employerEPF, employerEPS, totalEmployerPF, vpf, pfWages }}
 */
function calculatePF(pfConfig, salary) {
  if (!pfConfig?.enabled) {
    return { employeePF: 0, employerEPF: 0, employerEPS: 0, totalEmployerPF: 0, vpf: 0, pfWages: 0 };
  }

  // PF wages
  const basic = Number(salary.basic || 0);
  const da    = Number(salary.da    || 0);
  const rawWages = pfConfig.pf_wage_basis === 'basic_da' ? basic + da : basic;

  // Apply wage ceiling (0 = no ceiling)
  const ceiling  = Number(pfConfig.wage_ceiling || 0);
  const pfWages  = ceiling > 0 ? Math.min(rawWages, ceiling) : rawWages;

  // Employee PF + VPF
  const empPct  = Number(pfConfig.employee_pf_pct || 12) / 100;
  const vpfPct  = pfConfig.vpf_enabled ? Number(pfConfig.vpf_pct || 0) / 100 : 0;
  const employeePF = round2(pfWages * empPct);
  const vpf        = round2(rawWages * vpfPct); // VPF on actual wages (no ceiling)

  // Employer split: EPS capped separately at ₹15,000 ceiling
  const epsCeiling   = Math.min(rawWages, 15000);
  const epsPct       = Number(pfConfig.employer_eps_pct  || 8.33) / 100;
  const epfPct       = Number(pfConfig.employer_epf_pct  || 3.67) / 100;
  const employerEPS  = round2(epsCeiling * epsPct);
  const employerEPF  = round2(pfWages    * epfPct);
  const totalEmployerPF = round2(employerEPS + employerEPF);

  return { employeePF, employerEPF, employerEPS, totalEmployerPF, vpf, pfWages };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESI CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

function calculateESI(esiConfig, grossSalary) {
  if (!esiConfig?.enabled) {
    return { employeeESI: 0, employerESI: 0, eligible: false };
  }

  const gross     = Number(grossSalary || 0);
  const wageLimit = Number(esiConfig.wage_limit || 21000);

  if (wageLimit > 0 && gross > wageLimit) {
    return { employeeESI: 0, employerESI: 0, eligible: false };
  }

  const empPct       = Number(esiConfig.employee_esi_pct || 0.75) / 100;
  const erPct        = Number(esiConfig.employer_esi_pct || 3.25) / 100;
  const employeeESI  = round2(gross * empPct);
  const employerESI  = round2(gross * erPct);

  return { employeeESI, employerESI, eligible: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL TAX CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {object|null} ptConfig   Row from statutory_pt_config
 * @param {object|null} stateSlab  Row from statutory_pt_slabs
 * @param {number} grossSalary     Monthly gross
 * @param {number} month           Calendar month (1–12)
 */
function calculatePT(ptConfig, stateSlab, grossSalary, month) {
  if (!ptConfig?.enabled || !stateSlab) return { pt: 0 };

  const slabs = ptConfig.custom_slabs || stateSlab.slabs || [];
  if (!slabs.length) return { pt: 0 };

  const gross = Number(grossSalary || 0);

  // Find applicable slab
  const slab = slabs.find(s => {
    const from = Number(s.from || 0);
    const to   = s.to != null ? Number(s.to) : Infinity;
    return gross >= from && gross <= to;
  });

  if (!slab) return { pt: 0 };

  let monthlyPT = Number(slab.monthly_pt || 0);

  // February override (Karnataka: ₹300 in Feb to make annual ₹2400)
  if (month === 2 && slab.feb_amount != null) {
    monthlyPT = Number(slab.feb_amount);
  }
  // February skip (Maharashtra: no PT in Feb)
  if (month === 2 && slab.feb_skip === true) {
    monthlyPT = 0;
  }

  // Annual-collection states: only collect in specified months
  const collMonths = Array.isArray(stateSlab.collection_months) ? stateSlab.collection_months : [];
  if (collMonths.length > 0 && !collMonths.includes(month)) {
    monthlyPT = 0;
  }

  return { pt: round2(monthlyPT) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TDS / INCOME TAX CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

const TAX_SLABS_NEW = [
  { from: 0,       to: 300000,  rate: 0.00 },
  { from: 300000,  to: 700000,  rate: 0.05 },
  { from: 700000,  to: 1000000, rate: 0.10 },
  { from: 1000000, to: 1200000, rate: 0.15 },
  { from: 1200000, to: 1500000, rate: 0.20 },
  { from: 1500000, to: Infinity,rate: 0.30 },
];

const TAX_SLABS_OLD = [
  { from: 0,       to: 250000,  rate: 0.00 },
  { from: 250000,  to: 500000,  rate: 0.05 },
  { from: 500000,  to: 1000000, rate: 0.20 },
  { from: 1000000, to: Infinity,rate: 0.30 },
];

// 4% health & education cess on income tax
const CESS_RATE = 0.04;

function applySlabs(taxableIncome, slabs) {
  let tax = 0;
  for (const s of slabs) {
    if (taxableIncome <= s.from) break;
    const taxable = Math.min(taxableIncome, s.to) - s.from;
    tax += taxable * s.rate;
  }
  return Math.max(0, tax);
}

/**
 * Calculate annual income tax for an employee.
 *
 * @param {object} tdsConfig        Row from statutory_tds_config
 * @param {object} declaration      Row from statutory_tds_declarations (or null)
 * @param {number} annualGross      Projected annual gross (current org)
 * @param {number} ytdTDS           TDS already deducted this FY
 * @param {number} month            Current calendar month
 * @param {number} year             Current calendar year
 * @returns {{ monthlyTDS, annualTax, taxableIncome, regime, breakdown }}
 */
function calculateTDS(tdsConfig, declaration, annualGross, ytdTDS, month, year) {
  if (!tdsConfig?.enabled) {
    return { monthlyTDS: 0, annualTax: 0, taxableIncome: 0, regime: null, breakdown: {} };
  }

  const regime = declaration?.regime || tdsConfig.default_regime || 'new';
  const fyStartMonth = Number(tdsConfig.fy_start_month || 4);
  const remaining    = remainingFYMonths(month, year, fyStartMonth);

  // Annual income
  const prevEmpIncome = Number(declaration?.prev_employer_income || 0);
  const otherIncome   = Number(declaration?.other_income || 0);
  const totalGross    = annualGross + prevEmpIncome + otherIncome;

  // Standard deduction
  const stdDed = regime === 'new'
    ? Number(tdsConfig.standard_deduction_new || 75000)
    : Number(tdsConfig.standard_deduction_old || 50000);

  let taxableIncome = Math.max(0, totalGross - stdDed);

  // Old-regime deductions
  const breakdown = { totalGross, stdDed, deductions: {} };
  if (regime === 'old' && declaration) {
    const d80c        = Math.min(Number(declaration.deduction_80c    || 0), 150000);
    const d80dSelf    = Math.min(Number(declaration.deduction_80d_self   || 0), 25000);
    const d80dParents = Math.min(Number(declaration.deduction_80d_parents|| 0), 50000);
    const d80ccd      = Math.min(Number(declaration.deduction_80ccd  || 0), 50000);
    const hra         = Number(declaration.deduction_hra || 0);
    const homeLoan    = Number(declaration.deduction_home_loan || 0);
    const other       = Number(declaration.deduction_other || 0);
    const totalDed    = d80c + d80dSelf + d80dParents + d80ccd + hra + homeLoan + other;

    taxableIncome = Math.max(0, taxableIncome - totalDed);
    breakdown.deductions = { d80c, d80dSelf, d80dParents, d80ccd, hra, homeLoan, other, total: totalDed };
  }

  breakdown.taxableIncome = taxableIncome;

  // Gross tax
  const slabs    = regime === 'new' ? TAX_SLABS_NEW : TAX_SLABS_OLD;
  let annualTax  = applySlabs(taxableIncome, slabs);
  breakdown.grossTax = round2(annualTax);

  // 87A Rebate
  const rebateThreshold = regime === 'new'
    ? Number(tdsConfig.rebate_87a_threshold_new || 700000)
    : Number(tdsConfig.rebate_87a_threshold_old || 500000);
  const maxRebate = regime === 'new'
    ? Number(tdsConfig.rebate_87a_max_new || 25000)
    : Number(tdsConfig.rebate_87a_max_old || 12500);

  if (taxableIncome <= rebateThreshold) {
    annualTax = Math.max(0, annualTax - Math.min(annualTax, maxRebate));
    breakdown.rebate87A = Math.min(annualTax, maxRebate);
  }

  // Cess
  const cess    = round2(annualTax * CESS_RATE);
  annualTax     = round2(annualTax + cess);
  breakdown.cess = cess;
  breakdown.annualTax = annualTax;

  // Monthly TDS = (annual tax - already deducted) / remaining months
  const prevEmpTDS  = Number(declaration?.prev_employer_tds || 0);
  const netTax      = Math.max(0, annualTax - ytdTDS - prevEmpTDS);
  const monthlyTDS  = round2(netTax / Math.max(1, remaining));

  return { monthlyTDS, annualTax, taxableIncome, regime, breakdown };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LWF CALCULATION
// ═══════════════════════════════════════════════════════════════════════════════

function calculateLWF(lwfConfig, stateSlab, month) {
  if (!lwfConfig?.enabled || !stateSlab) {
    return { lwfEmployee: 0, lwfEmployer: 0 };
  }

  const collMonths = Array.isArray(stateSlab.collection_months) ? stateSlab.collection_months : [];
  if (collMonths.length > 0 && !collMonths.includes(month)) {
    return { lwfEmployee: 0, lwfEmployer: 0 };
  }

  return {
    lwfEmployee: round2(stateSlab.employee_amount || 0),
    lwfEmployer: round2(stateSlab.employer_amount || 0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRATUITY ACCRUAL
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @param {object} gratuityConfig  Row from statutory_gratuity_config
 * @param {object} salary          Row from employee_salary_structures
 * @param {Date}   joiningDate     Employee joining date
 * @returns {{ monthlyAccrual, eligible, yearsOfService }}
 */
function calculateGratuityAccrual(gratuityConfig, salary, joiningDate) {
  if (!gratuityConfig?.enabled) {
    return { monthlyAccrual: 0, eligible: false, yearsOfService: 0 };
  }

  const joining = joiningDate instanceof Date ? joiningDate : new Date(joiningDate);
  const now     = new Date();
  const yearsOfService = (now - joining) / (365.25 * 24 * 3600 * 1000);
  const minYears = Number(gratuityConfig.min_service_years || 5);
  const eligible = yearsOfService >= minYears;

  const basic = Number(salary.basic || 0);
  const da    = Number(salary.da    || 0);
  const wage  = gratuityConfig.wage_basis === 'basic_da' ? basic + da : basic;

  const denom       = Number(gratuityConfig.working_days_denominator || 26);
  const daysPerYear = Number(gratuityConfig.days_per_year || 15);
  const maxGratuity = Number(gratuityConfig.max_gratuity || 2000000);

  // Monthly accrual = (wage / denom) * (daysPerYear / 12)
  const monthlyAccrual = round2(Math.min((wage / denom) * (daysPerYear / 12), maxGratuity / 12));
  const totalAccrued   = round2(Math.min((wage / denom) * daysPerYear * yearsOfService, maxGratuity));

  return { monthlyAccrual, eligible, yearsOfService: round2(yearsOfService), totalAccrued };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DB CONFIG LOADERS
// ═══════════════════════════════════════════════════════════════════════════════

async function loadAllStatutoryConfigs(organizationId) {
  const oId = Number(organizationId);

  const [pfRes, esiRes, ptRes, tdsRes, gratuityRes, lwfRes] = await Promise.all([
    pool.query(`SELECT * FROM statutory_pf_config      WHERE organization_id = $1`, [oId]),
    pool.query(`SELECT * FROM statutory_esi_config     WHERE organization_id = $1`, [oId]),
    pool.query(`SELECT pc.*, ps.slabs, ps.collection_months
                  FROM statutory_pt_config  pc
                  JOIN statutory_pt_slabs   ps ON ps.state_code = pc.state_code
                 WHERE pc.organization_id = $1`, [oId]),
    pool.query(`SELECT * FROM statutory_tds_config     WHERE organization_id = $1`, [oId]),
    pool.query(`SELECT * FROM statutory_gratuity_config WHERE organization_id = $1`, [oId]),
    pool.query(`SELECT lc.*, ls.employee_amount, ls.employer_amount, ls.collection_months
                  FROM statutory_lwf_config lc
                  JOIN statutory_lwf_slabs  ls ON ls.state_code = lc.state_code
                 WHERE lc.organization_id = $1`, [oId]),
  ]);

  return {
    pf:       pfRes.rows[0]       || null,
    esi:      esiRes.rows[0]      || null,
    pt:       ptRes.rows[0]       || null,
    tds:      tdsRes.rows[0]      || null,
    gratuity: gratuityRes.rows[0] || null,
    lwf:      lwfRes.rows[0]      || null,
  };
}

async function loadEmployeeDeclaration(organizationId, userId, month, year) {
  const fy = getFY(month, year);
  const { rows } = await pool.query(
    `SELECT * FROM statutory_tds_declarations
      WHERE organization_id = $1 AND user_id = $2 AND financial_year = $3
        AND status IN ('approved', 'submitted', 'hr_review')
      ORDER BY CASE status WHEN 'approved' THEN 1 WHEN 'hr_review' THEN 2 ELSE 3 END
      LIMIT 1`,
    [Number(organizationId), Number(userId), fy]
  );
  return rows[0] || null;
}

async function loadYTDTDS(organizationId, userId, month, year, fyStartMonth = 4) {
  // Sum TDS from payslips in the same FY up to (but not including) this month
  const fy = getFY(month, year);
  const [fyStartYear] = fy.split('-').map(Number);
  const fyFullStart   = fyStartMonth <= month ? year : year - 1;
  const startDate     = `${fyFullStart}-${String(fyStartMonth).padStart(2,'0')}-01`;
  const thisDate      = `${year}-${String(month).padStart(2,'0')}-01`;

  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(tds), 0) AS ytd_tds
       FROM payslips
      WHERE organization_id = $1
        AND user_id         = $2
        AND (year::text || '-' || LPAD(month::text, 2, '0') || '-01')::date >= $3
        AND (year::text || '-' || LPAD(month::text, 2, '0') || '-01')::date <  $4
        AND status NOT IN ('cancelled','draft')`,
    [Number(organizationId), Number(userId), startDate, thisDate]
  );
  return Number(rows[0]?.ytd_tds || 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER: applyStatutoryCalculations
// Post-processes a just-generated payslip with all statutory values.
// Called by payrollGenerationService after upsert.
// Returns an UPDATE object to apply to the payslip row.
// ═══════════════════════════════════════════════════════════════════════════════

async function applyStatutoryCalculations({
  organizationId, userId, month, year, payslipId,
  grossSalary, basicSalary, salary, joiningDate,
}) {
  const oId = Number(organizationId);
  const m   = Number(month);
  const y   = Number(year);

  const [configs, declaration, ytdTDS, empRow] = await Promise.all([
    loadAllStatutoryConfigs(oId),
    loadEmployeeDeclaration(oId, userId, m, y),
    loadYTDTDS(oId, userId, m, y),
    pool.query(`SELECT joining_date FROM users WHERE id = $1 AND organization_id = $2`, [Number(userId), oId]),
  ]);

  const resolvedJoiningDate = joiningDate || empRow.rows[0]?.joining_date || null;

  // ── PF ───────────────────────────────────────────────────────────────────
  const pf = calculatePF(configs.pf, salary);

  // ── ESI ──────────────────────────────────────────────────────────────────
  const esi = calculateESI(configs.esi, grossSalary);

  // ── PT ───────────────────────────────────────────────────────────────────
  const pt = calculatePT(configs.pt, configs.pt, grossSalary, m);

  // ── TDS ──────────────────────────────────────────────────────────────────
  const annualGross = Number(grossSalary) * 12; // simplified projection
  const tds = calculateTDS(configs.tds, declaration, annualGross, ytdTDS, m, y);

  // ── LWF ──────────────────────────────────────────────────────────────────
  const lwf = calculateLWF(configs.lwf, configs.lwf, m);

  // ── Gratuity ─────────────────────────────────────────────────────────────
  const gratuity = calculateGratuityAccrual(
    configs.gratuity,
    salary,
    resolvedJoiningDate ? new Date(resolvedJoiningDate) : null
  );

  // Build statutory snapshot (immutable)
  const snapshot = {
    calculatedAt: new Date().toISOString(),
    pf, esi, pt, tds: { ...tds, monthlyTDS: tds.monthlyTDS },
    lwf, gratuity,
    configs: {
      pfEnabled:       configs.pf?.enabled  || false,
      esiEnabled:      configs.esi?.enabled || false,
      ptEnabled:       configs.pt?.enabled  || false,
      tdsEnabled:      configs.tds?.enabled || false,
      lwfEnabled:      configs.lwf?.enabled || false,
      gratuityEnabled: configs.gratuity?.enabled || false,
      ptState:         configs.pt?.state_code || null,
      lwfState:        configs.lwf?.state_code || null,
      tdsRegime:       tds.regime,
    },
  };

  // Values to UPDATE on payslip (only if config is active)
  const updates = {
    pf_employee:          configs.pf?.enabled  ? pf.employeePF    : undefined,
    pf_employer:          configs.pf?.enabled  ? pf.totalEmployerPF : undefined,
    eps_amount:           configs.pf?.enabled  ? pf.employerEPS   : undefined,
    epf_employer_amount:  configs.pf?.enabled  ? pf.employerEPF   : undefined,
    esi_employee:         configs.esi?.enabled ? esi.employeeESI  : undefined,
    esi_employer:         configs.esi?.enabled ? esi.employerESI  : undefined,
    professional_tax:     configs.pt?.enabled  ? pt.pt            : undefined,
    tds:                  configs.tds?.enabled ? tds.monthlyTDS   : undefined,
    tds_annual_projected: configs.tds?.enabled ? tds.annualTax    : undefined,
    tds_ytd:              configs.tds?.enabled ? ytdTDS           : undefined,
    lwf_employee:         configs.lwf?.enabled ? lwf.lwfEmployee  : undefined,
    lwf_employer:         configs.lwf?.enabled ? lwf.lwfEmployer  : undefined,
    gratuity_accrual:     configs.gratuity?.enabled ? gratuity.monthlyAccrual : undefined,
    regime:               configs.tds?.enabled ? tds.regime        : undefined,
    statutory_snapshot:   JSON.stringify(snapshot),
  };

  // Remove undefined keys
  Object.keys(updates).forEach(k => { if (updates[k] === undefined) delete updates[k]; });

  if (!Object.keys(updates).length) return;

  // Build SET clause
  const setClauses = [];
  const vals       = [];
  let   idx        = 1;

  const NUMERIC_KEYS = [
    'pf_employee','pf_employer','eps_amount','epf_employer_amount',
    'esi_employee','esi_employer','professional_tax','tds',
    'tds_annual_projected','tds_ytd','lwf_employee','lwf_employer',
    'gratuity_accrual',
  ];

  for (const [key, val] of Object.entries(updates)) {
    setClauses.push(`${key} = $${idx}`);
    vals.push(val);
    idx++;
  }

  // Also recalculate total_deductions to reflect statutory values
  // We add LWF employee to total deductions
  if (updates.lwf_employee !== undefined) {
    setClauses.push(`total_deductions = total_deductions + $${idx}`);
    vals.push(updates.lwf_employee);
    idx++;
  }

  vals.push(payslipId, oId);

  await pool.query(
    `UPDATE payslips SET ${setClauses.join(', ')}
      WHERE id = $${idx} AND organization_id = $${idx + 1}`,
    vals
  );

  return snapshot;
}

module.exports = {
  calculatePF,
  calculateESI,
  calculatePT,
  calculateTDS,
  calculateLWF,
  calculateGratuityAccrual,
  applyStatutoryCalculations,
  loadAllStatutoryConfigs,
  loadEmployeeDeclaration,
  loadYTDTDS,
  getFY,
  monthInFY,
};
