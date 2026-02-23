import { View, Text, TouchableOpacity } from 'react-native';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  message = 'Something went wrong',
  onRetry,
}: ErrorStateProps) {
  return (
    <View className="flex-1 bg-background items-center justify-center px-6">
      <Text style={{ fontSize: 40 }} className="mb-3">⚠️</Text>
      <Text className="text-white font-semibold text-base mb-2">{message}</Text>
      {onRetry && (
        <TouchableOpacity
          className="bg-accent rounded-xl px-6 py-3 mt-2"
          onPress={onRetry}
          activeOpacity={0.8}
        >
          <Text className="text-background font-semibold text-sm">Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
