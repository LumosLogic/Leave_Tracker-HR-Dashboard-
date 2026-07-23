-- ================================================================
-- RELITRADE EMPLOYEE DATA VERIFICATION QUERY
-- Run this on the Hostinger PostgreSQL DB (org_id = 1)
-- Date: 2026-07-23
-- ================================================================


-- 1. DUPLICATE CHECK — should return 0 rows (no duplicates)
-- ----------------------------------------------------------------
SELECT
  device_enrollment_id AS pin,
  COUNT(*) AS duplicate_count,
  STRING_AGG(id::text, ', ') AS user_ids
FROM users
WHERE organization_id = 1
  AND device_enrollment_id IN ('480','638','642','674','677','689','692','693','694','802','804','806')
GROUP BY device_enrollment_id
HAVING COUNT(*) > 1
ORDER BY pin::integer;


-- 2. EMPLOYEE EXISTENCE & KEY FIELDS — should show all 12 rows
-- ----------------------------------------------------------------
SELECT
  u.device_enrollment_id          AS pin,
  u.name,
  u.department,
  u.position,
  u.pan_number,
  u.joining_date::text,
  u.date_of_birth::text,
  u.gender,
  u.phone,
  u.employee_status,
  u.pt_applicable,
  u.esi_applicable,
  u.pf_applicable,
  u.ctc,
  u.branch_id IS NOT NULL         AS has_branch,
  CASE WHEN bm.user_id IS NOT NULL THEN 'YES' ELSE 'MISSING' END AS biometric_mapped
FROM users u
LEFT JOIN biometric_employee_map bm
  ON bm.org_id = 1 AND bm.employee_pin = u.device_enrollment_id
WHERE u.organization_id = 1
  AND u.device_enrollment_id IN ('480','638','642','674','677','689','692','693','694','802','804','806')
ORDER BY u.device_enrollment_id::integer;


-- 3. RELATED DATA COUNTS — family, bank, payroll, nominees per employee
-- ----------------------------------------------------------------
SELECT
  u.device_enrollment_id                                                             AS pin,
  u.name,
  (SELECT COUNT(*) FROM employee_family_members f WHERE f.employee_id = u.id)       AS family_count,
  (SELECT COUNT(*) FROM employee_bank_accounts  b WHERE b.employee_id = u.id)       AS bank_count,
  (SELECT COUNT(*) FROM payroll_structures       p WHERE p.user_id    = u.id)       AS payroll_count,
  (SELECT COUNT(*) FROM employee_nominees        n WHERE n.employee_id = u.id)      AS nominee_count,
  (SELECT COUNT(*) FROM employee_government_documents g WHERE g.employee_id = u.id) AS doc_count
FROM users u
WHERE u.organization_id = 1
  AND u.device_enrollment_id IN ('480','638','642','674','677','689','692','693','694','802','804','806')
ORDER BY u.device_enrollment_id::integer;


-- 4. PAYROLL STRUCTURES DETAIL — should show 8 rows (638,642,674,677,692,693,694,802)
-- ----------------------------------------------------------------
SELECT
  u.device_enrollment_id  AS pin,
  u.name,
  ps.basic                AS gross,
  ps.esi_employee,
  ps.pf_employee,
  ps.professional_tax     AS pt,
  ps.esi_employer,
  ps.pf_employer,
  ps.effective_from::text
FROM payroll_structures ps
JOIN users u ON u.id = ps.user_id
WHERE ps.organization_id = 1
  AND u.device_enrollment_id IN ('638','642','674','677','692','693','694','802')
ORDER BY u.device_enrollment_id::integer;


-- 5. BANK ACCOUNTS DETAIL — should show 1 row per employee (12 total)
-- ----------------------------------------------------------------
SELECT
  u.device_enrollment_id  AS pin,
  u.name,
  ba.bank_name,
  ba.account_number,
  ba.ifsc_code,
  ba.is_primary,
  ba.is_salary_account
FROM employee_bank_accounts ba
JOIN users u ON u.id = ba.employee_id
WHERE ba.organization_id = 1
  AND u.device_enrollment_id IN ('480','638','642','674','677','689','692','693','694','802','804','806')
ORDER BY u.device_enrollment_id::integer;


-- 6. MISSING EMPLOYEES — should return 0 rows
-- ----------------------------------------------------------------
WITH expected(pin) AS (
  VALUES ('480'),('638'),('642'),('674'),('677'),
         ('689'),('692'),('693'),('694'),('802'),('804'),('806')
)
SELECT e.pin AS missing_employee_pin
FROM expected e
LEFT JOIN users u
  ON u.organization_id = 1 AND u.device_enrollment_id = e.pin
WHERE u.id IS NULL;


-- 7. PAYROLL DUPLICATE CHECK — each of the 8 employees should have exactly 1 row
-- ----------------------------------------------------------------
SELECT
  u.device_enrollment_id  AS pin,
  u.name,
  COUNT(ps.id)            AS payroll_row_count
FROM users u
LEFT JOIN payroll_structures ps ON ps.user_id = u.id AND ps.organization_id = 1
WHERE u.organization_id = 1
  AND u.device_enrollment_id IN ('638','642','674','677','692','693','694','802')
GROUP BY u.device_enrollment_id, u.name
ORDER BY u.device_enrollment_id::integer;
