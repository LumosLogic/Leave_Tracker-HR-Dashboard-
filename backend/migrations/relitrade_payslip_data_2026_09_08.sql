-- ============================================================
-- Relitrade Payslip Data Population — 2026-09-08
-- Run on Relitrade DB:
--   docker exec lumos_postgres psql -U lumos_admin -d <relitrade_db> -f /path/to/this.sql
-- ============================================================

-- PRE-CHECK: confirm org_id = 1 is Relitrade before running anything below
SELECT id, name FROM organizations WHERE id = 1;
-- Expected output: "Relitrade Stock Broking Pvt. Ltd." (or similar)

-- ============================================================
-- Step 1: Add Company PF No. column (safe to re-run)
-- ============================================================
ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS payslip_company_pf_no TEXT;

-- ============================================================
-- Step 2: Update payroll_settings — CIN with proper label prefix
-- ============================================================
UPDATE payroll_settings
SET payslip_company_cin = 'CIN No.: U67120GJ2012PTC116832'
WHERE organization_id = 1;

-- Company P.F. No. — ask HR for the company-level PF registration number and set below:
-- UPDATE payroll_settings SET payslip_company_pf_no = 'XXXXXXXXXXXX' WHERE organization_id = 1;

-- ============================================================
-- Step 3: Update PAN, PF No., ESIC No. per employee
-- Identified by employee_id (visible code), not internal DB id
-- ============================================================

-- Zarna Mukeshbhai Suthar (638)
UPDATE users SET pan_number = 'GEYPS3439M'
WHERE employee_id::text = '638' AND organization_id = 1;

-- Mukesh Mohanbhai Thakor (642)
UPDATE users SET pan_number = 'CLLPT4303D'
WHERE employee_id::text = '642' AND organization_id = 1;

-- Jignesh Indulal Pandya (674)
UPDATE users SET pan_number = 'ATEPP0786D'
WHERE employee_id::text = '674' AND organization_id = 1;

-- Ishanee Bhatt (677)
UPDATE users SET pan_number = 'GNZPB7817L'
WHERE employee_id::text = '677' AND organization_id = 1;

-- Chirag Vishnubhai Patel (692)
UPDATE users SET pan_number = 'AUMPP4325K'
WHERE employee_id::text = '692' AND organization_id = 1;

-- Dixit Rameshbhai Gondaliya (693)
UPDATE users SET pan_number = 'CZQPG6045L'
WHERE employee_id::text = '693' AND organization_id = 1;

-- Jaydip Patel (694)
UPDATE users SET pan_number = 'FQJPP6283G'
WHERE employee_id::text = '694' AND organization_id = 1;

-- Shyamal Mahendrabhai Bhatt (804)
UPDATE users SET pan_number = 'ANOPB5210G'
WHERE employee_id::text = '804' AND organization_id = 1;

-- Bhavna Shaileshbhai Parekh (802)
UPDATE users SET pan_number = 'FPFPP0410C'
WHERE employee_id::text = '802' AND organization_id = 1;

-- Bhavyakumar Sanjaykumar Bhavsar (806)
UPDATE users SET pan_number = 'SLPPS7679M'
WHERE employee_id::text = '806' AND organization_id = 1;

-- Priyanshi Riteshbhai Sheth (805)
UPDATE users SET pan_number = 'QLWPS2013E'
WHERE employee_id::text = '805' AND organization_id = 1;

-- Manish Kandel (801) — PAN + PF + ESIC
UPDATE users
SET pan_number = 'MRSPK9713K',
    pf_no      = 'GJNRD3818540000',
    esi_no     = '37001945660000999'
WHERE employee_id::text = '801' AND organization_id = 1;

-- Riddhi Mukeshbhai Parmar (808)
UPDATE users SET pan_number = 'FPSPP4348E'
WHERE employee_id::text = '808' AND organization_id = 1;

-- Vishal Atmarambhai Solanki (809)
UPDATE users SET pan_number = 'IMYPS6008A'
WHERE employee_id::text = '809' AND organization_id = 1;

-- ============================================================
-- Step 4: Fix designation capitalization
-- Screenshot confirms "Hr Manager" is in DB — fix to "HR Manager"
-- ============================================================
UPDATE users
SET position = 'HR Manager'
WHERE position = 'Hr Manager' AND organization_id = 1;

-- ============================================================
-- Step 5: Insert banking records
-- Uses SELECT + NOT EXISTS so it safely skips employees who
-- already have an active bank account (no duplicates).
-- created_by uses the first admin user of the org automatically.
-- ============================================================

-- Zarna Mukeshbhai Suthar (638)
INSERT INTO employee_bank_accounts
  (employee_id, organization_id, bank_name, account_number, ifsc_code,
   account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'State Bank of India', '20343155808', 'SBIN0000498',
       'savings', true, true, true, true,
       (SELECT id FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1)
FROM users u
WHERE u.employee_id::text = '638' AND u.organization_id = 1
  AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Mukesh Mohanbhai Thakor (642)
INSERT INTO employee_bank_accounts
  (employee_id, organization_id, bank_name, account_number, ifsc_code,
   account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'HDFC Bank', '50100596626437', 'HDFC0009444',
       'savings', true, true, true, true,
       (SELECT id FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1)
FROM users u
WHERE u.employee_id::text = '642' AND u.organization_id = 1
  AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Jignesh Indulal Pandya (674)
INSERT INTO employee_bank_accounts
  (employee_id, organization_id, bank_name, account_number, ifsc_code,
   account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'HDFC Bank', '02271140013786', 'HDFC0000227',
       'savings', true, true, true, true,
       (SELECT id FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1)
FROM users u
WHERE u.employee_id::text = '674' AND u.organization_id = 1
  AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Ishanee Bhatt (677)
INSERT INTO employee_bank_accounts
  (employee_id, organization_id, bank_name, account_number, ifsc_code,
   account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'Axis Bank', '922010025297483', 'UTIB0001873',
       'savings', true, true, true, true,
       (SELECT id FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1)
FROM users u
WHERE u.employee_id::text = '677' AND u.organization_id = 1
  AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Chirag Vishnubhai Patel (692)
INSERT INTO employee_bank_accounts
  (employee_id, organization_id, bank_name, account_number, ifsc_code,
   account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'HDFC Bank', '12851050033427', 'HDFC0001285',
       'savings', true, true, true, true,
       (SELECT id FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1)
FROM users u
WHERE u.employee_id::text = '692' AND u.organization_id = 1
  AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Dixit Rameshbhai Gondaliya (693)
INSERT INTO employee_bank_accounts
  (employee_id, organization_id, bank_name, account_number, ifsc_code,
   account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'Bank of Baroda', '38760100014762', 'BARB0RINRAJ',
       'savings', true, true, true, true,
       (SELECT id FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1)
FROM users u
WHERE u.employee_id::text = '693' AND u.organization_id = 1
  AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Jaydip Patel (694)
INSERT INTO employee_bank_accounts
  (employee_id, organization_id, bank_name, account_number, ifsc_code,
   account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'Union Bank of India', '292322010000108', 'UBIN0929239',
       'savings', true, true, true, true,
       (SELECT id FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1)
FROM users u
WHERE u.employee_id::text = '694' AND u.organization_id = 1
  AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Shyamal Mahendrabhai Bhatt (804)
INSERT INTO employee_bank_accounts
  (employee_id, organization_id, bank_name, account_number, ifsc_code,
   account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'IDFC First Bank', '10152464964', 'IDFB0040337',
       'savings', true, true, true, true,
       (SELECT id FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1)
FROM users u
WHERE u.employee_id::text = '804' AND u.organization_id = 1
  AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Bhavna Shaileshbhai Parekh (802)
INSERT INTO employee_bank_accounts
  (employee_id, organization_id, bank_name, account_number, ifsc_code,
   account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'State Bank of India', '32825623125', 'SBIN0060020',
       'savings', true, true, true, true,
       (SELECT id FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1)
FROM users u
WHERE u.employee_id::text = '802' AND u.organization_id = 1
  AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Bhavyakumar Sanjaykumar Bhavsar (806)
INSERT INTO employee_bank_accounts
  (employee_id, organization_id, bank_name, account_number, ifsc_code,
   account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'Bank of Baroda', '01730100017270', 'BARB0KUKARW',
       'savings', true, true, true, true,
       (SELECT id FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1)
FROM users u
WHERE u.employee_id::text = '806' AND u.organization_id = 1
  AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Priyanshi Riteshbhai Sheth (805)
INSERT INTO employee_bank_accounts
  (employee_id, organization_id, bank_name, account_number, ifsc_code,
   account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'Bank of Baroda', '78160100039173', 'BARB0VJBHUJ',
       'savings', true, true, true, true,
       (SELECT id FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1)
FROM users u
WHERE u.employee_id::text = '805' AND u.organization_id = 1
  AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Manish Kandel (801)
INSERT INTO employee_bank_accounts
  (employee_id, organization_id, bank_name, account_number, ifsc_code,
   account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'State Bank of India', '41455808470', 'SBIN0012700',
       'savings', true, true, true, true,
       (SELECT id FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1)
FROM users u
WHERE u.employee_id::text = '801' AND u.organization_id = 1
  AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Riddhi Mukeshbhai Parmar (808)
INSERT INTO employee_bank_accounts
  (employee_id, organization_id, bank_name, account_number, ifsc_code,
   account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'Axis Bank', '975827314', 'UTIB0000058',
       'savings', true, true, true, true,
       (SELECT id FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1)
FROM users u
WHERE u.employee_id::text = '808' AND u.organization_id = 1
  AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Vishal Atmarambhai Solanki (809)
INSERT INTO employee_bank_accounts
  (employee_id, organization_id, bank_name, account_number, ifsc_code,
   account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'State Bank of India', '32526631715', 'SBIN0002640',
       'savings', true, true, true, true,
       (SELECT id FROM users WHERE organization_id = 1 AND role IN ('root_admin','admin') ORDER BY id LIMIT 1)
FROM users u
WHERE u.employee_id::text = '809' AND u.organization_id = 1
  AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- ============================================================
-- Verification — run after to confirm all data is correct
-- ============================================================
SELECT employee_id, name, pan_number, pf_no, esi_no, position
FROM users
WHERE organization_id = 1 AND role = 'employee'
ORDER BY employee_id::int;

SELECT u.employee_id, u.name, b.bank_name, b.account_number, b.ifsc_code
FROM users u
JOIN employee_bank_accounts b ON b.employee_id = u.id AND b.is_active = true
WHERE u.organization_id = 1
ORDER BY u.employee_id::int;

SELECT payslip_company_cin, payslip_company_pf_no FROM payroll_settings WHERE organization_id = 1;
