-- ============================================================
-- Historical Attendance + Leave Data  (Jan–Apr 2026)
-- Run in: Supabase → SQL Editor → New query → Run
-- ============================================================

-- ── STEP 1 : ATTENDANCE TABLE ──────────────────────────────

WITH emp AS (
  SELECT id, name
  FROM users
  WHERE name IN ('Riken','Priyanshu Patel','Hetanshi Parmar','Khushi','Avan','Dhruv Shere')
)
INSERT INTO attendance (user_id, date, status)
SELECT e.id, v.date, v.status
FROM (VALUES
  -- ── RIKEN ──────────────────────────────────────────────
  ('Riken',           '2026-02-23', 'on_leave'),
  ('Riken',           '2026-02-24', 'on_leave'),
  ('Riken',           '2026-02-25', 'on_leave'),
  ('Riken',           '2026-02-26', 'on_leave'),

  -- ── PRIYANSHU PATEL ────────────────────────────────────
  ('Priyanshu Patel', '2026-01-21', 'absent'),
  ('Priyanshu Patel', '2026-01-22', 'wfh'),
  ('Priyanshu Patel', '2026-01-23', 'absent'),
  ('Priyanshu Patel', '2026-03-17', 'half_day'),
  ('Priyanshu Patel', '2026-03-24', 'half_day'),

  -- ── HETANSHI PARMAR ────────────────────────────────────
  ('Hetanshi Parmar', '2026-01-13', 'half_day'),
  ('Hetanshi Parmar', '2026-02-04', 'absent'),
  ('Hetanshi Parmar', '2026-02-05', 'absent'),
  ('Hetanshi Parmar', '2026-02-06', 'wfh'),
  ('Hetanshi Parmar', '2026-02-19', 'absent'),
  ('Hetanshi Parmar', '2026-02-20', 'absent'),
  ('Hetanshi Parmar', '2026-02-23', 'wfh'),
  ('Hetanshi Parmar', '2026-03-05', 'wfh'),
  ('Hetanshi Parmar', '2026-03-06', 'wfh'),
  ('Hetanshi Parmar', '2026-04-01', 'half_day'),

  -- ── KHUSHI ─────────────────────────────────────────────
  ('Khushi',          '2026-01-13', 'half_day'),
  ('Khushi',          '2026-02-02', 'absent'),
  ('Khushi',          '2026-02-03', 'absent'),
  ('Khushi',          '2026-02-10', 'absent'),
  ('Khushi',          '2026-03-18', 'absent'),
  ('Khushi',          '2026-03-23', 'absent'),

  -- ── AVAN ───────────────────────────────────────────────
  ('Avan',            '2026-01-21', 'absent'),
  ('Avan',            '2026-01-22', 'wfh'),
  ('Avan',            '2026-01-23', 'absent'),
  ('Avan',            '2026-03-10', 'absent'),
  ('Avan',            '2026-03-17', 'half_day'),
  ('Avan',            '2026-03-31', 'absent'),

  -- ── DHRUV SHERE ────────────────────────────────────────
  ('Dhruv Shere',     '2026-02-02', 'wfh'),
  ('Dhruv Shere',     '2026-02-06', 'absent'),
  ('Dhruv Shere',     '2026-02-09', 'absent')

) AS v(name, date, status)
JOIN emp e ON e.name = v.name
ON CONFLICT (user_id, date) DO NOTHING;


-- ── STEP 2 : LEAVES TABLE ──────────────────────────────────
-- Required so the app's cleanup job does not strip on_leave /
-- half_day / wfh attendance rows that have no approved leave.
-- (absent rows do NOT need a leave record)

WITH emp AS (
  SELECT id, name
  FROM users
  WHERE name IN ('Riken','Priyanshu Patel','Hetanshi Parmar','Khushi','Avan','Dhruv Shere')
)
INSERT INTO leaves (user_id, start_date, end_date, leave_type, leave_time, reason, status, approved_at)
SELECT e.id, v.start_date, v.end_date, v.leave_type, v.leave_time, 'Historical data', 'approved', NOW()
FROM (VALUES
  -- ── RIKEN  (4 consecutive days = 1 leave record) ───────
  ('Riken',           '2026-02-23', '2026-02-26', 'casual', 'full'),

  -- ── PRIYANSHU PATEL ────────────────────────────────────
  ('Priyanshu Patel', '2026-01-22', '2026-01-22', 'casual', 'wfh'),
  ('Priyanshu Patel', '2026-03-17', '2026-03-17', 'casual', 'half'),
  ('Priyanshu Patel', '2026-03-24', '2026-03-24', 'casual', 'half'),

  -- ── HETANSHI PARMAR ────────────────────────────────────
  ('Hetanshi Parmar', '2026-01-13', '2026-01-13', 'casual', 'half'),
  ('Hetanshi Parmar', '2026-02-06', '2026-02-06', 'casual', 'wfh'),
  ('Hetanshi Parmar', '2026-02-23', '2026-02-23', 'casual', 'wfh'),
  ('Hetanshi Parmar', '2026-03-05', '2026-03-06', 'casual', 'wfh'),
  ('Hetanshi Parmar', '2026-04-01', '2026-04-01', 'casual', 'half'),

  -- ── KHUSHI ─────────────────────────────────────────────
  ('Khushi',          '2026-01-13', '2026-01-13', 'casual', 'half'),

  -- ── AVAN ───────────────────────────────────────────────
  ('Avan',            '2026-01-22', '2026-01-22', 'casual', 'wfh'),
  ('Avan',            '2026-03-17', '2026-03-17', 'casual', 'half'),

  -- ── DHRUV SHERE ────────────────────────────────────────
  ('Dhruv Shere',     '2026-02-02', '2026-02-02', 'casual', 'wfh')

) AS v(name, start_date, end_date, leave_type, leave_time)
JOIN emp e ON e.name = v.name;
