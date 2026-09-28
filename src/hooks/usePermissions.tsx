import { useHousehold } from '@/contexts/HouseholdContext'
import type { Permission } from '@/contexts/HouseholdContext'

export function usePermissions() {
  const { can, currentUserRole, permissions } = useHousehold()

  return {
    can,
    currentUserRole,
    permissions,
    isOwner: currentUserRole === 'owner',
    isEditor: currentUserRole === 'editor',
    isViewer: currentUserRole === 'viewer',
    isOwnerOrEditor: currentUserRole === 'owner' || currentUserRole === 'editor',
  }
}

export function Can({ permission, children, fallback = null }: { 
  permission: Permission
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const { can } = usePermissions()
  return can(permission) ? <>{children}</> : <>{fallback}</>
}