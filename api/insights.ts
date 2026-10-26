import { handleInsights } from '../server/insights/handler.ts'

// Vercel Node serverless function. Environment variables come from the Vercel
// project settings (GROQ_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY) and are never
// exposed to the browser bundle.
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
