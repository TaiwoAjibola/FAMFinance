/**
 * Multi-currency support.
 *
 * Scope of the first release: currencies are a *recording and display* concern
 * only. There is deliberately no automatic FX conversion — see
 * `docs`-level notes in the README. Rules enforced here and by callers:
 *
 *  1. Amounts are never silently converted between currencies.
 *  2. Balances in different currencies are never summed into one unlabelled
 *     total; callers group by currency (`groupByCurrency`).
 *  3. Cross-currency transfers are blocked until an explicit FX workflow exists
 *     (`canTransferBetween`).
 *  4. Historical amounts are untouched by display preferences.
 *
 * The list is the single source of truth and is intentionally easy to extend.
 */

export interface CurrencyInfo {
  /** ISO 4217 code — this is what is persisted, never the symbol. */
  code: string
  /** Display symbol, per the design system. */
  symbol: string
  name: string
  /** Locale used for digit grouping only. */
  locale: string
  /** NGN keeps 0 decimals to preserve how existing records were displayed. */
  decimals: number
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', locale: 'en-NG', decimals: 0 },
  { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US', decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB', decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', locale: 'en-IE', decimals: 2 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', locale: 'en-CA', decimals: 2 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU', decimals: 2 },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi', locale: 'en-GH', decimals: 2 },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', locale: 'en-KE', decimals: 2 },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', locale: 'en-ZA', decimals: 2 },
]

export const DEFAULT_CURRENCY = 'NGN'

const BY_CODE = new Map(SUPPORTED_CURRENCIES.map((c) => [c.code, c]))

export function isSupportedCurrency(code: string | null | undefined): boolean {
  return !!code && BY_CODE.has(code)
}

/**
 * Resolves a persisted code to its definition. Unknown/legacy values fall back
 * to NGN so historical records keep rendering instead of throwing.
 */
export function getCurrency(code?: string | null): CurrencyInfo {
  if (!code) return BY_CODE.get(DEFAULT_CURRENCY)!
  return BY_CODE.get(code) ?? BY_CODE.get(DEFAULT_CURRENCY)!
}

export function getCurrencySymbol(code?: string | null): string {
  return getCurrency(code).symbol
}

/**
 * Backwards-compatible currency formatter. Called with one argument it behaves
 * exactly like the original NGN-only helper, so existing records render
 * identically.
 */
export function formatCurrency(
  amount: number | null | undefined,
  currencyCode?: string | null
): string {
  const currency = getCurrency(currencyCode)
  const safe = Number.isFinite(amount as number) ? (amount as number) : 0
  const negative = safe < 0
  const digits = new Intl.NumberFormat(currency.locale, {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }).format(Math.abs(safe))
  return `${negative ? '-' : ''}${currency.symbol}${digits}`
}

/** e.g. "NGN 12,000" — useful when the symbol alone would be ambiguous. */
export function formatCurrencyWithCode(
  amount: number | null | undefined,
  currencyCode?: string | null
): string {
  const currency = getCurrency(currencyCode)
  const safe = Number.isFinite(amount as number) ? (amount as number) : 0
  const digits = new Intl.NumberFormat(currency.locale, {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  }).format(safe)
  return `${currency.code} ${digits}`
}

export interface CurrencyTotal {
  currency: string
  total: number
}

/**
 * Sums values per currency instead of collapsing them into one number.
 * Used anywhere several accounts may be combined (dashboard, accounts page).
 */
export function groupByCurrency<T>(
  items: T[],
  pick: (item: T) => { amount: number; currency?: string | null } | null | undefined
): CurrencyTotal[] {
  const totals = new Map<string, number>()
  for (const item of items) {
    const picked = pick(item)
    if (!picked) continue
    const code = isSupportedCurrency(picked.currency) ? (picked.currency as string) : DEFAULT_CURRENCY
    totals.set(code, (totals.get(code) ?? 0) + (Number(picked.amount) || 0))
  }
  return SUPPORTED_CURRENCIES.filter((c) => totals.has(c.code))
    .map((c) => ({ currency: c.code, total: totals.get(c.code) as number }))
    .filter((t) => t.total !== 0)
}

/**
 * Cross-currency transfers are not supported until an explicit exchange-rate
 * workflow exists; until then they must be blocked rather than silently
 * converted.
 */
export function canTransferBetween(fromCurrency?: string | null, toCurrency?: string | null): boolean {
  const from = getCurrency(fromCurrency).code
  const to = getCurrency(toCurrency).code
  return from === to
}

/** Options for a `<select>` of currencies. */
export function currencyOptions(): { value: string; label: string }[] {
  return SUPPORTED_CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name} (${c.symbol})` }))
}
