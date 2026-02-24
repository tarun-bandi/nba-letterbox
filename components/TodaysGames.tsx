import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { useLiveScores } from '@/hooks/useLiveScores';
import TeamLogo from './TeamLogo';
import type { GameWithTeams, Sport } from '@/types/database';

interface TodaysGamesData {
  games: GameWithTeams[];
  favoriteTeamIds: Set<string>;
  predictedGameIds: Set<string>;
}

/** Return today's date as YYYY-MM-DD in US Eastern time. */
function getTodayDateStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

async function fetchTodaysGames(userId: string): Promise<TodaysGamesData> {
  const today = getTodayDateStr();
  // Games span UTC midnight — use wide window
  const [y, m, d] = today.split('-').map(Number);
  const startUTC = new Date(Date.UTC(y, m - 1, d, 10, 0, 0)).toISOString();
  const endUTC = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0)).toISOString();

  const [gamesRes, favRes, predsRes] = await Promise.all([
    supabase
      .from('games')
      .select(`
        *,
        home_team:teams!games_home_team_id_fkey (*),
        away_team:teams!games_away_team_id_fkey (*),
        season:seasons (*)
      `)
      .gte('game_date_utc', startUTC)
      .lt('game_date_utc', endUTC)
      .order('game_date_utc', { ascending: true }),
    supabase
      .from('user_favorite_teams')
      .select('team_id')
      .eq('user_id', userId),
    supabase
      .from('game_predictions')
      .select('game_id')
      .eq('user_id', userId),
  ]);

  if (gamesRes.error) throw gamesRes.error;

  const favoriteTeamIds = new Set(
    (favRes.data ?? []).map((f) => f.team_id),
  );

  const predictedGameIds = new Set(
    (predsRes.data ?? []).map((p) => p.game_id),
  );

  return {
    games: (gamesRes.data ?? []) as unknown as GameWithTeams[],
    favoriteTeamIds,
    predictedGameIds,
  };
}

function formatTipoff(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
}

function formatTodayDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

const SPORT_PILL_COLORS: Record<Sport, string> = {
  nba: '#c9a84c',
  nfl: '#013369',
};

function SportBadge({ sport }: { sport: Sport }) {
  return (
    <View
      className="absolute top-1 left-1 rounded-full px-1.5 py-0.5"
      style={{ backgroundColor: SPORT_PILL_COLORS[sport] ?? '#666' }}
    >
      <Text className="text-white text-[8px] font-bold uppercase">{sport}</Text>
    </View>
  );
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

  const { games, favoriteTeamIds, predictedGameIds } = data;

  // Show sport badge if games span multiple sports
  const hasMixedSports = new Set(games.map((g) => g.sport ?? 'nba')).size > 1;

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
          const live = liveStatusMap?.get(game.provider_game_id);
          const isFav =
            favoriteTeamIds.has(game.home_team_id) ||
            favoriteTeamIds.has(game.away_team_id);
          const status = live?.status ?? game.status;
          const homeScore = live ? live.homeScore : game.home_team_score;
          const awayScore = live ? live.awayScore : game.away_team_score;
          const isLive = status === 'live';
          const isFinal = status === 'final';
          const hasScores = isLive || isFinal;
          const homeWon =
            isFinal && homeScore != null && awayScore != null && homeScore > awayScore;
          const awayWon =
            isFinal && homeScore != null && awayScore != null && awayScore > homeScore;
          const gameSport: Sport = game.sport ?? 'nba';

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
              {/* Sport badge (only when mixed sports) */}
              {hasMixedSports && <SportBadge sport={gameSport} />}

              {/* Prediction badge */}
              {!hasScores && predictedGameIds.has(game.id) && (
                <View className="absolute top-1.5 right-1.5 bg-accent/20 rounded-full px-1.5 py-0.5">
                  <Text className="text-accent text-[9px] font-bold">Predicted</Text>
                </View>
              )}

              {/* Status */}
              <View className="flex-row items-center justify-center mb-2">
                {isLive ? (
                  <View className="flex-row items-center gap-1">
                    <View className="w-2 h-2 rounded-full bg-accent-red" />
                    <Text className="text-accent-red text-xs font-bold">
                      {live?.label ?? 'In Progress'}
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
                    sport={gameSport}
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
                {hasScores && awayScore != null && (
                  <Text
                    className={`text-sm ${
                      awayWon ? 'text-white font-bold' : 'text-muted'
                    }`}
                  >
                    {awayScore}
                  </Text>
                )}
              </View>

              {/* Home team */}
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                  <TeamLogo
                    abbreviation={game.home_team.abbreviation}
                    sport={gameSport}
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
                {hasScores && homeScore != null && (
                  <Text
                    className={`text-sm ${
                      homeWon ? 'text-white font-bold' : 'text-muted'
                    }`}
                  >
                    {homeScore}
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
