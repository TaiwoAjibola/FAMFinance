import { supabase } from '@/lib/supabase'

export interface ParsedExpenseCandidate {
  description: string
  amount: number | null
  currency: string | null
  categorySuggestion: string | null
  date: string | null
  issues: string[]
}

export interface ParseExpensesResponse {
  candidates: ParsedExpenseCandidate[]
  unparsedText: string | null
  notice?: string
}

export async function parseExpenses(input: {
  transcript: string
  currency: string
  date: string
}): Promise<ParseExpensesResponse> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in to use voice capture')

  const response = await fetch('/api/parse-expenses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = (await response.json().catch(() => ({}))) as { error?: string } & Partial<ParseExpensesResponse>
  if (!response.ok) throw new Error(json.error ?? 'Could not parse expenses')
  return {
    candidates: Array.isArray(json.candidates) ? json.candidates : [],
    unparsedText: typeof json.unparsedText === 'string' ? json.unparsedText : null,
    notice: typeof json.notice === 'string' ? json.notice : undefined,
  }
}
