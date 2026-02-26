import { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/store/authStore';
import { useNbaScoreboard } from '@/hooks/useNbaScoreboard';
import { getTeamAccentColor, withAlpha } from '@/lib/teamColors';
import TeamLogo from './TeamLogo';

interface MappedNbaGame {
  id: string;
  provider_game_id: number;
  home_team_id: string;
  away_team_id: string;
}

interface TodaysGamesEnrichment {
  favoriteTeamIds: Set<string>;
  predictedGameIds: Set<string>;
  gamesByProviderId: Map<number, MappedNbaGame>;
}

function formatTodayDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function LivePulseDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.35,
            duration: 650,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.35,
            duration: 650,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 650,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.95,
            duration: 650,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, scale]);

  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        backgroundColor: '#e63946',
        transform: [{ scale }],
        opacity,
      }}
    />
  );
}

function TeamLogoWithGlow({
  abbreviation,
  accent,
}: {
  abbreviation: string;
  accent: string;
}) {
  return (
    <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: 18,
          height: 18,
          borderRadius: 999,
          backgroundColor: withAlpha(accent, 0.34),
          shadowColor: accent,
          shadowOpacity: 0.45,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 0 },
          elevation: 4,
        }}
      />
      <TeamLogo
        abbreviation={abbreviation}
        sport="nba"
        size={20}
      />
    </View>
  );
}

async function fetchTodaysGamesEnrichment(
  userId: string,
  eventIds: number[],
): Promise<TodaysGamesEnrichment> {
  if (eventIds.length === 0) {
    return {
      favoriteTeamIds: new Set(),
      predictedGameIds: new Set(),
      gamesByProviderId: new Map(),
    };
  }

  const [favRes, predsRes, gamesRes] = await Promise.all([
    supabase
      .from('user_favorite_teams')
      .select('team_id')
      .eq('user_id', userId),
    supabase
      .from('game_predictions')
      .select('game_id')
      .eq('user_id', userId),
    supabase
      .from('games')
      .select('id, provider_game_id, home_team_id, away_team_id')
      .eq('provider', 'espn')
      .eq('sport', 'nba')
      .in('provider_game_id', eventIds),
  ]);

  if (favRes.error) throw favRes.error;
  if (predsRes.error) throw predsRes.error;
  if (gamesRes.error) throw gamesRes.error;

  const favoriteTeamIds = new Set(
    ((favRes.data ?? []) as { team_id: string }[]).map((row) => row.team_id),
  );
  const predictedGameIds = new Set(
    ((predsRes.data ?? []) as { game_id: string }[]).map((row) => row.game_id),
  );
  const gamesByProviderId = new Map<number, MappedNbaGame>();
  for (const game of (gamesRes.data ?? []) as MappedNbaGame[]) {
    gamesByProviderId.set(game.provider_game_id, game);
  }

  return {
    favoriteTeamIds,
    predictedGameIds,
    gamesByProviderId,
  };
}

export default function TodaysGames() {
  const { user } = useAuthStore();
  const router = useRouter();
  const { data: scoreboard } = useNbaScoreboard();

  const eventIds = useMemo(
    () => scoreboard?.games.map((g) => g.providerGameId) ?? [],
    [scoreboard?.games],
  );

  const { data: enrichment } = useQuery({
    queryKey: ['todays-games-nba-enrichment', user?.id, eventIds.join(',')],
    queryFn: () => fetchTodaysGamesEnrichment(user!.id, eventIds),
    enabled: !!user && eventIds.length > 0,
  });

  if (!scoreboard || scoreboard.games.length === 0) return null;

  const favoriteTeamIds = enrichment?.favoriteTeamIds ?? new Set<string>();
  const predictedGameIds = enrichment?.predictedGameIds ?? new Set<string>();
  const gamesByProviderId = enrichment?.gamesByProviderId ?? new Map<number, MappedNbaGame>();

  const gameCount = scoreboard.games.length;

  return (
    <View className="pb-3">
      <View
        style={{
          marginHorizontal: 8,
          borderRadius: 18,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: withAlpha('#c9a84c', 0.12),
          backgroundColor: '#05070d',
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: '#040507',
          }}
        />
        {/* Top gradient sweep */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '55%',
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: withAlpha('#132548', 0.44),
            }}
          />
          {/* Animated shimmer overlay (web only) */}
          {Platform.OS === 'web' && (
            <div
              className="banner-shimmer"
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(105deg, transparent 30%, ${withAlpha('#c9a84c', 0.06)} 50%, transparent 70%)`,
              } as any}
            />
          )}
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: '45%',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: withAlpha('#080b12', 0.9),
          }}
        />
        {/* Decorative orbs */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -72,
            right: -52,
            width: 180,
            height: 180,
            borderRadius: 999,
            backgroundColor: withAlpha('#1D428A', 0.18),
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: -40,
            left: -30,
            width: 120,
            height: 120,
            borderRadius: 999,
            backgroundColor: withAlpha('#c9a84c', 0.06),
          }}
        />
        {/* Top edge highlight */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 24,
            right: 24,
            height: 1,
            backgroundColor: withAlpha('#c9a84c', 0.15),
          }}
        />

        <View className="pt-3 pb-2">
          <View className="flex-row justify-between items-center px-4 mb-2">
            <View className="flex-row items-center gap-2">
              <Text
                style={{
                  color: '#ffffff',
                  fontSize: 17,
                  fontWeight: '700',
                  letterSpacing: -0.3,
                }}
              >
                Today's Games
              </Text>
              <View
                style={{
                  backgroundColor: withAlpha('#c9a84c', 0.15),
                  borderRadius: 10,
                  paddingHorizontal: 7,
                  paddingVertical: 2,
                  borderWidth: 1,
                  borderColor: withAlpha('#c9a84c', 0.25),
                }}
              >
                <Text
                  style={{
                    color: '#c9a84c',
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  {gameCount}
                </Text>
              </View>
            </View>
            <Text
              style={{
                color: withAlpha('#ffffff', 0.4),
                fontSize: 12,
                fontWeight: '500',
                letterSpacing: 0.3,
              }}
            >
              {formatTodayDate()}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
          >
            {scoreboard.games.map((game) => {
              const mappedGame = gamesByProviderId.get(game.providerGameId);
              const isMapped = !!mappedGame;
              const status = game.displayStatus;
              const isLive = status === 'live';
              const isFinal = status === 'final';
              const hasScores = isLive || isFinal;

              const homeScore = game.homeTeam.score;
              const awayScore = game.awayTeam.score;
              const homeWon =
                isFinal && homeScore != null && awayScore != null && homeScore > awayScore;
              const awayWon =
                isFinal && homeScore != null && awayScore != null && awayScore > homeScore;

              const awayAccent = getTeamAccentColor(game.awayTeam.abbreviation, 'nba');
              const homeAccent = getTeamAccentColor(game.homeTeam.abbreviation, 'nba');
              const cardAccent = homeWon ? homeAccent : awayWon ? awayAccent : homeAccent;

              const isFav =
                !!mappedGame &&
                (favoriteTeamIds.has(mappedGame.home_team_id) ||
                  favoriteTeamIds.has(mappedGame.away_team_id));

              return (
                <Pressable
                  key={game.providerGameId}
                  onPress={() => {
                    if (mappedGame) router.push(`/game/${mappedGame.id}`);
                  }}
                  disabled={!isMapped}
                  style={({ pressed, hovered }: any) => {
                    const scale = pressed ? 0.975 : hovered ? 1.015 : 1;
                    const borderTint = pressed
                      ? withAlpha(cardAccent, 0.55)
                      : hovered
                        ? withAlpha(cardAccent, 0.38)
                        : withAlpha('#ffffff', 0.14);

                    return [
                      {
                        width: 146,
                        padding: 12,
                        borderRadius: 14,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: borderTint,
                        backgroundColor: withAlpha('#1a2233', Platform.OS === 'web' ? 0.48 : 0.76),
                        transform: [{ scale }],
                      },
                      Platform.OS === 'web'
                        ? ({
                          backdropFilter: 'blur(10px)',
                          WebkitBackdropFilter: 'blur(10px)',
                          boxShadow: pressed
                            ? `0 8px 18px ${withAlpha('#000000', 0.45)}, 0 0 0 1px ${withAlpha(cardAccent, 0.2)}`
                            : hovered
                              ? `0 14px 30px ${withAlpha('#000000', 0.5)}, 0 0 0 1px ${withAlpha(cardAccent, 0.28)}, inset 0 1px 0 ${withAlpha('#ffffff', 0.14)}`
                              : `0 10px 24px ${withAlpha('#000000', 0.42)}, inset 0 1px 0 ${withAlpha('#ffffff', 0.1)}`,
                        } as any)
                        : Platform.OS === 'ios'
                          ? {
                            shadowColor: '#000000',
                            shadowOffset: { width: 0, height: pressed ? 7 : 10 },
                            shadowOpacity: pressed ? 0.28 : 0.36,
                            shadowRadius: pressed ? 10 : 14,
                            elevation: pressed ? 5 : 8,
                          }
                          : {
                            elevation: pressed ? 6 : 9,
                          },
                      isFav
                        ? {
                          borderLeftWidth: 2.5,
                          borderLeftColor: '#c9a84c',
                        }
                        : null,
                    ];
                  }}
                >
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: -24,
                      left: -18,
                      width: 84,
                      height: 84,
                      borderRadius: 999,
                      backgroundColor: withAlpha(awayAccent, 0.2),
                    }}
                  />
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      bottom: -28,
                      right: -18,
                      width: 88,
                      height: 88,
                      borderRadius: 999,
                      backgroundColor: withAlpha(homeAccent, 0.18),
                    }}
                  />

                  {!hasScores && mappedGame && predictedGameIds.has(mappedGame.id) && (
                    <View className="absolute top-1.5 right-1.5 bg-accent/20 rounded-full px-1.5 py-0.5">
                      <Text className="text-accent text-[9px] font-bold">Predicted</Text>
                    </View>
                  )}

                  <View className="flex-row items-center justify-center mb-2">
                    {isLive ? (
                      <View className="flex-row items-center gap-1">
                        <LivePulseDot />
                        <Text className="text-accent-red text-xs font-bold">
                          {game.statusLabel}
                        </Text>
                      </View>
                    ) : isFinal ? (
                      <Text className="text-muted text-xs font-semibold">
                        Final
                      </Text>
                    ) : (
                      <Text className="text-muted text-xs">
                        {game.tipoffLabel}
                      </Text>
                    )}
                  </View>

                  <View className="flex-row h-px mb-2 overflow-hidden rounded-full">
                    <View style={{ flex: 1, backgroundColor: withAlpha(awayAccent, 0.38) }} />
                    <View style={{ flex: 1, backgroundColor: withAlpha(homeAccent, 0.38) }} />
                  </View>

                  <View className="flex-row items-center justify-between mb-1.5">
                    <View className="flex-row items-center gap-2">
                      <TeamLogoWithGlow abbreviation={game.awayTeam.abbreviation} accent={awayAccent} />
                      <Text
                        className={`text-sm ${
                          awayWon ? 'text-white font-bold' : 'text-muted font-medium'
                        }`}
                      >
                        {game.awayTeam.abbreviation}
                      </Text>
                    </View>
                    {hasScores && awayScore != null && (
                      <Text
                        className={`text-sm ${
                          awayWon ? 'text-white font-bold' : 'text-muted'
                        }`}
                      >
                        {awayScore}
                      </Text>
                    )}
                  </View>

                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <TeamLogoWithGlow abbreviation={game.homeTeam.abbreviation} accent={homeAccent} />
                      <Text
                        className={`text-sm ${
                          homeWon ? 'text-white font-bold' : 'text-muted font-medium'
                        }`}
                      >
                        {game.homeTeam.abbreviation}
                      </Text>
                    </View>
                    {hasScores && homeScore != null && (
                      <Text
                        className={`text-sm ${
                          homeWon ? 'text-white font-bold' : 'text-muted'
                        }`}
                      >
                        {homeScore}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}
