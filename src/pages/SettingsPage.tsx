import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { Layout } from '@/components/layout/Layout'
import { User, Users, LogOut } from 'lucide-react'

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const { household, members } = useHousehold()

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Settings</h1>
          <p className="text-sm text-text-muted">Manage your account and household</p>
        </div>

        {/* Profile */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cta/10">
              <User className="h-5 w-5 text-cta" />
            </div>
            <h2 className="text-lg font-semibold text-text">Profile</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-text">Name</p>
                <p className="text-xs text-text-muted">{user?.full_name || 'Not set'}</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-text">Email</p>
                <p className="text-xs text-text-muted">{user?.email}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Household */}
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
              <Users className="h-5 w-5 text-accent" />
            </div>
            <h2 className="text-lg font-semibold text-text">Household</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-text">Household name</p>
                <p className="text-xs text-text-muted">{household?.name}</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-text">Members</p>
                <p className="text-xs text-text-muted">{members.length} member{members.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sign out */}
        <div className="card">
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-sm text-danger hover:text-danger/80 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </div>
    </Layout>
  )
}
