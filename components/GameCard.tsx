import { View, Text, TouchableOpacity, Share as RNShare } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, MessageCircle, Share2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withDelay,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import Avatar from './Avatar';
import CommentsSheet from './CommentsSheet';
import StarRating from './StarRating';
import TeamLogo from './TeamLogo';
import PlayoffBadge from './PlayoffBadge';
import type { GameLogWithGame } from '@/types/database';

interface GameCardProps {
  log: GameLogWithGame;
  showUser?: boolean;
  showLoggedBadge?: boolean;
}

const WATCH_MODE_LABEL: Record<string, string> = {
  live: 'Live',
  replay: 'Replay',
  condensed: 'Condensed',
  highlights: 'Highlights',
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function GameCard({ log, showUser = false, showLoggedBadge = false }: GameCardProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(log.comment_count ?? 0);
  const game = log.game;
  const ratingDisplay = log.rating !== null ? log.rating / 10 : null;

  // Heart animation
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);
  const likeButtonScale = useSharedValue(1);

  const heartAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
    opacity: heartOpacity.value,
  }));

  const likeButtonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeButtonScale.value }],
  }));

  const likeMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;
      if (log.liked_by_me) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('user_id', user.id)
          .eq('log_id', log.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('likes')
          .insert({ user_id: user.id, log_id: log.id });
        if (error) throw error;
      }
    },
    onMutate: async () => {
      const updater = (old: any) => {
        if (!old) return old;
        const updateLog = (l: GameLogWithGame) => {
          if (l.id !== log.id) return l;
          return {
            ...l,
            liked_by_me: !l.liked_by_me,
            like_count: (l.like_count ?? 0) + (l.liked_by_me ? -1 : 1),
          };
        };
        if (Array.isArray(old)) return old.map(updateLog);
        if (old.logs) return { ...old, logs: old.logs.map(updateLog) };
        return old;
      };
      queryClient.setQueriesData({ queryKey: ['feed'] }, updater);
      queryClient.setQueriesData({ queryKey: ['profile'] }, updater);
      queryClient.setQueriesData({ queryKey: ['game-detail'] }, updater);
      queryClient.setQueriesData({ queryKey: ['user-profile'] }, updater);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['game-detail'] });
    },
  });

  if (!game) return null;

  const triggerLike = useCallback(() => {
    if (!log.liked_by_me) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      likeMutation.mutate();
    }
  }, [log.liked_by_me]);

  const showHeartOverlay = useCallback(() => {
    heartScale.value = withSequence(
      withSpring(1.2, { damping: 6, stiffness: 200 }),
      withDelay(300, withTiming(0, { duration: 200 })),
    );
    heartOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(400, withTiming(0, { duration: 200 })),
    );
  }, []);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onStart(() => {
      runOnJS(triggerLike)();
      runOnJS(showHeartOverlay)();
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onStart(() => {
      runOnJS(router.push)(`/game/${game.id}`);
    });

  const composed = Gesture.Exclusive(doubleTap, singleTap);

  const handleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    likeButtonScale.value = withSequence(
      withSpring(1.3, { damping: 4, stiffness: 300 }),
      withSpring(1, { damping: 8, stiffness: 200 }),
    );
    likeMutation.mutate();
  };

  const handleShare = () => {
    if (!game) return;
    const rating = ratingDisplay !== null ? ` ★${ratingDisplay.toFixed(1)}` : '';
    const snippet = log.review ? ` — "${log.review.slice(0, 80)}${log.review.length > 80 ? '...' : ''}"` : '';
    const message = `I rated ${game.away_team.abbreviation} @ ${game.home_team.abbreviation}${rating} on NBA Letterbox${snippet}`;
    RNShare.share({ message });
  };

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        className="bg-surface border border-border rounded-2xl p-4 mb-3"
        style={{ position: 'relative', overflow: 'hidden' }}
      >
        {/* Heart overlay for double-tap */}
        <Animated.View
          style={[
            heartAnimStyle,
            {
              position: 'absolute',
              top: '50%',
              left: '50%',
              marginTop: -40,
              marginLeft: -40,
              zIndex: 10,
            },
          ]}
          pointerEvents="none"
        >
          <Heart size={80} color="#e63946" fill="#e63946" />
        </Animated.View>

        {/* User info (feed mode) */}
        {showUser && log.user_profile && (
          <TouchableOpacity
            onPress={() => router.push(`/user/${log.user_profile!.handle}`)}
            className="flex-row items-center gap-2 mb-3"
          >
            <Avatar
              url={log.user_profile.avatar_url}
              name={log.user_profile.display_name}
              size={28}
            />
            <Text className="text-muted text-sm">
              <Text className="text-accent font-medium">
                {log.user_profile.display_name}
              </Text>
              {' '}logged a game
            </Text>
          </TouchableOpacity>
        )}

        {/* Matchup row */}
        <View className="flex-row justify-between items-center">
          <View className="flex-row items-center gap-2">
            <TeamLogo abbreviation={game.away_team.abbreviation} size={28} />
            <Text className="text-white font-bold text-lg">
              {game.away_team.abbreviation}
            </Text>
            <Text className="text-muted font-bold text-lg">@</Text>
            <TeamLogo abbreviation={game.home_team.abbreviation} size={28} />
            <Text className="text-white font-bold text-lg">
              {game.home_team.abbreviation}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            {game.playoff_round && <PlayoffBadge round={game.playoff_round} />}
            {showLoggedBadge && (
              <View className="bg-accent/20 border border-accent/40 rounded-full px-2 py-0.5">
                <Text className="text-accent text-xs font-medium">Logged ✓</Text>
              </View>
            )}
            {game.home_team_score !== null && (
              <Text className="text-muted text-sm font-medium">
                {game.away_team_score}–{game.home_team_score}
              </Text>
            )}
          </View>
        </View>

        {/* Date */}
        <Text className="text-muted text-xs mt-0.5">
          {formatDate(game.game_date_utc)}
        </Text>

        {/* Rating + watch mode */}
        <View className="flex-row items-center gap-3 mt-3">
          {ratingDisplay !== null && (
            <>
              <StarRating value={ratingDisplay} readonly size={16} />
              <Text className="text-accent text-sm font-semibold">
                {ratingDisplay.toFixed(1)}
              </Text>
            </>
          )}
          {log.watch_mode && (
            <View className="bg-background border border-border rounded-full px-2.5 py-0.5">
              <Text className="text-muted text-xs">
                {WATCH_MODE_LABEL[log.watch_mode]}
              </Text>
            </View>
          )}
        </View>

        {/* Tags */}
        {log.tags && log.tags.length > 0 && (
          <View className="flex-row flex-wrap gap-1.5 mt-2">
            {log.tags.map((tag) => (
              <TouchableOpacity
                key={tag.id}
                className="bg-accent/10 border border-accent/30 rounded-full px-2 py-0.5"
                onPress={() => router.push(`/tag/${tag.slug}`)}
                activeOpacity={0.7}
              >
                <Text className="text-accent text-xs">{tag.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Review */}
        {log.review ? (
          log.has_spoilers && !spoilerRevealed ? (
            <TouchableOpacity
              className="mt-3 bg-background border border-border rounded-lg px-3 py-2"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSpoilerRevealed(true);
              }}
              activeOpacity={0.7}
            >
              <Text className="text-muted text-xs italic">
                ⚠ Spoiler — tap to reveal
              </Text>
            </TouchableOpacity>
          ) : (
            <Text className="text-white text-sm mt-3 leading-relaxed" numberOfLines={3}>
              {log.review}
            </Text>
          )
        ) : null}

        {/* Actions: share + comments + like */}
        <View className="flex-row items-center justify-end gap-4 mt-3 pt-2 border-t border-border">
          <TouchableOpacity
            className="flex-row items-center gap-1.5"
            onPress={handleShare}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
          >
            <Share2 size={17} color="#6b7280" />
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-row items-center gap-1.5"
            onPress={() => setShowComments(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.6}
          >
            <MessageCircle size={18} color="#6b7280" />
            {commentCount > 0 && (
              <Text className="text-xs font-medium text-muted">
                {commentCount}
              </Text>
            )}
          </TouchableOpacity>
          <Animated.View style={likeButtonAnimStyle}>
            <TouchableOpacity
              className="flex-row items-center gap-1.5"
              onPress={handleLike}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.6}
            >
              <Heart
                size={18}
                color={log.liked_by_me ? '#e63946' : '#6b7280'}
                fill={log.liked_by_me ? '#e63946' : 'transparent'}
              />
              {(log.like_count ?? 0) > 0 && (
                <Text
                  className={`text-xs font-medium ${
                    log.liked_by_me ? 'text-[#e63946]' : 'text-muted'
                  }`}
                >
                  {log.like_count}
                </Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </View>

        {showComments && (
          <CommentsSheet
            logId={log.id}
            onClose={() => setShowComments(false)}
            onCommentCountChange={setCommentCount}
          />
        )}
      </Animated.View>
    </GestureDetector>
  );
}
