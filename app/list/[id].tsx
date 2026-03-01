import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share as RNShare,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Trash2, Pencil, Share2 } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import TeamLogo from '@/components/TeamLogo';
import CreateListModal from '@/components/CreateListModal';
import { listUrl } from '@/lib/urls';
import type { List, GameWithTeams } from '@/types/database';
import { PageContainer } from '@/components/PageContainer';

interface ListDetail {
  list: List;
  games: GameWithTeams[];
}

async function fetchListDetail(listId: string): Promise<ListDetail> {
  const { data: list, error: listError } = await supabase
    .from('lists')
    .select('*')
    .eq('id', listId)
    .single();

  if (listError) throw listError;

  const { data: items, error: itemsError } = await supabase
    .from('list_items')
    .select(`
      position,
      game:games (
        *,
        home_team:teams!games_home_team_id_fkey (*),
        away_team:teams!games_away_team_id_fkey (*),
        season:seasons (*)
      )
    `)
    .eq('list_id', listId)
    .order('position', { ascending: true });

  if (itemsError) throw itemsError;

  const games = (items ?? [])
    .map((i: any) => i.game)
    .filter(Boolean) as unknown as GameWithTeams[];

  return { list: list as List, games };
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ListDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [showEditModal, setShowEditModal] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['list-detail', id],
    queryFn: () => fetchListDetail(id),
    enabled: !!id,
  });

  async function handleDeleteList() {
    Alert.alert('Delete List', 'Are you sure? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('lists').delete().eq('id', id);
          if (error) {
            Alert.alert('Error', error.message);
          } else {
            queryClient.invalidateQueries({ queryKey: ['profile'] });
            router.back();
          }
        },
      },
    ]);
  }

  async function handleRemoveGame(gameId: string) {
    if (!data) return;
    const { error } = await supabase
      .from('list_items')
      .delete()
      .eq('list_id', id)
      .eq('game_id', gameId);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      queryClient.invalidateQueries({ queryKey: ['list-detail', id] });
    }
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#c9a84c" size="large" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-[#e63946]">Failed to load list.</Text>
      </View>
    );
  }

  const { list, games } = data;
  const isOwner = user?.id === list.user_id;

  return (
    <View className="flex-1 bg-background">
      <PageContainer className="flex-1">
      {/* Header */}
      <View className="bg-surface border-b border-border px-5 py-5">
        <View className="flex-row items-center gap-2">
          <Text className="text-white text-xl font-bold flex-1" numberOfLines={2}>
            {list.title}
          </Text>
          {list.is_private && <Lock size={16} color="#6b7280" />}
          <View className="flex-row items-center gap-1">
            <TouchableOpacity
              className="p-2"
              onPress={() => {
                const url = listUrl(id);
                const message = `Check out "${list.title}" on Know Ball\n${url}`;
                RNShare.share(Platform.OS === 'ios' ? { message, url } : { message });
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Share2 size={18} color="#6b7280" />
            </TouchableOpacity>
            {isOwner && (
              <>
                <TouchableOpacity
                  className="p-2"
                  onPress={() => setShowEditModal(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Pencil size={18} color="#c9a84c" />
                </TouchableOpacity>
                <TouchableOpacity
                  className="p-2"
                  onPress={handleDeleteList}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Trash2 size={18} color="#e63946" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
        {list.description && (
          <Text className="text-muted text-sm mt-1">{list.description}</Text>
        )}
        <Text className="text-muted text-xs mt-2">
          {games.length} {games.length === 1 ? 'game' : 'games'}
        </Text>
      </View>

      <FlatList
        data={games}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          games.length === 0
            ? { flex: 1, justifyContent: 'center', alignItems: 'center' }
            : { paddingVertical: 8 }
        }
        ListEmptyComponent={
          <View className="px-6 items-center">
            <Text className="text-muted text-center">
              No games in this list yet. Add games from the game detail page.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="mx-4 my-1 bg-surface border border-border rounded-xl p-4"
            onPress={() => router.push(`/game/${item.id}`)}
            activeOpacity={0.7}
          >
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center gap-2 flex-1">
                <TeamLogo abbreviation={item.away_team.abbreviation} sport={item.sport ?? 'nba'} size={24} />
                <Text className="text-white font-semibold text-base">
                  {item.away_team.abbreviation}
                </Text>
                <Text className="text-muted font-semibold text-base">@</Text>
                <TeamLogo abbreviation={item.home_team.abbreviation} sport={item.sport ?? 'nba'} size={24} />
                <Text className="text-white font-semibold text-base">
                  {item.home_team.abbreviation}
                </Text>
                {item.home_team_score !== null && (
                  <Text className="text-muted text-sm ml-auto">
                    {item.away_team_score}–{item.home_team_score}
                  </Text>
                )}
              </View>
              {isOwner && (
                <TouchableOpacity
                  className="ml-3 p-1.5"
                  onPress={() => handleRemoveGame(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Trash2 size={16} color="#e63946" />
                </TouchableOpacity>
              )}
            </View>
            <Text className="text-muted text-xs mt-1">
              {formatDate(item.game_date_utc)}
            </Text>
          </TouchableOpacity>
        )}
        showsVerticalScrollIndicator={false}
      />

      </PageContainer>

      {showEditModal && (
        <CreateListModal
          existingList={list}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            refetch();
            queryClient.invalidateQueries({ queryKey: ['profile'] });
          }}
        />
      )}
    </View>
  );
}
