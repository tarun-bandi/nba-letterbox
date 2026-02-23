import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Search, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { useDebounce } from '@/hooks/useDebounce';
import TeamLogo from './TeamLogo';
import type { Player, Team } from '@/types/database';

interface PlayerWithTeam extends Player {
  team: Team | null;
}

interface FavoritePlayersModalProps {
  currentFavoriteIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function FavoritePlayersModal({
  currentFavoriteIds,
  onClose,
  onSuccess,
}: FavoritePlayersModalProps) {
  const { user } = useAuthStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerWithTeam[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentFavoriteIds));
  const [selectedPlayers, setSelectedPlayers] = useState<PlayerWithTeam[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const debouncedQuery = useDebounce(query, 350);

  // Load initial selected player details
  useEffect(() => {
    if (currentFavoriteIds.length === 0) return;
    supabase
      .from('players')
      .select('*, team:teams (*)')
      .in('id', currentFavoriteIds)
      .then(({ data }) => {
        if (data) setSelectedPlayers(data as unknown as PlayerWithTeam[]);
      });
  }, []);

  // Search players
  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    supabase
      .from('players')
      .select('*, team:teams (*)')
      .or(
        `first_name.ilike.%${debouncedQuery}%,last_name.ilike.%${debouncedQuery}%`,
      )
      .order('last_name', { ascending: true })
      .limit(30)
      .then(({ data, error }) => {
        setSearching(false);
        if (!error && data) setResults(data as unknown as PlayerWithTeam[]);
      });
  }, [debouncedQuery]);

  function togglePlayer(player: PlayerWithTeam) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(player.id)) {
        next.delete(player.id);
        setSelectedPlayers((sp) => sp.filter((p) => p.id !== player.id));
      } else {
        next.add(player.id);
        setSelectedPlayers((sp) => [...sp, player]);
      }
      return next;
    });
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);

    const { error: deleteError } = await supabase
      .from('user_favorite_players')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      setSaving(false);
      Alert.alert('Error', deleteError.message);
      return;
    }

    if (selected.size > 0) {
      const rows = [...selected].map((player_id) => ({
        user_id: user.id,
        player_id,
      }));
      const { error: insertError } = await supabase
        .from('user_favorite_players')
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

  function getPositionColor(pos: string | null): string {
    switch (pos) {
      case 'G': return '#4ade80';
      case 'F': return '#60a5fa';
      case 'C': return '#f472b6';
      case 'G-F':
      case 'F-G': return '#a78bfa';
      case 'F-C':
      case 'C-F': return '#fb923c';
      default: return '#6b7280';
    }
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
          <View className="bg-surface rounded-t-3xl border-t border-border" style={{ maxHeight: '90%' }}>
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>

            <View className="flex-row justify-between items-center px-5 pt-2 pb-3">
              <Text className="text-white text-lg font-semibold">
                Favorite Players
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {/* Selected pills */}
            {selectedPlayers.length > 0 && (
              <View className="px-5 pb-2">
                <View className="flex-row flex-wrap gap-2">
                  {selectedPlayers.filter((p) => selected.has(p.id)).map((player) => (
                    <TouchableOpacity
                      key={player.id}
                      className="flex-row items-center gap-1.5 bg-accent/10 border border-accent/30 rounded-full px-3 py-1"
                      onPress={() => togglePlayer(player)}
                    >
                      <Text className="text-accent text-xs font-medium">
                        {player.first_name} {player.last_name}
                      </Text>
                      <X size={12} color="#c9a84c" />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Search input */}
            <View className="px-5 pb-3">
              <View className="flex-row items-center bg-background border border-border rounded-xl px-3 gap-2">
                <Search size={16} color="#6b7280" />
                <TextInput
                  className="flex-1 py-3 text-white text-sm"
                  placeholder="Search players by name..."
                  placeholderTextColor="#6b7280"
                  value={query}
                  onChangeText={setQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Results */}
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isSelected = selected.has(item.id);
                return (
                  <TouchableOpacity
                    className={`mx-5 mb-2 flex-row items-center gap-3 p-3 rounded-xl border ${
                      isSelected ? 'border-accent bg-accent/10' : 'border-border bg-background'
                    }`}
                    onPress={() => togglePlayer(item)}
                    activeOpacity={0.7}
                  >
                    <View className="flex-1 flex-row items-center gap-3">
                      <View className="flex-1">
                        <Text className={`font-medium ${isSelected ? 'text-accent' : 'text-white'}`}>
                          {item.first_name} {item.last_name}
                        </Text>
                        <View className="flex-row items-center gap-2 mt-0.5">
                          {item.position && (
                            <Text
                              className="text-xs font-semibold"
                              style={{ color: getPositionColor(item.position) }}
                            >
                              {item.position}
                            </Text>
                          )}
                          {item.team && (
                            <View className="flex-row items-center gap-1">
                              <TeamLogo abbreviation={(item.team as Team).abbreviation} size={14} />
                              <Text className="text-muted text-xs">
                                {(item.team as Team).abbreviation}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                    {isSelected && <Check size={16} color="#c9a84c" />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                searching ? (
                  <View className="items-center py-8">
                    <ActivityIndicator color="#c9a84c" />
                  </View>
                ) : debouncedQuery.length >= 2 ? (
                  <View className="items-center py-8">
                    <Text className="text-muted text-sm">No players found</Text>
                  </View>
                ) : (
                  <View className="items-center py-8 px-6">
                    <Text className="text-muted text-sm text-center">
                      Search for players by name to add them to your favorites
                    </Text>
                  </View>
                )
              }
              style={{ maxHeight: 300 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />

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
