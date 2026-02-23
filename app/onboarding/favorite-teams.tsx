import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { useTeams } from '@/hooks/useTeams';
import TeamLogo from '@/components/TeamLogo';

export default function OnboardingFavoriteTeams() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, setOnboardingCompleted } = useAuthStore();
  const { data: teams = [], isLoading: loading } = useTeams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  function toggleTeam(teamId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  async function handleNext() {
    if (!user) return;
    setSaving(true);

    if (selected.size > 0) {
      const rows = [...selected].map((team_id) => ({
        user_id: user.id,
        team_id,
      }));
      await supabase.from('user_favorite_teams').insert(rows);
    }

    setSaving(false);
    router.push('/onboarding/profile-setup');
  }

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
      <View className="px-8 pt-6 pb-4">
        <Text className="text-muted text-sm mb-1">Step 1 of 2</Text>
        <Text className="text-white text-2xl font-bold mb-2">
          Pick your favorite teams
        </Text>
        <Text className="text-muted text-sm">
          Your feed will prioritize games from these teams.
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#c9a84c" />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-6"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          <View className="flex-row flex-wrap gap-2">
            {teams.map((team) => {
              const isSelected = selected.has(team.id);
              return (
                <TouchableOpacity
                  key={team.id}
                  className={`flex-row items-center gap-2 px-3 py-2 rounded-xl border ${
                    isSelected
                      ? 'border-accent bg-accent/10'
                      : 'border-border bg-surface'
                  }`}
                  onPress={() => toggleTeam(team.id)}
                  activeOpacity={0.7}
                >
                  <TeamLogo abbreviation={team.abbreviation} size={20} />
                  <Text
                    className={`text-sm font-medium ${
                      isSelected ? 'text-accent' : 'text-muted'
                    }`}
                  >
                    {team.abbreviation}
                  </Text>
                  {isSelected && <Check size={14} color="#c9a84c" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      <View className="px-8 pb-4 pt-2">
        <TouchableOpacity
          className="bg-accent rounded-xl py-4 items-center mb-3"
          onPress={handleNext}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <Text className="text-background font-semibold text-base">
              {selected.size > 0
                ? `Next (${selected.size} selected)`
                : 'Next'}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          className="py-3 items-center"
          onPress={handleSkip}
          activeOpacity={0.7}
        >
          <Text className="text-muted text-sm">Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
