import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { X, Trophy, Heart } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/lib/store/authStore';
import { useToastStore } from '@/lib/store/toastStore';
import {
  SENTIMENT_ORDER,
  initComparison,
  advanceComparison,
  deriveScore,
  formatScore,
  detectFanOf,
  MIN_RANKED_FOR_SCORE,
  type ComparisonState,
} from '@/lib/ranking';
import {
  fetchRankedList,
  insertGameRanking,
  removeGameRanking,
  updateLogRankingMeta,
  fetchFavoriteTeamIds,
  type RankedGame,
} from '@/lib/rankingService';
import SentimentScreen from './SentimentScreen';
import ComparisonScreen from './ComparisonScreen';
import type { GameWithTeams, Sentiment, FanOf } from '@/types/database';

type FlowStep = 'loading' | 'fan_confirm' | 'sentiment' | 'comparison' | 'placement';

interface RankingFlowModalProps {
  visible: boolean;
  gameId: string;
  game: GameWithTeams;
  onClose: () => void;
  onComplete: () => void;
  /** If true, remove existing ranking before re-ranking */
  isRerank?: boolean;
}

/**
 * Auto-place a game when no same-sentiment games exist.
 * Insert after all games with a "better" sentiment.
 * Sentiment order: loved > good > okay > bad
 */
function autoPlaceForSentiment(sentiment: Sentiment, rankedGames: RankedGame[]): number {
  const sentimentIdx = SENTIMENT_ORDER.indexOf(sentiment);
  const betterSentiments = SENTIMENT_ORDER.slice(0, sentimentIdx);

  if (betterSentiments.length === 0) {
    // This is "loved" — place at #1
    return 1;
  }

  // Find the last game with a better sentiment
  let lastBetterPos = 0;
  for (const g of rankedGames) {
    if (g.sentiment && betterSentiments.includes(g.sentiment)) {
      lastBetterPos = Math.max(lastBetterPos, g.position);
    }
  }

  return lastBetterPos + 1;
}

/**
 * Map a filtered-list binary search position back to a full-list position.
 * filteredPos is 1-indexed within the filteredGames array.
 */
function mapToFullListPosition(filteredPos: number, filteredGames: RankedGame[]): number {
  if (filteredGames.length === 0) return 1;

  if (filteredPos <= 1) {
    // Insert before the first same-sentiment game
    return filteredGames[0].position;
  }

  if (filteredPos > filteredGames.length) {
    // Insert after the last same-sentiment game
    return filteredGames[filteredGames.length - 1].position + 1;
  }

  // Insert at the position of the game at filteredPos - 1
  return filteredGames[filteredPos - 1].position;
}

export default function RankingFlowModal({
  visible,
  gameId,
  game,
  onClose,
  onComplete,
  isRerank = false,
}: RankingFlowModalProps) {
  const { user } = useAuthStore();
  const toast = useToastStore();
  const [step, setStep] = useState<FlowStep>('loading');
  const [rankedGames, setRankedGames] = useState<RankedGame[]>([]);
  const [filteredGames, setFilteredGames] = useState<RankedGame[]>([]);
  const [compState, setCompState] = useState<ComparisonState | null>(null);
  const [insertPosition, setInsertPosition] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [fanOf, setFanOf] = useState<FanOf>('neutral');
  const [sentiment, setSentiment] = useState<Sentiment | null>(null);
  const [detectedFanTeamName, setDetectedFanTeamName] = useState<string | null>(null);

  // Load ranked list and detect fan affiliation when modal opens
  useEffect(() => {
    if (!visible || !user) return;

    let cancelled = false;
    (async () => {
      try {
        // If re-ranking, remove existing first
        if (isRerank) {
          await removeGameRanking(user.id, gameId);
        }

        const [list, favoriteTeamIds] = await Promise.all([
          fetchRankedList(user.id),
          fetchFavoriteTeamIds(user.id),
        ]);
        if (cancelled) return;

        // Filter out the current game if somehow still in list
        const filtered = list.filter((r) => r.game_id !== gameId);
        setRankedGames(filtered);

        // Detect fan affiliation
        const detected = detectFanOf(game, favoriteTeamIds);
        setFanOf(detected);

        if (detected !== 'neutral') {
          // Determine the fan team name for display
          let teamName: string;
          if (detected === 'both') {
            teamName = `${game.home_team.abbreviation}/${game.away_team.abbreviation}`;
          } else if (detected === 'home') {
            teamName = game.home_team.full_name;
          } else {
            teamName = game.away_team.full_name;
          }
          setDetectedFanTeamName(teamName);
          setStep('fan_confirm');
        } else {
          setDetectedFanTeamName(null);
          setStep('sentiment');
        }
      } catch (e) {
        if (!cancelled) {
          toast.show('Failed to load rankings', 'error');
          onClose();
        }
      }
    })();

    return () => { cancelled = true; };
  }, [visible, user, gameId, isRerank]);

  const handleFanConfirm = useCallback((watchAsNeutral: boolean) => {
    if (watchAsNeutral) {
      setFanOf('neutral');
      setDetectedFanTeamName(null);
    }
    setStep('sentiment');
  }, []);

  const handleSentiment = useCallback((selected: Sentiment) => {
    setSentiment(selected);

    if (rankedGames.length === 0) {
      // First game — auto insert at #1
      setInsertPosition(1);
      setStep('placement');
      return;
    }

    // Filter to only same-sentiment games
    const sameSentiment = rankedGames.filter((g) => g.sentiment === selected);
    setFilteredGames(sameSentiment);

    if (sameSentiment.length === 0) {
      // No same-sentiment games — auto-place based on sentiment ordering
      const pos = autoPlaceForSentiment(selected, rankedGames);
      setInsertPosition(pos);
      setStep('placement');
    } else if (sameSentiment.length === 1) {
      // Exactly 1 comparison needed
      setCompState(initComparison(1, 1));
      setStep('comparison');
    } else {
      setCompState(initComparison(1, sameSentiment.length));
      setStep('comparison');
    }
  }, [rankedGames]);

  const handleComparison = useCallback((choice: 'new' | 'existing') => {
    if (!compState) return;

    const result = choice === 'new' ? 'new_is_better' : 'existing_is_better';
    const { nextState, insertPosition: filteredPos } = advanceComparison(compState, result);

    if (filteredPos !== null) {
      // Map filtered position back to full-list position
      const fullPos = mapToFullListPosition(filteredPos, filteredGames);
      setInsertPosition(fullPos);
      setStep('placement');
    } else if (nextState) {
      setCompState(nextState);
    }
  }, [compState, filteredGames]);

  const handleConfirm = useCallback(async () => {
    if (!user || insertPosition === null || !sentiment) return;

    setSaving(true);
    try {
      // Save sentiment and fan_of metadata first
      await updateLogRankingMeta(user.id, gameId, sentiment, fanOf);
      // Then insert the ranking position
      await insertGameRanking(user.id, gameId, insertPosition);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(`Ranked #${insertPosition}!`);
      onComplete();
    } catch (e) {
      toast.show('Failed to save ranking', 'error');
    } finally {
      setSaving(false);
    }
  }, [user, gameId, insertPosition, sentiment, fanOf, onComplete]);

  const handleSkip = useCallback(() => {
    onClose();
  }, [onClose]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setStep('loading');
      setRankedGames([]);
      setFilteredGames([]);
      setCompState(null);
      setInsertPosition(null);
      setSaving(false);
      setFanOf('neutral');
      setSentiment(null);
      setDetectedFanTeamName(null);
    }
  }, [visible]);

  const totalAfterInsert = rankedGames.length + 1;
  const showScore = totalAfterInsert >= MIN_RANKED_FOR_SCORE;
  const score = insertPosition !== null && showScore ? deriveScore(insertPosition, totalAfterInsert, fanOf) : 0;
  const isFanGame = fanOf !== 'neutral';

  // Get the current comparison game from filtered list
  const comparisonGame = compState
    ? filteredGames[compState.midIndex - 1]
    : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <View className="flex-1 bg-surface">
        <View className="flex-1">
          {/* Header */}
          <View className="flex-row justify-between items-center px-5 pt-14 pb-4">
            <Text className="text-white text-lg font-semibold">
              Rank This Game
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Loading */}
          {step === 'loading' && (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#c9a84c" size="large" />
              <Text className="text-muted text-sm mt-3">Loading your rankings...</Text>
            </View>
          )}

          {/* Fan confirmation */}
          {step === 'fan_confirm' && detectedFanTeamName && (
            <View className="flex-1 px-6 justify-center">
              <View className="items-center mb-6">
                <View className="w-14 h-14 rounded-full bg-accent/20 items-center justify-center mb-3">
                  <Heart size={28} color="#c9a84c" />
                </View>
                <Text className="text-white text-lg font-bold text-center mb-1">
                  {detectedFanTeamName} fan?
                </Text>
                <Text className="text-muted text-sm text-center">
                  Fan games get a slight score boost
                </Text>
              </View>

              <TouchableOpacity
                className="bg-accent rounded-xl py-4 px-8 items-center w-full mb-3"
                onPress={() => handleFanConfirm(false)}
                activeOpacity={0.8}
              >
                <Text className="text-background font-semibold text-base">
                  Yes, watching as a fan
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="bg-surface border border-border rounded-xl py-4 px-8 items-center w-full"
                onPress={() => handleFanConfirm(true)}
                activeOpacity={0.7}
              >
                <Text className="text-muted font-semibold text-base">
                  Neutral viewer
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Sentiment */}
          {step === 'sentiment' && (
            <SentimentScreen
              onSelect={handleSentiment}
              onSkip={handleSkip}
              fanTeamName={isFanGame ? detectedFanTeamName : null}
            />
          )}

          {/* Comparison */}
          {step === 'comparison' && compState && comparisonGame && (
            <ComparisonScreen
              newGame={game}
              existingGame={comparisonGame.game}
              step={compState.step}
              estimatedTotal={compState.estimatedTotal}
              onChoose={handleComparison}
              onSkip={handleSkip}
            />
          )}

          {/* Placement confirmation */}
          {step === 'placement' && insertPosition !== null && (
            <View className="flex-1 px-6 justify-center items-center">
              <View className="w-16 h-16 rounded-full bg-accent/20 items-center justify-center mb-4">
                <Trophy size={32} color="#c9a84c" />
              </View>

              <Text className="text-white text-2xl font-bold mb-1">
                #{insertPosition}
              </Text>
              <Text className="text-muted text-sm mb-1">
                of {totalAfterInsert} ranked games
              </Text>
              {showScore ? (
                <View className="flex-row items-center gap-1.5 mb-6">
                  <Text className="text-accent text-3xl font-bold">
                    {formatScore(score)}
                  </Text>
                  {isFanGame && (
                    <Heart size={16} color="#c9a84c" fill="#c9a84c" />
                  )}
                </View>
              ) : (
                <Text className="text-muted text-sm mb-6">
                  Rank {MIN_RANKED_FOR_SCORE - totalAfterInsert} more game{MIN_RANKED_FOR_SCORE - totalAfterInsert !== 1 ? 's' : ''} to unlock your score
                </Text>
              )}

              <TouchableOpacity
                className="bg-accent rounded-xl py-4 px-8 items-center w-full mb-3"
                onPress={handleConfirm}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color="#0a0a0a" />
                ) : (
                  <Text className="text-background font-semibold text-base">
                    Confirm Ranking
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                className="py-3 items-center"
                onPress={handleSkip}
                activeOpacity={0.6}
              >
                <Text className="text-muted text-sm">Skip</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}
