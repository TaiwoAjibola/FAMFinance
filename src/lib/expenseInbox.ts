import { supabase } from '@/lib/supabase'
import { applyTransactionEffect } from '@/lib/transactions'
import type { Account, Category } from '@/types'

export type ExpenseCaptureSource = 'quick_entry' | 'daily_summary' | 'voice' | 'import' | 'manual'
export type ExpenseCaptureStatus = 'needs_review' | 'ready' | 'dismissed' | 'imported'

export interface ExpenseCapture {
  id: string
  household_id: string
  account_id: string | null
  category_id: string | null
  amount: number
  currency: string
  description: string
  date: string
  notes: string | null
  source: ExpenseCaptureSource
  status: ExpenseCaptureStatus
  raw_input: string | null
  import_batch_id: string | null
  imported_transaction_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  account?: Pick<Account, 'id' | 'name' | 'currency'> | null
  category?: Pick<Category, 'id' | 'name' | 'icon'> | null
}

export interface CaptureInput {
  householdId: string
  userId: string
  accountId: string | null
  categoryId?: string | null
  amount: number
  currency: string
  description: string
  date: string
  notes?: string | null
  source?: ExpenseCaptureSource
  status?: ExpenseCaptureStatus
  rawInput?: string | null
  importBatchId?: string | null
}

export async function listExpenseCaptures(householdId: string): Promise<ExpenseCapture[]> {
  const { data, error } = await supabase
    .from('expense_captures')
    .select('*, account:accounts(id,name,currency), category:categories(id,name,icon)')
    .eq('household_id', householdId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []) as ExpenseCapture[]
}

export async function createExpenseCaptures(inputs: CaptureInput[]): Promise<string | null> {
  if (inputs.length === 0) return null
  const rows = inputs.map((i) => ({
    household_id: i.householdId,
    account_id: i.accountId,
    category_id: i.categoryId ?? null,
    amount: i.amount,
    currency: i.currency,
    description: i.description,
    date: i.date,
    notes: i.notes ?? null,
    source: i.source ?? 'quick_entry',
    status: i.status ?? 'needs_review',
    raw_input: i.rawInput ?? null,
    import_batch_id: i.importBatchId ?? null,
    created_by: i.userId,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await supabase.from('expense_captures').insert(rows)
  return error ? error.message : null
}

export async function updateExpenseCapture(
  id: string,
  patch: Partial<Pick<ExpenseCapture, 'account_id' | 'category_id' | 'amount' | 'currency' | 'description' | 'date' | 'notes' | 'status'>>
): Promise<string | null> {
  const { error } = await supabase
    .from('expense_captures')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  return error ? error.message : null
}

export async function dismissExpenseCapture(id: string): Promise<string | null> {
  return updateExpenseCapture(id, { status: 'dismissed' })
}

/**
 * Commits a reviewed capture as a real expense transaction.
 * Balance changes happen only here (never at capture time). The capture is
 * marked imported and linked to the created transaction.
 */
export async function commitExpenseCapture(
  capture: ExpenseCapture,
  userId: string
): Promise<{ transactionId: string | null; error: string | null }> {
  if (capture.status === 'imported') return { transactionId: capture.imported_transaction_id, error: null }
  if (capture.status === 'dismissed') return { transactionId: null, error: 'Dismissed captures cannot be committed.' }
  if (!capture.account_id) return { transactionId: null, error: 'Choose an account before confirming this expense.' }
  if (!Number.isFinite(capture.amount) || capture.amount <= 0) return { transactionId: null, error: 'Amount must be greater than zero.' }
  if (!capture.description?.trim()) return { transactionId: null, error: 'Description is required.' }

  // Idempotency guard: if another tab/request already committed it, don't post again.
  const { data: fresh, error: freshErr } = await supabase
    .from('expense_captures')
    .select('status, imported_transaction_id')
    .eq('id', capture.id)
    .single()
  if (freshErr) return { transactionId: null, error: freshErr.message }
  if (fresh?.status === 'imported') {
    return { transactionId: (fresh.imported_transaction_id as string | null) ?? null, error: null }
  }
  if (fresh?.status === 'dismissed') {
    return { transactionId: null, error: 'This capture was dismissed and cannot be committed.' }
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      household_id: capture.household_id,
      account_id: capture.account_id,
      category_id: capture.category_id ?? null,
      type: 'expense',
      amount: capture.amount,
      description: capture.description.trim(),
      date: capture.date,
      notes: capture.notes ?? null,
      status: 'received',
      created_by: userId,
    })
    .select('id')
    .single()

  if (error || !data) return { transactionId: null, error: error?.message ?? 'Could not create transaction.' }

  await applyTransactionEffect('expense', capture.amount, capture.account_id, 1, null)

  const { error: linkErr } = await supabase
    .from('expense_captures')
    .update({
      status: 'imported',
      imported_transaction_id: data.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', capture.id)

  if (linkErr) {
    // Transaction + balance were applied; surface the link failure so it can be retried/fixed.
    return { transactionId: data.id, error: `Expense saved, but inbox item was not marked imported: ${linkErr.message}` }
  }

  return { transactionId: data.id, error: null }
}
