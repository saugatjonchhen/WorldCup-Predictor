import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'

interface TeamInfo {
  flag_url: string
}

interface Match {
  id: string
  external_match_id: string
  home_team: string
  away_team: string
  home_team_ext_id: string
  away_team_ext_id: string
  kickoff_time: string
  stage: string
  group_name: string | null
  status: string
  home_score: number | null
  away_score: number | null
  home_team_info?: TeamInfo | null
  away_team_info?: TeamInfo | null
}

interface MatchPrediction {
  id: string
  match_id: string
  home_score_pred: number
  away_score_pred: number
  points_earned: number
  correct_result: boolean
  correct_goal_diff: boolean
  exact_score: boolean
  correct_advancing: boolean
  match: Match
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

const STAGES = [
  { id: 'round_of_16', label: 'Round of 16', icon: '⚽' },
  { id: 'qf', label: 'Quarterfinals', icon: '🏆' },
  { id: 'sf', label: 'Semifinals', icon: '🔥' },
  { id: 'final', label: 'Finals', icon: '🌟' },
  { id: 'winner', label: 'Champion', icon: '👑' },
]

interface Profile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  country: string | null
  role?: string
  created_at?: string
}

interface UserPredictionsViewProps {
  userId: string
  profile?: Profile | null
  showWarning?: boolean
}

export function UserPredictionsView({ userId, profile, showWarning = false }: UserPredictionsViewProps) {
  const [activeTab, setActiveTab] = useState<'matches' | 'stages'>('matches')
  
  // Prediction filters
  const [matchStatusFilter, setMatchStatusFilter] = useState<'all' | 'scheduled' | 'live' | 'completed'>('all')
  const [matchResultFilter, setMatchResultFilter] = useState<'all' | 'exact' | 'outcome' | 'incorrect' | 'pending'>('all')
  const [matchStageFilter, setMatchStageFilter] = useState<'all' | 'group' | 'knockout'>('all')

  const { data: predictions = [], isLoading: isLoadingPredictions } = useQuery<MatchPrediction[]>({
    queryKey: ['user-predictions-view', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('predictions')
        .select(`
          *,
          match:matches(
            *,
            home_team_info:teams!home_team_ext_id(flag_url),
            away_team_info:teams!away_team_ext_id(flag_url)
          )
        `)
        .eq('user_id', userId)

      if (error) throw error
      return (data || []).filter((p: any) => p.match) as MatchPrediction[]
    },
    enabled: !!userId,
  })

  const { data: stagePredictions = [], isLoading: isLoadingStagePredictions } = useQuery<StagePrediction[]>({
    queryKey: ['user-stage-predictions-view', userId],
    queryFn: async () => {
      if (!userId) return []
      const { data, error } = await supabase
        .from('stage_predictions')
        .select(`
          *,
          team:teams!team_id(name, flag_url, fifa_code)
        `)
        .eq('user_id', userId)

      if (error) throw error
      return data as unknown as StagePrediction[]
    },
    enabled: !!userId,
  })

  const stats = (() => {
    const total = predictions.length
    const completed = predictions.filter((p) => p.match.status === 'completed')
    const completedCount = completed.length
    const points = predictions.reduce((sum, p) => sum + (p.points_earned || 0), 0)
    
    const exact = predictions.filter((p) => p.exact_score && p.match.status === 'completed').length
    const outcomes = predictions.filter((p) => p.correct_result && !p.exact_score && p.match.status === 'completed').length
    const incorrect = predictions.filter((p) => !p.correct_result && p.match.status === 'completed').length

    const accuracyRate = completedCount > 0 ? Math.round(((exact + outcomes) / completedCount) * 100) : 0
    const exactRate = completedCount > 0 ? Math.round((exact / completedCount) * 100) : 0

    return {
      total,
      completedCount,
      points,
      exact,
      outcomes,
      incorrect,
      accuracyRate,
      exactRate,
      stagesCount: stagePredictions.length,
    }
  })()

  const filteredPredictions = predictions.filter((p) => {
    const m = p.match
    if (matchStatusFilter !== 'all' && m.status !== matchStatusFilter) return false
    if (matchResultFilter !== 'all') {
      if (matchResultFilter === 'exact' && (!p.exact_score || m.status !== 'completed')) return false
      if (matchResultFilter === 'outcome' && (!p.correct_result || p.exact_score || m.status !== 'completed')) return false
      if (matchResultFilter === 'incorrect' && (p.correct_result || m.status !== 'completed')) return false
      if (matchResultFilter === 'pending' && m.status === 'completed') return false
    }
    if (matchStageFilter !== 'all') {
      const isGroup = m.stage.toLowerCase() === 'group' || !!m.group_name
      if (matchStageFilter === 'group' && !isGroup) return false
      if (matchStageFilter === 'knockout' && isGroup) return false
    }
    return true
  })

  function formatLocalTime(timeStr: string) {
    const date = new Date(timeStr)
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* User Detail & Tabs Header */}
      {profile && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-2/40 p-4 border border-border/80 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border-2 border-brand bg-surface-2 overflow-hidden flex items-center justify-center font-bold text-lg text-gradient shadow-md shrink-0">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                (profile.display_name || profile.username || 'U').charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <h3 className="font-bold text-lg text-text-primary flex items-center gap-2">
                {profile.display_name || profile.username || 'User'}
                {profile.role === 'admin' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-brand text-text-inverse">
                    Admin
                  </span>
                )}
              </h3>
              <p className="text-xs text-text-secondary flex items-center gap-1.5 flex-wrap">
                <span>@{profile.username || 'username'}</span>
                <span>•</span>
                <span>Country: {profile.country || 'N/A'}</span>
                {profile.created_at && (
                  <>
                    <span>•</span>
                    <span className="text-[10px] text-text-muted">Joined {new Date(profile.created_at).toLocaleDateString()}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-surface-2 p-1 border border-border rounded-xl">
            <button
              onClick={() => setActiveTab('matches')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                activeTab === 'matches'
                  ? 'bg-brand text-text-inverse shadow-brand shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              ⚽ Matches ({predictions.length})
            </button>
            <button
              onClick={() => setActiveTab('stages')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                activeTab === 'stages'
                  ? 'bg-brand text-text-inverse shadow-brand shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              🔮 Bracket ({stagePredictions.length})
            </button>
          </div>
        </div>
      )}

      {/* Key Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Points card */}
        <div className="glass p-4 rounded-2xl border border-border/80 flex flex-col justify-between hover:scale-[1.02] transition-transform">
          <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">Total Score</span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-brand">{stats.points}</span>
            <span className="text-xs font-bold text-text-muted">pts</span>
          </div>
        </div>

        {/* Prediction Rate card */}
        <div className="glass p-4 rounded-2xl border border-border/80 flex flex-col justify-between hover:scale-[1.02] transition-transform">
          <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">Predictions</span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-text-primary">{stats.total}</span>
            <span className="text-xs font-bold text-text-muted">made</span>
          </div>
        </div>

        {/* Accuracy rate */}
        <div className="glass p-4 rounded-2xl border border-border/80 flex flex-col justify-between hover:scale-[1.02] transition-transform">
          <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">Outcome Accuracy</span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-500">{stats.accuracyRate}%</span>
            <span className="text-[10px] font-semibold text-text-muted">({stats.exact + stats.outcomes}/{stats.completedCount})</span>
          </div>
        </div>

        {/* Exact scores */}
        <div className="glass p-4 rounded-2xl border border-border/80 flex flex-col justify-between hover:scale-[1.02] transition-transform">
          <span className="text-[10px] font-black uppercase tracking-wider text-text-muted">Exact Scores</span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-indigo-400">{stats.exact}</span>
            <span className="text-xs font-bold text-text-muted">times</span>
          </div>
        </div>
      </div>

      {showWarning && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2.5">
          <span className="text-sm">🔒</span>
          <span className="font-medium">Read-Only View: Inspecting user submissions. Creation or edit of these models is disabled.</span>
        </div>
      )}

      {activeTab === 'matches' ? (
        <div className="space-y-4">
          <div className="glass p-4 rounded-xl border border-border/60 flex flex-col sm:flex-row justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-text-muted">Match Status</label>
                <div className="flex bg-surface-2 p-0.5 border border-border rounded-lg gap-0.5">
                  {(['all', 'scheduled', 'live', 'completed'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setMatchStatusFilter(status)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold capitalize transition-colors ${
                        matchStatusFilter === status
                          ? 'bg-brand text-text-inverse'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-text-muted">Accuracy Filter</label>
                <div className="flex bg-surface-2 p-0.5 border border-border rounded-lg gap-0.5">
                  {(['all', 'exact', 'outcome', 'incorrect', 'pending'] as const).map((res) => (
                    <button
                      key={res}
                      onClick={() => setMatchResultFilter(res)}
                      className={`px-2 py-1 rounded-md text-[10px] font-bold capitalize transition-colors ${
                        matchResultFilter === res
                          ? 'bg-brand text-text-inverse'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-text-muted">Tournament Phase</label>
                <div className="flex bg-surface-2 p-0.5 border border-border rounded-lg gap-0.5">
                  {(['all', 'group', 'knockout'] as const).map((phase) => (
                    <button
                      key={phase}
                      onClick={() => setMatchStageFilter(phase)}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold capitalize transition-colors ${
                        matchStageFilter === phase
                          ? 'bg-brand text-text-inverse'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {phase}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {(matchStatusFilter !== 'all' || matchResultFilter !== 'all' || matchStageFilter !== 'all') && (
              <button
                onClick={() => {
                  setMatchStatusFilter('all')
                  setMatchResultFilter('all')
                  setMatchStageFilter('all')
                }}
                className="self-end sm:self-center px-3 py-1.5 rounded-lg border border-border hover:bg-surface-2 text-[10px] font-bold text-brand transition-colors cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>

          {isLoadingPredictions ? (
            <div className="flex justify-center items-center py-20">
              <div className="w-10 h-10 border-2 border-transparent border-t-brand rounded-full animate-spin" />
            </div>
          ) : filteredPredictions.length === 0 ? (
            <div className="glass p-12 rounded-xl text-center border border-border/80 max-w-md mx-auto">
              <span className="text-3xl">⚽</span>
              <h3 className="mt-4 font-display font-bold text-base text-text-primary">
                No Predictions Found
              </h3>
              <p className="mt-2 text-xs text-text-secondary">
                No predictions match the active filter criteria.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredPredictions.map((p) => {
                const m = p.match
                const isFinished = m.status === 'completed'
                const isLive = m.status === 'live'
                
                let cardBorder = 'border-border/60 hover:border-border-hover'
                let cardBg = 'glass'
                if (isFinished) {
                  if (p.exact_score) {
                    cardBorder = 'border-emerald-500/50 shadow-emerald-500/5'
                    cardBg = 'bg-emerald-500/[0.02] border'
                  } else if (p.correct_result) {
                    cardBorder = 'border-blue-500/50 shadow-blue-500/5'
                    cardBg = 'bg-blue-500/[0.02] border'
                  } else {
                    cardBorder = 'border-red-500/30 shadow-red-500/5'
                    cardBg = 'bg-red-500/[0.01] border'
                  }
                }

                return (
                  <div
                    key={p.id}
                    className={`${cardBg} rounded-2xl p-5 flex flex-col justify-between transition-all duration-300 hover:shadow-lg ${cardBorder}`}
                  >
                    <div className="flex flex-col gap-1 mb-4 border-b border-border/40 pb-2">
                      <div className="flex items-center justify-between text-[10px] text-text-secondary">
                        <span className="font-bold uppercase tracking-wider">
                          {m.group_name ? `Group ${m.group_name}` : m.stage.replace('_', ' ')} • Match {m.external_match_id}
                        </span>
                        <span className={`px-2 py-0.5 rounded font-black uppercase tracking-wider text-[8px] ${
                          isFinished 
                            ? 'bg-surface-3 text-text-secondary border border-border/60' 
                            : isLive 
                              ? 'bg-rose-500 text-white animate-pulse'
                              : 'bg-brand/10 text-brand border border-brand/20'
                        }`}>
                          {m.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-text-muted font-medium">
                        {formatLocalTime(m.kickoff_time)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 my-2">
                      <div className="flex flex-col items-center gap-2 flex-1 text-center">
                        <img
                          src={m.home_team_info?.flag_url ?? 'https://flagcdn.com/w80/un.png'}
                          alt={m.home_team}
                          className="w-10 h-6 object-cover rounded shadow-sm border border-border/40"
                        />
                        <span className="text-xs font-bold text-text-primary line-clamp-1">
                          {m.home_team}
                        </span>
                      </div>

                      <div className="flex flex-col items-center gap-1.5 min-w-[90px]">
                        <div className="text-[9px] uppercase font-black tracking-wider text-text-muted">
                          Predicted
                        </div>
                        <div className="flex items-center gap-2 bg-surface-2 px-3 py-1.5 rounded-xl border border-border font-extrabold text-sm text-text-primary shadow-inner">
                          <span>{p.home_score_pred}</span>
                          <span className="text-text-muted font-normal">-</span>
                          <span>{p.away_score_pred}</span>
                        </div>

                        {m.status !== 'scheduled' && (
                          <>
                            <div className="text-[9px] uppercase font-black tracking-wider text-text-muted mt-1.5">
                              Actual
                            </div>
                            <div className="flex items-center gap-2 bg-brand/10 border border-brand/20 px-2.5 py-1 rounded-lg font-black text-xs text-brand">
                              <span>{m.home_score ?? 0}</span>
                              <span>:</span>
                              <span>{m.away_score ?? 0}</span>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex flex-col items-center gap-2 flex-1 text-center">
                        <img
                          src={m.away_team_info?.flag_url ?? 'https://flagcdn.com/w80/un.png'}
                          alt={m.away_team}
                          className="w-10 h-6 object-cover rounded shadow-sm border border-border/40"
                        />
                        <span className="text-xs font-bold text-text-primary line-clamp-1">
                          {m.away_team}
                        </span>
                      </div>
                    </div>

                    {isFinished && (
                      <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
                        <span className={`font-black uppercase tracking-wider text-[11px] ${
                          p.points_earned > 0 ? 'text-brand' : 'text-text-muted'
                        }`}>
                          Points: {p.points_earned}
                        </span>
                        <div className="flex gap-1 flex-wrap justify-end">
                          {p.exact_score && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-[9px]">
                              Exact Score
                            </span>
                          )}
                          {p.correct_result && !p.exact_score && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold text-[9px]">
                              Outcome Match
                            </span>
                          )}
                          {p.correct_goal_diff && !p.exact_score && (
                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold text-[9px]">
                              Goal Diff
                            </span>
                          )}
                          {p.points_earned === 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-surface-3 border border-border text-text-muted font-bold text-[9px]">
                              Incorrect
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : isLoadingStagePredictions ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-10 h-10 border-2 border-transparent border-t-brand rounded-full animate-spin" />
        </div>
      ) : stagePredictions.length === 0 ? (
        <div className="glass p-12 rounded-xl text-center border border-border/80 max-w-md mx-auto">
          <span className="text-3xl">🔮</span>
          <h3 className="mt-4 font-display font-bold text-base text-text-primary">
            No Bracket Stage Submissions
          </h3>
          <p className="mt-2 text-xs text-text-secondary">
            No selections stored for advanced stages.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {STAGES.map((stage) => {
            const predictionsForStage = stagePredictions.filter((sp) => sp.stage === stage.id)
            return (
              <div key={stage.id} className="glass p-5 rounded-2xl border border-border/85 space-y-3">
                <div className="flex items-center gap-2 border-b border-border/40 pb-2">
                  <span className="text-lg">{stage.icon}</span>
                  <h4 className="font-extrabold text-sm text-text-primary">{stage.label}</h4>
                </div>

                {predictionsForStage.length === 0 ? (
                  <p className="text-xs text-text-muted italic">No selections stored for this round.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {predictionsForStage.map((sp) => (
                      <div
                        key={sp.id}
                        className="border border-border/60 bg-surface-2/40 hover:bg-surface-2 hover:border-brand/40 rounded-xl p-2.5 flex flex-col items-center gap-1.5 text-center transition-all duration-300 shadow-sm"
                      >
                        <img
                          src={sp.team.flag_url ?? 'https://flagcdn.com/w80/un.png'}
                          alt={sp.team.name}
                          className="w-8 h-5 object-cover rounded border border-border/30 shadow-sm"
                        />
                        <span className="text-[10px] font-bold text-text-primary line-clamp-1">
                          {sp.team.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
