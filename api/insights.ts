/// <reference types="node" />
import { addMonths, addWeeks, isValid, parseISO } from 'date-fns'

/**
 * AI Financial Insights endpoint — self-contained on purpose.
 *
 * Vercel compiles only the entry file in `api/`; sibling TypeScript modules are
 * not transpiled at runtime, so everything the endpoint needs lives in this file.
 * The Vite dev middleware imports `handleInsights` from here too, so local and
 * production behave the same.
 *
 * Data access uses the caller's own Supabase access token, so row-level security
 * limits every query to the caller's household. The service-role key is never used.
 * The Groq key is read from the server environment and never reaches the browser.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsightsEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  GROQ_API_KEY?: string
  GROQ_MODEL?: string
}

export interface InsightsRequest {
  method: string
  authorization?: string
  body: unknown
  env: InsightsEnv
}

export interface InsightsResponse {
  status: number
  body: Record<string, unknown>
}

interface AccountRow { id: string; name: string; type: string; balance: number; currency: string }
interface CategoryRow { id: string; name: string; type: 'income' | 'expense' }
interface TransactionRow {
  account_id: string
  category_id: string | null
  type: string
  amount: number
  date: string
  status: string | null
  parent_income_id: string | null
  received_amount: number | null
}
interface DebtRow {
  id: string
  lender_name: string
  amount: number
  currency: string | null
  interest_rate: number | null
  repayment_frequency: 'weekly' | 'biweekly' | 'monthly' | null
  installment_amount: number | null
  num_installments: number | null
  first_payment_date: string | null
}
interface RepaymentRow { debt_id: string; amount: number; status: string | null; due_date: string | null; date: string }

// ---------------------------------------------------------------------------
// Debt maths (mirrors src/lib/debtSchedule.ts so figures match the Debts page)
// ---------------------------------------------------------------------------

interface ScheduleRow { number: number; dueDate: string; amount: number; principal: number; interest: number }

const MAX_INSTALLMENTS = 600

function periodsPerYear(frequency: 'weekly' | 'biweekly' | 'monthly'): number {
  return frequency === 'weekly' ? 52 : frequency === 'biweekly' ? 26 : 12
}

function stepDate(iso: string, frequency: 'weekly' | 'biweekly' | 'monthly', steps: number): string {
  const base = parseISO(iso)
  if (!isValid(base)) return iso
  const stepped = frequency === 'monthly'
    ? addMonths(base, steps)
    : addWeeks(base, frequency === 'biweekly' ? steps * 2 : steps)
  return stepped.toISOString().split('T')[0]
}

function generateSchedule(input: {
  principal: number
  interestRatePct: number | null
  frequency: 'weekly' | 'biweekly' | 'monthly'
  installmentAmount: number | null
  numInstallments: number | null
  firstPaymentDate: string
}): ScheduleRow[] {
  const { principal, interestRatePct, frequency, installmentAmount, numInstallments, firstPaymentDate } = input
  if (!Number.isFinite(principal) || principal <= 0) return []

  const ratePerPeriod = interestRatePct && interestRatePct > 0 ? interestRatePct / 100 / periodsPerYear(frequency) : 0
  const rows: ScheduleRow[] = []
  let outstanding = Math.round(principal)

  if (installmentAmount && installmentAmount > 0) {
    const planned = Math.round(installmentAmount)
    while (outstanding > 0 && rows.length < MAX_INSTALLMENTS) {
      const interest = Math.round(outstanding * ratePerPeriod)
      const payment = Math.min(planned, outstanding + interest)
      const principalPart = Math.max(0, Math.min(payment - interest, outstanding))
      rows.push({ number: rows.length + 1, dueDate: stepDate(firstPaymentDate, frequency, rows.length), amount: payment, principal: principalPart, interest })
      outstanding -= principalPart
      if (payment <= 0) break
    }
    return rows
  }

  const count = numInstallments && numInstallments > 0 ? Math.min(Math.round(numInstallments), MAX_INSTALLMENTS) : 1

  if (ratePerPeriod === 0) {
    const base = Math.floor(outstanding / count)
    let remainder = outstanding - base * count
    for (let i = 0; i < count; i += 1) {
      const extra = remainder > 0 ? 1 : 0
      remainder -= extra
      const amount = base + extra
      rows.push({ number: i + 1, dueDate: stepDate(firstPaymentDate, frequency, i), amount, principal: amount, interest: 0 })
    }
    return rows
  }

  let remainingPeriods = count
  let index = 0
  while (outstanding > 0 && rows.length < MAX_INSTALLMENTS) {
    const interest = Math.round(outstanding * ratePerPeriod)
    const payment = Math.ceil((outstanding + interest) / remainingPeriods)
    const principalPart = Math.max(0, Math.min(payment - interest, outstanding))
    rows.push({ number: index + 1, dueDate: stepDate(firstPaymentDate, frequency, index), amount: payment, principal: principalPart, interest })
    outstanding -= principalPart
    remainingPeriods = Math.max(1, remainingPeriods - 1)
    index += 1
    if (payment <= 0) break
  }
  return rows
}

function payoffTotal(debt: DebtRow): number {
  if (!debt.interest_rate || debt.interest_rate <= 0) return debt.amount
  if (!debt.repayment_frequency || !debt.first_payment_date) return debt.amount
  const schedule = generateSchedule({
    principal: debt.amount,
    interestRatePct: debt.interest_rate,
    frequency: debt.repayment_frequency,
    installmentAmount: debt.installment_amount,
    numInstallments: debt.num_installments,
    firstPaymentDate: debt.first_payment_date,
  })
  return schedule.length === 0 ? debt.amount : schedule.reduce((sum, i) => sum + i.amount, 0)
}

// ---------------------------------------------------------------------------
// Snapshot: the ONLY data sent to the model. Totals, category names, balances.
// Raw descriptions, notes, emails and account numbers are excluded.
// ---------------------------------------------------------------------------

interface MonthTotals { income: number; expenses: number; net: number }

export interface Snapshot {
  generatedAt: string
  currentMonth: string
  previousMonth: string
  householdCurrency: string
  byCurrency: {
    currency: string
    currentMonth: MonthTotals
    previousMonth: MonthTotals
    topExpenseCategories: { name: string; amount: number; shareOfExpenses: number }[]
    recurringExpenseCategories: string[]
    accounts: { name: string; type: string; balance: number }[]
    totalCashAvailable: number
  }[]
  budget: {
    month: string
    totalBudgeted: number
    totalSpent: number
    items: { name: string; budgeted: number; spent: number; remaining: number; percentUsed: number; status: 'over' | 'near' | 'ok' }[]
  }
  debts: {
    name: string
    currency: string
    original: number
    payoff: number
    repaid: number
    outstanding: number
    percentRepaid: number
    settled: boolean
    nextInstallment: { amount: number; dueDate: string } | null
  }[]
  dataQuality: { transactionsInWindow: number; monthsWithActivity: number; sufficient: boolean }
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + delta, 1))
}

function monthStart(date: Date, monthsBack: number): string {
  return `${monthKey(new Date(date.getFullYear(), date.getMonth() - monthsBack, 1))}-01`
}

const round = (n: number) => Math.round(n)

function buildSnapshot(input: {
  now: Date
  householdCurrency: string
  accounts: AccountRow[]
  categories: CategoryRow[]
  transactions: TransactionRow[]
  budgetMonth: string
  budgetItems: { name: string; budgeted_amount: number; spent_amount: number }[]
  debts: DebtRow[]
  repayments: RepaymentRow[]
}): Snapshot {
  const currentMonth = monthKey(input.now)
  const previousMonth = shiftMonth(currentMonth, -1)
  const windowMonths = Array.from({ length: 6 }, (_, i) => shiftMonth(currentMonth, -i))

  const currencyByAccount = new Map(input.accounts.map((a) => [a.id, a.currency || input.householdCurrency]))
  const categoryById = new Map(input.categories.map((c) => [c.id, c]))

  // Mirrors the dashboard: expected income placeholders and cancelled rows are not money received.
  const countedTx = input.transactions.filter((t) => {
    if (t.type === 'transfer') return false
    if (t.type === 'income' && ['expected', 'partially_received', 'cancelled'].includes(t.status ?? '')) {
      return !!t.parent_income_id
    }
    return true
  })

  type Bucket = {
    months: Record<string, MonthTotals>
    expenseByCategory: Record<string, Record<string, number>>
    currentExpenseByCategory: Map<string, number>
  }
  const buckets = new Map<string, Bucket>()
  const ensure = (currency: string): Bucket => {
    if (!buckets.has(currency)) buckets.set(currency, { months: {}, expenseByCategory: {}, currentExpenseByCategory: new Map() })
    return buckets.get(currency)!
  }

  for (const t of countedTx) {
    const currency = currencyByAccount.get(t.account_id) ?? input.householdCurrency
    const bucket = ensure(currency)
    const month = t.date.slice(0, 7)
    const isIncome = t.type === 'income'
    const isExpense = t.type === 'expense'
    if (!isIncome && !isExpense) continue

    // Expected parent with partial receipts: count only what has actually arrived.
    const amount = isIncome && !t.parent_income_id && (t.received_amount ?? 0) > 0 ? (t.received_amount ?? 0) : t.amount

    if (!bucket.months[month]) bucket.months[month] = { income: 0, expenses: 0, net: 0 }
    const m = bucket.months[month]
    if (isIncome) m.income += amount
    else m.expenses += amount
    m.net = m.income - m.expenses

    if (isExpense && windowMonths.includes(month)) {
      const name = categoryById.get(t.category_id ?? '')?.name ?? 'Uncategorised'
      bucket.expenseByCategory[name] ??= {}
      bucket.expenseByCategory[name][month] = (bucket.expenseByCategory[name][month] ?? 0) + amount
      if (month === currentMonth) bucket.currentExpenseByCategory.set(name, (bucket.currentExpenseByCategory.get(name) ?? 0) + amount)
    }
  }

  const byCurrency = [...buckets.entries()].map(([currency, bucket]) => {
    const current = bucket.months[currentMonth] ?? { income: 0, expenses: 0, net: 0 }
    const previous = bucket.months[previousMonth] ?? { income: 0, expenses: 0, net: 0 }
    const totalCurrentExpenses = [...bucket.currentExpenseByCategory.values()].reduce((s, v) => s + v, 0)
    const accounts = input.accounts
      .filter((a) => (a.currency || input.householdCurrency) === currency)
      .map((a) => ({ name: a.name, type: a.type, balance: round(a.balance) }))

    return {
      currency,
      currentMonth: { income: round(current.income), expenses: round(current.expenses), net: round(current.net) },
      previousMonth: { income: round(previous.income), expenses: round(previous.expenses), net: round(previous.net) },
      topExpenseCategories: [...bucket.currentExpenseByCategory.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, amount]) => ({
          name,
          amount: round(amount),
          shareOfExpenses: totalCurrentExpenses > 0 ? Math.round((amount / totalCurrentExpenses) * 100) : 0,
        })),
      recurringExpenseCategories: Object.entries(bucket.expenseByCategory)
        .filter(([, months]) => Object.keys(months).length >= 3)
        .map(([name]) => name),
      accounts,
      totalCashAvailable: round(accounts.reduce((s, a) => s + a.balance, 0)),
    }
  })

  const budgetItems = input.budgetItems.map((item) => {
    const percentUsed = item.budgeted_amount > 0 ? Math.round((item.spent_amount / item.budgeted_amount) * 100) : 0
    return {
      name: item.name,
      budgeted: round(item.budgeted_amount),
      spent: round(item.spent_amount),
      remaining: round(item.budgeted_amount - item.spent_amount),
      percentUsed,
      status: (percentUsed >= 100 ? 'over' : percentUsed >= 80 ? 'near' : 'ok') as 'over' | 'near' | 'ok',
    }
  })

  const debts = input.debts.map((debt) => {
    const repaid = input.repayments
      .filter((r) => r.debt_id === debt.id && (r.status ?? 'paid') === 'paid')
      .reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const payoff = payoffTotal(debt)
    const outstanding = Math.max(0, payoff - repaid)
    const next = input.repayments
      .filter((r) => r.debt_id === debt.id && r.status === 'pending' && !!r.due_date)
      .sort((a, b) => ((a.due_date ?? '') < (b.due_date ?? '') ? -1 : 1))[0]
    return {
      name: debt.lender_name,
      currency: debt.currency || input.householdCurrency,
      original: round(debt.amount),
      payoff: round(payoff),
      repaid: round(repaid),
      outstanding: round(outstanding),
      percentRepaid: payoff > 0 ? Math.min(100, Math.round((repaid / payoff) * 100)) : 0,
      settled: outstanding <= 0,
      nextInstallment: next ? { amount: round(Number(next.amount) || 0), dueDate: next.due_date as string } : null,
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
    dataQuality: { transactionsInWindow, monthsWithActivity, sufficient: transactionsInWindow >= 5 && monthsWithActivity >= 2 },
  }
}

// ---------------------------------------------------------------------------
// Supabase REST (fetch-based). supabase-js is avoided: it opens a realtime
// socket on construction, which fails on runtimes without WebSocket.
// ---------------------------------------------------------------------------

interface DbContext { url: string; anonKey: string; token: string }

function dbHeaders(ctx: DbContext): Record<string, string> {
  return { apikey: ctx.anonKey, Authorization: `Bearer ${ctx.token}`, Accept: 'application/json' }
}

async function authUserId(ctx: DbContext): Promise<string | null> {
  const response = await fetch(`${ctx.url}/auth/v1/user`, { headers: dbHeaders(ctx) })
  if (!response.ok) return null
  const user = (await response.json()) as { id?: string }
  return user.id ?? null
}

async function select<T = Record<string, unknown>>(ctx: DbContext, table: string, params: Record<string, string>): Promise<T[]> {
  const query = new URLSearchParams(params).toString()
  const response = await fetch(`${ctx.url}/rest/v1/${table}?${query}`, { headers: dbHeaders(ctx) })
  if (!response.ok) throw new Error(`Query on ${table} failed with status ${response.status}`)
  return (await response.json()) as T[]
}

// ---------------------------------------------------------------------------
// Model call
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = 'openai/gpt-oss-120b'

async function callGroq(apiKey: string, messages: { role: 'system' | 'user'; content: string }[], model?: string): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages,
      temperature: 0.2,
      max_completion_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
  })
  // Never echo the upstream body: it can contain request details.
  if (!response.ok) throw new Error(`Groq request failed with status ${response.status}`)
  const json = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('Groq returned an empty response')
  return content
}

const SYSTEM_PROMPT = `You are FamFinance's financial analyst for one household.

Rules:
- Use ONLY the figures in the JSON snapshot. Never invent transactions, balances, income, debts or history.
- Amounts in different currencies must never be added together. Report each currency separately.
- If the snapshot's dataQuality.sufficient is false, say the data is too limited for a reliable answer.
- Keep facts and recommendations separate. Facts restate snapshot numbers. Recommendations are suggestions, not guarantees.
- You are not a licensed financial, tax or legal adviser. Do not present advice as certain outcomes.
- Be plain and specific. Quote the month or date range each figure refers to.

Respond with a JSON object with exactly these keys:
{
  "answer": "short plain-language answer to the question",
  "facts": ["statements taken directly from the snapshot, each with its figure and period"],
  "recommendations": ["practical suggestions based on the snapshot, or empty"],
  "insufficientData": true or false
}`

const MAX_QUESTION_LENGTH = 500

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

export async function handleInsights(req: InsightsRequest): Promise<InsightsResponse> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'Method not allowed' } }

  const token = req.authorization?.startsWith('Bearer ') ? req.authorization.slice(7).trim() : ''
  if (!token) return { status: 401, body: { error: 'Sign in to use AI insights' } }

  const url = req.env.SUPABASE_URL
  const anonKey = req.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) return { status: 500, body: { error: 'Server is missing Supabase configuration' } }

  const rawQuestion = (req.body as { question?: unknown } | null)?.question
  const question = typeof rawQuestion === 'string' ? rawQuestion.trim() : ''
  if (!question) return { status: 400, body: { error: 'Type a question first' } }
  if (question.length > MAX_QUESTION_LENGTH) {
    return { status: 400, body: { error: `Keep questions under ${MAX_QUESTION_LENGTH} characters` } }
  }

  try {
    const ctx: DbContext = { url, anonKey, token }

    const userId = await authUserId(ctx)
    if (!userId) return { status: 401, body: { error: 'Sign in to use AI insights' } }

    const membership = await select<{ household_id: string }>(ctx, 'household_members', {
      select: 'household_id',
      user_id: `eq.${userId}`,
      order: 'joined_at.desc',
      limit: '1',
    })
    if (membership.length === 0) return { status: 404, body: { error: 'No household found for this account' } }
    const householdId = membership[0].household_id

    const now = new Date()
    const currentMonth = monthKey(now)
    const windowStart = monthStart(now, 5)

    const [households, accounts, categories, transactions, budgets, debts] = await Promise.all([
      select<{ currency: string }>(ctx, 'households', { select: 'currency', id: `eq.${householdId}` }),
      select<AccountRow>(ctx, 'accounts', { select: 'id,name,type,balance,currency', household_id: `eq.${householdId}`, is_active: 'eq.true' }),
      select<CategoryRow>(ctx, 'categories', { select: 'id,name,type', household_id: `eq.${householdId}` }),
      select<TransactionRow>(ctx, 'transactions', {
        select: 'account_id,category_id,type,amount,date,status,parent_income_id,received_amount',
        household_id: `eq.${householdId}`,
        date: `gte.${windowStart}`,
      }),
      select<{ id: string }>(ctx, 'monthly_budgets', { select: 'id', household_id: `eq.${householdId}`, month: `eq.${currentMonth}`, limit: '1' }),
      select<DebtRow>(ctx, 'debts', { select: '*', household_id: `eq.${householdId}` }),
    ])

    const repayments = debts.length
      ? await select<RepaymentRow>(ctx, 'debt_repayments', {
          select: 'debt_id,amount,status,due_date,date',
          debt_id: `in.(${debts.map((d) => d.id).join(',')})`,
        })
      : []

    let budgetItems: { name: string; budgeted_amount: number; spent_amount: number }[] = []
    if (budgets.length > 0) {
      const items = await select<{ budgeted_amount: number; spent_amount: number; custom_name: string | null; category: { name: string } | null }>(
        ctx,
        'budget_items',
        { select: 'budgeted_amount,spent_amount,custom_name,category:categories(name)', budget_id: `eq.${budgets[0].id}` }
      )
      budgetItems = items.map((i) => ({
        name: i.category?.name ?? i.custom_name ?? 'Uncategorised',
        budgeted_amount: Number(i.budgeted_amount) || 0,
        spent_amount: Number(i.spent_amount) || 0,
      }))
    }

    const snapshot = buildSnapshot({
      now,
      householdCurrency: households[0]?.currency ?? 'NGN',
      accounts,
      categories,
      transactions,
      budgetMonth: currentMonth,
      budgetItems,
      debts,
      repayments,
    })

    const apiKey = req.env.GROQ_API_KEY
    if (!apiKey) {
      return {
        status: 200,
        body: {
          aiEnabled: false,
          answer: null,
          facts: [],
          recommendations: [],
          insufficientData: !snapshot.dataQuality.sufficient,
          snapshot,
          notice: 'AI narration is not configured. Figures are shown without an AI summary.',
        },
      }
    }

    let raw: string
    try {
      raw = await callGroq(
        apiKey,
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Question: ${question}\n\nSnapshot (JSON):\n${JSON.stringify(snapshot)}` },
        ],
        req.env.GROQ_MODEL
      )
    } catch (err) {
      console.error('insights: model call failed', err instanceof Error ? err.message : err)
      return { status: 502, body: { error: 'The AI service is unavailable right now. Try again shortly.' } }
    }

    let parsed: { answer?: unknown; facts?: unknown; recommendations?: unknown; insufficientData?: unknown }
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = { answer: raw }
    }

    return {
      status: 200,
      body: {
        aiEnabled: true,
        answer: typeof parsed.answer === 'string' ? parsed.answer : null,
        facts: Array.isArray(parsed.facts) ? parsed.facts.map(String) : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : [],
        insufficientData: typeof parsed.insufficientData === 'boolean' ? parsed.insufficientData : !snapshot.dataQuality.sufficient,
        snapshot,
      },
    }
  } catch (err) {
    // Any unexpected failure becomes a readable JSON error instead of a crash page.
    console.error('insights: unexpected failure', err instanceof Error ? err.message : err)
    return { status: 500, body: { error: 'Insights could not be generated. Try again shortly.' } }
  }
}

// ---------------------------------------------------------------------------
// Vercel entry point
// ---------------------------------------------------------------------------

interface VercelRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

interface VercelResponse {
  status(code: number): VercelResponse
  json(body: unknown): void
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authorization = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
  const result = await handleInsights({
    method: req.method ?? 'GET',
    authorization,
    body: req.body,
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      GROQ_MODEL: process.env.GROQ_MODEL,
    },
  })
  res.status(result.status).json(result.body)
}
