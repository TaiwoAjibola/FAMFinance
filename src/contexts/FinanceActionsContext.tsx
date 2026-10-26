import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { TransactionDialog, type TransactionDialogProps } from '@/components/finance/TransactionDialog'

type ActionKind = Extract<TransactionDialogProps['kind'], 'income' | 'expense' | 'transfer'>

export type FinanceAction =
  | 'add-income'
  | 'add-expense'
  | 'transfer'
  | 'record-debt'
  | 'repay-debt'
  | 'manage-budgets'
  | 'view-transactions'
  | 'ai-insights'

interface FinanceActionsContextValue {
  /** Opens the guided form for income / expense / transfer. */
  openTransaction: (kind: ActionKind, initialAccountId?: string) => void
  close: () => void
  active: ActionKind | null
  /**
   * Increments every time money moves. Pages add it to their effect deps so
   * summaries refresh right after a save instead of waiting for a remount.
   */
  version: number
  notifyDataChanged: () => void
}

const FinanceActionsContext = createContext<FinanceActionsContextValue | undefined>(undefined)

export function FinanceActionsProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActionKind | null>(null)
  const [initialAccountId, setInitialAccountId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const openTransaction = useCallback((kind: ActionKind, accountId?: string) => {
    setInitialAccountId(accountId ?? null)
    setActive(kind)
  }, [])

  const close = useCallback(() => setActive(null), [])

  const notifyDataChanged = useCallback(() => setVersion((v) => v + 1), [])

  const value = useMemo(
    () => ({ openTransaction, close, active, version, notifyDataChanged }),
    [openTransaction, close, active, version, notifyDataChanged]
  )

  return (
    <FinanceActionsContext.Provider value={value}>
      {children}
      {active && (
        <TransactionDialog
          open
          kind={active}
          initialAccountId={initialAccountId}
          onClose={close}
          onSaved={notifyDataChanged}
        />
      )}
    </FinanceActionsContext.Provider>
  )
}

export function useFinanceActions() {
  const context = useContext(FinanceActionsContext)
  if (!context) {
    throw new Error('useFinanceActions must be used within a FinanceActionsProvider')
  }
  return context
}
