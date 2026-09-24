import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { Plus, HandCoins, Pencil, Trash2, Check, Wallet } from 'lucide-react'
import type { Debt, Account } from '@/types'

export function DebtsPage() {
  const { user } = useAuth()
  const { household } = useHousehold()
  const [debts, setDebts] = useState<Debt[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [form, setForm] = useState({
    lender_name: '',
    amount: '',
    date_borrowed: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  // Repay state
  const [repayingDebt, setRepayingDebt] = useState<Debt | null>(null)
  const [repayForm, setRepayForm] = useState({ amount: '', account_id: '', date: new Date().toISOString().split('T')[0], notes: '' })
  const [repaying, setRepaying] = useState(false)

  useEffect(() => {
    if (!household) return
    fetchData()
  }, [household])

  const fetchData = async () => {
    if (!household) return
    setLoading(true)

    const [debtRes, accountRes] = await Promise.all([
      supabase
        .from('debts')
        .select('*')
        .eq('household_id', household.id)
        .order('date_borrowed', { ascending: false }),
      supabase
        .from('accounts')
        .select('*')
        .eq('household_id', household.id)
        .eq('is_active', true),
    ])

    setDebts(debtRes.data || [])
    setAccounts(accountRes.data || [])
    setLoading(false)
  }

  // Add/edit debt
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!household || !user) return
    setSaving(true)

    const amount = parseInt(form.amount) || 0

    if (editingDebt) {
      const { error } = await supabase
        .from('debts')
        .update({
          lender_name: form.lender_name,
          amount,
          date_borrowed: form.date_borrowed,
          due_date: form.due_date || null,
          notes: form.notes || null,
        })
        .eq('id', editingDebt.id)

      if (error) alert('Error: ' + error.message)
    } else {
      const { error } = await supabase.from('debts').insert({
        household_id: household.id,
        lender_name: form.lender_name,
        amount,
        date_borrowed: form.date_borrowed,
        due_date: form.due_date || null,
        notes: form.notes || null,
        created_by: user.id,
      })

      if (error) {
        alert('Error: ' + error.message)
        setSaving(false)
        return
      }
    }

    setForm({ lender_name: '', amount: '', date_borrowed: new Date().toISOString().split('T')[0], due_date: '', notes: '' })
    setShowForm(false)
    setEditingDebt(null)
    await fetchData()
    setSaving(false)
  }

  const handleEdit = (debt: Debt) => {
    setEditingDebt(debt)
    setForm({
      lender_name: debt.lender_name,
      amount: String(debt.amount),
      date_borrowed: debt.date_borrowed,
      due_date: debt.due_date || '',
      notes: debt.notes || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this debt record?')) return
    await supabase.from('debts').delete().eq('id', id)
    await fetchData()
  }

  // Repay debt
  const handleRepay = async () => {
    if (!repayingDebt || !repayForm.amount || !repayForm.account_id) return
    const amount = parseInt(repayForm.amount) || 0
    if (amount <= 0) return

    const remaining = repayingDebt.amount - repayingDebt.amount_repaid
    if (amount > remaining) {
      alert(`Cannot repay more than the remaining ₦${remaining.toLocaleString()}`)
      return
    }

    setRepaying(true)

    // 1. Create expense transaction
    const { error: txnErr } = await supabase
      .from('transactions')
      .insert({
        household_id: household!.id,
        account_id: repayForm.account_id,
        type: 'expense',
        amount,
        description: `Debt repayment to ${repayingDebt.lender_name}`,
        date: repayForm.date,
        notes: repayForm.notes || null,
        created_by: user!.id,
      })
      .select()
      .single()

    if (txnErr) {
      alert('Error creating transaction: ' + txnErr.message)
      setRepaying(false)
      return
    }

    // 2. Deduct from account
    const { data: acct } = await supabase
      .from('accounts').select('balance').eq('id', repayForm.account_id).single()
    if (acct) {
      await supabase
        .from('accounts')
        .update({ balance: acct.balance - amount })
        .eq('id', repayForm.account_id)
    }

    // 3. Update debt
    const newRepaid = repayingDebt.amount_repaid + amount
    const newStatus = newRepaid >= repayingDebt.amount ? 'fully_paid' : 'active'
    await supabase
      .from('debts')
      .update({ amount_repaid: newRepaid, status: newStatus })
      .eq('id', repayingDebt.id)

    setRepayingDebt(null)
    setRepayForm({ amount: '', account_id: '', date: new Date().toISOString().split('T')[0], notes: '' })
    setRepaying(false)
    await fetchData()
  }

  const activeDebts = debts.filter((d) => d.status === 'active')
  const totalOwed = activeDebts.reduce((sum, d) => sum + (d.amount - d.amount_repaid), 0)
  const paidThisMonth = debts
    .filter((d) => d.status === 'fully_paid' || d.amount_repaid > 0)
    .reduce((sum, d) => sum + d.amount_repaid, 0)

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Debts I Owe</h1>
            <p className="text-sm text-text-muted">Track money you've borrowed and repayments</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingDebt(null); setForm({ lender_name: '', amount: '', date_borrowed: new Date().toISOString().split('T')[0], due_date: '', notes: '' }) }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            Add debt
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="stat-card">
            <HandCoins className="h-5 w-5 text-danger" />
            <p className="stat-value text-danger">{formatCurrency(totalOwed)}</p>
            <p className="stat-label">Total outstanding</p>
          </div>
          <div className="stat-card">
            <Check className="h-5 w-5 text-success" />
            <p className="stat-value text-success">{formatCurrency(paidThisMonth)}</p>
            <p className="stat-label">Repaid total</p>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <div className="card border-accent/30">
            <h3 className="mb-4 text-lg font-semibold text-text">
              {editingDebt ? 'Edit debt' : 'Record new debt'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="lender_name" className="label">Borrowed from</label>
                  <input
                    id="lender_name"
                    type="text"
                    value={form.lender_name}
                    onChange={(e) => setForm({ ...form, lender_name: e.target.value })}
                    className="input-field"
                    placeholder="e.g. Mama, John, Office"
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
                  <label htmlFor="date_borrowed" className="label">Date borrowed</label>
                  <input
                    id="date_borrowed"
                    type="date"
                    value={form.date_borrowed}
                    onChange={(e) => setForm({ ...form, date_borrowed: e.target.value })}
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
                <div className="sm:col-span-2">
                  <label htmlFor="notes" className="label">Notes (optional)</label>
                  <input
                    id="notes"
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="input-field"
                    placeholder="e.g. For school fees"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : editingDebt ? 'Update' : 'Add debt'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setEditingDebt(null) }} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Repay form */}
        {repayingDebt && (
          <div className="card border-accent/30">
            <h3 className="mb-2 text-lg font-semibold text-text">
              Repay {repayingDebt.lender_name}
            </h3>
            <p className="mb-4 text-sm text-text-muted">
              Remaining: {formatCurrency(repayingDebt.amount - repayingDebt.amount_repaid)}
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="repay-amount" className="label">Amount to repay (₦)</label>
                  <input
                    id="repay-amount"
                    type="number"
                    value={repayForm.amount}
                    onChange={(e) => setRepayForm({ ...repayForm, amount: e.target.value })}
                    className="input-field"
                    placeholder="0"
                    max={repayingDebt.amount - repayingDebt.amount_repaid}
                  />
                </div>
                <div>
                  <label htmlFor="repay-account" className="label">Pay from account</label>
                  <select
                    id="repay-account"
                    value={repayForm.account_id}
                    onChange={(e) => setRepayForm({ ...repayForm, account_id: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Select account</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="repay-date" className="label">Date</label>
                  <input
                    id="repay-date"
                    type="date"
                    value={repayForm.date}
                    onChange={(e) => setRepayForm({ ...repayForm, date: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleRepay}
                  disabled={!repayForm.amount || !repayForm.account_id || repaying}
                  className="btn-primary"
                >
                  {repaying ? 'Saving...' : 'Confirm repayment'}
                </button>
                <button
                  onClick={() => { setRepayingDebt(null); setRepayForm({ amount: '', account_id: '', date: new Date().toISOString().split('T')[0], notes: '' }) }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Debt list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-cta border-t-transparent" />
          </div>
        ) : debts.length === 0 ? (
          <div className="card py-12 text-center">
            <HandCoins className="mx-auto h-10 w-10 text-text-light" />
            <p className="mt-3 text-sm text-text-muted">No debts recorded yet</p>
            <button onClick={() => setShowForm(true)} className="btn-primary mt-4">
              <Plus className="h-4 w-4" />
              Add your first debt
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {debts.map((debt) => {
              const remaining = debt.amount - debt.amount_repaid
              const progress = debt.amount > 0 ? (debt.amount_repaid / debt.amount) * 100 : 0
              const isFullyPaid = debt.status === 'fully_paid'
              const isCancelled = debt.status === 'cancelled'
              const isOverdue = debt.due_date && new Date(debt.due_date) < new Date() && !isFullyPaid && !isCancelled

              return (
                <div key={debt.id} className="card-hover group">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        isFullyPaid ? 'bg-success/10' : isCancelled ? 'bg-text-light/10' : isOverdue ? 'bg-danger/10' : 'bg-warning/10'
                      }`}>
                        <HandCoins className={`h-5 w-5 ${
                          isFullyPaid ? 'text-success' : isCancelled ? 'text-text-light' : isOverdue ? 'text-danger' : 'text-warning'
                        }`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-text">{debt.lender_name}</p>
                          {isFullyPaid && <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">Paid</span>}
                          {isCancelled && <span className="rounded bg-text-light/10 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">Cancelled</span>}
                          {isOverdue && <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">Overdue</span>}
                        </div>
                        <p className="text-xs text-text-muted">
                          Borrowed {debt.date_borrowed}
                          {debt.due_date && ` • Due ${debt.due_date}`}
                          {debt.notes && ` • ${debt.notes}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${isFullyPaid ? 'text-success' : 'text-text'}`}>
                          {formatCurrency(debt.amount)}
                        </p>
                        {!isFullyPaid && !isCancelled && (
                          <p className="text-xs text-text-muted">{formatCurrency(remaining)} left</p>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!isFullyPaid && !isCancelled && (
                          <button
                            onClick={() => { setRepayingDebt(debt); setRepayForm({ amount: '', account_id: '', date: new Date().toISOString().split('T')[0], notes: '' }) }}
                            className="rounded-lg bg-cta/10 px-2 py-1 text-xs font-medium text-cta hover:bg-cta/20 cursor-pointer"
                            title="Repay"
                          >
                            <Wallet className="inline h-3 w-3 mr-1" />Pay
                          </button>
                        )}
                        <button onClick={() => handleEdit(debt)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(debt.id)} className="rounded-lg p-1.5 text-danger hover:bg-danger/5 cursor-pointer">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {!isCancelled && debt.amount > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                        <span>{formatCurrency(debt.amount_repaid)} repaid</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isFullyPaid ? 'bg-success' : 'bg-cta'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
