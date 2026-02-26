import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Share as RNShare,
  Platform,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Settings, BarChart3, Share, Trophy } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { enrichLogs } from '@/lib/enrichLogs';
import { useAuthStore } from '@/lib/store/authStore';
import { useRouter } from 'expo-router';
import { Plus, Lock, Heart, Bookmark, ChevronRight } from 'lucide-react-native';
import Avatar from '@/components/Avatar';
import GameCard from '@/components/GameCard';
import EditProfileModal from '@/components/EditProfileModal';
import CreateListModal from '@/components/CreateListModal';
import FavoriteTeamsModal from '@/components/FavoriteTeamsModal';
import FavoritePlayersModal from '@/components/FavoritePlayersModal';
import FollowListModal from '@/components/FollowListModal';
import TeamLogo from '@/components/TeamLogo';
import PlayerAvatar from '@/components/PlayerAvatar';
import { ProfileSkeleton } from '@/components/Skeleton';
import ErrorState from '@/components/ErrorState';
import { PageContainer } from '@/components/PageContainer';
import { userUrl } from '@/lib/urls';
import type { GameLogWithGame, UserProfile, List, Team, Player } from '@/types/database';

interface ProfileData {
  profile: UserProfile;
  logs: GameLogWithGame[];
  stats: { count: number };
  lists: List[];
  favoriteTeams: Team[];
  favoritePlayers: (Player & { team: Team | null })[];
  followerCount: number;
  followingCount: number;
  watchlistCount: number;
  predictionAccuracy: { correct: number; total: number } | null;
}

async function fetchProfile(userId: string): Promise<ProfileData> {
  const [profileRes, logsRes, listsRes, favTeamsRes, favPlayersRes, followerRes, followingRes, watchlistRes] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single(),
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
      .eq('user_id', userId)
      .order('logged_at', { ascending: false })
      .limit(20),
    supabase
      .from('lists')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_favorite_teams')
      .select('team:teams (*)')
      .eq('user_id', userId),
    supabase
      .from('user_favorite_players')
      .select('player:players (*, team:teams (*))')
      .eq('user_id', userId),
    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId),
    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId),
    supabase
      .from('watchlist')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (logsRes.error) throw logsRes.error;
  if (listsRes.error) throw listsRes.error;

  const rawLogs = (logsRes.data ?? []) as unknown as GameLogWithGame[];
  const logs = await enrichLogs(rawLogs, userId);

  const favoriteTeams = ((favTeamsRes.data ?? []) as any[])
    .map((r) => r.team)
    .filter(Boolean) as Team[];

  const favoritePlayers = ((favPlayersRes.data ?? []) as any[])
    .map((r) => r.player)
    .filter(Boolean) as (Player & { team: Team | null })[];

  // Prediction accuracy
  let predictionAccuracy: { correct: number; total: number } | null = null;
  const { data: predictions } = await supabase
    .from('game_predictions')
    .select('predicted_winner_team_id, game:games (home_team_id, away_team_id, home_team_score, away_team_score, status)')
    .eq('user_id', userId);

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
    profile: profileRes.data,
    logs,
    stats: { count: logs.length },
    lists: (listsRes.data ?? []) as List[],
    favoriteTeams,
    favoritePlayers,
    followerCount: followerRes.count ?? 0,
    followingCount: followingRes.count ?? 0,
    watchlistCount: watchlistRes.count ?? 0,
    predictionAccuracy,
  };
}

export default function ProfileScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);
  const [showFavoriteTeams, setShowFavoriteTeams] = useState(false);
  const [showFavoritePlayers, setShowFavoritePlayers] = useState(false);
  const [showFollowList, setShowFollowList] = useState<'followers' | 'following' | null>(null);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
  });

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (error || !data) {
    return <ErrorState message="Failed to load profile" onRetry={refetch} />;
  }

  const { profile, logs, stats, lists, favoriteTeams, favoritePlayers, followerCount, followingCount, watchlistCount, predictionAccuracy } = data;

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
                const message = `Follow me on NBA Letterbox!\n${url}`;
                RNShare.share(Platform.OS === 'ios' ? { message, url } : { message });
              }}
              className="p-2"
            >
              <Share size={20} color="#6b7280" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowEditProfile(true)}
              className="p-2"
            >
              <Pencil size={20} color="#c9a84c" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/settings')}
              className="p-2"
            >
              <Settings size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Stats */}
        <View className="flex-row mt-4 gap-6">
          <View>
            <Text className="text-accent text-xl font-bold">{stats.count}</Text>
            <Text className="text-muted text-xs mt-0.5">Games</Text>
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

        {/* View Stats + My Rankings */}
        <View className="flex-row gap-2 mt-4">
          <TouchableOpacity
            className="flex-1 bg-accent/10 border border-accent/30 rounded-xl py-3 flex-row items-center justify-center gap-2"
            onPress={() => router.push('/stats')}
            activeOpacity={0.7}
          >
            <BarChart3 size={16} color="#c9a84c" />
            <Text className="text-accent font-semibold text-sm">Stats</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 bg-accent/10 border border-accent/30 rounded-xl py-3 flex-row items-center justify-center gap-2"
            onPress={() => router.push('/rankings' as any)}
            activeOpacity={0.7}
          >
            <Trophy size={16} color="#c9a84c" />
            <Text className="text-accent font-semibold text-sm">Rankings</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Diary */}
      <View className="px-4 pt-4">
        <Text className="text-white font-semibold text-base mb-3">Diary</Text>
        <TouchableOpacity
          className="bg-surface border border-border rounded-xl p-4 flex-row items-center justify-between"
          onPress={() => router.push('/diary')}
          activeOpacity={0.7}
        >
          <View>
            <Text className="text-white font-medium">View Diary</Text>
            <Text className="text-muted text-xs mt-1">
              Browse your logs by date
            </Text>
          </View>
          <ChevronRight size={16} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Favorite Teams */}
      <View className="px-4 pt-4">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-white font-semibold text-base">
            Favorite Teams
          </Text>
          <TouchableOpacity
            onPress={() => setShowFavoriteTeams(true)}
            className="flex-row items-center gap-1"
          >
            <Heart size={14} color="#c9a84c" />
            <Text className="text-accent text-sm font-medium">Edit</Text>
          </TouchableOpacity>
        </View>
        {favoriteTeams.length === 0 ? (
          <TouchableOpacity
            className="bg-surface border border-border rounded-xl p-4 mb-2"
            onPress={() => setShowFavoriteTeams(true)}
            activeOpacity={0.7}
          >
            <Text className="text-muted text-sm text-center">
              Tap to pick your favorite teams
            </Text>
          </TouchableOpacity>
        ) : (
          <View className="flex-row flex-wrap gap-2 mb-2">
            {favoriteTeams.map((team) => (
              <View
                key={team.id}
                className="flex-row items-center gap-1.5 bg-surface border border-border rounded-full px-3 py-1.5"
              >
                <TeamLogo abbreviation={team.abbreviation} sport={team.sport ?? 'nba'} size={18} />
                <Text className="text-white text-xs font-medium">
                  {team.abbreviation}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Favorite Players */}
      <View className="px-4 pt-4">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-white font-semibold text-base">
            Favorite Players
          </Text>
          <TouchableOpacity
            onPress={() => setShowFavoritePlayers(true)}
            className="flex-row items-center gap-1"
          >
            <Heart size={14} color="#c9a84c" />
            <Text className="text-accent text-sm font-medium">Edit</Text>
          </TouchableOpacity>
        </View>
        {favoritePlayers.length === 0 ? (
          <TouchableOpacity
            className="bg-surface border border-border rounded-xl p-4 mb-2"
            onPress={() => setShowFavoritePlayers(true)}
            activeOpacity={0.7}
          >
            <Text className="text-muted text-sm text-center">
              Tap to pick your favorite players
            </Text>
          </TouchableOpacity>
        ) : (
          <View className="flex-row flex-wrap gap-2 mb-2">
            {favoritePlayers.map((player) => (
              <TouchableOpacity
                key={player.id}
                className="flex-row items-center gap-1.5 bg-surface border border-border rounded-full px-3 py-1.5"
                onPress={() => router.push(`/player/${player.id}`)}
                activeOpacity={0.7}
              >
                <PlayerAvatar
                  headshot_url={player.headshot_url}
                  name={`${player.first_name} ${player.last_name}`}
                  size={20}
                />
                {player.team && (
                  <TeamLogo abbreviation={(player.team as Team).abbreviation} sport={(player.team as Team).sport ?? 'nba'} size={16} />
                )}
                <Text className="text-white text-xs font-medium">
                  {player.first_name} {player.last_name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Lists */}
      <View className="px-4 pt-4">
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-white font-semibold text-base">
            My Lists
          </Text>
          <TouchableOpacity
            onPress={() => setShowCreateList(true)}
            className="flex-row items-center gap-1"
          >
            <Plus size={16} color="#c9a84c" />
            <Text className="text-accent text-sm font-medium">New</Text>
          </TouchableOpacity>
        </View>
        {lists.length === 0 ? (
          <View className="bg-surface border border-border rounded-xl p-4 mb-2 items-center">
            <Text style={{ fontSize: 32 }} className="mb-1">📋</Text>
            <Text className="text-muted text-sm text-center">
              No lists yet. Create one to curate your favorite games.
            </Text>
          </View>
        ) : (
          lists.map((list) => (
            <TouchableOpacity
              key={list.id}
              className="bg-surface border border-border rounded-xl p-4 mb-2"
              onPress={() => router.push(`/list/${list.id}`)}
              activeOpacity={0.7}
            >
              <View className="flex-row items-center gap-1.5">
                <Text className="text-white font-medium" numberOfLines={1}>
                  {list.title}
                </Text>
                {list.is_private && <Lock size={12} color="#6b7280" />}
              </View>
              {list.description && (
                <Text className="text-muted text-xs mt-1" numberOfLines={1}>
                  {list.description}
                </Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Watchlist */}
      <View className="px-4 pt-4">
        <TouchableOpacity
          className="bg-surface border border-border rounded-xl p-4 flex-row items-center justify-between"
          onPress={() => router.push('/watchlist')}
          activeOpacity={0.7}
        >
          <View className="flex-row items-center gap-3">
            <Bookmark size={18} color="#c9a84c" />
            <Text className="text-white font-medium text-base">Watchlist</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="text-muted text-sm">{watchlistCount}</Text>
            <ChevronRight size={16} color="#6b7280" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Recent Logs */}
      <View className="px-4 pt-4">
        <Text className="text-white font-semibold text-base mb-3">
          Recent Logs
        </Text>
        {logs.length === 0 ? (
          <View className="items-center py-8">
            <Text style={{ fontSize: 40 }} className="mb-2">📝</Text>
            <Text className="text-white font-semibold mb-1">No games logged yet</Text>
            <Text className="text-muted text-sm">Search for a game to log your first review</Text>
          </View>
        ) : (
          logs.map((log) => <GameCard key={log.id} log={log} />)
        )}
      </View>

      {showEditProfile && (
        <EditProfileModal
          profile={profile}
          onClose={() => setShowEditProfile(false)}
          onSuccess={() => {
            setShowEditProfile(false);
            refetch();
            queryClient.invalidateQueries({ queryKey: ['user-profile'] });
          }}
        />
      )}

      {showCreateList && (
        <CreateListModal
          onClose={() => setShowCreateList(false)}
          onSuccess={() => {
            setShowCreateList(false);
            refetch();
          }}
        />
      )}

      {showFavoriteTeams && (
        <FavoriteTeamsModal
          currentFavoriteIds={favoriteTeams.map((t) => t.id)}
          onClose={() => setShowFavoriteTeams(false)}
          onSuccess={() => {
            setShowFavoriteTeams(false);
            refetch();
          }}
        />
      )}

      {showFavoritePlayers && (
        <FavoritePlayersModal
          currentFavoriteIds={favoritePlayers.map((p) => p.id)}
          onClose={() => setShowFavoritePlayers(false)}
          onSuccess={() => {
            setShowFavoritePlayers(false);
            refetch();
          }}
        />
      )}

      {showFollowList && user && (
        <FollowListModal
          userId={user.id}
          mode={showFollowList}
          onClose={() => setShowFollowList(null)}
        />
      )}
      </PageContainer>
    </ScrollView>
  );
}
