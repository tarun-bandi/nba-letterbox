import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import StarRating from './StarRating';
import type { GameLogWithGame } from '@/types/database';

interface GameCardProps {
  log: GameLogWithGame;
  /** Show the user who logged this (for feed) */
  showUser?: boolean;
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

export default function GameCard({ log, showUser = false }: GameCardProps) {
  const router = useRouter();
  const game = log.game;
  const ratingDisplay = log.rating !== null ? log.rating / 10 : null;

  if (!game) return null;

  return (
    <TouchableOpacity
      className="bg-surface border border-border rounded-2xl p-4 mb-3"
      onPress={() => router.push(`/game/${game.id}`)}
      activeOpacity={0.75}
    >
      {/* User info (feed mode) */}
      {showUser && log.user_profile && (
        <TouchableOpacity
          onPress={() => router.push(`/user/${log.user_profile!.handle}`)}
          className="mb-3"
        >
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
        <Text className="text-white font-bold text-lg">
          {game.away_team.abbreviation} @ {game.home_team.abbreviation}
        </Text>
        {game.home_team_score !== null && (
          <Text className="text-muted text-sm font-medium">
            {game.away_team_score}–{game.home_team_score}
          </Text>
        )}
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

      {/* Review */}
      {log.review ? (
        log.has_spoilers ? (
          <View className="mt-3 bg-background border border-border rounded-lg px-3 py-2">
            <Text className="text-muted text-xs italic">
              ⚠ Spoiler — tap game to reveal
            </Text>
          </View>
        ) : (
          <Text className="text-white text-sm mt-3 leading-relaxed" numberOfLines={3}>
            {log.review}
          </Text>
        )
      ) : null}
    </TouchableOpacity>
  );
}
