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
import PlayerAvatar from '@/components/PlayerAvatar';
import TeamLogo from '@/components/TeamLogo';
import TeamGrid from '@/components/TeamGrid';
import SelectedTeamsBar from '@/components/SelectedTeamsBar';
import SearchGameCard from '@/components/SearchGameCard';
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

async function searchGamesByTeam(
  teamId1: string,
  teamId2: string | null,
  seasonId: string | null,
  offset: number,
  userId: string | null,
): Promise<GamesPage> {
  let gamesQuery = supabase
    .from('games')
    .select(`
      *,
      home_team:teams!games_home_team_id_fkey (*),
      away_team:teams!games_away_team_id_fkey (*),
      season:seasons (*)
    `)
    .eq('status', 'final')
    .order('game_date_utc', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (teamId2) {
    // Matchup: both teams must be in the game (either side)
    gamesQuery = gamesQuery
      .or(`home_team_id.eq.${teamId1},away_team_id.eq.${teamId1}`)
      .or(`home_team_id.eq.${teamId2},away_team_id.eq.${teamId2}`);
  } else {
    // Single team
    gamesQuery = gamesQuery
      .or(`home_team_id.eq.${teamId1},away_team_id.eq.${teamId1}`);
  }

  if (seasonId) {
    gamesQuery = gamesQuery.eq('season_id', seasonId);
  }

  const { data, error } = await gamesQuery;
  if (error) throw error;

  let games = (data ?? []) as unknown as GameWithTeams[];

  // For matchup, client-side verify both teams are present (supabase .or() across two calls is additive)
  if (teamId2) {
    games = games.filter((g) => {
      const teams = [g.home_team_id, g.away_team_id];
      return teams.includes(teamId1) && teams.includes(teamId2);
    });
  }

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
  const [selectedTeam1, setSelectedTeam1] = useState<Team | null>(null);
  const [selectedTeam2, setSelectedTeam2] = useState<Team | null>(null);
  const [pickingOpponent, setPickingOpponent] = useState(false);
  const debouncedQuery = useDebounce(query, 350);

  const searchPhase = selectedTeam2
    ? 'matchup'
    : selectedTeam1
    ? 'team_selected'
    : 'idle';

  const { data: seasons } = useQuery({
    queryKey: ['seasons'],
    queryFn: fetchSeasons,
  });

  const gamesQuery = useInfiniteQuery({
    queryKey: ['games-search', selectedTeam1?.id, selectedTeam2?.id, selectedSeasonId],
    queryFn: ({ pageParam = 0 }) =>
      searchGamesByTeam(
        selectedTeam1!.id,
        selectedTeam2?.id ?? null,
        selectedSeasonId,
        pageParam,
        user?.id ?? null,
      ),
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    enabled: searchMode === 'games' && selectedTeam1 != null,
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

  function handleSelectTeam(team: Team) {
    if (pickingOpponent) {
      setSelectedTeam2(team);
      setPickingOpponent(false);
      setQuery('');
    } else {
      setSelectedTeam1(team);
      setQuery('');
    }
  }

  function handleClearTeam1() {
    setSelectedTeam1(null);
    setSelectedTeam2(null);
    setPickingOpponent(false);
  }

  function handleClearTeam2() {
    setSelectedTeam2(null);
  }

  function handlePickOpponent() {
    setPickingOpponent(true);
    setQuery('');
  }

  const showGrid =
    searchMode === 'games' && (searchPhase === 'idle' || pickingOpponent);
  const showGamesResults =
    searchMode === 'games' && searchPhase !== 'idle' && !pickingOpponent;

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
                ? pickingOpponent
                  ? 'Filter opponent...'
                  : searchPhase === 'idle'
                  ? 'Filter teams...'
                  : 'Search games...'
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
            onPress={() => {
              setSearchMode(mode);
              if (mode !== 'games') {
                setSelectedTeam1(null);
                setSelectedTeam2(null);
                setPickingOpponent(false);
              }
            }}
            className="px-4 py-1.5 rounded-full border border-border bg-background"
            style={searchMode === mode ? { backgroundColor: '#c9a84c', borderColor: '#c9a84c' } : undefined}
          >
            <Text
              className="text-sm font-medium capitalize text-muted"
              style={searchMode === mode ? { color: '#0a0a0a' } : undefined}
            >
              {mode}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Games mode: Team grid (idle or picking opponent) */}
      {showGrid && (
        <TeamGrid
          query={query}
          onSelectTeam={handleSelectTeam}
          excludeTeamId={pickingOpponent ? selectedTeam1?.id : undefined}
        />
      )}

      {/* Games mode: Results */}
      {showGamesResults && (
        <>
          <SelectedTeamsBar
            team1={selectedTeam1!}
            team2={selectedTeam2}
            onClearTeam1={handleClearTeam1}
            onClearTeam2={handleClearTeam2}
            onPickOpponent={handlePickOpponent}
          />

          {/* Season filter pills */}
          {seasons && seasons.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="px-4 py-2"
              contentContainerStyle={{ gap: 6, alignItems: 'center' }}
              style={{ flexGrow: 0 }}
            >
              <TouchableOpacity
                onPress={() => setSelectedSeasonId(null)}
                className="px-3 py-1.5 rounded-full border border-border bg-background"
                style={selectedSeasonId === null ? { backgroundColor: '#c9a84c', borderColor: '#c9a84c' } : undefined}
              >
                <Text
                  className="text-sm font-medium text-muted"
                  style={selectedSeasonId === null ? { color: '#0a0a0a' } : undefined}
                >
                  All
                </Text>
              </TouchableOpacity>
              {seasons.map((season) => (
                <TouchableOpacity
                  key={season.id}
                  onPress={() => setSelectedSeasonId(season.id)}
                  className="px-3 py-1.5 rounded-full border border-border bg-background"
                  style={selectedSeasonId === season.id ? { backgroundColor: '#c9a84c', borderColor: '#c9a84c' } : undefined}
                >
                  <Text
                    className="text-sm font-medium text-muted"
                    style={selectedSeasonId === season.id ? { color: '#0a0a0a' } : undefined}
                  >
                    {formatSeasonLabel(season.year)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {gamesQuery.isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#c9a84c" />
            </View>
          ) : (
            <FlatList
              data={allGames}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <SearchGameCard
                  game={item}
                  isLogged={loggedGameIds.has(item.id)}
                  onPress={() => router.push(`/game/${item.id}`)}
                />
              )}
              ListEmptyComponent={
                <View className="flex-1 items-center justify-center pt-16">
                  <Text className="text-muted">No games found</Text>
                </View>
              }
              ListFooterComponent={
                gamesQuery.isFetchingNextPage ? (
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
              removeClippedSubviews
              maxToRenderPerBatch={10}
              windowSize={5}
              refreshControl={
                <RefreshControl
                  refreshing={gamesQuery.isRefetching && !gamesQuery.isFetchingNextPage}
                  onRefresh={() => gamesQuery.refetch()}
                  tintColor="#c9a84c"
                />
              }
            />
          )}
        </>
      )}

      {/* Players mode */}
      {searchMode === 'players' && (
        <FlatList
          data={allPlayers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="mx-4 my-1 bg-surface border border-border rounded-xl p-4 flex-row items-center gap-3"
              onPress={() => router.push(`/player/${item.id}`)}
              activeOpacity={0.7}
            >
              <PlayerAvatar
                headshot_url={item.headshot_url}
                name={`${item.first_name} ${item.last_name}`}
                size={40}
              />
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
                <Text className="text-muted">No players found for "{debouncedQuery}"</Text>
              </View>
            ) : (
              <View className="flex-1 items-center justify-center pt-16 px-6">
                <Text className="text-white text-lg font-semibold mb-2">Find players</Text>
                <Text className="text-muted text-center">
                  Search for NBA players by name
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            playersQuery.isFetchingNextPage ? (
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
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
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
      )}

      {/* Users mode */}
      {searchMode === 'users' && (
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
                <Text className="text-muted">No users found for "{debouncedQuery}"</Text>
              </View>
            ) : (
              <View className="flex-1 items-center justify-center pt-16 px-6">
                <Text className="text-white text-lg font-semibold mb-2">Find people</Text>
                <Text className="text-muted text-center">
                  Search for users by display name or handle
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            usersQuery.isFetchingNextPage ? (
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
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
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
