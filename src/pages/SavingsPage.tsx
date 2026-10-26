import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { IconButton } from '@/components/ui/IconButton'
import { Plus, PiggyBank, Target, Pencil, Trash2, Wallet, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import type { SavingsGoal, Account } from '@/types'

export function SavingsPage() {
  const { user } = useAuth()
  const { household } = useHousehold()
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [contributionGoal, setContributionGoal] = useState<SavingsGoal | null>(null)
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null)
  const [form, setForm] = useState({ name: '', target_amount: '', target_date: '', notes: '', destination_account_id: '' })
  const [contributionForm, setContributionForm] = useState({ amount: '', date: new Date().toISOString().split('T')[0], notes: '', from_account_id: '' })
  const [saving, setSaving] = useState(false)
  const [contributionType, setContributionType] = useState<'contribution' | 'withdrawal'>('contribution')
  const [contributing, setContributing] = useState(false)

  useEffect(() => {
    if (!household) return
    fetchData()
  }, [household])

  const fetchData = async () => {
    if (!household) return
    setLoading(true)

    const [goalRes, accountRes] = await Promise.all([
      supabase
        .from('savings_goals')
        .select('*, destination_account:accounts(*)')
        .eq('household_id', household.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('accounts')
        .select('*')
        .eq('household_id', household.id)
        .eq('is_active', true)
        .order('name'),
    ])

    setGoals(goalRes.data || [])
    setAccounts(accountRes.data || [])
    setLoading(false)
  }

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!household || !user) return
    setSaving(true)

    const payload = {
      name: form.name,
      target_amount: parseInt(form.target_amount) || 0,
      target_date: form.target_date || null,
      notes: form.notes || null,
      destination_account_id: form.destination_account_id || null,
    }

    if (editingGoal) {
      const { error } = await supabase
        .from('savings_goals')
        .update(payload)
        .eq('id', editingGoal.id)
      if (error) alert('Error: ' + error.message)
    } else {
      const { error } = await supabase.from('savings_goals').insert({
        household_id: household.id,
        ...payload,
      })
      if (error) {
        alert('Error: ' + error.message)
        setSaving(false)
        return
      }
    }

    setForm({ name: '', target_amount: '', target_date: '', notes: '', destination_account_id: '' })
    setShowForm(false)
    setEditingGoal(null)
    await fetchData()
    setSaving(false)
  }

  // Move money between a source account and the goal's destination account.
  // Saving money is a TRANSFER between accounts — never income or an expense —
  // so the household's total money is never double-counted.
  const handleContribution = async () => {
    if (!contributionGoal || !user) return
    const amount = parseInt(contributionForm.amount) || 0
    if (amount <= 0 || !contributionForm.from_account_id) return

    const destinationId = contributionGoal.destination_account_id
    if (!destinationId) {
      alert('This goal has no destination account yet. Edit the goal and choose the savings account it belongs to.')
      return
    }
    if (contributionType === 'contribution' && contributionForm.from_account_id === destinationId) {
      alert('Choose a different source account — money is already in the savings account.')
      return
    }

    setContributing(true)

    const isContribution = contributionType === 'contribution'
    const fromId = isContribution ? contributionForm.from_account_id : destinationId
    const toId = isContribution ? destinationId : contributionForm.from_account_id

    // 1. Record the transfer transaction
    const { data: txn, error: txnErr } = await supabase
      .from('transactions')
      .insert({
        household_id: contributionGoal.household_id,
        account_id: fromId,
        to_account_id: toId,
        type: 'transfer',
        amount,
        description: `${isContribution ? 'Saving for' : 'Withdrawal from'} ${contributionGoal.name}`,
        date: contributionForm.date,
        notes: contributionForm.notes || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (txnErr) {
      alert('Error: ' + txnErr.message)
      setContributing(false)
      return
    }

    // 2. Move the money (fresh balance reads)
    const { data: fromAcct } = await supabase
      .from('accounts').select('balance').eq('id', fromId).single()
    if (fromAcct) {
      await supabase
        .from('accounts')
        .update({ balance: fromAcct.balance - amount })
        .eq('id', fromId)
    }
    const { data: toAcct } = await supabase
      .from('accounts').select('balance').eq('id', toId).single()
    if (toAcct) {
      await supabase
        .from('accounts')
        .update({ balance: toAcct.balance + amount })
        .eq('id', toId)
    }

    // 3. Track the contribution history + goal progress
    await supabase.from('savings_contributions').insert({
      savings_goal_id: contributionGoal.id,
      amount,
      type: contributionType,
      date: contributionForm.date,
      notes: contributionForm.notes || null,
      transaction_id: txn?.id || null,
    })

    const newAmount = isContribution
      ? contributionGoal.current_amount + amount
      : Math.max(0, contributionGoal.current_amount - amount)

    await supabase
      .from('savings_goals')
      .update({
        current_amount: newAmount,
        status: newAmount >= contributionGoal.target_amount ? 'completed' : contributionGoal.status,
      })
      .eq('id', contributionGoal.id)

    setContributionForm({ amount: '', date: new Date().toISOString().split('T')[0], notes: '', from_account_id: '' })
    setContributionGoal(null)
    setContributing(false)
    await fetchData()
  }

  const handleDeleteGoal = async (id: string) => {
    if (!confirm('Delete this savings goal? Contributions already recorded stay in your transaction history.')) return
    await supabase.from('savings_goals').delete().eq('id', id)
    await fetchData()
  }

  const totalSaved = goals.reduce((sum, g) => sum + g.current_amount, 0)
  const totalTarget = goals.reduce((sum, g) => sum + g.target_amount, 0)

  const getAccountName = (id?: string | null) => accounts.find((a) => a.id === id)?.name || null

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Savings</h1>
            <p className="text-sm text-text-muted">Save toward goals — money moves between your accounts, never double-counted</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingGoal(null); setForm({ name: '', target_amount: '', target_date: '', notes: '', destination_account_id: '' }) }}
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
                  <label htmlFor="destination_account" className="label">Destination account</label>
                  <select
                    id="destination_account"
                    value={form.destination_account_id}
                    onChange={(e) => setForm({ ...form, destination_account_id: e.target.value })}
                    className="input-field"
                    required={!editingGoal}
                  >
                    <option value="">Select savings account</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-text-muted">
                    The account where this goal's money lives. Saving moves money into it as a transfer.
                  </p>
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
                <div className="sm:col-span-2">
                  <label htmlFor="notes" className="label">Purpose / notes (optional)</label>
                  <input
                    id="notes"
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="input-field"
                    placeholder="e.g. Six months of living expenses"
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

        {/* Contribute / withdraw form */}
        {contributionGoal && (
          <div className="card border-accent/30">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-text">
                {contributionType === 'contribution' ? 'Save into' : 'Withdraw from'} {contributionGoal.name}
              </h3>
              <div className="flex rounded-lg bg-surface-alt p-1" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={contributionType === 'contribution'}
                  onClick={() => setContributionType('contribution')}
                  className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    contributionType === 'contribution' ? 'bg-success text-white' : 'text-text-muted'
                  }`}
                >
                  <ArrowDownToLine className="h-4 w-4" /> Save
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={contributionType === 'withdrawal'}
                  onClick={() => setContributionType('withdrawal')}
                  className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    contributionType === 'withdrawal' ? 'bg-danger text-white' : 'text-text-muted'
                  }`}
                >
                  <ArrowUpFromLine className="h-4 w-4" /> Withdraw
                </button>
              </div>
            </div>
            <p className="mb-4 mt-1 text-sm text-text-muted">
              {contributionGoal.destination_account_id
                ? <>Destination: <span className="font-medium text-text">{getAccountName(contributionGoal.destination_account_id)}</span></>
                : <span className="text-danger">This goal has no destination account — edit the goal to set one.</span>}
              {' '}• Progress: {formatCurrency(contributionGoal.current_amount)} of {formatCurrency(contributionGoal.target_amount)}
            </p>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="contrib-amount" className="label">Amount (₦)</label>
                  <input
                    id="contrib-amount"
                    type="number"
                    value={contributionForm.amount}
                    onChange={(e) => setContributionForm({ ...contributionForm, amount: e.target.value })}
                    className="input-field"
                    placeholder="0"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="contrib-from" className="label">
                    {contributionType === 'contribution' ? 'From account' : 'Back into account'}
                  </label>
                  <select
                    id="contrib-from"
                    value={contributionForm.from_account_id}
                    onChange={(e) => setContributionForm({ ...contributionForm, from_account_id: e.target.value })}
                    className="input-field"
                    required
                  >
                    <option value="">Select account</option>
                    {accounts
                      .filter((a) => contributionType === 'withdrawal' || a.id !== contributionGoal.destination_account_id)
                      .map((a) => (
                        <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="contrib-date" className="label">Date</label>
                  <input
                    id="contrib-date"
                    type="date"
                    value={contributionForm.date}
                    onChange={(e) => setContributionForm({ ...contributionForm, date: e.target.value })}
                    className="input-field"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="contrib-notes" className="label">Notes (optional)</label>
                <input
                  id="contrib-notes"
                  type="text"
                  value={contributionForm.notes}
                  onChange={(e) => setContributionForm({ ...contributionForm, notes: e.target.value })}
                  className="input-field"
                  placeholder="e.g. Monthly saving"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleContribution}
                  disabled={contributing || !contributionForm.amount || !contributionForm.from_account_id || !contributionGoal.destination_account_id}
                  className="btn-primary"
                >
                  <Wallet className="h-4 w-4" />
                  {contributing ? 'Moving money...' : contributionType === 'contribution' ? 'Save into goal' : 'Withdraw from goal'}
                </button>
                <button
                  onClick={() => { setContributionGoal(null); setContributionForm({ amount: '', date: new Date().toISOString().split('T')[0], notes: '', from_account_id: '' }) }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-text-muted">
                This is recorded as a transfer between your accounts — the household's total money stays accurate.
              </p>
            </div>
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
              const destinationName = getAccountName(goal.destination_account_id)

              return (
                <div key={goal.id} className="card-hover group">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-text">{goal.name}</p>
                        {isComplete && <span className="badge-success">Completed</span>}
                        {!destinationName && <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">No destination account</span>}
                      </div>
                      <p className="text-xs text-text-muted">
                        {formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)}
                        {destinationName && ` • Saved in ${destinationName}`}
                        {goal.target_date && ` • Target: ${goal.target_date}`}
                        {goal.notes && ` • ${goal.notes}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setContributionGoal(goal)
                          setContributionType('contribution')
                          setContributionForm({ amount: '', date: new Date().toISOString().split('T')[0], notes: '', from_account_id: '' })
                        }}
                        className="btn-secondary text-xs"
                      >
                        <Plus className="h-4 w-4" />
                        Save
                      </button>
                      <div className="row-actions">
                        <IconButton
                          icon={ArrowUpFromLine}
                          label="Withdraw from goal"
                          onClick={() => {
                            setContributionGoal(goal)
                            setContributionType('withdrawal')
                            setContributionForm({ amount: '', date: new Date().toISOString().split('T')[0], notes: '', from_account_id: '' })
                          }}
                        />
                        <IconButton
                          icon={Pencil}
                          label="Edit savings goal"
                          onClick={() => {
                            setEditingGoal(goal)
                            setForm({
                              name: goal.name,
                              target_amount: String(goal.target_amount),
                              target_date: goal.target_date || '',
                              notes: goal.notes || '',
                              destination_account_id: goal.destination_account_id || '',
                            })
                            setShowForm(true)
                          }}
                        />
                        <IconButton icon={Trash2} label="Delete savings goal" variant="danger" onClick={() => handleDeleteGoal(goal.id)} />
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                      <span>{formatCurrency(goal.current_amount)} of {formatCurrency(goal.target_amount)} saved</span>
                      <span>{percentage.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-alt">
                      <div
                        className={`h-full transition-all ${isComplete ? 'bg-success' : 'bg-cta'}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
