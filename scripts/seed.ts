/**
 * NBA Letterbox — BallDontLie ingestion script
 *
 * Usage: npm run seed
 * Requires: .env with SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_SUPABASE_URL, BALLDONTLIE_API_KEY
 *
 * What it does:
 * 1. Upserts all 30 NBA teams
 * 2. Upserts all 2024 regular-season games (paginated)
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

// Maps BDL team ID → internal UUID
const teamIdMap = new Map<number, string>();

// Maps season year → internal UUID
const seasonIdMap = new Map<number, string>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function bdlGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BDL_BASE}${path}`, { headers: BDL_HEADERS });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BDL ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
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
  if (s.includes(':') || s.includes('q') || s.includes('half')) return 'live';
  return 'scheduled';
}

async function seedGames(season: number) {
  console.log(`🎮 Fetching 2024 season games (BDL season=${season})…`);

  let cursor: number | undefined;
  let totalInserted = 0;
  let page = 1;

  while (true) {
    const cursorParam = cursor ? `&cursor=${cursor}` : '';
    const url = `/games?seasons[]=${season}&per_page=100${cursorParam}`;

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
          game_date_utc: new Date(g.date).toISOString(),
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

    console.log(`  Page ${page}: inserted/updated ${rows.length} games`);

    if (!meta.next_cursor) break;
    cursor = meta.next_cursor;
    page++;

    // Respect BDL rate limits
    await sleep(300);
  }

  console.log(`✅ Upserted ${totalInserted} games for season ${season}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 NBA Letterbox seed script starting…\n');

  await seedTeams();
  await seedGames(2024);

  console.log('\n🎉 Seed complete!');
}

main().catch((err) => {
  console.error('💥 Unhandled error:', err);
  process.exit(1);
});
