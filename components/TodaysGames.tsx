import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { useLiveScores } from '@/hooks/useLiveScores';
import TeamLogo from './TeamLogo';
import type { GameWithTeams } from '@/types/database';

interface TodaysGamesData {
  games: GameWithTeams[];
  favoriteTeamIds: Set<string>;
}

function getTodayDateStr(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

async function fetchTodaysGames(userId: string): Promise<TodaysGamesData> {
  const today = getTodayDateStr();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const [gamesRes, favRes] = await Promise.all([
    supabase
      .from('games')
      .select(`
        *,
        home_team:teams!games_home_team_id_fkey (*),
        away_team:teams!games_away_team_id_fkey (*),
        season:seasons (*)
      `)
      .gte('game_date_utc', today)
      .lt('game_date_utc', tomorrowStr)
      .order('game_date_utc', { ascending: true }),
    supabase
      .from('user_favorite_teams')
      .select('team_id')
      .eq('user_id', userId),
  ]);

  if (gamesRes.error) throw gamesRes.error;

  const favoriteTeamIds = new Set(
    (favRes.data ?? []).map((f) => f.team_id),
  );

  return {
    games: (gamesRes.data ?? []) as unknown as GameWithTeams[],
    favoriteTeamIds,
  };
}

function formatTipoff(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTodayDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export default function TodaysGames() {
  const { user } = useAuthStore();
  const router = useRouter();

  const { data } = useQuery({
    queryKey: ['todays-games', getTodayDateStr()],
    queryFn: () => fetchTodaysGames(user!.id),
    enabled: !!user,
  });

  const { data: liveStatusMap } = useLiveScores(data?.games);

  if (!data || data.games.length === 0) return null;

  const { games, favoriteTeamIds } = data;

  return (
    <View className="pb-3">
      <View className="flex-row justify-between items-center px-4 mb-2">
        <Text className="text-white font-semibold text-base">
          Today's Games
        </Text>
        <Text className="text-muted text-xs">{formatTodayDate()}</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
      >
        {games.map((game) => {
          const isFav =
            favoriteTeamIds.has(game.home_team_id) ||
            favoriteTeamIds.has(game.away_team_id);
          const isLive = game.status === 'live';
          const isFinal = game.status === 'final';
          const homeWon =
            isFinal &&
            game.home_team_score != null &&
            game.away_team_score != null &&
            game.home_team_score > game.away_team_score;
          const awayWon =
            isFinal &&
            game.home_team_score != null &&
            game.away_team_score != null &&
            game.away_team_score > game.home_team_score;

          return (
            <TouchableOpacity
              key={game.id}
              className={`bg-surface border rounded-xl p-3 ${
                isFav ? 'border-l-2 border-accent' : 'border-border'
              }`}
              style={{ width: 140 }}
              onPress={() => router.push(`/game/${game.id}`)}
              activeOpacity={0.7}
            >
              {/* Status */}
              <View className="flex-row items-center justify-center mb-2">
                {isLive ? (
                  <View className="flex-row items-center gap-1">
                    <View className="w-2 h-2 rounded-full bg-accent-red" />
                    <Text className="text-accent-red text-xs font-bold">
                      {liveStatusMap?.get(game.provider_game_id) ?? 'In Progress'}
                    </Text>
                  </View>
                ) : isFinal ? (
                  <Text className="text-muted text-xs font-semibold">
                    Final
                  </Text>
                ) : (
                  <Text className="text-muted text-xs">
                    {formatTipoff(game.game_date_utc)}
                  </Text>
                )}
              </View>

              {/* Away team */}
              <View className="flex-row items-center justify-between mb-1.5">
                <View className="flex-row items-center gap-2">
                  <TeamLogo
                    abbreviation={game.away_team.abbreviation}
                    size={20}
                  />
                  <Text
                    className={`text-sm ${
                      awayWon ? 'text-white font-bold' : 'text-muted font-medium'
                    }`}
                  >
                    {game.away_team.abbreviation}
                  </Text>
                </View>
                {(isLive || isFinal) && (
                  <Text
                    className={`text-sm ${
                      awayWon ? 'text-white font-bold' : 'text-muted'
                    }`}
                  >
                    {game.away_team_score}
                  </Text>
                )}
              </View>

              {/* Home team */}
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <TeamLogo
                    abbreviation={game.home_team.abbreviation}
                    size={20}
                  />
                  <Text
                    className={`text-sm ${
                      homeWon ? 'text-white font-bold' : 'text-muted font-medium'
                    }`}
                  >
                    {game.home_team.abbreviation}
                  </Text>
                </View>
                {(isLive || isFinal) && (
                  <Text
                    className={`text-sm ${
                      homeWon ? 'text-white font-bold' : 'text-muted'
                    }`}
                  >
                    {game.home_team_score}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
