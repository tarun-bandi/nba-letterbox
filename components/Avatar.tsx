import { View, Text } from 'react-native';
import { useState } from 'react';
import { Image } from 'expo-image';

interface AvatarProps {
  url?: string | null;
  name: string;
  size: number;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}

const COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#264653', '#6a4c93'];

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function Avatar({ url, name, size }: AvatarProps) {
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        onError={() => setFailed(true)}
        cachePolicy="memory-disk"
        transition={200}
      />
    );
  }

  const bg = hashColor(name);
  const fontSize = size * 0.4;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#ffffff', fontSize, fontWeight: '700' }}>
        {getInitials(name)}
      </Text>
    </View>
  );
}
