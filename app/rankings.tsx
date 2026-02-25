import { View, Text, TouchableOpacity, RefreshControl } from 'react-native';
import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Trophy, Heart, GripVertical, Share2 } from 'lucide-react-native';
import { useAuthStore } from '@/lib/store/authStore';
import { fetchRankedList, moveGameRanking, type RankedGame } from '@/lib/rankingService';
import { deriveScore, formatScore, MIN_RANKED_FOR_SCORE } from '@/lib/ranking';
import TeamLogo from '@/components/TeamLogo';
import PlayoffBadge from '@/components/PlayoffBadge';
import ErrorState from '@/components/ErrorState';
import { PageContainer } from '@/components/PageContainer';
import RankingsShareCard from '@/components/RankingsShareCard';
import DraggableFlatList, {
  type RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

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

  const showScores = totalCount >= MIN_RANKED_FOR_SCORE;
  const shareCardRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (!data || data.length === 0 || !shareCardRef.current) return;
    setIsSharing(true);
    try {
      const uri = await captureRef(shareCardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Sharing.shareAsync(uri, { mimeType: 'image/png' });
    } catch (err) {
      console.warn('Share failed:', err);
    } finally {
      setIsSharing(false);
    }
  }, [data]);

  const handleDragEnd = async ({ data: reordered, from, to }: { data: RankedGame[]; from: number; to: number }) => {
    if (from === to || !user) return;

    const movedItem = reordered[to];
    const newPosition = to + 1; // 1-indexed

    // Optimistic update — rewrite positions in the cache
    const updated = reordered.map((item, idx) => ({ ...item, position: idx + 1 }));
    queryClient.setQueryData(['rankings', user.id], updated);

    try {
      await moveGameRanking(user.id, movedItem.game_id, newPosition);
    } catch {
      // Revert on failure
      queryClient.invalidateQueries({ queryKey: ['rankings', user.id] });
    }
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<RankedGame>) => {
    const score = showScores ? deriveScore(item.position, totalCount, item.fan_of) : 0;
    const game = item.game;

    return (
      <ScaleDecorator>
        <TouchableOpacity
          className="bg-surface border border-border rounded-2xl px-4 py-3 mb-2 flex-row items-center"
          onPress={() => router.push(`/game/${item.game_id}`)}
          onLongPress={drag}
          disabled={isActive}
          activeOpacity={0.7}
          style={isActive ? { opacity: 0.9, shadowColor: '#c9a84c', shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 } : undefined}
        >
          {/* Drag handle */}
          <View className="mr-1 opacity-40">
            <GripVertical size={16} color="#888" />
          </View>

          {/* Position */}
          <View className="w-10 items-center mr-3">
            <Text className="text-white font-bold text-lg">
              {item.position}
            </Text>
          </View>

          {/* Game info */}
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <TeamLogo abbreviation={game.away_team.abbreviation} sport={game.sport ?? 'nba'} size={20} />
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
              <TeamLogo abbreviation={game.home_team.abbreviation} sport={game.sport ?? 'nba'} size={20} />
            </View>
            <View className="flex-row items-center gap-2 mt-1">
              <Text className="text-muted text-xs">
                {formatDate(game.game_date_utc)}
              </Text>
              {game.playoff_round && (
                <PlayoffBadge round={game.playoff_round} sport={game.sport ?? 'nba'} />
              )}
            </View>
          </View>

          {/* Score */}
          {showScores && (
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
          )}
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <DraggableFlatList
        containerStyle={{ backgroundColor: '#0a0a0a' }}
        data={data ?? []}
        keyExtractor={(item) => item.game_id}
        renderItem={renderItem}
        onDragEnd={handleDragEnd}
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
            <View className="mb-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <Trophy size={18} color="#c9a84c" />
                  <Text className="text-white font-semibold text-base">
                    {totalCount} Ranked Games
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleShare}
                  disabled={isSharing}
                  className="flex-row items-center gap-1.5 bg-surface border border-border rounded-full px-3 py-1.5"
                  activeOpacity={0.7}
                >
                  <Share2 size={14} color="#c9a84c" />
                  <Text className="text-accent text-xs font-medium">
                    {isSharing ? 'Saving...' : 'Share Top 10'}
                  </Text>
                </TouchableOpacity>
              </View>
              {!showScores && (
                <Text className="text-muted text-sm mt-2">
                  Rank {MIN_RANKED_FOR_SCORE - totalCount} more game{MIN_RANKED_FOR_SCORE - totalCount !== 1 ? 's' : ''} to see scores
                </Text>
              )}
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
      {/* Hidden share card for capture — use opacity:0 so it stays rendered */}
      {data && data.length > 0 && (
        <View style={{ position: 'absolute', opacity: 0 }} pointerEvents="none" collapsable={false}>
          <RankingsShareCard ref={shareCardRef} games={data} />
        </View>
      )}
    </GestureHandlerRootView>
  );
}
