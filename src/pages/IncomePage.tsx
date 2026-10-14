import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency, getCurrentMonth } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { Plus, ArrowDownCircle, Pencil, Trash2, Check, Clock, X, Wallet, History, Ban, AlertCircle } from 'lucide-react'
import type { Account, Category, Transaction } from '@/types'

type IncomeStatus = 'expected' | 'partially_received' | 'received' | 'cancelled'

export function IncomePage() {
  const { user } = useAuth()
  const { household } = useHousehold()
  const [incomes, setIncomes] = useState<Transaction[]>([])
  const [receipts, setReceipts] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingIncome, setEditingIncome] = useState<Transaction | null>(null)
  const [form, setForm] = useState({
    amount: '',
    description: '',
    account_id: '',
    category_id: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  // Receive-payment flow (supports partial receipts)
  const [receivingIncome, setReceivingIncome] = useState<Transaction | null>(null)
  const [receiveForm, setReceiveForm] = useState({ amount: '', account_id: '', date: new Date().toISOString().split('T')[0], notes: '' })
  const [receiving, setReceiving] = useState(false)

  // Payment history viewer
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null)

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
        .eq('household_id', household.id)
        .eq('type', 'income'),
    ])

    const all = incomeRes.data || []
    // Receipts are linked to their expected-income parent via parent_income_id
    const linked = all.filter((t) => t.parent_income_id)
    const parents = all.filter((t) => !t.parent_income_id)
    setIncomes(parents)
    setReceipts(linked)
    setAccounts(accountRes.data || [])
    setCategories(catRes.data || [])
    setLoading(false)
  }

  // Add expected income (no account/balance change until money arrives)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!household || !user) return
    setSaving(true)

    const amount = parseInt(form.amount) || 0

    if (editingIncome) {
      const received = editingIncome.received_amount || 0
      const { error } = await supabase
        .from('transactions')
        .update({
          amount,
          received_amount: Math.min(received, amount),
          description: form.description,
          category_id: form.category_id || null,
          date: form.date,
          notes: form.notes || null,
        })
        .eq('id', editingIncome.id)
      if (error) alert('Error: ' + error.message)
    } else {
      const { error } = await supabase.from('transactions').insert({
        household_id: household.id,
        category_id: form.category_id || null,
        type: 'income',
        amount,
        received_amount: 0,
        description: form.description,
        date: form.date,
        notes: form.notes || null,
        status: 'expected',
        created_by: user.id,
      })
      if (error) {
        alert('Error saving income: ' + error.message)
        setSaving(false)
        return
      }
    }

    setForm({ amount: '', description: '', account_id: '', category_id: '', date: new Date().toISOString().split('T')[0], notes: '' })
    setShowForm(false)
    setEditingIncome(null)
    await fetchData()
    setSaving(false)
  }

  // Record a receipt — full or partial — against an expected income.
  // Only the amount actually received enters the account.
  const handleReceive = async () => {
    if (!receivingIncome || !user) return
    const amount = parseInt(receiveForm.amount) || 0
    if (amount <= 0 || !receiveForm.account_id) return

    const receivedSoFar = receivingIncome.received_amount || 0
    const outstanding = receivingIncome.amount - receivedSoFar
    if (amount > outstanding) {
      alert(`Only ${formatCurrency(outstanding)} is still outstanding on this income.`)
      return
    }

    setReceiving(true)

    // 1. Create the receipt as a real income transaction (linked to parent)
    const { error: rcptErr } = await supabase.from('transactions').insert({
      household_id: receivingIncome.household_id,
      account_id: receiveForm.account_id,
      category_id: receivingIncome.category_id || null,
      type: 'income',
      amount,
      description: `${receivingIncome.description} (receipt)`,
      date: receiveForm.date,
      notes: receiveForm.notes || null,
      status: 'received',
      parent_income_id: receivingIncome.id,
      created_by: user.id,
    })

    if (rcptErr) {
      alert('Error recording receipt: ' + rcptErr.message)
      setReceiving(false)
      return
    }

    // 2. Increase the account balance by the amount actually received
    const { data: acct } = await supabase
      .from('accounts').select('balance').eq('id', receiveForm.account_id).single()
    if (acct) {
      await supabase
        .from('accounts')
        .update({ balance: acct.balance + amount })
        .eq('id', receiveForm.account_id)
    }

    // 3. Update the expected income progress
    const newReceived = receivedSoFar + amount
    const newStatus: IncomeStatus = newReceived >= receivingIncome.amount ? 'received' : 'partially_received'
    await supabase
      .from('transactions')
      .update({ received_amount: newReceived, status: newStatus })
      .eq('id', receivingIncome.id)

    setReceivingIncome(null)
    setReceiveForm({ amount: '', account_id: '', date: new Date().toISOString().split('T')[0], notes: '' })
    setReceiving(false)
    await fetchData()
  }

  const handleEdit = (income: Transaction) => {
    setEditingIncome(income)
    setForm({
      amount: String(income.amount),
      description: income.description,
      account_id: income.account_id || '',
      category_id: income.category_id || '',
      date: income.date,
      notes: income.notes || '',
    })
    setShowForm(true)
  }

  // Deleting a receipt reverses its account contribution and parent progress
  const handleDeleteReceipt = async (rcpt: Transaction) => {
    if (!confirm(`Remove this receipt of ${formatCurrency(rcpt.amount)}? The money will be removed from the account.`)) return

    const { error } = await supabase.from('transactions').delete().eq('id', rcpt.id)
    if (error) {
      alert('Error: ' + error.message)
      return
    }

    if (rcpt.account_id) {
      const { data: acct } = await supabase
        .from('accounts').select('balance').eq('id', rcpt.account_id).single()
      if (acct) {
        await supabase
          .from('accounts')
          .update({ balance: acct.balance - rcpt.amount })
          .eq('id', rcpt.account_id)
      }
    }

    if (rcpt.parent_income_id) {
      const { data: parent } = await supabase
        .from('transactions').select('received_amount').eq('id', rcpt.parent_income_id).single()
      if (parent) {
        const newReceived = Math.max(0, (parent.received_amount || 0) - rcpt.amount)
        const newStatus = newReceived <= 0 ? 'expected' : 'partially_received'
        await supabase
          .from('transactions')
          .update({ received_amount: newReceived, status: newStatus })
          .eq('id', rcpt.parent_income_id)
      }
    }

    await fetchData()
  }

  const handleDelete = async (income: Transaction) => {
    const incomeReceipts = receipts.filter((r) => r.parent_income_id === income.id)
    if (incomeReceipts.length > 0) {
      alert('This expected income has receipts recorded against it. Remove the receipts first (in its payment history).')
      return
    }
    if (!confirm('Delete this income record?')) return

    await supabase.from('transactions').delete().eq('id', income.id)

    // Only reverse the balance for one-shot received records with an account
    if (income.status === 'received' && income.account_id) {
      const { data: acct } = await supabase
        .from('accounts').select('balance').eq('id', income.account_id).single()
      if (acct) {
        await supabase
          .from('accounts')
          .update({ balance: acct.balance - income.amount })
          .eq('id', income.account_id)
      }
    }

    await fetchData()
  }

  const handleCancelIncome = async (income: Transaction) => {
    if (income.received_amount && income.received_amount > 0) {
      alert('This income already has money received against it and cannot be cancelled.')
      return
    }
    if (!confirm('Cancel this expected income?')) return
    await supabase
      .from('transactions')
      .update({ status: 'cancelled' })
      .eq('id', income.id)
    await fetchData()
  }

  const currentMonthIncomes = incomes.filter((i) => i.date.startsWith(currentMonth))
  const totalReceived = receipts
    .filter((r) => r.date.startsWith(currentMonth))
    .reduce((sum, r) => sum + r.amount, 0)
  const totalExpected = currentMonthIncomes
    .filter((i) => i.status === 'expected' || i.status === 'partially_received')
    .reduce((sum, i) => sum + (i.amount - (i.received_amount || 0)), 0)

  const getProgress = (income: Transaction) => {
    const received = income.received_amount || 0
    return income.amount > 0 ? Math.min((received / income.amount) * 100, 100) : 0
  }

  const getStatusBadge = (income: Transaction) => {
    const received = income.received_amount || 0
    const status = income.status as IncomeStatus
    if (status === 'cancelled') {
      return <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-medium text-danger"><Ban className="h-2.5 w-2.5" /> Cancelled</span>
    }
    if (status === 'received' && received === 0) {
      // One-shot record (legacy or quick-added from Transactions page)
      return <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success"><Check className="h-2.5 w-2.5" /> Received</span>
    }
    if (received >= income.amount) {
      return <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success"><Check className="h-2.5 w-2.5" /> Fully received</span>
    }
    if (received > 0) {
      return <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning"><AlertCircle className="h-2.5 w-2.5" /> Partially received</span>
    }
    return <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning"><Clock className="h-2.5 w-2.5" /> Pending</span>
  }

  const getAccountName = (id?: string) => accounts.find((a) => a.id === id)?.name || '—'
  const recordedDate = (t: Transaction) => (t.created_at || '').split('T')[0] || '—'

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Income</h1>
            <p className="text-sm text-text-muted">Plan expected income and record what actually arrives — partial payments included</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingIncome(null); setForm({ amount: '', description: '', account_id: '', category_id: '', date: new Date().toISOString().split('T')[0], notes: '' }) }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            Add income
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="stat-card">
            <ArrowDownCircle className="h-5 w-5 text-success" />
            <p className="stat-value text-success">{formatCurrency(totalReceived)}</p>
            <p className="stat-label">Received this month</p>
          </div>
          <div className="stat-card">
            <Clock className="h-5 w-5 text-warning" />
            <p className="stat-value text-warning">{formatCurrency(totalExpected)}</p>
            <p className="stat-label">Still expected this month</p>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <div className="card border-accent/30">
            <h3 className="mb-4 text-lg font-semibold text-text">
              {editingIncome ? 'Edit expected income' : 'Add expected income'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="amount" className="label">Expected amount (₦)</label>
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
                  <label htmlFor="date" className="label">Expected date</label>
                  <input
                    id="date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="input-field"
                    required
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
                    placeholder="Any additional notes"
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    Expected income doesn't touch any account. Record receipts as the money arrives.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : editingIncome ? 'Update' : 'Add expected income'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setEditingIncome(null) }} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Receive-payment form (full or partial) */}
        {receivingIncome && (
          <div className="card border-accent/30">
            <h3 className="mb-1 text-lg font-semibold text-text">Record money received</h3>
            <p className="mb-4 text-sm text-text-muted">
              {receivingIncome.description} — expected {formatCurrency(receivingIncome.amount)},
              received so far {formatCurrency(receivingIncome.received_amount || 0)},
              outstanding <span className="font-medium text-text">{formatCurrency(receivingIncome.amount - (receivingIncome.received_amount || 0))}</span>
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="receive-amount" className="label">Amount received (₦)</label>
                  <input
                    id="receive-amount"
                    type="number"
                    value={receiveForm.amount}
                    onChange={(e) => setReceiveForm({ ...receiveForm, amount: e.target.value })}
                    className="input-field"
                    placeholder="0"
                    max={receivingIncome.amount - (receivingIncome.received_amount || 0)}
                    required
                  />
                  <p className="mt-1 text-xs text-text-muted">Partial amounts are fine — e.g. ₦100,000 of a ₦200,000 payment.</p>
                </div>
                <div>
                  <label htmlFor="receive-account" className="label">Into account</label>
                  <select
                    id="receive-account"
                    value={receiveForm.account_id}
                    onChange={(e) => setReceiveForm({ ...receiveForm, account_id: e.target.value })}
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
                  <label htmlFor="receive-date" className="label">Date received</label>
                  <input
                    id="receive-date"
                    type="date"
                    value={receiveForm.date}
                    onChange={(e) => setReceiveForm({ ...receiveForm, date: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleReceive}
                  disabled={!receiveForm.amount || !receiveForm.account_id || receiving}
                  className="btn-primary"
                >
                  <Wallet className="h-4 w-4" />
                  {receiving ? 'Recording...' : 'Record receipt'}
                </button>
                <button
                  onClick={() => { setReceivingIncome(null); setReceiveForm({ amount: '', account_id: '', date: new Date().toISOString().split('T')[0], notes: '' }) }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-text-muted">
                Only the amount entered is added to the account — never the full expected amount.
              </p>
            </div>
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
              Add your first expected income
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {incomes.map((income) => {
              const incomeReceipts = receipts.filter((r) => r.parent_income_id === income.id)
              const received = income.received_amount || 0
              const outstanding = Math.max(0, income.amount - received)
              const progress = getProgress(income)
              const isActive = income.status === 'expected' || income.status === 'partially_received'
              const showProgress = received > 0 || income.status === 'partially_received'

              return (
                <div key={income.id} className="card-hover group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        income.status === 'cancelled' ? 'bg-danger/10' : received >= income.amount && income.amount > 0 ? 'bg-success/10' : 'bg-warning/10'
                      }`}>
                        <ArrowDownCircle className={`h-5 w-5 ${
                          income.status === 'cancelled' ? 'text-danger' : received >= income.amount && income.amount > 0 ? 'text-success' : 'text-warning'
                        }`} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-text">{income.description}</p>
                          {getStatusBadge(income)}
                        </div>
                        <p className="text-xs text-text-muted">
                          Expected {formatCurrency(income.amount)} • Due {income.date}
                          {showProgress && (
                            <> • Received {formatCurrency(received)} • Outstanding {formatCurrency(outstanding)}</>
                          )}
                          {income.notes && ` • ${income.notes}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-semibold ${
                        income.status === 'cancelled' ? 'text-text-muted line-through' : 'text-text'
                      }`}>
                        {formatCurrency(income.amount)}
                      </span>
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {isActive && outstanding > 0 && (
                          <button
                            onClick={() => {
                              setReceivingIncome(income)
                              setReceiveForm({
                                amount: String(outstanding),
                                account_id: income.account_id || '',
                                date: new Date().toISOString().split('T')[0],
                                notes: '',
                              })
                            }}
                            className="rounded-lg bg-cta/10 px-2 py-1 text-xs font-medium text-cta hover:bg-cta/20 cursor-pointer"
                          >
                            <Wallet className="inline h-3 w-3 mr-1" />Receive
                          </button>
                        )}
                        {incomeReceipts.length > 0 && (
                          <button
                            onClick={() => setShowHistoryFor(showHistoryFor === income.id ? null : income.id)}
                            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer"
                            title="Payment history"
                          >
                            <History className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isActive && received === 0 && (
                          <button
                            onClick={() => handleCancelIncome(income)}
                            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer"
                            title="Cancel this expected income"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => handleEdit(income)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDelete(income)} className="rounded-lg p-1.5 text-danger hover:bg-danger/5 cursor-pointer">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {showProgress && income.status !== 'cancelled' && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                        <span>{formatCurrency(received)} of {formatCurrency(income.amount)} received</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${progress >= 100 ? 'bg-success' : 'bg-cta'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Payment history */}
                  {showHistoryFor === income.id && (
                    <div className="mt-3 rounded-lg border border-border p-3">
                      <p className="mb-2 text-xs font-medium text-text-muted">Receipt history</p>
                      <div className="space-y-1.5">
                        {incomeReceipts.map((r) => (
                          <div key={r.id} className="group/rc flex items-center justify-between text-xs">
                            <span className="text-text-muted">
                              {r.date} • {formatCurrency(r.amount)} into {getAccountName(r.account_id)}
                              <span className="ml-1 text-text-light">(recorded {recordedDate(r)})</span>
                            </span>
                            <button
                              onClick={() => handleDeleteReceipt(r)}
                              className="rounded p-1 text-danger opacity-0 transition-opacity hover:bg-danger/5 group-hover/rc:opacity-100 cursor-pointer"
                              title="Remove this receipt (reverses the account balance)"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
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
