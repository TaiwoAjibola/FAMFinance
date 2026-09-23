import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Layout } from '@/components/layout/Layout'
import { Users, Mail, Shield, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

interface InviteDetails {
  id: string
  household_id: string
  email: string
  role: 'owner' | 'member'
  status: string
  expires_at: string
  household_name?: string
}

export function InvitePage() {
  const { token } = useParams<{ token: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [invite, setInvite] = useState<InviteDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    if (!token) return
    fetchInvite()
  }, [token])

  const fetchInvite = async () => {
    if (!token) return
    setLoading(true)

    const { data, error: fetchErr } = await supabase
      .from('invitations')
      .select('*, households(name)')
      .eq('token', token)
      .single()

    if (fetchErr || !data) {
      setError('Invalid or expired invite link')
      setLoading(false)
      return
    }

    if (data.status !== 'pending') {
      setError('This invitation is no longer active')
      setLoading(false)
      return
    }

    if (new Date(data.expires_at) < new Date()) {
      setError('This invitation has expired')
      setLoading(false)
      return
    }

    setInvite({
      id: data.id,
      household_id: data.household_id,
      email: data.email,
      role: data.role,
      status: data.status,
      expires_at: data.expires_at,
      household_name: (data.households as unknown as { name: string })?.name,
    })
    setLoading(false)
  }

  const handleAccept = async () => {
    if (!user || !invite) return
    setAccepting(true)
    setError('')

    if (user.email !== invite.email) {
      setError(`This invite is for ${invite.email}. Please sign in with that account.`)
      setAccepting(false)
      return
    }

    const { error: memberErr } = await supabase.from('household_members').insert({
      household_id: invite.household_id,
      user_id: user.id,
      role: invite.role,
    })

    if (memberErr) {
      if (memberErr.message.includes('duplicate')) {
        setError('You are already a member of this household')
      } else {
        setError(memberErr.message)
      }
      setAccepting(false)
      return
    }

    await supabase
      .from('invitations')
      .update({ status: 'accepted' })
      .eq('id', invite.id)

    setAccepted(true)
    setAccepting(false)

    setTimeout(() => {
      navigate('/')
      window.location.reload()
    }, 1500)
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-cta" />
        </div>
      </Layout>
    )
  }

  if (error && !invite) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="card max-w-md text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-danger" />
            <h2 className="mt-4 text-lg font-semibold text-text">Invite Error</h2>
            <p className="mt-2 text-sm text-text-muted">{error}</p>
            <Link to="/" className="btn-primary mt-6 inline-flex">
              Go to Dashboard
            </Link>
          </div>
        </div>
      </Layout>
    )
  }

  if (accepted) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="card max-w-md text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-success" />
            <h2 className="mt-4 text-lg font-semibold text-text">Welcome to the household!</h2>
            <p className="mt-2 text-sm text-text-muted">Redirecting you to the dashboard...</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="flex items-center justify-center py-20">
        <div className="card max-w-md w-full">
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-cta/10">
              <Users className="h-7 w-7 text-cta" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-text">You're invited!</h2>
            <p className="mt-2 text-sm text-text-muted">
              Join <span className="font-medium text-text">{invite?.household_name || 'a household'}</span> on FamFinance
            </p>
          </div>

          <div className="mt-6 space-y-3 rounded-lg bg-surface-alt p-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-text-muted" />
              <div>
                <p className="text-xs text-text-muted">Invited email</p>
                <p className="text-sm font-medium text-text">{invite?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-text-muted" />
              <div>
                <p className="text-xs text-text-muted">Role</p>
                <p className="text-sm font-medium text-text capitalize">{invite?.role}</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</div>
          )}

          <div className="mt-6 space-y-3">
            {!user ? (
              <>
                <Link to="/login" className="btn-primary w-full justify-center">
                  Sign in to accept
                </Link>
                <p className="text-center text-xs text-text-muted">
                  Don't have an account?{' '}
                  <Link to="/signup" className="font-medium text-cta hover:text-cta-light">
                    Sign up
                  </Link>
                </p>
              </>
            ) : (
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="btn-primary w-full justify-center"
              >
                {accepting ? 'Joining...' : 'Accept invitation'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
