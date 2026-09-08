-- Add merchant_name and receipt_number to expenses for content-based duplicate detection
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS merchant_name TEXT DEFAULT '';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_number TEXT DEFAULT '';
