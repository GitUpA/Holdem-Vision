/**
 * EV Scoring — rates user actions against GTO frequency tables.
 *
 * Compares what the user did to what GTO recommends, producing
 * a structured score with EV loss estimate, verdict, and teaching
 * explanation.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ExplanationNode } from "../types/analysis";
import type { ArchetypeClassification } from "./archetypeClassifier";
import type { HandCategorization } from "./handCategorizer";
import {
  lookupFrequencies,
  getTable,
  type GtoAction,
  type ActionFrequencies,
} from "./tables";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type Verdict = "optimal" | "acceptable" | "mistake" | "blunder";

export interface ActionScore {
  /** EV lost in BB relative to GTO optimal action */
  evLoss: number;
  /** What the user did (normalized to GtoAction) */
  userAction: GtoAction;
  /** The highest-frequency GTO action */
  optimalAction: GtoAction;
  /** How often GTO takes the optimal action */
  optimalFrequency: number;
  /** How often GTO would take the user's action */
  userActionFrequency: number;
  /** Full frequency distribution for display */
  allFrequencies: ActionFrequencies;
  /** Archetype classification for this spot */
  archetype: ArchetypeClassification;
  /** Hand categorization */
  handCategory: HandCategorization;
  /** Rating of the user's action */
  verdict: Verdict;
  /** Conditional verdict: correct given you're in this spot (may differ from verdict if preflop was -EV) */
  conditionalVerdict?: Verdict;
  /** EV contribution from preflop entry (negative = entered with a hand GTO folds) */
  preflopContribution?: number;
  /** Cumulative EV loss across all streets so far */
  cumulativeEVLoss?: number;
  /** Teaching explanation */
  explanation: ExplanationNode;
}

// ═══════════════════════════════════════════════════════
// VERDICT THRESHOLDS
// ═══════════════════════════════════════════════════════

/**
 * Verdict based on how often GTO takes the user's action:
 * - optimal:    >= 30% (GTO does this regularly)
 * - acceptable: >= 15% (GTO does this sometimes)
 * - mistake:    >= 5%  (GTO rarely does this)
 * - blunder:    < 5%   (GTO almost never does this)
 */
function deriveVerdict(userFreq: number): Verdict {
  if (userFreq >= 0.30) return "optimal";
  if (userFreq >= 0.15) return "acceptable";
  if (userFreq >= 0.05) return "mistake";
  return "blunder";
}

// ═══════════════════════════════════════════════════════
// MAIN SCORING FUNCTION
// ═══════════════════════════════════════════════════════

/**
 * Score a user's action against GTO frequencies.
 *
 * @param archetype - The classified archetype for this spot
 * @param handCat - The categorized hand
 * @param userAction - What the user did (as GtoAction)
 * @param potSize - Current pot size (for EV loss scaling)
 * @param isInPosition - Whether the user is in position
 * @returns ActionScore with verdict, EV loss, and teaching explanation
 */
export function scoreAction(
  archetype: ArchetypeClassification,
  handCat: HandCategorization,
  userAction: GtoAction,
  potSize: number,
  isInPosition: boolean,
  street: "preflop" | "flop" | "turn" | "river" = "flop",
  /** Pre-computed frequencies from SpotSolution (avoids re-lookup, ensures DRY) */
  precomputedFrequencies?: ActionFrequencies,
): ActionScore | null {
  let frequencies: ActionFrequencies;

  if (precomputedFrequencies) {
    // Use pre-computed (from computeSolution, which uses validated ranges for preflop)
    frequencies = precomputedFrequencies;
  } else {
    // Fallback: direct lookup (postflop solver tables)
    const lookupArchetypeId = archetype.textureArchetypeId ?? archetype.archetypeId;
    const lookup = lookupFrequencies(
      lookupArchetypeId,
      handCat.category,
      isInPosition,
      street,
    );
    if (!lookup) return null;
    frequencies = lookup.frequencies;
  }

  const lookupArchetypeId = archetype.textureArchetypeId ?? archetype.archetypeId;
  const table = getTable(lookupArchetypeId, street);

  // Find optimal action (highest frequency)
  let optimalAction: GtoAction = "check";
  let optimalFrequency = 0;
  for (const [action, freq] of Object.entries(frequencies)) {
    if ((freq ?? 0) > optimalFrequency) {
      optimalFrequency = freq ?? 0;
      optimalAction = action as GtoAction;
    }
  }

  // Get user's action frequency
  // Look up user action frequency — treat all bet/raise variants as equivalent
  let userActionFrequency = frequencies[userAction] ?? 0;
  if (userActionFrequency === 0 && isAggressive(userAction)) {
    // User raised but solution uses bet_medium (or vice versa) — aggregate all aggressive freq
    userActionFrequency = sumAggressiveFrequencies(frequencies);
  }

  // Calculate EV loss
  const evLoss = calculateEvLoss(
    optimalFrequency,
    userActionFrequency,
    potSize,
  );

  const verdict = deriveVerdict(userActionFrequency);

  // Build teaching explanation
  const explanation = buildScoringExplanation(
    archetype,
    handCat,
    userAction,
    optimalAction,
    userActionFrequency,
    optimalFrequency,
    frequencies,
    verdict,
    evLoss,
    table?.keyPrinciple ?? "",
    table?.commonMistakes ?? [],
  );

  return {
    evLoss,
    userAction,
    optimalAction,
    optimalFrequency,
    userActionFrequency,
    allFrequencies: frequencies,
    archetype,
    handCategory: handCat,
    verdict,
    explanation,
  };
}

// ═══════════════════════════════════════════════════════
// EV LOSS CALCULATION
// ═══════════════════════════════════════════════════════

/**
 * Estimate EV loss in BB.
 *
 * Simple model: the frequency delta tells you how far off you are,
 * scaled by pot size. This is an approximation — true EV loss requires
 * knowing exact equity, but frequency delta × pot is a reasonable proxy.
 *
 * Scale factor: 0.5 (conservative — not every frequency deviation costs
 * the full pot, because mixed strategies have overlapping EV).
 */
function calculateEvLoss(
  optimalFreq: number,
  userFreq: number,
  potSize: number,
): number {
  const delta = Math.max(0, optimalFreq - userFreq);
  const scaleFactor = 0.5;
  return Math.round(delta * potSize * scaleFactor * 100) / 100;
}

// ═══════════════════════════════════════════════════════
// EXPLANATION BUILDER
// ═══════════════════════════════════════════════════════

function buildScoringExplanation(
  archetype: ArchetypeClassification,
  handCat: HandCategorization,
  userAction: GtoAction,
  optimalAction: GtoAction,
  userFreq: number,
  optimalFreq: number,
  frequencies: ActionFrequencies,
  verdict: Verdict,
  evLoss: number,
  keyPrinciple: string,
  commonMistakes: string[],
): ExplanationNode {
  const verdictSentiment = verdict === "optimal" || verdict === "acceptable"
    ? "positive"
    : verdict === "mistake"
      ? "warning"
      : "negative" as const;

  const children: ExplanationNode[] = [];

  // Your action
  children.push({
    summary: `You chose: ${userAction} (GTO frequency: ${(userFreq * 100).toFixed(0)}%)`,
    sentiment: verdictSentiment,
    tags: ["user-action"],
  });

  // GTO optimal
  if (userAction !== optimalAction) {
    children.push({
      summary: `GTO prefers: ${optimalAction} (${(optimalFreq * 100).toFixed(0)}%)`,
      sentiment: "neutral",
      tags: ["optimal-action"],
    });
  }

  // Full distribution
  const freqChildren: ExplanationNode[] = Object.entries(frequencies)
    .filter(([, v]) => (v ?? 0) > 0.01)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([action, freq]) => ({
      summary: `${action}: ${((freq ?? 0) * 100).toFixed(0)}%${action === userAction ? " <-- your choice" : ""}`,
      sentiment: action === userAction ? verdictSentiment : ("neutral" as const),
      tags: ["frequency"],
    }));

  children.push({
    summary: "GTO frequency distribution:",
    children: freqChildren,
    sentiment: "neutral",
    tags: ["frequencies"],
  });

  // EV loss
  if (evLoss > 0) {
    children.push({
      summary: `Estimated EV loss: ${evLoss.toFixed(1)} BB`,
      sentiment: "negative",
      tags: ["ev-loss"],
    });
  }

  // Teaching: key principle
  if (keyPrinciple) {
    children.push({
      summary: `Key principle: ${keyPrinciple}`,
      sentiment: "neutral",
      tags: ["principle"],
    });
  }

  // Teaching: common mistakes (if user made one)
  if (verdict === "mistake" || verdict === "blunder") {
    const relevantMistakes = commonMistakes.filter((m) =>
      m.toLowerCase().includes(userAction) ||
      m.toLowerCase().includes("too much") ||
      m.toLowerCase().includes("not enough"),
    );
    if (relevantMistakes.length > 0) {
      children.push({
        summary: `Common mistake: ${relevantMistakes[0]}`,
        sentiment: "warning",
        tags: ["common-mistake"],
      });
    }
  }

  return {
    summary: `${verdict.toUpperCase()}: ${userAction} (GTO: ${(userFreq * 100).toFixed(0)}%) — EV loss: ${evLoss.toFixed(1)} BB`,
    sentiment: verdictSentiment,
    children,
    tags: ["scoring", verdict],
  };
}

/** Check if an action is aggressive (any bet or raise variant) */
function isAggressive(action: string): boolean {
  return action.startsWith("bet") || action.startsWith("raise");
}

/** Sum all aggressive frequencies (bet_small + bet_medium + bet_large + raise_small + raise_large) */
function sumAggressiveFrequencies(freq: ActionFrequencies): number {
  return (freq.bet_small ?? 0) + (freq.bet_medium ?? 0) + (freq.bet_large ?? 0)
    + (freq.raise_small ?? 0) + (freq.raise_large ?? 0);
}

// ═══════════════════════════════════════════════════════
// ACTION NORMALIZATION
// ═══════════════════════════════════════════════════════

/**
 * Map a game action to the closest GtoAction for scoring.
 */
export function normalizeToGtoAction(
  actionType: string,
  amount: number | undefined,
  potSize: number,
): GtoAction {
  switch (actionType) {
    case "fold":
      return "fold";
    case "check":
      return "check";
    case "call":
      return "call";
    case "bet": {
      if (amount === undefined || potSize <= 0) return "bet_medium";
      const betRatio = amount / potSize;
      if (betRatio <= 0.45) return "bet_small";
      if (betRatio <= 0.9) return "bet_medium";
      return "bet_large";
    }
    case "raise": {
      if (amount === undefined || potSize <= 0) return "raise_large";
      const raiseRatio = amount / potSize;
      if (raiseRatio <= 0.5) return "raise_small";
      return "raise_large";
    }
    case "all_in":
      return "raise_large";
    default:
      return "check";
  }
}
