import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'

/**
 * Local-only statistics dashboard. Only mounted in the development build (see
 * App.tsx), and the data endpoint refuses any request that isn't from localhost.
 * Shows aggregates only.
 */

interface Stats {
  generatedAt: string
  overview: Record<string, number>
  signupsByMonth: { month: string; count: number }[]
  activityByMonth: { month: string; transactionsRecorded: number }[]
  onboarding: { pending: number; completed: number; skipped: number }
  roles: Record<string, number>
  invitations: Record<string, number>
  accounts: { byCurrency: Record<string, number>; byType: Record<string, number> }
  transactionTypes: Record<string, number>
  money: {
    allTimeByCurrency: Record<string, { income: number; expenses: number }>
    thisMonthByCurrency: Record<string, { income: number; expenses: number }>
    monthlyByCurrency: { month: string; byCurrency: Record<string, { income: number; expenses: number }> }[]
    outstandingDebtsByCurrency: Record<string, number>
  }
  householdCurrencies: Record<string, number>
  notes: string[]
}

const LABELS: Record<string, string> = {
  users: 'Users',
  newUsersLast30Days: 'New users (30 days)',
  households: 'Households',
  householdsWithoutAccounts: 'Households with no account',
  avgMembersPerHousehold: 'Avg members / household',
  activeAccounts: 'Active accounts',
  transactions: 'Transactions',
  debts: 'Debts',
  activeDebts: 'Active debts',
  debtRepayments: 'Debt repayments',
  budgetMonths: 'Budget months',
  budgetItems: 'Budget items',
  plannedExpenses: 'Planned expenses',
}

function Bars({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-text">{label}</h2>
      <div className="mt-4 flex h-40 items-end gap-2">
        {data.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-medium text-text-muted">{d.value}</span>
            <div
              className="w-full rounded-t bg-cta/70"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 4 : 0 }}
              title={`${d.label}: ${d.value}`}
            />
            <span className="text-[10px] text-text-light">{d.label.slice(2)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-card">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-text">{value}</p>
    </div>
  )
}

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-text">{title}</h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-text-muted">No data yet</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {entries.map(([k, v]) => (
            <li key={k} className="flex justify-between">
              <span className="capitalize text-text-muted">{k.replace(/_/g, ' ')}</span>
              <span className="font-medium text-text">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/stats')
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? `Request failed (${response.status})`)
      setStats(json as Stats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load statistics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const currencies = Object.keys(stats?.money.allTimeByCurrency ?? {})

  return (
    <div className="min-h-screen bg-background">
      <div className="container-app space-y-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
              <ShieldAlert className="h-6 w-6 text-warning" />
              Admin statistics
            </h1>
            <p className="text-sm text-text-muted">
              Local development only · aggregates, no individual records
              {stats && <> · generated {new Date(stats.generatedAt).toLocaleString()}</>}
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-lg bg-danger/10 p-4 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Statistics unavailable</p>
              <p className="mt-1">{error}</p>
            </div>
          </div>
        )}

        {loading && !stats && <p className="py-12 text-center text-sm text-text-muted">Loading statistics…</p>}

        {stats && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Object.entries(LABELS).map(([key, label]) => (
                <Tile
                  key={key}
                  label={label}
                  value={key === 'avgMembersPerHousehold' ? stats.overview[key].toFixed(1) : stats.overview[key] ?? 0}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Bars
                label="Sign-ups by month"
                data={stats.signupsByMonth.map((m) => ({ label: m.month, value: m.count }))}
              />
              <Bars
                label="Transactions recorded by month"
                data={stats.activityByMonth.map((m) => ({ label: m.month, value: m.transactionsRecorded }))}
              />
            </div>

            <div className="card">
              <h2 className="text-sm font-semibold text-text">Money by currency</h2>
              <p className="mb-3 text-xs text-text-muted">
                Each currency is totalled separately. Nothing is converted.
              </p>
              {currencies.length === 0 ? (
                <p className="text-xs text-text-muted">No income or expenses recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                        <th className="py-2 pr-4 font-semibold">Currency</th>
                        <th className="py-2 pr-4 text-right font-semibold">Income (all time)</th>
                        <th className="py-2 pr-4 text-right font-semibold">Expenses (all time)</th>
                        <th className="py-2 pr-4 text-right font-semibold">Income (this month)</th>
                        <th className="py-2 pr-4 text-right font-semibold">Expenses (this month)</th>
                        <th className="py-2 text-right font-semibold">Debts outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currencies.map((c) => {
                        const all = stats.money.allTimeByCurrency[c]
                        const month = stats.money.thisMonthByCurrency[c] ?? { income: 0, expenses: 0 }
                        return (
                          <tr key={c} className="border-b border-border last:border-0">
                            <td className="py-2 pr-4 font-medium">{c}</td>
                            <td className="py-2 pr-4 text-right">{formatCurrency(all.income, c)}</td>
                            <td className="py-2 pr-4 text-right">{formatCurrency(all.expenses, c)}</td>
                            <td className="py-2 pr-4 text-right">{formatCurrency(month.income, c)}</td>
                            <td className="py-2 pr-4 text-right">{formatCurrency(month.expenses, c)}</td>
                            <td className="py-2 text-right">
                              {formatCurrency(stats.money.outstandingDebtsByCurrency[c] ?? 0, c)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="card">
                <h2 className="text-sm font-semibold text-text">Onboarding</h2>
                <ul className="mt-2 space-y-1.5 text-sm">
                  <li className="flex justify-between"><span className="text-text-muted">Completed</span><span className="font-medium">{stats.onboarding.completed}</span></li>
                  <li className="flex justify-between"><span className="text-text-muted">Skipped</span><span className="font-medium">{stats.onboarding.skipped}</span></li>
                  <li className="flex justify-between"><span className="text-text-muted">Still pending</span><span className="font-medium">{stats.onboarding.pending}</span></li>
                </ul>
              </div>
              <Breakdown title="Member roles" data={stats.roles} />
              <Breakdown title="Invitations" data={stats.invitations} />
              <Breakdown title="Active accounts by currency" data={stats.accounts.byCurrency} />
              <Breakdown title="Active accounts by type" data={stats.accounts.byType} />
              <Breakdown title="Household currencies" data={stats.householdCurrencies} />
              <Breakdown title="Transactions by type" data={stats.transactionTypes} />
            </div>

            <div className="space-y-1 text-xs text-text-muted">
              {stats.notes.map((n) => (
                <p key={n}>• {n}</p>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
