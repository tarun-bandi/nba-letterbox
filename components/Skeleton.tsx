import { useEffect } from 'react';
import { View, Image, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  className?: string;
}

export function Skeleton({ width, height = 16, borderRadius = 8, className }: SkeletonProps) {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.25, 0.5, 0.25]),
  }));

  return (
    <Animated.View
      className={className}
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: '#333',
        },
        animStyle,
      ]}
    />
  );
}

/** Branded loading screen used as the skeleton for all pages */
function BrandedLoader() {
  return (
    <View className="flex-1 bg-background items-center justify-center">
      <Image
        source={require('@/assets/splash-icon.png')}
        style={{ width: 80, height: 80, opacity: 0.5 }}
        resizeMode="contain"
      />
      <ActivityIndicator color="#c9a84c" size="small" style={{ marginTop: 20 }} />
    </View>
  );
}

export function GameCardSkeleton() {
  return (
    <View className="bg-surface border border-border rounded-2xl p-4 mb-3">
      {/* Matchup row */}
      <View className="flex-row items-center justify-center gap-2">
        <Skeleton width={24} height={24} borderRadius={12} />
        <Skeleton width={36} height={14} borderRadius={4} />
        <Skeleton width={28} height={18} borderRadius={4} />
        <Skeleton width={8} height={12} borderRadius={2} />
        <Skeleton width={28} height={18} borderRadius={4} />
        <Skeleton width={36} height={14} borderRadius={4} />
        <Skeleton width={24} height={24} borderRadius={12} />
      </View>
      {/* Rating row */}
      <View className="flex-row items-center gap-2 mt-4">
        <Skeleton width={80} height={14} borderRadius={4} />
        <Skeleton width={28} height={14} borderRadius={4} />
        <Skeleton width={64} height={24} borderRadius={12} />
      </View>
      {/* Review lines */}
      <Skeleton width="100%" height={12} borderRadius={4} className="mt-3" />
      <Skeleton width="65%" height={12} borderRadius={4} className="mt-2" />
      {/* Action bar */}
      <View className="flex-row items-center justify-end gap-5 mt-4 pt-3 border-t border-border">
        <Skeleton width={20} height={20} borderRadius={4} />
        <Skeleton width={20} height={20} borderRadius={4} />
        <Skeleton width={20} height={20} borderRadius={4} />
      </View>
    </View>
  );
}

export function ProfileSkeleton() {
  return <BrandedLoader />;
}

export function FeedSkeleton() {
  return <BrandedLoader />;
}

export function DiscoverSkeleton() {
  return <BrandedLoader />;
}

export function GameDetailSkeleton() {
  return <BrandedLoader />;
}

export function UserProfileSkeleton() {
  return <BrandedLoader />;
}
