-- Add 'probation' to the employee_status check constraint.
-- Run: docker cp ... && docker exec ... psql ... -f /tmp/add_probation_to_status_constraint.sql

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_employee_status;

ALTER TABLE users ADD CONSTRAINT chk_users_employee_status
  CHECK (employee_status IN ('active','inactive','resigned','terminated','on_leave','probation'));
