# Relitrade — Build Plan
# Step-by-step what to build, in what order, and exactly what each step contains

Last updated: 2026-07-09

---

## Overview

**Codebase:** Same as main platform (feature-flagged)  
**Database:** Our AWS RDS (PostgreSQL) — dedicated instance for Relitrade  
**Deployment:** Separate server instance, separate domain  
**Client's old data:** In Microsoft SQL Server (InSypay) — needs one-time migration

### Why AWS RDS Instead of Supabase
Our codebase currently uses `@supabase/supabase-js` client. AWS RDS is raw PostgreSQL accessed via the `pg` npm package. To bridge this gap without rewriting 3000+ lines of queries, we build a **DB adapter** that mimics the Supabase client API but runs on `pg` underneath. One environment variable (`DB_TYPE`) switches between Supabase (main platform) and PostgreSQL/AWS RDS (Relitrade).

---

## Full Sequence at a Glance

```
Phase 0 → AWS RDS Setup         (infrastructure, no code)
Phase 1 → DB Adapter            (code — biggest technical piece)
Phase 2 → SQL Server Migration  (client's old data → our schema)
Phase 3 → Deployment Setup      (new server instance, domain, env vars)
Phase 4 → DB Migration          (run schema SQL on AWS RDS)
Phase 5 → Backend Changes       (biometric routes, branches, employee fields)
Phase 6 → Frontend Changes      (new pages, sidebar, employee profile tabs)
Phase 7 → Dummy Data            (test without waiting for client)
Phase 8 → Go Live               (redirect devices, parallel run)
```

---

## PHASE 0 — AWS RDS Setup (One-Time Infrastructure)

Do this before any code.

### 0A — Create RDS Instance on Our AWS

- [ ] Log into AWS Console → RDS → Create Database
- [ ] Engine: **PostgreSQL 15** (same version as Supabase uses)
- [ ] Instance class: `db.t3.medium` (sufficient for ~300 employees + biometric data)
- [ ] Storage: 50 GB GP2 SSD, enable auto-scaling up to 200 GB
- [ ] DB name: `relitrade_hrms`
- [ ] Master username: `relitrade_admin`
- [ ] Master password: (generate strong password, store in AWS Secrets Manager)
- [ ] VPC: Same VPC as our backend server (or allow backend server IP in security group)
- [ ] Public access: **No** (only our server can connect — never expose RDS publicly)
- [ ] Automated backups: Enable, retention 7 days
- [ ] Multi-AZ: Optional (enable for production reliability)

### 0B — Security Group Rules

| Type | Port | Source | Purpose |
|---|---|---|---|
| PostgreSQL | 5432 | Our backend server IP only | App connection |
| PostgreSQL | 5432 | Your office IP (for migrations) | One-time data import |

**Never open port 5432 to 0.0.0.0/0**

### 0C — Get Connection String

After RDS is created, note down:
```
DATABASE_URL=postgresql://relitrade_admin:<password>@<rds-endpoint>:5432/relitrade_hrms
```

---

## PHASE 1 — DB Adapter (Most Important Code Change)

This is what allows the same codebase to work with both Supabase (main platform) and AWS RDS (Relitrade).

### 1A — Install `pg` Package

```bash
npm install pg
```

### 1B — How It Works

Our current `db.js` exports a Supabase client. Every route uses it like:
```js
const supabase = require('../db');
const { data, error } = await supabase.from('users').select('*').eq('organization_id', 1);
```

The adapter wraps `pg` to return the exact same `{ data, error }` shape and support the same chaining pattern. The rest of the codebase changes nothing.

```
DB_TYPE=supabase  →  db.js exports Supabase client  →  main platform works unchanged
DB_TYPE=postgres  →  db.js exports pg adapter        →  Relitrade deployment uses AWS RDS
```

### 1C — Create `db-pg-adapter.js`

New file: `db-pg-adapter.js`

```js
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Query builder that mimics Supabase JS client chaining API
function from(table) {
  const state = {
    table,
    type: null,         // select | insert | update | delete | upsert
    selectCols: '*',
    filters: [],        // { col, op, val }
    insertData: null,
    updateData: null,
    orderBy: null,
    orderAsc: true,
    limitVal: null,
    singleRow: false,
    upsertConflict: null,
    rangeFrom: null,
    rangeTo: null,
    values: [],         // pg parameterized values
  };

  const builder = {
    select(cols = '*') {
      state.type = 'select';
      state.selectCols = cols;
      return builder;
    },
    insert(data) {
      state.type = 'insert';
      state.insertData = Array.isArray(data) ? data : [data];
      return builder;
    },
    update(data) {
      state.type = 'update';
      state.updateData = data;
      return builder;
    },
    delete() {
      state.type = 'delete';
      return builder;
    },
    upsert(data, options = {}) {
      state.type = 'upsert';
      state.insertData = Array.isArray(data) ? data : [data];
      state.upsertConflict = options.onConflict || null;
      return builder;
    },
    eq(col, val)    { state.filters.push({ col, op: '=',    val }); return builder; },
    neq(col, val)   { state.filters.push({ col, op: '!=',   val }); return builder; },
    gt(col, val)    { state.filters.push({ col, op: '>',    val }); return builder; },
    gte(col, val)   { state.filters.push({ col, op: '>=',   val }); return builder; },
    lt(col, val)    { state.filters.push({ col, op: '<',    val }); return builder; },
    lte(col, val)   { state.filters.push({ col, op: '<=',   val }); return builder; },
    like(col, val)  { state.filters.push({ col, op: 'LIKE', val }); return builder; },
    ilike(col, val) { state.filters.push({ col, op: 'ILIKE',val }); return builder; },
    is(col, val)    { state.filters.push({ col, op: 'IS',   val }); return builder; },
    in(col, vals)   { state.filters.push({ col, op: 'IN',   val: vals }); return builder; },
    not(col, op, val) { state.filters.push({ col, op: `NOT_${op}`, val }); return builder; },
    order(col, { ascending = true } = {}) {
      state.orderBy = col;
      state.orderAsc = ascending;
      return builder;
    },
    limit(n)  { state.limitVal = n; return builder; },
    range(from, to) { state.rangeFrom = from; state.rangeTo = to; return builder; },
    single()  { state.singleRow = true; return builder; },

    // Execute — returns { data, error }
    then(resolve, reject) {
      return execute(state, pool).then(resolve, reject);
    }
  };

  return builder;
}

async function execute(state, pool) {
  try {
    let sql = '';
    const values = [];

    if (state.type === 'select') {
      sql = `SELECT ${state.selectCols} FROM ${state.table}`;
      sql += buildWhere(state.filters, values);
      if (state.orderBy) sql += ` ORDER BY ${state.orderBy} ${state.orderAsc ? 'ASC' : 'DESC'}`;
      if (state.limitVal) sql += ` LIMIT ${state.limitVal}`;
      if (state.rangeFrom !== null) sql += ` OFFSET ${state.rangeFrom} LIMIT ${state.rangeTo - state.rangeFrom + 1}`;
    }

    else if (state.type === 'insert' || state.type === 'upsert') {
      const rows = state.insertData;
      const cols = Object.keys(rows[0]);
      const placeholders = rows.map((_, ri) =>
        `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
      ).join(', ');
      rows.forEach(row => cols.forEach(col => values.push(row[col])));
      sql = `INSERT INTO ${state.table} (${cols.join(', ')}) VALUES ${placeholders}`;
      if (state.type === 'upsert' && state.upsertConflict) {
        const updateCols = cols.filter(c => !state.upsertConflict.split(',').map(s => s.trim()).includes(c));
        sql += ` ON CONFLICT (${state.upsertConflict}) DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`;
      }
      sql += ' RETURNING *';
    }

    else if (state.type === 'update') {
      const cols = Object.keys(state.updateData);
      const setClauses = cols.map((col, i) => { values.push(state.updateData[col]); return `${col} = $${i + 1}`; });
      sql = `UPDATE ${state.table} SET ${setClauses.join(', ')}`;
      sql += buildWhere(state.filters, values, cols.length);
      sql += ' RETURNING *';
    }

    else if (state.type === 'delete') {
      sql = `DELETE FROM ${state.table}`;
      sql += buildWhere(state.filters, values);
      sql += ' RETURNING *';
    }

    const result = await pool.query(sql, values);
    const data = state.singleRow ? (result.rows[0] || null) : result.rows;
    return { data, error: null };

  } catch (err) {
    console.error('[DB Adapter Error]', err.message);
    return { data: null, error: err };
  }
}

function buildWhere(filters, values, offset = 0) {
  if (!filters.length) return '';
  const clauses = filters.map(f => {
    if (f.op === 'IN') {
      const placeholders = f.val.map((_, i) => `$${values.length + i + 1 + offset}`).join(', ');
      f.val.forEach(v => values.push(v));
      return `${f.col} IN (${placeholders})`;
    }
    if (f.op === 'IS') return `${f.col} IS ${f.val === null ? 'NULL' : `$${values.push(f.val) + offset}`}`;
    values.push(f.val);
    return `${f.col} ${f.op} $${values.length + offset}`;
  });
  return ` WHERE ${clauses.join(' AND ')}`;
}

module.exports = { from, pool };
```

### 1D — Update `db.js` to Switch Based on `DB_TYPE`

```js
// db.js — updated
if (process.env.DB_TYPE === 'postgres') {
  // AWS RDS via pg adapter (Relitrade deployment)
  module.exports = require('./db-pg-adapter');
} else {
  // Supabase (main platform — default)
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  module.exports = supabase;
}
```

### 1E — How Routes Use It (No Changes Needed)

```js
// routes/departments.js — unchanged, works with both
const db = require('../db');

router.get('/', auth, async (req, res) => {
  const { data, error } = await db.from('departments')
    .select('*')
    .eq('organization_id', req.user.organization_id);
  // ...
});
```

### 1F — Test the Adapter Locally

Set `DB_TYPE=postgres` and `DATABASE_URL` in local `.env` pointing to a test PostgreSQL instance. Run the existing test flows — if the adapter is correct, all existing routes work unchanged.

---

## PHASE 2 — SQL Server Migration (Client's Old Data)

Client's current data lives in **Microsoft SQL Server** (InSypay's database). This is a one-time historical data import.

### 2A — What Data to Migrate

| InSypay Table | Our Table | Priority |
|---|---|---|
| Employee Master | `users` | HIGH — needed before go-live |
| Attendance records | `attendance` | HIGH — historical data |
| Leave records | `leaves` | HIGH |
| Departments | `departments` | HIGH |
| Branches | `branches` (new) | HIGH |
| Salary/Pay structures | `payroll_structures` | Medium |
| Documents | `employee_documents` | Low — can do post go-live |
| Assets | `assets` | Low |

### 2B — How to Get the Data Out of SQL Server

Ask the client for one of these:
- Option A: Direct read access to their SQL Server (connect via SQL Server Management Studio or `mssql` npm package)
- Option B: CSV exports of each table from InSypay's reporting module

Option B is easier and safer. Ask client:
```
Please export the following from InSypay as Excel/CSV:
1. Employee Master (all employees, all columns)
2. Attendance records (last 1 year)
3. Leave records (last 1 year)
4. Department list
5. Branch list
```

### 2C — Column Mapping (InSypay SQL Server → Our PostgreSQL)

**Employees:**
| InSypay Column | Our Column | Notes |
|---|---|---|
| EmpNo | `employee_id` | Also set as `device_enrollment_id` |
| FirstName + MiddleName + Surname | `name` | Concatenate |
| Salutation | `salutation` | |
| DeptName | `department` | Also resolve to `department_id` |
| Branch | `branch_id` | Resolve from branches table |
| JoinDate | `date_of_joining` | Convert DD/MM/YYYY → YYYY-MM-DD |
| Status | `employment_status` | Active/Resigned → active/resigned |
| Designation | `designation_id` | Resolve from designations table |
| Grade | `grade` | |
| EmployeeType | `employment_type` | Full Time/Part Time |
| MobileNo | `phone` | |
| DOB | `date_of_birth` | Convert date format |
| PFNo | `pf_no` | |
| UANNo | `uan_no` | |
| AadharNo | `aadhar_no` | |
| PANNo | `pan_number` | |
| BankAccNo | `bank_account` | |
| IFSCCode | `bank_ifsc` | |

**Attendance:**
| InSypay Column | Our Column | Notes |
|---|---|---|
| EmpNo | `user_id` | Resolve via employee_id |
| Date | `date` | Convert to YYYY-MM-DD |
| InTime | `check_in` | Convert to HH:MM |
| OutTime | `check_out` | Convert to HH:MM |
| TotalHours | `work_hours` | |
| Status | `status` | P=present, CL=on_leave, WO=week_off |
| Source | `source` | Set all historical as 'biometric' |

### 2D — Migration Script Approach

Create `migrations/sql_server_import.js`:
```
1. Read CSV exports (or connect to SQL Server via mssql package)
2. For each employee:
   a. Create user account with hashed temp password
   b. Set device_enrollment_id = EmpNo
   c. Create biometric_employee_map entry
3. For each attendance record:
   a. Resolve user_id from employee_id
   b. Insert into attendance with source='biometric'
4. For each leave record:
   a. Resolve user_id
   b. Insert into leaves table
```

### 2E — Date Range for Historical Migration

Decide with client:
- [ ] Last 3 months only (recommended for fast go-live)
- [ ] Last 1 year
- [ ] Full history (slow, complex — avoid for initial go-live)

---

## PHASE 3 — Deployment Setup

### 3A — New Server Instance

- [ ] Create new Fly.io app: `fly launch` from same repo → app name: `relitrade-hr`
- [ ] OR create new EC2 instance on our AWS and deploy there (keeps everything on our AWS)

### 3B — Environment Variables for Relitrade Deployment

```env
# Database — AWS RDS (NOT Supabase)
DB_TYPE=postgres
DATABASE_URL=postgresql://relitrade_admin:<pass>@<rds-endpoint>:5432/relitrade_hrms

# JWT
JWT_SECRET=<generate-new-secret-for-relitrade>

# Cloudinary (same or separate account)
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Email (their SMTP or our SMTP)
SMTP_HOST=...
SMTP_USER=...
SMTP_PASS=...

# No SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY needed
```

### 3C — Domain Setup
- [ ] Point `relitrade.yourdomain.com` → new server
- [ ] SSL certificate (Fly.io handles this automatically, or use ACM on EC2)
- [ ] This is the URL you'll give to ZKTeco devices as the ADMS server

---

## PHASE 4 — DB Migration (Run on AWS RDS)

Connect to AWS RDS and run in this order:

```bash
# Connect to RDS
psql postgresql://relitrade_admin:<pass>@<rds-endpoint>:5432/relitrade_hrms

# Run in order:
\i migrations/full_schema.sql          -- all standard tables
\i migrations/relitrade_migration.sql  -- biometric + extended fields (see below)
```

### `migrations/relitrade_migration.sql` (Create This File)

```sql
-- ============================================================
-- RELITRADE-SPECIFIC MIGRATION
-- Run on AWS RDS after full_schema.sql
-- ============================================================

-- 1. BRANCHES
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

-- 2. BIOMETRIC DEVICES
CREATE TABLE IF NOT EXISTS biometric_devices (
  id            BIGSERIAL PRIMARY KEY,
  org_id        BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  serial_number TEXT UNIQUE NOT NULL,
  device_name   TEXT,
  location      TEXT,
  area_code     INT,
  device_ip     TEXT,
  last_seen     TIMESTAMPTZ,
  status        TEXT DEFAULT 'offline' CHECK (status IN ('online','offline')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON biometric_devices(org_id);

-- 3. RAW PUNCH LOG (append-only — never delete, never update)
CREATE TABLE IF NOT EXISTS biometric_raw_logs (
  id            BIGSERIAL PRIMARY KEY,
  org_id        BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  device_serial TEXT NOT NULL,
  employee_pin  TEXT NOT NULL,
  punch_time    TIMESTAMPTZ NOT NULL,
  punch_type    SMALLINT,
  verify_type   SMALLINT,
  area          TEXT,
  raw_payload   JSONB,
  processed     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (device_serial, punch_time, employee_pin)
);
CREATE INDEX ON biometric_raw_logs(org_id, punch_time DESC);
CREATE INDEX ON biometric_raw_logs(org_id, processed) WHERE processed = FALSE;

-- 4. EMPLOYEE PIN → HRMS USER MAPPING
CREATE TABLE IF NOT EXISTS biometric_employee_map (
  id            BIGSERIAL PRIMARY KEY,
  org_id        BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_pin  TEXT NOT NULL,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, employee_pin)
);
CREATE INDEX ON biometric_employee_map(org_id);

-- 5. ATTENDANCE — new columns
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'
    CHECK (source IN ('manual','biometric','clockify')),
  ADD COLUMN IF NOT EXISTS ot_hours NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_minutes INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_exit_minutes INT DEFAULT 0;

-- 6. USERS — extended profile fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS salutation TEXT,
  ADD COLUMN IF NOT EXISTS middle_name TEXT,
  ADD COLUMN IF NOT EXISTS surname TEXT,
  ADD COLUMN IF NOT EXISTS branch_id BIGINT REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS division TEXT,
  ADD COLUMN IF NOT EXISTS sub_division TEXT,
  ADD COLUMN IF NOT EXISTS grade TEXT,
  ADD COLUMN IF NOT EXISTS pay_cadre TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS probation_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS probation_months INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hod_id BIGINT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS device_enrollment_id TEXT,
  ADD COLUMN IF NOT EXISTS special_allowance NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aadhar_no TEXT,
  ADD COLUMN IF NOT EXISTS pan_number TEXT,
  ADD COLUMN IF NOT EXISTS pan_name TEXT,
  ADD COLUMN IF NOT EXISTS voter_id TEXT,
  ADD COLUMN IF NOT EXISTS uan_no TEXT,
  ADD COLUMN IF NOT EXISTS old_employee_id TEXT,
  ADD COLUMN IF NOT EXISTS weekly_off_day TEXT;

-- 7. USERS — statutory fields (PF / ESI / PT / OT)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pt_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS esi_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS esi_no TEXT,
  ADD COLUMN IF NOT EXISTS esi_dispensary TEXT,
  ADD COLUMN IF NOT EXISTS lwf_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pf_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pf_no TEXT,
  ADD COLUMN IF NOT EXISTS vpf_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS vpf_percentage NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pran TEXT,
  ADD COLUMN IF NOT EXISTS uan_no_pf TEXT,
  ADD COLUMN IF NOT EXISTS max_pf_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ot_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ot_rate NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ot_paid_with_salary BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS gratuity_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS salary_structure TEXT DEFAULT 'GROSS',
  ADD COLUMN IF NOT EXISTS salary_on TEXT DEFAULT 'Month',
  ADD COLUMN IF NOT EXISTS work_hours_per_day NUMERIC DEFAULT 8,
  ADD COLUMN IF NOT EXISTS per_hour_rate NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_day_wages NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS salary_slip_format TEXT DEFAULT 'Format1',
  ADD COLUMN IF NOT EXISTS max_weekoff_in_month INT DEFAULT 8;

-- 8. SEED: Feature flags for Relitrade org
-- Run after org is created via platform admin (replace 1 with actual org_id)
INSERT INTO organization_features (organization_id, feature_key, enabled) VALUES
  (1, 'biometric', true),
  (1, 'branches',  true),
  (1, 'statutory', true)
ON CONFLICT (organization_id, feature_key) DO UPDATE SET enabled = true;

-- 9. SEED: 7 known ZKTeco devices
-- Replace org_id 1 with actual after org setup
INSERT INTO biometric_devices (org_id, serial_number, device_name, location, area_code, device_ip, status) VALUES
  (1, 'BYEL184460001', 'Main Area',     'Main Area',     2,  '192.168.10.20',  'online'),
  (1, 'BYEL194660080', 'Dalal',         'Dalal',         6,  '192.168.0.250',  'online'),
  (1, 'CK5T222360083', 'Third Floor',   'Third-Floor',   4,  '192.168.10.205', 'online'),
  (1, 'JJA1241000273', 'CG Road',       'CG Road',       7,  '192.168.1.2',    'online'),
  (1, 'JJA1241900816', 'Bapunagar',     'Bapunagaar',    9,  '192.168.1.202',  'online'),
  (1, 'BHXZ193560692', 'InsuranceBhuj', 'InsuranceBhuj', 25, '192.168.0.45',   'offline'),
  (1, 'JJA1241900721', 'Bhuj',          'Bhuj',          8,  '192.168.1.2',    'offline')
ON CONFLICT (serial_number) DO NOTHING;
```

---

## PHASE 5 — Backend Changes (main codebase)

### 5A — `server.js` Changes

After `app.use(express.json())`, add:
```js
app.use(express.urlencoded({ extended: false })); // ZKTeco ADMS sends form-encoded
```

In `FEATURE_ROUTE_MAP`:
```js
'/biometric': 'biometric',
'/branches':  'branches',
```

In `ALL_FEATURE_KEYS`:
```js
'biometric', 'branches', 'statutory',
```

Mount new routers (before `app.get('*')`):
```js
const biometricRouter = require('./routes/biometric');
const branchesRouter  = require('./routes/branches');
app.use('/api/biometric', auth, biometricRouter);
app.use('/api/branches',  auth, branchesRouter);

// ADMS endpoints — no JWT auth (ZKTeco device cannot send JWT)
app.post('/iclock/cdata',     require('./handlers/biometricPush'));
app.get('/iclock/getrequest', require('./handlers/biometricHeartbeat'));
```

### 5B — Create `routes/biometric.js`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/biometric/devices` | List devices + online/offline status |
| POST | `/api/biometric/devices` | Register new device |
| PUT | `/api/biometric/devices/:id` | Update device |
| GET | `/api/biometric/logs` | Punch logs with filters |
| GET | `/api/biometric/employee-map` | List PIN → employee mappings |
| POST | `/api/biometric/employee-map` | Create mapping |
| DELETE | `/api/biometric/employee-map/:id` | Remove mapping |
| POST | `/api/biometric/reprocess` | Reprocess unmatched logs |

### 5C — Create `routes/branches.js`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/branches` | List branches |
| POST | `/api/branches` | Create branch |
| PUT | `/api/branches/:id` | Update branch |
| DELETE | `/api/branches/:id` | Delete (only if no employees assigned) |

### 5D — Create `handlers/biometricPush.js`

```
POST /iclock/cdata — Processing Logic:

1.  Parse URL-encoded body → extract SN, employee_pin, punch_time, punch_type
2.  Respond 200 OK immediately (NEVER wait for DB — device has 2s timeout)
3.  [Async] Find device by SN in biometric_devices
4.  [Async] Update device last_seen + status = 'online'
5.  [Async] Upsert into biometric_raw_logs
        UNIQUE(device_serial, punch_time, employee_pin) → idempotent on retry
6.  [Async] Lookup biometric_employee_map for employee_pin
        → No match: log processed=false, done
        → Match: continue with user_id
7.  [Async] Check attendance for user_id + date
        → status IN ('on_leave','half_day','wfh'): SKIP (leave guard)
8.  [Async] punch_type=0 (Check-In): INSERT attendance if no check_in exists
            punch_type=1 (Check-Out): UPDATE check_out + calculate work_hours
            source = 'biometric' on all records
9.  [Async] Mark biometric_raw_logs.processed = true
```

### 5E — Create `handlers/biometricHeartbeat.js`

```
GET /iclock/getrequest — ZKTeco device ping:

1. Extract SN from query params (?SN=BYEL184460001)
2. Update biometric_devices: last_seen = NOW(), status = 'online'
3. Respond: HTTP 200, Content-Type: text/plain, body: "OK"
   (ZKTeco marks server offline if response is anything else)
```

### 5F — Employee Routes — New Fields

Add to employee create/update in `server.js` or separate employee route:
- `device_enrollment_id`, `branch_id`, `grade`, `division`, `sub_division`
- `salutation`, `middle_name`, `surname`, `location`, `pay_cadre`
- `probation_applicable`, `probation_months`, `weekly_off_day`
- `uan_no`, `aadhar_no`, `pan_number`

New endpoint for statutory fields (separate tab, separate save):
```
PUT /api/employees/:id/statutory
Body: { pt_applicable, esi_applicable, esi_no, pf_applicable, pf_no,
        ot_applicable, ot_rate, ot_paid_with_salary, gratuity_applicable, ... }
```

---

## PHASE 6 — Frontend Changes (main codebase)

### 6A — New Pages

| File | Route | Purpose |
|---|---|---|
| `pages/BiometricDevices.jsx` | `/biometric/devices` | Device list, online/offline badge, last seen |
| `pages/BiometricPinMapping.jsx` | `/biometric/mapping` | PIN ↔ employee table, assign/edit |
| `pages/BiometricLogs.jsx` | `/biometric/logs` | Raw punch log with date/device/employee filters |
| `pages/Branches.jsx` | `/branches` | Branch CRUD |
| `pages/AttendanceRegister.jsx` | `/attendance/register` | Monthly grid: Date/Shift/CheckIn/CheckOut/Late/OT per day |

### 6B — Existing Files to Update

| File | Change |
|---|---|
| `App.jsx` | Add 5 new routes wrapped in `<FeatureRoute featureKey="...">` |
| `Sidebar.jsx` | Add Biometric section + Branches + Attendance Register nav items |
| `pages/Employees.jsx` | Add Branch + Grade + Division filters to employee list |
| Employee form/modal | Add new profile fields (device_enrollment_id, branch, grade, etc.) |
| Employee profile tabs | Add Administration tab (statutory), upgrade Bank tab (dual accounts), fix Documents tab (fixed type list), add Qualification + Experience tabs |
| Attendance cards | Add fingerprint icon badge when `source === 'biometric'` |

### 6C — Sidebar (`Sidebar.jsx`)

```js
// Biometric section — featureKey gates it to Relitrade only
{ label: 'Biometric Devices', to: '/biometric/devices', Icon: Fingerprint, adminOnly: true, featureKey: 'biometric' },
{ label: 'PIN Mapping',       to: '/biometric/mapping', Icon: Link2,       adminOnly: true, featureKey: 'biometric' },
{ label: 'Punch Logs',        to: '/biometric/logs',    Icon: ScrollText,  adminOnly: true, featureKey: 'biometric' },

// Branches — featureKey gates it
{ label: 'Branches', to: '/branches', Icon: Building2, adminOnly: true, featureKey: 'branches' },

// Attendance Register — universal (any org with attendance)
{ label: 'Attendance Register', to: '/attendance/register', Icon: CalendarDays, adminOnly: true },
```

---

## PHASE 7 — Dummy Data (Start Testing Without Client Export)

All 29 known employee PINs from client's transaction data. When real export arrives, update names only.

| PIN | Name | Email |
|---|---|---|
| 431 | Employee 431 | emp431@relitrade.test |
| 432 | Employee 432 | emp432@relitrade.test |
| 441 | Employee 441 | emp441@relitrade.test |
| 443 | Aakash | aakash@relitrade.test |
| 448 | Employee 448 | emp448@relitrade.test |
| 480 | Employee 480 | emp480@relitrade.test |
| 523 | Employee 523 | emp523@relitrade.test |
| 554 | Employee 554 | emp554@relitrade.test |
| 587 | Vishalvaghela | vishal@relitrade.test |
| 628 | Employee 628 | emp628@relitrade.test |
| 635 | Employee 635 | emp635@relitrade.test |
| 638 | Employee 638 | emp638@relitrade.test |
| 642 | Employee 642 | emp642@relitrade.test |
| 653 | Employee 653 | emp653@relitrade.test |
| 670 | Employee 670 | emp670@relitrade.test |
| 683 | Employee 683 | emp683@relitrade.test |
| 689 | Employee 689 | emp689@relitrade.test |
| 690 | Employee 690 | emp690@relitrade.test |
| 692 | Employee 692 | emp692@relitrade.test |
| 693 | Employee 693 | emp693@relitrade.test |
| 694 | Employee 694 | emp694@relitrade.test |
| 698 | Employee 698 | emp698@relitrade.test |
| 801 | Employee 801 | emp801@relitrade.test |
| 802 | Employee 802 | emp802@relitrade.test |
| 803 | Employee 803 | emp803@relitrade.test |
| 804 | Employee 804 | emp804@relitrade.test |
| 805 | Employee 805 | emp805@relitrade.test |
| 806 | Employee 806 | emp806@relitrade.test |
| 10000001 | Test User | test@relitrade.test |

`device_enrollment_id` = PIN for every row.  
Also create `biometric_employee_map` entries for each: `employee_pin = PIN`, `user_id = newly created user id`.

---

## PHASE 8 — Go Live Checklist

- [ ] Phase 0–7 complete
- [ ] DB adapter tested — all existing routes work against AWS RDS
- [ ] All 29 dummy employees + PIN mappings created
- [ ] Test by replaying client's real transaction data against `/iclock/cdata`
- [ ] Verify attendance records appear correctly in HRMS dashboard
- [ ] Receive real employee export from client → update employee names in DB
- [ ] Complete SQL Server historical data migration (last 3 months minimum)
- [ ] Final server URL confirmed: `http://relitrade.yourdomain.com`
- [ ] Send ADMS URL to client: `http://relitrade.yourdomain.com/iclock`
- [ ] Client's IT updates ADMS server URL on all 5 online devices
- [ ] Confirm live punches arriving at `/iclock/cdata` (watch biometric_raw_logs)
- [ ] Confirm attendance records being created from live punches
- [ ] Parallel run for 1 week: compare our HRMS attendance vs ZKTeco WDMS daily
- [ ] Client signs off → decommission old WDMS as attendance source

---

## Key Technical Rules (Never Break These)

| Rule | Reason |
|---|---|
| Always respond to `/iclock/cdata` within 2 seconds | ZKTeco device timeout — device retries if no response |
| Never delete from `biometric_raw_logs` | Audit trail — always append only |
| UNIQUE on `(device_serial, punch_time, employee_pin)` | ZKTeco retries — must be idempotent |
| Leave guard: skip if `on_leave/half_day/wfh` | Don't overwrite approved leave records |
| `onConflict: 'user_id,date,organization_id'` | Use 3-column conflict, not 2-column |
| `DB_TYPE=postgres` on Relitrade deployment only | Never set this on main platform |
| RDS port 5432 never open to 0.0.0.0/0 | Security — only our server IP allowed |

---

## All Files Created for This Project

| File | Purpose |
|---|---|
| `biometric-client-requirements.md` | Original requirements + client questions |
| `biometric-implementation-kickoff.md` | What to build now vs what to wait for |
| `biometric-implementation-plan.md` | Architecture + DB SQL + endpoints |
| `biometric-pending-from-client.md` | Pending asks + message template |
| `client-feature-gap-analysis.md` | InSypay vs our system comparison |
| `relitrade-master-summary.md` | Complete project reference |
| `relitrade-build-plan.md` | **This file — full step-by-step build sequence** |
| `migrations/relitrade_migration.sql` | To be created — DB migration for AWS RDS |
| `db-pg-adapter.js` | To be created — pg adapter mimicking Supabase client |
| `handlers/biometricPush.js` | To be created — ADMS push receiver |
| `handlers/biometricHeartbeat.js` | To be created — ZKTeco heartbeat handler |
| `routes/biometric.js` | To be created — biometric management API |
| `routes/branches.js` | To be created — branches API |
