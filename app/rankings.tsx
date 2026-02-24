import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Trophy, Heart } from 'lucide-react-native';
import { useAuthStore } from '@/lib/store/authStore';
import { fetchRankedList, type RankedGame } from '@/lib/rankingService';
import { deriveScore, formatScore } from '@/lib/ranking';
import TeamLogo from '@/components/TeamLogo';
import PlayoffBadge from '@/components/PlayoffBadge';
import ErrorState from '@/components/ErrorState';
import { PageContainer } from '@/components/PageContainer';

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function RankingsScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['rankings', user?.id],
    queryFn: () => fetchRankedList(user!.id),
    enabled: !!user,
  });

  const totalCount = data?.length ?? 0;

  if (error) {
    return (
      <PageContainer>
        <ErrorState message="Failed to load rankings" onRetry={refetch} />
      </PageContainer>
    );
  }

  const renderItem = ({ item }: { item: RankedGame }) => {
    const score = deriveScore(item.position, totalCount, item.fan_of);
    const game = item.game;

    return (
      <TouchableOpacity
        className="bg-surface border border-border rounded-2xl px-4 py-3 mb-2 flex-row items-center"
        onPress={() => router.push(`/game/${item.game_id}`)}
        activeOpacity={0.7}
      >
        {/* Position */}
        <View className="w-10 items-center mr-3">
          <Text className="text-white font-bold text-lg">
            {item.position}
          </Text>
        </View>

        {/* Game info */}
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <TeamLogo abbreviation={game.away_team.abbreviation} size={20} />
            <Text className="text-white font-semibold text-sm">
              {game.away_team.abbreviation}
            </Text>
            {game.home_team_score !== null && (
              <Text className="text-muted text-sm">
                {game.away_team_score} - {game.home_team_score}
              </Text>
            )}
            <Text className="text-white font-semibold text-sm">
              {game.home_team.abbreviation}
            </Text>
            <TeamLogo abbreviation={game.home_team.abbreviation} size={20} />
          </View>
          <View className="flex-row items-center gap-2 mt-1">
            <Text className="text-muted text-xs">
              {formatDate(game.game_date_utc)}
            </Text>
            {game.playoff_round && (
              <PlayoffBadge round={game.playoff_round} />
            )}
          </View>
        </View>

        {/* Score */}
        <View className="items-end ml-3">
          <View className="flex-row items-center gap-1">
            <Text className="text-accent font-bold text-lg">
              {formatScore(score)}
            </Text>
            {item.fan_of && item.fan_of !== 'neutral' && (
              <Heart size={12} color="#c9a84c" fill="#c9a84c" />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(item) => item.game_id}
      renderItem={renderItem}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor="#c9a84c"
        />
      }
      ListHeaderComponent={
        totalCount > 0 ? (
          <View className="flex-row items-center gap-2 mb-4">
            <Trophy size={18} color="#c9a84c" />
            <Text className="text-white font-semibold text-base">
              {totalCount} Ranked Games
            </Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        isLoading ? null : (
          <View className="items-center py-20">
            <Trophy size={48} color="#6b7280" />
            <Text className="text-muted text-base mt-4 mb-2">No rankings yet</Text>
            <Text className="text-muted text-sm text-center px-8">
              After logging a game, you'll be prompted to rank it against your other games.
            </Text>
          </View>
        )
      }
    />
  );
}
