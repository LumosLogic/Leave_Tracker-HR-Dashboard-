-- Migration: Add structured company header fields to payroll_settings
-- Safe to re-run (IF NOT EXISTS / DO block). No existing data is modified.
-- Run this on the Relitrade DB and any other org DB.

ALTER TABLE payroll_settings
  ADD COLUMN IF NOT EXISTS payslip_company_fullname     TEXT,
  ADD COLUMN IF NOT EXISTS payslip_registered_address   TEXT,
  ADD COLUMN IF NOT EXISTS payslip_corporate_address    TEXT,
  ADD COLUMN IF NOT EXISTS payslip_contact_details      TEXT;

-- Populate Relitrade-specific company details (organization_id = 1 in Relitrade DB)
UPDATE payroll_settings
SET
  payslip_company_fullname   = 'Relitrade Stock Broking Pvt. Ltd.',
  payslip_registered_address = 'Office No. 206 & 207, Dalal Street Commercial Co-Operative Society Limited, Block 53, Zone 5, Road 5E, Gift City, Gandhinagar, Gujarat, India, 382050',
  payslip_corporate_address  = 'Relitrade House, 2nd Floor, O Block, Mondeal Retail Park, Nr. Rajpath Club, S. G. Highway, Ahmedabad, Gujarat - 380059.',
  payslip_contact_details    = 'Office: +91 79681 99999  |  Mail: wecare@relitrade.in'
WHERE organization_id = 1;
