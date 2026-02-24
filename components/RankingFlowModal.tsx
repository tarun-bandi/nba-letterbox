import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { X, Trophy } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/lib/store/authStore';
import { useToastStore } from '@/lib/store/toastStore';
import {
  shouldShowTriage,
  triageRange,
  initComparison,
  advanceComparison,
  deriveScore,
  formatScore,
  type TriageBucket,
  type ComparisonState,
  type ComparisonGame,
} from '@/lib/ranking';
import {
  fetchRankedList,
  insertGameRanking,
  removeGameRanking,
  type RankedGame,
} from '@/lib/rankingService';
import TriageScreen from './TriageScreen';
import ComparisonScreen from './ComparisonScreen';
import type { GameWithTeams } from '@/types/database';

type FlowStep = 'loading' | 'triage' | 'comparison' | 'placement';

interface RankingFlowModalProps {
  visible: boolean;
  gameId: string;
  game: GameWithTeams;
  onClose: () => void;
  onComplete: () => void;
  /** If true, remove existing ranking before re-ranking */
  isRerank?: boolean;
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
  const [compState, setCompState] = useState<ComparisonState | null>(null);
  const [insertPosition, setInsertPosition] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Load ranked list when modal opens
  useEffect(() => {
    if (!visible || !user) return;

    let cancelled = false;
    (async () => {
      try {
        // If re-ranking, remove existing first
        if (isRerank) {
          await removeGameRanking(user.id, gameId);
        }

        const list = await fetchRankedList(user.id);
        if (cancelled) return;

        // Filter out the current game if somehow still in list
        const filtered = list.filter((r) => r.game_id !== gameId);
        setRankedGames(filtered);

        const count = filtered.length;

        if (count === 0) {
          // First game — auto insert at #1
          setInsertPosition(1);
          setStep('placement');
        } else if (count === 1) {
          // Exactly 1 comparison needed
          setCompState(initComparison(1, 1));
          setStep('comparison');
        } else if (shouldShowTriage(count)) {
          setStep('triage');
        } else {
          // < 6 games, skip triage
          setCompState(initComparison(1, count));
          setStep('comparison');
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

  const handleTriage = useCallback((bucket: TriageBucket) => {
    const count = rankedGames.length;
    const [low, high] = triageRange(bucket, count);
    setCompState(initComparison(low, high));
    setStep('comparison');
  }, [rankedGames]);

  const handleComparison = useCallback((choice: 'new' | 'existing') => {
    if (!compState) return;

    const result = choice === 'new' ? 'new_is_better' : 'existing_is_better';
    const { nextState, insertPosition: pos } = advanceComparison(compState, result);

    if (pos !== null) {
      setInsertPosition(pos);
      setStep('placement');
    } else if (nextState) {
      setCompState(nextState);
    }
  }, [compState]);

  const handleConfirm = useCallback(async () => {
    if (!user || insertPosition === null) return;

    setSaving(true);
    try {
      await insertGameRanking(user.id, gameId, insertPosition);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(`Ranked #${insertPosition}!`);
      onComplete();
    } catch (e) {
      toast.show('Failed to save ranking', 'error');
    } finally {
      setSaving(false);
    }
  }, [user, gameId, insertPosition, onComplete]);

  const handleSkip = useCallback(() => {
    onClose();
  }, [onClose]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setStep('loading');
      setRankedGames([]);
      setCompState(null);
      setInsertPosition(null);
      setSaving(false);
    }
  }, [visible]);

  const totalAfterInsert = rankedGames.length + 1;
  const score = insertPosition !== null ? deriveScore(insertPosition, totalAfterInsert) : 0;

  // Get the current comparison game from ranked list
  const comparisonGame = compState
    ? rankedGames[compState.midIndex - 1]
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end bg-black/60">
        <View className="bg-surface rounded-t-3xl border-t border-border" style={{ maxHeight: '85%' }}>
          {/* Handle bar */}
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 bg-border rounded-full" />
          </View>

          {/* Header */}
          <View className="flex-row justify-between items-center px-5 pt-2 pb-4">
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
            <View className="items-center justify-center py-20">
              <ActivityIndicator color="#c9a84c" size="large" />
              <Text className="text-muted text-sm mt-3">Loading your rankings...</Text>
            </View>
          )}

          {/* Triage */}
          {step === 'triage' && (
            <TriageScreen onSelect={handleTriage} onSkip={handleSkip} />
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
            <View className="px-6 pt-4 pb-8 items-center">
              <View className="w-16 h-16 rounded-full bg-accent/20 items-center justify-center mb-4">
                <Trophy size={32} color="#c9a84c" />
              </View>

              <Text className="text-white text-2xl font-bold mb-1">
                #{insertPosition}
              </Text>
              <Text className="text-muted text-sm mb-1">
                of {totalAfterInsert} ranked games
              </Text>
              <Text className="text-accent text-3xl font-bold mb-6">
                {formatScore(score)}
              </Text>

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
