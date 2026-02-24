import { View, Text } from 'react-native';

interface RatingHistogramProps {
  /** Raw rating values 1–50 (i.e. 0.1–5.0 scaled by 10) */
  ratings: number[];
}

const BUCKETS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]; // 0.5, 1.0, …, 5.0
const BUCKET_LABELS = ['½', '1', '1½', '2', '2½', '3', '3½', '4', '4½', '5'];

export default function RatingHistogram({ ratings }: RatingHistogramProps) {
  if (ratings.length < 3) return null;

  const counts = BUCKETS.map((b) => ratings.filter((r) => r === b).length);
  const max = Math.max(...counts, 1);

  return (
    <View className="mt-3">
      <View className="flex-row items-end justify-between" style={{ height: 40 }}>
        {counts.map((count, i) => (
          <View
            key={i}
            className="flex-1 mx-0.5 rounded-t-sm"
            style={{
              height: max > 0 ? Math.max((count / max) * 40, count > 0 ? 3 : 0) : 0,
              backgroundColor: count > 0 ? '#e5e5e5' : '#2a2a2a',
              minHeight: 2,
            }}
          />
        ))}
      </View>
      <View className="flex-row justify-between mt-1">
        {BUCKET_LABELS.map((label, i) => (
          <Text key={i} className="text-muted flex-1 text-center" style={{ fontSize: 8 }}>
            {label}
          </Text>
        ))}
      </View>
      <Text className="text-muted text-xs text-center mt-1">
        {ratings.length} {ratings.length === 1 ? 'rating' : 'ratings'}
      </Text>
    </View>
  );
}
