import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { getProvider } from '@/lib/providers';
import type { GameWithTeams, Sport } from '@/types/database';

function getTodayDateStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export interface LiveGameData {
  status: 'scheduled' | 'live' | 'final';
  label: string | null;
  homeScore: number;
  awayScore: number;
}

/**
 * Polls each sport's provider every 60s when there are live or scheduled games.
 * Updates Supabase with fresh scores/status, then invalidates the todays-games query.
 *
 * Returns a map of provider_game_id → live game data for direct UI use.
 */
export function useLiveScores(games: GameWithTeams[] | undefined) {
  const queryClient = useQueryClient();

  const hasActiveGames = (games ?? []).some(
    (g) => g.status === 'live' || g.status === 'scheduled',
  );

  return useQuery({
    queryKey: ['live-scores', getTodayDateStr()],
    queryFn: async (): Promise<Map<number, LiveGameData>> => {
      const allGames = games ?? [];
      if (allGames.length === 0) return new Map();

      // Group games by sport
      const sportGroups = new Map<Sport, GameWithTeams[]>();
      for (const g of allGames) {
        const sport = g.sport ?? 'nba';
        if (!sportGroups.has(sport)) sportGroups.set(sport, []);
        sportGroups.get(sport)!.push(g);
      }

      const liveMap = new Map<number, LiveGameData>();
      const updates: Array<{
        provider_game_id: number;
        home_team_score: number;
        away_team_score: number;
        status: 'scheduled' | 'live' | 'final';
        period: number;
        time: string;
      }> = [];

      // Poll each sport provider in parallel
      await Promise.all(
        Array.from(sportGroups.entries()).map(async ([sport, sportGames]) => {
          const provider = getProvider(sport);
          const providerGames = await provider.fetchTodaysGames();
          if (providerGames.length === 0) return;

          // Build map of provider_game_id → provider game data
          const providerMap = new Map<number, typeof providerGames[0]>();
          for (const g of providerGames) {
            providerMap.set(typeof g.id === 'number' ? g.id : parseInt(g.id as string, 10), g);
          }

          for (const game of sportGames) {
            const pg = providerMap.get(game.provider_game_id);
            if (!pg) continue;

            const newStatus = provider.mapStatus(pg.status);
            liveMap.set(game.provider_game_id, {
              status: newStatus,
              label: provider.formatLiveStatus(pg.status, pg.period, pg.clock),
              homeScore: pg.homeScore,
              awayScore: pg.awayScore,
            });

            const changed =
              game.status !== newStatus ||
              game.home_team_score !== pg.homeScore ||
              game.away_team_score !== pg.awayScore ||
              game.period !== pg.period ||
              game.time !== pg.clock;

            if (changed) {
              updates.push({
                provider_game_id: typeof pg.id === 'number' ? pg.id : parseInt(pg.id as string, 10),
                home_team_score: pg.homeScore,
                away_team_score: pg.awayScore,
                status: newStatus,
                period: pg.period,
                time: pg.clock,
              });
            }
          }
        }),
      );

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

        queryClient.invalidateQueries({
          queryKey: ['todays-games'],
        });
      }

      return liveMap;
    },
    enabled: hasActiveGames,
    refetchInterval: hasActiveGames ? 60_000 : false,
    staleTime: 0,
  });
}
