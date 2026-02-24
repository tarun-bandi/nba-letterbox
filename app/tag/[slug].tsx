import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { enrichLogs } from '@/lib/enrichLogs';
import { useAuthStore } from '@/lib/store/authStore';
import GameCard from '@/components/GameCard';
import type { GameLogWithGame, LogTag } from '@/types/database';
import { PageContainer } from '@/components/PageContainer';

const PAGE_SIZE = 20;

interface TagPage {
  logs: GameLogWithGame[];
  tag: LogTag | null;
  nextOffset: number | null;
}

async function fetchTagPage(
  slug: string,
  userId: string,
  offset: number,
): Promise<TagPage> {
  // Get tag
  const { data: tag } = await supabase
    .from('log_tags')
    .select('*')
    .eq('slug', slug)
    .single();

  if (!tag) return { logs: [], tag: null, nextOffset: null };

  // Get log IDs with this tag
  const { data: tagMap } = await supabase
    .from('game_log_tag_map')
    .select('log_id')
    .eq('tag_id', tag.id);

  const logIds = (tagMap ?? []).map((t) => t.log_id);
  if (logIds.length === 0) return { logs: [], tag: tag as LogTag, nextOffset: null };

  // Get logs
  const { data: rawLogs } = await supabase
    .from('game_logs')
    .select(`
      *,
      game:games (
        *,
        home_team:teams!games_home_team_id_fkey (*),
        away_team:teams!games_away_team_id_fkey (*),
        season:seasons (*)
      )
    `)
    .in('id', logIds)
    .order('logged_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const logsTyped = (rawLogs ?? []) as unknown as GameLogWithGame[];

  // Fetch profiles
  const userIds = [...new Set(logsTyped.map((l) => l.user_id))];
  let profileMap: Record<string, any> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .in('user_id', userIds);
    for (const p of profiles ?? []) {
      profileMap[p.user_id] = p;
    }
  }

  const logsWithProfiles = logsTyped.map((l) => ({
    ...l,
    user_profile: profileMap[l.user_id] ?? undefined,
  }));

  const logs = await enrichLogs(logsWithProfiles, userId);

  return {
    logs,
    tag: tag as LogTag,
    nextOffset: logsTyped.length === PAGE_SIZE ? offset + PAGE_SIZE : null,
  };
}

export default function TagScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuthStore();

  const {
    data,
    isLoading,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['tag-feed', slug],
    queryFn: ({ pageParam = 0 }) => fetchTagPage(slug, user!.id, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    enabled: !!slug && !!user,
  });

  const allLogs = data?.pages.flatMap((p) => p.logs) ?? [];
  const tagName = data?.pages[0]?.tag?.name ?? slug;

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#c9a84c" size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <PageContainer className="flex-1">
      <View className="px-4 pt-4 pb-2">
        <Text className="text-white text-xl font-bold">#{tagName}</Text>
        <Text className="text-muted text-sm mt-1">
          {allLogs.length} {allLogs.length === 1 ? 'log' : 'logs'}
        </Text>
      </View>
      <FlatList
        data={allLogs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <GameCard log={item} showUser />}
        contentContainerStyle={
          allLogs.length === 0
            ? { flex: 1, justifyContent: 'center', alignItems: 'center' }
            : { paddingVertical: 8, paddingHorizontal: 16 }
        }
        ListEmptyComponent={
          <View className="items-center px-6">
            <Text style={{ fontSize: 40 }} className="mb-2">🏷️</Text>
            <Text className="text-muted text-sm">No logs with this tag yet</Text>
          </View>
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4">
              <ActivityIndicator color="#c9a84c" />
            </View>
          ) : null
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isFetchingNextPage}
            onRefresh={refetch}
            tintColor="#c9a84c"
          />
        }
        showsVerticalScrollIndicator={false}
      />
      </PageContainer>
    </View>
  );
}
