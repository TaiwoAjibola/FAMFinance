/// <reference types="node" />

/**
 * Voice/text expense parsing endpoint — self-contained like api/insights.ts.
 *
 * Authenticates the caller via Supabase, then asks Groq to extract structured
 * expense candidates from a transcript. Results are suggestions for user review;
 * nothing is written to the database here.
 */

export interface ParseEnv {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
  GROQ_API_KEY?: string
  GROQ_MODEL?: string
}

export interface ParseRequest {
  method: string
  authorization?: string
  body: unknown
  env: ParseEnv
}

export interface ParseResponse {
  status: number
  body: Record<string, unknown>
}

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

const DEFAULT_MODEL = 'openai/gpt-oss-120b'

async function callGroq(apiKey: string, messages: { role: 'system' | 'user'; content: string }[], model?: string): Promise<string> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages,
      temperature: 0.1,
      max_completion_tokens: 2000,
      response_format: { type: 'json_object' },
    }),
  })
  if (!response.ok) throw new Error(`Groq request failed with status ${response.status}`)
  const json = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw new Error('Groq returned an empty response')
  return content
}

const SYSTEM_PROMPT = `You extract expense entries from a user's spoken or typed note.

Rules:
- Use ONLY what the user said. Never invent amounts, dates, merchants, or categories.
- Return each distinct expense as a separate candidate.
- Amounts must be numbers (no currency symbols). If currency is stated (naira/NGN, dollars/USD, pounds/GBP, euros/EUR, CAD, AUD, GHS/KES/ZAR), include it; otherwise use the provided default currency.
- If amount, description, or currency is unclear, include the candidate but add a clear note in "issues".
- categorySuggestion should be a short plain category name (e.g. Groceries, Transport, Food, Utilities) or null if unclear.
- Do not classify transfers as expenses unless the user clearly describes spending.
- Do not create income entries.

Respond with JSON exactly:
{
  "candidates": [
    {
      "description": "string",
      "amount": number|null,
      "currency": "NGN|USD|GBP|EUR|CAD|AUD|GHS|KES|ZAR"|null,
      "categorySuggestion": "string"|null,
      "date": "YYYY-MM-DD"|null,
      "issues": ["string"]
    }
  ],
  "unparsedText": "string"|null
}`

export async function handleParseExpenses(req: ParseRequest): Promise<ParseResponse> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'Method not allowed' } }

  const token = req.authorization?.startsWith('Bearer ') ? req.authorization.slice(7).trim() : ''
  if (!token) return { status: 401, body: { error: 'Sign in to use voice capture' } }

  const url = req.env.SUPABASE_URL
  const anonKey = req.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) return { status: 500, body: { error: 'Server is missing Supabase configuration' } }

  const body = (req.body as Record<string, unknown> | null) ?? {}
  const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : ''
  const defaultCurrency = typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : 'NGN'
  const defaultDate = typeof body.date === 'string' ? body.date.trim() : ''

  if (!transcript) return { status: 400, body: { error: 'Say or type what you spent first.' } }
  if (transcript.length > 1000) return { status: 400, body: { error: 'Keep the note under 1,000 characters.' } }

  try {
    const ctx: DbContext = { url, anonKey, token }
    const userId = await authUserId(ctx)
    if (!userId) return { status: 401, body: { error: 'Sign in to use voice capture' } }

    // Confirm user belongs to a household (RLS context / access check).
    const membership = await select<{ household_id: string }>(ctx, 'household_members', {
      select: 'household_id',
      user_id: `eq.${userId}`,
      limit: '1',
    })
    if (membership.length === 0) return { status: 404, body: { error: 'No household found for this account' } }

    const apiKey = req.env.GROQ_API_KEY
    if (!apiKey) {
      return { status: 503, body: { error: 'AI parsing is not configured. Add GROQ_API_KEY on the server.' } }
    }

    const userPrompt = [
      `Default currency: ${defaultCurrency}`,
      defaultDate ? `Default date: ${defaultDate}` : null,
      `Transcript: ${transcript}`,
    ].filter(Boolean).join('\n')

    const raw = await callGroq(apiKey, [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ], req.env.GROQ_MODEL)

    let parsed: { candidates?: unknown; unparsedText?: unknown }
    try { parsed = JSON.parse(raw) } catch { parsed = { candidates: [] } }

    const candidates = Array.isArray(parsed.candidates)
      ? parsed.candidates.slice(0, 20).map((c) => {
          const obj = (c ?? {}) as Record<string, unknown>
          const amount = typeof obj.amount === 'number' && Number.isFinite(obj.amount) ? obj.amount : null
          return {
            description: typeof obj.description === 'string' ? obj.description.slice(0, 140) : '',
            amount,
            currency: typeof obj.currency === 'string' ? obj.currency.toUpperCase().slice(0, 3) : null,
            categorySuggestion: typeof obj.categorySuggestion === 'string' ? obj.categorySuggestion.slice(0, 60) : null,
            date: typeof obj.date === 'string' ? obj.date.slice(0, 10) : null,
            issues: Array.isArray(obj.issues) ? obj.issues.map(String).slice(0, 5) : [],
          }
        })
      : []

    return {
      status: 200,
      body: {
        candidates,
        unparsedText: typeof parsed.unparsedText === 'string' ? parsed.unparsedText : null,
        notice: 'Review every item before saving. Suggestions may be wrong.',
      },
    }
  } catch (err) {
    console.error('parse-expenses: failure', err instanceof Error ? err.message : err)
    return { status: 500, body: { error: 'Could not parse expenses right now. Try again shortly.' } }
  }
}

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
  const result = await handleParseExpenses({
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
