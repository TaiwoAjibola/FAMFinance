import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import { History, Search, ArrowDownCircle, ArrowUpCircle, ArrowRightLeft } from 'lucide-react'
import type { Transaction, Account, Category } from '@/types'

export function HistoryPage() {
  const { household } = useHousehold()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)

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
        .order('date', { ascending: false })
        .limit(100),
      supabase
        .from('accounts')
        .select('*')
        .eq('household_id', household.id),
      supabase
        .from('categories')
        .select('*')
        .eq('household_id', household.id),
    ])

    setTransactions(txRes.data || [])
    setAccounts(accountRes.data || [])
    setCategories(catRes.data || [])
    setLoading(false)
  }

  const filtered = transactions.filter((tx) => {
    if (search && !tx.description.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType && tx.type !== filterType) return false
    if (filterCategory && tx.category_id !== filterCategory) return false
    if (filterAccount && tx.account_id !== filterAccount) return false
    return true
  })

  const getAccountName = (id: string) => accounts.find((a) => a.id === id)?.name || 'Unknown'
  const getCategoryName = (id: string | null | undefined) => categories.find((c) => c.id === id)?.name || '-'

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'income': return <ArrowDownCircle className="h-4 w-4 text-success" />
      case 'expense': return <ArrowUpCircle className="h-4 w-4 text-danger" />
      case 'transfer': return <ArrowRightLeft className="h-4 w-4 text-cta" />
      default: return <ArrowRightLeft className="h-4 w-4 text-text-muted" />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'income': return 'text-success'
      case 'expense': return 'text-danger'
      case 'transfer': return 'text-cta'
      default: return 'text-text'
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Transaction History</h1>
          <p className="text-sm text-text-muted">Search and filter all transactions</p>
        </div>

        {/* Filters */}
        <div className="card">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-light" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field pl-9"
                placeholder="Search transactions..."
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="input-field"
            >
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
              <option value="refund">Refund</option>
              <option value="adjustment">Adjustment</option>
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="input-field"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="input-field"
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results count */}
        <p className="text-sm text-text-muted">
          Showing {filtered.length} of {transactions.length} transactions
        </p>

        {/* Transaction list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-cta border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card py-12 text-center">
            <History className="mx-auto h-10 w-10 text-text-light" />
            <p className="mt-3 text-sm text-text-muted">
              {transactions.length === 0 ? 'No transactions yet' : 'No matching transactions'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((tx) => (
              <div
                key={tx.id}
                className="card-hover cursor-pointer group"
                onClick={() => setSelectedTx(selectedTx?.id === tx.id ? null : tx)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-alt">
                      {getTypeIcon(tx.type)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text">{tx.description}</p>
                      <p className="text-xs text-text-muted">
                        {tx.date} • {getCategoryName(tx.category_id)} • {getAccountName(tx.account_id)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${getTypeColor(tx.type)}`}>
                      {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}{formatCurrency(tx.amount)}
                    </p>
                    <p className="text-xs text-text-muted capitalize">{tx.type}</p>
                  </div>
                </div>

                {/* Expanded details */}
                {selectedTx?.id === tx.id && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-text-muted">Type</p>
                        <p className="font-medium capitalize">{tx.type}</p>
                      </div>
                      <div>
                        <p className="text-text-muted">Amount</p>
                        <p className="font-medium">{formatCurrency(tx.amount)}</p>
                      </div>
                      <div>
                        <p className="text-text-muted">From account</p>
                        <p className="font-medium">{getAccountName(tx.account_id)}</p>
                      </div>
                      {tx.to_account_id && (
                        <div>
                          <p className="text-text-muted">To account</p>
                          <p className="font-medium">{getAccountName(tx.to_account_id)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-text-muted">Category</p>
                        <p className="font-medium">{getCategoryName(tx.category_id)}</p>
                      </div>
                      <div>
                        <p className="text-text-muted">Date</p>
                        <p className="font-medium">{tx.date}</p>
                      </div>
                      {tx.notes && (
                        <div className="col-span-2">
                          <p className="text-text-muted">Notes</p>
                          <p className="font-medium">{tx.notes}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-text-muted">Created</p>
                        <p className="font-medium">{tx.created_at}</p>
                      </div>
                      <div>
                        <p className="text-text-muted">Last updated</p>
                        <p className="font-medium">{tx.updated_at}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
