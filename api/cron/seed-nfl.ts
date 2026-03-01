import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const ESPN_NFL_BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

const NFL_WEEK_TO_ROUND: Record<number, string> = {
  1: 'wild_card',
  2: 'divisional',
  3: 'conf_championship',
  4: 'super_bowl',
  5: 'super_bowl',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapStatus(statusDetail: string): 'scheduled' | 'live' | 'final' {
  const s = statusDetail.toLowerCase();
  if (s.includes('final')) return 'final';
  if (s.includes('in progress') || /\d(st|nd|rd|th)/.test(s) || s.includes('halftime') || s.includes('overtime')) {
    return 'live';
  }
  return 'scheduled';
}

function getCurrentNflSeasonYear(): number {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-indexed
  const year = now.getFullYear();
  // NFL season starts in September — Sep-Dec belongs to current year's season
  // Jan-Aug belongs to previous year's season
  return month >= 9 ? year : year - 1;
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
    // 1. Load NFL team map: provider_team_id → internal UUID
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('id, provider_team_id')
      .eq('sport', 'nfl')
      .returns<{ id: string; provider_team_id: number }[]>();

    if (teamsErr) {
      return res.status(500).json({ error: `Failed to load NFL teams: ${teamsErr.message}` });
    }

    const teamIdMap = new Map<number, string>();
    for (const row of teams ?? []) {
      teamIdMap.set(row.provider_team_id, row.id);
    }

    if (teamIdMap.size === 0) {
      return res.status(500).json({ error: 'No NFL teams in DB. Run NFL seed first.' });
    }

    // 2. Ensure current NFL season exists
    const seasonYear = getCurrentNflSeasonYear();
    const { data: seasonData, error: seasonErr } = await supabase
      .from('seasons')
      .upsert({ year: seasonYear, type: 'regular', sport: 'nfl' }, { onConflict: 'sport,year' })
      .select('id')
      .returns<{ id: string }[]>()
      .single();

    if (seasonErr) {
      return res.status(500).json({ error: `Season upsert failed: ${seasonErr.message}` });
    }

    const seasonId = seasonData!.id;

    // 3. Fetch this week's NFL games from ESPN
    const espnRes = await fetch(`${ESPN_NFL_BASE}/scoreboard`, {
      headers: { 'User-Agent': 'know-ball/1.0' },
    });

    if (!espnRes.ok) {
      return res.status(502).json({ error: `ESPN API error ${espnRes.status}` });
    }

    const espnData = await espnRes.json();
    const events = espnData.events ?? [];

    if (events.length === 0) {
      return res.status(200).json({ message: 'No NFL games this week', upserted: 0 });
    }

    // 4. Map to DB rows
    const skipped: string[] = [];
    const rows = events.flatMap((event: any) => {
      const comp = event.competitions?.[0];
      if (!comp) return [];

      const home = comp.competitors?.find((c: any) => c.homeAway === 'home');
      const away = comp.competitors?.find((c: any) => c.homeAway === 'away');
      if (!home || !away) return [];

      const homeTeamId = teamIdMap.get(parseInt(home.team.id, 10));
      const awayTeamId = teamIdMap.get(parseInt(away.team.id, 10));

      if (!homeTeamId || !awayTeamId) {
        skipped.push(event.id);
        return [];
      }

      const statusDetail = comp.status?.type?.detail ?? '';
      const isPostseason = (event.season?.type ?? 0) === 3;
      const weekNumber: number = event.week?.number ?? 0;
      const playoffRound = isPostseason ? (NFL_WEEK_TO_ROUND[weekNumber] ?? null) : null;

      // Extract broadcast info
      const broadcast: string | null =
        comp.geoBroadcasts?.[0]?.media?.shortName ??
        comp.broadcasts?.[0]?.names?.[0] ??
        null;

      // Extract team records
      const homeRecord: string | null = home.records?.[0]?.summary ?? null;
      const awayRecord: string | null = away.records?.[0]?.summary ?? null;

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
        postseason: isPostseason,
        playoff_round: playoffRound,
        sport: 'nfl' as const,
        week: weekNumber || null,
        broadcast,
        home_team_record: homeRecord,
        away_team_record: awayRecord,
      }];
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
      season: seasonYear,
      upserted: rows.length,
      skipped: skipped.length,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message ?? 'Unknown error' });
  }
}
