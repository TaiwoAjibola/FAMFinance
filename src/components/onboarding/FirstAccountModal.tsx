import { useEffect, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, ArrowRight, CheckCircle2, Loader2, Wallet } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { DEFAULT_CURRENCY, currencyOptions, getCurrency } from '@/lib/currency'
import { formatCurrency } from '@/lib/utils'
import { useFinanceActions } from '@/contexts/FinanceActionsContext'
import type { CreateFirstAccountInput } from '@/contexts/OnboardingContext'
import type { AccountType } from '@/types'

const ACCOUNT_TYPES: { value: AccountType; label: string; hint: string }[] = [
  { value: 'bank', label: 'Bank account', hint: 'Money in the bank' },
  { value: 'cash', label: 'Cash', hint: 'Physical cash on hand' },
  { value: 'savings', label: 'Savings', hint: 'Money set aside' },
  { value: 'other', label: 'Wallet / other', hint: 'Anything else you use' },
]

interface FirstAccountModalProps {
  open: boolean
  createdAccount: CreateFirstAccountInput | null
  onCreate: (input: CreateFirstAccountInput) => Promise<{ error?: string }>
  onSkip: () => void
  onDismiss: () => void
  onGoToAccounts: () => void
}

type Step = 'welcome' | 'form' | 'next'

export function FirstAccountModal({
  open,
  createdAccount,
  onCreate,
  onSkip,
  onDismiss,
  onGoToAccounts,
}: FirstAccountModalProps) {
  const { openTransaction } = useFinanceActions()
  const [step, setStep] = useState<Step>('welcome')
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('bank')
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
  const [openingBalance, setOpeningBalance] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Once an account exists we move straight to "what next?".
  useEffect(() => {
    if (createdAccount) setStep('next')
  }, [createdAccount])

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Give your account a name.')
      return
    }
    setError(null)
    setSaving(true)
    const result = await onCreate({
      name: name.trim(),
      type,
      currency,
      openingBalance: Number(openingBalance) || 0,
      description,
    })
    setSaving(false)
    if (result.error) setError(result.error)
  }

  if (step === 'next') {
    return (
      <Modal open={open} title="You're all set" description="Your first account is ready." onClose={onDismiss}>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-success/10 p-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div className="text-sm text-text">
              <p className="font-medium">
                {createdAccount?.name} · {createdAccount ? getCurrency(createdAccount.currency).code : ''}
              </p>
              <p className="text-xs text-text-muted">
                Opening balance{' '}
                {formatCurrency(
                  Number(createdAccount?.openingBalance || 0),
                  createdAccount?.currency
                )}
              </p>
            </div>
          </div>

          <p className="text-sm text-text-muted">A good next step is to record money moving:</p>

          <div className="grid grid-cols-1 gap-2">
            <button type="button" onClick={() => { onDismiss(); openTransaction('income') }} className="btn-secondary justify-start">
              <ArrowDownCircle className="h-4 w-4 text-success" />
              Record income you received
            </button>
            <button type="button" onClick={() => { onDismiss(); openTransaction('expense') }} className="btn-secondary justify-start">
              <ArrowUpCircle className="h-4 w-4 text-danger" />
              Record an expense
            </button>
            <button type="button" onClick={onGoToAccounts} className="btn-secondary justify-start">
              <Wallet className="h-4 w-4 text-cta" />
              Add another account
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <button type="button" onClick={onDismiss} className="btn-primary w-full">
            Done
          </button>
        </div>
      </Modal>
    )
  }

  if (step === 'form') {
    return (
      <Modal
        open={open}
        title="Add your first account"
        description="This is where your money lives — everything you record points back to it."
        onClose={onDismiss}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onSkip} className="btn-ghost">
              Skip for now
            </button>
            <button type="button" onClick={handleCreate} disabled={saving || !name.trim()} className="btn-primary">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? 'Creating…' : 'Create account'}
            </button>
          </div>
        }
        size="lg"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void handleCreate()
          }}
        >
          <div>
            <label htmlFor="ob-name" className="label">Account name</label>
            <input
              id="ob-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="e.g. Main bank account, My wallet"
              required
              autoFocus
            />
          </div>

          <div>
            <span className="label">Account type</span>
            <div className="grid grid-cols-2 gap-2">
              {ACCOUNT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  aria-pressed={type === t.value}
                  className={`min-h-[3rem] rounded-lg border px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                    type === t.value
                      ? 'border-cta bg-cta/10 text-cta'
                      : 'border-border bg-surface text-text hover:bg-surface-alt'
                  }`}
                >
                  <span className="block font-medium">{t.label}</span>
                  <span className="block text-[11px] text-text-muted">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ob-currency" className="label">Currency</label>
              <select
                id="ob-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="input-field"
              >
                {currencyOptions().map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ob-balance" className="label">
                Opening balance ({getCurrency(currency).symbol}) — optional
              </label>
              <input
                id="ob-balance"
                type="number"
                inputMode="decimal"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="input-field"
                placeholder="0"
              />
              <p className="mt-1 text-xs text-text-muted">
                How much is in it right now. Leave at 0 if you are not sure.
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="ob-description" className="label">Description (optional)</label>
            <input
              id="ob-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field"
              placeholder="e.g. Salary account"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>
          )}
        </form>
      </Modal>
    )
  }

  return (
    <Modal open={open} title="Welcome to FamFinance" onClose={onDismiss} size="md">
      <div className="space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cta/10">
          <Wallet className="h-6 w-6 text-cta" />
        </div>
        <p className="text-sm text-text">
          Before you record income, expenses or transfers, you need somewhere for that money to
          live. An account is the starting point — it might be your bank, the cash in your wallet,
          or a savings pot.
        </p>
        <p className="text-sm text-text-muted">
          Everything you record later points back to an account, which is what makes your balances
          and summaries add up.
        </p>

        <div className="space-y-2 pt-1">
          <button type="button" onClick={() => setStep('form')} className="btn-primary w-full">
            Add Your First Account
          </button>
          <button type="button" onClick={onSkip} className="btn-ghost w-full">
            Skip for now
          </button>
        </div>
      </div>
    </Modal>
  )
}
