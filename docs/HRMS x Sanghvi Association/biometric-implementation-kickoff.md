# Biometric Integration — Implementation Kickoff

## What We're Building

ZKTeco device → HTTP PUSH → our backend `/biometric/push` → PostgreSQL (AWS RDS) → HRMS attendance records.

This doc defines what we need from the client before implementation starts, what we can build right now without waiting, and the exact sequence to follow.

---

## STOP — Get These 3 Answers Before Writing Any Integration Code

These are hard blockers. Nothing in the integration can be finalized without them.

### 1. Device Model
**Ask:** Which exact ZKTeco model do you have? (e.g., K40, F22, UFace302, SpeedFace-V5L)

**Why it blocks us:** Each model uses a slightly different PUSH SDK payload format. We cannot write the `/biometric/push` receiver until we know the exact fields the device sends.

**What we need:** Model name → we look up the SDK docs → write the receiver.

---

### 2. Internet Direct vs LAN-Only
**Ask:** Are the biometric devices connected to the internet directly, or only to the local office network (LAN)?

**Why it blocks us:** This is an architecture fork — two completely different setups:

| Scenario | What it means |
|---|---|
| Internet-direct | Device pushes to our AWS server URL. Simple. Can start immediately after DNS/IP is set. |
| LAN-only | We need a local bridge server installed on their office network. Adds weeks of complexity. |

**What we need:** Confirmed answer before we design anything.

---

### 3. Employee PIN Export from ZKTeco WDMS
**Ask:** Can you export the list of enrolled employees from ZKTeco WDMS? (We need: Employee Name, ZKTeco PIN/Enrollment Number)

**Why it blocks us:** Every punch the device sends contains only a ZKTeco PIN — not a name, not an HRMS ID. Without the mapping table (`biometric_employee_map`), every punch lands as unmatched and cannot create an attendance record.

**What we need:** A CSV/Excel export with at minimum:
- ZKTeco Enrollment PIN
- Employee Name (to match against HRMS)

---

## What We Can Build Right Now (No Client Answers Needed)

Start these in parallel while waiting for client responses.

### Database Changes

```sql
-- 1. Add source column to existing attendance table
ALTER TABLE attendance ADD COLUMN source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'biometric', 'clockify'));

-- 2. Register ZKTeco devices
CREATE TABLE biometric_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  serial_number VARCHAR(100) UNIQUE NOT NULL,
  device_name VARCHAR(100),
  location VARCHAR(200),
  last_seen TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Append-only raw punch log (never delete, never modify)
CREATE TABLE biometric_raw_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_serial VARCHAR(100) NOT NULL,
  employee_pin VARCHAR(50) NOT NULL,
  punch_time TIMESTAMPTZ NOT NULL,
  punch_type SMALLINT NOT NULL,  -- 0=check-in, 1=check-out, 4=OT-in, 5=OT-out
  verify_type SMALLINT,          -- 1=Fingerprint, 2=Face, 4=Card
  raw_payload JSONB,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (device_serial, punch_time, employee_pin)  -- idempotency key
);

-- 4. Map ZKTeco PIN → HRMS user
CREATE TABLE biometric_employee_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  employee_pin VARCHAR(50) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, employee_pin)
);
```

### Backend Endpoints

| Endpoint | Purpose | Can build now? |
|---|---|---|
| `POST /biometric/push` | Receive punches from device | Partial — can build the raw log + idempotency layer; punch-type parsing depends on device model |
| `GET /biometric/devices` | List devices + online/offline status | Yes |
| `POST /biometric/devices` | Register a device by serial number | Yes |
| `GET /biometric/logs` | View raw punch logs with filters | Yes |
| `POST /biometric/employee-map` | Map ZKTeco PIN → HRMS user | Yes |
| `DELETE /biometric/employee-map/:id` | Remove a mapping | Yes |

### Frontend Pages

| Page | Can build now? |
|---|---|
| Biometric Devices — list with online/offline status | Yes |
| Register new device form | Yes |
| Employee PIN Mapping — table of employee ↔ PIN | Yes |
| Attendance source indicator (fingerprint icon on biometric records) | Yes |
| Per-device raw punch log viewer | Yes |

---

## Follow-Up Questions (Ask After the 3 Blockers Are Answered)

These are important but don't block the initial build.

### Attendance Rules
- Should first punch of the day = check-in and last punch = check-out? Or is it shift-based logic?
- What should happen with punch types 4 (OT-in) and 5 (OT-out)? Track OT hours separately, or treat same as regular punches?
- Duplicate punch protection? (e.g., ignore second scan within 5 minutes from same employee)
- Should biometric attendance auto-approve, or go through the existing regularization/approval flow?

### Historical Data
- Do you want past attendance data from ZKTeco WDMS migrated into the new system?
- If yes: can you export historical punch logs from WDMS in CSV or Excel format? How far back? (3 months / 1 year / full history)

### Infrastructure
- AWS region preference? (Mumbai `ap-south-1` is standard for India)
- Does the client own the AWS account, or host under our account with monthly billing?
- Staging/test environment needed alongside production?

---

## Implementation Sequence Once Blockers Are Cleared

```
Week 1 (can start now — no blockers)
  ├── Run DB migration SQL (4 tables above)
  ├── Build all frontend pages
  └── Build all endpoints except the push receiver core logic

Week 2 (needs device model answer)
  ├── Finalize POST /biometric/push payload parsing
  └── Test with device model's exact payload format

Week 3 (needs internet/LAN answer + PIN export)
  ├── Configure device PUSH SDK URL (internet-direct path)
  │   OR
  ├── Build local bridge server (LAN-only path)
  └── Import employee PIN mapping from WDMS export

Week 4
  ├── End-to-end test with live device
  ├── Verify attendance records appear correctly
  └── Parallel run: ZKTeco WDMS + our system side by side
```

---

## Key Risks to Track

| Risk | Mitigation |
|---|---|
| PIN mismatch between ZKTeco and HRMS | Mandatory mapping step before go-live — no shortcut |
| LAN-only device | Detect this early (Week 1 question) — adds significant scope |
| ZKTeco retries failed pushes | Raw log receiver must be idempotent (UNIQUE on device serial + timestamp + PIN) |
| Multi-device with entry/exit on different floors | Each punch must carry device serial to avoid mis-assignment |

---

## Summary

**Right now:** Run the DB migration, build all frontend pages, build all backend endpoints except the push receiver core.

**Chase urgently from client:** Device model, internet vs LAN-only, WDMS employee PIN export.

**Everything else** (attendance rules, OT handling, historical migration) can be clarified in parallel — they don't block the initial build.
