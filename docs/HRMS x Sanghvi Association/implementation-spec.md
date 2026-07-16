# HRMS Biometric Extension — Implementation Spec
**Last Updated:** 2026-07-16
**Reference Client:** Relitrade Shares Broker Pvt. Ltd. (used as blueprint only)
**Scope:** Add biometric attendance, extended employee profile, branches, and monthly attendance register to the existing Lumos Logic HRMS platform

---

## What Does It Do?

A dedicated instance of the existing Lumos Logic HRMS platform, extended with:

1. **ZKTeco biometric attendance** — Fingerprint devices across multiple office locations push real-time punches via ADMS protocol to our server, auto-creating attendance records
2. **Extended employee profile** — 18-tab profile matching enterprise HRMS standards: statutory fields (PF/ESI/PT/OT), dual bank accounts, qualification history, experience history, split addresses, fixed document types, TDS setup
3. **Branches entity** — New org-structure layer (city/office branches) sitting above departments
4. **Monthly Attendance Register** — Day-by-day grid view per employee showing Late, Early Exit, OT hours; primary daily-use screen replacing manual tracking
5. **One-time data migration** — Employee records + attendance history from client's old system (SQL Server / InSypay) into our system via CSV export

---

## Who Is It For?

- HR admins managing 200–500+ employees across multiple branches
- Management reviewing attendance registers, OT, late patterns daily
- The ZKTeco biometric devices themselves — they are API consumers of `/iclock/cdata` and must always get a `200 OK` within 2 seconds

## Who Is It NOT For?

- Other Lumos Logic clients on the shared Supabase — this is an isolated deployment per enterprise client
- Payroll computation or statutory report generation (PF/ESI summaries) — fields are stored for future use, not computed yet
- Visitor management, task management, IMEI mobile attendance, video gallery

## What Does Success Look Like?

1. Employee scans finger on ZKTeco device → attendance record appears in HRMS within 5 seconds with `source = 'biometric'`
2. Leave guard works — if employee is on approved leave, biometric punch is silently ignored, leave record is not overwritten
3. HR opens Monthly Attendance Register → sees day-by-day grid with accurate Late, Early Exit, OT values
4. All employee records migrated from old system with correct branch, grade, PF, bank details
5. All ZKTeco devices show Online/Offline status with last-seen timestamps on the Biometric Devices page
6. No punch is lost or duplicated — ZKTeco retry mechanism hits idempotency, no duplicate rows

---

## What Is Out of Scope?

| Feature | Reason |
|---|---|
| Statutory report dashboards (PF/PT/ESIC summaries) | Fields stored, not computed yet — separate module |
| Payroll computation | Needs per-element pay structure — deferred to later phase |
| Pay Elements tab (per-employee salary components) | Connects to payroll engine — deferred |
| Visitor Management | Not requested |
| IMEI / mobile-based attendance | Client uses hardware biometrics |
| TDS computation / Form 16 generation | Store declaration fields only for now |
| Nominee, Insurance, Transportation, Training tabs | Lower priority — post go-live |
| Staging environment | Parallel run during go-live is sufficient |

---

## Database Decision: PostgreSQL

### Options Evaluated

| Criteria | SQLite | SQL Express | MySQL | **PostgreSQL** | SQL Server |
|---|---|---|---|---|---|
| Hostinger shared hosting | File-based only | Windows only | Native cPanel | VPS only | Windows + paid |
| Hostinger VPS | Yes | No | Yes | **Yes** | No |
| AWS migration path | No | No | RDS MySQL | **RDS PostgreSQL** | Cost prohibitive |
| Concurrent biometric writes | Locks on every write | 10GB cap | Good | **Best** | Good |
| Large scale (100k+ punch logs) | No | Size limited | Good | **Best indexing** | Good |
| UPSERT ON CONFLICT (idempotency) | Limited | Limited | INSERT IGNORE | **Native** | Yes |
| JSONB for raw payload storage | No | No | JSON (no index) | **JSONB + indexed** | Limited |
| Existing codebase compatibility | Full rewrite | Full rewrite | Full rewrite | **Zero changes** | Full rewrite |
| License cost | Free | Free (capped) | Free | **Free** | Expensive |

### Verdict: PostgreSQL

**SQLite** — eliminated. Single-writer, file-based, not production-grade for concurrent biometric device writes.

**SQL Server Express** — the reference client's OLD system ran on this. That's the migration *source*, not the target. Also: hard 10GB DB cap, Windows-only, Hostinger VPS is Linux.

**Full SQL Server** — enterprise licensing costs thousands/year. Never.

**MySQL** — genuinely viable for Hostinger. The problem: the entire codebase (3,500+ lines in `server.js` + 16 route files) uses Supabase's PostgreSQL query builder. Switching to MySQL means rewriting every `.from().select().eq()` call, every migration SQL file, and losing JSONB (needed for raw biometric payloads). That's 2–3 weeks of pure adapter work for zero functional gain.

**PostgreSQL** wins because:
- Codebase already 100% written for it — zero adapter work
- Hostinger KVM VPS runs PostgreSQL via `apt install postgresql`
- AWS migration = point `DATABASE_URL` at RDS PostgreSQL — same engine, same SQL, zero code changes
- JSONB for raw biometric payloads, native UPSERT ON CONFLICT for idempotency, window functions for attendance register calculations

> **The client's old system being on SQL Server = where you pull migration data FROM. It has zero bearing on what you build ON.**

---

## Hosting Plan: Hostinger → AWS

### Current Stack
- Frontend: Firebase / static hosting
- Backend: Google Cloud Run
- Database: Supabase (PostgreSQL)

### Target — Hostinger VPS (KVM2 or above, minimum 4GB RAM / 2 cores)

```
[Hostinger VPS]
├── Nginx            (reverse proxy + SSL via Let's Encrypt)
├── Node.js backend  (PM2 process manager, auto-restart)
├── PostgreSQL 15    (self-hosted, same engine as Supabase)
└── React build      (Nginx serves static files)
```

**Minimum VPS spec:** KVM2 (4 vCPU, 8GB RAM) for biometric real-time ingestion under load

### Later Migration to AWS (zero code changes)

```
[AWS]
├── EC2 / App Runner   (backend — same Node.js code, same Docker image)
├── RDS PostgreSQL 15  (pg_dump from VPS → pg_restore to RDS)
├── S3 + CloudFront    (frontend static assets)
└── No code changes    (just new DATABASE_URL env var)
```

**Why this path is clean:** PostgreSQL on Hostinger VPS = PostgreSQL on AWS RDS. Same engine, same SQL dialect. Migration is `pg_dump` → `pg_restore`. Nothing in the application code changes.

---

## Architecture: One Codebase, Multiple Deployments

```
GitHub Repo (single codebase)
    │
    ├── Main Platform deployment  →  Supabase (shared)  →  main domain
    └── Enterprise Client deployment  →  PostgreSQL (isolated)  →  client.domain.com
```

**Rules:**
- Every feature goes into the existing codebase, gated by `organization_features` table
- Each enterprise client gets their own isolated PostgreSQL database — never shared
- Same repo → different `.env` → different deployment. Never fork the codebase.

### New Feature Flags to Add

```
biometric    → ZKTeco integration (devices, pin mapping, punch logs)
branches     → Branch entity and filters across all pages
statutory    → PF/ESI/PT/OT fields on employee profile
overtime     → OT tracking columns in attendance
```

---

## Implementation Plan

---

### Phase 1 — Foundation (Blocks Everything Else)

#### 1A. Branches Entity

**Why first:** `branch_id` is a foreign key on employees, on biometric devices, and drives employee list filters. Everything downstream references it.

**New DB table:**
```sql
CREATE TABLE IF NOT EXISTS branches (
  id          BIGSERIAL PRIMARY KEY,
  org_id      BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  code        TEXT,
  location    TEXT,
  address     TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON branches(org_id);
```

**Backend:** `routes/branches.js` — full CRUD, org-scoped, admin-only
**Frontend:** `Branches.jsx` page at `/branches` — table with add/edit/delete modal
**Employee form:** Branch dropdown in Personal tab
**Employee list:** Branch filter dropdown

---

#### 1B. Extended Employee Fields

**New columns on `users` table — grouped by priority:**

```sql
-- CRITICAL (blocks biometric go-live)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS device_enrollment_id TEXT,  -- ZKTeco PIN
  ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES branches(id);

-- Add unique constraint: one PIN per org
CREATE UNIQUE INDEX ON users(organization_id, device_enrollment_id)
  WHERE device_enrollment_id IS NOT NULL;

-- HIGH (week 1)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS salutation TEXT,
  ADD COLUMN IF NOT EXISTS middle_name TEXT,
  ADD COLUMN IF NOT EXISTS surname TEXT,
  ADD COLUMN IF NOT EXISTS uan_no TEXT,
  ADD COLUMN IF NOT EXISTS pf_no TEXT,
  ADD COLUMN IF NOT EXISTS aadhar_no TEXT,
  ADD COLUMN IF NOT EXISTS pan_number TEXT,
  ADD COLUMN IF NOT EXISTS pan_name TEXT,
  ADD COLUMN IF NOT EXISTS grade TEXT,
  ADD COLUMN IF NOT EXISTS pay_cadre TEXT,
  ADD COLUMN IF NOT EXISTS division TEXT,
  ADD COLUMN IF NOT EXISTS sub_division TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS weekly_off_day TEXT,
  ADD COLUMN IF NOT EXISTS work_hours_per_day NUMERIC DEFAULT 8;

-- MEDIUM (week 2)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS probation_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS probation_months INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hod_id BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS old_employee_id TEXT,
  ADD COLUMN IF NOT EXISTS voter_id TEXT,
  ADD COLUMN IF NOT EXISTS special_allowance NUMERIC DEFAULT 0;

-- STATUTORY (Administration tab)
ALTER TABLE users
  -- PF
  ADD COLUMN IF NOT EXISTS pf_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vpf_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vpf_percentage NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_pf_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pran TEXT,
  ADD COLUMN IF NOT EXISTS is_pf_on_gross BOOLEAN DEFAULT FALSE,
  -- ESI
  ADD COLUMN IF NOT EXISTS esi_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS esi_no TEXT,
  ADD COLUMN IF NOT EXISTS esi_dispensary TEXT,
  -- PT / Other
  ADD COLUMN IF NOT EXISTS pt_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lwf_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gratuity_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gratuity_id TEXT,
  ADD COLUMN IF NOT EXISTS gl_code TEXT,
  ADD COLUMN IF NOT EXISTS bonus_applicable BOOLEAN DEFAULT FALSE,
  -- OT
  ADD COLUMN IF NOT EXISTS ot_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ot_rate NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ot_paid_with_salary BOOLEAN DEFAULT TRUE,
  -- Payroll config
  ADD COLUMN IF NOT EXISTS salary_structure TEXT DEFAULT 'GROSS',
  ADD COLUMN IF NOT EXISTS salary_on TEXT DEFAULT 'Month',
  ADD COLUMN IF NOT EXISTS per_hour_rate NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_day_wages NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salary_slip_format TEXT DEFAULT 'Format1',
  ADD COLUMN IF NOT EXISTS max_weekoff_in_month INT DEFAULT 8;
```

**Key decision:** All statutory fields go directly on `users` table (not a separate `employee_statutory` table). Simpler to query, no join overhead on hot path, and we're storing for reference — not computing payroll yet.

---

#### 1C. Biometric DB Tables

```sql
-- Register each physical device
CREATE TABLE IF NOT EXISTS biometric_devices (
  id            BIGSERIAL PRIMARY KEY,
  org_id        BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  serial_number TEXT UNIQUE NOT NULL,
  device_name   TEXT,
  location      TEXT,
  branch_id     BIGINT REFERENCES branches(id),
  area_code     INT,
  device_ip     TEXT,
  last_seen     TIMESTAMPTZ,
  status        TEXT DEFAULT 'offline' CHECK (status IN ('online','offline')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON biometric_devices(org_id);

-- Append-only raw punch log — NEVER delete, NEVER update rows
CREATE TABLE IF NOT EXISTS biometric_raw_logs (
  id            BIGSERIAL PRIMARY KEY,
  org_id        BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_serial TEXT NOT NULL,
  employee_pin  TEXT NOT NULL,
  punch_time    TIMESTAMPTZ NOT NULL,
  punch_type    SMALLINT,    -- 0=Check-In, 1=Check-Out, 4=OT-In, 5=OT-Out
  verify_type   SMALLINT,    -- 1=Fingerprint, 2=Face, 4=Card
  area          TEXT,
  raw_payload   JSONB,       -- full raw body from device, for debugging
  processed     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (device_serial, punch_time, employee_pin)  -- idempotency key
);
CREATE INDEX ON biometric_raw_logs(org_id, punch_time DESC);
CREATE INDEX ON biometric_raw_logs(org_id, processed) WHERE processed = FALSE;

-- Map ZKTeco PIN → HRMS user_id (set up once per employee)
CREATE TABLE IF NOT EXISTS biometric_employee_map (
  id            BIGSERIAL PRIMARY KEY,
  org_id        BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_pin  TEXT NOT NULL,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, employee_pin)
);
CREATE INDEX ON biometric_employee_map(org_id);

-- New columns on existing attendance table
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'
    CHECK (source IN ('manual','biometric','clockify')),
  ADD COLUMN IF NOT EXISTS ot_hours NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_minutes INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_exit_minutes INT DEFAULT 0;

-- New sub-resource tables for extended employee profile
CREATE TABLE IF NOT EXISTS employee_qualifications (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id          BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  institution     TEXT,
  board_university TEXT,
  year_of_passing INT,
  percentage      NUMERIC,
  cgpa            NUMERIC,
  specialization  TEXT,
  degree_class    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_experiences (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id          BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_name    TEXT,
  designation     TEXT,
  industry        TEXT,
  start_date      DATE,
  end_date        DATE,
  ctc             NUMERIC,
  total_years     NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Phase 2 — ADMS Receiver (Core Biometric Engine)

The most technically critical piece. Two endpoints with **no JWT auth** — devices cannot send tokens.

```
POST /iclock/cdata       ← ZKTeco pushes punches here
GET  /iclock/getrequest  ← ZKTeco heartbeat poll
```

#### Rules That Must Never Be Broken

| Rule | Why |
|---|---|
| Add `express.urlencoded({ extended: false })` to `server.js` | ZKTeco sends `application/x-www-form-urlencoded`, NOT JSON. Without this, `req.body` is empty and every punch is silently lost |
| Respond `200 OK` within 2 seconds | ZKTeco device timeout. No response = device retries, causing duplicate push attempts |
| All DB work is async AFTER response | `res.send('OK')` first, then `setImmediate(() => { /* process */ })` |
| UNIQUE on `(device_serial, punch_time, employee_pin)` | ZKTeco retries missed pushes. This prevents duplicates |
| Never delete from `biometric_raw_logs` | Append-only audit trail. Non-negotiable |
| `onConflict` on attendance uses 3 columns | `user_id, date, organization_id` — existing admin-edit endpoint has a bug using only 2 |

#### Punch Processing Logic (in `handlers/biometricPush.js`)

```
1. Parse URL-encoded body → extract SN (serial), pin, time, checktype
2. res.send('OK') immediately ← device gets its 200 before any DB work
3. [async] Upsert biometric_raw_logs ON CONFLICT DO NOTHING (idempotent)
4. [async] Update biometric_devices → last_seen = NOW(), status = 'online'
5. [async] Lookup biometric_employee_map for this pin
         → No match: leave processed=false, done
         → Match: continue with user_id
6. [async] Check attendance for user_id + date
         → status IN ('on_leave','half_day','wfh'): LEAVE GUARD — skip, done
7. [async] punch_type = 0 (Check-In):
         → INSERT attendance if no check_in exists for this date
   [async] punch_type = 1 (Check-Out):
         → UPDATE check_out, recalculate work_hours
         → Calculate late_minutes = MAX(0, check_in - shift_start)
         → Calculate early_exit_minutes = MAX(0, shift_end - check_out)
         → Calculate ot_hours = MAX(0, work_hours - shift_duration)
         → source = 'biometric' on all records
8. [async] Mark biometric_raw_logs.processed = true
```

#### Heartbeat Handler (in `handlers/biometricHeartbeat.js`)

```
GET /iclock/getrequest
→ Extract SN from query params
→ Update biometric_devices last_seen + status = 'online' (async)
→ res.set('Content-Type', 'text/plain').send('OK')
```

If this endpoint doesn't respond correctly, ZKTeco marks the server as offline and stops pushing.

---

### Phase 3 — Biometric Management Backend

New file: `routes/biometric.js` — all JWT-protected, admin-only:

| Endpoint | Purpose | Key Detail |
|---|---|---|
| `GET /api/biometric/devices` | List devices + online/offline status | Status derived from `last_seen < 5 min`, not a stored boolean |
| `POST /api/biometric/devices` | Register a new device by serial number | |
| `GET /api/biometric/logs` | Paginated raw punch log viewer | **Must be paginated** — 100k+ rows, never return all |
| `POST /api/biometric/employee-map` | Map ZKTeco PIN → HRMS user | |
| `DELETE /api/biometric/employee-map/:id` | Remove a mapping | |
| `POST /api/biometric/reprocess` | Reprocess unmatched logs after new PIN mapping added | Retroactively creates attendance records for all `processed=false` logs matching new PIN |

New file: `routes/branches.js` — full CRUD, org-scoped.

**Reprocess logic:** When HR adds a new PIN → user mapping, query all `biometric_raw_logs WHERE employee_pin = ? AND processed = false AND org_id = ?` and run each through the punch processing logic. This recovers attendance for employees whose mapping didn't exist when punches arrived.

---

### Phase 4 — Monthly Attendance Register

**New backend endpoint:**
```
GET /api/attendance/register?user_id=&month=&year=
```

Returns one row per calendar day in the month:
```json
{
  "date": "2026-07-12",
  "day_of_week": "Sunday",
  "shift_start": "10:00",
  "shift_end": "19:00",
  "check_in": "10:09",
  "check_out": "17:32",
  "late_minutes": 9,
  "early_exit_minutes": 88,
  "total_hours": 7.38,
  "effective_hours": 7.38,
  "ot_hours": 0,
  "status": "present",
  "source": "biometric",
  "has_regularization_request": false
}
```

**Calculation logic — computed in API, not stored:**
- `late_minutes = MAX(0, check_in_minutes - shift_start_minutes)`
- `early_exit_minutes = MAX(0, shift_end_minutes - check_out_minutes)` — only if employee left early
- `ot_hours = MAX(0, work_hours - shift_duration_hours)`
- Days with no attendance row + not holiday + not leave → `status = 'absent'`
- Days matching employee's `weekly_off_day` → `status = 'week_off'`
- Shift lookup: check `shift_assignments` for user+date first; fall back to org `work_schedule`

**Frontend — `AttendanceRegister.jsx` at `/attendance/register`:**
- Employee picker dropdown + month + year picker
- Sticky first column (date/day), horizontal scroll for time columns
- Color coding: Late = yellow row, Absent = red row, OT badge = blue, biometric source = fingerprint icon
- "Request Regularization" link per row where applicable

---

### Phase 5 — Employee Profile UI Extensions

#### New / Updated Tabs

**Personal Tab (existing, extend):**
- Add: Salutation, Middle Name, Surname (split from single name field)
- Add: Branch dropdown (FK to branches)
- Add: Division, Sub Division, Grade, Pay Cadre, Location
- Add: Device Enrollment ID (ZKTeco PIN) — shows fingerprint icon when set
- Add: Weekly Off Day, Probation toggle + months, HOD selector
- Add: Aadhar No, PAN Number, PAN Name, UAN No

**Contact Tab (existing, extend):**
- Split from single `address` text field into:
  - Present Address: Address1, Address2, Address3, State, City, Taluka, PIN Code
  - Permanent Address: same fields + "Same as Present" toggle

**Bank Tab (existing, upgrade):**
- Upgrade from single bank to **Bank Account 1 + Bank Account 2**
- Each: Payment Method, Bank Name, MICR Code, Branch Name, Account Type, Account No, IFSC Code, Transaction Type

**Administration Tab (new):**
- Grouped form sections (not a flat field list):
  - **PF Group:** PF Applicable toggle → PF No, VPF toggle → VPF%, UAN No, PRAN, Max PF Amount, Is PF on Gross
  - **ESI Group:** ESI Applicable toggle → ESI No, ESI Dispensary
  - **PT Group:** PT Applicable toggle
  - **Other Statutory:** LWF toggle, Gratuity toggle → Gratuity ID, GL Code, Bonus Applicable
  - **OT Group:** OT Applicable toggle → OT Rate/hr, OT Paid with Salary toggle
  - **Payroll Config:** Salary Structure (GROSS/CTC), Salary On (Day/Month), Work Hours/Day, Per Hour Rate, Per Day Wages, Salary Slip Format, Max Weekoff in Month
- Saved via separate `PUT /api/employees/:id/statutory` endpoint

**Documents Tab (existing, restructure):**
- Replace generic upload with fixed document type list:
  - Aadhaar, PAN Card, Bank Passbook, Passport, Driving License, Voter ID, Ration Card, School Certificate, TDS Form 16, Health Record
- One upload slot per document type, shows upload status

**Qualification Tab (new):**
- Multi-record table: add/edit/delete education records
- Fields: Institution, Board/University, Year of Passing, %, CGPA, Specialization, Class/Grade

**Experience Tab (new):**
- Multi-record table: add/edit/delete work history
- Fields: Company Name, Designation, Industry, Start Date, End Date, CTC, Total Years (auto-calculated)

#### Employee List Upgrades
- New filter dropdowns: Branch, Grade, Division, Employment Type
- Fingerprint icon on employee card when `device_enrollment_id` is set
- "Left Date" column in results table

---

### Phase 6 — Data Migration from Old System

One-time operation, not a recurring feature.

**Process:**
1. Client exports CSVs from old HRMS (InSypay / any SQL Server-backed system)
2. Tables needed: Employee Master, Attendance (last 3 months minimum), Departments, Branches
3. Node.js migration script maps their column names → our column names

**Key column transforms:**
| Source Column | Target Column | Transform |
|---|---|---|
| `EmpNo` | `device_enrollment_id` | Direct (employee number = ZKTeco PIN in most systems) |
| `FirstName + MiddleName + Surname` | `name` | Concatenate |
| `JoinDate` (DD/MM/YYYY) | `date_of_joining` | Parse → YYYY-MM-DD |
| `DOB` | `date_of_birth` | Same date format conversion |
| `Status` (Active/Resigned) | `employment_status` | Lowercase mapping |
| `InTime / OutTime` | `check_in / check_out` | HH:MM format |
| `P/CL/WO` | `status` | present/on_leave/week_off |
| Attendance `Source` | `source` | Set all historical = 'biometric' |

**Priority order for migration:**
1. Departments + Designations (needed as foreign keys for employees)
2. Branches (needed as foreign keys for employees)
3. Employee Master (HIGH — everything depends on this)
4. Attendance last 3 months (HIGH — needed for continuity)
5. Leave records (HIGH)
6. Documents, Assets (Low — can do post go-live)

---

## Go-Live Checklist

- [ ] Hostinger VPS provisioned (KVM2 minimum), PostgreSQL 15 installed
- [ ] DB migrations run successfully
- [ ] Backend deployed, `/iclock/getrequest` responding with `"OK"`
- [ ] `/iclock/cdata` tested with simulated ZKTeco payload
- [ ] All employees entered/migrated with `device_enrollment_id` set
- [ ] All devices registered in `biometric_devices` table
- [ ] PIN → user_id mappings created for all employees in `biometric_employee_map`
- [ ] Test: replay sample transaction data against `/iclock/cdata`, verify attendance rows created
- [ ] Obtain current ADMS server URL from client (IP:port currently on devices)
- [ ] New server URL sent to client IT: `http://yourdomain.com/iclock`
- [ ] Client IT updates ADMS URL on all online devices
- [ ] Confirm live punches arriving in `biometric_raw_logs`
- [ ] Confirm attendance records being created with `source = 'biometric'`
- [ ] One-week parallel run: compare HRMS records vs old system daily report
- [ ] Client sign-off → decommission old system

---

## Build Priority Order

| Week | Deliverable | Why |
|---|---|---|
| 1 | DB migration SQL (all tables + columns) | Nothing can be tested without schema |
| 1 | Branches entity (backend + frontend page) | Foreign key dependency for everything |
| 1 | `device_enrollment_id` + basic employee fields | Critical for biometric mapping |
| 1 | ADMS receiver (`POST /iclock/cdata` + heartbeat) | Core value — punches must flow |
| 2 | Biometric management pages (Devices, PIN Mapping, Logs) | HR needs these to configure system |
| 2 | Employee Personal tab + Administration tab extensions | Core HRMS completeness |
| 3 | Monthly Attendance Register (backend + frontend) | Primary daily-use screen |
| 3 | Contact tab split, Bank tab dual accounts, Documents fixed types | Profile completeness |
| 4 | Qualification + Experience tabs | Extended profile |
| 4 | Data migration script | One-time, do after features are stable |
| 5+ | TDS Setup, TDS Declaration | Post go-live |
| Later | Nominee, Insurance, Transportation, Health Record | Deferred |

---

## Technical Gotchas — Never Forget These

| Gotcha | Detail |
|---|---|
| `express.urlencoded()` is missing | ZKTeco sends form-encoded data, not JSON. `req.body` will be empty without this middleware added to `server.js` |
| ADMS path is `/iclock/cdata` | ZKTeco firmware hardcodes this path. Cannot be changed. Do not use `/api/biometric/push` |
| Heartbeat must return text "OK" | `GET /iclock/getrequest` must respond `200 OK` with `Content-Type: text/plain` body `"OK"`. Wrong response = device marks server offline |
| 2-second device timeout | Always `res.send()` before any DB await. Use `setImmediate()` for async processing |
| Idempotency is mandatory | ZKTeco retries on network error. UNIQUE constraint on `(device_serial, punch_time, employee_pin)` prevents duplicate attendance records |
| Leave guard | Before creating attendance from biometric punch, check if existing attendance row has `status IN ('on_leave', 'half_day', 'wfh')`. If yes, skip — never overwrite approved leave |
| 3-column attendance conflict | `onConflict: 'user_id,date,organization_id'` — existing admin-edit endpoint uses only 2 columns which is a known bug |
| `biometric_raw_logs` is append-only | Never `DELETE` from this table. Never `UPDATE` any row except setting `processed = true` |
| Feature flags before rendering | All new pages must be wrapped in `FeatureRoute` checking the relevant flag. Biometric pages → `featureKey: 'biometric'`, Branches → `featureKey: 'branches'` |
| `device_enrollment_id` must be unique per org | Add `UNIQUE(organization_id, device_enrollment_id)` partial index. Surface a clear 409 error in the API if duplicate detected |

---

## Open Questions (Resolve Before Starting)

1. **Hostinger VPS plan** — Need VPS (not shared hosting) to run Node.js + PostgreSQL. Shared hosting cPanel only has MySQL. Minimum: KVM2 (4GB RAM, 2 cores).
2. **New isolated PostgreSQL or stay on Supabase during development?** — Since no client data exists, we can keep building on current Supabase and `pg_dump` to Hostinger VPS when ready. Or start fresh on VPS now.
3. **Feature flag scope** — Do all future clients get biometric/branches/statutory features (behind flags), or is this enterprise-tier only?
4. **ZKTeco device ADMS URL** — For any real client using this: need the current IP:port configured on their devices before go-live.
5. **Employee PIN source** — Does the old system's employee number = the ZKTeco PIN? (Usually yes, but must confirm with each client.)
