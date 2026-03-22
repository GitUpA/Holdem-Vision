/**
 * Equity-Based Recommendation Engine
 *
 * When solver data is sparse or missing, produces fold/call/raise recommendations
 * from first principles: estimate opponent ranges → compute equity → compare to pot odds.
 *
 * Composes existing functions:
 *   estimateRange() → equityVsRange() → pot odds comparison → recommendation
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { CardIndex, Position, Street } from "../types/cards";
import type { PlayerAction, OpponentProfile, WeightedRange } from "../types/opponents";
import type { ExplanationNode } from "../types/analysis";
import type { LegalActions } from "../state/gameState";
import type { ActionFrequencies } from "../gto/tables/types";
import { estimateRange } from "../opponents/rangeEstimator";
import { equityVsRange } from "./opponentRead";
import { comboToHandClass, cardsToCombo } from "../opponents/combos";
import { rankOf, suitOf } from "../primitives/card";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface OpponentInput {
  profile: OpponentProfile;
  actions: PlayerAction[];
  position?: Position;
  /** Known hole cards (if revealed/assigned) */
  knownCards?: CardIndex[];
}

export interface EquityRecommendation {
  /** Recommended action frequencies */
  frequencies: ActionFrequencies;
  /** Raw equity vs opponent range(s) */
  equity: number;
  /** Equity needed to call (pot odds) */
  potOddsNeeded: number;
  /** Adjusted equity after position/playability factors */
  adjustedEquity: number;
  /** Explanation tree showing the math */
  explanation: ExplanationNode;
  /** Source label */
  source: "equity-engine";
}

// ═══════════════════════════════════════════════════════
// PLAYABILITY ADJUSTMENTS
// ═══════════════════════════════════════════════════════

/** Hands that need implied odds to set-mine (small/medium pairs) */
const SET_MINE_HANDS = new Set([
  "22", "33", "44", "55", "66", "77", "88",
]);

/** Hands with good postflop playability (suited broadways, premium suited) */
const HIGH_PLAYABILITY = new Set([
  "AKs", "AQs", "AJs", "ATs", "KQs", "KJs", "KTs", "QJs", "QTs", "JTs",
]);

/**
 * Adjust raw equity for position and hand playability.
 * Returns the "effective" equity for decision-making.
 */
function adjustEquity(
  rawEquity: number,
  handClass: string,
  isInPosition: boolean,
  street: Street,
  callCostBB: number,
  potBB: number,
): { adjusted: number; adjustments: string[] } {
  let adjusted = rawEquity;
  const adjustments: string[] = [];

  // OOP penalty: harder to realize equity out of position
  if (!isInPosition && street === "preflop") {
    adjusted *= 0.92; // ~8% equity realization penalty OOP
    adjustments.push("OOP: -8% realization penalty");
  }

  // Set-mining penalty: small pairs need implied odds
  // Standard rule: need ~7.5:1 implied odds for set-mining
  if (SET_MINE_HANDS.has(handClass) && street === "preflop") {
    const impliedOddsRatio = potBB / callCostBB;
    if (impliedOddsRatio < 5) {
      // Very poor implied odds — heavy penalty
      adjusted *= 0.6;
      adjustments.push(`Small pair: poor implied odds (${impliedOddsRatio.toFixed(1)}:1, need ~7.5:1)`);
    } else if (impliedOddsRatio < 7.5) {
      // Below ideal — moderate penalty
      adjusted *= 0.8;
      adjustments.push(`Small pair: marginal implied odds (${impliedOddsRatio.toFixed(1)}:1)`);
    }
  }

  // Suited premium bonus: better postflop playability
  if (HIGH_PLAYABILITY.has(handClass) && street === "preflop") {
    adjusted *= 1.05;
    adjustments.push("Suited premium: +5% playability bonus");
  }

  return { adjusted: Math.min(adjusted, 1), adjustments };
}

// ═══════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════

/**
 * Produce a fold/call/raise recommendation from equity vs estimated ranges.
 *
 * Used as a fallback when solver data is sparse or missing.
 */
export function equityBasedRecommendation(
  heroCards: CardIndex[],
  communityCards: CardIndex[],
  opponents: OpponentInput[],
  potBB: number,
  callCostBB: number,
  street: Street,
  isInPosition: boolean,
  legal: LegalActions,
): EquityRecommendation | null {
  if (heroCards.length < 2 || opponents.length === 0) return null;

  const knownCards = [...heroCards, ...communityCards];
  const combo = cardsToCombo(heroCards[0], heroCards[1]);
  const handClass = comboToHandClass(combo);

  // Step 1: Estimate opponent ranges and compute equity
  let combinedEquity = 1;
  const perOpponent: { label: string; equity: number; rangePct: number }[] = [];

  for (const opp of opponents) {
    let oppEquity: number;

    if (opp.knownCards && opp.knownCards.length >= 2) {
      // Known cards: compute equity directly vs that specific hand
      const oppRange: WeightedRange = new Map();
      const r1 = opp.knownCards[0];
      const r2 = opp.knownCards[1];
      // Build combo string for the known cards
      const oppCombo = `${rankOf(r1)}${suitOf(r1)}${rankOf(r2)}${suitOf(r2)}`;
      oppRange.set(oppCombo, 1);

      const result = equityVsRange(heroCards, communityCards, oppRange, [], 3000);
      oppEquity = result.win + result.tie * 0.5;
      perOpponent.push({
        label: opp.profile.name,
        equity: oppEquity,
        rangePct: 0,
      });
    } else {
      // Estimate range from profile + actions
      const estimation = estimateRange(
        opp.profile,
        opp.actions,
        knownCards,
        opp.position,
      );

      if (estimation.range.size === 0) continue;

      const result = equityVsRange(
        heroCards,
        communityCards,
        estimation.range,
        [],
        5000,
      );
      oppEquity = result.win + result.tie * 0.5;
      perOpponent.push({
        label: opp.profile.name,
        equity: oppEquity,
        rangePct: estimation.rangePctOfAll,
      });
    }

    combinedEquity *= oppEquity;
  }

  // For multi-way: combined equity is product of individual equities (approximation)
  const rawEquity = opponents.length === 1
    ? perOpponent[0]?.equity ?? 0.5
    : combinedEquity;

  // Step 2: Compute pot odds
  const potOddsNeeded = callCostBB > 0
    ? callCostBB / (potBB + callCostBB)
    : 0;

  // Step 3: Apply playability adjustments
  const { adjusted, adjustments } = adjustEquity(
    rawEquity,
    handClass,
    isInPosition,
    street,
    callCostBB,
    potBB,
  );

  // Step 4: Convert to action frequencies
  const frequencies = equityToFrequencies(adjusted, potOddsNeeded, legal);

  // Step 5: Build explanation
  const explanation = buildExplanation(
    handClass,
    rawEquity,
    adjusted,
    potOddsNeeded,
    potBB,
    callCostBB,
    isInPosition,
    perOpponent,
    adjustments,
    frequencies,
  );

  return {
    frequencies,
    equity: rawEquity,
    potOddsNeeded,
    adjustedEquity: adjusted,
    explanation,
    source: "equity-engine",
  };
}

// ═══════════════════════════════════════════════════════
// EQUITY → FREQUENCIES
// ═══════════════════════════════════════════════════════

function equityToFrequencies(
  adjustedEquity: number,
  potOddsNeeded: number,
  legal: LegalActions,
): ActionFrequencies {
  const margin = adjustedEquity - potOddsNeeded;
  const freq: ActionFrequencies = {};

  if (potOddsNeeded === 0) {
    // No bet to call — check or bet decision
    if (adjustedEquity > 0.6) {
      freq.bet_medium = 0.7;
      freq.check = 0.3;
    } else if (adjustedEquity > 0.4) {
      freq.check = 0.6;
      freq.bet_medium = 0.4;
    } else {
      freq.check = 0.9;
      freq.bet_medium = 0.1;
    }
    return freq;
  }

  if (margin > 0.15) {
    // Strong: well above pot odds — raise or call
    if (legal.canRaise) {
      freq.bet_large = 0.4;
      freq.call = 0.55;
      freq.fold = 0.05;
    } else {
      freq.call = 0.9;
      freq.fold = 0.1;
    }
  } else if (margin > 0.05) {
    // Comfortable: above pot odds — mostly call
    freq.call = 0.75;
    freq.fold = 0.15;
    if (legal.canRaise) freq.bet_large = 0.1;
  } else if (margin > -0.05) {
    // Marginal: close to break-even — mixed strategy
    freq.fold = 0.45;
    freq.call = 0.45;
    if (legal.canRaise) freq.bet_large = 0.1;
  } else if (margin > -0.15) {
    // Below break-even — mostly fold
    freq.fold = 0.75;
    freq.call = 0.25;
  } else {
    // Way below — clear fold
    freq.fold = 0.95;
    freq.call = 0.05;
  }

  return freq;
}

// ═══════════════════════════════════════════════════════
// EXPLANATION
// ═══════════════════════════════════════════════════════

function buildExplanation(
  handClass: string,
  rawEquity: number,
  adjustedEquity: number,
  potOddsNeeded: number,
  potBB: number,
  callCostBB: number,
  isInPosition: boolean,
  perOpponent: { label: string; equity: number; rangePct: number }[],
  adjustments: string[],
  frequencies: ActionFrequencies,
): ExplanationNode {
  const equityPct = (rawEquity * 100).toFixed(1);
  const adjustedPct = (adjustedEquity * 100).toFixed(1);
  const neededPct = (potOddsNeeded * 100).toFixed(1);
  const margin = adjustedEquity - potOddsNeeded;
  const marginPct = (margin * 100).toFixed(1);

  // Determine top action
  let topAction = "fold";
  let topFreq = 0;
  for (const [action, freq] of Object.entries(frequencies)) {
    if ((freq ?? 0) > topFreq) {
      topFreq = freq ?? 0;
      topAction = action;
    }
  }

  const sentiment = margin > 0.05 ? "positive" : margin > -0.05 ? "neutral" : "negative";

  const children: ExplanationNode[] = [];

  // Equity vs each opponent
  for (const opp of perOpponent) {
    children.push({
      summary: `vs ${opp.label}: ${(opp.equity * 100).toFixed(1)}% equity${opp.rangePct > 0 ? ` (range ~${opp.rangePct.toFixed(0)}%)` : ""}`,
      sentiment: opp.equity > 0.5 ? "positive" : opp.equity > 0.35 ? "neutral" : "negative",
    });
  }

  // Pot odds
  children.push({
    summary: `Pot ${potBB.toFixed(1)} BB, call ${callCostBB.toFixed(1)} BB — need ${neededPct}% equity`,
    sentiment: "neutral",
    tags: ["pot-odds"],
  });

  // Adjustments
  if (adjustments.length > 0) {
    children.push({
      summary: `Adjusted equity: ${equityPct}% → ${adjustedPct}% (${adjustments.join(", ")})`,
      sentiment: "neutral",
    });
  }

  // Verdict
  const verdictText = margin > 0.15
    ? "Strong call — equity well above pot odds"
    : margin > 0.05
      ? "Profitable call — equity exceeds pot odds"
      : margin > -0.05
        ? "Close spot — near break-even"
        : margin > -0.15
          ? "Below break-even — lean toward fold"
          : "Clear fold — equity well below pot odds";

  children.push({
    summary: verdictText,
    sentiment,
    tags: ["equity-verdict"],
  });

  return {
    summary: `${handClass} — ${adjustedPct}% equity vs ${neededPct}% needed (${marginPct > "0" ? "+" : ""}${marginPct}%) → ${topAction.replace("_", " ")}`,
    detail: `Equity-based recommendation. ${isInPosition ? "In position" : "Out of position"}.`,
    sentiment,
    children,
    tags: ["equity-recommendation"],
  };
}
