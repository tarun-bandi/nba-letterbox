/**
 * NFL box score scraper — ESPN summary API
 *
 * Usage:
 *   npx tsx scripts/scrape-nfl-boxscores.ts                     # all final games without box scores
 *   npx tsx scripts/scrape-nfl-boxscores.ts --limit 10          # first 10 games
 *   npx tsx scripts/scrape-nfl-boxscores.ts --game-id <uuid>    # specific game
 *
 * Requires: .env with SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_SUPABASE_URL
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const ESPN_NFL_SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ─── CLI Args ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = 0;
  let gameId: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--game-id' && args[i + 1]) {
      gameId = args[i + 1];
      i++;
    }
  }

  return { limit, gameId };
}

// ─── ESPN Parsing ───────────────────────────────────────────────────────────

interface ParsedPlayer {
  player_name: string;
  team_abbr: string;
  category: string;
  stats: Record<string, string | number | null>;
}

function parseBoxScore(json: any): {
  players: ParsedPlayer[];
  teamMap: Map<string, { id: string; abbr: string }>;
} {
  const players: ParsedPlayer[] = [];
  const teamMap = new Map<string, { id: string; abbr: string }>();

  for (const teamData of json.boxscore?.players ?? []) {
    const teamAbbr = teamData.team?.abbreviation;
    const teamId = teamData.team?.id;
    if (teamAbbr) teamMap.set(teamAbbr, { id: teamId, abbr: teamAbbr });

    for (const statGroup of teamData.statistics ?? []) {
      const category = statGroup.name as string;
      const labels = (statGroup.labels ?? []) as string[];

      for (const athlete of statGroup.athletes ?? []) {
        const name = athlete.athlete?.displayName;
        if (!name) continue;

        const statsArr = (athlete.stats ?? []) as string[];
        const stats: Record<string, string | number | null> = {};

        for (let i = 0; i < labels.length && i < statsArr.length; i++) {
          stats[labels[i]] = statsArr[i];
        }

        players.push({
          player_name: name,
          team_abbr: teamAbbr,
          category,
          stats,
        });
      }
    }
  }

  return { players, teamMap };
}

function buildStatsJson(playerEntries: ParsedPlayer[]): Record<string, any> {
  const result: Record<string, any> = {};

  for (const entry of playerEntries) {
    const cat = entry.category;
    const s = entry.stats;

    switch (cat) {
      case 'passing': {
        const catt = String(s['C/ATT'] ?? '0/0').split('/');
        result.passing_completions = parseInt(catt[0]) || 0;
        result.passing_attempts = parseInt(catt[1]) || 0;
        result.passing_yards = parseInt(String(s['YDS'])) || 0;
        result.passing_tds = parseInt(String(s['TD'])) || 0;
        result.passing_ints = parseInt(String(s['INT'])) || 0;
        result.passer_rating = parseFloat(String(s['RTG'])) || null;
        result.qbr = parseFloat(String(s['QBR'])) || null;
        const sacks = String(s['SACKS'] ?? '0-0').split('-');
        result.sacks_taken = parseInt(sacks[0]) || 0;
        break;
      }
      case 'rushing': {
        result.rushing_carries = parseInt(String(s['CAR'])) || 0;
        result.rushing_yards = parseInt(String(s['YDS'])) || 0;
        result.rushing_tds = parseInt(String(s['TD'])) || 0;
        result.rushing_long = parseInt(String(s['LONG'])) || 0;
        break;
      }
      case 'receiving': {
        result.receptions = parseInt(String(s['REC'])) || 0;
        result.receiving_yards = parseInt(String(s['YDS'])) || 0;
        result.receiving_tds = parseInt(String(s['TD'])) || 0;
        result.targets = parseInt(String(s['TGTS'])) || 0;
        result.receiving_long = parseInt(String(s['LONG'])) || 0;
        break;
      }
      case 'defensive': {
        result.total_tackles = parseInt(String(s['TOT'])) || 0;
        result.solo_tackles = parseInt(String(s['SOLO'])) || 0;
        result.def_sacks = parseFloat(String(s['SACKS'])) || 0;
        result.tackles_for_loss = parseInt(String(s['TFL'])) || 0;
        result.passes_defended = parseInt(String(s['PD'])) || 0;
        result.qb_hits = parseInt(String(s['QB HTS'])) || 0;
        result.def_tds = parseInt(String(s['TD'])) || 0;
        break;
      }
      case 'interceptions': {
        result.def_ints = parseInt(String(s['INT'])) || 0;
        result.int_yards = parseInt(String(s['YDS'])) || 0;
        result.int_tds = parseInt(String(s['TD'])) || 0;
        break;
      }
      case 'fumbles': {
        result.fumbles = parseInt(String(s['FUM'])) || 0;
        result.fumbles_lost = parseInt(String(s['LOST'])) || 0;
        break;
      }
      case 'kicking': {
        const fg = String(s['FG'] ?? '0/0').split('/');
        result.fg_made = parseInt(fg[0]) || 0;
        result.fg_attempted = parseInt(fg[1]) || 0;
        const xp = String(s['XP'] ?? '0/0').split('/');
        result.xp_made = parseInt(xp[0]) || 0;
        result.xp_attempted = parseInt(xp[1]) || 0;
        result.kicking_points = parseInt(String(s['PTS'])) || 0;
        break;
      }
      case 'punting': {
        result.punts = parseInt(String(s['NO'])) || 0;
        result.punt_yards = parseInt(String(s['YDS'])) || 0;
        result.punt_long = parseInt(String(s['LONG'])) || 0;
        break;
      }
      case 'kickReturns': {
        result.kick_returns = parseInt(String(s['NO'])) || 0;
        result.kick_return_yards = parseInt(String(s['YDS'])) || 0;
        result.kick_return_tds = parseInt(String(s['TD'])) || 0;
        break;
      }
      case 'puntReturns': {
        result.punt_returns = parseInt(String(s['NO'])) || 0;
        result.punt_return_yards = parseInt(String(s['YDS'])) || 0;
        result.punt_return_tds = parseInt(String(s['TD'])) || 0;
        break;
      }
    }
  }

  return result;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function scrapeGame(game: { id: string; provider_game_id: number; home_team_id: string; away_team_id: string }) {
  const url = `${ESPN_NFL_SUMMARY}?event=${game.provider_game_id}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'know-ball/1.0' } });

  if (!res.ok) {
    console.warn(`  ESPN error for game ${game.provider_game_id}: ${res.status}`);
    return 0;
  }

  const json = await res.json();
  const { players, teamMap } = parseBoxScore(json);

  if (players.length === 0) return 0;

  // Group entries by player+team
  const playerGroups = new Map<string, ParsedPlayer[]>();
  for (const p of players) {
    const key = `${p.team_abbr}::${p.player_name}`;
    if (!playerGroups.has(key)) playerGroups.set(key, []);
    playerGroups.get(key)!.push(p);
  }

  // Build team ID lookup from our DB teams
  const dbTeamMap = new Map<string, string>();
  // away_team and home_team IDs are on the game row already
  // We need to map ESPN team abbreviation → our team UUID
  for (const [abbr, info] of teamMap) {
    // Query to find matching team
    const { data } = await supabase
      .from('teams')
      .select('id')
      .eq('abbreviation', abbr)
      .eq('sport', 'nfl')
      .single();
    if (data) dbTeamMap.set(abbr, data.id);
  }

  const rows: any[] = [];
  for (const [key, entries] of playerGroups) {
    const [teamAbbr, playerName] = key.split('::');
    const teamId = dbTeamMap.get(teamAbbr);
    if (!teamId) continue;

    const stats = buildStatsJson(entries);

    // Determine primary category for display
    const categories = entries.map((e) => e.category);
    let primaryCategory = 'defensive';
    if (categories.includes('passing')) primaryCategory = 'passing';
    else if (categories.includes('rushing')) primaryCategory = 'rushing';
    else if (categories.includes('receiving')) primaryCategory = 'receiving';
    else if (categories.includes('kicking')) primaryCategory = 'kicking';
    else if (categories.includes('punting')) primaryCategory = 'punting';

    rows.push({
      game_id: game.id,
      team_id: teamId,
      player_name: playerName,
      sport: 'nfl',
      stats: { ...stats, primary_category: primaryCategory },
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from('box_scores')
      .upsert(rows, { onConflict: 'game_id,team_id,player_name' });

    if (error) {
      console.error(`  Upsert failed for game ${game.provider_game_id}:`, error.message);
      return 0;
    }
  }

  return rows.length;
}

async function main() {
  const { limit, gameId } = parseArgs();
  console.log('NFL Box Score Scraper starting...\n');

  let query = supabase
    .from('games')
    .select('id, provider_game_id, home_team_id, away_team_id')
    .eq('sport', 'nfl')
    .eq('status', 'final');

  if (gameId) {
    query = query.eq('id', gameId);
  }

  query = query.order('game_date_utc', { ascending: false });

  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data: games, error } = await query;
  if (error) {
    console.error('Failed to fetch games:', error.message);
    process.exit(1);
  }

  if (!games || games.length === 0) {
    console.log('No final NFL games found to scrape.');
    return;
  }

  // Filter out games that already have box scores
  const gameIds = games.map((g: any) => g.id);
  const { data: existingBoxScores } = await supabase
    .from('box_scores')
    .select('game_id')
    .in('game_id', gameIds);

  const gamesWithBoxScores = new Set((existingBoxScores ?? []).map((b: any) => b.game_id));

  const gamesToScrape = gameId
    ? games // Always scrape if specific game requested
    : games.filter((g: any) => !gamesWithBoxScores.has(g.id));

  console.log(`Found ${games.length} final games, ${gamesToScrape.length} need box scores\n`);

  let totalPlayers = 0;
  for (let i = 0; i < gamesToScrape.length; i++) {
    const game = gamesToScrape[i] as any;
    const count = await scrapeGame(game);
    totalPlayers += count;
    process.stdout.write(`\r  [${i + 1}/${gamesToScrape.length}] Scraped ${count} players (total: ${totalPlayers})`);
    await sleep(500); // Rate limit
  }

  console.log(`\n\nDone! Scraped ${totalPlayers} player box scores across ${gamesToScrape.length} games.`);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
