import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { usePreferencesStore } from '@/lib/store/preferencesStore';
import Avatar from '@/components/Avatar';
import { PageContainer } from '@/components/PageContainer';
import { useQueryClient } from '@tanstack/react-query';
import type { UserProfile, WatchMode, Sport } from '@/types/database';

const WATCH_MODES: { value: WatchMode | null; label: string }[] = [
  { value: null, label: 'None' },
  { value: 'live', label: 'Live' },
  { value: 'replay', label: 'Replay' },
  { value: 'condensed', label: 'Condensed' },
  { value: 'highlights', label: 'Highlights' },
];

export default function SettingsScreen() {
  const { user, setSession } = useAuthStore();
  const {
    defaultWatchMode,
    spoilerFreeMode,
    setDefaultWatchMode,
    setSpoilerFreeMode,
  } = usePreferencesStore();
  const [signingOut, setSigningOut] = useState(false);
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ['settings-profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data as UserProfile;
    },
    enabled: !!user,
  });

  async function performSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSession(null);
    setSigningOut(false);
  }

  function handleSignOut() {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out?')) {
        performSignOut();
      }
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: performSignOut },
      ]);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      showsVerticalScrollIndicator={false}
    >
      <PageContainer>
      {/* Account */}
      <View className="px-4 pt-4">
        <Text className="text-muted text-xs font-semibold uppercase tracking-wider mb-3">
          Account
        </Text>
        <View className="bg-surface border border-border rounded-xl p-4">
          {profile && (
            <View className="flex-row items-center gap-3 mb-3">
              <Avatar
                url={profile.avatar_url}
                name={profile.display_name}
                size={48}
              />
              <View className="flex-1">
                <Text className="text-white font-semibold text-base">
                  {profile.display_name}
                </Text>
                <Text className="text-muted text-sm">@{profile.handle}</Text>
              </View>
            </View>
          )}
          <View className="border-t border-border pt-3">
            <Text className="text-muted text-xs mb-1">Email</Text>
            <Text className="text-white text-sm">{user?.email ?? '—'}</Text>
          </View>
        </View>
      </View>

      {/* Preferences */}
      <View className="px-4 pt-6">
        <Text className="text-muted text-xs font-semibold uppercase tracking-wider mb-3">
          Preferences
        </Text>
        <View className="bg-surface border border-border rounded-xl">
          {/* Default Watch Mode */}
          <View className="p-4 border-b border-border">
            <Text className="text-white font-medium mb-2">
              Default Watch Mode
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {WATCH_MODES.map((mode) => (
                <TouchableOpacity
                  key={mode.label}
                  onPress={() => setDefaultWatchMode(mode.value)}
                  className={`px-3 py-1.5 rounded-full border ${
                    defaultWatchMode === mode.value
                      ? 'bg-accent border-accent'
                      : 'bg-background border-border'
                  }`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      defaultWatchMode === mode.value
                        ? 'text-background'
                        : 'text-muted'
                    }`}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Spoiler-Free Mode */}
          <View className="p-4 flex-row items-center justify-between">
            <View className="flex-1 mr-4">
              <Text className="text-white font-medium">Spoiler-Free Mode</Text>
              <Text className="text-muted text-xs mt-1">
                Hide scores in Today's Games and search results
              </Text>
            </View>
            <Switch
              value={spoilerFreeMode}
              onValueChange={setSpoilerFreeMode}
              trackColor={{ false: '#2a2a2a', true: '#c9a84c' }}
              thumbColor="#ffffff"
            />
          </View>
        </View>
      </View>

      {/* Sports */}
      <View className="px-4 pt-6">
        <Text className="text-muted text-xs font-semibold uppercase tracking-wider mb-3">
          Sports
        </Text>
        <View className="bg-surface border border-border rounded-xl">
          {(['nba', 'nfl'] as const).map((sport, i) => {
            const enabled = (profile?.enabled_sports ?? ['nba']).includes(sport);
            return (
              <View
                key={sport}
                className={`p-4 flex-row items-center justify-between ${i > 0 ? 'border-t border-border' : ''}`}
              >
                <Text className="text-white font-medium">{sport.toUpperCase()}</Text>
                <Switch
                  value={enabled}
                  onValueChange={async (val) => {
                    if (!user || !profile) return;
                    const current = profile.enabled_sports ?? ['nba'];
                    const next = val
                      ? [...new Set([...current, sport])]
                      : current.filter((s: string) => s !== sport);
                    // Don't allow disabling all sports
                    if (next.length === 0) return;
                    await supabase
                      .from('user_profiles')
                      .update({ enabled_sports: next })
                      .eq('user_id', user.id);
                    queryClient.invalidateQueries({ queryKey: ['settings-profile'] });
                    queryClient.invalidateQueries({ queryKey: ['todays-games'] });
                    queryClient.invalidateQueries({ queryKey: ['feed'] });
                  }}
                  trackColor={{ false: '#2a2a2a', true: '#c9a84c' }}
                  thumbColor="#ffffff"
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* About */}
      <View className="px-4 pt-6">
        <Text className="text-muted text-xs font-semibold uppercase tracking-wider mb-3">
          About
        </Text>
        <View className="bg-surface border border-border rounded-xl p-4">
          <View className="flex-row justify-between items-center">
            <Text className="text-white">Version</Text>
            <Text className="text-muted">1.0.0</Text>
          </View>
        </View>
      </View>

      {/* Sign Out */}
      <View className="px-4 pt-6 pb-8">
        <TouchableOpacity
          className="bg-accent-red/10 border border-accent-red/30 rounded-xl py-4 items-center"
          onPress={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator color="#e63946" />
          ) : (
            <Text className="text-accent-red font-semibold text-base">
              Sign Out
            </Text>
          )}
        </TouchableOpacity>
      </View>
      </PageContainer>
    </ScrollView>
  );
}
