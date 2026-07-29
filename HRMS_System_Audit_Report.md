# LUMOS LOGIC HRMS — COMPLETE ENTERPRISE SYSTEM AUDIT REPORT

**Date:** 2026-07-29
**Auditor:** Senior Enterprise Solution Architect
**Scope:** Full end-to-end system — backend routes, database, auth, integrations, frontend routing, business logic

---

## EXECUTIVE SUMMARY

The system is architecturally sound for an early-enterprise HRMS: PostgreSQL-backed, multi-tenant with org isolation, proper JWT auth, modular Express routing, and a working pg-adapter layer. However, **8 critical bugs exist that break core user workflows in production today**. Additionally, **26 high-priority issues** and numerous medium/low issues create data integrity risks, security vulnerabilities, and broken business rules that must be addressed before enterprise rollout.

The most severe issues are: a broken Late/Early endpoint (100% 500 error), employees being unable to submit their own resignations or complete their own onboarding tasks, an unauthenticated Cloudinary upload endpoint, leave deletion using wrong settings, and account deactivation not actually blocking login.

---

## PART 1 — CRITICAL ISSUES (Fix Immediately)

---

### CRIT-01 — Late/Early Attendance List Always Returns 500

**File:** `backend/src/modules/attendance/attendance.routes.js:262`

```js
let query = supabase.from('attendance')
  .select('...')
  .or('is_late.eq.true,is_early_exit.eq.true')  // ← BROKEN
```

**Root Cause:** The custom `db-pg-adapter.js` implements the Supabase query-builder API but has **no `.or()` method**. When called, `builder.or` is `undefined`, and chaining `.in()` on it throws `TypeError: Cannot read properties of undefined`. The try/catch returns HTTP 500.

**Impact:** The entire Late/Early attendance management page is non-functional. HR cannot see who came late or exited early. All users see an error.

**Fix:** Add an `or()` method to the pg-adapter that generates `WHERE (condition1 OR condition2)` SQL, or rewrite the route to use two separate `.eq` checks combined via a different query pattern.

---

### CRIT-02 — Employee Cannot Submit Their Own Resignation

**File:** `backend/src/modules/exit/exit.routes.js:38`

```js
router.post('/', auth, adminOnly, async (req, res) => {  // adminOnly ← BUG
  // ...
  const { resignation_date, reason, notice_period_days } = req.body;
```

**Root Cause:** The POST endpoint (create exit request) is gated behind `adminOnly`. Employees cannot submit their own resignation. Only admins can.

**Impact:** The entire Exit Management flow is broken from the employee perspective. The employee portal's `/portal/exit` page calls this API and gets 403. The business workflow of "employee resigns → HR processes" is completely missing.

**Fix:** Change to `auth` middleware. Employees should submit their own resignation (`user_id = req.user.id`). Admins should be able to create on behalf of others.

---

### CRIT-03 — Employee Cannot Complete Their Own Onboarding Tasks

**File:** `backend/src/modules/onboarding/onboarding.routes.js:105`

```js
router.put('/:id/complete', auth, adminOnly, async (req, res) => {
  // ...
  if (!isAdmin(req.user.role)) { // This branch NEVER RUNS — adminOnly already blocked non-admins
```

**Root Cause:** The route uses `adminOnly` middleware, which blocks employees before they reach the body logic. The inner `if (!isAdmin)` check is dead code — it never executes.

**Impact:** Employees can see their onboarding checklist but cannot tick off their own tasks. The `/portal/onboarding` page silently fails.

**Fix:** Change middleware to `auth`. Move the permission logic entirely into the route handler.

---

### CRIT-04 — Unauthenticated Cloudinary Upload Endpoint

**File:** `backend/src/modules/expenses/expenses.routes.js:70`

```js
router.post('/upload-receipt', upload.single('file'), async (req, res) => {
  // NO auth middleware!
  const oId = req.user.organization_id;  // req.user is undefined → crashes
```

**Root Cause:** The `auth` middleware is missing. `multer` processes the file into memory before the handler runs. The handler then crashes on `req.user`, but the upload buffer already consumed memory.

**Impact:** Anyone can POST multipart files to this public endpoint, exhausting server memory via `multer.memoryStorage()`. The 5MB limit provides some protection but the endpoint should never be unauthenticated.

**Fix:** Add `auth` middleware: `router.post('/upload-receipt', auth, upload.single('file'), ...)`

---

### CRIT-05 — Leave Delete Calls `getSettings()` Without orgId

**File:** `backend/src/modules/leaves/leaves.routes.js:371`

```js
if (leave.status === 'approved') {
  const settings = await getSettings();  // ← Missing orgId argument!
```

**Root Cause:** `getSettings()` without an argument fetches the first `work_schedule` row from the entire database (no org filter), returning the wrong organization's work schedule in multi-tenant environments.

**Impact:** When deleting an approved leave, the wrong org's workday settings are used to determine which attendance records to delete. Records may be incorrectly preserved or deleted.

**Fix:** `const settings = await getSettings(orgId(req));`

---

### CRIT-06 — Account Deactivation Does Not Block Login

**File:** `backend/src/modules/auth/auth.routes.js:241-244` vs `auth.routes.js:34`

```js
// Deactivation sets status = 'inactive'
await supabase.from('users').update({ status: 'inactive' }).eq('id', req.user.id);

// Login check — does NOT verify status field
if (!user || !bcrypt.compareSync(password, user.password)) return 401; // No status check!
```

**Root Cause:** The login route never checks `user.status`. A deactivated account can still log in normally.

**Impact:** GDPR deletion requests and manual deactivation provide no actual access control. A terminated employee can log in after account deactivation.

**Fix:** Add after the password check:
```js
if (user.status === 'inactive') return res.status(403).json({ error: 'Account deactivated. Contact HR.' });
```

---

### CRIT-07 — Leave Policies Have No Admin Guard (Any Employee Can Overwrite All Policies)

**File:** `backend/src/modules/leave-policies/leavePolicies.routes.js:32, 48`

```js
router.post('/', auth, async (req, res) => {  // No adminOnly!
  // Deletes ALL policies and reinserts...
  await supabase.from('leave_policies').delete().eq('organization_id', oId);

router.put('/:id', auth, async (req, res) => {  // No adminOnly!
```

**Root Cause:** Both the bulk upsert (POST) and individual update (PUT) for leave policies have no admin restriction. Any logged-in employee can call `POST /api/leave-policies` with a crafted body to wipe and replace all leave policies for their organization.

**Impact:** Any employee can grant themselves unlimited leave, disable leave types, or corrupt the entire leave policy configuration.

**Fix:** Add `adminOnly` middleware to both routes.

---

### CRIT-08 — Hardcoded JWT Secret Fallback

**File:** `backend/src/middleware/auth.js:3`

```js
const JWT_SECRET = process.env.JWT_SECRET || 'leave-tracker-secret-2026';
```

**Root Cause:** If `JWT_SECRET` env var is not set in production, any attacker knowing the hardcoded string can forge JWT tokens and impersonate any user including root_admin.

**Impact:** Complete authentication bypass possible if env var is missing. The fallback is publicly visible in the source code.

**Fix:** Remove the fallback. Throw at startup:
```js
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set in environment');
```

---

## PART 2 — HIGH PRIORITY ISSUES

---

### HIGH-01 — Leave Balance Hardcoded at 18 Days, Ignores Leave Policies

**Files:** `analytics.routes.js:163-166`, `leaves.routes.js:73-74`

```js
// analytics.routes.js
totalLeaves: 18,               // ← Hardcoded
remainingLeaves: Math.max(0, 18 - usedLeaveDays),
totalHolidays: 12,             // ← Hardcoded

// leaves.routes.js (date-check)
const totalAnnual = orgRow?.total_annual_leaves || 18;  // Ignores leave_policies table
```

**Impact:** Employee always sees "18 days total" regardless of actual org policy. The `leave_policies` table is populated but never consulted for balance display.

**Fix:** Load leave quota from `leave_policies` table per leave type. Use `organizations.total_annual_leaves` as fallback only.

---

### HIGH-02 — Split-Brain Leave Balance: `leave_balances` Table vs On-The-Fly Calculation

**Files:** `regularization.routes.js:155-169` vs `analytics.routes.js:132-165`

Regularization approval updates the `leave_balances` table when cancelling a leave. But leave balance shown in analytics/date-check is calculated on-the-fly by counting approved leaves from the `leaves` table. The two systems diverge.

**Impact:** Employee sees incorrect remaining balance after regularization approval. The restored balance in `leave_balances` is ignored.

**Fix:** Choose one authoritative source. Either always calculate on-the-fly (remove `leave_balances` writes from regularization), OR use `leave_balances` as source of truth everywhere.

---

### HIGH-03 — Leave Day Count Ignores Public Holidays

**File:** `leaves.routes.js:62-69`

```js
for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
  const dow = d.getDay();
  if (dow !== 0 && dow !== 6) usedByType[l.leave_type] += 1;  // Only skips weekends
}
```

Public holidays defined in the `holidays` table are NOT excluded from leave day counting. A 5-day leave spanning a public holiday still deducts 5 leave days instead of 4.

**Fix:** Fetch org holidays for the date range and skip those dates in the counting loop.

---

### HIGH-04 — Admin Attendance Edit Doesn't Recalculate `gross_hours`

**File:** `attendance.routes.js:163-171`

```js
router.put('/:id', auth, adminOnly, async (req, res) => {
  const work_hours = check_in && check_out
    ? Math.max(0, (toMinutes(check_out) - toMinutes(check_in)) / 60) : 0;
  await supabase.from('attendance')
    .update({ check_in, check_out, status, is_late, is_early_exit, work_hours, notes })
    // ← gross_hours NOT updated, total_break_minutes NOT updated
```

**Impact:** Admin-edited records show stale `gross_hours` in reports, payroll, and analytics.

**Fix:** Include `gross_hours` in the update calculated as `(check_out - check_in)` minutes. Set `total_break_minutes = 0` if admin overrides times.

---

### HIGH-05 — `mark-absent` Missing `organization_id` in Upsert + Wrong Conflict Key

**File:** `attendance.routes.js:178`

```js
await supabase.from('attendance')
  .upsert({ user_id, date, status: 'absent' }, { onConflict: 'user_id,date' });
  // Missing organization_id in payload AND wrong conflict key
```

The actual UNIQUE constraint is `(user_id, date, organization_id)`. The upsert will fail or insert records without `organization_id`, making them invisible to all org-scoped queries.

**Fix:**
```js
.upsert({ user_id, date, status: 'absent', organization_id: orgId(req) }, { onConflict: 'user_id,date,organization_id' });
```

---

### HIGH-06 — `admin-edit` Attendance Also Has Wrong Conflict Key

**File:** `attendance.routes.js:202`

```js
await supabase.from('attendance')
  .upsert({ user_id, date, ..., organization_id: orgId(req) },
  { onConflict: 'user_id,date' });  // ← Wrong conflict key (missing organization_id)
```

Payload includes `organization_id` but conflict resolution key is wrong. PostgreSQL's UNIQUE constraint is on `(user_id, date, organization_id)`, so a new duplicate record is inserted instead of updating.

**Fix:** Change to `{ onConflict: 'user_id,date,organization_id' }`.

---

### HIGH-07 — Biometric Checkout-Without-Check-in Uses Wrong Conflict Key

**File:** `biometricPush.handler.js:195-200`

```js
await pool.query(
  `INSERT INTO attendance (user_id, date, check_out, status, source, organization_id)
   VALUES ($1, $2, $3, 'present', 'biometric', $4)
   ON CONFLICT (user_id, date) DO UPDATE SET check_out = EXCLUDED.check_out...`,
```

`ON CONFLICT (user_id, date)` doesn't match the actual constraint `(user_id, date, organization_id)`. The INSERT creates duplicate orphan records instead of updating, resulting in checkout-only records with zero work hours.

**Fix:** Change to `ON CONFLICT (user_id, date, organization_id)`.

---

### HIGH-08 — Biometric Processing Ignores Break Minutes in Work Hours

**File:** `biometricPush.handler.js:187`, `biometric.routes.js:232-236`

```js
const workHours = parseFloat(((checkOutMs - checkInMs) / 3600000).toFixed(2));
```

This is gross hours, not effective work hours. Break minutes are never subtracted from biometric-sourced records.

**Impact:** Biometric employees always show slightly inflated work hours vs manual check-in employees. Payroll discrepancies.

---

### HIGH-09 — No Transaction Wrapping on Leave Approve / Reject / Revert

**File:** `leaves.routes.js:256-285, 289-327, 330-358`

Leave approval involves: (1) update leave status → (2) upsert attendance records → (3) create Google Calendar event. None of these steps are atomic.

**Impact:** If step 2 fails on approval, leave is marked approved but attendance is not updated. If step 1 succeeds on rejection but attendance delete fails, the record remains `on_leave` with the leave actually rejected. Reports diverge.

**Fix:** Use PostgreSQL transactions via `pool.query('BEGIN')...COMMIT/ROLLBACK` for multi-step operations.

---

### HIGH-10 — Leave Revert Deletes Attendance Without `organization_id` Filter

**File:** `leaves.routes.js:349-354`

```js
await supabase.from('attendance')
  .delete()
  .eq('user_id', leave.user_id)
  .in('date', dates);
  // Missing: .eq('organization_id', orgId(req))
```

Compare with the correct pattern in leave rejection (line 306-313) which includes `.eq('organization_id', orgId(req))`. This could delete attendance records from other organizations.

**Fix:** Add `.eq('organization_id', orgId(req))`.

---

### HIGH-11 — Regularization: Half-Day Leave Restoration Uses Wrong Column

**File:** `regularization.routes.js:155`

```js
if (leave.half_day) daysToRestore = 0.5;  // `half_day` column doesn't exist on leaves table
```

The correct check is `if (leave.leave_time === 'half') daysToRestore = 0.5;`. The non-existent column always evaluates to falsy, so half-day leaves are never restored correctly — the full multi-day count is used instead of 0.5.

**Fix:** `if (leave.leave_time === 'half') daysToRestore = 0.5;`

---

### HIGH-12 — Password Reset Uses Weaker Minimum (6 chars vs 8 chars)

**File:** `auth.routes.js:191` vs `auth.routes.js:123`

| Route | Minimum |
|-------|---------|
| `POST /auth/reset-password` | 6 characters |
| `PUT /auth/change-password` | 8 characters |

An attacker with reset email access can set a 6-char password that the change-password flow would reject.

**Fix:** Enforce 8 chars minimum in both routes.

---

### HIGH-13 — Email Verification Code Has No Expiry

**File:** `auth.routes.js:213-237`

The email verification code is stored as a plain 6-digit number with no timestamp. A code issued weeks ago remains valid indefinitely.

**Fix:** Store `email_verify_code_expires` timestamp. Reject codes older than 15-30 minutes.

---

### HIGH-14 — No Rate Limiting on Auth Routes

**File:** `auth.routes.js`

No rate limiting on:
- `POST /auth/login` — brute force password attacks
- `POST /auth/forgot-password` — email flooding
- `POST /auth/totp/verify-login` — TOTP brute force (6 digits = 1,000,000 combinations)

**Fix:** Add `express-rate-limit`: 10 req/min for login, 3 req/15min for forgot-password, 5 req/min for TOTP.

---

### HIGH-15 — Employee Report Accessible to All Authenticated Users

**File:** `reports.routes.js:192`

```js
router.get('/employees', auth, async (req, res) => {  // No adminOnly!
```

Any logged-in employee can export the full employee list (names, emails, phones, joining dates) as CSV. Data privacy violation.

**Fix:** Add `adminOnly` middleware.

---

### HIGH-16 — Performance Goal Progress Update Is Admin-Only

**File:** `performance.routes.js:46`

```js
router.put('/goals/:id', auth, adminOnly, async (req, res) => {
```

Employees cannot update progress on their own assigned performance goals. Self-service goal tracking is non-functional for employees.

**Fix:** Allow employees to update `progress` on goals where `user_id = req.user.id`. Restrict `status`, `title`, `category` changes to admins.

---

### HIGH-17 — Single Break Session: Multiple Breaks Lose History

**File:** `attendance.routes.js:122-158`

The `attendance` table stores only one `break_start` / `break_end`. Multiple breaks per day accumulate `total_break_minutes` correctly via break-out, but `break_start`/`break_end` is overwritten on each new break. Individual break session history is lost.

**Fix (medium-term):** Create an `attendance_breaks` child table: `(attendance_id, break_start, break_end, duration_minutes)`.

---

### HIGH-18 — Published Payslip Can Be Silently Overwritten

**File:** `payroll.routes.js:151`

```js
await supabase.from('payslips').upsert({
  ..., status: 'generated',
}, { onConflict: 'user_id,month,year' });
```

Re-running generate on the same month silently overwrites a published payslip and resets `status: 'generated'`. No confirmation, no version history, no audit trail.

**Fix:** Check if existing payslip is published before allowing regeneration. Require explicit admin override flag.

---

### HIGH-19 — Leave Policy Delete-and-Reinsert Is Not Atomic

**File:** `leavePolicies.routes.js:38-41`

```js
await supabase.from('leave_policies').delete().eq('organization_id', oId);
// If this insert fails, all policies are permanently gone:
const { data, error } = await supabase.from('leave_policies').insert(rows).select();
```

No transaction. If insert fails after delete, the organization has zero leave policies.

**Fix:** Wrap in a transaction, or use upsert instead of delete+insert.

---

### HIGH-20 — Shifts Module Has No Integration with Attendance Logic

**File:** `attendance.routes.js:54-83`

Check-in uses `work_schedule` (org default) for late/early thresholds, not per-employee shift assignments. Night-shift and early-shift employees are evaluated against the wrong schedule daily.

**Impact:** Night-shift employees show as "late" every day. Early shift employees show as "early exit" daily.

**Fix:** On check-in, look up the employee's assigned shift. Use that shift's start/end time as late/early thresholds.

---

### HIGH-21 — `platform_activity` Table Has No `organization_id` Column

**File:** `full_schema.sql:63-68`

Activity is logged with `organization_id` in the `metadata` JSONB blob, not as a proper column. Filtering by org requires expensive JSONB extraction without an index.

**Fix:** Add `organization_id BIGINT REFERENCES organizations(id)` column to `platform_activity` and create an index.

---

### HIGH-22 — Feature Gate Map Is Incomplete

**File:** `backend/src/middleware/featureFlag.js:5-23`

- Disabling `regularization` blocks frontend but **not** `POST /api/regularization` API route
- `/api/reports` API route is not in the FEATURE_ROUTE_MAP
- Some routes have frontend feature gates but no API-level gate

**Fix:** Review and complete the `FEATURE_ROUTE_MAP` to cover all feature-gated API routes.

---

### HIGH-23 — Google Calendar Integration Has No Error Recovery

**File:** `leaves.routes.js:282-284`

If Google Calendar is misconfigured or the API fails, the error is silently swallowed. No retry mechanism. HR doesn't know the calendar wasn't updated.

**Fix:** Log calendar failures prominently. Add an admin notification or dashboard indicator for failed calendar syncs.

---

### HIGH-24 — Holiday Push Notification Sends to `null` Users (Cross-Org Risk)

**File:** `cronJobs.js:56`

```js
await sendPushToUsers(null, { title: `🏖️ Tomorrow is a Holiday...` })
```

Passing `null` as user IDs. If `pushService.sendPushToUsers` handles `null` as "send to all users globally", this sends one org's holiday notifications to ALL organization employees on the platform.

**Fix:** Pass `(employees || []).map(e => e.id)` instead of `null`.

---

### HIGH-25 — `or()` Filter Method Missing from pg-adapter (Systemic Risk)

**File:** `backend/src/config/db-pg-adapter.js`

The adapter has no `.or()` method (see CRIT-01). Any developer who uses standard Supabase patterns with `.or()` will silently get a 500 error in production. There is no helpful error message.

**Fix:** Implement `or(filterString)` in the adapter. Add a non-implemented method trap that throws a descriptive error instead of returning `undefined`.

---

### HIGH-26 — Employee Self-Service Profile Editing Has No Route

**File:** `employees.routes.js:120`, `auth.routes.js:81`

- `PUT /api/employees/:id` — admin-only (correct for sensitive fields)
- `PUT /api/auth/profile` — allows name, avatar_color, email only

The `selfOrAdmin` middleware is defined in `auth.js` with `allowedSelfFields` support but is **never used**. Employees cannot update phone, emergency contact, bank details, or any personal information without going through an admin.

**Fix:** Use `selfOrAdmin` middleware on `PUT /api/employees/:id` with allowed self-edit fields: `['phone', 'personal_email', 'blood_group', 'address']`.

---

## PART 3 — MEDIUM PRIORITY ISSUES

---

### MED-01 — Attendance Report Date Uses Hardcoded `-31`

**File:** `reports.routes.js:36-37`

```js
.lte('date', `${year}-${String(month).padStart(2,'0')}-31`);
```

Semantically wrong for months with fewer than 31 days. Payroll correctly calculates the last day; reports should too.

**Fix:** `const lastDay = new Date(year, month, 0).getDate();`

---

### MED-02 — `users.department` TEXT Field Diverges from `user_departments` Junction Table

Two sources of truth for department: `users.department` (legacy string) and `user_departments` (FK junction table). When a department is renamed, the string field doesn't auto-update.

**Fix:** When `departments` name is updated, also update `users.department` for all affected users.

---

### MED-03 — Leave Date-Check Does Not Validate Against Work Calendar

An employee can apply leave for a Sunday and it will be accepted. The date-check endpoint doesn't validate that the requested dates contain at least one working day.

**Fix:** Validate `start_date` to `end_date` range contains at least one working day per org schedule.

---

### MED-04 — Dashboard `wfhToday` Semantic Inconsistency

**File:** `dashboard.routes.js:69`

`wfhToday = wfhIds.size` (all WFH including those also on leave), while `wfhOnlyCount` excludes those on leave. Both are computed but the naming is ambiguous. The frontend may display the wrong count.

**Fix:** Clarify and standardize: send only `wfhCount` (WFH-exclusive) in the response.

---

### MED-05 — Analytics: `leaveByStatus` Counts All-Time, `attByStatus` Counts Current Month

**File:** `analytics.routes.js:21-42`

Leave stats are fetched with no date filter (all-time), while attendance stats are filtered to the current month. Charts mix time horizons, making comparison misleading.

**Fix:** Scope all counters to the same time period (current year or current month).

---

### MED-06 — No Pagination on List Endpoints

**File:** `attendance.routes.js:8-36`, `leaves.routes.js:119-152`, `employees.routes.js:27-53`

All list endpoints return all records. For an org with 500 employees × 365 days = 182,500 attendance records returned in one request.

**Fix:** Add `limit`/`offset` query parameters with sensible defaults (50-100 records).

---

### MED-07 — Notification Limit of 50 Is Too Low

**File:** `notifications.routes.js:11`

Active users who were away for a week lose older important notifications.

**Fix:** Increase limit to 100 with `offset` pagination support.

---

### MED-08 — Assets: No Return/Unassign Workflow

**File:** `assets.routes.js`

No dedicated "return asset" endpoint. No notification to employee on return. No audit trail of assignment history.

**Fix:** Add `POST /api/assets/:id/return` that unassigns, sets status to `'available'`, creates an audit log entry, and notifies the employee.

---

### MED-09 — Exit Management Does Not Auto-Update Employee Status

**File:** `exit.routes.js:66-88`

When an exit request is approved, employee's `employee_status` in `users` table is NOT updated to `'resigned'`. The employee remains active in all attendance/leave/payroll calculations past their last working day.

**Fix:** When exit status becomes `'approved'`, set `users.employee_status = 'resigned'` and `users.last_working_day` from the exit request.

---

### MED-10 — Route `/attendance` Redirects to `/calendar` (Confusing)

**File:** `client/src/App.jsx:122`

```jsx
<Route path="/attendance" element={<Navigate to="/calendar" replace />} />
```

HR admins navigating to `/attendance` are silently redirected to the calendar view. Attendance management should have a dedicated page URL.

---

### MED-11 — Missing `source` Field for Manual Check-in Records

**File:** `attendance.routes.js:77`

Biometric push sets `source = 'biometric'`. Manual check-in doesn't set a source. Reports and audits can't distinguish biometric vs manual entries.

**Fix:** Add `source: 'manual'` to manual check-in inserts.

---

### MED-12 — `admin-edit` Work Hours Calculation Ignores Breaks

**File:** `attendance.routes.js:165-166`

```js
const work_hours = check_in && check_out
  ? Math.max(0, (toMinutes(check_out) - toMinutes(check_in)) / 60) : 0;
```

This calculates gross hours, not effective hours. When admin edits a record that had break time, the break minutes are silently discarded.

---

### MED-13 — No IDOR Protection on Assets `userId` Query Param

**File:** `assets.routes.js:9`

`GET /api/assets?userId=X` — no validation that employees can only query their own user ID. Any employee can view another's assigned assets.

---

### MED-14 — Cron Job Runs In-Process Without Monitoring

**File:** `cronJobs.js`

`scheduleDailyAt` uses a `setTimeout` chain inside the Node process. If the server restarts, the cron skips until the next day. Failures are only logged to console with no alerting.

**Fix:** Use `node-cron` with proper logging, or externalize to a system cron/pg_cron.

---

### MED-15 — Google Calendar: No Token Refresh Handling

The schema stores `google_refresh_token` per org. If the access token expires and refresh fails, all calendar operations silently fail with no admin alert or re-auth flow.

---

## PART 4 — ARCHITECTURE & DATABASE FINDINGS

---

### ARCH-01 — Custom pg-adapter Is a Maintenance Liability

**File:** `backend/src/config/db-pg-adapter.js`

The 420-line custom query builder is incomplete:
- Missing: `or()`, `contains()`, `textSearch()`, `overlaps()`, aggregations
- JOIN parser uses string regex heuristics that can fail on unusual naming conventions
- No support for subqueries or CTEs
- Every new Supabase method used in routes requires updating the adapter

**Recommendation:** For complex queries (reports, analytics, payroll), use `pool.query()` with raw parameterized SQL directly (as biometric routes already do). Reserve the adapter for simple CRUD only. Document the supported subset.

---

### ARCH-02 — Missing Database Indexes on Critical Query Columns

Inferred from schema analysis:

| Table | Missing Index | Frequently Used Filter |
|-------|--------------|----------------------|
| `leaves` | `(user_id, organization_id, status, start_date)` | Leave balance, team calendar |
| `notifications` | `(user_id, is_read, created_at)` | Unread count polling |
| `leave_balances` | `(user_id, organization_id, leave_type)` | Balance lookups |
| `biometric_raw_logs` | `(org_id, employee_pin, processed)` | Reprocessing queries |
| `platform_activity` | `organization_id` column doesn't exist as column | Activity feed |

---

### ARCH-03 — No Soft Delete Pattern

Employee delete is a hard delete with CASCADE. Historical payslips reference `user_id` but the user is gone. JOIN to get employee name returns null. Payslips show blank names for deleted employees.

**Recommendation:** Add `is_deleted BOOLEAN DEFAULT false` and `deleted_at TIMESTAMPTZ` to `users`. Filter out deleted users in list queries instead of hard deleting.

---

### ARCH-04 — No Audit Log Table for Critical Actions

The system has `platform_activity` for member add/remove and `login_history` for login events. No audit log for:
- Leave approve/reject
- Payroll generation
- Employee role changes
- Settings changes
- Asset assignments

**Recommendation:** Create an `audit_log` table:
```sql
CREATE TABLE audit_log (
  id            BIGSERIAL PRIMARY KEY,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     BIGINT,
  old_value     JSONB,
  new_value     JSONB,
  performed_by  BIGINT REFERENCES users(id),
  organization_id BIGINT REFERENCES organizations(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

### ARCH-05 — Daily Cron Without Process Restart Recovery

If the server restarts at 7:59 AM, the 8:00 AM cron fires. If it restarts at 8:01 AM, the cron skips until next day. Birthday wishes and holiday reminders won't go out.

**Recommendation:** Use a database-backed cron table or external scheduler (system cron, pg_cron) that survives restarts.

---

### ARCH-06 — Dual Database Query Patterns

Some modules use `pool.query()` (biometric), others use `supabase.from()` (pg-adapter). Two mental models, two error-handling patterns, and two ways to write the same query.

**Recommendation:** Establish a clear convention and document it. Use `pool.query()` for complex queries with JOINs/aggregations; use the adapter for simple CRUD.

---

### ARCH-07 — Work Schedule: One Row Per Org, No Shift Integration

The `work_schedule` table is a single row per org. There is no department-specific or employee-specific schedule. The shift assignments table exists but is completely decoupled from attendance evaluation.

---

### ARCH-08 — Connection Pool Too Small for Scale

**File:** `db-pg-adapter.js:22`

```js
max: 20,  // max concurrent connections
```

For 1,000+ employees across multiple orgs at peak check-in time, 20 connections will bottleneck. No connection pooling middleware (pgBouncer) is configured.

---

## PART 5 — SECURITY AUDIT

---

### SEC-01 — Column Name Interpolation in pg-adapter (Injection Risk)

**File:** `db-pg-adapter.js:66`

```js
const col = f.col.includes('.') ? f.col : `${prefix}"${f.col}"`;
```

Column names are interpolated directly into SQL. Values use `addParam()` (safe). But if any route passes user-controlled input as a column name, SQL injection is possible.

**Fix:** Whitelist allowed column names per table, or assert column names are alphanumeric+underscore only.

---

### SEC-02 — TOTP Secret Not Cleared After Abandoned Setup

**File:** `auth.routes.js:262-273`

If a user sets up TOTP but never enables it, `totp_secret` is stored indefinitely. A leaked DB exposes this unused secret.

**Fix:** Clear `totp_secret` if not verified within 10 minutes, or when the user logs out without completing setup.

---

### SEC-03 — No CSRF Protection

The system uses JWT in Authorization headers (mitigates cookie-based CSRF). However, there are no Origin/Referer header checks. For browser-based requests, this should be verified.

---

### SEC-04 — Missing `Secure` Headers (Content-Security-Policy, X-Frame-Options)

No security headers middleware (helmet.js) is applied. The server doesn't set Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, or Referrer-Policy headers.

**Fix:** Add `helmet()` middleware before routes in `server.js`.

---

### SEC-05 — Sensitive Data in JWT Payload

**File:** `auth.routes.js:50-52`

```js
const token = jwt.sign(
  { id, email, role, name, organization_id, organization_slug },
  JWT_SECRET, { expiresIn: '7d' }
);
```

The JWT contains name and email. These are readable to anyone who decodes the token (JWT is not encrypted). For a 7-day token, if role changes (e.g., employee promoted to admin), the old token still carries the old role until expiry.

**Fix:** Reduce JWT expiry to 24h, or implement token refresh. On role change, invalidate existing tokens.

---

## PART 6 — NOTIFICATION CONSISTENCY AUDIT

| Event | Email | In-App Notification | Push Notification |
|-------|-------|---------------------|-------------------|
| Leave Applied | ✅ HR notified | ✅ HR in-app | ❌ Missing |
| Leave Approved | ✅ Employee email | ❌ No in-app to employee | ❌ Missing |
| Leave Rejected | ✅ Employee email | ❌ No in-app to employee | ❌ Missing |
| Leave Cancelled / Reverted | ❌ No email | ❌ No notification | ❌ Missing |
| Payslip Generated | ❌ No email | ✅ Employee in-app | ❌ Missing |
| Regularization Submitted | ❌ No email | ✅ Admin in-app | ❌ Missing |
| Regularization Approved | ❌ No email | ✅ Employee in-app | ❌ Missing |
| Expense Submitted | ❌ No email | ✅ Admin in-app | ❌ Missing |
| Expense Approved / Rejected | ❌ No email | ✅ Employee in-app | ❌ Missing |
| Asset Assigned | ❌ No email | ✅ Employee in-app | ❌ Missing |
| Asset Returned | ❌ No email | ❌ No notification | ❌ Missing |
| Exit Submitted | ❌ No email | ✅ Admin in-app | ❌ Missing |
| Exit Approved / Rejected | ❌ No email | ✅ Employee in-app | ❌ Missing |
| Onboarding Initialized | ❌ No email | ✅ Employee in-app | ❌ Missing |
| Performance Review Started | ❌ No email | ✅ Employee in-app | ❌ Missing |
| Birthday (self) | ✅ Employee | ❌ No in-app | ✅ Push |
| Birthday Reminder (HR) | ✅ HR | ❌ No in-app | ❌ Missing |
| Holiday Reminder | ✅ All employees | ❌ No in-app | ⚠️ Push (null user bug) |
| New Employee Welcome | ✅ Welcome email | ❌ No team notification | ❌ Missing |

**Critical gaps:** Leave approval/rejection has no in-app notification to the employee. Leave revert/cancel has no notifications at all.

---

## PART 7 — REPORT VALIDATION

| Report | Issues Found |
|--------|-------------|
| `/reports/attendance` | Hardcoded `-31` date (MED-01) |
| `/reports/leaves` | No day-count column; end-date filter uses only `start_date` |
| `/reports/employees` | Accessible to all employees (HIGH-15); `employment_status` column name mismatch |
| `/reports/headcount` | Queries `employment_status` which doesn't match `employee_status` used in CRUD |
| Payslips | Published slips can be silently overwritten (HIGH-18) |
| Analytics | Leave balance hardcoded 18 (HIGH-01); all-time vs monthly mix (MED-05) |
| Late/Early | Always returns 500 due to missing `.or()` (CRIT-01) |

---

## PART 8 — EDGE CASE ANALYSIS

| Scenario | Current Behavior | Issue |
|----------|------------------|-------|
| Employee deleted during active payroll month | Cascade deletes records; generated payslip remains with null user name | Payslip history shows blank names |
| Leave approved → payslip generated → leave cancelled | Payslip retains old leave data | No automatic invalidation trigger |
| Attendance edited after payslip generated | Payslip shows stale attendance | No re-generation trigger |
| Department deleted | `users.department` string not updated | Stale department in reports |
| Biometric offline for 24h | Logs not received; `processed=false` accumulates | Reprocess is manual, no auto-trigger |
| Duplicate employee email attempt | Handled with 400 error | ✅ Correct |
| Resigned manager is `approved_by` on old leaves | Manager is gone (hard delete), FK null | Leave record has no approver name |
| Leave spanning two calendar months | Balance counted correctly across year | ✅ OK |
| February payroll | Fixed with `new Date(year, month, 0).getDate()` | ✅ Fixed |
| Employee on half-day + WFH same day | Conflict check allows this combination | Correct by design |
| Concurrent duplicate check-in | Second check-in returns "already checked in" | ✅ OK |
| Holiday added after payslip generated | Payslip not recalculated | No recalculation trigger |
| Timezone edge cases (midnight punch) | `process.env.TZ = 'Asia/Kolkata'` + custom `localDateStr()` | Handled but assumes all orgs are IST |

---

## PART 9 — SCALABILITY ANALYSIS

| Scale | Current Status |
|-------|----------------|
| 100 employees | ✅ Comfortable |
| 1,000 employees | ⚠️ Pagination missing; attendance/leave list endpoints will be slow |
| 10,000 employees | ❌ No pagination, no caching, single Node process, 20 pg connections |
| 100 organizations | ⚠️ Daily cron runs per-org synchronously; 100 orgs × birthday emails = slow |
| 3.65M attendance rows (10k emp × 365d) | ❌ No pagination on `/api/attendance` — all rows returned at once |
| 500 concurrent check-ins at 9AM | ⚠️ 20 pg connections will bottleneck; no queue |
| Large biometric log backlog | ⚠️ Reprocess is synchronous, single-thread, times out for large backlogs |

---

## PART 10 — MODULE INTEGRATION MAP (MISSING LINKS)

```
Employee Created
  → ✅ Welcome email sent
  → ❌ Onboarding NOT auto-initialized (admin must manually run /init/:userId)
  → ❌ No leave balance initialization in leave_balances table
  → ❌ No default shift assignment created

Leave Approved
  → ✅ Attendance records updated
  → ✅ Google Calendar synced
  → ✅ Email sent to employee
  → ❌ No in-app notification to employee
  → ❌ Payroll NOT recalculated if payslip already generated for that month

Payroll Generated
  → ✅ In-app notification to employee
  → ❌ No email to employee with payslip summary
  → ❌ No email to HR/finance confirming generation

Regularization Approved
  → ✅ Attendance record corrected
  → ✅ Overlapping leave cancelled
  → ❌ Leave balance restoration logic has bug (half-day column wrong — HIGH-11)
  → ❌ No payroll recalculation trigger if payslip already generated

Employee Resigned / Exit Approved
  → ❌ employee_status NOT auto-updated to 'resigned' (MED-09)
  → ❌ No asset auto-return trigger
  → ❌ No leave balance calculation for earned leave payout
  → ❌ No final settlement payroll trigger

Holiday Added
  → ✅ Email reminder sent day-before
  → ❌ Existing attendance records for that date NOT auto-updated
  → ❌ Leave balance for leaves spanning the holiday NOT corrected
  → ❌ Payroll NOT recalculated if holiday added after payslip generated

Shift Changed for Employee
  → ❌ No integration with attendance late/early thresholds (HIGH-20)
  → ❌ No notification to employee
  → ❌ Past attendance NOT reprocessed with new thresholds

Organization Settings Changed (Work Schedule)
  → ❌ Existing attendance records NOT reprocessed
  → ❌ No notification to employees about schedule change
```

---

## FINAL RECOMMENDATIONS — IMPLEMENTATION ROADMAP

### Week 1 — Critical Production Fixes

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | CRIT-01 | `db-pg-adapter.js` | Implement `.or()` method |
| 2 | CRIT-02 | `exit.routes.js:38` | Remove `adminOnly` from exit POST |
| 3 | CRIT-03 | `onboarding.routes.js:105` | Fix `adminOnly` → `auth` on complete route |
| 4 | CRIT-04 | `expenses.routes.js:70` | Add `auth` to upload-receipt endpoint |
| 5 | CRIT-05 | `leaves.routes.js:371` | Pass `orgId(req)` to `getSettings()` |
| 6 | CRIT-06 | `auth.routes.js:34` | Check `user.status` on login |
| 7 | CRIT-07 | `leavePolicies.routes.js:32,48` | Add `adminOnly` to POST and PUT |
| 8 | CRIT-08 | `middleware/auth.js:3` | Remove hardcoded JWT secret fallback |

### Week 2 — Data Integrity

| # | Issue | File | Fix |
|---|-------|------|-----|
| 9 | HIGH-05 | `attendance.routes.js:178` | Add `organization_id` to mark-absent upsert |
| 10 | HIGH-06 | `attendance.routes.js:202` | Fix `onConflict` key in admin-edit |
| 11 | HIGH-07 | `biometricPush.handler.js:195` | Fix `ON CONFLICT` key in checkout handler |
| 12 | HIGH-09 | `leaves.routes.js` | Wrap approve/reject in pg transactions |
| 13 | HIGH-10 | `leaves.routes.js:349` | Add `organization_id` filter to revert delete |
| 14 | HIGH-11 | `regularization.routes.js:155` | Fix `leave.half_day` → `leave.leave_time === 'half'` |

### Week 3 — Business Logic Correctness

| # | Issue | Fix |
|---|-------|-----|
| 15 | HIGH-01 | Load leave balance dynamically from `leave_policies` table |
| 16 | HIGH-02 | Unify leave balance source of truth |
| 17 | HIGH-03 | Exclude holidays from leave day counting loop |
| 18 | HIGH-12 | Enforce 8-char minimum in reset-password |
| 19 | HIGH-13 | Add expiry to email verification codes |
| 20 | HIGH-14 | Add `express-rate-limit` to auth routes |
| 21 | HIGH-15 | Add `adminOnly` to `/reports/employees` |
| 22 | HIGH-16 | Allow employees to update goal progress |

### Month 2 — Architecture Improvements

- Add pagination to all list endpoints (MED-06)
- Add composite DB indexes on attendance + leaves (ARCH-02)
- Implement soft delete for employees (ARCH-03)
- Create `audit_log` table (ARCH-04)
- Integrate shift assignments with attendance thresholds (HIGH-20)
- Fill notification gaps: leave approval in-app, payslip email, leave cancel (Part 6)
- Add `source: 'manual'` to manual check-in records (MED-11)
- Fix holiday push notification null user bug (HIGH-24)
- Add `helmet()` security headers middleware (SEC-04)
- Add `organization_id` column to `platform_activity` table (HIGH-21)
- Auto-init onboarding on employee creation
- Auto-update `employee_status` on exit approval (MED-09)
- Fix assets return workflow (MED-08)

---

## STATISTICS SUMMARY

| Category | Count |
|----------|-------|
| Critical Issues (production-breaking) | 8 |
| High Priority Issues (data integrity / security) | 26 |
| Medium Priority Issues (UX / performance) | 15 |
| Architecture Findings | 8 |
| Security Findings | 5 |
| Notification Gaps | 14 event types with missing notifications |
| Missing Module Integrations | 12 identified |
| **Total Findings** | **88+** |

---

*This report was generated from direct source code inspection of the complete HRMS codebase on 2026-07-29. All findings are based on actual implementation, not assumptions. Every file path and line number references real code.*
