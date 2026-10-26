import { supabase } from '@/lib/supabase'
import { DEFAULT_CURRENCY, canTransferBetween } from '@/lib/currency'
import type { Account, Transaction } from '@/types'

export type TransactionKind = 'income' | 'expense' | 'transfer'

export interface RecordTransactionInput {
  householdId: string
  userId: string
  kind: TransactionKind
  amount: number
  date: string
  accountId: string
  toAccountId?: string | null
  categoryId?: string | null
  description: string
  notes?: string | null
  /** Links the expense back to its source record (budget item, repayment…). */
  budgetItemId?: string | null
}

export interface WriteResult {
  transactionId: string | null
  error: string | null
}

/** Mirrors the balance rules already used across the app:
 *  income → +source, expense → −source, transfer → −source and +destination. */
async function adjustBalance(
  accountId: string,
  delta: number
): Promise<void> {
  const { data } = await supabase
    .from('accounts')
    .select('balance')
    .eq('id', accountId)
    .single()
  if (!data) return
  await supabase
    .from('accounts')
    .update({ balance: data.balance + delta })
    .eq('id', accountId)
}

/**
 * Applies (dir = 1) or reverses (dir = -1) the balance effect of a transaction.
 * Shared so every entry point books money the same way.
 */
export async function applyTransactionEffect(
  kind: TransactionKind,
  amount: number,
  accountId: string,
  dir: 1 | -1,
  toAccountId?: string | null
): Promise<void> {
  if (kind === 'transfer') {
    await adjustBalance(accountId, -dir * amount)
    if (toAccountId) await adjustBalance(toAccountId, dir * amount)
    return
  }
  await adjustBalance(accountId, kind === 'income' ? dir * amount : -dir * amount)
}

/** Validates cross-currency rules before anything is written. */
export function validateTransaction(input: {
  kind: TransactionKind
  amount: number
  account?: Account | null
  toAccount?: Account | null
}): string | null {
  const { kind, amount, account, toAccount } = input

  if (!Number.isFinite(amount) || amount <= 0) return 'Enter an amount greater than zero.'
  if (!account) return 'Choose an account.'

  if (kind === 'transfer') {
    if (!toAccount) return 'Choose the account receiving the money.'
    if (toAccount.id === account.id) return 'Choose two different accounts for a transfer.'
    if (!canTransferBetween(account.currency, toAccount.currency)) {
      return `These accounts use different currencies (${account.currency || DEFAULT_CURRENCY} and ${
        toAccount.currency || DEFAULT_CURRENCY
      }). Cross-currency transfers need an exchange rate, which is not supported yet.`
    }
  }

  return null
}

/**
 * Writes a transaction and moves the account balances.
 * Only ever called from authenticated client code; row-level security scopes
 * every read and write to the caller's household.
 */
export async function recordTransaction(input: RecordTransactionInput): Promise<WriteResult> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      household_id: input.householdId,
      account_id: input.accountId,
      to_account_id: input.kind === 'transfer' ? (input.toAccountId ?? null) : null,
      category_id: input.kind === 'transfer' ? null : (input.categoryId ?? null),
      type: input.kind,
      amount: input.amount,
      description: input.description,
      date: input.date,
      notes: input.notes ?? null,
      budget_item_id: input.budgetItemId ?? null,
      status: 'received',
      created_by: input.userId,
    })
    .select('id')
    .single()

  if (error) return { transactionId: null, error: error.message }

  await applyTransactionEffect(
    input.kind,
    input.amount,
    input.accountId,
    1,
    input.kind === 'transfer' ? input.toAccountId : null
  )

  return { transactionId: data?.id ?? null, error: null }
}

/** Deletes a transaction and reverses whatever it did to the balances. */
export async function reverseTransaction(transaction: Transaction): Promise<string | null> {
  const { error } = await supabase.from('transactions').delete().eq('id', transaction.id)
  if (error) return error.message

  await applyTransactionEffect(
    transaction.type as TransactionKind,
    transaction.amount,
    transaction.account_id,
    -1,
    transaction.to_account_id
  )

  return null
}
