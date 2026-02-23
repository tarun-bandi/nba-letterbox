import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTeams } from '@/hooks/useTeams';
import TeamLogo from '@/components/TeamLogo';
import type { Team } from '@/types/database';

interface TeamGridProps {
  query: string;
  onSelectTeam: (team: Team) => void;
  excludeTeamId?: string;
}

export default function TeamGrid({ query, onSelectTeam, excludeTeamId }: TeamGridProps) {
  const { data: teams, isLoading } = useTeams();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#c9a84c" />
      </View>
    );
  }

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
          <TeamLogo abbreviation={item.abbreviation} size={40} />
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
  );
}
