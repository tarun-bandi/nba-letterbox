import { View, TouchableOpacity } from 'react-native';

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

function StarIcon({
  fill,
  size,
}: {
  fill: 'full' | 'half' | 'empty';
  size: number;
}) {
  // SVG-like rendering via View borders
  // We use a simple visual: full filled, half (left only), empty
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 2,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Background (empty) */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          backgroundColor: EMPTY,
          borderRadius: 2,
        }}
      />
      {/* Fill */}
      {fill !== 'empty' && (
        <View
          style={{
            position: 'absolute',
            width: fill === 'half' ? size / 2 : size,
            height: size,
            backgroundColor: GOLD,
            borderRadius: 2,
          }}
        />
      )}
      {/* Star shape overlay using text ★ */}
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
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {stars.map((fill, i) => {
        if (readonly) {
          return (
            <StarGlyph key={i} fill={fill} size={size} />
          );
        }

        // Each star has two tappable halves
        return (
          <View key={i} style={{ flexDirection: 'row' }}>
            {/* Left half → 0.5 increment */}
            <TouchableOpacity
              onPress={() => onChange?.((i + 0.5))}
              hitSlop={{ top: 4, bottom: 4, left: 2, right: 0 }}
            >
              <View style={{ width: size / 2, height: size, overflow: 'hidden' }}>
                <StarGlyph fill={fill} size={size} />
              </View>
            </TouchableOpacity>
            {/* Right half → full increment */}
            <TouchableOpacity
              onPress={() => onChange?.(i + 1)}
              hitSlop={{ top: 4, bottom: 4, left: 0, right: 2 }}
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

function StarGlyph({
  fill,
  size,
}: {
  fill: 'full' | 'half' | 'empty';
  size: number;
}) {
  const color =
    fill === 'full' ? GOLD : fill === 'half' ? GOLD : EMPTY;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Unicode star rendered via a Text-like approach using View layers */}
      <View
        style={{
          width: size * 0.85,
          height: size * 0.85,
          backgroundColor: fill === 'empty' ? EMPTY : 'transparent',
          borderRadius: size * 0.1,
        }}
      />
      {/* Gold fill for full stars */}
      {fill !== 'empty' && (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: fill === 'half' ? size / 2 : size,
            height: size,
            backgroundColor: GOLD,
            borderRadius: size * 0.1,
          }}
        />
      )}
      {/* Empty overlay on right half */}
      {fill === 'half' && (
        <View
          style={{
            position: 'absolute',
            left: size / 2,
            top: 0,
            width: size / 2,
            height: size,
            backgroundColor: EMPTY,
            borderRadius: size * 0.1,
          }}
        />
      )}
    </View>
  );
}
