-- Track individual payments against budget items
CREATE TABLE IF NOT EXISTS budget_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_item_id UUID NOT NULL REFERENCES budget_items(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  account_id UUID REFERENCES accounts(id),
  notes TEXT,
  transaction_id UUID REFERENCES transactions(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add budget_item_id to transactions for linking
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS budget_item_id UUID REFERENCES budget_items(id);

-- RLS for budget_payments
CREATE POLICY "Members can manage budget payments" ON budget_payments FOR ALL
  USING (budget_item_id IN (
    SELECT id FROM budget_items WHERE budget_id IN (
      SELECT id FROM monthly_budgets WHERE is_household_member(household_id)
    )
  ));
