import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Match {
  id: string
  external_match_id: string
  home_team: string
  away_team: string
  home_team_ext_id: string
  away_team_ext_id: string
  kickoff_time: string
  stage: string
  group_name: string
  matchday: number
  status: string
  home_score: number | null
  away_score: number | null
  home_score_et?: number | null
  away_score_et?: number | null
  penalty_winner?: string | null
  home_team_info?: { flag_url: string } | null
  away_team_info?: { flag_url: string } | null
}

interface Prediction {
  id: string
  match_id: string
  user_id: string
  home_score_pred: number
  away_score_pred: number
  points_earned?: number
  correct_result?: boolean
  correct_goal_diff?: boolean
  exact_score?: boolean
}

const getTooltipBreakdown = (pred: Prediction) => {
  const breakdown: { icon: string; name: string; pts: number }[] = []
  if (pred.exact_score) {
    breakdown.push({ icon: '🏆', name: 'Outcome', pts: 3 })
    breakdown.push({ icon: '📊', name: 'Goal Diff', pts: 2 })
    breakdown.push({ icon: '🎯', name: 'Exact Score', pts: 5 })
  } else {
    if (pred.correct_result) breakdown.push({ icon: '🏆', name: 'Outcome', pts: 3 })
    if (pred.correct_goal_diff) breakdown.push({ icon: '📊', name: 'Goal Diff', pts: 2 })
  }
  if (pred.points_earned && pred.points_earned > 0) {
    const currentSum = (pred.exact_score ? 10 : 0) + (!pred.exact_score && pred.correct_result ? 3 : 0) + (!pred.exact_score && pred.correct_goal_diff ? 2 : 0)
    if (pred.points_earned > currentSum) {
      breakdown.push({ icon: '🔮', name: 'Advancing', pts: pred.points_earned - currentSum })
    }
  }
  return breakdown
}

interface PoolDetailData {
  id: string
  name: string
  description: string | null
  invite_code: string
  created_by: string
  prizes?: {
    first: string
    second: string
    third: string
    additional?: string[]
  } | null
}

interface MemberLeaderboardEntry {
  profile_id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  total_points: number
  correct_scores: number
  correct_outcomes: number
  stage_points: number
  rank: number
}

interface StagePrediction {
  id: string
  stage: string
  team_id: string
  team: {
    name: string
    flag_url: string | null
    fifa_code: string
  }
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
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<'leaderboard' | 'predictions' | 'prizes'>('leaderboard')
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [activeTooltipId, setActiveTooltipId] = useState<string | null>(null)
  const [selectedUserEntry, setSelectedUserEntry] = useState<MemberLeaderboardEntry | null>(null)
  const [modalTab, setModalTab] = useState<'outcomes' | 'scores' | 'bracket'>('outcomes')

  // Prizes states
  const [isEditingPrizes, setIsEditingPrizes] = useState(false)
  const [firstPrize, setFirstPrize] = useState('')
  const [secondPrize, setSecondPrize] = useState('')
  const [thirdPrize, setThirdPrize] = useState('')
  const [additionalPrizes, setAdditionalPrizes] = useState<string[]>([])
  const [isSavingPrizes, setIsSavingPrizes] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedUserEntry) {
      setModalTab('outcomes')
    }
  }, [selectedUserEntry])

  useEffect(() => {
    const handleGlobalClick = () => setActiveTooltipId(null)
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

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
  })

  useEffect(() => {
    if (pool?.prizes) {
      setFirstPrize(pool.prizes.first || '')
      setSecondPrize(pool.prizes.second || '')
      setThirdPrize(pool.prizes.third || '')
      setAdditionalPrizes(pool.prizes.additional || [])
    } else {
      setFirstPrize('')
      setSecondPrize('')
      setThirdPrize('')
      setAdditionalPrizes([])
    }
  }, [pool])

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
        stage_points: entry.stage_points ?? 0,
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

  // 6. Fetch all matches
  const { data: allMatches = [], isLoading: isLoadingAllMatches } = useQuery<Match[]>({
    queryKey: ['all-matches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          home_team_info:teams!home_team_ext_id(flag_url),
          away_team_info:teams!away_team_ext_id(flag_url)
        `)
        .order('kickoff_time', { ascending: true })

      if (error) throw error
      return data as unknown as Match[]
    }
  })

  // Filter matches to find locked ones, sorted latest kickoff first
  const now = new Date().getTime()
  const lockedMatches = allMatches
    .filter(match => {
      const kickoffDate = new Date(match.kickoff_time).getTime()
      const deadline = kickoffDate - 2 * 60 * 60 * 1000
      return now > deadline || match.status === 'live' || match.status === 'completed'
    })
    .sort((a, b) => new Date(b.kickoff_time).getTime() - new Date(a.kickoff_time).getTime())

  const selectedMatch = lockedMatches.find(m => m.id === selectedMatchId)

  // Set the default selected match
  useEffect(() => {
    if (lockedMatches.length > 0 && !selectedMatchId) {
      setSelectedMatchId(lockedMatches[0].id)
    }
  }, [lockedMatches, selectedMatchId])

  // 7. Fetch predictions for the selected match
  const { data: selectedMatchPredictions = [], isLoading: isLoadingSelectedMatchPreds } = useQuery<Prediction[]>({
    queryKey: ['pool-match-predictions', poolId, selectedMatchId],
    queryFn: async () => {
      if (!poolId || !selectedMatchId || members.length === 0) return []
      
      const userIds = members.map(m => m.user_id)
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('match_id', selectedMatchId)
        .in('user_id', userIds)
        
      if (error) throw error
      return data as Prediction[]
    },
    enabled: !!poolId && !!selectedMatchId && members.length > 0
  })

  // Fetch predictions for the selected user in the modal
  const { data: userPredictions = [], isLoading: isLoadingUserPredictions } = useQuery<Prediction[]>({
    queryKey: ['user-predictions-breakdown', selectedUserEntry?.profile_id],
    queryFn: async () => {
      if (!selectedUserEntry?.profile_id) return []
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', selectedUserEntry.profile_id)
      
      if (error) throw error
      return data as Prediction[]
    },
    enabled: !!selectedUserEntry?.profile_id
  })

  // Fetch stage predictions for the selected user in the modal
  const { data: userStagePredictions = [], isLoading: isLoadingUserStagePredictions } = useQuery<StagePrediction[]>({
    queryKey: ['user-stage-predictions-breakdown', selectedUserEntry?.profile_id],
    queryFn: async () => {
      if (!selectedUserEntry?.profile_id) return []
      const { data, error } = await supabase
        .from('stage_predictions')
        .select(`
          *,
          team:teams!team_id(name, flag_url, fifa_code)
        `)
        .eq('user_id', selectedUserEntry.profile_id)
      
      if (error) throw error
      return data as unknown as StagePrediction[]
    },
    enabled: !!selectedUserEntry?.profile_id
  })

  const isStagePredictionCorrect = (sp: StagePrediction, matches: Match[]) => {
    const isWinnerOfMatch = (match: Match, teamId: string) => {
      if (match.status !== 'completed') return false
      
      const isHome = match.home_team_ext_id === teamId
      const isAway = match.away_team_ext_id === teamId
      if (!isHome && !isAway) return false
      
      if (match.penalty_winner) {
        return (isHome && match.penalty_winner === match.home_team) || 
               (isAway && match.penalty_winner === match.away_team)
      }
      
      const homeScore = (match.home_score ?? 0) + (match.home_score_et ?? 0)
      const awayScore = (match.away_score ?? 0) + (match.away_score_et ?? 0)
      
      if (homeScore > awayScore) return isHome
      if (awayScore > homeScore) return isAway
      return false
    }

    if (sp.stage === 'round_of_16') {
      const ro32Match = matches.find(m => 
        m.stage === 'round_of_32' && 
        (m.home_team_ext_id === sp.team_id || m.away_team_ext_id === sp.team_id)
      )
      return ro32Match ? isWinnerOfMatch(ro32Match, sp.team_id) : false
    }
    if (sp.stage === 'qf') {
      const ro16Match = matches.find(m => 
        m.stage === 'round_of_16' && 
        (m.home_team_ext_id === sp.team_id || m.away_team_ext_id === sp.team_id)
      )
      return ro16Match ? isWinnerOfMatch(ro16Match, sp.team_id) : false
    }
    if (sp.stage === 'sf') {
      const qfMatch = matches.find(m => 
        m.stage === 'qf' && 
        (m.home_team_ext_id === sp.team_id || m.away_team_ext_id === sp.team_id)
      )
      return qfMatch ? isWinnerOfMatch(qfMatch, sp.team_id) : false
    }
    if (sp.stage === 'final') {
      const sfMatch = matches.find(m => 
        m.stage === 'sf' && 
        (m.home_team_ext_id === sp.team_id || m.away_team_ext_id === sp.team_id)
      )
      return sfMatch ? isWinnerOfMatch(sfMatch, sp.team_id) : false
    }
    if (sp.stage === 'winner') {
      const finalMatch = matches.find(m => m.stage === 'final')
      return finalMatch ? isWinnerOfMatch(finalMatch, sp.team_id) : false
    }
    return false
  }

  const correctScoreMatches = userPredictions
    .filter(p => p.exact_score)
    .map(p => {
      const match = allMatches.find(m => m.id === p.match_id)
      return { pred: p, match }
    })
    .filter((item): item is { pred: Prediction; match: Match } => !!item.match)

  const correctOutcomeMatches = userPredictions
    .filter(p => p.correct_result)
    .map(p => {
      const match = allMatches.find(m => m.id === p.match_id)
      return { pred: p, match }
    })
    .filter((item): item is { pred: Prediction; match: Match } => !!item.match)

  const correctStagePredictions = userStagePredictions
    .filter(sp => isStagePredictionCorrect(sp, allMatches))
    .map(sp => {
      let pts = 2
      let stageLabel = 'Round of 16'
      if (sp.stage === 'qf') { stageLabel = 'Quarterfinals' }
      else if (sp.stage === 'sf') { stageLabel = 'Semifinals' }
      else if (sp.stage === 'final') { stageLabel = 'Finals' }
      else if (sp.stage === 'winner') { stageLabel = 'Champion'; pts = 20 }
      return { sp, stageLabel, pts }
    })

  const renderModalMatchRow = (item: { pred: Prediction; match: Match }) => {
    const { pred, match } = item
    return (
      <div key={pred.id} className="flex items-center justify-between p-3 bg-surface-2 border border-border/50 rounded-xl text-xs gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex flex-col items-center gap-0.5 min-w-[36px] flex-shrink-0">
            <img src={match.home_team_info?.flag_url || 'https://flagcdn.com/w80/un.png'} className="w-6 h-4 object-cover rounded border border-border/30" />
            <span className="text-[9px] font-bold text-text-secondary truncate w-10 text-center">{match.home_team}</span>
          </div>
          <div className="flex flex-col items-center justify-center px-1">
            <span className="font-black text-text-primary text-[10px] bg-surface-3 px-1.5 py-0.5 rounded">
              {match.home_score} : {match.away_score}
            </span>
          </div>
          <div className="flex flex-col items-center gap-0.5 min-w-[36px] flex-shrink-0">
            <img src={match.away_team_info?.flag_url || 'https://flagcdn.com/w80/un.png'} className="w-6 h-4 object-cover rounded border border-border/30" />
            <span className="text-[9px] font-bold text-text-secondary truncate w-10 text-center">{match.away_team}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 flex-shrink-0 text-right">
          <span className="text-[10px] text-text-secondary font-medium">
            Pred: <strong className="text-text-primary font-bold">{pred.home_score_pred} - {pred.away_score_pred}</strong>
          </span>
          <span className="text-[9px] font-black bg-brand/10 text-brand px-1.5 py-0.5 rounded border border-brand/20">
            +{pred.points_earned ?? 0} pts
          </span>
        </div>
      </div>
    )
  }

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

  const handleSavePrizes = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!poolId) return
    setIsSavingPrizes(true)
    setSaveError(null)

    try {
      const { error } = await supabase
        .from('pools')
        .update({
          prizes: {
            first: firstPrize.trim(),
            second: secondPrize.trim(),
            third: thirdPrize.trim(),
            additional: additionalPrizes.map(p => p.trim()).filter(Boolean)
          }
        })
        .eq('id', poolId)

      if (error) throw error
      setIsEditingPrizes(false)
      queryClient.invalidateQueries({ queryKey: ['pool', poolId] })
    } catch (err: any) {
      console.error('Error updating prizes:', err)
      setSaveError(err.message || 'Failed to update prizes.')
    } finally {
      setIsSavingPrizes(false)
    }
  }

  const handleAddAdditionalPrize = () => {
    setAdditionalPrizes([...additionalPrizes, ''])
  }

  const handleRemoveAdditionalPrize = (index: number) => {
    setAdditionalPrizes(additionalPrizes.filter((_, i) => i !== index))
  }

  const handleAdditionalPrizeChange = (index: number, value: string) => {
    const updated = [...additionalPrizes]
    updated[index] = value
    setAdditionalPrizes(updated)
  }

  const currentMember = members.find(m => m.user_id === user?.id)
  const isCurrentUserAdmin = currentMember?.role === 'admin' || pool?.created_by === user?.id

  const isLoading = isLoadingPool || isLoadingStandings || isLoadingMembers || isLoadingRecentMatches || isLoadingRecentPreds || isLoadingAllMatches

  const sortedStandings = [...standings].sort((a, b) => {
    if (b.total_points !== a.total_points) {
      return b.total_points - a.total_points
    }
    const nameA = (a.display_name || a.username || '').toLowerCase()
    const nameB = (b.display_name || b.username || '').toLowerCase()
    return nameA.localeCompare(nameB)
  })

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
                    <div className="flex items-center gap-2">
                      <div 
                        className="relative group cursor-help"
                        onClick={(e) => {
                          e.stopPropagation()
                          const key = `${match.id}-${member.user_id}`
                          setActiveTooltipId(activeTooltipId === key ? null : key)
                        }}
                      >
                        <div className="flex items-center gap-1.5 bg-surface-2 px-2 py-0.5 rounded border border-border/50 text-text-primary hover:border-brand/40 transition-colors">
                          <span>{pred.home_score_pred}</span>
                          <span className="text-[10px] text-text-muted">-</span>
                          <span>{pred.away_score_pred}</span>
                        </div>
                        {(match.status === 'completed' || match.status === 'live') && (
                          <div className={`absolute right-full top-1/2 -translate-y-1/2 mr-3 w-44 bg-surface-3 border border-border text-[9px] text-text-primary p-2.5 rounded-xl shadow-xl transition-all duration-150 z-50 text-left font-sans font-normal normal-case ${
                            activeTooltipId === `${match.id}-${member.user_id}`
                              ? 'opacity-100 scale-100 pointer-events-auto'
                              : 'opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto'
                          }`}>
                            <div className="font-bold border-b border-border/40 pb-1 mb-1.5 text-brand text-[10px]">Points Breakdown</div>
                            {(() => {
                              const items = getTooltipBreakdown(pred)
                              return items.length === 0 ? (
                                <div className="text-text-muted text-[9px] italic">No points scored</div>
                              ) : (
                                <div className="space-y-1">
                                  {items.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-[9px] font-semibold text-text-secondary">
                                      <span>{item.icon} {item.name}</span>
                                      <span className="text-brand font-bold">+{item.pts}</span>
                                    </div>
                                  ))}
                                  <div className="border-t border-border/40 pt-1 mt-1.5 flex items-center justify-between text-[10px] font-black text-text-primary">
                                    <span>Total</span>
                                    <span className="text-brand">{pred.points_earned ?? 0} pts</span>
                                  </div>
                                </div>
                              )
                            })()}
                            <div className="absolute left-full top-1/2 -translate-y-1/2 -ml-1 border-4 border-transparent border-l-surface-3"></div>
                          </div>
                        )}
                      </div>
                      {(match.status === 'completed' || match.status === 'live') && (
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                          (pred.points_earned ?? 0) > 0
                            ? 'bg-brand/10 text-brand border border-brand/20'
                            : 'bg-surface-3 text-text-muted border border-border/50'
                        }`}>
                          {pred.points_earned ?? 0} pts
                        </span>
                      )}
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

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1.5 bg-surface-2/40 p-1 border border-border/80 rounded-xl max-w-md">
              <button
                onClick={() => setActiveTab('leaderboard')}
                className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'leaderboard'
                    ? 'bg-brand text-text-inverse shadow-brand'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                🏆 Leaderboard
              </button>
              <button
                onClick={() => setActiveTab('predictions')}
                className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'predictions'
                    ? 'bg-brand text-text-inverse shadow-brand'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                📅 Predictions
              </button>
              <button
                onClick={() => setActiveTab('prizes')}
                className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                  activeTab === 'prizes'
                    ? 'bg-brand text-text-inverse shadow-brand'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                🎁 Prizes
              </button>
            </div>

            {activeTab === 'leaderboard' ? (
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
                            <th className="py-3 px-4 text-center">Bracket Pts</th>
                            <th className="py-3 px-4 text-right pr-6 w-28">Points</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 text-sm">
                          {sortedStandings.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-text-secondary">
                                No matches have finished yet to populate points. Check back after kickoff!
                              </td>
                            </tr>
                          ) : (
                            sortedStandings.map((entry) => (
                              <tr 
                                key={entry.profile_id} 
                                className="hover:bg-surface-2/60 transition-colors cursor-pointer"
                                onClick={() => setSelectedUserEntry(entry)}
                              >
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

                                {/* Bracket points stats */}
                                <td className="py-3.5 px-4 text-center font-semibold text-text-secondary">
                                  {entry.stage_points}
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
            ) : activeTab === 'predictions' ? (
              // Predictions tab
              <div className="glass p-6 rounded-2xl border border-border/80 space-y-6">
                <div className="border-b border-border/40 pb-4">
                  <h2 className="text-xl font-bold font-display flex items-center gap-2">
                    <span>📅</span> Predictions by Match
                  </h2>
                  <p className="text-text-secondary text-xs mt-1">
                    Select a locked match from the left pane to view predictions of all players in this pool.
                  </p>
                </div>

                {lockedMatches.length === 0 ? (
                  <div className="text-center py-12">
                    <span className="text-4xl block mb-3">🕵️‍♂️</span>
                    <h3 className="font-display font-bold text-base text-text-primary">No Locked Matches Yet</h3>
                    <p className="text-xs text-text-secondary mt-1 max-w-md mx-auto">
                      Predictions from other players will be shown here once match submissions lock (2 hours before kickoff).
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-stretch">
                    {/* Left Pane: Locked Matches List */}
                    <div className="md:col-span-2 flex flex-col h-full">
                      <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-3 px-1">
                        Locked Matches ({lockedMatches.length})
                      </h3>
                      <div className="flex md:flex-col gap-2 overflow-x-auto md:overflow-x-visible md:overflow-y-auto md:flex-1 no-scrollbar pr-1 pb-2 md:pb-0">
                        {lockedMatches.map((match) => {
                          const isSelected = match.id === selectedMatchId
                          return (
                            <button
                              key={match.id}
                              onClick={() => setSelectedMatchId(match.id)}
                              className={`flex-shrink-0 w-[240px] md:w-full text-left p-3.5 rounded-xl border transition-all flex flex-col gap-2 ${
                                isSelected
                                  ? 'bg-surface-3 border-brand/50 ring-1 ring-brand/30 shadow-md'
                                  : 'bg-surface-2/40 border-border/50 hover:bg-surface-2/85 hover:border-border'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[9px] font-semibold text-text-secondary uppercase w-full">
                                <span>{match.stage}</span>
                                {match.status === 'live' ? (
                                  <span className="text-live font-bold animate-pulse">LIVE</span>
                                ) : match.status === 'completed' ? (
                                  <span className="text-text-muted">FINAL</span>
                                ) : (
                                  <span className="text-text-muted">LOCKED</span>
                                )}
                              </div>
                              
                              <div className="flex items-center justify-between gap-2 w-full">
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <img
                                    src={match.home_team_info?.flag_url || 'https://flagcdn.com/w80/un.png'}
                                    alt={match.home_team}
                                    className="w-5 h-3.5 object-cover rounded border border-border/30 flex-shrink-0"
                                  />
                                  <span className="text-xs font-bold text-text-primary truncate">{match.home_team}</span>
                                </div>
                                <span className="text-[10px] font-black text-text-muted px-1">vs</span>
                                <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-row-reverse text-right">
                                  <img
                                    src={match.away_team_info?.flag_url || 'https://flagcdn.com/w80/un.png'}
                                    alt={match.away_team}
                                    className="w-5 h-3.5 object-cover rounded border border-border/30 flex-shrink-0"
                                  />
                                  <span className="text-xs font-bold text-text-primary truncate">{match.away_team}</span>
                                </div>
                              </div>
                              
                              {(match.status === 'completed' || match.status === 'live') && (
                                <div className="text-[10px] font-bold text-brand bg-brand-muted px-2 py-0.5 rounded border border-brand/10 self-center">
                                  {match.home_score} - {match.away_score}
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Right Pane: Selected Match Details & Player Predictions */}
                    <div className="md:col-span-3 space-y-6">
                      {/* Selected Match Card */}
                      {(() => {
                        const selectedMatch = lockedMatches.find(m => m.id === selectedMatchId)
                        if (!selectedMatch) return null
                        const date = new Date(selectedMatch.kickoff_time)
                        return (
                          <div className="glass bg-surface-2/40 border border-border rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-6">
                            <div className="flex flex-col gap-1 text-center sm:text-left">
                              <span className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
                                {selectedMatch.stage} • Match {selectedMatch.external_match_id}
                              </span>
                              <span className="text-[10px] text-text-muted">
                                Kickoff: {date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-6 my-2 sm:my-0">
                              <div className="flex flex-col items-center gap-1.5 text-center">
                                <img
                                  src={selectedMatch.home_team_info?.flag_url || 'https://flagcdn.com/w80/un.png'}
                                  alt={selectedMatch.home_team}
                                  className="w-12 h-8 object-cover rounded shadow-sm border border-border/40"
                                />
                                <span className="text-xs font-bold text-text-primary truncate max-w-[80px]">
                                  {selectedMatch.home_team}
                                </span>
                              </div>
                              
                              <div className="flex flex-col items-center justify-center">
                                {selectedMatch.status === 'completed' || selectedMatch.status === 'live' ? (
                                  <div className="text-xl font-black bg-surface-3 px-3.5 py-1.5 rounded-xl border border-border">
                                    {selectedMatch.home_score} : {selectedMatch.away_score}
                                  </div>
                                ) : (
                                  <span className="text-sm font-black text-text-muted">VS</span>
                                )}
                                <span className="text-[9px] font-bold text-text-secondary mt-1">
                                  {selectedMatch.status === 'live' ? (
                                    <span className="text-live font-bold animate-pulse">LIVE</span>
                                  ) : selectedMatch.status === 'completed' ? (
                                    'FINAL'
                                  ) : (
                                    'LOCKED'
                                  )}
                                </span>
                              </div>
                              
                              <div className="flex flex-col items-center gap-1.5 text-center">
                                <img
                                  src={selectedMatch.away_team_info?.flag_url || 'https://flagcdn.com/w80/un.png'}
                                  alt={selectedMatch.away_team}
                                  className="w-12 h-8 object-cover rounded shadow-sm border border-border/40"
                                />
                                <span className="text-xs font-bold text-text-primary truncate max-w-[80px]">
                                  {selectedMatch.away_team}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })()}

                      {/* Player Predictions list */}
                      <div className="space-y-3">
                        <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                          Player Predictions
                        </h3>
                        {isLoadingSelectedMatchPreds ? (
                          <div className="flex justify-center py-12">
                            <div className="w-8 h-8 border-2 border-transparent border-t-brand rounded-full animate-spin" />
                          </div>
                        ) : (
                          <div className="glass rounded-xl border border-border overflow-hidden divide-y divide-border/40">
                            {members.map((member) => {
                              const pred = selectedMatchPredictions.find(p => p.user_id === member.user_id)
                              const profile = member.profiles
                              const displayName = profile?.display_name || profile?.username || 'Unknown Player'
                              return (
                                <div key={member.id} className="flex items-center justify-between p-3 hover:bg-surface-2/30 transition-colors">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full border border-border bg-surface-3 flex items-center justify-center font-bold text-xs text-gradient overflow-hidden">
                                      {profile?.avatar_url ? (
                                        <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                                      ) : (
                                        displayName.charAt(0).toUpperCase()
                                      )}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="font-bold text-text-primary text-xs sm:text-sm">
                                        {displayName}
                                      </span>
                                      <span className="text-[10px] text-text-secondary">
                                        @{profile?.username || 'unknown'}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  <div className="font-mono font-bold">
                                    {pred ? (
                                      <div className="flex items-center gap-2">
                                        <div 
                                          className="relative group cursor-help"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            const key = `${selectedMatch?.id || ''}-${member.user_id}`
                                            setActiveTooltipId(activeTooltipId === key ? null : key)
                                          }}
                                        >
                                          <div className="flex items-center gap-1.5 bg-surface-2 px-3 py-1 rounded-md border border-border text-text-primary text-sm hover:border-brand/40 transition-colors">
                                            <span>{pred.home_score_pred}</span>
                                            <span className="text-xs text-text-muted">-</span>
                                            <span>{pred.away_score_pred}</span>
                                          </div>
                                          {selectedMatch && (selectedMatch.status === 'completed' || selectedMatch.status === 'live') && (
                                            <div className={`absolute right-full top-1/2 -translate-y-1/2 mr-3 w-44 bg-surface-3 border border-border text-[9px] text-text-primary p-2.5 rounded-xl shadow-xl transition-all duration-150 z-50 text-left font-sans font-normal normal-case ${
                                              activeTooltipId === `${selectedMatch?.id || ''}-${member.user_id}`
                                                ? 'opacity-100 scale-100 pointer-events-auto'
                                                : 'opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto'
                                            }`}>
                                              <div className="font-bold border-b border-border/40 pb-1 mb-1.5 text-brand text-[10px]">Points Breakdown</div>
                                              {(() => {
                                                const items = getTooltipBreakdown(pred)
                                                return items.length === 0 ? (
                                                  <div className="text-text-muted text-[9px] italic">No points scored</div>
                                                ) : (
                                                  <div className="space-y-1">
                                                    {items.map((item, idx) => (
                                                      <div key={idx} className="flex items-center justify-between text-[9px] font-semibold text-text-secondary">
                                                        <span>{item.icon} {item.name}</span>
                                                        <span className="text-brand font-bold">+{item.pts}</span>
                                                      </div>
                                                    ))}
                                                    <div className="border-t border-border/40 pt-1 mt-1.5 flex items-center justify-between text-[10px] font-black text-text-primary">
                                                      <span>Total</span>
                                                      <span className="text-brand">{pred.points_earned ?? 0} pts</span>
                                                    </div>
                                                  </div>
                                                )
                                              })()}
                                              <div className="absolute left-full top-1/2 -translate-y-1/2 -ml-1 border-4 border-transparent border-l-surface-3"></div>
                                            </div>
                                          )}
                                        </div>
                                        {selectedMatch && (selectedMatch.status === 'completed' || selectedMatch.status === 'live') && (
                                          <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                                            (pred.points_earned ?? 0) > 0
                                              ? 'bg-brand/10 text-brand border border-brand/20'
                                              : 'bg-surface-3 text-text-muted border border-border/50'
                                          }`}>
                                            {pred.points_earned ?? 0} pts
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-text-muted text-xs italic bg-surface-2 px-2.5 py-1 rounded border border-border/30">
                                        No prediction
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Prizes tab
              <div className="glass p-6 sm:p-8 rounded-2xl border border-border/80 space-y-6 animate-fade-in">
                <div className="flex items-center justify-between border-b border-border/40 pb-4">
                  <div>
                    <h2 className="text-xl font-bold font-display flex items-center gap-2">
                      <span>🎁</span> Pool Prizes
                    </h2>
                    <p className="text-text-secondary text-xs mt-1">
                      Configure or view the rewards for the top prediction performers in this league.
                    </p>
                  </div>
                  {isCurrentUserAdmin && (
                    <button
                      onClick={() => {
                        setIsEditingPrizes(!isEditingPrizes)
                        if (pool?.prizes) {
                          setFirstPrize(pool.prizes.first || '')
                          setSecondPrize(pool.prizes.second || '')
                          setThirdPrize(pool.prizes.third || '')
                          setAdditionalPrizes(pool.prizes.additional || [])
                        }
                      }}
                      className="btn btn-secondary btn-xs py-1.5 px-3 font-bold text-xs"
                    >
                      {isEditingPrizes ? 'Cancel Setup' : 'Edit Setup'}
                    </button>
                  )}
                </div>

                {isEditingPrizes && isCurrentUserAdmin ? (
                  <form onSubmit={handleSavePrizes} className="space-y-6">
                    {saveError && (
                      <div className="p-3 text-xs rounded bg-live-muted border border-live text-live">
                        {saveError}
                      </div>
                    )}

                    <div className="space-y-4">
                      <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                        Mandatory Top 3 Prizes
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-text-secondary mb-1 flex items-center gap-1">
                            🥇 1st Prize <span className="text-live">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={firstPrize}
                            onChange={(e) => setFirstPrize(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm placeholder:text-text-muted text-text-primary focus:border-brand focus:outline-none"
                            placeholder="E.g. $100 Cash / Gold Medal"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-text-secondary mb-1 flex items-center gap-1">
                            🥈 2nd Prize <span className="text-live">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={secondPrize}
                            onChange={(e) => setSecondPrize(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm placeholder:text-text-muted text-text-primary focus:border-brand focus:outline-none"
                            placeholder="E.g. $50 Cash / Silver Medal"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-text-secondary mb-1 flex items-center gap-1">
                            🥉 3rd Prize <span className="text-live">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={thirdPrize}
                            onChange={(e) => setThirdPrize(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm placeholder:text-text-muted text-text-primary focus:border-brand focus:outline-none"
                            placeholder="E.g. $25 Cash / Bronze Medal"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 border-t border-border/40 pt-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                          Additional Prizes (Optional)
                        </h3>
                        <button
                          type="button"
                          onClick={handleAddAdditionalPrize}
                          className="text-xs text-brand hover:underline font-bold"
                        >
                          + Add Prize
                        </button>
                      </div>

                      {additionalPrizes.length === 0 ? (
                        <p className="text-xs text-text-muted italic">
                          No additional prizes added. Click "+ Add Prize" to add customizable rewards below the top 3.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {additionalPrizes.map((prize, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="text-xs font-bold text-text-muted w-8 text-right">
                                {idx + 4}th:
                              </span>
                              <input
                                type="text"
                                required
                                value={prize}
                                onChange={(e) => handleAdditionalPrizeChange(idx, e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm placeholder:text-text-muted text-text-primary focus:border-brand focus:outline-none"
                                placeholder={`E.g. Custom consolation prize or ${idx + 4}th place reward`}
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveAdditionalPrize(idx)}
                                className="p-2 text-live hover:bg-live-muted/10 rounded transition-colors"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 border-t border-border/40 pt-6">
                      <button
                        type="submit"
                        disabled={isSavingPrizes}
                        className="btn btn-primary py-2 px-5 font-bold text-xs"
                      >
                        {isSavingPrizes ? 'Saving...' : 'Save Prizes Setup'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingPrizes(false)}
                        className="btn btn-secondary py-2 px-5 font-bold text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-8">
                    {!pool.prizes || (!pool.prizes.first && !pool.prizes.second && !pool.prizes.third) ? (
                      <div className="text-center py-12 glass border border-border/40 rounded-xl">
                        <span className="text-4xl block mb-3">🎁</span>
                        <h3 className="font-display font-bold text-base text-text-primary">No Prizes Setup Yet</h3>
                        <p className="text-xs text-text-secondary mt-1 max-w-sm mx-auto">
                          The administrator has not configured the rewards for this prediction pool yet.
                        </p>
                        {isCurrentUserAdmin && (
                          <button
                            onClick={() => setIsEditingPrizes(true)}
                            className="mt-5 btn btn-primary py-2 px-4 font-bold text-xs"
                          >
                            Set Up Prizes Now
                          </button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          {/* 1st Place Card */}
                          <div className="glass p-6 rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-transparent relative overflow-hidden flex flex-col justify-between min-h-[160px]">
                            <div className="absolute top-2 right-2 text-4xl opacity-10 font-bold select-none font-display">1st</div>
                            <div>
                              <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center text-xl mb-4 border border-yellow-500/20">
                                🥇
                              </div>
                              <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider text-yellow-500">
                                Champion
                              </h3>
                              <p className="mt-2 text-text-secondary text-base font-semibold leading-relaxed">
                                {pool.prizes.first}
                              </p>
                            </div>
                            <div className="mt-6 text-[10px] text-text-muted font-semibold uppercase">
                              1st Place Finish
                            </div>
                          </div>

                          {/* 2nd Place Card */}
                          <div className="glass p-6 rounded-2xl border border-slate-400/20 bg-gradient-to-br from-slate-400/5 to-transparent relative overflow-hidden flex flex-col justify-between min-h-[160px]">
                            <div className="absolute top-2 right-2 text-4xl opacity-10 font-bold select-none font-display">2nd</div>
                            <div>
                              <div className="w-10 h-10 rounded-full bg-slate-400/10 flex items-center justify-center text-xl mb-4 border border-slate-400/20">
                                🥈
                              </div>
                              <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider text-slate-300">
                                Runner Up
                              </h3>
                              <p className="mt-2 text-text-secondary text-base font-semibold leading-relaxed">
                                {pool.prizes.second}
                              </p>
                            </div>
                            <div className="mt-6 text-[10px] text-text-muted font-semibold uppercase">
                              2nd Place Finish
                            </div>
                          </div>

                          {/* 3rd Place Card */}
                          <div className="glass p-6 rounded-2xl border border-amber-700/20 bg-gradient-to-br from-amber-700/5 to-transparent relative overflow-hidden flex flex-col justify-between min-h-[160px]">
                            <div className="absolute top-2 right-2 text-4xl opacity-10 font-bold select-none font-display">3rd</div>
                            <div>
                              <div className="w-10 h-10 rounded-full bg-amber-700/10 flex items-center justify-center text-xl mb-4 border border-amber-700/20">
                                🥉
                              </div>
                              <h3 className="font-bold text-text-primary text-sm uppercase tracking-wider text-amber-600">
                                Second Runner Up
                              </h3>
                              <p className="mt-2 text-text-secondary text-base font-semibold leading-relaxed">
                                {pool.prizes.third}
                              </p>
                            </div>
                            <div className="mt-6 text-[10px] text-text-muted font-semibold uppercase">
                              3rd Place Finish
                            </div>
                          </div>
                        </div>

                        {pool.prizes.additional && pool.prizes.additional.length > 0 && (
                          <div className="space-y-4 border-t border-border/40 pt-6">
                            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                              <span>⭐</span> Additional Customizable Rewards
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              {pool.prizes.additional.map((prize, idx) => (
                                <div key={idx} className="glass p-4 rounded-xl border border-border/60 bg-surface-2/40 flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-brand-muted/30 border border-brand/20 flex items-center justify-center text-xs font-black text-brand flex-shrink-0">
                                    {idx + 4}th
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-text-primary text-xs font-semibold truncate leading-relaxed">
                                      {prize}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!selectedUserEntry} onOpenChange={(open) => !open && setSelectedUserEntry(null)}>
        <DialogContent className="max-h-[90dvh] flex flex-col overflow-hidden max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-full max-sm:rounded-t-2xl max-sm:rounded-b-none border border-border bg-surface p-6 sm:max-w-md max-sm:animate-in max-sm:slide-in-from-bottom max-sm:duration-200">
          {selectedUserEntry && (
            <>
              <DialogHeader className="flex flex-col items-center text-center gap-2 pb-4 border-b border-border/40 flex-shrink-0">
                <div className="w-16 h-16 rounded-full border-2 border-brand/50 bg-surface-3 flex items-center justify-center font-bold text-xl text-gradient overflow-hidden shadow-lg shadow-brand/10">
                  {selectedUserEntry.avatar_url ? (
                    <img src={selectedUserEntry.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    (selectedUserEntry.display_name || selectedUserEntry.username || 'U').charAt(0).toUpperCase()
                  )}
                </div>
                <div className="space-y-0.5">
                  <DialogTitle className="text-xl font-extrabold font-display text-text-primary">
                    {selectedUserEntry.display_name || selectedUserEntry.username}
                  </DialogTitle>
                  <p className="text-xs text-text-secondary">@{selectedUserEntry.username}</p>
                </div>
              </DialogHeader>

              <div className="py-4 space-y-4 flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="bg-brand-muted/10 border border-brand/20 rounded-2xl p-4 flex flex-col items-center justify-center gap-1 shadow-inner flex-shrink-0">
                  <span className="text-xs font-bold text-brand uppercase tracking-wider">Total Score</span>
                  <span className="text-4xl font-black text-brand font-display">
                    {selectedUserEntry.total_points} <span className="text-lg font-bold">pts</span>
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 flex-shrink-0">
                  <button
                    onClick={() => setModalTab('outcomes')}
                    className={`bg-surface-2 border p-2.5 rounded-xl flex flex-col items-center justify-center gap-1 text-center shadow-sm transition-all cursor-pointer ${
                      modalTab === 'outcomes'
                        ? 'border-stats-outcome ring-1 ring-stats-outcome/30 bg-surface-3'
                        : 'border-border hover:border-border/80'
                    }`}
                  >
                    <span className="text-lg">🏆</span>
                    <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider leading-none">Outcomes</span>
                    <span className="text-xl font-black text-stats-outcome font-display mt-0.5">
                      {selectedUserEntry.correct_outcomes}
                    </span>
                    <span className="text-[8px] text-text-muted">(Outcome)</span>
                  </button>

                  <button
                    onClick={() => setModalTab('scores')}
                    className={`bg-surface-2 border p-2.5 rounded-xl flex flex-col items-center justify-center gap-1 text-center shadow-sm transition-all cursor-pointer ${
                      modalTab === 'scores'
                        ? 'border-stats-score ring-1 ring-stats-score/30 bg-surface-3'
                        : 'border-border hover:border-border/80'
                    }`}
                  >
                    <span className="text-lg">🎯</span>
                    <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider leading-none">Scores</span>
                    <span className="text-xl font-black text-stats-score font-display mt-0.5">
                      {selectedUserEntry.correct_scores}
                    </span>
                    <span className="text-[8px] text-text-muted">(Exact)</span>
                  </button>

                  <button
                    onClick={() => setModalTab('bracket')}
                    className={`bg-surface-2 border p-2.5 rounded-xl flex flex-col items-center justify-center gap-1 text-center shadow-sm transition-all cursor-pointer ${
                      modalTab === 'bracket'
                        ? 'border-brand ring-1 ring-brand/30 bg-surface-3'
                        : 'border-border hover:border-border/80'
                    }`}
                  >
                    <span className="text-lg">🔮</span>
                    <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider leading-none">Bracket</span>
                    <span className="text-xl font-black text-brand font-display mt-0.5">
                      {selectedUserEntry.stage_points}
                    </span>
                    <span className="text-[8px] text-text-muted">(Bracket Pts)</span>
                  </button>
                </div>

                <div className="flex-1 min-h-[150px] overflow-y-auto space-y-2 pr-1">
                  <div className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2">
                    {modalTab === 'outcomes' 
                      ? 'Outcome Matches' 
                      : modalTab === 'scores' 
                        ? 'Exact Score Matches' 
                        : 'Correct Bracket Predictions'}
                  </div>
                  {isLoadingUserPredictions || isLoadingUserStagePredictions ? (
                    <div className="flex justify-center items-center py-8">
                      <div className="w-6 h-6 border-2 border-transparent border-t-brand rounded-full animate-spin" />
                    </div>
                  ) : modalTab === 'bracket' ? (
                    correctStagePredictions.length === 0 ? (
                      <div className="text-center py-8 text-text-muted text-xs italic">
                        No correct bracket predictions yet.
                      </div>
                    ) : (
                      correctStagePredictions.map(({ sp, stageLabel, pts }) => (
                        <div key={sp.id} className="flex items-center justify-between p-3 bg-surface-2 border border-border/50 rounded-xl text-xs gap-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <img src={sp.team.flag_url || 'https://flagcdn.com/w80/un.png'} className="w-8 h-5 object-cover rounded border border-border/30 shadow-sm" />
                            <div className="flex flex-col">
                              <span className="font-bold text-text-primary text-xs">{sp.team.name}</span>
                              <span className="text-[9px] text-text-secondary">{stageLabel}</span>
                            </div>
                          </div>
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
                            +{pts} pts
                          </span>
                        </div>
                      ))
                    )
                  ) : (modalTab === 'outcomes' ? correctOutcomeMatches : correctScoreMatches).length === 0 ? (
                    <div className="text-center py-8 text-text-muted text-xs italic">
                      No matches found in this category.
                    </div>
                  ) : (
                    (modalTab === 'outcomes' ? correctOutcomeMatches : correctScoreMatches).map(renderModalMatchRow)
                  )}
                </div>
              </div>

              <div className="flex justify-center border-t border-border/40 pt-4 flex-shrink-0">
                <button
                  onClick={() => setSelectedUserEntry(null)}
                  className="btn btn-secondary btn-sm w-full font-bold py-2"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  )
}


