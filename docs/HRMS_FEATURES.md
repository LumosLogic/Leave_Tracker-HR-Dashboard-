# Full HRMS System — Feature Specification
**Project:** Lumos Logic Leave Tracker → Full HRMS  
**Date:** 2026-06-04  
**Version:** 1.0  

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Already implemented |
| 🔶 | Partially implemented / needs improvement |
| ❌ | Not yet implemented |

---

## Module 1 — Core Employee Management

> Central employee record system. Foundation of the entire HRMS.

| Feature | Status | Notes |
|---------|--------|-------|
| Employee profile (name, email, phone, DOB, gender, address) | 🔶 | DOB + basic info exists; phone, gender, address missing |
| Employee ID (auto-generated) | ❌ | No emp ID generation |
| Department & designation management | 🔶 | Department/position fields exist; no separate Departments table |
| Reporting manager / org hierarchy | ❌ | No reporting_to field, no org chart |
| Employee photo / avatar | 🔶 | Avatar color exists; no photo upload |
| Employment type (full-time, part-time, contract, intern) | ❌ |  |
| Employment status (active, probation, notice period, terminated) | ❌ |  |
| Date of joining & confirmation date | ❌ |  |
| Employee documents (ID proof, offer letter, certificates) | ❌ |  |
| Emergency contact information | ❌ |  |
| Bank account details (for payroll) | ❌ |  |
| Custom fields per organization | ❌ |  |
| Employee search, filter, bulk actions | 🔶 | Basic list exists; no bulk actions |
| Employee import via CSV / Excel | ❌ |  |
| Org chart visualization | ❌ |  |
| Employee directory (searchable) | 🔶 | Employees page exists; not a public directory |

---

## Module 2 — Attendance & Time Tracking

> Track daily presence, work hours, and time patterns.

| Feature | Status | Notes |
|---------|--------|-------|
| Manual check-in / check-out | ✅ |  |
| Auto late detection | ✅ |  |
| Auto early exit detection | ✅ |  |
| Half-day tracking | ✅ |  |
| WFH (work-from-home) status | ✅ |  |
| Clockify API sync | ✅ |  |
| Admin edit attendance records | ✅ |  |
| Mark absent | ✅ |  |
| Work schedule configuration | ✅ |  |
| Monthly attendance report per employee | 🔶 | Basic view exists; no downloadable report |
| Attendance regularization (employee requests correction) | ❌ |  |
| Biometric / RFID integration hooks | ❌ |  |
| Geo-fencing / location-based check-in | ❌ |  |
| Shift management (multiple shifts) | ❌ | Single schedule only |
| Overtime tracking | ❌ |  |
| Break time tracking | ❌ |  |
| Comp-off (compensatory off) generation | ❌ |  |
| Attendance analytics dashboard | ❌ | Aggregate trends, dept-wise, month-wise |
| Downloadable attendance reports (CSV/PDF) | ❌ |  |
| IP-based / device restriction for check-in | ❌ |  |

---

## Module 3 — Leave Management

> Apply, approve, track, and analyze leaves.

| Feature | Status | Notes |
|---------|--------|-------|
| Leave application (employee) | ✅ |  |
| Leave approval / rejection (admin) | ✅ |  |
| Multiple leave types (annual, sick, casual, emergency) | ✅ |  |
| Half-day leave | ✅ |  |
| WFH request (as leave type) | ✅ |  |
| Leave balance calculation | ✅ |  |
| Leave conflict detection | ✅ |  |
| Google Calendar sync for approved leaves | ✅ |  |
| Email notifications for leave events | ✅ |  |
| Leave cancellation by employee | ✅ |  |
| Leave policy configuration per org | 🔶 | Only total_annual_leaves; needs per-type policy |
| Leave accrual (monthly/yearly carryover) | ❌ |  |
| Leave encashment | ❌ |  |
| Sandwich rule (weekends counted in leave) | ❌ |  |
| Holiday-aware leave calculation | 🔶 | Holidays table exists; not applied in leave count |
| Leave quota per type per employee | ❌ |  |
| Comp-off leave type | ❌ |  |
| Maternity / Paternity leave | ❌ |  |
| Leave on behalf (admin applies for employee) | ✅ |  |
| Leave approval workflow (multi-level) | ❌ | Single approver only |
| Leave history & analytics | 🔶 | Basic list; no charts/trends |
| Downloadable leave reports | ❌ |  |
| Leave dashboard (team calendar view) | 🔶 | Calendar exists; needs team leave overlay |
| Bulk leave grant (e.g., festival bonus leave) | ❌ |  |

---

## Module 4 — Payroll Management

> Salary computation, payslips, and statutory deductions.  
> **Status: ❌ Not implemented at all**

| Feature | Notes |
|---------|-------|
| Salary structure per employee (basic, HRA, DA, allowances) |  |
| Payslip generation (monthly) |  |
| Payslip download (PDF) |  |
| Employee self-service payslip view |  |
| Statutory deductions (PF, ESI, Professional Tax, TDS) |  |
| Loss of Pay (LOP) calculation from attendance |  |
| Overtime pay calculation |  |
| Bonus / incentive management |  |
| Advance salary request |  |
| Final settlement (full & final) on exit |  |
| Bank transfer file export (NEFT/RTGS batch) |  |
| Annual CTC breakdown |  |
| Form 16 / tax computation |  |
| Salary revision history |  |
| Department-wise payroll report |  |

---

## Module 5 — Holidays & Calendar Management

> Manage company holidays and events.

| Feature | Status | Notes |
|---------|--------|-------|
| Holiday list management | 🔶 | holidays table exists; no admin UI to manage |
| Holiday types (national, optional, regional) | 🔶 | type field exists |
| Company events management | 🔶 | events table exists; no dedicated UI |
| Full calendar view | ✅ | FullCalendar integration |
| Google Calendar sync for holidays/events | 🔶 | Leave sync exists; holiday/event sync partial |
| Holiday import (bulk) | ❌ |  |
| Org-specific holiday calendars | ✅ | org_id scoped |
| Notification for upcoming holidays | ❌ |  |

---

## Module 6 — Recruitment & Applicant Tracking System (ATS)

> Hire the right people faster.  
> **Status: ❌ Not implemented at all**

| Feature | Notes |
|---------|-------|
| Job posting creation & management |  |
| Job board integration (LinkedIn, Indeed, Naukri) |  |
| Careers page (public-facing per org) |  |
| Application form (custom fields) |  |
| Applicant tracking pipeline (applied → screened → interview → offer → hired) |  |
| Resume / CV storage and parsing |  |
| Interview scheduling (with calendar integration) |  |
| Interview feedback forms |  |
| Offer letter generation |  |
| Background verification status tracking |  |
| Recruitment analytics (time-to-hire, source of hire) |  |
| Referral management |  |

---

## Module 7 — Onboarding

> Smooth first-day experience for new hires.  
> **Status: ❌ Not implemented at all**

| Feature | Notes |
|---------|-------|
| Onboarding checklist (admin & employee tasks) |  |
| Document collection (ID, bank details, agreements) |  |
| Welcome email with credentials & portal access |  |
| IT asset assignment at onboarding |  |
| Policy acknowledgment (sign & acknowledge) |  |
| Training plan assignment at onboarding |  |
| Buddy/mentor assignment |  |
| Probation period tracking |  |
| Pre-boarding portal (before day 1) |  |

---

## Module 8 — Performance Management

> Set goals, track progress, and run appraisals.  
> **Status: ❌ Not implemented at all**

| Feature | Notes |
|---------|-------|
| Goal setting (OKRs / KPIs) |  |
| Goal tracking & progress updates |  |
| 360-degree feedback |  |
| Self-appraisal form |  |
| Manager appraisal |  |
| Performance review cycles (quarterly/half-yearly/annual) |  |
| Performance rating & normalization |  |
| Performance improvement plan (PIP) |  |
| Skill matrix & competency framework |  |
| Appraisal linked to salary revision |  |
| Recognition & awards (badges, kudos) |  |
| Performance analytics & reports |  |

---

## Module 9 — Training & Learning Management

> Build skills and track learning.  
> **Status: ❌ Not implemented at all**

| Feature | Notes |
|---------|-------|
| Training catalog (internal & external) |  |
| Training nomination & approval |  |
| Training calendar |  |
| Training completion tracking |  |
| Certificate upload after training |  |
| E-learning module (course + quiz + certificate) |  |
| Mandatory training compliance tracker |  |
| Training cost management |  |
| Training feedback / effectiveness rating |  |
| Skills gap analysis |  |

---

## Module 10 — Document Management

> Centralized HR document storage.  
> **Status: ❌ Not implemented at all**

| Feature | Notes |
|---------|-------|
| Employee document upload (employee-facing) |  |
| HR document upload (admin-facing) |  |
| Document categories (ID proof, contract, certificates, etc.) |  |
| Expiry tracking (visa, contract end dates) |  |
| Bulk document download per employee |  |
| Document access control (who can see what) |  |
| E-signature on HR documents |  |
| Letter generation (experience letter, relieving letter, promotion letter) |  |
| Company policy document library (shared with all employees) |  |

---

## Module 11 — Assets & IT Management

> Track company-issued assets.  
> **Status: ❌ Not implemented at all**

| Feature | Notes |
|---------|-------|
| Asset catalog (laptop, phone, access card, etc.) |  |
| Asset assignment to employees |  |
| Asset return tracking |  |
| Asset condition & maintenance log |  |
| Asset request by employee |  |
| Asset report (by employee / by type) |  |

---

## Module 12 — Expense Management

> Employee reimbursements and expense claims.  
> **Status: ❌ Not implemented at all**

| Feature | Notes |
|---------|-------|
| Expense claim submission (with receipt upload) |  |
| Expense categories (travel, food, accommodation, etc.) |  |
| Approval workflow (manager → finance) |  |
| Reimbursement status tracking |  |
| Expense policy limits per category |  |
| Monthly expense reports |  |
| Integration with payroll (reimburse in salary) |  |

---

## Module 13 — Shift & Roster Management

> Plan and manage employee work shifts.  
> **Status: ❌ Not implemented at all**

| Feature | Notes |
|---------|-------|
| Multiple shift definitions (morning, evening, night) |  |
| Shift assignment to employees / departments |  |
| Monthly roster creation (drag-and-drop calendar) |  |
| Shift swap requests (employee-to-employee) |  |
| Roster publish & notification |  |
| Weekly off configuration per shift |  |
| Night shift allowance tracking |  |

---

## Module 14 — Notifications & Communication

> Keep everyone informed in real time.

| Feature | Status | Notes |
|---------|--------|-------|
| Email notifications (leave events) | ✅ |  |
| Web push notifications (VAPID) | ✅ |  |
| Broadcast message (root admin to all employees) | ✅ |  |
| In-app notification center | ❌ | No notification bell / inbox |
| SMS notifications | ❌ |  |
| WhatsApp notifications (via API) | ❌ |  |
| Birthday / work anniversary reminders | ❌ | DOB field exists |
| Custom notification templates | ❌ |  |
| Notification preferences (employee controls) | ❌ |  |
| Team announcements / noticeboard | ❌ |  |

---

## Module 15 — Reporting & Analytics

> Data-driven HR decisions.

| Feature | Status | Notes |
|---------|--------|-------|
| Dashboard overview (basic stats) | ✅ |  |
| Platform admin dashboard (org-level stats) | ✅ |  |
| Attendance analytics (trends, dept-wise) | ❌ |  |
| Leave analytics (type-wise, dept-wise, trends) | ❌ |  |
| Headcount reports (active, new joiners, exits) | ❌ |  |
| Turnover rate & retention analytics | ❌ |  |
| Payroll cost reports | ❌ |  |
| Custom report builder | ❌ |  |
| Scheduled reports (email delivery) | ❌ |  |
| Export to CSV / Excel / PDF | ❌ |  |
| Department-wise drill-down | ❌ |  |

---

## Module 16 — Exit Management / Offboarding

> Smooth and compliant employee exits.  
> **Status: ❌ Not implemented at all**

| Feature | Notes |
|---------|-------|
| Resignation submission (employee) |  |
| Notice period tracking |  |
| Exit interview form |  |
| Exit checklist (asset return, access revocation, knowledge transfer) |  |
| Full & final settlement calculation |  |
| Experience / relieving letter generation |  |
| Exit analytics (department-wise attrition) |  |

---

## Module 17 — Compliance & Legal

> Ensure labor law compliance.  
> **Status: ❌ Not implemented at all**

| Feature | Notes |
|---------|-------|
| Statutory compliance dashboard (PF, ESI, PT, TDS status) |  |
| Compliance calendar (monthly/quarterly filing deadlines) |  |
| Audit log (who changed what, when) |  |
| Data privacy & GDPR controls |  |
| Employee contract management |  |

---

## Module 18 — Self-Service Portal (Employee)

> Empower employees to manage their own HR needs.

| Feature | Status | Notes |
|---------|--------|-------|
| View personal attendance | ✅ |  |
| Apply for leave | ✅ |  |
| View leave balance & history | ✅ |  |
| Check-in / check-out | ✅ |  |
| View payslips | ❌ |  |
| Update personal profile | ✅ |  |
| Change password | ✅ |  |
| Submit expense claim | ❌ |  |
| View company holidays | 🔶 | Calendar exists; no dedicated holidays page |
| Download documents (payslip, letters) | ❌ |  |
| View team calendar (who's on leave) | ❌ |  |
| Submit attendance regularization | ❌ |  |
| View org chart | ❌ |  |
| View company announcements | ❌ |  |
| View assigned assets | ❌ |  |

---

## Module 19 — Admin & Configuration

> System setup and control for HR admins and root admins.

| Feature | Status | Notes |
|---------|--------|-------|
| Organization settings (name, domain, logo) | ✅ |  |
| SMTP email configuration | ✅ |  |
| Google Calendar integration | ✅ |  |
| Clockify integration | ✅ |  |
| Work schedule configuration | ✅ |  |
| HR staff management (create/edit admin users) | ✅ |  |
| Role-based access control (employee / admin / root_admin) | ✅ |  |
| Custom roles & permissions | ❌ |  |
| Department management (CRUD) | ❌ |  |
| Designation management (CRUD) | ❌ |  |
| Leave policy configuration per type | ❌ |  |
| Leave type customization | ❌ |  |
| Audit logs (admin actions) | ❌ |  |
| Data backup & export (org data) | ❌ |  |
| Multi-language / localization | ❌ |  |
| Theme customization per org | ❌ |  |

---

## Module 20 — Platform Admin (Super Admin)

> Manage all organizations from a single pane of glass.

| Feature | Status | Notes |
|---------|--------|-------|
| Platform dashboard (stats across all orgs) | ✅ |  |
| Org registration requests (approve / reject) | ✅ |  |
| Organization list with member counts | ✅ |  |
| Org member details view | ✅ |  |
| Platform activity log | ✅ |  |
| Org suspension / deactivation | ❌ |  |
| Billing & subscription management | ❌ |  |
| Platform-level analytics | ❌ |  |
| Platform announcements to all orgs | ❌ |  |
| Impersonate org (view as org admin) | ❌ |  |

---

## Implementation Priority Tiers

### Tier 1 — High Impact / Core HR (Implement Next)
1. **Department & Designation Management** — Foundation for everything else
2. **Holiday Management UI** — Admin CRUD for holidays; already has DB table
3. **Leave Policy Configuration** — Per-type quotas, accrual rules
4. **Attendance Regularization** — Employee requests correction; admin approves
5. **In-App Notification Center** — Notification bell + inbox
6. **Reports & Analytics** — Attendance + leave charts, CSV export
7. **Team Calendar View** — Who is on leave / WFH today (for employees)
8. **Employee Documents** — Upload, categorize, download
9. **Birthday / Anniversary Reminders** — DOB already in DB
10. **Downloadable Reports (CSV/PDF)** — Attendance, leave, employee

### Tier 2 — Medium Impact (Phase 2)
1. **Payroll Management** — Salary structure, payslips, LOP, PDF download
2. **Onboarding Module** — Checklists, document collection, welcome workflow
3. **Exit Management** — Resignation, notice period, exit checklist, F&F
4. **Asset Management** — Assign/return laptops, phones, access cards
5. **Expense Management** — Claims, approval, reimbursement in payroll
6. **Shift / Roster Management** — Multiple shifts, monthly roster
7. **Performance Management** — Goals, appraisals, ratings
8. **Announcement / Noticeboard** — Company-wide announcements for employees

### Tier 3 — Advanced Features (Phase 3)
1. **Recruitment / ATS** — Job postings, pipeline, interviews, offers
2. **Training & LMS** — Course catalog, completion tracking, certificates
3. **360-Degree Feedback** — Peer reviews, self-assessment
4. **Custom Report Builder** — Drag-and-drop report creator
5. **Compliance Dashboard** — PF/ESI/TDS status tracking
6. **E-Signature on Documents** — Sign offer letters, policies
7. **Custom Roles & Permissions** — Granular RBAC
8. **Org Chart Visualization** — Interactive reporting hierarchy
9. **Geo-fencing Check-in** — Location-based attendance
10. **Billing & Subscription (Platform)** — Plan management, Stripe integration

---

## Quick Summary

| Category | Total Features | Implemented (✅) | Partial (🔶) | Not Done (❌) |
|----------|---------------|-----------------|-------------|-------------|
| Core Employee Mgmt | 16 | 0 | 4 | 12 |
| Attendance | 20 | 9 | 2 | 9 |
| Leave Management | 24 | 10 | 4 | 10 |
| Payroll | 15 | 0 | 0 | 15 |
| Holidays & Calendar | 8 | 1 | 4 | 3 |
| Recruitment / ATS | 12 | 0 | 0 | 12 |
| Onboarding | 9 | 0 | 0 | 9 |
| Performance Mgmt | 12 | 0 | 0 | 12 |
| Training / LMS | 10 | 0 | 0 | 10 |
| Document Mgmt | 9 | 0 | 0 | 9 |
| Asset Mgmt | 6 | 0 | 0 | 6 |
| Expense Mgmt | 7 | 0 | 0 | 7 |
| Shift / Roster | 7 | 0 | 0 | 7 |
| Notifications | 10 | 2 | 0 | 8 |
| Reporting & Analytics | 11 | 1 | 0 | 10 |
| Exit Management | 7 | 0 | 0 | 7 |
| Compliance & Legal | 5 | 0 | 0 | 5 |
| Self-Service Portal | 15 | 7 | 1 | 7 |
| Admin & Configuration | 19 | 8 | 0 | 11 |
| Platform Admin | 10 | 5 | 0 | 5 |
| **TOTAL** | **241** | **43 (18%)** | **15 (6%)** | **183 (76%)** |

---

*This document serves as the master feature list for the Lumos Logic HRMS build-out. Review each module, decide which to prioritize, then communicate the tier/module to implement.*
