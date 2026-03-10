/**
 * RawEquityLens — instant hand strength evaluation.
 * The foundational lens: "what hand do I have right now?"
 *
 * Evaluates the current hand rank (pair, flush, etc.) instantly with
 * zero simulation overhead. Monte Carlo equity simulation is a separate
 * opt-in lens (see monteCarloLens.ts).
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { AnalysisLens, AnalysisContext, AnalysisResult, ExplanationNode } from "../types/analysis";
import type { VisualDirective } from "../types/visuals";
import { evaluateHand } from "../primitives/handEvaluator";
import { cardToDisplay } from "../primitives/card";
import { HAND_RANK_NAMES } from "../types/cards";

export interface RawEquityValue {
  /** Current hand evaluation (if community cards exist) */
  currentHand?: {
    name: string;
    description: string;
    tier: number;
  };
  /** Preflop hand strength category (if no community cards) */
  preflopStrength?: {
    category: "premium" | "strong" | "playable" | "marginal" | "weak";
    label: string;
  };
}

/** Classify preflop hand into strength tiers. */
function classifyPreflop(heroCards: number[]): RawEquityValue["preflopStrength"] {
  const r0 = Math.floor(heroCards[0] / 4);
  const r1 = Math.floor(heroCards[1] / 4);
  const s0 = heroCards[0] % 4;
  const s1 = heroCards[1] % 4;
  const high = Math.max(r0, r1);
  const low = Math.min(r0, r1);
  const paired = r0 === r1;
  const suited = s0 === s1;

  // Premium: AA, KK, QQ, AKs
  if (paired && high >= 10) return { category: "premium", label: "Premium pair" };
  if (high === 12 && low === 11 && suited) return { category: "premium", label: "Premium suited" };

  // Strong: JJ, TT, AK, AQs, AJs, KQs
  if (paired && high >= 8) return { category: "strong", label: "Strong pair" };
  if (high === 12 && low === 11) return { category: "strong", label: "Strong broadway" };
  if (high === 12 && low >= 9 && suited) return { category: "strong", label: "Strong suited ace" };
  if (high === 11 && low === 10 && suited) return { category: "strong", label: "Strong suited broadway" };

  // Playable: Mid pairs, suited broadways, suited connectors, Ax suited
  if (paired && high >= 4) return { category: "playable", label: "Middle pair" };
  if (high === 12 && suited) return { category: "playable", label: "Suited ace" };
  if (high >= 9 && low >= 8 && suited) return { category: "playable", label: "Suited broadway" };
  if (high === 12 && low >= 9) return { category: "playable", label: "Broadway" };
  if (high - low === 1 && suited && low >= 4) return { category: "playable", label: "Suited connector" };

  // Marginal: Small pairs, suited one-gappers, offsuit broadways
  if (paired) return { category: "marginal", label: "Small pair" };
  if (high >= 9 && low >= 7) return { category: "marginal", label: "Marginal broadway" };
  if (high - low <= 2 && suited && low >= 2) return { category: "marginal", label: "Suited gapper" };

  return { category: "weak", label: "Weak hand" };
}

export const rawEquityLens: AnalysisLens = {
  id: "raw-equity",
  name: "Hand Strength",
  description: "Instant hand rank evaluation — what do you have right now?",

  analyze(context: AnalysisContext): AnalysisResult<RawEquityValue> {
    const { heroCards, communityCards } = context;

    const value: RawEquityValue = {};

    // Evaluate current hand if we have community cards
    if (communityCards.length >= 3) {
      const eval_ = evaluateHand([...heroCards, ...communityCards]);
      value.currentHand = {
        name: eval_.rank.name,
        description: eval_.explanation.summary,
        tier: eval_.rank.tier,
      };
    }

    // Classify preflop strength
    if (heroCards.length === 2) {
      value.preflopStrength = classifyPreflop(heroCards);
    }

    const explanation = buildExplanation(context, value);
    const visuals = buildVisuals(value);

    return {
      value,
      context,
      explanation,
      visuals,
      lensId: "raw-equity",
      dependencies: [],
    };
  },
};

function buildExplanation(
  context: AnalysisContext,
  value: RawEquityValue,
): ExplanationNode {
  const heroDisplay = context.heroCards.map(cardToDisplay).join(" ");
  const communityDisplay = context.communityCards.length > 0
    ? context.communityCards.map(cardToDisplay).join(" ")
    : "none";

  const children: ExplanationNode[] = [];

  if (value.currentHand) {
    const tier = value.currentHand.tier;
    const sentiment = tier >= 4 ? "positive" : tier >= 1 ? "neutral" : "negative";

    children.push({
      summary: `Current hand: ${value.currentHand.name}`,
      detail: value.currentHand.description,
      sentiment,
      tags: ["hand-rank"],
    });

    // Relative strength context
    const rankIndex = HAND_RANK_NAMES.indexOf(value.currentHand.name as (typeof HAND_RANK_NAMES)[number]);
    const handsBelow = rankIndex;
    const handsAbove = HAND_RANK_NAMES.length - 1 - rankIndex;
    children.push({
      summary: `${handsBelow} hand types below, ${handsAbove} above`,
      sentiment: "neutral",
      tags: ["hand-context"],
    });

    return {
      summary: `${value.currentHand.name} with ${heroDisplay}`,
      detail: `Hero holds ${heroDisplay}. Community: ${communityDisplay}. Current hand: ${value.currentHand.name}.`,
      sentiment,
      children,
      tags: ["hand-strength"],
    };
  }

  // Preflop
  if (value.preflopStrength) {
    const sentimentMap = {
      premium: "positive",
      strong: "positive",
      playable: "neutral",
      marginal: "negative",
      weak: "negative",
    } as const;

    children.push({
      summary: `${value.preflopStrength.label}`,
      detail: `${value.preflopStrength.category} starting hand`,
      sentiment: sentimentMap[value.preflopStrength.category],
      tags: ["preflop-strength"],
    });

    return {
      summary: `${value.preflopStrength.label}: ${heroDisplay}`,
      detail: `Hero holds ${heroDisplay}. ${value.preflopStrength.category} preflop starting hand.`,
      sentiment: sentimentMap[value.preflopStrength.category],
      children,
      tags: ["hand-strength"],
    };
  }

  return {
    summary: `Holding ${heroDisplay}`,
    sentiment: "neutral",
    tags: ["hand-strength"],
  };
}

function buildVisuals(value: RawEquityValue): VisualDirective[] {
  return [{
    type: "hand_strength",
    data: {
      currentHand: value.currentHand ?? null,
      preflopStrength: value.preflopStrength ?? null,
    },
    priority: 10,
    lensId: "raw-equity",
  }];
}
