import { View, Text, TouchableOpacity } from 'react-native';
import { X, Plus } from 'lucide-react-native';
import TeamLogo from '@/components/TeamLogo';
import type { Team } from '@/types/database';

interface SelectedTeamsBarProps {
  team1: Team;
  team2: Team | null;
  onClearTeam1: () => void;
  onClearTeam2: () => void;
  onPickOpponent: () => void;
}

function TeamChip({ team, onClear }: { team: Team; onClear: () => void }) {
  return (
    <View className="flex-row items-center gap-2 bg-surface border border-border rounded-full px-3 py-1.5">
      <TeamLogo abbreviation={team.abbreviation} size={20} />
      <Text className="text-white text-sm font-medium">{team.abbreviation}</Text>
      <TouchableOpacity onPress={onClear} hitSlop={8}>
        <X size={14} color="#6b7280" />
      </TouchableOpacity>
    </View>
  );
}

export default function SelectedTeamsBar({
  team1,
  team2,
  onClearTeam1,
  onClearTeam2,
  onPickOpponent,
}: SelectedTeamsBarProps) {
  return (
    <View className="flex-row items-center px-4 pb-2 gap-2 flex-wrap">
      <TeamChip team={team1} onClear={onClearTeam1} />
      {team2 ? (
        <>
          <Text className="text-muted text-sm font-medium">vs</Text>
          <TeamChip team={team2} onClear={onClearTeam2} />
        </>
      ) : (
        <TouchableOpacity
          className="flex-row items-center gap-1 bg-accent/15 border border-accent/30 rounded-full px-3 py-1.5"
          onPress={onPickOpponent}
          activeOpacity={0.7}
        >
          <Plus size={14} color="#c9a84c" />
          <Text className="text-accent text-sm font-medium">vs</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
