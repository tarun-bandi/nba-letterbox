import { View, Text, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import TeamLogo from '@/components/TeamLogo';
import PlayoffBadge from '@/components/PlayoffBadge';
import ErrorState from '@/components/ErrorState';
import type { GameWithTeams } from '@/types/database';
import { PageContainer } from '@/components/PageContainer';

interface WatchlistItem {
  game: GameWithTeams;
  created_at: string;
}

async function fetchWatchlist(userId: string): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from('watchlist')
    .select(`
      created_at,
      game:games (
        *,
        home_team:teams!games_home_team_id_fkey (*),
        away_team:teams!games_away_team_id_fkey (*),
        season:seasons (*)
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return ((data ?? []) as any[])
    .filter((r) => r.game)
    .map((r) => ({ game: r.game as GameWithTeams, created_at: r.created_at }));
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function WatchlistScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['watchlist', user?.id],
    queryFn: () => fetchWatchlist(user!.id),
    enabled: !!user,
  });

  const removeMutation = useMutation({
    mutationFn: async (gameId: string) => {
      const { error } = await supabase
        .from('watchlist')
        .delete()
        .eq('user_id', user!.id)
        .eq('game_id', gameId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  function handleRemove(gameId: string) {
    Alert.alert('Remove', 'Remove this game from your watchlist?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeMutation.mutate(gameId),
      },
    ]);
  }

  if (error) {
    return <ErrorState message="Failed to load watchlist" onRetry={refetch} />;
  }

  const items = data ?? [];

  return (
    <View className="flex-1 bg-background">
      <PageContainer className="flex-1">
      <FlatList
        data={items}
        keyExtractor={(item) => item.game.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            className="mx-4 my-1 bg-surface border border-border rounded-xl p-4"
            onPress={() => router.push(`/game/${item.game.id}`)}
            activeOpacity={0.7}
          >
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center gap-2 flex-1">
                <TeamLogo abbreviation={item.game.away_team.abbreviation} size={24} />
                <Text className="text-white font-semibold text-base">
                  {item.game.away_team.abbreviation}
                </Text>
                <Text className="text-muted font-semibold text-base">@</Text>
                <TeamLogo abbreviation={item.game.home_team.abbreviation} size={24} />
                <Text className="text-white font-semibold text-base">
                  {item.game.home_team.abbreviation}
                </Text>
                {item.game.playoff_round && (
                  <PlayoffBadge round={item.game.playoff_round} />
                )}
              </View>
              <View className="flex-row items-center gap-3">
                <Text className="text-muted text-sm">
                  {item.game.home_team_score !== null
                    ? `${item.game.away_team_score}–${item.game.home_team_score}`
                    : item.game.status}
                </Text>
                <TouchableOpacity
                  onPress={() => handleRemove(item.game.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Trash2 size={16} color="#e63946" />
                </TouchableOpacity>
              </View>
            </View>
            <Text className="text-muted text-sm mt-1">
              {formatDate(item.game.game_date_utc)}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <View className="flex-1 items-center justify-center pt-16">
              <Text style={{ fontSize: 48 }} className="mb-3">
                {'\u{1F516}'}
              </Text>
              <Text className="text-white text-lg font-semibold mb-2">
                No bookmarked games
              </Text>
              <Text className="text-muted text-center px-6">
                Bookmark games from the game detail page to watch later.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={
          items.length === 0
            ? { flex: 1 }
            : { paddingVertical: 8 }
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#e5e5e5"
          />
        }
        showsVerticalScrollIndicator={false}
      />
      </PageContainer>
    </View>
  );
}
