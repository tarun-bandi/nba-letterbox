import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  RefreshControl,
} from 'react-native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Search as SearchIcon } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuthStore } from '@/lib/store/authStore';
import Avatar from '@/components/Avatar';
import TeamLogo from '@/components/TeamLogo';
import PlayoffBadge from '@/components/PlayoffBadge';
import type { GameWithTeams, Season, UserProfile, Player, Team } from '@/types/database';

const PAGE_SIZE = 20;

type SearchMode = 'games' | 'users' | 'players';

interface PlayerWithTeam extends Player {
  team: Team | null;
}

interface PlayersPage {
  players: PlayerWithTeam[];
  nextOffset: number | null;
}

async function searchPlayersPage(
  query: string,
  offset: number,
): Promise<PlayersPage> {
  const { data, error } = await supabase
    .from('players')
    .select('*, team:teams (*)')
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
    .order('last_name', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) throw error;

  const players = (data ?? []) as unknown as PlayerWithTeam[];
  return {
    players,
    nextOffset: players.length === PAGE_SIZE ? offset + PAGE_SIZE : null,
  };
}

async function fetchSeasons(): Promise<Season[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .order('year', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Season[];
}

interface GamesPage {
  games: GameWithTeams[];
  nextOffset: number | null;
  loggedGameIds: string[];
}

function parseMatchupQuery(raw: string): { away: string; home: string } | null {
  const m = raw.match(/^\s*(.+?)\s+(?:@|vs\.?|v)\s+(.+?)\s*$/i);
  if (!m) return null;
  return { away: m[1].trim(), home: m[2].trim() };
}

async function searchGamesPage(
  query: string,
  seasonId: string | null,
  offset: number,
  userId: string | null,
): Promise<GamesPage> {
  const matchup = parseMatchupQuery(query);

  let games: GameWithTeams[];

  if (matchup) {
    // Matchup search: find teams for each side in parallel
    const [awayRes, homeRes] = await Promise.all([
      supabase
        .from('teams')
        .select('id')
        .in('conference', ['East', 'West'])
        .or(
          `abbreviation.ilike.%${matchup.away}%,name.ilike.%${matchup.away}%,city.ilike.%${matchup.away}%,full_name.ilike.%${matchup.away}%`
        ),
      supabase
        .from('teams')
        .select('id')
        .in('conference', ['East', 'West'])
        .or(
          `abbreviation.ilike.%${matchup.home}%,name.ilike.%${matchup.home}%,city.ilike.%${matchup.home}%,full_name.ilike.%${matchup.home}%`
        ),
    ]);
    if (awayRes.error) throw awayRes.error;
    if (homeRes.error) throw homeRes.error;
    if (!awayRes.data?.length || !homeRes.data?.length)
      return { games: [], nextOffset: null, loggedGameIds: [] };

    const awayIds = awayRes.data.map((t) => t.id);
    const homeIds = homeRes.data.map((t) => t.id);
    const allIds = [...new Set([...awayIds, ...homeIds])];

    // Fetch games involving any of these teams
    let gamesQuery = supabase
      .from('games')
      .select(`
        *,
        home_team:teams!games_home_team_id_fkey (*),
        away_team:teams!games_away_team_id_fkey (*),
        season:seasons (*)
      `)
      .or(`home_team_id.in.(${allIds.join(',')}),away_team_id.in.(${allIds.join(',')})`)
      .neq('status', 'scheduled')
      .order('game_date_utc', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (seasonId) {
      gamesQuery = gamesQuery.eq('season_id', seasonId);
    }

    const { data, error } = await gamesQuery;
    if (error) throw error;

    // Client-side filter: both teams must be in the game
    const awaySet = new Set(awayIds);
    const homeSet = new Set(homeIds);
    games = ((data ?? []) as unknown as GameWithTeams[]).filter((g) => {
      const hasAway = awaySet.has(g.away_team_id) || awaySet.has(g.home_team_id);
      const hasHome = homeSet.has(g.away_team_id) || homeSet.has(g.home_team_id);
      return hasAway && hasHome;
    });
  } else {
    // Single-team search
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('id')
      .in('conference', ['East', 'West'])
      .or(
        `abbreviation.ilike.%${query}%,name.ilike.%${query}%,city.ilike.%${query}%,full_name.ilike.%${query}%`
      );

    if (teamsError) throw teamsError;
    if (!teams || teams.length === 0) return { games: [], nextOffset: null, loggedGameIds: [] };

    const teamIds = teams.map((t) => t.id);

    let gamesQuery = supabase
      .from('games')
      .select(`
        *,
        home_team:teams!games_home_team_id_fkey (*),
        away_team:teams!games_away_team_id_fkey (*),
        season:seasons (*)
      `)
      .or(`home_team_id.in.(${teamIds.join(',')}),away_team_id.in.(${teamIds.join(',')})`)
      .neq('status', 'scheduled')
      .order('game_date_utc', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (seasonId) {
      gamesQuery = gamesQuery.eq('season_id', seasonId);
    }

    const { data, error } = await gamesQuery;
    if (error) throw error;

    games = (data ?? []) as unknown as GameWithTeams[];
  }

  // Check which games the user has already logged
  let loggedGameIds: string[] = [];
  if (userId && games.length > 0) {
    const gameIds = games.map((g) => g.id);
    const { data: userLogs } = await supabase
      .from('game_logs')
      .select('game_id')
      .eq('user_id', userId)
      .in('game_id', gameIds);
    loggedGameIds = (userLogs ?? []).map((l) => l.game_id);
  }

  return {
    games,
    nextOffset: games.length === PAGE_SIZE ? offset + PAGE_SIZE : null,
    loggedGameIds,
  };
}

interface UsersPage {
  users: UserProfile[];
  nextOffset: number | null;
}

async function searchUsersPage(
  query: string,
  offset: number,
): Promise<UsersPage> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .or(`display_name.ilike.%${query}%,handle.ilike.%${query}%`)
    .order('display_name', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) throw error;

  const users = (data ?? []) as UserProfile[];
  return {
    users,
    nextOffset: users.length === PAGE_SIZE ? offset + PAGE_SIZE : null,
  };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatSeasonLabel(year: number): string {
  const nextYear = (year + 1) % 100;
  return `${year}-${nextYear.toString().padStart(2, '0')}`;
}

export default function SearchScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('games');
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const debouncedQuery = useDebounce(query, 350);

  const { data: seasons } = useQuery({
    queryKey: ['seasons'],
    queryFn: fetchSeasons,
  });

  const gamesQuery = useInfiniteQuery({
    queryKey: ['games-search', debouncedQuery, selectedSeasonId],
    queryFn: ({ pageParam = 0 }) =>
      searchGamesPage(debouncedQuery, selectedSeasonId, pageParam, user?.id ?? null),
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    enabled: searchMode === 'games' && debouncedQuery.trim().length >= 2,
  });

  const usersQuery = useInfiniteQuery({
    queryKey: ['users-search', debouncedQuery],
    queryFn: ({ pageParam = 0 }) => searchUsersPage(debouncedQuery, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    enabled: searchMode === 'users' && debouncedQuery.trim().length >= 2,
  });

  const playersQuery = useInfiniteQuery({
    queryKey: ['players-search', debouncedQuery],
    queryFn: ({ pageParam = 0 }) => searchPlayersPage(debouncedQuery, pageParam),
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    enabled: searchMode === 'players' && debouncedQuery.trim().length >= 2,
  });

  const allGames = gamesQuery.data?.pages.flatMap((p) => p.games) ?? [];
  const loggedGameIds = new Set(gamesQuery.data?.pages.flatMap((p) => p.loggedGameIds) ?? []);
  const allUsers = usersQuery.data?.pages.flatMap((p) => p.users) ?? [];
  const allPlayers = playersQuery.data?.pages.flatMap((p) => p.players) ?? [];
  const isLoading = searchMode === 'games'
    ? gamesQuery.isLoading
    : searchMode === 'users'
    ? usersQuery.isLoading
    : playersQuery.isLoading;
  const isFetchingNext = searchMode === 'games'
    ? gamesQuery.isFetchingNextPage
    : searchMode === 'users'
    ? usersQuery.isFetchingNextPage
    : playersQuery.isFetchingNextPage;

  return (
    <View className="flex-1 bg-background">
      {/* Search bar */}
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center bg-surface border border-border rounded-xl px-3 gap-2">
          <SearchIcon size={18} color="#6b7280" />
          <TextInput
            className="flex-1 py-3.5 text-white text-base"
            placeholder={
              searchMode === 'games'
                ? 'Search games (e.g. LAL, MIA @ BOS)'
                : searchMode === 'users'
                ? 'Search users by name or handle'
                : 'Search players by name'
            }
            placeholderTextColor="#6b7280"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
      </View>

      {/* Mode toggle */}
      <View className="flex-row px-4 pb-2 gap-2">
        {(['games', 'users', 'players'] as const).map((mode) => (
          <TouchableOpacity
            key={mode}
            onPress={() => setSearchMode(mode)}
            className={`px-4 py-1.5 rounded-full border ${
              searchMode === mode
                ? 'bg-accent border-accent'
                : 'bg-background border-border'
            }`}
          >
            <Text
              className={`text-sm font-medium capitalize ${
                searchMode === mode ? 'text-background' : 'text-muted'
              }`}
            >
              {mode}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Season filter pills (games mode only) */}
      {searchMode === 'games' && seasons && seasons.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-4 pb-2"
          contentContainerStyle={{ gap: 6, alignItems: 'center' }}
          style={{ flexGrow: 0 }}
        >
          <TouchableOpacity
            onPress={() => setSelectedSeasonId(null)}
            className={`px-3 py-1.5 rounded-full border ${
              selectedSeasonId === null
                ? 'bg-accent border-accent'
                : 'bg-background border-border'
            }`}
          >
            <Text
              className={`text-sm font-medium ${
                selectedSeasonId === null ? 'text-background' : 'text-muted'
              }`}
            >
              All
            </Text>
          </TouchableOpacity>
          {seasons.map((season) => (
            <TouchableOpacity
              key={season.id}
              onPress={() => setSelectedSeasonId(season.id)}
              className={`px-3 py-1.5 rounded-full border ${
                selectedSeasonId === season.id
                  ? 'bg-accent border-accent'
                  : 'bg-background border-border'
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  selectedSeasonId === season.id ? 'text-background' : 'text-muted'
                }`}
              >
                {formatSeasonLabel(season.year)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Results */}
      {isLoading && debouncedQuery.length >= 2 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#c9a84c" />
        </View>
      ) : searchMode === 'players' ? (
        <FlatList
          data={allPlayers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="mx-4 my-1 bg-surface border border-border rounded-xl p-4 flex-row items-center gap-3"
              onPress={() => router.push(`/player/${item.id}`)}
              activeOpacity={0.7}
            >
              <View className="flex-1">
                <Text className="text-white font-semibold text-base">
                  {item.first_name} {item.last_name}
                </Text>
                <View className="flex-row items-center gap-2 mt-0.5">
                  {item.position && (
                    <Text className="text-accent text-xs font-semibold">{item.position}</Text>
                  )}
                  {item.team && (
                    <View className="flex-row items-center gap-1">
                      <TeamLogo abbreviation={(item.team as Team).abbreviation} size={14} />
                      <Text className="text-muted text-xs">
                        {(item.team as Team).abbreviation}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            debouncedQuery.length >= 2 ? (
              <View className="flex-1 items-center justify-center pt-16">
                <Text style={{ fontSize: 48 }} className="mb-3">{'\u{1F3C0}'}</Text>
                <Text className="text-muted">No players found for "{debouncedQuery}"</Text>
              </View>
            ) : (
              <View className="flex-1 items-center justify-center pt-16 px-6">
                <Text style={{ fontSize: 48 }} className="mb-3">{'\u{1F3C0}'}</Text>
                <Text className="text-white text-lg font-semibold mb-2">Find players</Text>
                <Text className="text-muted text-center">
                  Search for NBA players by name
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            isFetchingNext ? (
              <View className="py-4">
                <ActivityIndicator color="#c9a84c" />
              </View>
            ) : null
          }
          onEndReached={() => {
            if (playersQuery.hasNextPage && !playersQuery.isFetchingNextPage) {
              playersQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
          onScrollBeginDrag={Keyboard.dismiss}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            debouncedQuery.length >= 2 ? (
              <RefreshControl
                refreshing={playersQuery.isRefetching && !playersQuery.isFetchingNextPage}
                onRefresh={() => playersQuery.refetch()}
                tintColor="#c9a84c"
              />
            ) : undefined
          }
        />
      ) : searchMode === 'games' ? (
        <FlatList
          data={allGames}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="mx-4 my-1 bg-surface border border-border rounded-xl p-4"
              onPress={() => router.push(`/game/${item.id}`)}
              activeOpacity={0.7}
            >
              <View className="flex-row justify-between items-center">
                <View className="flex-row items-center gap-2">
                  <TeamLogo abbreviation={item.away_team.abbreviation} size={24} />
                  <Text className="text-white font-semibold text-base">
                    {item.away_team.abbreviation}
                  </Text>
                  <Text className="text-muted font-semibold text-base">@</Text>
                  <TeamLogo abbreviation={item.home_team.abbreviation} size={24} />
                  <Text className="text-white font-semibold text-base">
                    {item.home_team.abbreviation}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  {item.playoff_round && <PlayoffBadge round={item.playoff_round} />}
                  {loggedGameIds.has(item.id) && (
                    <View className="bg-accent/20 border border-accent/40 rounded-full px-2 py-0.5">
                      <Text className="text-accent text-xs font-medium">Logged ✓</Text>
                    </View>
                  )}
                  <Text className="text-muted text-sm">
                    {item.home_team_score !== null
                      ? `${item.away_team_score}–${item.home_team_score}`
                      : item.status}
                  </Text>
                </View>
              </View>
              <View className="flex-row justify-between mt-1">
                <Text className="text-muted text-sm">
                  {item.away_team.full_name} vs {item.home_team.full_name}
                </Text>
                <Text className="text-muted text-sm">
                  {formatDate(item.game_date_utc)}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            debouncedQuery.length >= 2 ? (
              <View className="flex-1 items-center justify-center pt-16">
                <Text style={{ fontSize: 48 }} className="mb-3">🔍</Text>
                <Text className="text-muted">No games found for "{debouncedQuery}"</Text>
              </View>
            ) : (
              <View className="flex-1 items-center justify-center pt-16 px-6">
                <Text style={{ fontSize: 48 }} className="mb-3">🏟️</Text>
                <Text className="text-white text-lg font-semibold mb-2">Search for games</Text>
                <Text className="text-muted text-center">
                  Search by team abbreviation or city (e.g. LAL, Warriors, Boston)
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            isFetchingNext ? (
              <View className="py-4">
                <ActivityIndicator color="#c9a84c" />
              </View>
            ) : null
          }
          onEndReached={() => {
            if (gamesQuery.hasNextPage && !gamesQuery.isFetchingNextPage) {
              gamesQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
          onScrollBeginDrag={Keyboard.dismiss}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            debouncedQuery.length >= 2 ? (
              <RefreshControl
                refreshing={gamesQuery.isRefetching && !gamesQuery.isFetchingNextPage}
                onRefresh={() => gamesQuery.refetch()}
                tintColor="#c9a84c"
              />
            ) : undefined
          }
        />
      ) : (
        <FlatList
          data={allUsers}
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="mx-4 my-1 bg-surface border border-border rounded-xl p-4 flex-row items-center gap-3"
              onPress={() => router.push(`/user/${item.handle}`)}
              activeOpacity={0.7}
            >
              <Avatar
                url={item.avatar_url}
                name={item.display_name}
                size={40}
              />
              <View className="flex-1">
                <Text className="text-white font-semibold text-base">
                  {item.display_name}
                </Text>
                <Text className="text-muted text-sm">@{item.handle}</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            debouncedQuery.length >= 2 ? (
              <View className="flex-1 items-center justify-center pt-16">
                <Text style={{ fontSize: 48 }} className="mb-3">👤</Text>
                <Text className="text-muted">No users found for "{debouncedQuery}"</Text>
              </View>
            ) : (
              <View className="flex-1 items-center justify-center pt-16 px-6">
                <Text style={{ fontSize: 48 }} className="mb-3">👤</Text>
                <Text className="text-white text-lg font-semibold mb-2">Find people</Text>
                <Text className="text-muted text-center">
                  Search for users by display name or handle
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            isFetchingNext ? (
              <View className="py-4">
                <ActivityIndicator color="#c9a84c" />
              </View>
            ) : null
          }
          onEndReached={() => {
            if (usersQuery.hasNextPage && !usersQuery.isFetchingNextPage) {
              usersQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
          onScrollBeginDrag={Keyboard.dismiss}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            debouncedQuery.length >= 2 ? (
              <RefreshControl
                refreshing={usersQuery.isRefetching && !usersQuery.isFetchingNextPage}
                onRefresh={() => usersQuery.refetch()}
                tintColor="#c9a84c"
              />
            ) : undefined
          }
        />
      )}
    </View>
  );
}
