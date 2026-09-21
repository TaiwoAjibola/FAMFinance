import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency, getCurrentMonth, getMonthLabel, previousMonth, nextMonth } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Check, X, Repeat } from 'lucide-react'
import type { Category, BudgetItem, MonthlyBudget } from '@/types'

export function BudgetPage() {
  const { household } = useHousehold()
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [budget, setBudget] = useState<MonthlyBudget | null>(null)
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [addingItem, setAddingItem] = useState(false)
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ budgeted_amount: '', is_recurring: false })
  const [addForm, setAddForm] = useState({ category_id: '', budgeted_amount: '', is_recurring: false })
  const [saving, setSaving] = useState(false)
  const [editingCashTarget, setEditingCashTarget] = useState(false)
  const [cashTargetInput, setCashTargetInput] = useState('')

  useEffect(() => {
    if (!household) return
    fetchData()
  }, [household, currentMonth])

  const fetchData = async () => {
    if (!household) return
    setLoading(true)

    // Get or create budget for this month
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

      // Auto-copy recurring items from previous month
      if (budgetData) {
        await copyRecurringItems(household.id, budgetData.id)
      }
    }

    setBudget(budgetData)

    // Get categories
    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .eq('household_id', household.id)
      .eq('type', 'expense')
      .order('sort_order')
    setCategories(cats || [])

    // Get budget items for this month
    if (budgetData) {
      const { data: items } = await supabase
        .from('budget_items')
        .select('*, category:categories(*)')
        .eq('budget_id', budgetData.id)
      setBudgetItems(items || [])
    }

    setLoading(false)
  }

  const copyRecurringItems = async (householdId: string, newBudgetId: string) => {
    // Find previous month's budget
    const prevMonth = previousMonth(currentMonth)
    const { data: prevBudget } = await supabase
      .from('monthly_budgets')
      .select('id')
      .eq('household_id', householdId)
      .eq('month', prevMonth)
      .single()

    if (!prevBudget) return

    // Get recurring items from previous month
    const { data: recurringItems } = await supabase
      .from('budget_items')
      .select('*')
      .eq('budget_id', prevBudget.id)
      .eq('is_recurring', true)

    if (!recurringItems || recurringItems.length === 0) return

    // Copy to new budget
    const newItems = recurringItems.map((item) => ({
      budget_id: newBudgetId,
      category_id: item.category_id,
      budgeted_amount: item.budgeted_amount,
      spent_amount: 0,
      is_recurring: true,
    }))

    await supabase.from('budget_items').insert(newItems)
  }

  const handleAddItem = async () => {
    if (!budget || !addForm.category_id || !addForm.budgeted_amount) return
    setSaving(true)

    await supabase.from('budget_items').insert({
      budget_id: budget.id,
      category_id: addForm.category_id,
      budgeted_amount: parseInt(addForm.budgeted_amount) || 0,
      spent_amount: 0,
      is_recurring: addForm.is_recurring,
    })

    setAddForm({ category_id: '', budgeted_amount: '', is_recurring: false })
    setAddingItem(false)
    await fetchData()
    setSaving(false)
  }

  const handleUpdateItem = async (itemId: string) => {
    setSaving(true)

    await supabase
      .from('budget_items')
      .update({
        budgeted_amount: parseInt(editForm.budgeted_amount) || 0,
        is_recurring: editForm.is_recurring,
      })
      .eq('id', itemId)

    setEditingItem(null)
    await fetchData()
    setSaving(false)
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Remove this budget item?')) return
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
            <button
              onClick={() => setCurrentMonth(previousMonth(currentMonth))}
              className="rounded-lg p-2 text-text-muted hover:bg-surface-alt cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="min-w-[140px] text-center text-sm font-medium text-text">
              {getMonthLabel(currentMonth)}
            </span>
            <button
              onClick={() => setCurrentMonth(nextMonth(currentMonth))}
              className="rounded-lg p-2 text-text-muted hover:bg-surface-alt cursor-pointer"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            {currentMonth !== getCurrentMonth() && (
              <button
                onClick={() => setCurrentMonth(getCurrentMonth())}
                className="ml-2 rounded-lg bg-cta/10 px-3 py-1.5 text-xs font-medium text-cta hover:bg-cta/20 cursor-pointer"
              >
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
                <p className="stat-label">Total spent</p>
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
                      <input
                        type="number"
                        value={cashTargetInput}
                        onChange={(e) => setCashTargetInput(e.target.value)}
                        className="input-field w-36 text-sm"
                        placeholder="Target"
                      />
                      <button
                        onClick={handleUpdateCashTarget}
                        className="rounded-lg p-1.5 text-success hover:bg-success/5 cursor-pointer"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditingCashTarget(false)}
                        className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingCashTarget(true)
                        setCashTargetInput(String(budget.cash_on_hand_target || 0))
                      }}
                      className="text-sm font-medium text-cta hover:text-cta-light cursor-pointer"
                    >
                      {formatCurrency(budget.cash_on_hand_target || 0)} <Pencil className="inline h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Add item form */}
            {addingItem && (
              <div className="card border-accent/30">
                <h3 className="mb-4 text-lg font-semibold text-text">Add budget item</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="add-category" className="label">Category</label>
                    <select
                      id="add-category"
                      value={addForm.category_id}
                      onChange={(e) => setAddForm({ ...addForm, category_id: e.target.value })}
                      className="input-field"
                    >
                      <option value="">Select category</option>
                      {availableCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="add-amount" className="label">Budgeted amount (₦)</label>
                    <input
                      id="add-amount"
                      type="number"
                      value={addForm.budgeted_amount}
                      onChange={(e) => setAddForm({ ...addForm, budgeted_amount: e.target.value })}
                      className="input-field"
                      placeholder="0"
                    />
                  </div>
                  <div className="flex items-end gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addForm.is_recurring}
                        onChange={(e) => setAddForm({ ...addForm, is_recurring: e.target.checked })}
                        className="h-4 w-4 rounded border-border text-cta focus:ring-cta"
                      />
                      <span className="text-sm text-text">Recurring monthly</span>
                    </label>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={handleAddItem}
                    disabled={saving || !addForm.category_id || !addForm.budgeted_amount}
                    className="btn-primary"
                  >
                    {saving ? 'Saving...' : 'Add item'}
                  </button>
                  <button onClick={() => setAddingItem(false)} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Budget items */}
            <div className="card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text">Budget items</h2>
                {!addingItem && availableCategories.length > 0 && (
                  <button onClick={() => setAddingItem(true)} className="btn-primary text-sm">
                    <Plus className="h-4 w-4" />
                    Add item
                  </button>
                )}
              </div>

              {budgetItems.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-text-muted">No budget items yet</p>
                  <button
                    onClick={() => setAddingItem(true)}
                    className="btn-primary mt-3"
                    disabled={availableCategories.length === 0}
                  >
                    <Plus className="h-4 w-4" />
                    Add your first budget item
                  </button>
                  {availableCategories.length === 0 && (
                    <p className="mt-2 text-xs text-text-muted">
                      All categories are already budgeted for this month
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Header row */}
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-medium text-text-muted">
                    <div className="col-span-4">Category</div>
                    <div className="col-span-2 text-right">Budgeted</div>
                    <div className="col-span-2 text-right">Spent</div>
                    <div className="col-span-2 text-right">Remaining</div>
                    <div className="col-span-2 text-right">Actions</div>
                  </div>

                  {budgetItems.map((item) => {
                    const remaining = item.budgeted_amount - item.spent_amount
                    const isEditing = editingItem === item.id

                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-12 gap-2 rounded-lg border border-border px-3 py-3 items-center hover:border-accent/30 transition-colors"
                      >
                        {/* Category */}
                        <div className="col-span-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text">
                              {item.category?.name || 'Unknown'}
                            </span>
                            {item.is_recurring && (
                              <span title="Recurring"><Repeat className="h-3 w-3 text-accent" /></span>
                            )}
                          </div>
                        </div>

                        {/* Budgeted */}
                        <div className="col-span-2 text-right">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editForm.budgeted_amount}
                              onChange={(e) => setEditForm({ ...editForm, budgeted_amount: e.target.value })}
                              className="input-field w-24 text-right text-sm"
                            />
                          ) : (
                            <span className="text-sm text-text">{formatCurrency(item.budgeted_amount)}</span>
                          )}
                        </div>

                        {/* Spent */}
                        <div className="col-span-2 text-right">
                          <span className="text-sm text-text-muted">{formatCurrency(item.spent_amount)}</span>
                        </div>

                        {/* Remaining */}
                        <div className="col-span-2 text-right">
                          <span className={`text-sm font-medium ${remaining >= 0 ? 'text-success' : 'text-danger'}`}>
                            {formatCurrency(Math.abs(remaining))}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="col-span-2 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <label className="flex items-center gap-1 cursor-pointer mr-2">
                                <input
                                  type="checkbox"
                                  checked={editForm.is_recurring}
                                  onChange={(e) => setEditForm({ ...editForm, is_recurring: e.target.checked })}
                                  className="h-3 w-3 rounded border-border text-cta focus:ring-cta"
                                />
                                <span className="text-xs text-text-muted">Recur</span>
                              </label>
                              <button
                                onClick={() => handleUpdateItem(item.id)}
                                disabled={saving}
                                className="rounded-lg p-1.5 text-success hover:bg-success/5 cursor-pointer"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setEditingItem(null)}
                                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingItem(item.id)
                                  setEditForm({
                                    budgeted_amount: String(item.budgeted_amount),
                                    is_recurring: item.is_recurring,
                                  })
                                }}
                                className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item.id)}
                                className="rounded-lg p-1.5 text-danger hover:bg-danger/5 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {/* Totals row */}
                  <div className="grid grid-cols-12 gap-2 px-3 py-3 border-t border-border mt-2">
                    <div className="col-span-4 text-sm font-semibold text-text">Total</div>
                    <div className="col-span-2 text-right text-sm font-semibold text-text">
                      {formatCurrency(totalBudgeted)}
                    </div>
                    <div className="col-span-2 text-right text-sm font-semibold text-text">
                      {formatCurrency(totalSpent)}
                    </div>
                    <div className="col-span-2 text-right">
                      <span className={`text-sm font-semibold ${variance >= 0 ? 'text-success' : 'text-danger'}`}>
                        {formatCurrency(Math.abs(variance))}
                      </span>
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
