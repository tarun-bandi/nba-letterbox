import { supabase } from './supabase';
import type { GameWithTeams } from '@/types/database';
import type { ComparisonGame } from './ranking';

export interface RankedGame {
  game_id: string;
  position: number;
  game: GameWithTeams;
}

/** Fetch the user's full ranked list with game details, ordered by position */
export async function fetchRankedList(userId: string): Promise<RankedGame[]> {
  const { data, error } = await supabase
    .from('game_rankings')
    .select(`
      game_id,
      position,
      game:games (
        *,
        home_team:teams!games_home_team_id_fkey (*),
        away_team:teams!games_away_team_id_fkey (*),
        season:seasons (*)
      )
    `)
    .eq('user_id', userId)
    .order('position', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as RankedGame[];
}

/** Fetch just the ranked game count for a user */
export async function fetchRankedCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('game_rankings')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) throw error;
  return count ?? 0;
}

/** Fetch ranking for a specific game (or null if not ranked) */
export async function fetchGameRanking(
  userId: string,
  gameId: string,
): Promise<{ position: number; total: number } | null> {
  const [rankingRes, countRes] = await Promise.all([
    supabase
      .from('game_rankings')
      .select('position')
      .eq('user_id', userId)
      .eq('game_id', gameId)
      .maybeSingle(),
    supabase
      .from('game_rankings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  if (rankingRes.error) throw rankingRes.error;
  if (!rankingRes.data) return null;

  return {
    position: rankingRes.data.position,
    total: countRes.count ?? 0,
  };
}

/** Insert a game at a given position (1-indexed). Calls the RPC to shift others. */
export async function insertGameRanking(
  userId: string,
  gameId: string,
  position: number,
): Promise<void> {
  const { error } = await supabase.rpc('insert_game_ranking', {
    p_user_id: userId,
    p_game_id: gameId,
    p_position: position,
  });
  if (error) throw error;
}

/** Remove a game ranking. Calls the RPC to shift others up. */
export async function removeGameRanking(
  userId: string,
  gameId: string,
): Promise<void> {
  const { error } = await supabase.rpc('remove_game_ranking', {
    p_user_id: userId,
    p_game_id: gameId,
  });
  if (error) throw error;
}

/** Fetch comparison games: a subset of the ranked list for the binary search */
export async function fetchComparisonGames(
  userId: string,
): Promise<ComparisonGame[]> {
  const list = await fetchRankedList(userId);
  return list.map((r) => ({
    id: r.game_id,
    game: r.game,
  }));
}

/** Batch fetch rankings for a list of game IDs (for enriching logs) */
export async function fetchRankingsForGames(
  userId: string,
  gameIds: string[],
): Promise<Record<string, { position: number; total: number }>> {
  if (gameIds.length === 0) return {};

  const [rankingsRes, countRes] = await Promise.all([
    supabase
      .from('game_rankings')
      .select('game_id, position')
      .eq('user_id', userId)
      .in('game_id', gameIds),
    supabase
      .from('game_rankings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  if (rankingsRes.error) throw rankingsRes.error;

  const total = countRes.count ?? 0;
  const result: Record<string, { position: number; total: number }> = {};
  for (const row of rankingsRes.data ?? []) {
    result[row.game_id] = { position: row.position, total };
  }
  return result;
}
