# LUMOS HRMS — ENTERPRISE CLIENT PRODUCT GAP ANALYSIS
**Date:** 2026-07-30 | **Branch:** HRMS-Migration-16jul | **Analyst:** Claude Sonnet 4.6

---

## SYSTEM INVENTORY (What Currently Exists)

### Database: 41 Production Tables

| Category | Tables |
|---|---|
| Platform | `organizations`, `platform_admins`, `org_registration_requests`, `platform_activity`, `organization_features` |
| Users | `users` (~75 columns after all migrations) |
| Departments | `departments`, `designations`, `user_departments` |
| Work Config | `work_schedule`, `clockify_config` (dead) |
| Attendance | `attendance`, `attendance_regularization` |
| Leaves | `leaves`, `leave_policies` |
| Shifts | `shifts`, `shift_assignments` |
| Holidays/Events | `holidays`, `events` |
| Notifications | `push_subscriptions`, `notifications`, `notifications_log` (dead), `notification_recipients` |
| Documents | `employee_documents`, `document_shares` |
| Payroll | `payroll_structures`, `payslips` |
| Performance | `performance_goals`, `performance_reviews` |
| Onboarding/Exit | `onboarding_checklists`, `exit_requests` |
| Biometric | `biometric_devices`, `biometric_raw_logs`, `biometric_employee_map` |
| Other | `branches`, `announcements`, `assets`, `expenses`, `archives` (dead), `employee_qualifications`, `employee_experiences`, `schema_migrations` |

**Production hardening complete:** 40+ indexes, 7 helper views, 5 validation functions, CHECK constraints on all enum columns, soft-delete (`deleted_at`) on 7 tables.

### Backend: 60+ Route Files

All mounted in `server.js`: auth, org, platform, dashboard, employees, attendance, leaves, payroll, departments, designations, holidays, leave-policies, regularization, notifications, push, reports, documents, assets, expenses, announcements, shifts, performance, onboarding, exit, branches, biometric (ADMS + devices + logs + mapping), 16 employee-profile sub-modules, analytics, calendar, archives, root, settings.

### Auth System (Current State)

**4 hardcoded roles:** `platform_admin`, `root_admin`, `admin`, `employee`

**Middleware:** `auth()` (JWT verify), `adminOnly()` (admin + root_admin), `rootAdminOnly()`, `platformAdminAuth()`, `selfOrAdmin()`

**No RBAC, no custom roles, no module-level permissions, no page-visibility control.**

### Email System (Current State)

- Nodemailer via Gmail SMTP (global SMTP config on `.env`, NOT per-org)
- Templates: welcome employee, leave applied, leave status, birthday wish, birthday reminder, holiday reminder, org request, org approved/rejected, password reset
- Cron: daily at 08:00 — birthday wishes/reminders + holiday reminders

---

## GAP ANALYSIS BY CLIENT REQUIREMENT

---

### 1. ORGANIZATION SETUP

**Requirement:** Multiple organizations, multiple branches

| Item | Status |
|---|---|
| Multiple organizations | ✅ COMPLETE — `organizations` table, platform admin approval flow, full org_id scoping on every table |
| Multiple branches | ✅ COMPLETE — `branches` table, `branch_id` on users + biometric_devices, Branches.jsx page, full CRUD API |

**Gaps:** None for base org/branch setup.

**Reusable:** Everything. Fully production-ready.

---

### 2. ROLE MANAGEMENT

**Requirement:** Custom roles, edit/delete roles, module-wise permissions, CRUD permissions, page visibility, user-role assignment, org-specific

**Current Implementation:**
- 4 hardcoded roles in `users.role` column: `employee`, `admin`, `root_admin`, `platform_admin`
- CHECK constraint `chk_users_role` now enforces exactly these 4 values in the DB
- Role checked inline in every route: `if (req.user.role !== 'admin' && req.user.role !== 'root_admin')`
- Frontend routes guarded by `HRRoute`, `RootRoute`, `EmployeeRoute` components

**Missing — Everything:**
- No `roles` table
- No `permissions` table
- No `role_permissions` junction table
- No `user_roles` assignment table
- No module-level access control
- No CRUD-level permissions (create/read/update/delete per module)
- No page visibility control
- No org-specific role scoping
- No UI for role management

**Database Changes Required:**
```sql
-- New tables needed:
roles (id, org_id, name, description, is_system_role, created_at)
permissions (id, module_key, action, description)
role_permissions (id, role_id, permission_id, granted)
user_roles (id, user_id, role_id, org_id, assigned_at, assigned_by)
```

**Backend Changes Required:**
- New `roles.routes.js`, `permissions.routes.js`
- Replace inline `adminOnly()` middleware with `hasPermission('module', 'action')` middleware
- Seed default system roles with permissions on org creation
- Auth middleware must resolve custom role permissions from DB, not from `req.user.role` string

**Frontend Changes Required:**
- New Role Management page
- Permission matrix UI (module × action grid)
- Replace hardcoded `isAdmin` checks with permission hook `usePermission('module.action')`
- Dynamic sidebar visibility based on permissions

**Migration Requirements:**
- Breaking change — must drop `CHECK constraint chk_users_role` or extend it
- Must keep backward compatibility: map `root_admin` → "Root Admin" system role, `admin` → "HR Admin" system role, `employee` → "Employee" system role
- All existing route middleware must be refactored

**Security Considerations:**
- All permission checks must be server-side — never trust client-side role cache
- Permission resolution must be per-request (or cached with short TTL)
- Must scope roles to org_id — a role in Org A cannot grant access to Org B

**Risks:**
- **Highest risk item in the entire roadmap** — touches every route in the system
- CHECK constraint on `users.role` must be updated before adding new roles
- Frontend has 30+ hardcoded `isAdmin` checks to replace

**Recommended Architecture:**
- ABAC (Attribute-Based Access Control) with module + action granularity
- System roles seeded at org creation (cannot be deleted)
- Custom roles can be cloned from system roles
- Permission resolution: `SELECT granted FROM role_permissions JOIN user_roles WHERE user_id = ? AND org_id = ?`
- Cache per user session in JWT claims (refresh on role change)

**Estimated Complexity:** 🔴 VERY HIGH — 3–4 week sprint

---

### 3. DEPARTMENT HIERARCHY & LEAVE APPROVAL FLOW

**Requirement:** Every department has exactly one Department Head. Leave flow: Employee → Dept Head (review/forward only) → Root Admin (final approve/reject)

**Current Implementation:**
- `departments.head_user_id` column exists (FK to `users.id`) ✅
- `user_departments` junction table exists ✅
- Leave approval is flat: `PUT /api/leaves/:id/approve` called by any `admin` or `root_admin`
- Leave statuses: `pending`, `approved`, `rejected`, `cancelled` — no intermediate state
- No routing to Dept Head happens anywhere in the code

**Missing:**
- Leave status `forwarded` (intermediate state after Dept Head review)
- Route: Dept Head can mark leave as "forwarded" — not "approved"
- Route: Root Admin sees forwarded leaves for final decision
- Logic: When employee applies, system must notify Dept Head (not all admins)
- Logic: Dept Head identified via `departments.head_user_id` for the employee's primary department
- Logic: Dept Head CANNOT reject — only forward or return to employee
- Configurable workflow: some orgs may want 1-step (bypass Dept Head)

**Database Changes Required:**
```sql
-- Add intermediate state and forwarding metadata to leaves:
ALTER TABLE leaves ADD COLUMN forwarded_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE leaves ADD COLUMN forwarded_at TIMESTAMPTZ;
ALTER TABLE leaves ADD COLUMN dept_head_notes TEXT;

-- Update CHECK constraint to include forwarded:
ALTER TABLE leaves DROP CONSTRAINT chk_leaves_status;
ALTER TABLE leaves ADD CONSTRAINT chk_leaves_status
  CHECK (status IN ('pending','forwarded','approved','rejected','cancelled'));

-- Approval workflow config table:
CREATE TABLE approval_workflows (
  id              BIGSERIAL PRIMARY KEY,
  org_id          BIGINT NOT NULL REFERENCES organizations(id),
  workflow_type   TEXT NOT NULL DEFAULT 'leave',
  steps           JSONB NOT NULL,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Backend Changes Required:**
- `PUT /api/leaves/:id/forward` — Dept Head only, moves `pending` → `forwarded`
- `PUT /api/leaves/:id/approve` — Root Admin only for `forwarded` leaves (or `pending` in 1-step)
- Modify leave create: notify Dept Head, not all admins
- Dept Head identification: `SELECT head_user_id FROM departments WHERE id = (SELECT department_id FROM users WHERE id = ?)`
- Email notification to Dept Head on new leave
- Email notification to Root Admin on forwarded leave

**Frontend Changes Required:**
- New status badge: `forwarded` (yellow, "Pending Root Admin")
- Dept Head view: show `pending` leaves from their department employees
- Root Admin view: show `forwarded` leaves
- `PendingApprovals.jsx` needs two tabs: "My Department" (Dept Head) + "All Pending" (Root Admin)

**Email Requirements:**
- New template: leave forwarded to Root Admin by Dept Head
- New template: leave returned to employee by Dept Head

**Risks:**
- CHECK constraint on `leaves.status` must be updated (migration guard needed)
- Existing approve route must distinguish: caller is Dept Head or Root Admin?
- Primary department drives routing (use `users.department_id`, not junction table)

**Recommended Architecture:**
- Status machine: `pending → forwarded → approved/rejected`
- Approval workflow config is per-org (allows 1-step vs 2-step)

**Estimated Complexity:** 🟡 MEDIUM — 1.5 week sprint

---

### 4. ONBOARDING

**Requirement:** Auto email before joining, document upload (PAN/Aadhaar/bank/photo/address/education/experience), track completion, reminder emails

**Current Implementation:**
- `onboarding_checklists` table with 16 default tasks ✅
- Admin-initiated via `POST /api/onboarding/init/:userId` ✅
- Employee can complete their tasks, HR can complete HR tasks ✅
- Notification on init ✅
- `employee_documents` table exists for file uploads ✅
- Cloudinary configured for uploads ✅

**Missing:**
- Pre-joining trigger: no scheduled email sent before `date_of_joining`
- Document-specific onboarding: "Upload PAN" task has no link to an actual upload slot
- Document completion tracking: checklist boolean doesn't track which specific docs are uploaded
- Reminder emails: no cron for "onboarding incomplete, X tasks remaining"
- HR verification step: documents uploaded but no HR review workflow

**Database Changes Required:**
```sql
ALTER TABLE onboarding_checklists ADD COLUMN required_document_category TEXT;
ALTER TABLE onboarding_checklists ADD COLUMN document_id BIGINT REFERENCES employee_documents(id);

CREATE TABLE onboarding_emails (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id),
  org_id          BIGINT NOT NULL REFERENCES organizations(id),
  email_type      TEXT NOT NULL, -- 'pre_joining', 'reminder', 'completion'
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  days_before_joining INT
);
```

**Backend Changes Required:**
- Cron job: daily scan for employees whose `date_of_joining` is N days away → send pre-joining email
- Cron job: weekly scan for employees with incomplete onboarding tasks → send reminder
- `POST /api/onboarding/:taskId/upload` — link document upload to checklist task
- New email templates: pre-joining welcome, onboarding incomplete reminder

**Frontend Changes Required:**
- Onboarding employee view: show document upload slots (not just checkboxes)
- Upload button per document-type task
- Progress bar with document status (uploaded/pending review/verified)

**Scheduler Requirements:**
- Add `runOnboardingNotifications()` to `cronJobs.js`

**Estimated Complexity:** 🟡 MEDIUM — 1 week sprint

---

### 5. PAYROLL (HIGHEST PRIORITY)

#### 5a. Salary Structure

**Current Implementation:**
- `payroll_structures` table: basic, HRA, DA, transport_allowance, medical_allowance, other_allowances, pf_employee, pf_employer, esi_employee, esi_employer, professional_tax, tds ✅
- Multiple structures per employee with `effective_from` — salary revision supported ✅
- Payroll history via `payslips` table ✅
- Admin CRUD via `GET/POST/PUT /api/payroll/structure` ✅

**Missing from structure:**
- `special_allowance` as a named field (currently lumped into `other_allowances`)
- `bonus` component in structure
- `other_deductions` in structure (only in payslip currently)

**Database Changes Required:**
```sql
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS special_allowance NUMERIC DEFAULT 0;
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS other_deductions NUMERIC DEFAULT 0;
```

**Estimated Complexity:** 🟢 LOW

---

#### 5b. Automatic Payroll Generation

**Current Implementation:**
- Manual only: `POST /api/payroll/payslips/generate` with `user_id + month + year`
- One employee at a time
- `force=true` flag for regeneration ✅
- Published status blocks re-generation ✅

**Missing — Everything automated:**
- No `payroll_runs` table
- No payroll date configuration per org
- No scheduler cron for automatic generation
- No bulk generate (all employees in one org for a month)
- No preview before committing payslips
- No payroll run status dashboard
- No run-level lock mechanism

**Database Changes Required:**
```sql
CREATE TABLE payroll_runs (
  id                BIGSERIAL PRIMARY KEY,
  org_id            BIGINT NOT NULL REFERENCES organizations(id),
  month             TEXT NOT NULL,
  year              INTEGER NOT NULL,
  status            TEXT DEFAULT 'draft' CHECK (status IN ('draft','processing','completed','locked')),
  total_employees   INTEGER DEFAULT 0,
  processed_count   INTEGER DEFAULT 0,
  failed_count      INTEGER DEFAULT 0,
  total_gross       NUMERIC DEFAULT 0,
  total_net         NUMERIC DEFAULT 0,
  initiated_by      BIGINT REFERENCES users(id),
  initiated_at      TIMESTAMPTZ DEFAULT NOW(),
  locked_by         BIGINT REFERENCES users(id),
  locked_at         TIMESTAMPTZ,
  UNIQUE(org_id, month, year)
);

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS payroll_cycle_day INTEGER DEFAULT 1;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS payroll_auto_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS payroll_run_id BIGINT REFERENCES payroll_runs(id);
```

**Backend Changes Required:**
- `POST /api/payroll/runs/initiate` — create run for month+year, generate previews
- `POST /api/payroll/runs/:id/generate-all` — bulk generate payslips for all employees
- `POST /api/payroll/runs/:id/lock` — lock the run
- `GET /api/payroll/runs` — list all runs with status
- `GET /api/payroll/runs/:id/preview` — preview without committing
- Cron: check each org's `payroll_cycle_day`, trigger auto-run on matching date

**Email Requirements:**
- New template: payslip published (to employee)
- New template: payroll run completed summary (to root admin)

**Estimated Complexity:** 🔴 HIGH — 2 week sprint

---

#### 5c. Salary Calculation Engine

**Current Implementation:**
- Days-based: `gross_salary / working_days × present_days`
- LOP = absent_days + half_day_count × 0.5
- Leave (on_leave status) does NOT count as LOP ✅
- Holidays excluded from working days ✅

**Missing:**
- Grace period in payroll calculation
- Late arrival deductions (`late_minutes` tracked but never read in payroll)
- Early departure deductions (`early_exit_minutes` tracked but never read)
- Overtime pay (`ot_hours` tracked but not included in payslip)
- Shift-based calculation
- Bonus component
- Penalty deductions
- Monthly late exemptions
- Configurable rules engine

**Database Changes Required:**
```sql
CREATE TABLE attendance_policies (
  id                       BIGSERIAL PRIMARY KEY,
  org_id                   BIGINT NOT NULL REFERENCES organizations(id),
  grace_period_minutes     INTEGER DEFAULT 0,
  late_deduction_rate      NUMERIC DEFAULT 0,
  early_exit_deduction     BOOLEAN DEFAULT FALSE,
  monthly_late_exemptions  INTEGER DEFAULT 0,
  ot_multiplier            NUMERIC DEFAULT 1.5,
  half_day_threshold_hours NUMERIC DEFAULT 4.5,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payslip_adjustments (
  id          BIGSERIAL PRIMARY KEY,
  payslip_id  BIGINT NOT NULL REFERENCES payslips(id),
  type        TEXT CHECK (type IN ('bonus','penalty','advance','other')),
  amount      NUMERIC NOT NULL,
  description TEXT,
  created_by  BIGINT REFERENCES users(id)
);
```

**Backend Changes Required:**
- Extract payroll calculation into `services/payrollService.js`
- `calculatePayslip(employee, structure, attendance, policy)` — pure function
- Read attendance policy per org at payroll generation time
- Apply late deductions, OT additions, bonuses from `payslip_adjustments`

**Estimated Complexity:** 🟡 MEDIUM-HIGH — 1.5 week sprint

---

### 6. ATTENDANCE POLICY

**Requirement:** Shift, grace minutes, late limit, early exit limit, monthly exemptions, working hours, half day rules, OT rules, weekend rules, holiday rules

**Current Implementation:**
- `work_schedule` table: `start_time`, `end_time`, `late_threshold`, `early_exit_threshold`, `half_day_hours`, `work_days` ✅
- `shifts` + `shift_assignments` ✅
- `is_late` boolean on attendance ✅
- `late_minutes`, `early_exit_minutes`, `ot_hours` columns exist ✅

**Missing:**
- `grace_period_minutes` — `late_threshold` is hard cutoff, no grace concept
- `monthly_late_exemptions`
- `overtime_threshold_hours`
- `ot_multiplier`
- No `attendance_policies` table — rules are hardcoded in check-in logic

**Database Changes Required:**
- `attendance_policies` table (as described in 5c above — covers all of these)

**Backend Changes Required:**
- Extend `POST /api/attendance/checkin` to use grace period
- Extend checkout to calculate OT hours using threshold
- `GET/PUT /api/settings/attendance-policy` — admin configures per org

**Estimated Complexity:** 🟢 LOW-MEDIUM — 0.5 week sprint

---

### 7. BIOMETRIC

**Requirement:** Org-wise IP whitelist, only approved devices, multiple devices, audit logs, retry mechanism, monitoring

**Current Implementation:**
- `biometric_devices` table with `serial_number` — device registry ✅
- `biometric_raw_logs` — all punches stored with processed flag ✅
- `biometric_employee_map` — PIN to user_id mapping ✅
- `/iclock/cdata` receiver: validates SN against `biometric_devices` ✅
- Device `status` (online/offline) updated on heartbeat ✅
- Multiple devices per org with `branch_id` ✅

**Missing:**
- IP whitelist: `biometric_devices.device_ip` column exists but NEVER checked in handler — any IP can push punches
- Retry mechanism: `processed=false` logs are never retried
- Monitoring dashboard: no API for device health metrics
- Alert on device offline: no notification when `last_seen` is stale

**Database Changes Required:**
```sql
ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS allowed_ips TEXT[];
ALTER TABLE biometric_devices ADD COLUMN IF NOT EXISTS ip_whitelist_enabled BOOLEAN DEFAULT FALSE;
```

**Backend Changes Required:**
- `biometricPush.handler.js`: if `ip_whitelist_enabled`, check `req.ip` against `allowed_ips`
- Cron: `runBiometricRetry()` — reprocess all `processed=false` raw_logs where mapping now exists
- `GET /api/biometric/health` — aggregate device status, last seen, punch counts
- `GET /api/biometric/audit` — searchable log with device/date/employee filters

**Security Considerations:**
- ZKTeco devices use plain HTTP — IP whitelist is the only viable security layer
- `req.ip` behind nginx requires `app.set('trust proxy', 1)` to get real client IP
- SN spoofing: attacker who knows a device SN could push fake punches — IP whitelist prevents this

**Estimated Complexity:** 🟢 LOW-MEDIUM — 0.5 week sprint

---

### 8. EMAIL SYSTEM

**Requirement:** Automatic emails for onboarding, leave, payroll, reminders, approval, rejection

**Current Implementation:**
- Global SMTP from `.env` — all orgs share one SMTP account
- `organizations` table has `smtp_host/port/user/pass/from` columns but `emailService.js` NEVER reads them

**Existing Templates:** welcome employee, leave applied, leave status, birthday wish/reminder, holiday reminder, org request, org approved, org rejected, password reset

**Missing Templates:**
- Pre-joining email (onboarding)
- Onboarding reminder ("X tasks still incomplete")
- Payslip published (to employee)
- Payroll run complete summary (to root admin)
- Leave forwarded by Dept Head (to Root Admin)
- Document expiry reminder
- Dept Head notified of new leave from their department

**Missing Infrastructure:**
- Per-org SMTP: `emailService.js` must be refactored to accept `orgId` and fetch org SMTP config
- Email queue/retry: if Gmail fails, email is silently dropped

**Backend Changes Required:**
- Refactor `emailService.js`: `getTransporter(orgId)` — look up org SMTP config, fall back to env
- 6 new email templates listed above

**Estimated Complexity:** 🟢 LOW — 0.5 week sprint

---

### 9. REPORTS

**Requirement:** Payroll, attendance, leave, department, organization, employee reports

**Current Implementation:**
- `GET /api/reports/attendance` — CSV + JSON ✅
- `GET /api/reports/leaves` — CSV + JSON ✅
- `GET /api/reports/headcount` — summary counts by department ✅
- `GET /api/reports/employees` — CSV ✅

**Missing:**
- Payroll report: no `/api/reports/payroll`
- Department report: no `/api/reports/departments`
- Organization aggregate report
- Excel export (CSV only currently)
- Scheduled report delivery via email

**Database Changes Required:** None — `v_monthly_payroll_summary` and `v_department_headcount` views already created in production hardening.

**Backend Changes Required:**
- `GET /api/reports/payroll?month=&year=&format=csv` — use `v_monthly_payroll_summary` view
- `GET /api/reports/departments?year=&month=` — use `v_department_headcount` view
- `GET /api/reports/organization?year=` — aggregate all metrics
- Add Excel export support (`xlsx` npm package)

**Estimated Complexity:** 🟢 LOW — 0.5 week sprint

---

### 10. CONFIGURATION

**Requirement:** Everything configurable per organization, no hardcoded business rules

**Current Implementation:**
- `work_schedule` per org ✅
- `leave_policies` per org ✅
- `organization_features` for feature flags ✅
- SMTP config fields in `organizations` table (exists but not used) ⚠️
- Payroll calc rules: HARDCODED in `payroll.routes.js` ❌
- Leave approval flow: HARDCODED (flat) ❌
- Attendance late logic: HARDCODED (no grace, no exemptions) ❌
- Email SMTP: hardcoded to env ❌

**Missing Configuration Tables:**
- `attendance_policies` (grace, OT, late rules)
- `payroll_runs` + payroll config in `organizations`
- `approval_workflows` (1-step vs 2-step)
- Per-org SMTP properly wired into emailService

---

## REUSABLE COMPONENTS

| Component | Location | Reuse Opportunity |
|---|---|---|
| `auth()` middleware | `middleware/auth.js` | Base for all new routes |
| `orgId(req)` helper | `utils/helpers.js` | All new queries must use this |
| `sendMail()` | `services/emailService.js` | All email — just add templates |
| `scheduleDailyAt()` | `utils/cronJobs.js` | All new cron jobs |
| `pool.connect()` + BEGIN/COMMIT pattern | `leaves.routes.js` | All atomic multi-table writes |
| `featureGate` middleware | `middleware/featureFlag.js` | Gate new modules behind feature flags |
| `organization_features` table | DB | Control new features per org |
| `notifications` table | DB | In-app notifications for all new events |
| `employee_documents` + Cloudinary | DB + `config/cloudinary.js` | Document uploads |
| `v_active_employees` view | DB | All queries needing active employee list |
| `v_pending_leaves` view | DB | All leave approval queries |
| `v_monthly_payroll_summary` view | DB | Payroll reports |
| `v_department_headcount` view | DB | Department reports |

---

## MULTI-TENANT CONSIDERATIONS

All existing code correctly scopes by `org_id`. Every new feature must maintain this:

- Custom roles: `roles.org_id` — a role in Org A is invisible to Org B
- Approval workflows: `approval_workflows.org_id`
- Attendance policies: `attendance_policies.org_id`
- Payroll runs: `payroll_runs.org_id`
- Email: per-org SMTP prevents org A's emails going through org B's account
- Biometric: IP whitelist is per device, device scoped to org via `org_id`

**Rule:** Every new table added must include `org_id NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`. Without this, cross-tenant data leakage is possible.

---

## PERFORMANCE CONSIDERATIONS

- Production hardening already added 40+ indexes — new tables also need indexes at creation time
- Payroll bulk generation: must use `pg_advisory_xact_lock` (pattern already established in `payroll.routes.js:168`)
- Role permission resolution per request: cache in JWT or use short-TTL DB lookup (~5ms per request)
- Biometric retry cron: process in batches of 100, not one-by-one
- Report queries: all backed by production hardening views — will be fast

---

## SECURITY CONSIDERATIONS

| Threat | Current State | Required |
|---|---|---|
| Role escalation | Hardcoded role checks | Server-side permission resolution on every request |
| Biometric spoofing | SN validation only | IP whitelist per device |
| RBAC bypass | Hardcoded middleware | Centralized permission system |
| Cross-tenant data leak | org_id scoping (good) | All new tables must include org_id NOT NULL |
| Email relay abuse | Global SMTP | Per-org SMTP |
| Payroll tampering | `published` lock (partial) | `payroll_runs` lock + audit log |

---

## MIGRATION REQUIREMENTS

All new features require additive migrations only (no drops, no renames):

1. New tables: use `CREATE TABLE IF NOT EXISTS` + `schema_migrations` version record
2. New columns: use `ALTER TABLE ADD COLUMN IF NOT EXISTS`
3. New constraints: wrap in `DO $$ IF NOT EXISTS` guard
4. `leaves.status` CHECK must be updated to include `forwarded`
5. `users.role` CHECK must NOT be changed for RBAC — custom roles live in separate table

---

## IMPLEMENTATION ROADMAP

### Phase 0 — Foundation (Week 1–2) — No Production Risk
**Goal:** Additive items only, no existing routes touched

| Task | Risk | Effort |
|---|---|---|
| Create `attendance_policies` table + API + UI | Low | 3 days |
| Per-org SMTP wired into emailService | Low | 1 day |
| Add `special_allowance` column to `payroll_structures` | Low | 0.5 day |
| Payroll reports endpoint (uses existing views) | Low | 2 days |
| Department/Org reports endpoint | Low | 1 day |
| Biometric IP whitelist enforcement in handler | Low | 1 day |
| Biometric retry cron | Low | 1 day |

---

### Phase 1 — Payroll Automation (Week 3–5) — HIGHEST PRIORITY
**Goal:** Enterprise payroll with auto-generation, preview, lock

| Task | Risk | Effort |
|---|---|---|
| `payroll_runs` table + migration | Low | 0.5 day |
| Add payroll config to `organizations` | Low | 0.5 day |
| Bulk generate endpoint (`generate-all`) | Medium | 2 days |
| Preview endpoint (calculate without saving) | Low | 1 day |
| Payroll run lock endpoint | Low | 1 day |
| Payroll cycle scheduler (cron) | Medium | 1 day |
| Salary calc engine extracted to `payrollService.js` | Medium | 3 days |
| Late/OT/grace calculation in payslip | Medium | 2 days |
| `payslip_adjustments` table (bonus/penalty) | Low | 1 day |
| Payroll run UI in `Payroll.jsx` | Medium | 3 days |
| Payslip published email | Low | 0.5 day |

---

### Phase 2 — Leave Approval Workflow (Week 6–7)
**Goal:** 2-step approval: Dept Head → Root Admin

| Task | Risk | Effort |
|---|---|---|
| Update `leaves.status` CHECK to include `forwarded` | Medium | 0.5 day |
| Add `forwarded_by`, `forwarded_at`, `dept_head_notes` columns | Low | 0.5 day |
| `approval_workflows` config table | Low | 0.5 day |
| `PUT /api/leaves/:id/forward` route | Medium | 1 day |
| Modify leave create: notify Dept Head not all admins | Medium | 1 day |
| `PendingApprovals.jsx` — add Dept Head view + two tabs | Medium | 2 days |
| Email: Dept Head notified on new leave | Low | 0.5 day |
| Email: Root Admin notified on forwarded leave | Low | 0.5 day |

---

### Phase 3 — Onboarding Enhancement (Week 8)
**Goal:** Pre-joining emails, document upload workflow, reminders

| Task | Risk | Effort |
|---|---|---|
| Pre-joining email template | Low | 0.5 day |
| Onboarding reminder email template | Low | 0.5 day |
| Cron: pre-joining scan | Low | 1 day |
| Cron: onboarding incomplete reminder | Low | 1 day |
| Link checklist tasks to document categories | Low | 1 day |
| Onboarding document upload UI | Medium | 2 days |

---

### Phase 4 — Role Management / RBAC (Week 9–12) — HIGHEST RISK
**Goal:** Custom roles, module permissions, org-specific RBAC

| Task | Risk | Effort |
|---|---|---|
| `roles`, `permissions`, `role_permissions`, `user_roles` tables | Low | 1 day |
| Seed system roles + permissions on org creation | Medium | 1 day |
| `hasPermission(module, action)` middleware | High | 2 days |
| Replace `adminOnly()` calls across all routes | High | 3 days |
| Role management API (CRUD) | Medium | 2 days |
| Permission matrix UI | Medium | 3 days |
| Dynamic sidebar based on permissions | High | 2 days |
| `usePermission()` hook replacing hardcoded `isAdmin` checks | High | 2 days |
| Integration testing across all routes | High | 3 days |

---

## COMPLEXITY SUMMARY

| Feature | Complexity | Phase | Risk |
|---|---|---|---|
| Payroll automation + lock | 🔴 HIGH | 1 | Medium |
| Salary calculation engine | 🟡 MEDIUM-HIGH | 1 | Medium |
| Role management / RBAC | 🔴 VERY HIGH | 4 | High |
| Leave approval workflow | 🟡 MEDIUM | 2 | Medium |
| Dept Head leave routing | 🟡 MEDIUM | 2 | Medium |
| Attendance policy config | 🟢 LOW-MEDIUM | 0 | Low |
| Onboarding email + docs | 🟡 MEDIUM | 3 | Low |
| Biometric IP whitelist | 🟢 LOW | 0 | Low |
| Biometric retry cron | 🟢 LOW | 0 | Low |
| Per-org SMTP | 🟢 LOW | 0 | Low |
| Payroll/dept/org reports | 🟢 LOW | 0 | Low |
| Email templates (6 new) | 🟢 LOW | 0–3 | Low |
| Special allowance field | 🟢 TRIVIAL | 0 | Negligible |

**Total estimated effort:** 12–14 weeks for full implementation executed sequentially.

---

## KEY RISKS TO PRODUCTION

1. **`leaves.status` CHECK constraint** — adding `forwarded` requires dropping and re-adding the constraint. Safe because no existing rows will be `forwarded`, but must run inside a transaction with guard.

2. **`users.role` CHECK constraint** — RBAC work cannot change this. Custom roles live in a separate `roles` table. The existing `users.role` column stays for system role identification.

3. **Payroll cron idempotency** — auto-generation must be idempotent. The `UNIQUE(user_id, month, year, org_id)` constraint on `payslips` prevents duplicates on duplicate runs — safe by design.

4. **Email SMTP refactor** — moving to per-org SMTP makes `getTransporter()` async. All callers currently fire-and-forget synchronously — no caller change needed, only `emailService.js` internal change.

5. **RBAC transition period** — there will be a window when some routes use old `adminOnly()` and some use `hasPermission()`. Feature flags via `organization_features` can gate new permission-controlled modules to prevent partial state exposure.

---

*Analysis complete. Ready to begin Phase 0 implementation on confirmation.*
