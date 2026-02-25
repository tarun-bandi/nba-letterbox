import { View, Text } from 'react-native';
import { forwardRef } from 'react';
import type { RankedGame } from '@/lib/rankingService';
import { deriveScore, formatScore, MIN_RANKED_FOR_SCORE } from '@/lib/ranking';

interface RankingsShareCardProps {
  games: RankedGame[];
  handle?: string;
}

const RankingsShareCard = forwardRef<View, RankingsShareCardProps>(
  ({ games, handle }, ref) => {
    const top10 = games.slice(0, 10);
    const totalCount = games.length;
    const showScores = totalCount >= MIN_RANKED_FOR_SCORE;

    return (
      <View
        ref={ref}
        style={{
          width: 400,
          backgroundColor: '#0a0a0a',
          padding: 24,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#c9a84c33',
        }}
        collapsable={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ color: '#c9a84c', fontSize: 20, fontWeight: '700', flex: 1 }}>
            My Top 10 Games
          </Text>
          {handle && (
            <Text style={{ color: '#6b7280', fontSize: 13 }}>@{handle}</Text>
          )}
        </View>

        {/* Game rows */}
        {top10.map((item, idx) => {
          const game = item.game;
          const score = showScores ? deriveScore(idx + 1, totalCount, item.fan_of) : null;

          return (
            <View
              key={item.game_id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 8,
                borderBottomWidth: idx < top10.length - 1 ? 1 : 0,
                borderBottomColor: '#1a1a1a',
              }}
            >
              {/* Position */}
              <Text
                style={{
                  color: idx < 3 ? '#c9a84c' : '#fff',
                  fontWeight: '700',
                  fontSize: 16,
                  width: 32,
                  textAlign: 'center',
                }}
              >
                {idx + 1}
              </Text>

              {/* Game info */}
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
                  {game.away_team.abbreviation} {game.away_team_score ?? ''} - {game.home_team_score ?? ''} {game.home_team.abbreviation}
                </Text>
                <Text style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>
                  {new Date(game.game_date_utc).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {game.playoff_round
                    ? ` · ${game.playoff_round.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}`
                    : ''}
                </Text>
              </View>

              {/* Score */}
              {score !== null && (
                <Text style={{ color: '#c9a84c', fontWeight: '700', fontSize: 15 }}>
                  {formatScore(score)}
                </Text>
              )}
            </View>
          );
        })}

        {/* Footer */}
        <View style={{ marginTop: 16, alignItems: 'center' }}>
          <Text style={{ color: '#333', fontSize: 11 }}>
            letterbox
          </Text>
        </View>
      </View>
    );
  },
);

RankingsShareCard.displayName = 'RankingsShareCard';

export default RankingsShareCard;
