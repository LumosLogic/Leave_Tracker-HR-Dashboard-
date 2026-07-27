# Lumos Logic HRMS — QA Context

## Tech Stack
- Frontend: React 18.3.1 + Vite 5.3.1, TailwindCSS 3.4.4, React Router DOM 6.23.1, TanStack React Query 5, FullCalendar 6, Chart.js 4, Radix UI, Lucide icons
- Backend: Node.js, Express 4.18.2, JWT 9.0.2, bcryptjs, Multer, otplib (TOTP), web-push, Nodemailer
- Database: PostgreSQL 8 (pg adapter), self-hosted; Supabase JS present as a legacy compatibility layer only
- Hosting / Infrastructure: Hostinger VPS (187.127.146.194), Nginx reverse proxy on 80/443, Node on port 3000, static SPA served from `/public`
- Key third-party services: Cloudinary (image/doc CDN), Google Calendar API (leave/holiday sync), Gmail SMTP (transactional email), ZKTeco ADMS (biometric device integration), Web Push / VAPID (browser notifications)

---

## Environments

| Environment | URL |
|-------------|-----|
| Production | http://187.127.146.194 (Nginx on port 80/443) |
| Staging | Not configured — dev branch deploys manually to VPS |
| Development | http://localhost:5173 (Vite) → proxies /api to http://localhost:3000 |
| Design (Figma/Zeplin) | Not linked in codebase |
| GitHub Repo | Not public — internal repository |
| Swagger / API Docs | Not configured — use this document + Postman |
| Postman Collection | Not committed — build from routes listed in Project Structure |
| Jira / Project Board | Not linked in codebase |

---

## Test Credentials
> Fill these in manually — do not pull from code.

| Role | Username / Email | Password | Notes |
|------|-----------------|----------|-------|
| Root Admin | admin@lumoslogic.com | *(set manually)* | Full org + user management; accesses /root/* routes |
| HR Admin | hradmin@test.com | *(set manually)* | Manages employees, leaves, attendance; /dashboard |
| Employee | employee@test.com | *(set manually)* | Self-service only; /portal/* routes |
| Platform Admin | *(platform admin email)* | *(set manually)* | Platform-level SPA at /admin; manages all orgs |

---

## App Roles & What They Can Do

- **platform_admin** — Manages all organizations from the separate Platform Admin SPA (`/admin`). Can approve/reject org registration requests, toggle feature flags per org, assign plans (free/gold/platinum), manage root admins. Does not access employee or leave data.

- **root_admin** — Top-level admin within a single organization. Can do everything `admin` can, plus: manage HR admins, configure org settings (SMTP, Google Calendar, work schedule), manage root admin accounts, send broadcasts. Accesses `/root/*` and all `/dashboard` routes.

- **admin (HR Admin)** — Manages employees, leaves, attendance, departments, holidays, regularization, payroll, assets, documents, announcements. Can approve/reject leave and regularization requests. Cannot manage other admin accounts.

- **employee** — Self-service role. Can apply for leaves, check in/out, start/end breaks, submit regularization requests, view team calendar, upload documents, view payslips, and manage their own profile. Restricted entirely to `/portal/*` routes.

**Switching roles during testing:** Create separate user accounts per role via the admin dashboard (`/employees` → Add Employee → set role). Role is stored in the JWT; re-login required after role change.

**Feature flags** gate modules per org (e.g., payroll, biometric, expenses). Verify the target org has the relevant feature enabled via `/settings` before testing gated modules.

---

## Project Structure

### HR Admin / Root Admin Routes (`AppLayout`)
| Route | Access | Description |
|-------|--------|-------------|
| `/dashboard` | admin, root_admin | Overview stats: attendance summary, pending leaves, headcount |
| `/calendar` | admin, root_admin | Event calendar with leave and holiday overlay |
| `/leaves` | admin, root_admin | Leave approval queue; approve/reject with reason |
| `/employees` | admin, root_admin | Employee directory; add/edit/deactivate |
| `/employees/:id` | admin, root_admin | Employee detail: profile sub-modules (13 sections) |
| `/departments` | admin, root_admin | Department CRUD; multi-select assignment to employees |
| `/holidays` | admin, root_admin | Holiday calendar; national/optional/regional types |
| `/leave-policies` | admin, root_admin | Annual leave quota config (feature-gated) |
| `/regularization` | admin, root_admin | Attendance correction requests: approve/reject |
| `/reports` | admin, root_admin | HR reports (feature-gated) |
| `/documents` | admin, root_admin | HR document storage with expiry tracking |
| `/payroll` | admin, root_admin | Salary structures and payslips (feature-gated) |
| `/assets` | admin, root_admin | IT asset assignment (feature-gated) |
| `/expenses` | admin, root_admin | Reimbursement tracking (feature-gated) |
| `/announcements` | admin, root_admin | Company-wide broadcasts |
| `/shifts` | admin, root_admin | Shift schedule management |
| `/performance` | admin, root_admin | Performance reviews (stub — limited functionality) |
| `/onboarding` | admin, root_admin | Employee onboarding checklists |
| `/exit-management` | admin, root_admin | Offboarding workflow |
| `/biometric/devices` | admin, root_admin | ZKTeco device list and status (feature-gated) |
| `/biometric/mapping` | admin, root_admin | Employee PIN-to-user mapping |
| `/biometric/logs` | admin, root_admin | Raw biometric punch logs (paginated) |
| `/biometric/settings` | admin, root_admin | Biometric config (feature-gated) |
| `/settings` | admin, root_admin | Org settings: SMTP, Google Calendar, work schedule |
| `/profile` | admin, root_admin | Admin's own profile |
| `/notifications` | all roles | In-app notification center |

### Root Admin-Only Routes
| Route | Description |
|-------|-------------|
| `/pending-approvals` | Cross-admin approval queue |
| `/root/dashboard` | Org-level admin overview |
| `/root/manage-hr` | Add/deactivate HR admins |
| `/root/manage-root-admins` | Manage root admin accounts |
| `/root/broadcast` | Send org-wide broadcast messages |
| `/root/org-settings` | Full org configuration |

### Employee Portal Routes (`/portal/*`)
| Route | Description |
|-------|-------------|
| `/portal/home` | Employee dashboard: today's attendance, leave balance, announcements |
| `/portal/leaves` | Apply for leave; view leave history and balance |
| `/portal/attendance` | Monthly attendance log with break details |
| `/portal/team-calendar` | Read-only view of team's approved leaves |
| `/portal/regularization` | Submit attendance correction requests |
| `/portal/documents` | Personal HR documents |
| `/portal/expenses` | Submit and track reimbursements |
| `/portal/payslips` | View and download payslips |
| `/portal/performance` | View performance reviews |
| `/portal/onboarding` | Personal onboarding checklist |
| `/portal/announcements` | Company announcements |
| `/portal/profile` | Personal profile (13 sub-sections) |

### Public Routes (No Auth)
| Route | Description |
|-------|-------------|
| `/` | Landing page (redirects logged-in users) |
| `/login` | Email + password login; TOTP step if 2FA enabled |
| `/register` | Org registration form (creates a pending request) |
| `/forgot-password` | Request password reset email |
| `/reset-password` | Set new password via emailed token |

### Platform Admin SPA (`/admin/*`)
- Separate React SPA served at `/admin`
- Manages: organizations, registration requests, root admins, feature flags, platform stats

---

## Key User Flows

### Login Flow
1. Navigate to `/login`
2. Enter email and password
3. If the account has TOTP 2FA enabled, server returns `{ requires2FA: true }` — user is redirected to enter a 6-digit authenticator code
4. On success, JWT (7-day) is stored in `localStorage` as `lt_token`; user object stored as `lt_user`
5. App redirects by role: `root_admin` / `admin` → `/dashboard`; `employee` → `/portal/home`; `platform_admin` → `/admin`
6. Token expiry auto-logs the user out; mid-session 401 dispatches `auth:expired` event

### Leave Application & Approval Flow
1. Employee navigates to `/portal/leaves` → clicks **Apply Leave**
2. Selects leave type (annual/sick/casual/emergency/other), dates, full/half day, reason
3. System calls `/leaves/date-check` to validate: conflicts, existing attendance, leave balance
4. On submit, leave is created with `status='pending'`; email notification sent to HR/company heads
5. HR Admin sees pending leave in `/leaves` → clicks **Approve** or **Reject** with optional reason
6. On approval: Google Calendar event created, email sent to employee, leave balance decremented
7. Employee sees updated status in `/portal/leaves`

### Attendance Check-In / Check-Out Flow
1. Employee opens `/portal/home` or `/portal/attendance`
2. Clicks **Check In** → POST `/attendance/checkin`; system records time, flags `is_late` if past threshold
3. Optionally: clicks **Break In** / **Break Out** to track break time
4. Clicks **Check Out** → POST `/attendance/checkout`; system computes `work_hours = (checkout - checkin) - total_break_minutes`, sets `status` (present/half_day/absent)
5. Biometric-enabled orgs: ZKTeco device POSTs to `/iclock/cdata`; system matches `employee_pin` → `user_id` and updates attendance automatically

### Regularization (Attendance Correction) Flow
1. Employee navigates to `/portal/regularization` → submits correction for a missed or wrong punch
2. Request stored as `status='pending'`; HR sees it in `/regularization`
3. HR reviews: **Approve** or **Reject** with notes
4. On approval: attendance record updated, overlapping leaves may be cancelled, email confirmation sent

### Onboarding Flow
1. HR Admin navigates to `/onboarding` → selects new employee → clicks **Initialize Onboarding**
2. POST `/onboarding/init/:userId` creates default checklist tasks split by assignee (employee, HR, IT, manager)
3. Each party completes their tasks; completion % shown on dashboard
4. Employee sees their own tasks in `/portal/onboarding`
5. Admin marks tasks complete; notification sent on init and completion

### Org Registration Flow (Platform Admin)
1. New customer fills `/register` → POST `/register-org` → `status='pending'` request created
2. Platform Admin sees request in their SPA → reviews details
3. Platform Admin approves → org + root admin user created; welcome email with credentials sent
4. Root admin logs in, configures org settings, invites HR admins

---

## Known Bugs / QA Warnings

- **Payroll month calculation**: Last day of month is hardcoded as `31` in `payroll.routes.js` — payslips for February and 30-day months may show incorrect ranges. Avoid production payroll testing for short months.
- **Performance module is a stub**: The `/performance` route exists but has minimal backend implementation. Do not test advanced performance features — expect empty states.
- **Feature flag polling delay**: Flags poll every 30 seconds. After enabling a feature in settings, wait up to 30 seconds before the UI reflects the change — do not assume the feature is broken if it doesn't appear immediately.
- **Biometric device data is unauthenticated**: The `/iclock/cdata` endpoint accepts POST from any IP. In test environments, spoofed punch data can corrupt attendance records. Do not leave biometric test data in production DBs.
- **Timezone is hardcoded to Asia/Kolkata (IST)**: All date/time logic assumes IST. If testing from a different timezone, date boundaries (e.g., midnight check-ins) may behave unexpectedly.
- **No rate limiting on login**: Automated credential testing will not hit a lockout. This is expected but means brute-force testing is possible in staging.
- **Leave balance edge cases**: Half-day, WFH, and emergency leave types interact with balance in non-obvious ways. Test each type independently before combining in multi-day requests.
- **Google Calendar sync is optional**: If `GOOGLE_CALENDAR_ID` or service account is not configured, leave approval still succeeds — the calendar step silently fails. Do not use Calendar sync failures as a leave approval bug signal.
- **Password reset token**: Token expiry implementation should be verified — confirm that old tokens are rejected; this is not explicitly enforced in all code paths.
- **Regularization + concurrent leave**: Approving a regularization request for a date that already has an approved leave may cancel the leave. Test this sequence deliberately; the reverse (leave approved after regularization) has less coverage.
- **Payslip downloads**: The XLSX export in reports uses a dev dependency — verify it is bundled correctly in production before testing exports.
- **Employee departments are multi-select (junction table)**: Editing an employee's department replaces all assignments. Do not assume a single-select UI — verify checkbox state reflects the DB junction table `user_departments`.

---

## Additional QA Notes

### Environment Setup
- The backend requires a `.env` file with all variables from `.env.example` populated. Missing `JWT_SECRET`, `DB_*`, or `SMTP_*` vars will cause startup failures or silent send errors.
- `DB_TYPE=postgres` must be set; the Supabase adapter is a wrapper and does not require a Supabase account.
- Feature flags are database-driven. After a fresh DB setup, run the org feature initialization or manually insert rows into `organization_features` to enable modules for testing.

### Seeding Test Data
- No automated seed script exists. Create test data via the UI or direct SQL inserts.
- Minimum viable test setup: one organization, one root_admin user, one admin user, two employee users, at least one department, and a work schedule row in `work_schedule`.
- Biometric testing requires at least one row in `biometric_devices` and a matching row in `biometric_employee_map`.

### Resetting Test Data
- Attendance records: `DELETE FROM attendance WHERE organization_id = <id>;`
- Leave balances: Recalculate via approved leaves; no separate balance table — balance is computed on-the-fly from leave records and `total_annual_leaves` in `organizations`.
- Regularization: `DELETE FROM attendance_regularization WHERE organization_id = <id>;`
- Onboarding: `DELETE FROM onboarding_checklists WHERE organization_id = <id>;`

### Feature Flags Reference
The following features are toggled per org in `organization_features`. All are off by default on the `free` plan:

| Feature Key | Module |
|-------------|--------|
| `payroll` | Payroll & payslips |
| `expenses` | Reimbursements |
| `assets` | IT asset tracking |
| `reports` | HR reports |
| `performance` | Performance reviews |
| `documents` | Document storage |
| `onboarding` | Onboarding checklists |
| `exit_management` | Exit process |
| `announcements` | Broadcasts |
| `regularization` | Attendance corrections |
| `shifts` | Shift management |
| `leave_policies` | Leave quota config |
| `biometric` | ZKTeco integration |
| `branches` | Branch entity |
| `push_notifications` | Web push |

Plan presets: `free` → minimal features; `gold` → most features; `platinum` → all features including biometric and branches.

### Email Testing
- Email uses Gmail SMTP with an App Password. In development, point `SMTP_USER`/`SMTP_PASS` to a test Gmail account or use a service like Mailtrap to intercept outgoing mail without delivering it.
- Triggered emails: leave applied, leave approved/rejected, welcome employee, password reset, birthday wish, holiday reminder, org registration received.

### Biometric Testing
- Use a real ZKTeco device or simulate with a direct POST to `/iclock/cdata` with the device serial and employee PIN in the payload.
- Verify the `biometric_employee_map` has a matching `employee_pin` → `user_id` entry before testing punch sync, or the log will remain unmatched in `biometric_raw_logs`.

### 2FA / TOTP Testing
- Requires an authenticator app (Google Authenticator, Authy).
- Enable via profile settings → Security → Setup 2FA → scan QR.
- Disabling TOTP requires the user to be logged in and confirm with a valid code.
- Test the mid-login TOTP step: login with valid credentials, confirm you land on the TOTP prompt, not the dashboard.

### Multi-Org Isolation
- Always verify that API responses for one org do not leak data from another org. Every query should filter by `organization_id`.
- Create two orgs in the test DB and confirm that employees, leaves, and attendance from Org A are not visible when logged in as Org B.
