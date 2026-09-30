import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { PasscodeInput } from '@/components/PasscodeInput'

export function SignUpPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [authMode, setAuthMode] = useState<'password' | 'passcode'>('passcode')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    let secret: string
    if (authMode === 'passcode') {
      if (passcode.length !== 6) {
        setError('Enter all 6 digits of your passcode')
        return
      }
      secret = passcode
    } else {
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
      secret = password
    }

    setLoading(true)
    const result = await signUp(email, secret, fullName)
    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      navigate(inviteToken ? `/invite/${inviteToken}` : '/setup')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">FamFinance</h1>
          <p className="mt-2 text-text-light">
            {inviteToken ? 'Create your account to join the household' : 'Household Finance Manager'}
          </p>
        </div>

        <div className="card">
          <h2 className="mb-6 text-xl font-semibold text-text">Create account</h2>

          {error && (
            <div role="alert" className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="label">Full name</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input-field"
                placeholder="Your full name"
                required
              />
            </div>

            <div>
              <label htmlFor="email" className="label">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
                required
              />
            </div>

            {/* Password / Passcode toggle */}
            <div className="flex rounded-lg bg-surface-alt p-1" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'passcode'}
                onClick={() => setAuthMode('passcode')}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  authMode === 'passcode' ? 'bg-surface text-cta shadow-sm' : 'text-text-muted'
                }`}
              >
                6-digit passcode
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'password'}
                onClick={() => setAuthMode('password')}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  authMode === 'password' ? 'bg-surface text-cta shadow-sm' : 'text-text-muted'
                }`}
              >
                Password
              </button>
            </div>

            {authMode === 'passcode' ? (
              <div>
                <label className="label">Choose a 6-digit passcode</label>
                <PasscodeInput value={passcode} onChange={setPasscode} />
                <p className="mt-1 text-xs text-text-muted">
                  You'll use this passcode to sign in on all your devices.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="password" className="label">Password</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="label">Confirm password</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
              </>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Creating account...' : inviteToken ? 'Create account & join' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-text-muted">
            Already have an account?{' '}
            <Link to={inviteToken ? `/login?invite=${inviteToken}` : '/login'} className="font-medium text-cta hover:text-cta-light">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
