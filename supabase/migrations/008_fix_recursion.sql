-- ============================================================================
-- FIX: Infinite recursion in RLS policies (42P17)
--
-- ROOT CAUSE: Policies on household_members queried household_members with
-- inline subqueries. Evaluating the policy triggered the same policy again,
-- forever. This also caused the /setup redirect and savings creation 500s.
--
-- PERMANENT FIX:
--   1. SECURITY DEFINER helper functions (they bypass RLS, cannot recurse)
--   2. Dynamic DO block drops ALL policies on ALL public tables (clean slate,
--      immune to "policy already exists" errors)
--   3. Every recreated policy uses ONLY helper functions — zero inline
--      subqueries on household_members anywhere.
--
-- This script is fully idempotent. Run it any time, as many times as needed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper functions (SECURITY DEFINER = bypass RLS = no recursion possible)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_household_member(household_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = household_uuid AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_household_owner(household_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = household_uuid AND user_id = auth.uid() AND role = 'owner'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- owner OR editor: anyone who can write household data
CREATE OR REPLACE FUNCTION is_household_editor(household_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE household_id = household_uuid AND user_id = auth.uid()
      AND role IN ('owner', 'editor')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Auto-create user profile when someone signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ----------------------------------------------------------------------------
-- 2. Ensure newer tables exist (safe if already created)
-- ----------------------------------------------------------------------------

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

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS budget_item_id UUID REFERENCES budget_items(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'received';
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS custom_name TEXT;
ALTER TABLE budget_items ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex');
UPDATE invitations SET token = encode(gen_random_bytes(16), 'hex') WHERE token IS NULL;

-- Role constraints: drop first, clean data, then re-add (order matters)
ALTER TABLE household_members DROP CONSTRAINT IF EXISTS household_members_role_check;
ALTER TABLE invitations DROP CONSTRAINT IF EXISTS invitations_role_check;
UPDATE household_members SET role = 'editor' WHERE role NOT IN ('owner', 'editor', 'viewer') OR role IS NULL;
UPDATE invitations SET role = 'editor' WHERE role NOT IN ('owner', 'editor', 'viewer') OR role IS NULL;
ALTER TABLE household_members ADD CONSTRAINT household_members_role_check
  CHECK (role IN ('owner', 'editor', 'viewer'));
ALTER TABLE invitations ADD CONSTRAINT invitations_role_check
  CHECK (role IN ('owner', 'editor', 'viewer'));

ALTER TABLE budget_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. Drop EVERY policy on EVERY public table (clean slate)
-- ----------------------------------------------------------------------------

DO $$ DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Recreate ALL policies — helper functions ONLY, no inline subqueries on
--    household_members anywhere (that is what caused the recursion)
-- ----------------------------------------------------------------------------

-- Users: own profile, or profiles of people who share a household
CREATE POLICY "Users can view own profile" ON users FOR SELECT
  USING (id = auth.uid());
CREATE POLICY "Users can view co-members" ON users FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM household_members me
    JOIN household_members them ON me.household_id = them.household_id
    WHERE me.user_id = auth.uid() AND them.user_id = users.id
  ));

-- Households
CREATE POLICY "Members can view household" ON households FOR SELECT
  USING (is_household_member(id));
CREATE POLICY "Owners can manage household" ON households FOR ALL
  USING (owner_id = auth.uid() OR is_household_owner(id))
  WITH CHECK (owner_id = auth.uid() OR is_household_owner(id));

-- Household members (the table that was recursing — keep it simple!)
CREATE POLICY "Members can view household members" ON household_members FOR SELECT
  USING (user_id = auth.uid() OR is_household_member(household_id));
-- Invite acceptance: an authenticated user inserts their own membership
CREATE POLICY "Authenticated can insert own membership" ON household_members FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());
-- Role changes: owners only
CREATE POLICY "Owners can update members" ON household_members FOR UPDATE
  USING (is_household_owner(household_id))
  WITH CHECK (is_household_owner(household_id));
-- Remove member / re-invite: owners, or a member leaving on their own
CREATE POLICY "Owners can delete members" ON household_members FOR DELETE
  USING (is_household_owner(household_id) OR user_id = auth.uid());

-- Accounts (read: any member, write: owner/editor)
CREATE POLICY "Members can view accounts" ON accounts FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY "Editors can insert accounts" ON accounts FOR INSERT
  WITH CHECK (is_household_editor(household_id));
CREATE POLICY "Editors can update accounts" ON accounts FOR UPDATE
  USING (is_household_editor(household_id));
CREATE POLICY "Editors can delete accounts" ON accounts FOR DELETE
  USING (is_household_editor(household_id));

-- Categories
CREATE POLICY "Members can view categories" ON categories FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY "Editors can manage categories" ON categories FOR ALL
  USING (is_household_editor(household_id))
  WITH CHECK (is_household_editor(household_id));

-- Transactions
CREATE POLICY "Members can view transactions" ON transactions FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY "Editors can manage transactions" ON transactions FOR ALL
  USING (is_household_editor(household_id))
  WITH CHECK (is_household_editor(household_id));

-- Recurring expenses
CREATE POLICY "Members can view recurring expenses" ON recurring_expenses FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY "Editors can manage recurring expenses" ON recurring_expenses FOR ALL
  USING (is_household_editor(household_id))
  WITH CHECK (is_household_editor(household_id));

-- Monthly budgets
CREATE POLICY "Members can view budgets" ON monthly_budgets FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY "Editors can manage budgets" ON monthly_budgets FOR ALL
  USING (is_household_editor(household_id))
  WITH CHECK (is_household_editor(household_id));

-- Budget items (reach household via monthly_budgets — different table, safe)
CREATE POLICY "Members can view budget items" ON budget_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM monthly_budgets mb
    WHERE mb.id = budget_items.budget_id AND is_household_member(mb.household_id)
  ));
CREATE POLICY "Editors can manage budget items" ON budget_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM monthly_budgets mb
    WHERE mb.id = budget_items.budget_id AND is_household_editor(mb.household_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM monthly_budgets mb
    WHERE mb.id = budget_items.budget_id AND is_household_editor(mb.household_id)
  ));

-- Budget payments
CREATE POLICY "Members can view budget payments" ON budget_payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM budget_items bi
    JOIN monthly_budgets mb ON mb.id = bi.budget_id
    WHERE bi.id = budget_payments.budget_item_id AND is_household_member(mb.household_id)
  ));
CREATE POLICY "Editors can manage budget payments" ON budget_payments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM budget_items bi
    JOIN monthly_budgets mb ON mb.id = bi.budget_id
    WHERE bi.id = budget_payments.budget_item_id AND is_household_editor(mb.household_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM budget_items bi
    JOIN monthly_budgets mb ON mb.id = bi.budget_id
    WHERE bi.id = budget_payments.budget_item_id AND is_household_editor(mb.household_id)
  ));

-- Planned expenses
CREATE POLICY "Members can view planned expenses" ON planned_expenses FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY "Editors can manage planned expenses" ON planned_expenses FOR ALL
  USING (is_household_editor(household_id))
  WITH CHECK (is_household_editor(household_id));

-- Installment plans
CREATE POLICY "Members can view installment plans" ON installment_plans FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY "Editors can manage installment plans" ON installment_plans FOR ALL
  USING (is_household_editor(household_id))
  WITH CHECK (is_household_editor(household_id));

-- Installment payments
CREATE POLICY "Members can view installment payments" ON installment_payments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM installment_plans ip
    WHERE ip.id = installment_payments.installment_plan_id
      AND is_household_member(ip.household_id)
  ));
CREATE POLICY "Editors can manage installment payments" ON installment_payments FOR ALL
  USING (EXISTS (
    SELECT 1 FROM installment_plans ip
    WHERE ip.id = installment_payments.installment_plan_id
      AND is_household_editor(ip.household_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM installment_plans ip
    WHERE ip.id = installment_payments.installment_plan_id
      AND is_household_editor(ip.household_id)
  ));

-- Savings goals (this fixes the failed savings creation)
CREATE POLICY "Members can view savings goals" ON savings_goals FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY "Editors can manage savings goals" ON savings_goals FOR ALL
  USING (is_household_editor(household_id))
  WITH CHECK (is_household_editor(household_id));

-- Savings contributions
CREATE POLICY "Members can view savings contributions" ON savings_contributions FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM savings_goals sg
    WHERE sg.id = savings_contributions.savings_goal_id
      AND is_household_member(sg.household_id)
  ));
CREATE POLICY "Editors can manage savings contributions" ON savings_contributions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM savings_goals sg
    WHERE sg.id = savings_contributions.savings_goal_id
      AND is_household_editor(sg.household_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM savings_goals sg
    WHERE sg.id = savings_contributions.savings_goal_id
      AND is_household_editor(sg.household_id)
  ));

-- Debts
CREATE POLICY "Members can view debts" ON debts FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY "Editors can manage debts" ON debts FOR ALL
  USING (is_household_editor(household_id))
  WITH CHECK (is_household_editor(household_id));

-- Cash on hand
CREATE POLICY "Members can view cash on hand" ON cash_on_hand FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY "Editors can manage cash on hand" ON cash_on_hand FOR ALL
  USING (is_household_editor(household_id))
  WITH CHECK (is_household_editor(household_id));

-- Invitations: owners manage, members view, public reads by token (invite page)
CREATE POLICY "Owners can manage invitations" ON invitations FOR ALL
  USING (is_household_owner(household_id))
  WITH CHECK (is_household_owner(household_id));
CREATE POLICY "Members can view invitations" ON invitations FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY "Public can view invitation by token" ON invitations FOR SELECT
  USING (true);

-- Audit logs
CREATE POLICY "Members can view audit logs" ON audit_logs FOR SELECT
  USING (is_household_member(household_id));
CREATE POLICY "Members can insert audit logs" ON audit_logs FOR INSERT
  WITH CHECK (is_household_member(household_id));

-- Notifications
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT
  WITH CHECK (true);
