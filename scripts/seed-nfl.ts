/**
 * NFL seed script — ESPN data ingestion
 *
 * Usage:
 *   npx tsx scripts/seed-nfl.ts                    # teams + current season games
 *   npx tsx scripts/seed-nfl.ts --season 2025      # teams + specific season
 *   npx tsx scripts/seed-nfl.ts --games-only       # games only (skip teams)
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

const ESPN_NFL_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

const NFL_WEEK_TO_ROUND: Record<number, string> = {
  1: 'wild_card',
  2: 'divisional',
  3: 'conf_championship',
  4: 'super_bowl',
  5: 'super_bowl',
};

// ─── CLI Args ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  let season = month >= 9 ? year : year - 1;
  let gamesOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--games-only') {
      gamesOnly = true;
    }
  }

  return { season, gamesOnly };
}

const cliArgs = parseArgs();

const teamIdMap = new Map<number, string>();
const seasonIdMap = new Map<number, string>();

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ─── Teams ──────────────────────────────────────────────────────────────────

interface EspnTeam {
  id: string;
  abbreviation: string;
  displayName: string;
  shortDisplayName: string;
  location: string;
  groups?: { id: string; isConference: boolean; name: string };
}

async function seedTeams() {
  console.log('Fetching NFL teams from ESPN...');
  const [teamsRes, groupsRes] = await Promise.all([
    fetch(`${ESPN_NFL_BASE}/teams?limit=40`, {
      headers: { 'User-Agent': 'nba-letterbox/1.0' },
    }),
    fetch(`${ESPN_NFL_BASE}/groups`, {
      headers: { 'User-Agent': 'nba-letterbox/1.0' },
    }),
  ]);

  if (!teamsRes.ok) throw new Error(`ESPN teams API error: ${teamsRes.status}`);
  const teamsJson = await teamsRes.json();

  // Build conference/division lookup from groups endpoint
  const teamConfMap = new Map<string, { conference: string; division: string }>();
  if (groupsRes.ok) {
    const groupsJson = await groupsRes.json();
    for (const conf of groupsJson.groups ?? []) {
      const confAbbr = conf.abbreviation as string; // AFC or NFC
      for (const div of conf.children ?? []) {
        const divName = div.name as string; // e.g. "AFC East"
        for (const teamId of div.teams ?? []) {
          teamConfMap.set(String(teamId), { conference: confAbbr, division: divName });
        }
      }
    }
  }

  const rows: any[] = [];
  for (const group of teamsJson.sports?.[0]?.leagues?.[0]?.teams ?? []) {
    const t: EspnTeam = group.team;
    const confInfo = teamConfMap.get(t.id);

    rows.push({
      provider: 'espn' as const,
      provider_team_id: parseInt(t.id, 10),
      abbreviation: t.abbreviation,
      city: t.location,
      conference: confInfo?.conference ?? null,
      division: confInfo?.division ?? null,
      full_name: t.displayName,
      name: t.shortDisplayName,
      sport: 'nfl' as const,
    });
  }

  const { data, error } = await supabase
    .from('teams')
    .upsert(rows, { onConflict: 'provider,provider_team_id' })
    .select('id, provider_team_id')
    .returns<{ id: string; provider_team_id: number }[]>();

  if (error) {
    console.error('Teams upsert failed:', error.message);
    process.exit(1);
  }

  for (const row of data ?? []) {
    teamIdMap.set(row.provider_team_id, row.id);
  }

  console.log(`Upserted ${rows.length} NFL teams`);
}

// ─── Seasons ────────────────────────────────────────────────────────────────

async function ensureSeason(year: number): Promise<string> {
  if (seasonIdMap.has(year)) return seasonIdMap.get(year)!;

  const { data, error } = await supabase
    .from('seasons')
    .upsert({ year, type: 'regular', sport: 'nfl' }, { onConflict: 'sport,year' })
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

// ─── Games ──────────────────────────────────────────────────────────────────

function mapStatus(statusDetail: string): 'scheduled' | 'live' | 'final' {
  const s = statusDetail.toLowerCase();
  if (s.includes('final')) return 'final';
  if (s.includes('in progress') || /\d(st|nd|rd|th)/.test(s) || s.includes('halftime')) return 'live';
  return 'scheduled';
}

async function seedGames(season: number) {
  console.log(`Fetching NFL games for season ${season}...`);

  const seasonId = await ensureSeason(season);
  let totalInserted = 0;

  // ESPN has weeks 1-18 regular season, then playoffs
  // seasontype: 1=preseason, 2=regular, 3=postseason
  for (const seasonType of [2, 3]) {
    const maxWeek = seasonType === 2 ? 18 : 5; // 5 postseason weeks max

    for (let week = 1; week <= maxWeek; week++) {
      const url = `${ESPN_NFL_BASE}/scoreboard?seasontype=${seasonType}&week=${week}&dates=${season}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'nba-letterbox/1.0' },
      });

      if (!res.ok) {
        console.warn(`  ESPN error for week ${week} type ${seasonType}: ${res.status}`);
        continue;
      }

      const json = await res.json();
      const events = json.events ?? [];

      if (events.length === 0) continue;

      const rows = events.flatMap((event: any) => {
        const comp = event.competitions?.[0];
        if (!comp) return [];

        const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
        const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
        if (!home || !away) return [];

        const homeTeamId = teamIdMap.get(parseInt(home.team.id, 10));
        const awayTeamId = teamIdMap.get(parseInt(away.team.id, 10));

        if (!homeTeamId || !awayTeamId) return [];

        const statusDetail = comp.status?.type?.detail ?? '';

        const playoffRound = seasonType === 3 ? (NFL_WEEK_TO_ROUND[week] ?? null) : null;

        return [{
          provider: 'espn' as const,
          provider_game_id: parseInt(event.id, 10),
          season_id: seasonId,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          home_team_score: parseInt(home.score, 10) || null,
          away_team_score: parseInt(away.score, 10) || null,
          game_date_utc: new Date(event.date).toISOString(),
          status: mapStatus(statusDetail),
          period: comp.status?.period ?? null,
          time: comp.status?.displayClock ?? null,
          postseason: seasonType === 3,
          playoff_round: playoffRound,
          sport: 'nfl' as const,
        }];
      });

      if (rows.length > 0) {
        const { error } = await supabase
          .from('games')
          .upsert(rows, { onConflict: 'provider,provider_game_id' });

        if (error) {
          console.error(`Games upsert failed (week ${week}):`, error.message);
          process.exit(1);
        }

        totalInserted += rows.length;
      }

      const label = seasonType === 2 ? `Week ${week}` : `Playoff week ${week}`;
      process.stdout.write(`\r  ${label}: ${rows.length} games (total: ${totalInserted})`);

      await sleep(500); // Respect ESPN rate limits
    }
  }

  console.log('');
  console.log(`Upserted ${totalInserted} NFL games for season ${season}`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function loadTeamMap() {
  const { data, error } = await supabase
    .from('teams')
    .select('id, provider_team_id')
    .eq('sport', 'nfl')
    .returns<{ id: string; provider_team_id: number }[]>();

  if (error) {
    console.error('Failed to load NFL team map:', error.message);
    process.exit(1);
  }

  for (const row of data ?? []) {
    teamIdMap.set(row.provider_team_id, row.id);
  }
}

async function main() {
  const { season, gamesOnly } = cliArgs;
  console.log('NFL Letterbox seed script starting...\n');

  if (gamesOnly) {
    await loadTeamMap();
    if (teamIdMap.size === 0) {
      console.error('No NFL teams found in DB. Run full seed first (without --games-only).');
      process.exit(1);
    }
    console.log(`Loaded ${teamIdMap.size} NFL teams from DB`);
  } else {
    await seedTeams();
  }

  await seedGames(season);

  console.log('\nNFL seed complete!');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
