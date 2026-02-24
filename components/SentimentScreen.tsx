import { View, Text, TouchableOpacity } from 'react-native';
import { PartyPopper, ThumbsUp, Meh, ThumbsDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { Sentiment } from '@/types/database';

interface SentimentScreenProps {
  onSelect: (sentiment: Sentiment) => void;
  onSkip: () => void;
  fanTeamName?: string | null;
}

const OPTIONS: { sentiment: Sentiment; label: string; sub: string; icon: typeof ThumbsUp; color: string }[] = [
  { sentiment: 'loved', label: 'Had a great time', sub: 'Top tier game', icon: PartyPopper, color: '#4ade80' },
  { sentiment: 'good', label: 'Was pretty good', sub: 'Solid game', icon: ThumbsUp, color: '#c9a84c' },
  { sentiment: 'okay', label: 'Was okay', sub: 'Nothing special', icon: Meh, color: '#9ca3af' },
  { sentiment: 'bad', label: "Wasn't great", sub: 'Below average', icon: ThumbsDown, color: '#f87171' },
];

export default function SentimentScreen({ onSelect, onSkip, fanTeamName }: SentimentScreenProps) {
  return (
    <View className="flex-1 px-6 pt-4 pb-8">
      {fanTeamName && (
        <View className="bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 mb-4">
          <Text className="text-accent text-sm text-center">
            Watching as a {fanTeamName} fan
          </Text>
        </View>
      )}

      <Text className="text-white text-xl font-bold text-center mb-2">
        How was this game?
      </Text>
      <Text className="text-muted text-sm text-center mb-8">
        This helps us find the right spot faster
      </Text>

      <View className="gap-3">
        {OPTIONS.map(({ sentiment, label, sub, icon: Icon, color }) => (
          <TouchableOpacity
            key={sentiment}
            className="bg-surface border border-border rounded-2xl px-5 py-4 flex-row items-center gap-4"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(sentiment);
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
