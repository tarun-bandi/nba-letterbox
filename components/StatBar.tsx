import { View, Text } from 'react-native';

interface StatBarItem {
  label: string;
  value: number;
}

interface StatBarProps {
  items: StatBarItem[];
}

export default function StatBar({ items }: StatBarProps) {
  const maxValue = Math.max(...items.map((i) => i.value), 1);

  return (
    <View className="gap-2">
      {items.map((item) => (
        <View key={item.label} className="flex-row items-center gap-2">
          <Text className="text-muted text-xs w-10 text-right" numberOfLines={1}>
            {item.label}
          </Text>
          <View className="flex-1 h-5 bg-border rounded-full overflow-hidden">
            <View
              className="h-full bg-accent rounded-full"
              style={{ width: `${(item.value / maxValue) * 100}%` }}
            />
          </View>
          <Text className="text-white text-xs font-medium w-8">
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
