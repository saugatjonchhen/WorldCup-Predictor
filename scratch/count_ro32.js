import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://arbtkomgfytcccdzizfw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyYnRrb21nZnl0Y2NjZHppemZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDkyNDIsImV4cCI6MjA5NjcyNTI0Mn0.SU6sQCLKcQ1dZkPRQ8waWe6oGV7MkoD4c1MWyYM_avY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const { data: matches, error } = await supabase
    .from('matches')
    .select('external_match_id, stage, home_team, away_team')
    .order('external_match_id')

  if (error) {
    console.error(error)
    return
  }

  const counts = {}
  matches.forEach(m => {
    counts[m.stage] = (counts[m.stage] || 0) + 1
  })

  console.log('Match counts by stage:', counts)
  console.log('Round of 32 matches in DB:')
  matches.filter(m => m.stage === 'round_of_32').forEach(m => {
    console.log(`ExtID: ${m.external_match_id}, ${m.home_team} vs ${m.away_team}`)
  })
}

run()
