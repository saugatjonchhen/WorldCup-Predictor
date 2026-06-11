import { useState, useEffect } from 'react'
import { Layout } from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useMutation } from '@tanstack/react-query'

export default function Profile() {
  const { user, profile, refreshProfile } = useAuth()

  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [country, setCountry] = useState('')

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Populate local form fields on profile change
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '')
      setUsername(profile.username || '')
      setAvatarUrl(profile.avatar_url || '')
      setCountry(profile.country || '')
    }
  }, [profile])

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return

      const { error } = await supabase.from('profiles').update({
        username: username.toLowerCase().trim(),
        display_name: displayName.trim(),
        avatar_url: avatarUrl.trim(),
        country: country.trim(),
      }).eq('id', user.id)

      if (error) throw error
      await refreshProfile()
    },
    onSuccess: () => {
      setSuccessMsg('Profile updated successfully!')
      setErrorMsg(null)
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'An error occurred during update.')
      setSuccessMsg(null)
    },
  })

  // Handle password reset
  const [newPassword, setNewPassword] = useState('')
  const [passErrorMsg, setPassErrorMsg] = useState<string | null>(null)
  const [passSuccessMsg, setPassSuccessMsg] = useState<string | null>(null)
  const [passLoading, setPassLoading] = useState(false)

  async function handlePasswordUpdate(e: React.FormEvent) {
    e.preventDefault()
    setPassLoading(true)
    setPassErrorMsg(null)
    setPassSuccessMsg(null)

    if (newPassword.length < 6) {
      setPassErrorMsg('Password must be at least 6 characters long.')
      setPassLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPassSuccessMsg('Password successfully changed!')
      setNewPassword('')
    } catch (err: any) {
      setPassErrorMsg(err.message || 'Failed to update password.')
    } finally {
      setPassLoading(false)
    }
  }

  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSuccessMsg(null)
    setErrorMsg(null)

    if (username.length < 3) {
      setErrorMsg('Username must be at least 3 characters.')
      return
    }

    updateProfileMutation.mutate()
  }

  return (
    <Layout>
      <div className="space-y-8 max-w-2xl mx-auto">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-gradient">
            User Settings
          </h1>
          <p className="text-text-secondary text-sm">
            Manage your personal profile and authentication credentials.
          </p>
        </div>

        {/* Profile Card details */}
        <div className="glass p-6 sm:p-8 rounded-2xl border border-border/80 space-y-6">
          <h2 className="text-xl font-bold font-display flex items-center gap-2">
            <span>👤</span> Public Profile Settings
          </h2>

          {errorMsg && (
            <div className="p-3 text-sm rounded-md bg-live-muted border border-live text-live">
              {errorMsg}
            </div>
          )}

          {successMsg && (
            <div className="p-3 text-sm rounded-md bg-brand-muted border border-brand text-brand">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:border-brand"
                  placeholder="e.g. soccerfan"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:border-brand"
                  placeholder="e.g. John Doe"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Avatar Image URL
                </label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:border-brand"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Support Country
                </label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:border-brand"
                  placeholder="e.g. Argentina"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="btn btn-primary font-bold text-xs px-5 py-2.5 shadow-brand"
            >
              {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Change Password Card */}
        <div className="glass p-6 sm:p-8 rounded-2xl border border-border/80 space-y-6">
          <h2 className="text-xl font-bold font-display flex items-center gap-2">
            <span>🔒</span> Update Account Password
          </h2>

          {passErrorMsg && (
            <div className="p-3 text-sm rounded-md bg-live-muted border border-live text-live">
              {passErrorMsg}
            </div>
          )}

          {passSuccessMsg && (
            <div className="p-3 text-sm rounded-md bg-brand-muted border border-brand text-brand">
              {passSuccessMsg}
            </div>
          )}

          <form onSubmit={handlePasswordUpdate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full max-w-sm px-4 py-2 rounded-lg bg-surface-2 border border-border text-text-primary text-sm focus:outline-none focus:border-brand"
                placeholder="Minimum 6 characters"
              />
            </div>

            <button
              type="submit"
              disabled={passLoading}
              className="btn btn-secondary font-bold text-xs px-5 py-2.5"
            >
              {passLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  )
}
