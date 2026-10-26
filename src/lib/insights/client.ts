import { supabase } from '@/lib/supabase'

/** Shape returned by the server. Mirrors `Snapshot` in server/insights/snapshot.ts. */
export interface InsightsSnapshot {
  generatedAt: string
  currentMonth: string
  previousMonth: string
  householdCurrency: string
  byCurrency: {
    currency: string
    currentMonth: { income: number; expenses: number; net: number }
    previousMonth: { income: number; expenses: number; net: number }
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
    repaid: number
    outstanding: number
    percentRepaid: number
    settled: boolean
    nextInstallment: { amount: number; dueDate: string } | null
  }[]
  dataQuality: { transactionsInWindow: number; monthsWithActivity: number; sufficient: boolean }
}

export interface InsightsResponse {
  aiEnabled: boolean
  answer: string | null
  facts: string[]
  recommendations: string[]
  insufficientData: boolean
  snapshot: InsightsSnapshot
  notice?: string
}

export class InsightsError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * Sends a question to the server-side insights endpoint. The browser only ever
 * sends the user's own Supabase session token; the Groq key stays on the server.
 */
export async function askInsights(question: string): Promise<InsightsResponse> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new InsightsError('Sign in to use AI insights', 401)

  const response = await fetch('/api/insights', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question }),
  })

  const json = (await response.json().catch(() => ({}))) as { error?: string } & Partial<InsightsResponse>
  if (!response.ok) {
    throw new InsightsError(json.error ?? 'Something went wrong. Try again.', response.status)
  }
  return json as InsightsResponse
}
