import { View, Text, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import TeamLogo from './TeamLogo';
import PlayoffBadge from './PlayoffBadge';
import type { GameWithTeams } from '@/types/database';

interface ComparisonScreenProps {
  newGame: GameWithTeams;
  existingGame: GameWithTeams;
  step: number;
  estimatedTotal: number;
  onChoose: (choice: 'new' | 'existing') => void;
  onSkip: () => void;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function ComparisonCard({
  game,
  label,
  onPress,
  side,
}: {
  game: GameWithTeams;
  label: string;
  onPress: () => void;
  side: 'left' | 'right';
}) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    scale.value = withSequence(
      withSpring(0.95, { damping: 8, stiffness: 400 }),
      withSpring(1, { damping: 6, stiffness: 200 }),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <Animated.View style={animStyle} className="flex-1">
      <TouchableOpacity
        className="bg-surface border border-border rounded-2xl p-4 items-center"
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <Text className="text-muted text-xs mb-3 uppercase tracking-wider">{label}</Text>

        {/* Teams */}
        <View className="flex-row items-center gap-2 mb-2">
          <TeamLogo abbreviation={game.away_team.abbreviation} size={28} sport={game.sport} />
          <Text className="text-white font-bold text-sm">
            {game.away_team.abbreviation}
          </Text>
        </View>

        <Text className="text-muted text-xs mb-2">@</Text>

        <View className="flex-row items-center gap-2 mb-3">
          <TeamLogo abbreviation={game.home_team.abbreviation} size={28} sport={game.sport} />
          <Text className="text-white font-bold text-sm">
            {game.home_team.abbreviation}
          </Text>
        </View>

        {/* Score */}
        {game.home_team_score !== null && (
          <Text className="text-white font-bold text-lg mb-2">
            {game.away_team_score} - {game.home_team_score}
          </Text>
        )}

        {/* Date */}
        <Text className="text-muted text-xs mb-1">
          {formatDate(game.game_date_utc)}
        </Text>

        {/* Playoff badge */}
        {game.playoff_round && (
          <View className="mt-1">
            <PlayoffBadge round={game.playoff_round} />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ComparisonScreen({
  newGame,
  existingGame,
  step,
  estimatedTotal,
  onChoose,
  onSkip,
}: ComparisonScreenProps) {
  return (
    <View className="flex-1 px-4 pt-4 pb-8">
      <Text className="text-white text-xl font-bold text-center mb-2">
        Which game was better?
      </Text>

      {/* Progress dots */}
      <View className="flex-row items-center justify-center gap-1.5 mb-6">
        {Array.from({ length: estimatedTotal }).map((_, i) => (
          <View
            key={i}
            className={`w-2 h-2 rounded-full ${
              i < step ? 'bg-accent' : 'bg-border'
            }`}
          />
        ))}
        <Text className="text-muted text-xs ml-2">
          Step {step} of ~{estimatedTotal}
        </Text>
      </View>

      {/* Comparison cards */}
      <View className="flex-row gap-3 flex-1">
        <ComparisonCard
          game={newGame}
          label="This game"
          onPress={() => onChoose('new')}
          side="left"
        />
        <ComparisonCard
          game={existingGame}
          label="Ranked game"
          onPress={() => onChoose('existing')}
          side="right"
        />
      </View>

      <TouchableOpacity
        className="mt-4 py-3 items-center"
        onPress={onSkip}
        activeOpacity={0.6}
      >
        <Text className="text-muted text-sm">Skip ranking</Text>
      </TouchableOpacity>
    </View>
  );
}
