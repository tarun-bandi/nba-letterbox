import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import Avatar from './Avatar';
import type { UserProfile } from '@/types/database';

interface FollowListModalProps {
  userId: string;
  mode: 'followers' | 'following';
  onClose: () => void;
}

export default function FollowListModal({
  userId,
  mode,
  onClose,
}: FollowListModalProps) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      // Get follow relationships
      const column = mode === 'followers' ? 'following_id' : 'follower_id';
      const targetColumn = mode === 'followers' ? 'follower_id' : 'following_id';

      const { data: follows } = await supabase
        .from('follows')
        .select(targetColumn)
        .eq(column, userId);

      const ids = (follows ?? []).map((f: any) => f[targetColumn]);

      if (ids.length === 0) {
        setLoading(false);
        return;
      }

      const { data: profs } = await supabase
        .from('user_profiles')
        .select('*')
        .in('user_id', ids)
        .order('display_name', { ascending: true });

      setProfiles((profs ?? []) as UserProfile[]);
      setLoading(false);
    }

    load();
  }, [userId, mode]);

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
          <View
            className="bg-surface rounded-t-3xl border-t border-border"
            style={{ maxHeight: '70%' }}
          >
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>

            <View className="flex-row justify-between items-center px-5 pt-2 pb-3">
              <Text className="text-white text-lg font-semibold">
                {mode === 'followers' ? 'Followers' : 'Following'}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View className="items-center py-8">
                <ActivityIndicator color="#e5e5e5" />
              </View>
            ) : (
              <FlatList
                data={profiles}
                keyExtractor={(item) => item.user_id}
                contentContainerStyle={
                  profiles.length === 0
                    ? { alignItems: 'center', paddingVertical: 32 }
                    : { paddingHorizontal: 20, paddingBottom: 32 }
                }
                ListEmptyComponent={
                  <Text className="text-muted text-sm">
                    {mode === 'followers'
                      ? 'No followers yet'
                      : 'Not following anyone yet'}
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    className="flex-row items-center gap-3 py-3 border-b border-border"
                    onPress={() => {
                      onClose();
                      router.push(`/user/${item.handle}`);
                    }}
                    activeOpacity={0.7}
                  >
                    <Avatar
                      url={item.avatar_url}
                      name={item.display_name}
                      size={40}
                    />
                    <View className="flex-1">
                      <Text className="text-white font-medium">
                        {item.display_name}
                      </Text>
                      <Text className="text-muted text-sm">
                        @{item.handle}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
