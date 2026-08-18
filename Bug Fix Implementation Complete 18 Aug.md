Bug Fix Implementation Complete

  24 files modified — all backend syntax-checked, all frontend brace-balanced.
  
  Bugs Fixed (40 total)

  ┌─────────────┬───────────────┬────────────────────────────────────────────────────────────────────────────┐   
  │     Bug     │    Module     │                                    Fix                                     │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_13      │ MyLeaves      │ Removed refetchType:'active' — pending count now refreshes immediately     │   
  │             │               │ after leave submission                                                     │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_14      │ MyLeaves      │ Balance widget handles null active field (!== false), staleTime:0,         │   
  │             │               │ flexible API shape                                                         │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_022     │ Documents     │ Backend already has duplicate check; surfaces user-friendly 409 message    │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_023     │ Documents     │ Visibility label changed: "HR / Admin Only" → "Shared with HR"             │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_024/025 │ Expenses      │ Empty state now distinguishes "no records for filter" vs "no claims at     │   
  │             │               │ all"; "Submit First Claim" only shown when zero total claims               │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_026     │ Expenses      │ Duplicate receipt filename warning before upload                           │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_027     │ Expenses      │ Duplicate claim warning (same date+category+amount); confirms on 2nd       │   
  │             │               │ submit                                                                     │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_028/077 │ Performance   │ Avg Progress capped at 0–100%; individual goal progress bars capped too    │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_029     │ Performance   │ Duplicate goal check (same title+category+cycle per user)                  │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_030/078 │ Performance   │ Auto-sets status to Completed when progress ≥ 100                          │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_031     │ Performance   │ Past target dates rejected in frontend (min date) + backend                │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_032     │ Performance   │ Description max 500 chars enforced with live counter                       │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_033     │ Performance   │ Employees can now edit all their own goal fields (title, description,      │   
  │             │               │ etc.)                                                                      │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_034     │ Performance   │ Employees can delete their own goals (no longer blocked by manage          │   
  │             │               │ permission)                                                                │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_036     │ Profile       │ Display Name must contain at least one letter; save disabled otherwise     │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_039     │ Profile       │ Password policy checklist shown before submitting (8 chars, upper, lower,  │   
  │             │               │ number, special)                                                           │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_040     │ Auth          │ Password reuse prevented — new password can't match current password       │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_041     │ Profile       │ Company Email field is read-only for employee role                         │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_043     │ Profile       │ Years of Experience validated 0–60 range with inline error                 │   
  │             │ Skills        │                                                                            │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_044     │ Profile       │ Bank form validates: bank name (letters), account number (9–18 digits),    │   
  │             │ Banking       │ holder name, IFSC format                                                   │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_045     │ Profile       │ Duplicate account number rejected per employee (backend check)             │   
  │             │ Banking       │                                                                            │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_047     │ Profile       │ Case-insensitive skill name duplicate check (Python = python)              │   
  │             │ Skills        │                                                                            │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_048     │ Profile       │ Name must contain letters; DOB cannot be future date                       │   
  │             │ Family        │                                                                            │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_049     │ Profile       │ End date must be after start date; enforced in form + backend              │   
  │             │ Experience    │                                                                            │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_050     │ Profile       │ Institution must have letters; year 1950–current; percentage 0–100; CGPA   │   
  │             │ Education     │ 0–10                                                                       │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_052     │ Profile       │ Phone format, email format, city/state letters-only, PIN 4–10 digits       │   
  │             │ Personal      │                                                                            │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_053     │ Profile       │ Experience card refreshed after adding work experience (was already        │   
  │             │ Overview      │ invalidating)                                                              │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_054     │ HR Dashboard  │ KPI presentToday = checkedInToday (was calculated incorrectly)             │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_055     │ HR Dashboard  │ On Leave → /leaves?status=approved&date=today; WFH → filtered WFH view     │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_056/070 │ HR Dashboard  │ Pending Approvals counts all 3 statuses (pending, pending_root,            │   
  │             │               │ pending_dept)                                                              │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_057     │ HR Employees  │ Add Employee form validates name, email format, password min 6, job title  │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_058     │ HR Employees  │ Edit Employee form validates name (letters), mobile (10 digits), personal  │   
  │             │               │ email                                                                      │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_060     │ HR Employees  │ Statutory Edit button now maps to extended tab (correct tab in modal)      │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_061     │ Departments   │ Client-side validation before submit: required, 2–100 chars, no special    │   
  │             │               │ chars                                                                      │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_062     │ Departments   │ Duplicate name returns friendly error instead of raw DB constraint         │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_063     │ Branches      │ Client-side validation: required, 2–100 chars                              │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_064     │ Branches      │ Permission error fixed — uses admin role check instead of unseeded RBAC    │   
  │             │               │ permission                                                                 │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_065     │ HR Dashboard  │ Birthday insight navigates to /employees?filter=birthday                   │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_066     │ HR Analytics  │ Roles section now groups by position (job title) instead of system role    │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_069     │ HR Leaves     │ Leave Type filter now includes emergency and comp_off                      │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_071/073 │ Calendar      │ Legend and STATUS_COLORS_MAP unified — Half Day uses cyan (#06B6D4)        │   
  │             │               │ consistently                                                               │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_074     │ Calendar      │ Holidays fetched from API and rendered in calendar cells                   │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_075     │ Shifts        │ Duplicate shift name rejected (case-insensitive backend check)             │   
  ├─────────────┼───────────────┼────────────────────────────────────────────────────────────────────────────┤   
  │ BUG_076     │ Shifts        │ Overnight shifts now accepted; visual "Overnight shift — ends next day"    │   
  │             │               │ indicator shown                                                            │   
  └─────────────┴───────────────┴────────────────────────────────────────────────────────────────────────────┘   

  ---
  Bugs Skipped — Require Verification or Product Decision

  ┌─────────┬─────────────────────────────────────────────────────────────────────────────────────────────────┐  
  │   Bug   │                                             Reason                                              │  
  ├─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ BUG_037 │ 2FA setup not functional — requires full TOTP/QR implementation + product decision on library   │  
  ├─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ BUG_038 │ Manual auth key field — depends on BUG_037 resolution                                           │  
  ├─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ BUG_042 │ Profile photo "Invalid Token" — Cloudinary/session token expiry; needs server-side              │  
  │         │ investigation with live session                                                                 │  
  ├─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ BUG_046 │ Employee editing bank account during HR review — requires workflow locking business decision    │  
  ├─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ BUG_051 │ Duplicate records across professional forms — overlaps with BUG_047/048/049/050 which are fixed │  
  ├─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ BUG_059 │ Team member list filters — code logic already correct per code review; may be a data issue      │  
  ├─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ BUG_068 │ Orphaned onboarding entry '12' — stale DB record needs direct database cleanup, not a code fix  │  
  ├─────────┼─────────────────────────────────────────────────────────────────────────────────────────────────┤  
  │ BUG_072 │ Absent employees not auto-appearing in HR calendar — complex attendance auto-marking logic,     │  
  │         │ depends on nightly job or trigger                                                               │  
  └─────────┴────────────────────────────────────────────────────────────