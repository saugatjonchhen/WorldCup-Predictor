import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { syncLiveScores } from '@/lib/matchSync'
import { WorldCupFactsWidget } from '@/components/WorldCupFactsWidget'
import footballImg from '@/assets/football.png'

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
  penalty_winner: string | null
  home_team_info?: { flag_url: string } | null
  away_team_info?: { flag_url: string } | null
}

interface Prediction {
  id?: string
  match_id: string
  home_score_pred: number
  away_score_pred: number
  advancing_team: string | null
}

type EditingPrediction = {
  home: number
  away: number
  advancingTeam: string | null
}

function isKnockoutStage(match: Match) {
  return match.stage !== 'group'
}

export default function Dashboard() {
  const { user, profile } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['matches'] })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'predictions' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['predictions', user?.id] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, user?.id])



  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<'all' | 'predicted' | 'pending' | 'bracket'>(
    initialTab === 'bracket' ? 'bracket' : 'all'
  )
  const [bracketSubTab, setBracketSubTab] = useState<'tree' | 'ro32' | 'ro16' | 'qf' | 'sf' | 'finals'>('tree')
  const [sortBy, setSortBy] = useState<'priority' | 'kickoff' | 'group' | 'status'>('kickoff')

  // Format kickoff time to local timezone with GMT offset
  function formatLocalTime(timeStr: string) {
    const date = new Date(timeStr)
    const offsetMin = date.getTimezoneOffset()
    const offsetSign = offsetMin > 0 ? '-' : '+'
    const absOffsetMin = Math.abs(offsetMin)
    const offsetHours = Math.floor(absOffsetMin / 60)
    const offsetMinutes = absOffsetMin % 60
    const tzString = `GMT${offsetSign}${offsetHours}:${String(offsetMinutes).padStart(2, '0')}`

    const dStr = date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
    const tStr = date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
    return `${dStr} • ${tStr} (${tzString})`
  }

  // Get countdown label for prediction deadline (2 hours before kickoff)
  function getDeadlineLabel(kickoffTime: string, status: string) {
    if (status === 'live' || status === 'completed') return null
    
    const kickoffDate = new Date(kickoffTime)
    const deadline = kickoffDate.getTime() - 2 * 60 * 60 * 1000
    const now = new Date().getTime()
    const diffMs = deadline - now

    if (diffMs <= 0) return null

    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 60) {
      return { text: `⏳ Closes in ${diffMins}m`, className: 'text-amber-500 bg-amber-500/10 border border-amber-500/20 font-bold animate-pulse' }
    }

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) {
      return { text: `⏳ Closes in ${diffHours}h`, className: 'text-amber-500 bg-amber-500/10 border border-amber-500/20' }
    }

    return null
  }

  // 1. Fetch matches
  const { data: matches = [], isLoading: isLoadingMatches } = useQuery<Match[]>({
    queryKey: ['matches'],
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
    },
  })

  // 2. Fetch user predictions
  const { data: predictions = [], isLoading: isLoadingPredictions } = useQuery<Prediction[]>({
    queryKey: ['predictions', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const { data, error } = await supabase
        .from('predictions')
        .select('match_id, home_score_pred, away_score_pred, advancing_team')
        .eq('user_id', user.id)

      if (error) throw error
      return data
    },
    enabled: !!user?.id,
  })

  // Background auto-sync for admin users
  const isAdmin = profile?.role === 'admin'
  useEffect(() => {
    if (!isAdmin || matches.length === 0) return

    // Check if there are active (kicked off) matches that are not completed
    const hasActiveMatch = matches.some((match) => {
      const kickoff = new Date(match.kickoff_time)
      const hasKickedOff = kickoff < new Date()
      return hasKickedOff && match.status !== 'completed'
    })

    if (!hasActiveMatch) return

    // Sync immediately on load/mount
    syncLiveScores(supabase).then((res) => {
      if (res.success && res.updatedCount > 0) {
        queryClient.invalidateQueries({ queryKey: ['matches'] })
      }
    })

    // Poll every 60 seconds if any match is active/uncompleted
    const interval = setInterval(() => {
      syncLiveScores(supabase).then((res) => {
        if (res.success && res.updatedCount > 0) {
          queryClient.invalidateQueries({ queryKey: ['matches'] })
        }
      })
    }, 60000)

    return () => clearInterval(interval)
  }, [isAdmin, matches, queryClient])

  // Group predictions by match_id for instant lookup
  const predictionMap = new Map<string, Prediction>()
  predictions.forEach((p) => {
    predictionMap.set(p.match_id, p)
  })

  // Local state for predictions currently being edited
  const [editingPredictions, setEditingPredictions] = useState<{
    [matchId: string]: EditingPrediction
  }>({})

  // Mutation to submit prediction
  const submitPredictionMutation = useMutation({
    mutationFn: async ({
      matchId,
      homeScore,
      awayScore,
      advancingTeam,
    }: {
      matchId: string
      homeScore: number
      awayScore: number
      advancingTeam: string | null
    }) => {
      if (!user?.id) return

      const { data, error } = await supabase.from('predictions').upsert(
        {
          user_id: user.id,
          match_id: matchId,
          home_score_pred: homeScore,
          away_score_pred: awayScore,
          advancing_team: advancingTeam,
        },
        { onConflict: 'user_id,match_id' }
      )

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['predictions', user?.id] })
    },
  })

  // Handler for input change
  function handleScoreChange(matchId: string, side: 'home' | 'away', val: string) {
    const score = parseInt(val)
    if (isNaN(score) || score < 0) return

    const match = matches.find((m) => m.id === matchId)
    const savedPrediction = predictionMap.get(matchId)

    const currentEdit = editingPredictions[matchId] || {
      home: savedPrediction?.home_score_pred ?? 0,
      away: savedPrediction?.away_score_pred ?? 0,
      advancingTeam: savedPrediction?.advancing_team ?? null,
    }
    const nextEdit = {
      ...currentEdit,
      [side]: score,
    }
    const isDrawAfterChange = nextEdit.home === nextEdit.away
    const shouldKeepAdvancingTeam = match ? isKnockoutStage(match) && isDrawAfterChange : isDrawAfterChange

    setEditingPredictions({
      ...editingPredictions,
      [matchId]: {
        ...nextEdit,
        advancingTeam: shouldKeepAdvancingTeam ? nextEdit.advancingTeam : null,
      },
    })
  }

  function handleAdvancingTeamChange(matchId: string, advancingTeam: string) {
    const savedPrediction = predictionMap.get(matchId)
    const currentEdit = editingPredictions[matchId] || {
      home: savedPrediction?.home_score_pred ?? 0,
      away: savedPrediction?.away_score_pred ?? 0,
      advancingTeam: savedPrediction?.advancing_team ?? null,
    }

    setEditingPredictions({
      ...editingPredictions,
      [matchId]: {
        ...currentEdit,
        advancingTeam,
      },
    })
  }

  // Handler for saving a prediction
  async function savePrediction(matchId: string) {
    const edit = editingPredictions[matchId]
    if (!edit) return
    const match = matches.find((m) => m.id === matchId)
    const isDrawPrediction = edit.home === edit.away
    const advancingTeam = match && isKnockoutStage(match) && isDrawPrediction ? edit.advancingTeam : null

    if (match && isKnockoutStage(match) && isDrawPrediction && !advancingTeam) return

    await submitPredictionMutation.mutateAsync({
      matchId,
      homeScore: edit.home,
      awayScore: edit.away,
      advancingTeam,
    })

    // Remove from editing state
    const nextEditing = { ...editingPredictions }
    delete nextEditing[matchId]
    setEditingPredictions(nextEditing)
  }

  // Filter matches based on active tab
  const filteredMatches = matches.filter((match) => {
    const hasPredicted = predictionMap.has(match.id)
    if (activeTab === 'predicted') return hasPredicted
    if (activeTab === 'pending') {
      const kickoffDate = new Date(match.kickoff_time)
      const deadline = kickoffDate.getTime() - 2 * 60 * 60 * 1000
      const isLocked = new Date().getTime() > deadline || match.status === 'live' || match.status === 'completed'
      return !hasPredicted && !isLocked && match.status === 'scheduled'
    }

    return true
  })

  // Sort matches based on selected sort criteria
  const sortedMatches = [...filteredMatches].sort((a, b) => {
    const timeA = new Date(a.kickoff_time).getTime()
    const timeB = new Date(b.kickoff_time).getTime()

    if (sortBy === 'kickoff') {
      return timeA - timeB
    }

    if (sortBy === 'group') {
      const groupA = a.group_name || ''
      const groupB = b.group_name || ''
      if (groupA !== groupB) return groupA.localeCompare(groupB)
      return a.external_match_id.localeCompare(b.external_match_id)
    }

    if (sortBy === 'status') {
      const statusWeight = (status: string) => {
        if (status === 'live') return 1
        if (status === 'scheduled') return 2
        return 3
      }
      return statusWeight(a.status) - statusWeight(b.status) || timeA - timeB
    }

    // Default: 'priority'
    // 1. Live matches first
    // 2. Unpredicted & active (not locked) scheduled matches (ordered by kickoff soonest first)
    // 3. Predicted & active matches (ordered by kickoff soonest first)
    // 4. Locked/Completed matches (ordered by kickoff soonest first)
    const getPriorityScore = (match: Match) => {
      if (match.status === 'live') return 1
      
      const hasPred = predictionMap.has(match.id)
      const kickoff = new Date(match.kickoff_time).getTime()
      const deadline = kickoff - 2 * 60 * 60 * 1000
      const isLocked = new Date().getTime() > deadline || match.status === 'completed'

      if (!hasPred && !isLocked) return 2
      if (hasPred && !isLocked) return 3
      return 4
    }

    const priorityA = getPriorityScore(a)
    const priorityB = getPriorityScore(b)

    if (priorityA !== priorityB) {
      return priorityA - priorityB
    }
    return timeA - timeB
  })

  const isLoading = isLoadingMatches || isLoadingPredictions

  function renderVisualBracket() {
    const matchMap = new Map<string, Match>()
    matches.forEach((m) => {
      matchMap.set(m.external_match_id, m)
    })

    const finalMatch = matchMap.get('104')
    let championTeam: string | null = null
    let championFlag: string | null = null

    if (finalMatch && finalMatch.status === 'completed') {
      const isHomeWinner = (finalMatch.penalty_winner && finalMatch.penalty_winner === finalMatch.home_team) ||
        (!finalMatch.penalty_winner && (finalMatch.home_score ?? 0) > (finalMatch.away_score ?? 0))
      
      championTeam = isHomeWinner ? finalMatch.home_team : finalMatch.away_team
      championFlag = isHomeWinner ? (finalMatch.home_team_info?.flag_url ?? null) : (finalMatch.away_team_info?.flag_url ?? null)
    }

    function renderBracketMatchCard(matchId: string) {
      const match = matchMap.get(matchId)
      if (!match) {
        return (
          <div className="w-[180px] h-[92px] rounded-xl border border-dashed border-border/40 bg-surface-2/10 flex items-center justify-center text-xs text-text-muted">
            Match {matchId} Pending
          </div>
        )
      }

      const isHomeWinner = match.status === 'completed' && (
        (match.penalty_winner && match.penalty_winner === match.home_team) ||
        (!match.penalty_winner && (match.home_score ?? 0) > (match.away_score ?? 0))
      )

      const isAwayWinner = match.status === 'completed' && (
        (match.penalty_winner && match.penalty_winner === match.away_team) ||
        (!match.penalty_winner && (match.away_score ?? 0) > (match.home_score ?? 0))
      )

      const kickoffDate = new Date(match.kickoff_time)
      const formattedTime = kickoffDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + 
        ' • ' + kickoffDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })

      const hasPred = predictionMap.has(match.id)
      const pred = predictionMap.get(match.id)

      // Check if it's a placeholder team
      const isHomePlaceholder = !match.home_team_ext_id
      const isAwayPlaceholder = !match.away_team_ext_id

      return (
        <Link
          to={`/match/${match.id}?from=bracket`}
          className={`block w-[180px] rounded-xl border bg-surface-2/95 hover:bg-surface-3 transition-all hover:scale-[1.02] hover:border-brand/40 shadow-sm hover:shadow-brand group p-2.5 relative select-none ${
            match.status === 'live' ? 'ring-1 ring-live bg-live-muted/5' : ''
          }`}
        >
          <div className="flex items-center justify-between text-[9px] text-text-muted font-bold mb-1.5 border-b border-border/20 pb-1">
            <span>Match {match.external_match_id}</span>
            {match.status === 'live' ? (
              <span className="text-live flex items-center gap-0.5 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-live" /> LIVE
              </span>
            ) : match.status === 'completed' ? (
              <span className="text-text-muted">FT</span>
            ) : (
              <span className="truncate max-w-[100px]">{formattedTime}</span>
            )}
          </div>

          <div className="space-y-1.5">
            {/* Home Team */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                {isHomePlaceholder ? (
                  <span className="text-xs shrink-0">🗺️</span>
                ) : (
                  <img
                    src={match.home_team_info?.flag_url ?? 'https://flagcdn.com/w80/un.png'}
                    alt={match.home_team}
                    className="w-5 h-3.5 object-cover rounded border border-border/20 shrink-0"
                    onError={(e) => {
                      e.currentTarget.src = 'https://flagcdn.com/w80/un.png'
                    }}
                  />
                )}
                <span className={`text-[11px] truncate font-bold ${
                  match.status === 'completed' ? (isHomeWinner ? 'text-text-primary' : 'text-text-secondary') : 'text-text-primary'
                } ${isHomePlaceholder ? 'italic text-text-muted text-[10px]' : ''}`}>
                  {match.home_team}
                </span>
              </div>
              <span className={`text-[11px] font-black shrink-0 ${
                match.status === 'completed' ? (isHomeWinner ? 'text-brand' : 'text-text-secondary') : 'text-text-secondary'
              }`}>
                {match.home_score !== null ? match.home_score : '-'}
              </span>
            </div>

            {/* Away Team */}
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                {isAwayPlaceholder ? (
                  <span className="text-xs shrink-0">🗺️</span>
                ) : (
                  <img
                    src={match.away_team_info?.flag_url ?? 'https://flagcdn.com/w80/un.png'}
                    alt={match.away_team}
                    className="w-5 h-3.5 object-cover rounded border border-border/20 shrink-0"
                    onError={(e) => {
                      e.currentTarget.src = 'https://flagcdn.com/w80/un.png'
                    }}
                  />
                )}
                <span className={`text-[11px] truncate font-bold ${
                  match.status === 'completed' ? (isAwayWinner ? 'text-text-primary' : 'text-text-secondary') : 'text-text-primary'
                } ${isAwayPlaceholder ? 'italic text-text-muted text-[10px]' : ''}`}>
                  {match.away_team}
                </span>
              </div>
              <span className={`text-[11px] font-black shrink-0 ${
                match.status === 'completed' ? (isAwayWinner ? 'text-brand' : 'text-text-secondary') : 'text-text-secondary'
              }`}>
                {match.away_score !== null ? match.away_score : '-'}
              </span>
            </div>
          </div>

          {/* User prediction badge */}
          {hasPred && pred && (
            <div className="absolute -bottom-2 right-2 bg-brand text-text-inverse text-[8px] font-extrabold px-1.5 py-0.5 rounded-full border border-surface-2 group-hover:border-surface-3 transition-colors">
              Pred: {pred.home_score_pred}-{pred.away_score_pred}
            </div>
          )}
        </Link>
      )
    }

    // List view for mobile stage selections
    if (bracketSubTab !== 'tree') {
      const selectedMatches = matches.filter((m) => {
        if (bracketSubTab === 'ro32') return m.stage === 'round_of_32'
        if (bracketSubTab === 'ro16') return m.stage === 'round_of_16'
        if (bracketSubTab === 'qf') return m.stage === 'qf'
        if (bracketSubTab === 'sf') return m.stage === 'sf'
        if (bracketSubTab === 'finals') return m.stage === 'final' || m.stage === 'third_place'
        return false
      })

      return (
        <div className="space-y-6 animate-fade-in">
          {/* Sub-tab selection */}
          <div className="flex flex-wrap gap-2 pb-2 border-b border-border/40">
            {([
              { id: 'tree', label: '🏆 Full Bracket Tree' },
              { id: 'ro32', label: 'Round of 32' },
              { id: 'ro16', label: 'Round of 16' },
              { id: 'qf', label: 'Quarterfinals' },
              { id: 'sf', label: 'Semifinals' },
              { id: 'finals', label: 'Finals' },
            ] as const).map((sub) => (
              <button
                key={sub.id}
                onClick={() => setBracketSubTab(sub.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  bracketSubTab === sub.id
                    ? 'bg-brand/20 text-brand border border-brand/40 shadow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-2 border border-transparent'
                }`}
              >
                {sub.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {selectedMatches.map((match) => {
              const kickoffDate = new Date(match.kickoff_time)
              const deadlineTime = kickoffDate.getTime() - 2 * 60 * 60 * 1000
              const isLocked = new Date().getTime() > deadlineTime || match.status === 'live' || match.status === 'completed'
              
              const isSaved = predictionMap.has(match.id)
              const savedPred = predictionMap.get(match.id)

              const currentEdit = editingPredictions[match.id]
              const displayHome = currentEdit !== undefined ? currentEdit.home : (savedPred?.home_score_pred ?? '')
              const displayAway = currentEdit !== undefined ? currentEdit.away : (savedPred?.away_score_pred ?? '')
              const selectedAdvancingTeam = currentEdit !== undefined ? currentEdit.advancingTeam : (savedPred?.advancing_team ?? null)
              const shouldShowDrawWinner = isKnockoutStage(match) && displayHome !== '' && displayAway !== '' && displayHome === displayAway
              const hasChanges = currentEdit !== undefined

              const deadlineBadge = getDeadlineLabel(match.kickoff_time, match.status)

              return (
                <div
                  key={match.id}
                  className={`glass rounded-2xl border border-border p-5 flex flex-col justify-between transition-all hover:border-brand/30 hover:shadow-brand relative group ${
                    match.status === 'live' ? 'ring-1 ring-live shadow-md bg-live-muted/5' : ''
                  }`}
                >
                  {/* Match header information */}
                  <div className="flex flex-col gap-1 mb-4 border-b border-border/40 pb-2">
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <span className="font-semibold uppercase tracking-wider">
                        Match {match.external_match_id} • {match.stage.replace('_', ' ')}
                      </span>
                      {match.status === 'live' ? (
                        <span className="px-2 py-0.5 rounded bg-live-muted text-live font-bold animate-pulse flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-live" /> LIVE
                        </span>
                      ) : match.status === 'completed' ? (
                        <span className="px-2 py-0.5 rounded bg-surface-3 text-text-secondary font-bold">
                          FINAL
                        </span>
                      ) : isLocked ? (
                        <span className="px-2 py-0.5 rounded bg-surface-3 text-text-muted font-bold">
                          LOCKED
                        </span>
                      ) : (
                        deadlineBadge && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${deadlineBadge.className}`}>
                            {deadlineBadge.text}
                          </span>
                        )
                      )}
                    </div>
                    <div className="text-[10px] text-text-muted font-medium">
                      {formatLocalTime(match.kickoff_time)}
                    </div>
                  </div>

                  {/* Match Competitors */}
                  <div className="flex items-center justify-between gap-4 my-2">
                    {/* Home Team */}
                    <div className="flex flex-col items-center gap-2 flex-1 text-center">
                      {!match.home_team_ext_id ? (
                        <span className="text-3xl">🗺️</span>
                      ) : (
                        <img
                          src={match.home_team_info?.flag_url ?? 'https://flagcdn.com/w80/un.png'}
                          alt={match.home_team}
                          className="w-12 h-8 object-cover rounded shadow-sm border border-border/40"
                          onError={(e) => {
                            e.currentTarget.src = 'https://flagcdn.com/w80/un.png'
                          }}
                        />
                      )}
                      <span className={`text-sm font-bold tracking-tight text-text-primary line-clamp-1 ${!match.home_team_ext_id ? 'italic text-text-muted text-xs' : ''}`}>
                        {match.home_team}
                      </span>
                    </div>

                    {/* Score inputs / Score display */}
                    <div className="flex items-center gap-2">
                      {isLocked ? (
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex items-center gap-3 bg-surface-2 px-4 py-2.5 rounded-xl border border-border">
                            <span className="text-xl font-black">{match.home_score ?? '-'}</span>
                            <span className="text-xs text-text-muted font-bold">:</span>
                            <span className="text-xl font-black">{match.away_score ?? '-'}</span>
                          </div>
                          {match.home_score_et !== null && match.home_score_et !== undefined && (
                            <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 whitespace-nowrap">
                              {(match.home_score ?? 0) + (match.home_score_et ?? 0)} - {(match.away_score ?? 0) + (match.away_score_et ?? 0)} AET
                            </span>
                          )}
                          {isSaved && (
                            <div className="text-[10px] font-bold text-brand bg-brand/10 px-2.5 py-0.5 rounded-md border border-brand/20">
                              Pred: {savedPred?.home_score_pred} - {savedPred?.away_score_pred}
                              {savedPred?.advancing_team ? ` • Adv: ${savedPred.advancing_team}` : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            value={displayHome}
                            onChange={(e) => handleScoreChange(match.id, 'home', e.target.value)}
                            placeholder="-"
                            className="w-12 h-12 text-center text-lg font-black bg-surface-2 border border-border rounded-xl focus:border-brand focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="text-xs text-text-muted font-bold">-</span>
                          <input
                            type="number"
                            min="0"
                            value={displayAway}
                            onChange={(e) => handleScoreChange(match.id, 'away', e.target.value)}
                            placeholder="-"
                            className="w-12 h-12 text-center text-lg font-black bg-surface-2 border border-border rounded-xl focus:border-brand focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                      )}
                    </div>

                    {/* Away Team */}
                    <div className="flex flex-col items-center gap-2 flex-1 text-center">
                      {!match.away_team_ext_id ? (
                        <span className="text-3xl">🗺️</span>
                      ) : (
                        <img
                          src={match.away_team_info?.flag_url ?? 'https://flagcdn.com/w80/un.png'}
                          alt={match.away_team}
                          className="w-12 h-8 object-cover rounded shadow-sm border border-border/40"
                          onError={(e) => {
                            e.currentTarget.src = 'https://flagcdn.com/w80/un.png'
                          }}
                        />
                      )}
                      <span className={`text-sm font-bold tracking-tight text-text-primary line-clamp-1 ${!match.away_team_ext_id ? 'italic text-text-muted text-xs' : ''}`}>
                        {match.away_team}
                      </span>
                    </div>
                  </div>

                  {shouldShowDrawWinner && (
                    <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 p-3">
                      <div className="text-[10px] font-black uppercase tracking-wider text-brand mb-2">
                        Winner after draw
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[match.home_team, match.away_team].map((team) => (
                          <button
                            key={team}
                            type="button"
                            onClick={() => handleAdvancingTeamChange(match.id, team)}
                            className={`min-h-9 rounded-lg border px-2 text-[11px] font-bold transition-colors ${
                              selectedAdvancingTeam === team
                                ? 'border-brand bg-brand text-text-inverse shadow-brand'
                                : 'border-border bg-surface-2 text-text-secondary hover:text-text-primary hover:border-brand/50'
                            }`}
                          >
                            {team}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] font-semibold text-text-secondary">
                        +2 pts if this team advances after extra time or penalties.
                      </p>
                    </div>
                  )}

                  {/* Save button & link to details */}
                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                    <div className="text-[10px] font-semibold text-text-secondary">
                      {isLocked ? (
                        <span className="text-text-muted flex items-center gap-1">
                          🔒 Submissions Locked
                        </span>
                      ) : isSaved ? (
                        <span className="text-brand flex items-center gap-1">
                          ✓ Saved Pred: {savedPred?.home_score_pred} - {savedPred?.away_score_pred}
                        </span>
                      ) : (
                        <span className="text-text-muted">No prediction yet</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Link to={`/match/${match.id}?from=bracket`} className="text-[10px] font-bold text-text-secondary hover:text-brand transition-colors mr-1">
                        Details →
                      </Link>
                      {!isLocked && hasChanges && (
                        <button
                          onClick={() => savePrediction(match.id)}
                          disabled={submitPredictionMutation.isPending || (shouldShowDrawWinner && !selectedAdvancingTeam)}
                          className="btn btn-primary btn-sm py-1 px-3 text-xs font-bold shadow-brand"
                        >
                          {submitPredictionMutation.isPending ? 'Saving...' : 'Save'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    return (
      <div className="space-y-12 animate-fade-in">
        {/* Sub-tab selection */}
        <div className="flex flex-wrap gap-2 pb-2 border-b border-border/40">
          {([
            { id: 'tree', label: '🏆 Full Bracket Tree' },
            { id: 'ro32', label: 'Round of 32' },
            { id: 'ro16', label: 'Round of 16' },
            { id: 'qf', label: 'Quarterfinals' },
            { id: 'sf', label: 'Semifinals' },
            { id: 'finals', label: 'Finals' },
          ] as const).map((sub) => (
            <button
              key={sub.id}
              onClick={() => setBracketSubTab(sub.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                bracketSubTab === sub.id
                  ? 'bg-brand/20 text-brand border border-brand/40 shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-2 border border-transparent'
              }`}
            >
              {sub.label}
            </button>
          ))}
        </div>

        {/* Tree Bracket view */}
        <div className="w-full overflow-x-auto no-scrollbar py-6 border border-border/40 rounded-2xl bg-surface/20 shadow-inner">
          <div className="min-w-[1080px] py-4 bg-surface-2/10">
            <div className="min-w-[1200px] h-[2060px] flex px-6 select-none relative justify-between gap-4">
              
              {/* COLUMN 1: ROUND OF 32 (16 matches in 8 pairs) */}
              <div className="w-[180px] h-full flex flex-col">
                <div className="text-[9px] font-black uppercase text-text-muted tracking-widest text-center border-b border-border/10 pb-2 mb-4">
                  Round of 32
                </div>
                <div className="h-[2000px] flex flex-col justify-around">
                  {[
                    // Top Half (feeds SF 101 via QF 97, 98)
                    { m1: '74', m2: '77' },  // → RO16 Match 89 (W74 vs W77)
                    { m1: '73', m2: '75' },  // → RO16 Match 90 (W73 vs W75)
                    { m1: '83', m2: '84' },  // → RO16 Match 93 (W83 vs W84)
                    { m1: '81', m2: '82' },  // → RO16 Match 94 (W81 vs W82)
                    // Bottom Half (feeds SF 102 via QF 99, 100)
                    { m1: '76', m2: '78' },  // → RO16 Match 91 (W76 vs W78)
                    { m1: '79', m2: '80' },  // → RO16 Match 92 (W79 vs W80)
                    { m1: '86', m2: '88' },  // → RO16 Match 95 (W86 vs W88)
                    { m1: '85', m2: '87' },  // → RO16 Match 96 (W85 vs W87)
                  ].map((pair, idx) => (
                    <div key={`ro32-pair-${idx}`} className="relative flex flex-col justify-around py-4 h-[250px]">
                      <div className="relative">
                        {renderBracketMatchCard(pair.m1)}
                        <div className="absolute left-full top-1/2 -translate-y-1/2 w-5 border-t border-text-muted/50" />
                      </div>
                      <div className="relative">
                        {renderBracketMatchCard(pair.m2)}
                        <div className="absolute left-full top-1/2 -translate-y-1/2 w-5 border-t border-text-muted/50" />
                      </div>
                      <div className="absolute top-[25%] bottom-[25%] border-r border-text-muted/50" style={{ right: '-20px' }} />
                      <div className="absolute top-1/2 -translate-y-1/2 w-5 border-t border-text-muted/50" style={{ right: '-40px' }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* COLUMN 2: ROUND OF 16 (8 matches in 4 pairs) */}
              <div className="w-[180px] h-full flex flex-col">
                <div className="text-[9px] font-black uppercase text-text-muted tracking-widest text-center border-b border-border/10 pb-2 mb-4">
                  Round of 16
                </div>
                <div className="h-[2000px] flex flex-col justify-around">
                  {[
                    // Top Half (feeds SF 101 via QF 97, 98)
                    { m1: '89', m2: '90' },  // → QF Match 97 (W89 vs W90)
                    { m1: '93', m2: '94' },  // → QF Match 98 (W93 vs W94)
                    // Bottom Half (feeds SF 102 via QF 99, 100)
                    { m1: '91', m2: '92' },  // → QF Match 99 (W91 vs W92)
                    { m1: '95', m2: '96' },  // → QF Match 100 (W95 vs W96)
                  ].map((pair, idx) => (
                    <div key={`ro16-pair-${idx}`} className="relative flex flex-col justify-around py-4 h-[500px]">
                      <div className="relative">
                        {renderBracketMatchCard(pair.m1)}
                        <div className="absolute left-full top-1/2 -translate-y-1/2 w-5 border-t border-text-muted/50" />
                      </div>
                      <div className="relative">
                        {renderBracketMatchCard(pair.m2)}
                        <div className="absolute left-full top-1/2 -translate-y-1/2 w-5 border-t border-text-muted/50" />
                      </div>
                      <div className="absolute top-[25%] bottom-[25%] border-r border-text-muted/50" style={{ right: '-20px' }} />
                      <div className="absolute top-1/2 -translate-y-1/2 w-5 border-t border-text-muted/50" style={{ right: '-40px' }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* COLUMN 3: QUARTERFINALS (4 matches in 2 pairs) */}
              <div className="w-[180px] h-full flex flex-col">
                <div className="text-[9px] font-black uppercase text-text-muted tracking-widest text-center border-b border-border/10 pb-2 mb-4">
                  Quarterfinals
                </div>
                <div className="h-[2000px] flex flex-col justify-around">
                  {[
                    // Top Half → SF Match 101 (W97 vs W98)
                    { m1: '97', m2: '98' },
                    // Bottom Half → SF Match 102 (W99 vs W100)
                    { m1: '99', m2: '100' },
                  ].map((pair, idx) => (
                    <div key={`qf-pair-${idx}`} className="relative flex flex-col justify-around py-4 h-[1000px]">
                      <div className="relative">
                        {renderBracketMatchCard(pair.m1)}
                        <div className="absolute left-full top-1/2 -translate-y-1/2 w-5 border-t border-text-muted/50" />
                      </div>
                      <div className="relative">
                        {renderBracketMatchCard(pair.m2)}
                        <div className="absolute left-full top-1/2 -translate-y-1/2 w-5 border-t border-text-muted/50" />
                      </div>
                      <div className="absolute top-[25%] bottom-[25%] border-r border-text-muted/50" style={{ right: '-20px' }} />
                      <div className="absolute top-1/2 -translate-y-1/2 w-5 border-t border-text-muted/50" style={{ right: '-40px' }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* COLUMN 4: SEMIFINALS (2 matches in 1 pair) */}
              <div className="w-[180px] h-full flex flex-col">
                <div className="text-[9px] font-black uppercase text-text-muted tracking-widest text-center border-b border-border/10 pb-2 mb-4">
                  Semifinals
                </div>
                <div className="h-[2000px] flex flex-col justify-around">
                  <div className="relative flex flex-col justify-around py-4 h-[2000px]">
                    <div className="relative">
                      {renderBracketMatchCard('101')}
                      <div className="absolute left-full top-1/2 -translate-y-1/2 w-5 border-t border-text-muted/50" />
                    </div>
                    <div className="relative">
                      {renderBracketMatchCard('102')}
                      <div className="absolute left-full top-1/2 -translate-y-1/2 w-5 border-t border-text-muted/50" />
                    </div>
                    <div className="absolute top-[25%] bottom-[25%] border-r border-text-muted/50" style={{ right: '-20px' }} />
                    <div className="absolute top-1/2 -translate-y-1/2 w-5 border-t border-text-muted/50" style={{ right: '-40px' }} />
                  </div>
                </div>
              </div>

              {/* COLUMN 5: GRAND FINAL & CHAMPION & THIRD PLACE */}
              <div className="w-[180px] h-full flex flex-col">
                <div className="text-[9px] font-black uppercase text-text-muted tracking-widest text-center border-b border-border/10 pb-2 mb-4">
                  Finals
                </div>
                <div className="h-[2000px] flex flex-col justify-center items-center relative">
                  {/* Champion Showcase at top */}
                  {championTeam && (
                    <div className="absolute bottom-[calc(50%+70px)] left-0 pl-6 w-full flex flex-col items-center justify-center text-center animate-pulse scale-90">
                      <span className="text-2xl">👑</span>
                      <span className="text-[9px] uppercase font-black tracking-widest text-gold mt-0.5">World Champion</span>
                      <div className="glass px-3 py-1.5 rounded-xl border border-gold bg-gold/10 flex items-center gap-1.5 mt-1 shadow-gold">
                        {championFlag && (
                          <img src={championFlag} alt={championTeam} className="w-5 h-3.5 object-cover rounded border border-gold/30 shrink-0" />
                        )}
                        <span className="text-[10px] font-black text-gold truncate max-w-[100px]">{championTeam}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Final Card (exactly centered at 50%) */}
                  <div className="absolute top-1/2 left-0 -translate-y-1/2 pl-6">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-6 border-t border-text-muted/50" />
                    {renderBracketMatchCard('104')}
                  </div>

                  {/* Third Place Card (below the final) */}
                  <div className="absolute top-[calc(50%+70px)] left-0 pl-6 flex flex-col items-center opacity-85">
                    <span className="text-[9px] font-bold uppercase text-text-secondary tracking-widest mb-1.5 block">Third Place</span>
                    {renderBracketMatchCard('103')}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header section */}
        <div className="w-full">
          <WorldCupFactsWidget />
        </div>

        {/* Filters and Sorting Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-2/40 p-4 border border-border/80 rounded-2xl">
          <div className="flex items-center gap-1.5 bg-surface-2 p-1 border border-border rounded-xl">
            {(['all', 'predicted', 'pending', 'bracket'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-xs font-bold capitalize transition-colors ${
                  activeTab === tab
                    ? 'bg-brand text-text-inverse shadow-brand'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {tab === 'bracket' ? '🏆 Bracket' : tab}
              </button>
            ))}
          </div>

          {activeTab !== 'bracket' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-text-secondary">Sort By:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs font-bold text-text-primary focus:border-brand focus:outline-none transition-colors"
              >
                <option value="priority">🔥 Priority (Action Required)</option>
                <option value="kickoff">📅 Kickoff Time</option>
                <option value="group">🔠 Group Stage</option>
                <option value="status">🚦 Match Status</option>
              </select>
            </div>
          )}
        </div>

        {/* Loading state */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-10 h-10 border-2 border-transparent border-t-brand rounded-full animate-spin" />
          </div>
        ) : activeTab === 'bracket' ? (
          renderVisualBracket()
        ) : sortedMatches.length === 0 ? (
          <div className="glass p-12 rounded-xl text-center border border-border/80 max-w-md mx-auto flex flex-col items-center">
            <img src={footballImg} alt="Football" className="w-16 h-16 object-contain opacity-50 drop-shadow-lg" />
            <h3 className="mt-4 font-display font-bold text-lg text-text-primary">
              No Matches Found
            </h3>
            <p className="mt-2 text-sm text-text-secondary">
              There are no matches under the "{activeTab}" filter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedMatches.map((match) => {
              const kickoffDate = new Date(match.kickoff_time)
              const deadlineTime = kickoffDate.getTime() - 2 * 60 * 60 * 1000
              const isLocked = new Date().getTime() > deadlineTime || match.status === 'live' || match.status === 'completed'
              
              const isSaved = predictionMap.has(match.id)
              const savedPred = predictionMap.get(match.id)

              const currentEdit = editingPredictions[match.id]
              const displayHome = currentEdit !== undefined ? currentEdit.home : (savedPred?.home_score_pred ?? '')
              const displayAway = currentEdit !== undefined ? currentEdit.away : (savedPred?.away_score_pred ?? '')
              const selectedAdvancingTeam = currentEdit !== undefined ? currentEdit.advancingTeam : (savedPred?.advancing_team ?? null)
              const shouldShowDrawWinner = isKnockoutStage(match) && displayHome !== '' && displayAway !== '' && displayHome === displayAway
              const hasChanges = currentEdit !== undefined

              const deadlineBadge = getDeadlineLabel(match.kickoff_time, match.status)

              return (
                <div
                  key={match.id}
                  className={`glass rounded-2xl border border-border p-5 flex flex-col justify-between transition-all ${
                    match.status === 'live' ? 'ring-1 ring-live shadow-md bg-live-muted/5' : ''
                  }`}
                >
                  {/* Match header information */}
                  <div className="flex flex-col gap-1 mb-4 border-b border-border/40 pb-2">
                    <div className="flex items-center justify-between text-xs text-text-secondary">
                      <span className="font-semibold uppercase tracking-wider">
                        Group {match.group_name} • Match {match.external_match_id}
                      </span>
                      {match.status === 'live' ? (
                        <span className="px-2 py-0.5 rounded bg-live-muted text-live font-bold animate-pulse flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-live" /> LIVE
                        </span>
                      ) : match.status === 'completed' ? (
                        <span className="px-2 py-0.5 rounded bg-surface-3 text-text-secondary font-bold">
                          FINAL
                        </span>
                      ) : isLocked ? (
                        <span className="px-2 py-0.5 rounded bg-surface-3 text-text-muted font-bold">
                          LOCKED
                        </span>
                      ) : (
                        deadlineBadge && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${deadlineBadge.className}`}>
                            {deadlineBadge.text}
                          </span>
                        )
                      )}
                    </div>
                    <div className="text-[10px] text-text-muted font-medium">
                      {formatLocalTime(match.kickoff_time)}
                    </div>
                  </div>

                  {/* Match Competitors */}
                  <div className="flex items-center justify-between gap-4 my-2">
                    {/* Home Team */}
                    <div className="flex flex-col items-center gap-2 flex-1 text-center">
                      <img
                        src={match.home_team_info?.flag_url ?? 'https://flagcdn.com/w80/un.png'}
                        alt={match.home_team}
                        className="w-12 h-8 object-cover rounded shadow-sm border border-border/40"
                        onError={(e) => {
                          e.currentTarget.src = 'https://flagcdn.com/w80/un.png'
                        }}
                      />
                      <span className="text-sm font-bold tracking-tight text-text-primary line-clamp-1">
                        {match.home_team}
                      </span>
                    </div>

                    {/* Score inputs / Score display */}
                    <div className="flex items-center gap-2">
                      {isLocked ? (
                        /* Live or finished score / locked predictions */
                        <div className="flex flex-col items-center gap-1.5">
                          <div className="flex items-center gap-3 bg-surface-2 px-4 py-2.5 rounded-xl border border-border">
                            <span className="text-xl font-black">{match.home_score ?? '-'}</span>
                            <span className="text-xs text-text-muted font-bold">:</span>
                            <span className="text-xl font-black">{match.away_score ?? '-'}</span>
                          </div>
                          {match.home_score_et !== null && match.home_score_et !== undefined && (
                            <span className="text-[10px] font-black text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 whitespace-nowrap">
                              {(match.home_score ?? 0) + (match.home_score_et ?? 0)} - {(match.away_score ?? 0) + (match.away_score_et ?? 0)} AET
                            </span>
                          )}
                          {isSaved && (
                            <div className="text-[10px] font-bold text-brand bg-brand/10 px-2.5 py-0.5 rounded-md border border-brand/20">
                              Pred: {savedPred?.home_score_pred} - {savedPred?.away_score_pred}
                              {savedPred?.advancing_team ? ` • Adv: ${savedPred.advancing_team}` : ''}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Interactive predictions */
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            value={displayHome}
                            onChange={(e) => handleScoreChange(match.id, 'home', e.target.value)}
                            placeholder="-"
                            className="w-12 h-12 text-center text-lg font-black bg-surface-2 border border-border rounded-xl focus:border-brand focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="text-xs text-text-muted font-bold">-</span>
                          <input
                            type="number"
                            min="0"
                            value={displayAway}
                            onChange={(e) => handleScoreChange(match.id, 'away', e.target.value)}
                            placeholder="-"
                            className="w-12 h-12 text-center text-lg font-black bg-surface-2 border border-border rounded-xl focus:border-brand focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                      )}
                    </div>

                    {/* Away Team */}
                    <div className="flex flex-col items-center gap-2 flex-1 text-center">
                      <img
                        src={match.away_team_info?.flag_url ?? 'https://flagcdn.com/w80/un.png'}
                        alt={match.away_team}
                        className="w-12 h-8 object-cover rounded shadow-sm border border-border/40"
                        onError={(e) => {
                          e.currentTarget.src = 'https://flagcdn.com/w80/un.png'
                        }}
                      />
                      <span className="text-sm font-bold tracking-tight text-text-primary line-clamp-1">
                        {match.away_team}
                      </span>
                    </div>
                  </div>

                  {shouldShowDrawWinner && (
                    <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 p-3">
                      <div className="text-[10px] font-black uppercase tracking-wider text-brand mb-2">
                        Winner after draw
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[match.home_team, match.away_team].map((team) => (
                          <button
                            key={team}
                            type="button"
                            onClick={() => handleAdvancingTeamChange(match.id, team)}
                            className={`min-h-9 rounded-lg border px-2 text-[11px] font-bold transition-colors ${
                              selectedAdvancingTeam === team
                                ? 'border-brand bg-brand text-text-inverse shadow-brand'
                                : 'border-border bg-surface-2 text-text-secondary hover:text-text-primary hover:border-brand/50'
                            }`}
                          >
                            {team}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] font-semibold text-text-secondary">
                        +2 pts if this team advances after extra time or penalties.
                      </p>
                    </div>
                  )}

                  {/* Save Prediction Button & prediction status */}
                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                    <div className="text-[10px] font-semibold text-text-secondary">
                      {isLocked ? (
                        <span className="text-text-muted flex items-center gap-1">
                          🔒 Submissions Locked
                        </span>
                      ) : isSaved ? (
                        <span className="text-brand flex items-center gap-1">
                          ✓ Saved Pred: {savedPred?.home_score_pred} - {savedPred?.away_score_pred}
                        </span>
                      ) : (
                        <span className="text-text-muted">No prediction yet</span>
                      )}
                    </div>

                    {!isLocked && hasChanges && (
                      <button
                        onClick={() => savePrediction(match.id)}
                        disabled={submitPredictionMutation.isPending || (shouldShowDrawWinner && !selectedAdvancingTeam)}
                        className="btn btn-primary btn-sm py-1.5 px-3.5 text-xs font-bold shadow-brand"
                      >
                        {submitPredictionMutation.isPending ? 'Saving...' : 'Save'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
