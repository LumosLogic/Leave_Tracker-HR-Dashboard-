# HRMS Features & Functionality

**Company:** Lumos Logic  
**Version:** 1.0  
**Date:** July 2026  
**Confidential**

---

## 1. Introduction

Lumos Logic HRMS is a cloud-based Human Resource Management System designed to simplify and automate core HR operations. It covers the complete employee lifecycle — from onboarding to exit — with real-time attendance tracking, biometric integration, leave management, payroll processing, and detailed reporting.

**Supported Roles:**

| Role | Description |
|---|---|
| **Root Admin** | Full access. Manages HR admins, org settings, and all data. |
| **HR Admin** | Manages employees, approves leaves and regularizations, processes payroll. |
| **Employee** | Applies leaves, checks attendance, views payslips, manages own profile. |

---

## 2. System Overview

Lumos Logic HRMS is a web-based application accessible from any browser. It is built around role-based access, ensuring every user sees only what is relevant to their role.

**Core Modules:**

- Dashboard
- Employee Management
- Attendance Management
- Leave Management
- Holiday Management
- Shift Management
- Regularization
- Biometric Integration
- Payroll
- Reports
- Notifications
- Organization Settings
- User Management

[UI_SystemOverview_Dashboard]

---

## 3. Module Details

---

### 3.1 Dashboard

**Overview**

The dashboard provides a real-time operational snapshot for HR admins and employees. It shows attendance status, pending approvals, leave summaries, and key metrics — all in one place.

**Features**

- Today's attendance KPI cards (Present, On Leave, WFH, Checked In, Pending Approvals)
- Live attendance feed showing real-time check-in status
- Pending leave and regularization approvals with one-click Approve / Reject
- Attendance trend chart (Last 7 / 14 / 30 days)
- Leave breakdown by type
- HR Insights — late arrivals, upcoming birthdays, new joiners
- Employee dashboard with personal attendance summary and leave balance

**How It Works**

When an admin logs in, the dashboard automatically loads today's attendance data, pending approval counts, and trend charts. Employees see their own summary — check-in status, leave balance, and recent announcements. All data updates in real time without requiring a page refresh.

**Accessible By**

- ✅ Root Admin
- ✅ HR Admin
- ✅ Employee (own summary)

**Screenshot**

[UI_RootAdmin_Dashboard]
[UI_HRAdmin_Dashboard]
[UI_Employee_Dashboard]

---

### 3.2 Employee Management

**Overview**

Centralized repository for all employee data. HR can add, edit, and manage every employee's profile and work information.

**Features**

- Add new employee with full details and auto-send welcome email with login credentials
- Edit employee information at any time
- Deactivate or reactivate employees (data preserved)
- Multi-department assignment — employee can belong to multiple departments with roles (Member / Team Lead / Manager)
- Import employees via CSV / Excel
- Export employee list as CSV
- Admin-forced password reset
- Assign reporting manager
- Assign employee to branch
- Biometric device PIN mapping
- Employee status management (Active / Inactive / On Leave)
- Search and filter by name, department, designation, status, branch

**How It Works**

HR creates an employee account by filling in basic details — name, email, department, designation, and joining date. The system sends a welcome email with login credentials. HR can then build out the full profile across all sections: personal info, education, experience, banking, documents, and more. Employees can also update their own profile sections.

**Accessible By**

- ✅ Root Admin
- ✅ HR Admin
- 👁️ Employee (view and edit own profile)

**Screenshot**

[UI_HRAdmin_EmployeeList]
[UI_HRAdmin_EmployeeProfile]
[UI_Employee_MyProfile]

---

### 3.3 Attendance Management

**Overview**

Tracks daily work hours for all employees — through portal check-in or automatic biometric sync.

**Features**

- Employee check-in and check-out via portal
- Break In / Break Out tracking
- Gross hours, break minutes, and effective work hours calculated automatically
- Late arrival flag (auto-marked if check-in is after configured threshold)
- Early exit flag
- Admin manual attendance entry for any employee
- Admin edit of any attendance record
- Biometric auto-sync (attendance created from device punch logs)
- Attendance source tracking (manual / biometric / portal)
- Half day attendance support
- WFH attendance tracking
- Monthly calendar view for each employee
- Date navigation — HR can view any past date's attendance
- Live session tracking (estimates hours for currently checked-in employees)

**How It Works**

Employees check in via the portal or through a ZKTeco biometric device. The system records the punch time and calculates work hours at checkout. If an employee forgets to punch, they can submit a regularization request. HR can view the full org attendance for any date, edit records manually, and download reports.

**Accessible By**

- ✅ Root Admin
- ✅ HR Admin
- 👁️ Employee (view own attendance)

**Screenshot**

[UI_HRAdmin_AttendanceLive]
[UI_Employee_MyAttendance]
[UI_Employee_MyAttendanceCalendar]

---

### 3.4 Leave Management

**Overview**

Complete leave request and approval workflow covering all standard leave types.

**Features**

- Apply leave (full day, half day, WFH)
- Leave types: Annual, Sick, Casual, Emergency, Maternity, Paternity, Comp Off, WFH
- Date conflict check — system prevents overlapping requests
- Real-time leave balance per type
- HR approves or rejects with one click
- Employee can cancel pending leaves
- Email notifications on application and status change
- Attendance record auto-created when leave is approved
- WFH and half-day can coexist on the same day
- HR can apply leave on behalf of any employee
- Company-wide leave application (e.g., all employees — rain day, declared holiday)
- Leave history with full status timeline
- Google Calendar sync for approved leaves

**How It Works**

An employee selects the leave type, dates, and reason and submits the request. HR receives a notification and approves or rejects it from the dashboard. On approval, the system automatically creates an attendance record for those dates and deducts from the employee's leave balance. Both parties receive email confirmations at each step.

**Accessible By**

- ✅ Root Admin
- ✅ HR Admin
- ✅ Employee (apply, view, cancel own leaves)

**Screenshot**

[UI_Employee_MyLeaves]
[UI_Employee_ApplyLeave]
[UI_HRAdmin_LeaveApprovals]

---

### 3.5 Holiday Management

**Overview**

Manage the organization's official holiday calendar for the year.

**Features**

- Add holidays with name, date, and type (National / Regional / Optional)
- Full-year holiday calendar view
- Holidays are excluded from LOP and leave calculations
- All employees can view upcoming holidays

**How It Works**

HR declares holidays for the year. These are visible to all employees in the holiday calendar. When payroll is processed, declared holidays are excluded from loss-of-pay calculations automatically.

**Accessible By**

- ✅ Root Admin
- ✅ HR Admin
- 👁️ Employee (view only)

**Screenshot**

[UI_HRAdmin_Holidays]
[UI_Employee_Holidays]

---

### 3.6 Shift Management

**Overview**

Define work shifts and assign them to employees or departments.

**Features**

- Create shifts with name, start time, and end time
- Configure late arrival threshold (grace period in minutes)
- Set working days (Mon–Fri, Mon–Sat, etc.)
- Assign shifts to employees or departments
- Roster calendar view

**How It Works**

HR defines one or more shifts for the organization. Each shift has defined start and end times. A late threshold determines when an employee is flagged as late. Shifts are assigned to employees and referenced during attendance and payroll processing.

**Accessible By**

- ✅ Root Admin
- ✅ HR Admin
- ❌ Employee

**Screenshot**

[UI_HRAdmin_Shifts]

---

### 3.7 Regularization

**Overview**

Allows employees to raise attendance correction requests when a punch is missed or recorded incorrectly.

**Features**

- Employee submits regularization with date, correct times, and reason
- HR reviews and approves or rejects
- Approved regularization automatically updates the attendance record
- Email and in-app notifications at each stage
- Full regularization history per employee

**How It Works**

If an employee has an incorrect or missing attendance record, they submit a regularization request with the correct check-in and check-out times and a reason. HR reviews the request — optionally cross-checking biometric logs — and approves or rejects. On approval, the attendance record is updated immediately.

**Accessible By**

- ✅ Root Admin
- ✅ HR Admin
- ✅ Employee (submit own requests)

**Screenshot**

[UI_Employee_Regularization]
[UI_HRAdmin_RegularizationApprovals]

---

### 3.8 Biometric Integration

**Overview**

Automatic attendance capture directly from ZKTeco biometric devices (fingerprint / face recognition).

**Features**

- Compatible with all ZKTeco devices supporting the ADMS protocol
- Device registration with serial number, IP address, and branch
- Real-time online / offline device status
- Automatic punch log reception from device
- Punch type mapping: 0 = Check-in, 1 = Check-out
- Auto-creation of attendance records from processed logs
- Employee PIN mapping (device enrollment ID → HRMS employee)
- Raw biometric log viewer with filters (device, PIN, date)
- Reprocess unprocessed logs
- Support for multiple devices across multiple branches

**How It Works**

Each ZKTeco device is configured to push punch logs to the HRMS server. When an employee scans their finger or face, the device sends the punch data (employee PIN, timestamp, punch type) to the server in under 2 seconds. The system maps the PIN to the employee and creates or updates their attendance record automatically.

**Accessible By**

- ✅ Root Admin
- ✅ HR Admin
- ❌ Employee

**Screenshot**

[UI_HRAdmin_BiometricDevices]
[UI_HRAdmin_BiometricLogs]
[UI_HRAdmin_BiometricPinMapping]

---

### 3.9 Payroll

**Overview**

Salary structure management and monthly payslip generation with automatic LOP calculation.

**Features**

- Per-employee salary structure with effective date tracking
- Salary components: Basic, HRA, DA, Transport, Medical, Other Allowances
- Deductions: PF (Employee & Employer), ESI, Professional Tax, TDS
- Loss of Pay (LOP) auto-calculated from absences and half days
- Payslip generation based on actual working days per month
- HR reviews and publishes payslips
- Employee receives notification on payslip publication
- Employee can view and download own payslips
- HR can view all payslips by month and year

**How It Works**

HR selects the pay month and generates payslips. The system pulls each employee's salary structure, attendance records, approved leaves, and declared holidays to calculate the exact number of working days. LOP is deducted for absences and half days. The net salary is calculated after all deductions, and the payslip is published to the employee.

**Accessible By**

- ✅ Root Admin
- ✅ HR Admin
- 👁️ Employee (view and download own payslips)

**Screenshot**

[UI_HRAdmin_Payroll]
[UI_Employee_MyPayslips]

---

### 3.10 Reports

**Overview**

Export and analyse HR data across attendance, leaves, and employees.

**Features**

- Attendance Report — daily records per employee with hours, breaks, and status (CSV / JSON)
- Leave Report — leave history by year, month, status, and type (CSV / JSON)
- Employee List Export — full employee data export (CSV)
- Headcount Summary — total, active, and department-wise breakdown
- Analytics Dashboard — 7 / 14 / 30 day attendance trend charts
- Late Arrivals Report — today's late check-ins
- Monthly attendance summary per employee
- Department-wise filtering across all reports

**How It Works**

HR selects a report type, applies date range and filters, and either views the data on screen or downloads it as a CSV file. Attendance reports include all time-tracking fields — gross hours, break time, effective hours, and attendance source.

**Accessible By**

- ✅ Root Admin
- ✅ HR Admin
- ❌ Employee

**Screenshot**

[UI_HRAdmin_Reports]
[UI_HRAdmin_AttendanceReport]

---

### 3.11 Notifications

**Overview**

In-app and email notification system that keeps all users informed of relevant events.

**Features**

- Bell icon with unread count in the navigation bar
- In-app notification feed (last 50 notifications)
- Mark individual or all notifications as read
- Delete notifications
- Web push notifications (browser-level alerts)
- Email notifications for key events

**Notification Triggers**

| Event | Who Gets Notified |
|---|---|
| Leave applied | HR Admin |
| Leave approved / rejected | Employee |
| Regularization submitted | HR Admin |
| Regularization approved / rejected | Employee |
| Payslip published | Employee |
| Announcement posted | All employees |
| Expense approved / rejected | Employee |
| Asset assigned | Employee |
| Performance review initiated | Employee |

**Accessible By**

- ✅ Root Admin
- ✅ HR Admin
- ✅ Employee

**Screenshot**

[UI_Notifications_Panel]

---

### 3.12 Organization Settings

**Overview**

Configure organization-level details and system-wide settings.

**Features**

- Update organization name and logo
- Set unique login URL slug
- Configure working days (Mon–Fri / Mon–Sat)
- Set late arrival threshold (grace minutes)
- Manage leave type quotas
- Add and remove HR Admins
- Manage Root Admins

**How It Works**

The Root Admin accesses organization settings to configure how the HRMS behaves for their organization — working days, late thresholds, leave quotas, and branding. These settings apply org-wide and affect payroll, attendance, and leave calculations.

**Accessible By**

- ✅ Root Admin
- ❌ HR Admin
- ❌ Employee

**Screenshot**

[UI_RootAdmin_OrgSettings]

---

### 3.13 User Management

**Overview**

Manage all user accounts within the organization.

**Features**

- Add and remove HR Admins
- Add and remove Root Admins
- Reset any employee's password
- Force password change on next login
- View login history (last 15 logins with IP and device)
- Deactivate / reactivate accounts

**Accessible By**

- ✅ Root Admin
- ✅ HR Admin (employees only)
- ❌ Employee

**Screenshot**

[UI_RootAdmin_ManageHR]

---

### 3.14 Additional Modules

**Performance Management**
- Create and track personal goals with progress percentage
- Performance review cycles (annual / custom)
- Reviewer assignment and review status tracking

**Onboarding**
- Create onboarding checklist per new employee
- Track task completion with due dates

**Exit Management**
- Employee resignation submission
- Auto-calculation of last working day from notice period
- HR review and full-and-final status tracking

**Expenses**
- Employee expense submission with receipt upload
- HR approval / rejection workflow

**Assets**
- Assign company assets to employees
- Track assignment and return

**Announcements**
- HR posts org-wide announcements with optional file attachments
- All employees receive instant notification

**Team Calendar**
- Visual calendar showing all approved leaves across the org
- Filter by employee or department

---

## 4. Role-wise Access

| Module | Root Admin | HR Admin | Employee |
|---|---|---|---|
| Dashboard | ✅ Full | ✅ Full | ✅ Own summary |
| Employee Management | ✅ Full | ✅ Full | 👁️ Own profile |
| Attendance | ✅ Full | ✅ Full | 👁️ Own attendance |
| Leave Management | ✅ Full | ✅ Full | ✅ Apply / View own |
| Holiday Management | ✅ Full | ✅ Full | 👁️ View only |
| Shift Management | ✅ Full | ✅ Full | ❌ |
| Regularization | ✅ Full | ✅ Approve/Reject | ✅ Submit own |
| Biometric Integration | ✅ Full | ✅ Full | ❌ |
| Payroll | ✅ Full | ✅ Full | 👁️ Own payslips |
| Reports | ✅ Full | ✅ Full | ❌ |
| Notifications | ✅ Full | ✅ Full | ✅ Own |
| Organization Settings | ✅ Full | ❌ | ❌ |
| User Management | ✅ Full | ✅ Employees only | ❌ |
| Performance | ✅ Full | ✅ Full | ✅ Own goals/reviews |
| Onboarding | ✅ Full | ✅ Full | 👁️ Own checklist |
| Exit Management | ✅ Full | ✅ Full | ✅ Submit own |
| Expenses | ✅ Full | ✅ Approve/Reject | ✅ Submit own |
| Assets | ✅ Full | ✅ Full | 👁️ Own assets |
| Announcements | ✅ Full | ✅ Full | 👁️ View only |
| Team Calendar | ✅ Full | ✅ Full | 👁️ View only |

---

## 5. Integrations

| Integration | Purpose |
|---|---|
| **ZKTeco Biometric Devices** | Auto-capture attendance from fingerprint / face recognition devices via ADMS protocol |
| **Email (SMTP)** | Welcome emails, leave notifications, password reset, payslip alerts |
| **Cloudinary** | Profile photos, employee documents, announcement file attachments |
| **Web Push Notifications** | Browser-level push alerts for key HR events |
| **Google Calendar** | Sync approved leaves to Google Calendar (optional) |
| **CSV / Excel Import & Export** | Employee bulk import, attendance export, leave export, employee list export |

---

## 6. Key Highlights

✅ Role-based access control — three distinct user roles with precise permission levels  
✅ Real-time attendance tracking — live dashboard showing who is present right now  
✅ Biometric integration — automatic attendance from ZKTeco fingerprint and face devices  
✅ Complete leave workflow — application, approval, balance deduction, and email notifications  
✅ Automatic payroll calculation — LOP, deductions, and payslip generation from attendance data  
✅ Multi-branch support — manage employees and devices across multiple office locations  
✅ 16-section employee profile — comprehensive data including statutory, banking, and documents  
✅ CSV / Excel reports — downloadable attendance, leave, and employee reports  
✅ Multi-organization support — isolated data for each organization on the same platform  
✅ Secure authentication — 2FA (TOTP), password history, login history, email verification  
✅ Responsive web application — accessible from any browser on desktop or laptop  

---

## 7. Closing Note

This document provides an overview of the current features and functionality available in Lumos Logic HRMS. After reviewing it, we would be happy to discuss your organization's specific requirements and any additional customizations needed to align the system with your business processes.

We look forward to a productive discussion and to building a solution that fits your team perfectly.

**Contact:** jignesh@lumoslogic.com  
**Website:** lumoslogic.com

---

*Prepared by Lumos Logic · July 2026 · Confidential*
