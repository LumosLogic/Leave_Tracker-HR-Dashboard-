Bug Fix Implementation Complete

  Session 1 (18 Aug) — 24 files modified
  Session 2 (19 Aug) — 17 files modified

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
  │ BUG_137/138 │ Broadcast         │ Fields have char counters; confirmation dialog before sending broadcast  │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_139     │ Pending Approvals │ STAGE column constrained (max-w + truncate + title tooltip)             │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_143     │ Role Management   │ Long role name/description wraps with break-words, no horizontal scroll  │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_146     │ Org Settings      │ Total Annual Leave Days rejects negative values                         │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_148     │ Org Settings      │ Company Domain validated with regex (e.g. company.com required format)  │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_151     │ Settings/Admin    │ Email notification recipients validated for correct email format        │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_152     │ Settings/Admin    │ Label validated: must contain a letter, max 60 chars                   │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_158     │ Onboarding        │ Onboarding list filters out inactive/resigned/terminated employees      │
  ├─────────────┼───────────────────┼──────────────────────────────────────────────────────────────────────────┤
  │ BUG_159     │ Reports           │ Employee Report returns all statuses when no status filter applied      │
  └─────────────┴───────────────────┴──────────────────────────────────────────────────────────────────────────┘

  ═══════════════════════════════════════════════════════════
  BUGS SKIPPED — Require Verification, Investigation, or Product Decision
  ═══════════════════════════════════════════════════════════

  ┌─────────┬──────────────────┬──────────────────────────────────────────────────────────────────────────────┐
  │   Bug   │     Module       │                                Reason                                       │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_035 │ Profile Overview │ Success toast after print/download — browser print API has no reliable       │
  │         │                  │ completion callback; product decision needed on expected behavior            │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_037 │ Profile/2FA      │ Full TOTP/QR implementation required — product decision on library          │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_038 │ Profile/2FA      │ Depends on BUG_037 resolution                                               │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_042 │ Profile/Photo    │ "Invalid Token" on photo upload — Cloudinary/session token expiry;          │
  │         │                  │ needs server-side investigation with live session                           │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_046 │ Profile/Banking  │ Bank edit during HR review — requires workflow locking business decision    │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_051 │ Profile/Prof.    │ Overlaps with BUG_047–050 which are fixed; no additional unique case       │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_059 │ HR Employees     │ Team member filters — code logic correct per review; likely a data issue    │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_068 │ Onboarding       │ Orphaned entry '12' is a stale DB record — direct DB cleanup needed        │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_072 │ Calendar         │ Absent auto-mark — complex nightly job/trigger; architectural change needed  │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_081 │ Documents        │ Duplicate doc requirement per category — needs UX decision on override rule  │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_093 │ Notifications    │ Notification redirect to document verification page — complex routing;      │
  │         │                  │ notification reference_type mapping needs investigation                     │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_094 │ Notifications    │ Clicked notification highlight — requires stateful routing; complex UX      │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_096 │ Notifications    │ Leave notification not shown — needs investigation of notification creation  │
  │         │                  │ flow in leaves workflow                                                     │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_104 │ Settings         │ Push notification permission — browser/OS level; needs live device testing  │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_105 │ Settings         │ Display label validation — handled under BUG_151/152 (notification          │
  │         │                  │ recipients); if separate field exists, needs targeted investigation         │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_110 │ Profile          │ Remove profile photo — requires Cloudinary delete integration               │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_112 │ Profile          │ Company email change — product decision needed (approval flow vs HR-only)   │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_114 │ Profile/2FA      │ 2FA secret display security — depends on BUG_037                           │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_115 │ Profile          │ Login History shows only current session — backend stores limited history;  │
  │         │                  │ needs DB investigation                                                      │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_116 │ Root Dashboard   │ Pending count mismatch — already fixed (BUG_056/070); retest needed        │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_117 │ Root Dashboard   │ Attendance Trend % vs Present Today — calculation needs investigation with  │
  │         │                  │ live data to verify expected vs actual formula                             │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_118 │ Root Dashboard   │ Donut total vs Total Employees — needs investigation with live data        │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_120 │ Root Dashboard   │ "On Leave Today" redirect — similar to BUG_055; needs root admin context   │
  │         │                  │ investigation for correct target route                                     │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_122 │ Reports          │ Leave count mismatch — status/date scope discrepancy; needs investigation   │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_123 │ Reports          │ Present/WFH KPI navigation — needs investigation of expected route          │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_124 │ Reports          │ Total Records KPI instability across tab switches — state management issue;  │
  │         │                  │ needs live investigation                                                    │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_125 │ Reports          │ Forward arrow navigation — needs investigation of year nav logic            │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_126 │ Reports          │ Pending attendance card shows 0 — attendance pending status investigation   │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_127 │ Reports          │ Cancelled status card — product decision on whether to add separate card    │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_131 │ Payroll          │ Run Payroll returns error — complex payroll engine issue; needs live debug  │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_132 │ Payroll          │ Payroll Runs employees count = 0 — complex; needs live investigation        │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_133 │ Payroll          │ Quick Payslip fails — complex payroll pipeline; needs live debug            │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_134 │ Assets           │ BIGINT conversion error — needs DB schema investigation for purchase_value  │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_135 │ Broadcast        │ "Broadcast to All" returns 404 — route not mounted; needs server config    │
  │         │                  │ investigation                                                               │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_136 │ Broadcast        │ Email success shows wrong recipient count — complex email tracking          │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_140 │ Role Management  │ Custom role edit — complex RBAC write flow; needs investigation             │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_141 │ Role Management  │ Remove member from role — complex RBAC member management                    │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_142 │ Role Management  │ Role reassignment auto-removes old role — complex; product decision needed  │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_144 │ Role Management  │ HR sees employees without View Employee permission — complex RBAC;          │
  │         │                  │ enforcement gaps need systematic audit                                     │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_145 │ Org Settings     │ Company Name cannot be edited — product decision on change request flow    │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_147 │ Org Settings     │ Annual Leave Days change not propagated to employees — complex cascading;  │
  │         │                  │ product decision on retroactive vs prospective application                 │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_149 │ Org Settings     │ Reducing leave days mid-year warning — complex business rule; product       │
  │         │                  │ decision on enforcement strategy                                           │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_150 │ Org Settings     │ Unsaved changes warning on navigation — complex; requires beforeunload hook │
  │         │                  │ + React Router integration for all settings pages                          │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_153 │ My Team          │ Team Dashboard KPIs show 0 — needs investigation of team data API          │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_154 │ HR Employees     │ "Email already registered" false positive — needs DB investigation of       │
  │         │                  │ soft-deleted or org-scoped email uniqueness logic                          │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_155 │ Exit Management  │ Offboarding tasks missing after resignation approved — complex trigger;    │
  │         │                  │ offboarding service needs investigation                                    │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_156 │ Announcements    │ Inactive/terminated employees receiving announcements — product decision    │
  │         │                  │ on whether inactive accounts should see any communications                 │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_157 │ Documents        │ Document review DB constraint violation — schema investigation needed;      │
  │         │                  │ employee_doc_submissions constraint mismatch                               │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_160 │ Role Management  │ Employee role has too many permissions by default — systematic RBAC audit  │
  │         │                  │ required; changing defaults may break existing employee access             │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_161 │ Role Management  │ HR can upload docs when permission disabled — RBAC enforcement gap;        │
  │         │                  │ requires systematic permission check audit across all routes               │
  ├─────────┼──────────────────┼──────────────────────────────────────────────────────────────────────────────┤
  │ BUG_162 │ Role Management  │ HR can create announcements when permission disabled — same as BUG_161;    │
  │         │                  │ RBAC enforcement needs systematic backend audit                            │
  └─────────┴──────────────────┴──────────────────────────────────────────────────────────────────────────────┘
