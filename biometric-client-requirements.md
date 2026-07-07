# Biometric Integration — Client Requirements Gathering

## Overview

The client uses a ZKTeco biometric device for employee check-in/check-out.
We need to integrate it with the HRMS so attendance is recorded automatically.

**Integration model:** ZKTeco uses the PUSH SDK — the device pushes punches to our server in real time. We do not pull from the device.

**Data per punch the device sends:**
- Device serial number
- Employee PIN (ZKTeco enrollment number)
- Timestamp
- Punch type: `0` = Check-in, `1` = Check-out, `4` = OT-in, `5` = OT-out
- Verify type: `1` = Fingerprint, `2` = Face, `4` = Card

---

## Architecture Plan

```
ZKTeco Device
     │
     │  HTTP POST (PUSH SDK protocol)
     ▼
Our Backend API
  /biometric/push
     │
     ├─ 1. Log raw punch → biometric_raw_logs
     ├─ 2. Map ZK PIN → HRMS user_id
     ├─ 3. Create/update attendance record
     └─ 4. Determine check-in vs check-out
                         │
                    AWS RDS PostgreSQL
                  (this client's own DB)
```

**Database strategy:** This client gets their own AWS RDS (PostgreSQL) instance. All existing tables (users, attendance, leaves, etc.) are identical — just hosted on RDS instead of Supabase. One new column added to `attendance`: `source = 'manual' | 'biometric' | 'clockify'`.

**Three new tables required:**
| Table | Purpose |
|---|---|
| `biometric_devices` | Register each ZKTeco machine (serial, name, location, org_id, last_seen, status) |
| `biometric_raw_logs` | Append-only log of every raw push — never delete, never modify |
| `biometric_employee_map` | Map ZKTeco employee PIN → HRMS user_id |

---

## Questions to Ask the Client

### 1. Device Details

- [ ] **Which exact ZKTeco model** do they have?
  - e.g., K40, F22, UFace302, SpeedFace-V5L — affects which PUSH SDK version it uses
- [ ] **How many devices** total?
  - One entry point or multiple (e.g., separate entry/exit gates, multiple floors)?
- [ ] **Where is each device located?**
  - Office name / floor / gate label — for identifying devices in the dashboard

---

### 2. Network / Connectivity

- [ ] Are the biometric devices connected to **internet directly**, or only to a **local office LAN**?
  - If LAN-only → we need a local bridge server (significant extra complexity — critical to know before planning)
- [ ] Does the client have a **static IP or domain** for their office network?
  - Needed for whitelisting on AWS security groups
- [ ] Can the devices be **configured remotely** by their IT team, or does someone need to be physically on-site?
  - We need to configure the PUSH SDK server URL on the device itself

---

### 3. Employee Data on the Device

- [ ] **How many employees** are currently enrolled on the ZKTeco device?
- [ ] What is the **Employee PIN / enrollment number format** used on the device?
  - e.g., 001, 002 — or is it different from HRMS employee IDs?
- [ ] Can they provide an **export of currently enrolled employees** from ZKTeco WDMS software?
  - We need this list to do the HRMS user ↔ ZKTeco PIN mapping before go-live
- [ ] What verification methods are employees enrolled with?
  - Fingerprint only / Face only / Card / Mix of all three?

---

### 4. Attendance Rules

- [ ] Should **first punch = check-in** and **last punch = check-out**? Or is it shift-based logic?
- [ ] What should happen with **overtime punches** (punch types 4 and 5)?
  - Track OT hours separately, or treat them the same as regular check-in/out?
- [ ] Should there be **duplicate punch protection**?
  - e.g., if an employee scans twice within 5 minutes, ignore the second scan
- [ ] Should biometric attendance **auto-approve** in the system, or go through the same manual regularization/approval flow?

---

### 5. Historical Data

- [ ] Do they want **past attendance data** from ZKTeco WDMS migrated into the new system?
  - Or start fresh from the go-live date?
- [ ] If yes — can they export **historical punch logs** from WDMS in CSV or Excel format?
  - How far back do they want to migrate? (3 months / 1 year / full history?)

---

### 6. AWS / Infrastructure

- [ ] Does the client want to **own the AWS account** (we provision it for them), or host under our AWS account and bill them monthly?
- [ ] Any **data residency requirement**?
  - Which AWS region? (Mumbai `ap-south-1` is standard for India-based clients)
- [ ] Is the default **automated daily backup** on RDS sufficient, or do they need a specific backup SLA?
- [ ] Do they need a **staging/test environment** separate from production?

---

### 7. Go-Live & Timeline

- [ ] What is their **target go-live date** for the biometric integration?
- [ ] Will there be a **parallel run period** where ZKTeco WDMS and our system both run simultaneously?
  - If yes, for how long?
- [ ] Who from their side is the **technical contact** for device configuration?
  - We will need someone who can access the ZKTeco device settings to enter our server URL

---

## What We Already Have (No Re-work Needed)

| Existing Feature | Status |
|---|---|
| `attendance` table with org scoping | Ready — just needs `source` column added |
| Multi-org architecture (`organization_id`) | Already in place |
| Work schedule / shift logic | Already built |
| Attendance regularization flow | Already built |
| Payroll reads from attendance | Works unchanged — same table |

---

## New Backend Endpoints to Build

| Endpoint | Purpose |
|---|---|
| `POST /biometric/push` | Receives punches from ZKTeco device (main integration point) |
| `GET /biometric/devices` | List registered devices + last-seen status |
| `POST /biometric/devices` | Register a new device by serial number |
| `GET /biometric/logs` | View raw punch logs with filters |
| `POST /biometric/employee-map` | Map a ZKTeco PIN to an HRMS employee |
| `DELETE /biometric/employee-map/:id` | Remove a mapping |

---

## New Frontend Pages to Build

1. **Biometric Devices page** (HR/Admin sidebar)
   - List of registered devices with online/offline status (based on `last_seen` timestamp)
   - Register new device button
   - Per-device: view raw punch logs

2. **Employee PIN Mapping page**
   - Table: Employee name ↔ ZKTeco PIN
   - Admin can assign/edit PINs

3. **Attendance source indicator**
   - On existing attendance cards/calendar, show a small fingerprint icon when `source = 'biometric'`

---

## Key Risks

| Risk | Details |
|---|---|
| **PIN mismatch** | If ZKTeco enrollment numbers differ from HRMS employee IDs, the mapping step is mandatory before go-live — no shortcut |
| **LAN-only device** | If the device has no internet access, a local bridge server is needed — changes architecture significantly |
| **Duplicate punches** | ZKTeco retries failed pushes; the raw log receiver must be idempotent (deduplicate by device serial + timestamp) |
| **Multi-device** | If the client has entry/exit on different floors, each punch must be tied to the correct device to avoid logic errors |

---

## Priority — Resolve These First

Before any implementation starts, get answers to these three questions:

1. **Device model** — determines PUSH SDK version and exact HTTP payload format
2. **Number of devices** — determines multi-device handling complexity
3. **Internet vs LAN-only** — determines whether a local bridge is needed (completely changes the architecture)
