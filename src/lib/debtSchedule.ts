import { addMonths, addWeeks, isValid, parseISO } from 'date-fns'
import type { Debt, DebtRepayment, RepaymentFrequency } from '@/types'

/**
 * Debt installment maths.
 *
 * Interest model (documented because there was none before, and the product must
 * never assume every debt accrues interest):
 *   - `interest_rate` is an ANNUAL percentage rate.
 *   - When null, no interest is charged and payoff == the original amount.
 *   - When set, SIMPLE interest is charged per period on the outstanding
 *     balance: `interest = outstanding * (annualRate / 100) / periodsPerYear`.
 *   - Interest is never compounded.
 *
 * Everything here is pure so it can be unit tested and reused by the UI.
 */

export interface ScheduleInstallment {
  number: number
  dueDate: string
  /** Total due for the period (principal + interest). */
  amount: number
  principal: number
  interest: number
}

export interface GenerateScheduleInput {
  principal: number
  interestRatePct?: number | null
  frequency: RepaymentFrequency
  installmentAmount?: number | null
  numInstallments?: number | null
  firstPaymentDate: string
}

const MAX_INSTALLMENTS = 600

function periodsPerYear(frequency: RepaymentFrequency): number {
  switch (frequency) {
    case 'weekly':
      return 52
    case 'biweekly':
      return 26
    case 'monthly':
    default:
      return 12
  }
}

function stepDate(iso: string, frequency: RepaymentFrequency, steps: number): string {
  const base = parseISO(iso)
  if (!isValid(base)) return iso
  const stepped =
    frequency === 'monthly'
      ? addMonths(base, steps)
      : addWeeks(base, frequency === 'biweekly' ? steps * 2 : steps)
  return stepped.toISOString().split('T')[0]
}

export function todayIso(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Builds a proposed repayment schedule. Callers show this to the user for
 * review before anything is written.
 *
 * The final installment is always clamped to whatever is still outstanding, so
 * a planned installment can never overshoot the debt.
 */
export function generateRepaymentSchedule(input: GenerateScheduleInput): ScheduleInstallment[] {
  const {
    principal,
    interestRatePct,
    frequency,
    installmentAmount,
    numInstallments,
    firstPaymentDate,
  } = input

  if (!Number.isFinite(principal) || principal <= 0) return []

  const periods = periodsPerYear(frequency)
  const ratePerPeriod = interestRatePct && interestRatePct > 0 ? interestRatePct / 100 / periods : 0

  const installments: ScheduleInstallment[] = []
  let outstanding = Math.round(principal)

  if (installmentAmount && installmentAmount > 0) {
    const planned = Math.round(installmentAmount)
    while (outstanding > 0 && installments.length < MAX_INSTALLMENTS) {
      const interest = Math.round(outstanding * ratePerPeriod)
      const totalDue = outstanding + interest
      const payment = Math.min(planned, totalDue)
      const principalPart = Math.max(0, Math.min(payment - interest, outstanding))
      installments.push({
        number: installments.length + 1,
        dueDate: stepDate(firstPaymentDate, frequency, installments.length),
        amount: payment,
        principal: principalPart,
        interest,
      })
      outstanding -= principalPart
      if (payment <= 0) break
    }
    return installments
  }

  const count = numInstallments && numInstallments > 0 ? Math.min(Math.round(numInstallments), MAX_INSTALLMENTS) : 1

  if (ratePerPeriod === 0) {
    // Split the principal evenly, pushing the rounding remainder to the first
    // installments so the schedule always sums back to the original amount.
    const base = Math.floor(outstanding / count)
    let remainder = outstanding - base * count
    for (let i = 0; i < count; i += 1) {
      const extra = remainder > 0 ? 1 : 0
      remainder -= extra
      const amount = base + extra
      installments.push({
        number: i + 1,
        dueDate: stepDate(firstPaymentDate, frequency, i),
        amount,
        principal: amount,
        interest: 0,
      })
    }
    return installments
  }

  // Interest-bearing, fixed number of periods: recompute the per-period payment
  // from what is actually left so the last payment clears the balance exactly.
  let remainingPeriods = count
  let index = 0
  while (outstanding > 0 && installments.length < MAX_INSTALLMENTS) {
    const interest = Math.round(outstanding * ratePerPeriod)
    const totalDue = outstanding + interest
    const payment = Math.ceil(totalDue / remainingPeriods)
    const principalPart = Math.max(0, Math.min(payment - interest, outstanding))
    installments.push({
      number: index + 1,
      dueDate: stepDate(firstPaymentDate, frequency, index),
      amount: payment,
      principal: principalPart,
      interest,
    })
    outstanding -= principalPart
    remainingPeriods = Math.max(1, remainingPeriods - 1)
    index += 1
    if (payment <= 0) break
  }
  return installments
}

/** Total that must be repaid to clear the debt, including scheduled interest. */
export function payoffTotal(debt: Debt): number {
  if (!debt.interest_rate || debt.interest_rate <= 0) return debt.amount
  if (!debt.repayment_frequency || !debt.first_payment_date) return debt.amount
  const schedule = generateRepaymentSchedule({
    principal: debt.amount,
    interestRatePct: debt.interest_rate,
    frequency: debt.repayment_frequency,
    installmentAmount: debt.installment_amount,
    numInstallments: debt.num_installments,
    firstPaymentDate: debt.first_payment_date,
  })
  if (schedule.length === 0) return debt.amount
  return schedule.reduce((sum, i) => sum + i.amount, 0)
}

export function totalRepaid(repayments: DebtRepayment[]): number {
  // Only completed installments count; pending ones are a plan, not money moved.
  return repayments
    .filter((r) => (r.status ?? 'paid') === 'paid')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
}

export interface DebtSummary {
  original: number
  payoff: number
  repaid: number
  outstanding: number
  accruedInterest: number
  percentRepaid: number
  settled: boolean
  nextInstallment: { dueDate: string; amount: number } | null
}

export function summariseDebt(debt: Debt, repayments: DebtRepayment[]): DebtSummary {
  const payoff = payoffTotal(debt)
  const repaid = totalRepaid(repayments)
  const outstanding = Math.max(0, payoff - repaid)
  const today = todayIso()

  const upcoming = repayments
    .filter((r) => (r.status ?? 'paid') === 'pending' && !!r.due_date)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
  const scheduledNext = upcoming[0]

  let nextInstallment: { dueDate: string; amount: number } | null = scheduledNext
    ? { dueDate: scheduledNext.due_date as string, amount: Number(scheduledNext.amount) || 0 }
    : null

  // No pending rows yet (e.g. schedule not saved): project the next due date.
  if (!nextInstallment && outstanding > 0 && debt.repayment_frequency && debt.first_payment_date) {
    const schedule = generateRepaymentSchedule({
      principal: debt.amount,
      interestRatePct: debt.interest_rate,
      frequency: debt.repayment_frequency,
      installmentAmount: debt.installment_amount,
      numInstallments: debt.num_installments,
      firstPaymentDate: debt.first_payment_date,
    })
    const paidCount = repayments.filter((r) => (r.status ?? 'paid') === 'paid').length
    const next = schedule[paidCount]
    if (next) nextInstallment = { dueDate: next.dueDate, amount: next.amount }
  }

  return {
    original: debt.amount,
    payoff,
    repaid,
    outstanding,
    accruedInterest: Math.max(0, payoff - debt.amount),
    percentRepaid: payoff > 0 ? Math.min(100, (repaid / payoff) * 100) : 0,
    settled: outstanding <= 0,
    nextInstallment:
      nextInstallment && nextInstallment.dueDate >= today ? nextInstallment : nextInstallment,
  }
}
