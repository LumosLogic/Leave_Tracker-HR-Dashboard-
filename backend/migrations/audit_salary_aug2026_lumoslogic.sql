-- ============================================================
-- Salary Audit — August 2026 Payroll Discrepancy Diagnostic
-- Scope  : Relitrade (org_id = 1) + name-based search
-- Run: docker exec -it lumos_postgres psql -U lumos_admin -d lumos_hrms -f /tmp/audit_salary_aug2026.sql
-- ============================================================

-- ── 0. Confirm org_id for these employees ────────────────────────────────────
SELECT id, name, organization_id, employee_id, employee_status
FROM users
WHERE name IN (
  'Riddhi Parmar', 'Vishal Solanki', 'Bhavya Bhavsar',
  'Bhavna Parekh', 'Priyanshi Sheth'
)
ORDER BY name;

-- ── 1. Current active salary structures ──────────────────────────────────────
SELECT
  u.name                                                      AS employee,
  u.employee_id,
  u.organization_id                                           AS org_id,
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
  (ess.employee_pf + ess.employee_esi + ess.professional_tax
    + ess.tds + ess.retention + ess.other_deductions)         AS total_deductions,
  ess.gross_salary
    - ess.employee_pf - ess.employee_esi - ess.professional_tax
    - ess.tds - ess.retention - ess.other_deductions           AS est_net_full_attendance,
  ess.employer_pf,
  ess.employer_esi,
  ess.ctc
FROM users u
JOIN employee_salary_structures ess
  ON ess.user_id = u.id
 AND ess.organization_id = u.organization_id
 AND ess.effective_to IS NULL
WHERE u.name IN (
  'Riddhi Parmar', 'Vishal Solanki', 'Bhavya Bhavsar',
  'Bhavna Parekh', 'Priyanshi Sheth'
)
ORDER BY u.name;

-- ── 2. August 2026 attendance summary ────────────────────────────────────────
SELECT
  u.name                                                      AS employee,
  COUNT(*) FILTER (WHERE a.status = 'present')               AS present,
  COUNT(*) FILTER (WHERE a.status = 'wfh')                   AS wfh,
  COUNT(*) FILTER (WHERE a.status = 'half_day')              AS half_day,
  COUNT(*) FILTER (WHERE a.status = 'early_leave')           AS early_leave,
  COUNT(*) FILTER (WHERE a.status = 'absent')                AS absent,
  COUNT(*) FILTER (WHERE a.status = 'on_leave')              AS on_leave,
  COUNT(*) FILTER (WHERE a.status IS NULL)                   AS no_record
FROM users u
LEFT JOIN attendance a
  ON a.user_id = u.id
 AND a.organization_id = u.organization_id
 AND a.date >= '2026-08-01' AND a.date <= '2026-08-31'
WHERE u.name IN (
  'Riddhi Parmar', 'Vishal Solanki', 'Bhavya Bhavsar',
  'Bhavna Parekh', 'Priyanshi Sheth'
)
GROUP BY u.name, u.organization_id
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
JOIN users u ON u.id = ps.user_id AND u.organization_id = ps.organization_id
WHERE ps.month = '08'
  AND ps.year  = 2026
  AND u.name IN (
    'Riddhi Parmar', 'Vishal Solanki', 'Bhavya Bhavsar',
    'Bhavna Parekh', 'Priyanshi Sheth'
  )
ORDER BY u.name;

-- ── 4. Payroll settings for their org ────────────────────────────────────────
SELECT
  ps.organization_id,
  o.name                    AS org_name,
  ps.working_days_rule,
  ps.fixed_working_days,
  ps.weekend_policy,
  ps.count_holidays_as_paid,
  ps.pf_enabled,
  ps.esi_enabled,
  ps.professional_tax_enabled,
  ps.tds_enabled,
  ps.late_allowance_per_month,
  ps.half_day_after_lates
FROM payroll_settings ps
JOIN organizations o ON o.id = ps.organization_id
WHERE ps.organization_id IN (
  SELECT DISTINCT organization_id FROM users
  WHERE name IN (
    'Riddhi Parmar', 'Vishal Solanki', 'Bhavya Bhavsar',
    'Bhavna Parekh', 'Priyanshi Sheth'
  )
);
