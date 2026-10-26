import { useMemo } from 'react'
import { CalendarClock } from 'lucide-react'
import type { Debt, RepaymentFrequency } from '@/types'
import { DEFAULT_CURRENCY, currencyOptions, formatCurrency, getCurrency } from '@/lib/currency'
import { generateRepaymentSchedule, todayIso } from '@/lib/debtSchedule'

export interface DebtFormValues {
  lender_name: string
  amount: string
  date_borrowed: string
  due_date: string
  notes: string
  currency: string
  interest_rate: string
  repayment_frequency: RepaymentFrequency | ''
  /** Either an installment amount or a number of installments. */
  planMode: 'amount' | 'count'
  installment_amount: string
  num_installments: string
  first_payment_date: string
}

export const EMPTY_DEBT_FORM: DebtFormValues = {
  lender_name: '',
  amount: '',
  date_borrowed: todayIso(),
  due_date: '',
  notes: '',
  currency: DEFAULT_CURRENCY,
  interest_rate: '',
  repayment_frequency: '',
  planMode: 'amount',
  installment_amount: '',
  num_installments: '',
  first_payment_date: todayIso(),
}

export function debtFormFrom(debt: Debt): DebtFormValues {
  return {
    ...EMPTY_DEBT_FORM,
    lender_name: debt.lender_name,
    amount: String(debt.amount),
    date_borrowed: debt.date_borrowed,
    due_date: debt.due_date || '',
    notes: debt.notes || '',
    currency: debt.currency || DEFAULT_CURRENCY,
    interest_rate: debt.interest_rate != null ? String(debt.interest_rate) : '',
    repayment_frequency: debt.repayment_frequency ?? '',
    planMode: debt.installment_amount ? 'amount' : 'count',
    installment_amount: debt.installment_amount != null ? String(debt.installment_amount) : '',
    num_installments: debt.num_installments != null ? String(debt.num_installments) : '',
    first_payment_date: debt.first_payment_date || todayIso(),
  }
}

interface DebtFormProps {
  values: DebtFormValues
  onChange: (values: DebtFormValues) => void
}

const FREQUENCIES: { value: RepaymentFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
]

/**
 * Debt creation / edit form. Every field past "who" and "how much" is optional,
 * and the generated schedule is shown before saving so it can be adjusted.
 */
export function DebtForm({ values, onChange }: DebtFormProps) {
  const set = <K extends keyof DebtFormValues>(key: K, value: DebtFormValues[K]) =>
    onChange({ ...values, [key]: value })

  const amount = Number(values.amount) || 0

  const schedule = useMemo(() => {
    if (!values.repayment_frequency) return []
    const planAmount = values.planMode === 'amount' ? Number(values.installment_amount) : null
    const planCount = values.planMode === 'count' ? Number(values.num_installments) : null
    if (!planAmount && !planCount) return []
    return generateRepaymentSchedule({
      principal: amount,
      interestRatePct: values.interest_rate ? Number(values.interest_rate) : null,
      frequency: values.repayment_frequency,
      installmentAmount: planAmount && planAmount > 0 ? planAmount : null,
      numInstallments: planCount && planCount > 0 ? planCount : null,
      firstPaymentDate: values.first_payment_date || todayIso(),
    })
  }, [
    amount,
    values.repayment_frequency,
    values.planMode,
    values.installment_amount,
    values.num_installments,
    values.interest_rate,
    values.first_payment_date,
  ])

  const scheduleTotal = schedule.reduce((sum, i) => sum + i.amount, 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="df-lender" className="label">Debt name / who you owe</label>
          <input
            id="df-lender"
            type="text"
            value={values.lender_name}
            onChange={(e) => set('lender_name', e.target.value)}
            className="input-field"
            placeholder="e.g. Mama, John, Office thrift"
            required
          />
        </div>
        <div>
          <label htmlFor="df-amount" className="label">
            Original amount ({getCurrency(values.currency).symbol})
          </label>
          <input
            id="df-amount"
            type="number"
            inputMode="decimal"
            value={values.amount}
            onChange={(e) => set('amount', e.target.value)}
            className="input-field"
            placeholder="0"
            required
          />
        </div>
        <div>
          <label htmlFor="df-currency" className="label">Currency</label>
          <select
            id="df-currency"
            value={values.currency}
            onChange={(e) => set('currency', e.target.value)}
            className="input-field"
          >
            {currencyOptions().map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="df-borrowed" className="label">Start date</label>
          <input
            id="df-borrowed"
            type="date"
            value={values.date_borrowed}
            onChange={(e) => set('date_borrowed', e.target.value)}
            className="input-field"
            required
          />
        </div>
        <div>
          <label htmlFor="df-due" className="label">Due date (optional)</label>
          <input
            id="df-due"
            type="date"
            value={values.due_date}
            onChange={(e) => set('due_date', e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label htmlFor="df-rate" className="label">Interest rate % per year (optional)</label>
          <input
            id="df-rate"
            type="number"
            step="0.001"
            min="0"
            max="100"
            value={values.interest_rate}
            onChange={(e) => set('interest_rate', e.target.value)}
            className="input-field"
            placeholder="Leave blank if there is no interest"
          />
          <p className="mt-1 text-xs text-text-muted">
            Simple interest on the outstanding balance. Blank means no interest.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-cta" />
          <p className="text-sm font-medium text-text">Repayment plan (optional)</p>
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Leave this blank to repay whenever you like — you can still add payments later.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="df-freq" className="label">Frequency</label>
            <select
              id="df-freq"
              value={values.repayment_frequency}
              onChange={(e) => set('repayment_frequency', e.target.value as RepaymentFrequency | '')}
              className="input-field"
            >
              <option value="">No schedule</option>
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="df-first" className="label">First payment date</label>
            <input
              id="df-first"
              type="date"
              value={values.first_payment_date}
              onChange={(e) => set('first_payment_date', e.target.value)}
              className="input-field"
              disabled={!values.repayment_frequency}
            />
          </div>
          <div>
            <span className="label">Plan by</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => set('planMode', 'amount')}
                aria-pressed={values.planMode === 'amount'}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium cursor-pointer ${
                  values.planMode === 'amount' ? 'bg-cta text-white' : 'bg-surface-alt text-text-muted'
                }`}
              >
                Installment amount
              </button>
              <button
                type="button"
                onClick={() => set('planMode', 'count')}
                aria-pressed={values.planMode === 'count'}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium cursor-pointer ${
                  values.planMode === 'count' ? 'bg-cta text-white' : 'bg-surface-alt text-text-muted'
                }`}
              >
                Number of payments
              </button>
            </div>
          </div>
        </div>

        {values.repayment_frequency && (
          <div className="mt-3">
            {values.planMode === 'amount' ? (
              <div>
                <label htmlFor="df-inst-amount" className="label">
                  Planned installment ({getCurrency(values.currency).symbol})
                </label>
                <input
                  id="df-inst-amount"
                  type="number"
                  inputMode="decimal"
                  value={values.installment_amount}
                  onChange={(e) => set('installment_amount', e.target.value)}
                  className="input-field"
                  placeholder="0"
                />
              </div>
            ) : (
              <div>
                <label htmlFor="df-inst-count" className="label">Number of installments</label>
                <input
                  id="df-inst-count"
                  type="number"
                  inputMode="numeric"
                  value={values.num_installments}
                  onChange={(e) => set('num_installments', e.target.value)}
                  className="input-field"
                  placeholder="e.g. 6"
                />
              </div>
            )}
          </div>
        )}

        {schedule.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-text-muted">
              Proposed schedule — {schedule.length} payments, total{' '}
              {formatCurrency(scheduleTotal, values.currency)}
              {values.interest_rate && Number(values.interest_rate) > 0 && (
                <> (includes {formatCurrency(scheduleTotal - amount, values.currency)} interest)</>
              )}
            </p>
            <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-alt">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold text-text-muted">#</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-text-muted">Due</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-text-muted">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((row) => (
                    <tr key={row.number} className="border-t border-border">
                      <td className="px-2 py-1.5 text-text-muted">{row.number}</td>
                      <td className="px-2 py-1.5 text-text">{row.dueDate}</td>
                      <td className="px-2 py-1.5 text-right font-medium text-text">
                        {formatCurrency(row.amount, values.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Review before saving — you can edit the plan later. The final payment is capped at what
              is still outstanding.
            </p>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="df-notes" className="label">Notes (optional)</label>
        <input
          id="df-notes"
          type="text"
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
          className="input-field"
          placeholder="e.g. For school fees"
        />
      </div>
    </div>
  )
}

export interface ParsedDebtForm {
  lender_name: string
  amount: number
  date_borrowed: string
  due_date: string | null
  notes: string | null
  currency: string
  interest_rate: number | null
  repayment_frequency: RepaymentFrequency | null
  installment_amount: number | null
  num_installments: number | null
  first_payment_date: string | null
  schedule: ReturnType<typeof generateRepaymentSchedule>
}

export function parseDebtForm(values: DebtFormValues): ParsedDebtForm {
  const amount = Math.round(Number(values.amount) || 0)
  const rate = values.interest_rate ? Number(values.interest_rate) : null
  const frequency = values.repayment_frequency || null
  const planAmount = values.planMode === 'amount' ? Number(values.installment_amount) : null
  const planCount = values.planMode === 'count' ? Number(values.num_installments) : null

  const schedule =
    frequency && (planAmount || planCount)
      ? generateRepaymentSchedule({
          principal: amount,
          interestRatePct: rate,
          frequency,
          installmentAmount: planAmount && planAmount > 0 ? planAmount : null,
          numInstallments: planCount && planCount > 0 ? planCount : null,
          firstPaymentDate: values.first_payment_date || todayIso(),
        })
      : []

  return {
    lender_name: values.lender_name.trim(),
    amount,
    date_borrowed: values.date_borrowed,
    due_date: values.due_date || null,
    notes: values.notes.trim() || null,
    currency: values.currency,
    interest_rate: rate != null && !Number.isNaN(rate) && rate > 0 ? rate : null,
    repayment_frequency: frequency,
    installment_amount: values.planMode === 'amount' && planAmount && planAmount > 0 ? planAmount : null,
    num_installments: values.planMode === 'count' && planCount && planCount > 0 ? planCount : null,
    first_payment_date: frequency ? values.first_payment_date || null : null,
    schedule,
  }
}
