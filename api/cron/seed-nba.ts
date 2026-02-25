import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const ESPN_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';

// ─── Types ──────────────────────────────────────────────────────────────────

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

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapStatus(state: string, completed: boolean): 'scheduled' | 'live' | 'final' {
  if (state === 'pre') return 'scheduled';
  if (state === 'in') return 'live';
  if (state === 'post' || completed) return 'final';
  return 'scheduled';
}

function getTodayET(): string {
  return new Date()
    .toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    .replace(/-/g, '');
}

function getYesterdayET(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d
    .toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    .replace(/-/g, '');
}

function getCurrentSeasonYear(): number {
  const now = new Date();
  const etMonth = parseInt(
    now.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'numeric' }),
    10,
  );
  const etYear = parseInt(
    now.toLocaleDateString('en-US', { timeZone: 'America/New_York', year: 'numeric' }),
    10,
  );
  return etMonth >= 10 ? etYear : etYear - 1;
}

async function fetchEspnScoreboard(dateStr: string): Promise<EspnEvent[]> {
  const res = await fetch(`${ESPN_SCOREBOARD_URL}?dates=${dateStr}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ESPN API error ${res.status}: ${text}`);
  }
  const json: EspnScoreboard = await res.json();
  return json.events ?? [];
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1. Load team map: abbreviation → internal UUID
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('id, abbreviation')
      .returns<{ id: string; abbreviation: string }[]>();

    if (teamsErr) {
      return res.status(500).json({ error: `Failed to load teams: ${teamsErr.message}` });
    }

    const teamAbbrMap = new Map<string, string>();
    for (const row of teams ?? []) {
      teamAbbrMap.set(row.abbreviation.toUpperCase(), row.id);
    }

    if (teamAbbrMap.size === 0) {
      return res.status(500).json({ error: 'No teams in DB. Run full seed first.' });
    }

    // 2. Ensure current season exists
    const seasonYear = getCurrentSeasonYear();
    const { data: seasonData, error: seasonErr } = await supabase
      .from('seasons')
      .upsert({ year: seasonYear, type: 'regular' }, { onConflict: 'year' })
      .select('id')
      .returns<{ id: string }[]>()
      .single();

    if (seasonErr) {
      return res.status(500).json({ error: `Season upsert failed: ${seasonErr.message}` });
    }

    const seasonId = seasonData!.id;

    // 3. Fetch yesterday's + today's games from ESPN
    const today = getTodayET();
    const yesterday = getYesterdayET();
    const [yesterdayEvents, todayEvents] = await Promise.all([
      fetchEspnScoreboard(yesterday),
      fetchEspnScoreboard(today),
    ]);

    const allEvents = [...yesterdayEvents, ...todayEvents];

    // Deduplicate by event ID (a game might appear in both days' results)
    const seen = new Set<string>();
    const events = allEvents.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    if (events.length === 0) {
      return res.status(200).json({ message: 'No games found', dates: [yesterday, today], upserted: 0 });
    }

    // 4. Map to DB rows
    const skipped: string[] = [];
    const rows = events.flatMap((event) => {
      const comp = event.competitions[0];
      if (!comp) return [];

      const home = comp.competitors.find((c) => c.homeAway === 'home');
      const away = comp.competitors.find((c) => c.homeAway === 'away');
      if (!home || !away) return [];

      const homeTeamId = teamAbbrMap.get(home.team.abbreviation.toUpperCase());
      const awayTeamId = teamAbbrMap.get(away.team.abbreviation.toUpperCase());

      if (!homeTeamId || !awayTeamId) {
        skipped.push(event.id);
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

    // 5. Upsert
    if (rows.length > 0) {
      const { error: upsertErr } = await supabase
        .from('games')
        .upsert(rows, { onConflict: 'provider,provider_game_id' });

      if (upsertErr) {
        return res.status(500).json({ error: `Games upsert failed: ${upsertErr.message}` });
      }
    }

    return res.status(200).json({
      message: 'OK',
      dates: [yesterday, today],
      season: seasonYear,
      upserted: rows.length,
      skipped: skipped.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Unknown error' });
  }
}
