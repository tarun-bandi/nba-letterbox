import { useEffect } from 'react';
import { View, ScrollView, Image, ActivityIndicator } from 'react-native';
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

/** Rounded pill skeleton for inline elements like tags */
function PillSkeleton({ width }: { width: number }) {
  return <Skeleton width={width} height={28} borderRadius={14} />;
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
  return (
    <View className="flex-1 bg-background">
      <View className="bg-surface border-b border-border px-6 py-6">
        <View className="flex-row items-center gap-3">
          {/* Avatar */}
          <Skeleton width={64} height={64} borderRadius={32} />
          <View className="flex-1">
            <Skeleton width={140} height={22} borderRadius={6} />
            <Skeleton width={90} height={14} borderRadius={4} className="mt-2" />
            <Skeleton width="85%" height={12} borderRadius={4} className="mt-3" />
          </View>
        </View>
        {/* Stats row */}
        <View className="flex-row mt-5 gap-6">
          {[48, 40, 56, 56].map((w, i) => (
            <View key={i}>
              <Skeleton width={w} height={22} borderRadius={4} />
              <Skeleton width={w + 8} height={10} borderRadius={3} className="mt-1.5" />
            </View>
          ))}
        </View>
        {/* View Stats button */}
        <Skeleton width="100%" height={44} borderRadius={12} className="mt-4" />
      </View>
      {/* Recent logs */}
      <View className="px-4 pt-5">
        <Skeleton width={100} height={16} borderRadius={4} className="mb-3" />
        <GameCardSkeleton />
        <GameCardSkeleton />
      </View>
    </View>
  );
}

export function FeedSkeleton() {
  return (
    <View className="flex-1 bg-background items-center justify-center">
      <Image
        source={require('@/assets/splash-icon.png')}
        style={{ width: 80, height: 80, opacity: 0.6, tintColor: '#c9a84c' }}
        resizeMode="contain"
      />
      <ActivityIndicator color="#c9a84c" size="small" style={{ marginTop: 20 }} />
    </View>
  );
}

function DiscoverRowSkeleton({ widthA = 80, widthB = 70 }: { widthA?: number; widthB?: number }) {
  return (
    <View className="bg-surface border border-border rounded-xl p-4 mb-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Skeleton width={18} height={14} borderRadius={3} />
          <Skeleton width={22} height={22} borderRadius={11} />
          <Skeleton width={widthA} height={14} borderRadius={4} />
          <Skeleton width={12} height={12} borderRadius={2} />
          <Skeleton width={22} height={22} borderRadius={11} />
          <Skeleton width={widthB} height={14} borderRadius={4} />
        </View>
        <Skeleton width={48} height={12} borderRadius={4} />
      </View>
      <Skeleton width={70} height={10} borderRadius={3} className="mt-2 ml-7" />
    </View>
  );
}

function DiscoverUserSkeleton() {
  return (
    <View className="bg-surface border border-border rounded-xl p-4 mb-2 flex-row items-center gap-3">
      <Skeleton width={40} height={40} borderRadius={20} />
      <View className="flex-1">
        <Skeleton width={100} height={14} borderRadius={4} />
        <Skeleton width={70} height={10} borderRadius={3} className="mt-1.5" />
      </View>
      <Skeleton width={64} height={28} borderRadius={14} />
    </View>
  );
}

export function DiscoverSkeleton() {
  return (
    <View className="flex-1 bg-background items-center justify-center">
      <Image
        source={require('@/assets/splash-icon.png')}
        style={{ width: 80, height: 80, opacity: 0.6, tintColor: '#c9a84c' }}
        resizeMode="contain"
      />
      <ActivityIndicator color="#c9a84c" size="small" style={{ marginTop: 20 }} />
    </View>
  );
}

export function GameDetailSkeleton() {
  return (
    <ScrollView className="flex-1 bg-background" showsVerticalScrollIndicator={false}>
      {/* Score card */}
      <View className="bg-surface border-b border-border mx-4 mt-4 rounded-2xl p-6">
        <View className="flex-row justify-between items-center">
          {/* Away */}
          <View className="flex-1 items-center">
            <Skeleton width={64} height={64} borderRadius={32} />
            <Skeleton width={40} height={12} borderRadius={3} className="mt-2" />
            <Skeleton width={36} height={22} borderRadius={4} className="mt-1" />
            <Skeleton width={48} height={36} borderRadius={6} className="mt-2" />
          </View>
          {/* Center */}
          <View className="items-center px-4">
            <Skeleton width={40} height={12} borderRadius={3} />
            <Skeleton width={20} height={20} borderRadius={4} className="mt-2" />
            <Skeleton width={100} height={10} borderRadius={3} className="mt-2" />
          </View>
          {/* Home */}
          <View className="flex-1 items-center">
            <Skeleton width={64} height={64} borderRadius={32} />
            <Skeleton width={40} height={12} borderRadius={3} className="mt-2" />
            <Skeleton width={36} height={22} borderRadius={4} className="mt-1" />
            <Skeleton width={48} height={36} borderRadius={6} className="mt-2" />
          </View>
        </View>
        {/* Community avg */}
        <View className="mt-4 pt-4 border-t border-border items-center">
          <Skeleton width={160} height={14} borderRadius={4} />
        </View>
      </View>

      {/* Action buttons */}
      <View className="mx-4 mt-4 flex-row gap-3">
        <Skeleton width={undefined} height={52} borderRadius={12} className="flex-1" />
        <Skeleton width={48} height={52} borderRadius={12} />
        <Skeleton width={48} height={52} borderRadius={12} />
        <Skeleton width={48} height={52} borderRadius={12} />
      </View>

      {/* Tab bar */}
      <View className="mx-4 mt-4">
        <Skeleton width="100%" height={40} borderRadius={12} />
      </View>

      {/* Box score placeholder rows */}
      <View className="mx-4 mt-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} className="flex-row items-center py-3 border-b border-border gap-3">
            <Skeleton width={100} height={12} borderRadius={3} />
            <Skeleton width={32} height={12} borderRadius={3} />
            <Skeleton width={28} height={12} borderRadius={3} />
            <Skeleton width={28} height={12} borderRadius={3} />
            <Skeleton width={28} height={12} borderRadius={3} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

export function UserProfileSkeleton() {
  return (
    <ScrollView className="flex-1 bg-background" showsVerticalScrollIndicator={false}>
      <View className="bg-surface border-b border-border px-6 py-6">
        <View className="flex-row items-center gap-3">
          <Skeleton width={64} height={64} borderRadius={32} />
          <View className="flex-1">
            <Skeleton width={140} height={22} borderRadius={6} />
            <Skeleton width={90} height={14} borderRadius={4} className="mt-2" />
            <Skeleton width="80%" height={12} borderRadius={4} className="mt-3" />
          </View>
          {/* Follow button */}
          <Skeleton width={90} height={36} borderRadius={18} />
        </View>
        <View className="flex-row mt-5 gap-6">
          {[40, 40, 52, 56].map((w, i) => (
            <View key={i}>
              <Skeleton width={w} height={22} borderRadius={4} />
              <Skeleton width={w + 8} height={10} borderRadius={3} className="mt-1.5" />
            </View>
          ))}
        </View>
      </View>
      <View className="px-4 pt-5">
        <Skeleton width={60} height={16} borderRadius={4} className="mb-3" />
        <GameCardSkeleton />
        <GameCardSkeleton />
      </View>
    </ScrollView>
  );
}
