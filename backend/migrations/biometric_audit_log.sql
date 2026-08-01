-- Audit log for all /iclock/ requests (biometric device communication)
CREATE TABLE IF NOT EXISTS biometric_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  ts           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_ip    TEXT,
  method       TEXT,
  path         TEXT,
  serial_number TEXT,
  sn_known     BOOLEAN,   -- true = SN exists in biometric_devices
  status_sent  INTEGER,   -- HTTP status we returned (200/403/429)
  note         TEXT
);

CREATE INDEX IF NOT EXISTS idx_biometric_audit_log_ts  ON biometric_audit_log (ts DESC);
CREATE INDEX IF NOT EXISTS idx_biometric_audit_log_sn  ON biometric_audit_log (serial_number);
CREATE INDEX IF NOT EXISTS idx_biometric_audit_log_ip  ON biometric_audit_log (client_ip);
