import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://arbtkomgfytcccdzizfw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyYnRrb21nZnl0Y2NjZHppemZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDkyNDIsImV4cCI6MjA5NjcyNTI0Mn0.SU6sQCLKcQ1dZkPRQ8waWe6oGV7MkoD4c1MWyYM_avY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const now = new Date().toISOString()
  console.log(`Current Time: ${now}`)
  
  console.log('Fetching active or past matches...')
  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select('*')
    .order('kickoff_time', { ascending: true })

  if (matchError) {
    console.error('Match error:', matchError)
    return
  }

  const activeOrPast = matches.filter(m => m.status !== 'scheduled' || new Date(m.kickoff_time) < new Date())
  console.log(`Found ${activeOrPast.length} active or past matches:`)
  activeOrPast.forEach(m => {
    console.log(`ID: ${m.id}\nExtID: ${m.external_match_id}\nTeams: ${m.home_team} vs ${m.away_team}\nKickoff: ${m.kickoff_time}\nStatus: ${m.status}\nLive Score: ${m.live_home_score}-${m.live_away_score}\nFinal Score: ${m.home_score}-${m.away_score}\nLive Min: ${m.live_minute}\n-------------------`)
  })

  // Let's also check if there are predictions for these matches
  for (const m of activeOrPast) {
    console.log(`Predictions for Match ${m.home_team} vs ${m.away_team}:`)
    const { data: preds, error: predError } = await supabase
      .from('predictions')
      .select('*')
      .eq('match_id', m.id)
    if (predError) {
      console.error(predError)
    } else {
      console.log(preds)
    }
    console.log('===================')
  }
}

run()
