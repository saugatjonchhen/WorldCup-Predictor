import { createClient } from '@supabase/supabase-js'
import { syncLiveScores } from '../src/lib/matchSync.js'

const supabaseUrl = 'https://arbtkomgfytcccdzizfw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyYnRrb21nZnl0Y2NjZHppemZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDkyNDIsImV4cCI6MjA5NjcyNTI0Mn0.SU6sQCLKcQ1dZkPRQ8waWe6oGV7MkoD4c1MWyYM_avY'

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
})

async function run() {
  const email = 'saugat.john09@gmail.com'
  const password = 'Alias@123'

  console.log(`Logging in as admin ${email}...`)
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (signInError) {
    console.error('Login failed:', signInError.message)
    return
  }

  console.log('Login success! Session token acquired.')

  console.log('Running syncLiveScores...')
  const result = await syncLiveScores(supabase)
  console.log('Sync Result:', result)
}

run()
