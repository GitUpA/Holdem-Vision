/**
 * Counter-Strategy Map — optimal response to observed behavior patterns.
 *
 * Generated from the payoff matrix. For each behavior pattern,
 * provides the statistically proven adjustment to exploit it.
 *
 * Layer 10 of first-principles.md: the meta-game knowledge base.
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { BehaviorPattern } from "../opponents/behaviorInference";
import { computeBehaviorConfidence, confidenceLabel } from "./payoffMatrix";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface CounterAdvice {
  /** The detected behavior pattern */
  pattern: BehaviorPattern;
  /** Adjustments to hero's strategy */
  adjustments: Adjustment[];
  /** One-line coaching narrative */
  narrative: string;
  /** Detailed explanation for the coaching panel */
  explanation: string;
  /** Statistical confidence (0-1) */
  confidence: number;
  /** Human-readable confidence label */
  confidenceLabel: string;
}

export interface Adjustment {
  /** What to change */
  dimension: string;
  /** Direction */
  direction: "increase" | "decrease";
  /** How much (qualitative) */
  magnitude: "slight" | "moderate" | "significant";
  /** Specific advice */
  description: string;
}

// ═══════════════════════════════════════════════════════
// COUNTER-STRATEGY MAP
// ═══════════════════════════════════════════════════════

/**
 * The counter-strategy map: behavior pattern → optimal adjustments.
 *
 * Derived from payoff matrix analysis. Each entry represents the
 * statistically proven winning adjustment against a behavior pattern.
 *
 * The triangle: GTO can't be beaten → deviations can be exploited →
 * exploits are themselves exploitable → GTO is the safe fallback.
 */
const COUNTER_STRATEGIES: Record<BehaviorPattern, Omit<CounterAdvice, "confidence" | "confidenceLabel">> = {
  "tight-passive": {
    pattern: "tight-passive",
    adjustments: [
      { dimension: "bluff_frequency", direction: "increase", magnitude: "significant", description: "Bluff more — they fold too often" },
      { dimension: "steal_frequency", direction: "increase", magnitude: "moderate", description: "Steal their blinds relentlessly" },
      { dimension: "value_bet_range", direction: "decrease", magnitude: "slight", description: "When they call, they have it — don't value bet thin" },
    ],
    narrative: "This opponent folds too much. Pressure them with bluffs and blind steals — they'll only fight back with premiums.",
    explanation: "Tight-passive players (NIT-like) fold more than GTO recommends. The winning counter: increase bluff frequency on all streets, especially c-bets on dry boards. When they do call or raise, believe them — they have a strong hand. The risk: if they adjust and start calling more, you need to shift back toward GTO.",
  },

  "tight-aggressive": {
    pattern: "tight-aggressive",
    adjustments: [
      { dimension: "calling_range", direction: "decrease", magnitude: "slight", description: "Tighten up — they're selective but strong when they play" },
      { dimension: "trap_frequency", direction: "increase", magnitude: "moderate", description: "Trap with strong hands — they bet for you" },
      { dimension: "bluff_frequency", direction: "decrease", magnitude: "slight", description: "Don't bluff often — they fold less when involved" },
    ],
    narrative: "This opponent is selective but aggressive. Play tighter against them and let them bet into your strong hands.",
    explanation: "Tight-aggressive players (TAG-like) are the hardest to exploit because they play close to GTO. The best counter: play slightly tighter, avoid marginal spots, and trap when you have a strong hand. They will bet for you. Don't try to bluff them out of pots they've decided to play.",
  },

  "loose-passive": {
    pattern: "loose-passive",
    adjustments: [
      { dimension: "value_bet_range", direction: "increase", magnitude: "significant", description: "Value bet thinner — they call with worse hands" },
      { dimension: "bluff_frequency", direction: "decrease", magnitude: "significant", description: "Never bluff — they call anyway" },
      { dimension: "bet_sizing", direction: "increase", magnitude: "moderate", description: "Bet bigger for value — they'll call regardless" },
    ],
    narrative: "This opponent calls too much. Stop bluffing them entirely — just value bet thinner and bigger.",
    explanation: "Loose-passive players (FISH-like) call too often and rarely raise. The winning counter: expand your value betting range (bet top pair weak kicker, bet middle pair on safe boards) and NEVER bluff. They will call with worse. Bet larger for value — they don't adjust their calling range based on sizing.",
  },

  "loose-aggressive": {
    pattern: "loose-aggressive",
    adjustments: [
      { dimension: "calling_range", direction: "increase", magnitude: "moderate", description: "Call down lighter — many of their bets are bluffs" },
      { dimension: "check_raise_frequency", direction: "increase", magnitude: "moderate", description: "Check-raise their bluffs to win bigger pots" },
      { dimension: "bluff_frequency", direction: "decrease", magnitude: "moderate", description: "Let them bluff into you rather than bluffing yourself" },
    ],
    narrative: "This opponent bluffs too much. Call them down and let them hang themselves with aggressive plays.",
    explanation: "Loose-aggressive players (LAG-like) bet and raise too often. The winning counter: widen your calling range (they're bluffing more than GTO), check-raise with strong hands (they'll bet into you), and reduce your own bluffing (they're already putting money in for you).",
  },

  "balanced": {
    pattern: "balanced",
    adjustments: [
      { dimension: "strategy", direction: "decrease", magnitude: "slight", description: "Stay close to GTO — no easy exploits available" },
    ],
    narrative: "This opponent plays balanced. Stay close to GTO and look for small deviations over time.",
    explanation: "Balanced players are hard to exploit. Play GTO as your baseline and watch for patterns over many hands. Small deviations will emerge — no one plays perfect GTO. When you spot a pattern with moderate confidence, make a small adjustment. If it works, press harder. If not, return to GTO.",
  },

  "unknown": {
    pattern: "unknown",
    adjustments: [],
    narrative: "Not enough data to read this opponent. Play GTO and observe.",
    explanation: "With few observations, play GTO as your baseline. GTO protects you against unknown opponents. As you gather more data, the system will detect patterns and recommend adjustments.",
  },
};

// ═══════════════════════════════════════════════════════
// LOOKUP
// ═══════════════════════════════════════════════════════

/**
 * Get counter-strategy advice for a detected behavior pattern.
 *
 * The confidence is computed from the number of observations
 * and the strength of the detected deviation.
 */
export function getCounterAdvice(
  pattern: BehaviorPattern,
  observedActions: number,
  deviationFromGTO: number,
): CounterAdvice {
  const base = COUNTER_STRATEGIES[pattern] ?? COUNTER_STRATEGIES["unknown"];
  const confidence = computeBehaviorConfidence(observedActions, deviationFromGTO);

  return {
    ...base,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
  };
}

/**
 * Generate a coaching narrative that combines GTO recommendation
 * with exploitative adjustment based on opponent behavior.
 *
 * This is the Layer 10 coaching output — the "GTO of narratives."
 */
export function buildExploitativeCoaching(
  gtoRecommendation: string,
  counterAdvice: CounterAdvice,
): string {
  if (counterAdvice.pattern === "unknown" || counterAdvice.confidence < 0.3) {
    return `${gtoRecommendation} (No clear read on this opponent — playing GTO baseline.)`;
  }

  const confidenceNote = counterAdvice.confidence >= 0.7
    ? "Our reads are confident"
    : "Our read is developing";

  return `${gtoRecommendation} However, this opponent has been ${counterAdvice.narrative.toLowerCase()} ${confidenceNote} (${(counterAdvice.confidence * 100).toFixed(0)}%). ${counterAdvice.adjustments[0]?.description ?? ""}`;
}
