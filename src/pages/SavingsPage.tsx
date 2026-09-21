import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { Plus, PiggyBank, Target, Pencil, Trash2 } from 'lucide-react'
import type { SavingsGoal } from '@/types'

export function SavingsPage() {
  const { household } = useHousehold()
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showContributionForm, setShowContributionForm] = useState<string | null>(null)
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null)
  const [form, setForm] = useState({ name: '', target_amount: '', target_date: '', notes: '' })
  const [contributionForm, setContributionForm] = useState({ amount: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [contributionType, setContributionType] = useState<'contribution' | 'withdrawal'>('contribution')

  useEffect(() => {
    if (!household) return
    fetchData()
  }, [household])

  const fetchData = async () => {
    if (!household) return
    setLoading(true)

    const { data } = await supabase
      .from('savings_goals')
      .select('*')
      .eq('household_id', household.id)
      .order('created_at', { ascending: false })

    setGoals(data || [])
    setLoading(false)
  }

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!household) return
    setSaving(true)

    if (editingGoal) {
      await supabase
        .from('savings_goals')
        .update({
          name: form.name,
          target_amount: parseInt(form.target_amount) || 0,
          target_date: form.target_date || null,
          notes: form.notes || null,
        })
        .eq('id', editingGoal.id)
    } else {
      await supabase.from('savings_goals').insert({
        household_id: household.id,
        name: form.name,
        target_amount: parseInt(form.target_amount) || 0,
        target_date: form.target_date || null,
        notes: form.notes || null,
      })
    }

    setForm({ name: '', target_amount: '', target_date: '', notes: '' })
    setShowForm(false)
    setEditingGoal(null)
    await fetchData()
    setSaving(false)
  }

  const handleContribution = async (goalId: string) => {
    const amount = parseInt(contributionForm.amount) || 0
    if (amount <= 0) return

    const goal = goals.find((g) => g.id === goalId)
    if (!goal) return

    const newAmount = contributionType === 'contribution'
      ? goal.current_amount + amount
      : goal.current_amount - amount

    await supabase.from('savings_contributions').insert({
      savings_goal_id: goalId,
      amount,
      type: contributionType,
      date: new Date().toISOString().split('T')[0],
      notes: contributionForm.notes || null,
    })

    await supabase
      .from('savings_goals')
      .update({
        current_amount: Math.max(0, newAmount),
        status: newAmount >= goal.target_amount ? 'completed' : goal.status,
      })
      .eq('id', goalId)

    setContributionForm({ amount: '', notes: '' })
    setShowContributionForm(null)
    await fetchData()
  }

  const handleDeleteGoal = async (id: string) => {
    if (!confirm('Are you sure you want to delete this savings goal?')) return
    await supabase.from('savings_goals').delete().eq('id', id)
    await fetchData()
  }

  const totalSaved = goals.reduce((sum, g) => sum + g.current_amount, 0)
  const totalTarget = goals.reduce((sum, g) => sum + g.target_amount, 0)

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Savings</h1>
            <p className="text-sm text-text-muted">Track your savings goals</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingGoal(null); setForm({ name: '', target_amount: '', target_date: '', notes: '' }) }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            New goal
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="stat-card">
            <PiggyBank className="h-5 w-5 text-cta" />
            <p className="stat-value">{formatCurrency(totalSaved)}</p>
            <p className="stat-label">Total saved</p>
          </div>
          <div className="stat-card">
            <Target className="h-5 w-5 text-accent" />
            <p className="stat-value">{formatCurrency(totalTarget)}</p>
            <p className="stat-label">Total target</p>
          </div>
        </div>

        {/* Goal form */}
        {showForm && (
          <div className="card border-accent/30">
            <h3 className="mb-4 text-lg font-semibold text-text">
              {editingGoal ? 'Edit savings goal' : 'Create savings goal'}
            </h3>
            <form onSubmit={handleCreateGoal} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="name" className="label">Goal name</label>
                  <input
                    id="name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input-field"
                    placeholder="e.g. Emergency fund"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="target_amount" className="label">Target amount (₦)</label>
                  <input
                    id="target_amount"
                    type="number"
                    value={form.target_amount}
                    onChange={(e) => setForm({ ...form, target_amount: e.target.value })}
                    className="input-field"
                    placeholder="0"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="target_date" className="label">Target date (optional)</label>
                  <input
                    id="target_date"
                    type="date"
                    value={form.target_date}
                    onChange={(e) => setForm({ ...form, target_date: e.target.value })}
                    className="input-field"
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
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : editingGoal ? 'Update goal' : 'Create goal'}
                </button>
                <button type="button" onClick={() => { setShowForm(false); setEditingGoal(null) }} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Savings goals */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-cta border-t-transparent" />
          </div>
        ) : goals.length === 0 ? (
          <div className="card py-12 text-center">
            <PiggyBank className="mx-auto h-10 w-10 text-text-light" />
            <p className="mt-3 text-sm text-text-muted">No savings goals yet</p>
            <button onClick={() => setShowForm(true)} className="btn-primary mt-4">
              <Plus className="h-4 w-4" />
              Create your first goal
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {goals.map((goal) => {
              const percentage = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0
              const isComplete = goal.status === 'completed'

              return (
                <div key={goal.id} className="card-hover group">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text">{goal.name}</p>
                        {isComplete && <span className="badge-success">Completed</span>}
                      </div>
                      <p className="text-xs text-text-muted">
                        {formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)}
                        {goal.target_date && ` • Target: ${goal.target_date}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setShowContributionForm(goal.id); setContributionType('contribution'); setContributionForm({ amount: '', notes: '' }) }}
                        className="btn-secondary text-xs"
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </button>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => {
                          setEditingGoal(goal)
                          setForm({ name: goal.name, target_amount: String(goal.target_amount), target_date: goal.target_date || '', notes: goal.notes || '' })
                          setShowForm(true)
                        }} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => handleDeleteGoal(goal.id)} className="rounded-lg p-1.5 text-danger hover:bg-danger/5 cursor-pointer">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="h-2 overflow-hidden rounded-full bg-surface-alt">
                      <div
                        className={`h-full transition-all ${isComplete ? 'bg-success' : 'bg-cta'}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-text-muted">{percentage.toFixed(0)}% complete</p>
                  </div>

                  {/* Contribution form */}
                  {showContributionForm === goal.id && (
                    <div className="mt-4 rounded-lg border border-border p-3">
                      <div className="flex gap-2 mb-3">
                        <button
                          onClick={() => setContributionType('contribution')}
                          className={`rounded-lg px-3 py-1 text-xs font-medium cursor-pointer ${
                            contributionType === 'contribution' ? 'bg-success text-white' : 'bg-surface-alt text-text-muted'
                          }`}
                        >
                          Contribute
                        </button>
                        <button
                          onClick={() => setContributionType('withdrawal')}
                          className={`rounded-lg px-3 py-1 text-xs font-medium cursor-pointer ${
                            contributionType === 'withdrawal' ? 'bg-danger text-white' : 'bg-surface-alt text-text-muted'
                          }`}
                        >
                          Withdraw
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={contributionForm.amount}
                          onChange={(e) => setContributionForm({ ...contributionForm, amount: e.target.value })}
                          className="input-field flex-1"
                          placeholder="Amount"
                        />
                        <button onClick={() => handleContribution(goal.id)} className="btn-primary text-xs">
                          Save
                        </button>
                        <button onClick={() => setShowContributionForm(null)} className="btn-secondary text-xs">
                          Cancel
                        </button>
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
