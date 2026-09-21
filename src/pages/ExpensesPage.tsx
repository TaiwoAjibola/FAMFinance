import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency, getCurrentMonth } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { Plus, ArrowUpCircle, Pencil, Trash2, Filter } from 'lucide-react'
import type { Account, Category, Transaction } from '@/types'

export function ExpensesPage() {
  const { user } = useAuth()
  const { household } = useHousehold()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [form, setForm] = useState({
    amount: '',
    description: '',
    account_id: '',
    category_id: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    type: 'expense' as 'expense' | 'transfer',
    to_account_id: '',
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

    const [txRes, accountRes, catRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('household_id', household.id)
        .in('type', ['expense', 'transfer'])
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
        .eq('type', 'expense'),
    ])

    setTransactions(txRes.data || [])
    setAccounts(accountRes.data || [])
    setCategories(catRes.data || [])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!household || !user) return
    setSaving(true)

    const amount = parseInt(form.amount) || 0

    if (editingTx) {
      const oldAmount = editingTx.amount
      const oldAccountId = editingTx.account_id

      await supabase
        .from('transactions')
        .update({
          amount,
          description: form.description,
          account_id: form.account_id,
          category_id: form.category_id || null,
          date: form.date,
          notes: form.notes || null,
          type: form.type,
          to_account_id: form.type === 'transfer' ? form.to_account_id : null,
        })
        .eq('id', editingTx.id)

      // Adjust account balances
      const oldAccount = accounts.find((a) => a.id === oldAccountId)
      const newAccount = accounts.find((a) => a.id === form.account_id)
      if (oldAccount && newAccount) {
        if (editingTx.type === 'expense') {
          await supabase
            .from('accounts')
            .update({ balance: oldAccount.balance + oldAmount })
            .eq('id', oldAccountId)
          await supabase
            .from('accounts')
            .update({ balance: newAccount.balance - amount })
            .eq('id', form.account_id)
        }
      }
    } else {
      await supabase.from('transactions').insert({
        household_id: household.id,
        account_id: form.account_id,
        category_id: form.category_id || null,
        type: form.type,
        amount,
        description: form.description,
        date: form.date,
        notes: form.notes || null,
        to_account_id: form.type === 'transfer' ? form.to_account_id : null,
        created_by: user.id,
      })

      // Update account balances
      const fromAccount = accounts.find((a) => a.id === form.account_id)
      if (fromAccount) {
        await supabase
          .from('accounts')
          .update({ balance: fromAccount.balance - amount })
          .eq('id', form.account_id)
      }

      if (form.type === 'transfer' && form.to_account_id) {
        const toAccount = accounts.find((a) => a.id === form.to_account_id)
        if (toAccount) {
          await supabase
            .from('accounts')
            .update({ balance: toAccount.balance + amount })
            .eq('id', form.to_account_id)
        }
      }
    }

    setForm({ amount: '', description: '', account_id: '', category_id: '', date: new Date().toISOString().split('T')[0], notes: '', type: 'expense', to_account_id: '' })
    setShowForm(false)
    setEditingTx(null)
    await fetchData()
    setSaving(false)
  }

  const handleEdit = (tx: Transaction) => {
    setEditingTx(tx)
    setForm({
      amount: String(tx.amount),
      description: tx.description,
      account_id: tx.account_id,
      category_id: tx.category_id || '',
      date: tx.date,
      notes: tx.notes || '',
      type: tx.type as 'expense' | 'transfer',
      to_account_id: tx.to_account_id || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (tx: Transaction) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return

    await supabase.from('transactions').delete().eq('id', tx.id)

    // Reverse balance
    const account = accounts.find((a) => a.id === tx.account_id)
    if (account) {
      await supabase
        .from('accounts')
        .update({ balance: account.balance + tx.amount })
        .eq('id', tx.account_id)
    }

    if (tx.type === 'transfer' && tx.to_account_id) {
      const toAccount = accounts.find((a) => a.id === tx.to_account_id)
      if (toAccount) {
        await supabase
          .from('accounts')
          .update({ balance: toAccount.balance - tx.amount })
          .eq('id', tx.to_account_id)
      }
    }

    await fetchData()
  }

  const filtered = filterCategory
    ? transactions.filter((t) => t.category_id === filterCategory)
    : transactions

  const totalExpenses = transactions
    .filter((t) => t.type === 'expense' && t.date.startsWith(currentMonth))
    .reduce((sum, t) => sum + t.amount, 0)

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Expenses & Transfers</h1>
            <p className="text-sm text-text-muted">Record expenses and manage transfers</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingTx(null); setForm({ amount: '', description: '', account_id: '', category_id: '', date: new Date().toISOString().split('T')[0], notes: '', type: 'expense', to_account_id: '' }) }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            Add transaction
          </button>
        </div>

        {/* Summary */}
        <div className="stat-card">
          <ArrowUpCircle className="h-5 w-5 text-danger" />
          <p className="stat-value text-danger">{formatCurrency(totalExpenses)}</p>
          <p className="stat-label">Total expenses this month</p>
        </div>

        {/* Form */}
        {showForm && (
          <div className="card border-accent/30">
            <h3 className="mb-4 text-lg font-semibold text-text">
              {editingTx ? 'Edit transaction' : 'Record transaction'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Transaction type toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, type: 'expense' })}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    form.type === 'expense' ? 'bg-danger text-white' : 'bg-surface-alt text-text-muted hover:bg-border'
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, type: 'transfer' })}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    form.type === 'transfer' ? 'bg-cta text-white' : 'bg-surface-alt text-text-muted hover:bg-border'
                  }`}
                >
                  Transfer
                </button>
              </div>

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
                    placeholder="e.g. Internet payment"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="account" className="label">From account</label>
                  <select
                    id="account"
                    value={form.account_id}
                    onChange={(e) => setForm({ ...form, account_id: e.target.value })}
                    className="input-field"
                    required
                  >
                    <option value="">Select account</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>
                    ))}
                  </select>
                </div>
                {form.type === 'transfer' ? (
                  <div>
                    <label htmlFor="to_account" className="label">To account</label>
                    <select
                      id="to_account"
                      value={form.to_account_id}
                      onChange={(e) => setForm({ ...form, to_account_id: e.target.value })}
                      className="input-field"
                      required
                    >
                      <option value="">Select account</option>
                      {accounts.filter((a) => a.id !== form.account_id).map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
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
                )}
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
                  {saving ? 'Saving...' : editingTx ? 'Update' : 'Record'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setEditingTx(null) }} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-text-muted" />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="input-field w-auto"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Transaction list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-cta border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card py-12 text-center">
            <ArrowUpCircle className="mx-auto h-10 w-10 text-text-light" />
            <p className="mt-3 text-sm text-text-muted">No transactions yet</p>
            <button onClick={() => setShowForm(true)} className="btn-primary mt-4">
              <Plus className="h-4 w-4" />
              Record your first expense
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((tx) => (
              <div key={tx.id} className="card-hover group flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    tx.type === 'expense' ? 'bg-danger/10' : 'bg-cta/10'
                  }`}>
                    <ArrowUpCircle className={`h-5 w-5 ${tx.type === 'expense' ? 'text-danger' : 'text-cta'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text">{tx.description}</p>
                    <p className="text-xs text-text-muted">{tx.date} {tx.notes && `• ${tx.notes}`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold ${
                    tx.type === 'expense' ? 'text-danger' : 'text-cta'
                  }`}>
                    {tx.type === 'expense' ? '-' : ''}{formatCurrency(tx.amount)}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(tx)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(tx)} className="rounded-lg p-1.5 text-danger hover:bg-danger/5 cursor-pointer">
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
