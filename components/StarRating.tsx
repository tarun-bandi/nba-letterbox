import { View, Text, TouchableOpacity, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const GOLD = '#c9a84c';
const EMPTY = '#2a2a2a';
const STAR_COUNT = 5;

interface StarRatingProps {
  /** Value in display units: 0.0 – 5.0, increments of 0.5 */
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  readonly?: boolean;
}

function StarGlyph({
  fill,
  size,
}: {
  fill: 'full' | 'half' | 'empty';
  size: number;
}) {
  const fontSize = size * 0.95;
  // Web renders the ★ glyph with different metrics; use a taller lineHeight
  const lh = Platform.OS === 'web' ? size * 1.2 : size;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {/* Gray base star */}
      <Text
        style={{
          fontSize,
          lineHeight: lh,
          color: EMPTY,
          position: 'absolute',
        }}
      >
        ★
      </Text>
      {/* Gold fill star (full or left-half clipped) */}
      {fill !== 'empty' && (
        <View
          style={{
            position: 'absolute',
            width: fill === 'half' ? size / 2 : size,
            height: size,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize,
              lineHeight: lh,
              color: GOLD,
              width: size,
              textAlign: 'center',
            }}
          >
            ★
          </Text>
        </View>
      )}
    </View>
  );
}

export default function StarRating({
  value,
  onChange,
  size = 24,
  readonly = false,
}: StarRatingProps) {
  const stars = Array.from({ length: STAR_COUNT }, (_, i) => {
    const starValue = i + 1;
    if (value >= starValue) return 'full';
    if (value >= starValue - 0.5) return 'half';
    return 'empty';
  }) as Array<'full' | 'half' | 'empty'>;

  return (
    <View
      style={{ flexDirection: 'row', gap: 4 }}
      accessibilityLabel={`Rating: ${value} out of 5 stars`}
      accessibilityRole={readonly ? 'text' : 'adjustable'}
    >
      {stars.map((fill, i) => {
        if (readonly) {
          return (
            <StarGlyph key={i} fill={fill} size={size} />
          );
        }

        // Each star has two tappable halves
        return (
          <View key={i} style={{ flexDirection: 'row' }}>
            {/* Left half -> 0.5 increment */}
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onChange?.((i + 0.5));
              }}
              hitSlop={{ top: 4, bottom: 4, left: 2, right: 0 }}
              accessibilityLabel={`Rate ${i + 0.5} stars`}
              accessibilityRole="button"
            >
              <View style={{ width: size / 2, height: size, overflow: 'hidden' }}>
                <StarGlyph fill={fill} size={size} />
              </View>
            </TouchableOpacity>
            {/* Right half -> full increment */}
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onChange?.(i + 1);
              }}
              hitSlop={{ top: 4, bottom: 4, left: 0, right: 2 }}
              accessibilityLabel={`Rate ${i + 1} stars`}
              accessibilityRole="button"
            >
              <View
                style={{
                  width: size / 2,
                  height: size,
                  overflow: 'hidden',
                  marginLeft: -(size / 2),
                  paddingLeft: size / 2,
                }}
              >
                <StarGlyph fill={fill} size={size} />
              </View>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}
