import '../global.css';
import { useEffect, useRef } from 'react';
import { StatusBar } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { registerForPushNotificationsAsync, savePushToken } from '@/lib/pushNotifications';
import Toast from '@/components/Toast';

// Show notifications when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function useProtectedRoute() {
  const { session, isLoading, onboardingCompleted } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      if (onboardingCompleted === false) {
        router.replace('/onboarding');
      } else {
        router.replace('/(tabs)/feed');
      }
    } else if (session && !inOnboarding && onboardingCompleted === false) {
      router.replace('/onboarding');
    } else if (session && inOnboarding && onboardingCompleted === true) {
      router.replace('/(tabs)/feed');
    }
  }, [session, isLoading, segments, onboardingCompleted]);
}

async function fetchOnboardingStatus(userId: string): Promise<boolean> {
  // Query the full profile row and check if the column exists
  // This handles the case where the migration hasn't been applied yet
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return true; // default to completed if can't fetch

  // If the column exists, use it; otherwise assume completed (pre-migration user)
  if ('onboarding_completed' in data) {
    return (data as any).onboarding_completed ?? true;
  }
  return true;
}

function usePushNotifications() {
  const { session } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!session?.user) return;

    // Register push token
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        savePushToken(token, session.user.id);
      }
    });

    // Handle notification tap deep-linking
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data?.type === 'like' || data?.type === 'comment') {
          if (data.gameId) router.push(`/game/${data.gameId}`);
        } else if (data?.type === 'follow') {
          if (data.handle) router.push(`/user/${data.handle}`);
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, [session?.user?.id]);
}

export default function RootLayout() {
  const { isLoading, setSession, setLoading, setOnboardingCompleted } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchOnboardingStatus(session.user.id).then((completed) => {
          setOnboardingCompleted(completed);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchOnboardingStatus(session.user.id).then((completed) => {
          setOnboardingCompleted(completed);
        });
      } else {
        setOnboardingCompleted(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useProtectedRoute();
  usePushNotifications();

  if (isLoading) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen
              name="game/[id]"
              options={{
                headerShown: true,
                title: 'Game',
                headerStyle: { backgroundColor: '#1a1a1a' },
                headerTintColor: '#ffffff',
              }}
            />
            <Stack.Screen
              name="user/[handle]"
              options={{
                headerShown: true,
                title: 'Profile',
                headerStyle: { backgroundColor: '#1a1a1a' },
                headerTintColor: '#ffffff',
              }}
            />
            <Stack.Screen
              name="list/[id]"
              options={{
                headerShown: true,
                title: 'List',
                headerStyle: { backgroundColor: '#1a1a1a' },
                headerTintColor: '#ffffff',
              }}
            />
            <Stack.Screen
              name="notifications"
              options={{
                headerShown: true,
                title: 'Notifications',
                headerStyle: { backgroundColor: '#1a1a1a' },
                headerTintColor: '#ffffff',
              }}
            />
            <Stack.Screen
              name="tag/[slug]"
              options={{
                headerShown: true,
                title: 'Tag',
                headerStyle: { backgroundColor: '#1a1a1a' },
                headerTintColor: '#ffffff',
              }}
            />
            <Stack.Screen
              name="watchlist"
              options={{
                headerShown: true,
                title: 'Watchlist',
                headerStyle: { backgroundColor: '#1a1a1a' },
                headerTintColor: '#ffffff',
              }}
            />
            <Stack.Screen
              name="stats"
              options={{
                headerShown: true,
                title: 'Stats & Insights',
                headerStyle: { backgroundColor: '#1a1a1a' },
                headerTintColor: '#ffffff',
              }}
            />
            <Stack.Screen
              name="settings"
              options={{
                headerShown: true,
                title: 'Settings',
                headerStyle: { backgroundColor: '#1a1a1a' },
                headerTintColor: '#ffffff',
              }}
            />
            <Stack.Screen
              name="player/[id]"
              options={{
                headerShown: true,
                title: 'Player',
                headerStyle: { backgroundColor: '#1a1a1a' },
                headerTintColor: '#ffffff',
              }}
            />
          </Stack>
          <Toast />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
