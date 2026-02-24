import { supabase } from './supabase';
import type { GameWithTeams, Sentiment, FanOf } from '@/types/database';
import type { ComparisonGame } from './ranking';

export interface RankedGame {
  game_id: string;
  position: number;
  sentiment: Sentiment | null;
  fan_of: FanOf | null;
  game: GameWithTeams;
}

/** Fetch the user's full ranked list with game details, ordered by position */
export async function fetchRankedList(userId: string): Promise<RankedGame[]> {
  const { data, error } = await supabase
    .from('game_logs')
    .select(`
      game_id,
      position,
      sentiment,
      fan_of,
      game:games (
        *,
        home_team:teams!games_home_team_id_fkey (*),
        away_team:teams!games_away_team_id_fkey (*),
        season:seasons (*)
      )
    `)
    .eq('user_id', userId)
    .not('position', 'is', null)
    .order('position', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as RankedGame[];
}

/** Fetch just the ranked game count for a user */
export async function fetchRankedCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('game_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('position', 'is', null);

  if (error) throw error;
  return count ?? 0;
}

/** Fetch ranking for a specific game (or null if not ranked) */
export async function fetchGameRanking(
  userId: string,
  gameId: string,
): Promise<{ position: number; total: number; sentiment: Sentiment | null; fanOf: FanOf | null } | null> {
  const [rankingRes, countRes] = await Promise.all([
    supabase
      .from('game_logs')
      .select('position, sentiment, fan_of')
      .eq('user_id', userId)
      .eq('game_id', gameId)
      .not('position', 'is', null)
      .maybeSingle(),
    supabase
      .from('game_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('position', 'is', null),
  ]);

  if (rankingRes.error) throw rankingRes.error;
  if (!rankingRes.data) return null;

  return {
    position: rankingRes.data.position as number,
    total: countRes.count ?? 0,
    sentiment: rankingRes.data.sentiment as Sentiment | null,
    fanOf: rankingRes.data.fan_of as FanOf | null,
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

/** Update sentiment and fan_of on a game log row (called during ranking flow) */
export async function updateLogRankingMeta(
  userId: string,
  gameId: string,
  sentiment: Sentiment,
  fanOf: FanOf,
): Promise<void> {
  const { error } = await supabase
    .from('game_logs')
    .update({ sentiment, fan_of: fanOf, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('game_id', gameId);

  if (error) throw error;
}

/** Fetch user's favorite team IDs */
export async function fetchFavoriteTeamIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_favorite_teams')
    .select('team_id')
    .eq('user_id', userId);

  if (error) throw error;
  return (data ?? []).map((r) => r.team_id);
}
