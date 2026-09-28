-- First, see what roles exist and clean up
UPDATE household_members SET role = 'editor' WHERE role = 'member';
UPDATE household_members SET role = 'editor' WHERE role IS NULL OR role NOT IN ('owner', 'editor', 'viewer');

-- Update role constraints to 3 roles
ALTER TABLE household_members 
  DROP CONSTRAINT IF EXISTS household_members_role_check,
  ADD CONSTRAINT household_members_role_check 
  CHECK (role IN ('owner', 'editor', 'viewer'));

ALTER TABLE invitations 
  DROP CONSTRAINT IF EXISTS invitations_role_check,
  ADD CONSTRAINT invitations_role_check 
  CHECK (role IN ('owner', 'editor', 'viewer'));

-- RLS: viewers = SELECT only
DROP POLICY IF EXISTS "Members can manage transactions" ON transactions;
CREATE POLICY "Owners and editors can manage transactions" ON transactions FOR ALL
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
  ));
CREATE POLICY "Viewers can view transactions" ON transactions FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role = 'viewer'
  ));

DROP POLICY IF EXISTS "Members can manage accounts" ON accounts;
CREATE POLICY "Owners and editors can manage accounts" ON accounts FOR ALL
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
  ));
CREATE POLICY "Viewers can view accounts" ON accounts FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role = 'viewer'
  ));

DROP POLICY IF EXISTS "Members can manage categories" ON categories;
CREATE POLICY "Owners and editors can manage categories" ON categories FOR ALL
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
  ));
CREATE POLICY "Viewers can view categories" ON categories FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role = 'viewer'
  ));

DROP POLICY IF EXISTS "Members can manage budget items" ON budget_items;
CREATE POLICY "Owners and editors can manage budget items" ON budget_items FOR ALL
  USING (budget_id IN (
    SELECT id FROM monthly_budgets WHERE household_id IN (
      SELECT household_id FROM household_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
    )
  ));
CREATE POLICY "Viewers can view budget items" ON budget_items FOR SELECT
  USING (budget_id IN (
    SELECT id FROM monthly_budgets WHERE household_id IN (
      SELECT household_id FROM household_members 
      WHERE user_id = auth.uid() AND role = 'viewer'
    )
  ));

DROP POLICY IF EXISTS "Members can manage budget payments" ON budget_payments;
CREATE POLICY "Owners and editors can manage budget payments" ON budget_payments FOR ALL
  USING (budget_item_id IN (
    SELECT id FROM budget_items WHERE budget_id IN (
      SELECT id FROM monthly_budgets WHERE household_id IN (
        SELECT household_id FROM household_members 
        WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
      )
    )
  ));
CREATE POLICY "Viewers can view budget payments" ON budget_payments FOR SELECT
  USING (budget_item_id IN (
    SELECT id FROM budget_items WHERE budget_id IN (
      SELECT id FROM monthly_budgets WHERE household_id IN (
        SELECT household_id FROM household_members 
        WHERE user_id = auth.uid() AND role = 'viewer'
      )
    )
  ));

DROP POLICY IF EXISTS "Members can manage planned expenses" ON planned_expenses;
CREATE POLICY "Owners and editors can manage planned expenses" ON planned_expenses FOR ALL
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
  ));
CREATE POLICY "Viewers can view planned expenses" ON planned_expenses FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role = 'viewer'
  ));

DROP POLICY IF EXISTS "Members can manage installment plans" ON installment_plans;
CREATE POLICY "Owners and editors can manage installment plans" ON installment_plans FOR ALL
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
  ));
CREATE POLICY "Viewers can view installment plans" ON installment_plans FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role = 'viewer'
  ));

DROP POLICY IF EXISTS "Members can manage installment payments" ON installment_payments;
CREATE POLICY "Owners and editors can manage installment payments" ON installment_payments FOR ALL
  USING (installment_plan_id IN (
    SELECT id FROM installment_plans WHERE household_id IN (
      SELECT household_id FROM household_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
    )
  ));
CREATE POLICY "Viewers can view installment payments" ON installment_payments FOR SELECT
  USING (installment_plan_id IN (
    SELECT id FROM installment_plans WHERE household_id IN (
      SELECT household_id FROM household_members 
      WHERE user_id = auth.uid() AND role = 'viewer'
    )
  ));

DROP POLICY IF EXISTS "Members can manage savings goals" ON savings_goals;
CREATE POLICY "Owners and editors can manage savings goals" ON savings_goals FOR ALL
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
  ));
CREATE POLICY "Viewers can view savings goals" ON savings_goals FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role = 'viewer'
  ));

DROP POLICY IF EXISTS "Members can manage savings contributions" ON savings_contributions;
CREATE POLICY "Owners and editors can manage savings contributions" ON savings_contributions FOR ALL
  USING (savings_goal_id IN (
    SELECT id FROM savings_goals WHERE household_id IN (
      SELECT household_id FROM household_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
    )
  ));
CREATE POLICY "Viewers can view savings contributions" ON savings_contributions FOR SELECT
  USING (savings_goal_id IN (
    SELECT id FROM savings_goals WHERE household_id IN (
      SELECT household_id FROM household_members 
      WHERE user_id = auth.uid() AND role = 'viewer'
    )
  ));

DROP POLICY IF EXISTS "Members can manage debts" ON debts;
CREATE POLICY "Owners and editors can manage debts" ON debts FOR ALL
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'editor')
  ));
CREATE POLICY "Viewers can view debts" ON debts FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role = 'viewer'
  ));

DROP POLICY IF EXISTS "Members can manage invitations" ON invitations;
CREATE POLICY "Owners can manage invitations" ON invitations FOR ALL
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role = 'owner'
  ));
CREATE POLICY "Editors and viewers can view invitations" ON invitations FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role IN ('editor', 'viewer')
  ));

-- Household members: only owners can manage
DROP POLICY IF EXISTS "Members can manage household members" ON household_members;
CREATE POLICY "Owners can manage household members" ON household_members FOR ALL
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid() AND role = 'owner'
  ));
CREATE POLICY "Members can view household members" ON household_members FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM household_members 
    WHERE user_id = auth.uid()
  ));