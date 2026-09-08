-- Fix notifications_log.sent_by FK so user deletion doesn't violate the constraint.
-- Changing to ON DELETE SET NULL preserves the log row but clears the user reference.
ALTER TABLE notifications_log
  DROP CONSTRAINT IF EXISTS notifications_log_sent_by_fkey;

ALTER TABLE notifications_log
  ADD CONSTRAINT notifications_log_sent_by_fkey
  FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL;
