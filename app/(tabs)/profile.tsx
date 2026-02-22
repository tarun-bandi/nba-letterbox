import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import GameCard from '@/components/GameCard';
import type { GameLogWithGame, UserProfile } from '@/types/database';

interface ProfileData {
  profile: UserProfile;
  logs: GameLogWithGame[];
  stats: { count: number; avgRating: number | null };
}

async function fetchProfile(userId: string): Promise<ProfileData> {
  const [profileRes, logsRes] = await Promise.all([
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
  ]);

  if (profileRes.error) throw profileRes.error;
  if (logsRes.error) throw logsRes.error;

  const logs = (logsRes.data ?? []) as unknown as GameLogWithGame[];
  const ratings = logs.filter((l) => l.rating !== null).map((l) => l.rating!);
  const avgRating =
    ratings.length > 0
      ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) / 10
      : null;

  return {
    profile: profileRes.data,
    logs,
    stats: { count: logs.length, avgRating },
  };
}

export default function ProfileScreen() {
  const { user, setSession } = useAuthStore();
  const [signingOut, setSigningOut] = useState(false);

  const { data, isLoading, error } = useQuery({
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
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#c9a84c" size="large" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-accent-red">Failed to load profile.</Text>
      </View>
    );
  }

  const { profile, logs, stats } = data;

  return (
    <ScrollView className="flex-1 bg-background" showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View className="bg-surface border-b border-border px-6 py-6">
        <View className="flex-row justify-between items-start">
          <View>
            <Text className="text-white text-2xl font-bold">
              {profile.display_name}
            </Text>
            <Text className="text-muted mt-0.5">@{profile.handle}</Text>
            {profile.bio ? (
              <Text className="text-white mt-2 text-sm">{profile.bio}</Text>
            ) : null}
          </View>
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
        </View>
      </View>

      {/* Recent Logs */}
      <View className="px-4 pt-4">
        <Text className="text-white font-semibold text-base mb-3">
          Recent Logs
        </Text>
        {logs.length === 0 ? (
          <View className="items-center py-8">
            <Text className="text-muted">No games logged yet.</Text>
          </View>
        ) : (
          logs.map((log) => <GameCard key={log.id} log={log} />)
        )}
      </View>
    </ScrollView>
  );
}
