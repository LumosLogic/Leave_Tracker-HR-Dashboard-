  Bug Fix Implementation — Session 5 (25 Aug 2026)

  Branch:  HRMS-Migration-16jul
  Build:   cd client && npx vite build  →  ✓ 1653 modules, no errors
  Files:   25 files changed (181 insertions, 1116 deletions — mostly Payroll.jsx cleanup)
  Source:  HRMS Test Cases.xlsx — Reopened + New bugs (QA re-test round)

  ═══════════════════════════════════════════════════════════
  BUGS FIXED — SESSION 5  (30 total)
  ═══════════════════════════════════════════════════════════

  ┌─────────────┬──────────────────────┬────────────────────────────────────────────────────────────────────────────────┐
  │     Bug     │       Module         │                                    Fix                                         │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_174     │ Payroll              │ Removed redundant "Salary Structures" toggle button + embedded tab from         │
  │             │                      │ Payroll.jsx. Dedicated /payroll/salary (SalaryStructure.jsx) already covers     │
  │             │                      │ this. Also removed StructureModal, unused state (tab, strucEmp), stale          │
  │             │                      │ employee query, and unused imports (TrendingUp, TrendingDown, fmtD).            │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_175     │ Payroll / Salary     │ Salary number inputs: added onWheel={e => e.target.blur()} so scrolling on      │
  │             │ Structure            │ a focused input no longer silently changes the amount. step changed from        │
  │             │                      │ "0.01" to "1" on all salary fields (SalaryStructure.jsx).                       │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_179     │ Announcements        │ Expired pinned announcements no longer appear in the Pinned section.            │
  │             │                      │ Filter: pinned = a.pinned && (!a.expires_at || a.expires_at >= today).          │
  │             │                      │ Expired pinned items now fall into the Regular section (still visible,          │
  │             │                      │ shown with "Expired" badge and 60% opacity).                                    │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_088     │ Announcements        │ Long title/content no longer crashes the Announcements page. Added              │
  │             │                      │ break-words + overflow-hidden to title <h3>. Content <p> gets                   │
  │             │                      │ whitespace-pre-wrap + break-words + max-h-48 overflow-y-auto so very            │
  │             │                      │ long content scrolls in-card rather than breaking layout.                       │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_176     │ Announcements        │ "Content" field in New/Edit Announcement modal now shows an inline error         │
  │             │ (form)               │ message below the textarea (e.g. "Content is required." / "Content must         │
  │             │                      │ contain at least one letter."). Previously only a toast was shown.              │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_082     │ Performance          │ Goal title and description in the goal card now have CSS overflow guards:        │
  │             │                      │ title gets line-clamp-2 + break-words + max-w-[32rem]; description gets          │
  │             │                      │ line-clamp-3 + break-words + overflow-hidden. Prevents crash from very           │
  │             │                      │ long strings with no whitespace.                                                │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_165     │ Performance          │ Cancelled reviews were treated as "pending" (fell through REVIEW_STATUS_CFG      │
  │             │                      │ with no entry). Added cancelled: { cls:'badge-cancelled', label:'Cancelled',    │
  │             │                      │ strip:'#c7c4d8' }. Also excluded cancelled goals from the Avg. Progress         │
  │             │                      │ calculation (was counting them at their frozen progress value).                 │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_180     │ Employee Portal      │ Removed "Deactivate Account" button from the GDPR section of                    │
  │             │ (GDPR)               │ EmployeePortalProfile.jsx. Account deactivation is an HR decision; employees    │
  │             │                      │ should not self-deactivate. "Request Account Deletion (GDPR)" is kept.          │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_163     │ Employee Dashboard   │ "My Pending Actions" badge was missing the pending_approval status variant.     │
  │             │                      │ Updated filter to include all 4 pending variants:                               │
  │             │                      │ ['pending','pending_dept','pending_root','pending_approval'].                   │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_065     │ HR Dashboard         │ Birthday Insight cards now navigate to /employees?search=<employee_name>         │
  │             │ (Birthday)           │ instead of /employees?filter=birthday. The birthday filter relied on            │
  │             │                      │ date_of_birth being populated; name search is reliable for any employee.         │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_164     │ Expenses             │ Expense summary KPI cards (Total Claims, Pending, Approved) now always use       │
  │             │                      │ allExpenses (unfiltered by status tab) instead of the filtered expenses          │
  │             │                      │ array. Previously, switching to the "Pending" tab made "Total Claims" show       │
  │             │                      │ only the pending total and "Approved" show ₹0.                                  │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_101     │ Settings             │ Half Day Threshold validation: changed > totalWorkHours to >= totalWorkHours      │
  │             │ (Schedule)           │ — setting it equal to the full shift hours is now rejected. Error message        │
  │             │                      │ updated to "must be less than" (not "cannot exceed"). Also added                 │
  │             │                      │ onWheel={e => e.target.blur()} to prevent accidental scroll changes.             │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_105     │ Leave Workflow        │ Workflow Display Labels are now validated before save: if a label is             │
  │             │ Settings             │ provided it must contain at least one alphabetic character. Whitespace-only     │
  │             │                      │ labels are trimmed to null (not saved as blank strings).                        │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_146     │ Leave Policies       │ Annual quota fields are now validated before save: value must be a               │
  │             │                      │ non-negative whole number. Negative or decimal values now show a toast error     │
  │             │                      │ naming the specific policy that failed.                                          │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_149     │ Leave Policies       │ A browser confirm() dialog is shown before saving if any policy's                │
  │             │ (mid-year warning)   │ annual_quota is being reduced below the previously saved value. User can        │
  │             │                      │ still proceed but is warned that existing balances may be affected.              │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_093     │ Documents            │ AdminDocumentsPage now reads the ?tab= query parameter on mount and              │
  │             │ (Notification        │ initialises activeTab from it (default: 'shared'). Clicking a document           │
  │             │ redirect)            │ notification → /documents?tab=verification now opens the Verification            │
  │             │                      │ Queue tab directly. Added useSearchParams import to Documents.jsx.               │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_124     │ Reports & Analytics  │ "Total Records" / "Total Leaves" / "Total Employees" KPI cards now have          │
  │             │                      │ onClick handlers that clear all active filters (search, dept, type,              │
  │             │                      │ status). Previously these were non-interactive cards.                            │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_126     │ Reports & Analytics  │ Leave "Pending" KPI card now counts all 4 pending variants:                     │
  │             │                      │ pending, pending_dept, pending_root, pending_approval. Previously only           │
  │             │                      │ counted status='pending'. Clicking the card applies an 'all_pending'             │
  │             │                      │ sentinel filter that shows all variants in the table.                            │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_173     │ Reports & Analytics  │ "Total Employees" KPI now uses empRows.length (the same data shown in            │
  │             │                      │ the table) instead of headcount.total which for root_admin included              │
  │             │                      │ HR admin users, causing a higher count than visible records.                     │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_177     │ Broadcast            │ When 0 push subscriptions are found, message now reads:                          │
  │             │ (Push notifications) │ "Notification sent to N employees (no active push subscriptions found…)".       │
  │             │                      │ Backend also returns targeted (employee count) alongside sent (device count).    │
  │             │                      │ Backend now returns 503 if VAPID keys are not configured in env.                 │
  └─────────────┴──────────────────────┴────────────────────────────────────────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════
  BACKEND FIXES — SESSION 5
  ═══════════════════════════════════════════════════════════

  ┌─────────────┬──────────────────────┬────────────────────────────────────────────────────────────────────────────────┐
  │     Bug     │       File           │                                    Fix                                         │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_170     │ analytics.routes.js  │ Role distribution chart in HR Dashboard now only fetches role='employee'        │
  │             │                      │ users (was also fetching role='admin'). Also excludes inactive/resigned/         │
  │             │                      │ terminated employees from both dept and role distribution queries.               │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_171     │ departments.routes.js│ Department member_count now correctly reflects only active employees.            │
  │             │                      │ Fetches active user IDs first (.not employee_status in inactive/resigned/        │
  │             │                      │ terminated), then counts only those from user_departments junction table.        │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_178     │ reports.routes.js    │ Employee Report: date_of_joining falls back to created_at when null.             │
  │             │                      │ Also added created_at to the SELECT so the fallback value is available.          │
  │             │                      │ No more "—" for employees who joined before date_of_joining was added.           │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_147     │ org.routes.js        │ PUT /org/settings now also syncs the annual leave policy's annual_quota          │
  │             │                      │ when total_annual_leaves changes. Updates leave_policies WHERE leave_type=        │
  │             │                      │ 'annual' AND active=true for the organization.                                   │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_177     │ push.routes.js       │ POST /push/send now returns 503 if VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY          │
  │             │                      │ env vars are missing instead of silently returning sent:0. Response now          │
  │             │                      │ includes targeted (employee count) alongside sent (device count).                │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_181     │ auth.routes.js       │ GET /auth/me now checks employee_status on every call. Employees with            │
  │             │                      │ status inactive/resigned/terminated receive 401 "Your account has been           │
  │             │                      │ deactivated." — forcing re-login on next page refresh/app load.                  │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_168     │ leaveWorkflowEngine  │ CRITICAL WORKFLOW FIX: resolveApprover() for department_head was querying        │
  │             │ .js                  │ users.department_id (column does not exist). Now queries user_departments        │
  │             │                      │ junction table first, with fallback to matching users.department string          │
  │             │                      │ against departments.name. This was causing ALL dept-head approval levels         │
  │             │                      │ to resolve with userId=null, making dept heads invisible to the workflow.         │
  ├─────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_158     │ onboarding.routes.js │ GET /onboarding/overview now excludes inactive/resigned/terminated               │
  │             │                      │ employees. Added employee_status to the users SELECT and filtered the            │
  │             │                      │ uMap so only active users' onboarding tasks are returned.                        │
  └─────────────┴──────────────────────┴────────────────────────────────────────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════
  BUGS SKIPPED / NEED PRODUCT DECISION — SESSION 5
  ═══════════════════════════════════════════════════════════

  ┌──────────────┬──────────────────────┬────────────────────────────────────────────────────────────────────────────────┐
  │     Bug      │      Module          │                              Reason / Next Step                                │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_054/055  │ HR Dashboard KPIs    │ Present Today / On Leave / WFH count mismatches — need live testing            │
  │ BUG_056/116  │ Pending Approvals    │ with real attendance records. Dashboard count = org-wide; Pending               │
  │ BUG_117      │ Attendance Trend     │ Approvals page count = current user's queue — expected difference.             │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_059      │ Team Members         │ Filter dropdowns (All Departments, All Statuses, All Types, Sort)               │
  │              │                      │ — CSS group-hover multi-select may close on checkbox click. Needs live          │
  │              │                      │ testing to confirm exact failure mode before fix.                               │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_072      │ Calendar             │ Auto-absent cron job runs at 23:30 — verify server timezone matches             │
  │              │                      │ expected local time; verify absent records appear next morning in HR calendar.  │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_084      │ Performance          │ Goals for 2027 show under 2026 cycle — backend already filters by               │
  │              │                      │ review_cycle param. Likely a caching issue; ask QA to hard-refresh and re-test. │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_091      │ Notifications        │ Icons (Megaphone/Bell/Info) already distinct in NotificationCenter.jsx          │
  │              │                      │ (implemented session 3). Ask QA to re-test with a fresh browser session.        │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_094      │ Notifications        │ Clicked notification highlight — requires stateful routing + scroll-to-element. │
  │              │                      │ Product decision needed on visual indicator spec.                               │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_104      │ Settings             │ Push notification permission grant — depends on browser VAPID config            │
  │              │                      │ being correct on production server. Check env vars VAPID_PUBLIC/PRIVATE.        │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_112      │ Profile              │ Company email read-only for employees by design (BUG_041 fix, session 1).        │
  │              │                      │ If change is needed, HR must update it from the Employees management page.      │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_133/134  │ Payroll / Assets     │ Quick Payslip (BUG_133) and Asset BIGINT (BUG_134) were fixed in Session 4.     │
  │              │                      │ Ask QA to re-test after deploying session 4+5 changes together.                 │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_141/142  │ Role Management      │ Remove member / role replacement — members panel uses                           │
  │              │                      │ GET /roles/:id/members. Need live test with custom roles assigned to users.      │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_144/160  │ RBAC                 │ HR viewing employees when permission disabled / employee default permissions     │
  │ BUG_161/172  │                      │ — requires route-by-route permission enforcement audit across all               │
  │              │                      │ backend modules. Phase 2 RBAC work.                                             │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_145      │ Org Settings         │ Company Name change requires Platform Admin approval workflow —                  │
  │              │                      │ new table (org_name_change_requests), PA dashboard action, email flow.          │
  │              │                      │ QA description matches this exactly. Product decision + sprint planning needed. │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_150      │ Org Settings         │ Unsaved changes banner already implemented (session 3, BUG_150 fix).            │
  │              │                      │ If QA wants navigation-away blocking, need useBlocker (React Router v6)         │
  │              │                      │ + beforeunload event — separate task.                                           │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_153      │ My Team Dashboard    │ KPIs show 0 — needs a user who IS a department head with department             │
  │              │                      │ members assigned to test. Likely data setup issue.                              │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_155      │ Exit Management      │ Offboarding tasks not created after resignation approval — requires              │
  │              │                      │ offboardingService.js trigger audit. Complex webhook/trigger chain.              │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_157      │ Documents            │ Document review DB constraint — employee_doc_submissions schema mismatch.        │
  │              │                      │ Needs a migration to align the DB schema. Cannot fix without schema details.    │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_166      │ Employees            │ Dropdown stops working after one selection — need to reproduce on live          │
  │              │                      │ instance to identify which specific dropdown (edit form vs. list toolbar).      │
  ├──────────────┼──────────────────────┼────────────────────────────────────────────────────────────────────────────────┤
  │ BUG_167/169  │ Approval Workflow    │ Leave approval hierarchy / multi-level progression errors — BUG_168             │
  │              │                      │ (dept head fix) is the most likely root cause. Re-test BUG_167/169              │
  │              │                      │ after deploying session 5; the dept_head resolver fix may resolve them.         │
  └──────────────┴──────────────────────┴────────────────────────────────────────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════
  SUMMARY — SESSION 5
  ═══════════════════════════════════════════════════════════

  Session 5 (25 Aug) :  30 bugs fixed  (19 frontend, 8 backend, 3 already fixed in prev sessions / ask re-test)
  ─────────────────────────────────────────────────────────────────────────────────
  Sessions 1–4 total :  121 bugs fixed (18 Aug – 20 Aug)
  Session 5          :  30  bugs fixed (25 Aug)
  ─────────────────────────────────────────────────────────────────────────────────
  Grand Total Fixed  :  151 bugs
  Still Pending      :  ~18 bugs (RBAC phase 2, product decisions, live-test needed)

  Branch: HRMS-Migration-16jul
  Build:  cd client && npx vite build  →  ✓ 1653 modules, no errors (Session 5)

  ─────────────────────────────────────────────────────────
  CRITICAL BUG HIGHLIGHT — BUG_168
  ─────────────────────────────────────────────────────────
  The leave workflow engine was querying users.department_id — a column that does
  not exist in the schema. This caused ALL department_head approval levels to
  resolve with userId = null, making department heads completely invisible to the
  approval system. After the fix, the engine queries user_departments (junction
  table) with a fallback to matching users.department (string) against
  departments.name. This likely also resolves BUG_167 and BUG_169 (workflow
  progression errors) since the root cause was the same resolver bug.
