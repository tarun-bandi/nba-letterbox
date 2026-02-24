import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import TeamLogo from '@/components/TeamLogo';
import PlayerAvatar from '@/components/PlayerAvatar';
import ErrorState from '@/components/ErrorState';
import { Skeleton } from '@/components/Skeleton';
import type { Player, Team, BoxScore, GameWithTeams } from '@/types/database';
import { PageContainer } from '@/components/PageContainer';

interface RecentGame {
  game: GameWithTeams;
  stats: BoxScore;
}

interface PlayerDetail {
  player: Player;
  team: Team | null;
  isFavorite: boolean;
  seasonAverages: {
    games: number;
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    fgPct: number | null;
    tpPct: number | null;
    ftPct: number | null;
    minutes: number;
  } | null;
  recentGames: RecentGame[];
}

async function fetchPlayerDetail(playerId: string, userId: string): Promise<PlayerDetail> {
  const [playerRes, favRes] = await Promise.all([
    supabase
      .from('players')
      .select('*, team:teams (*)')
      .eq('id', playerId)
      .single(),
    supabase
      .from('user_favorite_players')
      .select('player_id')
      .eq('user_id', userId)
      .eq('player_id', playerId)
      .maybeSingle(),
  ]);

  if (playerRes.error) throw playerRes.error;

  const player = playerRes.data as unknown as Player & { team: Team | null };
  const fullName = `${player.first_name} ${player.last_name}`;

  // Fetch box scores for this player (match by name)
  const { data: boxScores } = await supabase
    .from('box_scores')
    .select(`
      *,
      game:games (
        *,
        home_team:teams!games_home_team_id_fkey (*),
        away_team:teams!games_away_team_id_fkey (*),
        season:seasons (*)
      )
    `)
    .eq('player_name', fullName)
    .order('created_at', { ascending: false })
    .limit(50);

  const scores = (boxScores ?? []) as unknown as (BoxScore & { game: GameWithTeams })[];

  // Season averages from all box scores
  let seasonAverages: PlayerDetail['seasonAverages'] = null;
  if (scores.length > 0) {
    const n = scores.length;
    const sum = (key: keyof BoxScore) =>
      scores.reduce((a, s) => a + ((s[key] as number) ?? 0), 0);
    const totalFgm = sum('fgm');
    const totalFga = sum('fga');
    const totalTpm = sum('tpm');
    const totalTpa = sum('tpa');
    const totalFtm = sum('ftm');
    const totalFta = sum('fta');

    const totalMinutes = scores.reduce((a, s) => {
      if (!s.minutes) return a;
      const parts = s.minutes.split(':');
      return a + parseInt(parts[0]) + (parseInt(parts[1]) || 0) / 60;
    }, 0);

    seasonAverages = {
      games: n,
      points: Math.round((sum('points') / n) * 10) / 10,
      rebounds: Math.round((sum('rebounds') / n) * 10) / 10,
      assists: Math.round((sum('assists') / n) * 10) / 10,
      steals: Math.round((sum('steals') / n) * 10) / 10,
      blocks: Math.round((sum('blocks') / n) * 10) / 10,
      fgPct: totalFga > 0 ? Math.round((totalFgm / totalFga) * 1000) / 10 : null,
      tpPct: totalTpa > 0 ? Math.round((totalTpm / totalTpa) * 1000) / 10 : null,
      ftPct: totalFta > 0 ? Math.round((totalFtm / totalFta) * 1000) / 10 : null,
      minutes: Math.round((totalMinutes / n) * 10) / 10,
    };
  }

  // Recent games (last 10)
  const recentGames: RecentGame[] = scores
    .filter((s) => s.game)
    .slice(0, 10)
    .map((s) => ({ game: s.game, stats: s }));

  return {
    player,
    team: player.team,
    isFavorite: !!favRes.data,
    seasonAverages,
    recentGames,
  };
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View className="items-center">
      <Text className="text-accent text-xl font-bold">{value}</Text>
      <Text className="text-muted text-xs mt-0.5">{label}</Text>
    </View>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function PlayerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['player-detail', id],
    queryFn: () => fetchPlayerDetail(id, user!.id),
    enabled: !!id && !!user,
  });

  const favMutation = useMutation({
    mutationFn: async (isFav: boolean) => {
      if (!user) return;
      if (isFav) {
        await supabase
          .from('user_favorite_players')
          .delete()
          .eq('user_id', user.id)
          .eq('player_id', id);
      } else {
        await supabase
          .from('user_favorite_players')
          .insert({ user_id: user.id, player_id: id });
      }
    },
    onMutate: async (isFav) => {
      await queryClient.cancelQueries({ queryKey: ['player-detail', id] });
      const prev = queryClient.getQueryData(['player-detail', id]);
      queryClient.setQueryData(['player-detail', id], (old: any) =>
        old ? { ...old, isFavorite: !isFav } : old,
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['player-detail', id], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['player-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  if (isLoading) {
    return (
      <View className="flex-1 bg-background p-4">
        <Skeleton width="60%" height={28} borderRadius={8} />
        <Skeleton width="40%" height={16} borderRadius={8} className="mt-2" />
        <Skeleton width="100%" height={120} borderRadius={12} className="mt-4" />
      </View>
    );
  }

  if (error || !data) {
    return <ErrorState message="Failed to load player" onRetry={refetch} />;
  }

  const { player, team, isFavorite, seasonAverages, recentGames } = data;

  return (
    <ScrollView
      className="flex-1 bg-background"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor="#e5e5e5"
        />
      }
    >
      <PageContainer>
      {/* Header */}
      <View className="bg-surface border-b border-border mx-4 mt-4 rounded-2xl p-6">
        <View className="flex-row justify-between items-start">
          <View className="flex-row items-start gap-4 flex-1">
            <PlayerAvatar
              headshot_url={player.headshot_url}
              name={`${player.first_name} ${player.last_name}`}
              size={64}
            />
          <View className="flex-1">
            <Text className="text-white text-2xl font-bold">
              {player.first_name} {player.last_name}
            </Text>
            <View className="flex-row items-center gap-3 mt-2">
              {player.position && (
                <Text className="text-accent text-sm font-semibold">
                  {player.position}
                </Text>
              )}
              {player.jersey_number && (
                <Text className="text-muted text-sm">#{player.jersey_number}</Text>
              )}
            </View>
            {team && (
              <View className="flex-row items-center gap-2 mt-2">
                <TeamLogo abbreviation={team.abbreviation} size={22} />
                <Text className="text-white text-sm font-medium">
                  {team.full_name}
                </Text>
              </View>
            )}
          </View>
          </View>
          <TouchableOpacity
            className="p-2"
            onPress={() => favMutation.mutate(isFavorite)}
          >
            <Heart
              size={24}
              color="#e5e5e5"
              fill={isFavorite ? '#e5e5e5' : 'transparent'}
            />
          </TouchableOpacity>
        </View>

        {/* Physical / Draft info */}
        <View className="flex-row flex-wrap gap-x-6 gap-y-1 mt-3 pt-3 border-t border-border">
          {player.height && (
            <Text className="text-muted text-xs">
              Height: <Text className="text-white">{player.height}</Text>
            </Text>
          )}
          {player.weight && (
            <Text className="text-muted text-xs">
              Weight: <Text className="text-white">{player.weight} lbs</Text>
            </Text>
          )}
          {player.country && (
            <Text className="text-muted text-xs">
              Country: <Text className="text-white">{player.country}</Text>
            </Text>
          )}
          {player.college && (
            <Text className="text-muted text-xs">
              College: <Text className="text-white">{player.college}</Text>
            </Text>
          )}
          {player.draft_year && (
            <Text className="text-muted text-xs">
              Draft:{' '}
              <Text className="text-white">
                {player.draft_year} R{player.draft_round} #{player.draft_number}
              </Text>
            </Text>
          )}
        </View>
      </View>

      {/* Season Averages */}
      {seasonAverages && (
        <View className="mx-4 mt-4">
          <Text className="text-white font-semibold text-base mb-3">
            Averages ({seasonAverages.games} games)
          </Text>
          <View className="bg-surface border border-border rounded-xl p-4">
            <View className="flex-row justify-between">
              <StatBox label="PTS" value={seasonAverages.points.toFixed(1)} />
              <StatBox label="REB" value={seasonAverages.rebounds.toFixed(1)} />
              <StatBox label="AST" value={seasonAverages.assists.toFixed(1)} />
              <StatBox label="STL" value={seasonAverages.steals.toFixed(1)} />
              <StatBox label="BLK" value={seasonAverages.blocks.toFixed(1)} />
            </View>
            <View className="flex-row justify-between mt-3 pt-3 border-t border-border">
              <StatBox label="MIN" value={seasonAverages.minutes.toFixed(1)} />
              <StatBox
                label="FG%"
                value={seasonAverages.fgPct !== null ? `${seasonAverages.fgPct}` : '—'}
              />
              <StatBox
                label="3P%"
                value={seasonAverages.tpPct !== null ? `${seasonAverages.tpPct}` : '—'}
              />
              <StatBox
                label="FT%"
                value={seasonAverages.ftPct !== null ? `${seasonAverages.ftPct}` : '—'}
              />
            </View>
          </View>
        </View>
      )}

      {/* Recent Games */}
      <View className="mx-4 mt-4 pb-8">
        <Text className="text-white font-semibold text-base mb-3">
          Recent Games
        </Text>
        {recentGames.length === 0 ? (
          <View className="bg-surface border border-border rounded-xl p-4 items-center">
            <Text className="text-muted text-sm">No recent game data</Text>
          </View>
        ) : (
          recentGames.map((item) => {
            const isHome = item.stats.team_id === item.game.home_team_id;
            const opponent = isHome ? item.game.away_team : item.game.home_team;
            const prefix = isHome ? 'vs' : '@';
            return (
              <TouchableOpacity
                key={item.stats.id}
                className="bg-surface border border-border rounded-xl p-4 mb-2"
                onPress={() => router.push(`/game/${item.game.id}`)}
                activeOpacity={0.7}
              >
                <View className="flex-row justify-between items-center">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-muted text-xs">{prefix}</Text>
                    <TeamLogo abbreviation={opponent.abbreviation} size={18} />
                    <Text className="text-white font-medium text-sm">
                      {opponent.abbreviation}
                    </Text>
                    <Text className="text-muted text-xs">
                      {formatDate(item.game.game_date_utc)}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-3">
                    <Text className="text-accent font-bold text-sm">
                      {item.stats.points ?? 0} PTS
                    </Text>
                    <Text className="text-muted text-xs">
                      {item.stats.rebounds ?? 0} REB
                    </Text>
                    <Text className="text-muted text-xs">
                      {item.stats.assists ?? 0} AST
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
      </PageContainer>
    </ScrollView>
  );
}
