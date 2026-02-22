import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';

export default function RootLayout() {
  const { session, isLoading, setSession, setLoading } = useAuthStore();

  useEffect(() => {
    // Restore session from SecureStore on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Prevent auth flash while reading session from storage
  if (isLoading) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }}>
        {session ? (
          // Authenticated routes
          <>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="game/[id]"
              options={{ presentation: 'card', headerShown: true, title: 'Game' }}
            />
            <Stack.Screen
              name="user/[handle]"
              options={{ presentation: 'card', headerShown: true, title: 'Profile' }}
            />
          </>
        ) : (
          // Unauthenticated routes
          <Stack.Screen name="(auth)" />
        )}
      </Stack>
    </QueryClientProvider>
  );
}
