import { supabase } from '@/lib/supabase'
import { payoffTotal } from '@/lib/debtSchedule'
import type { Debt, DebtRepayment } from '@/types'

type RepaymentRow = Pick<DebtRepayment, 'amount' | 'status'>

/**
 * Writes the derived totals back onto a debt after repayments change.
 *
 * `amount_repaid` is recomputed from the repayment rows rather than incremented,
 * which is what stops an edited, reverted or partially-paid installment from
 * being counted twice. A debt settles once every scheduled amount — including
 * interest — has been repaid.
 */
export async function syncDebtTotals(debt: Debt, rows: RepaymentRow[]) {
  const repaid = rows
    .filter((r) => (r.status ?? 'paid') === 'paid')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)

  const payoff = payoffTotal(debt)
  // Tolerate 1 unit of schedule rounding so a fully-cleared debt always settles.
  const settled = repaid >= payoff - 1

  await supabase
    .from('debts')
    .update({
      amount_repaid: Math.min(repaid, payoff),
      status: settled ? 'fully_paid' : 'active',
    })
    .eq('id', debt.id)
}

/** Re-sequences installment numbers: money already paid first, then what is due. */
export async function renumberInstallments(debtId: string) {
  const { data } = await supabase
    .from('debt_repayments')
    .select('id, date, due_date, status')
    .eq('debt_id', debtId)

  const rows = (data || []) as Pick<DebtRepayment, 'id' | 'date' | 'due_date' | 'status'>[]
  if (rows.length === 0) return

  const paid = rows
    .filter((r) => (r.status ?? 'paid') === 'paid')
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const pending = rows
    .filter((r) => (r.status ?? 'paid') === 'pending')
    .sort((a, b) => ((a.due_date ?? '') < (b.due_date ?? '') ? -1 : 1))

  const ordered = [...paid, ...pending]
  for (const [index, row] of ordered.entries()) {
    await supabase
      .from('debt_repayments')
      .update({ installment_number: index + 1 })
      .eq('id', row.id)
  }
}

/**
 * Replaces the *planned* installments for a debt.
 *
 * Rows representing money that already moved (`status = 'paid'`) are never
 * touched — only the forward-looking plan is regenerated, so repayment history
 * survives a schedule edit and nothing is duplicated.
 */
export async function replacePendingInstallments(
  debtId: string,
  userId: string,
  schedule: { number: number; dueDate: string; amount: number }[]
) {
  await supabase.from('debt_repayments').delete().eq('debt_id', debtId).eq('status', 'pending')

  if (schedule.length > 0) {
    await supabase.from('debt_repayments').insert(
      schedule.map((row) => ({
        debt_id: debtId,
        installment_number: row.number,
        due_date: row.dueDate,
        // `date` is NOT NULL; for a planned installment the due date is the
        // best available value until the payment actually happens.
        date: row.dueDate,
        amount: row.amount,
        status: 'pending',
        created_by: userId,
      }))
    )
  }

  await renumberInstallments(debtId)
}

/** Recomputes and persists totals straight from the rows in the database. */
export async function resyncFromDatabase(debt: Debt) {
  const { data } = await supabase
    .from('debt_repayments')
    .select('amount, status')
    .eq('debt_id', debt.id)

  await syncDebtTotals(debt, (data || []) as RepaymentRow[])
}
