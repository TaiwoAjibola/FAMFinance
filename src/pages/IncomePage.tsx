import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency, getCurrentMonth } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { Plus, ArrowDownCircle, Pencil, Trash2 } from 'lucide-react'
import type { Account, Category, Transaction } from '@/types'

type IncomeStatus = 'expected' | 'partially_received' | 'received' | 'cancelled'

interface IncomeRecord extends Transaction {
  status?: IncomeStatus
  expected_amount?: number
  received_amount?: number
}

export function IncomePage() {
  const { user } = useAuth()
  const { household } = useHousehold()
  const [incomes, setIncomes] = useState<IncomeRecord[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingIncome, setEditingIncome] = useState<IncomeRecord | null>(null)
  const [form, setForm] = useState({
    amount: '',
    description: '',
    account_id: '',
    category_id: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    status: 'received' as IncomeStatus,
  })
  const [saving, setSaving] = useState(false)
  const currentMonth = getCurrentMonth()

  useEffect(() => {
    if (!household) return
    fetchData()
  }, [household])

  const fetchData = async () => {
    if (!household) return
    setLoading(true)

    const [incomeRes, accountRes, catRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('household_id', household.id)
        .eq('type', 'income')
        .order('date', { ascending: false }),
      supabase
        .from('accounts')
        .select('*')
        .eq('household_id', household.id)
        .eq('is_active', true),
      supabase
        .from('categories')
        .select('*')
        .eq('household_id', household.id)
        .eq('type', 'income'),
    ])

    setIncomes(incomeRes.data || [])
    setAccounts(accountRes.data || [])
    setCategories(catRes.data || [])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!household || !user) return
    setSaving(true)

    const amount = parseInt(form.amount) || 0

    if (editingIncome) {
      const oldAccount = editingIncome.account_id

      // Reverse old amount from old account
      const { data: oldAcct } = await supabase
        .from('accounts').select('balance').eq('id', oldAccount).single()
      if (oldAcct) {
        await supabase
          .from('accounts').update({ balance: oldAcct.balance - editingIncome.amount }).eq('id', oldAccount)
      }

      // Apply new amount to new account
      const { data: newAcct } = await supabase
        .from('accounts').select('balance').eq('id', form.account_id).single()
      if (newAcct) {
        await supabase
          .from('accounts').update({ balance: newAcct.balance + amount }).eq('id', form.account_id)
      }

      await supabase
        .from('transactions')
        .update({
          amount,
          description: form.description,
          account_id: form.account_id,
          category_id: form.category_id || null,
          date: form.date,
          notes: form.notes || null,
        })
        .eq('id', editingIncome.id)
    } else {
      const { error: insertErr } = await supabase.from('transactions').insert({
        household_id: household.id,
        account_id: form.account_id,
        category_id: form.category_id || null,
        type: 'income',
        amount,
        description: form.description,
        date: form.date,
        notes: form.notes || null,
        created_by: user.id,
      })

      if (insertErr) {
        alert('Error saving income: ' + insertErr.message)
        setSaving(false)
        return
      }

      // Update account balance (read fresh from DB)
      const { data: acct } = await supabase
        .from('accounts').select('balance').eq('id', form.account_id).single()
      if (acct) {
        await supabase
          .from('accounts')
          .update({ balance: acct.balance + amount })
          .eq('id', form.account_id)
      }
    }

    setForm({ amount: '', description: '', account_id: '', category_id: '', date: new Date().toISOString().split('T')[0], notes: '', status: 'received' })
    setShowForm(false)
    setEditingIncome(null)
    await fetchData()
    setSaving(false)
  }

  const handleEdit = (income: IncomeRecord) => {
    setEditingIncome(income)
    setForm({
      amount: String(income.amount),
      description: income.description,
      account_id: income.account_id,
      category_id: income.category_id || '',
      date: income.date,
      notes: income.notes || '',
      status: 'received',
    })
    setShowForm(true)
  }

  const handleDelete = async (income: IncomeRecord) => {
    if (!confirm('Are you sure you want to delete this income record?')) return

    await supabase.from('transactions').delete().eq('id', income.id)

    // Reverse account balance (read fresh from DB)
    const { data: acct } = await supabase
      .from('accounts').select('balance').eq('id', income.account_id).single()
    if (acct) {
      await supabase
        .from('accounts')
        .update({ balance: acct.balance - income.amount })
        .eq('id', income.account_id)
    }

    await fetchData()
  }

  const totalReceived = incomes
    .filter((i) => i.date.startsWith(currentMonth))
    .reduce((sum, i) => sum + i.amount, 0)

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Income</h1>
            <p className="text-sm text-text-muted">Track all household income</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingIncome(null); setForm({ amount: '', description: '', account_id: '', category_id: '', date: new Date().toISOString().split('T')[0], notes: '', status: 'received' }) }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            Add income
          </button>
        </div>

        {/* Summary */}
        <div className="stat-card">
          <ArrowDownCircle className="h-5 w-5 text-success" />
          <p className="stat-value text-success">{formatCurrency(totalReceived)}</p>
          <p className="stat-label">Income received this month</p>
        </div>

        {/* Form */}
        {showForm && (
          <div className="card border-accent/30">
            <h3 className="mb-4 text-lg font-semibold text-text">
              {editingIncome ? 'Edit income' : 'Record income'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  <label htmlFor="description" className="label">Description</label>
                  <input
                    id="description"
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="input-field"
                    placeholder="e.g. Monthly salary"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="account" className="label">Received into account</label>
                  <select
                    id="account"
                    value={form.account_id}
                    onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                    className="input-field"
                    required
                  >
                    <option value="">Select account</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="category" className="label">Category</label>
                  <select
                    id="category"
                    value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                    className="input-field"
                  >
                    <option value="">Select category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="date" className="label">Date</label>
                  <input
                    id="date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="notes" className="label">Notes (optional)</label>
                  <input
                    id="notes"
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="input-field"
                    placeholder="Any additional notes"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : editingIncome ? 'Update income' : 'Record income'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setEditingIncome(null) }} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Income list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-cta border-t-transparent" />
          </div>
        ) : incomes.length === 0 ? (
          <div className="card py-12 text-center">
            <ArrowDownCircle className="mx-auto h-10 w-10 text-text-light" />
            <p className="mt-3 text-sm text-text-muted">No income recorded yet</p>
            <button onClick={() => setShowForm(true)} className="btn-primary mt-4">
              <Plus className="h-4 w-4" />
              Record your first income
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {incomes.map((income) => (
              <div key={income.id} className="card-hover group flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
                    <ArrowDownCircle className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text">{income.description}</p>
                    <p className="text-xs text-text-muted">{income.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-success">{formatCurrency(income.amount)}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(income)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(income)} className="rounded-lg p-1.5 text-danger hover:bg-danger/5 cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
