import { SupabaseClient } from '@supabase/supabase-js'

export interface SyncResult {
  success: boolean
  updatedCount: number
  error?: string
}

function parseScorers(scorersInput: any): string[] {
  if (!scorersInput) return []
  if (Array.isArray(scorersInput)) return scorersInput
  if (typeof scorersInput !== 'string') return []
  
  const content = scorersInput.trim()
  if (content === 'null' || content === '{}' || !content) return []
  
  if (content.startsWith('{') && content.endsWith('}')) {
    const inner = content.slice(1, -1).trim()
    if (!inner) return []

    const matches: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < inner.length; i++) {
      const char = inner[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        matches.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    if (current) {
      matches.push(current.trim())
    }
    return matches
  }
  
  if (content.startsWith('[') && content.endsWith(']')) {
    try {
      return JSON.parse(content)
    } catch {
      return []
    }
  }

  return [content]
}

function getGoalsIn90(scorers: string[]): number {
  let count = 0
  for (const scorer of scorers) {
    const match = scorer.match(/(\d+)(?:\+(\d+))?'/)
    if (match) {
      const min = parseInt(match[1], 10)
      if (min <= 90) {
        count++
      }
    } else {
      count++
    }
  }
  return count
}

export async function syncLiveScores(supabase: SupabaseClient): Promise<SyncResult> {
  try {
    // 1. Fetch current matches from Supabase
    const { data: dbMatches, error: dbError } = await supabase
      .from('matches')
      .select('*')

    if (dbError) throw dbError
    if (!dbMatches) throw new Error('No matches found in database')

    // Fetch teams to map IDs to official names
    const { data: dbTeams, error: teamsError } = await supabase
      .from('teams')
      .select('external_team_id, name')

    if (teamsError) throw teamsError
    const teamMap = new Map(dbTeams?.map((t) => [t.external_team_id, t.name]) || [])

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

      let home_score = status === 'completed' ? apiHomeScore : null
      let away_score = status === 'completed' ? apiAwayScore : null
      let home_score_et: number | null = null
      let away_score_et: number | null = null

      // Parse penalty scores safely
      const apiHomePenScore = game.home_penalty_score !== 'null' && game.home_penalty_score !== null && game.home_penalty_score !== undefined ? parseInt(game.home_penalty_score) : null
      const apiAwayPenScore = game.away_penalty_score !== 'null' && game.away_penalty_score !== null && game.away_penalty_score !== undefined ? parseInt(game.away_penalty_score) : null

      // Map team IDs and names
      const apiHomeExtId = game.home_team_id !== '0' && game.home_team_id !== null && game.home_team_id !== undefined ? String(game.home_team_id) : null
      const apiAwayExtId = game.away_team_id !== '0' && game.away_team_id !== null && game.away_team_id !== undefined ? String(game.away_team_id) : null

      const homeTeamName = apiHomeExtId 
        ? (teamMap.get(apiHomeExtId) || game.home_team_name_en) 
        : (dbMatch.stage !== 'group' ? game.home_team_label : game.home_team_name_en)
      const awayTeamName = apiAwayExtId 
        ? (teamMap.get(apiAwayExtId) || game.away_team_name_en) 
        : (dbMatch.stage !== 'group' ? game.away_team_label : game.away_team_name_en)

      // Determine penalty winner
      let penalty_winner: string | null = null
      if (apiHomePenScore !== null && apiAwayPenScore !== null) {
        if (apiHomePenScore > apiAwayPenScore) {
          penalty_winner = homeTeamName
        } else if (apiAwayPenScore > apiHomePenScore) {
          penalty_winner = awayTeamName
        }
      }

      // Check if it's a completed knockout match that went to extra time (won after 90m without penalties)
      if (status === 'completed' && dbMatch.stage !== 'group' && apiHomeScore !== null && apiAwayScore !== null) {
        if (apiHomePenScore !== null && apiAwayPenScore !== null) {
          // Went to penalties: the 90m/extra-time score was a draw (e.g. 1-1)
          home_score_et = 0
          away_score_et = 0
        } else {
          const homeScorers = parseScorers(game.home_scorers)
          const awayScorers = parseScorers(game.away_scorers)

          // Only calculate 90m score if we have complete scorers data
          const hasCompleteScorersData =
            homeScorers.length === apiHomeScore &&
            awayScorers.length === apiAwayScore
          
          if (hasCompleteScorersData) {
            const homeGoals90 = getGoalsIn90(homeScorers)
            const awayGoals90 = getGoalsIn90(awayScorers)

            // If it was a draw at 90 minutes but the final score was decided (not a draw)
            if (homeGoals90 === awayGoals90 && apiHomeScore !== apiAwayScore) {
              home_score = homeGoals90
              away_score = awayGoals90
              home_score_et = apiHomeScore - homeGoals90
              away_score_et = apiAwayScore - awayGoals90
            }
          }
        }
      }

      // Check if any fields changed
      const hasChanged =
        dbMatch.status !== status ||
        dbMatch.live_home_score !== live_home_score ||
        dbMatch.live_away_score !== live_away_score ||
        dbMatch.live_minute !== live_minute ||
        dbMatch.home_score !== home_score ||
        dbMatch.away_score !== away_score ||
        dbMatch.home_team_ext_id !== apiHomeExtId ||
        dbMatch.away_team_ext_id !== apiAwayExtId ||
        dbMatch.home_team !== homeTeamName ||
        dbMatch.away_team !== awayTeamName ||
        dbMatch.penalty_winner !== penalty_winner ||
        dbMatch.home_score_et !== home_score_et ||
        dbMatch.away_score_et !== away_score_et

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
            home_team: homeTeamName,
            away_team: awayTeamName,
            home_team_ext_id: apiHomeExtId,
            away_team_ext_id: apiAwayExtId,
            penalty_winner,
            home_score_et,
            away_score_et,
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
