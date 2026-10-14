-- ============================================================================
-- 009: Financial correctness + savings destination accounts
-- - Partial income receipts (parent/child transactions + received_amount)
-- - Debt repayment history
-- - Savings goal destination accounts
-- Idempotent: safe to run any number of times.
-- ============================================================================

-- Partial income receipts ----------------------------------------------------
-- Expected income rows track how much has actually been received; each
-- receipt is its own 'income' transaction linked to the expected row.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS parent_income_id UUID REFERENCES transactions(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS received_amount INTEGER NOT NULL DEFAULT 0;

-- Debt repayment history -----------------------------------------------------
CREATE TABLE IF NOT EXISTS debt_repayments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  account_id UUID REFERENCES accounts(id),
  notes TEXT,
  transaction_id UUID REFERENCES transactions(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE debt_repayments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view debt repayments" ON debt_repayments;
CREATE POLICY "Members can view debt repayments" ON debt_repayments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM debts d WHERE d.id = debt_repayments.debt_id
      AND is_household_member(d.household_id)
  ));
DROP POLICY IF EXISTS "Editors can manage debt repayments" ON debt_repayments;
CREATE POLICY "Editors can manage debt repayments" ON debt_repayments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM debts d WHERE d.id = debt_repayments.debt_id
      AND is_household_editor(d.household_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM debts d WHERE d.id = debt_repayments.debt_id
      AND is_household_editor(d.household_id)
  ));

-- Savings destination accounts ------------------------------------------------
-- A savings goal points at the account where the money lives; moving money
-- into it is a transfer, never new income.
ALTER TABLE savings_goals ADD COLUMN IF NOT EXISTS destination_account_id UUID REFERENCES accounts(id);
