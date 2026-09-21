import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { Layout } from '@/components/layout/Layout'
import { Users, Mail, UserPlus, Trash2, Shield } from 'lucide-react'
import type { Invitation } from '@/types'

export function HouseholdPage() {
  const { user } = useAuth()
  const { household, members, refreshHousehold } = useHousehold()
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'member' | 'owner'>('member')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!household) return
    fetchInvitations()
  }, [household])

  const fetchInvitations = async () => {
    if (!household) return
    const { data } = await supabase
      .from('invitations')
      .select('*')
      .eq('household_id', household.id)
      .order('created_at', { ascending: false })
    setInvitations(data || [])
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!household || !user) return
    setError('')
    setSaving(true)

    // Check if already a member
    const existingMember = members.find((m) => m.user?.email === inviteEmail)
    if (existingMember) {
      setError('This person is already a member of this household')
      setSaving(false)
      return
    }

    // Check if already invited
    const existingInvite = invitations.find((i) => i.email === inviteEmail && i.status === 'pending')
    if (existingInvite) {
      setError('An invitation is already pending for this email')
      setSaving(false)
      return
    }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { error: inviteError } = await supabase.from('invitations').insert({
      household_id: household.id,
      email: inviteEmail,
      role: inviteRole,
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
    })

    if (inviteError) {
      setError(inviteError.message)
    } else {
      setInviteEmail('')
      setShowInviteForm(false)
      await fetchInvitations()
    }

    setSaving(false)
  }

  const handleCancelInvite = async (id: string) => {
    await supabase.from('invitations').update({ status: 'expired' }).eq('id', id)
    await fetchInvitations()
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) return
    await supabase.from('household_members').delete().eq('id', memberId)
    await refreshHousehold()
  }

  const isOwner = members.find((m) => m.user_id === user?.id)?.role === 'owner'

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Household</h1>
          <p className="text-sm text-text-muted">Manage your household members and invitations</p>
        </div>

        {/* Household info */}
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cta/10">
              <Users className="h-6 w-6 text-cta" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">{household?.name || 'No household'}</h2>
              <p className="text-sm text-text-muted">{members.length} member{members.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        {/* Members */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-text">Members</h3>
            {isOwner && (
              <button onClick={() => setShowInviteForm(true)} className="btn-primary text-sm">
                <UserPlus className="h-4 w-4" />
                Invite
              </button>
            )}
          </div>

          <div className="space-y-3">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-alt text-sm font-medium text-text">
                    {member.user?.full_name?.charAt(0) || member.user?.email?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text">
                      {member.user?.full_name || member.user?.email || 'Unknown'}
                    </p>
                    <p className="text-xs text-text-muted">{member.user?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    member.role === 'owner' ? 'bg-accent/10 text-accent' : 'bg-surface-alt text-text-muted'
                  }`}>
                    <Shield className="h-3 w-3" />
                    {member.role}
                  </span>
                  {isOwner && member.user_id !== user?.id && (
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      className="rounded-lg p-1.5 text-danger hover:bg-danger/5 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Invite form */}
        {showInviteForm && (
          <div className="card border-accent/30">
            <h3 className="mb-4 text-lg font-semibold text-text">Invite member</h3>
            {error && (
              <div role="alert" className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</div>
            )}
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label htmlFor="email" className="label">Email address</label>
                <input
                  id="email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="input-field"
                  placeholder="spouse@example.com"
                  required
                />
              </div>
              <div>
                <label htmlFor="role" className="label">Role</label>
                <select
                  id="role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'member' | 'owner')}
                  className="input-field"
                >
                  <option value="member">Member</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Sending...' : 'Send invitation'}
                </button>
                <button type="button" onClick={() => { setShowInviteForm(false); setError('') }} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Pending invitations */}
        {invitations.filter((i) => i.status === 'pending').length > 0 && (
          <div className="card">
            <h3 className="mb-4 text-lg font-semibold text-text">Pending Invitations</h3>
            <div className="space-y-2">
              {invitations
                .filter((i) => i.status === 'pending')
                .map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <Mail className="h-4 w-4 text-text-muted" />
                      <div>
                        <p className="text-sm font-medium text-text">{invite.email}</p>
                        <p className="text-xs text-text-muted">
                          Invited as {invite.role} • Expires {new Date(invite.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {isOwner && (
                      <button
                        onClick={() => handleCancelInvite(invite.id)}
                        className="btn-ghost text-xs text-danger"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
