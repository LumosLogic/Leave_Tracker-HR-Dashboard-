# HRMS Functional Analysis & Requirement Mapping Document

**Prepared by:** Lumos Logic  
**Document Version:** 1.0  
**Date:** July 2026  
**Prepared for:** Relitrade Group  
**Confidential:** This document is intended only for the recipient organization.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Overview](#2-system-overview)
3. [Module Summary](#3-module-summary)
4. [Detailed Module Documentation](#4-detailed-module-documentation)
   - 4.1 Authentication & Security
   - 4.2 Dashboard
   - 4.3 Employee Management
   - 4.4 Attendance Management
   - 4.5 Leave Management
   - 4.6 Leave Policies
   - 4.7 Biometric Integration
   - 4.8 Regularization
   - 4.9 Payroll & Salary
   - 4.10 Reports & Analytics
   - 4.11 Performance Management
   - 4.12 Onboarding
   - 4.13 Exit Management
   - 4.14 Expenses
   - 4.15 Assets
   - 4.16 Holidays
   - 4.17 Shifts & Roster
   - 4.18 Departments & Designations
   - 4.19 Branches
   - 4.20 Announcements & Broadcast
   - 4.21 Notifications
   - 4.22 Calendar
   - 4.23 Documents
   - 4.24 Organization Settings
5. [Workflow Diagrams](#5-workflow-diagrams)
6. [User Permissions Matrix](#6-user-permissions-matrix)
7. [Employee Profile — Complete Data Model](#7-employee-profile--complete-data-model)
8. [Current Integrations](#8-current-integrations)
9. [Reports Available](#9-reports-available)
10. [Future & Optional Features](#10-future--optional-features)
11. [Requirement Analysis Sheet](#11-requirement-analysis-sheet)

---

## 1. Introduction

### 1.1 About the HRMS

Lumos Logic HRMS is a cloud-hosted, multi-organization Human Resource Management System built for growing businesses. It covers the complete employee lifecycle — from onboarding to exit — with real-time attendance tracking, biometric integration, leave management, payroll processing, performance management, and advanced reporting.

The system is accessible via web browser and is hosted on a secure cloud server with daily data backups, SSL encryption, and role-based access control.

### 1.2 Purpose of This Document

This document serves as:

- A **product reference guide** explaining every available feature.
- A **workflow reference** showing how each process flows through the system.
- A **permissions guide** clarifying what each role can see and do.
- A **requirement gathering template** for the client to identify gaps and customization needs.
- A **gap analysis tool** for planning implementation discussions.

### 1.3 Supported User Roles

| Role | Description |
|---|---|
| **Root Admin** | Organization owner with full access. Manages HR admins, org settings, and all data. |
| **HR Admin** | HR department staff. Manages employees, approves leaves/regularizations, processes payroll. |
| **Employee** | Regular staff. Can check in/out, apply leaves, view payslips, manage own profile. |
| **Platform Admin** | Lumos Logic super-admin. Manages multiple organizations on the platform. |

---

## 2. System Overview

### 2.1 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Web Browser (SPA)                     │
│              React 18 + Vite Frontend                    │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTPS
┌─────────────────────▼───────────────────────────────────┐
│              Lumos Logic Cloud Server (VPS)              │
│           Node.js + Express REST API                     │
│              Nginx Reverse Proxy                         │
└──────────────┬──────────────────┬───────────────────────┘
               │                  │
┌──────────────▼──┐    ┌──────────▼───────────────────────┐
│  PostgreSQL DB  │    │   Cloudinary (File & Image Store) │
│  (Self-hosted)  │    │   Email (SMTP / Nodemailer)       │
└─────────────────┘    │   Web Push Notifications          │
                       │   Google Calendar (optional)      │
                       │   ZKTeco Biometric Devices        │
                       └──────────────────────────────────┘
```

### 2.2 Multi-Organization Support

The system supports **multiple organizations on a single deployment**. Each organization has:
- A unique URL slug (e.g., `hrms.lumoslogic.com/?org=relitrade`)
- Completely isolated data — employees, leaves, payroll, biometric logs
- Own HR Admins and Root Admin
- Own organization settings (logo, name, work schedule, leave quotas)

### 2.3 Authentication Flow

```
User enters Email + Password
         ↓
System verifies credentials
         ↓
If 2FA enabled → Enter 6-digit TOTP code
         ↓
JWT Token issued (7-day validity)
         ↓
Role-based UI loaded
         ↓
Auto-redirect if token expires
```

### 2.4 Access URLs

| Role | URL |
|---|---|
| Employee Portal | `https://hrms.lumoslogic.com/portal/*` |
| HR Admin | `https://hrms.lumoslogic.com/dashboard` |
| Root Admin | `https://hrms.lumoslogic.com/root/dashboard` |

---

## 3. Module Summary

| # | Module | Status | Accessible By |
|---|---|---|---|
| 1 | Authentication & Security | ✅ Complete | All |
| 2 | Dashboard (HR + Employee + Root) | ✅ Complete | All |
| 3 | Employee Management | ✅ Complete | Root Admin, HR Admin |
| 4 | Attendance Management | ✅ Complete | All |
| 5 | Leave Management | ✅ Complete | All |
| 6 | Leave Policies | ✅ Complete | Root Admin, HR Admin |
| 7 | Biometric Integration (ZKTeco) | ✅ Complete | Root Admin, HR Admin |
| 8 | Regularization | ✅ Complete | All |
| 9 | Payroll & Salary | ✅ Complete | Root Admin, HR Admin, Employee (view) |
| 10 | Reports & Analytics | ✅ Complete | Root Admin, HR Admin |
| 11 | Performance Management | ✅ Complete | All |
| 12 | Onboarding | ✅ Complete | Root Admin, HR Admin |
| 13 | Exit Management | ✅ Complete | All |
| 14 | Expenses | ✅ Complete | All |
| 15 | Assets | ✅ Complete | Root Admin, HR Admin |
| 16 | Holidays | ✅ Complete | All |
| 17 | Shifts & Roster | ✅ Complete | Root Admin, HR Admin |
| 18 | Departments & Designations | ✅ Complete | Root Admin, HR Admin |
| 19 | Branches | ✅ Complete | Root Admin, HR Admin |
| 20 | Announcements & Broadcast | ✅ Complete | Root Admin, HR Admin |
| 21 | Notifications | ✅ Complete | All |
| 22 | Team Calendar | ✅ Complete | All |
| 23 | Documents | ✅ Complete | All |
| 24 | Organization Settings | ✅ Complete | Root Admin |
| 25 | Multi-Organization (Platform) | ✅ Complete | Platform Admin |

---

## 4. Detailed Module Documentation

---

### 4.1 Authentication & Security

**Purpose:** Secure, role-based login with modern security features.

**Features:**

| Feature | Description |
|---|---|
| Email & Password Login | JWT-based, org-slug scoped |
| Two-Factor Authentication (TOTP) | Google Authenticator / Authy compatible |
| Forgot Password | Email-based reset link (1-hour expiry) |
| Email Verification | 6-digit code sent to registered email |
| Force Password Change | Admin can force employees to reset on first login |
| Password Reuse Prevention | Rejects last 5 previously used passwords |
| Login History | Last 15 logins with IP address and device info |
| GDPR Data Download | Employee can download all their personal data as JSON |
| Account Deactivation | Employee can request account deactivation |
| GDPR Deletion Request | Employee can submit Right to be Forgotten request |
| Avatar Upload | Profile photo upload via Cloudinary (auto face-crop) |
| Session Duration | 7-day JWT token, auto-logout on expiry |

**Accessible By:** All roles

---

### 4.2 Dashboard

**Purpose:** Real-time operational snapshot for each role.

#### HR Admin Dashboard Features

| Feature | Description |
|---|---|
| Today's KPI Cards | Total Employees, Present Today, On Leave, WFH Today, Checked In, Pending Approvals |
| Live Attendance Feed | Real-time list of employees who have checked in today |
| Pending Leave Approvals | Quick list with one-click Approve / Reject |
| Attendance Trend Chart | Last 7 / 14 / 30 day attendance percentage graph |
| Leave Breakdown | Bar chart of leave usage by type |
| HR Insights | Late arrivals, upcoming birthdays, document alerts, team overview |
| Action Center | Quick-access buttons for all key actions |
| Date Navigation | View historical data for any past date |

#### Root Admin Dashboard Features

| Feature | Description |
|---|---|
| All HR Admin features | Complete access |
| Live Activity Feed | Real-time check-ins and events across org |
| Attendance Rate Badge | Overall % shown in header |
| On-Leave Count | Instant view |
| Pending Approvals Panel | Leaves, WFH, Regularizations all in one |
| Today's Workforce Chart | Donut chart: Present, On Leave, WFH, Absent |
| Attendance Trend | 7/14/30 day graphs |
| New Joiners | Employees joined in last 7 days |

#### Employee Dashboard Features

| Feature | Description |
|---|---|
| My Today Status | Check-in/out status, current work hours |
| Quick Check-in/out | One-click from dashboard |
| My Leave Balance | Visual balance per leave type |
| My Upcoming Leaves | List of pending and approved leaves |
| Recent Announcements | Org-wide announcements |
| Attendance Summary | This month's present/absent/leave count |

**Accessible By:** All (role-filtered views)

---

### 4.3 Employee Management

**Purpose:** Central repository for all employee data.

**Features:**

| Feature | Description |
|---|---|
| Add Employee | Full creation with all fields, sends welcome email with login credentials |
| Edit Employee | Update any employee information |
| Deactivate / Reactivate | Soft-delete — data preserved, login disabled |
| Delete Employee | Permanent removal |
| Multi-Department Assignment | Employee can belong to multiple departments with different roles (Member / Team Lead / Manager) |
| Import Employees | Bulk import via CSV/Excel |
| Export Employees | Download full employee list as CSV |
| Reset Employee Password | Admin-forced password reset |
| Biometric PIN Mapping | Map employee to biometric device enrollment ID |
| Branch Assignment | Assign employee to a physical office branch |
| Reporting Manager | Define organizational hierarchy |
| Employee Profile (16 Sections) | See Section 7 for complete data model |
| Employee Status | Active, Inactive, On Leave |
| Search & Filter | By name, department, designation, status, branch |
| Employee Photo | Upload profile photo |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ❌

---

### 4.4 Attendance Management

**Purpose:** Track daily work hours for all employees.

**Features:**

| Feature | Description |
|---|---|
| Check-in | Employee punches in with timestamp |
| Check-out | Employee punches out |
| Break In / Break Out | Track break time separately |
| Gross Hours | Total time from check-in to check-out |
| Break Minutes | Total break time |
| Effective Work Hours | Gross hours minus breaks |
| Late Flag | Auto-flagged if check-in after configured threshold |
| Early Exit Flag | Auto-flagged if check-out before expected time |
| Admin Manual Entry | HR can enter attendance manually for any employee |
| Admin Edit Record | Modify any existing attendance record |
| Biometric Auto-Sync | Attendance auto-created from biometric punch logs |
| Attendance Source Tracking | Marks whether record is `manual`, `biometric`, or `portal` |
| Half Day | Supported as a status in attendance |
| WFH Attendance | WFH leaves create corresponding attendance records |
| Monthly Calendar View | Visual calendar showing each day's status |
| Date Navigation | HR can view any date's full attendance |
| Live Session Tracking | Estimates hours for employees currently checked in |
| My Attendance (Employee) | Employee views own monthly attendance |

**Attendance Status Values:**

| Status | Meaning |
|---|---|
| present | Checked in normally |
| half_day | Half day attendance |
| on_leave | Approved leave |
| wfh | Work from home |
| absent | No record / no attendance |
| late | Checked in after threshold |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ✅ (own only)

---

### 4.5 Leave Management

**Purpose:** Complete leave request and approval workflow.

**Leave Types Supported:**

| Type | Description | Default Quota |
|---|---|---|
| Annual Leave | General paid leave | 18 days/year |
| Sick Leave | Medical leave | 12 days/year |
| Casual Leave | Short personal leave | 8 days/year |
| Emergency Leave | Urgent situation leave | 3 days/year |
| Maternity Leave | For new mothers | 180 days |
| Paternity Leave | For new fathers | 15 days |
| Compensatory Off | Comp off for extra work | As accrued |
| Work From Home (WFH) | Remote working day | Configurable |

**Features:**

| Feature | Description |
|---|---|
| Apply Leave | Select type, dates, reason |
| Half Day Leave | Specify morning / afternoon |
| WFH Request | Separate from leave quota |
| Date Conflict Check | System prevents overlapping leaves |
| Leave Balance Display | Real-time balance per type |
| Approval Workflow | HR / Root Admin approves or rejects |
| Cancel Leave | Employee can cancel pending leaves |
| Email Notifications | Sent on apply and on status change |
| Auto Attendance Update | Approved leave auto-creates attendance record |
| WFH + Half-Day Coexistence | Both can exist on same day (different dimensions) |
| Leave History | Full history with status timeline |
| Admin Bulk View | HR sees all org leaves, filterable by status/date/type |
| Company-Wide Leave | HR can apply approved leave for all employees (e.g., declared holidays, rain days) |
| Google Calendar Sync | Approved leaves can sync to Google Calendar |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ✅

---

### 4.6 Leave Policies

**Purpose:** Configure leave entitlements per organization.

**Features:**

| Feature | Description |
|---|---|
| Per-Type Quota | Set annual quota for each leave type |
| Carry Forward | Enable/disable carry forward of unused leaves |
| Max Carry Forward | Cap on how many days carry forward |
| Paid / Unpaid Flag | Mark leave type as paid or unpaid |
| Effective Date | Policy changes can have effective dates |
| Default Policies | Pre-configured with industry standards |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ❌ (view balance only)

---

### 4.7 Biometric Integration

**Purpose:** Automatic attendance capture from physical biometric devices.

**Supported Protocol:** ZKTeco ADMS (Attendance Data Management System)  
**Compatible Devices:** All ZKTeco fingerprint / face recognition devices supporting ADMS protocol  
**Connection Type:** HTTP/HTTPS push from device to server (no polling required)

**Features:**

| Feature | Description |
|---|---|
| Device Registration | Add devices with serial number, IP, branch, area code |
| Online / Offline Status | Real-time status based on last heartbeat (5-min threshold) |
| Punch Log Reception | Receives ATTLOG data: Employee PIN, timestamp, punch type |
| Punch Type Mapping | 0 = Check-in, 1 = Check-out |
| Auto Attendance Creation | Processed logs create/update attendance records |
| Employee PIN Mapping | Maps device enrollment ID to HRMS employee profile |
| Raw Log Viewer | HR can view all raw biometric logs with filters |
| Reprocess Logs | Re-run processing for unprocessed punch logs |
| Multi-Device Support | Multiple devices across multiple branches |
| Branch-wise Device | Each device assigned to a specific branch |

**Biometric Setup Flow:**

```
Device purchased (ZKTeco) 
        ↓
Configure device ADMS server IP → point to HRMS server
        ↓
Register device in HRMS (Serial No, IP, Branch)
        ↓
Map employees: HRMS Employee ↔ Device Enrollment PIN
        ↓
Device sends punch data automatically
        ↓
HRMS processes logs → creates attendance records
```

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ❌

---

### 4.8 Regularization

**Purpose:** Allow employees to correct missed or incorrect attendance records.

**Features:**

| Feature | Description |
|---|---|
| Submit Request | Employee submits correction with reason |
| Date & Time Entry | Specify correct check-in / check-out times |
| Admin Review | HR reviews and approves or rejects |
| Attendance Update | Approved regularization updates the attendance record |
| Notifications | Employee and HR notified at each stage |
| History | Complete regularization history with status |

**Workflow:**

```
Employee identifies incorrect attendance
        ↓
Submits Regularization Request
        ↓
HR Admin reviews request
        ↓
Approve → Attendance record updated
Reject → Employee notified with reason
```

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ✅

---

### 4.9 Payroll & Salary

**Purpose:** Salary structure management and payslip generation.

**Features:**

| Feature | Description |
|---|---|
| Salary Structure | Define per-employee salary components |
| Effective Date | Structure changes tracked with effective dates |
| Payslip Generation | Auto-calculated from attendance and leaves |
| LOP (Loss of Pay) | Auto-calculated from absences and half-days |
| Actual Working Days | System calculates per-month working days (excluding Sundays/holidays) |
| Publish Payslip | HR publishes → employee gets notification and access |
| Employee Payslip View | Employee downloads own payslips |
| All Payslips View | HR views all payslips by month/year |

**Salary Components:**

| Component | Type |
|---|---|
| Basic Salary | Earnings |
| HRA (House Rent Allowance) | Earnings |
| DA (Dearness Allowance) | Earnings |
| Transport Allowance | Earnings |
| Medical Allowance | Earnings |
| Other Allowances | Earnings |
| PF Employee Contribution | Deductions |
| PF Employer Contribution | Informational |
| ESI Employee Contribution | Deductions |
| ESI Employer Contribution | Informational |
| Professional Tax | Deductions |
| TDS | Deductions |
| LOP (Loss of Pay) | Deductions (auto-calculated) |

**Payroll Calculation Formula:**

```
Gross Salary = Basic + HRA + DA + Transport + Medical + Other Allowances
Deductions = PF (Employee) + ESI (Employee) + Professional Tax + TDS + LOP
Net Salary = Gross Salary - Deductions

LOP = (Monthly CTC / Working Days in Month) × (Absent Days + Half Days × 0.5)
```

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ✅ (own payslips only)

---

### 4.10 Reports & Analytics

**Purpose:** Data-driven insights for HR decision-making.

**Available Reports:**

| Report | Format | Description |
|---|---|---|
| Attendance Report | JSON / CSV | Daily attendance per employee, includes hours, breaks, status |
| Leave Report | JSON / CSV | Leave history by year/month/status/type |
| Employee List | JSON / CSV | Full employee export with all details |
| Headcount Summary | JSON | Total, active, department-wise breakdown |
| Analytics Dashboard | Charts | 7/14/30-day trends, pending counts, KPIs |
| Live Attendance | Real-time | Current day check-in status |
| Late Arrivals | Real-time | Today's late check-ins |
| Monthly Summary | Per employee | Present/absent/leave count for month |

**Filter Options (Attendance Report):**

- Date range (start date to end date)
- Specific employee
- Department
- Status (present / absent / on_leave / wfh / half_day)
- CSV or JSON download

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ❌

---

### 4.11 Performance Management

**Purpose:** Track employee goals and conduct performance reviews.

**Features:**

| Feature | Description |
|---|---|
| Goals Management | Create goals with title, category, target date, review cycle |
| Goal Progress | Update progress percentage (0–100%) |
| Goal Status | Tracking, Completed, Overdue, Cancelled |
| Performance Reviews | Annual / custom cycle reviews |
| Reviewer Assignment | Assign a reviewer to each employee |
| Review Status | Pending, In Progress, Completed |
| Notifications | Employee notified when review is initiated |
| Self-Review | Employee can view own goals and progress |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ✅ (own goals/reviews)

---

### 4.12 Onboarding

**Purpose:** Structured checklist for new employee onboarding.

**Features:**

| Feature | Description |
|---|---|
| Checklist Creation | HR creates onboarding task list per employee |
| Task Assignment | Tasks assigned with due dates |
| Task Completion | Mark tasks as complete |
| Progress Tracking | View % completion |
| Notifications | New employee notified of onboarding checklist |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ✅ (own checklist)

---

### 4.13 Exit Management

**Purpose:** Manage employee resignation and full-and-final process.

**Features:**

| Feature | Description |
|---|---|
| Exit Request | Employee submits resignation with date and reason |
| Notice Period | System auto-calculates last working day from notice period days |
| Admin Review | HR reviews and updates exit status |
| Exit Status | Pending, Approved, Rejected, Completed |
| Notes | HR can add internal notes to exit record |
| Notifications | HR and employee notified at each stage |
| Exit History | Full record of all exit requests |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ✅ (own exit)

---

### 4.14 Expenses

**Purpose:** Employee expense submission and reimbursement workflow.

**Features:**

| Feature | Description |
|---|---|
| Submit Expense | Employee submits with amount, category, date, description |
| Receipt Upload | Attach receipt image (via Cloudinary) |
| Admin Approval | HR approves or rejects |
| Expense Status | Pending, Approved, Rejected |
| Notifications | Employee notified on status change |
| Expense History | Full list with status |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ✅

---

### 4.15 Assets

**Purpose:** Track company assets assigned to employees.

**Features:**

| Feature | Description |
|---|---|
| Asset Creation | Add asset with type, serial number, description |
| Employee Assignment | Assign asset to specific employee |
| Assignment Date | Track when asset was issued |
| Return Tracking | Mark asset as returned |
| Notifications | Employee notified when asset is assigned |
| Asset History | Full assignment history |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ✅ (own assets view)

---

### 4.16 Holidays

**Purpose:** Organization holiday calendar management.

**Features:**

| Feature | Description |
|---|---|
| Add Holiday | Name, date, type (national / regional / optional) |
| Holiday List | Org-wide calendar of all declared holidays |
| Leave Integration | Holidays excluded from LOP and leave balance calculations |
| Employee View | All employees can view upcoming holidays |
| Annual Calendar | Full year calendar view |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ✅ (view only)

---

### 4.17 Shifts & Roster

**Purpose:** Define work shift timings and assign to employees.

**Features:**

| Feature | Description |
|---|---|
| Shift Creation | Define shift name, start time, end time |
| Late Threshold | Configure how many minutes of grace period before late flag |
| Work Days | Configure working days (Mon–Sat, Mon–Fri, etc.) |
| Shift Assignment | Assign shift to employee or department |
| Roster View | Calendar view of shift assignments |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ❌

---

### 4.18 Departments & Designations

**Purpose:** Organizational structure management.

**Departments:**

| Feature | Description |
|---|---|
| Create Department | Add department with name and description |
| Edit / Delete | Modify or remove departments |
| Multi-Department Employees | Employees can belong to multiple departments |
| Department Roles | Member, Team Lead, Manager per department |

**Designations:**

| Feature | Description |
|---|---|
| Create Designation | Add job title/designation |
| Edit / Delete | Modify or remove designations |
| Employee Assignment | Assign designation to employee |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ❌

---

### 4.19 Branches

**Purpose:** Manage multiple office locations.

**Features:**

| Feature | Description |
|---|---|
| Add Branch | Name, address, city, state |
| Edit / Delete | Modify or remove branches |
| Employee Assignment | Assign employee to a branch |
| Biometric Device Mapping | Each device assigned to a branch |
| Branch-wise Reports | Filter attendance by branch |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ❌

---

### 4.20 Announcements & Broadcast

**Purpose:** Organization-wide communication.

**Features:**

| Feature | Description |
|---|---|
| Create Announcement | Title, body, optional file attachment |
| File Attachment | Upload documents/images via Cloudinary |
| Broadcast | Sends notification to all org members instantly |
| Announcement Feed | Employees see all published announcements |
| Delete Announcement | Admin can remove announcements |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ✅ (view only)

---

### 4.21 Notifications

**Purpose:** In-app notification system for all events.

**Notification Triggers:**

| Event | Recipient |
|---|---|
| Leave applied | HR Admin |
| Leave approved/rejected | Employee |
| Regularization submitted | HR Admin |
| Regularization approved/rejected | Employee |
| Payslip published | Employee |
| Announcement posted | All employees |
| Onboarding checklist created | Employee |
| Exit request submitted | HR Admin |
| Expense submitted | HR Admin |
| Expense approved/rejected | Employee |
| Asset assigned | Employee |
| Performance review initiated | Employee |

**Features:**

| Feature | Description |
|---|---|
| In-app Notifications | Real-time bell icon with unread count |
| Mark as Read | Single or mark all as read |
| Delete Notification | Remove individual notifications |
| Last 50 Notifications | Paginated notification history |
| Web Push Notifications | Browser push notifications (if enabled) |

**Accessible By:** All roles

---

### 4.22 Team Calendar

**Purpose:** Visual calendar showing org-wide leave and attendance events.

**Features:**

| Feature | Description |
|---|---|
| Team Leave Calendar | All approved leaves plotted on calendar |
| WFH View | WFH days visible on calendar |
| Holiday Markers | Org holidays shown |
| Employee Filter | Filter by specific employee or department |
| Month / Week View | Toggle between views |
| Leave Details | Click on leave to see full details |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ✅

---

### 4.23 Documents

**Purpose:** Employee document management.

**Features:**

| Feature | Description |
|---|---|
| Document Upload | Upload HR documents (offer letter, contract, etc.) |
| Employee Access | Employee can view/download own documents |
| Document Categories | Organize by type |
| Secure Storage | Files stored on Cloudinary with access control |

**Accessible By:** Root Admin ✅ | HR Admin ✅ | Employee ✅ (own docs)

---

### 4.24 Organization Settings

**Purpose:** Configure organization-level settings.

**Features:**

| Feature | Description |
|---|---|
| Organization Name | Update official org name |
| Logo | Upload and update organization logo |
| URL Slug | Unique identifier for org login URL |
| Work Days | Configure working days per week |
| Late Threshold | Minutes of grace period before marking late |
| Total Annual Leaves | Default annual leave quota |
| HR Admin Management | Add / remove HR admins |
| Leave Policy Config | Configure all leave type quotas |

**Accessible By:** Root Admin ✅ | HR Admin ❌ | Employee ❌

---

## 5. Workflow Diagrams

### 5.1 Employee Onboarding Flow

```
New Employee Data Received by HR
             ↓
HR Admin creates employee account
(Name, Email, Department, Designation, Joining Date)
             ↓
System sends Welcome Email
(Login credentials + portal URL)
             ↓
HR creates Onboarding Checklist
             ↓
Employee logs in → Force Password Change
             ↓
Employee completes profile
(Personal, Education, Experience, Bank, Documents)
             ↓
HR maps biometric device PIN
             ↓
Employee starts attendance tracking
```

---

### 5.2 Daily Attendance Flow

```
Employee arrives at office
          ↓
    ┌─────┴──────┐
    │            │
Biometric     Manual Portal
Punch-in      Check-in
    │            │
    └─────┬──────┘
          ↓
Attendance Record Created
(check_in, date, status = present)
          ↓
Employee works → optional Break In/Out
          ↓
Punch-out / Check-out
          ↓
System calculates:
- Gross Hours (check-in to check-out)
- Break Minutes (total break time)
- Effective Work Hours (gross - breaks)
- Late Flag (if check-in > threshold)
          ↓
Attendance finalized for the day
          ↓
HR views live attendance dashboard
```

---

### 5.3 Leave Application & Approval Flow

```
Employee logs into portal
          ↓
Goes to "My Leaves" → Apply Leave
          ↓
Selects: Leave Type, Start Date, End Date, Reason
          ↓
System checks:
- Date conflicts with existing leaves
- Sufficient leave balance
          ↓
Leave submitted → Status: Pending
          ↓
Email sent to HR Admin
          ↓
HR reviews in dashboard
          ↓
    ┌─────┴──────┐
Approve         Reject
    │            │
    ↓            ↓
Status:       Status:
Approved      Rejected
    │            │
    ↓            ↓
Attendance    Employee
record        notified
auto-created
(status = on_leave)
    │
    ↓
Employee leave balance updated
Employee notified via email + in-app
```

---

### 5.4 Biometric Attendance Flow

```
Employee punches finger/face on ZKTeco device
                    ↓
Device sends ATTLOG data to HRMS server
(Employee PIN, Timestamp, Punch Type 0/1)
                    ↓
Server receives data at /iclock/cdata
Responds with "OK" in < 2 seconds
                    ↓
Raw log saved to database
                    ↓
Background processor matches PIN to employee
                    ↓
Punch Type 0 → Creates check_in record
Punch Type 1 → Creates check_out record
                    ↓
Attendance record created/updated
(source = biometric)
                    ↓
HR dashboard shows real-time status
```

---

### 5.5 Payroll Processing Flow

```
HR Admin selects Pay Month
          ↓
System fetches:
- Attendance records for the month
- Approved leaves
- Salary structure (latest effective for employee)
- Holidays (excluded from LOP calc)
          ↓
Calculates:
Working Days in month (excluding Sundays/holidays)
Present Days = Working Days - Absent Days - Leave Days
LOP Days = Absent Days + (Half Days × 0.5)
          ↓
Computes:
Gross Salary (Basic + Allowances)
LOP Deduction = (CTC / Working Days) × LOP Days
Total Deductions (PF + ESI + PT + TDS + LOP)
Net Salary = Gross - Deductions
          ↓
Payslip generated
          ↓
HR reviews and publishes
          ↓
Employee receives notification
Employee can view & download payslip
```

---

### 5.6 Regularization Flow

```
Employee realizes missed punch / wrong time
             ↓
Submits Regularization Request
(Date, Correct Check-in time, Correct Check-out time, Reason)
             ↓
HR Admin receives notification
             ↓
HR reviews request
Compares with biometric logs if available
             ↓
    ┌────────┴────────┐
Approve             Reject
    │                │
    ↓                ↓
Attendance        Employee notified
record updated    with reason
    │
    ↓
Employee notified of approval
```

---

### 5.7 Exit Management Flow

```
Employee decides to resign
          ↓
Submits Exit Request
(Resignation Date, Reason, Notice Period)
          ↓
System calculates Last Working Day
= Resignation Date + Notice Period Days
          ↓
HR Admin notified
          ↓
HR reviews exit request
          ↓
    ┌─────┴──────┐
Approve         Reject
    │
    ↓
HR conducts exit interview
Full-and-final settlement
          ↓
Account deactivated
Employee data archived
```

---

## 6. User Permissions Matrix

### 6.1 Employee Management

| Feature | Root Admin | HR Admin | Employee |
|---|---|---|---|
| View All Employees | ✅ | ✅ | ❌ |
| Add Employee | ✅ | ✅ | ❌ |
| Edit Employee | ✅ | ✅ | ❌ |
| Delete Employee | ✅ | ✅ | ❌ |
| View Own Profile | ✅ | ✅ | ✅ |
| Edit Own Profile | ✅ | ✅ | ✅ |
| Reset Employee Password | ✅ | ✅ | ❌ |
| Import / Export | ✅ | ✅ | ❌ |

### 6.2 Attendance

| Feature | Root Admin | HR Admin | Employee |
|---|---|---|---|
| View All Attendance | ✅ | ✅ | ❌ |
| View Own Attendance | ✅ | ✅ | ✅ |
| Check-in / Check-out | ✅ | ✅ | ✅ |
| Break In / Break Out | ✅ | ✅ | ✅ |
| Manual Entry (Any Employee) | ✅ | ✅ | ❌ |
| Edit Attendance Record | ✅ | ✅ | ❌ |
| Date Navigation | ✅ | ✅ | ✅ (own) |

### 6.3 Leave Management

| Feature | Root Admin | HR Admin | Employee |
|---|---|---|---|
| Apply Leave | ✅ | ✅ | ✅ |
| View Own Leaves | ✅ | ✅ | ✅ |
| View All Org Leaves | ✅ | ✅ | ❌ |
| Approve / Reject Leave | ✅ | ✅ | ❌ |
| Cancel Own Leave | ✅ | ✅ | ✅ |
| Apply Leave for Others | ✅ | ✅ | ❌ |
| Configure Leave Policies | ✅ | ✅ | ❌ |

### 6.4 Payroll

| Feature | Root Admin | HR Admin | Employee |
|---|---|---|---|
| View All Payslips | ✅ | ✅ | ❌ |
| View Own Payslip | ✅ | ✅ | ✅ |
| Generate Payslip | ✅ | ✅ | ❌ |
| Publish Payslip | ✅ | ✅ | ❌ |
| Edit Salary Structure | ✅ | ✅ | ❌ |

### 6.5 Reports

| Feature | Root Admin | HR Admin | Employee |
|---|---|---|---|
| Attendance Report | ✅ | ✅ | ❌ |
| Leave Report | ✅ | ✅ | ❌ |
| Employee Export | ✅ | ✅ | ❌ |
| Headcount Summary | ✅ | ✅ | ❌ |
| Analytics Dashboard | ✅ | ✅ | ❌ |

### 6.6 Settings & Configuration

| Feature | Root Admin | HR Admin | Employee |
|---|---|---|---|
| Org Settings | ✅ | ❌ | ❌ |
| Manage HR Admins | ✅ | ❌ | ❌ |
| Add Holiday | ✅ | ✅ | ❌ |
| Manage Shifts | ✅ | ✅ | ❌ |
| Manage Branches | ✅ | ❌ | ❌ |
| Biometric Devices | ✅ | ✅ | ❌ |
| Leave Policies | ✅ | ✅ | ❌ |

### 6.7 Other Modules

| Feature | Root Admin | HR Admin | Employee |
|---|---|---|---|
| Submit Regularization | ✅ | ✅ | ✅ |
| Approve Regularization | ✅ | ✅ | ❌ |
| Submit Expense | ✅ | ✅ | ✅ |
| Approve Expense | ✅ | ✅ | ❌ |
| Submit Exit Request | ✅ | ✅ | ✅ |
| Approve Exit | ✅ | ✅ | ❌ |
| Create Announcement | ✅ | ✅ | ❌ |
| View Announcements | ✅ | ✅ | ✅ |
| Assign Assets | ✅ | ✅ | ❌ |
| View Own Assets | ✅ | ✅ | ✅ |
| Performance Goals | ✅ | ✅ | ✅ (own) |
| Performance Reviews | ✅ | ✅ | ✅ (own) |

---

## 7. Employee Profile — Complete Data Model

Each employee has a 16-section profile covering all HR data needs.

### Section 1: Personal Information

| Field | Description |
|---|---|
| Salutation | Mr. / Ms. / Dr. / etc. |
| First Name, Middle Name, Last Name | Full legal name |
| Gender | Male / Female / Other |
| Date of Birth | For age and leave calculations |
| Blood Group | Emergency reference |
| Marital Status | Single / Married / Divorced / Widowed |
| Nationality | Country of citizenship |
| Religion | Optional |
| Personal Email | Non-company email |
| Phone Number | Primary contact |
| Current Address | Full address with city, state, country, PIN |
| Permanent Address | Full address with city, state, country, PIN |
| Profile Photo | Upload via Cloudinary |

### Section 2: Professional Information

| Field | Description |
|---|---|
| Employee ID | Unique org identifier |
| Department(s) | Multi-department support |
| Designation / Position | Job title |
| Grade | Pay grade / level |
| Employment Type | Full Time / Part Time / Contract / Intern |
| Joining Date | Start of employment |
| Reporting Manager | Direct supervisor |
| Branch | Office location |
| Cost Centre | Financial centre code |
| Pay Cadre | Salary band |

### Section 3: Education

| Field | Description |
|---|---|
| Degree | Qualification name |
| Institution | College / University name |
| Specialization | Field of study |
| Country | Country of study |
| From Year / To Year | Duration |

### Section 4: Work Experience

| Field | Description |
|---|---|
| Company Name | Previous employer |
| Position | Role held |
| Start Date / End Date | Duration |
| Location | Work location |
| Description | Responsibilities summary |

### Section 5: Skills

| Field | Description |
|---|---|
| Skill Name | Technical or soft skill |
| Proficiency | Beginner / Intermediate / Advanced / Expert |
| Years of Experience | Duration of skill |
| Certifying Body | If applicable |

### Section 6: Banking Details

| Field | Description |
|---|---|
| Bank Name | Salary account bank |
| Account Number | Masked display (last 4 digits) |
| IFSC Code | Branch code |
| Account Type | Savings / Current |
| Branch Name | Bank branch |

### Section 7: Emergency Contacts

| Field | Description |
|---|---|
| Contact Name | Emergency contact person |
| Relationship | Relation to employee |
| Phone Number | Contact number |
| Address | Contact address |

### Section 8: Family Members

| Field | Description |
|---|---|
| Name | Family member name |
| Relationship | Spouse / Child / Parent / etc. |
| Date of Birth | For insurance/nominee purposes |
| Dependent | Yes / No |

### Section 9: Health Information

| Field | Description |
|---|---|
| Height / Weight | Physical data |
| Disabilities | If any declared |
| Medical Conditions | If declared |
| Insurance Number | Health insurance policy |

### Section 10: Government Documents

| Field | Description |
|---|---|
| Aadhar Card Number | National ID (India) |
| Aadhar Upload | Document scan |
| PAN Card Number | Tax ID (India) |
| PAN Upload | Document scan |
| Passport Number | If applicable |
| Passport Upload | Document scan |

### Section 11: Statutory Information

| Field | Description |
|---|---|
| PF Number | Provident Fund account |
| UAN Number | Universal Account Number |
| ESI Number | Employee State Insurance |
| PF Applicable | Yes / No |
| ESI Applicable | Yes / No |

### Section 12: Nominations (Insurance/PF)

| Field | Description |
|---|---|
| Nominee Name | Beneficiary name |
| Relationship | Relation to employee |
| Share Percentage | % of benefits |
| Nominee Address | Contact address |

### Section 13: Certifications

| Field | Description |
|---|---|
| Certificate Name | Certification title |
| Issuing Body | Organization that issued it |
| Issue Date | When issued |
| Expiry Date | If applicable |
| Certificate Upload | Document upload |

### Section 14: Training Records

| Field | Description |
|---|---|
| Training Name | Course / training title |
| Provider | Training institution |
| Date | When attended |
| Duration | Hours / days |
| Score / Grade | If assessed |

### Section 15: Immigration Details

| Field | Description |
|---|---|
| Visa Type | Work visa category |
| Visa Number | Visa identifier |
| Valid From / To | Visa validity period |
| Country of Issue | Issuing country |
| Work Permit | Permit number and validity |

### Section 16: Account Settings

| Field | Description |
|---|---|
| Login Email | HRMS login credential |
| Avatar Color | Profile display color |
| Display Name | Name shown in system |
| 2FA Status | Two-factor authentication enabled/disabled |
| Email Verified | Verification status |

---

## 8. Current Integrations

| Integration | Purpose | Status |
|---|---|---|
| **ZKTeco Biometric** | Auto attendance from fingerprint/face devices | ✅ Active |
| **Cloudinary** | Profile photos, document uploads, announcement attachments | ✅ Active |
| **Email (SMTP/Nodemailer)** | Leave notifications, welcome emails, password reset, payslip alerts | ✅ Active |
| **Web Push Notifications** | Browser push alerts for key events | ✅ Active |
| **Google Calendar** | Sync approved leaves to Google Calendar | ✅ Available |
| **PostgreSQL** | Primary database (self-hosted on VPS) | ✅ Active |

---

## 9. Reports Available

| # | Report Name | Filters | Export Format |
|---|---|---|---|
| 1 | Attendance Report | Date range, Employee, Status | JSON, CSV |
| 2 | Leave Report | Year, Month, Status, Leave Type | JSON, CSV |
| 3 | Employee List | Active/Inactive, Department | JSON, CSV |
| 4 | Headcount Summary | Department-wise breakout | JSON |
| 5 | Late Arrivals | Date, Department | Real-time |
| 6 | Monthly Attendance Summary | Employee, Month/Year | On-screen |
| 7 | Biometric Raw Logs | Device, Employee PIN, Date | On-screen |
| 8 | Payslip Archive | Month, Year, Employee | PDF (per payslip) |
| 9 | Leave Balance Report | Per employee, Per type | On-screen |
| 10 | Analytics Trend | 7/14/30 day attendance % | Chart + data |

---

## 10. Future & Optional Features

These features are **not currently included** but can be developed based on client requirements:

| # | Feature | Description |
|---|---|---|
| 1 | Mobile App | Native iOS and Android apps for employees |
| 2 | GPS-based Attendance | Geo-fencing for location-based check-in |
| 3 | Multi-Level Leave Approval | Manager → HR → Director approval chain |
| 4 | Overtime Management | Track and compensate overtime hours |
| 5 | Shift Swap | Employee-to-employee shift exchange requests |
| 6 | Recruitment Module | Job postings, applications, interview scheduling |
| 7 | Training Management | Full LMS / training calendar |
| 8 | Travel & Expense | Travel requests with advances and settlement |
| 9 | Helpdesk / Ticketing | Internal IT and HR ticket system |
| 10 | Visitor Management | Guest registration and access control |
| 11 | Asset Tracking | Full asset lifecycle with QR codes |
| 12 | Loan & Advance | Salary advance and loan requests |
| 13 | Grievance Management | Employee complaint and resolution tracking |
| 14 | Succession Planning | Career path and promotion tracking |
| 15 | Custom Approval Workflows | Configurable multi-step approval chains |
| 16 | WhatsApp / SMS Notifications | Notifications via WhatsApp Business API or SMS |
| 17 | Advanced Analytics | Custom report builder, pivot tables |
| 18 | Payroll Statutory Filing | Auto-generate PF/ESI/PT challan files |
| 19 | Form 16 / IT Returns | Annual tax document generation |
| 20 | Multi-Currency Payroll | For international employees |

---

## 11. Requirement Analysis Sheet

> **Instructions for Client:**  
> Please review each module below and:
> - Check **Required** if your organization needs this feature.
> - Leave notes in **Customization Needed** for specific requirements that differ from the standard implementation.
> - Mark **Priority** as High / Medium / Low.

---

### 11.1 Core Modules

| Module | Available in HRMS | Required by Client | Priority | Customization Needed |
|---|---|---|---|---|
| Employee Master Data | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Department Management | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Designation Management | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Branch / Location Management | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Multi-Department Assignment | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Employee Import / Export | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Reporting Hierarchy | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |

---

### 11.2 Attendance

| Feature | Available | Required | Priority | Customization Needed |
|---|---|---|---|---|
| Manual Portal Check-in/out | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Biometric Integration (ZKTeco) | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Break Tracking | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Late / Early Exit Flags | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Overtime Tracking | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Shift-based Attendance | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| GPS-based Check-in | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Regularization | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |

---

### 11.3 Leave Management

| Feature | Available | Required | Priority | Customization Needed |
|---|---|---|---|---|
| Annual / Sick / Casual Leave | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Maternity / Paternity Leave | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Comp Off | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| WFH as Separate Category | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Half-Day Leave | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Leave Carry Forward | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Multi-Level Approval | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Custom Leave Types | ☐ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Leave Encashment | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |

---

### 11.4 Payroll

| Feature | Available | Required | Priority | Customization Needed |
|---|---|---|---|---|
| Basic + Allowances Salary Structure | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| PF / ESI Calculation | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Professional Tax | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| TDS Deduction | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| LOP Calculation | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Payslip Generation | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Overtime Pay | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Bonus / Incentive | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Salary Advance / Loan | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Bank Transfer File | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |
| PF / ESI Challan File | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Form 16 | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |

---

### 11.5 Reports

| Report | Available | Required | Priority | Customization Needed |
|---|---|---|---|---|
| Attendance Report (CSV) | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Leave Report (CSV) | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Employee List Export | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Monthly Salary Summary | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Late Arrivals Report | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Custom Report Builder | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Department-wise Analytics | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |

---

### 11.6 Other Modules

| Module | Available | Required | Priority | Customization Needed |
|---|---|---|---|---|
| Performance Goals & Reviews | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Onboarding Checklist | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Exit Management | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Expense Reimbursement | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Asset Management | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Document Management | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Announcements | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Team Calendar | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Recruitment Module | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Training Management | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Travel & Expense | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Mobile App | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |

---

### 11.7 Integration Requirements

| Integration | Available | Required | Priority | Details |
|---|---|---|---|---|
| ZKTeco Biometric Devices | ✅ | ☐ Yes ☐ No | H / M / L | No. of devices: _____ |
| Other Biometric Brand | ❌ | ☐ Yes ☐ No | H / M / L | Brand: ________________ |
| Email Notifications | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| WhatsApp Notifications | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |
| SMS Notifications | ❌ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Google Calendar | ✅ | ☐ Yes ☐ No | H / M / L | _________________________ |
| Accounting Software | ❌ | ☐ Yes ☐ No | H / M / L | Software: _____________ |
| ERP Integration | ❌ | ☐ Yes ☐ No | H / M / L | ERP: __________________ |

---

### 11.8 Additional Notes from Client

> *Please use this section to note any specific workflows, calculations, or requirements that are unique to your organization and are not covered above.*

```
________________________________________________________________
________________________________________________________________
________________________________________________________________
________________________________________________________________
________________________________________________________________
________________________________________________________________
________________________________________________________________
________________________________________________________________
```

---

### 11.9 Current Pain Points

> *What are the biggest challenges with your current HR / attendance system that you would like the new HRMS to solve?*

```
1. ____________________________________________________________
2. ____________________________________________________________
3. ____________________________________________________________
4. ____________________________________________________________
5. ____________________________________________________________
```

---

### 11.10 Priority Summary (To be filled during meeting)

| Priority | Module / Feature | Expected Go-Live |
|---|---|---|
| High | | |
| High | | |
| High | | |
| Medium | | |
| Medium | | |
| Low | | |
| Low | | |

---

## Document Sign-off

| | Client Representative | Lumos Logic Representative |
|---|---|---|
| **Name** | | |
| **Designation** | | |
| **Date** | | |
| **Signature** | | |

---

*This document is prepared by Lumos Logic and is confidential. All features described are available in the current production system unless marked with ❌. Custom development timelines for additional features will be shared separately upon requirement confirmation.*

*For any clarifications, please contact: **jignesh@lumoslogic.com***
