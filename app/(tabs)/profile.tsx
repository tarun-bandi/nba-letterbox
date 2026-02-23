import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Pencil } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { enrichLogs } from '@/lib/enrichLogs';
import { useAuthStore } from '@/lib/store/authStore';
import { useRouter } from 'expo-router';
import { Plus, Lock, Heart } from 'lucide-react-native';
import Avatar from '@/components/Avatar';
import GameCard from '@/components/GameCard';
import EditProfileModal from '@/components/EditProfileModal';
import CreateListModal from '@/components/CreateListModal';
import FavoriteTeamsModal from '@/components/FavoriteTeamsModal';
import FollowListModal from '@/components/FollowListModal';
import TeamLogo from '@/components/TeamLogo';
import { ProfileSkeleton } from '@/components/Skeleton';
import ErrorState from '@/components/ErrorState';
import type { GameLogWithGame, UserProfile, List, Team } from '@/types/database';

interface ProfileData {
  profile: UserProfile;
  logs: GameLogWithGame[];
  stats: { count: number; avgRating: number | null };
  lists: List[];
  favoriteTeams: Team[];
  followerCount: number;
  followingCount: number;
}

async function fetchProfile(userId: string): Promise<ProfileData> {
  const [profileRes, logsRes, listsRes, favTeamsRes, followerRes, followingRes] = await Promise.all([
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
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', userId),
    supabase
      .from('follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', userId),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (logsRes.error) throw logsRes.error;
  if (listsRes.error) throw listsRes.error;

  const rawLogs = (logsRes.data ?? []) as unknown as GameLogWithGame[];
  const logs = await enrichLogs(rawLogs, userId);
  const ratings = logs.filter((l) => l.rating !== null).map((l) => l.rating!);
  const avgRating =
    ratings.length > 0
      ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) / 10
      : null;

  const favoriteTeams = ((favTeamsRes.data ?? []) as any[])
    .map((r) => r.team)
    .filter(Boolean) as Team[];

  return {
    profile: profileRes.data,
    logs,
    stats: { count: logs.length, avgRating },
    lists: (listsRes.data ?? []) as List[],
    favoriteTeams,
    followerCount: followerRes.count ?? 0,
    followingCount: followingRes.count ?? 0,
  };
}

export default function ProfileScreen() {
  const { user, setSession } = useAuthStore();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);
  const [showFavoriteTeams, setShowFavoriteTeams] = useState(false);
  const [showFollowList, setShowFollowList] = useState<'followers' | 'following' | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
  });

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          await supabase.auth.signOut();
          setSession(null);
          setSigningOut(false);
        },
      },
    ]);
  }

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (error || !data) {
    return <ErrorState message="Failed to load profile" onRetry={refetch} />;
  }

  const { profile, logs, stats, lists, favoriteTeams, followerCount, followingCount } = data;

  return (
    <ScrollView className="flex-1 bg-background" showsVerticalScrollIndicator={false}>
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
              onPress={() => setShowEditProfile(true)}
              className="p-2"
            >
              <Pencil size={20} color="#c9a84c" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSignOut}
              disabled={signingOut}
              className="p-2"
            >
              {signingOut ? (
                <ActivityIndicator color="#e63946" size="small" />
              ) : (
                <LogOut size={22} color="#e63946" />
              )}
            </TouchableOpacity>
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
        </View>
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
                <TeamLogo abbreviation={team.abbreviation} size={18} />
                <Text className="text-white text-xs font-medium">
                  {team.abbreviation}
                </Text>
              </View>
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

      {showFollowList && user && (
        <FollowListModal
          userId={user.id}
          mode={showFollowList}
          onClose={() => setShowFollowList(null)}
        />
      )}
    </ScrollView>
  );
}
