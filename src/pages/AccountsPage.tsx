import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { Plus, Wallet, Landmark, Banknote, PiggyBank, HelpCircle, Pencil, Trash2 } from 'lucide-react'
import type { Account } from '@/types'

const ACCOUNT_ICONS: Record<string, React.ReactNode> = {
  bank: <Landmark className="h-5 w-5" />,
  cash: <Banknote className="h-5 w-5" />,
  savings: <PiggyBank className="h-5 w-5" />,
  other: <HelpCircle className="h-5 w-5" />,
}

const ACCOUNT_COLORS: Record<string, string> = {
  bank: 'bg-cta/10 text-cta',
  cash: 'bg-accent/10 text-accent',
  savings: 'bg-success/10 text-success',
  other: 'bg-text-light/10 text-text-muted',
}

export function AccountsPage() {
  const { household } = useHousehold()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [form, setForm] = useState({ name: '', type: 'bank' as Account['type'], balance: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!household) return
    fetchAccounts()
  }, [household])

  const fetchAccounts = async () => {
    if (!household) return
    setLoading(true)
    const { data } = await supabase
      .from('accounts')
      .select('*')
      .eq('household_id', household.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    setAccounts(data || [])
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!household) return
    setSaving(true)

    if (editingAccount) {
      await supabase
        .from('accounts')
        .update({ name: form.name, type: form.type, balance: parseInt(form.balance) || 0 })
        .eq('id', editingAccount.id)
    } else {
      await supabase.from('accounts').insert({
        household_id: household.id,
        name: form.name,
        type: form.type,
        balance: parseInt(form.balance) || 0,
        currency: 'NGN',
      })
    }

    setForm({ name: '', type: 'bank', balance: '' })
    setShowForm(false)
    setEditingAccount(null)
    await fetchAccounts()
    setSaving(false)
  }

  const handleEdit = (account: Account) => {
    setEditingAccount(account)
    setForm({ name: account.name, type: account.type, balance: String(account.balance) })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this account?')) return
    await supabase.from('accounts').update({ is_active: false }).eq('id', id)
    await fetchAccounts()
  }

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Accounts</h1>
            <p className="text-sm text-text-muted">Manage your household accounts and cash on hand</p>
          </div>
          <button
            onClick={() => { setShowForm(true); setEditingAccount(null); setForm({ name: '', type: 'bank', balance: '' }) }}
            className="btn-primary"
          >
            <Plus className="h-4 w-4" />
            Add account
          </button>
        </div>

        {/* Info box */}
        <div className="rounded-lg bg-cta/5 border border-cta/20 p-4">
          <p className="text-sm font-medium text-text">Setting up your accounts</p>
          <ul className="mt-2 text-xs text-text-muted space-y-1">
            <li>• <strong>Bank account:</strong> For money in your bank</li>
            <li>• <strong>Cash:</strong> For physical cash on hand — enter your current cash balance as the opening balance</li>
            <li>• <strong>Savings:</strong> For money set aside in savings</li>
          </ul>
        </div>

        {/* Total balance */}
        <div className="stat-card">
          <Wallet className="h-5 w-5 text-cta" />
          <p className="stat-value">{formatCurrency(totalBalance)}</p>
          <p className="stat-label">Total balance across all accounts</p>
        </div>

        {/* Account form */}
        {showForm && (
          <div className="card border-accent/30">
            <h3 className="mb-4 text-lg font-semibold text-text">
              {editingAccount ? 'Edit account' : 'Add new account'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="name" className="label">Account name</label>
                  <input
                    id="name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input-field"
                    placeholder="e.g. Husband's bank"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="type" className="label">Account type</label>
                  <select
                    id="type"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as Account['type'] })}
                    className="input-field"
                  >
                    <option value="bank">Bank</option>
                    <option value="cash">Cash</option>
                    <option value="savings">Savings</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="balance" className="label">Opening balance (₦)</label>
                  <input
                    id="balance"
                    type="number"
                    value={form.balance}
                    onChange={(e) => setForm({ ...form, balance: e.target.value })}
                    className="input-field"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : editingAccount ? 'Update account' : 'Add account'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setEditingAccount(null) }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Account list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-cta border-t-transparent" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="card py-12 text-center">
            <Wallet className="mx-auto h-10 w-10 text-text-light" />
            <p className="mt-3 text-sm text-text-muted">No accounts yet</p>
            <button onClick={() => setShowForm(true)} className="btn-primary mt-4">
              <Plus className="h-4 w-4" />
              Add your first account
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
              <div key={account.id} className="card-hover group">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${ACCOUNT_COLORS[account.type]}`}>
                      {ACCOUNT_ICONS[account.type]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text">{account.name}</p>
                      <p className="text-xs text-text-muted capitalize">{account.type}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleEdit(account)} className="rounded-lg p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleDelete(account.id)} className="rounded-lg p-1.5 text-danger hover:bg-danger/5 cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-xl font-bold text-text">{formatCurrency(account.balance)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
