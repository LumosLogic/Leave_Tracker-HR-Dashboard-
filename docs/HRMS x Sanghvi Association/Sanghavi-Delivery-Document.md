# Lumos Logic HRMS — Sanghavi Association
## Client Delivery Document
**Prepared by:** Lumos Logic
**Date:** July 2026
**Version:** 1.0

---

## 1. System Overview

Sanghavi Association has been provisioned on the **Lumos Logic HRMS platform** — a dedicated, isolated deployment with full biometric attendance integration via your existing ZKTeco devices.

### What Has Been Delivered

| Module | Status |
|--------|--------|
| HR Admin Dashboard | Live |
| Employee Management | Live |
| Leave Management | Live |
| Attendance (Manual + Biometric) | Live |
| Biometric Device Management | Live |
| Departments & Designations | Live |
| Holidays & Events | Live |
| Leave Policies | Live |
| Announcements | Live |
| Attendance Regularization | Live |
| Employee Documents | Live |
| Branches Management | Live |
| Reports & Analytics | Live |
| Payroll (Basic) | Live |
| Expenses | Live |
| Assets | Live |
| Performance Management | Live |
| Onboarding Checklists | Live |
| Exit Management | Live |
| Extended Employee Profile (Statutory, PF, ESI, UAN, OT) | Live |
| Biometric ADMS Receiver (ZKTeco Integration) | Live |
| Employee PIN Mapping (ZKTeco PIN → HRMS Employee) | Live |
| Raw Punch Log Viewer | Live |

---

## 2. System Access

### Production URL

```
https://hrms.lumoslogic.com
```

### Login Credentials

Your administrator account will be shared separately via secure message.

| Role | Access Level |
|------|-------------|
| Root Admin | Full system access — all modules, all settings, all employees |
| HR Admin | Manage employees, leaves, attendance, announcements, payroll |
| Employee | Self-service portal — own attendance, leaves, documents, payslips |

---

## 3. Your ZKTeco Devices — Registered in System

All 7 of your biometric devices are **registered in the HRMS**. You can view them under **Biometric → Devices** in the admin dashboard.

| # | Serial Number | Device Name | Location | Device IP | Last Known Status |
|---|--------------|-------------|----------|-----------|------------------|
| 1 | BYEL184460001 | Main Area | Main Area | 192.168.10.20 | Online |
| 2 | BYEL194660080 | Dalal | Dalal | 192.168.0.250 | Online |
| 3 | CK5T222360083 | Third Floor | Third Floor | 192.168.10.205 | Online |
| 4 | JJA1241000273 | CG Road | CG Road | 192.168.1.2 | Online |
| 5 | JJA1241900816 | Bapunagar | Bapunagar | 192.168.1.202 | Online |
| 6 | BHXZ193560692 | Insurance Bhuj | Insurance Bhuj | 192.168.0.45 | Offline |
| 7 | JJA1241900721 | Bhuj | Bhuj | 192.168.1.2 | Offline |

> **Note:** Devices marked Offline will show as Online automatically once they are redirected to our server and begin pushing data.

---

## 4. Biometric Integration — How It Works

Your ZKTeco devices use the **ADMS Push Protocol** — meaning the device itself sends attendance punches to a server URL in real time whenever an employee scans. Our system receives these punches and automatically creates attendance records.

### Flow Diagram

```
Employee Scans Finger / Face on ZKTeco Device
              │
              │  HTTP Push (ADMS Protocol)
              ▼
  Lumos Logic HRMS Server  (/iclock/cdata)
              │
              ├── Logs raw punch (audit trail — never deleted)
              ├── Matches Employee PIN → HRMS Employee record
              ├── Checks if employee is on approved leave (guard)
              └── Creates / Updates attendance record automatically
                        │
                        ▼
           Attendance visible in HR Dashboard
           within seconds of the punch
```

### What the System Does Per Punch

- **Check-In:** First punch of the day → sets Check-In time, marks attendance as Present
- **Check-Out:** Subsequent punch → sets Check-Out time, calculates work hours
- **Leave Guard:** If employee has an approved leave that day → punch is silently ignored, leave record is preserved
- **Duplicate Protection:** ZKTeco sometimes retries failed pushes — our system handles this automatically, no duplicate records are created
- **Source Tracking:** All biometric-sourced attendance is tagged with a fingerprint indicator so HR can distinguish manual vs. biometric records

---

## 5. Device Configuration — Action Required by Your IT Team

### Step 1: Get the New Server URL

**Configure each ZKTeco device with this ADMS Server URL:**

```
https://hrms.lumoslogic.com
```

> Fallback (direct IP, if domain is unreachable): `http://187.127.146.194:3005`

### Step 2: How to Configure Each Device

On each ZKTeco device or via ZKTeco WDMS software:

1. Open **ZKTeco WDMS** → Go to **Device Management**
2. Select the device
3. Go to **ADMS** or **Cloud Server** settings
4. Update the **Server Address** field to:
   ```
   hrms.lumoslogic.com
   ```
5. Set **Server Port** to: `443` (HTTPS) or `80` (HTTP fallback)
6. Save and apply to device

**OR** — if configuring directly on the device screen:
1. On device → **Menu** → **Communication** → **Cloud Server Settings**
2. Update the IP and Port
3. Confirm / Save

> **Important:** The path `/iclock/cdata` is built into the ZKTeco firmware. You only need to update the IP and port — do not change the path.

### Step 3: Verify the Connection

After updating each device:
1. Log in to HRMS → go to **Biometric → Devices**
2. The device status will change from **Offline** to **Online** within 1–2 minutes
3. You will see the **Last Activity** timestamp update in real time

---

## 6. Employee PIN Mapping — Required Before Attendance Goes Live

Every ZKTeco punch contains only an **Employee PIN** (the enrollment number on the device — e.g., 431, 806). The HRMS needs to know which HRMS employee account belongs to each PIN.

### What We Need From You

Please provide an export from **ZKTeco WDMS** containing:

| Column | Example |
|--------|---------|
| Employee PIN / Enrollment Number | 431 |
| Employee Name | Rajesh Kumar |

An Excel or CSV export from the **Employee** section in WDMS is sufficient.

### How It Works in the System

Once we have your employee list, the mapping is done in:
**HRMS → Biometric → Employee PIN Mapping**

Each row maps one ZKTeco PIN to one HRMS employee. After mapping:
- All new punches from that PIN automatically create attendance records for that employee
- All previous punches (that arrived before the mapping was done) are **retroactively processed** — no attendance data is lost

---

## 7. What We Need From You (Checklist)

Please provide the following for go-live:

| # | Item | Purpose | Priority |
|---|------|---------|---------|
| 1 | **Employee list export from ZKTeco WDMS** (PIN + Name) | To create employee accounts and map PINs | **Critical** |
| 2 | **Employee master data** (name, designation, department, joining date, contact) | To complete employee profiles | **Critical** |
| 3 | **Leave policy rules** (annual leave days, sick leave days, etc.) | To configure leave policies per type | Medium |
| 4 | **Holiday list for 2026** | To configure public/company holidays | Medium |
| 5 | **Work shift timings** (start time, end time, late threshold) | To configure work schedule | Medium |
| 6 | **Department list** | To create department structure | Medium |

> **Note:** Branches and office locations are already configured in the system (Main Area, Dalal, Third Floor, CG Road, Bapunagar, Bhuj, Insurance Bhuj).

---

## 8. What Lumos Logic Will Do After Receiving Above

| Step | Action | Timeline |
|------|--------|---------|
| 1 | Import employee master data into HRMS | 1 day after data received |
| 2 | Map all ZKTeco PINs to HRMS employees | 1 day after PIN export received |
| 3 | Configure branches, departments, work schedule | 1 day after details received |
| 4 | Configure leave policies and holidays | 1 day after details received |
| 5 | Reprocess all historical punch logs | Same day as PIN mapping done |
| 6 | Confirm all devices are Online and pushing | After your IT updates device settings |
| 7 | Verify end-to-end: punch → attendance record | Within 1 day of first live punch |

---

## 9. Go-Live Checklist

### Our Side (Lumos Logic)
- [x] HRMS platform deployed and running
- [x] Sanghavi organization created in system
- [x] All features enabled (biometric, branches, statutory, leave, payroll, etc.)
- [x] ADMS receiver endpoint live at `/iclock/cdata`
- [x] Device heartbeat endpoint live at `/iclock/getrequest`
- [x] Extended employee profile (PF, ESI, UAN, OT, branch fields) ready
- [x] All 7 ZKTeco devices registered in system
- [x] Domain live — `https://hrms.lumoslogic.com` active with SSL
- [x] All 7 branch locations configured (Main Area, Dalal, Third Floor, CG Road, Bapunagar, Bhuj, Insurance Bhuj)
- [x] End-to-end biometric test passed — simulated ZKTeco punch received, attendance auto-created correctly
- [ ] Employee data imported *(pending employee list from client)*
- [ ] ZKTeco PIN → Employee mapping completed *(pending PIN export from client)*
- [ ] Leave policies configured *(pending policy rules from client)*
- [ ] Work schedule configured *(pending shift timings from client)*
- [ ] Holidays configured *(pending holiday list from client)*

### Your Side (Sanghavi IT Team)
- [ ] Current ADMS server URL noted (before changing)
- [ ] ADMS server URL updated on all 5 online devices to our server
- [ ] Bhuj and Insurance Bhuj devices brought online (if applicable)
- [ ] Confirm all devices show Online status in HRMS dashboard
- [ ] Test punch: one employee scans → attendance appears in HRMS

---

## 10. Parallel Run Period (Recommended)

We recommend running both your old system and the new HRMS simultaneously for **1 week** after go-live:

1. Employee punches flow to the new HRMS
2. HR compares attendance in HRMS vs. old system daily for the first week
3. Any discrepancies are investigated and resolved
4. After 1 week, if all records match → old system can be decommissioned

---

## 11. Biometric Dashboard — Screen Guide

All biometric management is accessible from the left sidebar under the **BIOMETRIC** section after logging in as Root Admin or HR Admin.

---

### 11.1 Biometric Devices

**URL:** https://hrms.lumoslogic.com/biometric/devices

This screen shows all 7 registered ZKTeco devices. Each card displays:
- **Device name and serial number**
- **Location and branch**
- **Last seen timestamp** — updates in real time every time the device sends a heartbeat
- **Online / Offline status** — a device turns green (Online) within 1–2 minutes of being pointed to our server; it turns Offline if no heartbeat is received for more than 5 minutes
- **View Logs** — click to jump directly to punch logs filtered by that device

> Once your IT team updates the ADMS server URL on each device, you will see them flip to Online one by one on this screen.

*(Screenshot — Biometric Devices page)*

---

### 11.2 Employee PIN Mapping

**URL:** https://hrms.lumoslogic.com/biometric/mapping

This screen links each ZKTeco device PIN (enrollment number) to an employee account in the HRMS. This mapping is what allows the system to know which employee made a punch.

- Each row shows the **Device PIN**, **Employee Name**, **Department**, and **Enrollment ID**
- Use **+ Add Mapping** to manually map a PIN to an employee
- Use **Reprocess Logs** after completing all mappings — this retroactively processes any punch logs that arrived before the mapping was set up, so no attendance data is lost

> This screen will be populated once you share the employee PIN export from ZKTeco WDMS.

*(Screenshot — Employee PIN Mapping page)*

---

### 11.3 Punch Logs

**URL:** https://hrms.lumoslogic.com/biometric/logs

This is the full audit trail of every punch received from any ZKTeco device. Every scan is permanently logged here regardless of whether it was processed into an attendance record.

- Filter by **date range**, **device**, **employee PIN**, or **processed status**
- Each row shows: punch time, employee PIN, employee name (once mapped), device name, punch type (Check-In / Check-Out), and whether it was processed into attendance
- **Processed = Yes** means the punch was successfully converted into an attendance record
- **Processed = No** means the employee PIN is not yet mapped — use Reprocess Logs after mapping to fix this

> This screen is your ground truth for all biometric activity. If there is ever a dispute about an employee's attendance, this log is the permanent record.

*(Screenshot — Punch Logs page)*

---

## 12. Technical Reference

### ADMS Endpoints (For IT Reference)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/iclock/cdata` | POST | Receives attendance punches from ZKTeco devices |
| `/iclock/getrequest` | GET | Device heartbeat — keeps device marked as Online |

> These endpoints require **no authentication** — ZKTeco firmware cannot send tokens. They are protected at the network level.

### Server Details

| Property | Value |
|----------|-------|
| Server IP | 187.127.146.194 |
| Port | 3005 |
| Production Domain | https://hrms.lumoslogic.com (Live) |
| Database | PostgreSQL 15 (isolated for Sanghavi) |
| Hosting | VPS (Ubuntu 24.04, Docker) |
| Backup | Daily automated database backup |

### ZKTeco Punch Type Reference

| Punch Type Code | Meaning | HRMS Action |
|----------------|---------|------------|
| 0 | Check-In | Creates attendance record, sets check_in time |
| 1 | Check-Out | Updates attendance record, sets check_out time, calculates work hours |
| 4 | OT Check-In | Logged; OT hours tracked |
| 5 | OT Check-Out | Logged; OT hours calculated |

### Verify Type Reference

| Verify Code | Meaning |
|------------|---------|
| 1 | Fingerprint |
| 2 | Face Recognition |
| 4 | Card / RFID |

---

## 13. Frequently Asked Questions


**Q: What happens if the internet goes down and a device cannot push punches?**
A: ZKTeco devices store punches locally. When connectivity is restored, the device automatically retries and sends all stored punches. Our system handles these late-arriving punches correctly — no data is lost.

**Q: What if an employee is on leave but scans at the device?**
A: The system checks for approved leave before creating any attendance record. If leave exists for that date, the punch is logged in the audit trail but the leave record is not overwritten.

**Q: Can two employees have the same PIN on different devices?**
A: No — employee PINs must be unique across the organization. Each PIN maps to exactly one employee. If two locations use the same PIN for different people, the PINs on one location will need to be updated in ZKTeco WDMS.

**Q: What if a device sends a duplicate punch (scanned twice by mistake)?**
A: Duplicate punches are automatically detected and ignored. The system uses the device serial number + exact punch timestamp + employee PIN as a unique key — no duplicate records are created.

**Q: Can we view raw punch logs?**
A: Yes — in HRMS go to **Biometric → Punch Logs**. You can filter by device, employee, date range, and processed status. All punch data is kept permanently for audit purposes.

**Q: What happens to old attendance data from our previous system?**
A: Historical attendance can be migrated if you provide an export from your old system (CSV or Excel). This is optional — you can also choose to start fresh from the go-live date.

**Q: Can employees view their own attendance?**
A: Yes — employees can log in to the portal (`/portal/home`) and see their own attendance, check-in/check-out times, leave balance, payslips, and more.

---


*End of Delivery Document*

**Lumos Logic**
Building smart HR systems.
