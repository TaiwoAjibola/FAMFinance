import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency, getCurrentMonth, getMonthLabel, previousMonth, nextMonth } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Check, X, Repeat, Tag, Settings, Wallet, History } from 'lucide-react'
import type { Category, BudgetItem, MonthlyBudget, Account, BudgetPayment } from '@/types'

export function BudgetPage() {
  const { user } = useAuth()
  const { household } = useHousehold()
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [budget, setBudget] = useState<MonthlyBudget | null>(null)
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
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

  // Cash on hand
  const [editingCashTarget, setEditingCashTarget] = useState(false)
  const [cashTargetInput, setCashTargetInput] = useState('')

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
    await supabase.from('budget_items').delete().eq('id', itemId)
    await fetchData()
  }

  const handleUpdateCashTarget = async () => {
    if (!budget) return
    await supabase
      .from('monthly_budgets')
      .update({ cash_on_hand_target: parseInt(cashTargetInput) || 0 })
      .eq('id', budget.id)
    setEditingCashTarget(false)
    await fetchData()
  }

  // --- Payment recording ---

  const handleRecordPayment = async (item: BudgetItem) => {
    if (!user || !payForm.amount || !payForm.account_id) return
    const amount = parseInt(payForm.amount) || 0
    if (amount <= 0) return
    setPaying(true)

    // 1. Create transaction
    const { data: txn } = await supabase
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
        budget_item_id: item.id,
        created_by: user.id,
      })
      .select()
      .single()

    // 2. Create budget payment
    await supabase.from('budget_payments').insert({
      budget_item_id: item.id,
      amount,
      date: payForm.date,
      account_id: payForm.account_id,
      notes: payForm.notes || null,
      transaction_id: txn?.id || null,
    })

    // 3. Update spent_amount on budget item
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

            {/* Cash on hand target */}
            {budget && (
              <div className="card">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-text-muted">Cash on hand target</p>
                  {editingCashTarget ? (
                    <div className="flex items-center gap-2">
                      <input type="number" value={cashTargetInput} onChange={(e) => setCashTargetInput(e.target.value)} className="input-field w-36 text-sm" placeholder="Target" />
                      <button onClick={handleUpdateCashTarget} className="rounded-lg p-1.5 text-success hover:bg-success/5 cursor-pointer"><Check className="h-4 w-4" /></button>
                      <button onClick={() => setEditingCashTarget(false)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingCashTarget(true); setCashTargetInput(String(budget.cash_on_hand_target || 0)) }} className="text-sm font-medium text-cta hover:text-cta-light cursor-pointer">
                      {formatCurrency(budget.cash_on_hand_target || 0)} <Pencil className="inline h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

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
                          <button onClick={() => handleUpdateCategory(cat.id)} disabled={catSaving} className="rounded-lg p-1.5 text-success hover:bg-success/5 cursor-pointer"><Check className="h-4 w-4" /></button>
                          <button onClick={() => setEditingCategory(null)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer"><X className="h-4 w-4" /></button>
                        </div>
                      ) : (
                        <>
                          <span className="text-sm text-text">{cat.name}</span>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingCategory(cat.id); setCatForm({ name: cat.name }) }} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer"><Pencil className="h-3.5 w-3.5" /></button>
                            <button onClick={() => handleDeleteCategory(cat.id)} className="rounded-lg p-1.5 text-danger hover:bg-danger/5 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
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
            <div className="card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text">Budget items</h2>
                {!addingItem && <button onClick={() => setAddingItem(true)} className="btn-primary text-sm"><Plus className="h-4 w-4" />Add item</button>}
              </div>

              {budgetItems.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-text-muted">No budget items yet</p>
                  <button onClick={() => setAddingItem(true)} className="btn-primary mt-3"><Plus className="h-4 w-4" />Add your first budget item</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {budgetItems.map((item) => {
                    const remaining = item.budgeted_amount - item.spent_amount
                    const isEditing = editingItem === item.id
                    const payments = itemPayments[item.id] || []
                    const isFullyPaid = item.spent_amount >= item.budgeted_amount

                    return (
                      <div key={item.id} className="rounded-lg border border-border hover:border-accent/30 transition-colors">
                        {/* Main row */}
                        <div className="grid grid-cols-12 gap-2 px-3 py-3 items-center">
                          <div className="col-span-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-text">{getItemName(item)}</span>
                              {item.is_recurring && <span title="Recurring"><Repeat className="h-3 w-3 text-accent" /></span>}
                              {!item.category_id && item.custom_name && <span className="rounded bg-surface-alt px-1.5 py-0.5 text-[10px] text-text-muted">Custom</span>}
                              {isFullyPaid && <span className="rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">Paid</span>}
                            </div>
                          </div>
                          <div className="col-span-2 text-right">
                            {isEditing ? (
                              <input type="number" value={editForm.budgeted_amount} onChange={(e) => setEditForm({ ...editForm, budgeted_amount: e.target.value })} className="input-field w-24 text-right text-sm" />
                            ) : (
                              <span className="text-sm text-text">{formatCurrency(item.budgeted_amount)}</span>
                            )}
                          </div>
                          <div className="col-span-2 text-right">
                            <span className={`text-sm font-medium ${item.spent_amount > 0 ? 'text-text' : 'text-text-muted'}`}>{formatCurrency(item.spent_amount)}</span>
                          </div>
                          <div className="col-span-2 text-right">
                            <span className={`text-sm font-medium ${remaining >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(Math.abs(remaining))}</span>
                          </div>
                          <div className="col-span-2 text-right">
                            {isEditing ? (
                              <div className="flex items-center justify-end gap-1">
                                <label className="flex items-center gap-1 cursor-pointer mr-2">
                                  <input type="checkbox" checked={editForm.is_recurring} onChange={(e) => setEditForm({ ...editForm, is_recurring: e.target.checked })} className="h-3 w-3 rounded border-border text-cta focus:ring-cta" />
                                  <span className="text-xs text-text-muted">Recur</span>
                                </label>
                                <button onClick={() => handleUpdateItem(item.id)} disabled={saving} className="rounded-lg p-1.5 text-success hover:bg-success/5 cursor-pointer"><Check className="h-4 w-4" /></button>
                                <button onClick={() => setEditingItem(null)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer"><X className="h-4 w-4" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                {!isFullyPaid && (
                                  <button onClick={() => { setPayingItem(item.id); setPayForm({ amount: '', date: new Date().toISOString().split('T')[0], account_id: '', notes: '' }) }} className="rounded-lg bg-cta/10 px-2 py-1 text-xs font-medium text-cta hover:bg-cta/20 cursor-pointer">
                                    <Wallet className="inline h-3 w-3 mr-1" />Pay
                                  </button>
                                )}
                                <button onClick={() => setShowPayments(showPayments === item.id ? null : item.id)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer" title="Payment history">
                                  <History className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => { setEditingItem(item.id); setEditForm({ budgeted_amount: String(item.budgeted_amount), is_recurring: item.is_recurring }) }} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer"><Pencil className="h-3.5 w-3.5" /></button>
                                <button onClick={() => handleDeleteItem(item.id)} className="rounded-lg p-1.5 text-danger hover:bg-danger/5 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Payment history */}
                        {showPayments === item.id && payments.length > 0 && (
                          <div className="border-t border-border px-3 py-2">
                            <p className="text-xs font-medium text-text-muted mb-2">Payment history</p>
                            {payments.map((p) => (
                              <div key={p.id} className="flex items-center justify-between py-1 text-xs">
                                <span className="text-text-muted">{p.date}</span>
                                <span className="text-text font-medium">{formatCurrency(p.amount)}</span>
                                <span className="text-text-muted">{(p.account as any)?.name || '—'}</span>
                                {p.notes && <span className="text-text-muted italic">{p.notes}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        {showPayments === item.id && payments.length === 0 && (
                          <div className="border-t border-border px-3 py-2">
                            <p className="text-xs text-text-muted">No payments recorded yet</p>
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Totals row */}
                  <div className="grid grid-cols-12 gap-2 px-3 py-3 border-t border-border mt-2">
                    <div className="col-span-4 text-sm font-semibold text-text">Total</div>
                    <div className="col-span-2 text-right text-sm font-semibold text-text">{formatCurrency(totalBudgeted)}</div>
                    <div className="col-span-2 text-right text-sm font-semibold text-text">{formatCurrency(totalSpent)}</div>
                    <div className="col-span-2 text-right">
                      <span className={`text-sm font-semibold ${variance >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(Math.abs(variance))}</span>
                    </div>
                    <div className="col-span-2"></div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
