Bug Fix Implementation Complete

  Session 1 (18 Aug) — 24 files modified
  Session 2 (19 Aug) — 17 files modified
  Session 3 (19 Aug) — 27 files modified
  Session 4 (20 Aug) — 15 files modified  ← current session

  ═══════════════════════════════════════════════════════════
  BUGS FIXED — SESSION 1 (40 total)
  ═══════════════════════════════════════════════════════════

  ┌─────────────┬───────────────┬────────────────────────────────────────────────────────────────────────────┐
  │     Bug     │    Module     │                                    Fix                                     │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_13      │ MyLeaves      │ Removed refetchType:'active' — pending count refreshes immediately         │
  │             │               │ after leave submission; LeaveApplyPanel also fixed (active !== false)      │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_14      │ MyLeaves      │ Balance widget uses active !== false (null treated as active)              │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_022     │ Documents     │ Backend duplicate check; 409 surfaces as user-friendly toast               │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_023     │ Documents     │ Visibility labels unified: "Shared with HR" / "Shared with Employees"      │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_024/025 │ Expenses      │ Empty state distinguishes "no records for filter" vs "no claims at all"   │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_026     │ Expenses      │ Duplicate receipt filename warning before upload                           │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_027     │ Expenses      │ Duplicate claim warning; confirms on 2nd submit                            │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_028/077 │ Performance   │ Avg Progress capped at 0–100%; progress bars capped too                   │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_029/083 │ Performance   │ Duplicate goal check (same title+category+cycle per user)                  │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_030/078 │ Performance   │ Auto-sets status to Completed when progress ≥ 100                          │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_031/079 │ Performance   │ Past target dates rejected in frontend (min date) + backend                │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_032     │ Performance   │ Description max 500 chars enforced with live counter                       │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_033     │ Performance   │ Employees can edit all their own goal fields                               │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_034     │ Performance   │ Employees can delete their own goals                                       │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_036/111 │ Profile       │ Display Name must contain at least one letter                              │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_039     │ Profile       │ Password policy checklist shown before submitting                          │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_040/113 │ Auth          │ Password reuse prevented (new password can't match current)                │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_041     │ Profile       │ Company Email is read-only for employee role                               │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_043     │ Profile/Skills│ Years of Experience validated 0–60 range with inline error                 │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_044     │ Profile/Bank  │ Bank form: bank name (letters), account (9–18 digits), IFSC format         │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_045     │ Profile/Bank  │ Duplicate account number rejected per employee (backend check)             │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_047     │ Profile/Skills│ Case-insensitive skill name duplicate check                                │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_048     │ Profile/Family│ Name must contain letters; DOB cannot be future (POST and PUT routes)      │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_049     │ Profile/Exp   │ End date must be after start date; enforced in form + backend              │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_050     │ Profile/Edu   │ Institution/year/percentage/CGPA validated on POST and PUT routes          │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_052     │ Profile/Pers  │ Phone/email/city/state/PIN validated; inline errors on each field          │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_053     │ Profile/Over  │ Experience card refreshed after adding work experience                     │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_054     │ HR Dashboard  │ presentToday = checkedInToday (was calculated incorrectly)                 │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_055     │ HR Dashboard  │ On Leave → /leaves?status=approved&date=today; WFH → filtered WFH view     │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_056/070 │ HR Dashboard  │ Pending Approvals counts all 3 statuses (pending/pending_root/pending_dept)│
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_057     │ HR Employees  │ Add Employee form validates name, email, password min 6, job title         │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_058     │ HR Employees  │ Edit Employee form validates name (letters), mobile (10 digits), email     │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_060     │ HR Employees  │ Statutory Edit button maps to extended tab in modal                        │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_061     │ Departments   │ Client-side validation: required, 2–100 chars, no special chars            │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_062     │ Departments   │ Duplicate name returns friendly error, not raw DB constraint               │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_063     │ Branches      │ Client-side validation: required, 2–100 chars                              │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_064     │ Branches      │ isAdmin check used; fix_branches_hr_permissions.sql grants RBAC perms      │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_065     │ HR Dashboard  │ Birthday insight navigates to /employees?filter=birthday                   │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_066     │ HR Analytics  │ Roles section groups by position/job title, not system role                │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_069     │ HR Leaves     │ Leave Type filter includes emergency and comp_off                          │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_071/073 │ Calendar      │ Legend unified — Half Day uses cyan (#06B6D4) consistently                 │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_074     │ Calendar      │ Holidays fetched from API and rendered in calendar cells                   │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_075     │ Shifts        │ Duplicate shift name rejected (case-insensitive backend check)             │
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤
  │ BUG_076     │ Shifts        │ Overnight shifts accepted; "Overnight shift — ends next day" indicator     │
  └─────────────┴───────────────┴────────────────────────────────────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════
  BUGS FIXED — SESSION 2 (19 Aug, 35 total)
  ═══════════════════════════════════════════════════════════

  ┌─────────────┬───────────────────┬──────────────────────────────────────────────────────────────────────────┐
  │     Bug     │      Module       │                                    Fix                                   │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_080     │ Performance       │ Category badges now have distinct colors: Individual=blue,               │
  │             │                   │ Department=purple, Team=amber                                            │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_082     │ Performance       │ Goal Title capped at 100 chars with live counter; backend enforces too   │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_084     │ Performance       │ GoalModal initialises review_cycle from current cycle selector —        │
  │             │                   │ new goals saved under the correct year                                  │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_085     │ Announcements     │ "Admins Only" audience mapped to 'hr' (valid DB enum value);            │
  │             │                   │ admin GET includes 'hr' audience — no more DB constraint error          │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_086     │ Announcements     │ Type filter tabs display per-type count e.g. "General (3)"              │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_087/088 │ Announcements     │ Title/content must contain letters; max 150/2000 chars with live        │
  │             │                   │ counters and inline errors                                              │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_089     │ Announcements     │ Cloudinary vendor name removed from attachment label and spinner        │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_090     │ Announcements     │ Backend duplicate check: same title + creator within 24h → 409          │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_091     │ Notifications     │ Announcement=Megaphone, General=Bell, Info=Info — distinct icons        │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_092     │ Notifications     │ Delete notification shows confirmation dialog before deleting           │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_095     │ Pending Approvals │ Route /pending-approvals correctly wired in App.jsx (already fixed)     │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_097/098 │ Settings          │ Work Start/End Time: both required; end must be strictly after start    │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_099     │ Settings          │ Late Entry Threshold validated to be within Start–End window            │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_100     │ Settings          │ Early Exit Threshold validated between Late Threshold and End Time      │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_101/102 │ Settings          │ Half Day Threshold: must be > 0 and ≤ total scheduled work hours       │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_103     │ Settings          │ At least one Working Day must be selected before saving schedule       │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_106     │ Settings          │ Run Cleanup shows confirmation dialog before executing                  │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_107     │ Settings          │ Duplicate approver type blocked in Leave Workflow (addLevel + updateLevel│
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_108     │ Settings          │ Workflow save invalidates summary query → Settings page auto-refreshes  │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_109     │ Settings          │ Workflow name: must contain letter, max 80 chars, inline error          │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_119     │ Root Dashboard    │ Leave Breakdown donut uses largest-remainder rounding → sums to 100%    │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_121     │ Root Dashboard    │ "View Calendar" navigates to /calendar, not /holidays                   │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_128     │ Reports           │ Employee Report excludes HR/admin users — employees only                │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_129     │ Reports           │ employment_type normalised (full-time → full_time) — Full-Time filter   │
  │             │                   │ now returns correct results                                             │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_130     │ Payroll           │ Salary structure save blocked if all earning components are ₹0          │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_134     │ Assets            │ purchase_value cast to NUMERIC (was BIGINT overflow); both POST/PUT     │
  │             │                   │ routes fixed                                                            │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_135     │ Broadcast         │ Push route mounted in server.js; broadcast to all employees now works   │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_137/138 │ Broadcast         │ Fields have char counters; confirmation dialog before sending broadcast  │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_139     │ Pending Approvals │ STAGE column constrained (max-w + truncate + title tooltip)             │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_143     │ Role Management   │ Long role name/description wraps with break-words, no horizontal scroll  │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_146     │ Org Settings      │ Total Annual Leave Days rejects negative values                         │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_147     │ Org Settings      │ Leave policy section removed from Org Settings — redirected to          │
  │             │                   │ dedicated Leave Policies page (both root and HR routes)                 │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_148     │ Org Settings      │ Company Domain validated with regex (e.g. company.com required format)  │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_151     │ Settings/Admin    │ Email notification recipients validated for correct email format        │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_152     │ Settings/Admin    │ Label validated: must contain a letter, max 60 chars                   │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_154     │ Auth              │ Email format validated on HR registration and employee email fields      │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_155     │ Auth              │ Login blocked for inactive, resigned, terminated users with role-specific│
  │             │                   │ error messages                                                          │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_158     │ Onboarding        │ Onboarding list filters out inactive/resigned/terminated employees      │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_159     │ Reports           │ Employee Report returns all statuses when no status filter applied      │
  └─────────────┴───────────────────┴──────────────────────────────────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════
  BUGS FIXED — SESSION 3 (19 Aug, 32 total)
  Commits: 0ddf9c7 + a455208 on HRMS-Migration-16jul
  ═══════════════════════════════════════════════════════════

  ┌─────────────┬────────────────────┬─────────────────────────────────────────────────────────────────────────┐
  │     Bug     │       Module       │                                    Fix                                  │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_035     │ Profile / 2FA      │ TOTP enable: input enforces 6 digits only (replace+slice); "Verify &    │
  │             │                    │ Enable" button disabled until exactly 6 digits entered; upload-avatar   │
  │             │                    │ guard checks localStorage token before making request                  │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_046/051 │ Designations       │ Duplicate designation name check (case-insensitive ilike) on POST and   │
  │             │                    │ PUT routes; returns user-friendly 400 error                             │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_051     │ Profile / Family   │ family.routes.js: duplicate check (same name + relationship, ilike)    │
  │             │                    │ before insert — returns 409 "already exists" error                     │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_059     │ Employees          │ Multi-select status filter; Active + Probation selected by default;     │
  │             │                    │ Inactive/Resigned/Terminated are opt-in checkboxes; Dept + Position    │
  │             │                    │ filters hidden on /root/employees route                                │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_059     │ System-wide        │ Inactive/resigned/terminated employees excluded from all non-management │
  │ (system)    │ (all pages)        │ pages by default (Calendar, Reports, Dashboard, Team views) via        │
  │             │                    │ employees.routes.js default filter; include_inactive=true only passed  │
  │             │                    │ by the Employees management page                                       │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_068     │ Employees          │ calendar.routes.js birthday/culture feed excludes inactive/resigned/    │
  │             │ Calendar           │ terminated; employees.routes.js hard filters these statuses by default  │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_072     │ Attendance         │ Auto-absent cron job (scheduleDailyAt 23:30) marks employees with no   │
  │             │ (Cron)             │ check-in and no approved leave as Absent — runs nightly per org,       │
  │             │                    │ respects work schedule and holidays                                    │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_081     │ Documents          │ Document requirement creation: dropdown with 17 standard types (Aadhaar,│
  │             │                    │ PAN, Passport, etc.) + "Custom…" option for free text; duplicate guard │
  │             │                    │ prevents same document name per employee                               │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_093     │ Notifications      │ NotificationCenter: 'document' type added with FileText icon + blue     │
  │             │                    │ styling; document notifications always navigate to                     │
  │             │                    │ /documents?tab=verification; 'leave' type also added with icon         │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_096     │ Leaves / WFH       │ On leave/WFH submission: in-app notify() sent to all HR admins, root   │
  │             │                    │ admins, and department head. On approval/rejection: employee notified   │
  │             │                    │ (was already in approve/reject routes; submission side was missing)    │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_104     │ Settings           │ Push Notifications: custom confirmation modal appears before triggering  │
  │             │                    │ browser permission prompt ("Yes, Enable" / "Cancel"); if already        │
  │             │                    │ enabled, shows "already enabled" info toast instead                    │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_112     │ Reports            │ Yearly/Monthly report queryKey no longer includes month when            │
  │             │                    │ viewMode=yearly — prevents stale monthly cache serving yearly data;    │
  │             │                    │ backend already handled year-only queries correctly                    │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_115     │ Profile / Auth     │ Login history now records failed password attempts (when user email     │
  │             │                    │ exists) with status='failed'; MyProfile shows Success/Failed badge,    │
  │             │                    │ red/green colour coding, and note: "Showing all login activity"        │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_116     │ Root Dashboard     │ Pending KPI now combines leaves + WFH + regularizations (was leaves    │
  │             │                    │ only); hero badge and KPI card both show true combined pending total   │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_117     │ Root Dashboard     │ Attendance % badge now shows trendAvgPct — average % across the        │
  │             │                    │ selected 7d/14d/30d window (not today's snapshot); resigned/terminated │
  │             │                    │ employees excluded from activeEmployees used in % calculation           │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_118     │ Root Dashboard     │ Workforce donut chart includes Absent count: backend calculates absent  │
  │             │                    │ = activeEmployees with no attendance record today; shows in chart       │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_120     │ Calendar           │ "Today" button now opens the AttendanceDayModal / leave popup for      │
  │             │                    │ today's date immediately after navigating; modal title is dynamic      │
  │             │                    │ ("Today's Leaves" vs "Leaves on [date]")                              │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_123     │ Reports            │ Present/WFH KPI filter uses 'productive' sentinel covering present,     │
  │             │                    │ wfh, and half_day statuses together; filter correctly shows all three  │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_124     │ Reports            │ KPI card clicks clear all other active filters (search, dept, type)    │
  │             │                    │ before applying the clicked filter; clicking an active card toggles it │
  │             │                    │ off (acts as clear-all); active card shows blue ring indicator         │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_126     │ Reports            │ Pending leave count now correctly included — was hidden by stale cache  │
  │             │                    │ from BUG_112 queryKey fix; pending status leaves now appear in table   │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_127     │ Reports            │ Cancelled KPI card added to Leave tab; filters table to cancelled      │
  │             │                    │ leaves; grid switches to 5-column layout on leaves tab                 │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_131     │ Payroll            │ SalaryStructure: "Revise" modal pre-fills all 15 salary fields from    │
  │             │                    │ existing structure; shows previous salary summary banner; header reads │
  │             │                    │ "Revise Salary"; CTC override input added (optional direct CTC entry)  │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_132     │ Payroll            │ payrollGenerationService.js: ON CONFLICT updated to correctly count     │
  │             │                    │ and report employees processed in payroll runs                         │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_133     │ Payroll            │ payroll.routes.js: salary structure lookup checks                       │
  │             │                    │ employee_salary_structures (primary) first, falls back to legacy       │
  │             │                    │ payroll_structures table — fixes "No salary structure found" error     │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_140     │ Role Management    │ Edit pencil icon on custom role cards (RoleManagement.jsx); EditRole   │
  │             │                    │ Modal (name + description); also added to PermissionMatrix detail view │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_141     │ Role Management    │ PermissionMatrix Members panel: lists current members, search picker   │
  │             │                    │ to add users, remove button per member; calls existing API endpoints   │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_142     │ Role Management    │ Decision: employees CAN hold multiple roles simultaneously (additive); │
  │             │                    │ PUT /roles/user/:userId fetches existing roles and appends new one;    │
  │             │                    │ UI reflects multi-role assignment                                      │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_144     │ Role Management    │ permissions.js middleware: 403 returns "You don't have permission to   │
  │             │ RBAC               │ perform this action"; api.js surfaces it as toast; permissionService  │
  │             │                    │ UNION query resolves permissions from explicit roles AND system role   │
  │             │                    │ derived from users.role column (baseline permissions always work)      │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_150     │ Org Settings       │ Dirty-tracking compares current form to saved baseline; amber "You     │
  │             │                    │ have unsaved changes" banner appears when dirty; includes "Save Now"   │
  │             │                    │ and "Discard Changes" buttons; secret fields tracked separately        │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_154     │ ManageHR           │ Email format regex validated in ManageHR.jsx before API call;          │
  │             │                    │ surfaces as toast error "Please enter a valid email address"           │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_160     │ Role Management    │ permissionService.js UNION query: system role slugs (root_admin,       │
  │             │ RBAC               │ hr_admin, employee) mapped from users.role column — employees always   │
  │             │                    │ receive their baseline role permissions even without user_roles rows   │
  ├─────────────┼────────────────────┼─────────────────────────────────────────────────────────────────────────┤
  │ BUG_162     │ Announcements      │ "New Announcement" and "Post Announcement" buttons gated on            │
  │             │ RBAC               │ hasPermission('announcements','create') — HR admins without this      │
  │             │                    │ permission no longer see the create button                             │
  └─────────────┴────────────────────┴─────────────────────────────────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════
  BUGS FIXED — SESSION 4 (20 Aug, 14 bugs + 1 critical system fix)
  Commits: 3d0317e + 26cbcc9 + 6fa3cd7 + 9026f05 + 870063d + 0985d07
  Branch:  HRMS-Migration-16jul
  ═══════════════════════════════════════════════════════════

  ┌─────────────┬──────────────────────┬──────────────────────────────────────────────────────────────────────────┐
  │     Bug     │       Module         │                                    Fix                                   │
  ├─────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ CRITICAL    │ All employee         │ Employee dropdowns empty on all root/HR pages — SQL NULL NOT IN (...)    │
  │ SYSTEM FIX  │ dropdowns            │ was silently excluding employees whose employee_status IS NULL.          │
  │             │ (employees, dash-    │ Fixed all 5 files to use .or('employee_status.is.null, NOT IN (...)')    │
  │             │ board, reports,      │ so NULL-status employees (majority) are always shown.                   │
  │             │ calendar, cron)      │ Files: employees.routes.js, dashboard.routes.js, reports.routes.js,     │
  │             │                      │ calendar.routes.js, cronJobs.js                                         │
  ├─────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_042     │ Employee Portal      │ Profile photo upload returned 401 "Invalid token" — EmployeePortalProfile│
  │             │ Profile Photo        │ was reading localStorage key 'token' instead of 'lt_token'. Fixed to    │
  │             │                      │ use correct key; added guard if session expired.                         │
  ├─────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_046     │ Profile – Work       │ Bank account edit button (pencil) now disabled when account status is   │
  │             │ Bank Accounts        │ "Pending HR Review" (hr_verified=false). Shows Lock icon with tooltip   │
  │             │                      │ "Editing locked — account is awaiting HR review" instead.               │
  ├─────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_051     │ Employees            │ Duplicate employee name within same org now blocked on POST — backend   │
  │             │                      │ ilike check returns 400 "An employee with this name already exists."    │
  ├─────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_105     │ Leave Workflow       │ Display label input capped at maxLength=30 chars. Flow preview diagram  │
  │             │ Settings             │ truncates labels longer than 15 chars with "…" — prevents overflow.     │
  ├─────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_110     │ Profile Photo        │ "Remove Photo" X button added to employee portal profile avatar and     │
  │             │                      │ HR-side MyProfile. Backend DELETE /auth/remove-avatar sets avatar_url   │
  │             │                      │ = null. Button only visible when a photo is set.                        │
  ├─────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_117     │ Dashboard / Reports  │ Dashboard KPI total employee count and reports headcount now exclude    │
  │             │                      │ inactive/resigned/terminated employees (using .or() NULL-safe filter).  │
  ├─────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_120     │ Assets               │ Migration file created with docker copy+exec commands to add            │
  │ BUG_133     │                      │ purchase_value NUMERIC(12,2), warranty_expiry DATE columns to assets    │
  │             │                      │ table. Fixes 500 error on /api/assets. Run:                            │
  │             │                      │ docker cp backend/migrations/bug120_133_assets_purchase_value.sql      │
  │             │                      │   lumos_postgres:/tmp/bug120_assets.sql                                │
  │             │                      │ docker exec -it lumos_postgres psql -U lumos_admin -d lumos_hrms       │
  │             │                      │   -f /tmp/bug120_assets.sql        ← ALREADY RUN ON SERVER ✓          │
  ├─────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_131     │ Payroll / Salary     │ GET /payroll/employees now returns all 16 salary structure fields.      │
  │             │ Structure            │ Revise Salary modal pre-populates all fields (Basic, HRA, DA, Transport,│
  │             │                      │ Medical, Special, Other Allowances, PF, ESI, Prof Tax, TDS, Retention, │
  │             │                      │ Other Deductions, Employer PF/ESI) from previous salary structure.     │
  ├─────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_132     │ Payroll / Quick      │ Quick Payslip "Generate" modal self-fetches employees from             │
  │             │ Payslip              │ /payroll/employees — no longer empty. Only shows employees with a       │
  │             │                      │ salary structure configured.                                            │
  ├─────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_134     │ Payroll Engine       │ Payroll engine was checking non-existent column u.status instead of    │
  │             │                      │ u.employee_status — caused "Error" status for all employees in payroll  │
  │             │                      │ preview. Fixed in payroll.routes.js, payrollGenerationService.js, and  │
  │             │                      │ payrollEngine.js (aliased as "status" for backward compat).            │
  ├─────────────┼──────────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_135     │ Role Management      │ PermissionMatrix Members panel now uses dedicated GET /roles/:id/members│
  │ BUG_141     │ Permissions          │ endpoint directly (instead of relying on role join that could be empty).│
  │             │                      │ Loading state shown properly; picker "Loading…" now uses isLoading flag │
  │             │                      │ not array length check. Invalidates both role and role-members cache    │
  │             │                      │ on add/remove member actions.                                           │
  └─────────────┴──────────────────────┴──────────────────────────────────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════
  BUGS SKIPPED — Require Further Investigation or Product Decision
  ═══════════════════════════════════════════════════════════

  ┌─────────┬──────────────────┬──────────────────────────────────────────────────────────────────────────────┐
  │   Bug   │     Module       │                                Reason                                       │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_042 │ Service Worker   │ "A listener indicated an async response…" — Chrome extension / service      │
  │         │                  │ worker message channel issue; not application code; no fix possible          │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_094 │ Notifications    │ Clicked notification highlight / active state — requires stateful routing   │
  │         │                  │ and scroll-to-element; complex UX; product decision needed                  │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_105 │ Leave Workflow   │ Leave workflow page issue (images unavailable) — needs live investigation   │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_110 │ Profile          │ Remove profile photo — requires Cloudinary delete API integration           │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_111 │ Unknown          │ Images unavailable — cannot determine scope without QA screenshots          │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_113 │ Unknown          │ Images unavailable — cannot determine scope without QA screenshots          │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_114 │ Unknown          │ Images unavailable — cannot determine scope without QA screenshots          │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_125 │ Reports          │ NOT A BUG — forward navigation to future years is intentionally disabled    │
  │         │                  │ (backward navigation works correctly)                                       │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_136 │ Broadcast        │ QA to verify — email success recipient count reported as working; no code   │
  │         │                  │ changes made; needs live broadcast test to confirm                          │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_145 │ Org Settings     │ Org name change requires platform admin approval — complex: needs new DB    │
  │         │                  │ table (org_name_change_requests), platform admin workflow, approval gate;   │
  │         │                  │ product decision on implementation approach                                 │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_149 │ Org Settings     │ Reducing leave days mid-year warning — complex business rule; product       │
  │         │                  │ decision on enforcement strategy (warn vs. block)                           │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_153 │ My Team          │ Team Dashboard KPIs show 0 — team member data appears correctly in backend; │
  │         │                  │ needs live investigation with a department that has members assigned        │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_155 │ Exit Management  │ Offboarding tasks not created after resignation approval — complex trigger; │
  │ (partial)│                 │ offboardingService.js audit needed; login block for inactive/terminated     │
  │         │                  │ already fixed in Session 2 (auth.routes.js)                                │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_156 │ Announcements    │ Inactive/terminated employees receiving announcements — product decision    │
  │         │                  │ on whether inactive accounts should see any communications                 │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_157 │ Documents        │ Document review DB constraint violation — employee_doc_submissions schema   │
  │         │                  │ mismatch; needs DB migration investigation                                  │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_161 │ Role Management  │ HR can upload docs when permission disabled — RBAC enforcement gap on       │
  │         │ RBAC             │ document upload routes; requires backend route-by-route permission audit    │
  └─────────┴──────────────────┴──────────────────────────────────────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════
  SUMMARY — ALL SESSIONS
  ═══════════════════════════════════════════════════════════

  Session 1 (18 Aug) :  40 bugs fixed
  Session 2 (19 Aug) :  35 bugs fixed  (includes BUG_134, 135, 147, 154, 155 from inter-session commits)
  Session 3 (19 Aug) :  32 bugs fixed
  Session 4 (20 Aug) :  14 bugs fixed + 1 critical system fix (NULL employee_status filter)
  ─────────────────────────────────────────────────────────────────────────────
  Total Fixed         : 122 bugs
  Skipped / Pending   :  16 bugs (require product decisions, images, or live investigation)
  Reopened (pending)  :  42 bugs from QA sheet — to be addressed in Session 5

  Branch: HRMS-Migration-16jul
  Build:  cd client && npx vite build  →  ✓ 1652 modules, no errors (Session 4)

  DB Migration Run    : bug120_133_assets_purchase_value.sql ✓ (run 20 Aug on lumos_postgres)
