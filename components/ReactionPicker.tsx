import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ZoomIn,
} from 'react-native-reanimated';
import type { ReactionType } from '@/types/database';

export const REACTION_CONFIG: {
  type: ReactionType;
  emoji: string;
  label: string;
}[] = [
  { type: 'fire', emoji: '\uD83D\uDD25', label: 'Heat Check' },
  { type: 'ice', emoji: '\uD83E\uDDCA', label: 'Ice Cold' },
  { type: 'skull', emoji: '\uD83D\uDC80', label: 'Game Over' },
  { type: 'mind_blown', emoji: '\uD83E\uDD2F', label: 'Unreal' },
  { type: 'respect', emoji: '\uD83D\uDC4F', label: 'Respect' },
];

export const REACTION_EMOJI: Record<ReactionType, string> = {
  like: '\u2764\uFE0F',
  fire: '\uD83D\uDD25',
  ice: '\uD83E\uDDCA',
  skull: '\uD83D\uDC80',
  mind_blown: '\uD83E\uDD2F',
  respect: '\uD83D\uDC4F',
};

interface ReactionPickerProps {
  currentReaction: ReactionType | null;
  onSelect: (type: ReactionType) => void;
  onClose: () => void;
}

export default function ReactionPicker({
  currentReaction,
  onSelect,
  onClose,
}: ReactionPickerProps) {
  return (
    <>
      {/* Backdrop */}
      <Pressable
        style={{
          position: 'absolute',
          top: -200,
          left: -200,
          right: -200,
          bottom: -200,
          zIndex: 49,
        }}
        onPress={onClose}
      />
      {/* Picker */}
      <Animated.View
        entering={ZoomIn.duration(150)}
        exiting={FadeOut.duration(100)}
        className="absolute bottom-full mb-2 right-0 bg-surface border border-border rounded-2xl px-2 py-2 flex-row gap-1"
        style={{ zIndex: 50 }}
      >
        {REACTION_CONFIG.map((r) => (
          <TouchableOpacity
            key={r.type}
            onPress={() => onSelect(r.type)}
            className={`items-center px-2 py-1 rounded-xl ${
              currentReaction === r.type ? 'bg-accent/20' : ''
            }`}
            activeOpacity={0.6}
          >
            <Text style={{ fontSize: 24 }}>{r.emoji}</Text>
            <Text className="text-muted text-[9px] mt-0.5">{r.label}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </>
  );
}
