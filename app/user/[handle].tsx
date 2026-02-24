import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Share as RNShare,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, UserMinus, Share2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { enrichLogs } from '@/lib/enrichLogs';
import { useAuthStore } from '@/lib/store/authStore';
import { useToastStore } from '@/lib/store/toastStore';
import Avatar from '@/components/Avatar';
import ErrorState from '@/components/ErrorState';
import GameCard from '@/components/GameCard';
import FollowListModal from '@/components/FollowListModal';
import { userUrl } from '@/lib/urls';
import type { GameLogWithGame, UserProfile } from '@/types/database';
import { PageContainer } from '@/components/PageContainer';

interface PublicProfileData {
  profile: UserProfile;
  logs: GameLogWithGame[];
  stats: { count: number; avgRating: number | null };
  isFollowing: boolean;
  followerCount: number;
  followingCount: number;
  predictionAccuracy: { correct: number; total: number } | null;
}

async function fetchPublicProfile(
  handle: string,
  currentUserId: string,
): Promise<PublicProfileData> {
  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('*')
    .ilike('handle', handle)
    .single();

  if (profileError) throw profileError;

  const [logsRes, followRes, followerRes, followingRes] = await Promise.all([
    supabase
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
      .eq('user_id', profile.user_id)
      .order('logged_at', { ascending: false })
      .limit(20),
    supabase
      .from('follows')
      .select('follower_id')
      .eq('follower_id', currentUserId)
      .eq('following_id', profile.user_id)
      .maybeSingle(),
    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', profile.user_id),
    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', profile.user_id),
  ]);

  if (logsRes.error) throw logsRes.error;

  const rawLogs = (logsRes.data ?? []) as unknown as GameLogWithGame[];
  const logs = await enrichLogs(rawLogs, currentUserId);
  const ratings = logs.filter((l) => l.rating !== null).map((l) => l.rating!);
  const avgRating =
    ratings.length > 0
      ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) / 10
      : null;

  // Prediction accuracy
  let predictionAccuracy: { correct: number; total: number } | null = null;
  const { data: predictions } = await supabase
    .from('game_predictions')
    .select('predicted_winner_team_id, game:games (home_team_id, away_team_id, home_team_score, away_team_score, status)')
    .eq('user_id', profile.user_id);

  if (predictions && predictions.length > 0) {
    let correct = 0;
    let total = 0;
    for (const p of predictions as any[]) {
      if (!p.game || p.game.status !== 'final') continue;
      total++;
      const homeWon = (p.game.home_team_score ?? 0) > (p.game.away_team_score ?? 0);
      const winnerId = homeWon ? p.game.home_team_id : p.game.away_team_id;
      if (p.predicted_winner_team_id === winnerId) correct++;
    }
    if (total > 0) predictionAccuracy = { correct, total };
  }

  return {
    profile,
    logs,
    stats: { count: logs.length, avgRating },
    isFollowing: followRes.data !== null,
    followerCount: followerRes.count ?? 0,
    followingCount: followingRes.count ?? 0,
    predictionAccuracy,
  };
}

export default function UserProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { user } = useAuthStore();
  const toast = useToastStore();
  const queryClient = useQueryClient();
  const [showFollowList, setShowFollowList] = useState<'followers' | 'following' | null>(null);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['user-profile', handle],
    queryFn: () => fetchPublicProfile(handle, user!.id),
    enabled: !!handle && !!user,
  });

  const followMutation = useMutation({
    mutationFn: async (shouldFollow: boolean) => {
      if (!data || !user) return;
      if (shouldFollow) {
        const { error } = await supabase.from('follows').insert({
          follower_id: user.id,
          following_id: data.profile.user_id,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', data.profile.user_id);
        if (error) throw error;
      }
    },
    onSuccess: (_data, shouldFollow) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ['user-profile', handle] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      toast.show(shouldFollow ? `Following @${handle}` : `Unfollowed @${handle}`);
    },
  });

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#c9a84c" size="large" />
      </View>
    );
  }

  if (error || !data) {
    return <ErrorState message="User not found" onRetry={refetch} />;
  }

  const { profile, logs, stats, isFollowing, followerCount, followingCount, predictionAccuracy } = data;
  const isOwnProfile = user?.id === profile.user_id;

  return (
    <ScrollView
      className="flex-1 bg-background"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor="#c9a84c"
        />
      }
    >
      <PageContainer>
      {/* Header */}
      <View className="bg-surface border-b border-border px-6 py-6">
        <View className="flex-row justify-between items-start">
          <View className="flex-row items-center gap-3 flex-1">
            <Avatar
              url={profile.avatar_url}
              name={profile.display_name}
              size={64}
            />
            <View className="flex-1">
              <Text className="text-white text-2xl font-bold">
                {profile.display_name}
              </Text>
              <Text className="text-muted mt-0.5">@{profile.handle}</Text>
              {profile.bio ? (
                <Text className="text-white mt-2 text-sm">{profile.bio}</Text>
              ) : null}
              <Text className="text-muted text-xs mt-1">
                Joined {new Date(profile.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => {
              const url = userUrl(profile.handle);
              const message = `Check out @${profile.handle} on NBA Letterbox\n${url}`;
              RNShare.share(Platform.OS === 'ios' ? { message, url } : { message });
            }}
            className="p-2"
          >
            <Share2 size={20} color="#6b7280" />
          </TouchableOpacity>
          {!isOwnProfile && (
            <TouchableOpacity
              className={`flex-row items-center gap-1.5 px-4 py-2 rounded-full border ${
                isFollowing
                  ? 'border-border bg-surface'
                  : 'border-accent bg-accent'
              }`}
              onPress={() => followMutation.mutate(!isFollowing)}
              disabled={followMutation.isPending}
            >
              {followMutation.isPending ? (
                <ActivityIndicator
                  size="small"
                  color={isFollowing ? '#6b7280' : '#0a0a0a'}
                />
              ) : (
                <>
                  {isFollowing ? (
                    <UserMinus size={16} color="#6b7280" />
                  ) : (
                    <UserPlus size={16} color="#0a0a0a" />
                  )}
                  <Text
                    className={`text-sm font-medium ${
                      isFollowing ? 'text-muted' : 'text-background'
                    }`}
                  >
                    {isFollowing ? 'Unfollow' : 'Follow'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
          </View>
        </View>

        {/* Stats */}
        <View className="flex-row mt-4 gap-6">
          <View>
            <Text className="text-accent text-xl font-bold">{stats.count}</Text>
            <Text className="text-muted text-xs mt-0.5">Games</Text>
          </View>
          <View>
            <Text className="text-accent text-xl font-bold">
              {stats.avgRating !== null ? stats.avgRating.toFixed(1) : '—'}
            </Text>
            <Text className="text-muted text-xs mt-0.5">Avg Rating</Text>
          </View>
          <TouchableOpacity onPress={() => setShowFollowList('followers')}>
            <Text className="text-accent text-xl font-bold">{followerCount}</Text>
            <Text className="text-muted text-xs mt-0.5">Followers</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowFollowList('following')}>
            <Text className="text-accent text-xl font-bold">{followingCount}</Text>
            <Text className="text-muted text-xs mt-0.5">Following</Text>
          </TouchableOpacity>
          {predictionAccuracy && (
            <View>
              <Text className="text-accent text-xl font-bold">
                {Math.round((predictionAccuracy.correct / predictionAccuracy.total) * 100)}%
              </Text>
              <Text className="text-muted text-xs mt-0.5">Predictions</Text>
            </View>
          )}
        </View>
      </View>

      {/* Logs */}
      <View className="px-4 pt-4">
        <Text className="text-white font-semibold text-base mb-3">Logs</Text>
        {logs.length === 0 ? (
          <View className="items-center py-8">
            <Text className="text-muted">No games logged yet.</Text>
          </View>
        ) : (
          logs.map((log) => <GameCard key={log.id} log={log} />)
        )}
      </View>

      {showFollowList && (
        <FollowListModal
          userId={profile.user_id}
          mode={showFollowList}
          onClose={() => setShowFollowList(null)}
        />
      )}
      </PageContainer>
    </ScrollView>
  );
}
