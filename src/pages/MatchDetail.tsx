import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

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
  user_id: string
  home_score_pred: number
  away_score_pred: number
  profiles?: {
    username: string
    display_name: string | null
    avatar_url: string | null
  }
}

export default function MatchDetail() {
  const { matchId } = useParams<{ matchId: string }>()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!matchId) return

    const channel = supabase
      .channel(`match-detail-realtime-${matchId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['match', matchId] })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'predictions', filter: `match_id=eq.${matchId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['prediction', matchId, user?.id] })
          queryClient.invalidateQueries({ queryKey: ['match-predictions', matchId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, matchId, user?.id])

  // Local state for score input editing
  const [homeInput, setHomeInput] = useState('')
  const [awayInput, setAwayInput] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 1. Fetch match metadata
  const { data: match, isLoading: isLoadingMatch } = useQuery<Match>({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          home_team_info:teams!home_team_ext_id(flag_url),
          away_team_info:teams!away_team_ext_id(flag_url)
        `)
        .eq('id', matchId)
        .single()

      if (error) throw error
      return data as unknown as Match
    },
    enabled: !!matchId,
  })

  // 2. Fetch current user's prediction
  const { data: userPrediction } = useQuery<Prediction | null>({
    queryKey: ['prediction', matchId, user?.id],
    queryFn: async () => {
      if (!user?.id || !matchId) return null
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('match_id', matchId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) throw error
      if (data) {
        setHomeInput(String(data.home_score_pred))
        setAwayInput(String(data.away_score_pred))
      }
      return data
    },
    enabled: !!matchId && !!user?.id,
  })

  // 3. Fetch all predictions for this match (only allowed if kicked off)
  const { data: allPredictions = [], isLoading: isLoadingAllPredictions } = useQuery<Prediction[]>({
    queryKey: ['match-predictions', matchId],
    queryFn: async () => {
      if (!matchId) return []
      const { data, error } = await supabase
        .from('predictions')
        .select(`
          id,
          match_id,
          user_id,
          home_score_pred,
          away_score_pred,
          profiles (
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('match_id', matchId)

      if (error) throw error
      return data as unknown as Prediction[]
    },
    enabled: !!matchId && !!match && (new Date(match.kickoff_time) < new Date() || match.status === 'completed'),
  })

  // Mutation to submit prediction
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !matchId) return

      const homeVal = parseInt(homeInput)
      const awayVal = parseInt(awayInput)

      if (isNaN(homeVal) || isNaN(awayVal) || homeVal < 0 || awayVal < 0) {
        throw new Error('Please enter valid, non-negative scores.')
      }

      const { data, error } = await supabase.from('predictions').upsert(
        {
          user_id: user.id,
          match_id: matchId,
          home_score_pred: homeVal,
          away_score_pred: awayVal,
        },
        { onConflict: 'user_id,match_id' }
      )

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prediction', matchId, user?.id] })
      setSuccessMsg('Prediction saved!')
      setErrorMsg(null)
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to save prediction.')
      setSuccessMsg(null)
    },
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSuccessMsg(null)
    setErrorMsg(null)
    submitMutation.mutate()
  }

  const isLoading = isLoadingMatch

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-2 border-transparent border-t-brand rounded-full animate-spin" />
        </div>
      </Layout>
    )
  }

  if (!match) {
    return (
      <Layout>
        <div className="glass p-10 rounded-xl text-center border border-border/80 max-w-md mx-auto">
          <h3 className="font-display font-bold text-lg text-text-primary">Match Not Found</h3>
          <Link to="/dashboard" className="btn btn-primary btn-sm mt-4">
            Back to Dashboard
          </Link>
        </div>
      </Layout>
    )
  }
  const kickoffDate = new Date(match.kickoff_time)
  const deadlineTime = kickoffDate.getTime() - 2 * 60 * 60 * 1000
  const isLocked = new Date().getTime() > deadlineTime || match.status === 'live' || match.status === 'completed'
  const hasKickedOff = kickoffDate < new Date()

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
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    const tStr = date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
    return `${dStr} • ${tStr} (${tzString})`
  }

  return (
    <Layout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <Link to="/dashboard" className="text-sm font-semibold text-brand hover:text-brand-dim transition-colors flex items-center gap-1">
          ← Back to Dashboard
        </Link>

        {/* Match Header card */}
        <div className="glass p-6 sm:p-8 rounded-2xl border border-border/80 text-center relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand via-sky to-brand opacity-30" />
          <div className="text-xs text-text-secondary uppercase font-semibold tracking-widest mb-4">
            Group {match.group_name} • Match {match.external_match_id}
          </div>

          <div className="flex items-center justify-center gap-4 sm:gap-8 my-6">
            {/* Home team */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-[200px]">
              <img
                src={match.home_team_info?.flag_url?.replace('/w80/', '/w160/') ?? 'https://flagcdn.com/w160/un.png'}
                alt={match.home_team}
                className="w-16 h-10 sm:w-24 sm:h-16 object-cover rounded-md shadow border border-border/40"
                onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w160/un.png' }}
              />
              <span className="font-display font-bold text-base sm:text-lg text-text-primary mt-2">
                {match.home_team}
              </span>
            </div>

            {/* Score / Center indicator */}
            <div className="flex flex-col items-center justify-center">
              {match.status === 'completed' || match.status === 'live' ? (
                <div className="text-3xl sm:text-5xl font-black tracking-tight px-6 py-2 bg-surface-2 rounded-2xl border border-border">
                  {match.home_score} : {match.away_score}
                </div>
              ) : (
                <div className="text-lg font-bold text-text-muted">VS</div>
              )}

              <div className="mt-4 text-xs font-semibold text-text-secondary">
                {formatLocalTime(match.kickoff_time)}
              </div>
            </div>

            {/* Away team */}
            <div className="flex flex-col items-center gap-2 flex-1 max-w-[200px]">
              <img
                src={match.away_team_info?.flag_url?.replace('/w80/', '/w160/') ?? 'https://flagcdn.com/w160/un.png'}
                alt={match.away_team}
                className="w-16 h-10 sm:w-24 sm:h-16 object-cover rounded-md shadow border border-border/40"
                onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w160/un.png' }}
              />
              <span className="font-display font-bold text-base sm:text-lg text-text-primary mt-2">
                {match.away_team}
              </span>
            </div>
          </div>
        </div>

        {/* Prediction section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* User prediction submission */}
          <div className="glass p-6 rounded-2xl border border-border/80 space-y-4">
            <h3 className="font-display font-bold text-lg mb-2">
              {isLocked ? '🔒 Your Prediction (Locked)' : '🎯 Make Your Prediction'}
            </h3>

            {errorMsg && (
              <div className="p-3 text-sm rounded bg-live-muted border border-live text-live">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-3 text-sm rounded bg-brand-muted border border-brand text-brand">
                {successMsg}
              </div>
            )}

            {isLocked ? (
              <div className="bg-surface-2 border border-border rounded-xl p-5 text-center">
                {userPrediction ? (
                  <div>
                    <p className="text-xs text-text-secondary uppercase font-bold">You Predicted</p>
                    <p className="text-3xl font-black text-brand mt-2">
                      {userPrediction.home_score_pred} - {userPrediction.away_score_pred}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-text-secondary">You did not make a prediction for this match.</p>
                )}
              </div>
            ) : (
              <form onSubmit={handleSave} className="space-y-4">
                <div className="flex justify-center items-center gap-4 py-2">
                  <div className="text-center">
                    <span className="text-xs text-text-secondary font-semibold block mb-1.5">{match.home_team}</span>
                    <input
                      type="number"
                      min="0"
                      value={homeInput}
                      onChange={(e) => setHomeInput(e.target.value)}
                      className="w-16 h-16 text-center text-2xl font-black bg-surface-2 border border-border rounded-2xl focus:border-brand focus:outline-none"
                      placeholder="-"
                    />
                  </div>
                  <span className="text-xl text-text-muted font-bold mt-4">:</span>
                  <div className="text-center">
                    <span className="text-xs text-text-secondary font-semibold block mb-1.5">{match.away_team}</span>
                    <input
                      type="number"
                      min="0"
                      value={awayInput}
                      onChange={(e) => setAwayInput(e.target.value)}
                      className="w-16 h-16 text-center text-2xl font-black bg-surface-2 border border-border rounded-2xl focus:border-brand focus:outline-none"
                      placeholder="-"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitMutation.isPending}
                  className="w-full btn btn-primary py-3 font-bold text-sm shadow-brand"
                >
                  {submitMutation.isPending ? 'Saving...' : 'Save Prediction'}
                </button>
              </form>
            )}
          </div>

          {/* Social predictions reveal list */}
          <div className="glass p-6 rounded-2xl border border-border/80 space-y-4">
            <h3 className="font-display font-bold text-lg mb-2">
              👥 Friend Predictions
            </h3>

            {!hasKickedOff ? (
              <div className="bg-surface-2 border border-border rounded-xl p-5 text-center flex flex-col items-center justify-center min-h-[140px]">
                <span className="text-2xl mb-2">🕵️‍♂️</span>
                <p className="text-xs font-semibold text-text-secondary uppercase">Predictions Hidden</p>
                <p className="text-[11px] text-text-muted mt-1 max-w-[250px]">
                  Predictions from other players will be revealed once the match kicks off to prevent copycats!
                </p>
              </div>
            ) : isLoadingAllPredictions ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-2 border-transparent border-t-brand rounded-full animate-spin" />
              </div>
            ) : allPredictions.length === 0 ? (
              <p className="text-xs text-text-secondary text-center py-6">No other users predicted this match.</p>
            ) : (
              <div className="divide-y divide-border/40 max-h-[300px] overflow-y-auto pr-1">
                {allPredictions.map((pred) => (
                  <div key={pred.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full border border-border bg-surface-3 flex items-center justify-center font-bold text-[10px] text-gradient overflow-hidden">
                        {pred.profiles?.avatar_url ? (
                          <img src={pred.profiles.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                        ) : (
                          (pred.profiles?.display_name || pred.profiles?.username || 'U').charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="font-semibold text-text-primary text-xs">
                        {pred.profiles?.display_name || pred.profiles?.username}
                      </span>
                    </div>

                    <span className="font-black text-brand text-xs">
                      {pred.home_score_pred} - {pred.away_score_pred}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
