-- Track debts/money borrowed from others
CREATE TABLE IF NOT EXISTS debts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  lender_name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  amount_repaid INTEGER NOT NULL DEFAULT 0,
  date_borrowed DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fully_paid', 'cancelled')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view debts" ON debts FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY "Members can manage debts" ON debts FOR ALL
  USING (is_household_member(household_id));
