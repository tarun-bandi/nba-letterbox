import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  fetchTodaysGamesFromBDL,
  mapStatus,
  formatLiveStatus,
  type BdlGame,
} from '@/lib/balldontlie';
import type { GameWithTeams } from '@/types/database';

function getTodayDateStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Polls the BallDontLie API every 60s when there are live or scheduled games.
 * Updates Supabase with fresh scores/status, then invalidates the todays-games query.
 *
 * Returns a map of provider_game_id → live status label for the UI.
 */
export function useLiveScores(games: GameWithTeams[] | undefined) {
  const queryClient = useQueryClient();

  const hasActiveGames = (games ?? []).some(
    (g) => g.status === 'live' || g.status === 'scheduled',
  );

  return useQuery({
    queryKey: ['live-scores', getTodayDateStr()],
    queryFn: async (): Promise<Map<number, string | null>> => {
      const bdlGames = await fetchTodaysGamesFromBDL();
      if (bdlGames.length === 0) return new Map();

      // Build map of provider_game_id → BDL game data
      const bdlMap = new Map<number, BdlGame>();
      for (const g of bdlGames) {
        bdlMap.set(g.id, g);
      }

      // Find games that need updating
      const updates: Array<{
        provider_game_id: number;
        home_team_score: number;
        away_team_score: number;
        status: 'scheduled' | 'live' | 'final';
        period: number;
        time: string;
      }> = [];

      const statusLabels = new Map<number, string | null>();

      for (const game of games ?? []) {
        const bdl = bdlMap.get(game.provider_game_id);
        if (!bdl) continue;

        const newStatus = mapStatus(bdl.status);
        statusLabels.set(
          game.provider_game_id,
          formatLiveStatus(bdl.status, bdl.period, bdl.time),
        );

        // Only update if something changed
        const changed =
          game.status !== newStatus ||
          game.home_team_score !== bdl.home_team_score ||
          game.away_team_score !== bdl.visitor_team_score ||
          game.period !== bdl.period ||
          game.time !== bdl.time;

        if (changed) {
          updates.push({
            provider_game_id: bdl.id,
            home_team_score: bdl.home_team_score,
            away_team_score: bdl.visitor_team_score,
            status: newStatus,
            period: bdl.period,
            time: bdl.time,
          });
        }
      }

      // Batch update Supabase
      if (updates.length > 0) {
        await Promise.all(
          updates.map((u) =>
            supabase
              .from('games')
              .update({
                home_team_score: u.home_team_score,
                away_team_score: u.away_team_score,
                status: u.status,
                period: u.period,
                time: u.time,
              })
              .eq('provider_game_id', u.provider_game_id),
          ),
        );

        // Invalidate so TodaysGames refetches from Supabase
        queryClient.invalidateQueries({
          queryKey: ['todays-games'],
        });
      }

      return statusLabels;
    },
    enabled: hasActiveGames,
    refetchInterval: hasActiveGames ? 60_000 : false,
    // Don't show stale data from a previous day
    staleTime: 0,
  });
}
