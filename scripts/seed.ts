/**
 * NBA Letterbox — BallDontLie ingestion script
 *
 * Usage:
 *   npm run seed                     # teams + default (2024) season
 *   npm run seed -- --season 2025    # teams + 2025-26 season
 *   npm run seed:games -- --season 2025   # games only (skip teams), for daily cron
 *   npm run seed:games -- --season 2025 --days 3   # only games from last 3 days
 *
 * Requires: .env with SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_SUPABASE_URL, BALLDONTLIE_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bdlApiKey = process.env.BALLDONTLIE_API_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

if (!bdlApiKey) {
  console.error('❌ Missing BALLDONTLIE_API_KEY in .env');
  process.exit(1);
}

// Use service role to bypass RLS — untyped client since we control the shapes directly
const supabase = createClient(supabaseUrl, serviceRoleKey);

const BDL_BASE = 'https://api.balldontlie.io/nba/v1';
const BDL_HEADERS = {
  Authorization: bdlApiKey,
  'Content-Type': 'application/json',
};

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

// Maps BDL team ID → internal UUID
const teamIdMap = new Map<number, string>();

// Maps season year → internal UUID
const seasonIdMap = new Map<number, string>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function bdlGet<T>(path: string, retries = 8): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(`${BDL_BASE}${path}`, { headers: BDL_HEADERS });
    if (res.status === 429) {
      const wait = attempt * 15000; // 15s, 30s, 45s, 60s, etc.
      console.log(`  ⏳ Rate limited, waiting ${wait / 1000}s (attempt ${attempt}/${retries})…`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`BDL ${path} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }
  throw new Error(`BDL ${path} → 429: Still rate limited after ${retries} retries`);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ─── Teams ───────────────────────────────────────────────────────────────────

interface BdlTeam {
  id: number;
  abbreviation: string;
  city: string;
  conference: string;
  division: string;
  full_name: string;
  name: string;
}

async function seedTeams() {
  console.log('🏀 Fetching teams from BallDontLie…');
  const { data: bdlTeams } = await bdlGet<{ data: BdlTeam[] }>('/teams?per_page=100');

  const rows = bdlTeams.map((t) => ({
    provider: 'balldontlie' as const,
    provider_team_id: t.id,
    abbreviation: t.abbreviation,
    city: t.city,
    conference: t.conference || null,
    division: t.division || null,
    full_name: t.full_name,
    name: t.name,
  }));

  const { data, error } = await supabase
    .from('teams')
    .upsert(rows, { onConflict: 'provider,provider_team_id' })
    .select('id, provider_team_id')
    .returns<{ id: string; provider_team_id: number }[]>();

  if (error) {
    console.error('❌ Teams upsert failed:', error.message);
    process.exit(1);
  }

  for (const row of data ?? []) {
    teamIdMap.set(row.provider_team_id, row.id);
  }

  console.log(`✅ Upserted ${rows.length} teams`);
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
    console.error(`❌ Season upsert failed for ${year}:`, error.message);
    process.exit(1);
  }

  seasonIdMap.set(year, data!.id);
  return data!.id;
}

// ─── Games ───────────────────────────────────────────────────────────────────

interface BdlGame {
  id: number;
  date: string;
  home_team: { id: number };
  visitor_team: { id: number };
  home_team_score: number;
  visitor_team_score: number;
  status: string;
  period: number;
  time: string;
  postseason: boolean;
  season: number;
}

interface BdlGamesResponse {
  data: BdlGame[];
  meta: {
    next_cursor?: number;
    per_page: number;
  };
}

function mapStatus(status: string): 'scheduled' | 'live' | 'final' {
  const s = status.toLowerCase();
  if (s === 'final' || s.startsWith('final/')) return 'final';
  // Quarter indicators (e.g. "Q1", "Q3 5:20") or halftime mean the game is live.
  // Avoid matching scheduled times like "7:00 PM ET" which also contain colons.
  if (/\bq\d/.test(s) || s.includes('half') || s.includes('ot')) return 'live';
  return 'scheduled';
}

async function seedGames(season: number, days: number | null = null) {
  let dateRange = '';
  if (days !== null) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    dateRange = `&start_date=${startStr}&end_date=${endStr}`;
    console.log(`🎮 Fetching games for season ${season} from ${startStr} to ${endStr}…`);
  } else {
    console.log(`🎮 Fetching all games for season ${season}…`);
  }

  let cursor: number | undefined;
  let totalInserted = 0;
  let page = 1;

  while (true) {
    const cursorParam = cursor ? `&cursor=${cursor}` : '';
    const url = `/games?seasons[]=${season}&per_page=100${cursorParam}${dateRange}`;

    const response = await bdlGet<BdlGamesResponse>(url);
    const { data: bdlGames, meta } = response;

    if (bdlGames.length === 0) break;

    const seasonId = await ensureSeason(season);

    const rows = bdlGames.flatMap((g) => {
      const homeTeamId = teamIdMap.get(g.home_team.id);
      const awayTeamId = teamIdMap.get(g.visitor_team.id);

      if (!homeTeamId || !awayTeamId) {
        console.warn(`  ⚠ Skipping game ${g.id}: unknown team ID`);
        return [];
      }

      return [
        {
          provider: 'balldontlie' as const,
          provider_game_id: g.id,
          season_id: seasonId,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          home_team_score: g.home_team_score || null,
          away_team_score: g.visitor_team_score || null,
          game_date_utc: (g as any).datetime ? new Date((g as any).datetime).toISOString() : new Date(g.date).toISOString(),
          status: mapStatus(g.status),
          period: g.period || null,
          time: g.time || null,
          postseason: g.postseason ?? false,
        },
      ];
    });

    if (rows.length > 0) {
      const { error } = await supabase
        .from('games')
        .upsert(rows, { onConflict: 'provider,provider_game_id' });

      if (error) {
        console.error(`❌ Games upsert failed (page ${page}):`, error.message);
        process.exit(1);
      }

      totalInserted += rows.length;
    }

    // ~1300 games in a season → ~13 pages of 100
    const estTotal = 1300;
    const pct = Math.min(100, Math.round((totalInserted / estTotal) * 100));
    const filled = Math.round(pct / 5);
    const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
    process.stdout.write(`\r  [${bar}] ${pct}% — ${totalInserted} games (page ${page})`);

    if (!meta.next_cursor) break;
    cursor = meta.next_cursor;
    page++;

    // Respect BDL rate limits — free tier is ~5 req/min
    await sleep(3000);
  }

  console.log(''); // newline after progress bar
  console.log(`✅ Upserted ${totalInserted} games for season ${season}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function loadTeamMap() {
  const { data, error } = await supabase
    .from('teams')
    .select('id, provider_team_id')
    .returns<{ id: string; provider_team_id: number }[]>();

  if (error) {
    console.error('❌ Failed to load team map:', error.message);
    process.exit(1);
  }

  for (const row of data ?? []) {
    teamIdMap.set(row.provider_team_id, row.id);
  }
}

async function main() {
  const { season, gamesOnly, days } = cliArgs;
  console.log('🚀 NBA Letterbox seed script starting…\n');

  if (gamesOnly) {
    // Skip team ingestion — just load existing team ID mapping from DB
    await loadTeamMap();
    if (teamIdMap.size === 0) {
      console.error('❌ No teams found in DB. Run full seed first (without --games-only).');
      process.exit(1);
    }
    console.log(`✅ Loaded ${teamIdMap.size} teams from DB`);
  } else {
    await seedTeams();
  }

  await seedGames(season, days);

  console.log('\n🎉 Seed complete!');
}

main().catch((err) => {
  console.error('💥 Unhandled error:', err);
  process.exit(1);
});
