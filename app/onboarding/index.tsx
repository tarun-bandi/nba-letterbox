import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/lib/store/authStore';
import { supabase } from '@/lib/supabase';
import { PageContainer } from '@/components/PageContainer';

export default function OnboardingWelcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, setOnboardingCompleted } = useAuthStore();

  async function handleSkip() {
    if (user) {
      await supabase
        .from('user_profiles')
        .update({ onboarding_completed: true })
        .eq('user_id', user.id);
      setOnboardingCompleted(true);
    }
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <PageContainer className="flex-1">
      <View className="flex-1 justify-center items-center px-8">
        <Text style={{ fontSize: 64 }} className="mb-6">🏀</Text>
        <Text className="text-white text-3xl font-bold text-center mb-3">
          Welcome to Know Ball
        </Text>
        <Text className="text-muted text-center text-base leading-relaxed mb-2">
          Log every game you watch. Rate, review, and share your takes with other NBA fans.
        </Text>
        <Text className="text-muted text-center text-sm">
          Let's get you set up in a few quick steps.
        </Text>
      </View>

      <View className="px-8 pb-4">
        <TouchableOpacity
          className="bg-accent rounded-xl py-4 items-center mb-3"
          onPress={() => router.push('/onboarding/favorite-teams')}
          activeOpacity={0.8}
        >
          <Text className="text-background font-semibold text-base">
            Get Started
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="py-3 items-center"
          onPress={handleSkip}
          activeOpacity={0.7}
        >
          <Text className="text-muted text-sm">Skip for now</Text>
        </TouchableOpacity>
      </View>
      </PageContainer>
    </View>
  );
}
