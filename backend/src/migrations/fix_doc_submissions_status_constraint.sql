-- BUG_157: Update employee_doc_submissions status check constraint to include 'hr_approved'
-- Run this on the production database to fix the document review submission error.

ALTER TABLE employee_doc_submissions
  DROP CONSTRAINT IF EXISTS employee_doc_submissions_status_check;

ALTER TABLE employee_doc_submissions
  ADD CONSTRAINT employee_doc_submissions_status_check
  CHECK (status IN ('pending', 'under_review', 'hr_approved', 'approved', 'rejected', 're_upload_requested'));
