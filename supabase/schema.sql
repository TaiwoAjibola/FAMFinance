-- FamFinance Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Households
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES users(id),
  currency TEXT NOT NULL DEFAULT 'NGN',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Household members
CREATE TABLE IF NOT EXISTS household_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, user_id)
);

-- Accounts
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bank', 'cash', 'savings', 'other')),
  balance INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT,
  color TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id),
  to_account_id UUID REFERENCES accounts(id),
  category_id UUID REFERENCES categories(id),
  type TEXT NOT NULL CHECK (type IN ('expense', 'income', 'transfer', 'refund', 'adjustment')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  date DATE NOT NULL,
  notes TEXT,
  receipt_url TEXT,
  planned_expense_id UUID,
  installment_payment_id UUID,
  budget_item_id UUID REFERENCES budget_items(id),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recurring expenses
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  start_date DATE NOT NULL,
  end_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monthly budgets
CREATE TABLE IF NOT EXISTS monthly_budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- Format: YYYY-MM
  total_income INTEGER NOT NULL DEFAULT 0,
  total_expenses INTEGER NOT NULL DEFAULT 0,
  total_savings INTEGER NOT NULL DEFAULT 0,
  cash_on_hand_target INTEGER NOT NULL DEFAULT 133000,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, month)
);

-- Budget items
CREATE TABLE IF NOT EXISTS budget_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  budget_id UUID NOT NULL REFERENCES monthly_budgets(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id),
  custom_name TEXT,
  budgeted_amount INTEGER NOT NULL DEFAULT 0,
  spent_amount INTEGER NOT NULL DEFAULT 0,
  is_recurring BOOLEAN NOT NULL DEFAULT false
);

-- Budget payments (individual payments against budget items)
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

-- Planned expenses
CREATE TABLE IF NOT EXISTS planned_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  target_month TEXT NOT NULL, -- Format: YYYY-MM
  due_date DATE,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'partially_paid', 'paid', 'deferred', 'cancelled')),
  category_id UUID REFERENCES categories(id),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Installment plans
CREATE TABLE IF NOT EXISTS installment_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  planned_expense_id UUID NOT NULL REFERENCES planned_expenses(id) ON DELETE CASCADE,
  total_amount INTEGER NOT NULL CHECK (total_amount > 0),
  num_installments INTEGER NOT NULL CHECK (num_installments > 1),
  installment_amount INTEGER NOT NULL CHECK (installment_amount > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Installment payments
CREATE TABLE IF NOT EXISTS installment_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  installment_plan_id UUID NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  transaction_id UUID REFERENCES transactions(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Savings goals
CREATE TABLE IF NOT EXISTS savings_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount INTEGER NOT NULL CHECK (target_amount > 0),
  current_amount INTEGER NOT NULL DEFAULT 0,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Savings contributions
CREATE TABLE IF NOT EXISTS savings_contributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  savings_goal_id UUID NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('contribution', 'withdrawal')),
  date DATE NOT NULL,
  notes TEXT,
  transaction_id UUID REFERENCES transactions(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cash on hand
CREATE TABLE IF NOT EXISTS cash_on_hand (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  month TEXT NOT NULL, -- Format: YYYY-MM
  target_amount INTEGER NOT NULL DEFAULT 133000,
  current_amount INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(household_id, month)
);

-- Invitations
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  invited_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  changes JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('reminder', 'alert', 'info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  entity_type TEXT,
  entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_on_hand ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies: Users can read their own data
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);

-- Policies: Household members can view their household
CREATE POLICY "Members can view household" ON households FOR SELECT
  USING (id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

-- Policies: Household members can view other members
CREATE POLICY "Members can view household members" ON household_members FOR SELECT
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

-- Policies: Household members can manage accounts
CREATE POLICY "Members can view accounts" ON accounts FOR SELECT
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can insert accounts" ON accounts FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can update accounts" ON accounts FOR UPDATE
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can delete accounts" ON accounts FOR DELETE
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

-- Policies: Household members can manage categories
CREATE POLICY "Members can view categories" ON categories FOR SELECT
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage categories" ON categories FOR ALL
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

-- Policies: Household members can manage transactions
CREATE POLICY "Members can view transactions" ON transactions FOR SELECT
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage transactions" ON transactions FOR ALL
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

-- Policies: Household members can manage recurring expenses
CREATE POLICY "Members can view recurring expenses" ON recurring_expenses FOR SELECT
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage recurring expenses" ON recurring_expenses FOR ALL
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

-- Policies: Household members can manage budgets
CREATE POLICY "Members can view budgets" ON monthly_budgets FOR SELECT
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage budgets" ON monthly_budgets FOR ALL
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

-- Policies: Budget items
CREATE POLICY "Members can view budget items" ON budget_items FOR SELECT
  USING (budget_id IN (SELECT id FROM monthly_budgets WHERE household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())));
CREATE POLICY "Members can manage budget items" ON budget_items FOR ALL
  USING (budget_id IN (SELECT id FROM monthly_budgets WHERE household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())));

-- Policies: Planned expenses
CREATE POLICY "Members can view planned expenses" ON planned_expenses FOR SELECT
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage planned expenses" ON planned_expenses FOR ALL
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

-- Policies: Installment plans
CREATE POLICY "Members can view installment plans" ON installment_plans FOR SELECT
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage installment plans" ON installment_plans FOR ALL
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

-- Policies: Installment payments
CREATE POLICY "Members can view installment payments" ON installment_payments FOR SELECT
  USING (installment_plan_id IN (SELECT id FROM installment_plans WHERE household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())));
CREATE POLICY "Members can manage installment payments" ON installment_payments FOR ALL
  USING (installment_plan_id IN (SELECT id FROM installment_plans WHERE household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())));

-- Policies: Savings goals
CREATE POLICY "Members can view savings goals" ON savings_goals FOR SELECT
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage savings goals" ON savings_goals FOR ALL
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

-- Policies: Savings contributions
CREATE POLICY "Members can view savings contributions" ON savings_contributions FOR SELECT
  USING (savings_goal_id IN (SELECT id FROM savings_goals WHERE household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())));
CREATE POLICY "Members can manage savings contributions" ON savings_contributions FOR ALL
  USING (savings_goal_id IN (SELECT id FROM savings_goals WHERE household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())));

-- Policies: Cash on hand
CREATE POLICY "Members can view cash on hand" ON cash_on_hand FOR SELECT
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can manage cash on hand" ON cash_on_hand FOR ALL
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

-- Policies: Invitations
CREATE POLICY "Members can view invitations" ON invitations FOR SELECT
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
CREATE POLICY "Owners can manage invitations" ON invitations FOR ALL
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid() AND role = 'owner'));

-- Policies: Audit logs
CREATE POLICY "Members can view audit logs" ON audit_logs FOR SELECT
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can insert audit logs" ON audit_logs FOR INSERT
  WITH CHECK (household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid()));

-- Policies: Notifications
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX idx_accounts_household ON accounts(household_id);
CREATE INDEX idx_transactions_household ON transactions(household_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_categories_household ON categories(household_id);
CREATE INDEX idx_monthly_budgets_household_month ON monthly_budgets(household_id, month);
CREATE INDEX idx_planned_expenses_household ON planned_expenses(household_id);
CREATE INDEX idx_savings_goals_household ON savings_goals(household_id);
CREATE INDEX idx_cash_on_hand_household_month ON cash_on_hand(household_id, month);
