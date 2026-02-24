import { useState } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { getTeamLogoUrl } from '@/lib/teamLogo';
import type { Sport } from '@/types/database';

interface TeamLogoProps {
  abbreviation: string;
  size?: number;
  sport?: Sport;
}

export default function TeamLogo({ abbreviation, size = 32, sport = 'nba' }: TeamLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <View
        style={{ width: size, height: size, borderRadius: size / 2 }}
        className="bg-border items-center justify-center"
      >
        <Text className="text-muted" style={{ fontSize: size * 0.4 }}>
          {abbreviation.slice(0, 2)}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: getTeamLogoUrl(abbreviation, sport) }}
      style={{ width: size, height: size }}
      contentFit="contain"
      onError={() => setFailed(true)}
      cachePolicy="memory-disk"
      transition={200}
    />
  );
}
