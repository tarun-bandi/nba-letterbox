import { View, Text } from 'react-native';
import { Heart } from 'lucide-react-native';
import { deriveScore, formatScore, MIN_RANKED_FOR_SCORE } from '@/lib/ranking';
import type { FanOf } from '@/types/database';

interface RankBadgeProps {
  position: number;
  total: number;
  fanOf?: FanOf | null;
  size?: 'sm' | 'md';
}

export default function RankBadge({ position, total, fanOf, size = 'sm' }: RankBadgeProps) {
  const isFanGame = fanOf != null && fanOf !== 'neutral';
  const showScore = total >= MIN_RANKED_FOR_SCORE;
  const score = showScore ? deriveScore(position, total, fanOf) : 0;

  return (
    <View
      className={`bg-accent/15 border border-accent/30 rounded-full flex-row items-center ${
        size === 'md' ? 'px-3 py-1 gap-1.5' : 'px-2 py-0.5 gap-1'
      }`}
    >
      {showScore && (
        <Text
          className={`text-accent font-bold ${size === 'md' ? 'text-sm' : 'text-xs'}`}
        >
          {formatScore(score)}
        </Text>
      )}
      {isFanGame && (
        <Heart size={size === 'md' ? 12 : 10} color="#c9a84c" fill="#c9a84c" />
      )}
      <Text
        className={`${showScore ? 'text-muted' : 'text-accent font-bold'} ${size === 'md' ? 'text-xs' : 'text-[10px]'}`}
      >
        #{position}
      </Text>
    </View>
  );
}
