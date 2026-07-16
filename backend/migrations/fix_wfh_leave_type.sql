-- Migration: Normalize WFH records so leave_type = 'wfh' for all WFH requests.
--
-- Before this fix, WFH was stored with leave_time = 'wfh' but leave_type was
-- whatever the employee picked (e.g. 'other', 'casual', 'sick'), causing WFH
-- to appear alongside leave type badges in the UI.
--
-- After this migration, WFH records are identified by BOTH:
--   leave_time = 'wfh'   (still used for backward-compat queries)
--   leave_type = 'wfh'   (new canonical identifier)
--
-- Run this once against your Supabase database.

UPDATE public.leaves
SET leave_type = 'wfh'
WHERE leave_time = 'wfh'
  AND leave_type <> 'wfh';
