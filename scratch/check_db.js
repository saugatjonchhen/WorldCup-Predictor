import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://arbtkomgfytcccdzizfw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyYnRrb21nZnl0Y2NjZHppemZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDkyNDIsImV4cCI6MjA5NjcyNTI0Mn0.SU6sQCLKcQ1dZkPRQ8waWe6oGV7MkoD4c1MWyYM_avY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log('Fetching matches...')
  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select('*')
    .order('kickoff_time', { ascending: true })

  if (matchError) {
    console.error('Match error:', matchError)
  } else {
    console.log(`Found ${matches.length} matches:`)
    matches.forEach(m => {
      console.log(`ID: ${m.id}, ExtID: ${m.external_match_id}, Teams: ${m.home_team} vs ${m.away_team}, Status: ${m.status}, Live Score: ${m.live_home_score}-${m.live_away_score}, Final Score: ${m.home_score}-${m.away_score}, Live Min: ${m.live_minute}`)
    })
  }

  console.log('\nFetching global leaderboard...')
  const { data: globalL, error: glError } = await supabase
    .from('leaderboard_global')
    .select('*')

  if (glError) {
    console.error('Leaderboard error:', glError)
  } else {
    console.log('Global Leaderboard:', globalL)
  }
}

run()
