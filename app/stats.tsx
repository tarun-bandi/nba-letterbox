import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import TeamLogo from '@/components/TeamLogo';
import type { Sport } from '@/types/database';
import StatBar from '@/components/StatBar';
import ErrorState from '@/components/ErrorState';
import { Skeleton } from '@/components/Skeleton';
import type { WatchMode } from '@/types/database';
import { PageContainer } from '@/components/PageContainer';

interface StatsData {
  totalGames: number;
  avgRating: number | null;
  mostActiveMonth: string | null;
  favoriteWatchMode: WatchMode | null;
  gamesByMonth: { label: string; value: number }[];
  ratingDistribution: { label: string; value: number }[];
  mostWatchedTeams: { abbreviation: string; sport: Sport; count: number }[];
  loggingStreak: number;
  teamsCoverage: number;
  predictionAccuracy: { correct: number; total: number } | null;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const WATCH_MODE_LABELS: Record<WatchMode, string> = {
  live: 'Live',
  replay: 'Replay',
  condensed: 'Condensed',
  highlights: 'Highlights',
};

async function fetchStats(userId: string): Promise<StatsData> {
  const { data, error } = await supabase
    .from('game_logs')
    .select(`
      game_id,
      rating,
      logged_at,
      watch_mode,
      game:games (
        home_team_id,
        away_team_id,
        home_team:teams!games_home_team_id_fkey (abbreviation),
        away_team:teams!games_away_team_id_fkey (abbreviation)
      )
    `)
    .eq('user_id', userId)
    .order('logged_at', { ascending: false });

  if (error) throw error;

  const logs = (data ?? []) as any[];

  // Total games
  const totalGames = logs.length;

  // Avg rating
  const ratings = logs.filter((l) => l.rating !== null).map((l) => l.rating as number);
  const avgRating =
    ratings.length > 0
      ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length) / 10
      : null;

  // Games by month (last 12 months)
  const now = new Date();
  const monthCounts: Record<string, number> = {};
  const monthLabels: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthCounts[key] = 0;
    monthLabels.push(key);
  }
  for (const log of logs) {
    const d = new Date(log.logged_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key in monthCounts) monthCounts[key]++;
  }
  const gamesByMonth = monthLabels.map((key) => ({
    label: MONTH_NAMES[parseInt(key.split('-')[1]) - 1],
    value: monthCounts[key],
  }));

  // Most active month
  let maxMonthCount = 0;
  let mostActiveMonth: string | null = null;
  for (const item of gamesByMonth) {
    if (item.value > maxMonthCount) {
      maxMonthCount = item.value;
      mostActiveMonth = item.label;
    }
  }

  // Rating distribution (0.5 increments from 0.5 to 5.0)
  const ratingBuckets: Record<string, number> = {};
  for (let r = 5; r <= 50; r += 5) {
    ratingBuckets[(r / 10).toFixed(1)] = 0;
  }
  for (const r of ratings) {
    const bucket = (Math.round(r / 5) * 5 / 10).toFixed(1);
    if (bucket in ratingBuckets) ratingBuckets[bucket]++;
  }
  const ratingDistribution = Object.entries(ratingBuckets).map(([label, value]) => ({
    label,
    value,
  }));

  // Most watched teams
  const teamCounts: Record<string, number> = {};
  const teamAbbr: Record<string, string> = {};
  const teamSport: Record<string, string> = {};
  for (const log of logs) {
    if (!log.game) continue;
    const homeId = log.game.home_team_id;
    const awayId = log.game.away_team_id;
    teamCounts[homeId] = (teamCounts[homeId] ?? 0) + 1;
    teamCounts[awayId] = (teamCounts[awayId] ?? 0) + 1;
    if (log.game.home_team) {
      teamAbbr[homeId] = log.game.home_team.abbreviation;
      teamSport[homeId] = log.game.home_team.sport ?? 'nba';
    }
    if (log.game.away_team) {
      teamAbbr[awayId] = log.game.away_team.abbreviation;
      teamSport[awayId] = log.game.away_team.sport ?? 'nba';
    }
  }
  const mostWatchedTeams = Object.entries(teamCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ abbreviation: teamAbbr[id] ?? '???', sport: (teamSport[id] ?? 'nba') as Sport, count }));

  // Logging streak
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const logDates = new Set(
    logs.map((l) => {
      const d = new Date(l.logged_at);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }),
  );
  const checkDate = new Date(today);
  // Allow today or yesterday as start
  if (!logDates.has(checkDate.getTime())) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  while (logDates.has(checkDate.getTime())) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // Teams coverage
  const uniqueTeamIds = new Set<string>();
  for (const log of logs) {
    if (!log.game) continue;
    uniqueTeamIds.add(log.game.home_team_id);
    uniqueTeamIds.add(log.game.away_team_id);
  }
  const teamsCoverage = uniqueTeamIds.size;

  // Favorite watch mode
  const modeCounts: Record<string, number> = {};
  for (const log of logs) {
    if (log.watch_mode) {
      modeCounts[log.watch_mode] = (modeCounts[log.watch_mode] ?? 0) + 1;
    }
  }
  const favoriteWatchMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as WatchMode | undefined ?? null;

  // Prediction accuracy
  let predictionAccuracy: { correct: number; total: number } | null = null;
  const { data: predictions } = await supabase
    .from('game_predictions')
    .select('game_id, predicted_winner_team_id, game:games (home_team_id, away_team_id, home_team_score, away_team_score, status)')
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
    totalGames,
    avgRating,
    mostActiveMonth,
    favoriteWatchMode,
    gamesByMonth,
    ratingDistribution,
    mostWatchedTeams,
    loggingStreak: streak,
    teamsCoverage,
    predictionAccuracy,
  };
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 bg-surface border border-border rounded-xl p-4 items-center">
      <Text className="text-accent text-2xl font-bold">{value}</Text>
      <Text className="text-muted text-xs mt-1">{label}</Text>
    </View>
  );
}

export default function StatsScreen() {
  const { user } = useAuthStore();

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ['user-stats', user?.id],
    queryFn: () => fetchStats(user!.id),
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <View className="flex-1 bg-background p-4">
        <View className="flex-row gap-3 mb-4">
          <Skeleton width="50%" height={80} borderRadius={12} />
          <Skeleton width="50%" height={80} borderRadius={12} />
        </View>
        <Skeleton width="100%" height={200} borderRadius={12} className="mb-4" />
        <Skeleton width="100%" height={200} borderRadius={12} />
      </View>
    );
  }

  if (error || !data) {
    return <ErrorState message="Failed to load stats" onRetry={refetch} />;
  }

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
      {/* Quick Stats Grid */}
      <View className="px-4 pt-4">
        <View className="flex-row gap-3 mb-3">
          <StatCard label="Total Games" value={String(data.totalGames)} />
          <StatCard
            label="Avg Rating"
            value={data.avgRating !== null ? data.avgRating.toFixed(1) : '—'}
          />
        </View>
        <View className="flex-row gap-3 mb-4">
          <StatCard label="Most Active" value={data.mostActiveMonth ?? '—'} />
          <StatCard
            label="Watch Mode"
            value={
              data.favoriteWatchMode
                ? WATCH_MODE_LABELS[data.favoriteWatchMode]
                : '—'
            }
          />
        </View>
      </View>

      {/* Prediction Accuracy */}
      {data.predictionAccuracy && (
        <View className="px-4 mb-4">
          <View className="flex-row gap-3">
            <View className="flex-1 bg-surface border border-border rounded-xl p-4 items-center">
              <Text className="text-accent text-2xl font-bold">
                {Math.round((data.predictionAccuracy.correct / data.predictionAccuracy.total) * 100)}%
              </Text>
              <Text className="text-muted text-xs mt-1">Prediction Accuracy</Text>
              <Text className="text-muted text-xs">
                {data.predictionAccuracy.correct}/{data.predictionAccuracy.total} correct
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Logging Streak & Teams Coverage */}
      <View className="px-4 flex-row gap-3 mb-4">
        <View className="flex-1 bg-surface border border-border rounded-xl p-4">
          <Text className="text-accent text-3xl font-bold text-center">
            {data.loggingStreak}
          </Text>
          <Text className="text-muted text-xs text-center mt-1">
            Day Streak
          </Text>
        </View>
        <View className="flex-1 bg-surface border border-border rounded-xl p-4">
          <Text className="text-accent text-3xl font-bold text-center">
            {data.teamsCoverage}
            <Text className="text-muted text-lg"> / 30</Text>
          </Text>
          <Text className="text-muted text-xs text-center mt-1">
            Teams Covered
          </Text>
          <View className="mt-2 h-2 bg-border rounded-full overflow-hidden">
            <View
              className="h-full bg-accent rounded-full"
              style={{ width: `${(data.teamsCoverage / 30) * 100}%` }}
            />
          </View>
        </View>
      </View>

      {/* Games by Month */}
      <View className="px-4 mb-4">
        <Text className="text-white font-semibold text-base mb-3">
          Games by Month
        </Text>
        <View className="bg-surface border border-border rounded-xl p-4">
          <StatBar items={data.gamesByMonth} />
        </View>
      </View>

      {/* Rating Distribution */}
      <View className="px-4 mb-4">
        <Text className="text-white font-semibold text-base mb-3">
          Rating Distribution
        </Text>
        <View className="bg-surface border border-border rounded-xl p-4">
          <StatBar items={data.ratingDistribution} />
        </View>
      </View>

      {/* Most Watched Teams */}
      <View className="px-4 mb-8">
        <Text className="text-white font-semibold text-base mb-3">
          Most Watched Teams
        </Text>
        {data.mostWatchedTeams.length === 0 ? (
          <View className="bg-surface border border-border rounded-xl p-4 items-center">
            <Text className="text-muted text-sm">No data yet</Text>
          </View>
        ) : (
          data.mostWatchedTeams.map((team, idx) => (
            <View
              key={team.abbreviation}
              className="bg-surface border border-border rounded-xl p-4 mb-2 flex-row items-center gap-3"
            >
              <Text className="text-muted font-bold w-5">{idx + 1}</Text>
              <TeamLogo abbreviation={team.abbreviation} sport={team.sport ?? 'nba'} size={28} />
              <Text className="text-white font-semibold flex-1">
                {team.abbreviation}
              </Text>
              <Text className="text-accent font-semibold">
                {team.count} {team.count === 1 ? 'game' : 'games'}
              </Text>
            </View>
          ))
        )}
      </View>
      </PageContainer>
    </ScrollView>
  );
}
