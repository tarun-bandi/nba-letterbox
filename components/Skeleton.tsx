import { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  className?: string;
}

export function Skeleton({ width, height = 16, borderRadius = 8, className }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      className={className}
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: '#2a2a2a',
          opacity,
        },
      ]}
    />
  );
}

export function GameCardSkeleton() {
  return (
    <View className="bg-surface border border-border rounded-2xl p-4 mb-3 mx-4">
      {/* Matchup row */}
      <View className="flex-row items-center gap-2">
        <Skeleton width={28} height={28} borderRadius={14} />
        <Skeleton width={40} height={18} />
        <Skeleton width={16} height={18} />
        <Skeleton width={28} height={28} borderRadius={14} />
        <Skeleton width={40} height={18} />
      </View>
      {/* Date */}
      <Skeleton width={100} height={12} className="mt-2" />
      {/* Rating */}
      <View className="flex-row items-center gap-2 mt-3">
        <Skeleton width={90} height={16} />
        <Skeleton width={30} height={16} />
      </View>
      {/* Review */}
      <Skeleton width="100%" height={14} className="mt-3" />
      <Skeleton width="70%" height={14} className="mt-1.5" />
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View className="flex-1 bg-background">
      <View className="bg-surface border-b border-border px-6 py-6">
        <Skeleton width={180} height={28} />
        <Skeleton width={100} height={16} className="mt-2" />
        <Skeleton width="80%" height={14} className="mt-3" />
        <View className="flex-row mt-4 gap-6">
          <View>
            <Skeleton width={40} height={24} />
            <Skeleton width={50} height={12} className="mt-1" />
          </View>
          <View>
            <Skeleton width={40} height={24} />
            <Skeleton width={60} height={12} className="mt-1" />
          </View>
        </View>
      </View>
      <View className="px-4 pt-4">
        <Skeleton width={100} height={18} className="mb-3" />
        <GameCardSkeleton />
        <GameCardSkeleton />
      </View>
    </View>
  );
}

export function FeedSkeleton() {
  return (
    <View className="flex-1 bg-background pt-2">
      <GameCardSkeleton />
      <GameCardSkeleton />
      <GameCardSkeleton />
    </View>
  );
}
