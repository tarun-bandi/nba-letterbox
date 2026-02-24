import type { GameWithTeams } from '@/types/database';

/** Derive a 0-10 score from position in ranked list */
export function deriveScore(position: number, totalCount: number): number {
  if (totalCount <= 1) return 10;
  return Math.round((10 * (1 - (position - 1) / (totalCount - 1))) * 10) / 10;
}

/** Format score for display: e.g. "7.6" */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

export type TriageBucket = 'loved' | 'decent' | 'meh';

/** Given a triage bucket and total ranked count, return the [low, high] position range (1-indexed, inclusive) */
export function triageRange(
  bucket: TriageBucket,
  totalCount: number,
): [number, number] {
  const third = Math.ceil(totalCount / 3);
  switch (bucket) {
    case 'loved':
      return [1, Math.min(third, totalCount)];
    case 'decent':
      return [third + 1, Math.min(third * 2, totalCount)];
    case 'meh':
      return [third * 2 + 1, totalCount];
  }
}

/** Whether triage should be shown (6+ ranked games) */
export function shouldShowTriage(rankedCount: number): boolean {
  return rankedCount >= 6;
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
