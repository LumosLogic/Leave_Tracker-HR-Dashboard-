# Relitrade HRMS — Master Summary
# Everything You Need to Know Before Starting Implementation

Last updated: 2026-07-08

---

## Table of Contents
1. [Who Is This Client](#1-who-is-this-client)
2. [Architecture Decision — Same or Separate?](#2-architecture-decision--same-or-separate)
3. [Database Strategy](#3-database-strategy)
4. [Deployment Strategy](#4-deployment-strategy)
5. [What We Build & Where](#5-what-we-build--where)
6. [Biometric Integration Plan](#6-biometric-integration-plan)
7. [What Is Still Pending from Client](#7-what-is-still-pending-from-client)
8. [Feature Gap Analysis — What to Build](#8-feature-gap-analysis--what-to-build)
9. [Implementation Sequence](#9-implementation-sequence)
10. [Key Technical Gotchas](#10-key-technical-gotchas)

---

## 1. Who Is This Client

**Company:** Relitrade Shares Broker Private Limited  
**Software they currently use:** InSypay (a third-party HRMS)  
**What they want:** Move to our HRMS platform with full biometric attendance integration  
**Devices:** 7 ZKTeco biometric devices across multiple branch locations  
**Scale:** ~158 employees (Main Area), devices spread across Ahmedabad, Bhuj, CG Road, etc.

### Their Device Setup
| Serial Number | Name | IP | Status | Users |
|---|---|---|---|---|
| BYEL184460001 | Main Area | 192.168.10.20 | Online | 158 |
| BYEL194660080 | Dalal | 192.168.0.250 | Online | 65 |
| CK5T222360083 | Third Floor | 192.168.10.205 | Online | 32 |
| JJA1241000273 | CG Road | 192.168.1.2 | Online | 17 |
| JJA1241900816 | Bapunagar | 192.168.1.202 | Online | 7 |
| BHXZ193560692 | InsuranceBhuj | 192.168.0.45 | Offline | 1 |
| JJA1241900721 | Bhuj | 192.168.1.2 | Offline | 10 |

**Key fact:** Devices are already configured to push to an ADMS server via internet. They've already set a static IP and ADMS port. Live transaction data is flowing right now — we just need to redirect it to our server.

---

## 2. Architecture Decision — Same or Separate?

### Codebase: SAME PROJECT (never create a separate one)

Every feature built for this client goes into the existing codebase, gated by feature flags. The `organization_features` table already supports per-org feature enable/disable. When you enable `biometric`, `statutory`, `branches` only for Relitrade's org — no other org sees it.

**Why not a separate project:**
- You'd maintain two codebases forever
- Every bug fix, UI update, new feature → doubled work
- Unnecessary complexity for what is essentially a config difference

### Summary

```
One codebase → Two configs → Two deployments → Two databases
```

| | Main Platform | Relitrade |
|---|---|---|
| Code | Same repo | Same repo |
| .env | Points to shared Supabase | Points to their Supabase |
| Server | Existing Fly.io app | New Fly.io app (or subdomain) |
| Database | Shared Supabase (multi-org) | Dedicated Supabase (their data only) |
| Domain | Your platform domain | relitrade.yourdomain.com |
| Feature flags | Per-org toggles | biometric=ON, statutory=ON, branches=ON |

---

## 3. Database Strategy

### Why Relitrade Gets Their Own Database

They are NOT a regular org on your shared Supabase. They need a dedicated database because:

1. **Financial company** — Relitrade is a stock broker. Data isolation is a compliance requirement
2. **Sensitive statutory data** — PF numbers, Aadhar, PAN, UAN, salary structures should not sit in a shared multi-tenant DB
3. **High-volume biometric data** — 5 live devices pushing hundreds of punches per day. Already 30,000+ transactions on one device alone. This will grow fast
4. **B2B client expectation** — A paying enterprise client expects their data to be isolated, not shared with other companies

### Recommended: Separate Supabase Project (Not Raw AWS RDS)

Supabase IS PostgreSQL running on AWS under the hood. A new Supabase project for Relitrade gives them:
- Their own database URL + credentials
- Full data isolation
- Their own Supabase dashboard + automated backups
- Zero code changes needed (our backend uses Supabase client already)
- Can be transferred to their own Supabase account later if needed

The "AWS RDS" plan mentioned in earlier docs was our own planning — the client didn't demand it specifically. A dedicated Supabase project achieves the same isolation without managing raw RDS infrastructure.

### Schema

Their Supabase project runs the **exact same schema** as our main DB, plus:
- 3 new biometric tables
- Extended employee fields (statutory, branches, etc.)
- `source` column on attendance

---

## 4. Deployment Strategy

### White-Label Deployment

Same GitHub repo. Same Docker image. Different `.env` pointing to their Supabase. Different server URL.

```
Your Main Platform
  ├── Supabase Project A (shared)        ← existing
  └── Fly.io: leave-tracker-hr           ← existing server

Relitrade Deployment
  ├── Supabase Project B (dedicated)     ← new, their data only
  └── Fly.io: relitrade-hr               ← new instance, same codebase
        ├── SUPABASE_URL=their_url
        ├── SUPABASE_KEY=their_key
        └── Biometric devices push here
```

### Infrastructure Steps to Set Up (One-Time)
1. Create new Supabase project for Relitrade
2. Run DB migrations on their project
3. Create new Fly.io app (`fly launch` from same repo with different app name)
4. Set `.env` on new app to point to their Supabase
5. Set up domain/subdomain for them
6. Give Relitrade's IT team the new server URL to update on ZKTeco devices

---

## 5. What We Build & Where

### Goes Into Main Codebase (benefits all clients including Relitrade)

These are genuinely universal features — every client would want them eventually:

| Feature | What it is |
|---|---|
| Branches entity | `branches` table, branch assignment on employees |
| Extended employee fields | grade, division, sub division, location, device_enrollment_id, etc. |
| Monthly attendance register view | Day-by-day grid with OT/Late/Early Exit columns |
| Dual bank accounts | Two bank account records per employee |
| Fixed document type list | Aadhaar, PAN, Passport, etc. as structured rows |
| Qualification tab | Multi-record education history per employee |
| Experience tab | Multi-record work experience per employee |

### Goes Into Main Codebase, Gated by Feature Flag (Relitrade-specific for now)

These are specific to Indian statutory compliance or biometric — enable only for Relitrade today, can open to others later:

| Feature | Feature Flag Key |
|---|---|
| Biometric integration | `biometric` |
| Statutory fields (PF/ESI/PT per employee) | `statutory` |
| OT tracking and calculation | `overtime` |
| Branches module | `branches` |
| Administration tab on employee profile | `statutory` |

---

## 6. Biometric Integration Plan

### How It Works

```
ZKTeco Device (already configured, already pushing)
     │
     │  HTTP POST to /iclock/cdata   ← ZKTeco standard ADMS path
     │  (devices push every punch in real time)
     ▼
Our Backend (Relitrade deployment)
  /iclock/cdata  ← no JWT auth (device can't send JWT)
     │
     ├─ 1. Log raw punch → biometric_raw_logs (append-only)
     ├─ 2. Idempotency check (serial + time + pin = unique)
     ├─ 3. Map ZKTeco PIN → HRMS user_id (via biometric_employee_map)
     ├─ 4. Check: is employee on leave today? → skip if yes
     └─ 5. Create/update attendance record (source = 'biometric')
                    │
              Relitrade's Supabase (their own DB)
```

### Three New DB Tables Needed

```sql
-- 1. Register each ZKTeco device
CREATE TABLE biometric_devices (
  id              BIGSERIAL PRIMARY KEY,
  org_id          BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  serial_number   TEXT UNIQUE NOT NULL,
  device_name     TEXT,
  location        TEXT,
  area_code       INT,
  device_ip       TEXT,
  last_seen       TIMESTAMPTZ,
  status          TEXT DEFAULT 'offline',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Append-only raw punch log (never delete, never modify)
CREATE TABLE biometric_raw_logs (
  id              BIGSERIAL PRIMARY KEY,
  org_id          BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_serial   TEXT NOT NULL,
  employee_pin    TEXT NOT NULL,
  punch_time      TIMESTAMPTZ NOT NULL,
  punch_type      SMALLINT NOT NULL,  -- 0=Check-In, 1=Check-Out, 4=OT-In, 5=OT-Out
  verify_type     SMALLINT,           -- 1=Fingerprint, 2=Face, 4=Card
  area            TEXT,
  raw_payload     JSONB,
  processed       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (device_serial, punch_time, employee_pin)  -- idempotency
);

-- 3. Map ZKTeco PIN → HRMS employee
CREATE TABLE biometric_employee_map (
  id              BIGSERIAL PRIMARY KEY,
  org_id          BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_pin    TEXT NOT NULL,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, employee_pin)
);

-- Indexes for performance
CREATE INDEX ON biometric_raw_logs(org_id, punch_time DESC);
CREATE INDEX ON biometric_raw_logs(org_id, processed) WHERE processed = FALSE;

-- 4. Add source column to existing attendance table
ALTER TABLE attendance ADD COLUMN source TEXT DEFAULT 'manual'
  CHECK (source IN ('manual', 'biometric', 'clockify'));

-- 5. Add OT columns to attendance
ALTER TABLE attendance ADD COLUMN ot_hours NUMERIC DEFAULT 0;
ALTER TABLE attendance ADD COLUMN late_minutes INT DEFAULT 0;
ALTER TABLE attendance ADD COLUMN early_exit_minutes INT DEFAULT 0;
```

### Devices to Pre-Seed (Already Known)

```sql
INSERT INTO biometric_devices (org_id, serial_number, device_name, location, area_code, device_ip, status)
VALUES
  (1, 'BYEL184460001', 'Main Area',     'Main Area',     2,  '192.168.10.20',  'online'),
  (1, 'BYEL194660080', 'Dalal',         'Dalal',         6,  '192.168.0.250',  'online'),
  (1, 'CK5T222360083', 'Third Floor',   'Third-Floor',   4,  '192.168.10.205', 'online'),
  (1, 'JJA1241000273', 'CG Road',       'CG Road',       7,  '192.168.1.2',    'online'),
  (1, 'JJA1241900816', 'Bapunagar',     'Bapunagaar',    9,  '192.168.1.202',  'online'),
  (1, 'BHXZ193560692', 'InsuranceBhuj', 'InsuranceBhuj', 25, '192.168.0.45',   'offline'),
  (1, 'JJA1241900721', 'Bhuj',          'Bhuj',          8,  '192.168.1.2',    'offline');
```

### Backend Endpoints to Build

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /iclock/cdata` | None (device push) | Receive ADMS punch from ZKTeco — MAIN integration point |
| `GET /iclock/getrequest` | None | Device heartbeat — must respond or device marks server offline |
| `GET /api/biometric/devices` | JWT | List devices + online/offline status |
| `POST /api/biometric/devices` | JWT admin | Register a new device |
| `GET /api/biometric/logs` | JWT | View raw punch logs with filters |
| `POST /api/biometric/employee-map` | JWT admin | Map ZKTeco PIN → HRMS employee |
| `DELETE /api/biometric/employee-map/:id` | JWT admin | Remove a mapping |

### Frontend Pages to Build

| Page | What It Shows |
|---|---|
| Biometric Devices | All 7 devices with online/offline badge, last seen, transaction count |
| Employee PIN Mapping | Table: Employee Name ↔ ZKTeco PIN — admin assigns/edits |
| Raw Punch Logs | Every punch with timestamp, punch type, processed status |
| Attendance source badge | Fingerprint icon on attendance records where source='biometric' |

### Attendance Business Rules

1. **First punch = Check-In, last punch = Check-Out** (within a calendar day)
2. **Leave guard**: If employee has `on_leave`, `half_day`, or `wfh` status for that date → skip, do not overwrite
3. **Duplicate protection**: UNIQUE on `(device_serial, punch_time, employee_pin)` — ZKTeco retries, must be idempotent
4. **Respond fast**: Always return `200 OK` to device within 2 seconds. Process async after responding

---

## 7. What Is Still Pending from Client

### Urgent — Ask This Now

**Message to send:**
```
Hello Sir,

We have started development. We need just two more things from your 
side to go live:

1. ADMS Server URL currently on the devices:
   What is the IP address and port currently set as the ADMS server 
   on the ZKTeco devices?
   Example: http://203.x.x.x:8080
   (We need this to redirect the devices to our server.)

2. Employee List Export from ZKTeco WDMS:
   Please export the enrolled employee list from WDMS with:
   - Employee PIN / Enrollment Number
   - Employee Name
   An Excel or CSV export from the Employee section is fine.

Once we receive these two things, we can complete the integration 
and go live.

Thank you.
```

### Why These Two Are Critical

| Pending Item | Why It Blocks Us |
|---|---|
| Current ADMS server URL | Devices are pushing to SOME server right now. We need to know what URL is configured so we can tell them to change it to ours. Without this, live punches never reach us. |
| Employee PIN export from WDMS | Every punch contains only a PIN (e.g., `431`). Without the PIN → Employee Name → HRMS user mapping, every punch lands as unmatched. Attendance records cannot be created. |

### Already Answered (No Follow-Up Needed)

| Item | Status |
|---|---|
| Network type | LAN with internet — confirmed |
| ADMS already configured | They've set our server's static IP + port on all devices |
| Device list | All 7 devices with serial, name, area, IP, status received |
| Sample transaction data | Real punch data from today received |

### Ask Later (After Go-Live)

- Should biometric attendance auto-approve or go through regularization flow?
- Duplicate punch protection window (ignore second scan within X minutes)?
- Historical data migration from WDMS? How far back?
- OT handling: track OT hours separately or merge with regular hours?
- AWS region preference for RDS? (Mumbai ap-south-1 is standard for India)

---

## 8. Feature Gap Analysis — What to Build

### Already In Our System (No Work Needed)
Employee basics, photo, departments, designations, documents upload, assets, attendance check-in/out, leaves with approval, payroll + payslips, performance, shifts, announcements, expenses, onboarding, exit management.

### New Fields Needed on Employee Profile (`users` table)

| Field | Priority | Notes |
|---|---|---|
| `device_enrollment_id` | **CRITICAL** | = ZKTeco PIN. Bridge between biometric and HRMS |
| `branch_id` | **HIGH** | FK to new `branches` table |
| `salutation` | Medium | Mr/Mrs/Ms/Dr |
| `middle_name`, `surname` | Medium | Split from single `name` field |
| `division`, `sub_division` | Medium | Org structure levels |
| `grade` | Medium | A/B/C classification |
| `pay_cadre` | Medium | Salary band |
| `location` | Medium | Physical location |
| `probation_applicable`, `probation_months` | Medium | Confirmation date logic |
| `hod_id` | Medium | Head of Department (separate from reporting_to) |
| `aadhar_no`, `pan_number`, `pan_name` | Medium | Statutory/KYC |
| `uan_no` | High | Universal Account Number for PF |
| `old_employee_id` | Low | Legacy data migration |
| `weekly_off_day` | Medium | Attendance calculation |

### New Table: `branches`

```sql
CREATE TABLE branches (
  id       BIGSERIAL PRIMARY KEY,
  org_id   BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  code     TEXT,
  location TEXT,
  address  TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### New Employee Profile Tabs (vs. InSypay)

| Tab | Our Status | What to Add |
|---|---|---|
| Personal | Partial | Fields listed above |
| Contact | Partial | Present + Permanent address each with Address1/2/3, State, City, Taluka, Village, PO, Fax |
| Bank | Partial | Upgrade to dual bank accounts + MICR Code + Transaction Type |
| **Administration** | **Missing** | NEW: All statutory + payroll settings per employee (PF, ESI, PT, OT — see below) |
| Qualification | Missing | Multi-record education: Board, Year, %, Specialization, SGPA, CGPA, Language skills |
| Experience | Missing | Multi-record work history: Company, Dates, CTC, Designation |
| Pay Elements | Missing | Per-employee salary component assignment (complex — do later) |
| Employee Document | Partial | Change to fixed list: Aadhaar, PAN, Bank Passbook, Passport, Driving License, etc. each with upload |
| Employee Asset | Already Have | Verify Category → Type → Asset Name hierarchy |
| TDS Setup | Missing | Tax deduction settings per employee |
| TDS Declaration | Missing | Investment declarations (80C, HRA, etc.) |
| Nominee Details | Missing | PF/insurance beneficiary details |
| Insurance Details | Missing | Insurance policy per employee |
| Training | Missing | Training records |
| Health Record | Missing | Employee health info |
| Transportation | Missing | Commute/transport allowance |

### Administration Tab — Statutory Fields (All New, Very Important)

These feed into payroll and are required for Indian compliance:

**PF (Provident Fund):** PF Applicable, PF No, VPF Applicable, VPF%, UAN No, PRAN, Max PF Amount, Is PF On Gross, Is New For PF, Is PF After Age, Is Employer Same

**ESI (Employee State Insurance):** ESI Applicable, ESI No, ESI Dispensary

**PT (Professional Tax):** PT Applicable, Pro.Tax Rule

**Other:** Labour Welfare Fund Applicable, Gratuity Applicable, Gratuity ID, GL Code, Bonus Applicable

**OT (Overtime):** OT Applicable, OT Rate (per hour), OT Paid with Salary

**Payroll Config:** Salary Structure (GROSS/CTC), Salary On (Day/Month), Work Hours/Day, Per Hour Rate, Per Day Wages, Salary Slip Format

### Monthly Attendance Register View (New View)

Client uses this as their primary attendance screen. We don't have it.

Each row = one calendar day. Columns:
- Date, Day of Week
- Shift (start time – end time)
- Check In (actual), Check Out (actual)
- Late (minutes late vs shift start)
- Early Exit (minutes early vs shift end)
- Total Hours, Effective Hours
- OT Hours, OT2 Hours
- Leave code (CL, WO, P)
- Regularization Request link

---

## 9. Implementation Sequence

### Phase 1 — Infrastructure Setup (Before Any Code)
- [ ] Create new Supabase project for Relitrade
- [ ] Run `full_schema.sql` on their project
- [ ] Create new Fly.io app (same repo, new app name)
- [ ] Configure `.env` on new app to point to Relitrade's Supabase
- [ ] Set up subdomain/domain for them

### Phase 2 — DB Migration (Run on Relitrade's DB)
- [ ] Add `source`, `ot_hours`, `late_minutes`, `early_exit_minutes` to `attendance`
- [ ] Create `branches` table
- [ ] Create `biometric_devices` table
- [ ] Create `biometric_raw_logs` table
- [ ] Create `biometric_employee_map` table
- [ ] Add new fields to `users` table (device_enrollment_id, branch_id, grade, etc.)
- [ ] Pre-seed 7 known devices into `biometric_devices`

### Phase 3 — Backend (in main codebase, works on both deployments)
- [ ] Add `express.urlencoded({ extended: false })` to `server.js` after `express.json()`
- [ ] Register `POST /iclock/cdata` (no auth — device push receiver)
- [ ] Register `GET /iclock/getrequest` (device heartbeat handler)
- [ ] Add `'biometric'` to `ALL_FEATURE_KEYS` in `server.js`
- [ ] Add `'/biometric': 'biometric'` to `FEATURE_ROUTE_MAP` in `server.js`
- [ ] Create `routes/biometric.js` with all 5 management endpoints
- [ ] Create `routes/branches.js`
- [ ] Enable `biometric` feature flag for Relitrade's org in their DB

### Phase 4 — Frontend (in main codebase)
- [ ] Add `biometric` feature key to sidebar nav item with `featureKey: 'biometric'`
- [ ] Add `<FeatureRoute featureKey="biometric">` route in `App.jsx`
- [ ] Build `BiometricDevices.jsx` page
- [ ] Build `BiometricPinMapping.jsx` page
- [ ] Build `BiometricLogs.jsx` page
- [ ] Add fingerprint source badge to existing attendance cards
- [ ] Add `branches` dropdown to employee profile form

### Phase 5 — Go Live (After Client Provides Pending Items)
- [ ] Import employee PIN → user_id mapping from WDMS export
- [ ] Update ZKTeco devices ADMS URL → point to new Relitrade server
- [ ] Verify live punches arrive at `/iclock/cdata`
- [ ] Verify `biometric_raw_logs` fills with real data
- [ ] End-to-end test: punch at device → attendance record in HRMS
- [ ] Parallel run: compare HRMS attendance vs ZKTeco WDMS side by side

### Phase 6 — Extended Employee Profile (After Biometric Stable)
- [ ] Administration tab with statutory fields (PF/ESI/PT/OT)
- [ ] Monthly attendance register view
- [ ] Dual bank accounts
- [ ] Fixed document type list
- [ ] Contact tab: Present + Permanent address
- [ ] Qualification + Experience tabs

---

## 10. Key Technical Gotchas

| Gotcha | Detail | Where to Fix |
|---|---|---|
| `express.urlencoded()` missing | ZKTeco ADMS sends form-encoded data, not JSON. `req.body` will be empty without this. | `server.js` after `express.json()` |
| ADMS path is `/iclock/cdata` | ZKTeco firmware hardcodes this path. Cannot change it to `/biometric/push`. | Register this exact path |
| Device heartbeat required | ZKTeco devices also ping `GET /iclock/getrequest`. Must respond correctly or device marks server offline. | Register and handle this endpoint |
| Leave guard | If attendance row has status `on_leave`/`half_day`/`wfh`, skip biometric punch — do not overwrite. | Biometric processor logic |
| Idempotency | ZKTeco retries failed pushes. UNIQUE on `(device_serial, punch_time, employee_pin)` prevents duplicates. | Already in schema |
| `onConflict` must use 3 columns | Use `user_id,date,organization_id` — the existing `admin-edit` endpoint wrongly uses 2 columns. | Biometric attendance upsert |
| CORS safe | ZKTeco sends no `Origin` header, so existing CORS middleware passes it through. No changes needed. | No action needed |
| Respond to device in 2 seconds | Always return `200 OK` to device immediately. Do DB processing async after responding. | Biometric push handler |
| First punch = Check-In, last = Check-Out | Within a calendar day, first punch sets check_in, subsequent punches update check_out. | Biometric processor logic |

---

## Files Created for This Project

| File | Purpose |
|---|---|
| `biometric-client-requirements.md` | Original requirements and questions to ask client |
| `biometric-implementation-kickoff.md` | What we can build now vs what needs client answers |
| `biometric-implementation-plan.md` | Full technical plan: architecture, DB SQL, endpoints, sequence |
| `biometric-pending-from-client.md` | Exactly what to ask client + ready-to-send message template |
| `client-feature-gap-analysis.md` | Detailed comparison of InSypay features vs our system |
| `relitrade-master-summary.md` | **This file — complete reference for the entire project** |
