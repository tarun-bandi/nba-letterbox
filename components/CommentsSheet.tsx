import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Send, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { useToastStore } from '@/lib/store/toastStore';
import Avatar from './Avatar';
import type { Comment, UserProfile } from '@/types/database';

interface CommentWithProfile extends Comment {
  profile?: UserProfile;
}

interface CommentsSheetProps {
  logId: string;
  onClose: () => void;
  onCommentCountChange?: (count: number) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function CommentsSheet({
  logId,
  onClose,
  onCommentCountChange,
}: CommentsSheetProps) {
  const { user } = useAuthStore();
  const toast = useToastStore();
  const [comments, setComments] = useState<CommentWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);

  async function fetchComments() {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('log_id', logId)
      .order('created_at', { ascending: true });

    if (error) {
      toast.show('Failed to load comments', 'error');
      setLoading(false);
      return;
    }

    const rawComments = (data ?? []) as Comment[];

    // Fetch profiles
    const userIds = [...new Set(rawComments.map((c) => c.user_id))];
    let profileMap: Record<string, UserProfile> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('*')
        .in('user_id', userIds);
      for (const p of (profiles ?? []) as UserProfile[]) {
        profileMap[p.user_id] = p;
      }
    }

    setComments(
      rawComments.map((c) => ({ ...c, profile: profileMap[c.user_id] })),
    );
    onCommentCountChange?.(rawComments.length);
    setLoading(false);
  }

  useEffect(() => {
    fetchComments();
  }, [logId]);

  async function handlePost() {
    if (!user || !body.trim()) return;
    setPosting(true);

    const { error } = await supabase.from('comments').insert({
      user_id: user.id,
      log_id: logId,
      body: body.trim(),
    });

    setPosting(false);

    if (error) {
      toast.show(error.message, 'error');
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setBody('');
      fetchComments();
    }
  }

  async function handleDelete(commentId: string) {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (error) {
      toast.show(error.message, 'error');
    } else {
      fetchComments();
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
          <View
            className="bg-surface rounded-t-3xl border-t border-border"
            style={{ maxHeight: '70%' }}
          >
            <View className="items-center pt-3 pb-1">
              <View className="w-10 h-1 bg-border rounded-full" />
            </View>

            <View className="flex-row justify-between items-center px-5 pt-2 pb-3">
              <Text className="text-white text-lg font-semibold">
                Comments
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
                data={comments}
                keyExtractor={(item) => item.id}
                contentContainerStyle={
                  comments.length === 0
                    ? { alignItems: 'center', paddingVertical: 32 }
                    : { paddingHorizontal: 20, paddingBottom: 8 }
                }
                ListEmptyComponent={
                  <Text className="text-muted text-sm">No comments yet. Be the first!</Text>
                }
                renderItem={({ item }) => (
                  <View className="flex-row gap-2.5 mb-4">
                    <Avatar
                      url={item.profile?.avatar_url}
                      name={item.profile?.display_name ?? '?'}
                      size={32}
                    />
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-white text-sm font-medium">
                          {item.profile?.display_name ?? 'Unknown'}
                        </Text>
                        <Text className="text-muted text-xs">
                          {timeAgo(item.created_at)}
                        </Text>
                        {item.user_id === user?.id && (
                          <TouchableOpacity
                            onPress={() => handleDelete(item.id)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Trash2 size={12} color="#e63946" />
                          </TouchableOpacity>
                        )}
                      </View>
                      <Text className="text-white text-sm mt-0.5">
                        {item.body}
                      </Text>
                    </View>
                  </View>
                )}
                showsVerticalScrollIndicator={false}
              />
            )}

            {/* Input */}
            <View className="flex-row items-center gap-2 px-5 py-4 border-t border-border">
              <TextInput
                className="flex-1 bg-background border border-border rounded-xl px-4 py-3 text-white text-sm"
                placeholder="Add a comment..."
                placeholderTextColor="#6b7280"
                value={body}
                onChangeText={setBody}
                maxLength={500}
                multiline
              />
              <TouchableOpacity
                onPress={handlePost}
                disabled={posting || !body.trim()}
                className="p-2"
              >
                {posting ? (
                  <ActivityIndicator color="#e5e5e5" size="small" />
                ) : (
                  <Send
                    size={22}
                    color={body.trim() ? '#e5e5e5' : '#6b7280'}
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
