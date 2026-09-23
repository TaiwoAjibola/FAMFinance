-- Add status column to transactions for income tracking
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'received';

-- Set existing income transactions to 'received'
UPDATE transactions SET status = 'received' WHERE type = 'income' AND status IS NULL;
