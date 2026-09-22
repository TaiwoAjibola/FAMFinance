-- FIX: Use a SECURITY DEFINER function to break the recursion
-- This function bypasses RLS when checking membership

CREATE OR REPLACE FUNCTION is_household_member(household_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members 
    WHERE household_id = household_uuid AND user_id = auth.uid()
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

-- Drop ALL existing policies, then recreate
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

-- Users
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);

-- Households
DROP POLICY IF EXISTS "Owner can manage household" ON households;
CREATE POLICY "Owner can manage household" ON households FOR ALL
  USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "Members can view household" ON households;
CREATE POLICY "Members can view household" ON households FOR SELECT
  USING (owner_id = auth.uid() OR is_household_member(id));

-- Household members
DROP POLICY IF EXISTS "Members can view own membership" ON household_members;
CREATE POLICY "Members can view own membership" ON household_members FOR SELECT
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Authenticated can insert membership" ON household_members;
CREATE POLICY "Authenticated can insert membership" ON household_members FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Owner can update members" ON household_members;
CREATE POLICY "Owner can update members" ON household_members FOR UPDATE
  USING (household_id IN (SELECT id FROM households WHERE owner_id = auth.uid()));
DROP POLICY IF EXISTS "Owner can delete members" ON household_members;
CREATE POLICY "Owner can delete members" ON household_members FOR DELETE
  USING (household_id IN (SELECT id FROM households WHERE owner_id = auth.uid()));

-- Accounts
DROP POLICY IF EXISTS "Members can view accounts" ON accounts;
CREATE POLICY "Members can view accounts" ON accounts FOR SELECT USING (is_household_member(household_id));
DROP POLICY IF EXISTS "Members can insert accounts" ON accounts;
CREATE POLICY "Members can insert accounts" ON accounts FOR INSERT WITH CHECK (is_household_member(household_id));
DROP POLICY IF EXISTS "Members can update accounts" ON accounts;
CREATE POLICY "Members can update accounts" ON accounts FOR UPDATE USING (is_household_member(household_id));
DROP POLICY IF EXISTS "Members can delete accounts" ON accounts;
CREATE POLICY "Members can delete accounts" ON accounts FOR DELETE USING (is_household_member(household_id));

-- Categories
DROP POLICY IF EXISTS "Members can manage categories" ON categories;
CREATE POLICY "Members can manage categories" ON categories FOR ALL USING (is_household_member(household_id));

-- Transactions
DROP POLICY IF EXISTS "Members can manage transactions" ON transactions;
CREATE POLICY "Members can manage transactions" ON transactions FOR ALL USING (is_household_member(household_id));

-- Recurring expenses
DROP POLICY IF EXISTS "Members can manage recurring expenses" ON recurring_expenses;
CREATE POLICY "Members can manage recurring expenses" ON recurring_expenses FOR ALL USING (is_household_member(household_id));

-- Budgets
DROP POLICY IF EXISTS "Members can manage budgets" ON monthly_budgets;
CREATE POLICY "Members can manage budgets" ON monthly_budgets FOR ALL USING (is_household_member(household_id));

-- Budget items
DROP POLICY IF EXISTS "Members can manage budget items" ON budget_items;
CREATE POLICY "Members can manage budget items" ON budget_items FOR ALL
  USING (budget_id IN (SELECT id FROM monthly_budgets WHERE is_household_member(household_id)));

-- Budget payments
DROP POLICY IF EXISTS "Members can manage budget payments" ON budget_payments;
CREATE POLICY "Members can manage budget payments" ON budget_payments FOR ALL
  USING (budget_item_id IN (
    SELECT id FROM budget_items WHERE budget_id IN (
      SELECT id FROM monthly_budgets WHERE is_household_member(household_id)
    )
  ));

-- Planned expenses
DROP POLICY IF EXISTS "Members can manage planned expenses" ON planned_expenses;
CREATE POLICY "Members can manage planned expenses" ON planned_expenses FOR ALL USING (is_household_member(household_id));

-- Installment plans
DROP POLICY IF EXISTS "Members can manage installment plans" ON installment_plans;
CREATE POLICY "Members can manage installment plans" ON installment_plans FOR ALL USING (is_household_member(household_id));

-- Installment payments
DROP POLICY IF EXISTS "Members can manage installment payments" ON installment_payments;
CREATE POLICY "Members can manage installment payments" ON installment_payments FOR ALL
  USING (installment_plan_id IN (SELECT id FROM installment_plans WHERE is_household_member(household_id)));

-- Savings goals
DROP POLICY IF EXISTS "Members can manage savings goals" ON savings_goals;
CREATE POLICY "Members can manage savings goals" ON savings_goals FOR ALL USING (is_household_member(household_id));

-- Savings contributions
DROP POLICY IF EXISTS "Members can manage savings contributions" ON savings_contributions;
CREATE POLICY "Members can manage savings contributions" ON savings_contributions FOR ALL
  USING (savings_goal_id IN (SELECT id FROM savings_goals WHERE is_household_member(household_id)));

-- Cash on hand
DROP POLICY IF EXISTS "Members can manage cash on hand" ON cash_on_hand;
CREATE POLICY "Members can manage cash on hand" ON cash_on_hand FOR ALL USING (is_household_member(household_id));

-- Invitations
DROP POLICY IF EXISTS "Members can manage invitations" ON invitations;
CREATE POLICY "Members can manage invitations" ON invitations FOR ALL USING (is_household_member(household_id));

-- Audit logs
DROP POLICY IF EXISTS "Members can manage audit logs" ON audit_logs;
CREATE POLICY "Members can manage audit logs" ON audit_logs FOR ALL USING (is_household_member(household_id));

-- Notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (true);
