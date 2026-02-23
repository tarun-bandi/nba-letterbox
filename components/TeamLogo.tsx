import { useState } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import { getTeamLogoUrl } from '@/lib/teamLogo';

interface TeamLogoProps {
  abbreviation: string;
  size?: number;
}

export default function TeamLogo({ abbreviation, size = 32 }: TeamLogoProps) {
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
      source={{ uri: getTeamLogoUrl(abbreviation) }}
      style={{ width: size, height: size }}
      contentFit="contain"
      onError={() => setFailed(true)}
      cachePolicy="memory-disk"
      transition={200}
    />
  );
}
