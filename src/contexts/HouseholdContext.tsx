import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import type { Household, HouseholdMember } from '@/types'

interface HouseholdContextType {
  household: Household | null
  members: HouseholdMember[]
  loading: boolean
  createHousehold: (name: string) => Promise<{ error?: string }>
  refreshHousehold: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdContextType | undefined>(undefined)

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [loading, setLoading] = useState(true)

  const fetchHousehold = async () => {
    if (!user) {
      setHousehold(null)
      setMembers([])
      setLoading(false)
      return
    }

    setLoading(true)

    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      setHousehold(null)
      setMembers([])
      setLoading(false)
      return
    }

    const { data: hh } = await supabase
      .from('households')
      .select('*')
      .eq('id', membership.household_id)
      .single()

    setHousehold(hh)

    const { data: mm } = await supabase
      .from('household_members')
      .select('*, user:users(*)')
      .eq('household_id', membership.household_id)

    setMembers(mm || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchHousehold()
  }, [user])

  const createHousehold = async (name: string) => {
    if (!user) return { error: 'Not authenticated' }

    const { data: hh, error: hhError } = await supabase
      .from('households')
      .insert({ name, owner_id: user.id, currency: 'NGN' })
      .select()
      .single()

    if (hhError) return { error: hhError.message }

    const { error: memberError } = await supabase
      .from('household_members')
      .insert({ household_id: hh.id, user_id: user.id, role: 'owner' })

    if (memberError) return { error: memberError.message }

    await fetchHousehold()
    return {}
  }

  return (
    <HouseholdContext.Provider value={{ household, members, loading, createHousehold, refreshHousehold: fetchHousehold }}>
      {children}
    </HouseholdContext.Provider>
  )
}

export function useHousehold() {
  const context = useContext(HouseholdContext)
  if (context === undefined) {
    throw new Error('useHousehold must be used within a HouseholdProvider')
  }
  return context
}
