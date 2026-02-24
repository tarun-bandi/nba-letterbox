import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTeams } from '@/hooks/useTeams';
import TeamLogo from '@/components/TeamLogo';
import type { Team, Sport } from '@/types/database';

const SPORT_TABS: { key: Sport; label: string }[] = [
  { key: 'nba', label: 'NBA' },
  { key: 'nfl', label: 'NFL' },
];

interface TeamGridProps {
  query: string;
  onSelectTeam: (team: Team) => void;
  excludeTeamId?: string;
}

export default function TeamGrid({ query, onSelectTeam, excludeTeamId }: TeamGridProps) {
  const [activeSport, setActiveSport] = useState<Sport>('nba');
  const { data: nbaTeams, isLoading: nbaLoading } = useTeams('nba');
  const { data: nflTeams, isLoading: nflLoading } = useTeams('nfl');

  const teams = activeSport === 'nba' ? nbaTeams : nflTeams;
  const isLoading = activeSport === 'nba' ? nbaLoading : nflLoading;

  const q = query.trim().toLowerCase();
  const filtered = (teams ?? []).filter((t) => {
    if (excludeTeamId && t.id === excludeTeamId) return false;
    if (!q) return true;
    return (
      t.abbreviation.toLowerCase().includes(q) ||
      t.city.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.full_name.toLowerCase().includes(q)
    );
  });

  return (
    <View className="flex-1">
      {/* Sport tabs */}
      <View className="flex-row px-4 mb-2 gap-2">
        {SPORT_TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveSport(tab.key)}
            className="px-3 py-1 rounded-full border border-border bg-background"
            style={activeSport === tab.key ? { backgroundColor: '#c9a84c', borderColor: '#c9a84c' } : undefined}
          >
            <Text
              className="text-xs font-medium text-muted"
              style={activeSport === tab.key ? { color: '#0a0a0a' } : undefined}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#c9a84c" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={5}
          columnWrapperStyle={{ justifyContent: 'flex-start', gap: 8, paddingHorizontal: 16 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 16, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              className="items-center"
              style={{ width: '18%' }}
              onPress={() => onSelectTeam(item)}
              activeOpacity={0.7}
            >
              <TeamLogo abbreviation={item.abbreviation} sport={activeSport} size={40} />
              <Text className="text-muted text-xs mt-1 font-medium">
                {item.abbreviation}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            q ? (
              <View className="items-center pt-12">
                <Text className="text-muted">No teams matching "{query}"</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}
