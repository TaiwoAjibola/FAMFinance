import { useNavigate } from 'react-router-dom'
import { ArrowDownCircle, ArrowUpCircle, ArrowRightLeft, CalendarRange, HandCoins, Receipt, Sparkles } from 'lucide-react'
import { useFinanceActions, type FinanceAction } from '@/contexts/FinanceActionsContext'

interface ActionDefinition {
  id: FinanceAction
  label: string
  hint: string
  /** Tailwind classes for the icon tile. */
  tone: string
}

const PRIMARY: (ActionDefinition & { icon: typeof ArrowUpCircle })[] = [
  {
    id: 'add-income',
    label: 'Add Income',
    hint: 'Money received',
    icon: ArrowDownCircle,
    tone: 'bg-success/10 text-success',
  },
  {
    id: 'add-expense',
    label: 'Add Expense',
    hint: 'Money spent',
    icon: ArrowUpCircle,
    tone: 'bg-danger/10 text-danger',
  },
  {
    id: 'transfer',
    label: 'Transfer',
    hint: 'Between your accounts',
    icon: ArrowRightLeft,
    tone: 'bg-cta/10 text-cta',
  },
  {
    id: 'record-debt',
    label: 'Record Debt',
    hint: 'Money you owe',
    icon: HandCoins,
    tone: 'bg-warning/10 text-warning',
  },
]

const SECONDARY: (ActionDefinition & { icon: typeof ArrowUpCircle })[] = [
  { id: 'manage-budgets', label: 'Budgets', hint: 'Plan this month', icon: CalendarRange, tone: 'bg-surface-alt text-text-muted' },
  { id: 'view-transactions', label: 'Transactions', hint: 'Review & edit', icon: Receipt, tone: 'bg-surface-alt text-text-muted' },
  { id: 'repay-debt', label: 'Debt Repayment', hint: 'Pay what you owe', icon: HandCoins, tone: 'bg-surface-alt text-text-muted' },
  { id: 'ai-insights', label: 'AI Insights', hint: 'Ask FamFinance', icon: Sparkles, tone: 'bg-surface-alt text-text-muted' },
]

/**
 * The single entry point for every "record something" journey, so users never
 * have to open Transactions first and work out which type they need.
 */
export function QuickActions() {
  const { openTransaction } = useFinanceActions()
  const navigate = useNavigate()

  const run = (id: FinanceAction) => {
    switch (id) {
      case 'add-income':
        return openTransaction('income')
      case 'add-expense':
        return openTransaction('expense')
      case 'transfer':
        return openTransaction('transfer')
      case 'record-debt':
      case 'repay-debt':
        return navigate('/debts')
      case 'manage-budgets':
        return navigate('/budget')
      case 'view-transactions':
        return navigate('/expenses')
      case 'ai-insights':
        return navigate('/insights')
    }
  }

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-text">What would you like to record?</h2>
      <p className="mt-0.5 text-xs text-text-muted">
        Pick an action — income, expenses and transfers stay separate.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PRIMARY.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => run(action.id)}
            className="flex min-h-[4.5rem] flex-col items-start gap-2 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-alt cursor-pointer"
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${action.tone}`}>
              <action.icon className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-medium text-text">{action.label}</span>
              <span className="block text-[11px] text-text-muted">{action.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SECONDARY.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => run(action.id)}
            className="flex min-h-[2.75rem] items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-muted transition-colors hover:bg-surface-alt cursor-pointer"
          >
            <action.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
