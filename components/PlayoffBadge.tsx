import { View, Text } from 'react-native';
import { getProvider } from '@/lib/providers';
import type { Sport } from '@/types/database';

interface PlayoffBadgeProps {
  round: string;
  sport?: Sport;
  size?: 'sm' | 'md';
}

export default function PlayoffBadge({ round, sport = 'nba', size = 'sm' }: PlayoffBadgeProps) {
  const label = getProvider(sport).getPlayoffRoundLabel(round);

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
