import { useState, useEffect } from 'react'
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
  home_team_info?: { flag_url: string } | null
  away_team_info?: { flag_url: string } | null
}

interface Prediction {
  id?: string
  match_id: string
  home_score_pred: number
  away_score_pred: number
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



  const [activeTab, setActiveTab] = useState<'all' | 'predicted' | 'pending'>('all')
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
        .select('match_id, home_score_pred, away_score_pred')
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
    [matchId: string]: { home: number; away: number }
  }>({})

  // Mutation to submit prediction
  const submitPredictionMutation = useMutation({
    mutationFn: async ({
      matchId,
      homeScore,
      awayScore,
    }: {
      matchId: string
      homeScore: number
      awayScore: number
    }) => {
      if (!user?.id) return

      const { data, error } = await supabase.from('predictions').upsert(
        {
          user_id: user.id,
          match_id: matchId,
          home_score_pred: homeScore,
          away_score_pred: awayScore,
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

    const currentEdit = editingPredictions[matchId] || {
      home: predictionMap.get(matchId)?.home_score_pred ?? 0,
      away: predictionMap.get(matchId)?.away_score_pred ?? 0,
    }

    setEditingPredictions({
      ...editingPredictions,
      [matchId]: {
        ...currentEdit,
        [side]: score,
      },
    })
  }

  // Handler for saving a prediction
  async function savePrediction(matchId: string) {
    const edit = editingPredictions[matchId]
    if (!edit) return

    await submitPredictionMutation.mutateAsync({
      matchId,
      homeScore: edit.home,
      awayScore: edit.away,
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
            {(['all', 'predicted', 'pending'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-xs font-bold capitalize transition-colors ${
                  activeTab === tab
                    ? 'bg-brand text-text-inverse shadow-brand'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

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
        </div>

        {/* Loading state */}
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="w-10 h-10 border-2 border-transparent border-t-brand rounded-full animate-spin" />
          </div>
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
                          {isSaved && (
                            <div className="text-[10px] font-bold text-brand bg-brand/10 px-2.5 py-0.5 rounded-md border border-brand/20">
                              Pred: {savedPred?.home_score_pred} - {savedPred?.away_score_pred}
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
                        disabled={submitPredictionMutation.isPending}
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
