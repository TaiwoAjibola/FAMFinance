-- FIX: Use a SECURITY DEFINER function to break the recursion
-- This function bypasses RLS when checking membership

CREATE OR REPLACE FUNCTION is_household_member(household_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members 
    WHERE household_id = household_uuid AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Drop ALL existing policies
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

-- Recreate policies using the function (no recursion)

-- Users
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- Households: owner can do everything, members can view
CREATE POLICY "Owner can manage household" ON households FOR ALL
  USING (owner_id = auth.uid());
CREATE POLICY "Members can view household" ON households FOR SELECT
  USING (owner_id = auth.uid() OR is_household_member(id));

-- Household members
CREATE POLICY "Members can view own membership" ON household_members FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Authenticated can insert membership" ON household_members FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Owner can update members" ON household_members FOR UPDATE
  USING (household_id IN (SELECT id FROM households WHERE owner_id = auth.uid()));
CREATE POLICY "Owner can delete members" ON household_members FOR DELETE
  USING (household_id IN (SELECT id FROM households WHERE owner_id = auth.uid()));

-- All other tables use the same pattern
CREATE POLICY "Members can view accounts" ON accounts FOR SELECT USING (is_household_member(household_id));
CREATE POLICY "Members can insert accounts" ON accounts FOR INSERT WITH CHECK (is_household_member(household_id));
CREATE POLICY "Members can update accounts" ON accounts FOR UPDATE USING (is_household_member(household_id));
CREATE POLICY "Members can delete accounts" ON accounts FOR DELETE USING (is_household_member(household_id));

CREATE POLICY "Members can manage categories" ON categories FOR ALL USING (is_household_member(household_id));

CREATE POLICY "Members can manage transactions" ON transactions FOR ALL USING (is_household_member(household_id));

CREATE POLICY "Members can manage recurring expenses" ON recurring_expenses FOR ALL USING (is_household_member(household_id));

CREATE POLICY "Members can manage budgets" ON monthly_budgets FOR ALL USING (is_household_member(household_id));

CREATE POLICY "Members can manage budget items" ON budget_items FOR ALL
  USING (budget_id IN (SELECT id FROM monthly_budgets WHERE is_household_member(household_id)));

CREATE POLICY "Members can manage planned expenses" ON planned_expenses FOR ALL USING (is_household_member(household_id));

CREATE POLICY "Members can manage installment plans" ON installment_plans FOR ALL USING (is_household_member(household_id));

CREATE POLICY "Members can manage installment payments" ON installment_payments FOR ALL
  USING (installment_plan_id IN (SELECT id FROM installment_plans WHERE is_household_member(household_id)));

CREATE POLICY "Members can manage savings goals" ON savings_goals FOR ALL USING (is_household_member(household_id));

CREATE POLICY "Members can manage savings contributions" ON savings_contributions FOR ALL
  USING (savings_goal_id IN (SELECT id FROM savings_goals WHERE is_household_member(household_id)));

CREATE POLICY "Members can manage cash on hand" ON cash_on_hand FOR ALL USING (is_household_member(household_id));

CREATE POLICY "Members can manage invitations" ON invitations FOR ALL USING (is_household_member(household_id));

CREATE POLICY "Members can manage audit logs" ON audit_logs FOR ALL USING (is_household_member(household_id));

CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (true);
