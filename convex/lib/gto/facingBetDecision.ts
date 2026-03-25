/**
 * Facing-Bet Decision — what to do when an opponent bets into you.
 *
 * The solver tables answer "what should I do when first to act?"
 * When facing a bet, we need a different framework:
 *   hand strength + pot odds → fold / call / raise
 *
 * This is used by both autoAct (programmatic play) and the coaching
 * lens (user-facing recommendations). Single source of truth.
 *
 * Pure TypeScript, zero Convex imports.
 */

import { CATEGORY_STRENGTH } from "./categoryStrength";
import type { ActionType, LegalActions } from "../state/gameState";
import type { HandCategorization } from "./handCategorizer";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface FacingBetDecision {
  action: ActionType;
  amount?: number;
  /** Why this action was chosen */
  reason: string;
  /** Hand strength used (0-1) */
  handStrength: number;
  /** Pot odds needed to continue (0-1) */
  potOddsNeeded: number;
  /** Margin: strength - potOddsNeeded */
  margin: number;
}

// ═══════════════════════════════════════════════════════
// THRESHOLDS
// ═══════════════════════════════════════════════════════

/** Minimum margin (strength - potOddsNeeded) to call */
const CALL_MARGIN = 0.05;

/** Minimum hand strength to raise for value (regardless of odds) */
const VALUE_RAISE_THRESHOLD = 0.80;

/** Minimum hand strength to always call (regardless of odds) */
const ALWAYS_CALL_THRESHOLD = 0.70;

/** Below this strength, always fold unless getting incredible odds */
const ALWAYS_FOLD_THRESHOLD = 0.10;

/** Pot odds so good that even marginal hands should call */
const GREAT_ODDS_THRESHOLD = 0.15; // 6.7:1 or better

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

/**
 * Decide what to do when facing a bet.
 *
 * Uses hand strength + pot odds, NOT solver frequencies.
 * Solver frequencies are for "first to act" — they don't
 * apply when someone has already bet into you.
 */
export function facingBetDecision(
  handCat: HandCategorization,
  legal: LegalActions,
): FacingBetDecision {
  const strength = CATEGORY_STRENGTH[handCat.category] ?? handCat.relativeStrength;
  const potOddsNeeded = legal.callAmount > 0
    ? legal.callAmount / (legal.callAmount + (legal as any).potSize || legal.callAmount * 3)
    : 0;

  // Compute pot odds from legal actions
  // potOddsNeeded = callCost / (pot + callCost)
  // We approximate pot from callAmount: typical pot ≈ callAmount * 2-4x
  // Better: use actual pot if available
  const margin = strength - potOddsNeeded;

  // ── Always raise with monster hands ──
  if (strength >= VALUE_RAISE_THRESHOLD && legal.canRaise) {
    return {
      action: "raise",
      amount: legal.raiseMin,
      reason: `Strong hand (${handCat.description}) — raising for value.`,
      handStrength: strength,
      potOddsNeeded,
      margin,
    };
  }

  // ── Always call with strong hands ──
  if (strength >= ALWAYS_CALL_THRESHOLD) {
    return {
      action: "call",
      amount: legal.callAmount,
      reason: `Good hand (${handCat.description}) — calling comfortably.`,
      handStrength: strength,
      potOddsNeeded,
      margin,
    };
  }

  // ── Always fold with air ──
  if (strength <= ALWAYS_FOLD_THRESHOLD && potOddsNeeded > GREAT_ODDS_THRESHOLD) {
    return {
      action: "fold",
      reason: `Weak hand (${handCat.description}) — not enough to continue.`,
      handStrength: strength,
      potOddsNeeded,
      margin,
    };
  }

  // ── Middle ground: hand strength vs pot odds ──
  if (margin >= CALL_MARGIN) {
    return {
      action: "call",
      amount: legal.callAmount,
      reason: `Hand strength (${(strength * 100).toFixed(0)}%) justifies calling at these odds (need ${(potOddsNeeded * 100).toFixed(0)}%).`,
      handStrength: strength,
      potOddsNeeded,
      margin,
    };
  }

  // Getting amazing odds — call even with marginal hands
  if (potOddsNeeded <= GREAT_ODDS_THRESHOLD && strength > ALWAYS_FOLD_THRESHOLD) {
    return {
      action: "call",
      amount: legal.callAmount,
      reason: `Great pot odds (${(potOddsNeeded * 100).toFixed(0)}% needed) — worth a look.`,
      handStrength: strength,
      potOddsNeeded,
      margin,
    };
  }

  // Default: fold
  return {
    action: "fold",
    reason: `Hand (${handCat.description}, ${(strength * 100).toFixed(0)}%) not strong enough for the price (need ${(potOddsNeeded * 100).toFixed(0)}%).`,
    handStrength: strength,
    potOddsNeeded,
    margin,
  };
}

/**
 * Simpler version that takes raw values instead of full objects.
 * Useful when you already have the strength and pot info computed.
 */
export function facingBetAction(
  categoryStrength: number,
  callAmount: number,
  potSize: number,
  canRaise: boolean,
  raiseMin?: number,
): { action: ActionType; amount?: number } {
  const potOddsNeeded = callAmount > 0 ? callAmount / (potSize + callAmount) : 0;

  if (categoryStrength >= VALUE_RAISE_THRESHOLD && canRaise) {
    return { action: "raise", amount: raiseMin };
  }
  if (categoryStrength >= ALWAYS_CALL_THRESHOLD) {
    return { action: "call", amount: callAmount };
  }
  if (categoryStrength <= ALWAYS_FOLD_THRESHOLD && potOddsNeeded > GREAT_ODDS_THRESHOLD) {
    return { action: "fold" };
  }
  if (categoryStrength - potOddsNeeded >= CALL_MARGIN) {
    return { action: "call", amount: callAmount };
  }
  if (potOddsNeeded <= GREAT_ODDS_THRESHOLD && categoryStrength > ALWAYS_FOLD_THRESHOLD) {
    return { action: "call", amount: callAmount };
  }
  return { action: "fold" };
}
