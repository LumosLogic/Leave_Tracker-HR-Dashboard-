---
name: project-hrms-implementation
description: Full HRMS implementation added 2026-06-04 — all new modules, routes, pages, and DB migration
metadata:
  type: project
---

Full HRMS system built on top of the existing Leave Tracker. Implemented 2026-06-04.

**Why:** User wants to turn the Leave Tracker into a complete HRMS SaaS platform usable by multiple companies.

**What was added:**

### Database
- `hrms_full_migration.sql` — run in Supabase SQL Editor to add all new tables
- New tables: departments, designations, leave_policies, attendance_regularization, notifications, payroll_structures, payslips, employee_documents, assets, expenses, announcements, shifts, shift_assignments, performance_goals, performance_reviews, onboarding_checklists, exit_requests
- New columns on users table: employee_id, phone, gender, address, employment_type, employment_status, date_of_joining, confirmation_date, reporting_to, emergency contacts, bank details, profile_photo_url, department_id, designation_id

### Backend (routes/ folder)
- `routes/departments.js` — CRUD for departments
- `routes/designations.js` — CRUD for designations
- `routes/holidays.js` — CRUD + bulk import for holidays
- `routes/leavePolicies.js` — per-type leave policy config
- `routes/regularization.js` — attendance correction requests + approval
- `routes/notifications.js` — in-app notifications (read, mark-all-read, delete)
- `routes/reports.js` — attendance/leave/employee CSV exports
- `routes/documents.js` — Cloudinary file upload + employee docs CRUD
- `routes/payroll.js` — salary structures + payslip generation with LOP
- `routes/assets.js` — asset registry CRUD + assignment
- `routes/expenses.js` — expense claims + Cloudinary receipt upload + approval
- `routes/announcements.js` — company announcements with notifications
- `routes/shifts.js` — shift definitions + bulk assignment/roster
- `routes/performance.js` — goals + reviews (self + manager assessment)
- `routes/onboarding.js` — default checklist init + task completion tracking
- `routes/exitManagement.js` — resignation + clearance + offboarding

All routes mounted in server.js under `/api/*` prefix with JWT auth middleware.

### Frontend (client/src/pages/)
New pages: Departments, Holidays, LeavePolicies, Regularization, Reports, Documents, Payroll, Assets, Expenses, Announcements, Shifts, Performance, Onboarding, ExitManagement, NotificationCenter (admin), TeamCalendar (employee portal), NotificationCenter (employee portal)

### Navigation
- Sidebar.jsx (HR Admin): sections Overview, HR Management, Finance, People, Account — with notification badge
- RootLayout.jsx: same sections prefixed with /root/
- EmployeeLayout.jsx: sections My Workspace, Self Service, Growth, Company — with notification badge
- App.jsx: all new routes added for all 3 role areas

### External services
- Cloudinary: used for document uploads (routes/documents.js) and receipt uploads (routes/expenses.js)
- Env vars needed: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

**How to apply:** When adding new features or fixing bugs, check these route files and page components. The existing server.js (2150+ lines) still handles auth, attendance, leaves, dashboard, settings, org management — the new routes are separate files.

[[project_overview]]
[[project_multiorg]]
