import { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore, ToastType } from '@/lib/store/toastStore';

const COLORS: Record<ToastType, { bg: string; text: string }> = {
  success: { bg: '#166534', text: '#bbf7d0' },
  error: { bg: '#991b1b', text: '#fecaca' },
  info: { bg: '#1e3a5f', text: '#bfdbfe' },
};

export default function Toast() {
  const { message, type, visible, hide } = useToastStore();
  const translateY = useRef(new Animated.Value(-100)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: visible ? 0 : -100,
      useNativeDriver: true,
      damping: 15,
      stiffness: 150,
    }).start();
  }, [visible]);

  if (!message) return null;

  const colors = COLORS[type];

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 16,
        right: 16,
        transform: [{ translateY }],
        zIndex: 9999,
      }}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={hide}
        style={{
          backgroundColor: colors.bg,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderRadius: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          elevation: 5,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
          {message}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
