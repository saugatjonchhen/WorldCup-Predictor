import { SupabaseClient } from '@supabase/supabase-js'

export interface SyncResult {
  success: boolean
  updatedCount: number
  error?: string
}

export async function syncLiveScores(supabase: SupabaseClient): Promise<SyncResult> {
  try {
    // 1. Fetch current matches from Supabase
    const { data: dbMatches, error: dbError } = await supabase
      .from('matches')
      .select('*')

    if (dbError) throw dbError
    if (!dbMatches) throw new Error('No matches found in database')

    // 2. Fetch latest data from the external API
    const response = await fetch('https://worldcup26.ir/get/games')
    if (!response.ok) {
      throw new Error(`Failed to fetch external API: ${response.statusText}`)
    }
    const apiData = await response.json()
    const apiGames = apiData.games

    if (!Array.isArray(apiGames)) {
      throw new Error('Invalid response structure from external API')
    }

    let updatedCount = 0

    // 3. Compare and update changed matches
    for (const game of apiGames) {
      // Find the corresponding database match
      const dbMatch = dbMatches.find((m) => m.external_match_id === String(game.id))
      if (!dbMatch) continue

      // Determine mapped status
      let status = 'scheduled'
      const isFinished = String(game.finished).toUpperCase() === 'TRUE' || String(game.time_elapsed).toLowerCase() === 'finished'
      const hasStarted = String(game.time_elapsed).toLowerCase() !== 'notstarted' && game.time_elapsed !== null && game.time_elapsed !== undefined

      if (isFinished) {
        status = 'completed'
      } else if (hasStarted) {
        status = 'live'
      }

      // Parse scores safely
      const apiHomeScore = game.home_score !== 'null' && game.home_score !== null && game.home_score !== undefined ? parseInt(game.home_score) : null
      const apiAwayScore = game.away_score !== 'null' && game.away_score !== null && game.away_score !== undefined ? parseInt(game.away_score) : null

      const live_home_score = status !== 'scheduled' ? apiHomeScore : null
      const live_away_score = status !== 'scheduled' ? apiAwayScore : null
      const live_minute = game.time_elapsed !== 'null' && game.time_elapsed !== null && game.time_elapsed !== undefined ? String(game.time_elapsed) : 'notstarted'

      const home_score = status === 'completed' ? apiHomeScore : null
      const away_score = status === 'completed' ? apiAwayScore : null

      // Check if any fields changed
      const hasChanged =
        dbMatch.status !== status ||
        dbMatch.live_home_score !== live_home_score ||
        dbMatch.live_away_score !== live_away_score ||
        dbMatch.live_minute !== live_minute ||
        dbMatch.home_score !== home_score ||
        dbMatch.away_score !== away_score

      if (hasChanged) {
        const { error: updateError } = await supabase
          .from('matches')
          .update({
            status,
            live_home_score,
            live_away_score,
            live_minute,
            home_score,
            away_score,
            updated_at: new Date().toISOString()
          })
          .eq('id', dbMatch.id)

        if (updateError) {
          console.error(`Failed to update match ${dbMatch.id}:`, updateError)
        } else {
          updatedCount++
        }
      }
    }

    return { success: true, updatedCount }
  } catch (err: any) {
    console.error('Error during match sync:', err)
    return { success: false, updatedCount: 0, error: err.message || 'Unknown error' }
  }
}
