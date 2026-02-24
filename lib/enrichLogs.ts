import { supabase } from './supabase';
import { fetchRankedCount } from './rankingService';
import type { GameLogWithGame, LogTag, ReactionType } from '@/types/database';

/**
 * Enriches game logs with reaction counts, user's reaction, tags, comment counts, and rank total.
 */
export async function enrichLogs(
  logs: GameLogWithGame[],
  currentUserId: string,
): Promise<GameLogWithGame[]> {
  if (logs.length === 0) return logs;

  const logIds = logs.map((l) => l.id);

  // Check if any of the current user's logs have a position (are ranked)
  const hasRankedLogs = logs.some((l) => l.user_id === currentUserId && l.position != null);

  const [likesRes, myLikesRes, tagMapRes, commentsRes, rankTotal] = await Promise.all([
    // Fetch all likes with reaction_type
    supabase
      .from('likes')
      .select('log_id, reaction_type')
      .in('log_id', logIds),
    // Fetch current user's reactions
    supabase
      .from('likes')
      .select('log_id, reaction_type')
      .eq('user_id', currentUserId)
      .in('log_id', logIds),
    // Fetch tags for these logs
    supabase
      .from('game_log_tag_map')
      .select('log_id, tag:log_tags (*)')
      .in('log_id', logIds),
    // Count comments per log
    supabase
      .from('comments')
      .select('log_id')
      .in('log_id', logIds),
    // Fetch rank total only if needed
    hasRankedLogs ? fetchRankedCount(currentUserId) : Promise.resolve(0),
  ]);

  // Build reaction count map and total like count map
  const reactionsMap: Record<string, Record<ReactionType, number>> = {};
  const likeCountMap: Record<string, number> = {};
  for (const row of likesRes.data ?? []) {
    const logId = row.log_id;
    likeCountMap[logId] = (likeCountMap[logId] ?? 0) + 1;
    if (!reactionsMap[logId]) reactionsMap[logId] = {} as Record<ReactionType, number>;
    const rt = (row.reaction_type ?? 'like') as ReactionType;
    reactionsMap[logId][rt] = (reactionsMap[logId][rt] ?? 0) + 1;
  }

  // Build my reaction map
  const myReactionMap: Record<string, ReactionType> = {};
  for (const row of myLikesRes.data ?? []) {
    myReactionMap[row.log_id] = (row.reaction_type ?? 'like') as ReactionType;
  }

  // Build tags map
  const tagsMap: Record<string, LogTag[]> = {};
  for (const row of (tagMapRes.data ?? []) as any[]) {
    if (!row.tag) continue;
    if (!tagsMap[row.log_id]) tagsMap[row.log_id] = [];
    tagsMap[row.log_id].push(row.tag);
  }

  // Build comment count map
  const commentCountMap: Record<string, number> = {};
  for (const row of commentsRes.data ?? []) {
    commentCountMap[row.log_id] = (commentCountMap[row.log_id] ?? 0) + 1;
  }

  return logs.map((l) => ({
    ...l,
    like_count: likeCountMap[l.id] ?? 0,
    liked_by_me: l.id in myReactionMap,
    reactions: reactionsMap[l.id] ?? {},
    my_reaction: myReactionMap[l.id] ?? null,
    tags: tagsMap[l.id] ?? [],
    comment_count: commentCountMap[l.id] ?? 0,
    rank_total: l.user_id === currentUserId && l.position != null ? rankTotal : undefined,
  }));
}
