import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Search as SearchIcon } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useDebounce } from '@/hooks/useDebounce';
import type { GameWithTeams } from '@/types/database';

async function searchGames(query: string): Promise<GameWithTeams[]> {
  const { data, error } = await supabase
    .from('games')
    .select(`
      *,
      home_team:teams!games_home_team_id_fkey (*),
      away_team:teams!games_away_team_id_fkey (*),
      season:seasons (*)
    `)
    .or(
      [
        `home_team.name.ilike.%${query}%`,
        `home_team.abbreviation.ilike.%${query}%`,
        `home_team.city.ilike.%${query}%`,
        `away_team.name.ilike.%${query}%`,
        `away_team.abbreviation.ilike.%${query}%`,
        `away_team.city.ilike.%${query}%`,
      ].join(',')
    )
    .order('game_date_utc', { ascending: false })
    .limit(30);

  if (error) throw error;
  return (data ?? []) as unknown as GameWithTeams[];
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 350);

  const { data, isLoading } = useQuery({
    queryKey: ['games-search', debouncedQuery],
    queryFn: () => searchGames(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 2,
  });

  return (
    <View className="flex-1 bg-background">
      {/* Search bar */}
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center bg-surface border border-border rounded-xl px-3 gap-2">
          <SearchIcon size={18} color="#6b7280" />
          <TextInput
            className="flex-1 py-3.5 text-white text-base"
            placeholder="Search teams or games (e.g. LAL)"
            placeholderTextColor="#6b7280"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
      </View>

      {/* Results */}
      {isLoading && debouncedQuery.length >= 2 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#c9a84c" />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="mx-4 my-1 bg-surface border border-border rounded-xl p-4"
              onPress={() => router.push(`/game/${item.id}`)}
              activeOpacity={0.7}
            >
              <View className="flex-row justify-between items-center">
                <Text className="text-white font-semibold text-base">
                  {item.away_team.abbreviation} @ {item.home_team.abbreviation}
                </Text>
                <Text className="text-muted text-sm">
                  {item.home_team_score !== null
                    ? `${item.away_team_score}–${item.home_team_score}`
                    : item.status}
                </Text>
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
                <Text className="text-muted">No games found for "{debouncedQuery}"</Text>
              </View>
            ) : (
              <View className="flex-1 items-center justify-center pt-16 px-6">
                <Text className="text-muted text-center">
                  Search for a team abbreviation or city (e.g. LAL, Warriors, Boston)
                </Text>
              </View>
            )
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        />
      )}
    </View>
  );
}
