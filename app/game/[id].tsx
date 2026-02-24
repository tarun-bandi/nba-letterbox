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
import { getProvider } from '@/lib/providers';
import type { BoxScoreColumnDef, TeamComparisonStatDef } from '@/lib/providers';
import { List, Play, Bookmark } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import GameCard from '@/components/GameCard';
import ErrorState from '@/components/ErrorState';
import LogModal from '@/components/LogModal';
import AddToListModal from '@/components/AddToListModal';
import TeamLogo from '@/components/TeamLogo';
import PlayoffBadge from '@/components/PlayoffBadge';
import RatingHistogram from '@/components/RatingHistogram';
import type { GameWithTeams, GameLogWithGame, BoxScore, Sport, PeriodScores } from '@/types/database';
import { PageContainer } from '@/components/PageContainer';
import { usePlayByPlay, type PlayByPlayAction } from '@/hooks/usePlayByPlay';

interface GameDetail {
  game: GameWithTeams;
  logs: GameLogWithGame[];
  myLog: GameLogWithGame | null;
  communityAvg: number | null;
  allRatings: number[];
  boxScores: BoxScore[];
  isBookmarked: boolean;
  playerNameMap: Record<string, string>;
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
    allRatings,
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

// ─── Generic stat value helpers ─────────────────────────────────────────────

function getBoxStatValue(player: BoxScore, col: BoxScoreColumnDef): string {
  const stats = player.stats ?? {};
  // For NBA, fall back to typed columns for backwards compatibility
  const get = (key: string): any => stats[key] ?? (player as any)[key];

  if (col.format === 'fraction' && col.fractionKeys) {
    const made = get(col.fractionKeys.made);
    const attempted = get(col.fractionKeys.attempted);
    if (made == null || attempted == null) return '-';
    return `${made}-${attempted}`;
  }
  if (col.format === 'plusMinus') {
    const v = get(col.key);
    if (v == null) return '-';
    return v > 0 ? `+${v}` : `${v}`;
  }
  if (col.format === 'string') {
    return get(col.key) ?? '-';
  }
  const val = get(col.key);
  return val != null ? String(val) : '-';
}

function getBoxSortNumber(player: BoxScore, col: BoxScoreColumnDef): number {
  const stats = player.stats ?? {};
  const get = (key: string): any => stats[key] ?? (player as any)[key];

  if (col.format === 'string' && col.key === 'minutes') {
    const m = get('minutes');
    if (!m) return -1;
    const parts = String(m).split(':');
    return parseInt(parts[0]) * 60 + (parseInt(parts[1]) || 0);
  }
  const val = get(col.key);
  return typeof val === 'number' ? val : -1;
}

// ─── BoxScoreSection ────────────────────────────────────────────────────────

function BoxScoreSection({ boxScores, game, playerNameMap }: { boxScores: BoxScore[]; game: GameWithTeams; playerNameMap: Record<string, string> }) {
  const router = useRouter();
  const sport: Sport = game.sport ?? 'nba';
  const columns = getProvider(sport).getBoxScoreColumns();
  const [activeTeamId, setActiveTeamId] = useState(game.away_team_id);
  const [sortColIdx, setSortColIdx] = useState(() => {
    // Default sort: 'points' for NBA, 'passing_yds' for NFL, fallback to first
    const defaultKey = sport === 'nba' ? 'points' : 'passing_yds';
    const idx = columns.findIndex((c) => c.key === defaultKey);
    return idx >= 0 ? idx : 0;
  });
  const [sortAsc, setSortAsc] = useState(false);

  const sortCol = columns[sortColIdx];

  const teamPlayers = useMemo(() => {
    const filtered = boxScores.filter((b) => b.team_id === activeTeamId);
    const starters = filtered.filter((b) => b.starter);
    const bench = filtered.filter((b) => !b.starter);

    const sortFn = (a: BoxScore, b: BoxScore) => {
      const aVal = getBoxSortNumber(a, sortCol);
      const bVal = getBoxSortNumber(b, sortCol);
      return sortAsc ? aVal - bVal : bVal - aVal;
    };

    return {
      starters: starters.sort(sortFn),
      bench: bench.sort(sortFn),
    };
  }, [boxScores, activeTeamId, sortCol, sortAsc]);

  if (boxScores.length === 0) {
    return (
      <View className="items-center py-8">
        <Text className="text-muted text-sm">Box score not available</Text>
      </View>
    );
  }

  const handleSort = (idx: number) => {
    if (sortColIdx === idx) {
      setSortAsc(!sortAsc);
    } else {
      setSortColIdx(idx);
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
      {columns.map((col, idx) => (
        <View key={col.key} style={{ width: col.width }} className="items-center">
          <Text className={`text-xs ${idx === sortColIdx ? 'text-accent font-semibold' : 'text-muted'}`}>
            {getBoxStatValue(player, col)}
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
            {columns.map((col, idx) => (
              <TouchableOpacity
                key={col.key}
                style={{ width: col.width }}
                className="items-center"
                onPress={() => handleSort(idx)}
                activeOpacity={0.6}
              >
                <Text
                  className={`text-xs font-semibold ${
                    sortColIdx === idx ? 'text-accent' : 'text-muted'
                  }`}
                >
                  {col.label}
                  {sortColIdx === idx ? (sortAsc ? ' \u2191' : ' \u2193') : ''}
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

// ─── PeriodScoreTable ───────────────────────────────────────────────────────

function PeriodScoreTable({ game }: { game: GameWithTeams }) {
  const sport: Sport = game.sport ?? 'nba';
  const provider = getProvider(sport);
  const periodLabels = provider.getPeriodLabels();

  // Use period_scores JSONB if available, otherwise fall back to individual columns
  const ps: PeriodScores | null = game.period_scores ?? buildPeriodScoresFromColumns(game);
  if (!ps) return null;

  const hasOT = ps.ot && ps.ot.length > 0;

  return (
    <View className="bg-surface border border-border mx-4 mt-4 rounded-2xl p-4">
      {/* Header */}
      <View className="flex-row mb-2">
        <View className="w-14" />
        {periodLabels.map((q) => (
          <Text key={q} className="text-muted text-xs font-semibold w-10 text-center">
            {q}
          </Text>
        ))}
        {hasOT && ps.ot.map((_, i) => (
          <Text key={`ot-${i}`} className="text-muted text-xs font-semibold w-10 text-center">
            {ps.ot.length === 1 ? 'OT' : `OT${i + 1}`}
          </Text>
        ))}
        <Text className="text-muted text-xs font-semibold flex-1 text-center">Final</Text>
      </View>

      {/* Away row */}
      <View className="flex-row items-center py-1.5">
        <Text className="text-white font-bold text-sm w-14">
          {game.away_team.abbreviation}
        </Text>
        {ps.away.map((s, i) => (
          <Text key={i} className="text-white text-sm w-10 text-center">{s ?? '-'}</Text>
        ))}
        {hasOT && ps.ot.map((ot, i) => (
          <Text key={`ot-${i}`} className="text-white text-sm w-10 text-center">{ot.away ?? '-'}</Text>
        ))}
        <Text className="text-accent font-bold text-sm flex-1 text-center">
          {game.away_team_score}
        </Text>
      </View>

      {/* Home row */}
      <View className="flex-row items-center py-1.5 border-t border-border">
        <Text className="text-white font-bold text-sm w-14">
          {game.home_team.abbreviation}
        </Text>
        {ps.home.map((s, i) => (
          <Text key={i} className="text-white text-sm w-10 text-center">{s ?? '-'}</Text>
        ))}
        {hasOT && ps.ot.map((ot, i) => (
          <Text key={`ot-${i}`} className="text-white text-sm w-10 text-center">{ot.home ?? '-'}</Text>
        ))}
        <Text className="text-accent font-bold text-sm flex-1 text-center">
          {game.home_team_score}
        </Text>
      </View>
    </View>
  );
}

/** Build PeriodScores from legacy home_q1..home_ot columns */
function buildPeriodScoresFromColumns(game: GameWithTeams): PeriodScores | null {
  if (game.home_q1 == null) return null;
  const ot: { home: number; away: number }[] = [];
  if (game.home_ot != null || game.away_ot != null) {
    ot.push({ home: game.home_ot ?? 0, away: game.away_ot ?? 0 });
  }
  return {
    home: [game.home_q1 ?? 0, game.home_q2 ?? 0, game.home_q3 ?? 0, game.home_q4 ?? 0],
    away: [game.away_q1 ?? 0, game.away_q2 ?? 0, game.away_q3 ?? 0, game.away_q4 ?? 0],
    ot,
  };
}

// ─── TeamComparisonStats ────────────────────────────────────────────────────

function TeamComparisonStats({ boxScores, game }: { boxScores: BoxScore[]; game: GameWithTeams }) {
  const sport: Sport = game.sport ?? 'nba';
  const provider = getProvider(sport);
  const statDefs = provider.getTeamComparisonStats();

  const awayPlayers = boxScores.filter((b) => b.team_id === game.away_team_id);
  const homePlayers = boxScores.filter((b) => b.team_id === game.home_team_id);

  if (awayPlayers.length === 0 && homePlayers.length === 0) return null;

  const sum = (players: BoxScore[], key: string) =>
    players.reduce((acc, p) => {
      const val = (p.stats ?? {})[key] ?? (p as any)[key];
      return acc + ((typeof val === 'number' ? val : 0));
    }, 0);

  const pct = (made: number, attempted: number) =>
    attempted > 0 ? ((made / attempted) * 100).toFixed(1) + '%' : '-';

  const stats = statDefs.map((def) => {
    if (def.pctKeys) {
      const awayMade = sum(awayPlayers, def.pctKeys.made);
      const awayAtt = sum(awayPlayers, def.pctKeys.attempted);
      const homeMade = sum(homePlayers, def.pctKeys.made);
      const homeAtt = sum(homePlayers, def.pctKeys.attempted);
      return {
        label: def.label,
        away: pct(awayMade, awayAtt),
        home: pct(homeMade, homeAtt),
        isString: true,
        lowerIsBetter: false,
      };
    }
    return {
      label: def.label,
      away: sum(awayPlayers, def.key),
      home: sum(homePlayers, def.key),
      isString: false,
      lowerIsBetter: def.lowerIsBetter ?? false,
    };
  });

  return (
    <View className="mx-4 mt-4 bg-surface border border-border rounded-2xl p-4">
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
        const awayHigher = !stat.isString && (stat.away as number) > (stat.home as number);
        const homeHigher = !stat.isString && (stat.home as number) > (stat.away as number);
        const awayBold = stat.lowerIsBetter ? homeHigher : awayHigher;
        const homeBold = stat.lowerIsBetter ? awayHigher : homeHigher;

        return (
          <View key={stat.label} className="flex-row items-center justify-between py-1.5 border-t border-border">
            <Text className={`text-sm w-16 text-center ${awayBold ? 'text-white font-bold' : 'text-muted'}`}>
              {String(stat.away)}
            </Text>
            <Text className="text-muted text-xs flex-1 text-center">{stat.label}</Text>
            <Text className={`text-sm w-16 text-center ${homeBold ? 'text-white font-bold' : 'text-muted'}`}>
              {String(stat.home)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── DetailsSection ─────────────────────────────────────────────────────────

function DetailsSection({ game }: { game: GameWithTeams }) {
  const sport: Sport = game.sport ?? 'nba';
  const details: { label: string; value: string }[] = [];

  details.push({ label: 'Date', value: formatDate(game.game_date_utc) });
  details.push({ label: 'Sport', value: sport.toUpperCase() });

  if (game.arena) details.push({ label: 'Arena', value: game.arena });
  if (game.attendance) details.push({ label: 'Attendance', value: game.attendance.toLocaleString() });

  const season = game.season;
  if (season) {
    const nextYear = (season.year + 1) % 100;
    details.push({ label: 'Season', value: `${season.year}-${nextYear.toString().padStart(2, '0')}` });
  }

  if (game.postseason) details.push({ label: 'Type', value: 'Playoffs' });
  if (game.playoff_round) {
    const label = getProvider(sport).getPlayoffRoundLabel(game.playoff_round);
    details.push({ label: 'Round', value: label });
  }

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

// ─── Highlights ─────────────────────────────────────────────────────────────

function getHighlightsUrl(game: GameWithTeams): string {
  if (game.highlights_url) return game.highlights_url;
  const d = new Date(game.game_date_utc);
  const month = d.toLocaleString('en-US', { month: 'short' });
  const day = d.getDate();
  const year = d.getFullYear();
  const sportLabel = (game.sport ?? 'nba').toUpperCase();
  const query = `${sportLabel}+${game.away_team.abbreviation}+vs+${game.home_team.abbreviation}+${month}+${day}+${year}+highlights`;
  return `https://www.youtube.com/results?search_query=${query}`;
}

// ─── PlayByPlaySection ──────────────────────────────────────────────────────

function PlayByPlaySection({ game }: { game: GameWithTeams }) {
  const sport: Sport = game.sport ?? 'nba';
  const gameDate = game.game_date_utc?.slice(0, 10);
  const { data, isLoading, error } = usePlayByPlay(
    game.home_team.abbreviation,
    gameDate,
    game.status,
    sport,
  );

  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);

  const actions = data?.actions ?? [];

  const periods = useMemo(() => {
    const set = new Set(actions.map((a) => a.period));
    return Array.from(set).sort((a, b) => a - b);
  }, [actions]);

  const activePeriod = selectedPeriod;

  const filteredActions = useMemo(() => {
    if (activePeriod == null) return actions;
    return actions.filter((a) => a.period === activePeriod);
  }, [actions, activePeriod]);

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

// ─── Main Screen ────────────────────────────────────────────────────────────

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

  const sortedLogs = useMemo(() => {
    if (!data) return [];
    const logs = [...data.logs];
    if (reviewSort === 'popular') {
      logs.sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0));
    }
    return logs;
  }, [data?.logs, reviewSort]);

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

  const { game, logs, myLog, communityAvg, allRatings, boxScores, isBookmarked, playerNameMap } = data;
  const gamePlayedOrLive = game.status === 'final' || game.status === 'live';
  const sport: Sport = game.sport ?? 'nba';

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
              <TeamLogo abbreviation={game.away_team.abbreviation} sport={sport} size={64} />
              <Text className="text-muted text-sm mt-2">{game.away_team.city}</Text>
              <Text className="text-white text-2xl font-bold">
                {game.away_team.abbreviation}
              </Text>
              <Text className="text-accent text-4xl font-bold mt-2">
                {game.away_team_score ?? '\u2014'}
              </Text>
            </View>

            {/* Center */}
            <View className="items-center px-4">
              <Text className="text-muted text-xs uppercase tracking-wider">
                {game.status === 'final' ? 'Final' : game.status}
              </Text>
              {game.playoff_round && (
                <View className="mt-1">
                  <PlayoffBadge round={game.playoff_round} sport={sport} size="md" />
                </View>
              )}
              <Text className="text-border text-2xl font-light mt-1">@</Text>
              <Text className="text-muted text-xs mt-1">
                {formatDate(game.game_date_utc)}
              </Text>
            </View>

            {/* Home Team */}
            <View className="flex-1 items-center">
              <TeamLogo abbreviation={game.home_team.abbreviation} sport={sport} size={64} />
              <Text className="text-muted text-sm mt-2">{game.home_team.city}</Text>
              <Text className="text-white text-2xl font-bold">
                {game.home_team.abbreviation}
              </Text>
              <Text className="text-accent text-4xl font-bold mt-2">
                {game.home_team_score ?? '\u2014'}
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
                  <Text style={{ fontSize: 40 }} className="mb-2">{'\u270d\ufe0f'}</Text>
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
              <PeriodScoreTable game={game} />
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
