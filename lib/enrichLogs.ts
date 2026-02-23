import { supabase } from './supabase';
import type { GameLogWithGame, LogTag } from '@/types/database';

/**
 * Enriches game logs with like counts, liked-by-me status, and tags.
 */
export async function enrichLogs(
  logs: GameLogWithGame[],
  currentUserId: string,
): Promise<GameLogWithGame[]> {
  if (logs.length === 0) return logs;

  const logIds = logs.map((l) => l.id);

  const [likesRes, myLikesRes, tagMapRes, commentsRes] = await Promise.all([
    // Count likes per log
    supabase
      .from('likes')
      .select('log_id')
      .in('log_id', logIds),
    // Check which logs current user liked
    supabase
      .from('likes')
      .select('log_id')
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
  ]);

  // Build like count map
  const likeCountMap: Record<string, number> = {};
  for (const row of likesRes.data ?? []) {
    likeCountMap[row.log_id] = (likeCountMap[row.log_id] ?? 0) + 1;
  }

  // Build liked-by-me set
  const myLikedSet = new Set((myLikesRes.data ?? []).map((r) => r.log_id));

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
    liked_by_me: myLikedSet.has(l.id),
    tags: tagsMap[l.id] ?? [],
    comment_count: commentCountMap[l.id] ?? 0,
  }));
}
