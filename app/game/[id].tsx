import { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Keyboard,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { enrichLogs } from '@/lib/enrichLogs';
import { useAuthStore } from '@/lib/store/authStore';
import { List, Play, Bookmark } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import GameCard from '@/components/GameCard';
import ErrorState from '@/components/ErrorState';
import LogModal from '@/components/LogModal';
import AddToListModal from '@/components/AddToListModal';
import TeamLogo from '@/components/TeamLogo';
import PlayoffBadge from '@/components/PlayoffBadge';
import type { GameWithTeams, GameLogWithGame, BoxScore } from '@/types/database';

interface GameDetail {
  game: GameWithTeams;
  logs: GameLogWithGame[];
  myLog: GameLogWithGame | null;
  communityAvg: number | null;
  boxScores: BoxScore[];
  isBookmarked: boolean;
  playerNameMap: Record<string, string>; // player_name -> player_id
}

async function fetchGameDetail(gameId: string, userId: string): Promise<GameDetail> {
  const [gameRes, logsRes, boxRes, watchlistRes] = await Promise.all([
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
    supabase
      .from('box_scores')
      .select('*')
      .eq('game_id', gameId),
    supabase
      .from('watchlist')
      .select('game_id')
      .eq('user_id', userId)
      .eq('game_id', gameId)
      .maybeSingle(),
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

  const allBoxScores = (boxRes.data ?? []) as BoxScore[];

  // Build player name → id map from players table
  const playerNames = [...new Set(allBoxScores.map((b) => b.player_name))];
  const playerNameMap: Record<string, string> = {};
  if (playerNames.length > 0) {
    const { data: players } = await supabase
      .from('players')
      .select('id, first_name, last_name');
    if (players) {
      const nameIndex: Record<string, string> = {};
      for (const p of players) {
        nameIndex[`${p.first_name} ${p.last_name}`] = p.id;
      }
      for (const name of playerNames) {
        if (nameIndex[name]) playerNameMap[name] = nameIndex[name];
      }
    }
  }

  return {
    game: gameRes.data as unknown as GameWithTeams,
    logs,
    myLog,
    communityAvg,
    boxScores: allBoxScores,
    isBookmarked: !!watchlistRes.data,
    playerNameMap,
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

type SortKey = 'points' | 'rebounds' | 'assists' | 'steals' | 'blocks' | 'turnovers' | 'minutes' | 'plus_minus' | 'fgm' | 'tpm' | 'ftm';

function QuarterScoreTable({ game }: { game: GameWithTeams }) {
  if (game.home_q1 == null) return null;

  const hasOT = game.home_ot != null || game.away_ot != null;

  return (
    <View className="bg-surface border-b border-border mx-4 mt-3 rounded-2xl p-4">
      {/* Header */}
      <View className="flex-row mb-2">
        <View className="w-14" />
        {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
          <Text key={q} className="text-muted text-xs font-semibold w-10 text-center">
            {q}
          </Text>
        ))}
        {hasOT && (
          <Text className="text-muted text-xs font-semibold w-10 text-center">OT</Text>
        )}
        <Text className="text-muted text-xs font-semibold flex-1 text-center">Final</Text>
      </View>

      {/* Away row */}
      <View className="flex-row items-center py-1.5">
        <Text className="text-white font-bold text-sm w-14">
          {game.away_team.abbreviation}
        </Text>
        {[game.away_q1, game.away_q2, game.away_q3, game.away_q4].map((s, i) => (
          <Text key={i} className="text-white text-sm w-10 text-center">{s ?? '-'}</Text>
        ))}
        {hasOT && (
          <Text className="text-white text-sm w-10 text-center">{game.away_ot ?? '-'}</Text>
        )}
        <Text className="text-accent font-bold text-sm flex-1 text-center">
          {game.away_team_score}
        </Text>
      </View>

      {/* Home row */}
      <View className="flex-row items-center py-1.5 border-t border-border">
        <Text className="text-white font-bold text-sm w-14">
          {game.home_team.abbreviation}
        </Text>
        {[game.home_q1, game.home_q2, game.home_q3, game.home_q4].map((s, i) => (
          <Text key={i} className="text-white text-sm w-10 text-center">{s ?? '-'}</Text>
        ))}
        {hasOT && (
          <Text className="text-white text-sm w-10 text-center">{game.home_ot ?? '-'}</Text>
        )}
        <Text className="text-accent font-bold text-sm flex-1 text-center">
          {game.home_team_score}
        </Text>
      </View>
    </View>
  );
}

const STAT_COLUMNS: { key: SortKey; label: string; width: number }[] = [
  { key: 'minutes', label: 'MIN', width: 48 },
  { key: 'points', label: 'PTS', width: 40 },
  { key: 'rebounds', label: 'REB', width: 40 },
  { key: 'assists', label: 'AST', width: 40 },
  { key: 'steals', label: 'STL', width: 40 },
  { key: 'blocks', label: 'BLK', width: 40 },
  { key: 'turnovers', label: 'TO', width: 36 },
  { key: 'fgm', label: 'FG', width: 56 },
  { key: 'tpm', label: '3PT', width: 52 },
  { key: 'ftm', label: 'FT', width: 48 },
  { key: 'plus_minus', label: '+/-', width: 40 },
];

function formatFraction(made: number | null, attempted: number | null) {
  if (made == null || attempted == null) return '-';
  return `${made}-${attempted}`;
}

function getStatValue(player: BoxScore, key: SortKey): string {
  if (key === 'fgm') return formatFraction(player.fgm, player.fga);
  if (key === 'tpm') return formatFraction(player.tpm, player.tpa);
  if (key === 'ftm') return formatFraction(player.ftm, player.fta);
  if (key === 'minutes') return player.minutes ?? '-';
  if (key === 'plus_minus') {
    const v = player.plus_minus;
    if (v == null) return '-';
    return v > 0 ? `+${v}` : `${v}`;
  }
  const val = player[key];
  return val != null ? String(val) : '-';
}

function getSortNumber(player: BoxScore, key: SortKey): number {
  if (key === 'minutes') {
    const m = player.minutes;
    if (!m) return -1;
    const parts = m.split(':');
    return parseInt(parts[0]) * 60 + (parseInt(parts[1]) || 0);
  }
  const val = player[key];
  return typeof val === 'number' ? val : -1;
}

function BoxScoreSection({ boxScores, game, playerNameMap }: { boxScores: BoxScore[]; game: GameWithTeams; playerNameMap: Record<string, string> }) {
  const router = useRouter();
  const [activeTeamId, setActiveTeamId] = useState(game.away_team_id);
  const [sortKey, setSortKey] = useState<SortKey>('points');
  const [sortAsc, setSortAsc] = useState(false);

  const teamPlayers = useMemo(() => {
    const filtered = boxScores.filter((b) => b.team_id === activeTeamId);
    const starters = filtered.filter((b) => b.starter);
    const bench = filtered.filter((b) => !b.starter);

    const sortFn = (a: BoxScore, b: BoxScore) => {
      const aVal = getSortNumber(a, sortKey);
      const bVal = getSortNumber(b, sortKey);
      return sortAsc ? aVal - bVal : bVal - aVal;
    };

    return {
      starters: starters.sort(sortFn),
      bench: bench.sort(sortFn),
    };
  }, [boxScores, activeTeamId, sortKey, sortAsc]);

  if (boxScores.length === 0) return null;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const isAwayActive = activeTeamId === game.away_team_id;

  const renderPlayerRow = (player: BoxScore) => {
    const playerId = playerNameMap[player.player_name];
    const NameWrapper = playerId ? TouchableOpacity : View;
    return (
    <View key={player.id} className="flex-row items-center py-2 border-b border-border">
      <NameWrapper
        className="w-28 pr-2"
        {...(playerId ? { onPress: () => router.push(`/player/${playerId}`), activeOpacity: 0.6 } : {})}
      >
        <Text className={`text-xs ${playerId ? 'text-accent' : 'text-white'}`} numberOfLines={1}>
          {player.player_name}
        </Text>
      </NameWrapper>
      {STAT_COLUMNS.map((col) => (
        <View key={col.key} style={{ width: col.width }} className="items-center">
          <Text className={`text-xs ${col.key === sortKey ? 'text-accent font-semibold' : 'text-muted'}`}>
            {getStatValue(player, col.key)}
          </Text>
        </View>
      ))}
    </View>
  );
  };

  return (
    <View className="mx-4 mt-6">
      <Text className="text-white font-semibold text-base mb-3">Box Score</Text>

      {/* Team toggle */}
      <View className="flex-row bg-surface rounded-xl mb-3 p-1">
        <TouchableOpacity
          className={`flex-1 py-2.5 rounded-lg items-center ${isAwayActive ? 'bg-border' : ''}`}
          onPress={() => setActiveTeamId(game.away_team_id)}
          activeOpacity={0.7}
        >
          <Text className={`font-semibold text-sm ${isAwayActive ? 'text-white' : 'text-muted'}`}>
            {game.away_team.abbreviation}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-2.5 rounded-lg items-center ${!isAwayActive ? 'bg-border' : ''}`}
          onPress={() => setActiveTeamId(game.home_team_id)}
          activeOpacity={0.7}
        >
          <Text className={`font-semibold text-sm ${!isAwayActive ? 'text-white' : 'text-muted'}`}>
            {game.home_team.abbreviation}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable table */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Column headers */}
          <View className="flex-row items-center pb-2 border-b border-border">
            <View className="w-28 pr-2">
              <Text className="text-muted text-xs font-semibold">Player</Text>
            </View>
            {STAT_COLUMNS.map((col) => (
              <TouchableOpacity
                key={col.key}
                style={{ width: col.width }}
                className="items-center"
                onPress={() => handleSort(col.key)}
                activeOpacity={0.6}
              >
                <Text
                  className={`text-xs font-semibold ${
                    sortKey === col.key ? 'text-accent' : 'text-muted'
                  }`}
                >
                  {col.label}
                  {sortKey === col.key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Starters */}
          {teamPlayers.starters.map(renderPlayerRow)}

          {/* Bench divider */}
          {teamPlayers.bench.length > 0 && (
            <View className="py-1.5 border-b border-border">
              <Text className="text-muted text-xs font-semibold uppercase tracking-wider">
                Bench
              </Text>
            </View>
          )}

          {/* Bench players */}
          {teamPlayers.bench.map(renderPlayerRow)}
        </View>
      </ScrollView>
    </View>
  );
}

function getHighlightsUrl(game: GameWithTeams): string {
  if (game.highlights_url) return game.highlights_url;
  const d = new Date(game.game_date_utc);
  const month = d.toLocaleString('en-US', { month: 'short' });
  const day = d.getDate();
  const year = d.getFullYear();
  const query = `NBA+${game.away_team.abbreviation}+vs+${game.home_team.abbreviation}+${month}+${day}+${year}+highlights`;
  return `https://www.youtube.com/results?search_query=${query}`;
}

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showLogModal, setShowLogModal] = useState(false);
  const [showListModal, setShowListModal] = useState(false);

  const bookmarkMutation = useMutation({
    mutationFn: async (bookmarked: boolean) => {
      if (!user) return;
      if (bookmarked) {
        const { error } = await supabase
          .from('watchlist')
          .delete()
          .eq('user_id', user.id)
          .eq('game_id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('watchlist')
          .insert({ user_id: user.id, game_id: id });
        if (error) throw error;
      }
    },
    onMutate: async (bookmarked) => {
      await queryClient.cancelQueries({ queryKey: ['game-detail', id] });
      const prev = queryClient.getQueryData(['game-detail', id]);
      queryClient.setQueryData(['game-detail', id], (old: any) =>
        old ? { ...old, isBookmarked: !bookmarked } : old,
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['game-detail', id], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['game-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

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

  const { game, logs, myLog, communityAvg, boxScores, isBookmarked, playerNameMap } = data;
  const gamePlayedOrLive = game.status === 'final' || game.status === 'live';

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
              {game.playoff_round && (
                <View className="mt-1">
                  <PlayoffBadge round={game.playoff_round} size="md" />
                </View>
              )}
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

          {/* Arena & Attendance */}
          {(game.arena || game.attendance) && (
            <View className="mt-3 items-center">
              <Text className="text-muted text-xs">
                {[
                  game.arena,
                  game.attendance ? `${game.attendance.toLocaleString()} fans` : null,
                ]
                  .filter(Boolean)
                  .join(' \u00b7 ')}
              </Text>
            </View>
          )}

          {/* Community rating */}
          {communityAvg !== null && (
            <View className="mt-4 pt-4 border-t border-border flex-row items-center justify-center gap-2">
              <Text className="text-muted text-sm">Community avg</Text>
              <Text className="text-accent font-semibold">{communityAvg.toFixed(1)}</Text>
              <Text className="text-muted text-sm">({logs.length} {logs.length === 1 ? 'log' : 'logs'})</Text>
            </View>
          )}
        </View>

        {/* Quarter Scores */}
        <QuarterScoreTable game={game} />

        {/* Action Buttons */}
        {gamePlayedOrLive ? (
          <View className="mx-4 mt-4 flex-row gap-3">
            <TouchableOpacity
              className={`flex-1 rounded-xl py-4 items-center ${
                myLog ? 'bg-surface border border-accent' : 'bg-accent'
              }`}
              style={!myLog ? { backgroundColor: '#c9a84c' } : undefined}
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
              className="bg-surface border border-border rounded-xl w-12 py-4 items-center justify-center"
              onPress={() => bookmarkMutation.mutate(isBookmarked)}
              activeOpacity={0.8}
            >
              <Bookmark
                size={22}
                color="#c9a84c"
                fill={isBookmarked ? '#c9a84c' : 'transparent'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-surface border border-border rounded-xl w-12 py-4 items-center justify-center"
              onPress={() => setShowListModal(true)}
              activeOpacity={0.8}
            >
              <List size={22} color="#c9a84c" />
            </TouchableOpacity>
          </View>
        ) : (
          <View className="mx-4 mt-4 bg-surface border border-border rounded-xl py-4 items-center">
            <Text className="text-muted font-medium text-base">
              Tipoff at{' '}
              {new Date(game.game_date_utc).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
          </View>
        )}

        {/* Watch Highlights */}
        {game.status === 'final' && (
          <TouchableOpacity
            className="mx-4 mt-3 bg-surface border border-border rounded-xl py-4 flex-row items-center justify-center gap-2"
            onPress={() => Linking.openURL(getHighlightsUrl(game))}
            activeOpacity={0.8}
          >
            <Play size={18} color="#c9a84c" />
            <Text className="text-accent font-semibold text-base">Watch Highlights</Text>
          </TouchableOpacity>
        )}

        {/* Box Score */}
        <BoxScoreSection boxScores={boxScores} game={game} playerNameMap={playerNameMap} />

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
