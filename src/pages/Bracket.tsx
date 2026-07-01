import { useState, useEffect, useMemo } from 'react'
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

interface LockedRo32Match {
  external_match_id: string
  home_team_ext_id: string | null
  away_team_ext_id: string | null
  home_team: string
  away_team: string
  winner_team_ext_id: string | null
}

interface BracketLockStatus {
  stage_deadlines: {
    round_of_16: string
    qf: string
    sf: string
    final: string
    winner: string
  }
  locked_ro32_matches: LockedRo32Match[]
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
  const [timeLeft, setTimeLeft] = useState('')

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

  // 3. Fetch per-stage bracket lock status (deadlines + completed Ro32 matches)
  const { data: lockStatus, isLoading: isLoadingLockStatus } = useQuery<BracketLockStatus>({
    queryKey: ['bracket-lock-status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_bracket_lock_status')
      if (error) throw error
      return data as BracketLockStatus
    },
    // Refresh every 30 s so deadlines stay current as Ro32 matches complete
    refetchInterval: 30_000,
  })

  // 4. Fetch Ro32-qualified team IDs (teams assigned to Ro32 matches)
  const { data: ro32TeamIds = new Set<string>(), isLoading: isLoadingRo32 } = useQuery<Set<string>>({
    queryKey: ['ro32-team-ids'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matches')
        .select('home_team_ext_id, away_team_ext_id')
        .eq('stage', 'round_of_32')
      if (error) throw error
      const ids = new Set<string>()
      data?.forEach((m: { home_team_ext_id: string | null; away_team_ext_id: string | null }) => {
        if (m.home_team_ext_id) ids.add(m.home_team_ext_id)
        if (m.away_team_ext_id) ids.add(m.away_team_ext_id)
      })
      return ids
    },
    refetchInterval: 60_000,
  })

  // ── Derived lock state ──────────────────────────────────────────────────────

  // Per-stage lock info: { deadline: Date | null, isLocked: boolean }
  const stageLockInfo = useMemo(() => {
    const deadlines = lockStatus?.stage_deadlines
    const now = new Date()
    return Object.fromEntries(
      STAGES.map(s => {
        const raw = deadlines?.[s.id as keyof typeof deadlines]
        const deadline = raw ? new Date(raw) : null
        return [s.id, { deadline, isLocked: deadline ? deadline <= now : true }]
      })
    )
  }, [lockStatus])

  // Set of team ext IDs that WON a completed Ro32 match → their Ro16 slot is locked/preserved
  const ro16LockedWinners = useMemo(() => {
    const ids = new Set<string>()
    lockStatus?.locked_ro32_matches?.forEach(m => {
      if (m.winner_team_ext_id) ids.add(m.winner_team_ext_id)
    })
    return ids
  }, [lockStatus])

  // Set of ALL team ext IDs from completed Ro32 matches (winners + losers → slot determined)
  const ro16SlotDetermined = useMemo(() => {
    const ids = new Set<string>()
    lockStatus?.locked_ro32_matches?.forEach(m => {
      if (m.home_team_ext_id) ids.add(m.home_team_ext_id)
      if (m.away_team_ext_id) ids.add(m.away_team_ext_id)
    })
    return ids
  }, [lockStatus])

  // Convenience helpers
  const isRo16Winner = (teamExtId: string) => ro16LockedWinners.has(teamExtId)
  const isRo16SlotDetermined = (teamExtId: string) => ro16SlotDetermined.has(teamExtId)

  // ── Countdown timer for active stage ───────────────────────────────────────

  useEffect(() => {
    const deadline = stageLockInfo[activeStage]?.deadline
    if (!deadline) {
      setTimeLeft('Unknown')
      return
    }

    const tick = () => {
      const diff = deadline.getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft('Locked')
        return
      }
      const days = Math.floor(diff / 86_400_000)
      const hours = Math.floor((diff % 86_400_000) / 3_600_000)
      const mins = Math.floor((diff % 3_600_000) / 60_000)
      const secs = Math.floor((diff % 60_000) / 1000)
      setTimeLeft(days > 0 ? `${days}d ${hours}h ${mins}m` : `${hours}h ${mins}m ${secs}s`)
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [activeStage, stageLockInfo])

  // ── Populate selections from DB predictions ─────────────────────────────────

  useEffect(() => {
    const newSelections: { [stage: string]: Set<string> } = {
      round_of_16: new Set(),
      qf: new Set(),
      sf: new Set(),
      final: new Set(),
      winner: new Set(),
    }
    userPredictions.forEach((pred) => {
      const stage = pred.stage as keyof typeof newSelections
      if (newSelections[stage]) {
        newSelections[stage].add(pred.team_id)
      }
    })
    setSelections(newSelections)
  }, [userPredictions])

  // ── Toggle selection ────────────────────────────────────────────────────────

  const handleToggleTeam = (teamExtId: string) => {
    const stageInfo = stageLockInfo[activeStage]

    if (stageInfo?.isLocked) {
      toast.error('Predictions for this stage are locked.')
      return
    }

    // Ro16: prevent toggling slots already determined by a completed Ro32 match
    if (activeStage === 'round_of_16' && isRo16SlotDetermined(teamExtId)) {
      if (isRo16Winner(teamExtId)) {
        toast.error('This slot is locked — this team has already advanced to the Round of 16.')
      } else {
        toast.error('This team was eliminated in the Round of 32.')
      }
      return
    }

    const currentStageLimit = STAGES.find(s => s.id === activeStage)?.limit ?? 0
    const currentSet = new Set(selections[activeStage])

    if (currentSet.has(teamExtId)) {
      currentSet.delete(teamExtId)
    } else {
      if (currentSet.size >= currentStageLimit) {
        toast.warning(`You can only select up to ${currentStageLimit} teams for this stage.`)
        return
      }
      currentSet.add(teamExtId)
    }

    setSelections({ ...selections, [activeStage]: currentSet })
  }

  // ── Save mutation ───────────────────────────────────────────────────────────

  const saveSelectionsMutation = useMutation({
    mutationFn: async ({ stage, teamIds }: { stage: string; teamIds: string[] }) => {
      if (!user?.id) throw new Error('Not authenticated')

      if (stage === 'round_of_16') {
        // Find which locked winners are already in the database for this user
        const existingLockedWinners = new Set(
          userPredictions
            .filter(p => p.stage === stage && ro16LockedWinners.has(p.team_id))
            .map(p => p.team_id)
        )

        // Delete all predictions except the ones that are already in the DB and are locked winners
        const deleteQuery = supabase
          .from('stage_predictions')
          .delete()
          .eq('user_id', user.id)
          .eq('stage', stage)

        if (existingLockedWinners.size > 0) {
          const { error: deleteError } = await deleteQuery.not('team_id', 'in', `(${Array.from(existingLockedWinners).join(',')})`)
          if (deleteError) throw deleteError
        } else {
          const { error: deleteError } = await deleteQuery
          if (deleteError) throw deleteError
        }

        // Insert new selections except the ones that are already in the DB and are locked winners
        const toInsert = teamIds.filter(id => !existingLockedWinners.has(id))
        if (toInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('stage_predictions')
            .insert(toInsert.map(tid => ({ user_id: user.id, stage, team_id: tid })))
          if (insertError) throw insertError
        }
      } else {
        // Normal full replace for other stages
        const { error: deleteError } = await supabase
          .from('stage_predictions')
          .delete()
          .eq('user_id', user.id)
          .eq('stage', stage)
        if (deleteError) throw deleteError

        if (teamIds.length > 0) {
          const { error: insertError } = await supabase
            .from('stage_predictions')
            .insert(teamIds.map(tid => ({ user_id: user.id, stage, team_id: tid })))
          if (insertError) throw insertError
        }
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
    if (stageLockInfo[activeStage]?.isLocked) {
      toast.error('Predictions are locked for this stage.')
      return
    }
    saveSelectionsMutation.mutate({
      stage: activeStage,
      teamIds: Array.from(selections[activeStage]),
    })
  }

  // ── Derived UI values ───────────────────────────────────────────────────────

  const isLoading = isLoadingTeams || isLoadingPreds || isLoadingLockStatus || isLoadingRo32
  const activeStageInfo = STAGES.find(s => s.id === activeStage)
  const activeLimit = activeStageInfo?.limit ?? 0
  const activeCount = selections[activeStage]?.size ?? 0
  const activeIsLocked = stageLockInfo[activeStage]?.isLocked ?? true

  // For Ro16: filter to Ro32-qualified teams only (fallback: show all if not yet populated)
  const filteredTeams = teams.filter((t) => {
    if (activeStage === 'round_of_16' && ro32TeamIds.size > 0) {
      if (!ro32TeamIds.has(t.external_team_id)) return false
    }
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.fifa_code.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesGroup = groupFilter === 'all' || t.group_name === groupFilter
    return matchesSearch && matchesGroup
  })

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-border/40 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold font-display text-gradient">
              Tournament Predictor
            </h1>
            <p className="text-text-secondary text-sm">
              Predict the exact teams that will reach each tournament stage. Earn big points at the end of the cup!
            </p>
          </div>

          {/* Per-stage deadline countdown */}
          <div className="glass px-5 py-3 rounded-2xl border border-border flex items-center gap-3">
            <span className="text-2xl">{activeIsLocked ? '🔒' : '⏳'}</span>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-text-secondary">
                {activeStageInfo?.label} Deadline
              </div>
              <div className={`text-base font-black ${activeIsLocked ? 'text-live animate-pulse' : 'text-brand'}`}>
                {activeIsLocked ? 'Predictions Locked' : timeLeft || 'Loading...'}
              </div>
            </div>
          </div>
        </div>

        {/* Stage selection sidebar + main content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

          {/* Sidebar: stage tabs */}
          <div className="space-y-3 lg:col-span-1">
            <h2 className="text-xs font-black uppercase tracking-widest text-text-muted mb-2 px-1">
              Select Stage
            </h2>
            <div className="flex flex-row lg:flex-col overflow-x-auto gap-2 pb-2 lg:pb-0">
              {STAGES.map((s) => {
                const isCompleted = selections[s.id]?.size === s.limit
                const stageLocked = stageLockInfo[s.id]?.isLocked ?? true
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveStage(s.id)}
                    className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left font-bold text-xs transition-all whitespace-nowrap lg:whitespace-normal shrink-0 lg:shrink-1 ${
                      activeStage === s.id
                        ? 'bg-brand border-brand text-text-inverse shadow-brand'
                        : 'bg-surface-2/40 border-border/80 text-text-secondary hover:text-text-primary hover:bg-surface-3'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{s.icon}</span>
                      <span>{s.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px]">{stageLocked ? '🔒' : '🔓'}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        activeStage === s.id
                          ? 'bg-white/20 text-white'
                          : isCompleted
                            ? 'bg-brand/10 text-brand'
                            : 'bg-surface-3 text-text-secondary'
                      }`}>
                        {selections[s.id]?.size} / {s.limit}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Point value reference */}
            <div className="hidden lg:block bg-surface-2/30 border border-border/60 p-4 rounded-2xl text-xs space-y-2.5 mt-6">
              <div className="font-bold text-text-primary">✨ Stage Point System</div>
              {STAGES.map(s => (
                <div key={s.id} className="flex justify-between text-text-secondary">
                  <span>{s.label}</span>
                  <span className="font-semibold text-brand-glow">
                    {s.points.replace(' per correct pick', '').replace(' for correct pick', '')}
                  </span>
                </div>
              ))}
            </div>

            {/* Locking rules note */}
            <div className="hidden lg:block bg-surface-2/30 border border-border/60 p-4 rounded-2xl text-xs space-y-2 mt-2">
              <div className="font-bold text-text-primary">📋 Lock Schedule</div>
              <div className="text-text-muted space-y-1">
                <p><span className="text-text-secondary font-semibold">Ro16</span> — 1h before next Ro32 match</p>
                <p><span className="text-text-secondary font-semibold">QF / SF / Final / 🏆</span> — 1 day after Ro16 deadline</p>
              </div>
            </div>
          </div>

          {/* Main content: team picker */}
          <div className="lg:col-span-3 space-y-6">

            {/* Locked stage banner */}
            {activeIsLocked && !isLoading && (
              <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-5 py-4">
                <span className="text-2xl shrink-0">🔒</span>
                <div>
                  <div className="font-black text-amber-400 text-sm">Predictions Locked</div>
                  <div className="text-amber-500/70 text-xs font-medium mt-0.5">
                    The deadline for <span className="font-bold">{activeStageInfo?.label}</span> predictions has passed.
                    Your current selections are saved.
                  </div>
                </div>
              </div>
            )}

            {/* Ro16 locked slot info banner */}
            {activeStage === 'round_of_16' && !activeIsLocked && ro16LockedWinners.size > 0 && (
              <div className="flex items-start gap-3 bg-brand/5 border border-brand/20 rounded-2xl px-5 py-3">
                <span className="text-lg shrink-0 mt-0.5">ℹ️</span>
                <div className="text-xs">
                  <span className="font-black text-text-primary">
                    {ro16LockedWinners.size} slot{ro16LockedWinners.size > 1 ? 's' : ''} locked
                  </span>
                  <span className="text-text-secondary font-medium">
                    {' '}— teams that advanced from a completed Round of 32 match are preserved.
                  </span>
                </div>
              </div>
            )}

            {/* Selected Teams panel */}
            {!isLoading && (
              <div className="bg-surface-2/20 border border-border/60 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black uppercase tracking-widest text-text-muted">
                    Your Selections ({activeCount} / {activeLimit})
                  </h3>
                  {activeCount > 0 && !activeIsLocked && (
                    <button
                      onClick={() => {
                        // Keep locked winners, clear the rest
                        const preserved = new Set(
                          Array.from(selections[activeStage]).filter(id =>
                            activeStage === 'round_of_16' ? ro16LockedWinners.has(id) : false
                          )
                        )
                        setSelections({ ...selections, [activeStage]: preserved })
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
                  {/* Selected teams */}
                  {Array.from(selections[activeStage] || []).map((teamId) => {
                    const team = teams.find(t => t.external_team_id === teamId)
                    if (!team) return null
                    const slotLocked = activeStage === 'round_of_16' && isRo16Winner(teamId)
                    return (
                      <div
                        key={team.id}
                        className={`glass px-2 py-2 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-xs font-bold text-text-primary relative group text-center ${
                          slotLocked
                            ? 'border-amber-500/50 bg-amber-500/5'
                            : 'border-brand/50 bg-brand/5'
                        }`}
                      >
                        <img
                          src={team.flag_url ?? 'https://flagcdn.com/w80/un.png'}
                          alt={team.name}
                          className="w-8 h-5 object-cover rounded border border-border/40 shrink-0"
                          onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w80/un.png' }}
                        />
                        <span className="truncate text-[11px] w-full">{team.name}</span>
                        {slotLocked ? (
                          <span
                            className="absolute top-1 right-1 text-amber-400 text-[9px]"
                            title="Slot locked — team has advanced from Ro32"
                          >
                            🔒
                          </span>
                        ) : !activeIsLocked ? (
                          <button
                            onClick={() => handleToggleTeam(team.external_team_id)}
                            className="absolute top-1 right-1 text-text-muted hover:text-live transition-colors p-0.5 shrink-0"
                            title="Remove selection"
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                    )
                  })}

                  {/* Empty slots */}
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

            {/* Search / filter / save bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-2/40 p-4 border border-border/80 rounded-2xl">
              <div className="flex flex-wrap items-center gap-4 flex-1">
                <input
                  type="text"
                  placeholder="Search team..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-2 text-xs font-bold text-text-primary focus:border-brand focus:outline-none transition-colors w-full md:w-48 placeholder:text-text-muted"
                />
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
                {activeStage === 'round_of_16' && ro32TeamIds.size > 0 && (
                  <span className="text-[10px] font-bold text-text-muted bg-surface-3 px-2 py-1 rounded-lg border border-border/60">
                    {ro32TeamIds.size} Ro32-qualified teams
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-text-secondary whitespace-nowrap">
                  {activeCount} / {activeLimit} Selected
                </span>
                <button
                  onClick={handleSave}
                  disabled={saveSelectionsMutation.isPending || activeIsLocked}
                  className={`btn font-bold text-xs py-2 px-5 rounded-xl transition-all shadow-brand ${
                    saveSelectionsMutation.isPending || activeIsLocked
                      ? 'bg-surface-3 border border-border text-text-muted cursor-not-allowed'
                      : 'btn-primary'
                  }`}
                >
                  {saveSelectionsMutation.isPending ? 'Saving...' : 'Save predictions'}
                </button>
              </div>
            </div>

            {/* Team grid */}
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
                  const isWinner = activeStage === 'round_of_16' && isRo16Winner(team.external_team_id)
                  const isDetermined = activeStage === 'round_of_16' && isRo16SlotDetermined(team.external_team_id)
                  const isEliminated = isDetermined && !isWinner

                  return (
                    <button
                      key={team.id}
                      onClick={() => handleToggleTeam(team.external_team_id)}
                      disabled={activeIsLocked || isDetermined}
                      title={
                        isWinner ? 'Advanced to Round of 16 — slot locked'
                        : isEliminated ? 'Eliminated in Round of 32'
                        : undefined
                      }
                      className={`glass px-2.5 py-2 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all relative text-center ${
                        isWinner
                          ? 'border-amber-500/50 bg-amber-500/5 cursor-not-allowed'
                          : isEliminated
                            ? 'border-red-500/20 bg-red-500/5 cursor-not-allowed opacity-40'
                            : isSelected
                              ? 'border-brand ring-1 ring-brand bg-brand/5 shadow-brand'
                              : activeIsLocked
                                ? 'border-border opacity-60 cursor-not-allowed'
                                : 'border-border hover:border-text-secondary/50'
                      }`}
                    >
                      <img
                        src={team.flag_url ?? 'https://flagcdn.com/w80/un.png'}
                        alt={team.name}
                        className="w-8 h-5 object-cover rounded border border-border/40 shrink-0"
                        onError={(e) => { e.currentTarget.src = 'https://flagcdn.com/w80/un.png' }}
                      />
                      <span className="text-[11px] font-extrabold text-text-primary truncate w-full">
                        {team.name}
                      </span>
                      {isWinner && (
                        <span className="text-[8px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
                          ✅ Ro16
                        </span>
                      )}
                      {isEliminated && (
                        <span className="text-[8px] font-black text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full">
                          ❌ Out
                        </span>
                      )}
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
