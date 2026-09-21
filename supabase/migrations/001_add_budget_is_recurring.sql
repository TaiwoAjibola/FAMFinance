-- Add is_recurring flag to budget_items for auto-copy across months
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false;
