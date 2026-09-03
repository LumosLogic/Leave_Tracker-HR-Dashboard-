# Shift-Specific Work Schedule & Attendance Rules

**Implemented:** 2026-09-02  
**Branch:** HRMS-Migration-16jul

---

## Problem

Work Schedule and Attendance Rules were a single org-wide configuration. With multiple shifts (e.g. Weekday 08:30–17:30, Saturday 10:30–13:30), the system had no way to apply different late thresholds, half-day hours, or full-day hours per shift — causing incorrect late flags, wrong half-day/LOP classifications, and payroll inconsistencies.

---

## Solution

Work Schedule and Attendance Rules are now configurable **per shift**. The engine uses the assigned shift's config for every attendance/payroll calculation. If no shift is assigned (or a shift has no config yet), the system falls back to the existing org-level `work_schedule` — fully backward compatible.

**Fallback chain (every layer):**
> Shift-specific column → Org work_schedule → Hardcoded default

---

## Database Migration

Run before deploying:

```sql
-- backend/migrations/add_shift_attendance_config_2026_09_02.sql
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS late_threshold        TEXT,
  ADD COLUMN IF NOT EXISTS early_exit_threshold  TEXT,
  ADD COLUMN IF NOT EXISTS half_day_hours        NUMERIC,
  ADD COLUMN IF NOT EXISTS full_day_hours        NUMERIC,
  ADD COLUMN IF NOT EXISTS max_early_leave_count INT;
```

All columns are **nullable**. `NULL` = inherit from org-level `work_schedule`. Existing shifts are unaffected.

---

## New API Endpoints

Both endpoints are tenant-scoped (`organization_id` from JWT).

### GET `/api/settings/shift/:shiftId`

Returns the shift's config, filling `null` fields from the org's `work_schedule`.

**Response:**
```json
{
  "config": {
    "shift_id": 3,
    "shift_name": "Weekday Shift",
    "start_time": "08:30",
    "end_time": "17:30",
    "work_days": "1,2,3,4,5",
    "late_threshold": "08:45",
    "early_exit_threshold": "17:00",
    "half_day_hours": 4,
    "full_day_hours": 8,
    "max_early_leave_count": 3,
    "has_shift_override": true
  }
}
```

### PUT `/api/settings/shift/:shiftId`

Saves work schedule and/or attendance rules onto the shift row. All fields are optional (partial update).

**Body (any combination):**
```json
{
  "start_time": "08:30",
  "end_time": "17:30",
  "work_days": "1,2,3,4,5",
  "late_threshold": "08:45",
  "early_exit_threshold": "17:00",
  "half_day_hours": 4,
  "full_day_hours": 8,
  "max_early_leave_count": 3
}
```

---

## UI Changes (Settings Page)

Both **Work Schedule** and **Attendance Rules** panels now have a **Shift selector** at the top.

```
Configure for Shift
[ Organization Default (no shift) ▼ ]

— or —

[ Weekday Shift ▼ ]
[ Saturday Shift ▼ ]
```

- **Organization Default** → loads/saves from the existing `work_schedule` table (existing behavior, unchanged)
- **Any Shift** → loads/saves from that shift's own columns

Switching the selector fetches that shift's config and repopulates the form. Saving only affects the selected shift/default.

---

## Engine Changes

### Check-in (`attendance.routes.js`)

| Field | Before | After |
|-------|--------|-------|
| Late threshold | `shift.start_time` → org `late_threshold` | `shift.late_threshold` → org `late_threshold` |

### Check-out (`attendance.routes.js`)

| Field | Before | After |
|-------|--------|-------|
| Early exit threshold | `shift.end_time` → org `early_exit_threshold` | `shift.early_exit_threshold` → `shift.end_time` → org `early_exit_threshold` |
| Half-day hours | org `half_day_hours` only | `shift.half_day_hours` → org `half_day_hours` |
| Full-day hours | org `full_day_hours` only | `shift.full_day_hours` → org `full_day_hours` |

### Payroll Engine (`payrollEngine.js`)

The shift assignment query now fetches `late_threshold`, `half_day_hours`, `full_day_hours`, `max_early_leave_count` per date. `calculateAttendance()` resolves per-day effective thresholds:

- **Late count**: compares check-in against shift's `late_threshold` (or org fallback)
- **Half-day reclassification**: uses shift's `half_day_hours` threshold (or org fallback)
- **Early-leave LOP**: uses shift's `max_early_leave_count` (or org fallback)

### Biometric FILO (`biometricReprocess.util.js`)

`applyFILODay()` performs a shift assignment lookup at the start of each call. If the employee has a shift for that date with non-null `end_time`, `half_day_hours`, or `full_day_hours`, those override the org-level values passed by the caller.

---

## Backward Compatibility

- All new columns are nullable — existing shifts have `NULL` in all new columns
- `NULL` triggers org-level fallback at every calculation point
- Existing orgs with no shift assignments: behavior is **identical** to before
- Existing orgs with shifts but no shift-specific config: behavior is **identical** to before
- Do **not** delete or modify `work_schedule` table — it remains the org-level fallback

---

## Files Changed

| File | Change |
|------|--------|
| `backend/migrations/add_shift_attendance_config_2026_09_02.sql` | New migration — 5 nullable columns on `shifts` |
| `backend/src/modules/settings/settings.routes.js` | Added `GET /shift/:id` and `PUT /shift/:id` |
| `backend/src/modules/attendance/attendance.routes.js` | `getActiveShiftConfig()` returns full shift config; check-in/out use shift-specific thresholds |
| `backend/src/services/payrollEngine.js` | Shift query extended; per-day rules in `shiftDateMap`; `calculateAttendance` uses per-day thresholds |
| `backend/src/modules/biometric/biometricReprocess.util.js` | `applyFILODay()` does shift lookup internally |
| `client/src/pages/Settings.jsx` | `ShiftSelector` component; `WorkSchedulePanel` and `AttendanceRulesPanel` are shift-aware |

---

## Example: Relitrade (Test Scenario)

| Shift | Start | End | Late Threshold | Half Day | Full Day |
|-------|-------|-----|----------------|----------|----------|
| Weekday Shift | 08:30 | 17:30 | 08:45 | 4h | 8h |
| Saturday Shift | 10:30 | 13:30 | 10:45 | 1.5h | 3h |

Employee on **Saturday Shift** checks in at 10:40:
- System compares against **10:45** (Saturday Shift's threshold) → **Not late** ✓
- System does NOT use 09:00/09:30 or any org default ✓

Employee on **Saturday Shift** works 2.5h:
- System compares against Saturday Shift's `full_day_hours = 3h` → **Early leave** ✓
- System does NOT compare against 8h (Weekday Shift / org default) ✓
