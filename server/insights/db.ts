/**
 * Minimal Supabase REST/auth client built on fetch.
 *
 * Deliberately not `@supabase/supabase-js`: that client opens a realtime socket
 * on construction, which needs a global WebSocket and crashes on Node < 22.
 * Every request carries the caller's own access token, so row-level security
 * scopes all reads to the caller's household.
 */
export interface DbContext {
  url: string
  anonKey: string
  token: string
}

function headers(ctx: DbContext): Record<string, string> {
  return {
    apikey: ctx.anonKey,
    Authorization: `Bearer ${ctx.token}`,
    Accept: 'application/json',
  }
}

/** Resolves the user behind the token, or null if the token is invalid. */
export async function authUserId(ctx: DbContext): Promise<string | null> {
  const response = await fetch(`${ctx.url}/auth/v1/user`, { headers: headers(ctx) })
  if (!response.ok) return null
  const user = (await response.json()) as { id?: string }
  return user.id ?? null
}

/** GET /rest/v1/{table} with PostgREST query parameters. */
export async function select<T = Record<string, unknown>>(
  ctx: DbContext,
  table: string,
  params: Record<string, string>
): Promise<T[]> {
  const query = new URLSearchParams(params).toString()
  const response = await fetch(`${ctx.url}/rest/v1/${table}?${query}`, { headers: headers(ctx) })
  if (!response.ok) throw new Error(`Query on ${table} failed with status ${response.status}`)
  return (await response.json()) as T[]
}
