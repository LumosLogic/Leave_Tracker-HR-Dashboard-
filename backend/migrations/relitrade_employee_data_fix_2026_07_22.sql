-- ============================================================
-- Relitrade Employee Data FIX — 2026-07-22
-- Reason : Original migration had UPDATE for existing employees
--          but they don't exist in this Postgres DB — need INSERT.
--          Also fixes ::date cast errors in family member inserts.
-- Employees: 480,638,642,689,692,693,694,802,804,806 (INSERT new)
--            674,677 already inserted — add family/payroll only
-- Safe to re-run (WHERE NOT EXISTS / ON CONFLICT DO NOTHING)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. BRANCH
-- ─────────────────────────────────────────────────────────────
INSERT INTO branches (org_id, name, code, location, address, is_active)
VALUES (1, 'Gift City Gandhinagar', 'GIFT', 'Gandhinagar', 'Gift City, Gandhinagar, Gujarat', true)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 1. INSERT 10 MISSING EMPLOYEES
-- ─────────────────────────────────────────────────────────────

-- 480: Kiran Mahendrakumar Solanki
INSERT INTO users (name, email, password, role, organization_id, department, position,
  employment_status, device_enrollment_id, employee_id,
  salutation, gender, date_of_birth,
  phone, joining_date, confirmation_date, grade, pay_cadre,
  salary_structure, salary_on, employee_status,
  pan_number, aadhar_no,
  pf_applicable, esi_applicable, pt_applicable,
  current_address_line1, current_city, current_state, current_country,
  permanent_address, avatar_color, force_password_change)
SELECT
  'Kiran Mahendrakumar Solanki', 'kiran.solanki@relitrade.in',
  '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u',
  'employee', 1, 'Admin', 'Office Boy',
  'active', '480', '480',
  'Mr', 'Male', '1998-10-12'::date,
  '9313038377', '2025-07-01'::date, '2025-07-01'::date, 'B', 'Staff',
  'GROSS', 'Day', 'active',
  'PARPS1440G', '314600412307',
  FALSE, FALSE, FALSE,
  'RohitVas, Galudan Dehgam', 'GANDHINAGAR', 'GUJARAT', 'INDIA',
  'RohitVas,Galudan Dehgam Gandhinagar GANDHINAGAR GUJARAT INDIA',
  '#10B981', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE organization_id=1 AND device_enrollment_id='480');

-- 638: Zarna Mukeshbhai Suthar
INSERT INTO users (name, email, password, role, organization_id, department, position,
  employment_status, device_enrollment_id, employee_id,
  salutation, gender, date_of_birth, blood_group, marital_status,
  height, weight, phone, personal_email,
  joining_date, confirmation_date, grade, pay_cadre,
  salary_structure, salary_on, employee_status,
  pan_number, aadhar_no,
  pf_applicable, esi_applicable, pt_applicable, pt_rule,
  current_address_line1, current_city, current_state, current_country, current_postal_code,
  permanent_address, avatar_color, force_password_change)
SELECT
  'Zarna Mukeshbhai Suthar', 'zarna.suthar@relitrade.in',
  '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u',
  'employee', 1, 'Trading', 'Executive',
  'active', '638', '638',
  'Ms', 'Female', '1991-06-07'::date, 'B+', 'Married',
  '5.04', '73', '8160241565', 'zarna7297@gmail.com',
  '2023-12-13'::date, '2023-12-13'::date, 'B', 'Staff',
  'GROSS', 'Day', 'active',
  'GEYPS3439M', '683716642221',
  FALSE, TRUE, TRUE, 'GUJARAT',
  'B-405, Ganesh Icon & Heights, Dahegam Circle, S.P.Ring Road, New Naroda',
  'AHMEDABAD', 'GUJARAT', 'INDIA', '382330',
  'B-405, Ganesh Icon & Heights, Dahegam Circle, S.P.Ring Road, New Naroda AHMEDABAD-382330 GUJARAT INDIA',
  '#F59E0B', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE organization_id=1 AND device_enrollment_id='638');

-- 642: Mukesh Mohanbhai Thakor
INSERT INTO users (name, email, password, role, organization_id, department, position,
  employment_status, device_enrollment_id, employee_id,
  salutation, gender, date_of_birth, blood_group, marital_status,
  phone, personal_email,
  joining_date, confirmation_date, grade, pay_cadre,
  salary_structure, salary_on, employee_status,
  pan_number, aadhar_no,
  pf_applicable, esi_applicable, pt_applicable, pt_rule,
  current_address_line1, current_city, current_state, current_country, current_postal_code,
  permanent_address, avatar_color, force_password_change)
SELECT
  'Mukesh Mohanbhai Thakor', 'mukesh.thakor@relitrade.in',
  '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u',
  'employee', 1, 'Delta', 'Dealer',
  'active', '642', '642',
  'Mr', 'Male', '2002-01-10'::date, 'B+', 'Married',
  '8401739307', 'mukeshthakor1015@gmail.com',
  '2024-01-18'::date, '2024-01-18'::date, 'B', 'Staff',
  'GROSS', 'Day', 'active',
  'CLLPT4303D', '652591929403',
  FALSE, TRUE, TRUE, 'GUJARAT',
  'Ambikanagar society, Basan Gandhinagar',
  'GANDHINAGAR', 'GUJARAT', 'INDIA', '382355',
  'Ambikanagar society, Basan Gandhinagar GANDHINAGAR-382355 GUJARAT INDIA',
  '#6366F1', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE organization_id=1 AND device_enrollment_id='642');

-- 689: Megh Prakashkumar Bhavsar
INSERT INTO users (name, email, password, role, organization_id, department, position,
  employment_status, device_enrollment_id, employee_id,
  salutation, gender, date_of_birth, blood_group, marital_status,
  nationality, religion, height, weight,
  joining_date, confirmation_date, grade, pay_cadre,
  salary_structure, salary_on, employee_status,
  pan_number, aadhar_no,
  pf_applicable, esi_applicable, pt_applicable, pt_rule,
  avatar_color, force_password_change)
SELECT
  'Megh Prakashkumar Bhavsar', 'megh.bhavsar@relitrade.in',
  '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u',
  'employee', 1, 'IT', 'Jr. Developer & UI/UX Designer',
  'active', '689', '689',
  'Mr', 'Male', '2004-01-12'::date, 'B+', 'Single',
  'INDIAN', 'HINDU', '6.2', '110',
  '2025-11-19'::date, '2026-02-19'::date, 'B', 'Staff',
  'GROSS', 'Day', 'active',
  'GBHPB1720C', '956577759685',
  FALSE, FALSE, TRUE, 'GUJARAT',
  '#8B5CF6', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE organization_id=1 AND device_enrollment_id='689');

-- 692: Chirag Vishnubhai Patel
INSERT INTO users (name, email, password, role, organization_id, department, position,
  employment_status, device_enrollment_id, employee_id,
  salutation, gender, date_of_birth, blood_group, marital_status,
  nationality, religion, height, weight, phone, personal_email,
  joining_date, confirmation_date, grade, pay_cadre,
  salary_structure, salary_on, employee_status,
  pan_number, aadhar_no,
  pf_applicable, esi_applicable, pt_applicable, pt_rule,
  current_address_line1, current_city, current_state, current_country, current_postal_code,
  avatar_color, force_password_change)
SELECT
  'Chirag Vishnubhai Patel', 'chirag.patel@relitrade.in',
  '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u',
  'employee', 1, 'Delta', 'Business Development Manager',
  'active', '692', '692',
  'Mr', 'Male', '1986-06-29'::date, 'O+', 'Married',
  'INDIAN', 'Hindu', '5.4', '75.5', '9662429555', 'CHIRAGV29@GMAIL.COM',
  '2025-12-15'::date, '2025-12-15'::date, 'B', 'Staff',
  'GROSS', 'Day', 'active',
  'AUMPP4325K', '905089856711',
  FALSE, FALSE, TRUE, 'GUJARAT',
  'B-404 RHYTHM height nanachiloda Nr Megha height, new shahibagh',
  'AHMEDABAD', 'GUJARAT', 'INDIA', '382330',
  '#EF4444', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE organization_id=1 AND device_enrollment_id='692');

-- 693: Dixit Rameshbhai Gondaliya
INSERT INTO users (name, email, password, role, organization_id, department, position,
  employment_status, device_enrollment_id, employee_id,
  salutation, gender, date_of_birth, blood_group, marital_status,
  nationality, religion, height, weight,
  joining_date, confirmation_date, grade, pay_cadre,
  salary_structure, salary_on, employee_status,
  pan_number, aadhar_no,
  pf_applicable, esi_applicable, pt_applicable, pt_rule,
  avatar_color, force_password_change)
SELECT
  'Dixit Rameshbhai Gondaliya', 'dixit.gondaliya@relitrade.in',
  '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u',
  'employee', 1, 'Data', 'Analyst',
  'active', '693', '693',
  'Mr', 'Male', '2002-07-30'::date, 'B+', 'Single',
  'Indian', 'Hindu', '5.67', '75',
  '2026-01-01'::date, '2026-04-01'::date, 'B', 'Staff',
  'GROSS', 'Day', 'active',
  'CZQPG6045L', '545260287515',
  FALSE, FALSE, TRUE, 'GUJARAT',
  '#F97316', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE organization_id=1 AND device_enrollment_id='693');

-- 694: Jaydip Kanubhai Patel
INSERT INTO users (name, email, password, role, organization_id, department, position,
  employment_status, device_enrollment_id, employee_id,
  salutation, gender, date_of_birth, blood_group, marital_status,
  nationality, religion, weight, phone, personal_email,
  joining_date, confirmation_date, grade, pay_cadre,
  salary_structure, salary_on, employee_status,
  pan_number, aadhar_no, uan_no,
  pf_applicable, esi_applicable, pt_applicable, pt_rule,
  current_address_line1, current_city, current_state, current_country, current_postal_code,
  permanent_address, avatar_color, force_password_change)
SELECT
  'Jaydip Kanubhai Patel', 'jaydip.patel@relitrade.in',
  '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u',
  'employee', 1, 'Trading', 'Dealer',
  'active', '694', '694',
  'Mr', 'Male', '2001-04-16'::date, 'O+', 'Married',
  'INDIAN', 'HINDU', '70', '7575823272', 'jaydippatel1642001@gmail.com',
  '2026-01-01'::date, '2026-04-01'::date, 'B', 'Staff',
  'GROSS', 'Day', 'active',
  'FQJPP6283G', '831264941907', '104006005527825',
  FALSE, TRUE, TRUE, 'GUJARAT',
  'H-503, Vishwash City 10, Gota', 'AHMEDABAD', 'GUJARAT', 'INDIA', '382481',
  'AT PO: SARDARPUR TA: VIJAPUR DIST: MEHSANA MEHSANA-382860 GUJARAT INDIA',
  '#06B6D4', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE organization_id=1 AND device_enrollment_id='694');

-- 802: Bhavna Shaileshbhai Parekh
INSERT INTO users (name, email, password, role, organization_id, department, position,
  employment_status, device_enrollment_id, employee_id,
  salutation, gender, date_of_birth, marital_status,
  nationality, religion, phone,
  joining_date, confirmation_date, grade, pay_cadre,
  salary_structure, salary_on, employee_status,
  pan_number, aadhar_no,
  pf_applicable, esi_applicable, pt_applicable,
  current_address_line1, current_city, current_state, current_country,
  avatar_color, force_password_change)
SELECT
  'Bhavna Shaileshbhai Parekh', 'bhavna.parekh@relitrade.in',
  '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u',
  'employee', 1, 'Back Office', 'Backoffice and Operations',
  'active', '802', '802',
  'Mr', 'Male', '1996-01-19'::date, 'Single',
  'Indian', 'Hindu', '7624033268',
  '2026-04-16'::date, '2026-04-16'::date, 'B', 'Staff',
  'GROSS', 'Day', 'active',
  'FPFPP0410C', '556563511300',
  FALSE, FALSE, FALSE,
  'Siddharth Xclusive, Sargasan, Gandhinagar',
  'GANDHINAGAR', 'GUJARAT', 'INDIA',
  '#14B8A6', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE organization_id=1 AND device_enrollment_id='802');

-- 804: Shyamal Mahendrabhai Bhatt
INSERT INTO users (name, email, password, role, organization_id, department, position,
  employment_status, device_enrollment_id, employee_id,
  salutation, gender, date_of_birth, blood_group, marital_status,
  nationality, religion, height, weight, phone,
  joining_date, grade, pay_cadre,
  salary_structure, salary_on, employee_status,
  pan_number, aadhar_no,
  pf_applicable, esi_applicable, pt_applicable, pt_rule,
  current_address_line1, current_city, current_state, current_country, current_postal_code,
  permanent_address, avatar_color, force_password_change)
SELECT
  'Shyamal Mahendrabhai Bhatt', 'shyamal.bhatt@relitrade.in',
  '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u',
  'employee', 1, 'IT', 'Executive',
  'active', '804', '804',
  'Mr', 'Male', '1981-09-14'::date, 'A+', 'Married',
  'Indian', 'Hindu', '5', '65', '9624014981',
  '2026-06-16'::date, 'A', 'Staff',
  'GROSS', 'Day', 'active',
  'ANOPB5210G', '648617253636',
  FALSE, FALSE, TRUE, 'GUJARAT',
  'K 304 Sayona Green, Behind Vodafone, Gota, Daskroi',
  'AHMEDABAD', 'GUJARAT', 'INDIA', '382481',
  'K 304 Sayona Green, Behind Vodafone, Gota, Daskroi AHMEDABAD-382481 GUJARAT INDIA',
  '#84CC16', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE organization_id=1 AND device_enrollment_id='804');

-- 806: Bhavyakumar Sanjaykumar Bhavsar
INSERT INTO users (name, email, password, role, organization_id, department, position,
  employment_status, device_enrollment_id, employee_id,
  salutation, gender, date_of_birth, marital_status,
  nationality, religion, phone,
  joining_date, grade, pay_cadre,
  salary_structure, salary_on, employee_status,
  pan_number, aadhar_no,
  pf_applicable, esi_applicable, pt_applicable, pt_rule,
  current_address_line1, current_city, current_state, current_country, current_postal_code,
  permanent_address, avatar_color, force_password_change)
SELECT
  'Bhavyakumar Sanjaykumar Bhavsar', 'bhavyakumar.bhavsar@relitrade.in',
  '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u',
  'employee', 1, 'Dealer', 'Dealer',
  'active', '806', '806',
  'Mr', 'Male', '2003-02-27'::date, 'Single',
  'Indian', 'Hindu', '8487930325',
  '2026-07-01'::date, 'B', 'Staff',
  'GROSS', 'Day', 'active',
  'SLPPS7679M', '215382823534',
  FALSE, FALSE, TRUE, 'GUJARAT',
  'Vihar, Gandhinagar, Gujarat, 382810',
  'GANDHINAGAR', 'GUJARAT', 'INDIA', '382810',
  'Vihar, Gandhinagar, Gujarat, 382810 GANDHINAGAR-382810 GUJARAT INDIA',
  '#EC4899', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE organization_id=1 AND device_enrollment_id='806');


-- ─────────────────────────────────────────────────────────────
-- 2. BIOMETRIC MAP for all 10 new employees
-- ─────────────────────────────────────────────────────────────
INSERT INTO biometric_employee_map (org_id, employee_pin, user_id)
SELECT 1, u.device_enrollment_id, u.id
FROM users u
WHERE u.organization_id = 1
  AND u.device_enrollment_id IN ('480','638','642','689','692','693','694','802','804','806')
ON CONFLICT (org_id, employee_pin) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 3. BRANCH ID for all 12 employees
-- ─────────────────────────────────────────────────────────────
UPDATE users u
SET branch_id = b.id
FROM branches b
WHERE b.org_id = 1
  AND b.name = 'Gift City Gandhinagar'
  AND u.organization_id = 1
  AND u.device_enrollment_id IN ('480','638','642','674','677','689','692','693','694','802','804','806');


-- ─────────────────────────────────────────────────────────────
-- 4. FAMILY MEMBERS (::date cast fixed throughout)
-- ─────────────────────────────────────────────────────────────

-- 638 — Zarna Suthar
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='638')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, date_of_birth, occupation, dependent)
SELECT e.id, 1, 'father', 'Dilipbhai',     '1996-06-01'::date, NULL,   false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Meenaben',      NULL,               NULL,   false FROM emp e
UNION ALL SELECT e.id, 1, 'spouse', 'Mukesh Suthar', '1988-09-22'::date, NULL,   false FROM emp e
UNION ALL SELECT e.id, 1, 'child',  'Viya Suthar',   '2017-07-19'::date, NULL,   true  FROM emp e
UNION ALL SELECT e.id, 1, 'child',  'Hayan Suthar',  '2022-09-22'::date, NULL,   true  FROM emp e
ON CONFLICT DO NOTHING;

-- 642 — Mukesh Thakor
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='642')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, dependent)
SELECT e.id, 1, 'father', 'Mohanbhai Govindbhai Thakor',    false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Savitaben Mohanbhai Thakor',  false FROM emp e
UNION ALL SELECT e.id, 1, 'spouse', 'Shyamliben Mukeshbhai Thakor',false FROM emp e
ON CONFLICT DO NOTHING;

-- 674 — Jignesh Pandya
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='674')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, dependent)
SELECT e.id, 1, 'father', 'Indulal Pandya', false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Meena Pandya',  false FROM emp e
UNION ALL SELECT e.id, 1, 'spouse', 'Pooja Pandya',  false FROM emp e
ON CONFLICT DO NOTHING;

-- 677 — Ishanee Bhatt (failed in original due to date cast error — fixed here)
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='677')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, date_of_birth, occupation, dependent)
SELECT e.id, 1, 'father', 'Piyushkumar Bhatt', '1965-09-26'::date, 'Government job', false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Parulben Bhatt', '1970-01-27'::date, 'House wife',     false FROM emp e
ON CONFLICT DO NOTHING;

-- 689 — Megh Bhavsar
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='689')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, date_of_birth, occupation, dependent)
SELECT e.id, 1, 'father', 'Bhavsar Prakashkumar Himatlal',  '1972-07-16'::date, 'Photography', false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Bhavsar Hetalben Prakashkumar', '1979-02-10'::date, 'Home Work',   false FROM emp e
ON CONFLICT DO NOTHING;

-- 692 — Chirag Patel
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='692')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, date_of_birth, dependent)
SELECT e.id, 1, 'father', 'Vishnubhai Patel',   '1959-05-10'::date, false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Bharatiben Patel', '1966-06-01'::date, false FROM emp e
UNION ALL SELECT e.id, 1, 'spouse', 'Anita Patel',      '1989-12-15'::date, false FROM emp e
ON CONFLICT DO NOTHING;

-- 694 — Jaydip Patel
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='694')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, date_of_birth, occupation, dependent)
SELECT e.id, 1, 'father', 'Patel Kanubhai Revabhai',   '1971-11-16'::date, 'Farmer & Businessmen', false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Patel Surekhaben Kanubhai', '1975-06-01'::date, 'Home Maker',           false FROM emp e
UNION ALL SELECT e.id, 1, 'spouse', 'Patel Nikitaben Jaydip',    '2001-11-17'::date, NULL,                   false FROM emp e
ON CONFLICT DO NOTHING;

-- 802 — Bhavna Parekh
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='802')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, dependent)
SELECT e.id, 1, 'father', 'Shaileshbhai Parekh', false FROM emp e
ON CONFLICT DO NOTHING;

-- 804 — Shyamal Bhatt
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='804')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, date_of_birth, occupation, dependent)
SELECT e.id, 1, 'father', 'Mahendrabhai Bhatt',          NULL,               NULL,              false FROM emp e
UNION ALL SELECT e.id, 1, 'mother', 'Jyoti Mahendra Bhatt', '1947-02-28'::date, 'Retired Teacher', false FROM emp e
UNION ALL SELECT e.id, 1, 'spouse', 'Arti Shyamal Bhatt',   '1985-02-25'::date, NULL,              false FROM emp e
UNION ALL SELECT e.id, 1, 'child',  'Atharv Shyamal Bhatt', '2018-12-20'::date, NULL,              true  FROM emp e
ON CONFLICT DO NOTHING;

-- 806 — Bhavyakumar Bhavsar
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='806')
INSERT INTO employee_family_members (employee_id, organization_id, relationship, name, dependent)
SELECT e.id, 1, 'father', 'Sanjaykumar Bhavsar', false FROM emp e
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 5. NOMINEES
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
-- 6. BANK ACCOUNTS
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
-- 7. DRIVING LICENSES
-- ─────────────────────────────────────────────────────────────
WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='689')
INSERT INTO employee_government_documents (employee_id, organization_id, document_type, document_number, expiry_date)
SELECT e.id, 1, 'driving_license', 'GJ18 20230005672', '2044-01-11'::date FROM emp e
ON CONFLICT (employee_id, document_type, organization_id) DO UPDATE
  SET document_number = EXCLUDED.document_number, expiry_date = EXCLUDED.expiry_date;

WITH emp AS (SELECT id FROM users WHERE organization_id=1 AND device_enrollment_id='694')
INSERT INTO employee_government_documents (employee_id, organization_id, document_type, document_number, expiry_date)
SELECT e.id, 1, 'driving_license', 'GJ0220210021766', '2041-04-15'::date FROM emp e
ON CONFLICT (employee_id, document_type, organization_id) DO UPDATE
  SET document_number = EXCLUDED.document_number, expiry_date = EXCLUDED.expiry_date;


-- ─────────────────────────────────────────────────────────────
-- 8. PAYROLL STRUCTURES
-- ─────────────────────────────────────────────────────────────
DELETE FROM payroll_structures
WHERE organization_id = 1
  AND user_id IN (
    SELECT id FROM users WHERE organization_id=1
      AND device_enrollment_id IN ('638','642','674','677','692','693','694','802')
  );

INSERT INTO payroll_structures (user_id, organization_id, basic, esi_employee, esi_employer, professional_tax, effective_from)
SELECT u.id, 1, 17330, 130, 563, 200, '2023-12-13'::date FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='638';

INSERT INTO payroll_structures (user_id, organization_id, basic, esi_employee, esi_employer, professional_tax, effective_from)
SELECT u.id, 1, 15980, 120, 519, 200, '2024-01-18'::date FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='642';

INSERT INTO payroll_structures (user_id, organization_id, basic, professional_tax, effective_from)
SELECT u.id, 1, 150000, 200, '2025-02-03'::date FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='674';

INSERT INTO payroll_structures (user_id, organization_id, basic, professional_tax, effective_from)
SELECT u.id, 1, 32000, 200, '2025-05-15'::date FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='677';

INSERT INTO payroll_structures (user_id, organization_id, basic, professional_tax, effective_from)
SELECT u.id, 1, 37500, 200, '2025-12-15'::date FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='692';

INSERT INTO payroll_structures (user_id, organization_id, basic, professional_tax, effective_from)
SELECT u.id, 1, 30000, 200, '2026-01-01'::date FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='693';

INSERT INTO payroll_structures (user_id, organization_id, basic, esi_employee, pf_employee, esi_employer, pf_employer, professional_tax, effective_from)
SELECT u.id, 1, 15103, 113, 906, 491, 906, 200, '2026-01-01'::date FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='694';

INSERT INTO payroll_structures (user_id, organization_id, basic, esi_employee, esi_employer, professional_tax, effective_from)
SELECT u.id, 1, 14530, 109, 472, 200, '2026-04-16'::date FROM users u WHERE u.organization_id=1 AND u.device_enrollment_id='802';


-- ─────────────────────────────────────────────────────────────
-- 9. CTC UPDATE
-- ─────────────────────────────────────────────────────────────
UPDATE users SET ctc = 17330*12,  salary_effective_date = '2023-12-13'::date WHERE organization_id=1 AND device_enrollment_id='638';
UPDATE users SET ctc = 15980*12,  salary_effective_date = '2024-01-18'::date WHERE organization_id=1 AND device_enrollment_id='642';
UPDATE users SET ctc = 150000*12, salary_effective_date = '2025-02-03'::date WHERE organization_id=1 AND device_enrollment_id='674';
UPDATE users SET ctc = 32000*12,  salary_effective_date = '2025-05-15'::date WHERE organization_id=1 AND device_enrollment_id='677';
UPDATE users SET ctc = 37500*12,  salary_effective_date = '2025-12-15'::date WHERE organization_id=1 AND device_enrollment_id='692';
UPDATE users SET ctc = 30000*12,  salary_effective_date = '2026-01-01'::date WHERE organization_id=1 AND device_enrollment_id='693';
UPDATE users SET ctc = 15103*12,  salary_effective_date = '2026-01-01'::date WHERE organization_id=1 AND device_enrollment_id='694';
UPDATE users SET ctc = 14530*12,  salary_effective_date = '2026-04-16'::date WHERE organization_id=1 AND device_enrollment_id='802';


-- ─────────────────────────────────────────────────────────────
-- 10. VERIFICATION — should show all 12 employees
-- ─────────────────────────────────────────────────────────────
SELECT
  u.device_enrollment_id AS pin,
  u.name,
  u.department,
  u.pan_number,
  u.joining_date::text,
  u.ctc,
  (SELECT COUNT(*) FROM employee_family_members f WHERE f.employee_id = u.id) AS family_count,
  (SELECT COUNT(*) FROM employee_bank_accounts  b WHERE b.employee_id = u.id) AS bank_count,
  (SELECT COUNT(*) FROM payroll_structures       p WHERE p.user_id    = u.id) AS payroll_count
FROM users u
WHERE u.organization_id = 1
  AND u.device_enrollment_id IN ('480','638','642','674','677','689','692','693','694','802','804','806')
ORDER BY u.device_enrollment_id::integer;
