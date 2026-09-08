-- ============================================================
-- Fix company-level statutory numbers incorrectly stored in users table
-- Run on Relitrade DB only.
-- ============================================================

-- PRE-CHECK: confirm values before clearing
SELECT id, name, employee_id, pf_no, esi_no
FROM users
WHERE employee_id::text = '801' AND organization_id = 1;
-- Expected: Manish Kandel, pf_no = 'GJNRD3818540000', esi_no = '37001945660000999'
-- These are company-level numbers — wrong place. Clearing them now.

-- Step 1: Add company ESIC column to payroll_settings
ALTER TABLE payroll_settings ADD COLUMN IF NOT EXISTS payslip_company_esic_no TEXT;

-- Step 2: Move company-level PF + ESIC numbers to payroll_settings
UPDATE payroll_settings
SET
  payslip_company_pf_no   = 'GJNRD3818540000',
  payslip_company_esic_no = '37001945660000999'
WHERE organization_id = 1;

-- Step 3: Clear the incorrectly stored values from users table for Manish
-- Only touches Manish (801) — no other employee data is modified
UPDATE users
SET pf_no  = NULL,
    esi_no = NULL
WHERE employee_id::text = '801'
  AND organization_id = 1
  AND pf_no  = 'GJNRD3818540000'
  AND esi_no = '37001945660000999';
-- The AND conditions ensure we only clear these exact values (audit guard — won't
-- accidentally clear if Manish later gets his own individual PF/ESIC assigned)

-- Step 4: Fix Vishal (employee_id = 480 in DB, listed as 809 in spreadsheet)
-- Update PAN to the correct value
UPDATE users
SET pan_number = 'IMYPS6008A'
WHERE employee_id::text = '480' AND organization_id = 1;

-- Update Vishal's bank account number (same IFSC SBIN0002640, different account)
UPDATE employee_bank_accounts
SET account_number = '32526631715'
WHERE employee_id = (
        SELECT id FROM users
        WHERE employee_id::text = '480' AND organization_id = 1
      )
  AND is_active = true
  AND ifsc_code = 'SBIN0002640';

-- ============================================================
-- Verification
-- ============================================================

-- 1. Confirm Manish's individual PF/ESIC are now NULL
SELECT employee_id, name, pf_no, esi_no, pan_number
FROM users
WHERE employee_id::text = '801' AND organization_id = 1;
-- Expected: pf_no = NULL, esi_no = NULL

-- 2. Confirm company-level PF + ESIC are in payroll_settings
SELECT payslip_company_pf_no, payslip_company_esic_no, payslip_company_cin
FROM payroll_settings
WHERE organization_id = 1;

-- 3. Confirm Vishal's PAN and bank
SELECT u.employee_id, u.name, u.pan_number, b.bank_name, b.account_number, b.ifsc_code
FROM users u
JOIN employee_bank_accounts b ON b.employee_id = u.id AND b.is_active = true
WHERE u.employee_id::text = '480' AND u.organization_id = 1;
