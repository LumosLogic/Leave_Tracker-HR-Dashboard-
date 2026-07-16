-- ============================================================
-- Leave + Attendance Reset: LumosLogic (org_id = 1)
-- Clears ALL leave/WFH/half-day data and re-inserts verified
-- records date-by-date for every employee.
--
-- Employee IDs:
--   7  = Avan Bhalodiya
--   8  = DHRUV SHERE
--   10 = Hetanshi Parmar
--   12 = Khushi Ahajoliya   (no leaves)
--   15 = Praizy James
--   17 = Priyanshu Patel
--   18 = Riken Rachhadiya
--   34 = Paramveer Zala
--
-- leaves.leave_type  : 'casual' | 'sick' | 'wfh'
-- leaves.leave_time  : 'full'   | 'half' | 'wfh'
-- leaves.half_type   : '1st_half' | '2nd_half' | NULL
-- attendance.status  : 'on_leave' | 'wfh' | 'half_day'
--
-- Run in: Supabase → SQL Editor → New query → Run
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- STEP 1 — Wipe stale leave records
-- ════════════════════════════════════════════════════════════

DELETE FROM public.leaves
WHERE organization_id = 1;


-- ════════════════════════════════════════════════════════════
-- STEP 2 — Wipe stale leave/WFH/half-day attendance rows
--          (preserves present / absent / late rows)
-- ════════════════════════════════════════════════════════════

DELETE FROM public.attendance
WHERE organization_id = 1
  AND user_id IN (7, 8, 10, 12, 15, 17, 18, 34)
  AND status IN ('on_leave', 'wfh', 'half_day');


-- ════════════════════════════════════════════════════════════
-- STEP 3 — Insert correct leave records (one row per date)
-- ════════════════════════════════════════════════════════════

INSERT INTO public.leaves
  (user_id, start_date, end_date, leave_type, leave_time, half_type,
   reason, status, organization_id, approved_at)
VALUES

-- ── RIKEN RACHHADIYA (id = 18) ────────────────────────────

-- Half-day leaves
(18, '2026-04-14', '2026-04-14', 'casual', 'half', '2nd_half', 'Historical data', 'approved', 1, NOW()),
(18, '2026-04-24', '2026-04-24', 'casual', 'half', '2nd_half', 'Historical data', 'approved', 1, NOW()),

-- WFH (expanded: every weekday from 18-May to 01-Jul)
-- May 2026
(18, '2026-05-18', '2026-05-18', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-05-19', '2026-05-19', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-05-20', '2026-05-20', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-05-21', '2026-05-21', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-05-22', '2026-05-22', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-05-25', '2026-05-25', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-05-26', '2026-05-26', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-05-27', '2026-05-27', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-05-28', '2026-05-28', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-05-29', '2026-05-29', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
-- June 2026
(18, '2026-06-01', '2026-06-01', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-02', '2026-06-02', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-03', '2026-06-03', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-04', '2026-06-04', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-05', '2026-06-05', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-08', '2026-06-08', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-09', '2026-06-09', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-10', '2026-06-10', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-11', '2026-06-11', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-12', '2026-06-12', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-15', '2026-06-15', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-16', '2026-06-16', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-17', '2026-06-17', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-18', '2026-06-18', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-19', '2026-06-19', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-22', '2026-06-22', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-23', '2026-06-23', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-24', '2026-06-24', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-25', '2026-06-25', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-26', '2026-06-26', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-29', '2026-06-29', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-06-30', '2026-06-30', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
-- July 2026
(18, '2026-07-01', '2026-07-01', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),

-- Casual leaves (full day)
(18, '2026-02-04', '2026-02-04', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-02-05', '2026-02-05', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-03-23', '2026-03-23', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-03-24', '2026-03-24', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-03-25', '2026-03-25', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-03-26', '2026-03-26', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-07-02', '2026-07-02', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-07-03', '2026-07-03', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(18, '2026-07-06', '2026-07-06', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),

-- ── PRIYANSHU PATEL (id = 17) ─────────────────────────────

-- Half-day leaves
(17, '2026-03-17', '2026-03-17', 'casual', 'half', '1st_half', 'Historical data', 'approved', 1, NOW()),
(17, '2026-03-24', '2026-03-24', 'casual', 'half', '2nd_half', 'Historical data', 'approved', 1, NOW()),
(17, '2026-04-15', '2026-04-15', 'casual', 'half', '1st_half', 'Historical data', 'approved', 1, NOW()),

-- WFH
(17, '2026-01-22', '2026-01-22', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(17, '2026-06-19', '2026-06-19', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),

-- Casual leaves (full day)
(17, '2026-01-21', '2026-01-21', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(17, '2026-01-23', '2026-01-23', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(17, '2026-04-29', '2026-04-29', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(17, '2026-05-08', '2026-05-08', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),

-- ── DHRUV SHERE (id = 8) ──────────────────────────────────

-- WFH
(8, '2026-05-22', '2026-05-22', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(8, '2026-06-19', '2026-06-19', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),

-- Casual leaves (full day)
(8, '2026-02-06', '2026-02-06', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(8, '2026-02-09', '2026-02-09', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(8, '2026-03-20', '2026-03-20', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(8, '2026-04-02', '2026-04-02', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(8, '2026-04-23', '2026-04-23', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),

-- Sick leave
(8, '2026-05-21', '2026-05-21', 'sick', 'full', NULL, 'Historical data', 'approved', 1, NOW()),

-- ── PARAMVEER ZALA (id = 34) ──────────────────────────────

-- Casual leaves (full day)
(34, '2026-07-02', '2026-07-02', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(34, '2026-07-03', '2026-07-03', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),

-- ── AVAN BHALODIYA (id = 7) ───────────────────────────────

-- Half-day leaves
(7, '2026-03-17', '2026-03-17', 'casual', 'half', '1st_half', 'Historical data', 'approved', 1, NOW()),
(7, '2026-04-15', '2026-04-15', 'casual', 'half', '1st_half', 'Historical data', 'approved', 1, NOW()),
(7, '2026-05-08', '2026-05-08', 'casual', 'half', '1st_half', 'Historical data', 'approved', 1, NOW()),

-- Sick leave
(7, '2026-03-10', '2026-03-10', 'sick', 'full', NULL, 'Historical data', 'approved', 1, NOW()),

-- Casual leaves (full day)
(7, '2026-03-31', '2026-03-31', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(7, '2026-05-01', '2026-05-01', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(7, '2026-05-13', '2026-05-13', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(7, '2026-05-14', '2026-05-14', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(7, '2026-05-15', '2026-05-15', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(7, '2026-05-29', '2026-05-29', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),

-- ── HETANSHI PARMAR (id = 10) ─────────────────────────────

-- Half-day leaves
(10, '2026-02-19', '2026-02-19', 'casual', 'half', '2nd_half', 'Historical data', 'approved', 1, NOW()),
(10, '2026-04-01', '2026-04-01', 'casual', 'half', '1st_half', 'Historical data', 'approved', 1, NOW()),
(10, '2026-04-03', '2026-04-03', 'casual', 'half', '2nd_half', 'Historical data', 'approved', 1, NOW()),
(10, '2026-06-05', '2026-06-05', 'casual', 'half', '2nd_half', 'Historical data', 'approved', 1, NOW()),
(10, '2026-06-19', '2026-06-19', 'casual', 'half', '2nd_half', 'Historical data', 'approved', 1, NOW()),

-- WFH
(10, '2026-02-06', '2026-02-06', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(10, '2026-02-23', '2026-02-23', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(10, '2026-03-05', '2026-03-05', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(10, '2026-03-06', '2026-03-06', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(10, '2026-04-23', '2026-04-23', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(10, '2026-07-02', '2026-07-02', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),

-- Casual leaves (full day)
(10, '2026-02-04', '2026-02-04', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(10, '2026-02-05', '2026-02-05', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(10, '2026-02-20', '2026-02-20', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(10, '2026-06-08', '2026-06-08', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(10, '2026-06-09', '2026-06-09', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),

-- Sick leaves
(10, '2026-04-17', '2026-04-17', 'sick', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(10, '2026-05-15', '2026-05-15', 'sick', 'full', NULL, 'Historical data', 'approved', 1, NOW()),

-- ── PRAIZY JAMES (id = 15) ────────────────────────────────

-- Half-day leaves
(15, '2026-02-09', '2026-02-09', 'casual', 'half', '1st_half', 'Historical data', 'approved', 1, NOW()),
(15, '2026-02-10', '2026-02-10', 'casual', 'half', '1st_half', 'Historical data', 'approved', 1, NOW()),
(15, '2026-02-11', '2026-02-11', 'casual', 'half', '1st_half', 'Historical data', 'approved', 1, NOW()),
(15, '2026-04-30', '2026-04-30', 'casual', 'half', '2nd_half', 'Historical data', 'approved', 1, NOW()),
(15, '2026-05-07', '2026-05-07', 'casual', 'half', '1st_half', 'Historical data', 'approved', 1, NOW()),
(15, '2026-06-26', '2026-06-26', 'casual', 'half', '2nd_half', 'Historical data', 'approved', 1, NOW()),

-- WFH
(15, '2026-02-16', '2026-02-16', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-03-20', '2026-03-20', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-04-06', '2026-04-06', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-04-23', '2026-04-23', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-04-24', '2026-04-24', 'wfh', 'wfh', NULL, 'Historical data', 'approved', 1, NOW()),

-- Casual leaves (full day)
(15, '2026-02-12', '2026-02-12', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-02-13', '2026-02-13', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-03-19', '2026-03-19', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-03-23', '2026-03-23', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-03-24', '2026-03-24', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-03-25', '2026-03-25', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-03-26', '2026-03-26', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-04-03', '2026-04-03', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-04-28', '2026-04-28', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-04-29', '2026-04-29', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-05-08', '2026-05-08', 'casual', 'full', NULL, 'Historical data', 'approved', 1, NOW()),

-- Sick leaves
(15, '2026-04-21', '2026-04-21', 'sick', 'full', NULL, 'Historical data', 'approved', 1, NOW()),
(15, '2026-04-22', '2026-04-22', 'sick', 'full', NULL, 'Historical data', 'approved', 1, NOW());

-- KHUSHI (id = 12): no leave records


-- ════════════════════════════════════════════════════════════
-- STEP 4 — Insert correct attendance rows (one row per date)
--          ON CONFLICT: overwrite status if row already exists
-- ════════════════════════════════════════════════════════════

INSERT INTO public.attendance (user_id, date, status, organization_id)
VALUES

-- ── RIKEN (id = 18) ───────────────────────────────────────

-- Half-day
(18, '2026-04-14', 'half_day', 1),
(18, '2026-04-24', 'half_day', 1),

-- WFH (every weekday 18-May to 01-Jul)
(18, '2026-05-18', 'wfh', 1),
(18, '2026-05-19', 'wfh', 1),
(18, '2026-05-20', 'wfh', 1),
(18, '2026-05-21', 'wfh', 1),
(18, '2026-05-22', 'wfh', 1),
(18, '2026-05-25', 'wfh', 1),
(18, '2026-05-26', 'wfh', 1),
(18, '2026-05-27', 'wfh', 1),
(18, '2026-05-28', 'wfh', 1),
(18, '2026-05-29', 'wfh', 1),
(18, '2026-06-01', 'wfh', 1),
(18, '2026-06-02', 'wfh', 1),
(18, '2026-06-03', 'wfh', 1),
(18, '2026-06-04', 'wfh', 1),
(18, '2026-06-05', 'wfh', 1),
(18, '2026-06-08', 'wfh', 1),
(18, '2026-06-09', 'wfh', 1),
(18, '2026-06-10', 'wfh', 1),
(18, '2026-06-11', 'wfh', 1),
(18, '2026-06-12', 'wfh', 1),
(18, '2026-06-15', 'wfh', 1),
(18, '2026-06-16', 'wfh', 1),
(18, '2026-06-17', 'wfh', 1),
(18, '2026-06-18', 'wfh', 1),
(18, '2026-06-19', 'wfh', 1),
(18, '2026-06-22', 'wfh', 1),
(18, '2026-06-23', 'wfh', 1),
(18, '2026-06-24', 'wfh', 1),
(18, '2026-06-25', 'wfh', 1),
(18, '2026-06-26', 'wfh', 1),
(18, '2026-06-29', 'wfh', 1),
(18, '2026-06-30', 'wfh', 1),
(18, '2026-07-01', 'wfh', 1),

-- Casual leave (on_leave)
(18, '2026-02-04', 'on_leave', 1),
(18, '2026-02-05', 'on_leave', 1),
(18, '2026-03-23', 'on_leave', 1),
(18, '2026-03-24', 'on_leave', 1),
(18, '2026-03-25', 'on_leave', 1),
(18, '2026-03-26', 'on_leave', 1),
(18, '2026-07-02', 'on_leave', 1),
(18, '2026-07-03', 'on_leave', 1),
(18, '2026-07-06', 'on_leave', 1),

-- ── PRIYANSHU (id = 17) ───────────────────────────────────

-- Half-day
(17, '2026-03-17', 'half_day', 1),
(17, '2026-03-24', 'half_day', 1),
(17, '2026-04-15', 'half_day', 1),

-- WFH
(17, '2026-01-22', 'wfh', 1),
(17, '2026-06-19', 'wfh', 1),

-- Casual leave (on_leave)
(17, '2026-01-21', 'on_leave', 1),
(17, '2026-01-23', 'on_leave', 1),
(17, '2026-04-29', 'on_leave', 1),
(17, '2026-05-08', 'on_leave', 1),

-- ── DHRUV (id = 8) ────────────────────────────────────────

-- WFH
(8, '2026-05-22', 'wfh', 1),
(8, '2026-06-19', 'wfh', 1),

-- Casual leave (on_leave)
(8, '2026-02-06', 'on_leave', 1),
(8, '2026-02-09', 'on_leave', 1),
(8, '2026-03-20', 'on_leave', 1),
(8, '2026-04-02', 'on_leave', 1),
(8, '2026-04-23', 'on_leave', 1),

-- Sick leave (on_leave)
(8, '2026-05-21', 'on_leave', 1),

-- ── PARAMVEER (id = 34) ───────────────────────────────────

-- Casual leave (on_leave)
(34, '2026-07-02', 'on_leave', 1),
(34, '2026-07-03', 'on_leave', 1),

-- ── AVAN (id = 7) ─────────────────────────────────────────

-- Half-day
(7, '2026-03-17', 'half_day', 1),
(7, '2026-04-15', 'half_day', 1),
(7, '2026-05-08', 'half_day', 1),

-- Sick leave (on_leave)
(7, '2026-03-10', 'on_leave', 1),

-- Casual leave (on_leave)
(7, '2026-03-31', 'on_leave', 1),
(7, '2026-05-01', 'on_leave', 1),
(7, '2026-05-13', 'on_leave', 1),
(7, '2026-05-14', 'on_leave', 1),
(7, '2026-05-15', 'on_leave', 1),
(7, '2026-05-29', 'on_leave', 1),

-- ── HETANSHI (id = 10) ────────────────────────────────────

-- Half-day
(10, '2026-02-19', 'half_day', 1),
(10, '2026-04-01', 'half_day', 1),
(10, '2026-04-03', 'half_day', 1),
(10, '2026-06-05', 'half_day', 1),
(10, '2026-06-19', 'half_day', 1),

-- WFH
(10, '2026-02-06', 'wfh', 1),
(10, '2026-02-23', 'wfh', 1),
(10, '2026-03-05', 'wfh', 1),
(10, '2026-03-06', 'wfh', 1),
(10, '2026-04-23', 'wfh', 1),
(10, '2026-07-02', 'wfh', 1),

-- Casual leave (on_leave)
(10, '2026-02-04', 'on_leave', 1),
(10, '2026-02-05', 'on_leave', 1),
(10, '2026-02-20', 'on_leave', 1),
(10, '2026-06-08', 'on_leave', 1),
(10, '2026-06-09', 'on_leave', 1),

-- Sick leave (on_leave)
(10, '2026-04-17', 'on_leave', 1),
(10, '2026-05-15', 'on_leave', 1),

-- ── PRAIZY (id = 15) ──────────────────────────────────────

-- Half-day
(15, '2026-02-09', 'half_day', 1),
(15, '2026-02-10', 'half_day', 1),
(15, '2026-02-11', 'half_day', 1),
(15, '2026-04-30', 'half_day', 1),
(15, '2026-05-07', 'half_day', 1),
(15, '2026-06-26', 'half_day', 1),

-- WFH
(15, '2026-02-16', 'wfh', 1),
(15, '2026-03-20', 'wfh', 1),
(15, '2026-04-06', 'wfh', 1),
(15, '2026-04-23', 'wfh', 1),
(15, '2026-04-24', 'wfh', 1),

-- Casual leave (on_leave)
(15, '2026-02-12', 'on_leave', 1),
(15, '2026-02-13', 'on_leave', 1),
(15, '2026-03-19', 'on_leave', 1),
(15, '2026-03-23', 'on_leave', 1),
(15, '2026-03-24', 'on_leave', 1),
(15, '2026-03-25', 'on_leave', 1),
(15, '2026-03-26', 'on_leave', 1),
(15, '2026-04-03', 'on_leave', 1),
(15, '2026-04-28', 'on_leave', 1),
(15, '2026-04-29', 'on_leave', 1),
(15, '2026-05-08', 'on_leave', 1),

-- Sick leave (on_leave)
(15, '2026-04-21', 'on_leave', 1),
(15, '2026-04-22', 'on_leave', 1)

ON CONFLICT (user_id, date, organization_id)
DO UPDATE SET status = EXCLUDED.status;
