import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import React, { Suspense, lazy } from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { HouseholdProvider, useHousehold } from '@/contexts/HouseholdContext'
import { LoginPage } from '@/pages/LoginPage'
import { SignUpPage } from '@/pages/SignUpPage'
import { SetupPage } from '@/pages/SetupPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const { household, loading: hhLoading } = useHousehold()

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          <p className="mt-3 text-sm text-text-light">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (hhLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-primary">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          <p className="mt-3 text-sm text-text-light">Loading...</p>
        </div>
      </div>
    )
  }
  if (!household) return <Navigate to="/setup" replace />

  return <>{children}</>
}

// Lazy load pages for code splitting (named exports)
const DashboardPageLazy = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const AccountsPageLazy = lazy(() => import('@/pages/AccountsPage').then(m => ({ default: m.AccountsPage })))
const IncomePageLazy = lazy(() => import('@/pages/IncomePage').then(m => ({ default: m.IncomePage })))
const ExpensesPageLazy = lazy(() => import('@/pages/ExpensesPage').then(m => ({ default: m.ExpensesPage })))
const BudgetPageLazy = lazy(() => import('@/pages/BudgetPage').then(m => ({ default: m.BudgetPage })))
const PlannedExpensesPageLazy = lazy(() => import('@/pages/PlannedExpensesPage').then(m => ({ default: m.PlannedExpensesPage })))
const SavingsPageLazy = lazy(() => import('@/pages/SavingsPage').then(m => ({ default: m.SavingsPage })))
const HistoryPageLazy = lazy(() => import('@/pages/HistoryPage').then(m => ({ default: m.HistoryPage })))
const HouseholdPageLazy = lazy(() => import('@/pages/HouseholdPage').then(m => ({ default: m.HouseholdPage })))
const SettingsPageLazy = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const InvitePageLazy = lazy(() => import('@/pages/InvitePage').then(m => ({ default: m.InvitePage })))
const DebtsPageLazy = lazy(() => import('@/pages/DebtsPage').then(m => ({ default: m.DebtsPage })))

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-primary">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        <p className="mt-3 text-sm text-text-light">Loading...</p>
      </div>
    </div>
  )
}

function AppRoutes() {
  const { user, loading: authLoading } = useAuth()

  if (authLoading) {
    return <LoadingSpinner />
  }

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/signup" element={user ? <Navigate to="/" replace /> : <SignUpPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/" element={<ProtectedRoute><DashboardPageLazy /></ProtectedRoute>} />
        <Route path="/accounts" element={<ProtectedRoute><AccountsPageLazy /></ProtectedRoute>} />
        <Route path="/income" element={<ProtectedRoute><IncomePageLazy /></ProtectedRoute>} />
        <Route path="/expenses" element={<ProtectedRoute><ExpensesPageLazy /></ProtectedRoute>} />
        <Route path="/debts" element={<ProtectedRoute><DebtsPageLazy /></ProtectedRoute>} />
        <Route path="/budget" element={<ProtectedRoute><BudgetPageLazy /></ProtectedRoute>} />
        <Route path="/planned" element={<ProtectedRoute><PlannedExpensesPageLazy /></ProtectedRoute>} />
        <Route path="/savings" element={<ProtectedRoute><SavingsPageLazy /></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><HistoryPageLazy /></ProtectedRoute>} />
        <Route path="/household" element={<ProtectedRoute><HouseholdPageLazy /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPageLazy /></ProtectedRoute>} />
        <Route path="/invite/:token" element={<InvitePageLazy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <HouseholdProvider>
          <AppRoutes />
        </HouseholdProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
