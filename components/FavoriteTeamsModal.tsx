import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { useTeams } from '@/hooks/useTeams';
import TeamLogo from './TeamLogo';
import type { Sport } from '@/types/database';

const SPORT_TABS: { key: Sport; label: string }[] = [
  { key: 'nba', label: 'NBA' },
  { key: 'nfl', label: 'NFL' },
];

interface FavoriteTeamsModalProps {
  currentFavoriteIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function FavoriteTeamsModal({
  currentFavoriteIds,
  onClose,
  onSuccess,
}: FavoriteTeamsModalProps) {
  const { user } = useAuthStore();
  const [activeSport, setActiveSport] = useState<Sport>('nba');
  const { data: nbaTeams = [], isLoading: nbaLoading } = useTeams('nba');
  const { data: nflTeams = [], isLoading: nflLoading } = useTeams('nfl');
  const [selected, setSelected] = useState<Set<string>>(new Set(currentFavoriteIds));
  const [saving, setSaving] = useState(false);

  const teams = activeSport === 'nba' ? nbaTeams : nflTeams;
  const loading = activeSport === 'nba' ? nbaLoading : nflLoading;

  // Determine which sport has selections to lock the tabs
  const nbaIds = new Set(nbaTeams.map((t) => t.id));
  const nflIds = new Set(nflTeams.map((t) => t.id));
  const hasNbaSelected = [...selected].some((id) => nbaIds.has(id));
  const hasNflSelected = [...selected].some((id) => nflIds.has(id));
  const lockedSport: Sport | null = hasNbaSelected ? 'nba' : hasNflSelected ? 'nfl' : null;

  function toggleTeam(teamId: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);

    // Delete all existing favorites, then insert new ones
    const { error: deleteError } = await supabase
      .from('user_favorite_teams')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      setSaving(false);
      Alert.alert('Error', deleteError.message);
      return;
    }

    if (selected.size > 0) {
      const rows = [...selected].map((team_id) => ({
        user_id: user.id,
        team_id,
      }));
      const { error: insertError } = await supabase
        .from('user_favorite_teams')
        .insert(rows);

      if (insertError) {
        setSaving(false);
        Alert.alert('Error', insertError.message);
        return;
      }
    }

    // Update enabled_sports based on selections
    const selectedNfl = nflTeams.some((t) => selected.has(t.id));
    const enabledSports: Sport[] = ['nba'];
    if (selectedNfl) enabledSports.push('nfl');

    await supabase
      .from('user_profiles')
      .update({ enabled_sports: enabledSports })
      .eq('user_id', user.id);

    setSaving(false);
    onSuccess();
  }

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end bg-black/60">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View className="bg-surface rounded-t-3xl border-t border-border" style={{ maxHeight: '85%' }}>
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>

            <View className="flex-row justify-between items-center px-5 pt-2 pb-4">
              <Text className="text-white text-lg font-semibold">
                Favorite Teams
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {/* Sport tabs */}
            <View className="flex-row px-5 mb-3 gap-2">
              {SPORT_TABS.map((tab) => {
                const isActive = activeSport === tab.key;
                const isDisabled = lockedSport !== null && lockedSport !== tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => !isDisabled && setActiveSport(tab.key)}
                    disabled={isDisabled}
                    className="px-4 py-1.5 rounded-full border border-border bg-background"
                    style={[
                      isActive ? { backgroundColor: '#c9a84c', borderColor: '#c9a84c' } : undefined,
                      isDisabled ? { opacity: 0.35 } : undefined,
                    ]}
                  >
                    <Text
                      className="text-sm font-medium text-muted"
                      style={isActive ? { color: '#0a0a0a' } : undefined}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {loading ? (
              <View className="items-center py-8">
                <ActivityIndicator color="#c9a84c" />
              </View>
            ) : (
              <ScrollView
                className="px-5"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 16 }}
              >
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {teams.map((team) => {
                    const isSelected = selected.has(team.id);
                    return (
                      <TouchableOpacity
                        key={team.id}
                        className={`flex-row items-center gap-2 px-3 py-2 rounded-xl border ${
                          isSelected
                            ? 'border-accent bg-accent/10'
                            : 'border-border bg-background'
                        }`}
                        onPress={() => toggleTeam(team.id)}
                        activeOpacity={0.7}
                      >
                        <TeamLogo abbreviation={team.abbreviation} sport={activeSport} size={20} />
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

            <View className="px-5 pb-8 pt-4">
              <TouchableOpacity
                className="bg-accent rounded-xl py-4 items-center"
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#0a0a0a" />
                ) : (
                  <Text className="text-background font-semibold text-base">
                    Save ({selected.size} selected)
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
