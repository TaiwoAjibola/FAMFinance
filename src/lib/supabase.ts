import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          email: string
          full_name: string
          avatar_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string
          avatar_url?: string | null
          created_at?: string
        }
      }
      households: {
        Row: {
          id: string
          name: string
          owner_id: string
          currency: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          owner_id: string
          currency?: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          owner_id?: string
          currency?: string
          created_at?: string
        }
      }
      household_members: {
        Row: {
          id: string
          household_id: string
          user_id: string
          role: 'owner' | 'member'
          joined_at: string
        }
        Insert: {
          id?: string
          household_id: string
          user_id: string
          role?: 'owner' | 'member'
          joined_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          user_id?: string
          role?: 'owner' | 'member'
          joined_at?: string
        }
      }
      accounts: {
        Row: {
          id: string
          household_id: string
          name: string
          type: 'bank' | 'cash' | 'savings' | 'other'
          balance: number
          currency: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          type: 'bank' | 'cash' | 'savings' | 'other'
          balance?: number
          currency?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          type?: 'bank' | 'cash' | 'savings' | 'other'
          balance?: number
          currency?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      categories: {
        Row: {
          id: string
          household_id: string
          name: string
          type: 'income' | 'expense'
          icon: string | null
          color: string | null
          is_recurring: boolean
          sort_order: number
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          type: 'income' | 'expense'
          icon?: string | null
          color?: string | null
          is_recurring?: boolean
          sort_order?: number
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          type?: 'income' | 'expense'
          icon?: string | null
          color?: string | null
          is_recurring?: boolean
          sort_order?: number
        }
      }
      transactions: {
        Row: {
          id: string
          household_id: string
          account_id: string
          to_account_id: string | null
          category_id: string | null
          type: 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment'
          amount: number
          description: string
          date: string
          notes: string | null
          receipt_url: string | null
          planned_expense_id: string | null
          installment_payment_id: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          account_id: string
          to_account_id?: string | null
          category_id?: string | null
          type: 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment'
          amount: number
          description: string
          date: string
          notes?: string | null
          receipt_url?: string | null
          planned_expense_id?: string | null
          installment_payment_id?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          account_id?: string
          to_account_id?: string | null
          category_id?: string | null
          type?: 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment'
          amount?: number
          description?: string
          date?: string
          notes?: string | null
          receipt_url?: string | null
          planned_expense_id?: string | null
          installment_payment_id?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      recurring_expenses: {
        Row: {
          id: string
          household_id: string
          category_id: string
          name: string
          amount: number
          frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
          start_date: string
          end_date: string | null
          is_active: boolean
          effective_date: string
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          category_id: string
          name: string
          amount: number
          frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
          start_date: string
          end_date?: string | null
          is_active?: boolean
          effective_date?: string
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          category_id?: string
          name?: string
          amount?: number
          frequency?: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'
          start_date?: string
          end_date?: string | null
          is_active?: boolean
          effective_date?: string
          created_at?: string
        }
      }
      monthly_budgets: {
        Row: {
          id: string
          household_id: string
          month: string
          total_income: number
          total_expenses: number
          total_savings: number
          cash_on_hand_target: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          month: string
          total_income?: number
          total_expenses?: number
          total_savings?: number
          cash_on_hand_target?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          month?: string
          total_income?: number
          total_expenses?: number
          total_savings?: number
          cash_on_hand_target?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      budget_items: {
        Row: {
          id: string
          budget_id: string
          category_id: string
          budgeted_amount: number
          spent_amount: number
        }
        Insert: {
          id?: string
          budget_id: string
          category_id: string
          budgeted_amount?: number
          spent_amount?: number
        }
        Update: {
          id?: string
          budget_id?: string
          category_id?: string
          budgeted_amount?: number
          spent_amount?: number
        }
      }
      planned_expenses: {
        Row: {
          id: string
          household_id: string
          title: string
          amount: number
          target_month: string
          due_date: string | null
          priority: 'low' | 'medium' | 'high' | 'critical'
          status: 'planned' | 'partially_paid' | 'paid' | 'deferred' | 'cancelled'
          category_id: string | null
          notes: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          title: string
          amount: number
          target_month: string
          due_date?: string | null
          priority?: 'low' | 'medium' | 'high' | 'critical'
          status?: 'planned' | 'partially_paid' | 'paid' | 'deferred' | 'cancelled'
          category_id?: string | null
          notes?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          title?: string
          amount?: number
          target_month?: string
          due_date?: string | null
          priority?: 'low' | 'medium' | 'high' | 'critical'
          status?: 'planned' | 'partially_paid' | 'paid' | 'deferred' | 'cancelled'
          category_id?: string | null
          notes?: string | null
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      installment_plans: {
        Row: {
          id: string
          household_id: string
          planned_expense_id: string
          total_amount: number
          num_installments: number
          installment_amount: number
          status: 'active' | 'completed' | 'cancelled'
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          planned_expense_id: string
          total_amount: number
          num_installments: number
          installment_amount: number
          status?: 'active' | 'completed' | 'cancelled'
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          planned_expense_id?: string
          total_amount?: number
          num_installments?: number
          installment_amount?: number
          status?: 'active' | 'completed' | 'cancelled'
          created_at?: string
        }
      }
      installment_payments: {
        Row: {
          id: string
          installment_plan_id: string
          installment_number: number
          amount: number
          due_date: string
          paid_date: string | null
          status: 'pending' | 'paid' | 'overdue'
          transaction_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          installment_plan_id: string
          installment_number: number
          amount: number
          due_date: string
          paid_date?: string | null
          status?: 'pending' | 'paid' | 'overdue'
          transaction_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          installment_plan_id?: string
          installment_number?: number
          amount?: number
          due_date?: string
          paid_date?: string | null
          status?: 'pending' | 'paid' | 'overdue'
          transaction_id?: string | null
          created_at?: string
        }
      }
      savings_goals: {
        Row: {
          id: string
          household_id: string
          name: string
          target_amount: number
          current_amount: number
          target_date: string | null
          status: 'active' | 'completed' | 'paused' | 'cancelled'
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          name: string
          target_amount: number
          current_amount?: number
          target_date?: string | null
          status?: 'active' | 'completed' | 'paused' | 'cancelled'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          name?: string
          target_amount?: number
          current_amount?: number
          target_date?: string | null
          status?: 'active' | 'completed' | 'paused' | 'cancelled'
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      savings_contributions: {
        Row: {
          id: string
          savings_goal_id: string
          amount: number
          type: 'contribution' | 'withdrawal'
          date: string
          notes: string | null
          transaction_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          savings_goal_id: string
          amount: number
          type: 'contribution' | 'withdrawal'
          date: string
          notes?: string | null
          transaction_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          savings_goal_id?: string
          amount?: number
          type?: 'contribution' | 'withdrawal'
          date?: string
          notes?: string | null
          transaction_id?: string | null
          created_at?: string
        }
      }
      cash_on_hand: {
        Row: {
          id: string
          household_id: string
          month: string
          target_amount: number
          current_amount: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          household_id: string
          month: string
          target_amount?: number
          current_amount?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          month?: string
          target_amount?: number
          current_amount?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      invitations: {
        Row: {
          id: string
          household_id: string
          email: string
          role: 'owner' | 'member'
          status: 'pending' | 'accepted' | 'expired'
          invited_by: string
          created_at: string
          expires_at: string
        }
        Insert: {
          id?: string
          household_id: string
          email: string
          role?: 'owner' | 'member'
          status?: 'pending' | 'accepted' | 'expired'
          invited_by: string
          created_at?: string
          expires_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          email?: string
          role?: 'owner' | 'member'
          status?: 'pending' | 'accepted' | 'expired'
          invited_by?: string
          created_at?: string
          expires_at?: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          household_id: string
          user_id: string
          entity_type: string
          entity_id: string
          action: 'create' | 'update' | 'delete'
          changes: Record<string, { old: unknown; new: unknown }>
          created_at: string
        }
        Insert: {
          id?: string
          household_id: string
          user_id: string
          entity_type: string
          entity_id: string
          action: 'create' | 'update' | 'delete'
          changes: Record<string, { old: unknown; new: unknown }>
          created_at?: string
        }
        Update: {
          id?: string
          household_id?: string
          user_id?: string
          entity_type?: string
          entity_id?: string
          action?: 'create' | 'update' | 'delete'
          changes?: Record<string, { old: unknown; new: unknown }>
          created_at?: string
        }
      }
    }
  }
}
