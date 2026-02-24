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
  Share as RNShare,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { enrichLogs } from '@/lib/enrichLogs';
import { useAuthStore } from '@/lib/store/authStore';
import { List, Play, Bookmark, Share2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import GameCard from '@/components/GameCard';
import ErrorState from '@/components/ErrorState';
import LogModal from '@/components/LogModal';
import AddToListModal from '@/components/AddToListModal';
import TeamLogo from '@/components/TeamLogo';
import PlayoffBadge from '@/components/PlayoffBadge';
import RatingHistogram from '@/components/RatingHistogram';
import { GameDetailSkeleton } from '@/components/Skeleton';
import { gameUrl } from '@/lib/urls';
import type { GameWithTeams, GameLogWithGame, BoxScore } from '@/types/database';
import { PageContainer } from '@/components/PageContainer';
import { usePlayByPlay, type PlayByPlayAction } from '@/hooks/usePlayByPlay';

interface PredictionTally {
  [teamId: string]: number;
}

interface GameDetail {
  game: GameWithTeams;
  logs: GameLogWithGame[];
  myLog: GameLogWithGame | null;
  communityAvg: number | null;
  allRatings: number[];
  boxScores: BoxScore[];
  isBookmarked: boolean;
  playerNameMap: Record<string, string>; // player_name -> player_id
  myPrediction: string | null; // predicted_winner_team_id
  predictionTally: PredictionTally;
}

async function fetchGameDetail(gameId: string, userId: string): Promise<GameDetail> {
  const [gameRes, logsRes, boxRes, watchlistRes, myPredRes, allPredsRes] = await Promise.all([
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
    supabase
      .from('game_predictions')
      .select('predicted_winner_team_id')
      .eq('user_id', userId)
      .eq('game_id', gameId)
      .maybeSingle(),
    supabase
      .from('game_predictions')
      .select('predicted_winner_team_id')
      .eq('game_id', gameId),
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

  const allRatings = logs.filter((l) => l.rating !== null).map((l) => l.rating!);
  const communityAvg =
    allRatings.length > 0
      ? Math.round(allRatings.reduce((a, b) => a + b, 0) / allRatings.length) / 10
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

  // Build prediction tally
  const predictionTally: PredictionTally = {};
  for (const p of allPredsRes.data ?? []) {
    const tid = p.predicted_winner_team_id;
    predictionTally[tid] = (predictionTally[tid] ?? 0) + 1;
  }

  return {
    game: gameRes.data as unknown as GameWithTeams,
    logs,
    myLog,
    communityAvg,
    allRatings,
    boxScores: allBoxScores,
    isBookmarked: !!watchlistRes.data,
    playerNameMap,
    myPrediction: myPredRes.data?.predicted_winner_team_id ?? null,
    predictionTally,
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

  if (boxScores.length === 0) {
    return (
      <View className="items-center py-8">
        <Text className="text-muted text-sm">Box score not available</Text>
      </View>
    );
  }

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
    <View className="mx-4 mt-4">
      {/* Team toggle */}
      <View className="flex-row bg-surface rounded-xl mb-3 p-1 self-start">
        <TouchableOpacity
          className={`py-2.5 px-6 rounded-lg items-center ${isAwayActive ? 'bg-accent' : ''}`}
          style={isAwayActive ? { backgroundColor: '#c9a84c' } : undefined}
          onPress={() => setActiveTeamId(game.away_team_id)}
          activeOpacity={0.7}
        >
          <Text className={`font-bold text-sm ${isAwayActive ? 'text-background' : 'text-muted'}`}>
            {game.away_team.abbreviation}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`py-2.5 px-6 rounded-lg items-center ${!isAwayActive ? 'bg-accent' : ''}`}
          style={!isAwayActive ? { backgroundColor: '#c9a84c' } : undefined}
          onPress={() => setActiveTeamId(game.home_team_id)}
          activeOpacity={0.7}
        >
          <Text className={`font-bold text-sm ${!isAwayActive ? 'text-background' : 'text-muted'}`}>
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

function QuarterScoreTable({ game }: { game: GameWithTeams }) {
  if (game.home_q1 == null) return null;

  const hasOT = game.home_ot != null || game.away_ot != null;

  return (
    <View className="bg-surface border border-border mx-4 mt-4 rounded-2xl p-4">
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

function TeamComparisonStats({ boxScores, game }: { boxScores: BoxScore[]; game: GameWithTeams }) {
  const awayPlayers = boxScores.filter((b) => b.team_id === game.away_team_id);
  const homePlayers = boxScores.filter((b) => b.team_id === game.home_team_id);

  if (awayPlayers.length === 0 && homePlayers.length === 0) return null;

  const sum = (players: BoxScore[], key: keyof BoxScore) =>
    players.reduce((acc, p) => acc + ((p[key] as number) ?? 0), 0);

  const pct = (made: number, attempted: number) =>
    attempted > 0 ? ((made / attempted) * 100).toFixed(1) + '%' : '-';

  const awayFgm = sum(awayPlayers, 'fgm');
  const awayFga = sum(awayPlayers, 'fga');
  const homeFgm = sum(homePlayers, 'fgm');
  const homeFga = sum(homePlayers, 'fga');
  const awayTpm = sum(awayPlayers, 'tpm');
  const awayTpa = sum(awayPlayers, 'tpa');
  const homeTpm = sum(homePlayers, 'tpm');
  const homeTpa = sum(homePlayers, 'tpa');

  const stats = [
    { label: 'Total Rebounds', away: sum(awayPlayers, 'rebounds'), home: sum(homePlayers, 'rebounds') },
    { label: 'Assists', away: sum(awayPlayers, 'assists'), home: sum(homePlayers, 'assists') },
    { label: 'Steals', away: sum(awayPlayers, 'steals'), home: sum(homePlayers, 'steals') },
    { label: 'Blocks', away: sum(awayPlayers, 'blocks'), home: sum(homePlayers, 'blocks') },
    { label: 'Turnovers', away: sum(awayPlayers, 'turnovers'), home: sum(homePlayers, 'turnovers') },
    { label: 'FG%', away: pct(awayFgm, awayFga), home: pct(homeFgm, homeFga), isString: true },
    { label: '3P%', away: pct(awayTpm, awayTpa), home: pct(homeTpm, homeTpa), isString: true },
  ];

  return (
    <View className="mx-4 mt-4 bg-surface border border-border rounded-2xl p-4">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-accent font-bold text-sm w-16 text-center">
          {game.away_team.abbreviation}
        </Text>
        <Text className="text-muted text-xs font-semibold flex-1 text-center">Team Stats</Text>
        <Text className="text-accent font-bold text-sm w-16 text-center">
          {game.home_team.abbreviation}
        </Text>
      </View>
      {stats.map((stat) => {
        const awayVal = stat.isString ? stat.away : stat.away;
        const homeVal = stat.isString ? stat.home : stat.home;
        const awayHigher = !stat.isString && (stat.away as number) > (stat.home as number);
        const homeHigher = !stat.isString && (stat.home as number) > (stat.away as number);
        // For turnovers, lower is better
        const isTurnovers = stat.label === 'Turnovers';
        const awayBold = isTurnovers ? homeHigher : awayHigher;
        const homeBold = isTurnovers ? awayHigher : homeHigher;

        return (
          <View key={stat.label} className="flex-row items-center justify-between py-1.5 border-t border-border">
            <Text className={`text-sm w-16 text-center ${awayBold ? 'text-white font-bold' : 'text-muted'}`}>
              {String(awayVal)}
            </Text>
            <Text className="text-muted text-xs flex-1 text-center">{stat.label}</Text>
            <Text className={`text-sm w-16 text-center ${homeBold ? 'text-white font-bold' : 'text-muted'}`}>
              {String(homeVal)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function DetailsSection({ game }: { game: GameWithTeams }) {
  const details: { label: string; value: string }[] = [];

  details.push({ label: 'Date', value: formatDate(game.game_date_utc) });

  if (game.arena) details.push({ label: 'Arena', value: game.arena });
  if (game.attendance) details.push({ label: 'Attendance', value: game.attendance.toLocaleString() });

  const season = game.season;
  if (season) {
    const nextYear = (season.year + 1) % 100;
    details.push({ label: 'Season', value: `${season.year}-${nextYear.toString().padStart(2, '0')}` });
  }

  if (game.postseason) details.push({ label: 'Type', value: 'Playoffs' });
  if (game.playoff_round) details.push({ label: 'Round', value: game.playoff_round.replace(/_/g, ' ') });

  return (
    <View className="mx-4 mt-4 bg-surface border border-border rounded-2xl p-4">
      {details.map((item, i) => (
        <View key={item.label} className={`flex-row justify-between py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}>
          <Text className="text-muted text-sm">{item.label}</Text>
          <Text className="text-white text-sm font-medium">{item.value}</Text>
        </View>
      ))}
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

function PlayByPlaySection({
  game,
}: {
  game: GameWithTeams;
}) {
  const gameDate = game.game_date_utc?.slice(0, 10);
  const { data, isLoading, error } = usePlayByPlay(
    game.home_team.abbreviation,
    gameDate,
    game.status,
  );

  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);

  const actions = data?.actions ?? [];

  // Determine available periods
  const periods = useMemo(() => {
    const set = new Set(actions.map((a) => a.period));
    return Array.from(set).sort((a, b) => a - b);
  }, [actions]);

  // Default to latest period for live games (on first load)
  const activePeriod = selectedPeriod;

  const filteredActions = useMemo(() => {
    if (activePeriod == null) return actions;
    return actions.filter((a) => a.period === activePeriod);
  }, [actions, activePeriod]);

  // Reverse so most recent plays show first
  const displayActions = useMemo(
    () => [...filteredActions].reverse(),
    [filteredActions],
  );

  if (game.status === 'scheduled') {
    return (
      <View className="items-center py-8 mx-4">
        <Text className="text-muted text-sm">
          Plays will appear when the game starts
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View className="items-center py-8">
        <ActivityIndicator color="#c9a84c" size="small" />
      </View>
    );
  }

  if (error || actions.length === 0) {
    return (
      <View className="items-center py-8 mx-4">
        <Text className="text-muted text-sm">
          Play-by-play not available
        </Text>
      </View>
    );
  }

  const periodLabel = (p: number) => (p <= 4 ? `Q${p}` : `OT${p - 4}`);

  const isScoringPlay = (a: PlayByPlayAction) =>
    a.isFieldGoal && a.shotResult === 'Made';

  return (
    <View className="mx-4 mt-4">
      {/* Period filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mb-3"
      >
        <View className="flex-row gap-2">
          <TouchableOpacity
            className="py-1.5 px-3 rounded-lg"
            style={
              activePeriod == null ? { backgroundColor: '#c9a84c' } : undefined
            }
            onPress={() => setSelectedPeriod(null)}
            activeOpacity={0.7}
          >
            <Text
              className={`text-xs font-semibold ${
                activePeriod == null ? 'text-background' : 'text-muted'
              }`}
            >
              All
            </Text>
          </TouchableOpacity>
          {periods.map((p) => (
            <TouchableOpacity
              key={p}
              className="py-1.5 px-3 rounded-lg"
              style={
                activePeriod === p
                  ? { backgroundColor: '#c9a84c' }
                  : undefined
              }
              onPress={() => setSelectedPeriod(p)}
              activeOpacity={0.7}
            >
              <Text
                className={`text-xs font-semibold ${
                  activePeriod === p ? 'text-background' : 'text-muted'
                }`}
              >
                {periodLabel(p)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Play rows */}
      {displayActions.map((action) => (
        <View
          key={action.actionNumber}
          className={`flex-row py-2.5 border-b border-border ${
            isScoringPlay(action) ? 'bg-surface rounded-lg px-2 -mx-2' : ''
          }`}
        >
          {/* Left: team + clock */}
          <View className="w-20 flex-row items-start gap-1.5">
            {action.teamTricode ? (
              <View className="bg-surface rounded px-1.5 py-0.5">
                <Text className="text-accent text-xs font-bold">
                  {action.teamTricode}
                </Text>
              </View>
            ) : (
              <View className="w-9" />
            )}
            <Text className="text-muted text-xs mt-0.5">{action.clock}</Text>
          </View>

          {/* Right: description + score */}
          <View className="flex-1 ml-2">
            <Text className="text-white text-sm">{action.description}</Text>
            {isScoringPlay(action) && (
              <Text className="text-muted text-xs mt-0.5">
                {game.away_team.abbreviation} {action.scoreAway} -{' '}
                {action.scoreHome} {game.home_team.abbreviation}
              </Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

type GameTab = 'box_score' | 'reviews' | 'stats' | 'plays' | 'details';
const TABS: { key: GameTab; label: string }[] = [
  { key: 'box_score', label: 'Box Score' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'stats', label: 'Stats' },
  { key: 'plays', label: 'Plays' },
  { key: 'details', label: 'Details' },
];

type ReviewSort = 'recent' | 'popular';

export default function GameDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showLogModal, setShowLogModal] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [activeTab, setActiveTab] = useState<GameTab>('box_score');
  const [reviewSort, setReviewSort] = useState<ReviewSort>('recent');

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

  const predictionMutation = useMutation({
    mutationFn: async (teamId: string) => {
      if (!user) return;
      const current = data?.myPrediction;
      if (current === teamId) {
        // Remove prediction
        const { error } = await supabase
          .from('game_predictions')
          .delete()
          .eq('user_id', user.id)
          .eq('game_id', id);
        if (error) throw error;
      } else {
        // Upsert prediction
        const { error } = await supabase
          .from('game_predictions')
          .upsert(
            { user_id: user.id, game_id: id, predicted_winner_team_id: teamId },
            { onConflict: 'user_id,game_id' },
          );
        if (error) throw error;
      }
    },
    onMutate: async (teamId) => {
      await queryClient.cancelQueries({ queryKey: ['game-detail', id] });
      const prev = queryClient.getQueryData(['game-detail', id]);
      queryClient.setQueryData(['game-detail', id], (old: any) => {
        if (!old) return old;
        const currentPred = old.myPrediction;
        const tally = { ...old.predictionTally };
        if (currentPred) {
          tally[currentPred] = Math.max(0, (tally[currentPred] ?? 0) - 1);
        }
        if (currentPred === teamId) {
          return { ...old, myPrediction: null, predictionTally: tally };
        }
        tally[teamId] = (tally[teamId] ?? 0) + 1;
        return { ...old, myPrediction: teamId, predictionTally: tally };
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['game-detail', id], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['game-detail', id] });
    },
  });

  const sortedLogs = useMemo(() => {
    if (!data) return [];
    const logs = [...data.logs];
    if (reviewSort === 'popular') {
      logs.sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0));
    }
    return logs;
  }, [data?.logs, reviewSort]);

  if (isLoading) {
    return <GameDetailSkeleton />;
  }

  if (error || !data) {
    return <ErrorState message="Failed to load game details" onRetry={refetch} />;
  }

  const { game, logs, myLog, communityAvg, allRatings, boxScores, isBookmarked, playerNameMap, myPrediction, predictionTally } = data;
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
        <PageContainer>
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

          {/* Community rating + histogram */}
          {communityAvg !== null && (
            <View className="mt-4 pt-4 border-t border-border">
              <View className="flex-row items-center justify-center gap-2">
                <Text className="text-muted text-sm">Community avg</Text>
                <Text className="text-accent font-semibold">{communityAvg.toFixed(1)}</Text>
                <Text className="text-muted text-sm">({logs.length} {logs.length === 1 ? 'log' : 'logs'})</Text>
              </View>
              <RatingHistogram ratings={allRatings} />
            </View>
          )}
        </View>

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
            <TouchableOpacity
              className="bg-surface border border-border rounded-xl w-12 py-4 items-center justify-center"
              onPress={() => {
                const url = gameUrl(game.id);
                const message = `Check out ${game.away_team.abbreviation} @ ${game.home_team.abbreviation} on NBA Letterbox\n${url}`;
                RNShare.share(Platform.OS === 'ios' ? { message, url } : { message });
              }}
              activeOpacity={0.8}
            >
              <Share2 size={22} color="#c9a84c" />
            </TouchableOpacity>
          </View>
        ) : (
          <View className="mx-4 mt-4 bg-surface border border-border rounded-xl p-4">
            <Text className="text-muted text-xs text-center mb-3">
              Tipoff at{' '}
              {new Date(game.game_date_utc).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                timeZone: 'America/New_York',
              })}{' '}ET
            </Text>
            <Text className="text-white font-semibold text-center mb-3">
              Who wins?
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                className={`flex-1 items-center py-3 rounded-xl border ${
                  myPrediction === game.away_team_id
                    ? 'border-accent bg-accent/10'
                    : 'border-border'
                }`}
                onPress={() => predictionMutation.mutate(game.away_team_id)}
                activeOpacity={0.7}
              >
                <TeamLogo abbreviation={game.away_team.abbreviation} size={36} />
                <Text className={`font-bold text-sm mt-1 ${
                  myPrediction === game.away_team_id ? 'text-accent' : 'text-white'
                }`}>
                  {game.away_team.abbreviation}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className={`flex-1 items-center py-3 rounded-xl border ${
                  myPrediction === game.home_team_id
                    ? 'border-accent bg-accent/10'
                    : 'border-border'
                }`}
                onPress={() => predictionMutation.mutate(game.home_team_id)}
                activeOpacity={0.7}
              >
                <TeamLogo abbreviation={game.home_team.abbreviation} size={36} />
                <Text className={`font-bold text-sm mt-1 ${
                  myPrediction === game.home_team_id ? 'text-accent' : 'text-white'
                }`}>
                  {game.home_team.abbreviation}
                </Text>
              </TouchableOpacity>
            </View>
            {/* Community prediction split */}
            {(() => {
              const awayCount = predictionTally[game.away_team_id] ?? 0;
              const homeCount = predictionTally[game.home_team_id] ?? 0;
              const total = awayCount + homeCount;
              if (total === 0) return null;
              const awayPct = Math.round((awayCount / total) * 100);
              const homePct = 100 - awayPct;
              return (
                <View className="mt-3">
                  <View className="flex-row justify-between mb-1">
                    <Text className="text-muted text-xs">{game.away_team.abbreviation} {awayPct}%</Text>
                    <Text className="text-muted text-xs">{game.home_team.abbreviation} {homePct}%</Text>
                  </View>
                  <View className="h-2 bg-border rounded-full overflow-hidden flex-row">
                    <View className="h-full bg-accent rounded-l-full" style={{ width: `${awayPct}%` }} />
                  </View>
                  <Text className="text-muted text-xs text-center mt-1">{total} prediction{total !== 1 ? 's' : ''}</Text>
                </View>
              );
            })()}
          </View>
        )}

        {/* Prediction result (final/live games) */}
        {myPrediction && gamePlayedOrLive && (() => {
          const predictedTeam = myPrediction === game.home_team_id
            ? game.home_team
            : game.away_team;
          const isCorrect = game.status === 'final' && (() => {
            const homeWon = (game.home_team_score ?? 0) > (game.away_team_score ?? 0);
            return myPrediction === (homeWon ? game.home_team_id : game.away_team_id);
          })();
          const awayCount = predictionTally[game.away_team_id] ?? 0;
          const homeCount = predictionTally[game.home_team_id] ?? 0;
          const total = awayCount + homeCount;
          return (
            <View className="mx-4 mt-3 bg-surface border border-border rounded-xl p-3 flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <TeamLogo abbreviation={predictedTeam.abbreviation} size={20} />
                <Text className="text-white text-sm">
                  You predicted {predictedTeam.abbreviation}
                </Text>
                {game.status === 'final' && (
                  <Text className={`font-bold text-sm ${isCorrect ? 'text-green-500' : 'text-accent-red'}`}>
                    {isCorrect ? '\u2713' : '\u2717'}
                  </Text>
                )}
                {game.status === 'live' && (
                  <Text className="text-muted text-xs">(locked)</Text>
                )}
              </View>
              {total > 0 && (
                <Text className="text-muted text-xs">
                  {Math.round(((predictionTally[myPrediction] ?? 0) / total) * 100)}% picked
                </Text>
              )}
            </View>
          );
        })()}

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

        {/* Tab Bar */}
        <View className="flex-row mx-4 mt-4 bg-surface rounded-xl p-1">
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className="flex-1 py-2.5 rounded-lg items-center"
              style={activeTab === tab.key ? { backgroundColor: '#c9a84c' } : undefined}
              activeOpacity={0.7}
            >
              <Text
                className={`text-xs font-semibold ${
                  activeTab === tab.key ? 'text-background' : 'text-muted'
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        <View className="pb-8">
          {activeTab === 'box_score' && (
            <BoxScoreSection boxScores={boxScores} game={game} playerNameMap={playerNameMap} />
          )}

          {activeTab === 'reviews' && (
            <View className="px-4 pt-4">
              {/* Sort toggle */}
              {logs.length > 1 && (
                <View className="flex-row bg-surface rounded-xl p-1 self-start mb-3">
                  <TouchableOpacity
                    className="py-2 px-4 rounded-lg"
                    style={reviewSort === 'recent' ? { backgroundColor: '#c9a84c' } : undefined}
                    onPress={() => setReviewSort('recent')}
                    activeOpacity={0.7}
                  >
                    <Text className={`text-xs font-semibold ${reviewSort === 'recent' ? 'text-background' : 'text-muted'}`}>
                      Recent
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="py-2 px-4 rounded-lg"
                    style={reviewSort === 'popular' ? { backgroundColor: '#c9a84c' } : undefined}
                    onPress={() => setReviewSort('popular')}
                    activeOpacity={0.7}
                  >
                    <Text className={`text-xs font-semibold ${reviewSort === 'popular' ? 'text-background' : 'text-muted'}`}>
                      Popular
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {sortedLogs.length === 0 ? (
                <View className="items-center py-8">
                  <Text style={{ fontSize: 40 }} className="mb-2">✍️</Text>
                  <Text className="text-white font-semibold mb-1">No reviews yet</Text>
                  <Text className="text-muted text-sm">Be the first to log this game!</Text>
                </View>
              ) : (
                sortedLogs.map((log) => (
                  <GameCard key={log.id} log={log} showUser />
                ))
              )}
            </View>
          )}

          {activeTab === 'stats' && (
            <>
              <QuarterScoreTable game={game} />
              <TeamComparisonStats boxScores={boxScores} game={game} />
            </>
          )}

          {activeTab === 'plays' && (
            <PlayByPlaySection game={game} />
          )}

          {activeTab === 'details' && (
            <DetailsSection game={game} />
          )}
        </View>
        </PageContainer>
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
