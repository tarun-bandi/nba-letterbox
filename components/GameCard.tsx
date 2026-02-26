import { View, Text, TouchableOpacity, Share as RNShare, Platform, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useCallback, memo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Heart, MessageCircle, Share2 } from 'lucide-react-native';
import { Image } from 'expo-image';
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
import TeamLogo from './TeamLogo';
import PlayoffBadge from './PlayoffBadge';
import RankBadge from './RankBadge';
import ReactionPicker, { REACTION_EMOJI, REACTION_CONFIG } from './ReactionPicker';
import { gameUrl } from '@/lib/urls';
import { getTeamAccentColor, withAlpha } from '@/lib/teamColors';
import type { GameLogWithGame, ReactionType } from '@/types/database';

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

const PRIMETIME_MAP: Record<string, string> = {
  NBC: 'Sunday Night Football',
  ESPN: 'Monday Night Football',
  ABC: 'Monday Night Football',
  'Prime Video': 'Thursday Night Football',
  NFLN: 'Thursday Night Football',
};

const PLAYOFF_ROUND_LABELS: Record<string, string> = {
  wild_card: 'Wild Card',
  divisional: 'Divisional',
  conf_championship: 'Championship',
  super_bowl: 'Super Bowl',
};

function getGameLabel(game: GameLogWithGame['game']): string | null {
  if (!game) return null;

  // NBA: show formatted date
  if (game.sport === 'nba') {
    return formatDate(game.game_date_utc);
  }

  // NFL playoff
  if (game.postseason && game.playoff_round) {
    const roundLabel = PLAYOFF_ROUND_LABELS[game.playoff_round] ?? game.playoff_round;
    if (game.playoff_round === 'super_bowl') return 'Super Bowl';
    const conference = game.home_team?.conference ?? '';
    return conference ? `${conference} ${roundLabel}` : roundLabel;
  }

  // NFL primetime — include week & year for context
  if (game.broadcast) {
    const primetime = PRIMETIME_MAP[game.broadcast];
    if (primetime) {
      const suffix = game.week ? ` · Week ${game.week}, ${game.season?.year ?? ''}`.trim() : '';
      return `${primetime}${suffix}`;
    }
  }

  // NFL regular season
  if (game.week) {
    return `Week ${game.week}, ${game.season?.year ?? ''}`.trim();
  }

  return null;
}

/** Get top 2 reactions sorted by count (excluding 'like') */
function getTopReactions(reactions?: Record<ReactionType, number>): { type: ReactionType; count: number }[] {
  if (!reactions) return [];
  return Object.entries(reactions)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([type, count]) => ({ type: type as ReactionType, count }));
}

function GameCard({ log, showUser = false, showLoggedBadge = false }: GameCardProps) {
  const router = useRouter();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [commentCount, setCommentCount] = useState(log.comment_count ?? 0);
  const game = log.game;

  // Fire overlay animation (for double-tap)
  const fireScale = useSharedValue(0);
  const fireOpacity = useSharedValue(0);
  const reactionButtonScale = useSharedValue(1);
  const reactionGlow = useSharedValue(0);
  const shareScale = useSharedValue(1);
  const shareGlow = useSharedValue(0);
  const commentScale = useSharedValue(1);
  const commentGlow = useSharedValue(0);

  const fireAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fireScale.value }],
    opacity: fireOpacity.value,
  }));

  const reactionButtonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reactionButtonScale.value }],
    shadowColor: '#c9a84c',
    shadowOpacity: reactionGlow.value * 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  }));

  const shareButtonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shareScale.value }],
    shadowColor: '#5fa3ff',
    shadowOpacity: shareGlow.value * 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  }));

  const commentButtonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: commentScale.value }],
    shadowColor: '#7fd0ff',
    shadowOpacity: commentGlow.value * 0.42,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  }));

  const reactionMutation = useMutation({
    mutationFn: async ({ reactionType, isRemoval }: { reactionType: ReactionType; isRemoval: boolean }) => {
      if (!user) return;
      if (isRemoval) {
        const { error } = await supabase
          .from('likes')
          .delete()
          .eq('user_id', user.id)
          .eq('log_id', log.id);
        if (error) throw error;
      } else {
        // Upsert: insert or update reaction_type
        const { error } = await supabase
          .from('likes')
          .upsert(
            { user_id: user.id, log_id: log.id, reaction_type: reactionType },
            { onConflict: 'user_id,log_id' },
          );
        if (error) throw error;
      }
    },
    onMutate: async ({ reactionType, isRemoval }) => {
      const updater = (old: any) => {
        if (!old) return old;
        const updateLog = (l: GameLogWithGame) => {
          if (l.id !== log.id) return l;
          const prevReaction = l.my_reaction;
          const prevReactions = { ...(l.reactions ?? {}) } as Record<ReactionType, number>;

          if (isRemoval) {
            // Remove current reaction
            if (prevReaction && prevReactions[prevReaction]) {
              prevReactions[prevReaction] = Math.max(0, prevReactions[prevReaction] - 1);
            }
            return {
              ...l,
              liked_by_me: false,
              my_reaction: null,
              reactions: prevReactions,
              like_count: Math.max(0, (l.like_count ?? 0) - 1),
            };
          } else {
            // Decrement old reaction if changing
            if (prevReaction && prevReactions[prevReaction]) {
              prevReactions[prevReaction] = Math.max(0, prevReactions[prevReaction] - 1);
            }
            // Increment new reaction
            prevReactions[reactionType] = (prevReactions[reactionType] ?? 0) + 1;
            return {
              ...l,
              liked_by_me: true,
              my_reaction: reactionType,
              reactions: prevReactions,
              like_count: prevReaction ? (l.like_count ?? 0) : (l.like_count ?? 0) + 1,
            };
          }
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

  const awayAccent = getTeamAccentColor(game.away_team.abbreviation);
  const homeAccent = getTeamAccentColor(game.home_team.abbreviation);
  const avatarRingColor =
    log.fan_of === 'home'
      ? homeAccent
      : log.fan_of === 'away'
        ? awayAccent
        : log.fan_of === 'both'
          ? '#c9a84c'
          : withAlpha('#6b7280', 0.7);

  const animateIconTap = (scale: typeof shareScale, glow: typeof shareGlow) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.value = withSequence(
      withSpring(1.18, { damping: 5, stiffness: 360 }),
      withSpring(1, { damping: 8, stiffness: 240 }),
    );
    glow.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(0, { duration: 220 }),
    );
  };

  const handleReaction = useCallback((reactionType: ReactionType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    reactionButtonScale.value = withSequence(
      withSpring(1.3, { damping: 4, stiffness: 300 }),
      withSpring(1, { damping: 8, stiffness: 200 }),
    );
    reactionGlow.value = withSequence(
      withTiming(1, { duration: 120 }),
      withTiming(0, { duration: 260 }),
    );
    const isRemoval = log.my_reaction === reactionType;
    reactionMutation.mutate({ reactionType, isRemoval });
    setShowReactionPicker(false);
  }, [log.my_reaction]);

  const handleReactionButtonPress = useCallback(() => {
    if (log.my_reaction) {
      // Tap removes current reaction
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      reactionButtonScale.value = withSequence(
        withSpring(1.3, { damping: 4, stiffness: 300 }),
        withSpring(1, { damping: 8, stiffness: 200 }),
      );
      reactionGlow.value = withSequence(
        withTiming(1, { duration: 120 }),
        withTiming(0, { duration: 260 }),
      );
      reactionMutation.mutate({ reactionType: log.my_reaction, isRemoval: true });
    } else {
      // No reaction yet — show picker
      setShowReactionPicker(true);
    }
  }, [log.my_reaction]);

  const handleReactionButtonLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowReactionPicker(true);
  }, []);

  const triggerFireReaction = useCallback(() => {
    if (!log.my_reaction) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      reactionMutation.mutate({ reactionType: 'fire', isRemoval: false });
    }
  }, [log.my_reaction]);

  const showFireOverlay = useCallback(() => {
    fireScale.value = withSequence(
      withSpring(1.2, { damping: 6, stiffness: 200 }),
      withDelay(300, withTiming(0, { duration: 200 })),
    );
    fireOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(400, withTiming(0, { duration: 200 })),
    );
  }, []);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onStart(() => {
      runOnJS(triggerFireReaction)();
      runOnJS(showFireOverlay)();
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onStart(() => {
      runOnJS(router.push)(`/game/${game.id}`);
    });

  const composed = Gesture.Exclusive(doubleTap, singleTap);

  const handleShare = () => {
    if (!game) return;
    const snippet = log.review ? ` \u2014 "${log.review.slice(0, 80)}${log.review.length > 80 ? '...' : ''}"` : '';
    const url = gameUrl(game.id);
    const message = `I logged ${game.away_team.abbreviation} @ ${game.home_team.abbreviation} on NBA Letterbox${snippet}\n${url}`;
    RNShare.share(Platform.OS === 'ios' ? { message, url } : { message });
  };

  const topReactions = getTopReactions(log.reactions);
  const totalReactionCount = log.like_count ?? 0;
  const myReaction = log.my_reaction;

  const cardContent = (
    <>
      {/* Fire overlay for double-tap */}
      <Animated.View
        style={[
          fireAnimStyle,
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
        <Text style={{ fontSize: 72 }}>{'\uD83D\uDD25'}</Text>
      </Animated.View>

        {/* Game label (date/week/primetime) */}
        {(() => {
          const label = getGameLabel(game);
          return label ? (
            <Text className="text-muted text-xs text-center mb-1">{label}</Text>
          ) : null;
        })()}

        {/* Matchup header strip */}
        <View className="mb-2">
          <View
            style={{
              borderRadius: 12,
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: withAlpha('#ffffff', 0.09),
              backgroundColor: withAlpha('#111827', 0.46),
              overflow: 'hidden',
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: -18,
                top: -22,
                width: 76,
                height: 76,
                borderRadius: 999,
                backgroundColor: withAlpha(awayAccent, 0.2),
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                right: -18,
                top: -22,
                width: 76,
                height: 76,
                borderRadius: 999,
                backgroundColor: withAlpha(homeAccent, 0.2),
              }}
            />
            <View className="flex-row items-center justify-center gap-2">
              <View
                style={{
                  borderRadius: 999,
                  padding: 1,
                  shadowColor: awayAccent,
                  shadowOpacity: 0.45,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 3,
                }}
              >
                <TeamLogo abbreviation={game.away_team.abbreviation} sport={game.sport ?? 'nba'} size={24} />
              </View>
              <Text
                className="font-bold text-sm"
                style={{
                  color: withAlpha(awayAccent, 0.98),
                  textShadowColor: withAlpha(awayAccent, 0.35),
                  textShadowRadius: 6,
                }}
              >
                {game.away_team.abbreviation}
              </Text>
              {game.home_team_score !== null ? (
                <>
                  <Text className="text-white font-bold text-base">
                    {game.away_team_score}
                  </Text>
                  <Text className="text-muted text-sm">{'\u2014'}</Text>
                  <Text className="text-white font-bold text-base">
                    {game.home_team_score}
                  </Text>
                </>
              ) : (
                <Text className="text-muted text-xs">
                  {formatDate(game.game_date_utc)}
                </Text>
              )}
              <Text
                className="font-bold text-sm"
                style={{
                  color: withAlpha(homeAccent, 0.98),
                  textShadowColor: withAlpha(homeAccent, 0.35),
                  textShadowRadius: 6,
                }}
              >
                {game.home_team.abbreviation}
              </Text>
              <View
                style={{
                  borderRadius: 999,
                  padding: 1,
                  shadowColor: homeAccent,
                  shadowOpacity: 0.45,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 3,
                }}
              >
                <TeamLogo abbreviation={game.home_team.abbreviation} sport={game.sport ?? 'nba'} size={24} />
              </View>
              {game.playoff_round && (
                <View className="ml-1">
                  <PlayoffBadge round={game.playoff_round} sport={game.sport ?? 'nba'} />
                </View>
              )}
              {showLoggedBadge && (
                <View className="bg-accent/20 border border-accent/40 rounded-full px-2 py-0.5 ml-1">
                  <Text className="text-accent text-xs font-medium">Logged</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Team records */}
        {game.away_team_record && game.home_team_record && (
          <View className="flex-row items-center justify-center gap-2 mb-2">
            <View style={{ width: 24 }} />
            <Text className="text-muted text-xs">({game.away_team_record})</Text>
            <View style={{ flex: 1 }} />
            <Text className="text-muted text-xs">({game.home_team_record})</Text>
            <View style={{ width: 24 }} />
          </View>
        )}

        {/* Team-tinted divider */}
        <View className="mb-2" style={{ position: 'relative' }}>
          <View className="flex-row h-[2px] overflow-hidden rounded-full">
            <View style={{ flex: 1, backgroundColor: withAlpha(awayAccent, 0.82) }} />
            <View style={{ flex: 1, backgroundColor: withAlpha(homeAccent, 0.82) }} />
          </View>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              top: -2,
              width: '50%',
              height: 6,
              borderRadius: 999,
              backgroundColor: withAlpha(awayAccent, 0.26),
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: 0,
              top: -2,
              width: '50%',
              height: 6,
              borderRadius: 999,
              backgroundColor: withAlpha(homeAccent, 0.26),
            }}
          />
        </View>

        {/* User info (feed mode) */}
        {showUser && log.user_profile && (
          <TouchableOpacity
            onPress={() => router.push(`/user/${log.user_profile!.handle}`)}
            className="flex-row items-center gap-2 mb-2"
          >
            <View
              style={{
                borderRadius: 999,
                padding: 1.5,
                borderWidth: 1.5,
                borderColor: avatarRingColor,
                shadowColor: avatarRingColor,
                shadowOpacity: 0.4,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 0 },
                elevation: 3,
              }}
            >
              <Avatar
                url={log.user_profile.avatar_url}
                name={log.user_profile.display_name}
                size={28}
              />
            </View>
            <Text className="text-muted text-sm">
              <Text className="text-accent font-medium">
                {log.user_profile.display_name}
              </Text>
              {' '}logged a game
            </Text>
          </TouchableOpacity>
        )}

        {/* Watch mode + rank */}
        <View className="flex-row items-center gap-3 mt-3">
          {log.watch_mode && (
            <View className="bg-background border border-border rounded-full px-2.5 py-0.5">
              <Text className="text-muted text-xs">
                {WATCH_MODE_LABEL[log.watch_mode]}
              </Text>
            </View>
          )}
          {log.position != null && log.rank_total != null && (
            <RankBadge position={log.position} total={log.rank_total} fanOf={log.fan_of} />
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
                {'\u26A0'} Spoiler {'\u2014'} tap to reveal
              </Text>
            </TouchableOpacity>
          ) : (
            <Text className="text-white text-sm mt-3 leading-relaxed" numberOfLines={3}>
              {log.review}
            </Text>
          )
        ) : null}

        {/* Images */}
        {log.image_urls && log.image_urls.length > 0 && (
          log.image_urls.length === 1 ? (
            <Image
              source={{ uri: log.image_urls[0] }}
              style={{ width: '100%', height: 160, borderRadius: 10, marginTop: 12 }}
              contentFit="cover"
            />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, marginTop: 12 }}
            >
              {log.image_urls.map((url) => (
                <Image
                  key={url}
                  source={{ uri: url }}
                  style={{ width: 200, height: 160, borderRadius: 10 }}
                  contentFit="cover"
                />
              ))}
            </ScrollView>
          )
        )}

        {/* Actions: share + comments + reactions */}
        <View className="flex-row items-center justify-end gap-4 mt-3 pt-2 border-t border-border">
          <Animated.View style={shareButtonAnimStyle}>
            <TouchableOpacity
              className="flex-row items-center gap-1.5"
              onPress={() => {
                animateIconTap(shareScale, shareGlow);
                handleShare();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.6}
            >
              <Share2 size={17} color="#6b7280" />
            </TouchableOpacity>
          </Animated.View>
          <Animated.View style={commentButtonAnimStyle}>
            <TouchableOpacity
              className="flex-row items-center gap-1.5"
              onPress={() => {
                animateIconTap(commentScale, commentGlow);
                setShowComments(true);
              }}
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
          </Animated.View>

          {/* Reaction button area */}
          <View style={{ position: 'relative' }}>
            {showReactionPicker && (
              <ReactionPicker
                currentReaction={myReaction ?? null}
                onSelect={handleReaction}
                onClose={() => setShowReactionPicker(false)}
              />
            )}
            <Animated.View style={reactionButtonAnimStyle}>
              <TouchableOpacity
                className="flex-row items-center gap-1.5"
                onPress={handleReactionButtonPress}
                onLongPress={handleReactionButtonLongPress}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.6}
              >
                {myReaction ? (
                  <Text style={{ fontSize: 18 }}>{REACTION_EMOJI[myReaction]}</Text>
                ) : (
                  <Heart size={18} color="#6b7280" fill="transparent" />
                )}
                {topReactions.length > 0 ? (
                  <View className="flex-row items-center gap-1">
                    {topReactions.map((r) => (
                      <Text key={r.type} className="text-xs">
                        {REACTION_EMOJI[r.type]}{' '}
                        <Text className="text-muted font-medium">{r.count}</Text>
                      </Text>
                    ))}
                  </View>
                ) : totalReactionCount > 0 ? (
                  <Text className="text-xs font-medium text-muted">
                    {totalReactionCount}
                  </Text>
                ) : null}
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>

      {showComments && (
        <CommentsSheet
          logId={log.id}
          onClose={() => setShowComments(false)}
          onCommentCountChange={setCommentCount}
        />
      )}
    </>
  );

  if (Platform.OS === 'web') {
    return (
      <Pressable
        className="bg-surface rounded-2xl p-4 mb-3"
        style={({ pressed, hovered }: any) => {
          const scale = pressed ? 0.988 : hovered ? 1.012 : 1;
          const borderColor = pressed
            ? withAlpha(homeAccent, 0.5)
            : hovered
              ? withAlpha(homeAccent, 0.36)
              : withAlpha('#ffffff', 0.1);
          const bgTint = hovered ? withAlpha('#1a2233', 0.9) : withAlpha('#1a2233', 0.82);
          const shadow = pressed
            ? `0 10px 24px ${withAlpha('#000000', 0.45)}, 0 0 0 1px ${withAlpha(homeAccent, 0.22)}, 0 0 24px ${withAlpha(awayAccent, 0.14)}`
            : hovered
              ? `0 20px 42px ${withAlpha('#000000', 0.56)}, 0 0 0 1px ${withAlpha(homeAccent, 0.3)}, 0 0 32px ${withAlpha(awayAccent, 0.2)}, inset 0 1px 0 ${withAlpha('#ffffff', 0.14)}`
              : `0 12px 28px ${withAlpha('#000000', 0.44)}, inset 0 1px 0 ${withAlpha('#ffffff', 0.08)}`;

          return [
            {
              position: 'relative',
              overflow: 'hidden',
              borderWidth: 1,
              borderColor,
              transform: [{ scale }],
              backgroundColor: bgTint,
            },
            {
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              boxShadow: shadow,
              transitionDuration: '180ms',
              transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              transitionProperty: 'transform, box-shadow, border-color, background-color',
              cursor: 'pointer',
            } as any,
          ];
        }}
        onPress={() => router.push(`/game/${game.id}`)}
      >
        {cardContent}
      </Pressable>
    );
  }

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        className="bg-surface border border-border rounded-2xl p-4 mb-3"
        style={{ position: 'relative', overflow: 'hidden' }}
      >
        {cardContent}
      </Animated.View>
    </GestureDetector>
  );
}

export default memo(GameCard);
