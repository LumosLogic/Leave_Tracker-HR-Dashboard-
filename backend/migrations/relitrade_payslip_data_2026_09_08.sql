-- ============================================================
-- Relitrade Payslip Data Population — 2026-09-08
-- Run on Relitrade DB:
--   docker exec lumos_postgres psql -U lumos_admin -d <relitrade_db> -f /path/to/this.sql
-- ============================================================

-- Step 1: Run the Company PF No. migration first
ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS payslip_company_pf_no TEXT;

-- Step 2: Update payroll_settings with CIN and Company PF No.
-- (If you already set these via the UI, skip this block)
UPDATE payroll_settings
SET
  payslip_company_cin  = 'CIN No.: U67120GJ2012PTC116832'
WHERE organization_id = 1;
-- Company P.F. No.: get the correct value from HR and set here, e.g.:
-- UPDATE payroll_settings SET payslip_company_pf_no = 'GJNRD...' WHERE organization_id = 1;

-- ============================================================
-- Step 3: Update PAN, PF No., ESIC No., and designation for each employee
-- Uses employee_id (the visible code like 638, 801 etc.) to identify rows safely.
-- ============================================================

-- Zarna Mukeshbhai Suthar (638)
UPDATE users SET pan_number = 'GEYPS3439M' WHERE employee_id = '638' AND organization_id = 1;

-- Mukesh Mohanbhai Thakor (642)
UPDATE users SET pan_number = 'CLLPT4303D' WHERE employee_id = '642' AND organization_id = 1;

-- Jignesh Indulal Pandya (674)
UPDATE users SET pan_number = 'ATEPP0786D' WHERE employee_id = '674' AND organization_id = 1;

-- Ishanee Bhatt (677)
UPDATE users SET pan_number = 'GNZPB7817L' WHERE employee_id = '677' AND organization_id = 1;

-- Chirag Vishnubhai Patel (692)
UPDATE users SET pan_number = 'AUMPP4325K' WHERE employee_id = '692' AND organization_id = 1;

-- Dixit Rameshbhai Gondaliya (693)
UPDATE users SET pan_number = 'CZQPG6045L' WHERE employee_id = '693' AND organization_id = 1;

-- Jaydip Patel (694)
UPDATE users SET pan_number = 'FQJPP6283G' WHERE employee_id = '694' AND organization_id = 1;

-- Shyamal Mahendrabhai Bhatt (804)
UPDATE users SET pan_number = 'ANOPB5210G' WHERE employee_id = '804' AND organization_id = 1;

-- Bhavna Shaileshbhai Parekh (802)
UPDATE users SET pan_number = 'FPFPP0410C' WHERE employee_id = '802' AND organization_id = 1;

-- Bhavyakumar Sanjaykumar Bhavsar (806)
UPDATE users SET pan_number = 'SLPPS7679M' WHERE employee_id = '806' AND organization_id = 1;

-- Priyanshi Riteshbhai Sheth (805)
UPDATE users SET pan_number = 'QLWPS2013E' WHERE employee_id = '805' AND organization_id = 1;

-- Manish Kandel (801) — also has PF and ESIC
UPDATE users
SET pan_number = 'MRSPK9713K',
    pf_no      = 'GJNRD3818540000',
    esi_no     = '37001945660000999'
WHERE employee_id = '801' AND organization_id = 1;

-- Riddhi Mukeshbhai Parmar (808)
UPDATE users SET pan_number = 'FPSPP4348E' WHERE employee_id = '808' AND organization_id = 1;

-- Vishal Atmarambhai Solanki (809)
UPDATE users SET pan_number = 'IMYPS6008A' WHERE employee_id = '809' AND organization_id = 1;

-- ============================================================
-- Step 4: Fix designation capitalization
-- (only run if the DB actually has wrong casing — verify first)
-- ============================================================
-- UPDATE users SET position = 'HR Manager' WHERE position = 'Hr Manager' AND organization_id = 1;

-- ============================================================
-- Step 5: Insert banking records
-- Skips employees who already have an active record to avoid duplicates.
-- ============================================================

-- Helper: get internal user IDs by employee_id
-- SELECT id, name, employee_id FROM users WHERE organization_id = 1 ORDER BY employee_id::int;

-- Zarna Mukeshbhai Suthar (638)
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'State Bank of India', '20343155808', 'SBIN0000498', 'savings', true, true, true, true, 1
FROM users u WHERE u.employee_id = '638' AND u.organization_id = 1
AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Mukesh Mohanbhai Thakor (642)
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'HDFC Bank', '50100596626437', 'HDFC0009444', 'savings', true, true, true, true, 1
FROM users u WHERE u.employee_id = '642' AND u.organization_id = 1
AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Jignesh Indulal Pandya (674)
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'HDFC Bank', '02271140013786', 'HDFC0000227', 'savings', true, true, true, true, 1
FROM users u WHERE u.employee_id = '674' AND u.organization_id = 1
AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Ishanee Bhatt (677)
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'Axis Bank', '922010025297483', 'UTIB0001873', 'savings', true, true, true, true, 1
FROM users u WHERE u.employee_id = '677' AND u.organization_id = 1
AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Chirag Vishnubhai Patel (692)
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'HDFC Bank', '12851050033427', 'HDFC0001285', 'savings', true, true, true, true, 1
FROM users u WHERE u.employee_id = '692' AND u.organization_id = 1
AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Dixit Rameshbhai Gondaliya (693)
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'Bank of Baroda', '38760100014762', 'BARB0RINRAJ', 'savings', true, true, true, true, 1
FROM users u WHERE u.employee_id = '693' AND u.organization_id = 1
AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Jaydip Patel (694)
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'Union Bank of India', '292322010000108', 'UBIN0929239', 'savings', true, true, true, true, 1
FROM users u WHERE u.employee_id = '694' AND u.organization_id = 1
AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Shyamal Mahendrabhai Bhatt (804)
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'IDFC First Bank', '10152464964', 'IDFB0040337', 'savings', true, true, true, true, 1
FROM users u WHERE u.employee_id = '804' AND u.organization_id = 1
AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Bhavna Shaileshbhai Parekh (802)
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'State Bank of India', '32825623125', 'SBIN0060020', 'savings', true, true, true, true, 1
FROM users u WHERE u.employee_id = '802' AND u.organization_id = 1
AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Bhavyakumar Sanjaykumar Bhavsar (806)
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'Bank of Baroda', '01730100017270', 'BARB0KUKARW', 'savings', true, true, true, true, 1
FROM users u WHERE u.employee_id = '806' AND u.organization_id = 1
AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Priyanshi Riteshbhai Sheth (805)
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'Bank of Baroda', '78160100039173', 'BARB0VJBHUJ', 'savings', true, true, true, true, 1
FROM users u WHERE u.employee_id = '805' AND u.organization_id = 1
AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Manish Kandel (801)
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'State Bank of India', '41455808470', 'SBIN0012700', 'savings', true, true, true, true, 1
FROM users u WHERE u.employee_id = '801' AND u.organization_id = 1
AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Riddhi Mukeshbhai Parmar (808)
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'Axis Bank', '975827314', 'UTIB0000058', 'savings', true, true, true, true, 1
FROM users u WHERE u.employee_id = '808' AND u.organization_id = 1
AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- Vishal Atmarambhai Solanki (809)
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, is_primary, is_salary_account, is_active, hr_verified, created_by)
SELECT u.id, 1, 'State Bank of India', '32526631715', 'SBIN0002640', 'savings', true, true, true, true, 1
FROM users u WHERE u.employee_id = '809' AND u.organization_id = 1
AND NOT EXISTS (SELECT 1 FROM employee_bank_accounts b WHERE b.employee_id = u.id AND b.is_active = true);

-- ============================================================
-- Verification queries — run these after to confirm data
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
