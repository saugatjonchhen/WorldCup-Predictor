import { useParams, Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'

interface Match {
  id: string
  external_match_id: string
  home_team: string
  away_team: string
  home_team_ext_id: string
  away_team_ext_id: string
  kickoff_time: string
  status: string
  home_score: number | null
  away_score: number | null
  home_team_info?: { flag_url: string } | null
  away_team_info?: { flag_url: string } | null
}

interface Prediction {
  id: string
  match_id: string
  user_id: string
  home_score_pred: number
  away_score_pred: number
}

interface PoolDetailData {
  id: string
  name: string
  description: string | null
  invite_code: string
  created_by: string
}

interface MemberLeaderboardEntry {
  profile_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  total_points: number
  correct_scores: number
  correct_outcomes: number
  rank: number
}

interface PoolMember {
  id: string
  role: string
  joined_at: string
  user_id: string
  profiles: {
    id: string
    username: string | null
    display_name: string | null
    avatar_url: string | null
    country: string | null
  } | null
}

export default function PoolDetail() {
  const { poolId } = useParams<{ poolId: string }>()
  const { user } = useAuth()

  // 1. Fetch pool details
  const { data: pool, isLoading: isLoadingPool } = useQuery<PoolDetailData>({
    queryKey: ['pool', poolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pools')
        .select('*')
        .eq('id', poolId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!poolId,
  })

  // 2. Fetch leaderboard for this specific pool
  const { data: standings = [], isLoading: isLoadingStandings } = useQuery<MemberLeaderboardEntry[]>({
    queryKey: ['pool-leaderboard', poolId],
    queryFn: async () => {
      if (!poolId) return []

      const { data: poolData, error: poolError } = await supabase
        .from('leaderboard_pool')
        .select('*')
        .eq('pool_id', poolId)
        .order('pool_rank', { ascending: true })

      if (poolError) throw poolError
      if (!poolData || poolData.length === 0) return []

      const userIds = poolData.map((entry: any) => entry.user_id)
      const { data: globalData, error: globalError } = await supabase
        .from('leaderboard_global')
        .select('user_id, exact_scores, correct_results')
        .in('user_id', userIds)

      const globalStatsMap = new Map<string, { exact_scores: number; correct_results: number }>()
      if (!globalError && globalData) {
        globalData.forEach((g: any) => {
          globalStatsMap.set(g.user_id, {
            exact_scores: g.exact_scores,
            correct_results: g.correct_results
          })
        })
      }

      return poolData.map((entry: any) => ({
        profile_id: entry.user_id,
        username: entry.username,
        display_name: entry.display_name,
        avatar_url: entry.avatar_url,
        total_points: entry.total_points,
        correct_scores: globalStatsMap.get(entry.user_id)?.exact_scores ?? 0,
        correct_outcomes: globalStatsMap.get(entry.user_id)?.correct_results ?? 0,
        rank: entry.pool_rank
      })) as MemberLeaderboardEntry[]
    },
    enabled: !!poolId,
  })

  // 3. Fetch pool members list
  const { data: members = [], isLoading: isLoadingMembers, refetch: refetchMembers } = useQuery<PoolMember[]>({
    queryKey: ['pool-members', poolId],
    queryFn: async () => {
      if (!poolId) return []

      const { data, error } = await supabase
        .from('pool_members')
        .select(`
          id,
          role,
          joined_at,
          user_id,
          profiles:user_id (
            id,
            username,
            display_name,
            avatar_url,
            country
          )
        `)
        .eq('pool_id', poolId)
        .order('joined_at', { ascending: true })

      if (error) throw error
      return data as any[]
    },
    enabled: !!poolId,
  })

  // 4. Fetch the most recently locked matches
  const { data: recentMatches = [], isLoading: isLoadingRecentMatches } = useQuery<Match[]>({
    queryKey: ['recent-locked-matches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          home_team_info:teams!home_team_ext_id(flag_url),
          away_team_info:teams!away_team_ext_id(flag_url)
        `)

      if (error) throw error

      const matches = data as unknown as Match[]
      const now = new Date().getTime()
      
      const lockedMatches = matches.filter(match => {
        const kickoffDate = new Date(match.kickoff_time).getTime()
        const deadline = kickoffDate - 2 * 60 * 60 * 1000
        return now > deadline || match.status === 'live' || match.status === 'completed'
      })
      
      if (lockedMatches.length === 0) return []
      
      lockedMatches.sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime())
      
      const mostRecentKickoff = lockedMatches[0].kickoff_time
      
      return lockedMatches.filter(match => match.kickoff_time === mostRecentKickoff)
    }
  })

  // 5. Fetch predictions for these recent matches for pool members
  const { data: recentPredictions = [], isLoading: isLoadingRecentPreds } = useQuery<Prediction[]>({
    queryKey: ['pool-recent-predictions', poolId, recentMatches.map(m => m.id).join(',')],
    queryFn: async () => {
      if (recentMatches.length === 0 || members.length === 0) return []
      
      const matchIds = recentMatches.map(m => m.id)
      const userIds = members.map(m => m.user_id)
      
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .in('match_id', matchIds)
        .in('user_id', userIds)
        
      if (error) throw error
      return data as Prediction[]
    },
    enabled: recentMatches.length > 0 && members.length > 0
  })

  const handleRemoveMember = async (memberId: string, memberUsername: string) => {
    if (!window.confirm(`Are you sure you want to remove @${memberUsername} from this pool?`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('pool_members')
        .delete()
        .eq('id', memberId)

      if (error) throw error

      alert('Member removed successfully')
      refetchMembers()
    } catch (err: any) {
      console.error('Error removing member:', err)
      alert(err.message || 'Failed to remove member')
    }
  }

  const currentMember = members.find(m => m.user_id === user?.id)
  const isCurrentUserAdmin = currentMember?.role === 'admin' || pool?.created_by === user?.id

  const isLoading = isLoadingPool || isLoadingStandings || isLoadingMembers || isLoadingRecentMatches || isLoadingRecentPreds

  const renderMatchCard = (match: Match) => (
    <div key={match.id} className="glass rounded-xl border border-border overflow-hidden p-5 flex flex-col gap-4">
       {/* Match header */}
       <div className="flex items-center justify-between border-b border-border/40 pb-3">
         <div className="flex items-center gap-3">
           <div className="flex flex-col items-center gap-1">
             <img src={match.home_team_info?.flag_url || 'https://flagcdn.com/w80/un.png'} alt={match.home_team} className="w-8 h-5 object-cover rounded border border-border/40" />
             <span className="text-[10px] font-bold tracking-tight w-12 text-center truncate">{match.home_team}</span>
           </div>
           
           <div className="flex flex-col items-center justify-center">
             {match.status === 'scheduled' ? (
               <span className="text-xs font-black text-text-muted">VS</span>
             ) : (
               <div className="flex items-center gap-1.5 bg-surface-2 px-2 py-1 rounded-md border border-border text-sm font-black">
                 <span>{match.home_score ?? '-'}</span>
                 <span className="text-[10px] text-text-muted">:</span>
                 <span>{match.away_score ?? '-'}</span>
               </div>
             )}
           </div>

           <div className="flex flex-col items-center gap-1">
             <img src={match.away_team_info?.flag_url || 'https://flagcdn.com/w80/un.png'} alt={match.away_team} className="w-8 h-5 object-cover rounded border border-border/40" />
             <span className="text-[10px] font-bold tracking-tight w-12 text-center truncate">{match.away_team}</span>
           </div>
         </div>
         <div className="flex flex-col items-end gap-1">
           {match.status === 'live' ? (
              <span className="text-[10px] bg-live-muted text-live font-bold px-1.5 py-0.5 rounded animate-pulse">LIVE</span>
           ) : match.status === 'completed' ? (
              <span className="text-[10px] bg-surface-3 text-text-secondary font-bold px-1.5 py-0.5 rounded">FINAL</span>
           ) : (
              <span className="text-[10px] bg-surface-3 text-text-muted font-bold px-1.5 py-0.5 rounded">LOCKED</span>
           )}
         </div>
       </div>
       
       {/* Predictions List */}
       <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
         {members.map(member => {
           const pred = recentPredictions.find(p => p.match_id === match.id && p.user_id === member.user_id)
           const profile = member.profiles
           const displayName = profile?.display_name || profile?.username || 'Unknown User'
           return (
             <div key={member.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/20 last:border-0 hover:bg-surface-2/30 rounded px-2 -mx-2 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-surface-3 overflow-hidden flex items-center justify-center text-[10px] font-bold text-gradient border border-border/50">
                    {profile?.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover" /> : displayName.charAt(0)}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-text-primary">{displayName}</span>
                  </div>
                </div>
                <div className="font-mono font-bold text-sm">
                  {pred ? (
                    <div className="flex items-center gap-1.5 bg-surface-2 px-2 py-0.5 rounded border border-border/50 text-brand">
                      <span>{pred.home_score_pred}</span>
                      <span className="text-[10px] text-text-muted">-</span>
                      <span>{pred.away_score_pred}</span>
                    </div>
                  ) : (
                    <span className="text-text-muted text-[10px] italic bg-surface-2 px-2 py-1 rounded border border-border/30">No pred</span>
                  )}
                </div>
             </div>
           )
         })}
       </div>
    </div>
  )

  return (
    <Layout>
      <div className="space-y-8">
        {/* Navigation link back */}
        <Link to="/pools" className="text-sm font-semibold text-brand hover:text-brand-dim transition-colors flex items-center gap-1">
          ← Back to Pools
        </Link>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-2 border-transparent border-t-brand rounded-full animate-spin" />
          </div>
        ) : !pool ? (
          <div className="glass p-10 rounded-xl text-center border border-border/80 max-w-md mx-auto">
            <h3 className="font-display font-bold text-lg text-text-primary">Pool not found</h3>
            <p className="text-sm text-text-secondary mt-2">The pool you are looking for does not exist or you lack authorization to view it.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Header metadata card */}
            <div className="glass p-6 sm:p-8 rounded-2xl border border-border/80 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <span className="text-xs font-semibold text-brand bg-brand-muted px-2.5 py-1 rounded-full border border-brand/10">
                  Private Pool
                </span>
                <h1 className="text-3xl font-extrabold font-display text-text-primary mt-3">
                  {pool.name}
                </h1>
                <p className="text-sm text-text-secondary mt-1 max-w-xl">
                  {pool.description || 'No description provided for this league.'}
                </p>
              </div>

              {/* Invitation Token widget */}
              <div className="bg-surface-2 border border-border p-4 rounded-xl flex flex-col items-center gap-1.5 min-w-[200px] text-center">
                <span className="text-xs text-text-secondary font-semibold uppercase">Invite Code</span>
                <span className="font-mono text-xl font-black text-brand tracking-wider select-all">
                  {pool.invite_code}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(pool.invite_code)
                    alert('Invite code copied to clipboard!')
                  }}
                  className="text-[10px] text-text-muted hover:text-text-primary font-bold underline cursor-pointer"
                >
                  Copy Code
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {recentMatches.length > 1 && (
                <div className="lg:col-span-3 space-y-4">
                  <h2 className="text-xl font-bold font-display flex items-center gap-2">
                    <span>🎯</span> Live/Recent Match Predictions
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {recentMatches.map(renderMatchCard)}
                  </div>
                </div>
              )}

              {/* Pool Leaderboard Standings (col-span-2) */}
              <div className="lg:col-span-2 space-y-4">
                <h2 className="text-xl font-bold font-display flex items-center gap-2">
                  <span>🏆</span> Leaderboard Standings
                </h2>

                <div className="glass rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-2 border-b border-border text-xs text-text-secondary font-bold uppercase tracking-wider">
                          <th className="py-3 px-4 text-center w-16">Rank</th>
                          <th className="py-3 px-4">Player</th>
                          <th className="py-3 px-4 text-center">Correct Scores</th>
                          <th className="py-3 px-4 text-center">Correct Outcomes</th>
                          <th className="py-3 px-4 text-right pr-6 w-28">Points</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 text-sm">
                        {standings.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-text-secondary">
                              No matches have finished yet to populate points. Check back after kickoff!
                            </td>
                          </tr>
                        ) : (
                          standings.map((entry) => (
                            <tr key={entry.profile_id} className="hover:bg-surface-2/40 transition-colors">
                              {/* Rank Column */}
                              <td className="py-3.5 px-4 text-center font-bold">
                                {entry.rank === 1 ? (
                                  <span className="text-gold text-base">👑</span>
                                ) : entry.rank === 2 ? (
                                  <span className="text-gray-400">🥈</span>
                                ) : entry.rank === 3 ? (
                                  <span className="text-amber-700">🥉</span>
                                ) : (
                                  entry.rank
                                )}
                              </td>

                              {/* User details */}
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full border border-border bg-surface-3 flex items-center justify-center font-bold text-xs text-gradient overflow-hidden">
                                    {entry.avatar_url ? (
                                      <img src={entry.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                                    ) : (
                                      (entry.display_name || entry.username || 'U').charAt(0).toUpperCase()
                                    )}
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="font-bold text-text-primary text-xs sm:text-sm">
                                      {entry.display_name || entry.username}
                                    </span>
                                    <span className="text-[10px] text-text-secondary">
                                      @{entry.username}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Correct scores stats */}
                              <td className="py-3.5 px-4 text-center font-semibold text-text-secondary">
                                {entry.correct_scores}
                              </td>

                              {/* Correct outcomes stats */}
                              <td className="py-3.5 px-4 text-center font-semibold text-text-secondary">
                                {entry.correct_outcomes}
                              </td>

                              {/* Total points */}
                              <td className="py-3.5 px-4 text-right font-black text-brand text-sm sm:text-base pr-6">
                                {entry.total_points} pts
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Right Column: Pool Members & Single Match Prediction (col-span-1) */}
              <div className="space-y-8 lg:col-span-1">
                {recentMatches.length === 1 && (
                  <div className="space-y-4">
                    <h2 className="text-xl font-bold font-display flex items-center gap-2">
                      <span>🎯</span> Live Prediction
                    </h2>
                    {renderMatchCard(recentMatches[0])}
                  </div>
                )}
                
                <div className="space-y-4">
                  <h2 className="text-xl font-bold font-display flex items-center gap-2">
                    <span>👥</span> Pool Members ({members.length})
                  </h2>

                <div className="glass p-4 rounded-xl border border-border/80 divide-y divide-border/40 max-h-[500px] overflow-y-auto">
                  {members.map((member) => {
                    const profile = member.profiles
                    const displayName = profile?.display_name || profile?.username || 'Unknown User'
                    const username = profile?.username || 'unknown'
                    const isSelf = member.user_id === user?.id

                    return (
                      <div key={member.id} className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full border border-border bg-surface-3 flex items-center justify-center font-bold text-xs text-gradient overflow-hidden flex-shrink-0">
                            {profile?.avatar_url ? (
                              <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                            ) : (
                              displayName.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-text-primary text-xs sm:text-sm truncate">
                              {displayName} {isSelf && <span className="text-[10px] text-brand ml-1 font-semibold">(You)</span>}
                            </span>
                            <span className="text-[10px] text-text-secondary truncate">
                              @{username}
                            </span>
                            <span className="text-[9px] text-text-muted mt-0.5">
                              Joined {new Date(member.joined_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {member.role === 'admin' ? (
                            <span className="text-[10px] font-semibold text-brand bg-brand-muted px-2 py-0.5 rounded border border-brand/20">
                              Admin
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-text-secondary bg-surface-3 px-2 py-0.5 rounded border border-border">
                              Member
                            </span>
                          )}

                          {isCurrentUserAdmin && !isSelf && (
                            <button
                              onClick={() => handleRemoveMember(member.id, username)}
                              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-500/10 rounded transition-colors"
                              title="Remove member"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
    </Layout>
  )
}
