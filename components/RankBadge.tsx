import { View, Text } from 'react-native';
import { deriveScore, formatScore } from '@/lib/ranking';

interface RankBadgeProps {
  position: number;
  total: number;
  size?: 'sm' | 'md';
}

export default function RankBadge({ position, total, size = 'sm' }: RankBadgeProps) {
  const score = deriveScore(position, total);

  return (
    <View
      className={`bg-accent/15 border border-accent/30 rounded-full flex-row items-center ${
        size === 'md' ? 'px-3 py-1 gap-1.5' : 'px-2 py-0.5 gap-1'
      }`}
    >
      <Text
        className={`text-accent font-bold ${size === 'md' ? 'text-sm' : 'text-xs'}`}
      >
        {formatScore(score)}
      </Text>
      <Text
        className={`text-muted ${size === 'md' ? 'text-xs' : 'text-[10px]'}`}
      >
        #{position}
      </Text>
    </View>
  );
}
