/**
 * Know Ball — ESPN ingestion script
 *
 * Usage:
 *   npm run seed                     # teams + default (2024) season
 *   npm run seed -- --season 2025    # teams + 2025-26 season
 *   npm run seed:games -- --season 2025   # games only (skip teams), for daily cron
 *   npm run seed:games -- --season 2025 --days 3   # only games from last 3 days
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

const ESPN_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';

// ─── ESPN Types ─────────────────────────────────────────────────────────────

interface EspnCompetitor {
  id: string;
  homeAway: 'home' | 'away';
  team: { id: string; abbreviation: string };
  score: string;
}

interface EspnStatus {
  clock: number;
  displayClock: string;
  period: number;
  type: {
    state: 'pre' | 'in' | 'post';
    completed: boolean;
  };
}

interface EspnBroadcast {
  names: string[];
}

interface EspnVenue {
  fullName: string;
}

interface EspnCompetition {
  competitors: EspnCompetitor[];
  status: EspnStatus;
  broadcasts: EspnBroadcast[];
  venue: EspnVenue;
}

interface EspnEvent {
  id: string;
  date: string;
  competitions: EspnCompetition[];
  status: EspnStatus;
  season: { year: number; type: number };
}

interface EspnScoreboard {
  events: EspnEvent[];
}

// ─── CLI Args ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let season = 2024;
  let gamesOnly = false;
  let days: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--games-only') {
      gamesOnly = true;
    } else if (args[i] === '--days' && args[i + 1]) {
      days = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { season, gamesOnly, days };
}

const cliArgs = parseArgs();

// Maps abbreviation → internal UUID
const teamAbbrMap = new Map<string, string>();

// Maps season year → internal UUID
const seasonIdMap = new Map<number, string>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function mapStatus(state: string, completed: boolean): 'scheduled' | 'live' | 'final' {
  if (state === 'pre') return 'scheduled';
  if (state === 'in') return 'live';
  if (state === 'post' || completed) return 'final';
  return 'scheduled';
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

async function fetchEspnScoreboard(dateStr: string): Promise<EspnEvent[]> {
  const res = await fetch(`${ESPN_SCOREBOARD_URL}?dates=${dateStr}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ESPN ${dateStr} -> ${res.status}: ${text}`);
  }
  const json: EspnScoreboard = await res.json();
  return json.events ?? [];
}

// ─── Teams ───────────────────────────────────────────────────────────────────

async function seedTeams() {
  // Teams are already seeded via BDL or manually — just load from DB
  console.log('Loading teams from DB...');
  await loadTeamMap();
  console.log(`Loaded ${teamAbbrMap.size} teams`);
}

// ─── Seasons ─────────────────────────────────────────────────────────────────

async function ensureSeason(year: number): Promise<string> {
  if (seasonIdMap.has(year)) return seasonIdMap.get(year)!;

  const { data, error } = await supabase
    .from('seasons')
    .upsert({ year, type: 'regular' }, { onConflict: 'year' })
    .select('id')
    .returns<{ id: string }[]>()
    .single();

  if (error) {
    console.error(`Season upsert failed for ${year}:`, error.message);
    process.exit(1);
  }

  seasonIdMap.set(year, data!.id);
  return data!.id;
}

// ─── Games ───────────────────────────────────────────────────────────────────

async function seedGames(season: number, days: number | null = null) {
  // ESPN scoreboard only returns one day at a time, so iterate over date range.
  // NBA season runs roughly Oct to Jun (~270 days).
  const seasonStartYear = season;
  let startDate: Date;
  let endDate: Date;

  if (days !== null) {
    endDate = new Date();
    startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    console.log(`Fetching games from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}...`);
  } else {
    // Full season: Oct 1 of season year to Jun 30 of next year
    startDate = new Date(seasonStartYear, 9, 1); // Oct 1
    endDate = new Date(seasonStartYear + 1, 5, 30); // Jun 30
    // Don't go past today
    const today = new Date();
    if (endDate > today) endDate = today;
    console.log(`Fetching all games for season ${season} (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})...`);
  }

  const seasonId = await ensureSeason(season);
  let totalInserted = 0;
  let totalDays = 0;

  // Count total days for progress
  const totalDaysInRange = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = formatDate(current);
    totalDays++;

    const events = await fetchEspnScoreboard(dateStr);

    if (events.length > 0) {
      const rows = events.flatMap((event) => {
        const comp = event.competitions[0];
        if (!comp) return [];

        const home = comp.competitors.find((c) => c.homeAway === 'home');
        const away = comp.competitors.find((c) => c.homeAway === 'away');
        if (!home || !away) return [];

        const homeTeamId = teamAbbrMap.get(home.team.abbreviation.toUpperCase());
        const awayTeamId = teamAbbrMap.get(away.team.abbreviation.toUpperCase());

        if (!homeTeamId || !awayTeamId) {
          console.warn(`  Skipping game ${event.id}: unknown team ${home.team.abbreviation} or ${away.team.abbreviation}`);
          return [];
        }

        const status = event.status;
        const broadcast = comp.broadcasts?.[0]?.names?.join(', ') ?? null;
        const arena = comp.venue?.fullName ?? null;

        return [
          {
            provider: 'espn' as const,
            provider_game_id: parseInt(event.id, 10),
            season_id: seasonId,
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            home_team_score: parseInt(home.score, 10) || null,
            away_team_score: parseInt(away.score, 10) || null,
            game_date_utc: new Date(event.date).toISOString(),
            status: mapStatus(status.type.state, status.type.completed),
            period: status.period || null,
            time: status.displayClock || null,
            postseason: event.season.type === 3,
            broadcast,
            arena,
          },
        ];
      });

      if (rows.length > 0) {
        const { error } = await supabase
          .from('games')
          .upsert(rows, { onConflict: 'provider,provider_game_id' });

        if (error) {
          console.error(`Games upsert failed for ${dateStr}:`, error.message);
          process.exit(1);
        }

        totalInserted += rows.length;
      }
    }

    // Progress bar
    const pct = Math.min(100, Math.round((totalDays / totalDaysInRange) * 100));
    const filled = Math.round(pct / 5);
    const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(20 - filled);
    process.stdout.write(`\r  [${bar}] ${pct}% - ${totalInserted} games (day ${totalDays}/${totalDaysInRange})`);

    current.setDate(current.getDate() + 1);

    // Small delay to be nice to ESPN
    await sleep(200);
  }

  console.log('');
  console.log(`Upserted ${totalInserted} games for season ${season}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function loadTeamMap() {
  const { data, error } = await supabase
    .from('teams')
    .select('id, abbreviation')
    .returns<{ id: string; abbreviation: string }[]>();

  if (error) {
    console.error('Failed to load team map:', error.message);
    process.exit(1);
  }

  for (const row of data ?? []) {
    teamAbbrMap.set(row.abbreviation.toUpperCase(), row.id);
  }
}

async function main() {
  const { season, gamesOnly, days } = cliArgs;
  console.log('Know Ball seed script (ESPN) starting...\n');

  if (gamesOnly) {
    await loadTeamMap();
    if (teamAbbrMap.size === 0) {
      console.error('No teams found in DB. Run full seed first (without --games-only).');
      process.exit(1);
    }
    console.log(`Loaded ${teamAbbrMap.size} teams from DB`);
  } else {
    await seedTeams();
  }

  await seedGames(season, days);

  console.log('\nSeed complete!');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
