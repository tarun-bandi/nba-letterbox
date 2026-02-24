import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
  Platform,
} from 'react-native';
import { X, UserPlus, Check } from 'lucide-react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { useToastStore } from '@/lib/store/toastStore';
import {
  requestContactsPermission,
  getContactEmails,
  findFriendsByEmail,
  type FriendMatch,
} from '@/lib/contactSync';
import Avatar from './Avatar';

interface FindFriendsSheetProps {
  onClose: () => void;
}

type SheetState = 'loading' | 'no_permission' | 'no_matches' | 'results';

export default function FindFriendsSheet({ onClose }: FindFriendsSheetProps) {
  const { user } = useAuthStore();
  const toast = useToastStore();
  const queryClient = useQueryClient();
  const [state, setState] = useState<SheetState>('loading');
  const [friends, setFriends] = useState<FriendMatch[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadFriends();
  }, []);

  async function loadFriends() {
    try {
      const granted = await requestContactsPermission();
      if (!granted) {
        setState('no_permission');
        return;
      }

      const emails = await getContactEmails();
      const matches = await findFriendsByEmail(emails, user!.id);

      if (matches.length === 0) {
        setState('no_matches');
        return;
      }

      // Check which ones are already followed
      const { data: existingFollows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user!.id)
        .in(
          'following_id',
          matches.map((m) => m.user_id),
        );

      const alreadyFollowed = new Set(
        (existingFollows ?? []).map((f) => f.following_id),
      );
      setFollowedIds(alreadyFollowed);
      setFriends(matches);
      setState('results');
    } catch {
      setState('no_matches');
    }
  }

  const followMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!user) return;
      const { error } = await supabase.from('follows').insert({
        follower_id: user.id,
        following_id: targetUserId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, targetUserId) => {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setFollowedIds((prev) => new Set([...prev, targetUserId]));
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['discover'] });
      toast.show('Followed!');
    },
  });

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-4 border-b border-border">
          <Text className="text-white text-lg font-bold">Find Friends</Text>
          <TouchableOpacity onPress={onClose} className="p-2">
            <X size={22} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {state === 'loading' && (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#c9a84c" size="large" />
            <Text className="text-muted text-sm mt-3">
              Checking your contacts...
            </Text>
          </View>
        )}

        {state === 'no_permission' && (
          <View className="flex-1 items-center justify-center px-6">
            <Text style={{ fontSize: 40 }} className="mb-3">
              {'\uD83D\uDCCB'}
            </Text>
            <Text className="text-white font-semibold text-lg text-center mb-2">
              Contacts Access Needed
            </Text>
            <Text className="text-muted text-sm text-center">
              Grant contacts permission in Settings to find friends who are
              already on NBA Letterbox.
            </Text>
          </View>
        )}

        {state === 'no_matches' && (
          <View className="flex-1 items-center justify-center px-6">
            <Text style={{ fontSize: 40 }} className="mb-3">
              {'\uD83D\uDC4B'}
            </Text>
            <Text className="text-white font-semibold text-lg text-center mb-2">
              No Matches Found
            </Text>
            <Text className="text-muted text-sm text-center">
              None of your contacts are on NBA Letterbox yet. Invite them to
              join!
            </Text>
          </View>
        )}

        {state === 'results' && (
          <FlatList
            data={friends}
            keyExtractor={(item) => item.user_id}
            contentContainerStyle={{ paddingVertical: 8 }}
            renderItem={({ item }) => {
              const isFollowed = followedIds.has(item.user_id);
              return (
                <View className="px-4 py-3 flex-row items-center gap-3">
                  <Avatar
                    url={item.avatar_url}
                    name={item.display_name}
                    size={44}
                  />
                  <View className="flex-1">
                    <Text className="text-white font-semibold">
                      {item.display_name}
                    </Text>
                    <Text className="text-muted text-sm">
                      @{item.handle}
                    </Text>
                  </View>
                  {isFollowed ? (
                    <View className="flex-row items-center gap-1 px-3 py-1.5 rounded-full border border-border bg-surface">
                      <Check size={14} color="#6b7280" />
                      <Text className="text-muted text-xs font-semibold">
                        Following
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      className="bg-accent rounded-full px-3 py-1.5 flex-row items-center gap-1"
                      onPress={() => followMutation.mutate(item.user_id)}
                      disabled={followMutation.isPending}
                      activeOpacity={0.7}
                    >
                      <UserPlus size={14} color="#0a0a0a" />
                      <Text className="text-background text-xs font-semibold">
                        Follow
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}
