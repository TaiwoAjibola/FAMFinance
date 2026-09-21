import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHousehold } from '@/contexts/HouseholdContext'
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
  const { createHousehold } = useHousehold()
  const navigate = useNavigate()

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

    // Seed default categories
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

      // Seed initial monthly budget
      const month = getCurrentMonth()
      await supabase.from('monthly_budgets').insert({
        household_id: hh.id,
        month,
        cash_on_hand_target: 133000,
      })

      // Seed cash on hand
      await supabase.from('cash_on_hand').insert({
        household_id: hh.id,
        month,
        target_amount: 133000,
        current_amount: 0,
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
