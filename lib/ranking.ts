import type { GameWithTeams, Sentiment, FanOf } from '@/types/database';

/** Minimum ranked games before numeric scores are displayed */
export const MIN_RANKED_FOR_SCORE = 10;

/** Derive a 0-10 score from position in ranked list, with optional fan boost */
export function deriveScore(position: number, totalCount: number, fanOf?: FanOf | null): number {
  if (totalCount <= 1) return 10;
  const baseScore = 10 * (1 - (position - 1) / (totalCount - 1));
  const fanBoost = fanOf && fanOf !== 'neutral' ? 0.5 : 0;
  return Math.round(Math.min(10, baseScore + fanBoost) * 10) / 10;
}

/** Format score for display: e.g. "7.6" */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

/** Sentiment ordering from best to worst */
export const SENTIMENT_ORDER: Sentiment[] = ['loved', 'good', 'okay', 'bad'];

/** Detect fan affiliation based on user's favorite teams */
export function detectFanOf(game: GameWithTeams, favoriteTeamIds: string[]): FanOf {
  if (favoriteTeamIds.length === 0) return 'neutral';
  const isHomeFan = favoriteTeamIds.includes(game.home_team_id);
  const isAwayFan = favoriteTeamIds.includes(game.away_team_id);
  if (isHomeFan && isAwayFan) return 'both';
  if (isHomeFan) return 'home';
  if (isAwayFan) return 'away';
  return 'neutral';
}

export interface ComparisonState {
  /** Low bound of current search range (1-indexed position) */
  low: number;
  /** High bound of current search range (1-indexed position) */
  high: number;
  /** Current comparison step (1-based) */
  step: number;
  /** Estimated total comparisons needed */
  estimatedTotal: number;
  /** Index of the game being compared against in the ranked list */
  midIndex: number;
}

/** Initialize a binary search comparison state */
export function initComparison(low: number, high: number): ComparisonState {
  const range = high - low + 1;
  const estimatedTotal = Math.max(1, Math.ceil(Math.log2(range + 1)));
  const midIndex = Math.floor((low + high) / 2);
  return {
    low,
    high,
    step: 1,
    estimatedTotal,
    midIndex,
  };
}

export type ComparisonResult = 'new_is_better' | 'existing_is_better';

/**
 * Advance the binary search after a comparison.
 * Returns the next state, or null if we've found the insertion position.
 * The returned `insertPosition` is the 1-indexed position to insert at.
 */
export function advanceComparison(
  state: ComparisonState,
  result: ComparisonResult,
): { nextState: ComparisonState | null; insertPosition: number | null } {
  let newLow = state.low;
  let newHigh = state.high;

  if (result === 'new_is_better') {
    // New game is better than mid — search in upper half (lower positions)
    newHigh = state.midIndex - 1;
  } else {
    // Existing game is better — search in lower half (higher positions)
    newLow = state.midIndex + 1;
  }

  if (newLow > newHigh) {
    // Found insertion point
    return { nextState: null, insertPosition: newLow };
  }

  const midIndex = Math.floor((newLow + newHigh) / 2);
  return {
    nextState: {
      low: newLow,
      high: newHigh,
      step: state.step + 1,
      estimatedTotal: state.estimatedTotal,
      midIndex,
    },
    insertPosition: null,
  };
}

/** Game info needed for comparison cards */
export interface ComparisonGame {
  id: string;
  game: GameWithTeams;
}
