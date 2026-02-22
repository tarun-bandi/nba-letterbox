import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import GameCard from '@/components/GameCard';
import type { GameLogWithGame } from '@/types/database';

async function fetchFeed(userId: string): Promise<GameLogWithGame[]> {
  // 1. Get followed user IDs
  const { data: follows, error: followsError } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId);

  if (followsError) throw followsError;

  const followedIds = (follows ?? []).map((f) => f.following_id);
  // Include own logs too
  const userIds = [userId, ...followedIds];

  if (userIds.length === 0) return [];

  // 2. Fetch logs with game + team details
  const { data, error } = await supabase
    .from('game_logs')
    .select(`
      *,
      game:games (
        *,
        home_team:teams!games_home_team_id_fkey (*),
        away_team:teams!games_away_team_id_fkey (*),
        season:seasons (*)
      ),
      user_profile:user_profiles (*)
    `)
    .in('user_id', userIds)
    .order('logged_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as unknown as GameLogWithGame[];
}

export default function FeedScreen() {
  const { user } = useAuthStore();

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['feed', user?.id],
    queryFn: () => fetchFeed(user!.id),
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#c9a84c" size="large" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-accent-red text-center">
          Failed to load feed. Pull to refresh.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <GameCard log={item} showUser />}
        contentContainerStyle={
          data && data.length === 0
            ? { flex: 1, justifyContent: 'center', alignItems: 'center' }
            : { paddingVertical: 8 }
        }
        ListEmptyComponent={
          <View className="px-6 items-center">
            <Text className="text-white text-lg font-semibold mb-2">
              Nothing here yet
            </Text>
            <Text className="text-muted text-center">
              Follow other fans or search for a game to log your first entry.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#c9a84c"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
