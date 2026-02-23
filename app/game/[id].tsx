import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Keyboard,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { enrichLogs } from '@/lib/enrichLogs';
import { useAuthStore } from '@/lib/store/authStore';
import { List } from 'lucide-react-native';
import GameCard from '@/components/GameCard';
import ErrorState from '@/components/ErrorState';
import LogModal from '@/components/LogModal';
import AddToListModal from '@/components/AddToListModal';
import TeamLogo from '@/components/TeamLogo';
import type { GameWithTeams, GameLogWithGame } from '@/types/database';

interface GameDetail {
  game: GameWithTeams;
  logs: GameLogWithGame[];
  myLog: GameLogWithGame | null;
  communityAvg: number | null;
}

async function fetchGameDetail(gameId: string, userId: string): Promise<GameDetail> {
  const [gameRes, logsRes] = await Promise.all([
    supabase
      .from('games')
      .select(`
        *,
        home_team:teams!games_home_team_id_fkey (*),
        away_team:teams!games_away_team_id_fkey (*),
        season:seasons (*)
      `)
      .eq('id', gameId)
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
      .eq('game_id', gameId)
      .order('logged_at', { ascending: false })
      .limit(20),
  ]);

  if (gameRes.error) throw gameRes.error;
  if (logsRes.error) throw logsRes.error;

  const rawLogs = (logsRes.data ?? []) as unknown as GameLogWithGame[];

  // Fetch user profiles separately (no direct FK from game_logs to user_profiles)
  const userIds = [...new Set(rawLogs.map((l) => l.user_id))];
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

  const logsWithProfiles = rawLogs.map((l) => ({
    ...l,
    user_profile: profileMap[l.user_id] ?? undefined,
  }));
  const logs = await enrichLogs(logsWithProfiles, userId);
  const myLog = logs.find((l) => l.user_id === userId) ?? null;

  const ratings = logs.filter((l) => l.rating !== null).map((l) => l.rating!);
  const communityAvg =
    ratings.length > 0
      ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) / 10
      : null;

  return {
    game: gameRes.data as unknown as GameWithTeams,
    logs,
    myLog,
    communityAvg,
  };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showLogModal, setShowLogModal] = useState(false);
  const [showListModal, setShowListModal] = useState(false);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['game-detail', id],
    queryFn: () => fetchGameDetail(id, user!.id),
    enabled: !!id && !!user,
  });

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#c9a84c" size="large" />
      </View>
    );
  }

  if (error || !data) {
    return <ErrorState message="Failed to load game details" onRetry={refetch} />;
  }

  const { game, logs, myLog, communityAvg } = data;

  return (
    <>
      <ScrollView
        className="flex-1 bg-background"
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={Keyboard.dismiss}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#c9a84c"
          />
        }
      >
        {/* Score Card */}
        <View className="bg-surface border-b border-border mx-4 mt-4 rounded-2xl p-6">
          <View className="flex-row justify-between items-center">
            {/* Away Team */}
            <View className="flex-1 items-center">
              <TeamLogo abbreviation={game.away_team.abbreviation} size={64} />
              <Text className="text-muted text-sm mt-2">{game.away_team.city}</Text>
              <Text className="text-white text-2xl font-bold">
                {game.away_team.abbreviation}
              </Text>
              <Text className="text-accent text-4xl font-bold mt-2">
                {game.away_team_score ?? '—'}
              </Text>
            </View>

            {/* Center */}
            <View className="items-center px-4">
              <Text className="text-muted text-xs uppercase tracking-wider">
                {game.status === 'final' ? 'Final' : game.status}
              </Text>
              <Text className="text-border text-2xl font-light mt-1">@</Text>
              <Text className="text-muted text-xs mt-1">
                {formatDate(game.game_date_utc)}
              </Text>
            </View>

            {/* Home Team */}
            <View className="flex-1 items-center">
              <TeamLogo abbreviation={game.home_team.abbreviation} size={64} />
              <Text className="text-muted text-sm mt-2">{game.home_team.city}</Text>
              <Text className="text-white text-2xl font-bold">
                {game.home_team.abbreviation}
              </Text>
              <Text className="text-accent text-4xl font-bold mt-2">
                {game.home_team_score ?? '—'}
              </Text>
            </View>
          </View>

          {/* Community rating */}
          {communityAvg !== null && (
            <View className="mt-4 pt-4 border-t border-border flex-row items-center justify-center gap-2">
              <Text className="text-muted text-sm">Community avg</Text>
              <Text className="text-accent font-semibold">{communityAvg.toFixed(1)}</Text>
              <Text className="text-muted text-sm">({logs.length} {logs.length === 1 ? 'log' : 'logs'})</Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View className="mx-4 mt-4 flex-row gap-3">
          <TouchableOpacity
            className={`flex-1 rounded-xl py-4 items-center ${
              myLog ? 'bg-surface border border-accent' : 'bg-accent'
            }`}
            onPress={() => setShowLogModal(true)}
            activeOpacity={0.8}
          >
            <Text
              className={`font-semibold text-base ${
                myLog ? 'text-accent' : 'text-background'
              }`}
            >
              {myLog ? 'Edit My Log' : 'Log This Game'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="bg-surface border border-border rounded-xl py-4 px-5 items-center justify-center"
            onPress={() => setShowListModal(true)}
            activeOpacity={0.8}
          >
            <List size={22} color="#c9a84c" />
          </TouchableOpacity>
        </View>

        {/* Recent Logs */}
        <View className="px-4 pt-6 pb-4">
          <Text className="text-white font-semibold text-base mb-3">
            Recent Reviews
          </Text>
          {logs.length === 0 ? (
            <View className="items-center py-8">
              <Text style={{ fontSize: 40 }} className="mb-2">✍️</Text>
              <Text className="text-white font-semibold mb-1">No reviews yet</Text>
              <Text className="text-muted text-sm">Be the first to log this game!</Text>
            </View>
          ) : (
            logs.map((log) => (
              <GameCard key={log.id} log={log} showUser />
            ))
          )}
        </View>
      </ScrollView>

      {/* Log Modal */}
      {showLogModal && (
        <LogModal
          gameId={id}
          existingLog={myLog}
          onClose={() => setShowLogModal(false)}
          onSuccess={() => {
            setShowLogModal(false);
            refetch();
            queryClient.invalidateQueries({ queryKey: ['feed'] });
            queryClient.invalidateQueries({ queryKey: ['profile'] });
          }}
        />
      )}

      {/* Add to List Modal */}
      {showListModal && (
        <AddToListModal
          gameId={id}
          onClose={() => setShowListModal(false)}
        />
      )}
    </>
  );
}
