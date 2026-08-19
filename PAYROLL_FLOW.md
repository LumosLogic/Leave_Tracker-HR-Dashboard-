# Payroll Flow — Lumos Logic HRMS

## Overview

The payroll system has two distinct paths:

1. **Full Payroll Run** (Phase 3.3) — batch-generates payslips for all eligible employees in one operation via `POST /api/payroll/generate`. This is the primary path for monthly payroll.
2. **Quick Payslip** (Legacy) — generates a single payslip on demand via `POST /api/payroll/payslips/generate`. Uses simpler attendance counting.

---

## 1. Full Payroll Flow

### Step-by-step

```
Configure Salary Structure
        ↓
Preview Payroll Run (optional dry-run)
        ↓
Generate Payroll Run (writes payslips)
        ↓
Verify → Approve → Lock → Mark Paid
        ↓
Download / Email Payslips
```

### Step 1 — Configure Salary Structure

**UI:** `SalaryStructure.jsx` → "Set Salary" or "Revise" button opens `SalaryModal`

**API:** `POST /api/payroll/salary-structures`

**File:** `backend/src/modules/payroll/payroll.routes.js` (line ~246)

**Table written:** `employee_salary_structures`

- Each structure has an `effective_from` date. When a new one is saved, the previous active record's `effective_to` is set to `new_effective_from - 1 day`.
- Only one active record per employee per org (`effective_to IS NULL`).
- Fields: `basic`, `hra`, `da`, `transport_allowance`, `medical_allowance`, `special_allowance`, `other_allowance`, `employee_pf`, `employee_esi`, `professional_tax`, `tds`, `other_deductions`, `retention`, `employer_pf`, `employer_esi`, `gross_salary`, `ctc`.
- CTC = Gross Salary + employer_pf + employer_esi (computed in the route, stored in `ctc` column).

**View salary history:** `GET /api/payroll/salary-structures/history/:userId` → renders in `HistoryModal`

---

### Step 2 — Preview (optional)

**UI:** `PayrollGeneration.jsx` — "Preview" before generating

**API:** `POST /api/payroll/preview`

**File:** `backend/src/services/payrollGenerationService.js` → `previewPayrollRun()`

- Runs `calculatePayroll()` for every eligible employee (read-only, no writes).
- Returns per-employee gross/net/deductions, total counts, any errors.

---

### Step 3 — Generate Payroll Run

**UI:** `PayrollGeneration.jsx` — "Generate Payroll" button

**API:** `POST /api/payroll/generate`

**Files:**
- Route: `backend/src/modules/payroll/payroll.routes.js` (line ~756)
- Orchestrator: `backend/src/services/payrollGenerationService.js` → `generatePayrollRun()`
- Engine: `backend/src/services/payrollEngine.js` → `calculatePayroll()`

#### What happens inside `generatePayrollRun()`:

1. **Advisory lock** (`pg_advisory_xact_lock`) prevents concurrent runs for same period.
2. **Creates/resets** a `payroll_runs` row with `status = 'processing'`.
3. **Fetches eligible employees** — those with an active `employee_salary_structures` record overlapping the pay period (from `fetchEligibleEmployees()`).
4. **For each employee** calls `generateEmployeePayslip()`:
   - Delegates all arithmetic to `payrollEngine.calculatePayroll()`.
   - Writes/updates a row in `payslips` (check-then-insert-or-update; no `ON CONFLICT` since the table has no unique constraint on `(user_id, month, year)` from the legacy schema).
   - Calls `applyStatutoryCalculations()` for PF/ESI/PT/TDS/LWF overrides (Phase 3.7).
5. **Records per-employee result** in `payroll_run_employees` (success/failed).
6. **Updates** `payroll_runs.employee_count`, `total_gross`, `total_net`, `total_deductions`, `status`.

#### `calculatePayroll()` logic (payrollEngine.js):

- Fetches in parallel: employee record, payroll settings, salary structure, attendance, leaves, holidays, work schedule, regularizations.
- Salary structure query: `effective_from <= last_day_of_period AND (effective_to IS NULL OR effective_to >= first_day_of_period)`.
- Builds a per-day classification map (weekend, holiday, working day).
- Counts: `presentFull`, `presentHalf`, `paidLeave`, `paidHalfLeave`, `unpaidLeave`, `absent`, `weekoff`, `holiday`.
- Calculates LOP (Loss of Pay) = `workingDays - payableDays`, plus late-arrival penalties.
- Computes `grossSalary` (sum of all earning components), `deductions`, `netSalary`.

---

### Step 4 — Post-Generation Lifecycle

| Action      | API Endpoint                     | Status Change                | Permission         |
|-------------|----------------------------------|------------------------------|--------------------|
| Verify      | `POST /api/payroll/runs/:id/verify`  | `completed` → `verified`  | `payroll.verify`   |
| Approve     | `POST /api/payroll/runs/:id/approve` | `verified` → `approved`   | `payroll.approve`  |
| Lock        | `POST /api/payroll/lock/:id`         | `completed/approved` → `locked` | `payroll.lock` |
| Mark Paid   | `POST /api/payroll/runs/:id/mark-paid` | `locked/approved` → `paid` | `payroll.mark_paid` |
| Unlock      | `POST /api/payroll/unlock/:id`       | `locked` → `completed`    | `payroll.unlock`   |

**File:** `backend/src/modules/payroll/payroll.routes.js`

---

### Step 5 — View/Download Payslips

**List runs:** `GET /api/payroll/runs` (admin) → `PayrollGeneration.jsx`

**Run details:** `GET /api/payroll/runs/:id` → `PayrollRunDetails.jsx`

**All payslips for period:** `GET /api/payroll/payslips/all?month=&year=`

**Single payslip:** `GET /api/payroll/payslips/:id/details`

**Employee's own payslips:** `GET /api/payroll/payslips?userId=&year=` → `Payroll.jsx`

---

## 2. Quick Payslip (Single-Employee)

**UI:** `PayrollDashboard.jsx` or `Payroll.jsx` — "Generate Payslip" button

**API:** `POST /api/payroll/payslips/generate`

**File:** `backend/src/modules/payroll/payroll.routes.js` (line ~538)

#### What happens:
1. Fetches salary structure — first from `employee_salary_structures` (Phase 3 primary), then falls back to `payroll_structures` (legacy table).
2. Date filter: `effective_from <= first_day_of_month` to exclude future-dated structures.
3. Counts attendance from the `attendance` table (simpler than the engine's calculation).
4. Calculates gross, deductions, LOP, net salary.
5. Uses an advisory lock (`pg_advisory_xact_lock`) then INSERT or UPDATE the `payslips` row.
6. Fires a notification to the employee.

---

## 3. Database Tables

| Table | Purpose |
|-------|---------|
| `employee_salary_structures` | Versioned salary structures (Phase 3 primary table). One active row per employee (`effective_to IS NULL`). |
| `payroll_structures` | Legacy salary table used by older routes. Columns differ (uses `other_allowances` instead of `special_allowance`+`other_allowance`). |
| `payroll_settings` | Org-level payroll config: weekend policy, PF/ESI toggles, LOP rules, working day rules. One row per org. |
| `payroll_runs` | One row per org per pay period. Tracks status, employee_count, totals. |
| `payroll_run_employees` | One row per employee per run. Tracks success/failure, links to payslip. |
| `payslips` | Immutable snapshots of each employee's pay for a period. Extended with snapshot columns (Phase 3.3). |
| `payroll_audit_log` | Full audit trail of all payroll changes. |
| `payroll_adjustments` | Ad-hoc bonuses and deductions for a run. |
| `payroll_scheduler_runs` | History of scheduled automatic payroll runs. |
| `payroll_email_log` | Log of payslip emails sent. |

### Key Columns in `payslips`

- `user_id`, `month` (zero-padded string e.g. `"07"`), `year` (integer), `organization_id`
- `payroll_run_id` — links to `payroll_runs`; NULL for quick/manual payslips
- `locked` — if TRUE, cannot be regenerated
- `formula_version` — e.g. `"3.3"` tracks which engine version generated this
- `salary_structure_id` — FK to `employee_salary_structures`
- `attendance_snapshot`, `lop_snapshot` — JSONB snapshots at generation time
- `status` — `generated`, `published`

---

## 4. Common Errors and Fixes

### "No salary structure found for this employee"

**Where:** Quick payslip generate (`POST /api/payroll/payslips/generate`)

**Causes:**
1. Employee has a salary in `employee_salary_structures` but the quick payslip route was only checking `payroll_structures` (the legacy table). **Fixed in BUG_133** — route now checks `employee_salary_structures` first.
2. The salary structure's `effective_from` is after the requested pay period (future-dated). Fix: set `effective_from` to a date before or on the first day of the pay period.
3. The employee's `organization_id` doesn't match the admin's `organization_id`.

---

### "there is no unique or exclusion constraint matching the ON CONFLICT specification"

**Where:** Payroll run generation (`POST /api/payroll/generate`)

**Cause:** The `payslips` table (which was created before Phase 3) has no unique constraint on `(user_id, month, year)`. The Phase 3.3 code used `ON CONFLICT (user_id, month, year) DO UPDATE` which requires such a constraint. **Fixed in BUG_131** — replaced the upsert with an explicit check-then-INSERT-or-UPDATE pattern.

**Alternative fix (DB level):** Run this migration to add the constraint:
```sql
-- Only run if your payslips table has no duplicates:
ALTER TABLE payslips
  ADD CONSTRAINT uq_payslips_user_month_year
  UNIQUE (user_id, month, year, organization_id);
```

---

### Payroll Runs history shows Employees = 0

**Where:** `PayrollGeneration.jsx` — Employees column in runs table

**Cause:** The payroll run's `employee_count` field is updated at the end of `generatePayrollRun()` with `successCount`. If every employee's payslip INSERT fails (e.g. due to the ON CONFLICT error above), `successCount` stays 0. **Fixed by BUG_131** — once payslip writes succeed, the count is correct.

**Also check:** The `payroll_runs` table column is `employee_count` (NOT `employees_count`). The frontend reads `run.employee_count` which matches.

---

### "Payslip is locked and cannot be regenerated"

**Cause:** `payslips.locked = TRUE`. Must unlock the payroll run first via `POST /api/payroll/unlock/:id` (requires `payroll.unlock` permission, Root Admin only).

---

### "Cannot generate payroll for a future period"

**Cause:** Attempting to run payroll for a month/year that hasn't ended yet. The engine blocks this since attendance data is incomplete.

---

### "Payroll for MM/YYYY already exists. Pass force=true to regenerate."

**Cause:** A run already exists. Send `{ force: true }` in the request body to overwrite a non-locked run.

---

## 5. How to Run Payroll Step by Step

### Prerequisites
1. Ensure all employees have an active salary structure in `employee_salary_structures` (or `payroll_structures` for legacy).
2. Ensure `payroll_settings` is configured for the org (weekend policy, PF/ESI toggles, etc.).
3. Attendance data for the period should be complete (present/absent/leave records).

### Step-by-step via UI

1. Go to **Payroll → Salary Structures** and verify all employees have "Configured" status.
2. Go to **Payroll → Generate** page.
3. Select the **month** and **year** for the pay period.
4. Click **Preview** to see a dry-run calculation without writing anything.
5. Review the preview: check employee count, flag any "error" employees.
6. Click **Generate Payroll**. The run status changes to `processing` then `completed`.
7. Click on the run row to see per-employee breakdowns in **Run Details**.
8. If satisfied, click **Verify** → **Approve** → **Lock**.
9. To pay: click **Mark Paid**.
10. Employees can view their payslips under **My Payslips**.

### Regenerating a Run

If corrections are needed after generation (but before locking):
- Call `POST /api/payroll/generate` with `{ force: true, month, year }`.
- This resets the existing run and re-processes all employees.

---

## 6. Files Reference

| File | Role |
|------|------|
| `backend/src/modules/payroll/payroll.routes.js` | All payroll API routes; quick payslip generate; salary structure CRUD |
| `backend/src/services/payrollEngine.js` | Pure calculation: attendance, LOP, deductions, net salary (no DB writes) |
| `backend/src/services/payrollGenerationService.js` | Payroll run orchestration: creates runs, writes payslips, locks/unlocks |
| `backend/src/services/payrollScheduler.js` | Scheduled automatic payroll generation (cron) |
| `backend/src/services/payrollAdjustmentService.js` | Ad-hoc adjustments (bonuses/deductions) |
| `backend/src/services/payrollReportService.js` | Summary, department, LOP, salary register reports |
| `backend/src/services/payrollBankService.js` | Bank transfer file generation (CSV for HDFC, ICICI, SBI, Axis) |
| `backend/src/services/payrollEmailService.js` | Email payslip PDFs to employees |
| `client/src/pages/SalaryStructure.jsx` | Salary structure management UI |
| `client/src/pages/PayrollGeneration.jsx` | Generate/preview payroll runs UI |
| `client/src/pages/PayrollRunDetails.jsx` | Per-run employee breakdown UI |
| `client/src/pages/PayrollDashboard.jsx` | Payroll KPI dashboard |
| `client/src/pages/Payroll.jsx` | Employee's own payslip view |
| `backend/migrations/phase3_01_payroll_data_model.sql` | Creates `payroll_settings`, `employee_salary_structures` |
| `backend/migrations/phase3_03_payroll_generation.sql` | Creates `payroll_runs`, `payroll_run_employees`, extends `payslips` |
| `backend/migrations/payroll_patch.sql` | Adds `pf_employer`, `esi_employer`, `absent_days`, `leave_days` to `payslips` |
