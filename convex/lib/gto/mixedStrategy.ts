/**
 * Mixed Strategy Detection — identifies spots where GTO mixes between actions.
 *
 * A "mixed strategy" spot is one where the solver assigns significant
 * frequency to two or more actions (both > 25%, gap < 20%). These are
 * close spots where multiple actions are correct.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ActionFrequencies } from "./tables/types";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface MixedStrategyInfo {
  isMixed: boolean;
  topAction: string;
  topFreq: number;
  secondAction: string;
  secondFreq: number;
  tradeoffNote: string;
}

// ═══════════════════════════════════════════════════════
// THRESHOLDS
// ═══════════════════════════════════════════════════════

/** Minimum frequency for the second action to qualify as mixed */
export const MIXED_MIN_SECOND_FREQ = 0.25;

/** Maximum gap between top two actions to qualify as mixed */
export const MIXED_MAX_GAP = 0.20;

/** Minimum frequency to consider an action as present */
export const ACTION_PRESENT_THRESHOLD = 0.01;

// ═══════════════════════════════════════════════════════
// ACTION TRADEOFFS
// ═══════════════════════════════════════════════════════

/** Action-pair tradeoff explanations — what each action "says" differently */
export const ACTION_TRADEOFFS: Record<string, string> = {
  "bet-check": "Betting pressures opponents and builds the pot, but checking disguises your hand and controls pot size",
  "check-bet": "Checking disguises your hand and controls pot size, but betting pressures opponents and builds the pot",
  "raise-call": "Raising builds the pot and shows strength, but calling keeps more hands in and disguises your holding",
  "call-raise": "Calling keeps more hands in and disguises your holding, but raising builds the pot and shows strength",
  "bet-fold": "Betting applies pressure with fold equity, but folding conserves chips when the odds aren't there",
  "fold-call": "The hand is borderline — folding avoids a marginal spot, but calling captures pot odds",
  "call-fold": "The price is close — calling captures pot odds, but folding avoids a marginal spot",
  "raise-fold": "Either go big or go home — raising maximizes fold equity, but folding accepts the spot isn't profitable",
};

// ═══════════════════════════════════════════════════════
// DETECTION
// ═══════════════════════════════════════════════════════

/**
 * Detect whether a frequency distribution represents a mixed strategy spot.
 */
export function detectMixedStrategy(frequencies: ActionFrequencies): MixedStrategyInfo {
  const sorted = Object.entries(frequencies)
    .filter(([, v]) => (v ?? 0) > ACTION_PRESENT_THRESHOLD)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));

  if (sorted.length < 2) {
    return { isMixed: false, topAction: sorted[0]?.[0] ?? "", topFreq: sorted[0]?.[1] ?? 0, secondAction: "", secondFreq: 0, tradeoffNote: "" };
  }

  const [topAction, topFreq] = [sorted[0][0], sorted[0][1] ?? 0];
  const [secondAction, secondFreq] = [sorted[1][0], sorted[1][1] ?? 0];
  const gap = topFreq - secondFreq;
  const isMixed = secondFreq >= MIXED_MIN_SECOND_FREQ && gap < MIXED_MAX_GAP;

  const tradeoffNote = isMixed
    ? getTradeoffText(topAction, secondAction)
    : "";

  return { isMixed, topAction, topFreq, secondAction, secondFreq, tradeoffNote };
}

/**
 * Get the tradeoff explanation text for a pair of actions.
 * Normalizes action names by stripping sizing suffixes (e.g. bet_small -> bet).
 */
export function getTradeoffText(topAction: string, secondAction: string): string {
  const normTop = topAction.replace(/_.*/, "");
  const normSecond = secondAction.replace(/_.*/, "");
  const key = `${normTop}-${normSecond}`;
  return ACTION_TRADEOFFS[key] ?? `Both ${normTop} and ${normSecond} are valid here`;
}
