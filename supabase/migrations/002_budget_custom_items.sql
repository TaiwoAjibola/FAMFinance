-- Allow budget items without a category (custom/one-off items)
ALTER TABLE budget_items ALTER COLUMN category_id DROP NOT NULL;

-- Add custom name for uncategorized budget items
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS custom_name TEXT;
