-- ============================================================
-- Relitrade Stock Broking Pvt Ltd — Full Employee Data Import
-- Run in : Sanghavi/Relitrade Supabase SQL editor (org_id = 1)
-- Safe   : Uses ON CONFLICT / UPDATE — safe to re-run
-- Employees: 480,638,642,674,677,689,692,693,694,802,804,806
-- Notes  : 674 (Jignesh Pandya) and 677 (Ishanee Bhatt) are new
--          inserts; all others are updates to existing records.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 0. ENSURE GIFT CITY BRANCH EXISTS
-- ─────────────────────────────────────────────────────────────

INSERT INTO branches (org_id, name, code, location, address, is_active)
VALUES (1, 'Gift City Gandhinagar', 'GIFT', 'Gandhinagar', 'Gift City, Gandhinagar, Gujarat', true)
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 1. INSERT NEW EMPLOYEES (674 & 677 — not in seed data)
-- ─────────────────────────────────────────────────────────────

-- Employee 674: Jignesh Indulal Pandya
INSERT INTO users (
  name, email, password, role, organization_id, department, position,
  employment_status, device_enrollment_id, employee_id,
  salutation, gender, date_of_birth, blood_group, nationality, religion, marital_status,
  height, weight, phone, personal_email,
  current_address_line1, current_city, current_state, current_country,
  permanent_address,
  joining_date, confirmation_date, grade, cost_centre, pay_cadre,
  salary_structure, salary_on, employee_status,
  pan_number, aadhar_no, uan_no,
  pf_applicable, esi_applicable, pt_applicable, pt_rule,
  avatar_color, force_password_change
)
SELECT
  'Jignesh Indulal Pandya',
  'jignesh.pandya@relitrade.in',
  '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u',
  'employee', 1,
  'Research', 'Head of Research & Investments',
  'active', '674', '674',
  'Mr', 'Male', '1982-12-17', 'B+', 'Indian', 'Hindu', 'Married',
  '5.1', '75',
  '9870255051', NULL,
  'Kudasan Gandhinagar', 'GANDHINAGAR', 'GUJARAT', 'INDIA',
  'D/5/2, Bhadran Nagar 1, Behind N.L High School, S.V Road, Malad-West - MAHARASHTRA INDIA',
  '2025-02-03', '2025-02-03', 'B', NULL, 'Staff',
  'GROSS', 'Day', 'active',
  'ATEPP0786D', '850898830827', NULL,
  FALSE, FALSE, TRUE, 'GUJARAT',
  '#6366F1', true
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE organization_id = 1 AND device_enrollment_id = '674'
);

-- Employee 677: Ishanee Piyushkumar Bhatt
INSERT INTO users (
  name, email, password, role, organization_id, department, position,
  employment_status, device_enrollment_id, employee_id,
  salutation, gender, date_of_birth, blood_group, nationality, religion, marital_status,
  height, weight, phone, personal_email,
  current_address_line1, current_city, current_state, current_country, current_postal_code,
  permanent_address,
  joining_date, confirmation_date, grade, cost_centre, pay_cadre,
  salary_structure, salary_on, employee_status,
  pan_number, aadhar_no, uan_no,
  pf_applicable, esi_applicable, pt_applicable, pt_rule,
  avatar_color, force_password_change
)
SELECT
  'Ishanee Piyushkumar Bhatt',
  'ishanee.bhatt@relitrade.in',
  '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u',
  'employee', 1,
  'Research', 'Executive',
  'active', '677', '677',
  'Ms', 'Female', '2003-03-09', 'O+', 'Indian', 'Hindu', 'Single',
  '152', '40',
  '8511569197', 'ishaneebhatt9@gmail.com',
  'Plot No: 324/1, Sector: 4/B', 'GANDHINAGAR', 'GUJARAT', 'INDIA', '382006',
  'Plot No: 324/1, Sector: 4/B GANDHINAGAR-382006 GUJARAT INDIA',
  '2025-05-15', '2025-05-15', 'B', NULL, 'Staff',
  'GROSS', 'Day', 'active',
  'GNZPB7817L', '358204904285', NULL,
  FALSE, FALSE, TRUE, 'GUJARAT',
  '#F472B6', true
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE organization_id = 1 AND device_enrollment_id = '677'
);

-- Update biometric map for 674 & 677
INSERT INTO biometric_employee_map (org_id, employee_pin, user_id)
SELECT 1, u.device_enrollment_id, u.id
FROM users u
WHERE u.organization_id = 1
  AND u.device_enrollment_id IN ('674','677')
ON CONFLICT (org_id, employee_pin) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 2. UPDATE EXISTING EMPLOYEES — PERSONAL & EMPLOYMENT DATA
--    Identified by device_enrollment_id (ZKTeco PIN)
-- ─────────────────────────────────────────────────────────────

UPDATE users SET
  name             = 'Kiran Mahendrakumar Solanki',
  salutation       = 'Mr',    gender = 'Male',
  date_of_birth    = '1998-10-12',
  phone            = '9313038377',
  employee_id      = '480',
  department       = 'Admin',    position     = 'Office Boy',
  grade            = 'B',        pay_cadre    = 'Staff',
  joining_date     = '2025-07-01', salary_structure = 'GROSS', salary_on = 'Day',
  pan_number       = 'PARPS1440G', aadhar_no = '314600412307',
  pf_applicable    = FALSE, esi_applicable = FALSE, pt_applicable = FALSE,
  employee_status  = 'active',    confirmation_date = '2025-07-01',
  current_address_line1 = 'RohitVas, Galudan Dehgam', current_city = 'GANDHINAGAR',
  current_state = 'GUJARAT', current_country = 'INDIA',
  permanent_address = 'RohitVas,Galudan Dehgam Gandhinagar GANDHINAGAR GUJARAT INDIA'
WHERE organization_id = 1 AND device_enrollment_id = '480';

UPDATE users SET
  name             = 'Zarna Mukeshbhai Suthar',
  salutation       = 'Ms',    gender = 'Female',
  date_of_birth    = '1991-06-07',   blood_group = 'B+',
  marital_status   = 'Married',
  height           = '5.04', weight = '73',
  phone            = '8160241565',   personal_email = 'zarna7297@gmail.com',
  employee_id      = '638',
  department       = 'Trading',  position     = 'Executive',
  grade            = 'B',        pay_cadre    = 'Staff',
  joining_date     = '2023-12-13', salary_structure = 'GROSS', salary_on = 'Day',
  pan_number       = 'GEYPS3439M', aadhar_no = '683716642221',
  pt_applicable    = TRUE, pt_rule = 'GUJARAT',
  esi_applicable   = TRUE, pf_applicable = FALSE,
  employee_status  = 'active',   confirmation_date = '2023-12-13',
  current_address_line1 = 'B-405, Ganesh Icon & Heights, Dahegam Circle, S.P.Ring Road, New Naroda',
  current_city     = 'AHMEDABAD', current_state = 'GUJARAT',
  current_country  = 'INDIA',    current_postal_code = '382330',
  permanent_address = 'B-405, Ganesh Icon & Heights, Dahegam Circle, S.P.Ring Road, New Naroda AHMEDABAD-382330 GUJARAT INDIA'
WHERE organization_id = 1 AND device_enrollment_id = '638';

UPDATE users SET
  name             = 'Mukesh Mohanbhai Thakor',
  salutation       = 'Mr',    gender = 'Male',
  date_of_birth    = '2002-01-10',   blood_group = 'B+',
  marital_status   = 'Married',
  height           = '0', weight = '0',
  phone            = '8401739307',   personal_email = 'mukeshthakor1015@gmail.com',
  employee_id      = '642',
  department       = 'Delta',   position     = 'Dealer',
  grade            = 'B',       pay_cadre    = 'Staff',
  joining_date     = '2024-01-18', salary_structure = 'GROSS', salary_on = 'Day',
  pan_number       = 'CLLPT4303D', aadhar_no = '652591929403',
  pt_applicable    = TRUE, pt_rule = 'GUJARAT',
  esi_applicable   = TRUE, pf_applicable = FALSE,
  employee_status  = 'active',  confirmation_date = '2024-01-18',
  current_address_line1 = 'Ambikanagar society, Basan Gandhinagar',
  current_city     = 'GANDHINAGAR', current_state = 'GUJARAT',
  current_country  = 'INDIA',   current_postal_code = '382355',
  permanent_address = 'Ambikanagar society, Basan Gandhinagar GANDHINAGAR-382355 GUJARAT INDIA'
WHERE organization_id = 1 AND device_enrollment_id = '642';

UPDATE users SET
  name             = 'Megh Prakashkumar Bhavsar',
  salutation       = 'Mr',    gender = 'Male',
  date_of_birth    = '2004-01-12',   blood_group = 'B+',
  marital_status   = 'Single',  nationality = 'INDIAN', religion = 'HINDU',
  height           = '6.2', weight = '110',
  employee_id      = '689',
  department       = 'IT',  position     = 'Jr. Developer & UI/UX Designer',
  grade            = 'B',   pay_cadre    = 'Staff',
  joining_date     = '2025-11-19', salary_structure = 'GROSS', salary_on = 'Day',
  pan_number       = 'GBHPB1720C', aadhar_no = '956577759685',
  pt_applicable    = TRUE, pt_rule = 'GUJARAT',
  esi_applicable   = FALSE, pf_applicable = FALSE,
  employee_status  = 'active',  confirmation_date = '2026-02-19'
WHERE organization_id = 1 AND device_enrollment_id = '689';

UPDATE users SET
  name             = 'Chirag Vishnubhai Patel',
  salutation       = 'Mr',    gender = 'Male',
  date_of_birth    = '1986-06-29',   blood_group = 'O+',
  marital_status   = 'Married',  nationality = 'INDIAN', religion = 'Hindu',
  height           = '5.4', weight = '75.5',
  phone            = '9662429555',   personal_email = 'CHIRAGV29@GMAIL.COM',
  employee_id      = '692',
  department       = 'Delta',    position     = 'Business Development Manager',
  grade            = 'B',        pay_cadre    = 'Staff',
  joining_date     = '2025-12-15', salary_structure = 'GROSS', salary_on = 'Day',
  pan_number       = 'AUMPP4325K', aadhar_no = '905089856711',
  pt_applicable    = TRUE, pt_rule = 'GUJARAT',
  esi_applicable   = FALSE, pf_applicable = FALSE,
  employee_status  = 'active',   confirmation_date = '2025-12-15',
  current_address_line1 = 'B-404 RHYTHM height nanachiloda Nr Megha height, new shahibagh',
  current_city     = 'AHMEDABAD', current_state = 'GUJARAT',
  current_country  = 'INDIA',    current_postal_code = '382330'
WHERE organization_id = 1 AND device_enrollment_id = '692';

UPDATE users SET
  name             = 'Dixit Rameshbhai Gondaliya',
  salutation       = 'Mr',    gender = 'Male',
  date_of_birth    = '2002-07-30',   blood_group = 'B+',
  marital_status   = 'Single',  nationality = 'Indian', religion = 'Hindu',
  height           = '5.67', weight = '75',
  employee_id      = '693',
  department       = 'Data',   position     = 'Analyst',
  grade            = 'B',      pay_cadre    = 'Staff',
  joining_date     = '2026-01-01', salary_structure = 'GROSS', salary_on = 'Day',
  pan_number       = 'CZQPG6045L', aadhar_no = '545260287515',
  pt_applicable    = TRUE, pt_rule = 'GUJARAT',
  esi_applicable   = FALSE, pf_applicable = FALSE,
  employee_status  = 'active',  confirmation_date = '2026-04-01'
WHERE organization_id = 1 AND device_enrollment_id = '693';

UPDATE users SET
  name             = 'Jaydip Kanubhai Patel',
  salutation       = 'Mr',    gender = 'Male',
  date_of_birth    = '2001-04-16',   blood_group = 'O+',
  marital_status   = 'Married',  nationality = 'INDIAN', religion = 'HINDU',
  height           = '0', weight = '70',
  phone            = '7575823272',   personal_email = 'jaydippatel1642001@gmail.com',
  employee_id      = '694',
  department       = 'Trading',  position     = 'Dealer',
  grade            = 'B',        pay_cadre    = 'Staff',
  joining_date     = '2026-01-01', salary_structure = 'GROSS', salary_on = 'Day',
  pan_number       = 'FQJPP6283G', aadhar_no = '831264941907', uan_no = '104006005527825',
  pt_applicable    = TRUE, pt_rule = 'GUJARAT',
  esi_applicable   = TRUE, pf_applicable = FALSE,
  employee_status  = 'active',    confirmation_date = '2026-04-01',
  current_address_line1 = 'H-503, Vishwash City 10, Gota',
  current_city     = 'AHMEDABAD', current_state = 'GUJARAT',
  current_country  = 'INDIA',    current_postal_code = '382481',
  permanent_address = 'AT PO: SARDARPUR TA: VIJAPUR DIST: MEHSANA MEHSANA-382860 GUJARAT INDIA'
WHERE organization_id = 1 AND device_enrollment_id = '694';

UPDATE users SET
  name             = 'Bhavna Shaileshbhai Parekh',
  salutation       = 'Mr',    gender = 'Male',
  date_of_birth    = '1996-01-19',
  marital_status   = 'Single',  nationality = 'Indian', religion = 'Hindu',
  phone            = '7624033268',
  employee_id      = '802',
  department       = 'Back Office',  position     = 'Backoffice and Operations',
  grade            = 'B',            pay_cadre    = 'Staff',
  joining_date     = '2026-04-16', salary_structure = 'GROSS', salary_on = 'Day',
  pan_number       = 'FPFPP0410C', aadhar_no = '556563511300',
  pt_applicable    = FALSE, esi_applicable = FALSE, pf_applicable = FALSE,
  employee_status  = 'active',  confirmation_date = '2026-04-16',
  current_address_line1 = 'Siddharth Xclusive, Sargasan, Gandhinagar',
  current_city     = 'GANDHINAGAR', current_state = 'GUJARAT', current_country = 'INDIA'
WHERE organization_id = 1 AND device_enrollment_id = '802';

UPDATE users SET
  name             = 'Shyamal Mahendrabhai Bhatt',
  salutation       = 'Mr',    gender = 'Male',
  date_of_birth    = '1981-09-14',   blood_group = 'A+',
  marital_status   = 'Married',  nationality = 'Indian', religion = 'Hindu',
  height           = '5', weight = '65',
  phone            = '9624014981',
  employee_id      = '804',
  department       = 'IT',   position     = 'Executive',
  grade            = 'A',    pay_cadre    = 'Staff',
  joining_date     = '2026-06-16', salary_structure = 'GROSS', salary_on = 'Day',
  pan_number       = 'ANOPB5210G', aadhar_no = '648617253636',
  pt_applicable    = TRUE, pt_rule = 'GUJARAT',
  esi_applicable   = FALSE, pf_applicable = FALSE,
  employee_status  = 'active',
  current_address_line1 = 'K 304 Sayona Green, Behind Vodafone, Gota, Daskroi',
  current_city     = 'AHMEDABAD', current_state = 'GUJARAT',
  current_country  = 'INDIA', current_postal_code = '382481',
  permanent_address = 'K 304 Sayona Green, Behind Vodafone, Gota, Daskroi AHMEDABAD-382481 GUJARAT INDIA'
WHERE organization_id = 1 AND device_enrollment_id = '804';

UPDATE users SET
  name             = 'Bhavyakumar Sanjaykumar Bhavsar',
  salutation       = 'Mr',    gender = 'Male',
  date_of_birth    = '2003-02-27',
  marital_status   = 'Single',  nationality = 'Indian', religion = 'Hindu',
  height           = '0', weight = '0',
  phone            = '8487930325',
  employee_id      = '806',
  department       = 'Dealer',  position     = 'Dealer',
  grade            = 'B',       pay_cadre    = 'Staff',
  joining_date     = '2026-07-01', salary_structure = 'GROSS', salary_on = 'Day',
  pan_number       = 'SLPPS7679M', aadhar_no = '215382823534',
  pt_applicable    = TRUE, pt_rule = 'GUJARAT',
  esi_applicable   = FALSE, pf_applicable = FALSE,
  employee_status  = 'active',
  current_address_line1 = 'Vihar, Gandhinagar, Gujarat, 382810',
  current_city     = 'GANDHINAGAR', current_state = 'GUJARAT',
  current_country  = 'INDIA', current_postal_code = '382810',
  permanent_address = 'Vihar, Gandhinagar, Gujarat, 382810 GANDHINAGAR-382810 GUJARAT INDIA'
WHERE organization_id = 1 AND device_enrollment_id = '806';

-- Set branch_id for all 12 employees to Gift City Gandhinagar
UPDATE users u
SET branch_id = b.id
FROM branches b
WHERE b.org_id = 1
  AND b.name = 'Gift City Gandhinagar'
  AND u.organization_id = 1
  AND u.device_enrollment_id IN ('480','638','642','674','677','689','692','693','694','802','804','806');


-- ─────────────────────────────────────────────────────────────
-- 3. FAMILY MEMBERS
-- ─────────────────────────────────────────────────────────────

-- Helper CTE to get user IDs by PIN (used in all family/bank/etc inserts below)

-- 638 — Zarna Suthar
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='638')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, date_of_birth, occupation, dependent)
SELECT e.id, 1, 'father',  'Dilipbhai',                '1996-06-01', NULL,        false FROM emp e
UNION ALL SELECT e.id, 1, 'mother',  'Meenaben',               NULL,          NULL,        false FROM emp e
UNION ALL SELECT e.id, 1, 'spouse',  'Mukesh Suthar',          '1988-09-22', NULL,        false FROM emp e
UNION ALL SELECT e.id, 1, 'child',   'Viya Suthar',            '2017-07-19', NULL,        true  FROM emp e
UNION ALL SELECT e.id, 1, 'child',   'Hayan Suthar',           '2022-09-22', NULL,        true  FROM emp e
ON CONFLICT DO NOTHING;

-- 642 — Mukesh Thakor
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='642')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, occupation, dependent)
SELECT e.id, 1, 'father', 'Mohanbhai Govindbhai Thakor', NULL, false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Savitaben Mohanbhai Thakor', NULL, false FROM emp e
UNION ALL SELECT e.id, 1, 'spouse', 'Shyamliben Mukeshbhai Thakor', NULL, false FROM emp e
ON CONFLICT DO NOTHING;

-- 674 — Jignesh Pandya
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='674')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, dependent)
SELECT e.id, 1, 'father', 'Indulal Pandya', false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Meena Pandya', false FROM emp e
UNION ALL SELECT e.id, 1, 'spouse', 'Pooja Pandya', false FROM emp e
ON CONFLICT DO NOTHING;

-- 677 — Ishanee Bhatt
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='677')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, date_of_birth, occupation, dependent)
SELECT e.id, 1, 'father', 'Piyushkumar Bhatt', '1965-09-26', 'Government job', false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Parulben Bhatt', '1970-01-27', 'House wife', false FROM emp e
ON CONFLICT DO NOTHING;

-- 689 — Megh Bhavsar
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='689')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, date_of_birth, occupation, dependent)
SELECT e.id, 1, 'father', 'Bhavsar Prakashkumar Himatlal', '1972-07-16', 'Photography', false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Bhavsar Hetalben Prakashkumar', '1979-02-10', 'Home Work', false FROM emp e
ON CONFLICT DO NOTHING;

-- 692 — Chirag Patel
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='692')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, date_of_birth, dependent)
SELECT e.id, 1, 'father', 'Vishnubhai Patel',   '1959-05-10', false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Bharatiben Patel', '1966-06-01', false FROM emp e
UNION ALL SELECT e.id, 1, 'spouse', 'Anita Patel',      '1989-12-15', false FROM emp e
ON CONFLICT DO NOTHING;

-- 694 — Jaydip Patel
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='694')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, date_of_birth, occupation, dependent)
SELECT e.id, 1, 'father', 'Patel Kanubhai Revabhai',   '1971-11-16', 'Farmer & Businessmen', false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Patel Surekhaben Kanubhai', '1975-06-01', 'Home Maker', false FROM emp e
UNION ALL SELECT e.id, 1, 'spouse', 'Patel Nikitaben Jaydip',    '2001-11-17', NULL, false FROM emp e
ON CONFLICT DO NOTHING;

-- 802 — Bhavna Parekh
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='802')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, dependent)
SELECT e.id, 1, 'father', 'Shaileshbhai Parekh', false FROM emp e
ON CONFLICT DO NOTHING;

-- 804 — Shyamal Bhatt
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='804')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, date_of_birth, occupation, dependent)
SELECT e.id, 1, 'father', 'Mahendrabhai Bhatt',          NULL,          NULL,             false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Jyoti Mahendra Bhatt', '1947-02-28', 'Retired Teacher', false FROM emp e
UNION ALL SELECT e.id, 1, 'spouse', 'Arti Shyamal Bhatt',   '1985-02-25', NULL,             false FROM emp e
UNION ALL SELECT e.id, 1, 'child',  'Atharv Shyamal Bhatt', '2018-12-20', NULL,             true  FROM emp e
ON CONFLICT DO NOTHING;

-- 806 — Bhavyakumar Bhavsar
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='806')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, dependent)
SELECT e.id, 1, 'father', 'Sanjaykumar Bhavsar', false FROM emp e
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 4. NOMINEES
-- ─────────────────────────────────────────────────────────────

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='674')
INSERT INTO employee_nominees (employee_id, organization_id, nominee_name, relationship, percentage_share, is_primary)
SELECT e.id, 1, 'Pooja Pandya', 'Wife', 100, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='677')
INSERT INTO employee_nominees (employee_id, organization_id, nominee_name, relationship, percentage_share, is_primary)
SELECT e.id, 1, 'Tvisha Bhatt', 'Sister', 100, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='692')
INSERT INTO employee_nominees (employee_id, organization_id, nominee_name, relationship, percentage_share, is_primary)
SELECT e.id, 1, 'Anita Patel', 'Wife', 100, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='694')
INSERT INTO employee_nominees (employee_id, organization_id, nominee_name, relationship, percentage_share, is_primary)
SELECT e.id, 1, 'Patel Jigneshkumar', 'Brother', 100, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='804')
INSERT INTO employee_nominees (employee_id, organization_id, nominee_name, relationship, percentage_share, is_primary)
SELECT e.id, 1, 'Arti Shyamal Bhatt', 'Wife', 100, true FROM emp e ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 5. BANK ACCOUNTS
-- ─────────────────────────────────────────────────────────────

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='480')
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, payment_method, is_primary, is_salary_account)
SELECT e.id, 1, 'State Bank of India', '32511128220', 'SBIN0002640', 'bank_transfer', true, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='638')
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, payment_method, is_primary, is_salary_account)
SELECT e.id, 1, 'State Bank of India', '20343155808', 'SBIN0000498', 'bank_transfer', true, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='642')
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, branch_name, branch_code, account_number, ifsc_code, account_type, payment_method, is_primary, is_salary_account)
SELECT e.id, 1, 'HDFC Bank', 'Sindhubhavan Road', '9444', '50100596626437', 'HDFC0009444', 'savings', 'bank_transfer', true, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='674')
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, payment_method, is_primary, is_salary_account)
SELECT e.id, 1, 'HDFC Bank', '02271140013786', 'HDFC0000227', 'bank_transfer', true, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='677')
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, payment_method, is_primary, is_salary_account)
SELECT e.id, 1, 'Axis Bank', '922010025297483', 'UTIB0001873', 'savings', 'bank_transfer', true, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='689')
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, payment_method, is_primary, is_salary_account)
SELECT e.id, 1, 'Bank of Baroda', '08510100040381', 'BARB0NARODA', 'savings', 'bank_transfer', true, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='692')
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, payment_method, is_primary, is_salary_account)
SELECT e.id, 1, 'HDFC Bank', '12851050033427', 'HDFC0001285', 'savings', 'bank_transfer', true, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='693')
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, branch_name, account_number, ifsc_code, account_type, payment_method, is_primary, is_salary_account)
SELECT e.id, 1, 'Bank of Baroda', 'Ring Road, Gujarat', '38760100014762', 'BARB0RINRAJ', 'savings', 'bank_transfer', true, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='694')
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, branch_name, branch_code, account_number, ifsc_code, account_type, payment_method, is_primary, is_salary_account)
SELECT e.id, 1, 'Union Bank of India', 'Madhi', '929239', '292322010000108', 'UBIN0929239', 'savings', 'bank_transfer', true, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='802')
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, account_number, ifsc_code, account_type, payment_method, is_primary, is_salary_account)
SELECT e.id, 1, 'State Bank of India', '32825623125', 'SBIN0060020', 'savings', 'bank_transfer', true, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='804')
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, branch_name, account_number, ifsc_code, account_type, payment_method, is_primary, is_salary_account)
SELECT e.id, 1, 'IDFC First Bank', 'Ahmedabad Gota', '10152464964', 'IDFB0040337', 'savings', 'bank_transfer', true, true FROM emp e ON CONFLICT DO NOTHING;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='806')
INSERT INTO employee_bank_accounts (employee_id, organization_id, bank_name, branch_name, branch_code, account_number, ifsc_code, account_type, payment_method, is_primary, is_salary_account)
SELECT e.id, 1, 'Bank of Baroda', 'Kukarwada, Mehsana', '382012516', '01730100017270', 'BARB0KUKARW', 'savings', 'bank_transfer', true, true FROM emp e ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 6. GOVERNMENT DOCUMENTS (Driving Licenses for 689 & 694)
-- ─────────────────────────────────────────────────────────────

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='689')
INSERT INTO employee_government_documents (employee_id, organization_id, document_type, document_number, expiry_date)
SELECT e.id, 1, 'driving_license', 'GJ18 20230005672', '2044-01-11' FROM emp e
ON CONFLICT (employee_id, document_type, organization_id) DO UPDATE
  SET document_number = EXCLUDED.document_number, expiry_date = EXCLUDED.expiry_date;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='694')
INSERT INTO employee_government_documents (employee_id, organization_id, document_type, document_number, expiry_date)
SELECT e.id, 1, 'driving_license', 'GJ0220210021766', '2041-04-15' FROM emp e
ON CONFLICT (employee_id, document_type, organization_id) DO UPDATE
  SET document_number = EXCLUDED.document_number, expiry_date = EXCLUDED.expiry_date;


-- ─────────────────────────────────────────────────────────────
-- 7. PAYROLL STRUCTURES (from monthly salary data)
--    payroll_structures has no unique constraint, so we
--    DELETE existing rows for the employee then INSERT fresh.
--    This keeps one authoritative structure per employee.
-- ─────────────────────────────────────────────────────────────

-- Clear existing structures for these 8 employees (those in salary sheet)
DELETE FROM payroll_structures
WHERE organization_id = 1
  AND user_id IN (
    SELECT id FROM users
    WHERE organization_id = 1
      AND device_enrollment_id IN ('638','642','674','677','692','693','694','802')
  );

-- 638 — Zarna: Gross 17330, ESI_emp 130, PT 200, ESI_emr 563
INSERT INTO payroll_structures (user_id, organization_id, basic, esi_employee, esi_employer, professional_tax, effective_from)
SELECT u.id, 1, 17330, 130, 563, 200, '2023-12-13'
FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='638';

-- 642 — Mukesh: Gross 15980, ESI_emp 120, PT 200, ESI_emr 519
INSERT INTO payroll_structures (user_id, organization_id, basic, esi_employee, esi_employer, professional_tax, effective_from)
SELECT u.id, 1, 15980, 120, 519, 200, '2024-01-18'
FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='642';

-- 674 — Jignesh: Gross 150000, PT 200 only (no ESI/PF applicable)
INSERT INTO payroll_structures (user_id, organization_id, basic, professional_tax, effective_from)
SELECT u.id, 1, 150000, 200, '2025-02-03'
FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='674';

-- 677 — Ishanee: Gross 32000, PT 200 only
INSERT INTO payroll_structures (user_id, organization_id, basic, professional_tax, effective_from)
SELECT u.id, 1, 32000, 200, '2025-05-15'
FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='677';

-- 692 — Chirag: Gross 37500, PT 200 only
INSERT INTO payroll_structures (user_id, organization_id, basic, professional_tax, effective_from)
SELECT u.id, 1, 37500, 200, '2025-12-15'
FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='692';

-- 693 — Dixit: Gross 30000, PT 200 only
INSERT INTO payroll_structures (user_id, organization_id, basic, professional_tax, effective_from)
SELECT u.id, 1, 30000, 200, '2026-01-01'
FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='693';

-- 694 — Jaydip: Gross 15103, ESI_emp 113, PF_emp 906, PT 200, ESI_emr 491, PF_emr 906
INSERT INTO payroll_structures (user_id, organization_id, basic, esi_employee, pf_employee, esi_employer, pf_employer, professional_tax, effective_from)
SELECT u.id, 1, 15103, 113, 906, 491, 906, 200, '2026-01-01'
FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='694';

-- 802 — Bhavna: Gross 14530, ESI_emp 109, PT 200, ESI_emr 472
INSERT INTO payroll_structures (user_id, organization_id, basic, esi_employee, esi_employer, professional_tax, effective_from)
SELECT u.id, 1, 14530, 109, 472, 200, '2026-04-16'
FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='802';


-- ─────────────────────────────────────────────────────────────
-- 8. CTC UPDATE on users (annual CTC = gross × 12)
-- ─────────────────────────────────────────────────────────────

UPDATE users SET ctc = 17330  * 12, salary_effective_date = '2023-12-13' WHERE organization_id=1 AND device_enrollment_id='638';
UPDATE users SET ctc = 15980  * 12, salary_effective_date = '2024-01-18' WHERE organization_id=1 AND device_enrollment_id='642';
UPDATE users SET ctc = 150000 * 12, salary_effective_date = '2025-02-03' WHERE organization_id=1 AND device_enrollment_id='674';
UPDATE users SET ctc = 32000  * 12, salary_effective_date = '2025-05-15' WHERE organization_id=1 AND device_enrollment_id='677';
UPDATE users SET ctc = 37500  * 12, salary_effective_date = '2025-12-15' WHERE organization_id=1 AND device_enrollment_id='692';
UPDATE users SET ctc = 30000  * 12, salary_effective_date = '2026-01-01' WHERE organization_id=1 AND device_enrollment_id='693';
UPDATE users SET ctc = 15103  * 12, salary_effective_date = '2026-01-01' WHERE organization_id=1 AND device_enrollment_id='694';
UPDATE users SET ctc = 14530  * 12, salary_effective_date = '2026-04-16' WHERE organization_id=1 AND device_enrollment_id='802';


-- ─────────────────────────────────────────────────────────────
-- 9. VERIFICATION
-- ─────────────────────────────────────────────────────────────

SELECT
  u.device_enrollment_id AS pin,
  u.name,
  u.department,
  u.position,
  u.pan_number,
  u.joining_date::text,
  u.pt_applicable,
  u.esi_applicable,
  u.ctc,
  (SELECT COUNT(*) FROM employee_family_members f WHERE f.employee_id = u.id) AS family_count,
  (SELECT COUNT(*) FROM employee_bank_accounts  b WHERE b.employee_id = u.id) AS bank_count,
  (SELECT COUNT(*) FROM payroll_structures       p WHERE p.user_id    = u.id) AS payroll_count
FROM users u
WHERE u.organization_id = 1
  AND u.device_enrollment_id IN ('480','638','642','674','677','689','692','693','694','802','804','806')
ORDER BY u.device_enrollment_id::integer;
