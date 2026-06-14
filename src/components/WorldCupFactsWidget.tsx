import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const FALLBACK_FACTS = [
  'The 2026 FIFA World Cup will be the first to include 48 teams, expanded from 32.',
  'The tournament will be jointly hosted by 16 cities in three North American countries: Canada, Mexico, and the United States.',
  'Mexico will become the first country to host or co-host the men\'s World Cup three times (previously 1970 and 1986).',
  'The "WeAre26" official brand was unveiled in Los Angeles in May 2023.',
  'A total of 104 matches will be played, up from 64 in the 32-team format.'
]

export function WorldCupFactsWidget() {
  const [fact, setFact] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchFact() {
      try {
        const { data, error } = await supabase
          .from('world_cup_facts')
          .select('fact_text')
          .eq('is_active', true)
        
        if (error || !data || data.length === 0) {
          // If table doesn't exist or no data, use fallback
          setFact(FALLBACK_FACTS[Math.floor(Math.random() * FALLBACK_FACTS.length)])
        } else {
          // Pick a random fact
          const randomFact = data[Math.floor(Math.random() * data.length)]
          setFact(randomFact.fact_text)
        }
      } catch (e) {
        setFact(FALLBACK_FACTS[Math.floor(Math.random() * FALLBACK_FACTS.length)])
      } finally {
        setLoading(false)
      }
    }

    fetchFact()
    
    // Rotate fact every 15 seconds
    const interval = setInterval(fetchFact, 15000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-4 bg-surface-2 rounded w-1/4 mb-2"></div>
        <div className="h-4 bg-surface-2 rounded w-3/4"></div>
      </div>
    )
  }

  return (
    <div className="card p-5 border-l-4 border-l-brand relative overflow-hidden group">
      {/* Background decoration */}
      <div className="absolute -right-4 -bottom-4 text-6xl opacity-5 group-hover:scale-110 transition-transform pointer-events-none">
        ⚽
      </div>
      
      <div className="flex items-start gap-3">
        <div className="p-2 bg-brand/10 rounded-lg text-brand mt-0.5 shadow-brand/20">
          💡
        </div>
        <div>
          <h3 className="font-display font-bold text-sm uppercase tracking-wider text-text-secondary mb-1">
            Did you know?
          </h3>
          <p className="text-text-primary text-sm leading-relaxed font-medium">
            {fact}
          </p>
        </div>
      </div>
    </div>
  )
}
