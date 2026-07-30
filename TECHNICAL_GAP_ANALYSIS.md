# HRMS Technical Gap Analysis
**Version 1.0 — Lumos Logic HRMS**
**Date: 2026-07-30**
**Classification: Internal — Architecture Review**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current System Overview](#2-current-system-overview)
3. [Client Requirement Mapping](#3-client-requirement-mapping)
   - 3.1 [Root Admin Capabilities](#31-root-admin-capabilities)
   - 3.2 [Role & Permission Management](#32-role--permission-management)
   - 3.3 [Leave Workflow](#33-leave-workflow)
   - 3.4 [Payroll Calculation Requirements](#34-payroll-calculation-requirements)
   - 3.5 [Automated Payroll](#35-automated-payroll)
   - 3.6 [Onboarding](#36-onboarding)
   - 3.7 [Email Architecture](#37-email-architecture)
   - 3.8 [Biometric](#38-biometric)
4. [Feature Comparison Matrix](#4-feature-comparison-matrix)
5. [Missing Feature List](#5-missing-feature-list)
6. [Business Rule Gaps](#6-business-rule-gaps)
7. [Technical Gaps](#7-technical-gaps)
8. [Security Gaps](#8-security-gaps)
9. [Performance Gaps](#9-performance-gaps)
10. [UI/UX Gaps](#10-uiux-gaps)
11. [Multi-Tenant Readiness Review](#11-multi-tenant-readiness-review)
12. [Payroll Readiness Review](#12-payroll-readiness-review)
13. [Leave Workflow Review](#13-leave-workflow-review)
14. [Email Architecture Review](#14-email-architecture-review)
15. [Biometric Review](#15-biometric-review)
16. [Risk Assessment](#16-risk-assessment)
17. [Prioritized Implementation Roadmap](#17-prioritized-implementation-roadmap)

---

## 1. Executive Summary

The Lumos Logic HRMS is a multi-tenant SaaS platform built on Express.js + PostgreSQL with a React SPA frontend. Seven development phases have produced a production-grade foundation covering leave management, payroll calculation, biometric attendance, RBAC, onboarding, and statutory compliance configuration.

The audit against client requirements reveals **the foundation is architecturally sound** but has **14 significant gaps**, **9 security gaps**, and **23 business-rule edge cases** that must be addressed before the platform can be considered enterprise-ready.

### Critical Blockers (must fix before production use)

| # | Blocker |
|---|---------|
| 1 | Per-org SMTP remains; client requires centralized SMTP |
| 2 | `adminOnly()` hardcoded role checks coexist with RBAC — permission model is inconsistent |
| 3 | Biometric devices have no IP whitelist or device-level authentication |
| 4 | Sandwich leave, compensatory off, and missing punch logic are entirely absent from the payroll engine |
| 5 | Leave workflow allows Dept Head to reject — client requirement explicitly prohibits this |

---

## 2. Current System Overview

| Layer | Technology | Status |
|---|---|---|
| Backend runtime | Node.js + Express 4.18 | Production |
| Database | PostgreSQL via Supabase (pg pool) | Production |
| Auth | JWT (7-day), bcrypt, TOTP/2FA | Production |
| File storage | Cloudinary | Production |
| Email | Nodemailer + Gmail SMTP (env-configured) | **Needs architectural change** |
| Web push | web-push VAPID | Production |
| Biometric | ZKTeco ADMS protocol | Partial |
| RBAC | Dual-layer (legacy `adminOnly` + new `hasPermission`) | **Incomplete migration** |
| Frontend | React 18 + Vite + TanStack Query | Production |
| Scheduler | Node.js setInterval (hourly tick per org) | Production |

### Backend Modules (35+)

`auth` · `leaves` · `attendance` · `payroll` · `employees` · `departments` · `shifts` · `holidays` · `onboarding` · `biometric` · `documents` · `assets` · `expenses` · `announcements` · `performance` · `exit` · `regularization` · `roles` · `permissions` · `employee-profile` (13 sub-modules) · `platform` · `root` · `org` · `reports` · `analytics` · `branches` · `notifications` · `push` · `calendar` · `archives` · `settings` · `designations` · `leave-policies` · `statutory`

### Database Tables (43 core tables across 40 SQL migrations — Phases 1–3.7)

`organizations` · `users` · `departments` · `designations` · `user_departments` · `work_schedule` · `attendance` · `attendance_regularization` · `leaves` · `leave_policies` · `leave_approval_log` · `shifts` · `shift_assignments` · `holidays` · `events` · `notifications` · `notifications_log` · `push_subscriptions` · `announcements` · `expenses` · `assets` · `payroll_structures` · `employee_salary_structures` · `payslips` · `payroll_runs` · `payroll_run_employees` · `payroll_settings` · `payroll_audit_log` · `payroll_scheduler_runs` · `payroll_email_log` · `payroll_adjustments` · `payroll_attendance_overrides` · `performance_goals` · `performance_reviews` · `onboarding_checklists` · `roles` · `permissions` · `role_permissions` · `user_roles` · `biometric_devices` · `biometric_raw_logs` · `biometric_employee_map` · `login_history` · `branches` · `platform_admins` · `org_registration_requests` · `schema_migrations` + all `statutory_*` tables (Phase 3.7)

---

## 3. Client Requirement Mapping

### 3.1 Root Admin Capabilities

| Requirement | Current Implementation | Files | Status |
|---|---|---|---|
| Create / Edit / Delete Roles | Full CRUD at `GET/POST/PUT/DELETE /api/roles` | `roles.routes.js` | ✅ Fully Implemented |
| Create / Assign Permissions | Permission matrix UI, `role_permissions` junction table | `permissions.routes.js`, `PermissionMatrix.jsx` | ✅ Fully Implemented |
| Assign Roles to Users | `user_roles` table, API at `/api/roles/:id/users` | `roles.routes.js` | ✅ Fully Implemented |
| Control every module | Controlled via permissions BUT many routes still use `adminOnly()` | 34 files with hardcoded role checks | 🟡 Partially Implemented |
| Configure org-level settings | Payroll settings, work schedule, leave policies, holidays | `settings.routes.js`, `payroll.routes.js` | ✅ Fully Implemented |
| Configure payroll schedule | Per-org generation day/time/timezone in `payroll_settings` | `PayrollSettings.jsx`, scheduler | ✅ Fully Implemented |
| Configure attendance rules | Grace minutes, late thresholds, weekend policy, shifts | `settings.routes.js`, `payroll_settings` | ✅ Fully Implemented |
| Configure leave workflow | Leave types, policies, paid/unpaid flags exist. Workflow steps not configurable | `leavePolicies.routes.js` | 🟡 Partially Implemented |
| Configure notifications | Broadcast exists; individual module notification preferences missing | `notifications.routes.js` | 🟡 Partially Implemented |
| Centralized platform settings | `platform.routes.js`, maintenance mode, org approval | `platform.routes.js` | ✅ Fully Implemented |

---

### 3.2 Role & Permission Management

| Requirement | Current Implementation | Files | Status |
|---|---|---|---|
| Completely dynamic permissions | RBAC tables exist and `hasPermission()` works correctly — but 34 legacy `adminOnly()` calls bypass the system | `auth.js` middleware | 🟡 Partially Implemented |
| No hardcoded role checks where RBAC should exist | 34 files use `adminOnly` / `rootAdminOnly` directly. These are **not** checked against the permission matrix | `leaves.routes.js` (lines 239, 450), `attendance.routes.js` (176, 181, 194), `payroll.routes.js`, `onboarding.routes.js`, `biometric.routes.js` + all others | ❌ Missing |

---

### 3.3 Leave Workflow

| Requirement | Current Implementation | Files | Status |
|---|---|---|---|
| Each dept has ONE dept head | `departments.head_user_id` FK | `departments` table | ✅ Fully Implemented |
| Employee submits leave | `POST /api/leaves` with automatic routing | `leaves.routes.js` | ✅ Fully Implemented |
| Dept head reviews | `GET /api/leaves/pending-department` | `leaves.routes.js` line 640 | ✅ Fully Implemented |
| **Dept head CAN ONLY APPROVE (not reject)** | **Code allows dept head to reject.** Route `POST /:id/department-approve` has no enforcement blocking rejection. `root_admin_status` can be set to `'rejected'` by a dept head actor | `leaves.routes.js` line 677 — no restriction on rejection payload | ❌ **Critical Gap** |
| Root admin receives and decides | `GET /api/leaves/pending-root`, `POST /:id/final-approve` | `leaves.routes.js` | ✅ Fully Implemented |
| Employee notification on outcome | Email sent on status change | `emailService.js` templates | ✅ Fully Implemented |
| Audit history preserved | `leave_approval_log` table immutable | `leave_approval_log` | ✅ Fully Implemented |

---

### 3.4 Payroll Calculation Requirements

| Required Input | Engine Supports | Method | Status |
|---|---|---|---|
| Salary Structure | Yes | `employee_salary_structures` versioned table | ✅ |
| Attendance | Yes | Daily classification per `attendance` table | ✅ |
| Working Hours | Yes | `work_hours` from check-in/check-out diff | ✅ |
| Check-in / Check-out | Yes | `attendance.check_in`, `check_out` | ✅ |
| Shift timing | Partial | `work_schedule` used; individual `shift_assignments` not wired to engine | 🟡 |
| Grace Minutes | Yes | `settings.grace_minutes` configurable | ✅ |
| Late Marks | Yes | Late count calculated; penalty applied | ✅ |
| Half Day | Yes | 0.5 day deduction for half-day status | ✅ |
| Missing Punch | No | Treated as absent; no auto-detection or workflow | ❌ |
| Early Exit | Partial | `early_exit_threshold` tracked but NOT deducted in net pay | 🟡 |
| Weekly Off | Yes | `weekend_policy`: sat_sun, sun_only, alternate_sat, none | ✅ |
| Holidays | Yes | Org holidays fetched; `count_holidays_as_paid` configurable | ✅ |
| Paid Leave | Yes | Approved leaves with `paid=true` not deducted | ✅ |
| Unpaid Leave | Yes | Unpaid leaves = LOP | ✅ |
| Sandwich Leave | No | No logic: holidays between unpaid leave days are not auto-converted to LOP | ❌ |
| Comp Off | No | No comp-off leave type or accrual mechanism | ❌ |
| LOP | Yes | Calculated as: absent + excess-late-converted half days + unpaid leave | ✅ |
| Salary Revision | Yes | Versioned `effective_from`/`effective_to` on salary structure | ✅ |
| Bonus | Partial | Adjustments panel (Phase 3.6); not part of payslip formula directly | 🟡 |
| Incentives | Partial | Via adjustments (INCENTIVE category); not formula-driven | 🟡 |
| Reimbursement | Partial | Via adjustments (REIMBURSEMENT); separate from payslip gross | 🟡 |
| Overtime | No | No overtime tracking or pay calculation | ❌ |
| Variable Pay | No | No variable component in salary structure; only fixed allowances | ❌ |
| PF | Yes | Phase 3.7 statutory config with 12%/3.67%/8.33% rates, wage ceiling | ✅ |
| ESI | Partial | Config exists (Phase 3.7); wage eligibility limit implemented; mid-year crossing not handled | 🟡 |
| Professional Tax | Yes | State-wise slabs seeded (10 Indian states) | ✅ |
| TDS | Partial | Calculation engine built (Phase 3.7); declaration workflow exists; Form 16 dataset exportable | 🟡 |
| Employer Contributions | Yes | Employer PF, ESI stored on payslip | ✅ |
| Employee Deductions | Yes | PF, ESI, PT, TDS, LOP, other deductions all tracked | ✅ |

---

### 3.5 Automated Payroll

| Requirement | Current Implementation | Status |
|---|---|---|
| Configurable generation day | `payroll_generation_day` (1–28, LAST_DAY, LAST_WORKING_DAY) | ✅ |
| Configurable generation time | `payroll_generation_time` (HH:MM) | ✅ |
| Configurable publish day/time | `payroll_publish_day`, `payroll_publish_time` | ✅ |
| Salary payout day configuration | `payroll_payout_day`, `payroll_payout_time` (informational) | ✅ |
| Per-org timezone | IANA timezone field; `nowIn(tz)` function used in scheduler | ✅ |
| Different orgs have different schedules | Scheduler iterates all orgs independently each tick | ✅ |

---

### 3.6 Onboarding

| Requirement | Current Implementation | Status |
|---|---|---|
| Auto email on employee join | `welcomeEmployeeHtml()` sent when account created | ✅ |
| Employee uploads documents | Onboarding checklist exists; document upload task listed but no dedicated upload endpoint in onboarding module | 🟡 |
| HR verifies documents | Mark-complete task exists; no formal "verified" status with document link | 🟡 |
| Employee becomes active after verification | No automated `status = 'active'` flip upon task completion | ❌ |

---

### 3.7 Email Architecture

| Requirement | Current Implementation | Status |
|---|---|---|
| Centralized platform SMTP | Current: per-org SMTP config in `organizations` table | ❌ |
| Org configures branding only | Org configures `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_from` | ❌ |
| Company Name / Logo in emails | `company_name` from org but logo not embedded in email templates | 🟡 |
| Support email / Reply-To | `smtp_from` exists; reply-to not separately configurable | 🟡 |
| Consistent email service across modules | 3 separate email implementations exist | ❌ |

**Modules that currently send email:**

| Service | Sends |
|---|---|
| `emailService.js` | Leave lifecycle (applied, forwarded, approved, rejected), OTP, password reset, welcome |
| `payrollEmailService.js` | Payslip PDF delivery |
| `payrollNotificationService.js` | Payroll run completion/failure alerts |
| `auth.routes.js` | Directly calls `emailService` for password reset |

**Modules that should send email but don't:**
- Document upload / verification (onboarding)
- Asset assignment
- Exit management completion
- Expense approval
- Performance review due dates
- Announcement publish

---

### 3.8 Biometric

| Requirement | Current Implementation | Status |
|---|---|---|
| Device authentication | Serial number (SN query param) used as identifier; no cryptographic authentication | 🟡 |
| IP Whitelisting | No IP whitelist; any IP can POST to `/iclock/cdata` | ❌ |
| Trusted Device configuration | No trusted device table or management UI beyond registration | ❌ |
| Secure attendance push | ADMS protocol followed; no HMAC/signature validation | 🟡 |
| Multi-tenant isolation | Device is mapped to org via `biometric_devices.organization_id`; raw logs stored with org context | ✅ |

---

## 4. Feature Comparison Matrix

| Feature | Required | Implemented | Gap |
|---|---|---|---|
| Role/Permission Management (dynamic) | ✅ | 🟡 | Legacy `adminOnly()` in 34 files |
| Leave Workflow (dept head → root admin) | ✅ | 🟡 | Dept head can reject (must not) |
| Sandwich Leave Logic | ✅ | ❌ | Missing entirely |
| Comp Off / Compensatory Leave | ✅ | ❌ | Missing entirely |
| Missing Punch Detection | ✅ | ❌ | Treated as absent silently |
| Early Exit Penalty in Pay | ✅ | 🟡 | Tracked; not deducted |
| Overtime Pay | ✅ | ❌ | Missing |
| Variable Pay Component | ✅ | ❌ | Missing |
| Shift-Based Payroll | ✅ | 🟡 | Shifts exist; not wired to engine |
| Per-Org SMTP → Centralized SMTP | ✅ | ❌ | Architecture must change |
| Unified Email Service | ✅ | ❌ | 3 separate implementations |
| Org Email Branding (logo in emails) | ✅ | 🟡 | Name used; no logo injection |
| IP Whitelist for Biometric | ✅ | ❌ | Entirely missing |
| Biometric Device Authentication | ✅ | 🟡 | Serial only; no crypto |
| Onboarding Auto-Activate | ✅ | ❌ | No automation after verification |
| Document Upload in Onboarding | ✅ | 🟡 | Checklist item only; no backend flow |
| ESI Mid-Year Crossing | ✅ | ❌ | Not handled |
| TDS (full engine live) | ✅ | 🟡 | Config + calc built; not default-on |
| Gratuity | ✅ | 🟡 | Config + monthly accrual built; payout not automated |
| Statutory Reports (PF ECR, Form 16) | ✅ | 🟡 | CSV exports built; no PDF |

---

## 5. Missing Feature List

### 5.1 Critical (Blocks Enterprise Use)

1. **Sandwich Leave** — When an employee sandwiches unpaid leave around a holiday or weekend, those non-working days must be counted as LOP. Zero code exists for this.
2. **IP Whitelist for Biometric** — Any internet host can POST fake attendance. There is no origin validation on `/iclock/cdata`.
3. **Dept Head Cannot Reject** — The API allows `root_admin_status = 'rejected'` to be set by a dept head action. This violates the defined workflow.
4. **Centralized SMTP** — Email reliability depends on each org configuring their own SMTP correctly. A single misconfiguration silently drops all emails for that org.
5. **RBAC Completeness** — 34 route files bypass the permission matrix entirely using `adminOnly()`. A custom role cannot gain access to those endpoints even if the permission is granted.

### 5.2 High Priority (Affects Payroll Accuracy)

6. **Missing Punch Handling** — If an employee forgets to check in or out, the system silently counts that day as absent. There is no auto-detection, workflow trigger, or manager alert.
7. **Early Exit Deduction** — Early exits are stored in the attendance record but the payroll engine does not apply any per-day salary reduction. The setting exists but has no effect on net pay.
8. **Shift-Wired Engine** — Individual `shift_assignments` are stored in the database but `payrollEngine.js` fetches only `work_schedule` (org-wide). Employees on different shifts all calculate against the same schedule.
9. **Comp Off Accrual** — No mechanism to award compensatory leave for weekend/holiday work. This is a statutory entitlement under the Factories Act.
10. **Overtime Calculation** — Work hours exceeding 8 hours are recorded but no overtime pay rate is applied.
11. **Variable Pay Component** — Salary structures support fixed components only. Performance-linked variable pay has no formula support.
12. **ESI Mid-Year Eligibility Crossing** — When an employee's gross crosses ₹21,000 mid-year, ESI must stop from the next contribution period. This is not implemented.

### 5.3 Medium Priority (Workflow Gaps)

13. **Onboarding Auto-Activation** — No trigger changes employee status to active after all onboarding tasks are verified.
14. **Document Upload in Onboarding** — Backend has no API to associate uploaded documents with an onboarding checklist item.
15. **Email Branding in All Templates** — Company logo is not embedded in any email template. Only company name is available.
16. **Email Modules Coverage** — Asset assignment, expense approval, exit management, and performance review notifications are not implemented.

---

## 6. Business Rule Gaps

### 6.1 Leave Business Rules

| Rule | Current Behavior | Required Behavior |
|---|---|---|
| Dept head cannot reject | API permits rejection | API must return `403` on rejection attempt |
| Leave conflict validation | Basic date-overlap check | Must check: partial overlap, half-day conflicts, holiday-adjacent leave |
| Sandwich leave | Not calculated | Holidays/weekends between two unpaid leaves must become LOP |
| Comp off eligibility | Not tracked | Work on holidays must trigger comp off accrual |
| Leave balance enforcement | Quota checked at submission | Must re-check at approval time (race condition risk) |
| Carry-forward rules | Not implemented | Annual leave unused must roll to next year per policy |
| Leave cancellation after approval | Not implemented | Approved leave cancellation needs HR sign-off |
| Encashment | Not implemented | Leave encashment on exit |

### 6.2 Payroll Business Rules

| Rule | Current Behavior | Required Behavior |
|---|---|---|
| Early exit deduction | Stored, ignored in engine | Must reduce pay proportionally (or after X instances) |
| Missing punch | Treated as absent | Must trigger regularization workflow or mark as missing |
| Salary revision mid-month | Not handled | Pro-rated: days before revision × old rate + days after × new rate |
| Advance salary recovery | Not implemented | Advance deducted from upcoming payroll |
| Loan EMI deduction | Via adjustments only | Automated recurring deduction from loan schedule |
| ESI stops at wage crossing | Not handled | Contribution period must end when gross > ₹21,000 |
| Form 16 issuance | CSV export only | Must produce actual Form 16 formatted PDF |
| Gratuity on exit | Accrual only | Payout calculation on termination/resignation |
| PF nomination | Not captured | PF nominee must be stored for regulatory compliance |

### 6.3 Attendance Business Rules

| Rule | Current Behavior | Required Behavior |
|---|---|---|
| Double punch prevention | Raw logs deduplicated | Should surface warning when two check-ins occur without check-out |
| Minimum work hours for half day | `half_day_hours` config exists | Not enforced in punch processing |
| Night shift date crossing | Not handled | Check-out on next calendar date must link to previous day's check-in |
| Multiple punch reconciliation | First in / last out used | Must explicitly confirm reconciliation logic |
| Break time maximum | Tracked | Maximum break duration not enforced or deducted |

---

## 7. Technical Gaps

### 7.1 Database

| Gap | Location | Impact |
|---|---|---|
| SMTP passwords stored in plaintext | `organizations.smtp_pass` column | Security: credentials exposed in DB dumps |
| No composite index on `attendance(user_id, date, org_id)` | `attendance` table | Performance: payroll engine full-scans for large orgs |
| `payslips` UNIQUE on `(user_id, month, year)` — missing `organization_id` | `payslips` table | Multi-tenant risk: employee IDs from different orgs could collide |
| No soft delete on `leaves` | `leaves` table | Compliance: deleted leaves untraceable |
| `leave_approval_log` references `actor_id` without FK | `leave_approval_log` | Data integrity: actor can be deleted |
| No index on `payroll_audit_log(organization_id, created_at)` | `payroll_audit_log` | Slow audit report queries |
| Employee salary history — no audit trigger on who changed it | `employee_salary_structures` | Salary changes not linked to actor |

### 7.2 Backend Architecture

| Gap | Location | Impact |
|---|---|---|
| 3 separate email implementations | `emailService.js`, `payrollEmailService.js`, `payrollNotificationService.js` | Inconsistent behavior; template duplication; SMTP config duplication |
| Per-org SMTP config in `organizations` | `organizations` table + `emailService.js` | Cannot centralize email; each org independently misconfigurable |
| `adminOnly()` used in 34 route files | `auth.js` middleware | Custom roles cannot access these endpoints regardless of permissions granted |
| Payroll engine fetches org-wide `work_schedule` not employee shift | `payrollEngine.js` line 419 | Employees on different shifts calculate against wrong schedule |
| No retry logic for email failures | `emailService.js` | Email silently lost on SMTP failure |
| No queue / async email dispatch | `emailService.js` | Slow email sends block the HTTP response chain |
| Biometric ADMS endpoint has no rate limiter | `server.js`, `biometricPush.handler.js` | DOS attack vector |
| No DB transaction around payslip + run_employees insert | `payrollGenerationService.js` | Partial data left if server crashes mid-run |

### 7.3 Frontend

| Gap | Location | Impact |
|---|---|---|
| No payroll preview before submission for employees | Employee portal | Employees cannot verify net pay before payslip is finalized |
| No YTD payslip summary | Employee portal pages | Regulatory requirement for tax planning |
| No leave balance indicator on leave form | Leave submission page | Employees can over-apply; rejected later |
| Payroll run details does not show adjustment effect on net | `PayrollRunDetails.jsx` | HR cannot verify net-after-adjustments at a glance |
| Attendance regularization form has no shift context | Regularization page | Employee cannot see expected check-in time |
| No bulk payroll actions | `PayrollGeneration.jsx` | Cannot select + publish/lock multiple runs at once |
| Department head UI shows Reject option (must not exist) | `DeptHeadApprovals.jsx` | UI contradicts business rule |

---

## 8. Security Gaps

| Gap | Severity | Location | Current Behavior | Required Behavior |
|---|---|---|---|---|
| Biometric endpoint has no IP whitelist | **Critical** | `/iclock/cdata` | Open to any IP | Validate against `biometric_devices.device_ip` whitelist |
| SMTP passwords stored in plaintext | **High** | `organizations.smtp_pass` | Plaintext in DB | Encrypt at application layer before storing |
| No request signing on biometric push | **High** | `biometricPush.handler.js` | Serial number only | HMAC-SHA256 signature or device API key |
| No rate limiter on biometric receiver | **High** | `server.js` | Unlimited requests | `rateLimiter(LIMITS.BIOMETRIC)` middleware |
| JWT expiry 7 days with no revocation | **Medium** | `auth.js` | Static 7-day token | Refresh token + revocation blacklist |
| No CSRF protection on state-changing endpoints | **Medium** | All POST/PUT/DELETE | JWT-only | Add CSRF token for browser clients |
| Org slug exposed in JWT payload | **Low** | JWT sign in `auth.routes.js` | Slug visible to client | Remove non-essential data from token |
| `adminOnly()` bypasses permission audit trail | **Low** | 34 route files | No log of who used admin access | All access should go through RBAC + audit log |
| Password reset tokens not hashed | **Low** | `users` table `reset_token` | Raw token stored in DB | SHA-256 hash stored; compare hash on use |

---

## 9. Performance Gaps

| Gap | Impact | Current | Required |
|---|---|---|---|
| Payroll engine: N+1 query pattern (sequential per-employee) | Slow for orgs with 100+ employees | Sequential `for` loop calling `calculatePayroll` per employee | Batch-fetch shared data (attendance, leaves, holidays) once; process per-employee in-memory |
| No index on `attendance(user_id, organization_id, date)` | Full-scan on large attendance tables | None | Composite index |
| Permission cache uses oldest-entry eviction (not LRU) | High-traffic orgs may evict frequently | Custom eviction logic | Use proper `lru-cache` package |
| `payroll_email_log` checked for duplicates with full-table scan | Slow for orgs with many payslips | No index on `(payroll_run_id, organization_id)` | Add composite index |
| Email sends are synchronous in HTTP request cycle | Slow responses when SMTP is slow | `await sendMail()` in route handlers | Move to async queue (BullMQ or similar) |
| Biometric raw log: no partition strategy | Table grows unbounded | Single table for all orgs all time | Monthly partitioning or archival strategy |
| Payroll preview: re-calculates full engine per request | Slow for large orgs | No caching | Cache preview results for 15 minutes |

---

## 10. UI/UX Gaps

| Gap | Affected Page | Priority |
|---|---|---|
| No YTD payslip summary card | Employee payslip portal | High |
| Department head leave UI shows Reject option (must not) | `DeptHeadApprovals.jsx` | Critical |
| No leave balance remaining shown on leave application form | `MyLeaves.jsx` | High |
| No attendance monthly overview with visual calendar | `MyAttendance.jsx` | Medium |
| No payroll comparison (current vs previous month) | `PayrollRunDetails.jsx` | Medium |
| Adjustment panel does not recalculate net salary on page | `PayrollRunDetails.jsx` | High |
| No statutory liability confirmation screen before payroll lock | `PayrollGeneration.jsx` | High |
| Compliance Dashboard has no due-date alerts or color-coded urgency | `ComplianceDashboard.jsx` | Medium |
| No onboarding progress percentage or visual timeline | `Onboarding.jsx` | Low |
| Shift assignment conflicts not surfaced in UI | `Shifts.jsx` | Medium |
| No employee self-service for comp off requests | Employee portal | Medium |

---

## 11. Multi-Tenant Readiness Review

### ✅ Properly Isolated

- All queries include `organization_id` in WHERE clause
- Foreign keys reference `organizations(id)` on all business tables
- Payroll scheduler iterates orgs independently
- RBAC is scoped to `(user_id, org_id)` pairs
- Statutory configs are per-org
- Biometric devices mapped to `organization_id`

### 🟡 Partially Isolated

- Email service fetches SMTP from org settings but falls back to env-var SMTP if org has no config — creates non-obvious fallback behavior
- Permission cache is global in-memory; a restart clears all org caches simultaneously

### ❌ Isolation Risks

**Risk 1: `payslips` UNIQUE constraint missing `organization_id`**
```sql
-- Current (dangerous):
UNIQUE (user_id, month, year)

-- Required:
UNIQUE (user_id, month, year, organization_id)
```
If two orgs share a user ID (possible with sequential BIGSERIAL in shared DB), a payslip from one org blocks generation for another. **This is a latent race condition.**

**Risk 2: Biometric serial number collision**
If a serial number is registered in two orgs (human error), logs would be attributed to whichever org's record is returned first (no UNIQUE constraint on serial across orgs).

---

## 12. Payroll Readiness Review

### ✅ What Works Correctly

- Basic gross salary computation (sum of all allowance components)
- LOP deduction based on actual absent + late penalty days
- Payable day calculation with weekend/holiday awareness
- Per-org configurable weekend policy (sat_sun, sun_only, alternate_sat, none)
- Statutory PF/ESI/PT calculations (Phase 3.7, requires org setup)
- Salary versioning with `effective_from`/`effective_to`
- Payroll run lifecycle (draft → completed → verified → approved → locked → paid)
- Multi-org independent scheduling
- Advisory lock preventing concurrent generation for same org+period
- Duplicate prevention via UNIQUE on `payroll_scheduler_runs`

### ❌ What Does Not Work

| Issue | Root Cause | File |
|---|---|---|
| Shift-specific schedules | Engine reads only `work_schedule` (org-wide) | `payrollEngine.js` line 419 |
| Mid-month salary revision | Engine uses salary active at month-end for the entire month | `payrollGenerationService.js` |
| Sandwich leave deduction | No post-approval sandwich calculation | Not implemented |
| Early exit deduction | `early_exit_threshold` stored but engine ignores it | `payrollEngine.js` `calculateDeductions()` |
| Missing punch | Silent absent; no workflow triggered | `biometricPush.handler.js` |
| Variable/performance pay | No formula in salary structure | `payrollEngine.js` `calculateGross()` |
| Overtime premium | Work hours tracked; no pay rate applied | Not implemented |
| ESI mid-year stop | Statutory requirement not enforced | `statutoryCalculationService.js` |

---

## 13. Leave Workflow Review

### ✅ Correctly Implemented

- Submission routing to dept head or root admin based on department head assignment
- Dept head forwarding to root admin on approval
- Root admin final approve/reject
- Email at each stage
- `leave_approval_log` audit trail
- Attendance record created on approval
- WFH leave not deducted from quota
- Half-day types (first_half, second_half) supported
- Leave conflict detection (same-date overlap)

### ❌ Critical Gaps

**Gap 1: Department Head Can Reject (Client Requirement Violated)**

```
Current code (leaves.routes.js line 677):
  POST /:id/department-approve
  → No guard preventing root_admin_status = 'rejected'
  → Dept head actor can reject via API manipulation

Required behavior:
  → API must return 403 if any rejection payload is detected
  → Dept head endpoint ONLY sets status = 'pending_root'
```

**Gap 2: No Leave Carry-Forward Policy**
Leave quotas reset but carry-forward logic not implemented. Org cannot configure "carry up to X days from annual leave."

**Gap 3: No Leave Encashment on Exit**
`exit.routes.js` exists but no integration with leave balance for encashment computation.

**Gap 4: No Comp Off Leave Type**
`leave_type` enum does not include `comp_off`. No mechanism to credit leave when an employee works on a holiday/weekend.

**Gap 5: Sandwich Leave**
If an employee takes Mon+Fri as unpaid leave, the weekend (Sat+Sun) between them should become LOP. Current engine does not apply this rule.

---

## 14. Email Architecture Review

### Current Architecture (Must Change)

```
organizations table
  └── smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from

emailService.js
  └── fetchOrgSmtp(orgId) → builds nodemailer transporter per request
  └── No retry, no queue, no template versioning

payrollEmailService.js  (separate service)
  └── Fetches SAME org SMTP via different code path
  └── Generates PDF payslip, attaches, sends

payrollNotificationService.js  (third service)
  └── Third independent SMTP implementation
```

### Required Architecture

```
Platform SMTP Config (env vars only)
  └── SMTP_HOST, SMTP_USER, SMTP_PASS (single source of truth)
  └── One shared nodemailer transporter, connection-pooled

organizations table (branding only — no SMTP)
  └── company_name, logo_url, support_email, reply_to, website

Unified emailService.js (ALL modules use this one)
  └── Signature: send({ to, subject, html, replyTo, orgId })
  └── Auto-injects org branding from cache
  └── Dispatched via async job (non-blocking HTTP response)
  └── Retry: 3 attempts with exponential backoff (1m, 5m, 15m)
  └── Logs every attempt to email_send_log table

Modules to consolidate:
  ✅ Leave lifecycle       → call unified service
  ✅ Payslip delivery      → call unified service
  ✅ Payroll alerts        → call unified service
  ✅ Password reset        → call unified service
  ✅ Welcome email         → call unified service
  ❌ Document verification → add new template + call
  ❌ Asset assignment      → add new template + call
  ❌ Expense approval      → add new template + call
  ❌ Exit management       → add new template + call
  ❌ Announcement publish  → add new template + call
  ❌ Performance review    → add new template + call
```

---

## 15. Biometric Review

### ✅ What Works

- ZKTeco ADMS protocol correctly implemented
- Raw log deduplication (UNIQUE: device_serial + punch_time + employee_pin)
- Multi-org isolation via device-to-org mapping
- Leave guard: skip punch processing if employee is on approved leave
- Break in/out tracking
- Async processing (`setImmediate`) to respond within device timeout

### ❌ Critical Missing: IP Whitelist

**Current behavior:** Any external IP can POST to `/iclock/cdata?SN=<serial>` and inject fake attendance. The server only validates that the serial number exists in `biometric_devices`.

**Required behavior:**
1. `biometric_devices` table needs `allowed_ips TEXT[]` column (`device_ip` exists but not enforced as allowlist)
2. On every ADMS request: compare `req.ip` against `biometric_devices.allowed_ips` for that serial
3. If mismatch → log to audit table → silently discard (ADMS protocol requires "OK" response regardless)
4. Admin UI to update allowed IPs per device with CIDR/range support

### ❌ Missing: Device Authentication

**Current:** Serial number is the only identifier. Anyone who knows a serial number can impersonate a registered device.

**Required:**
- Generate per-device API key on registration
- Include key in custom ADMS header (ZKTeco supports this)
- Validate server-side before processing
- Key rotation from admin UI

### ❌ Missing: Heartbeat Monitoring

`/iclock/getrequest` exists as a placeholder but does not alert when a device goes offline for extended periods.

---

## 16. Risk Assessment

| Risk | Probability | Impact | Severity |
|---|---|---|---|
| Fake attendance injection via biometric endpoint | High (endpoint public) | Critical (payroll fraud) | 🔴 Critical |
| SMTP misconfiguration silently drops all org emails | Medium (per-org SMTP) | High (missed payslips, notifications) | 🔴 Critical |
| Dept head rejecting leave via API manipulation | Low (technical) | High (workflow violation) | 🟠 High |
| Payroll duplicate if advisory lock fails | Very Low | High (double salary payment) | 🟠 High |
| `payslips` UNIQUE missing `org_id` → cross-tenant collision | Very Low | Critical (wrong payslip data) | 🟠 High |
| ESI not stopping at wage ceiling mid-year | High (common scenario) | Medium (compliance penalty) | 🟠 High |
| Email queue blocks HTTP responses under load | Medium (sync send) | Medium (API timeouts) | 🟡 Medium |
| Permission cache eviction under heavy load | Medium | Medium (stale permissions) | 🟡 Medium |
| Sandwich leave not calculated (employee overpaid) | High (common scenario) | Medium (incorrect payroll) | 🟡 Medium |
| Shift schedule not wired to engine (wrong late calc) | High (if shifts in use) | Medium (incorrect payroll) | 🟡 Medium |
| No leave carry-forward (quota disappears year-end) | High | Medium (employee dispute) | 🟡 Medium |

---

## 17. Prioritized Implementation Roadmap

---

### Phase 4.1 — Security Hardening
**Timeline:** Week 1–2
**Priority:** 🔴 Critical
**Complexity:** Medium

#### Objective
Close the two critical security gaps (biometric IP whitelist + centralized SMTP) before any other feature work.

#### Business Value
Prevents payroll fraud via biometric spoofing. Centralizes email control so a single SMTP misconfiguration cannot silence an entire org.

#### Modules Affected
Biometric · Email · Auth · OrgSettings

#### Database Changes
```sql
ALTER TABLE biometric_devices ADD COLUMN allowed_ips TEXT[];
ALTER TABLE biometric_devices ADD COLUMN device_api_key TEXT;
ALTER TABLE organizations ADD COLUMN email_logo_url TEXT;
ALTER TABLE organizations ADD COLUMN email_support TEXT;
ALTER TABLE organizations ADD COLUMN email_reply_to TEXT;
ALTER TABLE organizations ADD COLUMN email_website TEXT;
-- Remove: smtp_host, smtp_port, smtp_user, smtp_pass (migrate to env/vault)
CREATE TABLE email_send_log (
    id BIGSERIAL PRIMARY KEY,
    org_id BIGINT REFERENCES organizations(id),
    to_address TEXT NOT NULL,
    subject TEXT,
    template TEXT,
    status TEXT CHECK (status IN ('sent','failed','retrying')),
    attempts INT DEFAULT 0,
    last_error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Backend Changes
- Add IP validation middleware to `/iclock/cdata` — compare `req.ip` against `biometric_devices.allowed_ips`
- Add rate limiter to `/iclock/cdata` (1000 req/min)
- Generate and validate `device_api_key` on biometric push
- Consolidate all email into single `emailService.js` — deprecate `payrollEmailService.js` and `payrollNotificationService.js` as standalone SMTP callers
- Unified service reads SMTP from env vars; injects org branding from cache
- Add retry logic (3 attempts, exponential backoff); log to `email_send_log`
- Move email dispatch to `setImmediate` / job pattern (decouple from HTTP response)

#### Frontend Changes
- Remove SMTP configuration form from `OrgSettings.jsx`
- Add Email Branding section: company_name, logo_url, support_email, reply_to, website
- Biometric device detail: "Allowed IPs" field + API key regeneration button

#### API Changes
- `PUT /api/org/settings` — strip smtp_* fields; add branding fields
- `PUT /api/biometric/devices/:id/allowed-ips`
- `POST /api/biometric/devices/:id/rotate-key`

#### Testing Scenarios
- Attempt biometric push from unlisted IP → expect silent discard + audit log entry
- Send email when SMTP env not set → expect graceful error log, no crash
- Send email with org branding configured → verify logo/name in output

---

### Phase 4.2 — RBAC Completeness
**Timeline:** Week 2–3
**Priority:** 🔴 Critical
**Complexity:** Medium (mechanical but large surface area)

#### Objective
Replace all 34 `adminOnly()` / `rootAdminOnly()` calls with `hasPermission()` checks. Complete the RBAC migration started in Phase 1.

#### Business Value
Root Admin can create custom roles with granular access. Currently all HR admins are treated identically regardless of granted permissions.

#### Modules Affected
All 34 files using `adminOnly()`: leaves · attendance · payroll · onboarding · biometric · employees · departments · settings + all others

#### Database Changes
- No schema changes required
- Audit: verify all `module.action` permission strings are seeded for every affected endpoint

#### Backend Changes
Replace `adminOnly` with `hasPermission(module, action)` per route:

| File | Current | Replace With |
|---|---|---|
| `leaves.routes.js` lines 239, 450 | `adminOnly` | `hasPermission('leaves', 'view_all')` |
| `attendance.routes.js` lines 176, 181, 194 | `adminOnly` | `hasPermission('attendance', 'view_all')` |
| `onboarding.routes.js` lines 47, 78, 141, 160 | `adminOnly` | `hasPermission('onboarding', 'manage')` |
| `biometric.routes.js` all device/map routes | `adminOnly` | `hasPermission('biometric', 'manage')` |
| `employees.routes.js` create/edit/delete | `adminOnly` | `hasPermission('employees', 'create')` etc. |
| `departments.routes.js` | `adminOnly` | `hasPermission('departments', 'manage')` |
| `settings.routes.js` PUT routes | `adminOnly` | `hasPermission('settings', 'manage')` |
| All remaining files | `adminOnly` | Appropriate `hasPermission()` |

- Delete `adminOnly` and `rootAdminOnly` from `auth.js` after full migration
- Add `hasPermission('leaves', 'department_approve')` specifically for dept head approve endpoint

#### RBAC Changes
- Seed missing `module.action` permission pairs for newly migrated routes
- Update `seedSystemRolesForOrg()` to assign new permission strings

---

### Phase 4.3 — Leave Workflow Fixes
**Timeline:** Week 3
**Priority:** 🔴 Critical
**Complexity:** Medium

#### Objective
Enforce the correct leave approval workflow. Fix dept head rejection gap. Add sandwich leave logic and comp off leave type.

#### Business Value
Correct workflow compliance. Payroll accuracy for leave-adjacent scenarios.

#### Modules Affected
Leaves · Payroll Engine · Biometric (comp off accrual trigger)

#### Database Changes
```sql
-- Allow comp_off as leave type
ALTER TABLE leaves DROP CONSTRAINT IF EXISTS leaves_leave_type_check;
ALTER TABLE leaves ADD CONSTRAINT leaves_leave_type_check
    CHECK (leave_type IN ('casual','annual','sick','emergency','wfh','comp_off','other'));

-- Comp off balance tracking
CREATE TABLE comp_off_balances (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id),
    user_id BIGINT NOT NULL REFERENCES users(id),
    balance_days NUMERIC(5,2) NOT NULL DEFAULT 0,
    accrued_on DATE,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_comp_off_user_date UNIQUE (user_id, accrued_on)
);

-- Sandwich flag on leave
ALTER TABLE leaves ADD COLUMN IF NOT EXISTS sandwich_days_adjusted NUMERIC(5,2) DEFAULT 0;
```

#### Backend Changes

**Dept Head Rejection Fix (`leaves.routes.js`):**
- In `POST /:id/department-approve`, add early return: if body contains rejection intent → `return res.status(400).json({ error: 'Department head can only approve, not reject' })`
- Only set `dept_head_status = 'approved'` and `status = 'pending_root'`

**Sandwich Leave Logic:**
- After leave approval, run `calculateSandwichAdjustment(leave, orgId)`:
  - For each approved unpaid leave, check for non-working days immediately adjacent
  - Convert sandwiched days to LOP by recording `sandwich_days_adjusted` on leave
- Integrate into `payrollEngine.js`: add sandwiched days to total LOP calculation

**Comp Off Accrual:**
- When biometric records `work_hours > standard_hours` on a holiday or weekend, credit `comp_off_balances`
- New leave with `leave_type = 'comp_off'` draws from balance
- Display balance in employee portal

#### Frontend Changes
- `DeptHeadApprovals.jsx` — remove Reject button entirely; add tooltip "Department heads can only approve"
- Add comp off balance display in leave application form
- Show sandwich leave warning when employee selects dates spanning non-working days

#### API Changes
- `POST /api/leaves/:id/department-approve` — no rejection payload accepted; return `400` if attempted
- `GET /api/leaves/comp-off-balance` — return employee's accrued comp off days
- `POST /api/leaves/comp-off-request` — apply for comp off leave from balance

---

### Phase 4.4 — Payroll Engine Completeness
**Timeline:** Week 4–5
**Priority:** 🔴 Critical
**Complexity:** High

#### Objective
Fill payroll calculation gaps: shift-wired engine, mid-month salary revision, early exit deduction, missing punch workflow, overtime tracking.

#### Business Value
Accurate salary for every employee in every scenario. This is the most important module per client requirements.

#### Modules Affected
Payroll Engine · Attendance · Shifts · Regularization

#### Database Changes
```sql
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS missing_punch_flag BOOLEAN DEFAULT FALSE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS early_exit_lop_eligible BOOLEAN DEFAULT FALSE;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(5,2) DEFAULT 0;
ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS overtime_rate NUMERIC(4,2) DEFAULT 1.5;
ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS early_exit_allowance_per_month INT DEFAULT 3;
```

#### Backend Changes

**Shift-Wired Engine (`payrollEngine.js`):**
In `fetchAllData()`, add parallel query:
```sql
SELECT sa.shift_id, s.check_in, s.check_out, s.late_threshold
FROM shift_assignments sa
JOIN shifts s ON s.id = sa.shift_id
WHERE sa.user_id = $1
  AND (sa.effective_from IS NULL OR sa.effective_from <= $2)
  AND (sa.effective_to IS NULL OR sa.effective_to >= $2)
LIMIT 1
```
If shift assignment exists, use shift timings instead of org-wide `work_schedule`. Fallback to `work_schedule` if no shift assigned.

**Mid-Month Salary Revision (`payrollGenerationService.js`):**
When `salary.effective_from` falls within the pay month:
- Calculate period 1 gross: days 1 to (effective_from - 1) using old salary structure
- Calculate period 2 gross: days effective_from to month-end using new salary structure
- Sum the two partial grosses to produce final gross for the month

**Early Exit Deduction (`payrollEngine.js`):**
- Count days where `attendance.early_exit_lop_eligible = TRUE`
- Apply org rule: first `early_exit_allowance_per_month` exits are free; excess → 0.5 day LOP per incident
- Setting already exists in `payroll_settings`; wiring to engine is the gap

**Missing Punch Nightly Job:**
- Nightly cron: scan previous day's attendance for records with `check_in` but no `check_out` (or vice versa) after shift end time
- Set `missing_punch_flag = TRUE`
- Create notification to employee and manager
- Create auto-regularization request (status=pending) for employee to correct
- Payroll engine: missing-punch days treated as absent until regularization approved

**Overtime:**
- Calculate `overtime_hours = MAX(0, work_hours - standard_hours)` on checkout
- Store on `attendance.overtime_hours`
- Payroll engine: `overtime_pay = overtime_hours × (basic_salary / (working_days × standard_hours)) × overtime_rate`
- `overtime_rate` configurable in `payroll_settings` (default 1.5×)

#### API Changes
- `GET /api/payroll/preview` — must reflect shift-wired calculations and mid-month revision proration
- `GET /api/attendance/missing-punches?date=&orgId=` — list employees with missing punches
- `POST /api/attendance/regularize-missing` — HR bulk regularization endpoint

#### Testing Scenarios
- Employee on 10AM shift: check-in at 10:25 with 15-min grace → should be on time
- Salary revised on 15th: days 1–14 at old salary + days 15–31 at new salary → verify correct gross
- Employee exits at 4 PM (threshold 5 PM) for 5 consecutive days → verify LOP after allowance exhausted
- Missing punch on Tuesday → notification sent + auto-regularization created

---

### Phase 4.5 — Onboarding & Document Integration
**Timeline:** Week 5–6
**Priority:** 🟠 High
**Complexity:** Medium

#### Objective
Complete the onboarding workflow: document upload, HR verification, auto-activation.

#### Business Value
Reduces manual HR overhead. Ensures regulatory document compliance before payroll starts.

#### Modules Affected
Onboarding · Documents · Email · Users

#### Database Changes
```sql
CREATE TABLE onboarding_documents (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id),
    user_id BIGINT NOT NULL REFERENCES users(id),
    checklist_item_id BIGINT REFERENCES onboarding_checklists(id),
    document_type TEXT NOT NULL CHECK (document_type IN (
        'aadhaar','pan','bank_proof','education','experience',
        'passport','photo','other'
    )),
    document_url TEXT,
    document_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','approved','rejected')),
    verified_by BIGINT REFERENCES users(id),
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS required_documents TEXT[]
    DEFAULT ARRAY['aadhaar','pan','bank_proof'];
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS auto_activate_on_onboarding BOOLEAN DEFAULT FALSE;
```

#### Backend Changes
- `POST /api/onboarding/:userId/documents` — upload document linked to checklist item
- `PUT /api/onboarding/:userId/documents/:id/verify` — HR marks document verified
- After all required documents verified: if `auto_activate_on_onboarding=true`, update `users.status = 'active'` + send activation email
- Email templates: `documentVerifiedHtml()`, `onboardingCompleteHtml()`

#### Frontend Changes
- Onboarding page: document upload widget per checklist item type
- HR onboarding overview: pending documents list with approve/reject per document
- Progress indicator: X of Y required documents uploaded/verified

---

### Phase 4.6 — Advanced Leave Features
**Timeline:** Week 6–7
**Priority:** 🟠 High
**Complexity:** Medium

#### Objective
Leave carry-forward, encashment on exit, leave cancellation workflow, balance enforcement at approval time.

#### Database Changes
```sql
ALTER TABLE leave_policies ADD COLUMN IF NOT EXISTS carry_forward_max_days NUMERIC(4,1) DEFAULT 0;
ALTER TABLE leave_policies ADD COLUMN IF NOT EXISTS encashment_eligible BOOLEAN DEFAULT FALSE;

CREATE TABLE leave_balance_snapshots (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    organization_id BIGINT NOT NULL REFERENCES organizations(id),
    leave_type TEXT NOT NULL,
    balance NUMERIC(5,2) NOT NULL,
    snapshot_date DATE NOT NULL,
    financial_year TEXT NOT NULL
);
```

#### Backend Changes
- Annual leave reset job (runs on FY start): carry forward up to `carry_forward_max_days` per policy
- Leave cancellation: `POST /api/leaves/:id/cancel-request` → sets cancel flag, notifies HR
- HR approves cancellation: `PUT /api/leaves/:id/cancel-approve` → reverts attendance record
- Exit integration: pull leave balance → compute encashment days × per-day rate
- At approval time: re-check quota with `SELECT FOR UPDATE` on balance record (prevents race condition)

---

### Phase 4.7 — Email Queue & Reliability
**Timeline:** Week 7
**Priority:** 🟠 High
**Complexity:** Medium

#### Objective
Make all email sends async, retryable, and logged. Required for production reliability at scale.

#### Business Value
No more silent email drops. HR knows when payslips or notifications failed.

#### Database Changes
```sql
-- Already defined in Phase 4.1: email_send_log table
```

#### Backend Changes
- Wrap all email sends in async job queue (BullMQ with Redis, or pg-based queue if Redis not available)
- Each job: max 3 attempts, backoff: 1 min → 5 min → 15 min
- On final failure: set `status = 'failed'` in `email_send_log`, trigger internal Slack/webhook alert
- `GET /api/platform/email-log` — platform admin view of all email delivery status

#### Frontend Changes
- Platform admin: Email delivery status dashboard
- HR admin: "Resend payslip" button for failed sends visible in payroll run details

---

### Phase 4.8 — Payroll Statutory Completeness
**Timeline:** Week 8
**Priority:** 🟡 Medium
**Complexity:** Medium

#### Objective
ESI mid-year eligibility enforcement, gratuity payout on exit, Form 16 PDF generation.

#### Database Changes
```sql
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS esi_contribution_stopped BOOLEAN DEFAULT FALSE;
```

#### Backend Changes
- ESI mid-year: check if previous month gross crossed `wage_limit`; if yes, set `esi_eligible = false` from next contribution period automatically
- Gratuity payout: on exit, compute gratuity using `statutory_gratuity_config` formula, store in exit record
- Form 16 PDF: use existing CSV dataset + PDF library (`pdfkit` or `puppeteer`) to generate official Form 16 format with 12BB annexure

---

### Phase 4.9 — Performance & Indexing
**Timeline:** Week 8–9 (can run parallel with other phases)
**Priority:** 🟡 Medium
**Complexity:** Low–Medium

#### Database Changes
```sql
-- Fix critical multi-tenant UNIQUE constraint
ALTER TABLE payslips DROP CONSTRAINT payslips_user_id_month_year_key;
ALTER TABLE payslips ADD CONSTRAINT uq_payslips_user_period_org
    UNIQUE (user_id, month, year, organization_id);

-- Performance indexes
CREATE INDEX CONCURRENTLY idx_att_user_org_date
    ON attendance(user_id, organization_id, date);
CREATE INDEX CONCURRENTLY idx_leaves_user_org_status
    ON leaves(user_id, organization_id, status);
CREATE INDEX CONCURRENTLY idx_payslips_run_org
    ON payslips(payroll_run_id, organization_id);
CREATE INDEX CONCURRENTLY idx_pel_run_org
    ON payroll_email_log(payroll_run_id, organization_id);
CREATE INDEX CONCURRENTLY idx_pal_org_created
    ON payroll_audit_log(organization_id, created_at DESC);
```

#### Backend Changes
- Payroll engine: batch-fetch attendance and leaves for all employees in a run once; pass slices to per-employee calculation (eliminates N+1)
- Replace custom permission cache eviction with proper `lru-cache` package
- Add `rateLimiter(LIMITS.BIOMETRIC)` to ADMS endpoint (already noted in Phase 4.1)

---

### Phase 4.10 — UX Completeness
**Timeline:** Week 9–10
**Priority:** 🟡 Medium
**Complexity:** Medium

#### Objective
Fill identified UI gaps: YTD payslip summary, leave balance on form, payroll adjustment net recalculation, attendance calendar view.

#### Frontend Changes
- Employee payslip portal: YTD earnings, YTD deductions, YTD TDS summary card
- Leave application form: remaining leave balance indicator per leave type
- `PayrollRunDetails.jsx`: real-time net-after-adjustments recalculation (client-side)
- `ComplianceDashboard.jsx`: color-coded due-date urgency (red <7 days, amber 7–14 days, green >14 days)
- Attendance page: monthly calendar view with color-coded day types (present/absent/late/leave/holiday)
- Shift assignment UI: conflict detection on calendar overlap

---

## Roadmap Summary

| Phase | Objective | Priority | Complexity | Timeline |
|---|---|---|---|---|
| **4.1** | Security Hardening (biometric IP whitelist, centralized email) | 🔴 Critical | Medium | Week 1–2 |
| **4.2** | RBAC Completeness (replace all `adminOnly` with `hasPermission`) | 🔴 Critical | Medium | Week 2–3 |
| **4.3** | Leave Workflow Fix (dept head rejection, sandwich leave, comp off) | 🔴 Critical | Medium | Week 3 |
| **4.4** | Payroll Engine Completeness (shifts, mid-month revision, early exit, missing punch, overtime) | 🔴 Critical | High | Week 4–5 |
| **4.5** | Onboarding & Document Integration | 🟠 High | Medium | Week 5–6 |
| **4.6** | Advanced Leave (carry-forward, encashment, cancellation) | 🟠 High | Medium | Week 6–7 |
| **4.7** | Email Queue & Reliability | 🟠 High | Medium | Week 7 |
| **4.8** | Statutory Completeness (ESI mid-year, gratuity payout, Form 16 PDF) | 🟡 Medium | Medium | Week 8 |
| **4.9** | Performance & Indexing | 🟡 Medium | Low | Week 8–9 |
| **4.10** | UX Completeness | 🟡 Medium | Medium | Week 9–10 |

**Total estimated timeline: 10 weeks** for a fully enterprise-ready system, assuming one senior developer active per phase with Phases 4.9 and 4.10 parallelizable with Phases 4.7 and 4.8.

---

*Document prepared after full codebase audit of all 35+ modules, 40 migration files, and 56 frontend pages. All gaps verified against actual implementation — no assumptions.*
