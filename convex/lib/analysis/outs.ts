/**
 * OutsLens — identifies which remaining cards improve hero's hand.
 *
 * For each unseen card, checks if it would give hero a stronger hand
 * than they currently have. Groups outs by improvement type.
 */
import type { AnalysisLens, AnalysisContext, AnalysisResult, ExplanationNode } from "../types/analysis";
import type { VisualDirective, CardHighlight } from "../types/visuals";
import type { CardIndex } from "../types/cards";
import { evaluateHand, compareHandRanks } from "../primitives/handEvaluator";
import { cardToDisplay, createDeck } from "../primitives/card";

export interface OutCard {
  cardIndex: CardIndex;
  currentHandName: string;
  improvedHandName: string;
  improvement: string; // e.g. "Pair → Two Pair"
}

export interface OutsValue {
  outs: OutCard[];
  outsCount: number;
  /** Probability of hitting an out on the next card */
  probability: number;
  /** Grouped by improvement type */
  byImprovement: Record<string, OutCard[]>;
}

export const outsLens: AnalysisLens = {
  id: "outs",
  name: "Outs",
  description: "Cards that improve hero's hand",

  analyze(context: AnalysisContext): AnalysisResult<OutsValue> {
    const { heroCards, communityCards, deadCards } = context;

    if (communityCards.length < 3 || communityCards.length >= 5) {
      return emptyResult(context);
    }

    const allKnown = new Set([...heroCards, ...communityCards, ...deadCards]);
    const remaining = createDeck().filter((c) => !allKnown.has(c));

    // Evaluate current hand
    const currentEval = evaluateHand([...heroCards, ...communityCards]);
    const currentRank = currentEval.rank;

    const outs: OutCard[] = [];

    for (const card of remaining) {
      const newCommunity = [...communityCards, card];
      const newEval = evaluateHand([...heroCards, ...newCommunity]);

      if (compareHandRanks(newEval.rank, currentRank) > 0) {
        outs.push({
          cardIndex: card,
          currentHandName: currentRank.name,
          improvedHandName: newEval.rank.name,
          improvement: `${currentRank.name} → ${newEval.rank.name}`,
        });
      }
    }

    // Group by improvement type
    const byImprovement: Record<string, OutCard[]> = {};
    for (const out of outs) {
      if (!byImprovement[out.improvement]) {
        byImprovement[out.improvement] = [];
      }
      byImprovement[out.improvement].push(out);
    }

    const probability = remaining.length > 0 ? outs.length / remaining.length : 0;

    const value: OutsValue = {
      outs,
      outsCount: outs.length,
      probability,
      byImprovement,
    };

    return {
      value,
      context,
      explanation: buildExplanation(context, value, currentRank.name),
      visuals: buildVisuals(value),
      lensId: "outs",
      dependencies: [],
    };
  },
};

function emptyResult(context: AnalysisContext): AnalysisResult<OutsValue> {
  const msg = context.communityCards.length < 3
    ? "Outs analysis requires community cards (flop or turn)"
    : "All community cards are dealt — no more outs to calculate";
  return {
    value: { outs: [], outsCount: 0, probability: 0, byImprovement: {} },
    context,
    explanation: {
      summary: msg,
      sentiment: "neutral",
      tags: ["outs"],
    },
    visuals: [],
    lensId: "outs",
    dependencies: [],
  };
}

function buildExplanation(
  context: AnalysisContext,
  value: OutsValue,
  currentHandName: string,
): ExplanationNode {
  const { outsCount, probability, byImprovement } = value;
  const pct = (probability * 100).toFixed(1);

  const sentiment = outsCount >= 12 ? "positive"
    : outsCount >= 6 ? "neutral"
    : outsCount > 0 ? "warning"
    : "negative";

  const children: ExplanationNode[] = [];

  // Group breakdown
  for (const [improvement, cards] of Object.entries(byImprovement)) {
    children.push({
      summary: `${cards.length} outs to ${improvement}`,
      detail: `Cards: ${cards.map((c) => cardToDisplay(c.cardIndex)).join(", ")}`,
      sentiment: "positive",
      tags: ["outs-group"],
    });
  }

  // Odds helper
  if (outsCount > 0) {
    const remainingStreets = context.communityCards.length === 3 ? 2 : 1;
    // Rule of 2/4: multiply outs by 2 (one card) or 4 (two cards) for rough %
    const roughPct = outsCount * (remainingStreets === 2 ? 4 : 2);

    children.push({
      summary: `~${roughPct}% chance to improve (rule of ${remainingStreets === 2 ? 4 : 2})`,
      detail: `With ${outsCount} outs and ${remainingStreets} card(s) to come, the rule of ${remainingStreets === 2 ? 4 : 2} gives ~${roughPct}%. Exact probability on next card: ${pct}%.`,
      sentiment: "neutral",
      tags: ["outs-odds"],
    });
  }

  return {
    summary: outsCount > 0
      ? `${outsCount} outs (${pct}% on next card)`
      : `No outs — ${currentHandName} won't improve`,
    detail: `Currently holding ${currentHandName}. ${outsCount} of the remaining cards would improve the hand.`,
    sentiment,
    children: children.length > 0 ? children : undefined,
    tags: ["outs"],
  };
}

function buildVisuals(value: OutsValue): VisualDirective[] {
  const highlights: CardHighlight[] = value.outs.map((o) => ({
    cardIndex: o.cardIndex,
    status: "out" as const,
    reason: o.improvement,
    urgency: 0.7,
  }));

  return [
    {
      type: "outs_display",
      data: {
        highlights,
        outsCount: value.outsCount,
        probability: value.probability,
        byImprovement: Object.fromEntries(
          Object.entries(value.byImprovement).map(([k, v]) => [k, v.length]),
        ),
      },
      priority: 6,
      lensId: "outs",
    },
  ];
}
