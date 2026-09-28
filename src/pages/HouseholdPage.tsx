import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHousehold } from '@/contexts/HouseholdContext'
import { Layout } from '@/components/layout/Layout'
import { Users, Mail, UserPlus, Trash2, Shield, Link, Copy, Check, RefreshCw, Eye, Edit3 } from 'lucide-react'
import type { Invitation, MemberRole, HouseholdMember } from '@/types'
import { usePermissions } from '@/hooks/usePermissions'

export function HouseholdPage() {
  const { user } = useAuth()
  const { household, members, refreshHousehold } = useHousehold()
  const { can } = usePermissions()
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<MemberRole>('editor')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

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

    const existingMember = members.find((m) => m.user?.email === inviteEmail)
    if (existingMember) {
      setError('This person is already a member of this household')
      setSaving(false)
      return
    }

    const existingInvite = invitations.find((i) => i.email === inviteEmail && i.status === 'pending')
    if (existingInvite) {
      setError('An invitation is already pending for this email')
      setSaving(false)
      return
    }

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 5)

    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24)

    const { error: inviteError } = await supabase.from('invitations').insert({
      household_id: household.id,
      email: inviteEmail,
      role: inviteRole,
      invited_by: user.id,
      expires_at: expiresAt.toISOString(),
      token,
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

  const handleCopyLink = async (token: string, id: string) => {
    const url = `${window.location.origin}/invite/${token}`
    await navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleShareWhatsApp = async (token: string) => {
    const url = `${window.location.origin}/invite/${token}`
    const text = `Join our family finance tracker! ${url}`
    
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Family Finance Invite', text, url })
        return
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          // User cancelled or error, fall through to clipboard
        }
      }
    }
    
    // Fallback: copy to clipboard
    await navigator.clipboard.writeText(url)
    alert('Link copied! Open WhatsApp and paste to share.')
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Remove this member? They will lose access to this household.')) return
    await supabase.from('household_members').delete().eq('id', memberId)
    await refreshHousehold()
  }

  const handleReinvite = async (member: HouseholdMember) => {
    if (!member.user?.email) return
    const email = member.user.email
    if (!confirm(`Remove ${member.user.full_name || email} and send a fresh invite? They'll need to set a new password.`)) return

    // Delete the member
    await supabase.from('household_members').delete().eq('id', member.id)
    
    // Create new invite
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 5)
    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24)

    await supabase.from('invitations').insert({
      household_id: household!.id,
      email,
      role: 'editor',
      invited_by: user!.id,
      expires_at: expiresAt.toISOString(),
      token,
    })

    await refreshHousehold()
    await fetchInvitations()
  }

  const handleRoleChange = async (memberId: string, newRole: MemberRole) => {
    if (!can('manage_roles')) return
    await supabase.from('household_members').update({ role: newRole }).eq('id', memberId)
    await refreshHousehold()
  }

  const ROLE_OPTIONS: { value: MemberRole; label: string; description: string }[] = [
    { value: 'editor', label: 'Editor', description: 'Can add/edit budgets, expenses, income, debts, savings' },
    { value: 'viewer', label: 'Viewer', description: 'Read-only access to all household finances' },
  ]

  const getRoleBadge = (role: MemberRole) => {
    switch (role) {
      case 'owner':
        return <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent"><Shield className="h-3 w-3" /> Owner</span>
      case 'editor':
        return <span className="inline-flex items-center gap-1 rounded-full bg-cta/10 px-2.5 py-0.5 text-xs font-medium text-cta"><Edit3 className="h-3 w-3" /> Editor</span>
      case 'viewer':
        return <span className="inline-flex items-center gap-1 rounded-full bg-surface-alt px-2.5 py-0.5 text-xs font-medium text-text-muted"><Eye className="h-3 w-3" /> Viewer</span>
    }
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
                  {getRoleBadge(member.role)}
                  {isOwner && member.user_id !== user?.id && (
                    <>
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member.id, e.target.value as MemberRole)}
                        className="text-xs bg-transparent border-none focus:outline-none text-text cursor-pointer"
                        disabled={!can('manage_roles')}
                      >
                        {ROLE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleReinvite(member)}
                        className="rounded-lg p-1.5 text-cta hover:bg-cta/5 cursor-pointer"
                        title="Re-invite (fresh password)"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="rounded-lg p-1.5 text-danger hover:bg-danger/5 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  {member.user_id === user?.id && (
                    <span className="text-xs text-text-muted">(You)</span>
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
                    onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                    className="input-field"
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-text-muted">
                    {inviteRole === 'editor' ? 'Can add/edit all household finances' : 'Read-only access to all finances'}
                  </p>
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
            <div className="space-y-3">
              {invitations
                .filter((i) => i.status === 'pending')
                .map((invite) => {
                  const inviteLink = `${window.location.origin}/invite/${invite.token}`
                  return (
                    <div key={invite.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
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
                            Revoke
                          </button>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2 rounded-lg bg-surface-alt p-2">
                        <Link className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                        <p className="flex-1 truncate text-xs text-text-muted">{inviteLink}</p>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleCopyLink(invite.token, invite.id)}
                            className="shrink-0 rounded-md p-1.5 text-text-muted hover:bg-surface hover:text-text cursor-pointer"
                            title="Copy link"
                          >
                            {copiedId === invite.id ? (
                              <Check className="h-3.5 w-3.5 text-success" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleShareWhatsApp(invite.token)}
                            className="shrink-0 rounded-md p-1.5 text-cta hover:bg-cta/5 cursor-pointer"
                            title="Share via WhatsApp"
                          >
                            <Link className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`Join our family finance tracker! ${window.location.origin}/invite/${invite.token}`)}`, '_blank')}
                            className="shrink-0 rounded-md p-1.5 text-success hover:bg-success/5 cursor-pointer"
                            title="Open WhatsApp Web"
                          >
                            <Link className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
