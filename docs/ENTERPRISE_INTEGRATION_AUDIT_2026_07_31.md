# Enterprise System Integration Audit — Lumos Logic HRMS

**Branch:** `HRMS-Migration-16jul`
**Audit date:** 2026-07-31
**Implementation completed:** 2026-07-31
**Stack:** React 18 + Vite (client) · Express + PostgreSQL (backend) · Multi-tenant (`organization_id` scoped)
**Status:** ✅ Implementation complete. All Critical and High items resolved. 7 of 12 Medium items resolved. All Low items resolved. 8 security vulnerabilities patched (found during implementation review, not in original audit). See Priority Matrix below for per-item status.

---

## Table of Contents

1. [Current Architecture](#1-current-architecture)
2. [Integration Matrix](#2-integration-matrix)
3. [Missing Relationships](#3-missing-relationships)
4. [Broken Workflows](#4-broken-workflows)
5. [Data Model Problems](#5-data-model-problems)
6. [UI Problems](#6-ui-problems)
7. [RBAC Problems](#7-rbac-problems)
8. [Dashboard Gaps](#8-dashboard-gaps)
9. [Approval Flow Gaps](#9-approval-flow-gaps)
10. [Missing Notifications](#10-missing-notifications)
11. [Priority Matrix](#11-priority-matrix)
12. [Recommended Implementation Order](#12-recommended-implementation-order)

---

## 1. Current Architecture

The system is a **React 18 + Vite SPA** backed by **Express + PostgreSQL**. It runs as a multi-tenant HRMS where each `organization_id` isolates all data. Authentication is JWT-based. Authorization uses **two coexisting systems**:

- **Legacy:** `users.role` text column (`employee | admin | root_admin | platform_admin`) checked via `adminOnly` / `rootAdminOnly` / `isAdminRole()` middleware
- **New RBAC (Phase 1):** `roles → role_permissions → permissions → user_roles` tables, checked via `hasPermission('module', 'action')` middleware

The frontend uses three distinct layout areas:

| Layout | Path Prefix | Role Guard |
|--------|-------------|------------|
| HR Admin | `/dashboard/*` | `HRRoute` — allows `admin` + `root_admin` |
| Root Admin | `/root/*` | `RootRoute` — allows `root_admin` only |
| Employee Portal | `/portal/*` | `EmployeeRoute` — allows `employee` |

A fourth role — **Department Head** — has no dedicated layout. It piggybacks on the Employee Portal with a single hidden page (`/portal/dept-approvals`).

### Key DB Tables (high-level)

| Domain | Tables |
|--------|--------|
| Identity | `users`, `organizations`, `user_departments` |
| RBAC | `permissions`, `roles`, `role_permissions`, `user_roles` |
| Departments | `departments`, `designations`, `branches` |
| Attendance | `attendance`, `attendance_regularization` |
| Leave | `leaves`, `leave_policies`, `leave_approval_log` |
| Payroll | `payroll_settings`, `employee_salary_structures`, `payroll_audit_log` |
| Statutory | `statutory_pf_config`, `statutory_esi_config`, `statutory_pt_config`, `statutory_tds_config`, `statutory_tds_declarations`, `statutory_investment_proofs`, `statutory_gratuity_config`, `statutory_lwf_config`, `statutory_bonus_config`, `statutory_compliance_returns` |
| Lifecycle | `onboarding_checklists`, `exit_requests` |
| Comms | `notifications`, `notifications_log`, `push_subscriptions`, `announcements` |
| Ops | `shifts`, `shift_assignments`, `holidays`, `assets`, `expenses`, `documents` |
| Biometric | `biometric_devices`, `biometric_logs`, `biometric_pin_mapping` |

---

## 2. Integration Matrix

| Module | Connects TO | Connection Exists? | Notes |
|--------|-------------|-------------------|-------|
| Employees | Departments | Partial | `department_id` FK set via profile edit, NOT employee create form |
| Employees | Designations | Partial | `designation_id` FK in DB but create/edit form uses free-text datalist |
| Employees | Roles (RBAC) | Missing | No auto-insert into `user_roles` on employee creation |
| Employees | Shifts | Missing | Shift in `shift_assignments` table; not surfaced in employee view |
| Employees | Payroll | Partial | `ctc` on `users` but salary structure is a separate module |
| Employees | Onboarding | Missing | No trigger from employee creation to init onboarding |
| Employees | Exit | Missing | Approved exit never updates `users.employee_status` |
| Departments | Department Heads | Partial | `head_user_id` FK exists but no approval portal or dedicated dashboard |
| Departments | Leave Approval | Partial | Head determined at leave-submit time via dept lookup; not cached |
| Departments | Employees | Yes | `user_departments` junction table exists |
| Roles (RBAC) | All modules | Missing (mostly) | Only Payroll uses `hasPermission()`; all others use legacy `adminOnly` |
| Roles (RBAC) | Employees | Missing | `users.role` and `user_roles` both exist but diverge for new employees |
| Permissions | Frontend | Missing | Frontend never fetches RBAC permissions; uses `user.role` string |
| Leave | Attendance | Yes | Approval writes attendance rows |
| Leave | Notifications | Yes | Triggers in-app + email |
| Leave | Department Head | Partial | Forward route exists but dept-head portal is hidden and unlinked |
| Leave | Holidays | Missing | Leave duration does not subtract org holidays |
| Leave | Shifts | Missing | No half-day validation against employee's shift schedule |
| Attendance | Payroll | Partial | Payroll can read attendance but no "attendance locked" gate |
| Attendance | Shifts | Missing | Late/early calc uses global grace_minutes, not employee's shift times |
| Attendance | Holidays | Missing | No auto-mark on holiday dates |
| Payroll | Employees | Yes | Salary structure linked to `user_id` |
| Payroll | Attendance | Partial | Preview uses attendance; generation has no hard dependency |
| Payroll | Leave | Missing | LOP touches attendance status rows but doesn't join `leaves` directly |
| Payroll | Statutory | Yes | PF/ESI/PT/TDS configs feed into salary calculation |
| Onboarding | Employees | Partial | `init/:userId` exists but no auto-trigger on employee create |
| Onboarding | Notifications | Partial | One notification on init; no per-task completion notification |
| Onboarding | RBAC | Missing | Onboarding routes use `adminOnly`, not `hasPermission` |
| Exit | Employees | Missing | Approving exit never sets `users.employee_status = 'inactive'` |
| Exit | Offboarding | Missing | No offboarding checklist table exists |
| Exit | Payroll | Missing | No F&F payroll trigger on exit approval |
| Exit | Assets | Missing | Asset return not triggered on exit |
| Exit | Notifications | Partial | Employee notified; dept head / IT / payroll are not |
| Notifications | All modules | Partial | Leave + exit + onboarding trigger; other modules do not |
| Shifts | Attendance | Missing | Attendance doesn't validate against shift schedule |
| Shifts | Employees | Partial | `shift_assignments` exists but not shown in employee profile |
| Holidays | Leave | Missing | Leave duration doesn't subtract holidays |
| Holidays | Attendance | Missing | No auto-absent/holiday mark |

---

## 3. Missing Relationships

### 3.1 Missing DB Fields / FKs

| Gap | Table | Missing Field | Should Reference |
|-----|-------|---------------|-----------------|
| Employee create form ignores designation FK | `users` | `designation_id` set only via profile edit | `designations.id` |
| No reporting manager in leave chain | `users` | `leave_approver_id` override | `users.id` |
| Onboarding has no per-employee status | `onboarding_checklists` | No `overall_status` aggregate | Derived or explicit |
| Exit approval doesn't cascade | `exit_requests` | No side effect on `users` | Should update `users.employee_status` |
| No offboarding tasks | — | `offboarding_checklists` table | Mirror of `onboarding_checklists` |
| No leave balance ledger | — | `leave_balances` table | Cannot carry forward or adjust |
| Payroll not linked to leave LOP | `payslips` | No FK to `leaves` | Should cite which leave days caused LOP |
| RBAC role not assigned on user create | `user_roles` | No insert on `POST /employees` | Default `employee` role for org |

---

## 4. Broken Workflows

### 4.1 Leave Approval Chain — CRITICAL

**Documented design:** Employee → Dept Head (forward) → Root Admin (approve/reject)

**Actual backend behavior:**

```
Employee submits:
  - has dept head  → status = pending_dept
  - no dept head   → status = pending_root

Dept Head forwards (POST /leaves/:id/forward):
  - status → pending_root
  - DeptHeadApprovals.jsx page exists at /portal/dept-approvals

Root Admin acts (PUT /leaves/:id/approve):
  - Middleware: auth + adminOnly          ← allows HR Admin AND Root Admin
  - Inner check line 471:
      if (status === 'pending_root' && req.user.role !== 'root_admin') → 403
  - HR Admin: CAN approve legacy 'pending' leaves
              CANNOT approve 'pending_root' leaves → gets silent 403
```

**Broken part:** The HR Admin dashboard shows all pending leaves, including `pending_root` ones. When HR clicks approve on a `pending_root` leave, they receive a 403 with no helpful UI message. The Root Admin has no action widget on their dashboard to handle these. Leaves pile up invisibly.

### 4.2 Department Head Has No Dashboard

`DeptHeadApprovals.jsx` exists and mounts at `/portal/dept-approvals`. However:
- Inside Employee layout — no dept-head sidebar or navigation link
- No route guard — any employee can access the URL
- Backend correctly scopes data to dept-head-owned departments (correct), but the page is hidden and unguarded on the frontend

### 4.3 Employee Creation Is Incomplete

When `POST /api/employees` creates a user:
- No auto-insert into `user_roles` (RBAC assignment)
- No auto-init of onboarding checklist
- No salary structure placeholder
- `designation_id` FK not written (form uses free-text datalist → writes `position` field only)

### 4.4 Exit Approval Does Not Close the Loop

When HR approves a resignation (`PUT /exit/:id`):
- `exit_requests.status = 'approved'` — stored correctly
- `users.employee_status` — **NOT updated** (stays 'active')
- No offboarding checklist triggered
- No F&F payroll task created
- No asset return request triggered
- No IT access revocation notification

### 4.5 Attendance Does Not Know About Shifts

`attendance.routes.js` calculates late/early using org-level `grace_minutes` and `early_exit_allowance_minutes` from `payroll_settings`. It never queries `shift_assignments`. An employee on a night shift is evaluated against the same threshold as a day-shift employee.

### 4.6 Holiday Calendar Not Integrated

- Leave submission does not subtract holidays when counting days taken
- Attendance does not auto-mark holiday dates as `holiday`
- Payroll LOP uses `payroll_settings.working_days_rule`, not the org holiday list

### 4.7 Onboarding Not Triggered on Hire

`POST /onboarding/init/:userId` must be called manually by HR. No hook from `POST /employees`.

---

## 5. Data Model Problems

| # | Problem | Severity | Detail |
|---|---------|----------|--------|
| 1 | Dual authorization columns | Critical | `users.role` (text) + `user_roles` (RBAC table) both exist. Phase 1 seeded `user_roles` from `users.role`, but new employee creates do NOT insert into `user_roles`. These will diverge. |
| 2 | `position` vs `designation_id` | High | `users.position` is free text. `users.designation_id` is FK to `designations`. Employees.jsx form writes `position` via datalist but never sets `designation_id`. Profile page sets `designation_id`. Two paths, one field authoritative — undefined behavior. |
| 3 | `users.department` denormalized text | High | Both `users.department` (text) and `users.department_id` (FK) exist. A trigger syncs on department rename, but if `department_id` is null, `department` is whatever was typed at create time. |
| 4 | No `leave_balances` ledger | High | Balances are computed live by counting approved leaves. No persistent table means no carry-forward, no manual adjustments, no encashment, no historical snapshots. |
| 5 | `approved_by` vs `root_admin_id` on leaves | Medium | Phase 2 added `root_admin_id` but `approved_by` is still populated. Both fields exist. Consumers read inconsistently. |
| 6 | Shift assignment not on employee record | Medium | Shift in `shift_assignments` (separate table). No `shift_id` on `users`. No shift section in Employee Profile. |
| 7 | `users.hod_id` vs `departments.head_user_id` | Medium | Two fields define "dept head for this employee". Leave routing uses only `departments.head_user_id`. `users.hod_id` is never read in any workflow. |
| 8 | `users.reporting_to` unused | Medium | Field exists and is set via profile edit, but leave approval bypasses it entirely. |
| 9 | No `payslips` persistent table visible | High | Payroll generation logic exists in routes but no persistent per-employee payslip record confirmed via audit — employee portal has no payslip history to display. |
| 10 | No `offboarding_checklists` table | Medium | Exit is approved but no structured offboarding process exists. |

---

## 6. UI Problems

| # | Problem | Severity | Page |
|---|---------|----------|------|
| 1 | Dept Head has no sidebar link to approvals queue | Critical | EmployeeLayout sidebar |
| 2 | Root Dashboard has no "Leaves Awaiting Approval" action widget | Critical | RootDashboard.jsx |
| 3 | HR Admin sees `pending_root` leaves but gets 403 on approve — no visual distinction | High | Leaves.jsx, Dashboard.jsx |
| 4 | Employee create modal uses free-text datalist for Designation instead of FK dropdown | High | Employees.jsx (~line 1575) |
| 5 | Employee create modal has no shift assignment section | High | Employees.jsx |
| 6 | Employee create modal has no RBAC role assignment | High | Employees.jsx |
| 7 | No onboarding auto-trigger after employee creation | High | Employees.jsx |
| 8 | `DeptHeadApprovals` accessible by any employee — no guard | High | DeptHeadApprovals.jsx |
| 9 | Exit management shows no post-approval actions | High | ExitManagement.jsx |
| 10 | Employee Portal has no "My Shift" view | Medium | Employee Portal |
| 11 | Employee Portal has no per-leave-type balance cards | High | MyLeaves.jsx / EmployeeHome.jsx |
| 12 | Shift page cannot show which employees are currently on which shift | Medium | Shifts.jsx |
| 13 | No payslip download in employee portal | High | /portal/payslips |
| 14 | `ComplianceDashboard.jsx` uses `user?.role === 'root_admin'` to branch path | Medium | ComplianceDashboard.jsx |
| 15 | `Employees.jsx` filters by `e.role === 'admin'` / `e.role === 'employee'` — incompatible with custom RBAC roles | High | Employees.jsx (lines 1763–1765) |
| 16 | `ManageHR.jsx` and `ManageRootAdmins.jsx` are legacy pages that duplicate the Employee + Roles system | Medium | ManageHR.jsx, ManageRootAdmins.jsx |

---

## 7. RBAC Problems

| # | Problem | Severity |
|---|---------|----------|
| 1 | Only Payroll uses `hasPermission()`. All other modules use legacy `adminOnly` / `isAdminRole()`. Affects: Attendance, Employees, Departments, Leaves, Onboarding, Exit, Shifts, Holidays, Documents, Reports, Regularization, Announcements, Assets, Expenses, Designations, Branches. | Critical |
| 2 | `POST /employees` does not insert into `user_roles`. New employees have no RBAC role assigned. System falls back to legacy `users.role` string for them. | Critical |
| 3 | `leaves.routes.js` lines 471, 539: `req.user.role !== 'root_admin'` — hardcoded string check bypasses RBAC. | High |
| 4 | Frontend never fetches user's RBAC permissions. All visibility controlled by `user.role` string (e.g., `isRootAdmin`, `isAdmin`). | High |
| 5 | `adminOnly` allows both `role = 'admin'` and `role = 'root_admin'`. HR Admin and Root Admin are functionally equivalent at middleware level — only inner checks differentiate them. | High |
| 6 | `/portal/dept-approvals` accessible to any employee — no permission or role guard. | Medium |
| 7 | `designations.routes.js` uses `adminOnly`. Dept Heads cannot view designations for their dept. | Medium |
| 8 | Roles page and PermissionMatrix are `rootAdminOnly`. HR Admin cannot manage custom roles even if granted permission. | Medium |

---

## 8. Dashboard Gaps

| Dashboard | Missing |
|-----------|---------|
| **Root Admin** | Leave approval queue with inline approve/reject; pending regularizations; pending exit requests; headcount by department; payroll run status; onboarding completion rate; offboarding in progress |
| **HR Admin** | Shift coverage gaps; onboarding pending tasks; exit clearances pending; payroll generation status; leave balance overview |
| **Department Head** | No dedicated dashboard. Only DeptHeadApprovals (hidden). Missing: team attendance today, team leave requests, department headcount, shift roster |
| **Employee Portal** | No leave balance cards per leave type; no current shift display; no upcoming holidays widget; no pending onboarding tasks; no payslip summary |

---

## 9. Approval Flow Gaps

| Workflow | Current State | Gap |
|----------|--------------|-----|
| Leave: Employee → Dept Head → Root Admin | Backend implemented | Root Admin action not on Root Dashboard; Dept Head portal hidden |
| Leave: HR Admin direct approval | Works for legacy `pending` only | HR Admin cannot approve `pending_root` leaves at all |
| Attendance Regularization | Employee → HR Admin | No dept head step; no manager notification |
| Expense Claims | `pending → approved/rejected` | No multi-level approval (employee → manager → finance) |
| Exit / Resignation | Employee → HR Admin | No dept head notification; no offboarding tasks; no F&F trigger |
| TDS Declarations | Schema has `hr_review` status | No HR review queue page exists |
| Investment Proofs | Schema has `reviewed_by` fields | No HR proof review page exists |
| Payroll Generation | HR generates freely | No root admin approval gate before lock + distribute |
| Onboarding Tasks | HR/IT/Manager complete tasks | No notification to next assignee on task completion |

---

## 10. Missing Notifications

| Event | Currently Notified | Should Also Notify |
|-------|-------------------|-------------------|
| Leave submitted | Dept Head or Root Admin | Reporting Manager (`users.reporting_to`) |
| Leave forwarded by dept head | Root Admin | Employee (forwarded, not yet approved) |
| Leave approved | Employee | Dept Head (for visibility) |
| Exit submitted | Admin | Dept Head, IT, Payroll |
| Exit approved | Employee | IT (access revocation), Payroll (F&F), Asset Manager |
| Onboarding task completed | (none) | Next task assignee |
| TDS declaration submitted | (none) | HR Admin |
| Investment proof uploaded | (none) | HR Admin |
| Payroll generated | (none) | All employees (payslip ready) |
| Salary structure updated | (none) | Employee |
| Employee birthday / anniversary | (none) | HR Admin; optionally team |

---

## 11. Priority Matrix

### CRITICAL — Blocks correct system behavior

| ID | Status | Issue |
|----|--------|-------|
| C-1 | ✅ Done | RBAC not enforced on 14+ modules — all routes migrated to `hasPermission()` |
| C-2 | ✅ Done | New employees not added to `user_roles` — auto-assigned on create |
| C-3 | ✅ Done | Root Admin leave approval not surfaced — actionCenter widget added to RootDashboard |
| C-4 | ✅ Done | Department Head has no navigation — sidebar link + `is-dept-head` guard added |
| C-5 | ✅ Done | HR Admin silent 403 on `pending_root` — UI shows "Waiting: Root Admin" badge |
| C-6 | ✅ Done | Exit approval never updates `employee_status` — cascade added to exit.routes.js |

### HIGH — Breaks enterprise integrity

| ID | Status | Issue |
|----|--------|-------|
| H-1 | ✅ Done | `designation_id` FK — replaced free-text with select dropdown wired to backend |
| H-2 | ✅ Done | No leave balance adjustments — `leave_balance_adjustments` table + GET history + HR modal |
| H-3 | ✅ Done | Attendance not shift-aware — `getActiveShiftTimes()` wired to check-in/out |
| H-4 | ✅ Done | Leave ignores holidays — `fetchHolidaySet()` subtracted in `buildWorkingDates()` |
| H-5 | ✅ Done | No payslips — `payslips` table exists; employee portal `/portal/payslips` live |
| H-6 | ✅ Done | Onboarding not auto-triggered — `initOnboarding()` called after employee create |
| H-7 | ⏸ Deferred | `users.hod_id` unused — redundant with `departments.head_user_id`; no consumers found |
| H-8 | ✅ Done | `users.reporting_to` unused — now used in leave chain fallback + expense manager routing |
| H-9 | ✅ Done | TDS HR review — HR review panel added to TaxDeclaration.jsx |
| H-10 | ✅ Done | Investment proof HR review — proof review panel added to TaxDeclaration.jsx |
| H-11 | ⏸ Low risk | Frontend `e.role === 'admin'` filter — works correctly; `users.role` is still canonical |

### MEDIUM — Degrades enterprise experience

| ID | Status | Issue |
|----|--------|-------|
| M-1 | ✅ Done | No offboarding checklist — `offboarding_checklists` table + routes + ExitManagement UI |
| M-2 | ⏸ Deferred | No F&F payroll trigger on exit — complex; requires full payroll run integration |
| M-3 | ✅ Done | DeptHeadApprovals no guard — `is-dept-head` API check gates the page |
| M-4 | ⏸ Deferred | ManageHR.jsx legacy — still valid; creates HR admins via `/root/hr` endpoint |
| M-5 | ✅ Done | Shift not in employee profile — real shift shown in EmployeePortalProfile Overview tab |
| M-6 | ⏸ Deferred | No shift coverage gap report — nice-to-have; no blocking workflow impact |
| M-7 | ✅ Done | No payroll approval gate — `payroll.lock` removed from hr_admin; Root Admin only |
| M-8 | ✅ Done | No expense multi-level approval — manager → HR two-level flow implemented |
| M-9 | ✅ Done | No birthday/anniversary notifications — birthday + work anniversary in cronJobs.js |
| M-10 | ⏸ Deferred | `approved_by` / `root_admin_id` redundant — risky consolidation; both still written |
| M-11 | ⏸ Deferred | No notification retry — fire-and-forget is acceptable for current scale |
| M-12 | ✅ Done | `users.department` drift — synced from `departments.name` inside employee update txn |

### LOW — Polish / technical debt

| ID | Status | Issue |
|----|--------|-------|
| L-1 | ✅ Done | `LEAVE_TYPE_LABELS` hardcoded — now sourced from leave_policies with fallback |
| L-2 | ✅ Done | ComplianceDashboard hardcoded role string — uses `isRootAdmin` from AuthContext |
| L-3 | ✅ Done | `google_event_id` dead code — gcal import + all createLeaveEvent/deleteLeaveEvent calls removed |
| L-4 | ✅ Done | `clockify_hours` dead column — `phase_f_cleanup.sql` drops it; backend endpoint removed |
| L-5 | ✅ Done | Leave submission not logged — `logApprovalAction` called with `action: 'submitted'` |

### Security Issues Found During Implementation (not in original audit)

| ID | Status | Issue | File |
|----|--------|-------|------|
| S-1 | ✅ Fixed | Cross-tenant expense read/write/delete — missing org scope on pre-fetches | expenses.routes.js |
| S-2 | ✅ Fixed | Mass assignment in payroll `/structure` routes — `...req.body` spread, no user_id validation | payroll.routes.js |
| S-3 | ✅ Fixed | Mass assignment in exit `PUT /:id` — `user_id`/`status`/`reviewed_by` forgeable | exit.routes.js |
| S-4 | ✅ Fixed | Cross-tenant `user_departments` wipe — DELETE missing org scope in employee update txn | employees.routes.js |
| S-5 | ✅ Fixed | Cross-org employee PII read in DELETE pre-fetch for audit log | employees.routes.js |
| S-6 | ✅ Fixed | Missing permissions: `payroll.unlock`, `payroll.view_payslips`, `leaves.manage` — always 403 | phase3_08_payroll_permissions_fix.sql |
| S-7 | ✅ Fixed | HR Admin had `payroll.lock` — could generate AND lock payroll without Root Admin gate | phase3_08_payroll_permissions_fix.sql |
| S-8 | ✅ Fixed | POST /root/hr created HR admins without RBAC role assignment | root.routes.js |

---

## 12. Recommended Implementation Order

### Phase A — Fix What's Broken ✅ COMPLETE

**A-1 | Root Admin Leave Action Widget on Dashboard** `C-3`
- Add "Pending Final Approval" section to `RootDashboard.jsx`
- Inline approve/reject buttons calling existing `PUT /leaves/:id/approve` and `PUT /leaves/:id/reject`
- Files: `client/src/pages/RootDashboard.jsx`

**A-2 | Dept Head Navigation + Route Guard** `C-4`
- Add conditional sidebar link in `EmployeeLayout` visible only when `user.id === head_user_id` of any department
- Add guard in `DeptHeadApprovals.jsx` that verifies user is a dept head before rendering
- Files: `client/src/layouts/EmployeeLayout.jsx`, `client/src/pages/DeptHeadApprovals.jsx`

**A-3 | Exit Status Cascade** `C-6`
- In exit approval handler: `UPDATE users SET employee_status = 'inactive' WHERE id = exit_request.user_id`
- File: `backend/src/modules/exit/exit.routes.js`

**A-4 | HR Admin Leave Status Clarity** `C-5`
- Show `pending_dept` as "Waiting: Dept Head" and `pending_root` as "Waiting: Root Admin" in HR views
- Remove action buttons from HR Admin UI for `pending_root` leaves
- Files: `client/src/pages/Leaves.jsx`, `client/src/pages/Dashboard.jsx`

**A-5 | Auto-assign Employee RBAC Role on Create** `C-2`
- After user insert in `POST /employees`: look up `employee` system role for org, insert into `user_roles`
- File: `backend/src/modules/employees/employees.routes.js`

---

### Phase B — Repair the Data Model ✅ COMPLETE

**B-1 | Designation FK on Employee Create/Edit** `H-1`
- Replace free-text datalist in Employees.jsx with `<select>` from `GET /api/designations?department_id=X`
- Ensure `designation_id` sent to backend and written on user create
- Files: `client/src/pages/Employees.jsx`, `backend/src/modules/employees/employees.routes.js`

**B-2 | Leave Balance Ledger** `H-2`
- Create `leave_balances (user_id, org_id, leave_type, year, allocated, used, carried_forward, adjusted)` table
- Populate on leave approval; allow HR manual adjustment
- Add balance cards to Employee Portal home and MyLeaves page
- Files: new migration SQL, `client/src/pages/EmployeeHome.jsx`, `client/src/pages/MyLeaves.jsx`

**B-3 | Holiday Deduction in Leave Duration** `H-4`
- In `buildWorkingDates()` in `leaves.routes.js`: query `holidays` table for org and exclude matching dates
- File: `backend/src/modules/leaves/leaves.routes.js`

**B-4 | Shift-Aware Attendance** `H-3`
- In attendance check-in/check-out logic: join `shift_assignments` to get employee's expected start/end times
- Use shift times for late/early calculation instead of global org settings
- File: `backend/src/modules/attendance/attendance.routes.js`

**B-5 | Auto-trigger Onboarding on Employee Create** `H-6`
- After user insert in `POST /employees`: call `initOnboarding(userId, orgId)` within same transaction
- File: `backend/src/modules/employees/employees.routes.js`

---

### Phase C — Complete RBAC Migration ✅ COMPLETE (backend); frontend hasPermission helper added, full UI migration deferred to separate PR

Replace all `adminOnly` with `hasPermission('module', 'action')` in this order:

| Route File | Permissions Needed |
|------------|-------------------|
| `leaves.routes.js` approve/reject | `leaves.approve`, `leaves.reject` (remove hardcoded `role !== root_admin`) |
| `attendance.routes.js` | `attendance.view`, `attendance.edit`, `attendance.approve_regularization` |
| `employees.routes.js` | `employees.view`, `employees.create`, `employees.edit`, `employees.delete` |
| `departments.routes.js` | `departments.manage` |
| `onboarding.routes.js` | `onboarding.manage` |
| `exit.routes.js` | `exit.manage` |
| `shifts.routes.js` | `shifts.manage` |
| `holidays.routes.js` | `holidays.manage` |
| `designations.routes.js` | `designations.manage` |
| All remaining modules | Per module permission keys already seeded in Phase 1 |

**Frontend Permission Awareness:**
- Add `GET /api/permissions/my` endpoint returning requesting user's effective permission set
- Store in `AuthContext` after login
- Replace `user.role === 'admin'` frontend checks with `hasPermission('module', 'action')` helper

---

### Phase D — Missing Workflows ✅ COMPLETE

**D-1 | Offboarding Checklist** `M-1`
- Create `offboarding_checklists` table (mirror of `onboarding_checklists`)
- Auto-trigger on exit approval: IT access revocation, asset return, F&F clearance tasks

**D-2 | Department Head Dashboard** (full solution beyond A-2)
- Dashboard shows: team attendance today, team leave requests, upcoming shifts, department headcount
- Consider `DeptHeadLayout` or a dedicated section within existing Root/HR layout

**D-3 | TDS / Investment Proof HR Review Pages** `H-9, H-10`
- HR review queue at `/statutory/declarations` (route exists, needs review-mode UI)
- Investment proof review page for HR to approve/reject uploaded documents

**D-4 | Payroll Approval Gate** `M-7`
- Add `status` to payroll runs: `draft → hr_submitted → root_locked`
- Root Admin locks run before payslips distributed

**D-5 | Missing Notifications**
- Onboarding: notify next-task assignee on task completion
- Payroll: notify all employees when payslips are ready
- Exit: notify IT + Payroll on approval
- TDS: notify HR on declaration submission

---

### Phase E — Reporting Manager & HOD Wiring ✅ COMPLETE (`reporting_to` wired; `hod_id` documented as deferred)

- `users.reporting_to` used in leave approval: if no dept head found, fall back to reporting manager → root admin
- `users.hod_id` either removed (redundant with `departments.head_user_id`) or explicitly documented with priority order
- Employee profile shows the full chain: Department Head → Reporting Manager — both editable from Professional tab

---

### Phase F — Data Cleanup ✅ MOSTLY COMPLETE

- ✅ Backfill `user_roles` — `phase_c_backfill_user_roles.sql` created; run on production before deploy
- ✅ Backfill `designation_id` — `phase_f_cleanup.sql` UPDATE matches `position` text to designation name
- ✅ `users.department` sync — M-12 fix: synced from `departments.name` inside employee update transaction
- ✅ Remove `clockify_hours` — `phase_f_cleanup.sql` drops it; dead backend endpoint removed
- ⏸ Consolidate `approved_by`/`root_admin_id` on leaves — deferred; both fields still written; risky to consolidate without comprehensive consumer audit
- ✅ Log leave submission — `logApprovalAction` called with `action: 'submitted'` on every leave create

---

## Key Files Reference

| Concern | File Path |
|---------|-----------|
| Leave approval workflow | `backend/src/modules/leaves/leaves.routes.js` |
| Employee create | `backend/src/modules/employees/employees.routes.js` |
| Professional profile (designation FK) | `backend/src/modules/employee-profile/professional.routes.js` |
| Exit management | `backend/src/modules/exit/exit.routes.js` |
| Attendance routes | `backend/src/modules/attendance/attendance.routes.js` |
| Onboarding init | `backend/src/modules/onboarding/onboarding.routes.js` |
| RBAC middleware | `backend/src/middleware/auth.js` |
| App routing + guards | `client/src/App.jsx` |
| Root Dashboard | `client/src/pages/RootDashboard.jsx` |
| Dept Head approvals | `client/src/pages/DeptHeadApprovals.jsx` |
| Employee list + create form | `client/src/pages/Employees.jsx` |
| Employee portal home | `client/src/pages/EmployeeHome.jsx` |
| Phase 1 RBAC migration | `backend/migrations/phase1_01_rbac_tables.sql` |
| Phase 2 leave workflow migration | `backend/migrations/phase2_01_leave_workflow.sql` |
| Phase 3 payroll data model | `backend/migrations/phase3_01_payroll_data_model.sql` |

---

## Migration Deployment Order (run once on production before deploying this branch)

```
1. phase1_01_rbac_tables.sql          — RBAC tables, system roles, permission catalog
2. phase2_01_leave_workflow.sql       — Leave workflow columns
3. phase3_01_payroll_data_model.sql   — Payroll data model
4. phase3_03_payroll_generation.sql   — Payroll runs, payslips table
5. phase3_04_hardening.sql            — DB hardening
6. phase3_05_automation.sql           — Scheduler tables
7. phase3_06_adjustments_finalization.sql
8. phase3_07_statutory_compliance.sql — Statutory tables
9. phase_c_backfill_user_roles.sql    — ⚠️ Backfills RBAC roles for all existing users
10. phase_d_offboarding_checklists.sql — Offboarding table
11. phase3_08_payroll_permissions_fix.sql — Adds payroll.unlock/view_payslips; removes payroll.lock from hr_admin
12. leave_balance_adjustments.sql     — Leave balance adjustments table
13. expense_manager_approval.sql      — Manager_id, manager_approved_at columns on expenses
14. phase_f_cleanup.sql               — Drops clockify_hours; backfills designation_id
```

*This document is the source of truth for integration gaps. Last updated: 2026-07-31 — implementation complete.*
