import type { Transaction } from '@/types'
import type { CaptureInput } from '@/lib/expenseInbox'

export interface CsvColumnMap {
  date: string
  description: string
  amount?: string
  debit?: string
  credit?: string
}

export interface ImportedStatementRow {
  id: string
  date: string
  description: string
  amount: number
  raw: Record<string, string>
  duplicateOf?: { id: string; description: string; date: string; amount: number } | null
  duplicateReason?: string | null
  selected: boolean
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const rows: string[][] = []
  let cur = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') { cur += '"'; i += 1 }
      else if (ch === '"') inQuotes = false
      else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (ch === '\r') { /* ignore */ }
    else cur += ch
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row) }
  const clean = rows.filter((r) => r.some((c) => c.trim() !== ''))
  if (clean.length === 0) return { headers: [], rows: [] }
  const headers = clean[0].map((h, i) => h.trim() || `Column ${i + 1}`)
  const data = clean.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim() })
    return obj
  })
  return { headers, rows: data }
}

function normalizeText(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function parseAmount(raw: string): number | null {
  if (!raw) return null
  const cleaned = raw.replace(/[\s,]/g, '').replace(/[₦$£€]/g, '')
  const negative = /^\(.*\)$/.test(cleaned) || cleaned.startsWith('-')
  const num = Number(cleaned.replace(/[()\-+]/g, ''))
  if (!Number.isFinite(num)) return null
  return negative ? -Math.abs(num) : Math.abs(num)
}

function parseDate(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const a = Number(m[1]); const b = Number(m[2]); let y = Number(m[3])
    if (y < 100) y += 2000
    // Heuristic: if first > 12 treat as DD/MM/YYYY, else MM/DD/YYYY
    const day = a > 12 ? a : b
    const month = a > 12 ? b : a
    const iso = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const d = new Date(iso)
    if (!Number.isNaN(d.getTime())) return iso
  }
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return null
}

export function buildImportedRows(args: {
  rows: Record<string, string>[]
  map: CsvColumnMap
  existingTransactions: Transaction[]
  accountId: string
}): ImportedStatementRow[] {
  const { rows, map, existingTransactions, accountId } = args
  const existing = existingTransactions.filter((t) => t.account_id === accountId && t.type === 'expense')
  const result: ImportedStatementRow[] = []
  for (const raw of rows) {
    const date = parseDate(raw[map.date] ?? '')
    const description = (raw[map.description] ?? '').trim()
    let amount: number | null = null
    if (map.amount) amount = parseAmount(raw[map.amount] ?? '')
    else {
      const debit = map.debit ? parseAmount(raw[map.debit] ?? '') : null
      const credit = map.credit ? parseAmount(raw[map.credit] ?? '') : null
      if (debit && debit > 0) amount = debit
      else if (credit && credit > 0) amount = null // credits aren't expenses; skip later
      else amount = null
    }
    if (!date || !description || !amount || amount <= 0) continue

    const normDesc = normalizeText(description)
    let duplicateOf: ImportedStatementRow['duplicateOf'] = null
    let duplicateReason: string | null = null
    for (const tx of existing) {
      if (tx.amount !== Math.round(amount)) continue
      const days = Math.abs((new Date(tx.date).getTime() - new Date(date).getTime()) / 86400000)
      if (days > 3) continue
      const txNorm = normalizeText(tx.description || '')
      const similar = txNorm && normDesc && (txNorm.includes(normDesc) || normDesc.includes(txNorm) || txNorm.split(' ').some((w) => w.length > 3 && normDesc.includes(w)))
      duplicateOf = { id: tx.id, description: tx.description, date: tx.date, amount: tx.amount }
      duplicateReason = similar ? 'Same account, amount, close date, and similar description' : 'Same account, amount, and close date'
      break
    }

    result.push({
      id: crypto.randomUUID(),
      date,
      description: description.slice(0, 140),
      amount: Math.round(amount),
      raw,
      duplicateOf,
      duplicateReason,
      selected: !duplicateOf,
    })
  }
  return result
}

export function importedRowsToCaptureInputs(args: {
  rows: ImportedStatementRow[]
  householdId: string
  userId: string
  accountId: string
  currency: string
  batchId: string
}): CaptureInput[] {
  return args.rows.filter((r) => r.selected).map((r) => ({
    householdId: args.householdId,
    userId: args.userId,
    accountId: args.accountId,
    categoryId: null,
    amount: r.amount,
    currency: args.currency,
    description: r.description,
    date: r.date,
    source: 'import' as const,
    status: r.duplicateOf ? 'needs_review' as const : 'ready' as const,
    notes: r.duplicateReason ? `Possible duplicate: ${r.duplicateReason}` : null,
  }))
}
