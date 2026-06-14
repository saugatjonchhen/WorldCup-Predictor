import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// Helper function to assign ranks with support for ties
function assignRanks(items: any[], getValue: (item: any) => number) {
  let currentRank = 1;
  return items.map((item, index) => {
    if (index > 0 && getValue(item) < getValue(items[index - 1])) {
      currentRank = index + 1;
    }
    return {
      ...item,
      rank: currentRank
    };
  });
}

serve(async (req) => {
  // CORS Headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-apisports-key, x-rapidapi-key',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing environment variables for Supabase')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check if the user is an admin by validating their JWT and checking the profiles table
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      throw new Error('Forbidden: Only admins can trigger stats sync')
    }

    // Parse request body for API Key, Provider, and Season details
    let requestBody: any = {};
    if (req.headers.get('content-type')?.includes('application/json')) {
      try {
        requestBody = await req.clone().json();
      } catch (_) {}
    }

    const apiKey = req.headers.get('x-api-key') || 
                   req.headers.get('x-apisports-key') || 
                   req.headers.get('x-rapidapi-key') || 
                   requestBody.apiKey;

    const isRapidApi = !!req.headers.get('x-rapidapi-key') || !!requestBody.isRapidApi;
    const season = requestBody.season || '2026';

    if (!apiKey) {
      throw new Error('API key is required. Please provide x-api-key or apiKey.')
    }

    // Fetch team flags mapping from our database to maintain styling
    const { data: dbTeams } = await supabase.from('teams').select('name, flag_url')
    const teamFlags: Record<string, string> = {};
    if (dbTeams) {
      for (const t of dbTeams) {
        teamFlags[t.name.toLowerCase()] = t.flag_url;
      }
    }

    // Helper to query API-Football endpoints
    const fetchApiFootball = async (endpoint: string) => {
      const baseUrl = isRapidApi 
        ? 'https://api-football-v1.p.rapidapi.com/v3'
        : 'https://v3.football.api-sports.io';
      
      const url = `${baseUrl}${endpoint}`;
      const headers: Record<string, string> = {};
      
      if (isRapidApi) {
        headers['x-rapidapi-key'] = apiKey;
        headers['x-rapidapi-host'] = 'api-football-v1.p.rapidapi.com';
      } else {
        headers['x-apisports-key'] = apiKey;
      }

      console.log(`Fetching API-Football: ${url}`);
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`API-Football request failed (${response.status}): ${response.statusText}`);
      }
      
      const result = await response.json();
      if (result.errors && !Array.isArray(result.errors) && Object.keys(result.errors).length > 0) {
        const errorMsg = Object.values(result.errors).join(', ');
        throw new Error(`API-Football error: ${errorMsg}`);
      }
      return result.response || [];
    }

    // Fetch all required data in parallel
    const [
      scorersResponse,
      assistsResponse,
      yellowCardsResponse,
      redCardsResponse,
      fixturesResponse
    ] = await Promise.all([
      fetchApiFootball(`/players/topscorers?league=1&season=${season}`),
      fetchApiFootball(`/players/topassists?league=1&season=${season}`),
      fetchApiFootball(`/players/topyellowcards?league=1&season=${season}`),
      fetchApiFootball(`/players/topredcards?league=1&season=${season}`),
      fetchApiFootball(`/fixtures?league=1&season=${season}`)
    ]);

    const statsData: Record<string, any[]> = {};

    // 1. Players: Goals (Top Scorers)
    const scorers = scorersResponse.slice(0, 10).map((item: any) => {
      const player = item.player;
      const stat = item.statistics[0];
      const teamName = stat.team.name;
      return {
        name: player.name,
        team: teamName,
        value: stat.goals.total || 0,
        flag: teamFlags[teamName.toLowerCase()] || stat.team.logo
      };
    });
    statsData['goals'] = assignRanks(scorers, (x) => Number(x.value));

    // 2. Players: Assists (Top Assists)
    const assists = assistsResponse.slice(0, 10).map((item: any) => {
      const player = item.player;
      const stat = item.statistics[0];
      const teamName = stat.team.name;
      return {
        name: player.name,
        team: teamName,
        value: stat.goals.assists || 0,
        flag: teamFlags[teamName.toLowerCase()] || stat.team.logo
      };
    });
    statsData['assists'] = assignRanks(assists, (x) => Number(x.value));

    // 3. Players: Penalty Goals (extracted from scorers list)
    const penaltyGoals = scorersResponse
      .filter((item: any) => (item.statistics[0].penalty.scored || 0) > 0)
      .map((item: any) => {
        const player = item.player;
        const stat = item.statistics[0];
        const teamName = stat.team.name;
        return {
          name: player.name,
          team: teamName,
          value: stat.penalty.scored || 0,
          flag: teamFlags[teamName.toLowerCase()] || stat.team.logo
        };
      })
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 10);
    statsData['penalty_goals'] = assignRanks(penaltyGoals, (x) => Number(x.value));

    // 4. Players: Yellow Cards
    const yellowCards = yellowCardsResponse.slice(0, 10).map((item: any) => {
      const player = item.player;
      const stat = item.statistics[0];
      const teamName = stat.team.name;
      return {
        name: player.name,
        team: teamName,
        value: stat.cards.yellow || 0,
        flag: teamFlags[teamName.toLowerCase()] || stat.team.logo
      };
    });
    statsData['yellow_cards'] = assignRanks(yellowCards, (x) => Number(x.value));

    // 5. Players: Red Cards
    const redCards = redCardsResponse.slice(0, 10).map((item: any) => {
      const player = item.player;
      const stat = item.statistics[0];
      const teamName = stat.team.name;
      return {
        name: player.name,
        team: teamName,
        value: stat.cards.red || 0,
        flag: teamFlags[teamName.toLowerCase()] || stat.team.logo
      };
    });
    statsData['red_cards'] = assignRanks(redCards, (x) => Number(x.value));

    // Calculate Team Stats from Fixtures
    const teamAggregation: Record<string, { name: string; logo: string; played: number; goalsFor: number; goalsAgainst: number; cleanSheets: number }> = {};
    
    for (const match of fixturesResponse) {
      const status = match.fixture.status.short;
      if (['FT', 'AET', 'PEN'].includes(status)) {
        const home = match.teams.home;
        const away = match.teams.away;
        const homeGoals = match.goals.home ?? 0;
        const awayGoals = match.goals.away ?? 0;
        
        if (!teamAggregation[home.name]) {
          teamAggregation[home.name] = { name: home.name, logo: home.logo, played: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 };
        }
        if (!teamAggregation[away.name]) {
          teamAggregation[away.name] = { name: away.name, logo: away.logo, played: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 };
        }
        
        teamAggregation[home.name].played += 1;
        teamAggregation[home.name].goalsFor += homeGoals;
        teamAggregation[home.name].goalsAgainst += awayGoals;
        if (awayGoals === 0) teamAggregation[home.name].cleanSheets += 1;
        
        teamAggregation[away.name].played += 1;
        teamAggregation[away.name].goalsFor += awayGoals;
        teamAggregation[away.name].goalsAgainst += homeGoals;
        if (homeGoals === 0) teamAggregation[away.name].cleanSheets += 1;
      }
    }

    const teamList = Object.values(teamAggregation);

    // 6. Teams: Goals Per Match
    const goalsPerMatch = teamList
      .filter(t => t.played > 0)
      .map(t => ({
        team: t.name,
        value: Number((t.goalsFor / t.played).toFixed(2)),
        flag: teamFlags[t.name.toLowerCase()] || t.logo
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    statsData['goals_per_match'] = assignRanks(goalsPerMatch, (x) => Number(x.value));

    // 7. Teams: Conceded Per Match
    const concededPerMatch = teamList
      .filter(t => t.played > 0)
      .map(t => ({
        team: t.name,
        value: Number((t.goalsAgainst / t.played).toFixed(2)),
        flag: teamFlags[t.name.toLowerCase()] || t.logo
      }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 10);
    statsData['conceded_per_match'] = assignRanks(concededPerMatch, (x) => -Number(x.value));

    // 8. Teams: Clean Sheets
    const cleanSheets = teamList
      .filter(t => t.played > 0 && t.cleanSheets > 0)
      .map(t => ({
        team: t.name,
        value: t.cleanSheets,
        flag: teamFlags[t.name.toLowerCase()] || t.logo
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    statsData['clean_sheets'] = assignRanks(cleanSheets, (x) => Number(x.value));

    // Upsert all data to database
    const upsertPromises = [];
    
    for (const [key, value] of Object.entries(statsData)) {
      const category = key.includes('goals_per_match') || key.includes('conceded_per_match') || key.includes('clean_sheets') ? 'teams' : 'players';
      const stat_type = key;
      
      upsertPromises.push(
        supabase
          .from('tournament_stats')
          .upsert({
            category,
            stat_type,
            data: value,
            last_synced_at: new Date().toISOString()
          }, { onConflict: 'category, stat_type' })
      );
    }

    await Promise.all(upsertPromises);

    return new Response(
      JSON.stringify({ success: true, message: `Successfully synced ${Object.keys(statsData).length} stats from API-Football!` }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Sync error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
