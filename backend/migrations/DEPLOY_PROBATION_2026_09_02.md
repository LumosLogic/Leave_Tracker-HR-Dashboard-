# Deployment Notes — Probation + Holiday Fix + Paid Leave Fix (2026-09-02)

## Step 1: Run DB Migration (REQUIRED FIRST)

Connect to the PostgreSQL DB and run:

```
psql -U postgres -d <your_db_name> -f backend/migrations/probation_migration.sql
```

Or paste and run in pgAdmin:

```sql
ALTER TABLE payroll_settings
  ADD COLUMN IF NOT EXISTS probation_enabled           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS default_probation_months    INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS paid_leave_during_probation BOOLEAN DEFAULT TRUE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS probation_start_date DATE,
  ADD COLUMN IF NOT EXISTS probation_end_date   DATE,
  ADD COLUMN IF NOT EXISTS probation_applicable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS probation_months     INTEGER DEFAULT 0;
```

## Step 2: Deploy backend + frontend

Restart the Node.js process after deploying.

## What Changed

### Bug Fix 1 — Holiday shown as Absent in Reports
- `holidays.routes.js`: When a holiday is created, existing 'absent' attendance records are now updated to 'holiday'
- `reports.routes.js`: Attendance report now cross-references holidays and overrides absent→holiday for holiday dates
- `Reports.jsx`: Added holiday style (violet), holiday filter option, and proper holiday label display

### Bug Fix 2 — Paid Leave not reducing LOP in Payroll
- `payrollEngine.js`: Approved leave now takes priority over 'absent' attendance records. Previously, if an employee was auto-marked absent and later applied leave that was approved, payroll still counted it as absent/LOP. Now it correctly counts as paid leave with no LOP.

### New Feature — Probation Management
- **Payroll Settings**: New "Probation Management" section with 3 settings: Enable Probation, Default Period (months), Paid Leave During Probation
- **Employee Create/Edit**: New "Probation Period" toggle with auto-calculated start/end dates from joining date
- **Payroll Engine**: If probation is enabled and paid leave during probation is OFF, all leaves during probation period are treated as unpaid (LOP applies)
- **Cron Job**: Daily check at 00:05 — promotes employees whose probation_end_date has passed from `probation` to `active` status and sends HR notification
