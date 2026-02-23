import { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Heart, MessageCircle, UserPlus } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import Avatar from '@/components/Avatar';
import type { UserProfile } from '@/types/database';

type NotificationType = 'like' | 'comment' | 'follow';

interface Notification {
  id: string;
  type: NotificationType;
  actor: UserProfile;
  created_at: string;
  /** game_id for like/comment notifications */
  gameId?: string;
}

async function fetchNotifications(userId: string): Promise<Notification[]> {
  // Get current user's log IDs
  const { data: myLogs } = await supabase
    .from('game_logs')
    .select('id, game_id')
    .eq('user_id', userId);

  const logIds = (myLogs ?? []).map((l) => l.id);
  const logGameMap: Record<string, string> = {};
  for (const l of myLogs ?? []) {
    logGameMap[l.id] = l.game_id;
  }

  // Fetch likes, comments, and follows in parallel
  const [likesRes, commentsRes, followsRes] = await Promise.all([
    logIds.length > 0
      ? supabase
          .from('likes')
          .select('user_id, log_id, created_at')
          .in('log_id', logIds)
          .neq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
    logIds.length > 0
      ? supabase
          .from('comments')
          .select('id, user_id, log_id, created_at')
          .in('log_id', logIds)
          .neq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('follows')
      .select('follower_id, created_at')
      .eq('following_id', userId)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  // Collect all actor user IDs
  const actorIds = new Set<string>();
  for (const l of likesRes.data ?? []) actorIds.add(l.user_id);
  for (const c of commentsRes.data ?? []) actorIds.add(c.user_id);
  for (const f of followsRes.data ?? []) actorIds.add(f.follower_id);

  // Fetch profiles
  let profileMap: Record<string, UserProfile> = {};
  if (actorIds.size > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('*')
      .in('user_id', [...actorIds]);
    for (const p of (profiles ?? []) as UserProfile[]) {
      profileMap[p.user_id] = p;
    }
  }

  const notifications: Notification[] = [];

  for (const l of likesRes.data ?? []) {
    const actor = profileMap[l.user_id];
    if (!actor) continue;
    notifications.push({
      id: `like-${l.user_id}-${l.log_id}`,
      type: 'like',
      actor,
      created_at: l.created_at,
      gameId: logGameMap[l.log_id],
    });
  }

  for (const c of commentsRes.data ?? []) {
    const actor = profileMap[c.user_id];
    if (!actor) continue;
    notifications.push({
      id: `comment-${c.id}`,
      type: 'comment',
      actor,
      created_at: c.created_at,
      gameId: logGameMap[c.log_id],
    });
  }

  for (const f of followsRes.data ?? []) {
    const actor = profileMap[f.follower_id];
    if (!actor) continue;
    notifications.push({
      id: `follow-${f.follower_id}`,
      type: 'follow',
      actor,
      created_at: f.created_at,
    });
  }

  // Sort by date, newest first
  notifications.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return notifications.slice(0, 50);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

const ICON_MAP = {
  like: { icon: Heart, color: '#e63946' },
  comment: { icon: MessageCircle, color: '#c9a84c' },
  follow: { icon: UserPlus, color: '#457b9d' },
};

const MESSAGE_MAP: Record<NotificationType, string> = {
  like: 'liked your log',
  comment: 'commented on your log',
  follow: 'started following you',
};

export default function NotificationsScreen() {
  const { user } = useAuthStore();
  const router = useRouter();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => fetchNotifications(user!.id),
    enabled: !!user,
  });

  const notifications = data ?? [];

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#c9a84c" size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          notifications.length === 0
            ? { flex: 1, justifyContent: 'center', alignItems: 'center' }
            : { paddingVertical: 8 }
        }
        ListEmptyComponent={
          <View className="items-center px-6">
            <Text style={{ fontSize: 48 }} className="mb-3">🔔</Text>
            <Text className="text-white text-lg font-semibold mb-2">No notifications yet</Text>
            <Text className="text-muted text-center text-sm">
              When someone likes, comments, or follows you, it'll show up here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const { icon: Icon, color } = ICON_MAP[item.type];
          return (
            <TouchableOpacity
              className="flex-row items-center gap-3 px-4 py-3 border-b border-border"
              onPress={() => {
                if (item.type === 'follow') {
                  router.push(`/user/${item.actor.handle}`);
                } else if (item.gameId) {
                  router.push(`/game/${item.gameId}`);
                }
              }}
              activeOpacity={0.7}
            >
              <Avatar
                url={item.actor.avatar_url}
                name={item.actor.display_name}
                size={40}
              />
              <View className="flex-1">
                <Text className="text-white text-sm">
                  <Text className="font-semibold">{item.actor.display_name}</Text>
                  {' '}{MESSAGE_MAP[item.type]}
                </Text>
                <Text className="text-muted text-xs mt-0.5">
                  {timeAgo(item.created_at)}
                </Text>
              </View>
              <Icon size={18} color={color} fill={item.type === 'like' ? color : 'transparent'} />
            </TouchableOpacity>
          );
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#c9a84c"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
