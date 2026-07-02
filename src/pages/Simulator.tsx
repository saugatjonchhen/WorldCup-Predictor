import { useState } from 'react'
import { Layout } from '@/components/Layout'
import { supabase } from '@/lib/supabase'
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
  live_home_score: number | null
  live_away_score: number | null
  live_minute: string | null
  home_score: number | null
  away_score: number | null
  home_score_et?: number | null
  away_score_et?: number | null
  penalty_winner: string | null
  home_team_info?: { flag_url: string } | null
  away_team_info?: { flag_url: string } | null
}

interface Prediction {
  id: string
  user_id: string
  home_score_pred: number
  away_score_pred: number
  advancing_team: string | null
  points_earned: number
  live_points: number
  correct_result: boolean
  correct_goal_diff: boolean
  exact_score: boolean
  correct_advancing: boolean
  profiles?: {
    username: string
    display_name: string | null
  }
}

export default function Simulator() {
  const queryClient = useQueryClient()
  const [selectedMatchId, setSelectedMatchId] = useState<string>('')

  // 1. Fetch all matches
  const { data: matches = [], isLoading: isLoadingMatches } = useQuery<Match[]>({
    queryKey: ['simulator-matches'],
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

  // Selected match detail
  const selectedMatch = matches.find((m) => m.id === selectedMatchId)

  // 2. Fetch predictions for selected match
  const { data: predictions = [], isLoading: isLoadingPredictions } = useQuery<Prediction[]>({
    queryKey: ['simulator-predictions', selectedMatchId],
    queryFn: async () => {
      if (!selectedMatchId) return []
      const { data, error } = await supabase
        .from('predictions')
        .select(`
          *,
          profiles (
            username,
            display_name
          )
        `)
        .eq('match_id', selectedMatchId)

      if (error) throw error
      return data as unknown as Prediction[]
    },
    enabled: !!selectedMatchId,
  })

  // Mutation to update match state
  const updateMatchMutation = useMutation({
    mutationFn: async (payload: Partial<Match>) => {
      if (!selectedMatchId) return
      const { error } = await supabase
        .from('matches')
        .update(payload)
        .eq('id', selectedMatchId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['simulator-matches'] })
      queryClient.invalidateQueries({ queryKey: ['simulator-predictions', selectedMatchId] })
      queryClient.invalidateQueries({ queryKey: ['matches'] })
      queryClient.invalidateQueries({ queryKey: ['match', selectedMatchId] })
      queryClient.invalidateQueries({ queryKey: ['match-predictions', selectedMatchId] })
    },
  })

  // Helper actions
  const startMatch = () => {
    updateMatchMutation.mutate({
      status: 'live',
      live_home_score: 0,
      live_away_score: 0,
      live_minute: '1',
      home_score: null,
      away_score: null,
      penalty_winner: null,
    })
  }

  const incrementScore = (side: 'home' | 'away', amount: number) => {
    if (!selectedMatch) return
    const current = side === 'home' ? (selectedMatch.live_home_score ?? 0) : (selectedMatch.live_away_score ?? 0)
    const newScore = Math.max(0, current + amount)
    updateMatchMutation.mutate({
      [side === 'home' ? 'live_home_score' : 'live_away_score']: newScore,
    })
  }

  const updateMinute = (minute: string) => {
    updateMatchMutation.mutate({ live_minute: minute })
  }

  const completeMatch = (penaltyWinner?: string) => {
    if (!selectedMatch) return
    updateMatchMutation.mutate({
      status: 'completed',
      home_score: selectedMatch.live_home_score ?? 0,
      away_score: selectedMatch.live_away_score ?? 0,
      live_minute: 'FT',
      penalty_winner: penaltyWinner || null,
    })
  }

  const resetMatch = () => {
    updateMatchMutation.mutate({
      status: 'scheduled',
      live_home_score: null,
      live_away_score: null,
      live_minute: 'notstarted',
      home_score: null,
      away_score: null,
      penalty_winner: null,
    })
  }

  return (
    <Layout>
      <div className="space-y-8 max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-gradient">
            Match Simulator ⚙️
          </h1>
          <p className="text-text-secondary text-sm">
            Control match scores and statuses in real-time to verify the scoring and leaderboard engine.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Matches List */}
          <div className="glass p-5 rounded-2xl border border-border/80 flex flex-col max-h-[600px]">
            <h3 className="font-display font-bold text-base mb-3 border-b border-border/40 pb-2">
              Select Match
            </h3>
            {isLoadingMatches ? (
              <div className="flex justify-center py-10">
                <div className="w-6 h-6 border-2 border-transparent border-t-brand rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto pr-1 flex-1">
                {matches.map((m) => {
                  const isSelected = m.id === selectedMatchId
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMatchId(m.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all text-xs flex flex-col gap-1.5 ${
                        isSelected
                          ? 'border-brand bg-brand-muted/10 ring-1 ring-brand'
                          : 'border-border/60 hover:bg-surface-2 bg-surface-2/30'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[10px] font-bold text-text-secondary">
                        <span>MATCH {m.external_match_id} • Group {m.group_name || 'N/A'}</span>
                        {m.status === 'live' && (
                          <span className="px-1.5 py-0.5 rounded bg-live-muted text-live font-bold animate-pulse">
                            LIVE
                          </span>
                        )}
                        {m.status === 'completed' && (
                          <span className="px-1.5 py-0.5 rounded bg-surface-3 text-text-secondary">
                            FINAL
                          </span>
                        )}
                        {m.status === 'scheduled' && (
                          <span className="text-text-muted">SCHEDULED</span>
                        )}
                      </div>
                      <div className="flex justify-between items-center font-bold text-text-primary">
                        <span>{m.home_team}</span>
                        <span className="text-brand">
                          {m.status === 'live'
                            ? `${m.live_home_score} - ${m.live_away_score}`
                            : m.status === 'completed'
                            ? `${m.home_score} - ${m.away_score}`
                            : 'vs'}
                        </span>
                        <span>{m.away_team}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Simulator Control Panel */}
          <div className="md:col-span-2 space-y-6">
            {!selectedMatch ? (
              <div className="glass p-12 rounded-2xl border border-border/80 text-center flex flex-col items-center justify-center min-h-[300px]">
                <span className="text-4xl mb-3">🎮</span>
                <h3 className="font-display font-bold text-lg text-text-primary">No Match Selected</h3>
                <p className="text-sm text-text-secondary mt-1">
                  Select a match from the left panel to control and simulate events.
                </p>
              </div>
            ) : (
              <>
                {/* Control Panel Card */}
                <div className="glass p-6 rounded-2xl border border-border/80 space-y-6 relative overflow-hidden">
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-brand via-sky to-brand opacity-30" />
                  
                  <div className="flex justify-between items-center border-b border-border/40 pb-4">
                    <div>
                      <span className="text-xs font-semibold text-text-secondary uppercase">
                        Simulation Control
                      </span>
                      <h3 className="font-display font-bold text-xl text-text-primary mt-0.5">
                        {selectedMatch.home_team} vs {selectedMatch.away_team}
                      </h3>
                    </div>
                    <button
                      onClick={resetMatch}
                      className="btn btn-ghost border border-border text-xs px-3 py-1.5 hover:text-live hover:border-live/40"
                    >
                      Reset Match 🔄
                    </button>
                  </div>

                  {/* Status Indicator */}
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-surface-2 p-3 rounded-xl border border-border">
                      <span className="text-[10px] text-text-muted uppercase font-bold block">Status</span>
                      <span className="text-sm font-bold text-text-primary uppercase mt-1 block">
                        {selectedMatch.status}
                      </span>
                    </div>
                    <div className="bg-surface-2 p-3 rounded-xl border border-border">
                      <span className="text-[10px] text-text-muted uppercase font-bold block">Live Score</span>
                      <span className="text-sm font-black text-brand mt-1 block">
                        {selectedMatch.live_home_score ?? '-'} : {selectedMatch.live_away_score ?? '-'}
                      </span>
                    </div>
                    <div className="bg-surface-2 p-3 rounded-xl border border-border">
                      <span className="text-[10px] text-text-muted uppercase font-bold block">Live Minute</span>
                      <span className="text-sm font-bold text-text-primary mt-1 block">
                        {selectedMatch.live_minute ?? 'notstarted'}
                      </span>
                    </div>
                  </div>

                  {/* Action Steps */}
                  <div className="space-y-4">
                    {/* Step 1: Start Match */}
                    {selectedMatch.status === 'scheduled' && (
                      <div className="bg-brand-muted/10 border border-brand/20 p-4 rounded-xl flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold">Kickoff Match</h4>
                          <p className="text-xs text-text-secondary mt-0.5">Change status to LIVE and set scores to 0-0.</p>
                        </div>
                        <button onClick={startMatch} className="btn btn-primary text-xs px-4 py-2 font-bold shadow-brand">
                          Kickoff 🏁
                        </button>
                      </div>
                    )}

                    {/* Step 2: Live scoring actions */}
                    {selectedMatch.status === 'live' && (
                      <div className="space-y-4 bg-surface-2/40 border border-border/80 p-4 rounded-xl">
                        <h4 className="text-sm font-bold border-b border-border/40 pb-2">Live Controls</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                          {/* Home Score */}
                          <div className="bg-surface-2 p-3 rounded-xl border border-border text-center">
                            <span className="text-xs font-semibold text-text-secondary">{selectedMatch.home_team}</span>
                            <div className="flex items-center justify-center gap-3 mt-2">
                              <button onClick={() => incrementScore('home', -1)} className="w-8 h-8 rounded-lg bg-surface-3 border border-border flex items-center justify-center font-bold text-lg hover:border-brand">-</button>
                              <span className="text-xl font-black">{selectedMatch.live_home_score ?? 0}</span>
                              <button onClick={() => incrementScore('home', 1)} className="w-8 h-8 rounded-lg bg-surface-3 border border-border flex items-center justify-center font-bold text-lg hover:border-brand">+</button>
                            </div>
                          </div>

                          {/* Away Score */}
                          <div className="bg-surface-2 p-3 rounded-xl border border-border text-center">
                            <span className="text-xs font-semibold text-text-secondary">{selectedMatch.away_team}</span>
                            <div className="flex items-center justify-center gap-3 mt-2">
                              <button onClick={() => incrementScore('away', -1)} className="w-8 h-8 rounded-lg bg-surface-3 border border-border flex items-center justify-center font-bold text-lg hover:border-brand">-</button>
                              <span className="text-xl font-black">{selectedMatch.live_away_score ?? 0}</span>
                              <button onClick={() => incrementScore('away', 1)} className="w-8 h-8 rounded-lg bg-surface-3 border border-border flex items-center justify-center font-bold text-lg hover:border-brand">+</button>
                            </div>
                          </div>
                        </div>

                        {/* Match Minute */}
                        <div>
                          <span className="text-xs font-bold text-text-secondary block mb-2">Simulate Match Minute</span>
                          <div className="flex gap-2 flex-wrap">
                            {['15', '45', 'HT', '60', '90', '90+3'].map((min) => (
                              <button
                                key={min}
                                onClick={() => updateMinute(min)}
                                className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                                  selectedMatch.live_minute === min
                                    ? 'border-brand bg-brand-muted/10 text-brand'
                                    : 'border-border/60 hover:bg-surface-3 text-text-secondary'
                                }`}
                              >
                                {min}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* End Match Option */}
                        <div className="pt-2 border-t border-border/40 flex flex-col gap-3">
                          <span className="text-xs font-bold text-text-secondary">Finish Match & Recalculate Leaderboard</span>
                          
                          {/* Knockout Match options (Penalties if Draw) */}
                          {selectedMatch.stage !== 'group' && selectedMatch.live_home_score === selectedMatch.live_away_score ? (
                            <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg space-y-2">
                              <span className="text-xs font-bold text-amber-500 block">Knockout Penalty Shootout Required:</span>
                              <div className="flex gap-3">
                                <button
                                  onClick={() => completeMatch(selectedMatch.home_team)}
                                  className="btn btn-primary btn-sm flex-1 text-xs font-bold py-2 bg-amber-500 hover:bg-amber-600 border-none"
                                >
                                  Winner: {selectedMatch.home_team}
                                </button>
                                <button
                                  onClick={() => completeMatch(selectedMatch.away_team)}
                                  className="btn btn-primary btn-sm flex-1 text-xs font-bold py-2 bg-amber-500 hover:bg-amber-600 border-none"
                                >
                                  Winner: {selectedMatch.away_team}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => completeMatch()}
                              className="btn btn-primary w-full text-xs font-bold py-2.5 shadow-brand"
                            >
                              Complete Match & Lock Results 🏁
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Step 3: Match completed display */}
                    {selectedMatch.status === 'completed' && (
                      <div className="bg-surface-2 border border-border p-4 rounded-xl text-center space-y-2">
                        <span className="text-2xl">🎉</span>
                        <h4 className="text-sm font-bold text-text-primary">Match Finished (Locked)</h4>
                        <p className="text-xs text-text-secondary">
                          Final Score: {selectedMatch.home_score} - {selectedMatch.away_score}
                          {selectedMatch.home_score_et !== null && selectedMatch.home_score_et !== undefined && ` (${selectedMatch.home_score + selectedMatch.home_score_et} - ${selectedMatch.away_score + selectedMatch.away_score_et} AET)`}
                          {selectedMatch.penalty_winner && ` (Winner: ${selectedMatch.penalty_winner})`}
                        </p>
                        <p className="text-[11px] text-brand font-semibold">
                          Official points have been calculated and leaderboards updated!
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Predictions Panel for verification */}
                <div className="glass p-5 rounded-2xl border border-border/80 space-y-3">
                  <h3 className="font-display font-bold text-base border-b border-border/40 pb-2 flex justify-between">
                    <span>Predictions & Calculations ({predictions.length})</span>
                    <span className="text-xs text-text-muted font-normal">Real-Time Verification</span>
                  </h3>
                  {isLoadingPredictions ? (
                    <div className="flex justify-center py-6">
                      <div className="w-5 h-5 border-2 border-transparent border-t-brand rounded-full animate-spin" />
                    </div>
                  ) : predictions.length === 0 ? (
                    <p className="text-xs text-text-secondary text-center py-6">No users have placed predictions on this match yet.</p>
                  ) : (
                    <div className="divide-y divide-border/40 max-h-[300px] overflow-y-auto pr-1">
                      {predictions.map((p) => (
                        <div key={p.id} className="py-2.5 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-bold text-text-primary">
                              {p.profiles?.display_name || p.profiles?.username || p.user_id.slice(0, 8)}
                            </span>
                            <div className="flex gap-2 text-[10px] text-text-secondary mt-0.5">
                              <span>Pred: <strong className="text-brand">{p.home_score_pred} - {p.away_score_pred}</strong></span>
                              {p.advancing_team && <span>(Adv: {p.advancing_team})</span>}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="font-bold">
                              {selectedMatch.status === 'completed' ? (
                                <span className="text-brand">Official: {p.points_earned} pts</span>
                              ) : (
                                <span className="text-amber-500">Live: {p.live_points} pts</span>
                              )}
                            </div>
                            <div className="flex gap-1.5 text-[9px] text-text-muted mt-0.5 justify-end">
                              <span className={p.exact_score ? 'text-brand font-bold' : ''}>exact:{p.exact_score ? 'Y' : 'N'}</span>
                              <span className={p.correct_result ? 'text-brand font-bold' : ''}>res:{p.correct_result ? 'Y' : 'N'}</span>
                              <span className={p.correct_goal_diff ? 'text-brand font-bold' : ''}>gd:{p.correct_goal_diff ? 'Y' : 'N'}</span>
                              {selectedMatch.stage !== 'group' && (
                                <span className={p.correct_advancing ? 'text-brand font-bold' : ''}>adv:{p.correct_advancing ? 'Y' : 'N'}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
