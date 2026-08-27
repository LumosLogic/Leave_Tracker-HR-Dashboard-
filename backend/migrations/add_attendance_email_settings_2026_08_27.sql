-- Migration: Attendance Email Automation settings + audit log
-- Run once per database instance.

-- Per-org email automation configuration
CREATE TABLE IF NOT EXISTS attendance_email_settings (
  id                           SERIAL PRIMARY KEY,
  organization_id              INTEGER NOT NULL UNIQUE,
  late_email_enabled           BOOLEAN NOT NULL DEFAULT FALSE,
  daily_summary_enabled        BOOLEAN NOT NULL DEFAULT FALSE,
  daily_summary_time           TIME    NOT NULL DEFAULT '18:30:00',
  appreciation_email_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  appreciation_threshold_hours NUMERIC NOT NULL DEFAULT 8,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit log — one row per (org, employee, type, date). UNIQUE prevents duplicate sends.
CREATE TABLE IF NOT EXISTS attendance_email_logs (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER      NOT NULL,
  employee_id     INTEGER      NOT NULL,
  email_type      VARCHAR(50)  NOT NULL, -- 'late' | 'daily_summary' | 'appreciation'
  attendance_date DATE         NOT NULL,
  sent_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  status          VARCHAR(20)  NOT NULL DEFAULT 'sent', -- 'sent' | 'failed' | 'skipped'
  error_message   TEXT,
  UNIQUE (organization_id, employee_id, email_type, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_att_email_logs_lookup
  ON attendance_email_logs (organization_id, email_type, attendance_date);
