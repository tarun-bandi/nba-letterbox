import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { X, Check, Plus, Lock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import CreateListModal from './CreateListModal';
import type { List } from '@/types/database';

interface AddToListModalProps {
  gameId: string;
  onClose: () => void;
}

export default function AddToListModal({ gameId, onClose }: AddToListModalProps) {
  const { user } = useAuthStore();
  const [lists, setLists] = useState<List[]>([]);
  const [gameInLists, setGameInLists] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreateList, setShowCreateList] = useState(false);

  async function fetchLists() {
    if (!user) return;
    setLoading(true);

    const [listsRes, itemsRes] = await Promise.all([
      supabase
        .from('lists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('list_items')
        .select('list_id')
        .eq('game_id', gameId),
    ]);

    setLists((listsRes.data ?? []) as List[]);
    setGameInLists(new Set((itemsRes.data ?? []).map((i) => i.list_id)));
    setLoading(false);
  }

  useEffect(() => {
    fetchLists();
  }, []);

  async function toggleGame(listId: string) {
    if (!user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const isInList = gameInLists.has(listId);

    if (isInList) {
      const { error } = await supabase
        .from('list_items')
        .delete()
        .eq('list_id', listId)
        .eq('game_id', gameId);
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      setGameInLists((prev) => {
        const next = new Set(prev);
        next.delete(listId);
        return next;
      });
    } else {
      // Get next position
      const { count } = await supabase
        .from('list_items')
        .select('*', { count: 'exact', head: true })
        .eq('list_id', listId);

      const { error } = await supabase.from('list_items').insert({
        list_id: listId,
        game_id: gameId,
        position: (count ?? 0) + 1,
      });
      if (error) {
        Alert.alert('Error', error.message);
        return;
      }
      setGameInLists((prev) => new Set(prev).add(listId));
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
        <View className="bg-surface rounded-t-3xl border-t border-border max-h-[70%]">
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 bg-border rounded-full" />
          </View>

          <View className="flex-row justify-between items-center px-5 pt-2 pb-4">
            <Text className="text-white text-lg font-semibold">
              Add to List
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View className="py-12 items-center">
              <ActivityIndicator color="#c9a84c" />
            </View>
          ) : (
            <FlatList
              data={lists}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
              ListHeaderComponent={
                <TouchableOpacity
                  className="flex-row items-center gap-3 py-3 mb-2 border-b border-border"
                  onPress={() => setShowCreateList(true)}
                >
                  <View className="w-10 h-10 bg-accent/20 rounded-lg items-center justify-center">
                    <Plus size={20} color="#c9a84c" />
                  </View>
                  <Text className="text-accent font-medium text-base">
                    Create New List
                  </Text>
                </TouchableOpacity>
              }
              ListEmptyComponent={
                <View className="items-center py-8">
                  <Text className="text-muted">No lists yet. Create one above!</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isInList = gameInLists.has(item.id);
                return (
                  <TouchableOpacity
                    className="flex-row items-center justify-between py-3 border-b border-border"
                    onPress={() => toggleGame(item.id)}
                  >
                    <View className="flex-row items-center gap-3 flex-1">
                      <View
                        className={`w-10 h-10 rounded-lg items-center justify-center ${
                          isInList ? 'bg-accent' : 'bg-background border border-border'
                        }`}
                      >
                        {isInList && <Check size={18} color="#0a0a0a" />}
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-1.5">
                          <Text className="text-white font-medium" numberOfLines={1}>
                            {item.title}
                          </Text>
                          {item.is_private && <Lock size={12} color="#6b7280" />}
                        </View>
                        {item.description && (
                          <Text className="text-muted text-xs mt-0.5" numberOfLines={1}>
                            {item.description}
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>

      {showCreateList && (
        <CreateListModal
          onClose={() => setShowCreateList(false)}
          onSuccess={() => {
            setShowCreateList(false);
            fetchLists();
          }}
        />
      )}
    </Modal>
  );
}
