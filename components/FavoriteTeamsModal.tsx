import { useState, useEffect } from 'react';
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
import TeamLogo from './TeamLogo';
import type { Team } from '@/types/database';

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
  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentFavoriteIds));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('teams')
      .select('*')
      .in('conference', ['East', 'West'])
      .order('full_name', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setTeams(data as Team[]);
        setLoading(false);
      });
  }, []);

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
