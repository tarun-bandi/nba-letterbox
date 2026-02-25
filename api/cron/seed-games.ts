import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const BDL_BASE = 'https://api.balldontlie.io/nba/v1';

// ─── Types ──────────────────────────────────────────────────────────────────

interface BdlGame {
  id: number;
  date: string;
  datetime: string | null;
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
  meta: { next_cursor?: number; per_page: number };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapStatus(status: string): 'scheduled' | 'live' | 'final' {
  const s = status.toLowerCase();
  if (s === 'final' || s.startsWith('final/')) return 'final';
  // BDL uses a datetime string (e.g. "2026-02-25T00:00:00Z") for scheduled games
  if (s.startsWith('20')) return 'scheduled';
  if (/\bq\d/.test(s) || s.includes('half') || /\bot/i.test(s)) return 'live';
  return 'scheduled';
}

function getTodayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function getYesterdayET(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
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
  // NBA season starts in October — Oct-Dec belongs to current year's season
  return etMonth >= 10 ? etYear : etYear - 1;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Auth: Vercel cron sends `Authorization: Bearer <CRON_SECRET>`
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bdlApiKey = process.env.BALLDONTLIE_API_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Missing Supabase env vars' });
  }
  if (!bdlApiKey) {
    return res.status(500).json({ error: 'Missing BALLDONTLIE_API_KEY' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // 1. Load team map: provider_team_id → internal UUID
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('id, provider_team_id')
      .returns<{ id: string; provider_team_id: number }[]>();

    if (teamsErr) {
      return res.status(500).json({ error: `Failed to load teams: ${teamsErr.message}` });
    }

    const teamIdMap = new Map<number, string>();
    for (const row of teams ?? []) {
      teamIdMap.set(row.provider_team_id, row.id);
    }

    if (teamIdMap.size === 0) {
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

    // 3. Fetch yesterday's + today's games from BDL
    const today = getTodayET();
    const yesterday = getYesterdayET();
    const bdlRes = await fetch(`${BDL_BASE}/games?dates[]=${yesterday}&dates[]=${today}&per_page=100`, {
      headers: { Authorization: bdlApiKey, 'Content-Type': 'application/json' },
    });

    if (!bdlRes.ok) {
      const text = await bdlRes.text();
      return res.status(502).json({ error: `BDL API error ${bdlRes.status}: ${text}` });
    }

    const { data: bdlGames } = (await bdlRes.json()) as BdlGamesResponse;

    if (bdlGames.length === 0) {
      return res.status(200).json({ message: 'No games found', dates: [yesterday, today], upserted: 0 });
    }

    // 4. Map to DB rows
    const skipped: number[] = [];
    const rows = bdlGames.flatMap((g) => {
      const homeTeamId = teamIdMap.get(g.home_team.id);
      const awayTeamId = teamIdMap.get(g.visitor_team.id);

      if (!homeTeamId || !awayTeamId) {
        skipped.push(g.id);
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
          game_date_utc: g.datetime ? new Date(g.datetime).toISOString() : new Date(g.date).toISOString(),
          status: mapStatus(g.status),
          period: g.period || null,
          time: g.time || null,
          postseason: g.postseason ?? false,
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
