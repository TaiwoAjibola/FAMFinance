import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { Layout } from '@/components/layout/Layout'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { DebtDetailModal } from '@/components/debts/DebtDetailModal'
import {
  DebtForm,
  EMPTY_DEBT_FORM,
  debtFormFrom,
  parseDebtForm,
  type DebtFormValues,
} from '@/components/debts/DebtForm'
import { DEFAULT_CURRENCY, formatCurrency, groupByCurrency } from '@/lib/currency'
import { summariseDebt, todayIso, totalRepaid } from '@/lib/debtSchedule'
import { replacePendingInstallments, resyncFromDatabase } from '@/lib/debtSync'
import { applyTransactionEffect } from '@/lib/transactions'
import { Plus, HandCoins, Check, CalendarClock, Pencil, Trash2 } from 'lucide-react'
import type { Account, Debt, DebtRepayment } from '@/types'

export function DebtsPage() {
  const { user } = useAuth()
  const { household } = useHousehold()
  const [searchParams, setSearchParams] = useSearchParams()

  const [debts, setDebts] = useState<Debt[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [repayments, setRepayments] = useState<DebtRepayment[]>([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [formValues, setFormValues] = useState<DebtFormValues>(EMPTY_DEBT_FORM)
  const [detailDebtId, setDetailDebtId] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!household) return
    setLoading(true)

    const [debtRes, accountRes, repayRes] = await Promise.all([
      supabase.from('debts').select('*').eq('household_id', household.id).order ('date_borrowed', { ascending: false }),
      supabase.from('accounts').select('*').eq('household_id', household.id).eq('is_active', true),
      supabase
        .from('debt_repayments')
        .select('*, account:accounts(id, name, currency)')
        .order('installment_number', { ascending: true }),
    ])

    const rows = (debtRes.data || []) as Debt[]
    setDebts(rows)
    setAccounts((accountRes.data || []) as Account[])

    // Scope repayments to this household's debts — RLS already does this, this is
    // just defence in depth for the client-side grouping below.
    const debtIds = new Set(rows.map((d) => d.id))
    setRepayments(((repayRes.data || []) as DebtRepayment[]).filter((r) => debtIds.has(r.debt_id)))
    setLoading(false)
  }, [household])

  useEffect(() => {
    if (!household) return
    void fetchData()
  }, [household, fetchData])

  // Deep link from the quick actions: /debts?new=1 opens the create form.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return
    openAddForm()
    searchParams.delete('new')
    setSearchParams(searchParams, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const summaries = useMemo(() => {
    const map = new Map<string, ReturnType<typeof summariseDebt>>()
    for (const debt of debts) {
      map.set(debt.id, summariseDebt(debt, repayments.filter((r) => r.debt_id === debt.id)))
    }
    return map
  }, [debts, repayments])

  const outstandingTotals = useMemo(
    () =>
      groupByCurrency(debts, (d) => ({ amount: summaries.get(d.id)?.outstanding ?? 0, currency: d.currency })),
    [debts, summaries]
  )
  const repaidTotals = useMemo(
    () =>
      groupByCurrency(debts, (d) => ({
        amount: totalRepaid(repayments.filter((r) => r.debt_id === d.id)),
        currency: d.currency,
      })),
    [debts, repayments]
  )

  const detailDebt = detailDebtId ? debts.find((d) => d.id === detailDebtId) ?? null : null

  function openAddForm() {
    setFormValues({
      ...EMPTY_DEBT_FORM,
      date_borrowed: todayIso(),
      first_payment_date: todayIso(),
      currency: household?.currency || DEFAULT_CURRENCY,
    })
    setEditingDebt(null)
    setError(null)
    setDetailDebtId(null)
    setShowForm(true)
  }

  function openEditForm(debt: Debt) {
    setFormValues(debtFormFrom(debt))
    setEditingDebt(debt)
    setError(null)
    setDetailDebtId(null)
    setShowForm(true)
  }

  async function handleSubmit() {
    if (!household || !user) return
    const parsed = parseDebtForm(formValues)

    if (!parsed.lender_name) {
      setError('Give the debt a name or say who you owe.')
      return
    }
    if (parsed.amount <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }

    setSaving(true)
    setError(null)

    const fields = {
      lender_name: parsed.lender_name,
      amount: parsed.amount,
      currency: parsed.currency,
      date_borrowed: parsed.date_borrowed,
      due_date: parsed.due_date,
      notes: parsed.notes,
      interest_rate: parsed.interest_rate,
      repayment_frequency: parsed.repayment_frequency,
      installment_amount: parsed.installment_amount,
      num_installments: parsed.num_installments,
      first_payment_date: parsed.first_payment_date,
    }

    if (editingDebt) {
      const { error: updateError } = await supabase.from('debts').update(fields).eq('id', editingDebt.id)
      if (updateError) {
        setSaving(false)
        setError(updateError.message)
        return
      }

      // Only the forward-looking plan is replaced; paid history is preserved.
      await replacePendingInstallments(editingDebt.id, user.id, parsed.schedule)
      await resyncFromDatabase({ ...editingDebt, ...fields })
    } else {
      const { data: created, error: insertError } = await supabase
        .from('debts')
        .insert({ ...fields, household_id: household.id, created_by: user.id })
        .select()
        .single()

      if (insertError || !created) {
        setSaving(false)
        setError(insertError?.message ?? 'Could not save the debt.')
        return
      }

      if (parsed.schedule.length > 0) {
        await replacePendingInstallments(created.id, user.id, parsed.schedule)
      }
    }

    setSaving(false)
    setShowForm(false)
    setEditingDebt(null)
    await fetchData()
  }

  /**
   * Deletes a debt and unwinds everything it created: each repayment's linked
   * transaction is removed and its balance effect reversed, so no orphan expense
   * is left behind.
   */
  async function handleDelete(debt: Debt) {
    if (!confirm(`Delete "${debt.lender_name}" and all of its repayment history?`)) return

    const { data: rows } = await supabase
      .from('debt_repayments')
      .select('id, transaction_id')
      .eq('debt_id', debt.id)

    for (const row of rows || []) {
      if (!row.transaction_id) continue
      const { data: tx } = await supabase
        .from('transactions')
        .select('id, type, amount, account_id, to_account_id')
        .eq('id', row.transaction_id)
        .single()
      if (tx) {
        await supabase.from('transactions').delete().eq('id', tx.id)
        await applyTransactionEffect(
          tx.type as 'expense' | 'income' | 'transfer',
          tx.amount,
          tx.account_id,
          -1,
          tx.to_account_id
        )
      }
    }

    const { error: deleteError } = await supabase.from('debts').delete().eq('id', debt.id)
    if (deleteError) {
      alert('Error deleting debt: ' + deleteError.message)
      return
    }
    if (detailDebtId === debt.id) setDetailDebtId(null)
    await fetchData()
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Debts I Owe</h1>
            <p className="text-sm text-text-muted">
              Track what you borrowed and repay it in installments
            </p>
          </div>
          <button onClick={openAddForm} className="btn-primary">
            <Plus className="h-4 w-4" />
            Add debt
          </button>
        </div>

        {/* Totals — kept per currency, never summed across currencies */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="card">
            <div className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-danger" />
              <p className="text-sm font-semibold text-text">Total outstanding</p>
            </div>
            {outstandingTotals.length === 0 ? (
              <p className="mt-2 text-2xl font-bold text-text">
                {formatCurrency(0, household?.currency)}
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                {outstandingTotals.map((t) => (
                  <p key={t.currency} className="text-2xl font-bold text-danger">
                    {formatCurrency(t.total, t.currency)}
                    <span className="ml-1 text-xs font-medium text-text-muted">{t.currency}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="card">
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-success" />
              <p className="text-sm font-semibold text-text">Total repaid</p>
            </div>
            {repaidTotals.length === 0 ? (
              <p className="mt-2 text-2xl font-bold text-text">
                {formatCurrency(0, household?.currency)}
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                {repaidTotals.map((t) => (
                  <p key={t.currency} className="text-2xl font-bold text-success">
                    {formatCurrency(t.total, t.currency)}
                    <span className="ml-1 text-xs font-medium text-text-muted">{t.currency}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {outstandingTotals.length > 1 && (
          <p className="rounded-lg bg-warning/10 p-3 text-xs text-warning">
            You owe money in more than one currency. Totals are shown separately — FamFinance does
            not convert between currencies.
          </p>
        )}

        {/* Debt form */}
        <Modal
          open={showForm}
          title={editingDebt ? 'Edit debt' : 'Record new debt'}
          description={
            editingDebt
              ? 'Adjust the details or repayment plan. Existing payments are never duplicated.'
              : 'Only the name and amount are required — everything else is optional.'
          }
          onClose={() => {
            setShowForm(false)
            setEditingDebt(null)
          }}
          size="lg"
          footer={
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingDebt(null)
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button type="button" onClick={handleSubmit} disabled={saving} className="btn-primary">
                {saving ? 'Saving…' : editingDebt ? 'Update debt' : 'Add debt'}
              </button>
            </div>
          }
        >
          <DebtForm values={formValues} onChange={setFormValues} />
          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-danger/10 p-3 text-sm text-danger">
              {error}
            </p>
          )}
        </Modal>

        <DebtDetailModal
          open={!!detailDebt}
          debt={detailDebt}
          repayments={repayments}
          accounts={accounts}
          onClose={() => setDetailDebtId(null)}
          onChanged={() => void fetchData()}
          onEdit={openEditForm}
          onAdjustSchedule={openEditForm}
        />

        {/* Debt list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-cta border-t-transparent" />
          </div>
        ) : debts.length === 0 ? (
          <div className="card py-12 text-center">
            <HandCoins className="mx-auto h-10 w-10 text-text-light" />
            <p className="mt-3 text-sm text-text-muted">No debts recorded yet</p>
            <button onClick={openAddForm} className="btn-primary mt-4">
              <Plus className="h-4 w-4" />
              Add your first debt
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {debts.map((debt) => {
              const summary = summaries.get(debt.id)
              if (!summary) return null
              const currency = debt.currency || DEFAULT_CURRENCY
              const isFullyPaid = debt.status === 'fully_paid' || summary.settled
              const isCancelled = debt.status === 'cancelled'
              const isOverdue =
                debt.due_date && new Date(debt.due_date) < new Date() && !isFullyPaid && !isCancelled
              const pendingCount = repayments.filter(
                (r) => r.debt_id === debt.id && (r.status ?? 'paid') === 'pending'
              ).length

              return (
                <div
                  key={debt.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setDetailDebtId(debt.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setDetailDebtId(debt.id)
                    }
                  }}
                  className="card-hover group cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                          isFullyPaid
                            ? 'bg-success/10'
                            : isCancelled
                              ? 'bg-text-light/10'
                              : isOverdue
                                ? 'bg-danger/10'
                                : 'bg-warning/10'
                        }`}
                      >
                        <HandCoins
                          className={`h-5 w-5 ${
                            isFullyPaid
                              ? 'text-success'
                              : isCancelled
                                ? 'text-text-light'
                                : isOverdue
                                  ? 'text-danger'
                                  : 'text-warning'
                          }`}
                        />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-text">{debt.lender_name}</p>
                          {isFullyPaid && <span className="badge-success">Fully paid</span>}
                          {!isFullyPaid && !isCancelled && summary.repaid > 0 && (
                            <span className="badge-warning">Partially paid</span>
                          )}
                          {isCancelled && <span className="badge-neutral">Cancelled</span>}
                          {isOverdue && <span className="badge-danger">Overdue</span>}
                          {pendingCount > 0 && !isFullyPaid && (
                            <span className="badge-neutral">
                              <CalendarClock className="h-3.5 w-3.5" />
                              {pendingCount} scheduled
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-muted">
                          Borrowed {formatCurrency(summary.original, currency)} on {debt.date_borrowed}
                          {debt.due_date && ` • Due ${debt.due_date}`}
                          {summary.nextInstallment && summary.outstanding > 0 && (
                            <> • Next {formatCurrency(summary.nextInstallment.amount, currency)}</>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${isFullyPaid ? 'text-success' : 'text-text'}`}>
                          {formatCurrency(summary.outstanding, currency)}
                        </p>
                        <p className="text-xs text-text-muted">{currency} outstanding</p>
                      </div>
                      <div className="row-actions shrink-0" onClick={(e) => e.stopPropagation()}>
                        <IconButton
                          icon={Pencil}
                          label={`Edit ${debt.lender_name}`}
                          onClick={() => openEditForm(debt)}
                        />
                        <IconButton
                          icon={Trash2}
                          label={`Delete ${debt.lender_name}`}
                          variant="danger"
                          onClick={() => void handleDelete(debt)}
                        />
                      </div>
                    </div>
                  </div>

                  {!isCancelled && summary.payoff > 0 && (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-xs text-text-muted">
                        <span>
                          {formatCurrency(summary.repaid, currency)} of{' '}
                          {formatCurrency(summary.payoff, currency)} repaid
                        </span>
                        <span>{Math.round(summary.percentRepaid)}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-alt">
                        <div
                          className={`h-full rounded-full transition-all ${
                            summary.settled ? 'bg-success' : 'bg-cta'
                          }`}
                          style={{ width: `${Math.min(summary.percentRepaid, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <DebtDetailModal
        open={!!detailDebt}
        debt={detailDebt}
        repayments={repayments}
        accounts={accounts}
        onClose={() => setDetailDebtId(null)}
        onChanged={() => void fetchData()}
        onEdit={openEditForm}
        onAdjustSchedule={openEditForm}
      />
    </Layout>
  )
}
