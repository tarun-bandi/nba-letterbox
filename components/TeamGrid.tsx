import { useState, useMemo } from 'react';
import { View, Text, FlatList, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTeams } from '@/hooks/useTeams';
import TeamLogo from '@/components/TeamLogo';
import type { Team, Sport } from '@/types/database';

const NBA_CONFERENCE_ORDER = ['East', 'West'];

const NFL_DIVISION_ORDER = [
  'AFC East',
  'AFC North',
  'AFC South',
  'AFC West',
  'NFC East',
  'NFC North',
  'NFC South',
  'NFC West',
];

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

  const showGrouped = !q;

  const groupedSections = useMemo(() => {
    if (!showGrouped) return [];
    if (activeSport === 'nba') {
      const map = new Map<string, Team[]>();
      for (const team of filtered) {
        const conf = team.conference ?? 'Other';
        if (!map.has(conf)) map.set(conf, []);
        map.get(conf)!.push(team);
      }
      return NBA_CONFERENCE_ORDER
        .filter((conf) => map.has(conf))
        .map((conf) => ({ title: conf, teams: map.get(conf)! }));
    }
    const map = new Map<string, Team[]>();
    for (const team of filtered) {
      const div = team.division ?? 'Other';
      if (!map.has(div)) map.set(div, []);
      map.get(div)!.push(team);
    }
    return NFL_DIVISION_ORDER
      .filter((div) => map.has(div))
      .map((div) => ({ title: div, teams: map.get(div)! }));
  }, [showGrouped, activeSport, filtered]);

  const renderTeamItem = (item: Team) => (
    <TouchableOpacity
      key={item.id}
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
  );

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
      ) : showGrouped ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {groupedSections.map((section) => (
            <View key={section.title}>
              <Text className="text-muted text-xs font-semibold px-4 pt-3 pb-1">
                {section.title}
              </Text>
              <View className="flex-row flex-wrap" style={{ gap: 8, paddingHorizontal: 16, paddingTop: 4 }}>
                {section.teams.map(renderTeamItem)}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={5}
          columnWrapperStyle={{ justifyContent: 'flex-start', gap: 8, paddingHorizontal: 16 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 16, paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => renderTeamItem(item)}
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
