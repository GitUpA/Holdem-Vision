/**
 * Lookup GTO Engine — decisions from precomputed frequency tables.
 *
 * Instead of heuristic reasoning, this engine:
 * 1. Classifies the spot into one of 20 archetypes
 * 2. Categorizes the hand relative to the board
 * 3. Looks up the frequency table for that archetype + category
 * 4. Samples an action from the GTO frequencies
 * 5. Builds an explanation tree with archetype teaching info
 *
 * Falls back to the heuristic GTO engine when:
 * - No frequency table is registered for the archetype
 * - Classification confidence is below threshold
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { DecisionEngine, DecisionContext, EngineDecision } from "./types";
import type { ExplanationNode } from "../../types/analysis";
import type { ActionType, LegalActions } from "../../state/game-state";
import { registerEngine, getEngine } from "./engineRegistry";
import {
  classifyArchetype,
  contextFromGameState,
  type ArchetypeClassification,
} from "../../gto/archetypeClassifier";
import {
  categorizeHand,
  type HandCategorization,
} from "../../gto/handCategorizer";
import {
  lookupFrequencies,
  hasTable,
  getTable,
  type FrequencyLookup,
  type GtoAction,
  type ActionFrequencies,
} from "../../gto/tables";

// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════

/** Minimum classification confidence to use lookup tables */
const CONFIDENCE_THRESHOLD = 0.6;

/** Fallback engine ID when tables aren't available */
const FALLBACK_ENGINE_ID = "gto";

// ═══════════════════════════════════════════════════════
// ENGINE
// ═══════════════════════════════════════════════════════

export const lookupGtoEngine: DecisionEngine = {
  id: "lookup-gto",
  name: "GTO Lookup Engine",
  description:
    "Decisions from precomputed GTO frequency tables for 20 core archetypes",

  decide(ctx: DecisionContext): EngineDecision {
    // ── 1. Classify archetype ──
    const classCtx = contextFromGameState(ctx.state, ctx.seatIndex);
    const archetype = classifyArchetype(classCtx);

    // ── 2. Check if we have data for this archetype ──
    if (
      archetype.confidence < CONFIDENCE_THRESHOLD ||
      !hasTable(archetype.archetypeId)
    ) {
      return fallbackDecision(ctx, archetype, "no table or low confidence");
    }

    // ── 3. Categorize hand ──
    if (!ctx.holeCards || ctx.holeCards.length < 2) {
      return fallbackDecision(ctx, archetype, "no hole cards");
    }
    const handCat = categorizeHand(ctx.holeCards, ctx.state.communityCards);

    // ── 4. Look up frequencies ──
    const lookup = lookupFrequencies(
      archetype.archetypeId,
      handCat.category,
      classCtx.isInPosition,
    );
    if (!lookup) {
      return fallbackDecision(ctx, archetype, "no frequency data");
    }

    // ── 5. Sample action from frequencies ──
    const { actionType, amount } = sampleFromFrequencies(
      lookup.frequencies,
      ctx.legal,
      ctx.potSize,
      ctx.random,
    );

    // ── 6. Build explanation ──
    const table = getTable(archetype.archetypeId)!;
    const explanation = buildExplanation(
      archetype,
      handCat,
      lookup,
      actionType,
      amount,
      table.keyPrinciple,
      table.commonMistakes,
    );

    return {
      actionType,
      amount,
      situationKey: ctx.situationKey,
      engineId: "lookup-gto",
      explanation,
      reasoning: {
        archetypeId: archetype.archetypeId,
        archetypeConfidence: archetype.confidence,
        handCategory: handCat.category,
        handDescription: handCat.description,
        relativeStrength: handCat.relativeStrength,
        isExactMatch: lookup.isExact,
        frequencies: lookup.frequencies,
        isInPosition: classCtx.isInPosition,
      },
    };
  },
};

// ═══════════════════════════════════════════════════════
// ACTION SAMPLING
// ═══════════════════════════════════════════════════════

/**
 * Sample an action from GTO frequency distribution,
 * mapping table actions to legal game actions.
 */
function sampleFromFrequencies(
  frequencies: ActionFrequencies,
  legal: LegalActions,
  potSize: number,
  random: () => number,
): { actionType: ActionType; amount?: number } {
  // Build weighted options from frequencies mapped to legal actions
  const options: { actionType: ActionType; amount?: number; weight: number }[] = [];

  for (const [gtoAction, freq] of Object.entries(frequencies)) {
    if (!freq || freq < 0.001) continue;

    const mapped = mapGtoActionToLegal(gtoAction as GtoAction, legal, potSize);
    if (mapped) {
      // Check if this action type already exists (merge weights)
      const existing = options.find(
        (o) => o.actionType === mapped.actionType && o.amount === mapped.amount,
      );
      if (existing) {
        existing.weight += freq;
      } else {
        options.push({ ...mapped, weight: freq });
      }
    }
  }

  // If no valid options, fall back to check/fold
  if (options.length === 0) {
    if (legal.canCheck) return { actionType: "check" };
    if (legal.canFold) return { actionType: "fold" };
    return { actionType: "call", amount: legal.callAmount };
  }

  // Weighted random selection
  const totalWeight = options.reduce((sum, o) => sum + o.weight, 0);
  let roll = random() * totalWeight;
  for (const opt of options) {
    roll -= opt.weight;
    if (roll <= 0) {
      return { actionType: opt.actionType, amount: opt.amount };
    }
  }

  // Shouldn't reach here, but return last option
  const last = options[options.length - 1];
  return { actionType: last.actionType, amount: last.amount };
}

/**
 * Map a GTO table action to a legal game action with appropriate sizing.
 */
function mapGtoActionToLegal(
  gtoAction: GtoAction,
  legal: LegalActions,
  potSize: number,
): { actionType: ActionType; amount?: number } | null {
  switch (gtoAction) {
    case "fold":
      return legal.canFold ? { actionType: "fold" } : null;

    case "check":
      return legal.canCheck ? { actionType: "check" } : null;

    case "call":
      return legal.canCall ? { actionType: "call", amount: legal.callAmount } : null;

    case "bet_small": {
      // ~33% pot
      const size = Math.round(potSize * 0.33);
      if (legal.canBet) {
        const amount = clamp(size, legal.betMin, legal.betMax);
        return { actionType: "bet", amount };
      }
      if (legal.canRaise) {
        const amount = clamp(legal.raiseMin + size, legal.raiseMin, legal.raiseMax);
        return { actionType: "raise", amount };
      }
      return null;
    }

    case "bet_medium": {
      // ~75% pot
      const size = Math.round(potSize * 0.75);
      if (legal.canBet) {
        const amount = clamp(size, legal.betMin, legal.betMax);
        return { actionType: "bet", amount };
      }
      if (legal.canRaise) {
        const amount = clamp(legal.raiseMin + size, legal.raiseMin, legal.raiseMax);
        return { actionType: "raise", amount };
      }
      // Preflop: map to standard raise
      if (legal.canRaise) {
        return { actionType: "raise", amount: legal.raiseMin };
      }
      return null;
    }

    case "bet_large": {
      // 100%+ pot (overbet)
      const size = Math.round(potSize * 1.2);
      if (legal.canBet) {
        const amount = clamp(size, legal.betMin, legal.betMax);
        return { actionType: "bet", amount };
      }
      if (legal.canRaise) {
        const amount = clamp(legal.raiseMin + size, legal.raiseMin, legal.raiseMax);
        return { actionType: "raise", amount };
      }
      return null;
    }

    case "raise_small": {
      if (!legal.canRaise) return null;
      // Min-raise or 2.5x
      const amount = clamp(legal.raiseMin, legal.raiseMin, legal.raiseMax);
      return { actionType: "raise", amount };
    }

    case "raise_large": {
      if (!legal.canRaise) return null;
      // ~3x previous bet
      const amount = clamp(
        Math.round(legal.raiseMin * 1.5),
        legal.raiseMin,
        legal.raiseMax,
      );
      return { actionType: "raise", amount };
    }

    default:
      return null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ═══════════════════════════════════════════════════════
// FALLBACK
// ═══════════════════════════════════════════════════════

function fallbackDecision(
  ctx: DecisionContext,
  archetype: ArchetypeClassification,
  reason: string,
): EngineDecision {
  const fallback = getEngine(FALLBACK_ENGINE_ID);
  if (fallback) {
    const result = fallback.decide(ctx);
    // Annotate that this was a fallback
    return {
      ...result,
      engineId: "lookup-gto",
      explanation: {
        summary: result.explanation.summary,
        children: [
          {
            summary: `Fallback to heuristic GTO: ${reason}`,
            detail: `Archetype: ${archetype.archetypeId} (confidence: ${(archetype.confidence * 100).toFixed(0)}%)`,
            sentiment: "neutral",
            tags: ["fallback"],
          },
          ...(result.explanation.children ?? []),
        ],
        sentiment: result.explanation.sentiment,
        tags: ["lookup-gto", "fallback"],
      },
      reasoning: {
        ...result.reasoning,
        lookupFallbackReason: reason,
        archetypeId: archetype.archetypeId,
        archetypeConfidence: archetype.confidence,
      },
    };
  }

  // Ultimate fallback: check or fold
  const actionType = ctx.legal.canCheck ? "check" : "fold";
  return {
    actionType,
    situationKey: ctx.situationKey,
    engineId: "lookup-gto",
    explanation: {
      summary: `${actionType} (no lookup data, no fallback engine)`,
      sentiment: "neutral",
      tags: ["lookup-gto", "fallback"],
    },
  };
}

// ═══════════════════════════════════════════════════════
// EXPLANATION BUILDER
// ═══════════════════════════════════════════════════════

function buildExplanation(
  archetype: ArchetypeClassification,
  handCat: HandCategorization,
  lookup: FrequencyLookup,
  actionType: ActionType,
  amount: number | undefined,
  keyPrinciple: string,
  _commonMistakes: string[],
): ExplanationNode {
  const amountStr = amount !== undefined ? ` ${amount}` : "";

  // Format frequencies for display
  const freqChildren: ExplanationNode[] = Object.entries(lookup.frequencies)
    .filter(([, v]) => v && v > 0.01)
    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
    .map(([action, freq]) => ({
      summary: `${action}: ${((freq ?? 0) * 100).toFixed(0)}%`,
      sentiment: "neutral" as const,
      tags: ["frequency"],
    }));

  const children: ExplanationNode[] = [
    {
      summary: `Hand: ${handCat.description} (${handCat.category})`,
      sentiment: handCat.relativeStrength > 0.6 ? "positive" : handCat.relativeStrength > 0.3 ? "neutral" : "negative",
      tags: ["hand-category"],
    },
    {
      summary: `Archetype: ${archetype.description}`,
      detail: lookup.isExact
        ? `Exact category match`
        : `Closest match (original: ${handCat.category})`,
      sentiment: "neutral",
      tags: ["archetype"],
    },
    {
      summary: `GTO frequencies:`,
      children: freqChildren,
      sentiment: "neutral",
      tags: ["frequencies"],
    },
    {
      summary: `Key principle: ${keyPrinciple}`,
      sentiment: "neutral",
      tags: ["principle"],
    },
  ];

  // Add decision tag
  const actionSentiment = actionType === "fold"
    ? "negative"
    : actionType === "bet" || actionType === "raise"
      ? "positive"
      : "neutral" as const;

  children.unshift({
    summary: `Decision: ${actionType}${amountStr}`,
    sentiment: actionSentiment,
    tags: ["decision"],
  });

  return {
    summary: `${archetype.description} — ${handCat.description}: ${actionType}${amountStr}`,
    sentiment: actionSentiment,
    children,
    tags: ["lookup-gto"],
  };
}

// ═══════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════

registerEngine(lookupGtoEngine);
