import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://arbtkomgfytcccdzizfw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyYnRrb21nZnl0Y2NjZHppemZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDkyNDIsImV4cCI6MjA5NjcyNTI0Mn0.SU6sQCLKcQ1dZkPRQ8waWe6oGV7MkoD4c1MWyYM_avY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log('Fetching leaderboard_pool...')
  const { data: poolL, error: plError } = await supabase
    .from('leaderboard_pool')
    .select('*')

  if (plError) {
    console.error('Leaderboard pool error:', plError)
  } else {
    console.log('Leaderboard Pool contents:', poolL)
  }
}

run()
