# Biometric Integration — Implementation Plan

## Current Status (as of 2026-07-08)

Client has 7 ZKTeco devices. 5 are online, 2 offline. Devices are already configured with ADMS push pointing to a server (their own static IP). Live transaction data is flowing. We just need to redirect that push to our server and process it.

---

## Architecture (Final — LAN + Internet Confirmed)

```
ZKTeco Device (already pushing via ADMS)
     │
     │  HTTP POST to /iclock/cdata  (ZKTeco standard ADMS path)
     ▼
Our Backend Server (Express)
  /iclock/cdata
     │
     ├─ 1. Log raw punch → biometric_raw_logs  (append-only, never delete)
     ├─ 2. Idempotency check (device_serial + punch_time + employee_pin)
     ├─ 3. Map ZK PIN → HRMS user_id  (via biometric_employee_map)
     ├─ 4. Determine Check-In vs Check-Out
     └─ 5. Create/update attendance record  (source = 'biometric')
                         │
                    Supabase / AWS RDS PostgreSQL
```

**No local bridge needed.** Devices have internet. ADMS push is already configured.

---

## Devices to Register (Already Known)

| Serial Number | Name | Area | IP | Status |
|---|---|---|---|---|
| BYEL184460001 | Main Area | Main Area | 192.168.10.20 | Online |
| BYEL194660080 | Dalal | Dalal | 192.168.0.250 | Online |
| CK5T222360083 | Third Floor | Third-Floor | 192.168.10.205 | Online |
| JJA1241000273 | CG Road | CG Road | 192.168.1.2 | Online |
| JJA1241900816 | Bapunagar | Bapunagaar | 192.168.1.202 | Online |
| BHXZ193560692 | InsuranceBhuj | InsuranceBhuj | 192.168.0.45 | Offline |
| JJA1241900721 | Bhuj | Bhuj | 192.168.1.2 | Offline |

---

## Database Migration (Run This First)

```sql
-- 1. Source column on existing attendance table
ALTER TABLE attendance
  ADD COLUMN source VARCHAR(20) DEFAULT 'manual'
  CHECK (source IN ('manual', 'biometric', 'clockify'));

-- 2. Registered devices
CREATE TABLE biometric_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  serial_number VARCHAR(100) UNIQUE NOT NULL,
  device_name VARCHAR(100),
  location VARCHAR(200),
  area_code INT,
  device_ip VARCHAR(50),
  last_seen TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Append-only raw punch log
CREATE TABLE biometric_raw_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_serial VARCHAR(100) NOT NULL,
  employee_pin VARCHAR(50) NOT NULL,
  punch_time TIMESTAMPTZ NOT NULL,
  punch_type SMALLINT NOT NULL,   -- 0=Check-In, 1=Check-Out, 4=OT-In, 5=OT-Out
  verify_type SMALLINT,           -- 1=Fingerprint, 2=Face, 4=Card
  area VARCHAR(100),
  raw_payload JSONB,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (device_serial, punch_time, employee_pin)
);

-- 4. ZKTeco PIN → HRMS user mapping
CREATE TABLE biometric_employee_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  employee_pin VARCHAR(50) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, employee_pin)
);
```

---

## Backend Endpoints to Build

| Endpoint | Purpose | Can Build Now? |
|---|---|---|
| `POST /iclock/cdata` | Receive ADMS push from ZKTeco device | Yes — raw log + idempotency |
| `GET /iclock/getrequest` | Device heartbeat/handshake (ZKTeco requires this) | Yes |
| `GET /biometric/devices` | List registered devices + online/offline status | Yes |
| `POST /biometric/devices` | Register a new device | Yes |
| `GET /biometric/logs` | View raw punch logs with filters | Yes |
| `POST /biometric/employee-map` | Map ZKTeco PIN → HRMS employee | Yes (after PIN export) |
| `DELETE /biometric/employee-map/:id` | Remove a mapping | Yes |

> **Note on ADMS path:** ZKTeco devices push to `/iclock/cdata` — not `/biometric/push`. This is fixed by the ZKTeco firmware. The device also pings `/iclock/getrequest` for a heartbeat — we must respond correctly or the device marks the server as offline.

---

## Frontend Pages to Build

| Page | What It Shows |
|---|---|
| Biometric Devices | All 7 devices, online/offline badge, last seen time, transaction count |
| Register Device | Form to add a new device by serial number |
| Employee PIN Mapping | Table: Employee Name ↔ ZKTeco PIN — admin can assign/edit |
| Raw Punch Logs | Per-device or global log of every punch with timestamp, punch type, processed status |
| Attendance Source Badge | Small fingerprint icon on existing attendance cards when `source = 'biometric'` |

---

## Implementation Sequence

### Phase 1 — Start Today (No Client Info Needed)
- [ ] Run DB migration SQL above
- [ ] Seed `biometric_devices` with the 7 known devices
- [ ] Build `POST /iclock/cdata` raw receiver (log + idempotency — no PIN mapping yet)
- [ ] Build `GET /iclock/getrequest` heartbeat handler
- [ ] Build device management endpoints (`GET`, `POST /biometric/devices`)
- [ ] Build raw punch log endpoint (`GET /biometric/logs`)
- [ ] Build Biometric Devices frontend page
- [ ] Build Raw Punch Logs frontend page

### Phase 2 — After Client Redirects Devices to Our Server
- [ ] Confirm live punches are arriving at `/iclock/cdata`
- [ ] Verify `biometric_raw_logs` is filling with real data
- [ ] Update device `last_seen` and `status` on each push

### Phase 3 — After Employee PIN Export Received
- [ ] Import employee PIN → user_id mapping into `biometric_employee_map`
- [ ] Enable punch processing: map PIN → user → create attendance record
- [ ] Build Employee PIN Mapping frontend page
- [ ] Add fingerprint source badge to existing attendance views
- [ ] Test end-to-end: device punch → attendance record in HRMS

### Phase 4 — Go-Live
- [ ] Parallel run: verify HRMS attendance matches ZKTeco WDMS records
- [ ] Confirm duplicate punch protection is working (UNIQUE constraint on raw_logs)
- [ ] Hand over to client with monitoring dashboard

---

## Key Rules for the ADMS Receiver

1. **Idempotency first** — ZKTeco retries failed pushes. The UNIQUE on `(device_serial, punch_time, employee_pin)` prevents duplicate records. Always upsert, never insert blindly.
2. **Log everything raw** — Store the full raw payload in `raw_payload JSONB` before any processing. If the mapping fails, the raw punch is still there and can be reprocessed.
3. **Never block the device response** — Respond `200 OK` to the device within 2 seconds or it will retry. Do heavy processing async after responding.
4. **First punch = Check-In, last punch = Check-Out** — Within a calendar day, first punch of the day sets attendance check-in, last punch sets check-out.
