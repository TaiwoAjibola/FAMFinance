import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency, getCurrentMonth } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { Table, Th, Td, TableLoading, TableEmpty } from '@/components/Table'
import { IconButton } from '@/components/ui/IconButton'
import { Modal, ModalFormFooter } from '@/components/ui/Modal'
import { useFinanceActions } from '@/contexts/FinanceActionsContext'
import { CategoryPicker } from '@/components/ui/CategoryPicker'
import { Plus, ArrowUpCircle, ArrowDownCircle, ArrowRightLeft, Pencil, Trash2, Filter, Receipt } from 'lucide-react'
import type { Account, Category, Transaction } from '@/types'

export function ExpensesPage() {
  const { user } = useAuth()
  const { household } = useHousehold()
  const { version } = useFinanceActions()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [form, setForm] = useState({
    amount: '',
    description: '',
    account_id: '',
    category_id: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
    type: 'expense' as 'expense' | 'transfer' | 'income',
    to_account_id: '',
  })
  const [saving, setSaving] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const currentMonth = getCurrentMonth()

  useEffect(() => {
    if (!household) return
    fetchData()
  }, [household, version])

  const fetchData = async () => {
    if (!household) return
    setLoading(true)

    const [txRes, accountRes, catRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('household_id', household.id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('accounts')
        .select('*')
        .eq('household_id', household.id)
        .eq('is_active', true),
      supabase
        .from('categories')
        .select('*')
        .eq('household_id', household.id),
    ])

    // Hide expected-income placeholders (they live on the Income page);
    // every real money movement shows here.
    const all = (txRes.data || []).filter(
      (t) => !(t.type === 'income' && ['expected', 'partially_received', 'cancelled'].includes(t.status || ''))
    )
    setTransactions(all)
    setAccounts(accountRes.data || [])
    setCategories(catRes.data || [])
    setLoading(false)
  }

  const createCategory = async (name: string, kind: 'income' | 'expense') => {
    if (!household) return
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), -1)
    const { data } = await supabase
      .from('categories')
      .insert({ household_id: household.id, name, type: kind, sort_order: maxOrder + 1 })
      .select()
      .single()
    if (data) {
      setCategories((prev) => [...prev, data as Category])
      setForm((f) => ({ ...f, category_id: (data as Category).id }))
    }
  }

  const typeCategories = categories.filter((c) =>
    form.type === 'income' ? c.type === 'income' : c.type === 'expense'
  )

  // Apply a transaction's balance effect. dir=+1 applies, dir=-1 reverses.
  const applyBalance = async (
    type: 'expense' | 'transfer' | 'income',
    amount: number,
    accountId: string,
    dir: 1 | -1,
    toAccountId?: string | null
  ) => {
    if (type === 'income') {
      const { data: acct } = await supabase
        .from('accounts').select('balance').eq('id', accountId).single()
      if (acct) {
        await supabase
          .from('accounts')
          .update({ balance: acct.balance + dir * amount })
          .eq('id', accountId)
      }
      return
    }
    // Expense (and the "from" side of a transfer): money leaves
    const { data: from } = await supabase
      .from('accounts').select('balance').eq('id', accountId).single()
    if (from) {
      await supabase
        .from('accounts')
        .update({ balance: from.balance - dir * amount })
        .eq('id', accountId)
    }
    if (type === 'transfer' && toAccountId) {
      const { data: to } = await supabase
        .from('accounts').select('balance').eq('id', toAccountId).single()
      if (to) {
        await supabase
          .from('accounts')
          .update({ balance: to.balance + dir * amount })
          .eq('id', toAccountId)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!household || !user) return
    setSaving(true)

    const amount = parseInt(form.amount) || 0
    const type = form.type

    if (type === 'transfer' && form.to_account_id === form.account_id) {
      alert('Choose two different accounts for a transfer')
      setSaving(false)
      return
    }

    if (editingTx) {
      // Reverse the old effect, then apply the new one (handles type changes)
      await applyBalance(editingTx.type as 'expense' | 'transfer' | 'income', editingTx.amount, editingTx.account_id, -1, editingTx.to_account_id)
      await applyBalance(type, amount, form.account_id, 1, form.to_account_id || null)

      const { error: updateErr } = await supabase
        .from('transactions')
        .update({
          amount,
          description: form.description,
          account_id: form.account_id,
          category_id: form.category_id || null,
          date: form.date,
          notes: form.notes || null,
          type,
          status: type === 'income' ? 'received' : editingTx.status,
          to_account_id: type === 'transfer' ? form.to_account_id : null,
        })
        .eq('id', editingTx.id)

      if (updateErr) {
        alert('Error updating transaction: ' + updateErr.message)
        setSaving(false)
        return
      }
    } else {
      const { error: insertErr } = await supabase.from('transactions').insert({
        household_id: household.id,
        account_id: form.account_id,
        category_id: form.category_id || null,
        type,
        amount,
        description: form.description,
        date: form.date,
        notes: form.notes || null,
        status: type === 'income' ? 'received' : 'received',
        to_account_id: type === 'transfer' ? form.to_account_id : null,
        created_by: user.id,
      })

      if (insertErr) {
        alert('Error saving transaction: ' + insertErr.message)
        setSaving(false)
        return
      }

      await applyBalance(type, amount, form.account_id, 1, form.to_account_id || null)
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
      type: tx.type as 'expense' | 'transfer' | 'income',
      to_account_id: tx.to_account_id || '',
    })
    setShowForm(true)
  }

  const handleDelete = async (tx: Transaction) => {
    if (!confirm('Delete this transaction? Account balances will be adjusted back.')) return

    // Receipt linked to an expected income? Reverse the parent's progress too.
    if (tx.parent_income_id) {
      const { data: parent } = await supabase
        .from('transactions').select('received_amount, status').eq('id', tx.parent_income_id).single()
      if (parent) {
        const newReceived = Math.max(0, (parent.received_amount || 0) - tx.amount)
        const newStatus = newReceived <= 0 ? 'expected' : 'partially_received'
        await supabase
          .from('transactions')
          .update({ received_amount: newReceived, status: newStatus })
          .eq('id', tx.parent_income_id)
      }
    }

    const { error } = await supabase.from('transactions').delete().eq('id', tx.id)
    if (error) {
      alert('Error deleting: ' + error.message)
      return
    }
    await applyBalance(tx.type as 'expense' | 'transfer' | 'income', tx.amount, tx.account_id, -1, tx.to_account_id)
    await fetchData()
  }

  const filtered = transactions.filter((t) => {
    if (filterType && t.type !== filterType) return false
    if (filterCategory && t.category_id !== filterCategory) return false
    return true
  })

  const incomeThisMonth = transactions
    .filter((t) => t.type === 'income' && t.date.startsWith(currentMonth))
    .reduce((sum, t) => sum + t.amount, 0)
  const expensesThisMonth = transactions
    .filter((t) => t.type === 'expense' && t.date.startsWith(currentMonth))
    .reduce((sum, t) => sum + t.amount, 0)

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'income': return <ArrowDownCircle className="h-4 w-4 text-success" />
      case 'expense': return <ArrowUpCircle className="h-4 w-4 text-danger" />
      case 'transfer': return <ArrowRightLeft className="h-4 w-4 text-cta" />
      default: return <ArrowRightLeft className="h-4 w-4 text-text-muted" />
    }
  }

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      income: 'bg-success/10 text-success',
      expense: 'bg-danger/10 text-danger',
      transfer: 'bg-cta/10 text-cta',
    }
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${styles[type] || 'bg-surface-alt text-text-muted'}`}>
        {getTypeIcon(type)}{type}
      </span>
    )
  }

  const getAccountName = (id: string) => accounts.find((a) => a.id === id)?.name || '—'
  const getCategoryName = (id?: string | null) => categories.find((c) => c.id === id)?.name || '—'
  const recordedDate = (tx: Transaction) => (tx.created_at || '').split('T')[0] || '—'

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Transactions</h1>
            <p className="text-sm text-text-muted">Record income, expenses and transfers</p>
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="stat-card">
            <ArrowDownCircle className="h-5 w-5 text-success" />
            <p className="stat-value text-success">{formatCurrency(incomeThisMonth)}</p>
            <p className="stat-label">Income received this month</p>
          </div>
          <div className="stat-card">
            <ArrowUpCircle className="h-5 w-5 text-danger" />
            <p className="stat-value text-danger">{formatCurrency(expensesThisMonth)}</p>
            <p className="stat-label">Expenses this month</p>
          </div>
        </div>

        {/* Form */}
        <Modal
          open={showForm}
          title={editingTx ? 'Edit transaction' : 'Record transaction'}
          description="Money in, money out, or a move between your accounts."
          onClose={() => { setShowForm(false); setEditingTx(null) }}
          size="lg"
          footer={
            <ModalFormFooter
              formId="transaction-form"
              submitLabel={editingTx ? 'Update' : 'Record'}
              saving={saving}
              onCancel={() => { setShowForm(false); setEditingTx(null) }}
            />
          }
        >
            <form id="transaction-form" onSubmit={handleSubmit} className="space-y-4">
              {/* Transaction type toggle */}
              <div className="flex flex-wrap gap-2" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={form.type === 'income'}
                  onClick={() => setForm({ ...form, type: 'income', to_account_id: '' })}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    form.type === 'income' ? 'bg-success text-white' : 'bg-surface-alt text-text-muted hover:bg-border'
                  }`}
                >
                  Income
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={form.type === 'expense'}
                  onClick={() => setForm({ ...form, type: 'expense', to_account_id: '' })}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                    form.type === 'expense' ? 'bg-danger text-white' : 'bg-surface-alt text-text-muted hover:bg-border'
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={form.type === 'transfer'}
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
                    placeholder="e.g. Monthly salary, Internet payment"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="account" className="label">
                    {form.type === 'income' ? 'Into account' : 'From account'}
                  </label>
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
                        <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <span className="label">Category</span>
                    <CategoryPicker
                      categories={typeCategories}
                      kind={form.type === 'income' ? 'income' : 'expense'}
                      value={form.category_id}
                      onChange={(id) => setForm({ ...form, category_id: id })}
                      onCreate={(name) => createCategory(name, form.type === 'income' ? 'income' : 'expense')}
                    />
                  </div>
                )}
                <div>
                  <label htmlFor="date" className="label">Transaction date</label>
                  <input
                    id="date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="input-field"
                    required
                  />
                  <p className="mt-1 text-xs text-text-muted">When the money actually moved.</p>
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
            </form>
        </Modal>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-text-muted" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="input-field w-auto"
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expenses</option>
            <option value="transfer">Transfers</option>
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="input-field w-auto"
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Transaction table */}
        <Table>
          <thead>
            <tr>
              <Th>Description</Th>
              <Th>Type</Th>
              <Th>Category</Th>
              <Th>Account</Th>
              <Th align="right">Amount</Th>
              <Th>Transaction date</Th>
              <Th>Recorded</Th>
              <Th align="right" sticky>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableLoading colSpan={8} />
            ) : filtered.length === 0 ? (
              <TableEmpty
                colSpan={8}
                icon={Receipt}
                title={transactions.length === 0 ? 'No transactions yet' : 'No matching transactions'}
                action={
                  <button onClick={() => setShowForm(true)} className="btn-primary mt-4">
                    <Plus className="h-4 w-4" />
                    Record your first transaction
                  </button>
                }
              />
            ) : (
              filtered.map((tx) => (
                <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-surface-alt/50">
                  <Td>
                    <p className="font-medium">{tx.description}</p>
                    {tx.notes && <p className="text-xs text-text-muted">{tx.notes}</p>}
                  </Td>
                  <Td>{getTypeBadge(tx.type)}</Td>
                  <Td className="text-text-muted">{getCategoryName(tx.category_id)}</Td>
                  <Td className="text-text-muted">
                    {tx.type === 'transfer'
                      ? `${getAccountName(tx.account_id)} → ${getAccountName(tx.to_account_id || '')}`
                      : getAccountName(tx.account_id)}
                  </Td>
                  <Td align="right">
                    <span className={`font-semibold ${
                      tx.type === 'income' ? 'text-success' : tx.type === 'expense' ? 'text-danger' : 'text-cta'
                    }`}>
                      {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}
                      {formatCurrency(tx.amount)}
                    </span>
                  </Td>
                  <Td className="text-text-muted">{tx.date}</Td>
                  <Td className="text-text-muted">{recordedDate(tx)}</Td>
                  <Td align="right" sticky>
                    <div className="row-actions justify-end">
                      <IconButton icon={Pencil} label="Edit transaction" onClick={() => handleEdit(tx)} />
                      <IconButton icon={Trash2} label="Delete transaction" variant="danger" onClick={() => handleDelete(tx)} />
                    </div>
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </Layout>
  )
}
