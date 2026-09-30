import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import type { Household, HouseholdMember, MemberRole } from '@/types'

export type Permission = 
  | 'create_budget' | 'edit_budget' | 'delete_budget'
  | 'create_planned' | 'edit_planned' | 'delete_planned'
  | 'create_income' | 'edit_income' | 'delete_income'
  | 'create_expense' | 'edit_expense' | 'delete_expense'
  | 'create_debt' | 'edit_debt' | 'delete_debt' | 'repay_debt'
  | 'create_savings' | 'edit_savings' | 'delete_savings'
  | 'create_account' | 'edit_account' | 'delete_account'
  | 'manage_members' | 'manage_roles' | 'delete_household'
  | 'view_all'

interface HouseholdContextType {
  household: Household | null
  members: HouseholdMember[]
  loading: boolean
  currentUserRole: MemberRole | null
  permissions: Record<Permission, boolean>
  can: (permission: Permission) => boolean
  createHousehold: (name: string) => Promise<{ error?: string }>
  refreshHousehold: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdContextType | undefined>(undefined)

const ROLE_PERMISSIONS: Record<MemberRole, Permission[]> = {
  owner: [
    'create_budget', 'edit_budget', 'delete_budget',
    'create_planned', 'edit_planned', 'delete_planned',
    'create_income', 'edit_income', 'delete_income',
    'create_expense', 'edit_expense', 'delete_expense',
    'create_debt', 'edit_debt', 'delete_debt', 'repay_debt',
    'create_savings', 'edit_savings', 'delete_savings',
    'create_account', 'edit_account', 'delete_account',
    'manage_members', 'manage_roles', 'delete_household',
    'view_all'
  ],
  editor: [
    'create_budget', 'edit_budget', 'delete_budget',
    'create_planned', 'edit_planned', 'delete_planned',
    'create_income', 'edit_income', 'delete_income',
    'create_expense', 'edit_expense', 'delete_expense',
    'create_debt', 'edit_debt', 'delete_debt', 'repay_debt',
    'create_savings', 'edit_savings', 'delete_savings',
    'create_account', 'edit_account', 'delete_account',
    'view_all'
  ],
  viewer: [
    'view_all'
  ]
}

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState<MemberRole | null>(null)

  const fetchHousehold = async () => {
    if (!user) {
      setHousehold(null)
      setMembers([])
      setCurrentUserRole(null)
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      // Pick the most recent membership (a user may have joined multiple
      // households over time; the latest is their active one)
      const { data: memberships, error: membershipError } = await supabase
        .from('household_members')
        .select('household_id, role, joined_at')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: false })
        .limit(1)

      const membership = memberships?.[0]
      if (membershipError || !membership) {
        console.warn('No household membership found:', membershipError)
        setHousehold(null)
        setMembers([])
        setCurrentUserRole(null)
        setLoading(false)
        return
      }

      setCurrentUserRole(membership.role)

      const { data: hh, error: hhError } = await supabase
        .from('households')
        .select('*')
        .eq('id', membership.household_id)
        .single()

      if (hhError) {
        console.error('Failed to fetch household:', hhError)
        setHousehold(null)
        setMembers([])
        setCurrentUserRole(null)
        setLoading(false)
        return
      }

      setHousehold(hh)

      const { data: mm, error: mmError } = await supabase
        .from('household_members')
        .select('*, user:users(*)')
        .eq('household_id', membership.household_id)

      if (mmError) {
        console.error('Failed to fetch members:', mmError)
      }

      setMembers(mm || [])
    } catch (err) {
      console.error('fetchHousehold error:', err)
      setHousehold(null)
      setMembers([])
      setCurrentUserRole(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHousehold()
  }, [user])

  const permissions = useMemo(() => {
    const perms: Record<string, boolean> = {}
    if (currentUserRole) {
      ROLE_PERMISSIONS[currentUserRole].forEach(p => { perms[p] = true })
    }
    return perms as Record<Permission, boolean>
  }, [currentUserRole])

  const can = (permission: Permission) => permissions[permission] === true

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
    <HouseholdContext.Provider value={{ 
      household, 
      members, 
      loading, 
      currentUserRole,
      permissions,
      can,
      createHousehold, 
      refreshHousehold: fetchHousehold 
    }}>
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
