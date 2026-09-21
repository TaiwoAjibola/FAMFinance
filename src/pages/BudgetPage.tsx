import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency, getCurrentMonth, getMonthLabel } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { Calendar, Edit2, Check, X } from 'lucide-react'
import type { Category, BudgetItem, MonthlyBudget, RecurringExpense } from '@/types'

const INITIAL_OPERATING_EXPENSES = [
  { name: 'Food and food-related', amount: 200000 },
  { name: 'Transportation', amount: 60000 },
  { name: "Daughter's needs", amount: 40000 },
  { name: 'Other household costs', amount: 50000 },
  { name: 'Internet', amount: 30000 },
  { name: 'Theological seminary', amount: 28000 },
  { name: 'Cooking gas', amount: 19200 },
  { name: 'Water', amount: 14000 },
  { name: 'Electricity', amount: 10000 },
  { name: 'Dustbin', amount: 10000 },
]

export function BudgetPage() {
  const { household } = useHousehold()
  const [budget, setBudget] = useState<MonthlyBudget | null>(null)
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([])
  const [loading, setLoading] = useState(true)
  const [editingBudget, setEditingBudget] = useState(false)
  const [form, setForm] = useState({ cash_on_hand_target: '' })
  const currentMonth = getCurrentMonth()

  useEffect(() => {
    if (!household) return
    fetchData()
  }, [household])

  const fetchData = async () => {
    if (!household) return
    setLoading(true)

    // Fetch or create budget
    let { data: budgetData } = await supabase
      .from('monthly_budgets')
      .select('*')
      .eq('household_id', household.id)
      .eq('month', currentMonth)
      .single()

    if (!budgetData) {
      const { data: newBudget } = await supabase
        .from('monthly_budgets')
        .insert({
          household_id: household.id,
          month: currentMonth,
          cash_on_hand_target: 133000,
        })
        .select()
        .single()
      budgetData = newBudget
    }

    setBudget(budgetData)

    // Fetch categories
    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .eq('household_id', household.id)
      .eq('type', 'expense')
    setCategories(cats || [])

    // Fetch budget items
    if (budgetData) {
      const { data: items } = await supabase
        .from('budget_items')
        .select('*')
        .eq('budget_id', budgetData.id)
      setBudgetItems(items || [])
    }

    // Fetch recurring expenses
    const { data: recurring } = await supabase
      .from('recurring_expenses')
      .select('*')
      .eq('household_id', household.id)
      .eq('is_active', true)
    setRecurringExpenses(recurring || [])

    setLoading(false)
  }

  const handleUpdateBudget = async () => {
    if (!budget) return
    await supabase
      .from('monthly_budgets')
      .update({ cash_on_hand_target: parseInt(form.cash_on_hand_target) || 0 })
      .eq('id', budget.id)
    setEditingBudget(false)
    await fetchData()
  }

  const totalBudgeted = recurringExpenses.reduce((sum, r) => sum + r.amount, 0)
  const totalSpent = budgetItems.reduce((sum, item) => sum + item.spent_amount, 0)

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-cta border-t-transparent" />
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Monthly Budget</h1>
            <p className="text-sm text-text-muted">{getMonthLabel(currentMonth)}</p>
          </div>
        </div>

        {/* Budget overview */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="stat-card">
            <Calendar className="h-5 w-5 text-cta" />
            <p className="stat-value">{formatCurrency(totalBudgeted)}</p>
            <p className="stat-label">Budgeted expenses</p>
          </div>
          <div className="stat-card">
            <Calendar className="h-5 w-5 text-danger" />
            <p className="stat-value text-danger">{formatCurrency(totalSpent)}</p>
            <p className="stat-label">Actual spent</p>
          </div>
          <div className="stat-card">
            <Calendar className="h-5 w-5 text-success" />
            <p className={`stat-value ${totalBudgeted - totalSpent >= 0 ? 'text-success' : 'text-danger'}`}>
              {formatCurrency(totalBudgeted - totalSpent)}
            </p>
            <p className="stat-label">Remaining</p>
          </div>
        </div>

        {/* Cash on hand target */}
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text">Cash-on-hand target</h2>
              <p className="text-sm text-text-muted">Money set aside for everyday spending</p>
            </div>
            {editingBudget ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={form.cash_on_hand_target}
                  onChange={(e) => setForm({ ...form, cash_on_hand_target: e.target.value })}
                  className="input-field w-32"
                />
                <button onClick={handleUpdateBudget} className="btn-primary p-2"><Check className="h-4 w-4" /></button>
                <button onClick={() => setEditingBudget(false)} className="btn-secondary p-2"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <button
                onClick={() => { setEditingBudget(true); setForm({ cash_on_hand_target: String(budget?.cash_on_hand_target || 0) }) }}
                className="btn-ghost"
              >
                <Edit2 className="h-4 w-4" />
                {formatCurrency(budget?.cash_on_hand_target || 0)}
              </button>
            )}
          </div>
        </div>

        {/* Recurring expenses breakdown */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-text">Operating Expenses</h2>
          <div className="space-y-3">
            {INITIAL_OPERATING_EXPENSES.map((expense) => {
              const category = categories.find((c) => c.name === expense.name)
              const budgetItem = budgetItems.find((item) => item.category_id === category?.id)
              const spent = budgetItem?.spent_amount || 0
              const percentage = expense.amount > 0 ? (spent / expense.amount) * 100 : 0
              const isOverBudget = spent > expense.amount

              return (
                <div key={expense.name} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text">{expense.name}</p>
                      <p className="text-xs text-text-muted">Budget: {formatCurrency(expense.amount)}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${isOverBudget ? 'text-danger' : 'text-text'}`}>
                        {formatCurrency(spent)} / {formatCurrency(expense.amount)}
                      </p>
                      <p className={`text-xs ${isOverBudget ? 'text-danger' : 'text-text-muted'}`}>
                        {percentage.toFixed(0)}% used
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-alt">
                    <div
                      className={`h-full transition-all ${isOverBudget ? 'bg-danger' : 'bg-cta'}`}
                      style={{ width: `${Math.min(percentage, 100)}%` }}
                    />
                  </div>
                  {isOverBudget && (
                    <p className="mt-1 text-xs text-danger">
                      Over budget by {formatCurrency(spent - expense.amount)}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <p className="text-sm font-medium text-text">Total operating expenses</p>
            <p className="text-lg font-bold text-text">{formatCurrency(totalBudgeted)}</p>
          </div>
        </div>

        {/* Budget vs actual summary */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-text">Budget vs Actual</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Total budgeted</span>
              <span className="font-medium text-text">{formatCurrency(totalBudgeted)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Total spent</span>
              <span className="font-medium text-danger">{formatCurrency(totalSpent)}</span>
            </div>
            <div className="flex items-center justify-between text-sm border-t border-border pt-2">
              <span className="font-medium text-text">Variance</span>
              <span className={`font-bold ${totalBudgeted - totalSpent >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatCurrency(totalBudgeted - totalSpent)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
