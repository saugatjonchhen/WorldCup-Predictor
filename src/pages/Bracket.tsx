import { useState, useEffect } from 'react'
import { Layout } from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

interface Team {
  id: string
  external_team_id: string
  name: string
  flag_url: string
  fifa_code: string
  group_name: string
}

interface StagePrediction {
  id: string
  stage: string
  team_id: string
}

const STAGES = [
  { id: 'round_of_16', label: 'Round of 16', limit: 16, icon: '⚽', points: '2 pts per correct team' },
  { id: 'qf', label: 'Quarterfinals', limit: 8, icon: '🏆', points: '2 pts per correct team' },
  { id: 'sf', label: 'Semifinals', limit: 4, icon: '🔥', points: '2 pts per correct team' },
  { id: 'final', label: 'Finals', limit: 2, icon: '🌟', points: '2 pts per correct team' },
  { id: 'winner', label: 'Champion', limit: 1, icon: '👑', points: '20 pts for correct pick' },
]

export default function Bracket() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [activeStage, setActiveStage] = useState<string>('round_of_16')
  const [searchQuery, setSearchQuery] = useState('')
  const [groupFilter, setGroupFilter] = useState('all')

  // Selections state: { [stageId]: Set(team_external_id) }
  const [selections, setSelections] = useState<{ [stage: string]: Set<string> }>({
    round_of_16: new Set(),
    qf: new Set(),
    sf: new Set(),
    final: new Set(),
    winner: new Set(),
  })

  // 1. Fetch Teams
  const { data: teams = [], isLoading: isLoadingTeams } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      return data as Team[]
    },
  })

  // 2. Fetch User's Stage Predictions
  const { data: userPredictions = [], isLoading: isLoadingPreds } = useQuery<StagePrediction[]>({
    queryKey: ['stage-predictions', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const { data, error } = await supabase
        .from('stage_predictions')
        .select('id, stage, team_id')
        .eq('user_id', user.id)

      if (error) throw error
      return data as StagePrediction[]
    },
    enabled: !!user?.id,
  })

  // 3. Fetch First Match Kickoff of Round of 32 for Deadline
  const { data: lockTime, isLoading: isLoadingDeadline } = useQuery<Date | null>({
    queryKey: ['bracket-lock-time'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('kickoff_time')
        .eq('stage', 'round_of_32')
        .order('kickoff_time', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      if (!data) return null

      // Deadline is 2 hours before the first match kickoff of Round of 32
      const kickoff = new Date(data.kickoff_time)
      return new Date(kickoff.getTime() - 2 * 60 * 60 * 1000)
    },
  })

  // Calculate if submissions are locked
  const [isLocked, setIsLocked] = useState(false)
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    if (!lockTime) return
    const interval = setInterval(() => {
      const now = new Date().getTime()
      const diff = lockTime.getTime() - now

      if (diff <= 0) {
        setIsLocked(true)
        setTimeLeft('Locked')
        clearInterval(interval)
      } else {
        setIsLocked(false)
        const hours = Math.floor(diff / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((diff % (1000 * 60)) / 1000)
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [lockTime])

  // Populate local selections state when predictions are loaded
  useEffect(() => {
    const newSelections = {
      round_of_16: new Set<string>(),
      qf: new Set<string>(),
      sf: new Set<string>(),
      final: new Set<string>(),
      winner: new Set<string>(),
    }
    userPredictions.forEach((pred) => {
      const stage = pred.stage as keyof typeof newSelections
      if (newSelections[stage]) {
        newSelections[stage].add(pred.team_id)
      }
    })
    setSelections(newSelections)
  }, [userPredictions])

  // Toggle selection handler
  const handleToggleTeam = (teamExtId: string) => {
    if (isLocked) {
      toast.error('Submissions are locked for the tournament.')
      return
    }

    const currentStageLimit = STAGES.find(s => s.id === activeStage)?.limit ?? 0
    const currentSet = new Set(selections[activeStage])

    if (currentSet.has(teamExtId)) {
      currentSet.delete(teamExtId)
    } else {
      if (currentSet.size >= currentStageLimit) {
        toast.warning(`You can only select up to ${currentStageLimit} teams for the ${activeStage} stage.`)
        return
      }
      currentSet.add(teamExtId)
    }

    setSelections({
      ...selections,
      [activeStage]: currentSet,
    })
  }

  // Mutation to save selections
  const saveSelectionsMutation = useMutation({
    mutationFn: async ({ stage, teamIds }: { stage: string; teamIds: string[] }) => {
      if (!user?.id) throw new Error('Not authenticated')

      // Step 1: Delete previous predictions for this stage
      const { error: deleteError } = await supabase
        .from('stage_predictions')
        .delete()
        .eq('user_id', user.id)
        .eq('stage', stage)

      if (deleteError) throw deleteError

      // Step 2: Insert new predictions
      if (teamIds.length > 0) {
        const insertData = teamIds.map((tid) => ({
          user_id: user.id,
          stage: stage,
          team_id: tid,
        }))

        const { error: insertError } = await supabase
          .from('stage_predictions')
          .insert(insertData)

        if (insertError) throw insertError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stage-predictions', user?.id] })
      toast.success('Predictions saved successfully!')
    },
    onError: (err) => {
      console.error(err)
      toast.error('Failed to save predictions. Make sure database migrations are applied.')
    },
  })

  const handleSave = () => {
    if (isLocked) {
      toast.error('Predictions are locked.')
      return
    }

    const currentSelections = Array.from(selections[activeStage])

    saveSelectionsMutation.mutate({
      stage: activeStage,
      teamIds: currentSelections,
    })
  }

  const isLoading = isLoadingTeams || isLoadingPreds || isLoadingDeadline
  const activeLimit = STAGES.find(s => s.id === activeStage)?.limit ?? 0
  const activeCount = selections[activeStage]?.size ?? 0

  // Filter teams list
  const filteredTeams = teams.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.fifa_code.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesGroup = groupFilter === 'all' || t.group_name === groupFilter
    return matchesSearch && matchesGroup
  })

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border/40 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold font-display text-gradient">
              Tournament Predictor
            </h1>
            <p className="text-text-secondary text-sm">
              Predict the exact teams that will reach each tournament stage. Earn big points at the end of the cup!
            </p>
          </div>

          {/* Deadline Countdown widget */}
          <div className="glass px-5 py-3 rounded-2xl border border-border flex items-center gap-3">
            <span className="text-2xl">⏳</span>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-text-secondary">
                Prediction Deadline
              </div>
              <div className={`text-base font-black ${isLocked ? 'text-live animate-pulse' : 'text-brand'}`}>
                {isLocked ? 'Predictions Locked' : timeLeft || 'Loading...'}
              </div>
            </div>
          </div>
        </div>

        {/* Stage selection sidebar/tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="space-y-3 lg:col-span-1">
            <h2 className="text-xs font-black uppercase tracking-widest text-text-muted mb-2 px-1">
              Select Stage
            </h2>
            <div className="flex flex-row lg:flex-col overflow-x-auto gap-2 pb-2 lg:pb-0">
              {STAGES.map((s) => {
                const isCompleted = selections[s.id]?.size === s.limit
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveStage(s.id)}
                    className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left font-bold text-xs transition-all whitespace-nowrap lg:whitespace-normal shrink-0 lg:shrink-1 ${activeStage === s.id
                        ? 'bg-brand border-brand text-text-inverse shadow-brand'
                        : 'bg-surface-2/40 border-border/80 text-text-secondary hover:text-text-primary hover:bg-surface-3'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{s.icon}</span>
                      <span>{s.label}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${activeStage === s.id
                        ? 'bg-white/20 text-white'
                        : isCompleted
                          ? 'bg-brand/10 text-brand'
                          : 'bg-surface-3 text-text-secondary'
                      }`}>
                      {selections[s.id]?.size} / {s.limit}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Point values description */}
            <div className="hidden lg:block bg-surface-2/30 border border-border/60 p-4 rounded-2xl text-xs space-y-2.5 mt-6">
              <div className="font-bold text-text-primary">✨ Stage Point System</div>
              {STAGES.map(s => (
                <div key={s.id} className="flex justify-between text-text-secondary">
                  <span>{s.label}</span>
                  <span className="font-semibold text-brand-glow">{s.points.replace(' per correct pick', '').replace(' for correct pick', '')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Teams list and search */}
          <div className="lg:col-span-3 space-y-6">
            {/* Selected Teams on Top */}
            {!isLoading && (
              <div className="bg-surface-2/20 border border-border/60 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">
                    Your Selections ({activeCount} / {activeLimit})
                  </h3>
                  {activeCount > 0 && !isLocked && (
                    <button
                      onClick={() => {
                        setSelections({
                          ...selections,
                          [activeStage]: new Set(),
                        })
                      }}
                      className="text-text-muted hover:text-live text-[10px] font-bold uppercase tracking-wider transition-colors"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}
                >
                  {/* Render selected teams first */}
                  {Array.from(selections[activeStage] || []).map((teamId) => {
                    const team = teams.find(t => t.external_team_id === teamId)
                    if (!team) return null
                    return (
                      <div
                        key={team.id}
                        className="glass px-2 py-2 rounded-xl border border-brand/50 bg-brand/5 flex flex-col items-center justify-center gap-1.5 text-xs font-bold text-text-primary relative group text-center"
                      >
                        <img
                          src={team.flag_url ?? 'https://flagcdn.com/w80/un.png'}
                          alt={team.name}
                          className="w-8 h-5 object-cover rounded border border-border/40 shrink-0"
                          onError={(e) => {
                            e.currentTarget.src = 'https://flagcdn.com/w80/un.png'
                          }}
                        />
                        <span className="truncate text-[11px] w-full">{team.name}</span>
                        {!isLocked && (
                          <button
                            onClick={() => handleToggleTeam(team.external_team_id)}
                            className="absolute top-1 right-1 text-text-muted hover:text-live transition-colors p-0.5 shrink-0"
                            title="Remove selection"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )
                  })}

                  {/* Render empty slots */}
                  {Array.from({ length: Math.max(0, activeLimit - activeCount) }).map((_, idx) => (
                    <div
                      key={`empty-${idx}`}
                      className="border border-dashed border-border/60 rounded-xl px-2 py-1.5 flex items-center justify-center text-[10px] font-bold text-text-muted bg-surface-2/10 min-h-[50px]"
                    >
                      Empty
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-2/40 p-4 border border-border/80 rounded-2xl">
              <div className="flex flex-wrap items-center gap-4 flex-1">
                {/* Search */}
                <input
                  type="text"
                  placeholder="Search team..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-2 text-xs font-bold text-text-primary focus:border-brand focus:outline-none transition-colors w-full md:w-48 placeholder:text-text-muted"
                />

                {/* Filter */}
                <select
                  value={groupFilter}
                  onChange={(e) => setGroupFilter(e.target.value)}
                  className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-xs font-bold text-text-primary focus:border-brand focus:outline-none transition-colors"
                >
                  <option value="all">🌐 All Groups</option>
                  {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].map(g => (
                    <option key={g} value={g}>Group {g}</option>
                  ))}
                </select>
              </div>

              {/* Save predictions */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-text-secondary whitespace-nowrap">
                  {activeCount} / {activeLimit} Selected
                </span>
                <button
                  onClick={handleSave}
                  disabled={saveSelectionsMutation.isPending || isLocked}
                  className={`btn font-bold text-xs py-2 px-5 rounded-xl transition-all shadow-brand ${saveSelectionsMutation.isPending || isLocked
                      ? 'bg-surface-3 border border-border text-text-muted cursor-not-allowed'
                      : 'btn-primary'
                    }`}
                >
                  {saveSelectionsMutation.isPending ? 'Saving...' : 'Save predictions'}
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center items-center py-20">
                <div className="w-10 h-10 border-2 border-transparent border-t-brand rounded-full animate-spin" />
              </div>
            ) : filteredTeams.length === 0 ? (
              <div className="glass p-12 rounded-xl text-center border border-border/80 max-w-md mx-auto">
                <span className="text-4xl font-bold">🗺️</span>
                <h3 className="mt-4 font-display font-bold text-lg text-text-primary">
                  No Teams Found
                </h3>
                <p className="mt-2 text-sm text-text-secondary">
                  Try adjusting your search criteria or group filter.
                </p>
              </div>
            ) : (
              <div
                className="grid gap-2.5"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}
              >
                {filteredTeams.map((team) => {
                  const isSelected = selections[activeStage]?.has(team.external_team_id)
                  return (
                    <button
                      key={team.id}
                      onClick={() => handleToggleTeam(team.external_team_id)}
                      className={`glass px-2.5 py-2 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all relative text-center ${isSelected
                          ? 'border-brand ring-1 ring-brand bg-brand/5 shadow-brand'
                          : 'border-border hover:border-text-secondary/50'
                        }`}
                    >
                      <img
                        src={team.flag_url ?? 'https://flagcdn.com/w80/un.png'}
                        alt={team.name}
                        className="w-8 h-5 object-cover rounded border border-border/40 shrink-0"
                        onError={(e) => {
                          e.currentTarget.src = 'https://flagcdn.com/w80/un.png'
                        }}
                      />
                      <span className="text-[11px] font-extrabold text-text-primary truncate w-full">
                        {team.name}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
