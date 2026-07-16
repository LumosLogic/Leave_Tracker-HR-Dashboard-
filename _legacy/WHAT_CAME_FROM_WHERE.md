# Legacy Files — What Came From Where
**Archived on:** 2026-07-16
**Reason:** Project restructured from a single monolithic `server.js` into a proper `backend/src/modules/` architecture.

These files are preserved for reference only. **Do not run them — they will conflict with the new backend.**

---

## File Map: Old → New

| Legacy File | Replaced By (in `backend/`) | Notes |
|---|---|---|
| `server.js` | `backend/src/server.js` | Monolithic 3514-line server split into 30 modules. New file is ~120 lines. |
| `db.js` | `backend/src/config/db.js` | Supabase client + seed function. Identical content, new location. |
| `emailService.js` | `backend/src/services/emailService.js` | All email templates and sendMail function. Identical content, new location. |
| `googleCalendarService.js` | `backend/src/services/googleCalendar.js` | Google Calendar API helpers. Identical content, new location. |
| `routes/departments.js` | `backend/src/modules/departments/departments.routes.js` | Only change: import path `../db` → `../../config/db` |
| `routes/designations.js` | `backend/src/modules/designations/designations.routes.js` | Same as above |
| `routes/holidays.js` | `backend/src/modules/holidays/holidays.routes.js` | Same as above |
| `routes/leavePolicies.js` | `backend/src/modules/leave-policies/leavePolicies.routes.js` | Same as above |
| `routes/regularization.js` | `backend/src/modules/regularization/regularization.routes.js` | Same as above |
| `routes/notifications.js` | `backend/src/modules/notifications/notifications.routes.js` | Same as above |
| `routes/reports.js` | `backend/src/modules/reports/reports.routes.js` | Same as above |
| `routes/documents.js` | `backend/src/modules/documents/documents.routes.js` | Same as above |
| `routes/payroll.js` | `backend/src/modules/payroll/payroll.routes.js` | Same as above |
| `routes/assets.js` | `backend/src/modules/assets/assets.routes.js` | Same as above |
| `routes/expenses.js` | `backend/src/modules/expenses/expenses.routes.js` | Same as above |
| `routes/announcements.js` | `backend/src/modules/announcements/announcements.routes.js` | Same as above |
| `routes/shifts.js` | `backend/src/modules/shifts/shifts.routes.js` | Same as above |
| `routes/performance.js` | `backend/src/modules/performance/performance.routes.js` | Same as above |
| `routes/onboarding.js` | `backend/src/modules/onboarding/onboarding.routes.js` | Same as above |
| `routes/exitManagement.js` | `backend/src/modules/exit/exit.routes.js` | Same as above |
| `check-users.js` | — | One-time utility script for debugging users table. No longer needed. |
| `create-root-admin.js` | — | One-time utility to seed a root admin. No longer needed — use DB directly. |
| `database.csv` | — | Data export snapshot from 2026-07-06. Kept for reference only. |

---

## What the Old `server.js` Contained (Now Split Into)

The 3514-line monolithic `server.js` inline route sections became these modules:

| Old Section (in server.js) | New Module |
|---|---|
| Auth routes (login, me, profile, password, etc.) | `backend/src/modules/auth/auth.routes.js` |
| Org registration + settings | `backend/src/modules/org/org.routes.js` |
| Platform admin routes | `backend/src/modules/platform/platform.routes.js` |
| Dashboard endpoint | `backend/src/modules/dashboard/dashboard.routes.js` |
| Employee CRUD | `backend/src/modules/employees/employees.routes.js` |
| Attendance (check-in/out, breaks, admin-edit) | `backend/src/modules/attendance/attendance.routes.js` |
| Leave management | `backend/src/modules/leaves/leaves.routes.js` |
| Push notifications | `backend/src/modules/push/push.routes.js` |
| Clockify integration | `backend/src/modules/clockify/clockify.routes.js` |
| Google Calendar integration | `backend/src/modules/calendar/calendar.routes.js` |
| Admin archives | `backend/src/modules/archives/archives.routes.js` |
| Work schedule settings | `backend/src/modules/settings/settings.routes.js` |
| Analytics endpoints | `backend/src/modules/analytics/analytics.routes.js` |
| Root admin management | `backend/src/modules/root/root.routes.js` |
| Helpers + middleware (auth, adminOnly, etc.) | `backend/src/middleware/auth.js` |
| Feature flag system | `backend/src/middleware/featureFlag.js` |
| Utility functions (localDateStr, flat, etc.) | `backend/src/utils/helpers.js` |
| Cron jobs (birthday, holiday reminders) | `backend/src/utils/cronJobs.js` |
| Web push helper (sendPushToUsers) | `backend/src/services/pushService.js` |

---

## Safe to Delete?

These files can be permanently deleted once the new backend has been running stable in production for 2+ weeks:
- `server.js`
- `db.js`
- `emailService.js`
- `googleCalendarService.js`
- `routes/` (entire folder)
- `check-users.js`
- `create-root-admin.js`
- `database.csv` (unless needed for data reference)
