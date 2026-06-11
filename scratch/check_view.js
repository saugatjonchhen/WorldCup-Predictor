import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://arbtkomgfytcccdzizfw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyYnRrb21nZnl0Y2NjZHppemZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDkyNDIsImV4cCI6MjA5NjcyNTI0Mn0.SU6sQCLKcQ1dZkPRQ8waWe6oGV7MkoD4c1MWyYM_avY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  console.log('Querying pool_leaderboard...')
  const { data, error } = await supabase
    .from('pool_leaderboard')
    .select('*')
    .limit(5)

  if (error) {
    console.error('Error querying pool_leaderboard:', error)
  } else {
    console.log('pool_leaderboard success:', data)
  }

  console.log('\nQuerying leaderboard_pool...')
  const { data: data2, error: error2 } = await supabase
    .from('leaderboard_pool')
    .select('*')
    .limit(5)

  if (error2) {
    console.error('Error querying leaderboard_pool:', error2)
  } else {
    console.log('leaderboard_pool success:', data2)
  }
}

run()
