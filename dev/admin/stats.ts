/**
 * Admin statistics — DEVELOPMENT ONLY.
 *
 * This file lives outside `api/` and is imported only by the Vite dev server, so
 * it is never bundled into the production build or deployed to Vercel.
 *
 * It uses the Supabase service-role key (bypasses row-level security), so it returns
 * AGGREGATES ONLY. No row-level content (descriptions, notes, emails, names,
 * per-person balances) leaves this module.
 */

export interface AdminEnv {
  SUPABASE_URL?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
}

export class AdminConfigError extends Error {}

type Row = Record<string, unknown>

async function fetchAll(env: Required<AdminEnv>, table: string, select: string): Promise<Row[]> {
  const rows: Row[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const url = `${env.SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}`
    const response = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    })
    if (!response.ok) throw new Error(`Stats query on ${table} failed with status ${response.status}`)
    const page = (await response.json()) as Row[]
    rows.push(...page)
    if (page.length < pageSize) break
  }
  return rows
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

function lastMonths(count: number, now: Date): string[] {
  return Array.from({ length: count }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - (count - 1 - i), 1)))
}

function countBy<T>(items: T[], key: (t: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const item of items) {
    const k = key(item) ?? 'unknown'
    out[k] = (out[k] ?? 0) + 1
  }
  return out
}

export async function computeAdminStats(env: AdminEnv): Promise<Record<string, unknown>> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AdminConfigError('SUPABASE_SERVICE_ROLE_KEY is not set in .env')
  }
  const e = { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY }

  const now = new Date()
  const months = lastMonths(12, now)
  const thisMonth = monthKey(now)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000)

  const [users, households, members, accounts, transactions, debts, repayments, budgets, budgetItems, planned, invitations] =
    await Promise.all([
      fetchAll(e, 'users', 'id,created_at'),
      fetchAll(e, 'households', 'id,currency,onboarding_state,created_at'),
      fetchAll(e, 'household_members', 'household_id,role,user_id'),
      fetchAll(e, 'accounts', 'id,household_id,currency,is_active,type'),
      fetchAll(e, 'transactions', 'account_id,type,amount,date,status,parent_income_id,received_amount,created_at'),
      fetchAll(e, 'debts', 'household_id,amount,amount_repaid,currency,status,created_at'),
      fetchAll(e, 'debt_repayments', 'id,status,created_at'),
      fetchAll(e, 'monthly_budgets', 'id,created_at'),
      fetchAll(e, 'budget_items', 'id'),
      fetchAll(e, 'planned_expenses', 'id,status'),
      fetchAll(e, 'invitations', 'id,status'),
    ])

  // --- Users & households ----------------------------------------------------
  const signupsByMonth: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]))
  for (const u of users) {
    const m = String(u.created_at ?? '').slice(0, 7)
    if (m in signupsByMonth) signupsByMonth[m] += 1
  }
  const newUsers30d = users.filter((u) => new Date(String(u.created_at)) >= thirtyDaysAgo).length

  const householdsWithAccounts = new Set(accounts.filter((a) => a.is_active).map((a) => String(a.household_id)))
  const householdsWithoutAccounts = households.filter((h) => !householdsWithAccounts.has(String(h.id))).length

  const membersPerHousehold = countBy(members, (m) => String(m.household_id))
  const sizes = Object.values(membersPerHousehold)
  const avgMembers = sizes.length ? Math.round((sizes.reduce((s, n) => s + n, 0) / sizes.length) * 10) / 10 : 0

  // --- Accounts ----------------------------------------------------------------
  const activeAccounts = accounts.filter((a) => a.is_active)

  // --- Transactions & money totals (per currency, never combined) -------------
  const currencyByAccount = new Map(accounts.map((a) => [String(a.id), String(a.currency)]))
  type Totals = { income: number; expenses: number }
  const allTime: Record<string, Totals> = {}
  const monthTotals: Record<string, Record<string, Totals>> = {}
  const txPerMonth: Record<string, number> = Object.fromEntries(months.map((m) => [m, 0]))

  for (const t of transactions) {
    const type = String(t.type)
    const currency = currencyByAccount.get(String(t.account_id)) ?? 'unknown'
    const amount = Number(t.amount) || 0
    const month = String(t.date ?? '').slice(0, 7)

    const createdMonth = String(t.created_at ?? '').slice(0, 7)
    if (createdMonth in txPerMonth) txPerMonth[createdMonth] += 1

    if (type !== 'income' && type !== 'expense') continue
    // Same rule as the app: expected-income placeholders are not money received.
    if (type === 'income' && ['expected', 'partially_received', 'cancelled'].includes(String(t.status ?? ''))) {
      if (!t.parent_income_id) continue
    }
    const value = type === 'income' && !t.parent_income_id && Number(t.received_amount) > 0 ? Number(t.received_amount) : amount
    const key: keyof Totals = type === 'income' ? 'income' : 'expenses'

    allTime[currency] ??= { income: 0, expenses: 0 }
    allTime[currency][key] += value

    if (month) {
      monthTotals[month] ??= {}
      monthTotals[month][currency] ??= { income: 0, expenses: 0 }
      monthTotals[month][currency][key] += value
    }
  }

  // --- Debts --------------------------------------------------------------------
  const activeDebts = debts.filter((d) => d.status === 'active')
  const outstandingByCurrency: Record<string, number> = {}
  for (const d of activeDebts) {
    const cur = String(d.currency ?? 'NGN')
    const owed = Math.max(0, (Number(d.amount) || 0) - (Number(d.amount_repaid) || 0))
    outstandingByCurrency[cur] = (outstandingByCurrency[cur] ?? 0) + owed
  }

  return {
    generatedAt: now.toISOString(),
    overview: {
      users: users.length,
      newUsersLast30Days: newUsers30d,
      households: households.length,
      householdsWithoutAccounts,
      avgMembersPerHousehold: avgMembers,
      activeAccounts: activeAccounts.length,
      transactions: transactions.length,
      debts: debts.length,
      activeDebts: activeDebts.length,
      debtRepayments: repayments.length,
      budgetMonths: budgets.length,
      budgetItems: budgetItems.length,
      plannedExpenses: planned.length,
    },
    signupsByMonth: months.map((m) => ({ month: m, count: signupsByMonth[m] ?? 0 })),
    activityByMonth: months.map((m) => ({ month: m, transactionsRecorded: txPerMonth[m] ?? 0 })),
    onboarding: {
      pending: households.filter((h) => h.onboarding_state === 'pending').length,
      completed: households.filter((h) => h.onboarding_state === 'completed').length,
      skipped: households.filter((h) => h.onboarding_state === 'skipped').length,
    },
    roles: countBy(members, (m) => String(m.role)),
    invitations: countBy(invitations, (i) => String(i.status)),
    accounts: {
      byCurrency: countBy(activeAccounts, (a) => String(a.currency)),
      byType: countBy(activeAccounts, (a) => String(a.type)),
    },
    transactionTypes: countBy(transactions, (t) => String(t.type)),
    money: {
      allTimeByCurrency: allTime,
      thisMonthByCurrency: monthTotals[thisMonth] ?? {},
      monthlyByCurrency: months.map((m) => ({ month: m, byCurrency: monthTotals[m] ?? {} })),
      outstandingDebtsByCurrency: outstandingByCurrency,
    },
    householdCurrencies: countBy(households, (h) => String(h.currency)),
    notes: [
      'Aggregates only. Individual records are never returned by this endpoint.',
      'Income excludes expected-but-not-received placeholders, matching the app.',
      'AI insight usage is not logged yet, so it is not included.',
    ],
  }
}
