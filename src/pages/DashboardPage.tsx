import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency, getCurrentMonth, getMonthLabel } from '@/lib/utils'
import { Layout } from '@/components/layout/Layout'
import {
  Wallet,
  ArrowUpCircle,
  PiggyBank,
  Target,
  TrendingUp,
  TrendingDown,
  Plus,
  ArrowRight,
} from 'lucide-react'

interface DashboardData {
  totalIncome: number
  expectedIncome: number
  totalExpenses: number
  operatingExpenses: number
  savingsContributed: number
  cashOnHand: number
  accountBalances: { name: string; balance: number; type: string }[]
  upcomingPlanned: { title: string; amount: number; due_date: string }[]
  recentTransactions: {
    id: string
    description: string
    amount: number
    type: string
    date: string
    category?: string
  }[]
}

export function DashboardPage() {
  const { household } = useHousehold()
  const [data, setData] = useState<DashboardData>({
    totalIncome: 0,
    expectedIncome: 0,
    totalExpenses: 0,
    operatingExpenses: 0,
    savingsContributed: 0,
    cashOnHand: 0,
    accountBalances: [],
    upcomingPlanned: [],
    recentTransactions: [],
  })
  const [loading, setLoading] = useState(true)
  const currentMonth = getCurrentMonth()

  useEffect(() => {
    if (!household) return

    const fetchDashboard = async () => {
      setLoading(true)

      const [incomeRes, expenseRes, accountRes, plannedRes, transactionRes, savingsRes, cashRes] =
        await Promise.all([
          supabase
            .from('transactions')
            .select('amount, type, category:categories(name)')
            .eq('household_id', household.id)
            .eq('type', 'income')
            .gte('date', `${currentMonth}-01`)
            .lt('date', `${currentMonth}-32`),
          supabase
            .from('transactions')
            .select('amount, type, category:categories(name)')
            .eq('household_id', household.id)
            .eq('type', 'expense')
            .gte('date', `${currentMonth}-01`)
            .lt('date', `${currentMonth}-32`),
          supabase
            .from('accounts')
            .select('name, balance, type')
            .eq('household_id', household.id)
            .eq('is_active', true),
          supabase
            .from('planned_expenses')
            .select('title, amount, due_date')
            .eq('household_id', household.id)
            .eq('target_month', currentMonth)
            .in('status', ['planned', 'partially_paid'])
            .order('due_date', { ascending: true })
            .limit(5),
          supabase
            .from('transactions')
            .select('id, description, amount, type, date, category:categories(name)')
            .eq('household_id', household.id)
            .order('date', { ascending: false })
            .limit(5),
          supabase
            .from('savings_contributions')
            .select('amount, type, savings_goal:savings_goals(household_id)')
            .eq('type', 'contribution')
            .gte('date', `${currentMonth}-01`)
            .lt('date', `${currentMonth}-32`),
          supabase
            .from('cash_on_hand')
            .select('current_amount')
            .eq('household_id', household.id)
            .eq('month', currentMonth)
            .single(),
        ])

      const income = (incomeRes.data || []).reduce((sum, t) => sum + t.amount, 0)
      const expenses = (expenseRes.data || []).reduce((sum, t) => sum + t.amount, 0)
      const operating = (expenseRes.data || [])
        .filter((t) => {
          const cat = t.category as unknown as { name: string } | null
          return cat && [
            'Food and food-related',
            'Transportation',
            "Daughter's needs",
            'Other household costs',
            'Internet',
            'Theological seminary',
            'Cooking gas',
            'Water',
            'Electricity',
            'Dustbin',
          ].includes(cat.name)
        })
        .reduce((sum, t) => sum + t.amount, 0)

      const savings = (savingsRes.data || [])
        .filter((c) => {
          const goal = c.savings_goal as unknown as { household_id: string } | null
          return goal?.household_id === household.id
        })
        .reduce((sum, c) => sum + c.amount, 0)

      setData({
        totalIncome: income,
        expectedIncome: 0,
        totalExpenses: expenses,
        operatingExpenses: operating,
        savingsContributed: savings,
        cashOnHand: cashRes.data?.current_amount || 0,
        accountBalances: (accountRes.data || []).map((a) => ({
          name: a.name,
          balance: a.balance,
          type: a.type,
        })),
        upcomingPlanned: (plannedRes.data || []).map((p) => ({
          title: p.title,
          amount: p.amount,
          due_date: p.due_date || '',
        })),
        recentTransactions: (transactionRes.data || []).map((t) => ({
          id: t.id,
          description: t.description,
          amount: t.amount,
          type: t.type,
          date: t.date,
          category: (t.category as unknown as { name: string } | null)?.name,
        })),
      })

      setLoading(false)
    }

    fetchDashboard()
  }, [household, currentMonth])

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-cta border-t-transparent" />
            <p className="mt-3 text-sm text-text-muted">Loading dashboard...</p>
          </div>
        </div>
      </Layout>
    )
  }

  const totalBalance = data.accountBalances.reduce((sum, a) => sum + a.balance, 0)
  const remaining = data.totalIncome - data.totalExpenses

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Dashboard</h1>
            <p className="text-sm text-text-muted">{getMonthLabel(currentMonth)}</p>
          </div>
          <Link to="/expenses/new" className="btn-primary">
            <Plus className="h-4 w-4" />
            Add transaction
          </Link>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="stat-card">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10">
                <TrendingUp className="h-4 w-4 text-success" />
              </div>
            </div>
            <p className="stat-value text-success">{formatCurrency(data.totalIncome)}</p>
            <p className="stat-label">Income received</p>
          </div>

          <div className="stat-card">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger/10">
                <TrendingDown className="h-4 w-4 text-danger" />
              </div>
            </div>
            <p className="stat-value text-danger">{formatCurrency(data.totalExpenses)}</p>
            <p className="stat-label">Total expenses</p>
          </div>

          <div className="stat-card">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cta/10">
                <PiggyBank className="h-4 w-4 text-cta" />
              </div>
            </div>
            <p className="stat-value text-cta">{formatCurrency(data.savingsContributed)}</p>
            <p className="stat-label">Savings contributed</p>
          </div>

          <div className="stat-card">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10">
                <Wallet className="h-4 w-4 text-accent" />
              </div>
            </div>
            <p className="stat-value text-accent">{formatCurrency(data.cashOnHand)}</p>
            <p className="stat-label">Cash on hand</p>
          </div>
        </div>

        {/* Balance overview */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text">Available Balance</h2>
            <Link to="/accounts" className="text-sm font-medium text-cta hover:text-cta-light flex items-center gap-1 cursor-pointer">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <p className="text-3xl font-bold text-text">{formatCurrency(totalBalance)}</p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.accountBalances.map((account) => (
              <div key={account.name} className="flex items-center justify-between rounded-lg bg-surface-alt p-3">
                <span className="text-sm text-text-muted">{account.name}</span>
                <span className="text-sm font-medium text-text">{formatCurrency(account.balance)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent transactions */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text">Recent Transactions</h2>
              <Link to="/history" className="text-sm font-medium text-cta hover:text-cta-light flex items-center gap-1 cursor-pointer">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {data.recentTransactions.length === 0 ? (
              <div className="py-8 text-center">
                <ArrowUpCircle className="mx-auto h-8 w-8 text-text-light" />
                <p className="mt-2 text-sm text-text-muted">No transactions yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.recentTransactions.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg p-2 hover:bg-surface-alt">
                    <div>
                      <p className="text-sm font-medium text-text">{t.description}</p>
                      <p className="text-xs text-text-muted">{t.category} • {t.date}</p>
                    </div>
                    <span
                      className={`text-sm font-medium ${
                        t.type === 'income' ? 'text-success' : t.type === 'expense' ? 'text-danger' : 'text-text'
                      }`}
                    >
                      {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}{formatCurrency(t.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming commitments */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text">Upcoming Commitments</h2>
              <Link to="/planned" className="text-sm font-medium text-cta hover:text-cta-light flex items-center gap-1 cursor-pointer">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {data.upcomingPlanned.length === 0 ? (
              <div className="py-8 text-center">
                <Target className="mx-auto h-8 w-8 text-text-light" />
                <p className="mt-2 text-sm text-text-muted">No upcoming commitments</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.upcomingPlanned.map((p, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg p-2 hover:bg-surface-alt">
                    <div>
                      <p className="text-sm font-medium text-text">{p.title}</p>
                      <p className="text-xs text-text-muted">{p.due_date || 'No date set'}</p>
                    </div>
                    <span className="text-sm font-medium text-danger">{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Budget vs actual */}
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold text-text">Monthly Summary</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">Income</span>
                <span className="font-medium text-success">{formatCurrency(data.totalIncome)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-alt">
                <div className="h-full bg-success" style={{ width: '100%' }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">Expenses</span>
                <span className="font-medium text-danger">{formatCurrency(data.totalExpenses)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-alt">
                <div
                  className="h-full bg-danger"
                  style={{ width: `${Math.min((data.totalExpenses / Math.max(data.totalIncome, 1)) * 100, 100)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">Remaining</span>
                <span className={`font-medium ${remaining >= 0 ? 'text-success' : 'text-danger'}`}>
                  {formatCurrency(remaining)}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-alt">
                <div
                  className={`h-full ${remaining >= 0 ? 'bg-success' : 'bg-danger'}`}
                  style={{ width: `${Math.min(Math.abs(remaining / Math.max(data.totalIncome, 1)) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
