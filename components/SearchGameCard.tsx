import { View, Text, TouchableOpacity } from 'react-native';
import TeamLogo from '@/components/TeamLogo';
import PlayoffBadge from '@/components/PlayoffBadge';
import type { GameWithTeams } from '@/types/database';

interface SearchGameCardProps {
  game: GameWithTeams;
  isLogged: boolean;
  onPress: () => void;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SearchGameCard({ game, isLogged, onPress }: SearchGameCardProps) {
  const isFinal = game.status === 'final';
  const hasScores = game.home_team_score != null && game.away_team_score != null;
  const homeWon = isFinal && hasScores && game.home_team_score! > game.away_team_score!;
  const awayWon = isFinal && hasScores && game.away_team_score! > game.home_team_score!;
  const hasOT = game.home_ot != null && game.home_ot > 0;

  return (
    <TouchableOpacity
      className="mx-4 my-1 bg-surface border border-border rounded-xl p-4"
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Top row: date + badges */}
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-muted text-xs">{formatDate(game.game_date_utc)}</Text>
        <View className="flex-row items-center gap-2">
          {hasOT && (
            <View className="bg-surface border border-border rounded-full px-2 py-0.5">
              <Text className="text-muted text-xs font-medium">OT</Text>
            </View>
          )}
          {game.playoff_round && <PlayoffBadge round={game.playoff_round} />}
          {isLogged && (
            <View className="bg-accent/20 border border-accent/40 rounded-full px-2 py-0.5">
              <Text className="text-accent text-xs font-medium">Logged</Text>
            </View>
          )}
        </View>
      </View>

      {/* Away team row */}
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <TeamLogo abbreviation={game.away_team.abbreviation} size={24} />
          <Text
            className={`text-sm font-medium ${
              awayWon ? 'text-white font-bold' : 'text-muted'
            }`}
          >
            {game.away_team.abbreviation}
          </Text>
        </View>
        {hasScores && (
          <Text
            className={`text-base tabular-nums ${
              awayWon ? 'text-white font-bold' : 'text-muted'
            }`}
          >
            {game.away_team_score}
          </Text>
        )}
      </View>

      {/* Home team row */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <TeamLogo abbreviation={game.home_team.abbreviation} size={24} />
          <Text
            className={`text-sm font-medium ${
              homeWon ? 'text-white font-bold' : 'text-muted'
            }`}
          >
            {game.home_team.abbreviation}
          </Text>
        </View>
        {hasScores && (
          <Text
            className={`text-base tabular-nums ${
              homeWon ? 'text-white font-bold' : 'text-muted'
            }`}
          >
            {game.home_team_score}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}
