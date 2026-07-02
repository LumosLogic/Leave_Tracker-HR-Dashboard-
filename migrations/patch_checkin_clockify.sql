-- Migration: Add clockify_entry_id to attendance
-- Run this in Supabase SQL editor
-- Date: 2026-06-29

ALTER TABLE attendance ADD COLUMN IF NOT EXISTS clockify_entry_id TEXT;
