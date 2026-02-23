import { Redirect } from 'expo-router';
import { useAuthStore } from '@/lib/store/authStore';

export default function Index() {
  const { session, isLoading, onboardingCompleted } = useAuthStore();

  if (isLoading) return null;

  if (session) {
    if (onboardingCompleted === false) {
      return <Redirect href="/onboarding" />;
    }
    return <Redirect href="/(tabs)/feed" />;
  }

  return <Redirect href="/(auth)/login" />;
}
