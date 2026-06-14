import { useState } from 'react'
import { Layout } from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { UserPredictionsView } from '@/components/UserPredictionsView'
import { syncLiveScores } from '@/lib/matchSync'
import { toast } from 'sonner'

interface Profile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  country: string | null
  role: string
  created_at: string
}

interface Match {
  id: string
  kickoff_time: string
  status: string
}

interface PredictionInfo {
  user_id: string
  match_id: string
}

export default function AdminPredictions() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all')
  const [userSortOrder, setUserSortOrder] = useState<'name_asc' | 'name_desc' | 'joined_newest' | 'joined_oldest'>('name_asc')
  const [isSyncing, setIsSyncing] = useState(false)

  const handleSyncLiveScores = async () => {
    setIsSyncing(true)
    const result = await syncLiveScores(supabase)
    setIsSyncing(false)
    if (result.success) {
      if (result.updatedCount > 0) {
        toast.success(`Successfully synced! Updated ${result.updatedCount} matches.`)
      } else {
        toast.success('Scores are already up to date.')
      }
    } else {
      toast.error(`Failed to sync live scores: ${result.error}`)
    }
  }

  const { data: profiles = [], isLoading: isLoadingProfiles } = useQuery<Profile[]>({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('username', { ascending: true })

      if (error) throw error
      return data as Profile[]
    },
  })

  const { data: matches = [] } = useQuery<Match[]>({
    queryKey: ['admin-matches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('id, kickoff_time, status')
      if (error) throw error
      return data as Match[]
    },
  })

  const { data: predictions = [] } = useQuery<PredictionInfo[]>({
    queryKey: ['admin-predictions-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('predictions')
        .select('user_id, match_id')
      if (error) throw error
      return data as PredictionInfo[]
    },
  })

  const unpredictedCounts = (() => {
    const now = new Date().getTime()
    const urgentMatches = matches.filter((m) => {
      const kickoff = new Date(m.kickoff_time).getTime()
      const diff = kickoff - now
      return m.status === 'scheduled' && diff > 0 && diff < 24 * 60 * 60 * 1000
    })

    if (urgentMatches.length === 0) return {} as { [userId: string]: number }

    const userPredictionsMap: { [userId: string]: Set<string> } = {}
    predictions.forEach((p) => {
      if (!userPredictionsMap[p.user_id]) {
        userPredictionsMap[p.user_id] = new Set()
      }
      userPredictionsMap[p.user_id].add(p.match_id)
    })

    const counts: { [userId: string]: number } = {}
    profiles.forEach((p) => {
      const userPreds = userPredictionsMap[p.id] || new Set()
      let unpredictedCount = 0
      urgentMatches.forEach((m) => {
        if (!userPreds.has(m.id)) {
          unpredictedCount++
        }
      })
      if (unpredictedCount > 0) {
        counts[p.id] = unpredictedCount
      }
    })

    return counts
  })()

  const filteredProfiles = profiles
    .filter((p) => {
      const query = userSearchQuery.toLowerCase()
      const matchesSearch =
        (p.username || '').toLowerCase().includes(query) ||
        (p.display_name || '').toLowerCase().includes(query) ||
        (p.country || '').toLowerCase().includes(query)

      const matchesRole =
        roleFilter === 'all' ||
        (roleFilter === 'admin' && p.role === 'admin') ||
        (roleFilter === 'user' && p.role !== 'admin')

      return matchesSearch && matchesRole
    })
    .sort((a, b) => {
      if (userSortOrder === 'name_asc') {
        const nameA = a.display_name || a.username || ''
        const nameB = b.display_name || b.username || ''
        return nameA.localeCompare(nameB)
      }
      if (userSortOrder === 'name_desc') {
        const nameA = a.display_name || a.username || ''
        const nameB = b.display_name || b.username || ''
        return nameB.localeCompare(nameA)
      }
      if (userSortOrder === 'joined_newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      if (userSortOrder === 'joined_oldest') {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      }
      return 0
    })

  const selectedProfile = profiles.find((p) => p.id === selectedUserId)

  return (
    <Layout>
      <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header section */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand/20 via-brand-muted/10 to-transparent p-6 sm:p-8 border border-border/60">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-brand bg-brand-muted/40 px-2.5 py-1 rounded-full border border-brand/20">
                Staff Control
              </span>
              <h1 className="text-3xl sm:text-4xl font-extrabold font-display text-gradient mt-2">
                Admin Center
              </h1>
              <p className="text-text-secondary text-sm max-w-xl mt-1">
                Monitor platform registration and safely inspect user-submitted bracket choices & match scores.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <button
                onClick={handleSyncLiveScores}
                disabled={isSyncing}
                className="btn btn-primary text-xs px-4 py-2.5 font-bold shadow-brand flex items-center gap-2"
              >
                {isSyncing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-transparent border-t-white rounded-full animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    🔄 Sync Live Scores
                  </>
                )}
              </button>

              <div className="flex items-center gap-4 bg-surface-2/60 backdrop-blur border border-border/60 px-4 py-3 rounded-2xl">
                <div className="text-center">
                  <div className="text-lg font-black text-brand">{profiles.length}</div>
                  <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider">Total Users</div>
                </div>
                <div className="h-8 w-px bg-border/80" />
                <div className="text-center">
                  <div className="text-lg font-black text-emerald-500">
                    {profiles.filter(p => p.role === 'admin').length}
                  </div>
                  <div className="text-[9px] font-bold text-text-muted uppercase tracking-wider">Admins</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Sidebar - User Directory */}
          <div className={`lg:col-span-4 space-y-4 ${selectedUserId ? 'hidden lg:block' : 'block'}`}>
            <div className="glass p-6 rounded-2xl border border-border/80 flex flex-col gap-5">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <h2 className="text-xs font-black uppercase tracking-widest text-text-muted">
                  Registered Profiles ({filteredProfiles.length})
                </h2>
              </div>

              {/* Search and Filters */}
              <div className="space-y-4">
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center text-text-muted text-sm">🔍</span>
                  <input
                    type="text"
                    placeholder="Search name, username, country..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="bg-surface-2 border border-border rounded-xl pl-9 pr-8 py-2.5 text-xs font-semibold text-text-primary focus:border-brand focus:outline-none w-full transition-all"
                  />
                  {userSearchQuery && (
                    <button
                      onClick={() => setUserSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted hover:text-text-primary font-bold"
                    >
                      ×
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-text-muted">Role</label>
                    <select
                      value={roleFilter}
                      onChange={(e: any) => setRoleFilter(e.target.value)}
                      className="bg-surface-2 border border-border rounded-xl px-2.5 py-2 text-xs font-bold text-text-secondary focus:outline-none cursor-pointer"
                    >
                      <option value="all">All Roles</option>
                      <option value="admin">Admins Only</option>
                      <option value="user">Users Only</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black uppercase tracking-wider text-text-muted">Sort By</label>
                    <select
                      value={userSortOrder}
                      onChange={(e: any) => setUserSortOrder(e.target.value)}
                      className="bg-surface-2 border border-border rounded-xl px-2.5 py-2 text-xs font-bold text-text-secondary focus:outline-none cursor-pointer"
                    >
                      <option value="name_asc">Name (A-Z)</option>
                      <option value="name_desc">Name (Z-A)</option>
                      <option value="joined_newest">Joined Newest</option>
                      <option value="joined_oldest">Joined Oldest</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* User Buttons List */}
              <div className="flex flex-col gap-3.5 max-h-[580px] overflow-y-auto pr-0.5 no-scrollbar">
                {isLoadingProfiles ? (
                  <div className="flex flex-col justify-center items-center py-16 gap-3">
                    <div className="w-8 h-8 border-2 border-transparent border-t-brand rounded-full animate-spin" />
                    <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">Loading Users...</span>
                  </div>
                ) : filteredProfiles.length === 0 ? (
                  <div className="text-center text-text-muted text-xs py-10 border border-dashed border-border/60 rounded-xl bg-surface-2/20">
                    No users match your criteria
                  </div>
                ) : (
                  filteredProfiles.map((p) => {
                    const isSelected = p.id === selectedUserId
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedUserId(p.id)}
                        className={`flex shrink-0 items-center gap-4 px-5 h-20 rounded-2xl border text-left transition-all w-full relative overflow-hidden group ${
                          isSelected
                            ? 'bg-brand border-brand border-l-4 border-l-text-inverse text-text-inverse shadow-brand/35 shadow-lg scale-[1.01]'
                            : 'bg-surface-2/30 border-border/80 border-l-4 border-l-transparent text-text-secondary hover:text-text-primary hover:bg-surface-3/50 hover:border-border-hover'
                        }`}
                      >
                        <div className="w-11 h-11 rounded-full border border-border bg-surface-2 overflow-hidden flex items-center justify-center font-bold shrink-0 shadow-md">
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                          ) : (
                            (p.display_name || p.username || 'U').charAt(0).toUpperCase()
                          )}
                        </div>

                        <div className="truncate flex-1">
                          <div className={`font-bold text-sm truncate ${isSelected ? 'text-text-inverse' : 'text-text-primary'}`}>
                            {p.display_name || p.username || 'User'}
                          </div>
                          <div className={`text-xs truncate ${isSelected ? 'opacity-80' : 'text-text-muted'} flex items-center gap-2 mt-1`}>
                            <span>@{p.username || 'username'}</span>
                            {p.role === 'admin' ? (
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                isSelected ? 'bg-text-inverse/20 text-text-inverse' : 'bg-brand-muted text-brand'
                              }`}>
                                Admin
                              </span>
                            ) : (
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                                isSelected ? 'bg-text-inverse/15 text-text-inverse/90 border border-text-inverse/10' : 'bg-surface-3 text-text-muted border border-border/60'
                              }`}>
                                User
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {p.country && (
                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                              isSelected ? 'bg-text-inverse/10 text-text-inverse/90' : 'bg-surface-3/80 text-text-secondary border border-border/40'
                            }`}>
                              {p.country}
                            </span>
                          )}
                          {(unpredictedCounts[p.id] || 0) > 0 && (
                            <span 
                              title={`${unpredictedCounts[p.id]} games starting in < 24h unpredicted`}
                              className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1 ${
                                isSelected 
                                  ? 'bg-text-inverse text-brand font-black shadow-sm' 
                                  : 'bg-live-muted text-live border border-live/35 animate-pulse'
                              }`}
                            >
                              ⏳ {unpredictedCounts[p.id]}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Area - Predictions Dashboard */}
          <div className={`lg:col-span-8 space-y-6 ${selectedUserId ? 'block' : 'hidden lg:block'}`}>
            {selectedUserId && (
              <button
                onClick={() => setSelectedUserId(null)}
                className="lg:hidden flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl bg-surface-2 border border-border text-xs font-bold text-brand hover:text-brand-dim transition-all w-fit cursor-pointer"
              >
                <span>←</span> Back to User Directory
              </button>
            )}

            {!selectedUserId ? (
              <div className="glass p-12 rounded-2xl text-center border border-border/80 max-w-lg mx-auto my-12 flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-3xl shadow-sm">
                  👤
                </div>
                <div>
                  <h3 className="font-display font-bold text-lg text-text-primary">
                    Select a User Profile
                  </h3>
                  <p className="mt-1 text-sm text-text-secondary max-w-sm">
                    Select any profile from the sidebar directory to view their match predictions and stage forecasts.
                  </p>
                </div>
              </div>
            ) : (
              <UserPredictionsView 
                userId={selectedUserId} 
                profile={selectedProfile} 
                showWarning={true} 
              />
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
