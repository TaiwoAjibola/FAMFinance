import { buildSnapshot, type Snapshot } from './snapshot.ts'
import { callGroq, type GroqMessage } from './groq.ts'
import { authUserId, select, type DbContext } from './db.ts'

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

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthStart(date: Date, monthsBack: number): string {
  const d = new Date(date.getFullYear(), date.getMonth() - monthsBack, 1)
  return `${monthKey(d)}-01`
}

interface AccountRow { id: string; name: string; type: string; balance: number; currency: string }
interface CategoryRow { id: string; name: string; type: 'income' | 'expense' }
interface BudgetItemRow { budgeted_amount: number; spent_amount: number; custom_name: string | null; category: { name: string } | null }

/**
 * Authenticated insights endpoint. Used by the Vercel function in production and
 * the Vite dev middleware locally, so both behave the same.
 *
 * The caller's own Supabase access token is used for every query, so row-level
 * security limits the data to the caller's household. The service-role key is
 * never used or needed.
 */
export async function handleInsights(req: InsightsRequest): Promise<InsightsResponse> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'Method not allowed' } }

  const token = req.authorization?.startsWith('Bearer ') ? req.authorization.slice(7).trim() : ''
  if (!token) return { status: 401, body: { error: 'Sign in to use AI insights' } }

  const url = req.env.SUPABASE_URL
  const anonKey = req.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return { status: 500, body: { error: 'Server is missing Supabase configuration' } }
  }

  const question = typeof (req.body as { question?: unknown })?.question === 'string'
    ? (req.body as { question: string }).question.trim()
    : ''
  if (!question) return { status: 400, body: { error: 'Type a question first' } }
  if (question.length > MAX_QUESTION_LENGTH) {
    return { status: 400, body: { error: `Keep questions under ${MAX_QUESTION_LENGTH} characters` } }
  }

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
    select<AccountRow>(ctx, 'accounts', {
      select: 'id,name,type,balance,currency',
      household_id: `eq.${householdId}`,
      is_active: 'eq.true',
    }),
    select<CategoryRow>(ctx, 'categories', { select: 'id,name,type', household_id: `eq.${householdId}` }),
    select(ctx, 'transactions', {
      select: 'account_id,category_id,type,amount,date,status,parent_income_id,received_amount',
      household_id: `eq.${householdId}`,
      date: `gte.${windowStart}`,
    }),
    select<{ id: string }>(ctx, 'monthly_budgets', {
      select: 'id',
      household_id: `eq.${householdId}`,
      month: `eq.${currentMonth}`,
      limit: '1',
    }),
    select(ctx, 'debts', { select: '*', household_id: `eq.${householdId}` }),
  ])

  const debtIds = debts.map((d) => (d as { id: string }).id)
  const repayments = debtIds.length
    ? await select(ctx, 'debt_repayments', {
        select: 'debt_id,amount,status,due_date,date',
        debt_id: `in.(${debtIds.join(',')})`,
      })
    : []

  let budgetItems: { name: string; budgeted_amount: number; spent_amount: number }[] = []
  if (budgets.length > 0) {
    const items = await select<BudgetItemRow>(ctx, 'budget_items', {
      select: 'budgeted_amount,spent_amount,custom_name,category:categories(name)',
      budget_id: `eq.${budgets[0].id}`,
    })
    budgetItems = items.map((i) => ({
      name: i.category?.name ?? i.custom_name ?? 'Uncategorised',
      budgeted_amount: Number(i.budgeted_amount) || 0,
      spent_amount: Number(i.spent_amount) || 0,
    }))
  }

  const snapshot: Snapshot = buildSnapshot({
    now,
    householdCurrency: households[0]?.currency ?? 'NGN',
    accounts,
    categories,
    transactions: transactions as never[],
    budgetMonth: currentMonth,
    budgetItems,
    debts: debts as never[],
    repayments: repayments as never[],
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

  const messages: GroqMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `Question: ${question}\n\nSnapshot (JSON):\n${JSON.stringify(snapshot)}` },
  ]

  let raw: string
  try {
    raw = await callGroq(apiKey, messages, req.env.GROQ_MODEL)
  } catch (err) {
    console.error('insights: model call failed', err instanceof Error ? err.message : err)
    return { status: 502, body: { error: 'The AI service is unavailable right now. Try again shortly.' } }
  }

  let parsed: Partial<{ answer: string; facts: unknown[]; recommendations: unknown[]; insufficientData: boolean }>
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
      insufficientData: parsed.insufficientData ?? !snapshot.dataQuality.sufficient,
      snapshot,
    },
  }
}
