# Client Feature Gap Analysis — Relitrade HRMS Requirements
# (vs. Our Current System)

Last updated: 2026-07-08  
Source: Meeting recording screenshots (InSypay demo) + 5-agent codebase analysis

---

## Legend
- Already Have — No work needed
- Partial — Feature exists but needs enhancement
- New (Easy) — Can be added quickly (fields / UI only, no new tables)
- New (Medium) — Needs 1-2 new tables or a new view
- New (Complex) — Multiple tables, new module, significant backend work

---

## 1. Employee List / Search Filters

| Filter Shown in Client System | Our Status | Notes |
|---|---|---|
| Company Name | Already Have | = Organization (same concept) |
| Branch Name | **New (Medium)** | We have no `branches` table — only departments |
| Department Name | Already Have | Fully implemented |
| Division | **New (Easy)** | Add column to departments or users table |
| Sub Division | **New (Easy)** | Same — second level below Division |
| Employee Type | Partial | We have `employment_type` on users but no dropdown filter in employee list |
| Location | **New (Easy)** | Add `location` field to users table |
| Status (Active/Resigned/All) | Already Have | `employment_status` column exists |
| Grade | **New (Easy)** | Add `grade` field to users table (A/B/C) |
| Pay Cadre | **New (Easy)** | Add `pay_cadre` field |
| Employee Search | Already Have | Implemented |
| Employee Old ID Search | **New (Easy)** | Add `old_employee_id` field |
| Left Date column in results | Partial | `employment_status` exists but no dedicated left_date column shown |

---

## 2. Employee Profile — Personal Tab Fields

### Already In Our System
- Employee ID, Name, Email, Department, Designation, Date of Joining, Date of Birth
- Employment Type (Full Time/Contract), Status (Active/Resigned)
- Profile Photo (Cloudinary upload)
- Reporting To (Superior)
- Phone, Gender

### New Fields Needed (add to `users` table)

| Field | Priority | Why It Matters |
|---|---|---|
| Salutation (Mr/Mrs/Ms/Dr) | Medium | Professional records |
| Middle Name, Surname (split from single "name") | Medium | Proper name formatting |
| Branch | **HIGH** | Required for biometric device → employee mapping |
| Division, Sub Division | Medium | Org structure filter |
| Grade | Medium | Pay/hierarchy classification |
| Pay Cadre | Medium | Salary band grouping |
| Location | Medium | Multi-location filter |
| Probation (Yes/No + months) | Medium | Confirmation date logic |
| HOD (Head of Department) | Medium | Separate from Superior/Reporting To |
| **Device Enrollment ID** | **CRITICAL** | This is the ZKTeco PIN — without this, biometric punch cannot map to employee |
| Special Allowance | Medium | Payroll calculation |
| Aadhar Card No | Medium | Statutory/KYC |
| PAN Number, PAN Name | Medium | Statutory/TDS |
| Voter ID | Low | KYC document |
| Old Employee ID | Low | Legacy data migration |
| Weekly Off Day | Medium | Attendance calculation |

---

## 3. Employee Profile — Tabs Comparison

The client's system has 18 tabs per employee. Here's our status on each:

| Tab | Our Status | What's Missing / What to Do |
|---|---|---|
| **Personal** | Partial | Add the fields listed above |
| **Contact** | Partial | We store `address` as a single text field. Client wants Present Address + Permanent Address each with Address1/2/3, Post Code, State, City, Taluka, Village, PO No, Metropolitan City, Fax No |
| **Immigration** | Missing | Visa/work permit info — not shown in screenshots, low priority |
| **Bank** | Partial | We have single bank account fields. Client wants **dual bank accounts** (Bank Details 1 + 2) each with: Payment Method, Bank Name, MICR Code, Branch Name, Account Type, Account No, IFSC Code, Transaction Type |
| **Administration** | **Missing** | This is a NEW tab — contains all statutory + payroll settings per employee (see Section 4 below) |
| **Qualification** | **New (Medium)** | Multi-record education history: Board/Uni, Year, %, SGPA, CGPA, Specialization, Class + Language skills (multi-record) |
| **Experience** | **New (Medium)** | Multi-record work experience: Start/End Date, Company, Industry, CTC, Designation, Total Years |
| **Pay Elements** | **New (Complex)** | Per-employee salary component assignment with Effective Date, Pay Element Code, Computation Type, Amount — feeds into payroll |
| **Reimbursement** | Partial | We have `expenses` module but not structured reimbursement per employee |
| **Referral Bonus** | Missing | Low priority for now |
| **TDS Setup** | **New (Medium)** | Tax deduction settings per employee — needed for payroll compliance |
| **TDS Declaration** | **New (Medium)** | Investment declaration form (80C, HRA, etc.) |
| **Employee Document** | Partial | We have generic document upload. Client has a **fixed list** of document types: Aadhaar, Bank Passbook, Driving License, Health Record, PAN, Passport, Ration Card, School Certificate, TDS Form 16, Voter ID. We need to show this as a structured list with upload per type. |
| **Employee Asset** | Already Have | Assets module exists — verify Category > Type > Asset Name hierarchy matches |
| **Appraisal** | Partial | We have performance goals/reviews but not per-employee appraisal summary tab |
| **Comment** | **New (Easy)** | HR notes/comments on employee — simple text field or log |
| **Training** | **New (Medium)** | Training records per employee: dates, type, faculty |
| **Health Record** | **New (Medium)** | Employee health information |
| **Insurance Details** | **New (Medium)** | Insurance policy details per employee |
| **Nominee Details** | **New (Medium)** | Nominee/beneficiary for PF/insurance |
| **Transportation Details** | **New (Easy)** | Commute/transport allowance info |

---

## 4. Administration Tab — Statutory & Payroll Settings (All New)

This is the biggest missing piece. The client's system stores statutory compliance settings per employee that feed directly into payroll.

| Field | Category | Priority |
|---|---|---|
| Salary Structure (GROSS/CTC/etc.) | Payroll | High |
| Salary On (Day/Month) | Payroll | High |
| Work Hours per day | Payroll | High |
| Per Hour Rate | Payroll/OT | High |
| Per Day Wages | Payroll | Medium |
| **PT Applicable** checkbox | Statutory | High |
| **ESI Applicable** checkbox + ESI No + ESI Dispensary | Statutory | High |
| **Labour Welfare Fund Applicable** | Statutory | Medium |
| **PF Applicable** + PF No | Statutory | High |
| **VPF Applicable** + VPF % + VPF Amount | Statutory | Medium |
| PF Actual Basic, Is PF After Age, PF on Amount | Statutory | Medium |
| Max PF Amount, Is PF On Gross, Is New For PF | Statutory | Medium |
| **UAN No.** (Universal Account Number) | Statutory | High |
| **PRAN** (Permanent Retirement Account Number) | Statutory | Medium |
| Is Employer Same | Statutory | Medium |
| **OT Applicable** checkbox | Attendance/Payroll | High |
| **OT Rate** (per hour) | Attendance/Payroll | High |
| **OT Paid with Salary** | Payroll | High |
| Gratuity Applicable + Gratuity ID | Statutory | Medium |
| Confirmation Date, Resignation Date, Left Date, Exit Reason | HR | Partial (some exist) |
| Blocked + Blocked Date | HR | Low |
| Retirement Date | HR | Low |
| GL Code | Finance | Low |
| Bonus Applicable | Payroll | Medium |
| Salary Slip Format | Payroll | Medium |
| Is Auto Attendance | Attendance | Medium |
| Is Mobile Access | Attendance | Low |
| IMEI No | Attendance/Security | Low |
| Band | HR | Low |
| Max Weekoff in Month | Attendance | Medium |

---

## 5. Attendance Register View (Image 19) — New View

This is what the client uses as their primary attendance view. We don't have this.

**What they see:** A monthly calendar table per employee showing every day as a row:

| Date | Day | Shift | Check In | Check Out | Late | Early Exit | Total Hours | Effective Hours | OT | OT2 | P | CR | ODReq |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 12-Jun | Friday | 10AM-7PM | 10:09 AM | 05:32 PM | 00:09:00 | 1:28:00 | 7:23 | 7:23 | 0:37 | 0:00 | | | |
| 14-Jun | Sunday | — | Off Day | | | | | | | | | | |
| 16-Jun | Tuesday | — | CL | CL | | | 0:00 | 0:00 | | | | | |

**What we currently show:** Single-day cards, calendar view month overview — no OT columns, no Late time, no Early Exit time column.

**What needs to be built:**
- Employee-level monthly attendance register page
- Late time calculation (check_in - shift_start)
- Early exit calculation (shift_end - check_out)
- OT calculation (work_hours beyond shift duration)
- OT2 column (second overtime type)
- P (Present), CR (Credit?), ODReq (OD/Regularization request) columns

---

## 6. Branch as a Separate Entity (HIGH PRIORITY)

The client has multiple branch offices (Ahmedabad, Bhuj, etc.). Their ZKTeco devices are also per area/branch. This is a gap in our current system.

**What we need:**
```
branches table:
  - id, org_id, name, code, location, address, is_active
```

**Where it connects:**
- Employee profile: assigned to a branch
- Biometric devices: assigned to a branch/area
- Attendance reports: filter by branch
- Employee list: filter by branch

**Without this:** We cannot properly map biometric device areas (Main Area, Dalal, CG Road, Third Floor) to organizational units.

---

## 7. Summary — Priority Order for This Client

### Do First (Week 1-2) — Required for Biometric Go-Live
1. Add `branches` table + branch assignment on employee profile
2. Add `device_enrollment_id` field to users table (= ZKTeco PIN)
3. Add `grade`, `division`, `location`, `pay_cadre`, `probation` fields to users table
4. Run biometric DB migration (3 tables + source column)

### Do Second (Week 3-4) — Core HRMS Completeness
5. Statutory fields per employee: PF, ESI, PT, UAN, OT settings (Administration tab)
6. Monthly attendance register view with Late/OT columns
7. Dual bank account support
8. Fixed document type list for Employee Documents
9. Contact tab: split address into Present + Permanent with full address fields

### Do Third (Week 5-6) — Extended Profile
10. Qualification tab (multi-record education history)
11. Experience tab (multi-record work history)
12. TDS Setup + TDS Declaration

### Do Later — Nice to Have
13. Nominee Details, Insurance Details, Transportation Details
14. Pay Elements per employee (this is complex — connects to payroll)
15. Referral Bonus, Health Record, Training records

---

## 8. What We Do NOT Need to Build

| InSypay Feature | Reason to Skip |
|---|---|
| Statutory Report (PF/PT/ESIC summary dashboard) | Separate module — address later |
| Visitor Management | Not in our scope |
| Task Management (top nav) | Not in our scope |
| Control Panel module | Internal system config — not needed |
| Video Photo Gallery | Nice to have, very low priority |
| Today's Thought widget | Cosmetic — skip |
| Knowledge Series section | Can use Announcements for this |
| IMEI-based mobile attendance | Our system uses biometric hardware instead |

---

## 9. New Tables Required (Summary)

| Table | Purpose | Priority |
|---|---|---|
| `branches` | Branch/office locations | HIGH |
| `biometric_devices` | ZKTeco device registry | HIGH |
| `biometric_raw_logs` | Raw punch log | HIGH |
| `biometric_employee_map` | ZKTeco PIN → employee mapping | HIGH |
| `employee_qualifications` | Education history per employee | Medium |
| `employee_experiences` | Work experience per employee | Medium |
| `employee_nominees` | Nominee/beneficiary details | Low |
| `employee_insurance` | Insurance policy per employee | Low |
| `employee_training` | Training record per employee | Low |
| `employee_health_records` | Health info per employee | Low |

### Columns to Add to Existing Tables

**`users` table:** salutation, middle_name, surname, branch_id, division, sub_division, grade, pay_cadre, location, probation_applicable, probation_months, hod_id, device_enrollment_id, special_allowance, aadhar_no, pan_number, pan_name, voter_id, uan_no, old_employee_id, weekly_off_day, aadhar_name

**`users` table — Statutory (or move to separate `employee_statutory` table):** pt_applicable, esi_applicable, esi_no, esi_dispensary, lwf_applicable, pf_applicable, pf_no, vpf_applicable, vpf_percentage, vpf_amount, pf_actual_basic, is_pf_after_age, pf_on_amount, max_pf_amount, pran, uan_no, ot_applicable, ot_rate, ot_paid_with_salary, gratuity_applicable, gratuity_id, salary_structure, salary_on, work_hours_per_day, per_hour_rate, per_day_wages, gl_code, bonus_applicable, salary_slip_format, is_auto_attendance, max_weekoff_in_month

**`bank_details` table (new or upgrade existing):** bank_details_1 and bank_details_2 columns each with payment_method, bank_name, micr_code, branch_name, account_type, account_no, ifsc_code, transaction_type

**`attendance` table:** source (already planned), ot_hours, ot2_hours, late_minutes, early_exit_minutes
