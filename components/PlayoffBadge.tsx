import { View, Text } from 'react-native';
import type { PlayoffRound } from '@/types/database';

const ROUND_LABELS: Record<PlayoffRound, string> = {
  first_round: 'Round 1',
  conf_semis: 'Conf Semis',
  conf_finals: 'Conf Finals',
  finals: 'Finals',
};

interface PlayoffBadgeProps {
  round: PlayoffRound;
  size?: 'sm' | 'md';
}

export default function PlayoffBadge({ round, size = 'sm' }: PlayoffBadgeProps) {
  const label = ROUND_LABELS[round];

  return (
    <View
      className={`bg-accent/15 border border-accent/30 rounded-full ${
        size === 'md' ? 'px-3 py-1' : 'px-2 py-0.5'
      }`}
    >
      <Text
        className={`text-accent font-medium ${
          size === 'md' ? 'text-sm' : 'text-xs'
        }`}
      >
        {label}
      </Text>
    </View>
  );
}
