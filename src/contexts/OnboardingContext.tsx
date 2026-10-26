import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { FirstAccountModal } from '@/components/onboarding/FirstAccountModal'

export type OnboardingState = 'pending' | 'completed' | 'skipped'

export interface CreateFirstAccountInput {
  name: string
  type: 'bank' | 'cash' | 'savings' | 'other'
  currency: string
  openingBalance: number
  description?: string
}

interface OnboardingContextValue {
  /** True only while a household genuinely has nothing to record money into. */
  needsSetup: boolean
  loading: boolean
  accountsCount: number
  createFirstAccount: (input: CreateFirstAccountInput) => Promise<{ error?: string }>
  skipOnboarding: () => Promise<void>
  refresh: () => Promise<void>
}

const OnboardingContext = createContext<OnboardingContextValue | undefined>(undefined)

/**
 * Decides whether the guided first-run experience should appear.
 *
 * The signal is "does this household have any account?", backed by a persisted
 * `households.onboarding_state`. Because both live in the database the prompt
 * survives new devices and the installed PWA, and existing households that
 * already have accounts are never interrupted.
 */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { household, can, refreshHousehold } = useHousehold()
  const navigate = useNavigate()
  const [accountsCount, setAccountsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [justCreatedAccount, setJustCreatedAccount] = useState<CreateFirstAccountInput | null>(null)

  const check = useCallback(async () => {
    if (!household) {
      setAccountsCount(0)
      setLoading(false)
      setVisible(false)
      return
    }

    setLoading(true)
    const { count } = await supabase
      .from('accounts')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', household.id)
      .eq('is_active', true)

    const total = count ?? 0
    setAccountsCount(total)

    const state = (household as { onboarding_state?: OnboardingState }).onboarding_state ?? 'pending'
    const canCreate = can('create_account')
    setVisible(total === 0 && state === 'pending' && canCreate)
    setLoading(false)
  }, [household, can])

  useEffect(() => {
    void check()
  }, [check])

  const createFirstAccount = useCallback(
    async (input: CreateFirstAccountInput) => {
      if (!household || !user) return { error: 'Not signed in' }

      const { error } = await supabase.from('accounts').insert({
        household_id: household.id,
        name: input.name.trim(),
        type: input.type,
        currency: input.currency,
        balance: input.openingBalance,
        description: input.description?.trim() || null,
        is_active: true,
      })
      if (error) return { error: error.message }

      await supabase
        .from('households')
        .update({ onboarding_state: 'completed' })
        .eq('id', household.id)

      setJustCreatedAccount(input)
      await refreshHousehold()
      await check()
      return {}
    },
    [household, user, refreshHousehold, check]
  )

  const skipOnboarding = useCallback(async () => {
    if (!household) return
    await supabase.from('households').update({ onboarding_state: 'skipped' }).eq('id', household.id)
    setVisible(false)
    await refreshHousehold()
    await check()
  }, [household, refreshHousehold, check])

  const value = useMemo(
    () => ({ needsSetup: visible, loading, accountsCount, createFirstAccount, skipOnboarding, refresh: check }),
    [visible, loading, accountsCount, createFirstAccount, skipOnboarding, check]
  )

  const finish = () => {
    setJustCreatedAccount(null)
    setVisible(false)
  }

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {(visible || justCreatedAccount) && (
        <FirstAccountModal
          open
          createdAccount={justCreatedAccount}
          onSkip={() => void skipOnboarding()}
          onCreate={createFirstAccount}
          onDismiss={finish}
          onGoToAccounts={() => {
            finish()
            navigate('/accounts')
          }}
        />
      )}
    </OnboardingContext.Provider>
  )
}

export function useOnboarding() {
  const context = useContext(OnboardingContext)
  if (!context) throw new Error('useOnboarding must be used within an OnboardingProvider')
  return context
}
