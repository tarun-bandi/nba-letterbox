import { View, Text, TouchableOpacity } from 'react-native';
import { ThumbsUp, Minus, ThumbsDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { TriageBucket } from '@/lib/ranking';

interface TriageScreenProps {
  onSelect: (bucket: TriageBucket) => void;
  onSkip: () => void;
}

const BUCKETS: { bucket: TriageBucket; label: string; sub: string; icon: typeof ThumbsUp; color: string }[] = [
  { bucket: 'loved', label: 'Loved it', sub: 'Top tier game', icon: ThumbsUp, color: '#4ade80' },
  { bucket: 'decent', label: 'Decent', sub: 'Solid but not amazing', icon: Minus, color: '#c9a84c' },
  { bucket: 'meh', label: "Didn't love it", sub: 'Below average', icon: ThumbsDown, color: '#f87171' },
];

export default function TriageScreen({ onSelect, onSkip }: TriageScreenProps) {
  return (
    <View className="flex-1 px-6 pt-4 pb-8">
      <Text className="text-white text-xl font-bold text-center mb-2">
        How was this game?
      </Text>
      <Text className="text-muted text-sm text-center mb-8">
        This helps us find the right spot faster
      </Text>

      <View className="gap-3">
        {BUCKETS.map(({ bucket, label, sub, icon: Icon, color }) => (
          <TouchableOpacity
            key={bucket}
            className="bg-surface border border-border rounded-2xl px-5 py-4 flex-row items-center gap-4"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(bucket);
            }}
            activeOpacity={0.7}
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: color + '20' }}
            >
              <Icon size={20} color={color} />
            </View>
            <View className="flex-1">
              <Text className="text-white font-semibold text-base">{label}</Text>
              <Text className="text-muted text-sm">{sub}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        className="mt-6 py-3 items-center"
        onPress={onSkip}
        activeOpacity={0.6}
      >
        <Text className="text-muted text-sm">Skip ranking</Text>
      </TouchableOpacity>
    </View>
  );
}
