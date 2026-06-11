#!/usr/bin/env node
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const STADIUM_OFFSETS = {
  '1': -6,  // Estadio Azteca (Mexico City) - CST (UTC-6)
  '2': -6,  // Estadio Akron (Guadalajara) - CST (UTC-6)
  '3': -6,  // Estadio BBVA (Monterrey) - CST (UTC-6)
  '4': -5,  // AT&T Stadium (Dallas) - CDT (UTC-5)
  '5': -5,  // NRG Stadium (Houston) - CDT (UTC-5)
  '6': -5,  // GEHA Field at Arrowhead (Kansas City) - CDT (UTC-5)
  '7': -4,  // Mercedes-Benz Stadium (Atlanta) - EDT (UTC-4)
  '8': -4,  // Hard Rock Stadium (Miami) - EDT (UTC-4)
  '9': -4,  // Gillette Stadium (Boston) - EDT (UTC-4)
  '10': -4, // Lincoln Financial Field (Philly) - EDT (UTC-4)
  '11': -4, // MetLife Stadium (NY/NJ) - EDT (UTC-4)
  '12': -4, // BMO Field (Toronto) - EDT (UTC-4)
  '13': -7, // BC Place (Vancouver) - PDT (UTC-7)
  '14': -7, // Lumen Field (Seattle) - PDT (UTC-7)
  '15': -7, // Levi's Stadium (San Francisco) - PDT (UTC-7)
  '16': -7, // SoFi Stadium (Los Angeles) - PDT (UTC-7)
}

function parseStadiumTimeToUTC(localDate, stadiumId) {
  const [datePart, timePart] = localDate.split(' ')
  const [month, day, year] = datePart.split('/')
  const [hour, minute] = timePart.split(':')
  const dateMs = Date.UTC(parseInt(year), parseInt(month)-1, parseInt(day), parseInt(hour), parseInt(minute), 0, 0)
  const offsetHours = STADIUM_OFFSETS[stadiumId] ?? -5 // fallback to CDT
  return new Date(dateMs - offsetHours * 60 * 60 * 1000).toISOString()
}

function mapStage(type) {
  const m = { group:'group', r32:'round_of_32', r16:'round_of_16', qf:'qf', sf:'sf', third:'third_place', final:'final' }
  return m[type] ?? type
}

function sqlStr(val) {
  if (val === null || val === undefined) return 'NULL'
  return `'${String(val).replace(/'/g, "''")}'`
}

async function main() {
  console.log('Fetching from worldcup26.ir...')
  const [{ games }, { teams }] = await Promise.all([
    fetch('https://worldcup26.ir/get/games').then(r => r.json()),
    fetch('https://worldcup26.ir/get/teams').then(r => r.json())
  ])
  console.log(`Got ${games.length} matches, ${teams.length} teams`)

  const fixtures = games.map(g => {
    const isKnockout = g.type !== 'group'
    return {
      external_match_id: g.id,
      home_team: isKnockout ? (g.home_team_label ?? null) : (g.home_team_name_en ?? null),
      away_team: isKnockout ? (g.away_team_label ?? null) : (g.away_team_name_en ?? null),
      home_team_ext_id: g.home_team_id !== '0' ? g.home_team_id : null,
      away_team_ext_id: g.away_team_id !== '0' ? g.away_team_id : null,
      kickoff_time_utc: parseStadiumTimeToUTC(g.local_date, g.stadium_id),
      stage: mapStage(g.type),
      group_name: !['R32','R16','QF','SF','3RD','FINAL'].includes(g.group) ? g.group : null,
      matchday: parseInt(g.matchday),
      status: 'scheduled',
    }
  })

  const teamRows = teams.map(t => ({
    external_team_id: t.id,
    name: t.name_en, name_fa: t.name_fa, flag_url: t.flag,
    fifa_code: t.fifa_code, iso2: t.iso2, group_name: t.groups
  }))

  writeFileSync(join(ROOT, 'src/data/fixtures.json'), JSON.stringify(fixtures, null, 2))
  writeFileSync(join(ROOT, 'src/data/teams.json'), JSON.stringify(teamRows, null, 2))
  const lines = [
    '-- FIFA World Cup 2026 Seed Data', `-- Generated: ${new Date().toISOString()}`, '',
    '-- Teams',
    'INSERT INTO teams (external_team_id, name, name_fa, flag_url, fifa_code, iso2, group_name) VALUES',
    teamRows.map(t => `  (${sqlStr(t.external_team_id)}, ${sqlStr(t.name)}, ${sqlStr(t.name_fa)}, ${sqlStr(t.flag_url)}, ${sqlStr(t.fifa_code)}, ${sqlStr(t.iso2)}, ${sqlStr(t.group_name)})`).join(',\n') + 
    '\nON CONFLICT (external_team_id) DO UPDATE SET name = EXCLUDED.name, name_fa = EXCLUDED.name_fa, flag_url = EXCLUDED.flag_url, fifa_code = EXCLUDED.fifa_code, iso2 = EXCLUDED.iso2, group_name = EXCLUDED.group_name;',
    '',
    '-- Matches (104 fixtures)',
    'INSERT INTO matches (external_match_id, home_team, away_team, home_team_ext_id, away_team_ext_id, kickoff_time, stage, group_name, matchday, status) VALUES',
    fixtures.map(f => `  (${sqlStr(f.external_match_id)}, ${sqlStr(f.home_team)}, ${sqlStr(f.away_team)}, ${sqlStr(f.home_team_ext_id)}, ${sqlStr(f.away_team_ext_id)}, ${sqlStr(f.kickoff_time_utc)}, ${sqlStr(f.stage)}, ${sqlStr(f.group_name)}, ${f.matchday}, ${sqlStr(f.status)})`).join(',\n') + 
    '\nON CONFLICT (external_match_id) DO UPDATE SET kickoff_time = EXCLUDED.kickoff_time, home_team = EXCLUDED.home_team, away_team = EXCLUDED.away_team, home_team_ext_id = EXCLUDED.home_team_ext_id, away_team_ext_id = EXCLUDED.away_team_ext_id, stage = EXCLUDED.stage, group_name = EXCLUDED.group_name, matchday = EXCLUDED.matchday, status = EXCLUDED.status;'
  ]
  writeFileSync(join(ROOT, 'supabase/seed.sql'), lines.join('\n'))
  console.log('Done! fixtures.json, teams.json, seed.sql written.')
  console.log('Sample:', JSON.stringify(fixtures[0]))
}

main().catch(e => { console.error(e); process.exit(1) })
