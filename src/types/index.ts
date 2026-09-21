export interface User {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  created_at: string
}

export interface Household {
  id: string
  name: string
  owner_id: string
  currency: string
  created_at: string
}

export interface HouseholdMember {
  id: string
  household_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
  user?: User
}

export interface Invitation {
  id: string
  household_id: string
  email: string
  role: 'owner' | 'member'
  status: 'pending' | 'accepted' | 'expired'
  invited_by: string
  created_at: string
  expires_at: string
}

export type AccountType = 'bank' | 'cash' | 'savings' | 'other'

export interface Account {
  id: string
  household_id: string
  name: string
  type: AccountType
  balance: number
  currency: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  household_id: string
  name: string
  type: 'income' | 'expense'
  icon?: string
  color?: string
  is_recurring: boolean
  sort_order: number
}

export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment'

export interface Transaction {
  id: string
  household_id: string
  account_id: string
  to_account_id?: string
  category_id?: string
  type: TransactionType
  amount: number
  description: string
  date: string
  notes?: string
  receipt_url?: string
  planned_expense_id?: string
  installment_payment_id?: string
  created_by: string
  created_at: string
  updated_at: string
  account?: Account
  to_account?: Account
  category?: Category
  creator?: User
}

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'

export interface RecurringExpense {
  id: string
  household_id: string
  category_id: string
  name: string
  amount: number
  frequency: RecurrenceFrequency
  start_date: string
  end_date?: string
  is_active: boolean
  effective_date: string
  created_at: string
  category?: Category
}

export interface MonthlyBudget {
  id: string
  household_id: string
  month: string
  total_income: number
  total_expenses: number
  total_savings: number
  cash_on_hand_target: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface BudgetItem {
  id: string
  budget_id: string
  category_id: string
  budgeted_amount: number
  spent_amount: number
  category?: Category
}

export type PlannedExpenseStatus = 'planned' | 'partially_paid' | 'paid' | 'deferred' | 'cancelled'
export type PlannedExpensePriority = 'low' | 'medium' | 'high' | 'critical'

export interface PlannedExpense {
  id: string
  household_id: string
  title: string
  amount: number
  target_month: string
  due_date?: string
  priority: PlannedExpensePriority
  status: PlannedExpenseStatus
  category_id?: string
  notes?: string
  created_by: string
  created_at: string
  updated_at: string
  category?: Category
}

export interface InstallmentPlan {
  id: string
  household_id: string
  planned_expense_id: string
  total_amount: number
  num_installments: number
  installment_amount: number
  status: 'active' | 'completed' | 'cancelled'
  created_at: string
  planned_expense?: PlannedExpense
}

export interface InstallmentPayment {
  id: string
  installment_plan_id: string
  installment_number: number
  amount: number
  due_date: string
  paid_date?: string
  status: 'pending' | 'paid' | 'overdue'
  transaction_id?: string
  created_at: string
}

export type SavingsGoalStatus = 'active' | 'completed' | 'paused' | 'cancelled'

export interface SavingsGoal {
  id: string
  household_id: string
  name: string
  target_amount: number
  current_amount: number
  target_date?: string
  status: SavingsGoalStatus
  notes?: string
  created_at: string
  updated_at: string
}

export interface SavingsContribution {
  id: string
  savings_goal_id: string
  amount: number
  type: 'contribution' | 'withdrawal'
  date: string
  notes?: string
  transaction_id?: string
  created_at: string
}

export interface CashOnHand {
  id: string
  household_id: string
  month: string
  target_amount: number
  current_amount: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  household_id: string
  user_id: string
  entity_type: string
  entity_id: string
  action: 'create' | 'update' | 'delete'
  changes: Record<string, { old: unknown; new: unknown }>
  created_at: string
  user?: User
}

export interface Notification {
  id: string
  household_id: string
  user_id: string
  type: 'reminder' | 'alert' | 'info'
  title: string
  message: string
  is_read: boolean
  entity_type?: string
  entity_id?: string
  created_at: string
}

export interface MonthlySummary {
  month: string
  opening_balance: number
  total_income: number
  total_expenses: number
  total_savings: number
  total_transfers: number
  closing_balance: number
  budget_variance: number
  outstanding_planned: number
  unpaid_obligations: number
  carryover: number
}
