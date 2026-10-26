import { useState, useEffect, Fragment } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency, getCurrentMonth, getMonthLabel, previousMonth, nextMonth } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { Table, Th, Td } from '@/components/Table'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Check, X, Repeat, Tag, Settings, Wallet, History } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import type { Category, BudgetItem, MonthlyBudget, Account, BudgetPayment } from '@/types'

export function BudgetPage() {
  const { user } = useAuth()
  const { household } = useHousehold()
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [budget, setBudget] = useState<MonthlyBudget | null>(null)
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [monthOverview, setMonthOverview] = useState({ expectedIncome: 0, receivedIncome: 0, plannedCount: 0, plannedTotal: 0 })
  const [loading, setLoading] = useState(true)

  // Budget item forms
  const [addingItem, setAddingItem] = useState(false)
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ budgeted_amount: '', is_recurring: false })
  const [addForm, setAddForm] = useState({
    mode: 'category' as 'category' | 'custom',
    category_id: '',
    custom_name: '',
    budgeted_amount: '',
    is_recurring: false,
  })
  const [saving, setSaving] = useState(false)

  // Payment form
  const [payingItem, setPayingItem] = useState<string | null>(null)
  const [payForm, setPayForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], account_id: '', notes: '' })
  const [paying, setPaying] = useState(false)

  // Payment history
  const [showPayments, setShowPayments] = useState<string | null>(null)
  const [itemPayments, setItemPayments] = useState<Record<string, BudgetPayment[]>>({})

  // Category management
  const [showCategories, setShowCategories] = useState(false)
  const [addingCategory, setAddingCategory] = useState(false)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [catForm, setCatForm] = useState({ name: '' })
  const [catSaving, setCatSaving] = useState(false)

  useEffect(() => {
    if (!household) return
    fetchData()
  }, [household, currentMonth])

  const fetchData = async () => {
    if (!household) return
    setLoading(true)

    let { data: budgetData } = await supabase
      .from('monthly_budgets')
      .select('*')
      .eq('household_id', household.id)
      .eq('month', currentMonth)
      .single()

    if (!budgetData) {
      const { data: newBudget } = await supabase
        .from('monthly_budgets')
        .insert({ household_id: household.id, month: currentMonth })
        .select()
        .single()
      budgetData = newBudget
      if (budgetData) await copyRecurringItems(household.id, budgetData.id)
    }

    setBudget(budgetData)

    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .eq('household_id', household.id)
      .eq('type', 'expense')
      .order('sort_order')
    setCategories(cats || [])

    const { data: accts } = await supabase
      .from('accounts')
      .select('*')
      .eq('household_id', household.id)
      .eq('is_active', true)
      .order('name')
    setAccounts(accts || [])

    if (budgetData) {
      const { data: items } = await supabase
        .from('budget_items')
        .select('*, category:categories(*)')
        .eq('budget_id', budgetData.id)
      setBudgetItems(items || [])

      // Fetch payments for all items
      if (items && items.length > 0) {
        const itemIds = items.map((i) => i.id)
        const { data: payments } = await supabase
          .from('budget_payments')
          .select('*, account:accounts(name)')
          .in('budget_item_id', itemIds)
          .order('date', { ascending: false })

        const grouped: Record<string, BudgetPayment[]> = {}
        for (const item of items) {
          grouped[item.id] = (payments || []).filter((p) => p.budget_item_id === item.id)
        }
        setItemPayments(grouped)
      } else {
        setItemPayments({})
      }
    }

    // Month overview: expected vs received income, and planned expenses
    const monthStart = currentMonth + '-01'
    const [y, m] = currentMonth.split('-').map(Number)
    const nextMonthDate = new Date(y, m, 1) // month is 0-indexed: y, m => next month
    const nextStart = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}-01`
    const [incomeRes, plannedRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('amount, received_amount, status, parent_income_id')
        .eq('household_id', household.id)
        .eq('type', 'income')
        .gte('date', monthStart)
        .lt('date', nextStart),
      supabase
        .from('planned_expenses')
        .select('id, amount, status')
        .eq('household_id', household.id)
        .eq('target_month', currentMonth)
        .neq('status', 'cancelled'),
    ])

    const incomeRows = incomeRes.data || []
    const parents = incomeRows.filter((t) => !t.parent_income_id && t.status !== 'cancelled')
    const oneShotReceived = parents
      .filter((p) => p.status === 'received' && !(p.received_amount || 0))
      .reduce((sum, p) => sum + p.amount, 0)
    const progressiveReceived = parents.reduce((sum, p) => sum + (p.received_amount || 0), 0)
    const overview = {
      expectedIncome: parents
        .filter((p) => p.status === 'expected' || p.status === 'partially_received')
        .reduce((sum, p) => sum + (p.amount - (p.received_amount || 0)), 0),
      receivedIncome: oneShotReceived + progressiveReceived,
      plannedCount: (plannedRes.data || []).length,
      plannedTotal: (plannedRes.data || [])
        .filter((p) => p.status !== 'paid')
        .reduce((sum, p) => sum + p.amount, 0),
    }
    setMonthOverview(overview)

    setLoading(false)
  }

  const copyRecurringItems = async (householdId: string, newBudgetId: string) => {
    const prevMonth = previousMonth(currentMonth)
    const { data: prevBudget } = await supabase
      .from('monthly_budgets')
      .select('id')
      .eq('household_id', householdId)
      .eq('month', prevMonth)
      .single()

    if (!prevBudget) return

    const { data: recurringItems } = await supabase
      .from('budget_items')
      .select('*')
      .eq('budget_id', prevBudget.id)
      .eq('is_recurring', true)

    if (!recurringItems || recurringItems.length === 0) return

    const newItems = recurringItems.map((item) => ({
      budget_id: newBudgetId,
      category_id: item.category_id,
      custom_name: item.custom_name,
      budgeted_amount: item.budgeted_amount,
      spent_amount: 0,
      is_recurring: true,
    }))

    await supabase.from('budget_items').insert(newItems)
  }

  // --- Category CRUD ---

  const handleAddCategory = async () => {
    if (!household || !catForm.name.trim()) return
    setCatSaving(true)
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), -1)
    await supabase.from('categories').insert({
      household_id: household.id,
      name: catForm.name.trim(),
      type: 'expense',
      sort_order: maxOrder + 1,
    })
    setCatForm({ name: '' })
    setAddingCategory(false)
    await fetchData()
    setCatSaving(false)
  }

  const handleUpdateCategory = async (catId: string) => {
    if (!catForm.name.trim()) return
    setCatSaving(true)
    await supabase.from('categories').update({ name: catForm.name.trim() }).eq('id', catId)
    setEditingCategory(null)
    await fetchData()
    setCatSaving(false)
  }

  const handleDeleteCategory = async (catId: string) => {
    if (!confirm('Delete this category? Budget items using it will become uncategorized.')) return
    await supabase.from('categories').delete().eq('id', catId)
    await fetchData()
  }

  // --- Budget item CRUD ---

  const handleAddItem = async () => {
    if (!budget) return
    if (addForm.mode === 'category' && !addForm.category_id) return
    if (addForm.mode === 'custom' && !addForm.custom_name.trim()) return
    if (!addForm.budgeted_amount) return
    setSaving(true)

    await supabase.from('budget_items').insert({
      budget_id: budget.id,
      category_id: addForm.mode === 'category' ? addForm.category_id : null,
      custom_name: addForm.mode === 'custom' ? addForm.custom_name.trim() : null,
      budgeted_amount: parseInt(addForm.budgeted_amount) || 0,
      spent_amount: 0,
      is_recurring: addForm.is_recurring,
    })

    setAddForm({ mode: 'category', category_id: '', custom_name: '', budgeted_amount: '', is_recurring: false })
    setAddingItem(false)
    await fetchData()
    setSaving(false)
  }

  const handleUpdateItem = async (itemId: string) => {
    setSaving(true)
    await supabase
      .from('budget_items')
      .update({ budgeted_amount: parseInt(editForm.budgeted_amount) || 0, is_recurring: editForm.is_recurring })
      .eq('id', itemId)
    setEditingItem(null)
    await fetchData()
    setSaving(false)
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Remove this budget item and all its payments?')) return

    // Clear budget_item_id on any linked transactions first
    await supabase
      .from('transactions')
      .update({ budget_item_id: null })
      .eq('budget_item_id', itemId)

    // Delete the budget item (cascades to budget_payments)
    const { error } = await supabase.from('budget_items').delete().eq('id', itemId)
    if (error) {
      alert('Error deleting budget item: ' + error.message)
      return
    }
    await fetchData()
  }

  // --- Payment recording ---

  const handleRecordPayment = async (item: BudgetItem) => {
    if (!user || !payForm.amount || !payForm.account_id) return
    const amount = parseInt(payForm.amount) || 0
    if (amount <= 0) return
    setPaying(true)

    // 1. Create transaction (expense)
    const { data: txn, error: txnErr } = await supabase
      .from('transactions')
      .insert({
        household_id: household!.id,
        account_id: payForm.account_id,
        category_id: item.category_id || null,
        type: 'expense',
        amount,
        description: getItemName(item) + ' (budget payment)',
        date: payForm.date,
        notes: payForm.notes || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (txnErr) {
      alert('Error creating transaction: ' + txnErr.message)
      setPaying(false)
      return
    }

    // 2. Deduct from account balance (read fresh balance)
    const { data: freshAccount } = await supabase
      .from('accounts')
      .select('balance')
      .eq('id', payForm.account_id)
      .single()

    if (freshAccount) {
      await supabase
        .from('accounts')
        .update({ balance: freshAccount.balance - amount })
        .eq('id', payForm.account_id)
    }

    // 3. Create budget payment record
    await supabase.from('budget_payments').insert({
      budget_item_id: item.id,
      amount,
      date: payForm.date,
      account_id: payForm.account_id,
      notes: payForm.notes || null,
      transaction_id: txn?.id || null,
    })

    // 4. Update spent_amount on budget item
    const newSpent = (item.spent_amount || 0) + amount
    await supabase
      .from('budget_items')
      .update({ spent_amount: newSpent })
      .eq('id', item.id)

    setPayingItem(null)
    setPayForm({ amount: '', date: new Date().toISOString().split('T')[0], account_id: '', notes: '' })
    await fetchData()
    setPaying(false)
  }

  const handleRevertPayment = async (payment: BudgetPayment, item: BudgetItem) => {
    if (!confirm(`Revert this payment of ${formatCurrency(payment.amount)}? The money will be returned to the account.`)) return

    // 1. Add money back to account
    const { data: acct } = await supabase
      .from('accounts').select('balance').eq('id', payment.account_id).single()
    if (acct) {
      await supabase
        .from('accounts').update({ balance: acct.balance + payment.amount }).eq('id', payment.account_id)
    }

    // 2. Delete the linked transaction
    if (payment.transaction_id) {
      await supabase.from('transactions').delete().eq('id', payment.transaction_id)
    }

    // 3. Delete the budget payment record
    await supabase.from('budget_payments').delete().eq('id', payment.id)

    // 4. Update spent_amount on budget item
    const newSpent = Math.max(0, (item.spent_amount || 0) - payment.amount)
    await supabase
      .from('budget_items').update({ spent_amount: newSpent }).eq('id', item.id)

    await fetchData()
  }

  const getItemName = (item: BudgetItem) => {
    if (item.category) return item.category.name
    if (item.custom_name) return item.custom_name
    return 'Uncategorized'
  }

  const totalBudgeted = budgetItems.reduce((sum, item) => sum + item.budgeted_amount, 0)
  const totalSpent = budgetItems.reduce((sum, item) => sum + item.spent_amount, 0)
  const variance = totalBudgeted - totalSpent
  const availableCategories = categories.filter(
    (cat) => !budgetItems.some((item) => item.category_id === cat.id)
  )

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header with month navigator */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Budget</h1>
            <p className="text-sm text-text-muted">Manage your monthly budget</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentMonth(previousMonth(currentMonth))} className="rounded-lg p-2 text-text-muted hover:bg-surface-alt cursor-pointer">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="min-w-[140px] text-center text-sm font-medium text-text">{getMonthLabel(currentMonth)}</span>
            <button onClick={() => setCurrentMonth(nextMonth(currentMonth))} className="rounded-lg p-2 text-text-muted hover:bg-surface-alt cursor-pointer">
              <ChevronRight className="h-5 w-5" />
            </button>
            {currentMonth !== getCurrentMonth() && (
              <button onClick={() => setCurrentMonth(getCurrentMonth())} className="ml-2 rounded-lg bg-cta/10 px-3 py-1.5 text-xs font-medium text-cta hover:bg-cta/20 cursor-pointer">
                Today
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-cta border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="stat-card">
                <p className="stat-label">Total budgeted</p>
                <p className="stat-value">{formatCurrency(totalBudgeted)}</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">Total spent (actual)</p>
                <p className="stat-value">{formatCurrency(totalSpent)}</p>
              </div>
              <div className="stat-card">
                <p className="stat-label">{variance >= 0 ? 'Remaining' : 'Over budget'}</p>
                <p className={`stat-value ${variance >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatCurrency(Math.abs(variance))}
                </p>
              </div>
            </div>

            {/* Month overview: plan vs actual */}
            <div className="card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text">Month overview</h2>
                <Link to="/planned" className="text-xs font-medium text-cta hover:text-cta-light">
                  View planned expenses
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-surface-alt p-3">
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Money coming in</p>
                  <p className="mt-1 text-sm text-text">
                    <span className="font-semibold text-success">{formatCurrency(monthOverview.receivedIncome)}</span> received
                  </p>
                  <p className="text-xs text-text-muted">
                    + {formatCurrency(monthOverview.expectedIncome)} still expected
                  </p>
                </div>
                <div className="rounded-lg bg-surface-alt p-3">
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Monthly budget</p>
                  <p className="mt-1 text-sm text-text">
                    <span className="font-semibold text-text">{formatCurrency(totalSpent)}</span> spent
                  </p>
                  <p className="text-xs text-text-muted">
                    of {formatCurrency(totalBudgeted)} planned
                  </p>
                </div>
                <div className="rounded-lg bg-surface-alt p-3">
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Planned expenses</p>
                  <p className="mt-1 text-sm text-text">
                    <span className="font-semibold text-cta">{formatCurrency(monthOverview.plannedTotal)}</span> upcoming
                  </p>
                  <p className="text-xs text-text-muted">
                    {monthOverview.plannedCount} planned item{monthOverview.plannedCount !== 1 ? 's' : ''} this month
                  </p>
                </div>
              </div>
            </div>

            {/* Category management */}
            <div className="card">
              <button onClick={() => setShowCategories(!showCategories)} className="flex w-full items-center justify-between cursor-pointer">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-accent" />
                  <span className="text-sm font-semibold text-text">Categories ({categories.length})</span>
                </div>
                <Settings className={`h-4 w-4 text-text-muted transition-transform ${showCategories ? 'rotate-90' : ''}`} />
              </button>
              {showCategories && (
                <div className="mt-4 space-y-3">
                  {categories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                      {editingCategory === cat.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input type="text" value={catForm.name} onChange={(e) => setCatForm({ name: e.target.value })} className="input-field flex-1 text-sm" onKeyDown={(e) => e.key === 'Enter' && handleUpdateCategory(cat.id)} autoFocus />
                          <IconButton icon={Check} label="Save category" disabled={catSaving} variant="success" onClick={() => handleUpdateCategory(cat.id)} />
                          <IconButton icon={X} label="Cancel" onClick={() => setEditingCategory(null)} />
                        </div>
                      ) : (
                        <>
                          <span className="text-sm text-text">{cat.name}</span>
                          <div className="flex gap-1">
                            <IconButton icon={Pencil} label="Edit category" onClick={() => { setEditingCategory(cat.id); setCatForm({ name: cat.name }) }} />
                            <IconButton icon={Trash2} label="Delete category" variant="danger" onClick={() => handleDeleteCategory(cat.id)} />
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {addingCategory ? (
                    <div className="flex items-center gap-2">
                      <input type="text" value={catForm.name} onChange={(e) => setCatForm({ name: e.target.value })} className="input-field flex-1 text-sm" placeholder="Category name" onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()} autoFocus />
                      <button onClick={handleAddCategory} disabled={catSaving || !catForm.name.trim()} className="btn-primary text-sm">Add</button>
                      <button onClick={() => { setAddingCategory(false); setCatForm({ name: '' }) }} className="btn-secondary text-sm">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => { setAddingCategory(true); setCatForm({ name: '' }) }} className="flex items-center gap-2 text-sm text-cta hover:text-cta-light cursor-pointer">
                      <Plus className="h-4 w-4" />Add category
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Add budget item form */}
            {addingItem && (
              <div className="card border-accent/30">
                <h3 className="mb-4 text-lg font-semibold text-text">Add budget item</h3>
                <div className="flex gap-2 mb-4">
                  <button onClick={() => setAddForm({ ...addForm, mode: 'category', category_id: '', custom_name: '' })} className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${addForm.mode === 'category' ? 'bg-cta text-white' : 'bg-surface-alt text-text-muted'}`}>From category</button>
                  <button onClick={() => setAddForm({ ...addForm, mode: 'custom', category_id: '', custom_name: '' })} className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${addForm.mode === 'custom' ? 'bg-cta text-white' : 'bg-surface-alt text-text-muted'}`}>Custom / one-off</button>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {addForm.mode === 'category' ? (
                    <div>
                      <label htmlFor="add-category" className="label">Category</label>
                      <select id="add-category" value={addForm.category_id} onChange={(e) => setAddForm({ ...addForm, category_id: e.target.value })} className="input-field">
                        <option value="">Select category</option>
                        {availableCategories.map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="add-custom-name" className="label">Item name</label>
                      <input id="add-custom-name" type="text" value={addForm.custom_name} onChange={(e) => setAddForm({ ...addForm, custom_name: e.target.value })} className="input-field" placeholder="e.g. Birthday gift" />
                    </div>
                  )}
                  <div>
                    <label htmlFor="add-amount" className="label">Budgeted amount (₦)</label>
                    <input id="add-amount" type="number" value={addForm.budgeted_amount} onChange={(e) => setAddForm({ ...addForm, budgeted_amount: e.target.value })} className="input-field" placeholder="0" />
                  </div>
                  <div className="flex items-end gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={addForm.is_recurring} onChange={(e) => setAddForm({ ...addForm, is_recurring: e.target.checked })} className="h-4 w-4 rounded border-border text-cta focus:ring-cta" />
                      <span className="text-sm text-text">Recurring monthly</span>
                    </label>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={handleAddItem} disabled={saving || (addForm.mode === 'category' && !addForm.category_id) || (addForm.mode === 'custom' && !addForm.custom_name.trim()) || !addForm.budgeted_amount} className="btn-primary">{saving ? 'Saving...' : 'Add item'}</button>
                  <button onClick={() => setAddingItem(false)} className="btn-secondary">Cancel</button>
                </div>
              </div>
            )}

            {/* Payment form */}
            {payingItem && (
              <div className="card border-accent/30">
                <h3 className="mb-4 text-lg font-semibold text-text">
                  Record payment — {getItemName(budgetItems.find((i) => i.id === payingItem)!)}
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="pay-amount" className="label">Amount paid (₦)</label>
                    <input id="pay-amount" type="number" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="input-field" placeholder="0" autoFocus />
                  </div>
                  <div>
                    <label htmlFor="pay-date" className="label">Date</label>
                    <input id="pay-date" type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} className="input-field" />
                  </div>
                  <div>
                    <label htmlFor="pay-account" className="label">Pay from account</label>
                    <select id="pay-account" value={payForm.account_id} onChange={(e) => setPayForm({ ...payForm, account_id: e.target.value })} className="input-field">
                      <option value="">Select account</option>
                      {accounts.map((a) => (<option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="pay-notes" className="label">Notes (optional)</label>
                    <input id="pay-notes" type="text" value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} className="input-field" placeholder="e.g. First payment" />
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => { const item = budgetItems.find((i) => i.id === payingItem); if (item) handleRecordPayment(item) }} disabled={paying || !payForm.amount || !payForm.account_id} className="btn-primary">{paying ? 'Saving...' : 'Record payment'}</button>
                  <button onClick={() => setPayingItem(null)} className="btn-secondary">Cancel</button>
                </div>
              </div>
            )}

            {/* Budget items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text">Budget items</h2>
                {!addingItem && <button onClick={() => setAddingItem(true)} className="btn-primary text-sm"><Plus className="h-4 w-4" />Add item</button>}
              </div>

              <Table>
                <thead>
                  <tr>
                    <Th>Category</Th>
                    <Th align="right">Planned amount</Th>
                    <Th align="right">Actual spending</Th>
                    <Th align="right">Remaining</Th>
                    <Th align="right">% used</Th>
                    <Th align="right" sticky>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {budgetItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center">
                        <p className="text-sm text-text-muted">No budget items yet</p>
                        <button onClick={() => setAddingItem(true)} className="btn-primary mt-3"><Plus className="h-4 w-4" />Add your first budget item</button>
                      </td>
                    </tr>
                  ) : (
                    budgetItems.map((item) => {
                      const remaining = item.budgeted_amount - item.spent_amount
                      const isEditing = editingItem === item.id
                      const payments = itemPayments[item.id] || []
                      const isFullyPaid = item.spent_amount >= item.budgeted_amount
                      const pctUsed = item.budgeted_amount > 0 ? Math.min((item.spent_amount / item.budgeted_amount) * 100, 999) : 0

                      return (
                        <Fragment key={item.id}>
                          <tr className="border-b border-border last:border-0 hover:bg-surface-alt/50">
                            <Td>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{getItemName(item)}</span>
                                {item.is_recurring && (
                                  <span className="inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                                    <Repeat className="h-3.5 w-3.5" />
                                    Recurring
                                  </span>
                                )}
                                {!item.category_id && item.custom_name && <span className="rounded bg-surface-alt px-1.5 py-0.5 text-[10px] text-text-muted">Custom</span>}
                                {isFullyPaid && <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">Paid</span>}
                              </div>
                              {isEditing && (
                                <label className="mt-1 flex items-center gap-1 text-xs text-text-muted">
                                  <input type="checkbox" checked={editForm.is_recurring} onChange={(e) => setEditForm({ ...editForm, is_recurring: e.target.checked })} className="h-3 w-3 rounded border-border text-cta focus:ring-cta" />
                                  Recurs every month
                                </label>
                              )}
                            </Td>
                            <Td align="right">
                              {isEditing ? (
                                <input type="number" value={editForm.budgeted_amount} onChange={(e) => setEditForm({ ...editForm, budgeted_amount: e.target.value })} className="input-field w-28 text-right text-sm" aria-label="Planned amount" />
                              ) : (
                                <span className="font-medium">{formatCurrency(item.budgeted_amount)}</span>
                              )}
                            </Td>
                            <Td align="right">
                              <span className={item.spent_amount > 0 ? 'font-medium' : 'text-text-muted'}>{formatCurrency(item.spent_amount)}</span>
                            </Td>
                            <Td align="right">
                              <span className={`font-medium ${remaining >= 0 ? 'text-success' : 'text-danger'}`}>
                                {remaining >= 0 ? '' : '−'}{formatCurrency(Math.abs(remaining))}
                              </span>
                            </Td>
                            <Td align="right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="h-1.5 w-14 rounded-full bg-surface-alt overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${pctUsed >= 100 ? 'bg-danger' : pctUsed >= 80 ? 'bg-warning' : 'bg-cta'}`}
                                    style={{ width: `${Math.min(pctUsed, 100)}%` }}
                                  />
                                </div>
                                <span className={`text-xs ${pctUsed >= 100 ? 'text-danger font-medium' : 'text-text-muted'}`}>
                                  {Math.round(pctUsed)}%
                                </span>
                              </div>
                            </Td>
                            <Td align="right" sticky>
                              {isEditing ? (
                                <div className="flex justify-end gap-1">
                                  <IconButton icon={Check} label="Save" disabled={saving} variant="success" onClick={() => handleUpdateItem(item.id)} />
                                  <IconButton icon={X} label="Cancel" onClick={() => setEditingItem(null)} />
                                </div>
                              ) : (
                                <div className="row-actions">
                                  {!isFullyPaid && (
                                    <button
                                      onClick={() => { setPayingItem(item.id); setPayForm({ amount: '', date: new Date().toISOString().split('T')[0], account_id: '', notes: '' }) }}
                                      className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-cta/10 px-2.5 py-1.5 text-xs font-medium text-cta hover:bg-cta/20 cursor-pointer"
                                    >
                                      <Wallet className="h-4 w-4" />Pay
                                    </button>
                                  )}
                                  <IconButton
                                    icon={History}
                                    label="Payment history"
                                    onClick={() => setShowPayments(showPayments === item.id ? null : item.id)}
                                  />
                                  <IconButton
                                    icon={Pencil}
                                    label="Edit"
                                    onClick={() => { setEditingItem(item.id); setEditForm({ budgeted_amount: String(item.budgeted_amount), is_recurring: item.is_recurring }) }}
                                  />
                                  <IconButton icon={Trash2} label="Delete" variant="danger" onClick={() => handleDeleteItem(item.id)} />
                                </div>
                              )}
                            </Td>
                          </tr>

                          {/* Payment history (expanded row) */}
                          {showPayments === item.id && (
                            <tr className="bg-surface-alt/40">
                              <td colSpan={6} className="px-3 py-2">
                                <p className="mb-1 text-xs font-medium text-text-muted">Payment history</p>
                                {payments.length === 0 ? (
                                  <p className="text-xs text-text-muted">No payments recorded yet</p>
                                ) : (
                                  <div className="space-y-1">
                                    {payments.map((p) => (
                                      <div key={p.id} className="flex items-center justify-between text-xs">
                                        <span className="text-text-muted">
                                          {p.date} • {formatCurrency(p.amount)}
                                          {(p.account as any)?.name ? ` from ${(p.account as any).name}` : ''}
                                          {p.notes ? ` • ${p.notes}` : ''}
                                        </span>
                                        <IconButton
                                          icon={Trash2}
                                          label="Revert this payment"
                                          variant="danger"
                                          size="md"
                                          className="h-8 w-8"
                                          onClick={() => handleRevertPayment(p, item)}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })
                  )}
                </tbody>
                {budgetItems.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border">
                      <Td className="font-semibold">Total</Td>
                      <Td align="right" className="font-semibold">{formatCurrency(totalBudgeted)}</Td>
                      <Td align="right" className="font-semibold">{formatCurrency(totalSpent)}</Td>
                      <Td align="right">
                        <span className={`font-semibold ${variance >= 0 ? 'text-success' : 'text-danger'}`}>
                          {variance >= 0 ? '' : '−'}{formatCurrency(Math.abs(variance))}
                        </span>
                      </Td>
                      <Td align="right" className="text-text-muted">
                        {totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0}%
                      </Td>
                      <Td />
                    </tr>
                  </tfoot>
                )}
              </Table>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
