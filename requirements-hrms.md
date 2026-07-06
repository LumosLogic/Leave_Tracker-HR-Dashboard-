 Understanding the Requirement

  ZKTeco easy WDMS uses the PUSH SDK model — meaning the biometric device itself pushes attendance punch data to a     
  configured server URL in real time whenever an employee scans. So we don't pull from the device; the device calls us.

  What the device sends per punch:
  - Device serial number
  - Employee PIN (their enrollment number on the device)
  - Timestamp
  - Punch type: 0 = Check-in, 1 = Check-out, 4 = OT-in, 5 = OT-out
  - Verify type: 1 = Fingerprint, 2 = Face, 4 = Card

  ---
  Architecture Plan

  ZKTeco Device
       │
       │  HTTP POST (PUSH SDK protocol)
       ▼
  Our Backend API  ──────────────────────────────────────────────
    /biometric/push                                              │
       │                                                         │
       ├─ 1. Log raw punch to biometric_raw_logs                │
       ├─ 2. Look up employee: ZK PIN → our user_id             │
       ├─ 3. Create/update attendance record                     │
       └─ 4. Determine check-in vs check-out                    │
                                                                │
                                                AWS RDS PostgreSQL
                                                (this client's DB)

  ---
  AWS — What to Use

  Amazon RDS for PostgreSQL — straightforward choice because:
  - Our current schema is PostgreSQL (Supabase), so migration is zero-effort
  - Same SQL queries work without code changes
  - RDS is production-grade, has backups, Multi-AZ failover
  - Cheaper than running a full Supabase instance per client

  ---
  New Tables Needed (on the AWS DB)

  ┌────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────┐    
  │         Table          │                                       Purpose                                        │    
  ├────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤    
  │ biometric_devices      │ Register each ZKTeco machine (serial, name, location, org_id, last_seen, status)     │    
  ├────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤    
  │ biometric_raw_logs     │ Append-only log of every raw push from the device — never delete, never modify       │    
  ├────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────┤    
  │ biometric_employee_map │ Map ZKTeco employee PIN → HRMS user_id (because ZK uses their own enrolment numbers) │    
  └────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────┘    

  All existing tables (users, attendance, leaves, etc.) are the same — just hosted on RDS instead of Supabase.

  The attendance table gets one new column: source = 'manual' / 'biometric' / 'clockify' so you can always see how a   
  record was created.

  ---
  Multi-Database Strategy (Backend)

  Since you already have multiple orgs on Supabase, we add a simple database router:

  - Each org gets a database_type field: 'supabase' or 'aws_rds'
  - If aws_rds, the backend uses an RDS connection pool instead of Supabase client
  - All existing route logic stays the same — only the DB connection changes per request

  This means no separate backend deployment. One codebase, two DB targets.

  ---
  New Backend Endpoints Needed

  ┌────────────────────────────────────┬──────────────────────────────────────────────────────────────────┐
  │              Endpoint              │                           What it does                           │
  ├────────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
  │ POST /biometric/push               │ Receives punches from ZKTeco device (the main integration point) │
  ├────────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
  │ GET /biometric/devices             │ List registered devices + last-seen status                       │
  ├────────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
  │ POST /biometric/devices            │ Register a new device by serial number                           │
  ├────────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
  │ GET /biometric/logs                │ View raw punch logs with filters                                 │
  ├────────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
  │ POST /biometric/employee-map       │ Map a ZKTeco PIN to an HRMS employee                             │
  ├────────────────────────────────────┼──────────────────────────────────────────────────────────────────┤
  │ DELETE /biometric/employee-map/:id │ Remove a mapping                                                 │
  └────────────────────────────────────┴──────────────────────────────────────────────────────────────────┘

  ---
  New Frontend Pages Needed

  1. Biometric Devices page (HR/Admin sidebar)
    - List of registered devices with online/offline status (based on last_seen timestamp)
    - Button to register a new device
    - Per-device: view raw punch logs
  2. Employee PIN Mapping page
    - Table: Employee name ↔ ZKTeco PIN
    - Admin can assign/edit PINs — employees may have different numbers on the device vs HRMS
  3. Attendance source indicator
    - On existing attendance cards/calendar, show a small fingerprint icon if record came from biometric

  ---
  Step-by-Step Rollout Plan

  1. Set up AWS RDS instance — provision PostgreSQL, run the existing schema migration, add the 3 new biometric tables 
  2. Add org-level config — database_type: 'aws_rds', store the RDS connection string (encrypted) in the org settings  
  3. Build the PUSH endpoint — handle ZKTeco's exact HTTP format, validate device serial against registered devices    
  4. Build employee mapping UI — HR enters each employee's ZKTeco PIN once
  5. Punch processing logic — first punch of the day = check-in, subsequent = check-out, with duplicate protection     
  6. Build device management UI — register devices, view logs
  7. Test end-to-end — configure the physical ZKTeco device to point to our server URL and verify punches flow through 

  ---
  Key Risks to Discuss

  - PIN mismatch: If the client has employees enrolled on ZKTeco with different IDs than HRMS, the mapping step is     
  mandatory before go-live
  - Network: The ZKTeco device needs internet access to push — if it's on a local LAN only, we'd need a local bridge   
  server
  - Duplicate punches: ZKTeco retries failed pushes, so the raw log receiver must be idempotent (ignore already-logged 
  punches by device serial + timestamp)
  - Multi-device: If the client has multiple ZKTeco devices (entry/exit different floors), each punch needs to be      
  associated with the correct device

  ---
  Short version: We receive biometric punches via the PUSH SDK endpoint → log them raw → map the ZK employee PIN to an 
  HRMS user → write to the attendance table on AWS RDS → show source on the UI. The rest of the system (leaves,        
  payroll, etc.) works unchanged since it reads from the same attendance table.