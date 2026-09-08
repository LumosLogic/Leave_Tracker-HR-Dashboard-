-- Fix non-cascaded FK columns that reference users(id) so that user deletion
-- does not require manual null-outs. ON DELETE SET NULL preserves the row
-- but clears the user reference when the referenced user is deleted.

-- notifications_log.sent_by
ALTER TABLE notifications_log
  DROP CONSTRAINT IF EXISTS notifications_log_sent_by_fkey;
ALTER TABLE notifications_log
  ADD CONSTRAINT notifications_log_sent_by_fkey
  FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL;

-- performance_goals — created_by, updated_by, assigned_to, reviewed_by
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'performance_goals'::regclass AND contype = 'f'
      AND conname IN (
        'performance_goals_created_by_fkey',
        'performance_goals_updated_by_fkey',
        'performance_goals_assigned_to_fkey',
        'performance_goals_reviewed_by_fkey'
      )
  LOOP
    EXECUTE format('ALTER TABLE performance_goals DROP CONSTRAINT %I', r.conname);
  END LOOP;
END$$;

ALTER TABLE performance_goals
  ADD CONSTRAINT performance_goals_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
