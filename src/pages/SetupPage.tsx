import { useEffect, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useHousehold } from '@/contexts/HouseholdContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { getCurrentMonth } from '@/lib/utils'

const DEFAULT_EXPENSE_CATEGORIES = [
  'Food and food-related',
  'Transportation',
  "Daughter's needs",
  'Other household costs',
  'Internet',
  'Theological seminary',
  'Cooking gas',
  'Water',
  'Electricity',
  'Dustbin',
]

const DEFAULT_INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Project income',
  'Gifts',
  'Other income',
]

export function SetupPage() {
  const [householdName, setHouseholdName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingInvite, setPendingInvite] = useState<{
    id: string
    household_id: string
    role: string
    token: string
    household_name?: string
  } | null>(null)
  const { createHousehold, household, loading: hhLoading } = useHousehold()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  // If this user has a pending invitation, offer to accept it instead of
  // asking them to create their own household.
  useEffect(() => {
    if (!user?.email) return
    supabase
      .from('invitations')
      .select('id, household_id, role, token, status, expires_at, households(name)')
      .eq('email', user.email)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data && new Date(data.expires_at) > new Date()) {
          setPendingInvite({
            id: data.id,
            household_id: data.household_id,
            role: data.role,
            token: data.token,
            household_name: (data.households as unknown as { name?: string } | null)?.name,
          })
        }
      })
  }, [user])

  // Never show "create household" to someone who already belongs to one,
  // and require sign-in first.
  if (authLoading || hhLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (household) return <Navigate to="/" replace />

  // Pending invitation beats "create your household"
  if (pendingInvite) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary p-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-white">FamFinance</h1>
            <p className="mt-2 text-text-light">You're invited!</p>
          </div>
          <div className="card text-center">
            <h2 className="text-xl font-semibold text-text">
              Join {pendingInvite.household_name || 'your household'}
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              You have a pending invitation to join this household as{' '}
              <span className="font-medium text-text capitalize">{pendingInvite.role}</span>.
            </p>
            {error && (
              <div role="alert" className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
                {error}
              </div>
            )}
            <button
              onClick={() => navigate(`/invite/${pendingInvite.token}`)}
              className="btn-primary mt-6 w-full"
            >
              Set your passcode & join
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await createHousehold(householdName)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    // Seed default categories only — no hardcoded amounts
    const { data: hh } = await supabase
      .from('households')
      .select('id')
      .eq('name', householdName)
      .single()

    if (hh) {
      const categories = [
        ...DEFAULT_EXPENSE_CATEGORIES.map((name, i) => ({
          household_id: hh.id,
          name,
          type: 'expense' as const,
          sort_order: i,
        })),
        ...DEFAULT_INCOME_CATEGORIES.map((name, i) => ({
          household_id: hh.id,
          name,
          type: 'income' as const,
          sort_order: i + DEFAULT_EXPENSE_CATEGORIES.length,
        })),
      ]

      await supabase.from('categories').insert(categories)

      // Create empty budget for current month — user sets targets
      const month = getCurrentMonth()
      await supabase.from('monthly_budgets').insert({
        household_id: hh.id,
        month,
      })

      // Create empty cash on hand — user sets target
      await supabase.from('cash_on_hand').insert({
        household_id: hh.id,
        month,
      })
    }

    navigate('/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">FamFinance</h1>
          <p className="mt-2 text-text-light">Set up your household</p>
        </div>

        <div className="card">
          <h2 className="mb-6 text-xl font-semibold text-text">Create your household</h2>

          {error && (
            <div role="alert" className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="householdName" className="label">Household name</label>
              <input
                id="householdName"
                type="text"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                className="input-field"
                placeholder="e.g. Our Family"
                required
              />
              <p className="mt-1 text-xs text-text-muted">
                This is the name your household will be known by. You can invite your spouse later.
              </p>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Creating...' : 'Create household'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
