#!/usr/bin/env node
/**
 * update-prediction.mjs
 *
 * Upserts a prediction for a given user + match directly via Supabase REST API
 * (bypasses RLS using the service-role key or anon key depending on your setup).
 *
 * Usage:
 *   node scripts/update-prediction.mjs \
 *     --home <home_score> \
 *     --away <away_score> \
 *     [--advancing <team_name>]
 *
 * Example (group-stage match, no advancing team needed):
 *   node scripts/update-prediction.mjs --home 2 --away 1
 *
 * Example (knockout match with advancing team):
 *   node scripts/update-prediction.mjs --home 1 --away 1 --advancing "Argentina"
 */

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://arbtkomgfytcccdzizfw.supabase.co'
const ANON_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyYnRrb21nZnl0Y2NjZHppemZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDkyNDIsImV4cCI6MjA5NjcyNTI0Mn0.SU6sQCLKcQ1dZkPRQ8waWe6oGV7MkoD4c1MWyYM_avY'

const USER_ID  = 'be3d956b-d19f-48d2-9259-d47e71401334'
const MATCH_ID = '7939975b-6c82-4451-a3ad-5eb5cace0015'

// ── Argument parsing ──────────────────────────────────────────────────────────
const args = process.argv.slice(2)

function getArg(flag) {
  const idx = args.indexOf(flag)
  return idx !== -1 ? args[idx + 1] : undefined
}

const homeRaw      = getArg('--home')
const awayRaw      = getArg('--away')
const advancingRaw = getArg('--advancing') // optional

if (homeRaw === undefined || awayRaw === undefined) {
  console.error('❌  Usage: node scripts/update-prediction.mjs --home <score> --away <score> [--advancing <team>]')
  process.exit(1)
}

const homeScore = parseInt(homeRaw, 10)
const awayScore = parseInt(awayRaw, 10)

if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
  console.error('❌  Scores must be non-negative integers.')
  process.exit(1)
}

// ── Payload ───────────────────────────────────────────────────────────────────
const payload = {
  user_id:         USER_ID,
  match_id:        MATCH_ID,
  home_score_pred: homeScore,
  away_score_pred: awayScore,
  ...(advancingRaw !== undefined ? { advancing_team: advancingRaw } : {}),
}

console.log('📝  Upserting prediction:')
console.log(`    user_id:         ${USER_ID}`)
console.log(`    match_id:        ${MATCH_ID}`)
console.log(`    home_score_pred: ${homeScore}`)
console.log(`    away_score_pred: ${awayScore}`)
if (advancingRaw !== undefined) {
  console.log(`    advancing_team:  ${advancingRaw}`)
}
console.log()

// ── Upsert via Supabase REST ──────────────────────────────────────────────────
const url = `${SUPABASE_URL}/rest/v1/predictions`

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type':  'application/json',
    'apikey':        ANON_KEY,
    'Authorization': `Bearer ${ANON_KEY}`,
    // Upsert: conflict on (user_id, match_id) → update the prediction columns
    'Prefer':        'resolution=merge-duplicates,return=representation',
  },
  body: JSON.stringify(payload),
})

const text = await response.text()

if (!response.ok) {
  console.error(`❌  Request failed (HTTP ${response.status}):`)
  console.error(text)
  process.exit(1)
}

let result
try { result = JSON.parse(text) } catch { result = text }

console.log(`✅  Success (HTTP ${response.status})`)
console.log('    Row:', JSON.stringify(Array.isArray(result) ? result[0] : result, null, 2))
