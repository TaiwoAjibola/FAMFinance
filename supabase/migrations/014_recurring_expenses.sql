-- Recurring expense definitions.
-- A recurring expense is an expected obligation (rent, internet, etc.).
-- It does not create an actual expense transaction until the user confirms payment.
--
-- Compatible with databases where recurring_expenses already exists with an older shape.

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  next_due_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- If the table pre-existed with an older schema, add columns used by the app.
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS next_due_date DATE;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS end_date DATE;

-- Backfill next_due_date for existing rows where possible.
UPDATE recurring_expenses
SET next_due_date = CURRENT_DATE
WHERE next_due_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_household ON recurring_expenses(household_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_due ON recurring_expenses(household_id, next_due_date);

ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view recurring expenses" ON recurring_expenses;
CREATE POLICY "Members can view recurring expenses" ON recurring_expenses FOR SELECT
  USING (is_household_member(household_id));

DROP POLICY IF EXISTS "Editors can manage recurring expenses" ON recurring_expenses;
CREATE POLICY "Editors can manage recurring expenses" ON recurring_expenses FOR ALL
  USING (is_household_editor(household_id))
  WITH CHECK (is_household_editor(household_id));
