# LUMOS HRMS — PHASE 1 ENTERPRISE IMPLEMENTATION PLAN
**Date:** 2026-07-30  
**Branch:** HRMS-Migration-16jul  
**Classification:** Internal Architecture Document  
**Status:** Pre-Implementation — No Code Written

---

## TABLE OF CONTENTS

1. [Current System Deep Analysis](#1-current-system-deep-analysis)
2. [Gap Analysis Against Client Requirements](#2-gap-analysis-against-client-requirements)
3. [Architecture Design Per Requirement](#3-architecture-design-per-requirement)
4. [Required Database Changes](#4-required-database-changes)
5. [Required Backend Changes](#5-required-backend-changes)
6. [Required Frontend Changes](#6-required-frontend-changes)
7. [Migration Strategy](#7-migration-strategy)
8. [Implementation Order](#8-implementation-order)
9. [Dependencies](#9-dependencies)
10. [Estimated Complexity](#10-estimated-complexity)
11. [Risks & Rollback Plans](#11-risks--rollback-plans)
12. [Testing Plan](#12-testing-plan)
13. [Future Improvements](#13-future-improvements)

---

## 1. CURRENT SYSTEM DEEP ANALYSIS

### 1.1 Authentication Module

**Architecture:**  
JWT-based stateless auth. Single endpoint `/api/auth/login` returns a signed 7-day token. TOTP 2FA supported via `otplib`. No session table — token validity is not revocable without secret rotation.

**JWT Payload (current):**
```json
{ "id": 1, "email": "...", "role": "root_admin", "name": "...", "organization_id": 1, "organization_slug": "lumoslogic" }
```

**Database Tables:**
- `users` — stores `password` (bcrypt), `force_password_change`, `password_reset_token`, `password_reset_expires`, `totp_enabled`, `totp_secret`, `email_verified`, `email_verify_code`, `email_verify_code_expires`, `last_login_at`, `last_login_ip`, `last_login_ua`, `password_history` (JSONB, last 5), `password_changed_at`, `status` (active/inactive)
- `login_history` — tracks IP, user_agent, status per login

**APIs (all under `/api/auth`):**
- `POST /login` — rate limited, bcrypt verify, TOTP branching
- `GET /me` — returns current user profile
- `PUT /profile` — name, email, avatar_color, avatar_url
- `POST /upload-avatar` — Cloudinary upload, 200×200 face crop
- `PUT /change-password` — verifies old password, checks last 5, enforces 8-char minimum
- `POST /forgot-password` — rate limited, sends reset link
- `POST /reset-password` — validates token + 1-hour expiry
- `POST /send-verification` — 6-digit code, 30-min expiry
- `POST /verify-email` — validates code
- `POST /deactivate` — soft deactivate own account
- `POST /request-deletion` — GDPR email to HR
- `POST /totp/setup` — generates TOTP secret + QR code
- `POST /totp/enable` — verifies first TOTP code
- `POST /totp/disable` — requires current password
- `POST /totp/verify-login` — completes 2FA login step
- `GET /login-history` — last 15 logins
- `GET /download-data` — GDPR data export (JSON)

**Business Logic:**
- Email is globally unique across all organizations
- Status `inactive` blocks login after password verification (timing attack prevention)
- Password reuse prevention: last 5 hashes stored in `password_history` JSONB
- Force password change flag set on employee creation

**Problems / Technical Debt:**
- JWT is not revocable — no token blacklist. If a user's role changes, old token remains valid for up to 7 days.
- JWT does not carry permissions — only a role string. RBAC will require either embedding permissions in JWT (bloats token) or a DB lookup on every request.
- `users.role` is a single string column with a CHECK constraint (`employee`, `admin`, `root_admin`, `platform_admin`). This must not be broken by RBAC additions.
- `getRecipients()` in helpers.js falls back to ALL admins/root_admins — a blunt instrument that will cause notification storms as the system scales.

---

### 1.2 Authorization Module

**Architecture:**  
Middleware-based, hardcoded role checks in every route. No permission table exists. No RBAC.

**Middleware (all in `middleware/auth.js`):**
```
auth()           → verifies JWT, sets req.user
adminOnly()      → allows role = 'admin' OR 'root_admin'
rootAdminOnly()  → allows role = 'root_admin' only
isAdminRole()    → returns boolean
selfOrAdmin()    → allows admin OR employee editing their own record
platformAdminAuth() → separate JWT check for platform_admin
```

**Current Role Hierarchy:**
```
platform_admin   (platform-level, separate SPA)
  └── root_admin (org owner, full access)
       └── admin (HR admin)
            └── employee (base user)
```

**Problems / Technical Debt:**
- 30+ route files contain inline `if (req.user.role !== 'admin')` checks — all must be replaced for RBAC
- No concept of Department Head as an authorization level
- `adminOnly()` combines HR Admin and Root Admin — no way to restrict certain actions to Root Admin only without separate `rootAdminOnly()` middleware
- `selfOrAdmin()` allowedSelfFields mechanism is weak — relies on caller passing field whitelists
- Feature flags (`organization_features`) gate entire pages but not individual actions within a page

---

### 1.3 Roles & Permissions Module

**Architecture:** Does not exist.

**What exists:**
- `users.role` TEXT column: 4 fixed values enforced by DB CHECK constraint
- `organization_features` table: feature on/off per org (platform admin controlled)

**What does NOT exist:**
- No `roles` table
- No `permissions` table
- No role-permission mapping table
- No user-role assignment table
- No permission inheritance
- No org-specific roles
- No UI for role management

---

### 1.4 Departments Module

**Architecture:**  
Simple CRUD with Department Head concept in DB but not operationally enforced anywhere.

**Database Tables:**
- `departments` — `id`, `name`, `description`, `head_user_id` (FK to users), `organization_id`
- `designations` — `id`, `name`, `department_id`, `organization_id`
- `user_departments` — junction: `user_id`, `department_id`, `role_in_dept` ('Member'), `organization_id`
- `users.department_id` (FK) — primary department FK
- `users.department` (TEXT) — denormalized string copy (kept in sync by dept rename logic)

**APIs (`/api/departments`):**
- `GET /` — list departments with member counts and head user info
- `POST /` — create department (admin only)
- `PUT /:id` — update, syncs `users.department` string on rename
- `DELETE /:id` — deletes department

**Business Logic:**
- `head_user_id` is stored but never READ by any other module
- Leave approval does NOT check `head_user_id` — leaves go to all admins
- `user_departments` junction is multi-department capable (employee can be in N departments)
- Primary department is `users.department_id` — used in payroll and reports

**Problems / Technical Debt:**
- `head_user_id` is a dead column operationally — set but never consumed
- `users.department` TEXT is a denormalized copy that can drift if updated via direct DB query
- No UNIQUE constraint on `departments.head_user_id` — two departments can have the same head
- Department head has no distinct login experience — they see the same employee portal as a regular employee
- Leave approval routing completely ignores `departments.head_user_id`

---

### 1.5 Users / Employees Module

**Architecture:**  
Single `users` table with ~75 columns serving every purpose: auth, profile, statutory, biometric, payroll config.

**Database Table: `users` (selected significant columns):**
```
Auth:       id, email, password, role, organization_id, status
Profile:    name, employee_id, phone, gender, department, position, avatar_color, avatar_url
Personal:   date_of_birth, address, marital_status, nationality, religion, blood_group
Employment: employment_type, employment_status, employee_status, date_of_joining, joining_date,
            confirmation_date, reporting_to, hod_id
Statutory:  pf_applicable, pf_no, esi_applicable, esi_no, pan_number, uan_no, aadhar_no
Payroll:    ctc, salary_effective_date, work_hours_per_day, per_day_wages, per_hour_rate
Biometric:  device_enrollment_id, branch_id, weekly_off_day
Org:        department_id, designation_id, division, sub_division, grade, pay_cadre, location
Security:   force_password_change, password_reset_token, totp_enabled, last_login_at, password_history
```

**APIs (`/api/employees`):**
- `GET /` — list (role-filtered, multi-dept joined)
- `POST /` — create + dept assignments (atomic transaction)
- `PUT /:id` — update + dept assignments (atomic transaction)
- `PUT /:id/statutory` — PF/ESI/OT/Aadhaar/PAN/UAN fields (admin only)
- `DELETE /:id` — hard delete (cascades via FK ON DELETE CASCADE)

**Problems / Technical Debt:**
- `users` table has 75+ columns — god object anti-pattern. Should be split into `user_profiles`, `user_statutory`, `user_biometric` etc. (not practical to refactor now without massive migration)
- Hard delete on users (`DELETE FROM users`) cascades to attendance, leaves, payslips — this will delete payroll history when an employee exits. Should be soft-delete via `employee_status = 'terminated'`
- Two overlapping status columns: `status` (active/inactive — auth) and `employee_status` (active/inactive/resigned/terminated/on_leave — HR)
- Two overlapping date columns: `date_of_joining` (TEXT) and `joining_date` (DATE) — same concept, different types
- `reporting_to` FK exists but is not used in any workflow

---

### 1.6 Attendance Module

**Architecture:**  
Manual check-in/out via API, biometric via ADMS receiver, regularization for corrections. All writes to `attendance` table.

**Database Tables:**
- `attendance` — `user_id`, `date` (TEXT YYYY-MM-DD), `check_in`, `check_out`, `break_start`, `break_end`, `total_break_minutes`, `gross_hours`, `work_hours`, `status` (present/absent/on_leave/half_day/wfh), `is_late`, `is_early_exit`, `late_minutes`, `early_exit_minutes`, `ot_hours`, `source` (manual/biometric/clockify), `organization_id`, `deleted_at`
- `attendance_regularization` — correction requests with approval flow
- `work_schedule` — org-level schedule config
- `shift_assignments` — per-user per-date shift
- `shifts` — shift definitions

**APIs (`/api/attendance`):**
- `GET /` — list (admin: all; employee: own)
- `GET /today` — current user today's record
- `GET /checkin-mode` — returns `{ has_clockify: false }`
- `POST /checkin` — validates no existing check-in, marks `is_late`
- `POST /checkout` — calculates `work_hours`, `gross_hours`, `is_early_exit`
- `POST /break-start` — records `break_start`
- `POST /break-end` — records `break_end`, accumulates `total_break_minutes`
- `PUT /:id` — admin update
- `DELETE /:date` — admin delete for a specific date

**Business Logic (current):**
- `is_late = toMinutes(check_in) > toMinutes(settings.late_threshold)`
- `is_early_exit = toMinutes(check_out) < toMinutes(settings.early_exit_threshold)`
- `gross_hours = check_out_mins - check_in_mins` (in hours)
- `work_hours = gross_hours - (total_break_minutes / 60)`
- `ot_hours` calculated but not linked to payroll

**Problems / Technical Debt:**
- `date` column is TEXT not DATE — prevents range queries using index (text_pattern_ops index added in production hardening as workaround)
- `is_late` is set at check-in but uses raw `late_threshold` — no grace period concept
- `late_minutes` and `early_exit_minutes` are tracked but NEVER read by the payroll engine
- `ot_hours` is calculated but NEVER used in payslip generation
- `work_schedule.late_threshold` is a hard cutoff — no "X minutes grace" concept
- Biometric check-in via `/iclock/cdata` does NOT re-evaluate `is_late` against `work_schedule` — it just sets `status = 'present'`
- No `source` consideration in payroll — manual and biometric punches are treated identically

---

### 1.7 Leave Module

**Architecture:**  
Employee applies, admin approves. Atomic transaction ensures leave + attendance status change happen together. Google Calendar integration for approved leaves.

**Database Tables:**
- `leaves` — `user_id`, `start_date`, `end_date`, `leave_type`, `leave_time` (full/half/wfh), `half_type` (first_half/second_half), `reason`, `remarks`, `status` (pending/approved/rejected/cancelled), `approved_by`, `approved_at`, `google_event_id`, `organization_id`, `deleted_at`, `forwarded_by`, `forwarded_at`, `dept_head_notes` (need to verify if these columns exist — they were in the gap analysis plan but NOT yet implemented)
- `leave_policies` — per org per leave_type: quota, carry_forward, paid, half_day_allowed, min_notice_days, etc.

**APIs (`/api/leaves`):**
- `GET /date-check` — conflict check + balance calculation
- `GET /team` — all approved leaves (calendar view)
- `GET /` — list (role-filtered)
- `POST /` — create leave (employee self or admin on behalf — admin-created leaves are auto-approved)
- `PUT /:id` — edit pending leave
- `PUT /:id/approve` — admin/root_admin approves
- `PUT /:id/reject` — admin/root_admin rejects
- `PUT /:id/revert` — cancel approved leave
- `DELETE /:id` — delete pending leave

**Business Logic:**
- Approval atomically inserts attendance records (status = on_leave/half_day/wfh) for each working day
- Rejection atomically deletes those attendance records
- Leave balance calculated in-memory: `usedByType` from approved leaves, compared to `leave_policies.annual_quota`
- Holidays excluded from leave day count
- Weekends excluded from leave day count

**Critical Problem — No Department Head Step:**
- `PUT /:id/approve` uses `adminOnly` middleware — ANY admin or root_admin can approve
- `departments.head_user_id` is NEVER consulted
- No intermediate `forwarded` status exists in the CHECK constraint
- Employee cannot see which stage their leave is at

**Problems / Technical Debt:**
- `approved_by` column serves double duty — who approved (admin) vs who forwarded (dept head)
- No `leave_approval_log` table — cannot reconstruct who did what and when
- Duplicate `remarks` and `reason` columns — semantic overlap
- `fn_validate_leave_overlap` function exists in DB but is NEVER called from the backend

---

### 1.8 Payroll Module

**Architecture:**  
Employee salary structures defined per employee, payslips generated manually one employee at a time. No automation.

**Database Tables:**
- `payroll_structures` — `user_id`, `effective_from`, earnings (basic, hra, da, transport_allowance, medical_allowance, other_allowances), deductions (pf_employee, pf_employer, esi_employee, esi_employer, professional_tax, tds), `organization_id`
- `payslips` — computed result: all earnings + deductions + `lop_days`, `lop_amount`, `net_salary`, `working_days`, `present_days`, `absent_days`, `leave_days`, `status` (generated/published), `generated_by`, `organization_id`, `deleted_at`, `pdf_url`

**APIs (`/api/payroll`):**
- `GET /structure?userId=` — salary structure history for employee
- `POST /structure` — create salary structure (admin only)
- `PUT /structure/:id` — update salary structure
- `GET /payslips?userId=&year=` — employee's payslip list
- `GET /payslips/all?month=&year=` — all payslips for period (admin)
- `POST /payslips/generate` — generate one payslip (admin only)
- `PUT /payslips/:id/publish` — publish payslip

**Current Salary Calculation (in payroll.routes.js:92–238):**
```
gross_salary = basic + hra + da + transport_allowance + medical_allowance + other_allowances
working_days = count of working days in month (from work_schedule.work_days)
present_days = full_present + half_day_count × 0.5
lop_days     = absent_count + half_day_count × 0.5
lop_amount   = lop_days × (gross_salary / working_days)
total_deductions = pf_employee + esi_employee + professional_tax + tds + other_deductions + lop_amount
net_salary   = gross_salary - total_deductions
```

**What is MISSING from the calculation:**
- No grace period consideration — `is_late` never consulted
- No late arrival deduction — `late_minutes` never read
- No early exit deduction — `early_exit_minutes` never read
- No overtime pay — `ot_hours` never read
- No shift-based proration
- No loan/advance deduction
- No custom deductions
- No arrears component
- No bonus component
- No LWF (Labour Welfare Fund)
- No special allowance (distinct from other_allowances)
- Deductions not prorated for LOP — PF/ESI applied on full gross even when employee was absent

**Critical Architecture Problems:**
- Entire calculation logic is inline in a single route handler (240 lines)
- No `payroll_runs` table — no concept of a "payroll run" for a month
- No bulk generation — one employee at a time
- No preview — generates and saves in one step
- No lock/freeze mechanism — `published` status exists but does not prevent admin from re-running with `force=true`
- `pg_advisory_xact_lock` used to prevent concurrent generation — good, but no run-level locking
- No payroll calendar — no configured date for auto-generation
- No email sent on payslip generation (only in-app notification)
- No PDF generation — `pdf_url` column exists but always empty

---

### 1.9 Notifications Module

**Architecture:**  
Simple in-app notification insert + web push via `web-push` library.

**Database Tables:**
- `notifications` — `user_id`, `title`, `message`, `type`, `is_read`, `link`, `organization_id`, `reference_id` (added in recent migration)
- `push_subscriptions` — web push endpoints per user device
- `notification_recipients` — email list for HR notifications

**APIs (`/api/notifications`):**
- `GET /` — user's own (last 50)
- `GET /unread-count` — badge count
- `PUT /:id/read` — mark one read
- `PUT /mark-all-read` — mark all read
- `DELETE /:id` — delete

**Push Service (`services/pushService.js`):**
- `sendPushToUsers(userIds, { title, body, url })` — web push to all devices of given users

**Problems / Technical Debt:**
- No `reference_id` + `reference_type` combo for deep linking to specific records
- No notification categories or filtering
- Limit of 50 notifications per user (pagination missing)
- `getRecipients()` falls back to ALL admins — blunt instrument when dept heads need targeted notifications
- No notification preferences per user (opt out of certain types)

---

### 1.10 Email Module

**Architecture:**  
Nodemailer with single Gmail SMTP transport, initialized lazily from `process.env.SMTP_USER/SMTP_PASS`.

**Current Templates:**
| Template Function | When Used |
|---|---|
| `welcomeEmployeeHtml` | On employee creation |
| `leaveAppliedHtml` | When employee applies for leave |
| `leaveStatusHtml` | When leave is approved or rejected |
| `birthdayWishHtml` | Daily cron — employee's birthday |
| `birthdayReminderHtml` | Daily cron — tomorrow is birthday |
| `holidayReminderHtml` | Daily cron — tomorrow is holiday |
| `orgRequestReceivedHtml` | Org registration request submitted |
| `orgApprovedHtml` | Org approved by platform admin |
| `orgRejectedHtml` | Org rejected |
| `passwordResetHtml` | Forgot password flow |

**Problems / Technical Debt:**
- Single global SMTP — all orgs share one Gmail account
- `organizations` table has `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_from` columns that are NEVER read by `emailService.js`
- No email queue — if Gmail rejects (rate limit, auth failure), the email is silently lost
- No email log — no way to audit what was sent, to whom, when
- No retry mechanism
- No template for payslip notification
- No template for dept head leave notification
- No template for pre-joining onboarding
- No template for payroll run completion

---

### 1.11 Cron Jobs / Scheduled Tasks

**Architecture:**  
Single custom `scheduleDailyAt(hour, minute, fn)` function — NOT a proper cron library (uses `setTimeout` with recursive rescheduling). Only one job registered.

**Current Jobs:**
```javascript
scheduleDailyAt(8, 0, runDailyNotifications)
```

**`runDailyNotifications()` does:**
1. Fetches all active organizations
2. For each org, fetches all employees
3. Sends birthday wishes (today's birthday)
4. Sends birthday reminders to HR (tomorrow's birthday)
5. Sends holiday reminders to all (tomorrow's holiday)

**Problems / Technical Debt:**
- `setTimeout`-based scheduler is NOT fault-tolerant — server restart loses the timer
- No payroll auto-generation cron
- No onboarding reminder cron
- No biometric retry cron
- No document expiry cron
- No leave escalation cron
- No proper cron library (should use `node-cron` or `node-schedule`)
- If `runDailyNotifications` throws, it's caught by `.catch(console.error)` and the next invocation is still scheduled — but errors are not alerted

---

### 1.12 Biometric Module

**Architecture:**  
ZKTeco ADMS-compatible receiver. Devices push attendance via HTTP POST to `/iclock/cdata`.

**Database Tables:**
- `biometric_devices` — `org_id`, `serial_number`, `device_name`, `location`, `branch_id`, `area_code`, `device_ip`, `last_seen`, `status`, `allowed_ips`, `ip_whitelist_enabled`
- `biometric_raw_logs` — append-only: `org_id`, `device_serial`, `employee_pin`, `punch_time`, `punch_type`, `verify_type`, `processed`
- `biometric_employee_map` — `org_id`, `employee_pin`, `user_id`

**Flow:**
1. Device POSTs to `/iclock/cdata?SN=<serial>`
2. Handler responds `OK` immediately (< 2s requirement)
3. `setImmediate()` processes async:
   - Validates SN against `biometric_devices`
   - Updates device `last_seen` and `status = online`
   - Parses ATTLOG lines (PIN, timestamp, punch_type)
   - Inserts into `biometric_raw_logs` (idempotent)
   - Looks up PIN → user_id via `biometric_employee_map`
   - Skip if employee on leave
   - Check-in (punch_type=0): INSERT attendance
   - Check-out (punch_type=1): UPDATE attendance with hours

**Problems / Technical Debt:**
- IP whitelist columns exist (`allowed_ips`, `ip_whitelist_enabled`) but NEVER checked in handler
- No retry mechanism — if PIN is not mapped, raw log is marked processed=false and NEVER retried
- Biometric check-in does NOT evaluate `is_late` against `work_schedule`
- Biometric check-in does NOT calculate `late_minutes`
- No audit log per processed punch beyond the raw_log table
- No monitoring API

---

### 1.13 Documents Module

**Architecture:**  
Generic file upload to Cloudinary, metadata stored in `employee_documents`.

**Database Tables:**
- `employee_documents` — `user_id`, `name`, `category`, `file_url`, `file_type`, `file_size`, `expiry_date`, `uploaded_by`, `status` (pending_review/approved/rejected), `visibility`, `organization_id`
- `document_shares` — sharing per user

**Problems / Technical Debt:**
- `status` column exists but is not used in any workflow — all documents just sit as `pending_review`
- No onboarding-document linkage — uploaded files are not connected to checklist tasks
- No document expiry alert — `expiry_date` stored but no cron reads it

---

## 2. GAP ANALYSIS AGAINST CLIENT REQUIREMENTS

### Requirement 1 — Role Based Access Control

| Client Requirement | Current State | Gap |
|---|---|---|
| Root Admin creates custom roles | No role creation API exists | 🔴 MISSING |
| Roles are org-specific | `users.role` is global string, no org scoping | 🔴 MISSING |
| Assign permissions to roles | No permission table exists | 🔴 MISSING |
| Permissions are dynamic (not hardcoded) | 30+ files have hardcoded `adminOnly()` checks | 🔴 MISSING |
| Permissions can be modified later | No permission management UI or API | 🔴 MISSING |
| Users receive permissions through roles | Single string role in JWT, no RBAC resolution | 🔴 MISSING |
| No hardcoded permission checks | Every route file has inline role checks | 🔴 MISSING |
| Module-wise access control | Feature flags exist (on/off per org) but not per-role | 🟡 PARTIAL |
| CRUD-level permissions | Not implemented | 🔴 MISSING |
| Page visibility control | Route guards exist but role-only | 🟡 PARTIAL |
| User-role assignment UI | Not implemented | 🔴 MISSING |

**Summary:** This requirement is **0% implemented**. Everything must be built from scratch. It is the highest-risk item because it requires modifying every single route in the system.

---

### Requirement 2 — Department Head Approval Workflow

| Client Requirement | Current State | Gap |
|---|---|---|
| Dept has one Head | `departments.head_user_id` column exists | ✅ EXISTS (in DB) |
| Employee submits leave | `POST /api/leaves/` works | ✅ EXISTS |
| Leave goes to Dept Head first | Leave goes to ALL admins | 🔴 MISSING |
| Dept Head can approve forward | Dept Head has no special action | 🔴 MISSING |
| Dept Head cannot reject | No enforcement | 🔴 MISSING |
| Root Admin gives final approval | Root Admin can approve but so can any admin | 🟡 PARTIAL |
| Employee sees current approval stage | Status is only `pending` or `approved` | 🔴 MISSING |
| Notification at every stage | Only email on apply and on final approve/reject | 🟡 PARTIAL |
| Email at every stage | Only apply/approve/reject emails (missing dept head step) | 🟡 PARTIAL |
| Audit log of approvals | No `leave_approval_log` table | 🔴 MISSING |
| Escalation if pending too long | No escalation cron | 🔴 MISSING |
| Configurable workflow (1-step vs 2-step) | Not configurable | 🔴 MISSING |

**Summary:** The data model has the foundation (`head_user_id` exists) but the entire workflow logic, status machine, notification chain, and audit trail are missing.

---

### Requirement 3 — Pre-Onboarding Automation

| Client Requirement | Current State | Gap |
|---|---|---|
| Email sent when employee is created | Welcome email (credentials) sent on creation | ✅ EXISTS |
| Pre-joining email (before join date) | Not implemented | 🔴 MISSING |
| Employee uploads documents | `employee_documents` table + Cloudinary exists | ✅ EXISTS |
| Specific doc types (PAN, Aadhaar, bank, etc.) | `category` field exists but no onboarding-specific types | 🟡 PARTIAL |
| HR reviews documents | `employee_documents.status` field exists but no review workflow | 🟡 PARTIAL |
| Root Admin approves | No approval workflow for documents | 🔴 MISSING |
| Employee activated after approval | No link between document approval and account status | 🔴 MISSING |
| Document completion tracking | Onboarding checklist exists but not linked to documents | 🟡 PARTIAL |
| Reminder emails for incomplete docs | No cron for this | 🔴 MISSING |
| Document expiry tracking | `expiry_date` column exists, no cron | 🟡 PARTIAL |
| Missing document alerts | Not implemented | 🔴 MISSING |

---

### Requirement 4 — Payroll Engine

#### Salary Structure Components

| Component | Current State | Gap |
|---|---|---|
| Basic | ✅ `payroll_structures.basic` | DONE |
| HRA | ✅ `payroll_structures.hra` | DONE |
| DA | ✅ `payroll_structures.da` | DONE |
| Medical | ✅ `payroll_structures.medical_allowance` | DONE |
| Transport | ✅ `payroll_structures.transport_allowance` | DONE |
| Special Allowance | 🟡 Lumped in `other_allowances` | NEEDS OWN COLUMN |
| Other Allowances | ✅ `payroll_structures.other_allowances` | DONE |
| Employer PF | ✅ `payroll_structures.pf_employer` | DONE |
| Employee PF | ✅ `payroll_structures.pf_employee` | DONE |
| Professional Tax | ✅ `payroll_structures.professional_tax` | DONE |
| ESI (employee + employer) | ✅ Both in payroll_structures | DONE |
| TDS | ✅ `payroll_structures.tds` | DONE |
| Loan | 🔴 NOT in structure or payslip | MISSING |
| Advance | 🔴 NOT in structure or payslip | MISSING |
| Custom deductions | 🔴 NOT in structure | MISSING |
| LWF | 🔴 NOT in structure or payslip | MISSING |
| Effective From | ✅ `payroll_structures.effective_from` | DONE |
| Salary revision history | ✅ Multiple structures per employee ordered by date | DONE |

#### Calculation Rules

| Calculation Rule | Current State | Gap |
|---|---|---|
| Overtime pay | 🟡 `ot_hours` tracked, never applied | MISSING from payroll |
| Leave deduction (LOP) | ✅ `lop_days`, `lop_amount` calculated | DONE |
| Attendance deduction (absent) | ✅ Absent days count as LOP | DONE |
| Late arrival deduction | 🔴 `late_minutes` tracked, never used | MISSING |
| Half day deduction | ✅ Half day = 0.5 LOP | DONE |
| Early leaving deduction | 🔴 `early_exit_minutes` tracked, never used | MISSING |
| LWP (Leave Without Pay) | 🟡 Mapped to absent/LOP but no distinct type | PARTIAL |
| Holiday handling | ✅ Holidays excluded from working_days count | DONE |
| Weekly off | ✅ `work_schedule.work_days` used | DONE |
| Shift-based calculation | 🔴 Shift data exists, never affects payroll | MISSING |
| Working hours-based calc | 🔴 Only days-based, not hours-based | MISSING |
| Proration (mid-month join) | 🔴 Not implemented | MISSING |
| Arrears | 🔴 Not implemented | MISSING |
| Grace period impact | 🔴 No grace concept in payroll | MISSING |
| Configurable rules | 🔴 All rules hardcoded in route handler | MISSING |

#### Process Automation

| Feature | Current State | Gap |
|---|---|---|
| Generate salary automatically | 🔴 Manual only | MISSING |
| Monthly cron job | 🔴 No payroll cron exists | MISSING |
| Manual regenerate (force) | ✅ `force=true` parameter exists | DONE |
| Preview before generate | 🔴 No preview endpoint | MISSING |
| Freeze / Lock payroll | 🟡 `published` status partially locks | PARTIAL |
| Payroll run management | 🔴 No `payroll_runs` table | MISSING |
| Bulk generation (all employees) | 🔴 One employee at a time | MISSING |
| Payroll reports | 🔴 No `/api/reports/payroll` endpoint | MISSING |
| PDF payslip generation | 🔴 `pdf_url` column exists but always empty | MISSING |
| Email on payslip publish | 🔴 Only in-app notification, no email | MISSING |

---

### Requirement 5 — Attendance Integration with Payroll

| Integration Point | Current State | Gap |
|---|---|---|
| Biometric source in payroll | 🔴 Source field ignored in payroll | MISSING |
| Manual attendance in payroll | ✅ Status used for present/absent counts | DONE |
| Regularization effect on payroll | 🔴 Regularization approved ≠ attendance updated | MISSING |
| Leave in payroll | ✅ on_leave status = not LOP | DONE |
| WFH in payroll | ✅ WFH status = present (not LOP) | DONE |
| Holiday effect | ✅ Excluded from working days | DONE |
| Half day effect | ✅ 0.5 LOP | DONE |
| Late arrival deduction | 🔴 `late_minutes` never used in payroll | MISSING |
| Early exit deduction | 🔴 `early_exit_minutes` never used in payroll | MISSING |
| Overtime pay | 🔴 `ot_hours` never used in payroll | MISSING |
| Shift impact on payroll | 🔴 Shift data never used in payroll | MISSING |
| Grace period | 🔴 Not in attendance or payroll | MISSING |
| Monthly late count exemptions | 🔴 Not implemented | MISSING |
| Attendance policy configurable | 🔴 `work_schedule` only — no grace/OT/exemption config | PARTIAL |

---

## 3. ARCHITECTURE DESIGN PER REQUIREMENT

### 3.1 RBAC Architecture

#### Core Concept

Replace hardcoded role strings with a permission-based system. The system will have two layers:
- **System Roles** (seeded, cannot be deleted): `Root Admin`, `HR Admin`, `Department Head`, `Employee`
- **Custom Roles** (created by Root Admin): org-specific, inheritable from system roles

#### Permission Model

Permissions are defined as `module.action` pairs:
- `leaves.view`, `leaves.create`, `leaves.approve`, `leaves.reject`
- `payroll.view`, `payroll.generate`, `payroll.lock`, `payroll.export`
- `employees.view`, `employees.create`, `employees.edit`, `employees.delete`
- `departments.view`, `departments.manage`
- `attendance.view`, `attendance.edit`, `attendance.approve_regularization`
- `reports.view`, `reports.export`
- `settings.manage`, `biometric.manage`, `onboarding.manage`

#### Data Model Design

```
organizations (existing)
    └── roles (new)
          ├── system_role: true/false
          ├── org_id: FK to organizations
          └── role_permissions (new)
                └── permission_id: FK to permissions (new)

users (existing)
    └── user_roles (new)
          ├── user_id: FK to users
          ├── role_id: FK to roles
          └── org_id: FK to organizations
```

#### Permission Resolution Strategy

**At login** → resolve all permissions for the user's roles → embed compact permission set in JWT:
```json
{ "id": 1, "org_id": 1, "role_str": "root_admin", "permissions": ["leaves.approve", "payroll.lock", ...] }
```

**On each request** → `hasPermission('leaves', 'approve')` middleware reads `req.user.permissions` array.

**Trade-off:** Embedding permissions in JWT means permission changes don't take effect until next login (or token refresh). Acceptable for an enterprise HRMS where permissions are changed infrequently by admins.

**Alternative (if real-time needed):** DB lookup per request — adds 5–10ms latency but reflects changes immediately.

#### Backward Compatibility

The existing `users.role` TEXT column must remain for backward compatibility during transition. System roles map 1:1:
- `root_admin` → "Root Admin" system role (all permissions)
- `admin` → "HR Admin" system role (most permissions)
- `employee` → "Employee" system role (self-service only)

The `chk_users_role` CHECK constraint must NOT be modified — custom roles live in the `roles` table, not in `users.role`.

#### Workflow

```
Root Admin → Create Role → Assign Permissions (module × action matrix) → Assign Users to Role
                                                                               ↓
                                                         User logs in → JWT includes resolved permissions
                                                                               ↓
                                                     API Request → hasPermission() middleware checks JWT
```

---

### 3.2 Department Head Approval Workflow Architecture

#### Status Machine

```
CURRENT:   pending → approved/rejected/cancelled

PROPOSED:  pending → forwarded → approved
                              ↘ rejected
                   ↘ returned (dept head sends back without forwarding)
                   ↘ cancelled (employee withdraws)
```

#### Actor Mapping

| Actor | Identified By | Can Do |
|---|---|---|
| Employee | JWT user.id | Submit, cancel pending leaves |
| Department Head | `departments.head_user_id` matching `users.department_id` | Forward, return to employee |
| Root Admin | `users.role = 'root_admin'` OR RBAC permission | Approve, reject |
| HR Admin | `users.role = 'admin'` OR RBAC permission | View, assist (no approval in 2-step) |

#### Leave Approval Workflow

```
1. Employee submits leave (POST /api/leaves/)
   → Status: 'pending'
   → Notification + Email → Department Head of employee's primary department

2. Dept Head forwards (PUT /api/leaves/:id/forward)
   → Status: 'forwarded'
   → Notification + Email → Root Admin
   → Audit log: { action: 'forwarded', actor_id: dept_head_id, at: now }

3a. Root Admin approves (PUT /api/leaves/:id/approve)
    → Status: 'approved'
    → Attendance records inserted (atomic transaction)
    → Notification + Email → Employee
    → Audit log: { action: 'approved', actor_id: root_admin_id, at: now }

3b. Root Admin rejects (PUT /api/leaves/:id/reject)
    → Status: 'rejected'
    → Attendance records removed (atomic transaction)
    → Notification + Email → Employee
    → Audit log: { action: 'rejected', actor_id: root_admin_id, at: now }

4. (Optional) Escalation Cron: if leave stays 'pending' for >N days → notify Root Admin
```

#### Configurable Workflow

Some orgs may not need a Dept Head step. The `approval_workflows` config table controls this:
```json
{ "workflow_type": "leave", "steps": [{"actor": "dept_head", "action": "forward"}, {"actor": "root_admin", "action": "approve"}] }
```
If only one step: `[{"actor": "root_admin", "action": "approve"}]` — bypasses dept head.

#### New DB Table: `leave_approval_log`

```sql
CREATE TABLE leave_approval_log (
  id         BIGSERIAL PRIMARY KEY,
  leave_id   BIGINT NOT NULL REFERENCES leaves(id) ON DELETE CASCADE,
  org_id     BIGINT NOT NULL REFERENCES organizations(id),
  actor_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL CHECK (action IN ('submitted','forwarded','returned','approved','rejected','cancelled')),
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

This is the single source of truth for the approval history. Immutable append-only log.

---

### 3.3 Pre-Onboarding Automation Architecture

#### Workflow

```
HR creates employee in system
    ↓
System sends:
  (a) Welcome email with portal credentials (EXISTS — sent on POST /api/employees)
  (b) Pre-joining email N days before join date (NEW — triggered by cron)
    ↓
Employee accesses onboarding portal
    ↓
Employee uploads required documents (linked to checklist tasks)
    ↓
Each document upload → Notification to HR for review
    ↓
HR marks documents as verified
    ↓
When all mandatory documents verified → Root Admin notified
    ↓
Root Admin approves employee (status change: pre_joining → active)
    ↓
Employee can now use HRMS fully
```

#### Document Requirement Types

Hard-code a set of onboarding document categories:
```
IDENTITY:    aadhaar, pan, passport, voter_id
FINANCIAL:   bank_details, cancelled_cheque
PHOTO:       photograph
ADDRESS:     address_proof
EDUCATION:   degree_certificate, marksheet
EXPERIENCE:  relieving_letter, experience_letter
STATUTORY:   form_16, it_returns
```

These map to `onboarding_checklists.required_document_category`.

#### New Email Templates Needed

1. `preJoiningEmailHtml(employee, documentList, portalLink)` — sent N days before join
2. `onboardingReminderHtml(employee, incompleteDocs)` — weekly reminder
3. `documentUploadedHtml(hrRecipients, employee, docType)` — to HR when doc uploaded
4. `onboardingCompleteHtml(rootAdmin, employee)` — when all docs verified

---

### 3.4 Payroll Engine Architecture

#### Design Philosophy

Extract payroll calculation from the route handler into a **pure service function**. The service receives inputs, performs calculation, returns the payslip object — but does NOT write to DB. The route handler handles all DB writes.

```
payrollService.calculatePayslip(
  structure,      // salary structure
  attendanceData, // attendance records for the month
  policy,         // attendance policy (grace, OT, etc.)
  holidays,       // holiday list for the month
  adjustments     // manual bonuses/deductions
) → payslipPayload
```

This enables **preview** (call service, don't write) vs **generate** (call service, then write).

#### Payroll Run Concept

```
Payroll Run = org + month + year + status
Status flow: draft → processing → completed → locked

1. Root Admin initiates run for month
   → payroll_runs record created (status: draft)

2. Preview (optional)
   → Calls calculatePayslip() for all active employees
   → Returns preview without writing to payslips table

3. Generate All
   → Iterates all active employees
   → Calls calculatePayslip() per employee
   → Upserts to payslips table
   → Updates payroll_runs.processed_count, total_gross, total_net
   → Status: processing → completed

4. Lock
   → payroll_runs.status = locked
   → payslips WHERE run_id = this_run → cannot be regenerated
   → Sends payslip emails to all employees

5. Unlock (emergency)
   → Root Admin only
   → payroll_runs.status = completed
   → Audit logged
```

#### Enhanced Salary Calculation Engine

**Step 1: Resolve structure** (existing — effective_from date logic)

**Step 2: Count attendance days**
```
working_days       = count of weekdays (per work_schedule.work_days) excl. holidays
present_days       = COUNT(status IN ('present','wfh')) + COUNT(status='half_day') * 0.5
on_leave_days      = COUNT(status='on_leave') [paid leave — no deduction]
half_day_days      = COUNT(status='half_day') [0.5 LOP each]
absent_days        = COUNT(status='absent')
lop_days           = absent_days + (half_day_days * 0.5)
```

**Step 3: Late arrival deduction** (NEW)
```
monthly_late_count  = COUNT(attendance WHERE is_late = true)
exemptions_used     = MIN(monthly_late_count, policy.monthly_late_exemptions)
late_deductions     = MAX(0, monthly_late_count - exemptions_used) × policy.late_deduction_rate × per_day_salary
```

**Step 4: Early exit deduction** (NEW)
```
early_exits = COUNT(attendance WHERE is_early_exit = true AND early_exit_minutes > policy.grace_early_exit)
early_exit_deduction = early_exits × policy.early_exit_deduction_rate × per_day_salary
```

**Step 5: Overtime** (NEW)
```
total_ot_hours     = SUM(attendance.ot_hours) WHERE ot_hours > 0
ot_pay             = total_ot_hours × per_hour_rate × policy.ot_multiplier
```

**Step 6: Gross salary with proration**
```
effective_gross    = (gross_salary / working_days) × (present_days + on_leave_days)
lop_amount         = lop_days × (gross_salary / working_days)
```

**Step 7: Apply deductions**
```
statutory_deductions = pf_employee + esi_employee + professional_tax + tds + lwf
manual_deductions    = SUM(payslip_adjustments WHERE type IN ('penalty','advance','loan'))
total_deductions     = statutory_deductions + lop_amount + late_deductions + early_exit_deduction + manual_deductions
```

**Step 8: Apply additions**
```
bonuses = SUM(payslip_adjustments WHERE type IN ('bonus','arrears'))
net_salary = effective_gross + ot_pay + bonuses - total_deductions
```

**Note on PF proration:** When employee is on LOP, PF should be calculated on the prorated basic (not full basic). This is a regulatory requirement for compliance.

#### Payroll Calendar (Automation)

```
organizations.payroll_cycle_day  = day of month to auto-generate (e.g., 1 = first of next month)
organizations.payroll_auto_enabled = true/false

Cron (daily at 06:00):
  FOR each org WHERE payroll_auto_enabled = true:
    IF today == last_day_of_month OR today.day == payroll_cycle_day:
      GET prior_month = today - 1 month
      IF no payroll_run exists for (org, prior_month.month, prior_month.year):
        CREATE payroll_run (status: draft)
        RUN calculatePayslip for all active employees
        SET payroll_run.status = completed
        NOTIFY root_admin
```

---

### 3.5 Attendance Policy Architecture

**New Config Table:** `attendance_policies`

```sql
CREATE TABLE attendance_policies (
  id                        BIGSERIAL PRIMARY KEY,
  org_id                    BIGINT NOT NULL REFERENCES organizations(id),
  -- Grace
  grace_period_minutes      INTEGER DEFAULT 0,
  -- Late
  late_deduction_enabled    BOOLEAN DEFAULT FALSE,
  late_deduction_rate       NUMERIC DEFAULT 0.0,  -- fraction of per-day salary per late instance
  monthly_late_exemptions   INTEGER DEFAULT 3,    -- free late arrivals per month
  -- Early exit
  early_exit_deduction_enabled BOOLEAN DEFAULT FALSE,
  early_exit_threshold_minutes INTEGER DEFAULT 30,
  -- OT
  ot_enabled                BOOLEAN DEFAULT FALSE,
  ot_threshold_hours        NUMERIC DEFAULT 9.0,  -- work hours to qualify for OT
  ot_multiplier             NUMERIC DEFAULT 1.5,
  -- Half day
  half_day_threshold_hours  NUMERIC DEFAULT 4.5,
  -- LWF
  lwf_enabled               BOOLEAN DEFAULT FALSE,
  lwf_employee_amount       NUMERIC DEFAULT 0,
  lwf_employer_amount       NUMERIC DEFAULT 0,
  -- Weekend rules
  consider_saturday_half    BOOLEAN DEFAULT FALSE,
  -- Proration
  proration_enabled         BOOLEAN DEFAULT TRUE,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id)
);
```

This table feeds directly into the `calculatePayslip()` service function, making all calculation rules configurable per org with no hardcoded logic.

---

## 4. REQUIRED DATABASE CHANGES

### 4.1 New Tables

#### A. `roles`
```sql
CREATE TABLE roles (
  id              BIGSERIAL PRIMARY KEY,
  org_id          BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT DEFAULT '',
  is_system_role  BOOLEAN DEFAULT FALSE,  -- system roles cannot be deleted
  parent_role_id  BIGINT REFERENCES roles(id) ON DELETE SET NULL,  -- for inheritance
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, name)
);
CREATE INDEX idx_roles_org ON roles(org_id);
```

#### B. `permissions`
```sql
CREATE TABLE permissions (
  id          BIGSERIAL PRIMARY KEY,
  module_key  TEXT NOT NULL,   -- 'leaves', 'payroll', 'employees', etc.
  action      TEXT NOT NULL,   -- 'view', 'create', 'edit', 'delete', 'approve', etc.
  description TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(module_key, action)
);
-- Seeded at schema creation — never user-modified
```

#### C. `role_permissions`
```sql
CREATE TABLE role_permissions (
  id            BIGSERIAL PRIMARY KEY,
  role_id       BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);
CREATE INDEX idx_rp_role ON role_permissions(role_id);
```

#### D. `user_roles`
```sql
CREATE TABLE user_roles (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  org_id      BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, role_id, org_id)
);
CREATE INDEX idx_ur_user_org ON user_roles(user_id, org_id);
```

#### E. `leave_approval_log`
```sql
CREATE TABLE leave_approval_log (
  id         BIGSERIAL PRIMARY KEY,
  leave_id   BIGINT NOT NULL REFERENCES leaves(id) ON DELETE CASCADE,
  org_id     BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT,  -- denormalized snapshot in case actor is deleted
  action     TEXT NOT NULL CHECK (action IN ('submitted','forwarded','returned','approved','rejected','cancelled')),
  from_status TEXT,
  to_status   TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lal_leave ON leave_approval_log(leave_id);
CREATE INDEX idx_lal_org_created ON leave_approval_log(org_id, created_at DESC);
```

#### F. `approval_workflows`
```sql
CREATE TABLE approval_workflows (
  id             BIGSERIAL PRIMARY KEY,
  org_id         BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_type  TEXT NOT NULL DEFAULT 'leave',  -- 'leave', 'expense', 'regularization'
  steps          JSONB NOT NULL,  -- [{"actor":"dept_head","action":"forward"},{"actor":"root_admin","action":"approve"}]
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, workflow_type)
);
```

#### G. `payroll_runs`
```sql
CREATE TABLE payroll_runs (
  id               BIGSERIAL PRIMARY KEY,
  org_id           BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month            TEXT NOT NULL,    -- '07' (zero-padded)
  year             INTEGER NOT NULL,
  status           TEXT DEFAULT 'draft' CHECK (status IN ('draft','processing','completed','locked')),
  total_employees  INTEGER DEFAULT 0,
  processed_count  INTEGER DEFAULT 0,
  failed_count     INTEGER DEFAULT 0,
  failed_employee_ids JSONB DEFAULT '[]',
  total_gross      NUMERIC DEFAULT 0,
  total_net        NUMERIC DEFAULT 0,
  total_deductions NUMERIC DEFAULT 0,
  initiated_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  initiated_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  locked_by        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  locked_at        TIMESTAMPTZ,
  notes            TEXT,
  UNIQUE(org_id, month, year)
);
CREATE INDEX idx_pr_org_period ON payroll_runs(org_id, year DESC, month DESC);
```

#### H. `payslip_adjustments`
```sql
CREATE TABLE payslip_adjustments (
  id          BIGSERIAL PRIMARY KEY,
  payslip_id  BIGINT REFERENCES payslips(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id      BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month       TEXT NOT NULL,
  year        INTEGER NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('bonus','penalty','advance','loan_deduction','arrears','lwf','other')),
  amount      NUMERIC NOT NULL,
  description TEXT,
  applied     BOOLEAN DEFAULT FALSE,
  created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_pa_user_period ON payslip_adjustments(user_id, year, month);
CREATE INDEX idx_pa_org ON payslip_adjustments(org_id);
```

#### I. `attendance_policies`
```sql
CREATE TABLE attendance_policies (
  id                           BIGSERIAL PRIMARY KEY,
  org_id                       BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  grace_period_minutes         INTEGER DEFAULT 0,
  late_deduction_enabled       BOOLEAN DEFAULT FALSE,
  late_deduction_rate          NUMERIC DEFAULT 0,
  monthly_late_exemptions      INTEGER DEFAULT 3,
  early_exit_deduction_enabled BOOLEAN DEFAULT FALSE,
  early_exit_threshold_minutes INTEGER DEFAULT 30,
  ot_enabled                   BOOLEAN DEFAULT FALSE,
  ot_threshold_hours           NUMERIC DEFAULT 9.0,
  ot_multiplier                NUMERIC DEFAULT 1.5,
  half_day_threshold_hours     NUMERIC DEFAULT 4.5,
  lwf_enabled                  BOOLEAN DEFAULT FALSE,
  lwf_employee_amount          NUMERIC DEFAULT 0,
  lwf_employer_amount          NUMERIC DEFAULT 0,
  consider_saturday_half       BOOLEAN DEFAULT FALSE,
  proration_enabled            BOOLEAN DEFAULT TRUE,
  created_at                   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id)
);
```

#### J. `onboarding_document_requirements`
```sql
CREATE TABLE onboarding_document_requirements (
  id                BIGSERIAL PRIMARY KEY,
  org_id            BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_category TEXT NOT NULL,  -- 'aadhaar', 'pan', 'bank_details', etc.
  label             TEXT NOT NULL,
  is_mandatory      BOOLEAN DEFAULT TRUE,
  order_index       INTEGER DEFAULT 0,
  active            BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, document_category)
);
```

#### K. `email_log`
```sql
CREATE TABLE email_log (
  id           BIGSERIAL PRIMARY KEY,
  org_id       BIGINT REFERENCES organizations(id) ON DELETE SET NULL,
  to_address   TEXT NOT NULL,
  subject      TEXT NOT NULL,
  template     TEXT,
  status       TEXT DEFAULT 'sent' CHECK (status IN ('sent','failed','queued')),
  error        TEXT,
  reference_id BIGINT,
  reference_type TEXT,
  sent_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_email_log_org ON email_log(org_id, sent_at DESC);
```

### 4.2 Existing Table Modifications

#### `leaves` table additions:
```sql
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS forwarded_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS forwarded_at TIMESTAMPTZ;
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS dept_head_notes TEXT;
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS days NUMERIC GENERATED ALWAYS AS (
  -- computed column if DB supports it, otherwise calculated at insert
) STORED;

-- Update status CHECK constraint:
ALTER TABLE leaves DROP CONSTRAINT IF EXISTS chk_leaves_status;
ALTER TABLE leaves ADD CONSTRAINT chk_leaves_status
  CHECK (status IN ('pending','forwarded','returned','approved','rejected','cancelled'));
```

#### `payslips` table additions:
```sql
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS payroll_run_id BIGINT REFERENCES payroll_runs(id) ON DELETE SET NULL;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS special_allowance NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS overtime_pay NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS late_deduction NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS early_exit_deduction NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS lwf_employee NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS lwf_employer NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS loan_deduction NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS advance_deduction NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS bonus NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS arrears NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS late_count INTEGER DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS ot_hours NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS gross_salary_prorated NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS per_day_salary NUMERIC DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS locked_by BIGINT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

-- Update CHECK constraint to add 'locked' status:
ALTER TABLE payslips DROP CONSTRAINT IF EXISTS chk_payslips_status;
ALTER TABLE payslips ADD CONSTRAINT chk_payslips_status
  CHECK (status IN ('draft','generated','published','locked'));
```

#### `payroll_structures` table additions:
```sql
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS special_allowance NUMERIC DEFAULT 0;
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS lwf_employee NUMERIC DEFAULT 0;
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS lwf_employer NUMERIC DEFAULT 0;
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS label TEXT;  -- e.g., "Junior Developer Grade A"
ALTER TABLE payroll_structures ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
```

#### `organizations` table additions:
```sql
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS payroll_cycle_day INTEGER DEFAULT 1;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS payroll_auto_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS payroll_email_on_publish BOOLEAN DEFAULT TRUE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS leave_approval_mode TEXT DEFAULT '2_step'
  CHECK (leave_approval_mode IN ('1_step','2_step'));
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pre_joining_days INTEGER DEFAULT 7;
```

#### `onboarding_checklists` table additions:
```sql
ALTER TABLE onboarding_checklists ADD COLUMN IF NOT EXISTS required_document_category TEXT;
ALTER TABLE onboarding_checklists ADD COLUMN IF NOT EXISTS document_id BIGINT REFERENCES employee_documents(id) ON DELETE SET NULL;
ALTER TABLE onboarding_checklists ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN DEFAULT FALSE;
```

#### `users` table additions:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS pre_joining_email_sent BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'not_started'
  CHECK (onboarding_status IN ('not_started','in_progress','pending_review','pending_approval','completed'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
```

---

## 5. REQUIRED BACKEND CHANGES

### 5.1 New Files to Create

```
backend/src/
├── services/
│   ├── payrollService.js          ← Pure payroll calculation engine (NO DB writes)
│   ├── leaveWorkflowService.js    ← Leave status machine + notification orchestration
│   ├── onboardingService.js       ← Pre-joining email + reminder orchestration
│   └── permissionService.js       ← RBAC resolution + permission checking
├── middleware/
│   └── permissions.js             ← hasPermission(module, action) middleware factory
├── modules/
│   ├── roles/
│   │   └── roles.routes.js        ← CRUD for roles + role-permission assignment
│   ├── permissions/
│   │   └── permissions.routes.js  ← Read-only list of all available permissions
│   ├── payroll/
│   │   ├── payrollRuns.routes.js  ← Payroll run management (new file)
│   │   └── payrollAdjustments.routes.js ← Bonus/penalty/advance management (new file)
│   └── attendance-policy/
│       └── attendancePolicy.routes.js ← GET/PUT attendance policy per org
```

### 5.2 Modified Files

#### `middleware/auth.js`
**Change:** Add `resolvePermissions(userId, orgId)` function and `hasPermission(module, action)` middleware factory.
**Impact:** All existing middleware functions remain unchanged. New function added alongside.

#### `utils/cronJobs.js`
**Change:** Add 4 new cron tasks:
- `runPayrollAutoGeneration()` — daily at 06:00, checks orgs with auto payroll enabled
- `runOnboardingNotifications()` — daily at 08:30, checks pre-joining employees
- `runLeaveEscalation()` — daily at 09:00, checks leaves pending > N days
- `runBiometricRetry()` — every 2 hours, reprocesses unmatched biometric logs
**Impact:** Must migrate from `setTimeout` to `node-cron` for reliability.

#### `services/emailService.js`
**Change:**
- Make `getTransporter(orgId)` async — fetch org SMTP config from DB, fall back to env
- Add 6 new templates: pre-joining, onboarding reminder, leave forwarded, payslip published, payroll run complete, dept head notification
- Add `logEmail(orgId, to, subject, status, error)` after each send attempt
**Impact:** Existing `sendMail()` signature unchanged. All call sites unaffected.

#### `modules/payroll/payroll.routes.js`
**Change:**
- Extract calculation logic into `payrollService.js`
- Add `POST /payslips/preview` — calls service, returns without saving
- Add `POST /runs/initiate`, `POST /runs/:id/generate-all`, `POST /runs/:id/lock`, `GET /runs`, `GET /runs/:id`
- Add `POST /adjustments`, `GET /adjustments`, `DELETE /adjustments/:id`
- Modify `POST /payslips/generate` to use `payrollService.calculatePayslip()`
**Impact:** Existing generate endpoint behavior preserved. New fields added to payslip output.

#### `modules/leaves/leaves.routes.js`
**Change:**
- Add `PUT /:id/forward` — Dept Head only
- Add `PUT /:id/return` — Dept Head only (send back to employee)
- Modify `POST /` — after insert, identify dept head and send targeted notification (not all admins)
- Modify `PUT /:id/approve` — validate caller is Root Admin (or has approve permission in 1-step mode)
- All status changes must append to `leave_approval_log`
**Impact:** Existing approve/reject endpoints have access control tightened. `adminOnly` replaced with `hasPermission`.

#### `modules/attendance/attendance.routes.js`
**Change:**
- `POST /checkin` — apply grace period from `attendance_policies` before setting `is_late`
- `POST /checkout` — calculate `ot_hours` from `attendance_policies.ot_threshold_hours`
**Impact:** Minimal — `is_late` and `ot_hours` calculation logic only.

#### `modules/onboarding/onboarding.routes.js`
**Change:**
- `POST /init/:userId` — also send pre-joining email if `date_of_joining` is within `pre_joining_days`
- Add `POST /:taskId/upload-document` — upload document linked to checklist task
- Add `PUT /:taskId/verify-document` — HR marks document as verified
**Impact:** New endpoints added. Existing endpoints unchanged.

#### `modules/biometric/biometricPush.handler.js`
**Change:**
- After SN validation, check `device.ip_whitelist_enabled`. If true, validate `req.ip` against `device.allowed_ips[]`.
- If check-in, calculate `is_late` and `late_minutes` using `attendance_policies.grace_period_minutes`
**Impact:** Security hardening for existing handler. Existing flow unchanged for non-whitelisted devices.

#### `server.js`
**Change:**
- Mount new routers: `roles`, `permissions`, `payroll-runs`, `payroll-adjustments`, `attendance-policy`
- Add `node-cron` or `node-schedule` import
- Register new cron tasks
**Impact:** Additive only. No existing route paths change.

### 5.3 API Endpoint Summary (New)

| Method | Path | Description |
|---|---|---|
| GET | `/api/roles` | List roles for org |
| POST | `/api/roles` | Create custom role |
| PUT | `/api/roles/:id` | Update role name/description |
| DELETE | `/api/roles/:id` | Delete custom role |
| GET | `/api/roles/:id/permissions` | Get permissions for role |
| PUT | `/api/roles/:id/permissions` | Set permissions for role (array replace) |
| GET | `/api/permissions` | List all available permissions |
| POST | `/api/roles/:id/assign` | Assign user to role |
| DELETE | `/api/roles/:id/users/:userId` | Remove user from role |
| PUT | `/api/leaves/:id/forward` | Dept Head forwards leave |
| PUT | `/api/leaves/:id/return` | Dept Head returns to employee |
| GET | `/api/leaves/:id/history` | Approval log for a leave |
| GET | `/api/payroll/runs` | List payroll runs |
| POST | `/api/payroll/runs/initiate` | Start new payroll run |
| GET | `/api/payroll/runs/:id` | Get run status + stats |
| POST | `/api/payroll/runs/:id/generate-all` | Bulk generate payslips |
| POST | `/api/payroll/runs/:id/lock` | Lock payroll run |
| POST | `/api/payroll/runs/:id/unlock` | Emergency unlock (root admin only) |
| GET | `/api/payroll/payslips/preview` | Preview payslip without saving |
| GET | `/api/payroll/adjustments` | List adjustments for user/month |
| POST | `/api/payroll/adjustments` | Add bonus/penalty/advance |
| DELETE | `/api/payroll/adjustments/:id` | Remove unapplied adjustment |
| GET | `/api/attendance-policy` | Get org's attendance policy |
| PUT | `/api/attendance-policy` | Update org's attendance policy |
| GET | `/api/reports/payroll` | Payroll summary report |
| GET | `/api/reports/departments` | Department report |

---

## 6. REQUIRED FRONTEND CHANGES

### 6.1 New Pages

| Page | Route | Role |
|---|---|---|
| Role Management | `/root/roles` | Root Admin |
| Permission Matrix | `/root/roles/:id/permissions` | Root Admin |
| Payroll Runs | `/payroll/runs` | Root Admin |
| Payroll Preview | `/payroll/runs/:id/preview` | Root Admin |
| Payroll Adjustments | `/payroll/adjustments` | Root Admin / HR Admin |
| Attendance Policy Settings | `/settings/attendance-policy` | Root Admin |
| Leave Approval History | Modal inside Leaves page | All |
| Dept Head Dashboard | `/portal/my-team` | Department Head (via role) |
| Document Review | `/onboarding/documents` | HR Admin |

### 6.2 Modified Pages

#### `Payroll.jsx`
- Add Payroll Runs tab alongside existing Structures and Payslips tabs
- Add preview modal before generating payslips
- Add lock/unlock button on published payslips
- Show payroll run status (X/Y employees processed)
- Add adjustments panel (bonus, penalty, advance per employee)

#### `Leaves.jsx` (Admin view)
- Add approval stage indicator (pending → forwarded → approved)
- Add forward button visible only to Department Heads
- Show `leave_approval_log` timeline in leave detail modal
- Filter: "Pending My Action" (smart filter based on user's role)

#### `MyLeaves.jsx` (Employee portal)
- Show current approval stage for pending leaves
- Show dept head notes if returned
- Real-time stage indicator

#### `PendingApprovals.jsx`
- Split into two tabs: "My Department" (Dept Head actions) + "All Pending" (Root Admin)
- Add escalation indicator (pending > N days shown in red)

#### `Onboarding.jsx`
- Add document upload section per task
- Show document verification status per document
- Progress bar by document category

#### `OrgSettings.jsx`
- Add Leave Workflow section (1-step vs 2-step)
- Add Payroll Settings (auto-gen day, email on publish)
- Add Pre-joining Email settings (N days before joining)

#### `Settings.jsx`
- Add Attendance Policy section (grace period, OT, late deduction config)

#### `Sidebar.jsx`
- Make sidebar items dynamic based on user permissions (not hardcoded role checks)
- Add "My Team" item for Department Heads

### 6.3 New Context / Hooks

#### `PermissionContext.jsx` (new)
```javascript
// Provides: usePermission('module', 'action') → boolean
// Loaded from JWT claims or API on login
// Replaces: useAuth().isAdmin checks throughout
```

#### `usePayrollRun.js` (new)
```javascript
// Manages payroll run state, polling for progress during bulk generation
```

### 6.4 Auth Context Changes

`AuthContext.jsx` must expose `permissions` array extracted from JWT:
```javascript
const { user, permissions, hasPermission } = useAuth();
```

All current `isAdmin` and `isRootAdmin` usages must be replaced with `hasPermission()` calls over time.

---

## 7. MIGRATION STRATEGY

### Guiding Principles

1. **Zero downtime** — all changes are additive. No column drops. No renames.
2. **Backward compatible** — existing clients continue working during migration.
3. **Transaction-wrapped** — each migration file runs in a single transaction. Any failure rolls back the entire file.
4. **Idempotent** — every statement uses `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`. Safe to re-run.
5. **Versioned** — every migration inserts into `schema_migrations` with a version key.

### Migration Files (in order)

| Order | File | Contents |
|---|---|---|
| 1 | `phase1_01_rbac_tables.sql` | `roles`, `permissions`, `role_permissions`, `user_roles` tables + seed permissions |
| 2 | `phase1_02_seed_system_roles.sql` | Seed system roles for all active orgs |
| 3 | `phase1_03_leave_workflow.sql` | `leave_approval_log`, `approval_workflows`, add `forwarded_by/at/dept_head_notes` to leaves, update `chk_leaves_status` |
| 4 | `phase1_04_payroll_engine.sql` | `payroll_runs`, `payslip_adjustments`, `attendance_policies`, `payroll_structures` additions, `payslips` additions |
| 5 | `phase1_05_onboarding_docs.sql` | `onboarding_document_requirements`, `email_log`, `users` additions for onboarding status |
| 6 | `phase1_06_org_config.sql` | `organizations` additions (payroll_cycle_day, leave_approval_mode, etc.) |
| 7 | `phase1_07_seed_attendance_policies.sql` | Insert default attendance policy for every active org |
| 8 | `phase1_08_seed_approval_workflows.sql` | Insert default 2-step workflow for every active org |

### Critical Pre-Migration Check for `leaves.status`

Before running migration 3, verify no live rows have non-standard status:
```sql
SELECT status, COUNT(*) FROM leaves WHERE status NOT IN ('pending','approved','rejected','cancelled') GROUP BY status;
-- Expected: 0 rows
```

If 0 rows, the CHECK constraint update is safe. If non-zero, investigate before proceeding.

### Rollback Plan Per Migration

Each migration file should have a paired rollback file:
```
phase1_03_leave_workflow.sql         ← applies migration
phase1_03_leave_workflow_rollback.sql ← reverses all DDL
```

Rollback example for migration 3:
```sql
-- Removes forwarded_by, forwarded_at, dept_head_notes
ALTER TABLE leaves DROP COLUMN IF EXISTS forwarded_by;
ALTER TABLE leaves DROP COLUMN IF EXISTS forwarded_at;
ALTER TABLE leaves DROP COLUMN IF EXISTS dept_head_notes;
-- Restore original CHECK
ALTER TABLE leaves DROP CONSTRAINT IF EXISTS chk_leaves_status;
ALTER TABLE leaves ADD CONSTRAINT chk_leaves_status CHECK (status IN ('pending','approved','rejected','cancelled'));
-- Drop new tables
DROP TABLE IF EXISTS leave_approval_log;
DROP TABLE IF EXISTS approval_workflows;
```

---

## 8. IMPLEMENTATION ORDER

### Week 1 — Foundation & Configuration (Zero Risk)

**Goal:** Create all new tables without touching any existing routes.

**Tasks:**
1. Run migration `phase1_01` through `phase1_08` on staging
2. Create `payrollService.js` (pure function — no DB, no HTTP)
3. Create `attendancePolicy.routes.js` — GET/PUT attendance policy
4. Create `permissionService.js` — permission resolution logic
5. Create `permissions.routes.js` — read-only permissions list
6. Add `node-cron` dependency to `package.json`
7. Test all migrations on staging. Verify no production data affected.

**Risk:** Low. No existing routes modified.

### Week 2 — Payroll Engine (Highest Priority)

**Goal:** Replace inline calculation with service, add preview, add adjustments.

**Tasks:**
1. Move calculation logic from `payroll.routes.js` into `payrollService.js`
2. `POST /api/payroll/payslips/preview` — no DB write
3. `POST /api/payroll/payslips/generate` — now calls service function
4. `POST/GET/DELETE /api/payroll/adjustments` — bonus/penalty/advance management
5. Payroll Adjustments UI in `Payroll.jsx`
6. Payroll Preview modal in `Payroll.jsx`

**Testing:** Generate payslips for 5 test employees. Compare output to current calculation. Values must match exactly (no regression).

**Risk:** Medium. Core payroll route is modified. Must be tested with current production data shapes.

### Week 3 — Payroll Runs & Automation

**Goal:** Add bulk generation, payroll runs, auto-scheduling.

**Tasks:**
1. `payrollRuns.routes.js` — initiate, generate-all, lock, unlock
2. Payroll cron in `cronJobs.js`
3. Payroll run UI tab in `Payroll.jsx`
4. Email on payslip published

**Risk:** Medium. New cron must be tested for idempotency. Advisory lock must be verified under concurrent load.

### Week 4 — Leave Approval Workflow

**Goal:** 2-step leave approval with Dept Head + audit log.

**Tasks:**
1. Update `chk_leaves_status` to include `forwarded` and `returned`
2. `PUT /api/leaves/:id/forward` route
3. `PUT /api/leaves/:id/return` route
4. Modify leave create to notify Dept Head
5. Modify leave approve to restrict to Root Admin (in 2-step mode)
6. `leave_approval_log` inserts at every status change
7. Leave history endpoint
8. Leaves UI — approval stage indicator
9. PendingApprovals.jsx — two tabs
10. Email templates for new stages

**Risk:** Medium-High. Existing approve route access control is tightened. Must not break existing data.

### Week 5 — RBAC (Roles & Permissions)

**Goal:** Custom roles with permission assignment. No hardcoded checks.

**Tasks:**
1. Seed system roles and permissions
2. `roles.routes.js` — CRUD
3. `hasPermission()` middleware
4. Replace `adminOnly()` in payroll routes (already handled in week 2–3)
5. Replace `adminOnly()` in leave routes (handled in week 4)
6. Replace `adminOnly()` in all remaining routes
7. Role management UI
8. Permission matrix UI
9. Dynamic sidebar

**Risk:** Very High. This touches every route. Must be done last so payroll and leaves are already migrated to `hasPermission()`.

### Week 6 — Onboarding & Cleanup

**Goal:** Pre-joining emails, document upload workflow, reminders.

**Tasks:**
1. Pre-joining email cron
2. Onboarding document requirement config
3. Document upload linked to checklist tasks
4. HR document review workflow
5. Biometric IP whitelist enforcement
6. Biometric retry cron
7. Reports: payroll, departments

---

## 9. DEPENDENCIES

### Package Dependencies to Add

| Package | Purpose | Version |
|---|---|---|
| `node-cron` | Reliable cron scheduling (replaces setTimeout-based scheduler) | ^3.0.0 |
| `puppeteer` or `pdf-lib` | PDF payslip generation | TBD |
| `xlsx` | Excel export for reports | ^0.18.0 |

### Internal Dependencies

| New Feature | Depends On |
|---|---|
| Payroll Engine (service) | `attendance_policies` table must exist |
| Payroll Runs | `payroll_runs` table, `payrollService.js` |
| Leave Workflow | `leave_approval_log`, updated `chk_leaves_status` |
| RBAC Middleware | `roles`, `permissions`, `role_permissions`, `user_roles` tables |
| Dept Head Routing | `departments.head_user_id` (already exists), RBAC for Dept Head identification |
| Onboarding Docs | `onboarding_document_requirements`, `email_log` |
| Per-org SMTP | `emailService.js` async refactor |

### Execution Order Constraint

```
Migrations must run before backend code
payrollService.js must be complete before payrollRuns.routes.js
hasPermission() middleware must be complete before replacing adminOnly() in any route
leaves status constraint must be updated before forward/return routes are deployed
```

---

## 10. ESTIMATED COMPLEXITY

| Feature | Lines of New Code | Lines Modified | Estimated Dev Days |
|---|---|---|---|
| DB Migrations (all 8 files) | ~800 SQL | 0 | 3 days |
| payrollService.js | ~400 JS | 0 | 3 days |
| Payroll routes enhancement | ~200 new | ~150 modified | 2 days |
| Payroll run management | ~300 new | 0 | 2 days |
| Payroll UI (Payroll.jsx) | ~400 JSX | ~200 modified | 2 days |
| Leave approval workflow backend | ~300 new | ~200 modified | 2.5 days |
| Leave approval workflow frontend | ~300 JSX new | ~200 modified | 1.5 days |
| RBAC tables + seeding | ~200 SQL | 0 | 1 day |
| permissionService.js | ~150 JS | 0 | 1 day |
| hasPermission() middleware | ~50 JS | 0 | 0.5 days |
| Replace adminOnly() in all routes | 0 new | ~200 modified (30 files) | 3 days |
| Role Management UI | ~500 JSX | 0 | 3 days |
| Permission Matrix UI | ~300 JSX | 0 | 2 days |
| Cron jobs (4 new) | ~300 JS | ~50 modified | 2 days |
| Email templates (6 new) | ~400 JS | ~50 modified | 1 day |
| Onboarding docs backend | ~200 new | ~100 modified | 1.5 days |
| Onboarding docs frontend | ~300 JSX | ~150 modified | 1.5 days |
| Attendance policy | ~150 new | ~100 modified | 1 day |
| Biometric IP whitelist + retry | ~100 new | ~50 modified | 1 day |
| Reports (payroll + dept) | ~200 new | 0 | 1 day |
| **TOTAL** | **~5,550** | **~1,650** | **~37 dev days** |

**Calendar time at 1 developer:** 7–8 weeks  
**Calendar time at 2 developers:** 4–5 weeks

---

## 11. RISKS & ROLLBACK PLANS

### Risk 1 — Leave Status Constraint Update
**Risk:** If any row has a non-standard status before migration, the new CHECK constraint fails  
**Likelihood:** Low (production hardening already enforced valid statuses)  
**Impact:** Medium — migration blocks  
**Rollback:** Re-run original constraint: `ALTER TABLE leaves ADD CONSTRAINT chk_leaves_status CHECK (status IN ('pending','approved','rejected','cancelled'))`  
**Mitigation:** Run pre-check query before deploying migration. Only proceed if COUNT = 0.

### Risk 2 — Payroll Calculation Regression
**Risk:** Moving calculation to a service function might change rounding or edge case behavior  
**Likelihood:** Low-Medium  
**Impact:** High — incorrect payslips generated  
**Rollback:** Keep old route handler code commented out for 2 weeks. If values diverge, revert to inline logic.  
**Mitigation:** Run service function against last 3 months of existing payslips. Compare output exactly. Zero tolerance for differences.

### Risk 3 — RBAC Breaking Existing Access
**Risk:** Replacing `adminOnly()` with `hasPermission()` could lock out admins if seeding fails  
**Likelihood:** Medium  
**Impact:** Very High — system lockout  
**Rollback:** Each route file change can be reverted independently. Revert `adminOnly()` for the affected route.  
**Mitigation:** Seed system roles immediately when org is created. Validate that every active user has at least one role before deploying RBAC changes. Keep `adminOnly()` in routes until seed verification is complete.

### Risk 4 — Dept Head Identification Failure
**Risk:** Employee's `department_id` is NULL — no dept head can be identified — leave gets stuck  
**Likelihood:** Medium (some employees may not have `department_id` set)  
**Impact:** Medium — leave approval flow broken for those employees  
**Rollback:** Add fallback: if no dept head found, skip dept head step and go directly to Root Admin  
**Mitigation:** In 2-step mode, if `users.department_id` is NULL or `departments.head_user_id` is NULL, treat as 1-step (go directly to Root Admin). Always log which path was taken.

### Risk 5 — Payroll Auto-Generation on Restart
**Risk:** If server restarts on payroll day, cron may trigger twice (or not at all)  
**Likelihood:** Low (with `node-cron`)  
**Impact:** Medium — duplicate payslips generated  
**Rollback:** `UNIQUE(org_id, month, year)` on `payroll_runs` prevents duplicate runs  
**Mitigation:** Use `node-cron` (not setTimeout). Check if run already exists before creating. Use `ON CONFLICT DO NOTHING` on run insertion.

### Risk 6 — JWT Token Staleness After Permission Change
**Risk:** User's JWT has old permissions (e.g., was HR Admin, demoted to Employee). Old token valid for 7 days.  
**Likelihood:** Medium (permissions change infrequently)  
**Impact:** Low-Medium — security exposure for up to 7 days  
**Rollback:** N/A — architectural decision  
**Mitigation:** Add a `permissions_version` timestamp to JWT. On each request, check if user's `role_updated_at` in DB is newer than `permissions_version`. If newer, return 401 with `token_expired` error. Client re-authenticates.

---

## 12. TESTING PLAN

### Unit Tests

| Component | What to Test |
|---|---|
| `payrollService.calculatePayslip()` | All attendance combinations: all present, all absent, mix, half days, on_leave, OT, late |
| `payrollService.calculatePayslip()` | LOP proration: PF/ESI on prorated basic vs full basic |
| `payrollService.calculatePayslip()` | Grace period: check-in within grace = not late |
| `permissionService.resolvePermissions()` | User with multiple roles gets union of all permissions |
| `permissionService.resolvePermissions()` | User with no roles gets empty permissions |
| Leave status machine | All valid transitions: pending→forwarded, forwarded→approved, pending→cancelled |
| Leave status machine | All invalid transitions: approved→pending rejected, forwarded→forwarded |

### Integration Tests

| Test | Scenario |
|---|---|
| Payroll generation regression | Run new `calculatePayslip()` against last 3 months historical data. Compare to existing payslips. |
| Leave 2-step flow | Employee submits → Dept Head forwards → Root Admin approves → Verify attendance records |
| Leave 1-step fallback | Employee with no dept head → leaf goes directly to Root Admin |
| Payroll run: bulk generation | Generate for 50 employees. Verify processed_count = 50, total_gross correct. |
| Payroll run: concurrent generation | Two admins trigger generate-all simultaneously. Verify no duplicate payslips via advisory lock. |
| Payroll lock | Generate → Lock → Attempt regenerate → Verify 409 even with force=true |
| RBAC: permission enforcement | User with only `leaves.view` permission attempts to approve leave → 403 |
| RBAC: permission inheritance | Custom role with parent role inherits parent permissions |
| Biometric IP whitelist | POST to /iclock/cdata from unauthorized IP → ignored |

### Regression Tests (Critical)

After every release, verify these existing workflows are intact:

1. Employee check-in / check-out
2. Leave application (happy path)
3. Leave approval (existing `adminOnly` path must still work during RBAC transition)
4. Payslip generation (manual, single employee)
5. Employee creation + welcome email
6. Biometric punch processing
7. Daily notification cron
8. Password reset flow

### Load Testing

| Scenario | Target |
|---|---|
| Payroll bulk generation (1 org, 100 employees) | < 30 seconds |
| Payroll bulk generation (5 orgs, 500 employees total) | < 3 minutes |
| Concurrent leave applications (50 simultaneous) | No data corruption |
| Permission resolution per request | < 5ms added latency |

---

## 13. FUTURE IMPROVEMENTS

These items are OUT OF SCOPE for Phase 1 but should be tracked:

1. **Real-time permission invalidation** — Token blacklist (Redis) when user's role changes. Currently: 7-day JWT stale period.

2. **PDF payslip generation** — `pdf_url` column exists but empty. Needs Puppeteer or `pdf-lib` integration. Payslip HTML template → PDF on generation.

3. **Multi-currency payroll** — All amounts currently INR. No currency column. Enterprise clients with overseas employees will need this.

4. **Salary advance loan tracking** — `payslip_adjustments.type = 'loan_deduction'` is designed but the loan ledger (balance, installments, closure) is not modeled.

5. **Leave carry-forward automation** — `leave_policies.carry_forward` and `max_carry_forward` fields exist but no year-end carry-forward cron is implemented.

6. **Shift-based attendance policy** — Currently one org-wide attendance policy. Employees on night shift need different grace periods and OT thresholds than day shift employees.

7. **Payroll compliance reports** — PF ECR (Electronic Challan cum Return), ESI challan, PT returns. These are statutory employer obligations in India and will be required by enterprise clients.

8. **Mobile app support** — Current PWA has basic push notifications. A dedicated mobile app (React Native) for biometric-integrated attendance and leave management is a logical next step.

9. **Data archiving** — `attendance` and `leaves` tables will grow indefinitely. A partition strategy (by year) or cold archiving to S3 will be needed beyond 2 years of data.

10. **White-label email** — Each org should be able to brand their email templates with their own logo and color scheme. Currently all emails use the Lumos Logic purple gradient.

---

*This document is the complete architectural blueprint for Phase 1. No code should be written until this document has been reviewed and approved.*

*Last Updated: 2026-07-30*
