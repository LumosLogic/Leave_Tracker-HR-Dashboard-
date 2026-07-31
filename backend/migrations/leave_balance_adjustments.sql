-- Leave Balance Adjustments Ledger
-- Run this migration once to enable HR manual leave balance adjustments.
-- Does NOT replace the live used-day calculation — this is an additive delta layer.

CREATE TABLE IF NOT EXISTS leave_balance_adjustments (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id       INTEGER NOT NULL,
  leave_type   TEXT    NOT NULL,
  year         INTEGER NOT NULL,
  -- positive = grant extra days, negative = deduct days
  delta        NUMERIC(5,1) NOT NULL CHECK (delta <> 0 AND delta BETWEEN -365 AND 365),
  reason       TEXT    NOT NULL,
  adjusted_by  INTEGER REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lba_lookup ON leave_balance_adjustments (user_id, org_id, year);
