import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import {
  LayoutDashboard,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  PiggyBank,
  Calendar,
  Target,
  History,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Users,
  HandCoins,
} from 'lucide-react'

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/accounts', label: 'Accounts', icon: Wallet },
  { path: '/income', label: 'Income', icon: ArrowDownCircle },
  { path: '/expenses', label: 'Expenses', icon: ArrowUpCircle },
  { path: '/debts', label: 'Debts', icon: HandCoins },
  { path: '/budget', label: 'Budget', icon: Calendar },
  { path: '/planned', label: 'Planned', icon: Target },
  { path: '/savings', label: 'Savings', icon: PiggyBank },
  { path: '/history', label: 'History', icon: History },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { household } = useHousehold()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:hidden">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="inline-flex items-center justify-center rounded-lg p-2 text-text-muted hover:bg-surface-alt cursor-pointer"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <Link to="/" className="text-lg font-bold text-primary">
          FamFinance
        </Link>
        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="inline-flex items-center gap-1 rounded-lg p-2 text-text-muted hover:bg-surface-alt cursor-pointer"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cta text-xs font-medium text-white">
              {user?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}
            </div>
            <ChevronDown className="h-3 w-3" />
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-border bg-surface shadow-lg">
              <div className="border-b border-border p-3">
                <p className="text-sm font-medium text-text">{user?.full_name || user?.email}</p>
                <p className="text-xs text-text-muted">{household?.name}</p>
              </div>
              <div className="p-1">
                <Link
                  to="/household"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-surface-alt hover:text-text cursor-pointer"
                >
                  <Users className="h-4 w-4" />
                  Household
                </Link>
                <Link
                  to="/settings"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-surface-alt hover:text-text cursor-pointer"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/5 cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 flex h-full w-64 flex-col border-r border-border bg-surface transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="flex h-14 items-center border-b border-border px-4">
          <Link to="/" className="text-lg font-bold text-primary">
            FamFinance
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? 'bg-cta/10 text-cta'
                      : 'text-text-muted hover:bg-surface-alt hover:text-text'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="border-t border-border p-3">
          <div className="space-y-1">
            <Link
              to="/household"
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                location.pathname === '/household'
                  ? 'bg-cta/10 text-cta'
                  : 'text-text-muted hover:bg-surface-alt hover:text-text'
              }`}
            >
              <Users className="h-4 w-4" />
              Household
            </Link>
            <Link
              to="/settings"
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200 ${
                location.pathname === '/settings'
                  ? 'bg-cta/10 text-cta'
                  : 'text-text-muted hover:bg-surface-alt hover:text-text'
              }`}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </div>
          <div className="mt-2 rounded-lg bg-surface-alt p-3">
            <p className="text-xs text-text-muted">Household</p>
            <p className="text-sm font-medium text-text">{household?.name || 'No household'}</p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-text-muted hover:bg-danger/5 hover:text-danger transition-colors duration-200 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-64">
        <div className="container-app py-4 sm:py-6 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
