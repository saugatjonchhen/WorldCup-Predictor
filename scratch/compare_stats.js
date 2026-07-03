import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://arbtkomgfytcccdzizfw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyYnRrb21nZnl0Y2NjZHppemZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDkyNDIsImV4cCI6MjA5NjcyNTI0Mn0.SU6sQCLKcQ1dZkPRQ8waWe6oGV7MkoD4c1MWyYM_avY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const email = 'saugat.john09@gmail.com'
  const password = 'Alias@123'
  
  const { data: authData } = await supabase.auth.signInWithPassword({ email, password })
  const adminClient = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } }
  })

  console.log('Calling RPC refresh_leaderboards()...')
  const { error: rpcError } = await adminClient.rpc('refresh_leaderboards')
  if (rpcError) {
    console.error('RPC Error:', rpcError)
    return
  }
  console.log('RPC refresh_leaderboards() succeeded.')

  // Get total count of predictions
  const { count, error: countError } = await adminClient
    .from('predictions')
    .select('*', { count: 'exact', head: true })

  if (countError) {
    console.error('Count error:', countError)
    return
  }

  const { data: matches } = await adminClient.from('matches').select('id, status')
  const completedMatchIds = new Set(matches.filter(m => m.status === 'completed').map(m => m.id))

  // Fetch all predictions in batches of 1000
  let allPredictions = []
  let from = 0
  const limit = 1000
  while (true) {
    const { data: preds, error: fetchErr } = await adminClient
      .from('predictions')
      .select('id, user_id, exact_score, correct_result, points_earned, match_id')
      .range(from, from + limit - 1)

    if (fetchErr) {
      console.error('Fetch error:', fetchErr)
      return
    }

    if (!preds || preds.length === 0) break
    allPredictions = allPredictions.concat(preds)
    if (preds.length < limit) break
    from += limit
  }

  const calculatedMap = new Map()
  allPredictions.forEach(p => {
    if (completedMatchIds.has(p.match_id)) {
      if (!calculatedMap.has(p.user_id)) {
        calculatedMap.set(p.user_id, { exact: 0, outcome: 0, points: 0 })
      }
      const u = calculatedMap.get(p.user_id)
      if (p.exact_score) u.exact++
      if (p.correct_result) u.outcome++
      u.points += (p.points_earned || 0)
    }
  })

  const { data: globalL } = await adminClient.from('leaderboard_global').select('*')

  console.log('\n--- COMPARISON AFTER REFRESH ---')
  let mismatches = 0
  globalL.forEach(g => {
    const calc = calculatedMap.get(g.user_id) || { exact: 0, outcome: 0, points: 0 }
    const matchPoints = calc.points
    const totalPoints = matchPoints + g.stage_points
    const isPointsMismatch = Math.abs(g.total_points - totalPoints) > 0.01
    const isExactMismatch = g.exact_scores !== calc.exact
    const isOutcomeMismatch = g.correct_results !== calc.outcome
    
    if (isPointsMismatch || isExactMismatch || isOutcomeMismatch) {
      mismatches++
      console.log(`User: ${g.username} (ID: ${g.user_id})`)
      console.log(`  Materialized View: Exact: ${g.exact_scores}, Outcomes: ${g.correct_results}, Points: ${g.total_points}`)
      console.log(`  Dynamic (completed matches only): Exact: ${calc.exact}, Outcomes: ${calc.outcome}, Points: ${totalPoints}`)
      console.log(`  ⚠️ MISMATCH FOUND! Points: ${isPointsMismatch ? 'YES' : 'NO'}, Exact: ${isExactMismatch ? 'YES' : 'NO'}, Outcome: ${isOutcomeMismatch ? 'YES' : 'NO'}`)
    } else {
      console.log(`User: ${g.username} matches perfectly! (Exact: ${g.exact_scores}, Outcomes: ${g.correct_results})`)
    }
  })
  console.log(`\nTotal users checked: ${globalL.length}. Total mismatches: ${mismatches}.`)
}

run()
