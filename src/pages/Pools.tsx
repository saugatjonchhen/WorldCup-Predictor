import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface Pool {
  id: string
  name: string
  description: string | null
  invite_code: string
  created_at: string
  created_by: string
  members_count?: number
}

export default function Pools() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Form states
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [joinCode, setJoinCode] = useState('')

  const [createError, setCreateError] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)

  // 1. Fetch user's pools
  const { data: pools = [], isLoading } = useQuery<Pool[]>({
    queryKey: ['pools', user?.id],
    queryFn: async () => {
      if (!user?.id) return []

      // Fetch pools where the user is a member
      const { data: membershipData, error: membershipError } = await supabase
        .from('pool_members')
        .select('pool_id')
        .eq('user_id', user.id)

      if (membershipError) throw membershipError
      if (!membershipData || membershipData.length === 0) return []

      const poolIds = membershipData.map((m) => m.pool_id)

      // Fetch the pools metadata
      const { data, error } = await supabase
        .from('pools')
        .select('*')
        .in('id', poolIds)

      if (error) throw error

      // Get member count for each pool
      const poolsWithCount = await Promise.all(
        data.map(async (pool) => {
          const { count, error: countError } = await supabase
            .from('pool_members')
            .select('*', { count: 'exact', head: true })
            .eq('pool_id', pool.id)

          return {
            ...pool,
            members_count: countError ? 1 : (count ?? 1),
          }
        })
      )

      return poolsWithCount
    },
    enabled: !!user?.id,
  })

  // 2. Create Pool Mutation
  const createPoolMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return

      // Generate a random 6-character alphanumeric invite code
      const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase()

      // Insert pool
      const { data: poolData, error: poolError } = await supabase
        .from('pools')
        .insert({
          name: createName,
          description: createDescription,
          invite_code: inviteCode,
          created_by: user.id,
        })
        .select()
        .single()

      if (poolError) throw poolError

      // Add creator as member (admin)
      const { error: memberError } = await supabase.from('pool_members').insert({
        pool_id: poolData.id,
        user_id: user.id,
        role: 'admin',
      })

      if (memberError) throw memberError

      return poolData
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pools', user?.id] })
      setCreateName('')
      setCreateDescription('')
      if (data) {
        navigate(`/pools/${data.id}`)
      }
    },
    onError: (err: any) => {
      setCreateError(err.message || 'Failed to create pool.')
    },
  })

  // 3. Join Pool Mutation
  const joinPoolMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) return

      const { data: poolId, error } = await supabase.rpc('join_pool_with_invite_code', {
        p_invite_code: joinCode.trim().toUpperCase()
      })

      if (error) {
        throw new Error(error.message)
      }

      return { id: poolId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pools', user?.id] })
      setJoinCode('')
      if (data) {
        navigate(`/pools/${data.id}`)
      }
    },
    onError: (err: any) => {
      setJoinError(err.message || 'Failed to join pool.')
    },
  })

  function handleCreatePool(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    createPoolMutation.mutate()
  }

  function handleJoinPool(e: React.FormEvent) {
    e.preventDefault()
    setJoinError(null)
    joinPoolMutation.mutate()
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-extrabold font-display text-gradient">
            Prediction Pools
          </h1>
          <p className="text-text-secondary text-sm">
            Create or join private leagues to compete directly against your friends and colleagues!
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Pools List */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-xl font-bold font-display">My Pools</h2>

            {isLoading ? (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-2 border-transparent border-t-brand rounded-full animate-spin" />
              </div>
            ) : pools.length === 0 ? (
              <div className="glass p-8 rounded-xl border border-border/60 text-center">
                <span className="text-3xl">👥</span>
                <p className="mt-2 text-sm text-text-secondary">
                  You are not in any prediction pools yet. Join one or create your own below!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pools.map((pool) => (
                  <Link
                    key={pool.id}
                    to={`/pools/${pool.id}`}
                    className="glass p-5 rounded-xl border border-border/80 hover:border-brand/40 card-hover flex flex-col justify-between"
                  >
                    <div>
                      <h3 className="font-bold text-text-primary text-base font-display">
                        {pool.name}
                      </h3>
                      <p className="text-xs text-text-secondary mt-1.5 line-clamp-2">
                        {pool.description || 'No description available.'}
                      </p>
                    </div>

                    <div className="mt-6 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-text-muted">
                      <span>👥 {pool.members_count} members</span>
                      <span className="bg-surface-2 px-2 py-0.5 rounded border border-border font-mono uppercase font-bold text-brand">
                        Code: {pool.invite_code}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Action sidebar */}
          <div className="space-y-6">
            {/* Join Pool */}
            <div className="glass p-6 rounded-xl border border-border/80">
              <h3 className="font-bold font-display text-lg mb-4 flex items-center gap-2">
                <span>🔑</span> Join a Pool
              </h3>
              {joinError && (
                <div className="mb-3 p-2 text-xs rounded bg-live-muted border border-live text-live">
                  {joinError}
                </div>
              )}
              <form onSubmit={handleJoinPool} className="space-y-3">
                <input
                  type="text"
                  required
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm placeholder:text-text-muted text-text-primary focus:border-brand focus:outline-none uppercase"
                  placeholder="INVITE CODE (e.g. AB12XY)"
                />
                <button
                  type="submit"
                  disabled={joinPoolMutation.isPending}
                  className="w-full btn btn-primary py-2.5 font-bold text-xs"
                >
                  {joinPoolMutation.isPending ? 'Joining...' : 'Join League'}
                </button>
              </form>
            </div>

            {/* Create Pool */}
            <div className="glass p-6 rounded-xl border border-border/80">
              <h3 className="font-bold font-display text-lg mb-4 flex items-center gap-2">
                <span>➕</span> Create a Pool
              </h3>
              {createError && (
                <div className="mb-3 p-2 text-xs rounded bg-live-muted border border-live text-live">
                  {createError}
                </div>
              )}
              <form onSubmit={handleCreatePool} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    League Name
                  </label>
                  <input
                    type="text"
                    required
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm placeholder:text-text-muted text-text-primary focus:border-brand focus:outline-none"
                    placeholder="E.g. Office Champions"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm placeholder:text-text-muted text-text-primary focus:border-brand focus:outline-none resize-none"
                    placeholder="Short description..."
                  />
                </div>
                <button
                  type="submit"
                  disabled={createPoolMutation.isPending}
                  className="w-full btn btn-secondary py-2.5 font-bold text-xs"
                >
                  {createPoolMutation.isPending ? 'Creating...' : 'Create League'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
