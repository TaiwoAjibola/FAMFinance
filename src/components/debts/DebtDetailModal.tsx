import { useMemo, useState } from 'react'
import { CalendarClock, HandCoins, History, Loader2, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { DEFAULT_CURRENCY, canTransferBetween, formatCurrency, getCurrency } from '@/lib/currency'
import { formatDate } from '@/lib/utils'
import { summariseDebt, todayIso } from '@/lib/debtSchedule'
import { recordTransaction, applyTransactionEffect } from '@/lib/transactions'
import { syncDebtTotals } from '@/lib/debtSync'
import type { Account, Debt, DebtRepayment } from '@/types'
import { Modal } from '@/components/ui/Modal'

interface DebtDetailModalProps {
  open: boolean
  debt: Debt | null
  repayments: DebtRepayment[]
  accounts: Account[]
  onClose: () => void
  onChanged: () => void
  onEdit: (debt: Debt) => void
  onAdjustSchedule: (debt: Debt) => void
}

/**
 * Per-debt detail: amounts, progress, the next installment, the full history and
 * the repayment action. Used from both desktop and mobile — the underlying Modal
 * becomes a bottom sheet on small screens.
 */
export function DebtDetailModal({
  open,
  debt,
  repayments,
  accounts,
  onClose,
  onChanged,
  onEdit,
  onAdjustSchedule,
}: DebtDetailModalProps) {
  const { user } = useAuth()
  const { household } = useHousehold()
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [date, setDate] = useState(todayIso())
  const [notes, setNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debtRepayments = useMemo(
    () =>
      repayments
        .filter((r) => r.debt_id === debt?.id)
        .slice()
        .sort((a, b) => {
          const an = a.installment_number ?? 0
          const bn = b.installment_number ?? 0
          if (an !== bn) return an - bn
          return (a.date < b.date ? -1 : 1)
        }),
    [repayments, debt]
  )

  if (!debt) return null

  const summary = summariseDebt(debt, debtRepayments)
  const currency = debt.currency || DEFAULT_CURRENCY
  const eligibleAccounts = accounts.filter((a) => canTransferBetween(a.currency, currency))

  const resetPaymentForm = () => {
    setAmount('')
    setAccountId(eligibleAccounts[0]?.id ?? '')
    setDate(todayIso())
    setNotes('')
    setError(null)
    setAdding(false)
  }

  /**
   * Records one installment: moves money out of the chosen account, writes the
   * repayment row and the linked expense exactly once, then recomputes the
   * outstanding balance from the repayment rows so nothing is double counted.
   */
  const handleAddRepayment = async () => {
    if (!household || !user) return
    const value = Math.round(Number(amount) || 0)

    if (value <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    if (value > summary.outstanding) {
      setError(
        `This debt only has ${formatCurrency(summary.outstanding, currency)} outstanding.`
      )
      return
    }
    if (!accountId) {
      setError('Choose the account paying this installment.')
      return
    }

    setSaving(true)
    setError(null)

    const result = await recordTransaction({
      householdId: household.id,
      userId: user.id,
      kind: 'expense',
      amount: value,
      date,
      accountId,
      categoryId: null,
      description: `Debt repayment to ${debt.lender_name}`,
      notes: notes.trim() || null,
    })

    if (result.error) {
      setSaving(false)
      setError(result.error)
      return
    }

    const { error: repayError } = await supabase.from('debt_repayments').insert({
      debt_id: debt.id,
      amount: value,
      date,
      account_id: accountId,
      notes: notes.trim() || null,
      transaction_id: result.transactionId,
      created_by: user.id,
      status: 'paid',
      installment_number: debtRepayments.length + 1,
      due_date: date,
    })

    if (repayError) {
      // Roll the money movement back so a repayment can never exist without its
      // transaction, or vice versa.
      if (result.transactionId) {
        await supabase.from('transactions').delete().eq('id', result.transactionId)
        await applyTransactionEffect('expense', value, accountId, -1, null)
      }
      setSaving(false)
      setError(repayError.message)
      return
    }

    await syncDebtTotals(debt, [...debtRepayments, { amount: value, status: 'paid' } as DebtRepayment])
    setSaving(false)
    resetPaymentForm()
    onChanged()
  }

  /** Reverses a repayment and puts the money back. */
  const handleRevert = async (repayment: DebtRepayment) => {
    if (!confirm(`Remove this payment of ${formatCurrency(repayment.amount, currency)}? The money returns to the account.`)) return

    if (repayment.transaction_id) {
      const { data: tx } = await supabase
        .from('transactions')
        .select('id, type, amount, account_id, to_account_id')
        .eq('id', repayment.transaction_id)
        .single()
      if (tx) {
        await supabase.from('transactions').delete().eq('id', tx.id)
        await applyTransactionEffect(
          tx.type as 'expense',
          tx.amount,
          tx.account_id,
          -1,
          tx.to_account_id
        )
      }
    }

    await supabase.from('debt_repayments').delete().eq('id', repayment.id)
    await syncDebtTotals(
      debt,
      debtRepayments.filter((r) => r.id !== repayment.id)
    )
    onChanged()
  }

  /** Marks a scheduled installment as paid (no new transaction was made yet). */
  const handlePayScheduled = async (repayment: DebtRepayment) => {
    const account = eligibleAccounts[0]
    if (!account) {
      setError(`No ${currency} account available to pay this installment from.`)
      setAdding(true)
      return
    }
    setAdding(true)
    setAmount(String(repayment.amount))
    setAccountId(account.id)
    setDate(repayment.due_date || todayIso())
    setNotes(`Installment ${repayment.installment_number ?? ''}`.trim())
  }

  return (
    <Modal
      open={open}
      title={debt.lender_name}
      description={`Debt in ${currency} · started ${formatDate(debt.date_borrowed)}`}
      onClose={onClose}
      size="lg"
    >
      <div className="space-y-4">
        {/* Amounts */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Original" value={formatCurrency(summary.original, currency)} />
          <Stat label="Repaid" value={formatCurrency(summary.repaid, currency)} tone="success" />
          <Stat label="Outstanding" value={formatCurrency(summary.outstanding, currency)} tone="danger" />
          <Stat
            label={summary.accruedInterest > 0 ? 'Interest included' : 'Interest'}
            value={formatCurrency(summary.accruedInterest, currency)}
          />
        </div>

        {summary.nextInstallment && summary.outstanding > 0 && (
          <div className="flex items-start gap-3 rounded-lg bg-cta/5 p-3">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-cta" />
            <p className="text-sm text-text">
              Next installment:{' '}
              <span className="font-medium">
                {formatCurrency(summary.nextInstallment.amount, currency)}
              </span>{' '}
              due {formatDate(summary.nextInstallment.dueDate)}
            </p>
          </div>
        )}

        {/* Progress */}
        <div>
          <div className="mb-1 flex items-center justify-between text-xs text-text-muted">
            <span>
              {formatCurrency(summary.repaid, currency)} of {formatCurrency(summary.payoff, currency)} repaid
            </span>
            <span>{Math.round(summary.percentRepaid)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-alt">
            <div
              className={`h-full transition-all ${summary.settled ? 'bg-success' : 'bg-cta'}`}
              style={{ width: `${Math.min(summary.percentRepaid, 100)}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {summary.outstanding > 0 && (
            <button type="button" onClick={() => { setAdding(true); setAmount(String(summary.nextInstallment?.amount ?? '')); setAccountId(eligibleAccounts[0]?.id ?? '') }} className="btn-primary text-sm">
              <Plus className="h-4 w-4" />
              Add Repayment
            </button>
          )}
          <button type="button" onClick={() => onAdjustSchedule(debt)} className="btn-secondary text-sm">
            <Pencil className="h-4 w-4" />
            Edit schedule
          </button>
          <button type="button" onClick={() => onEdit(debt)} className="btn-secondary text-sm">
            <Pencil className="h-4 w-4" />
            Edit debt
          </button>
        </div>

        {/* Repayment form */}
        {adding && summary.outstanding > 0 && (
          <div className="rounded-lg border border-accent/30 p-3">
            <p className="mb-3 text-sm font-medium text-text">
              Record a payment — {formatCurrency(summary.outstanding, currency)} outstanding
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="dd-amount" className="label">
                  Amount ({getCurrency(currency).symbol})
                </label>
                <input
                  id="dd-amount"
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="input-field"
                  placeholder="0"
                  max={summary.outstanding}
                />
              </div>
              <div>
                <label htmlFor="dd-account" className="label">Pay from account</label>
                <select
                  id="dd-account"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="input-field"
                >
                  <option value="">Select account</option>
                  {eligibleAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatCurrency(a.balance, a.currency)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="dd-date" className="label">Date</label>
                <input
                  id="dd-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="sm:col-span-3">
                <label htmlFor="dd-notes" className="label">Note (optional)</label>
                <input
                  id="dd-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input-field"
                  placeholder="e.g. Part payment"
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={handleAddRepayment} disabled={saving} className="btn-primary text-sm">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? 'Saving…' : 'Save repayment'}
              </button>
              <button type="button" onClick={resetPaymentForm} className="btn-secondary text-sm">
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>
        )}

        {/* Installment history */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <History className="h-4 w-4 text-text-muted" />
            <p className="text-sm font-medium text-text">Installment history</p>
          </div>
          {debtRepayments.length === 0 ? (
            <p className="rounded-lg bg-surface-alt p-3 text-xs text-text-muted">
              No payments recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {debtRepayments.map((r) => {
                const isPending = (r.status ?? 'paid') === 'pending'
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm text-text">
                        {r.installment_number ? (
                          <span className="text-text-muted">#{r.installment_number}</span>
                        ) : null}
                        <span className="font-medium">{formatCurrency(r.amount, currency)}</span>
                        {isPending && (
                          <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
                            Scheduled
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-text-muted">
                        {isPending
                          ? `Due ${r.due_date ? formatDate(r.due_date) : '—'}`
                          : `${formatDate(r.date)}${r.account?.name ? ` · from ${r.account.name}` : ''}`}
                        {r.notes ? ` · ${r.notes}` : ''}
                      </p>
                    </div>
                    <div className="row-actions shrink-0">
                      {isPending ? (
                        <button
                          type="button"
                          onClick={() => void handlePayScheduled(r)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-cta/10 px-2.5 py-1.5 text-xs font-medium text-cta hover:bg-cta/20 cursor-pointer"
                        >
                          <Wallet className="h-4 w-4" />
                          Pay
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleRevert(r)}
                          aria-label="Remove this repayment"
                          title="Remove this repayment (reverses the balance)"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-danger hover:bg-danger/10 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {summary.settled && (
          <p className="rounded-lg bg-success/10 p-3 text-sm text-success">
            This debt is fully settled.
          </p>
        )}

        {eligibleAccounts.length === 0 && summary.outstanding > 0 && (
          <p className="rounded-lg bg-warning/10 p-3 text-xs text-warning">
            No active {currency} account to pay from. Payments must come from an account in the same
            currency — cross-currency repayment is not supported yet.
          </p>
        )}

        <p className="flex items-start gap-2 text-xs text-text-muted">
          <HandCoins className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Repayments are recorded once as an expense against the paying account and linked back to
          this debt.
        </p>
      </div>
    </Modal>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' }) {
  const color = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-text'
  return (
    <div className="rounded-lg bg-surface-alt p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${color}`}>{value}</p>
    </div>
  )
}

