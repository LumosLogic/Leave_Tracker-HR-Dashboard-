-- ============================================================
-- SANGHAVI ASSOCIATION — Real Data Seed
-- Device data + Transaction data from ZKTeco WDMS export
-- Run AFTER sanghavi_migration.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. BRANCHES (from device area locations)
-- ─────────────────────────────────────────────────────────────

INSERT INTO branches (org_id, name, code, location, is_active) VALUES
  (1, 'Main Area (Ahmedabad)',  'MAIN', 'Ahmedabad',       true),
  (1, 'Dalal',                  'DLAL', 'Ahmedabad',       true),
  (1, 'Third Floor',            'TF',   'Ahmedabad',       true),
  (1, 'CG Road',                'CGR',  'CG Road, Ahmedabad', true),
  (1, 'Bapunagar',              'BPNG', 'Bapunagar, Ahmedabad', true),
  (1, 'Bhuj',                   'BHUJ', 'Bhuj',            true),
  (1, 'Insurance Bhuj',         'IBHJ', 'Bhuj',            true)
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 2. BIOMETRIC DEVICES (all 7 ZKTeco devices)
-- ─────────────────────────────────────────────────────────────

INSERT INTO biometric_devices
  (org_id, serial_number, device_name, location, branch_id, area_code, device_ip, status, last_seen)
SELECT
  1,
  d.serial_number,
  d.device_name,
  d.location,
  b.id AS branch_id,
  d.area_code,
  d.device_ip,
  d.status,
  d.last_seen::timestamptz
FROM (VALUES
  ('BYEL184460001', 'Main Area',     'Main Area',     2,  '192.168.10.20',  'online',  '2026-07-08 13:02:07', 'Main Area (Ahmedabad)'),
  ('BYEL194660080', 'Dalal',         'Dalal',         6,  '192.168.0.250',  'online',  '2026-07-08 13:02:05', 'Dalal'),
  ('CK5T222360083', 'Third Floor',   'Third-Floor',   4,  '192.168.10.205', 'online',  '2026-07-08 13:02:48', 'Third Floor'),
  ('JJA1241000273', 'CG Road',       'CG Road',       7,  '192.168.1.2',    'online',  '2026-07-08 13:02:44', 'CG Road'),
  ('JJA1241900816', 'Bapunagar',     'Bapunagaar',    9,  '192.168.1.202',  'online',  '2026-07-08 13:02:50', 'Bapunagar'),
  ('BHXZ193560692', 'InsuranceBhuj', 'InsuranceBhuj', 25, '192.168.0.45',   'offline', '2026-06-09 15:26:36', 'Insurance Bhuj'),
  ('JJA1241900721', 'Bhuj',          'Bhuj',          8,  '192.168.1.2',    'offline', '2026-03-25 08:28:21', 'Bhuj')
) AS d(serial_number, device_name, location, area_code, device_ip, status, last_seen, branch_name)
JOIN branches b ON b.org_id = 1 AND b.name = d.branch_name
ON CONFLICT (serial_number) DO UPDATE SET
  device_name = EXCLUDED.device_name,
  location    = EXCLUDED.location,
  branch_id   = EXCLUDED.branch_id,
  area_code   = EXCLUDED.area_code,
  device_ip   = EXCLUDED.device_ip,
  status      = EXCLUDED.status,
  last_seen   = EXCLUDED.last_seen;


-- ─────────────────────────────────────────────────────────────
-- 3. ADMIN USER (HR Admin for Sanghavi)
-- ─────────────────────────────────────────────────────────────

-- Password: Sanghavi@2026 (bcrypt — change after first login)
INSERT INTO users (name, email, password, role, organization_id, department, position, avatar_color)
VALUES (
  'HR Admin',
  'hr@sanghavi.com',
  '$2a$10$Bd0ca28WZ66lZSDUutYhweBgUrJCbBk1fIoe.DCBVoJOwrwHytUse',
  'admin',
  1,
  'Human Resources',
  'HR Manager',
  '#3525cd'
)
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 4. EMPLOYEES from transaction data (all unique PINs)
--    device_enrollment_id = ZKTeco PIN
--    Temp password: Change@1234 — force password change on login
-- ─────────────────────────────────────────────────────────────

INSERT INTO users
  (name, email, password, role, organization_id, department, employment_status,
   device_enrollment_id, avatar_color, force_password_change)
VALUES
  ('Emp 405',        'emp405@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '405',       '#4F46E5', true),
  ('Emp 431',        'emp431@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '431',       '#10B981', true),
  ('Emp 432',        'emp432@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '432',       '#F59E0B', true),
  ('Aakash',         'aakash443@sanghavi.com',     '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '443',       '#EF4444', true),
  ('Emp 448',        'emp448@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '448',       '#8B5CF6', true),
  ('Emp 480',        'emp480@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '480',       '#F97316', true),
  ('Emp 523',        'emp523@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '523',       '#06B6D4', true),
  ('Emp 554',        'emp554@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '554',       '#84CC16', true),
  ('Vishalvaghela',  'vishal587@sanghavi.com',     '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '587',       '#EC4899', true),
  ('Emp 628',        'emp628@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '628',       '#6366F1', true),
  ('Emp 635',        'emp635@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '635',       '#D946EF', true),
  ('Emp 638',        'emp638@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '638',       '#14B8A6', true),
  ('Emp 642',        'emp642@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '642',       '#FB923C', true),
  ('Emp 653',        'emp653@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '653',       '#A78BFA', true),
  ('Emp 670',        'emp670@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '670',       '#34D399', true),
  ('Emp 683',        'emp683@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '683',       '#FCD34D', true),
  ('Emp 689',        'emp689@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '689',       '#F87171', true),
  ('Emp 690',        'emp690@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '690',       '#60A5FA', true),
  ('Emp 692',        'emp692@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '692',       '#C084FC', true),
  ('Emp 693',        'emp693@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '693',       '#4ADE80', true),
  ('Emp 694',        'emp694@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '694',       '#FB7185', true),
  ('Emp 698',        'emp698@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '698',       '#2DD4BF', true),
  ('Emp 801',        'emp801@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '801',       '#FCA5A5', true),
  ('Emp 802',        'emp802@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '802',       '#93C5FD', true),
  ('Emp 803',        'emp803@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '803',       '#D8B4FE', true),
  ('Emp 804',        'emp804@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '804',       '#6EE7B7', true),
  ('Emp 805',        'emp805@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '805',       '#FDE68A', true),
  ('Emp 806',        'emp806@sanghavi.com',        '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '806',       '#FECACA', true),
  ('Emp 10000001',   'emp10000001@sanghavi.com',   '$2a$10$jmYpe0h87c.K1D5Kns9h.eKZfI6rzuPn8/b/4/M1n1VOmSViWQx6u', 'employee', 1, 'Department', 'active', '10000001',  '#BAE6FD', true)
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 5. BIOMETRIC EMPLOYEE MAP (PIN → user_id)
-- ─────────────────────────────────────────────────────────────

INSERT INTO biometric_employee_map (org_id, employee_pin, user_id)
SELECT 1, u.device_enrollment_id, u.id
FROM users u
WHERE u.organization_id = 1
  AND u.device_enrollment_id IS NOT NULL
  AND u.role = 'employee'
ON CONFLICT (org_id, employee_pin) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 6. BIOMETRIC RAW LOGS + ATTENDANCE
--    From the real transaction export (2026-07-08)
--    Check In = punch_type 0, Check Out = punch_type 1
-- ─────────────────────────────────────────────────────────────

INSERT INTO biometric_raw_logs
  (org_id, device_serial, employee_pin, punch_time, punch_type, area, processed)
VALUES
  (1, 'BYEL184460001', '431',      '2026-07-08 13:04:05+05:30', 0, 'Main Area',     false),
  (1, 'BYEL184460001', '554',      '2026-07-08 13:02:06+05:30', 1, 'Main Area',     false),
  (1, 'BYEL194660080', '694',      '2026-07-08 13:01:40+05:30', 1, 'Dalal',         false),
  (1, 'BYEL194660080', '693',      '2026-07-08 13:01:18+05:30', 1, 'Dalal',         false),
  (1, 'BYEL194660080', '480',      '2026-07-08 13:00:50+05:30', 1, 'Dalal',         false),
  (1, 'BYEL194660080', '806',      '2026-07-08 12:59:17+05:30', 0, 'Dalal',         false),
  (1, 'BYEL194660080', '689',      '2026-07-08 12:59:06+05:30', 0, 'Dalal',         false),
  (1, 'BYEL184460001', '523',      '2026-07-08 12:58:18+05:30', 1, 'Main Area',     false),
  (1, 'JJA1241000273', '587',      '2026-07-08 12:55:30+05:30', 0, 'CG Road',       false),
  (1, 'BYEL194660080', '806',      '2026-07-08 12:54:20+05:30', 1, 'Dalal',         false),
  (1, 'BYEL194660080', '804',      '2026-07-08 12:54:19+05:30', 0, 'Dalal',         false),
  (1, 'BYEL184460001', '698',      '2026-07-08 12:52:14+05:30', 1, 'Main Area',     false),
  (1, 'BYEL194660080', '689',      '2026-07-08 12:52:05+05:30', 1, 'Dalal',         false),
  (1, 'BYEL194660080', '804',      '2026-07-08 12:51:58+05:30', 1, 'Dalal',         false),
  (1, 'BYEL194660080', '693',      '2026-07-08 12:51:47+05:30', 0, 'Dalal',         false),
  (1, 'BYEL184460001', '801',      '2026-07-08 12:51:23+05:30', 1, 'Main Area',     false),
  (1, 'BYEL184460001', '805',      '2026-07-08 12:51:21+05:30', 1, 'Main Area',     false),
  (1, 'BYEL184460001', '690',      '2026-07-08 12:51:14+05:30', 1, 'Main Area',     false),
  (1, 'BYEL184460001', '803',      '2026-07-08 12:51:04+05:30', 1, 'Main Area',     false),
  (1, 'BYEL194660080', '693',      '2026-07-08 12:46:56+05:30', 1, 'Dalal',         false),
  (1, 'JJA1241000273', '587',      '2026-07-08 12:44:13+05:30', 1, 'CG Road',       false),
  (1, 'BYEL184460001', '653',      '2026-07-08 12:40:52+05:30', 0, 'Main Area',     false),
  (1, 'BYEL184460001', '448',      '2026-07-08 12:40:48+05:30', 0, 'Main Area',     false),
  (1, 'BYEL184460001', '628',      '2026-07-08 12:40:43+05:30', 1, 'Main Area',     false),
  (1, 'BYEL184460001', '670',      '2026-07-08 12:40:36+05:30', 1, 'Main Area',     false),
  (1, 'BYEL194660080', '642',      '2026-07-08 12:39:00+05:30', 0, 'Dalal',         false),
  (1, 'BYEL184460001', '683',      '2026-07-08 12:38:33+05:30', 0, 'Main Area',     false),
  (1, 'BYEL194660080', '638',      '2026-07-08 12:38:32+05:30', 0, 'Dalal',         false),
  (1, 'BYEL184460001', '405',      '2026-07-08 12:36:50+05:30', 0, 'Main Area',     false),
  (1, 'JJA1241000273', '10000001', '2026-07-08 12:34:54+05:30', 1, 'CG Road',       false),
  (1, 'BYEL184460001', '441',      '2026-07-08 12:32:57+05:30', 0, 'Main Area',     false),
  (1, 'BYEL184460001', '432',      '2026-07-08 12:30:30+05:30', 0, 'Main Area',     false),
  (1, 'BYEL184460001', '683',      '2026-07-08 12:29:14+05:30', 1, 'Main Area',     false),
  (1, 'BYEL194660080', '638',      '2026-07-08 12:27:00+05:30', 1, 'Dalal',         false),
  (1, 'BYEL194660080', '689',      '2026-07-08 12:26:53+05:30', 0, 'Dalal',         false),
  (1, 'BYEL184460001', '432',      '2026-07-08 12:26:50+05:30', 1, 'Main Area',     false),
  (1, 'BYEL194660080', '806',      '2026-07-08 12:26:09+05:30', 0, 'Dalal',         false),
  (1, 'JJA1241000273', '443',      '2026-07-08 12:24:49+05:30', 1, 'CG Road',       false),
  (1, 'BYEL194660080', '689',      '2026-07-08 12:23:15+05:30', 1, 'Dalal',         false),
  (1, 'BYEL194660080', '804',      '2026-07-08 12:22:18+05:30', 0, 'Dalal',         false),
  (1, 'BYEL194660080', '806',      '2026-07-08 12:21:33+05:30', 1, 'Dalal',         false),
  (1, 'BYEL184460001', '448',      '2026-07-08 12:20:53+05:30', 1, 'Main Area',     false),
  (1, 'BYEL184460001', '635',      '2026-07-08 12:20:32+05:30', 1, 'Main Area',     false),
  (1, 'BYEL194660080', '692',      '2026-07-08 12:15:02+05:30', 0, 'Dalal',         false),
  (1, 'BYEL194660080', '804',      '2026-07-08 12:14:31+05:30', 1, 'Dalal',         false),
  (1, 'BYEL184460001', '653',      '2026-07-08 12:14:10+05:30', 1, 'Main Area',     false),
  (1, 'BYEL194660080', '802',      '2026-07-08 12:12:31+05:30', 0, 'Dalal',         false),
  (1, 'BYEL184460001', '441',      '2026-07-08 12:11:38+05:30', 1, 'Main Area',     false),
  (1, 'BYEL184460001', '683',      '2026-07-08 12:11:21+05:30', 1, 'Main Area',     false),
  (1, 'BYEL194660080', '692',      '2026-07-08 12:09:03+05:30', 1, 'Dalal',         false)
ON CONFLICT (device_serial, punch_time, employee_pin) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 7. PROCESS LOGS INTO ATTENDANCE RECORDS
--    For each employee, determine check_in and check_out
--    based on first/last punch of the day
-- ─────────────────────────────────────────────────────────────

-- Group punches by employee + date, compute check_in (first) and check_out (last)
WITH punch_summary AS (
  SELECT
    m.user_id,
    DATE(l.punch_time AT TIME ZONE 'Asia/Kolkata') AS att_date,
    MIN(l.punch_time AT TIME ZONE 'Asia/Kolkata') AS first_punch,
    MAX(l.punch_time AT TIME ZONE 'Asia/Kolkata') AS last_punch,
    COUNT(*) AS punch_count
  FROM biometric_raw_logs l
  JOIN biometric_employee_map m ON m.org_id = l.org_id AND m.employee_pin = l.employee_pin
  WHERE l.org_id = 1
  GROUP BY m.user_id, DATE(l.punch_time AT TIME ZONE 'Asia/Kolkata')
),
attendance_data AS (
  SELECT
    ps.user_id,
    ps.att_date::text AS date,
    TO_CHAR(ps.first_punch, 'HH24:MI:SS') AS check_in,
    CASE WHEN ps.punch_count > 1 THEN TO_CHAR(ps.last_punch, 'HH24:MI:SS') ELSE NULL END AS check_out,
    CASE WHEN ps.punch_count > 1 THEN
      ROUND(EXTRACT(EPOCH FROM (ps.last_punch - ps.first_punch)) / 3600.0, 2)
    ELSE 0 END AS work_hours,
    1 AS organization_id,
    'biometric' AS source,
    'present' AS status
  FROM punch_summary ps
)
INSERT INTO attendance (user_id, date, check_in, check_out, work_hours, organization_id, source, status)
SELECT user_id, date, check_in, check_out, work_hours, organization_id, source, status
FROM attendance_data
ON CONFLICT (user_id, date, organization_id) DO UPDATE SET
  check_in   = EXCLUDED.check_in,
  check_out  = EXCLUDED.check_out,
  work_hours = EXCLUDED.work_hours,
  source     = 'biometric';

-- Mark all logs as processed
UPDATE biometric_raw_logs SET processed = true WHERE org_id = 1;


-- ─────────────────────────────────────────────────────────────
-- 8. VERIFICATION
-- ─────────────────────────────────────────────────────────────

SELECT 'Branches'         AS entity, COUNT(*) AS count FROM branches WHERE org_id = 1
UNION ALL
SELECT 'Devices',          COUNT(*) FROM biometric_devices WHERE org_id = 1
UNION ALL
SELECT 'Employees',        COUNT(*) FROM users WHERE organization_id = 1 AND role = 'employee'
UNION ALL
SELECT 'PIN Mappings',     COUNT(*) FROM biometric_employee_map WHERE org_id = 1
UNION ALL
SELECT 'Raw Punch Logs',   COUNT(*) FROM biometric_raw_logs WHERE org_id = 1
UNION ALL
SELECT 'Attendance Rows',  COUNT(*) FROM attendance WHERE organization_id = 1;
