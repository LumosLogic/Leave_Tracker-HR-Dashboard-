-- ============================================================
-- Salary Audit — August 2026 Payroll Discrepancy Diagnostic
-- Scope  : org_id = 2 (Lumos Logic — adjust if different)
-- Purpose: Show each employee's salary structure and estimate net pay
--          to compare against expected values.
-- Run this on psql or pgAdmin to identify discrepancies.
-- ============================================================

-- ── 1. Current active salary structures ──────────────────────────────────────
SELECT
  u.name                                                    AS employee,
  u.employee_id,
  ess.effective_from,
  ess.basic,
  ess.hra,
  ess.da,
  ess.transport_allowance,
  ess.medical_allowance,
  ess.special_allowance,
  ess.other_allowance,
  ess.gross_salary,
  ess.employee_pf,
  ess.employee_esi,
  ess.professional_tax,
  ess.tds,
  ess.retention,
  ess.other_deductions,
  -- Engine-computed total deductions (no LOP)
  (ess.employee_pf + ess.employee_esi + ess.professional_tax
    + ess.tds + ess.retention + ess.other_deductions)       AS total_deductions,
  -- Estimated Net Pay (before LOP — assumes full attendance)
  ess.gross_salary
    - ess.employee_pf - ess.employee_esi - ess.professional_tax
    - ess.tds - ess.retention - ess.other_deductions        AS est_net_full_attendance,
  ess.employer_pf,
  ess.employer_esi,
  ess.ctc
FROM users u
JOIN employee_salary_structures ess
  ON ess.user_id = u.id
 AND ess.organization_id = u.organization_id
 AND ess.effective_to IS NULL
WHERE u.organization_id = 2          -- ← adjust org_id if needed
  AND u.role = 'employee'
  AND u.name IN (
    'Riddhi Parmar',
    'Vishal Solanki',
    'Bhavya Bhavsar',
    'Bhavna Parekh',
    'Priyanshi Sheth'
  )
ORDER BY u.name;

-- ── 2. August 2026 attendance summary ────────────────────────────────────────
-- Shows how many present / absent / leave / half-day days each employee has
SELECT
  u.name                                                    AS employee,
  COUNT(*) FILTER (WHERE a.status = 'present')             AS present,
  COUNT(*) FILTER (WHERE a.status = 'wfh')                 AS wfh,
  COUNT(*) FILTER (WHERE a.status = 'half_day')            AS half_day,
  COUNT(*) FILTER (WHERE a.status = 'absent')              AS absent,
  COUNT(*) FILTER (WHERE a.status = 'on_leave')            AS on_leave,
  COUNT(*) FILTER (WHERE a.status = 'early_leave')         AS early_leave
FROM users u
LEFT JOIN attendance a
  ON a.user_id = u.id
 AND a.organization_id = u.organization_id
 AND a.date >= '2026-08-01' AND a.date <= '2026-08-31'
WHERE u.organization_id = 2
  AND u.name IN (
    'Riddhi Parmar',
    'Vishal Solanki',
    'Bhavya Bhavsar',
    'Bhavna Parekh',
    'Priyanshi Sheth'
  )
GROUP BY u.name
ORDER BY u.name;

-- ── 3. Generated payslips for August 2026 ────────────────────────────────────
SELECT
  u.name                AS employee,
  ps.gross_salary,
  ps.pf_employee,
  ps.esi_employee,
  ps.professional_tax,
  ps.tds,
  ps.retention,
  ps.lop_days,
  ps.lop_amount,
  ps.total_deductions,
  ps.net_salary,
  ps.status,
  ps.working_days,
  ps.present_days
FROM payslips ps
JOIN users u ON u.id = ps.user_id
WHERE ps.organization_id = 2
  AND ps.month = '08'
  AND ps.year  = 2026
  AND u.name IN (
    'Riddhi Parmar',
    'Vishal Solanki',
    'Bhavya Bhavsar',
    'Bhavna Parekh',
    'Priyanshi Sheth'
  )
ORDER BY u.name;

-- ── 4. Payroll settings (working days rule, PT/PF enabled flags) ──────────────
SELECT
  working_days_rule,
  fixed_working_days,
  weekend_policy,
  count_holidays_as_paid,
  pf_enabled,
  esi_enabled,
  professional_tax_enabled,
  tds_enabled,
  late_allowance_per_month,
  half_day_after_lates
FROM payroll_settings
WHERE organization_id = 2;
