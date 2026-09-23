import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency, getCurrentMonth } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { Plus, Target, Clock, CheckCircle, AlertCircle, Pencil, Trash2 } from 'lucide-react'
import type { PlannedExpense, InstallmentPlan } from '@/types'

const PRIORITY_COLORS: Record<string, string> = {
  low: 'badge-neutral',
  medium: 'badge-warning',
  high: 'bg-orange-100 text-orange-700',
  critical: 'badge-danger',
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  planned: <Clock className="h-4 w-4 text-text-muted" />,
  partially_paid: <AlertCircle className="h-4 w-4 text-warning" />,
  paid: <CheckCircle className="h-4 w-4 text-success" />,
  deferred: <Clock className="h-4 w-4 text-text-light" />,
  cancelled: <AlertCircle className="h-4 w-4 text-danger" />,
}

export function PlannedExpensesPage() {
  const { user } = useAuth()
  const { household } = useHousehold()
  const [expenses, setExpenses] = useState<(PlannedExpense & { installment_plan?: InstallmentPlan })[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingExpense, setEditingExpense] = useState<PlannedExpense | null>(null)
  const [form, setForm] = useState({
    title: '',
    amount: '',
    target_month: getCurrentMonth(),
    due_date: '',
    priority: 'medium' as PlannedExpense['priority'],
    notes: '',
    is_installment: false,
    num_installments: '',
  })
  const [saving, setSaving] = useState(false)
  const currentMonth = getCurrentMonth()

  useEffect(() => {
    if (!household) return
    fetchExpenses()
  }, [household])

  const fetchExpenses = async () => {
    if (!household) return
    setLoading(true)

    const { data } = await supabase
      .from('planned_expenses')
      .select('*, installment_plan:installment_plans(*)')
      .eq('household_id', household.id)
      .order('target_month', { ascending: true })
      .order('due_date', { ascending: true })

    setExpenses(data || [])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!household || !user) return
    setSaving(true)

    const amount = parseInt(form.amount) || 0

    if (editingExpense) {
      await supabase
        .from('planned_expenses')
        .update({
          title: form.title,
          amount,
          target_month: form.target_month,
          due_date: form.due_date || null,
          priority: form.priority,
          notes: form.notes || null,
        })
        .eq('id', editingExpense.id)
    } else {
      const { data: planned } = await supabase
        .from('planned_expenses')
        .insert({
          household_id: household.id,
          title: form.title,
          amount,
          target_month: form.target_month,
          due_date: form.due_date || null,
          priority: form.priority,
          notes: form.notes || null,
          created_by: user.id,
        })
        .select()
        .single()

      if (planned && form.is_installment && form.num_installments) {
        const numInstallments = parseInt(form.num_installments) || 1
        const installmentAmount = Math.ceil(amount / numInstallments)

        const { data: plan } = await supabase
          .from('installment_plans')
          .insert({
            household_id: household.id,
            planned_expense_id: planned.id,
            total_amount: amount,
            num_installments: numInstallments,
            installment_amount: installmentAmount,
          })
          .select()
          .single()

        if (plan) {
          const payments = Array.from({ length: numInstallments }, (_, i) => {
            const dueDate = new Date(form.target_month + '-01')
            dueDate.setMonth(dueDate.getMonth() + i)
            return {
              installment_plan_id: plan.id,
              installment_number: i + 1,
              amount: installmentAmount,
              due_date: dueDate.toISOString().split('T')[0],
            }
          })
          await supabase.from('installment_payments').insert(payments)
        }
      }
    }

    setForm({ title: '', amount: '', target_month: getCurrentMonth(), due_date: '', priority: 'medium', notes: '', is_installment: false, num_installments: '' })
    setShowForm(false)
    setEditingExpense(null)
    await fetchExpenses()
    setSaving(false)
  }

  const handleEdit = (expense: PlannedExpense) => {
    setEditingExpense(expense)
    setForm({
      title: expense.title,
      amount: String(expense.amount),
      target_month: expense.target_month,
      due_date: expense.due_date || '',
      priority: expense.priority,
      notes: expense.notes || '',
      is_installment: false,
      num_installments: '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this planned expense?')) return
    await supabase.from('planned_expenses').delete().eq('id', id)
    await fetchExpenses()
  }

  const handleMarkPaid = async (expense: PlannedExpense) => {
    await supabase
      .from('planned_expenses')
      .update({ status: 'paid' })
      .eq('id', expense.id)
    await fetchExpenses()
  }

  const currentMonthExpenses = expenses.filter((e) => e.target_month === currentMonth)
  const totalPlanned = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0)
  const totalPaid = currentMonthExpenses.filter((e) => e.status === 'paid').reduce((sum, e) => sum + e.amount, 0)

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Planned Expenses</h1>
            <p className="text-sm text-text-muted">Upcoming commitments and purchases</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingExpense(null); setForm({ title: '', amount: '', target_month: getCurrentMonth(), due_date: '', priority: 'medium', notes: '', is_installment: false, num_installments: '' }) }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            Add planned
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="stat-card">
            <Target className="h-5 w-5 text-cta" />
            <p className="stat-value">{formatCurrency(totalPlanned)}</p>
            <p className="stat-label">Planned this month</p>
          </div>
          <div className="stat-card">
            <CheckCircle className="h-5 w-5 text-success" />
            <p className="stat-value text-success">{formatCurrency(totalPaid)}</p>
            <p className="stat-label">Already paid</p>
          </div>
          <div className="stat-card">
            <Clock className="h-5 w-5 text-warning" />
            <p className="stat-value text-warning">{formatCurrency(totalPlanned - totalPaid)}</p>
            <p className="stat-label">Still to pay</p>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <div className="card border-accent/30">
            <h3 className="mb-4 text-lg font-semibold text-text">
              {editingExpense ? 'Edit planned expense' : 'Add planned expense'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="title" className="label">Title</label>
                  <input
                    id="title"
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="input-field"
                    placeholder="e.g. School fees"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="amount" className="label">Amount (₦)</label>
                  <input
                    id="amount"
                    type="number"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    className="input-field"
                    placeholder="0"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="target_month" className="label">Target month</label>
                  <input
                    id="target_month"
                    type="month"
                    value={form.target_month}
                    onChange={(e) => setForm({ ...form, target_month: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="due_date" className="label">Due date (optional)</label>
                  <input
                    id="due_date"
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label htmlFor="priority" className="label">Priority</label>
                  <select
                    id="priority"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as PlannedExpense['priority'] })}
                    className="input-field"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="notes" className="label">Notes (optional)</label>
                  <input
                    id="notes"
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>

              {/* Installment option */}
              {!editingExpense && (
                <div className="rounded-lg border border-border p-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_installment}
                      onChange={(e) => setForm({ ...form, is_installment: e.target.checked })}
                      className="h-4 w-4 rounded border-border text-cta focus:ring-cta/20"
                    />
                    <span className="text-sm font-medium text-text">This is an installment purchase</span>
                  </label>
                  {form.is_installment && (
                    <div className="mt-3">
                      <label htmlFor="num_installments" className="label">Number of installments</label>
                      <input
                        id="num_installments"
                        type="number"
                        value={form.num_installments}
                        onChange={(e) => setForm({ ...form, num_installments: e.target.value })}
                        className="input-field w-32"
                        min="2"
                        placeholder="3"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : editingExpense ? 'Update' : 'Add planned expense'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setEditingExpense(null) }} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Expenses list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-cta border-t-transparent" />
          </div>
        ) : currentMonthExpenses.length === 0 ? (
          <div className="card py-12 text-center">
            <Target className="mx-auto h-10 w-10 text-text-light" />
            <p className="mt-3 text-sm text-text-muted">No planned expenses yet</p>
            <button onClick={() => setShowForm(true)} className="btn-primary mt-4">
              <Plus className="h-4 w-4" />
              Add your first planned expense
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {currentMonthExpenses.map((expense) => (
              <div key={expense.id} className="card-hover group">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {STATUS_ICONS[expense.status]}
                    <div>
                      <p className="text-sm font-medium text-text">{expense.title}</p>
                      <p className="text-xs text-text-muted">
                        {expense.target_month} {expense.due_date && `• Due ${expense.due_date}`}
                      </p>
                      {expense.notes && (
                        <p className="mt-1 text-xs text-text-light">{expense.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${expense.status === 'paid' ? 'text-success' : 'text-text'}`}>
                      {formatCurrency(expense.amount)}
                    </span>
                    <span className={PRIORITY_COLORS[expense.priority]}>
                      {expense.priority}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {expense.status !== 'paid' && (
                        <button onClick={() => handleMarkPaid(expense)} className="rounded-lg p-1.5 text-success hover:bg-success/5 cursor-pointer" title="Mark as paid">
                          <CheckCircle className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button onClick={() => handleEdit(expense)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(expense.id)} className="rounded-lg p-1.5 text-danger hover:bg-danger/5 cursor-pointer">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Installment info */}
                {expense.installment_plan && (
                  <div className="mt-3 rounded-lg bg-surface-alt p-3">
                    <p className="text-xs text-text-muted">
                      Installment plan: {expense.installment_plan.num_installments} payments of {formatCurrency(expense.installment_plan.installment_amount)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
