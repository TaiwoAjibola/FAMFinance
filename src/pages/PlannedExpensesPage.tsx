import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency, getCurrentMonth } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { Plus, Target, Clock, CheckCircle, AlertCircle, Pencil, Trash2, Wallet } from 'lucide-react'
import type { PlannedExpense, InstallmentPlan, Account } from '@/types'

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

  // Pay state
  const [accounts, setAccounts] = useState<Account[]>([])
  const [payingExpense, setPayingExpense] = useState<PlannedExpense | null>(null)
  const [payForm, setPayForm] = useState({ amount: '', account_id: '', date: new Date().toISOString().split('T')[0] })
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    if (!household) return
    fetchExpenses()
    fetchAccounts()
  }, [household])

  const fetchAccounts = async () => {
    if (!household) return
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('household_id', household.id)
      .eq('is_active', true)
    setAccounts(data || [])
  }

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
      const { data: planned, error: insertErr } = await supabase
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

      if (insertErr) {
        alert('Error saving planned expense: ' + insertErr.message)
        setSaving(false)
        return
      }

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

  const handlePay = async () => {
    if (!payingExpense || !user || !household) return
    const amount = parseInt(payForm.amount) || 0
    if (amount <= 0 || !payForm.account_id) return
    setPaying(true)

    // 1. Create expense transaction
    const { error: txnErr } = await supabase
      .from('transactions')
      .insert({
        household_id: household.id,
        account_id: payForm.account_id,
        category_id: payingExpense.category_id || null,
        type: 'expense',
        amount,
        description: payingExpense.title + ' (planned expense)',
        date: payForm.date,
        created_by: user.id,
      })

    if (txnErr) {
      alert('Error creating transaction: ' + txnErr.message)
      setPaying(false)
      return
    }

    // 2. Deduct from account (read fresh balance)
    const { data: acct } = await supabase
      .from('accounts').select('balance').eq('id', payForm.account_id).single()
    if (acct) {
      await supabase
        .from('accounts')
        .update({ balance: acct.balance - amount })
        .eq('id', payForm.account_id)
    }

    // 3. Update planned expense status
    const newStatus = amount >= payingExpense.amount ? 'paid' : 'partially_paid'
    await supabase
      .from('planned_expenses')
      .update({ status: newStatus })
      .eq('id', payingExpense.id)

    setPayingExpense(null)
    setPayForm({ amount: '', account_id: '', date: new Date().toISOString().split('T')[0] })
    setPaying(false)
    await fetchExpenses()
  }

  const currentMonthExpenses = expenses.filter((e) => e.target_month === currentMonth)
  const totalPlanned = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0)
  const totalPaid = currentMonthExpenses.filter((e) => e.status === 'paid').reduce((sum, e) => sum + e.amount, 0)

  // Group all expenses by target_month for display
  const groupedByMonth = expenses.reduce((acc, expense) => {
    const month = expense.target_month
    if (!acc[month]) acc[month] = []
    acc[month].push(expense)
    return acc
  }, {} as Record<string, typeof expenses>)

  // Sort months chronologically
  const sortedMonths = Object.keys(groupedByMonth).sort()

  // Render expense list
  const expenseList = loading ? (
    <div className="flex justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-cta border-t-transparent" />
    </div>
  ) : expenses.length === 0 ? (
    <div className="card py-12 text-center">
      <Target className="mx-auto h-10 w-10 text-text-light" />
      <p className="mt-3 text-sm text-text-muted">No planned expenses yet</p>
      <button onClick={() => setShowForm(true)} className="btn-primary mt-4">
        <Plus className="h-4 w-4" />
        Add your first planned expense
      </button>
    </div>
  ) : (
    <div className="space-y-6">
      {sortedMonths.map((month) => (
        <div key={month}>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
              {new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
            </h3>
            {month === currentMonth && (
              <span className="text-xs font-medium bg-cta/10 text-cta px-2 py-0.5 rounded">Current month</span>
            )}
          </div>
          <div className="space-y-2">
            {groupedByMonth[month].map((expense) => (
              <div key={expense.id} className="card-hover group">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {STATUS_ICONS[expense.status]}
                    <div>
                      <p className="text-sm font-medium text-text">{expense.title}</p>
                      <p className="text-xs text-text-muted">
                        {expense.due_date && `Due ${expense.due_date}`}
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
                      {expense.status !== 'paid' && expense.status !== 'cancelled' && (
                        <button
                          onClick={() => {
                            setPayingExpense(expense)
                            setPayForm({ amount: String(expense.amount), account_id: '', date: new Date().toISOString().split('T')[0] })
                          }}
                          className="rounded-lg bg-cta/10 px-2 py-1 text-xs font-medium text-cta hover:bg-cta/20 cursor-pointer"
                          title="Pay this planned expense"
                        >
                          <Wallet className="inline h-3 w-3 mr-1" />Pay
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
        </div>
      ))}
    </div>
  )

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

        {/* Pay form */}
        {payingExpense && (
          <div className="card border-accent/30">
            <h3 className="mb-2 text-lg font-semibold text-text">
              Pay {payingExpense.title}
            </h3>
            <p className="mb-4 text-sm text-text-muted">
              Amount: {formatCurrency(payingExpense.amount)}
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="pay-amount" className="label">Amount to pay (₦)</label>
                  <input
                    id="pay-amount"
                    type="number"
                    value={payForm.amount}
                    onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                    className="input-field"
                    placeholder="0"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="pay-account" className="label">Pay from account</label>
                  <select
                    id="pay-account"
                    value={payForm.account_id}
                    onChange={(e) => setPayForm({ ...payForm, account_id: e.target.value })}
                    className="input-field"
                    required
                  >
                    <option value="">Select account</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pay-date" className="label">Date</label>
                  <input
                    id="pay-date"
                    type="date"
                    value={payForm.date}
                    onChange={(e) => setPayForm({ ...payForm, date: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePay}
                  disabled={!payForm.amount || !payForm.account_id || paying}
                  className="btn-primary"
                >
                  {paying ? 'Saving...' : 'Confirm payment'}
                </button>
                <button
                  onClick={() => {
                    setPayingExpense(null)
                    setPayForm({ amount: '', account_id: '', date: new Date().toISOString().split('T')[0] })
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-text-muted">
                This creates an expense transaction and deducts from the selected account.
              </p>
            </div>
          </div>
        )}

{/* Expenses list */}
        {expenseList}
      </div>
    </Layout>
  )
}
