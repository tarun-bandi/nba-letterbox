import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { UserPlus, Users } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { useToastStore } from '@/lib/store/toastStore';
import Avatar from '@/components/Avatar';
import TeamLogo from '@/components/TeamLogo';
import PlayoffBadge from '@/components/PlayoffBadge';
import { DiscoverSkeleton } from '@/components/Skeleton';
import { PageContainer } from '@/components/PageContainer';
import FindFriendsSheet from '@/components/FindFriendsSheet';
import type { GameWithTeams, UserProfile, LogTag } from '@/types/database';

interface MostLoggedGame {
  game: GameWithTeams;
  logCount: number;
}

interface PopularUser {
  profile: UserProfile;
  logCount: number;
}

interface SuggestedUser {
  profile: UserProfile;
  logCount: number;
}

interface TrendingTag {
  tag: LogTag;
  count: number;
}

interface DiscoverData {
  mostLogged: MostLoggedGame[];
  popularUsers: PopularUser[];
  suggestedUsers: SuggestedUser[];
  trendingTags: TrendingTag[];
  followingCount: number;
}

async function fetchDiscover(userId: string): Promise<DiscoverData> {
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Fetch recent logs, follows, and tag usage in parallel
  const [recentLogsRes, followsRes, tagMapRes] = await Promise.all([
    supabase
      .from('game_logs')
      .select('game_id, rating, user_id')
      .gte('logged_at', sevenDaysAgo),
    supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId),
    supabase
      .from('game_log_tag_map')
      .select('tag_id, log:game_logs!inner(logged_at)')
      .gte('log.logged_at', sevenDaysAgo),
  ]);

  if (recentLogsRes.error) throw recentLogsRes.error;

  const recentLogs = recentLogsRes.data ?? [];
  const followedIds = new Set((followsRes.data ?? []).map((f) => f.following_id));

  // Aggregate: count logs per game
  const gameStats: Record<string, { count: number }> = {};
  const userLogCount: Record<string, number> = {};

  for (const log of recentLogs) {
    if (!gameStats[log.game_id]) {
      gameStats[log.game_id] = { count: 0 };
    }
    gameStats[log.game_id].count++;
    userLogCount[log.user_id] = (userLogCount[log.user_id] ?? 0) + 1;
  }

  // Most logged games (top 5)
  const mostLoggedIds = Object.entries(gameStats)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([id]) => id);

  // Popular users (top 5 by log count this week)
  const popularUserIds = Object.entries(userLogCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  // Suggested users: most logs, not followed, not self
  const suggestedUserIds = Object.entries(userLogCount)
    .filter(([id]) => id !== userId && !followedIds.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  // Trending tags
  const tagCountMap: Record<string, number> = {};
  for (const row of (tagMapRes.data ?? []) as any[]) {
    tagCountMap[row.tag_id] = (tagCountMap[row.tag_id] ?? 0) + 1;
  }
  const topTagIds = Object.entries(tagCountMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Fetch game details and profiles in parallel
  const allGameIds = [...new Set(mostLoggedIds)];
  const allUserIds = [...new Set([...popularUserIds, ...suggestedUserIds])];
  const tagIds = topTagIds.map(([id]) => id);

  const [gamesRes, profilesRes, tagsRes] = await Promise.all([
    allGameIds.length > 0
      ? supabase
          .from('games')
          .select(`
            *,
            home_team:teams!games_home_team_id_fkey (*),
            away_team:teams!games_away_team_id_fkey (*),
            season:seasons (*)
          `)
          .in('id', allGameIds)
      : Promise.resolve({ data: [], error: null }),
    allUserIds.length > 0
      ? supabase
          .from('user_profiles')
          .select('*')
          .in('user_id', allUserIds)
      : Promise.resolve({ data: [], error: null }),
    tagIds.length > 0
      ? supabase.from('log_tags').select('*').in('id', tagIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const gameMap: Record<string, GameWithTeams> = {};
  for (const g of (gamesRes.data ?? []) as any[]) {
    gameMap[g.id] = g;
  }

  const profileMap: Record<string, UserProfile> = {};
  for (const p of (profilesRes.data ?? []) as UserProfile[]) {
    profileMap[p.user_id] = p;
  }

  const tagMap: Record<string, LogTag> = {};
  for (const t of (tagsRes.data ?? []) as LogTag[]) {
    tagMap[t.id] = t;
  }

  const mostLogged: MostLoggedGame[] = mostLoggedIds
    .filter((id) => gameMap[id])
    .map((id) => ({
      game: gameMap[id],
      logCount: gameStats[id].count,
    }));

  const popularUsers: PopularUser[] = popularUserIds
    .filter((id) => profileMap[id])
    .map((id) => ({
      profile: profileMap[id],
      logCount: userLogCount[id],
    }));

  const suggestedUsers: SuggestedUser[] = suggestedUserIds
    .filter((id) => profileMap[id])
    .map((id) => ({
      profile: profileMap[id],
      logCount: userLogCount[id],
    }));

  const trendingTags: TrendingTag[] = topTagIds
    .filter(([id]) => tagMap[id])
    .map(([id, count]) => ({
      tag: tagMap[id],
      count,
    }));

  return {
    mostLogged,
    popularUsers,
    suggestedUsers,
    trendingTags,
    followingCount: followedIds.size,
  };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function DiscoverScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const toast = useToastStore();
  const queryClient = useQueryClient();
  const [showFindFriends, setShowFindFriends] = useState(false);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['discover', user?.id],
    queryFn: () => fetchDiscover(user!.id),
    enabled: !!user,
  });

  const followMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!user) return;
      const { error } = await supabase.from('follows').insert({
        follower_id: user.id,
        following_id: targetUserId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      queryClient.invalidateQueries({ queryKey: ['discover'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      toast.show('Followed!');
    },
  });

  if (isLoading) {
    return <DiscoverSkeleton />;
  }

  if (error || !data) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-accent-red text-center">
          Failed to load discover. Pull to refresh.
        </Text>
      </View>
    );
  }

  const { mostLogged, popularUsers, suggestedUsers, trendingTags, followingCount } = data;
  const showSuggestions = suggestedUsers.length > 0 && followingCount < 3;

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
      {/* Find Friends */}
      <View className="px-4 pt-4">
        <TouchableOpacity
          className="bg-accent/10 border border-accent/30 rounded-xl p-4 flex-row items-center gap-3"
          onPress={() => setShowFindFriends(true)}
          activeOpacity={0.7}
        >
          <Users size={20} color="#c9a84c" />
          <View className="flex-1">
            <Text className="text-white font-semibold">Find Friends</Text>
            <Text className="text-muted text-xs mt-0.5">See who from your contacts is on NBA Letterbox</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* People to Follow */}
      {showSuggestions && (
        <View className="px-4 pt-4">
          <Text className="text-white text-lg font-bold mb-3">
            People to Follow
          </Text>
          {suggestedUsers.map((item) => (
            <View
              key={item.profile.user_id}
              className="bg-surface border border-border rounded-xl p-4 mb-2 flex-row items-center gap-3"
            >
              <TouchableOpacity
                className="flex-row items-center gap-3 flex-1"
                onPress={() => router.push(`/user/${item.profile.handle}`)}
                activeOpacity={0.7}
              >
                <Avatar
                  url={item.profile.avatar_url}
                  name={item.profile.display_name}
                  size={40}
                />
                <View className="flex-1">
                  <Text className="text-white font-semibold">
                    {item.profile.display_name}
                  </Text>
                  <Text className="text-muted text-sm">
                    {item.logCount} {item.logCount === 1 ? 'log' : 'logs'} this week
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-accent rounded-full px-3 py-1.5 flex-row items-center gap-1"
                onPress={() => followMutation.mutate(item.profile.user_id)}
                disabled={followMutation.isPending}
                activeOpacity={0.7}
              >
                <UserPlus size={14} color="#0a0a0a" />
                <Text className="text-background text-xs font-semibold">Follow</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Trending Tags */}
      {trendingTags.length > 0 && (
        <View className="px-4 pt-4">
          <Text className="text-white text-lg font-bold mb-3">
            Trending Tags
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-2">
            {trendingTags.map((item) => (
              <TouchableOpacity
                key={item.tag.id}
                className="bg-accent/10 border border-accent/30 rounded-full px-3 py-1.5"
                onPress={() => router.push(`/tag/${item.tag.slug}`)}
                activeOpacity={0.7}
              >
                <Text className="text-accent text-sm font-medium">
                  {item.tag.name} ({item.count})
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Most Logged This Week */}
      <View className="px-4 pt-4">
        <Text className="text-white text-lg font-bold mb-3">
          Most Logged This Week
        </Text>
        {mostLogged.length === 0 ? (
          <View className="items-center py-4 mb-4">
            <Text style={{ fontSize: 32 }} className="mb-1">📊</Text>
            <Text className="text-muted text-sm">No activity this week yet</Text>
          </View>
        ) : (
          mostLogged.map((item, idx) => (
            <TouchableOpacity
              key={item.game.id}
              className="bg-surface border border-border rounded-xl p-4 mb-2"
              onPress={() => router.push(`/game/${item.game.id}`)}
              activeOpacity={0.7}
            >
              <View className="flex-row justify-between items-center">
                <View className="flex-row items-center gap-2">
                  <Text className="text-muted text-sm font-bold w-5">{idx + 1}</Text>
                  <TeamLogo abbreviation={item.game.away_team.abbreviation} sport={item.game.sport ?? 'nba'} size={22} />
                  <Text className="text-white font-semibold">
                    {item.game.away_team.abbreviation}
                  </Text>
                  <Text className="text-muted">@</Text>
                  <TeamLogo abbreviation={item.game.home_team.abbreviation} sport={item.game.sport ?? 'nba'} size={22} />
                  <Text className="text-white font-semibold">
                    {item.game.home_team.abbreviation}
                  </Text>
                  {item.game.playoff_round && <PlayoffBadge round={item.game.playoff_round} sport={item.game.sport ?? 'nba'} />}
                </View>
                <Text className="text-accent text-sm font-medium">
                  {item.logCount} {item.logCount === 1 ? 'log' : 'logs'}
                </Text>
              </View>
              <Text className="text-muted text-xs mt-1 ml-7">
                {formatDate(item.game.game_date_utc)}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Popular Reviewers */}
      <View className="px-4 pt-4 pb-8">
        <Text className="text-white text-lg font-bold mb-3">
          Active Reviewers
        </Text>
        {popularUsers.length === 0 ? (
          <View className="items-center py-4">
            <Text style={{ fontSize: 32 }} className="mb-1">📊</Text>
            <Text className="text-muted text-sm">No active reviewers this week</Text>
          </View>
        ) : (
          popularUsers.map((item) => (
            <TouchableOpacity
              key={item.profile.user_id}
              className="bg-surface border border-border rounded-xl p-4 mb-2 flex-row items-center gap-3"
              onPress={() => router.push(`/user/${item.profile.handle}`)}
              activeOpacity={0.7}
            >
              <Avatar
                url={item.profile.avatar_url}
                name={item.profile.display_name}
                size={40}
              />
              <View className="flex-1">
                <Text className="text-white font-semibold">
                  {item.profile.display_name}
                </Text>
                <Text className="text-muted text-sm">@{item.profile.handle}</Text>
              </View>
              <Text className="text-accent text-sm font-medium">
                {item.logCount} {item.logCount === 1 ? 'log' : 'logs'}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>
      {showFindFriends && (
        <FindFriendsSheet onClose={() => setShowFindFriends(false)} />
      )}
      </PageContainer>
    </ScrollView>
  );
}
