-- Expense inbox / capture queue.
--
-- Holds expenses that have been captured but not yet committed to the ledger.
-- This enables review-first flows (quick capture, daily summary, voice, imports)
-- without changing account balances until a user explicitly confirms/commits.
--
-- `status` lifecycle:
--   needs_review -> ready/imported/dismissed
--   ready        -> imported/dismissed
--   imported/dismissed are terminal for balance purposes.
--
-- Committing a capture creates a normal expense transaction and records it in
-- `imported_transaction_id`. Balance changes happen only at commit time.

CREATE TABLE IF NOT EXISTS expense_captures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  description TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'quick_entry'
    CHECK (source IN ('quick_entry', 'daily_summary', 'voice', 'import', 'manual')),
  status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (status IN ('needs_review', 'ready', 'dismissed', 'imported')),
  raw_input TEXT,
  import_batch_id UUID,
  imported_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_captures_household ON expense_captures(household_id);
CREATE INDEX IF NOT EXISTS idx_expense_captures_status ON expense_captures(household_id, status);
CREATE INDEX IF NOT EXISTS idx_expense_captures_date ON expense_captures(household_id, date);

ALTER TABLE expense_captures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view expense captures" ON expense_captures;
CREATE POLICY "Members can view expense captures" ON expense_captures FOR SELECT
  USING (is_household_member(household_id));

DROP POLICY IF EXISTS "Editors can manage expense captures" ON expense_captures;
CREATE POLICY "Editors can manage expense captures" ON expense_captures FOR ALL
  USING (is_household_editor(household_id))
  WITH CHECK (is_household_editor(household_id));

COMMENT ON TABLE expense_captures IS
  'Captured expenses awaiting review. No account balance changes until a capture is explicitly committed as a transaction.';
COMMENT ON COLUMN expense_captures.currency IS
  'ISO 4217 snapshot at capture time (from the selected account). Amounts are never converted.';
COMMENT ON COLUMN expense_captures.imported_transaction_id IS
  'Set when the capture is committed; links to the created expense transaction.';
