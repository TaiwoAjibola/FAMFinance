import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useFinanceActions } from '@/contexts/FinanceActionsContext'
import { formatCurrency, getCurrentMonth } from '@/lib/utils'
import { DEFAULT_CURRENCY, getCurrency, groupByCurrency } from '@/lib/currency'
import { suggestCategory } from '@/lib/categories'
import {
  listExpenseCaptures,
  createExpenseCaptures,
  updateExpenseCapture,
  dismissExpenseCapture,
  commitExpenseCapture,
  type ExpenseCapture,
} from '@/lib/expenseInbox'
import { parseExpenses } from '@/lib/parseExpensesClient'
import { parseCsv, buildImportedRows, type ImportedStatementRow, type CsvColumnMap } from '@/lib/statementImport'
import { RecurringExpensesCard } from '@/components/expenses/RecurringExpensesCard'
import { Layout } from '@/components/layout/Layout'
import { Table, Th, Td, TableLoading, TableEmpty } from '@/components/Table'
import { Modal } from '@/components/ui/Modal'
import { CategoryPicker } from '@/components/ui/CategoryPicker'
import {
  ArrowUpCircle,
  Plus,
  Trash2,
  ListPlus,
  Receipt,
  ArrowRight,
  CalendarDays,
  Inbox,
  CheckCircle2,
  XCircle,
  Pencil,
  Mic,
  MicOff,
  Wand2,
  Upload,
  FileSpreadsheet,
} from 'lucide-react'
import type { Account, Category, Transaction } from '@/types'

interface CaptureRow {
  id: string
  description: string
  amount: string
  category_id: string
  account_id: string
  date: string
}

function newRow(defaults: { account_id: string; date: string }): CaptureRow {
  return {
    id: crypto.randomUUID(),
    description: '',
    amount: '',
    category_id: '',
    account_id: defaults.account_id,
    date: defaults.date,
  }
}

export function ExpensesPage() {
  const { user } = useAuth()
  const { household } = useHousehold()
  const { version, notifyDataChanged, openTransaction } = useFinanceActions()

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [captures, setCaptures] = useState<ExpenseCapture[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const [showCapture, setShowCapture] = useState(false)
  const [captureRows, setCaptureRows] = useState<CaptureRow[]>([])
  const [commonDate, setCommonDate] = useState(new Date().toISOString().split('T')[0])
  const [commonAccountId, setCommonAccountId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<ExpenseCapture>>({})
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [inboxError, setInboxError] = useState<string | null>(null)
  const [inboxUnavailable, setInboxUnavailable] = useState<string | null>(null)
  const [selectedInboxIds, setSelectedInboxIds] = useState<Set<string>>(new Set())

  const [showVoice, setShowVoice] = useState(false)
  const [voiceText, setVoiceText] = useState('')
  const [voiceDate, setVoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [voiceAccountId, setVoiceAccountId] = useState('')
  const [voiceListening, setVoiceListening] = useState(false)
  const [voiceParsing, setVoiceParsing] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [voiceCandidates, setVoiceCandidates] = useState<CaptureRow[]>([])

  const [showImport, setShowImport] = useState(false)
  const [importAccountId, setImportAccountId] = useState('')
  const [importHeaders, setImportHeaders] = useState<string[]>([])
  const [importRawRows, setImportRawRows] = useState<Record<string, string>[]>([])
  const [importMap, setImportMap] = useState<CsvColumnMap>({ date: '', description: '', amount: '' })
  const [importRows, setImportRows] = useState<ImportedStatementRow[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)

  const currentMonth = getCurrentMonth()

  useEffect(() => {
    if (!household) return
    void fetchData()
  }, [household, version])

  const fetchData = async () => {
    if (!household) return
    setLoading(true)
    const [txRes, accountRes, catRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('household_id', household.id)
        .eq('type', 'expense')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('accounts').select('*').eq('household_id', household.id).eq('is_active', true).order('name'),
      supabase.from('categories').select('*').eq('household_id', household.id).eq('type', 'expense').order('sort_order'),
    ])
    setTransactions((txRes.data || []) as Transaction[])
    setAccounts((accountRes.data || []) as Account[])
    setCategories((catRes.data || []) as Category[])

    try {
      const cap = await listExpenseCaptures(household.id)
      setCaptures(cap)
      setInboxUnavailable(null)
    } catch (e) {
      setCaptures([])
      const msg = e instanceof Error ? e.message : String(e)
      setInboxUnavailable(
        msg.toLowerCase().includes('expense_captures') || msg.toLowerCase().includes('relation')
          ? 'Expense inbox is unavailable until migration 013_expense_inbox.sql is applied in Supabase.'
          : `Could not load expense inbox: ${msg}`
      )
    }
    setLoading(false)
  }

  const expenseCategories = useMemo(() => categories.filter((c) => c.type === 'expense'), [categories])
  const currencyByAccount = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.currency || DEFAULT_CURRENCY])),
    [accounts]
  )

  const thisMonth = transactions.filter((t) => t.date.startsWith(currentMonth))
  const monthTotals = useMemo(
    () =>
      groupByCurrency(thisMonth, (t) => ({
        amount: t.amount,
        currency: currencyByAccount.get(t.account_id) || DEFAULT_CURRENCY,
      })),
    [thisMonth, currencyByAccount]
  )

  const pendingCaptures = captures.filter((c) => c.status === 'needs_review' || c.status === 'ready')

  const openCapture = (mode: 'now' | 'daily' = 'now') => {
    const today = new Date().toISOString().split('T')[0]
    const defaultAccount = commonAccountId || accounts[0]?.id || ''
    setCommonDate(today)
    setCommonAccountId(defaultAccount)
    if (mode === 'daily') {
      const templates = ['Transport', 'Food', 'Groceries', 'Miscellaneous']
      setCaptureRows(
        templates.map((name) => {
          const suggested = suggestCategory(name, expenseCategories, 'expense')
          return {
            ...newRow({ account_id: defaultAccount, date: today }),
            description: name,
            category_id: suggested?.id || '',
          }
        })
      )
    } else {
      setCaptureRows(Array.from({ length: 3 }, () => newRow({ account_id: defaultAccount, date: today })))
    }
    setSaveError(null)
    setShowCapture(true)
  }

  const updateRow = (id: string, patch: Partial<CaptureRow>) => {
    setCaptureRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const addRow = () => setCaptureRows((rows) => [...rows, newRow({ account_id: commonAccountId, date: commonDate })])
  const removeRow = (id: string) =>
    setCaptureRows((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)))

  const applyCommonDate = () => setCaptureRows((rows) => rows.map((r) => ({ ...r, date: commonDate })))
  const applyCommonAccount = () => setCaptureRows((rows) => rows.map((r) => ({ ...r, account_id: commonAccountId })))

  const createCategory = async (name: string, onPick: (id: string) => void) => {
    if (!household) return
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), -1)
    const { data } = await supabase
      .from('categories')
      .insert({ household_id: household.id, name, type: 'expense', sort_order: maxOrder + 1 })
      .select()
      .single()
    if (data) {
      setCategories((prev) => [...prev, data as Category])
      onPick((data as Category).id)
    }
  }

  const filledRows = captureRows.filter((r) => r.description.trim() || Number(r.amount) > 0 || r.category_id)
  const preparedRows = () => captureRows.filter((r) => r.description.trim() || Number(r.amount) > 0)

  const validatePrepared = (rows: CaptureRow[]): string | null => {
    if (rows.length === 0) return 'Add at least one expense with an amount and description.'
    for (const r of rows) {
      const amt = Number(r.amount)
      if (!Number.isFinite(amt) || amt <= 0) return 'Each expense needs an amount greater than zero.'
      if (!r.account_id) return 'Choose an account for every expense.'
      if (!r.description.trim()) return 'Add a description for every expense.'
    }
    return null
  }

  const handleSaveAll = async () => {
    if (!household || !user) return
    setSaveError(null)
    const rows = preparedRows()
    const err = validatePrepared(rows)
    if (err) return setSaveError(err)
    setSaving(true)
    let saved = 0
    try {
      for (const r of rows) {
        const amount = Number(r.amount)
        const { error: insertErr } = await supabase.from('transactions').insert({
          household_id: household.id,
          account_id: r.account_id,
          category_id: r.category_id || null,
          type: 'expense',
          amount,
          description: r.description.trim(),
          date: r.date || commonDate,
          status: 'received',
          created_by: user.id,
        })
        if (insertErr) throw new Error(insertErr.message)
        const { data: acct } = await supabase.from('accounts').select('balance').eq('id', r.account_id).single()
        if (acct) {
          await supabase.from('accounts').update({ balance: acct.balance - amount }).eq('id', r.account_id)
        }
        saved += 1
      }
      setShowCapture(false)
      notifyDataChanged()
      await fetchData()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save expenses.'
      setSaveError(saved > 0 ? `${msg} ${saved} of ${rows.length} expenses were saved before the error.` : msg)
      if (saved > 0) {
        notifyDataChanged()
        await fetchData()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSendToInbox = async () => {
    if (!household || !user) return
    setSaveError(null)
    const rows = preparedRows()
    const err = validatePrepared(rows)
    if (err) return setSaveError(err)
    setSaving(true)
    try {
      const msg = await createExpenseCaptures(
        rows.map((r) => ({
          householdId: household.id,
          userId: user.id,
          accountId: r.account_id,
          categoryId: r.category_id || null,
          amount: Number(r.amount),
          currency: currencyByAccount.get(r.account_id) || DEFAULT_CURRENCY,
          description: r.description.trim(),
          date: r.date || commonDate,
          source: 'quick_entry' as const,
          status: 'needs_review' as const,
        }))
      )
      if (msg) throw new Error(msg)
      setShowCapture(false)
      await fetchData()
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not send to inbox.'
      setSaveError(
        message.includes('expense_captures')
          ? 'Expense inbox is not available yet. Apply migration 013_expense_inbox.sql in Supabase, then try again.'
          : message
      )
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (c: ExpenseCapture) => {
    setEditingId(c.id)
    setEditDraft({
      description: c.description,
      amount: c.amount,
      date: c.date,
      account_id: c.account_id,
      category_id: c.category_id,
      currency: c.currency,
      notes: c.notes ?? '',
    })
    setInboxError(null)
  }

  const saveEdit = async (c: ExpenseCapture) => {
    setRowBusy(c.id)
    setInboxError(null)
    const amount = Number(editDraft.amount)
    const description = String(editDraft.description ?? c.description).trim()
    const date = String(editDraft.date ?? c.date)
    if (!description) { setRowBusy(null); return setInboxError('Description is required.') }
    if (!Number.isFinite(amount) || amount <= 0) { setRowBusy(null); return setInboxError('Amount must be greater than zero.') }
    if (!date) { setRowBusy(null); return setInboxError('Date is required.') }
    const accountId = (editDraft.account_id as string | null) ?? c.account_id
    const currency = accountId ? currencyByAccount.get(accountId) || c.currency : c.currency
    const msg = await updateExpenseCapture(c.id, {
      description,
      amount,
      date,
      account_id: accountId,
      category_id: (editDraft.category_id as string | null) ?? null,
      currency,
      notes: editDraft.notes === '' ? null : (editDraft.notes as string | null) ?? c.notes,
    })
    setRowBusy(null)
    if (msg) return setInboxError(msg)
    setEditingId(null)
    await fetchData()
  }

  const handleCommit = async (c: ExpenseCapture) => {
    if (!user) return
    setRowBusy(c.id)
    setInboxError(null)
    const current = editingId === c.id ? { ...c, ...editDraft } as ExpenseCapture : c
    const accountId = (current.account_id as string | null) ?? null
    const currency = accountId ? currencyByAccount.get(accountId) || current.currency : current.currency
    const toCommit: ExpenseCapture = {
      ...c,
      description: String(current.description ?? c.description).trim(),
      amount: Number(current.amount ?? c.amount),
      date: String(current.date ?? c.date),
      account_id: accountId,
      category_id: (current.category_id as string | null) ?? null,
      currency,
      notes: (current.notes as string | null) ?? c.notes,
    }
    // Persist edits before committing so the record matches what the user confirmed.
    if (editingId === c.id) {
      const saveMsg = await updateExpenseCapture(c.id, {
        description: toCommit.description,
        amount: toCommit.amount,
        date: toCommit.date,
        account_id: toCommit.account_id,
        category_id: toCommit.category_id,
        currency: toCommit.currency,
        notes: toCommit.notes,
      })
      if (saveMsg) {
        setRowBusy(null)
        return setInboxError(saveMsg)
      }
    }
    const result = await commitExpenseCapture(toCommit, user.id)
    setRowBusy(null)
    if (result.error) {
      setInboxError(result.error)
      if (result.transactionId) {
        // Balance/transaction were applied but capture link failed; refresh so user can recover.
        notifyDataChanged()
        await fetchData()
      }
      return
    }
    setEditingId(null)
    notifyDataChanged()
    await fetchData()
  }

  const handleDismiss = async (id: string) => {
    setRowBusy(id)
    setInboxError(null)
    const msg = await dismissExpenseCapture(id)
    setRowBusy(null)
    if (msg) return setInboxError(msg)
    if (editingId === id) setEditingId(null)
    setSelectedInboxIds((prev) => { const n = new Set(prev); n.delete(id); return n })
    await fetchData()
  }

  const toggleInboxSelect = (id: string) => {
    setSelectedInboxIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const bulkInboxAction = async (action: 'confirm' | 'dismiss') => {
    if (!user) return
    const ids = pendingCaptures.filter((c) => selectedInboxIds.has(c.id)).map((c) => c.id)
    if (ids.length === 0) return setInboxError('Select at least one inbox item.')
    setInboxError(null)
    for (const id of ids) {
      const c = captures.find((x) => x.id === id)
      if (!c) continue
      setRowBusy(id)
      if (action === 'dismiss') {
        const msg = await dismissExpenseCapture(id)
        if (msg) { setRowBusy(null); setInboxError(msg); return }
      } else {
        const result = await commitExpenseCapture(c, user.id)
        if (result.error) { setRowBusy(null); setInboxError(result.error); if (result.transactionId) { notifyDataChanged(); await fetchData() } return }
        notifyDataChanged()
      }
      setRowBusy(null)
    }
    setSelectedInboxIds(new Set())
    await fetchData()
  }

  const getAccountName = (id: string | null | undefined) => accounts.find((a) => a.id === id)?.name || '—'
  const getCategoryName = (id?: string | null) => categories.find((c) => c.id === id)?.name || '—'

  const startVoiceListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setVoiceError('Voice recognition is not supported in this browser. Type your expenses instead.')
      return
    }
    setVoiceError(null)
    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    let finalText = voiceText
    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0]?.transcript ?? ''
        if (event.results[i].isFinal) finalText = `${finalText} ${chunk}`.trim()
        else interim += chunk
      }
      setVoiceText(`${finalText} ${interim}`.trim())
    }
    recognition.onerror = () => {
      setVoiceListening(false)
      setVoiceError('Could not capture voice. You can type the expenses instead.')
    }
    recognition.onend = () => setVoiceListening(false)
    recognition.start()
    setVoiceListening(true)
  }

  const parseVoiceText = async () => {
    if (!voiceText.trim()) return setVoiceError('Say or type what you spent first.')
    setVoiceParsing(true)
    setVoiceError(null)
    try {
      const currency = currencyByAccount.get(voiceAccountId) || household?.currency || DEFAULT_CURRENCY
      const res = await parseExpenses({ transcript: voiceText.trim(), currency, date: voiceDate })
      const mapped: CaptureRow[] = res.candidates.map((c) => {
        const description = c.description || ''
        const suggestion = c.categorySuggestion
          ? expenseCategories.find((cat) => cat.name.toLowerCase() === c.categorySuggestion?.toLowerCase()) ||
            suggestCategory(description, expenseCategories, 'expense')
          : suggestCategory(description, expenseCategories, 'expense')
        const cur = (c.currency || currency || DEFAULT_CURRENCY).toUpperCase()
        const accountForCurrency = accounts.find((a) => a.id === voiceAccountId && (a.currency || DEFAULT_CURRENCY) === cur)
          ? voiceAccountId
          : accounts.find((a) => (a.currency || DEFAULT_CURRENCY) === cur)?.id || voiceAccountId
        return {
          id: crypto.randomUUID(),
          description,
          amount: c.amount != null ? String(c.amount) : '',
          category_id: suggestion?.id || '',
          account_id: accountForCurrency || accounts[0]?.id || '',
          date: c.date || voiceDate,
        }
      })
      setVoiceCandidates(mapped)
      if (mapped.length === 0) setVoiceError('No expenses were detected. Try a clearer note like "I spent 5000 on groceries and 2000 on transport".')
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : 'Could not parse expenses.')
    } finally {
      setVoiceParsing(false)
    }
  }

  const updateVoiceCandidate = (id: string, patch: Partial<CaptureRow>) => {
    setVoiceCandidates((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const saveVoiceCandidates = async (toInbox: boolean) => {
    if (!household || !user) return
    const rows = voiceCandidates.filter((r) => r.description.trim() || Number(r.amount) > 0)
    const err = validatePrepared(rows)
    if (err) return setVoiceError(err)
    setVoiceParsing(true)
    setVoiceError(null)
    try {
      if (toInbox) {
        const msg = await createExpenseCaptures(rows.map((r) => ({
          householdId: household.id,
          userId: user.id,
          accountId: r.account_id,
          categoryId: r.category_id || null,
          amount: Number(r.amount),
          currency: currencyByAccount.get(r.account_id) || DEFAULT_CURRENCY,
          description: r.description.trim(),
          date: r.date || voiceDate,
          source: 'voice' as const,
          status: 'needs_review' as const,
          rawInput: voiceText.trim(),
        })))
        if (msg) throw new Error(msg)
      } else {
        let saved = 0
        for (const r of rows) {
          const amount = Number(r.amount)
          const { error: insertErr } = await supabase.from('transactions').insert({
            household_id: household.id, account_id: r.account_id, category_id: r.category_id || null,
            type: 'expense', amount, description: r.description.trim(), date: r.date || voiceDate,
            status: 'received', created_by: user.id,
          })
          if (insertErr) throw new Error(saved > 0 ? `${insertErr.message} ${saved} of ${rows.length} saved before the error.` : insertErr.message)
          const { data: acct } = await supabase.from('accounts').select('balance').eq('id', r.account_id).single()
          if (acct) await supabase.from('accounts').update({ balance: acct.balance - amount }).eq('id', r.account_id)
          saved += 1
        }
        notifyDataChanged()
      }
      setShowVoice(false)
      setVoiceCandidates([])
      setVoiceText('')
      await fetchData()
    } catch (e) {
      setVoiceError(e instanceof Error ? e.message : 'Could not save parsed expenses.')
    } finally {
      setVoiceParsing(false)
    }
  }

  const guessImportMap = (headers: string[]): CsvColumnMap => {
    const find = (patterns: RegExp[]) => headers.find((h) => patterns.some((p) => p.test(h.toLowerCase()))) || ''
    return {
      date: find([/date/, /posted/, /transaction date/]),
      description: find([/desc/, /narration/, /details/, /merchant/, /reference/]),
      amount: find([/amount/, /value/]),
      debit: find([/debit/, /withdraw/, /outflow/]),
      credit: find([/credit/, /deposit/, /inflow/]),
    }
  }

  const handleImportFile = async (file: File) => {
    setImportError(null)
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (parsed.headers.length === 0) throw new Error('Could not read any columns from that file.')
      setImportHeaders(parsed.headers)
      setImportRawRows(parsed.rows)
      const map = guessImportMap(parsed.headers)
      setImportMap(map)
      setImportRows([])
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not read file.')
    }
  }

  const buildImportPreview = () => {
    setImportError(null)
    if (!importAccountId) return setImportError('Choose the account this statement belongs to.')
    if (!importMap.date || !importMap.description || (!importMap.amount && !importMap.debit)) {
      return setImportError('Map at least Date, Description, and Amount (or Debit).')
    }
    const rows = buildImportedRows({ rows: importRawRows, map: importMap, existingTransactions: transactions, accountId: importAccountId })
    setImportRows(rows)
    if (rows.length === 0) setImportError('No expense rows were detected. Check your column mapping and file.')
  }

  const importSelectedToInbox = async () => {
    if (!household || !user) return
    if (!importAccountId) return setImportError('Choose an account first.')
    const selected = importRows.filter((r) => r.selected)
    if (selected.length === 0) return setImportError('Select at least one row to import.')
    if (inboxUnavailable) return setImportError(inboxUnavailable)
    setImportBusy(true)
    setImportError(null)
    try {
      const currency = currencyByAccount.get(importAccountId) || DEFAULT_CURRENCY
      const batchId = crypto.randomUUID()
      const inputs = selected.map((r) => ({
        householdId: household.id,
        userId: user.id,
        accountId: importAccountId,
        categoryId: null,
        amount: r.amount,
        currency,
        description: r.description,
        date: r.date,
        source: 'import' as const,
        status: r.duplicateOf ? ('needs_review' as const) : ('ready' as const),
        notes: r.duplicateReason ? `Possible duplicate: ${r.duplicateReason} (${r.duplicateOf?.date} ${r.duplicateOf?.description})` : null,
        rawInput: JSON.stringify(r.raw),
        importBatchId: batchId,
      }))
      const msg = await createExpenseCaptures(inputs)
      if (msg) throw new Error(msg)
      setShowImport(false)
      setImportRows([])
      setImportRawRows([])
      await fetchData()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Could not import rows.')
    } finally {
      setImportBusy(false)
    }
  }

  const captureTotalByCurrency = useMemo(() => {
    const totals = new Map<string, number>()
    for (const r of filledRows) {
      const amt = Number(r.amount) || 0
      if (amt <= 0) continue
      const cur = currencyByAccount.get(r.account_id) || DEFAULT_CURRENCY
      totals.set(cur, (totals.get(cur) ?? 0) + amt)
    }
    return Array.from(totals.entries())
  }, [filledRows, currencyByAccount])

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text">Expenses</h1>
            <p className="text-sm text-text-muted">Record spending, capture multiple expenses, and review items before they hit your balances.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => openTransaction('expense')} className="btn-secondary">
              <Plus className="h-4 w-4" /> Add expense
            </button>
            <button type="button" onClick={() => { setVoiceText(''); setVoiceCandidates([]); setVoiceError(null); setVoiceDate(new Date().toISOString().split('T')[0]); setVoiceAccountId(accounts[0]?.id || ''); setShowVoice(true) }} className="btn-secondary" disabled={accounts.length === 0}>
              <Mic className="h-4 w-4" /> Voice capture
            </button>
            <button type="button" onClick={() => openCapture('daily')} className="btn-secondary" disabled={accounts.length === 0}>
              <CalendarDays className="h-4 w-4" /> Daily summary
            </button>
            <button type="button" onClick={() => { setShowImport(true); setImportError(null); setImportRows([]); setImportRawRows([]); setImportHeaders([]); setImportAccountId(accounts[0]?.id || '') }} className="btn-secondary" disabled={accounts.length === 0}>
              <Upload className="h-4 w-4" /> Import statement
            </button>
            <button type="button" onClick={() => openCapture('now')} className="btn-primary" disabled={accounts.length === 0}>
              <ListPlus className="h-4 w-4" /> Quick expense entry
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="stat-card">
            <ArrowUpCircle className="h-5 w-5 text-danger" />
            {monthTotals.length === 0 ? (
              <p className="stat-value text-danger">{formatCurrency(0)}</p>
            ) : (
              <div className="space-y-0.5">
                {monthTotals.map((t) => (
                  <p key={t.currency} className="stat-value text-xl text-danger">{formatCurrency(t.total, t.currency)}</p>
                ))}
              </div>
            )}
            <p className="stat-label">Expenses this month (confirmed)</p>
          </div>
          <div className="stat-card">
            <Receipt className="h-5 w-5 text-cta" />
            <p className="stat-value">{thisMonth.length}</p>
            <p className="stat-label">Confirmed expenses this month</p>
          </div>
          <div className="stat-card">
            <Inbox className="h-5 w-5 text-warning" />
            <p className="stat-value">{pendingCaptures.length}</p>
            <p className="stat-label">Needs review in inbox</p>
          </div>
        </div>

        {accounts.length === 0 && (
          <div className="card text-sm text-text-muted">Add an account first so expenses can be recorded or reviewed against it.</div>
        )}

        {/* Expense Inbox */}
        <div className="card">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-text">
                <Inbox className="h-5 w-5 text-warning" /> Expense inbox
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Captured expenses stay here until you confirm them. Nothing affects your balances until you save it to the ledger.
              </p>
            </div>
            {pendingCaptures.length > 0 && (
              <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                {pendingCaptures.length} to review
              </span>
            )}
          </div>

          {pendingCaptures.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button type="button" className="btn-secondary py-1.5 px-3 text-xs" onClick={() => setSelectedInboxIds(new Set(pendingCaptures.map((c) => c.id)))}>Select all</button>
              <button type="button" className="btn-secondary py-1.5 px-3 text-xs" onClick={() => setSelectedInboxIds(new Set())}>Clear</button>
              <button type="button" className="btn-primary py-1.5 px-3 text-xs" disabled={selectedInboxIds.size === 0 || !!rowBusy} onClick={() => void bulkInboxAction('confirm')}>Confirm selected</button>
              <button type="button" className="btn-secondary py-1.5 px-3 text-xs text-danger" disabled={selectedInboxIds.size === 0 || !!rowBusy} onClick={() => void bulkInboxAction('dismiss')}>Dismiss selected</button>
            </div>
          )}

          {inboxUnavailable && (
            <p role="status" className="mb-3 rounded-lg bg-warning/10 p-3 text-sm text-warning">{inboxUnavailable}</p>
          )}
          {inboxError && <p role="alert" className="mb-3 rounded-lg bg-danger/10 p-3 text-sm text-danger">{inboxError}</p>}

          {loading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : pendingCaptures.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Inbox className="mx-auto h-8 w-8 text-text-light" />
              <p className="mt-2 text-sm text-text-muted">No expenses waiting for review.</p>
              <p className="mt-1 text-xs text-text-light">Use Quick expense entry → “Send to inbox” to capture now and confirm later.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingCaptures.map((c) => {
                const editing = editingId === c.id
                const busy = rowBusy === c.id
                const draftAccount = (editDraft.account_id as string | undefined) ?? c.account_id ?? ''
                const draftCurrency = draftAccount ? currencyByAccount.get(draftAccount) || c.currency : c.currency
                return (
                  <div key={c.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <input type="checkbox" className="mt-1" checked={selectedInboxIds.has(c.id)} onChange={() => toggleInboxSelect(c.id)} aria-label={`Select ${c.description}`} />
                        <div className="min-w-0 flex-1">
                        {!editing ? (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-text">{c.description}</p>
                              <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[11px] capitalize text-text-muted">{c.source.replace('_', ' ')}</span>
                              {c.notes?.toLowerCase().includes('possible duplicate') && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] text-warning">Possible duplicate</span>}
                            </div>
                            <p className="mt-1 text-sm text-text-muted">
                              {formatCurrency(c.amount, c.currency)} · {c.date} · {getAccountName(c.account_id)} · {getCategoryName(c.category_id)}
                            </p>
                            {c.notes && <p className="mt-1 text-xs text-text-light">{c.notes}</p>}
                          </>
                        ) : (
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <div className="sm:col-span-2 lg:col-span-1">
                              <label className="label">Description</label>
                              <input className="input-field" value={String(editDraft.description ?? '')} onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))} />
                            </div>
                            <div>
                              <label className="label">Amount ({getCurrency(draftCurrency).symbol})</label>
                              <input type="number" className="input-field" value={String(editDraft.amount ?? '')} onChange={(e) => setEditDraft((d) => ({ ...d, amount: Number(e.target.value) }))} />
                            </div>
                            <div>
                              <label className="label">Date</label>
                              <input type="date" className="input-field" value={String(editDraft.date ?? '')} onChange={(e) => setEditDraft((d) => ({ ...d, date: e.target.value }))} />
                            </div>
                            <div>
                              <label className="label">Account</label>
                              <select className="input-field" value={draftAccount} onChange={(e) => setEditDraft((d) => ({ ...d, account_id: e.target.value || null }))}>
                                <option value="">Select account</option>
                                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <span className="label">Category</span>
                              <CategoryPicker
                                categories={expenseCategories}
                                kind="expense"
                                value={(editDraft.category_id as string) ?? ''}
                                onChange={(id) => setEditDraft((d) => ({ ...d, category_id: id || null }))}
                                onCreate={(name) => createCategory(name, (id) => setEditDraft((d) => ({ ...d, category_id: id })))}
                              />
                            </div>
                          </div>
                        )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {!editing ? (
                          <>
                            <button type="button" onClick={() => startEdit(c)} className="btn-secondary py-1.5 px-3 text-xs" disabled={busy}>
                              <Pencil className="h-4 w-4" /> Review
                            </button>
                            <button type="button" onClick={() => void handleCommit(c)} className="btn-primary py-1.5 px-3 text-xs" disabled={busy}>
                              <CheckCircle2 className="h-4 w-4" /> {busy ? 'Saving…' : 'Confirm & save'}
                            </button>
                            <button type="button" onClick={() => void handleDismiss(c.id)} className="btn-secondary py-1.5 px-3 text-xs text-danger" disabled={busy}>
                              <XCircle className="h-4 w-4" /> Dismiss
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => void saveEdit(c)} className="btn-secondary py-1.5 px-3 text-xs" disabled={busy}>Save changes</button>
                            <button type="button" onClick={() => void handleCommit(c)} className="btn-primary py-1.5 px-3 text-xs" disabled={busy}>
                              <CheckCircle2 className="h-4 w-4" /> {busy ? 'Saving…' : 'Confirm & save'}
                            </button>
                            <button type="button" onClick={() => { setEditingId(null); setEditDraft({}) }} className="btn-secondary py-1.5 px-3 text-xs" disabled={busy}>Cancel</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-text">Expense Capture Centre</h2>
              <p className="mt-1 text-sm text-text-muted">
                Enter several expenses in one go. Save them now, or send them to the inbox to review and confirm later.
              </p>
            </div>
            <button type="button" onClick={() => openCapture('now')} className="btn-primary" disabled={accounts.length === 0}>
              <ListPlus className="h-4 w-4" /> Open capture
            </button>
          </div>
          <ul className="mt-4 grid grid-cols-1 gap-2 text-sm text-text-muted sm:grid-cols-2">
            <li>• Add as many rows as you need</li>
            <li>• Pick category per expense (suggested from description)</li>
            <li>• Use one date/account for all, or change per row</li>
            <li>• “Send to inbox” = review first, no balance change yet</li>
          </ul>
        </div>

        {household && user && (
          <RecurringExpensesCard
            householdId={household.id}
            userId={user.id}
            accounts={accounts}
            categories={categories}
            currency={household.currency}
            onChanged={() => { notifyDataChanged(); void fetchData() }}
          />
        )}

        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text">Recent confirmed expenses</h2>
            <Link to="/transactions?type=expense" className="flex items-center gap-1 text-sm font-medium text-cta hover:text-cta-light">
              View in Transactions <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th>Account</Th>
                <Th align="right">Amount</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <TableLoading colSpan={5} />
              ) : transactions.length === 0 ? (
                <TableEmpty colSpan={5} icon={Receipt} title="No confirmed expenses yet" action={<button type="button" onClick={() => openTransaction('expense')} className="btn-primary mt-4"><Plus className="h-4 w-4" />Add your first expense</button>} />
              ) : (
                transactions.slice(0, 15).map((tx) => (
                  <tr key={tx.id} className="border-b border-border last:border-0">
                    <Td><p className="font-medium">{tx.description}</p>{tx.notes && <p className="text-xs text-text-muted">{tx.notes}</p>}</Td>
                    <Td className="text-text-muted">{getCategoryName(tx.category_id)}</Td>
                    <Td className="text-text-muted">{getAccountName(tx.account_id)}</Td>
                    <Td align="right"><span className="font-semibold text-danger">−{formatCurrency(tx.amount, currencyByAccount.get(tx.account_id))}</span></Td>
                    <Td className="text-text-muted">{tx.date}</Td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>

        <Modal
          open={showCapture}
          title="Quick expense entry"
          description="Capture multiple expenses in one session. Save now to record them, or send to inbox to review before balances change. For a daily summary, fill what you spent today and add any other rows you need."
          onClose={() => !saving && setShowCapture(false)}
          size="lg"
          footer={
            <div className="flex w-full flex-col gap-3">
              <div className="text-sm text-text-muted">
                {filledRows.length} row{filledRows.length === 1 ? '' : 's'} with entries
                {captureTotalByCurrency.length > 0 && (
                  <span className="ml-2 font-medium text-text">
                    · {captureTotalByCurrency.map(([c, t]) => formatCurrency(t, c)).join(' + ')}
                  </span>
                )}
                {captureTotalByCurrency.length > 1 && <span className="ml-1 text-xs">(separate currencies, not combined)</span>}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setShowCapture(false)} className="btn-secondary" disabled={saving}>Cancel</button>
                <button type="button" onClick={() => void handleSendToInbox()} className="btn-secondary" disabled={saving || !!inboxUnavailable}>
                  {saving ? 'Working…' : 'Send to inbox'}
                </button>
                <button type="button" onClick={() => void handleSaveAll()} className="btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : `Save ${filledRows.length || ''} expense${filledRows.length === 1 ? '' : 's'} now`.trim()}
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-lg bg-surface-alt p-3 sm:grid-cols-2">
              <div>
                <label htmlFor="cap-common-date" className="label">Common date</label>
                <div className="flex gap-2">
                  <input id="cap-common-date" type="date" value={commonDate} onChange={(e) => setCommonDate(e.target.value)} className="input-field" />
                  <button type="button" onClick={applyCommonDate} className="btn-secondary shrink-0">Apply to all</button>
                </div>
              </div>
              <div>
                <label htmlFor="cap-common-account" className="label">Common account</label>
                <div className="flex gap-2">
                  <select id="cap-common-account" value={commonAccountId} onChange={(e) => setCommonAccountId(e.target.value)} className="input-field">
                    <option value="">Select account</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance, a.currency)})</option>)}
                  </select>
                  <button type="button" onClick={applyCommonAccount} className="btn-secondary shrink-0">Apply to all</button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {captureRows.map((row, idx) => {
                const rowCurrency = currencyByAccount.get(row.account_id) || DEFAULT_CURRENCY
                return (
                  <div key={row.id} className="rounded-lg border border-border p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-text-muted">Expense {idx + 1}</span>
                      <button type="button" onClick={() => removeRow(row.id)} className="inline-flex cursor-pointer items-center gap-1 text-xs text-danger hover:underline" disabled={captureRows.length <= 1}>
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      <div className="lg:col-span-2">
                        <label className="label">Description</label>
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => {
                            const v = e.target.value
                            const patch: Partial<CaptureRow> = { description: v }
                            if (!row.category_id) {
                              const s = suggestCategory(v, expenseCategories, 'expense')
                              if (s) patch.category_id = s.id
                            }
                            updateRow(row.id, patch)
                          }}
                          className="input-field"
                          placeholder="e.g. Groceries, Fuel"
                        />
                      </div>
                      <div>
                        <label className="label">Amount ({getCurrency(rowCurrency).symbol})</label>
                        <input type="number" inputMode="decimal" value={row.amount} onChange={(e) => updateRow(row.id, { amount: e.target.value })} className="input-field" placeholder="0" />
                      </div>
                      <div>
                        <label className="label">Account</label>
                        <select value={row.account_id} onChange={(e) => updateRow(row.id, { account_id: e.target.value })} className="input-field">
                          <option value="">Select</option>
                          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label">Date</label>
                        <input type="date" value={row.date} onChange={(e) => updateRow(row.id, { date: e.target.value })} className="input-field" />
                      </div>
                      <div className="sm:col-span-2 lg:col-span-5">
                        <span className="label">Category</span>
                        <CategoryPicker
                          categories={expenseCategories}
                          kind="expense"
                          value={row.category_id}
                          onChange={(id) => updateRow(row.id, { category_id: id })}
                          onCreate={(name) => createCategory(name, (id) => updateRow(row.id, { category_id: id }))}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            <button type="button" onClick={addRow} className="btn-secondary w-full sm:w-auto">
              <Plus className="h-4 w-4" /> Add another expense
            </button>

            {saveError && <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{saveError}</p>}
          </div>
        </Modal>

        <Modal
          open={showImport}
          title="Import bank statement (CSV)"
          description="Upload a CSV statement, map columns, review duplicates, then import selected rows to the inbox. Nothing is posted to balances until you confirm each item."
          onClose={() => !importBusy && setShowImport(false)}
          size="lg"
          footer={
            importRows.length > 0 ? (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" className="btn-secondary" onClick={() => setShowImport(false)} disabled={importBusy}>Cancel</button>
                <button type="button" className="btn-primary" onClick={() => void importSelectedToInbox()} disabled={importBusy || !!inboxUnavailable}>
                  {importBusy ? 'Importing…' : `Import ${importRows.filter((r) => r.selected).length} to inbox`}
                </button>
              </div>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Statement account</label>
                <select className="input-field" value={importAccountId} onChange={(e) => setImportAccountId(e.target.value)}>
                  <option value="">Select account</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </select>
              </div>
              <div>
                <label className="label">CSV file</label>
                <input
                  type="file"
                  accept=".csv,text/csv,.pdf,application/pdf,.xlsx,.xls"
                  className="input-field"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    const name = f.name.toLowerCase()
                    if (name.endsWith('.pdf') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
                      setImportError('PDF/Excel extraction is not supported yet in this version. Export your statement as CSV for accurate review and import.')
                      return
                    }
                    void handleImportFile(f)
                  }}
                />
              </div>
            </div>

            {importHeaders.length > 0 && (
              <div className="rounded-lg border border-border p-3 space-y-3">
                <p className="text-sm font-medium text-text"><FileSpreadsheet className="inline h-4 w-4 mr-1" />Column mapping</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(['date', 'description', 'amount', 'debit', 'credit'] as const).map((key) => (
                    <div key={key}>
                      <label className="label capitalize">{key}{key === 'amount' ? ' (or use debit/credit)' : ''}</label>
                      <select className="input-field" value={importMap[key] || ''} onChange={(e) => setImportMap((m) => ({ ...m, [key]: e.target.value }))}>
                        <option value="">Not mapped</option>
                        {importHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <button type="button" className="btn-secondary" onClick={buildImportPreview}>Preview rows</button>
              </div>
            )}

            {importRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-text-muted">{importRows.length} expense row(s) detected. {importRows.filter((r) => r.duplicateOf).length} possible duplicate(s) flagged for review.</p>
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {importRows.map((r) => (
                    <label key={r.id} className={`flex items-start gap-3 rounded-lg border p-3 ${r.duplicateOf ? 'border-warning/40 bg-warning/5' : 'border-border'}`}>
                      <input type="checkbox" checked={r.selected} onChange={(e) => setImportRows((rows) => rows.map((x) => x.id === r.id ? { ...x, selected: e.target.checked } : x))} className="mt-1" />
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="flex flex-wrap justify-between gap-2">
                          <span className="font-medium text-text">{r.description}</span>
                          <span className="font-semibold text-danger">-{formatCurrency(r.amount, currencyByAccount.get(importAccountId) || DEFAULT_CURRENCY)}</span>
                        </div>
                        <p className="text-xs text-text-muted">{r.date}</p>
                        {r.duplicateOf && (
                          <p className="mt-1 text-xs text-warning">Possible duplicate: {r.duplicateReason}. Existing: {r.duplicateOf.date} · {r.duplicateOf.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {importError && <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{importError}</p>}
            <p className="text-xs text-text-muted">CSV is supported now. PDF/Excel extraction can be added next; for now export/convert statements to CSV. Imported rows go to the inbox for review before any balance changes.</p>
          </div>
        </Modal>

        <Modal
          open={showVoice}
          title="Voice or text expense capture"
          description="Describe what you spent. AI suggests expense entries for your review — nothing is saved until you confirm."
          onClose={() => !voiceParsing && setShowVoice(false)}
          size="lg"
          footer={
            voiceCandidates.length > 0 ? (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setShowVoice(false)} className="btn-secondary" disabled={voiceParsing}>Cancel</button>
                <button type="button" onClick={() => void saveVoiceCandidates(true)} className="btn-secondary" disabled={voiceParsing || !!inboxUnavailable}>
                  {voiceParsing ? 'Working…' : 'Send to inbox'}
                </button>
                <button type="button" onClick={() => void saveVoiceCandidates(false)} className="btn-primary" disabled={voiceParsing}>
                  {voiceParsing ? 'Saving…' : 'Save expenses now'}
                </button>
              </div>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="voice-account" className="label">Default account</label>
                <select id="voice-account" value={voiceAccountId} onChange={(e) => setVoiceAccountId(e.target.value)} className="input-field">
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="voice-date" className="label">Default date</label>
                <input id="voice-date" type="date" value={voiceDate} onChange={(e) => setVoiceDate(e.target.value)} className="input-field" />
              </div>
            </div>

            <div>
              <label htmlFor="voice-text" className="label">What did you spend?</label>
              <textarea
                id="voice-text"
                value={voiceText}
                onChange={(e) => setVoiceText(e.target.value)}
                className="input-field min-h-[96px]"
                placeholder='e.g. "I spent 5,000 naira on groceries and 2,000 on transport"'
              />
              <p className="mt-1 text-xs text-text-muted">Review and edit the parsed items before saving. AI can make mistakes.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={startVoiceListening} className="btn-secondary" disabled={voiceParsing || voiceListening}>
                {voiceListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {voiceListening ? 'Listening…' : 'Use microphone'}
              </button>
              <button type="button" onClick={() => void parseVoiceText()} className="btn-primary" disabled={voiceParsing || voiceListening}>
                <Wand2 className="h-4 w-4" /> {voiceParsing ? 'Parsing…' : 'Parse expenses'}
              </button>
            </div>

            {voiceError && <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{voiceError}</p>}

            {voiceCandidates.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-text">Review parsed expenses</p>
                {voiceCandidates.map((row, idx) => {
                  const rowCurrency = currencyByAccount.get(row.account_id) || DEFAULT_CURRENCY
                  return (
                    <div key={row.id} className="rounded-lg border border-border p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-text-muted">Expense {idx + 1}</span>
                        <button type="button" onClick={() => setVoiceCandidates((rows) => rows.filter((r) => r.id !== row.id))} className="text-xs text-danger hover:underline cursor-pointer">Remove</button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="label">Description</label>
                          <input className="input-field" value={row.description} onChange={(e) => updateVoiceCandidate(row.id, { description: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Amount ({getCurrency(rowCurrency).symbol})</label>
                          <input type="number" className="input-field" value={row.amount} onChange={(e) => updateVoiceCandidate(row.id, { amount: e.target.value })} />
                        </div>
                        <div>
                          <label className="label">Account</label>
                          <select className="input-field" value={row.account_id} onChange={(e) => updateVoiceCandidate(row.id, { account_id: e.target.value })}>
                            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="label">Date</label>
                          <input type="date" className="input-field" value={row.date} onChange={(e) => updateVoiceCandidate(row.id, { date: e.target.value })} />
                        </div>
                        <div className="sm:col-span-2">
                          <span className="label">Category</span>
                          <CategoryPicker categories={expenseCategories} kind="expense" value={row.category_id} onChange={(id) => updateVoiceCandidate(row.id, { category_id: id })} onCreate={(name) => createCategory(name, (id) => updateVoiceCandidate(row.id, { category_id: id }))} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </Modal>
      </div>
    </Layout>
  )
}
