import { summariseDebt } from '../../src/lib/debtSchedule.ts'
import type { Debt, DebtRepayment } from '../../src/types/index.ts'

/**
 * Builds the aggregated financial snapshot that is the ONLY data sent to the
 * model. Raw descriptions, notes, emails and account numbers are deliberately
 * excluded: the model gets totals, category names and balances.
 *
 * Pure function — no I/O — so the same figures can be unit tested.
 */

export interface SnapshotAccount {
  id: string
  name: string
  type: string
  balance: number
  currency: string
}

export interface SnapshotCategory {
  id: string
  name: string
  type: 'income' | 'expense'
}

export interface SnapshotTransaction {
  account_id: string
  category_id: string | null
  type: string
  amount: number
  date: string
  status: string | null
  parent_income_id: string | null
  received_amount: number | null
}

export interface SnapshotBudgetItem {
  name: string
  budgeted_amount: number
  spent_amount: number
}

export interface SnapshotInput {
  now: Date
  householdCurrency: string
  accounts: SnapshotAccount[]
  categories: SnapshotCategory[]
  /** Transactions covering at least the last six months. */
  transactions: SnapshotTransaction[]
  budgetMonth: string
  budgetItems: SnapshotBudgetItem[]
  debts: Debt[]
  repayments: Pick<DebtRepayment, 'debt_id' | 'amount' | 'status' | 'due_date' | 'date'>[]
}

export interface MonthTotals {
  income: number
  expenses: number
  net: number
}

export interface CurrencySnapshot {
  currency: string
  currentMonth: MonthTotals
  previousMonth: MonthTotals
  topExpenseCategories: { name: string; amount: number; shareOfExpenses: number }[]
  /** Expense categories that show up in at least 3 of the last 6 months. */
  recurringExpenseCategories: string[]
  accounts: { name: string; type: string; balance: number }[]
  totalCashAvailable: number
}

export interface Snapshot {
  generatedAt: string
  currentMonth: string
  previousMonth: string
  householdCurrency: string
  byCurrency: CurrencySnapshot[]
  budget: {
    month: string
    totalBudgeted: number
    totalSpent: number
    items: {
      name: string
      budgeted: number
      spent: number
      remaining: number
      percentUsed: number
      status: 'over' | 'near' | 'ok'
    }[]
  }
  debts: {
    name: string
    currency: string
    original: number
    repaid: number
    outstanding: number
    percentRepaid: number
    settled: boolean
    nextInstallment: { amount: number; dueDate: string } | null
  }[]
  dataQuality: {
    transactionsInWindow: number
    monthsWithActivity: number
    sufficient: boolean
  }
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return monthKey(d)
}

const round = (n: number) => Math.round(n)

export function buildSnapshot(input: SnapshotInput): Snapshot {
  const currentMonth = monthKey(input.now)
  const previousMonth = shiftMonth(currentMonth, -1)
  const windowMonths = Array.from({ length: 6 }, (_, i) => shiftMonth(currentMonth, -i))

  const currencyByAccount = new Map(input.accounts.map((a) => [a.id, a.currency || input.householdCurrency]))
  const categoryById = new Map(input.categories.map((c) => [c.id, c]))

  // Mirror the dashboard's rules: expected/partially-received income placeholders
  // and cancelled rows are not money that has arrived.
  const countedTx = input.transactions.filter((t) => {
    if (t.type === 'transfer') return false
    if (t.type === 'income' && ['expected', 'partially_received', 'cancelled'].includes(t.status ?? '')) {
      // Receipts (child rows) are real money; expected parents are not.
      return !!t.parent_income_id
    }
    return true
  })

  const byCurrencyMap = new Map<string, {
    months: Record<string, MonthTotals>
    expenseByCategory: Record<string, Record<string, number>>
    currentExpenseByCategory: Map<string, number>
  }>()

  const ensure = (currency: string) => {
    if (!byCurrencyMap.has(currency)) {
      byCurrencyMap.set(currency, {
        months: {},
        expenseByCategory: {},
        currentExpenseByCategory: new Map(),
      })
    }
    return byCurrencyMap.get(currency)!
  }

  for (const t of countedTx) {
    const currency = currencyByAccount.get(t.account_id) ?? input.householdCurrency
    const bucket = ensure(currency)
    const month = t.date.slice(0, 7)
    const isIncome = t.type === 'income'
    const isExpense = t.type === 'expense'
    if (!isIncome && !isExpense) continue

    // Expected parent with partial receipts: count the received part only.
    const amount = isIncome && !t.parent_income_id && (t.received_amount ?? 0) > 0
      ? t.received_amount ?? 0
      : t.amount

    if (!bucket.months[month]) bucket.months[month] = { income: 0, expenses: 0, net: 0 }
    const m = bucket.months[month]
    if (isIncome) m.income += amount
    else m.expenses += amount
    m.net = m.income - m.expenses

    if (isExpense && windowMonths.includes(month)) {
      const name = categoryById.get(t.category_id ?? '')?.name ?? 'Uncategorised'
      bucket.expenseByCategory[name] ??= {}
      bucket.expenseByCategory[name][month] = (bucket.expenseByCategory[name][month] ?? 0) + amount
      if (month === currentMonth) {
        bucket.currentExpenseByCategory.set(name, (bucket.currentExpenseByCategory.get(name) ?? 0) + amount)
      }
    }
  }

  const byCurrency: CurrencySnapshot[] = [...byCurrencyMap.entries()].map(([currency, bucket]) => {
    const current = bucket.months[currentMonth] ?? { income: 0, expenses: 0, net: 0 }
    const previous = bucket.months[previousMonth] ?? { income: 0, expenses: 0, net: 0 }
    const totalCurrentExpenses = [...bucket.currentExpenseByCategory.values()].reduce((s, v) => s + v, 0)

    const topExpenseCategories = [...bucket.currentExpenseByCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({
        name,
        amount: round(amount),
        shareOfExpenses: totalCurrentExpenses > 0 ? Math.round((amount / totalCurrentExpenses) * 100) : 0,
      }))

    const recurringExpenseCategories = Object.entries(bucket.expenseByCategory)
      .filter(([, months]) => Object.keys(months).length >= 3)
      .map(([name]) => name)

    const accounts = input.accounts
      .filter((a) => (a.currency || input.householdCurrency) === currency)
      .map((a) => ({ name: a.name, type: a.type, balance: round(a.balance) }))

    return {
      currency,
      currentMonth: { income: round(current.income), expenses: round(current.expenses), net: round(current.net) },
      previousMonth: { income: round(previous.income), expenses: round(previous.expenses), net: round(previous.net) },
      topExpenseCategories,
      recurringExpenseCategories,
      accounts,
      totalCashAvailable: round(accounts.reduce((s, a) => s + a.balance, 0)),
    }
  })

  const budgetItems = input.budgetItems.map((item) => {
    const remaining = item.budgeted_amount - item.spent_amount
    const percentUsed = item.budgeted_amount > 0 ? Math.round((item.spent_amount / item.budgeted_amount) * 100) : 0
    const status: 'over' | 'near' | 'ok' = percentUsed >= 100 ? 'over' : percentUsed >= 80 ? 'near' : 'ok'
    return {
      name: item.name,
      budgeted: round(item.budgeted_amount),
      spent: round(item.spent_amount),
      remaining: round(remaining),
      percentUsed,
      status,
    }
  })

  const debts = input.debts.map((debt) => {
    const repayments = input.repayments.filter((r) => r.debt_id === debt.id)
    const summary = summariseDebt(debt, repayments as DebtRepayment[])
    return {
      name: debt.lender_name,
      currency: debt.currency || input.householdCurrency,
      original: round(summary.original),
      repaid: round(summary.repaid),
      outstanding: round(summary.outstanding),
      percentRepaid: Math.round(summary.percentRepaid),
      settled: summary.settled,
      nextInstallment: summary.nextInstallment
        ? { amount: round(summary.nextInstallment.amount), dueDate: summary.nextInstallment.dueDate }
        : null,
    }
  })

  const monthsWithActivity = new Set(countedTx.map((t) => t.date.slice(0, 7))).size
  const transactionsInWindow = countedTx.length

  return {
    generatedAt: input.now.toISOString(),
    currentMonth,
    previousMonth,
    householdCurrency: input.householdCurrency,
    byCurrency,
    budget: {
      month: input.budgetMonth,
      totalBudgeted: round(budgetItems.reduce((s, i) => s + i.budgeted, 0)),
      totalSpent: round(budgetItems.reduce((s, i) => s + i.spent, 0)),
      items: budgetItems,
    },
    debts,
    dataQuality: {
      transactionsInWindow,
      monthsWithActivity,
      sufficient: transactionsInWindow >= 5 && monthsWithActivity >= 2,
    },
  }
}
