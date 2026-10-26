import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { formatCurrency } from '@/lib/utils'
import { DEFAULT_CURRENCY, canTransferBetween, getCurrency } from '@/lib/currency'
import { suggestCategory } from '@/lib/categories'
import { recordTransaction, validateTransaction, type TransactionKind } from '@/lib/transactions'
import type { Account, Category } from '@/types'
import { Modal } from '@/components/ui/Modal'
import { CategoryPicker } from '@/components/ui/CategoryPicker'
import { CategoryIcon } from '@/components/ui/CategoryIcon'

const COPY: Record<TransactionKind, { title: string; description: string; cta: string }> = {
  income: {
    title: 'Add income',
    description: 'Record money that came in.',
    cta: 'Save income',
  },
  expense: {
    title: 'Add expense',
    description: 'Record money that went out.',
    cta: 'Save expense',
  },
  transfer: {
    title: 'Transfer money',
    description: 'Move money between your own accounts. It is not income or an expense.',
    cta: 'Save transfer',
  },
}

export interface TransactionDialogProps {
  open: boolean
  kind: TransactionKind
  onClose: () => void
  onSaved: () => void
  /** Pre-selects the account (used by per-account actions). */
  initialAccountId?: string | null
}

export function TransactionDialog({
  open,
  kind,
  onClose,
  onSaved,
  initialAccountId,
}: TransactionDialogProps) {
  const { user } = useAuth()
  const { household } = useHousehold()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [suggestedId, setSuggestedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ summary: string } | null>(null)

  const copy = COPY[kind]
  const categoryKind = kind === 'income' ? 'income' : 'expense'

  useEffect(() => {
    if (!open || !household) return
    let cancelled = false

    const load = async () => {
      setLoadingData(true)
      const [accRes, catRes] = await Promise.all([
        supabase
          .from('accounts')
          .select('*')
          .eq('household_id', household.id)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('categories')
          .select('*')
          .eq('household_id', household.id)
          .order('sort_order'),
      ])
      if (cancelled) return
      const accs = (accRes.data || []) as Account[]
      setAccounts(accs)
      setCategories((catRes.data || []) as Category[])
      setAccountId(initialAccountId || accs[0]?.id || '')
      setLoadingData(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [open, household, initialAccountId])

  // Reset the form each time the dialog opens for a different action.
  useEffect(() => {
    if (!open) return
    setToAccountId('')
    setAmount('')
    setDate(new Date().toISOString().split('T')[0])
    setCategoryId('')
    setDescription('')
    setNotes('')
    setSuggestedId(null)
    setError(null)
    setSaved(null)
  }, [open, kind])

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.type === categoryKind),
    [categories, categoryKind]
  )

  const account = accounts.find((a) => a.id === accountId) || null
  const toAccount = accounts.find((a) => a.id === toAccountId) || null
  const currency = account?.currency || household?.currency || DEFAULT_CURRENCY

  // Transfer destinations must share the source currency until FX exists.
  const transferTargets = useMemo(() => {
    if (!account) return accounts
    return accounts.filter((a) => canTransferBetween(account.currency, a.currency))
  }, [accounts, account])

  // Suggest a category from what the user typed; they can always override it.
  useEffect(() => {
    if (kind === 'transfer') return
    const suggestion = suggestCategory(description, visibleCategories, categoryKind)
    if (suggestion && !categoryId) {
      setSuggestedId(suggestion.id)
      setCategoryId(suggestion.id)
    } else if (!suggestion) {
      setSuggestedId(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, kind, visibleCategories.length])

  const amountValue = Number(amount)

  const handleSave = async () => {
    if (!household || !user) return
    setError(null)

    const validationError = validateTransaction({
      kind,
      amount: amountValue,
      account,
      toAccount,
    })
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    const resolvedDescription =
      description.trim() ||
      (kind === 'transfer'
        ? `Transfer to ${toAccount?.name ?? 'account'}`
        : kind === 'income'
          ? 'Income'
          : 'Expense')

    const result = await recordTransaction({
      householdId: household.id,
      userId: user.id,
      kind,
      amount: amountValue,
      date,
      accountId: account!.id,
      toAccountId: kind === 'transfer' ? toAccount!.id : null,
      categoryId: kind === 'transfer' ? null : categoryId || null,
      description: resolvedDescription,
      notes: notes.trim() || null,
    })
    setSaving(false)

    if (result.error) {
      setError(result.error)
      return
    }

    const category = visibleCategories.find((c) => c.id === categoryId)
    setSaved({
      summary:
        kind === 'transfer'
          ? `${formatCurrency(amountValue, currency)} moved from ${account!.name} to ${toAccount!.name}.`
          : `${formatCurrency(amountValue, currency)} recorded as ${kind}${
              category ? ` under ${category.name}` : ''
            } on ${date}.`,
    })
    onSaved()
    window.setTimeout(() => onClose(), 1400)
  }

  const footer = (
    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <button type="button" onClick={onClose} className="btn-secondary">
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !accountId || !amountValue || (kind === 'transfer' && !toAccountId)}
        className="btn-primary"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saving ? 'Saving…' : copy.cta}
      </button>
    </div>
  )

  return (
    <Modal open={open} title={copy.title} description={copy.description} onClose={onClose} footer={footer} size="lg">
      {saved ? (
        <div className="flex flex-col items-center py-6 text-center">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <p className="mt-3 text-sm font-medium text-text">Saved</p>
          <p className="mt-1 text-sm text-text-muted">{saved.summary}</p>
        </div>
      ) : loadingData ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-cta" />
        </div>
      ) : accounts.length === 0 ? (
        <p className="py-4 text-sm text-text-muted">
          You need at least one account before recording money. Add an account first.
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void handleSave()
          }}
        >
          {/* 1. Where the money is */}
          <div>
            <span className="label">{kind === 'income' ? 'Into account' : 'From account'}</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {accounts.map((a) => {
                const selected = a.id === accountId
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setAccountId(a.id)
                      if (!canTransferBetween(a.currency, toAccount?.currency)) setToAccountId('')
                    }}
                    aria-pressed={selected}
                    className={`flex min-h-[3rem] items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                      selected ? 'border-cta bg-cta/10 text-cta' : 'border-border bg-surface text-text hover:bg-surface-alt'
                    }`}
                  >
                    <span className="truncate font-medium">{a.name}</span>
                    <span className="shrink-0 text-xs text-text-muted">
                      {formatCurrency(a.balance, a.currency)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Transfer destination */}
          {kind === 'transfer' && (
            <div>
              <label htmlFor="td-to-account" className="label">
                To account
                {account && (
                  <span className="ml-1 font-normal text-text-muted">
                    (same currency: {account.currency || DEFAULT_CURRENCY})
                  </span>
                )}
              </label>
              {transferTargets.length <= 1 ? (
                <p className="rounded-lg bg-surface-alt p-3 text-xs text-text-muted">
                  No other account uses {account?.currency || DEFAULT_CURRENCY}. Transfers between
                  different currencies need an exchange rate and are not supported yet.
                </p>
              ) : (
                <select
                  id="td-to-account"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">Select account</option>
                  {transferTargets
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatCurrency(a.balance, a.currency)})
                      </option>
                    ))}
                </select>
              )}
            </div>
          )}

          {/* 2. Amount and date */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="td-amount" className="label">
                Amount ({getCurrency(currency).symbol})
              </label>
              <input
                id="td-amount"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-field"
                placeholder="0"
                required
              />
            </div>
            <div>
              <label htmlFor="td-date" className="label">Date</label>
              <input
                id="td-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-field"
                required
              />
            </div>
          </div>

          {/* 3. Category — never shown for transfers */}
          {kind !== 'transfer' && (
            <div>
              <span className="label">Category</span>
              {visibleCategories.length === 0 ? (
                <p className="rounded-lg bg-surface-alt p-3 text-xs text-text-muted">
                  No {categoryKind} categories yet. You can add one below.
                </p>
              ) : (
                <CategoryPicker
                  categories={visibleCategories}
                  kind={categoryKind}
                  value={categoryId}
                  onChange={(id) => {
                    setCategoryId(id)
                    setSuggestedId(null)
                  }}
                  onCreate={async (name) => {
                    if (!household) return
                    const maxOrder = visibleCategories.reduce((max, c) => Math.max(max, c.sort_order), -1)
                    const { data } = await supabase
                      .from('categories')
                      .insert({
                        household_id: household.id,
                        name,
                        type: categoryKind,
                        sort_order: maxOrder + 1,
                      })
                      .select()
                      .single()
                    if (data) {
                      setCategories((prev) => [...prev, data as Category])
                      setCategoryId((data as Category).id)
                    }
                  }}
                />
              )}
              {suggestedId && categoryId === suggestedId && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
                  <CategoryIcon
                    icon={visibleCategories.find((c) => c.id === suggestedId)?.icon}
                    name={visibleCategories.find((c) => c.id === suggestedId)?.name}
                    kind={categoryKind}
                    className="h-3.5 w-3.5"
                  />
                  Suggested from your description — change it if it is wrong.
                </p>
              )}
            </div>
          )}

          {/* 4. Description / notes */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="td-description" className="label">Description</label>
              <input
                id="td-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input-field"
                placeholder={kind === 'income' ? 'e.g. Monthly salary' : kind === 'transfer' ? 'e.g. Cash for the week' : 'e.g. Market shopping'}
              />
            </div>
            <div>
              <label htmlFor="td-notes" className="label">Notes (optional)</label>
              <input
                id="td-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input-field"
                placeholder="Anything else to remember"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  )
}
