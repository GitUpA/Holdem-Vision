/**
 * ModifiedGtoEngine — unified engine for all profiles.
 *
 * Every profile starts from GTO solver frequencies (or heuristic fallback)
 * and applies situation-aware modifiers to express their deviations.
 *
 * Pipeline:
 * 1. Get GTO base frequencies (solver lookup or heuristic fallback)
 * 2. Get profile's SituationModifier for current decision point
 * 3. Compute context factors (hand strength, board, draws, odds)
 * 4. Apply modifier to GTO frequencies → modified frequencies
 * 5. Sample action from modified frequencies
 * 6. Build rich explanation tree
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { DecisionEngine, DecisionContext, EngineDecision } from "./types";
import { formatSituation } from "./types";
import type { ExplanationNode } from "../../types/analysis";
import type { ActionType, LegalActions } from "../../state/game-state";
import type { ActionFrequencies, GtoAction } from "../../gto/tables/types";
import { registerEngine } from "./engineRegistry";

// GTO base frequency retrieval
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
  lookupPreflopHandClass,
  handClassToActionFrequencies,
  lookupPostflopHandClass,
  postflopHandClassToActionFrequencies,
} from "../../gto/tables";
import { comboToHandClass, cardsToCombo } from "../../opponents/combos";

// Shared context analysis
import { computeContextFactors, type ContextFactors } from "./contextAnalysis";

// Modifier system
import { identitySituationModifier } from "./modifiedGtoTypes";
import { applyModifier, computeEffectiveModifier } from "./modifierTransform";
import { getModifierMap } from "./modifierProfiles";

// Heuristic fallback
import { paramsToFrequencies } from "../autoPlay";

// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════

/** Minimum archetype confidence to use solver tables. */
const CONFIDENCE_THRESHOLD = 0.6;

// ═══════════════════════════════════════════════════════
// ENGINE
// ═══════════════════════════════════════════════════════

export const modifiedGtoEngine: DecisionEngine = {
  id: "modified-gto",
  name: "Modified GTO Engine",
  description:
    "Unified engine: GTO solver frequencies as base, profile-specific " +
    "modifiers for NIT/FISH/TAG/LAG deviations. All profiles share " +
    "the same engine with different modifier maps.",

  decide(ctx: DecisionContext): EngineDecision {
    const explanationChildren: ExplanationNode[] = [];

    // ── 1. Compute context factors ──
    const factors = computeContextFactors(ctx);

    // ── 2. Get GTO base frequencies ──
    const { frequencies: gtoFreqs, source, archetype, handCat } =
      getGtoBaseFrequencies(ctx, factors);

    // ── 3. Get profile modifier ──
    const modifierMap = getModifierMap(ctx.profile.id);
    const modifier = modifierMap[ctx.situationKey] ?? identitySituationModifier();

    // ── 4. Apply modifier to GTO frequencies ──
    const modifiedFreqs = applyModifier(gtoFreqs, modifier, factors);

    // ── 5. Sample action from modified frequencies ──
    const { actionType, amount } = sampleFromModifiedFrequencies(
      modifiedFreqs,
      ctx.legal,
      ctx.potSize,
      ctx.random,
    );

    // ── 6. Build explanation tree ──
    const effective = computeEffectiveModifier(modifier, factors);
    const isGtoProfile = modifier.base.intensity < 0.001;

    // GTO base frequencies
    const freqChildren: ExplanationNode[] = Object.entries(gtoFreqs)
      .filter(([, v]) => v && v > 0.01)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
      .map(([action, freq]) => ({
        summary: `${action}: ${((freq ?? 0) * 100).toFixed(0)}%`,
        sentiment: "neutral" as const,
        tags: ["frequency"],
      }));

    explanationChildren.push({
      summary: `GTO base frequencies (${source}):`,
      children: freqChildren,
      sentiment: "neutral",
      tags: ["gto-base"],
    });

    // Modifier explanation (skip for GTO profile)
    if (!isGtoProfile) {
      const modFreqChildren: ExplanationNode[] = Object.entries(modifiedFreqs)
        .filter(([, v]) => v && v > 0.01)
        .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
        .map(([action, freq]) => ({
          summary: `${action}: ${((freq ?? 0) * 100).toFixed(0)}%`,
          sentiment: "neutral" as const,
          tags: ["frequency"],
        }));

      explanationChildren.push({
        summary: `${ctx.profile.name} modifier: fold ×${effective.foldScale.toFixed(2)}, aggr ×${effective.aggressionScale.toFixed(2)}`,
        detail: modifier.deviationReason,
        children: modFreqChildren,
        sentiment: "neutral",
        tags: ["modifier", ctx.profile.id],
      });
    }

    // Context factors
    const contextChildren: ExplanationNode[] = [];
    contextChildren.push({
      summary: `Hand: ${factors.handDescription} (${(factors.handStrength * 100).toFixed(0)}%)`,
      sentiment: factors.handStrength >= 0.7 ? "positive" : factors.handStrength <= 0.3 ? "negative" : "neutral",
      tags: ["hand-strength"],
    });

    if (!factors.isPreflop) {
      contextChildren.push({
        summary: `Board wetness: ${(factors.boardWetness * 100).toFixed(0)}%`,
        sentiment: "neutral",
        tags: ["board-texture"],
      });
    }

    if (factors.drawOuts > 0) {
      contextChildren.push({
        summary: `Draws: ${factors.bestDrawType} (${factors.drawOuts} outs)`,
        sentiment: factors.drawOuts >= 8 ? "positive" : "neutral",
        tags: ["draw-aware"],
      });
    }

    if (factors.potOdds > 0) {
      contextChildren.push({
        summary: `Pot odds: ${(factors.potOdds * 100).toFixed(0)}%`,
        sentiment: factors.handStrength > factors.potOdds ? "positive" : "negative",
        tags: ["pot-odds"],
      });
    }

    if (factors.foldEquity > 0) {
      contextChildren.push({
        summary: `Fold equity: ${(factors.foldEquity * 100).toFixed(0)}%`,
        sentiment: factors.foldEquity >= 0.4 ? "positive" : "neutral",
        tags: ["fold-equity"],
      });
    }

    explanationChildren.push({
      summary: `Context: ${factors.handDescription}, ${factors.isInPosition ? "IP" : "OOP"}, SPR ${factors.spr.toFixed(1)}`,
      children: contextChildren,
      sentiment: "neutral",
      tags: ["context"],
    });

    // Decision
    const actionSentiment = actionType === "fold"
      ? "negative"
      : (actionType === "raise" || actionType === "bet")
        ? "positive"
        : "neutral" as const;

    explanationChildren.unshift({
      summary: `Decision: ${actionType}${amount !== undefined ? ` ${amount}` : ""}`,
      sentiment: actionSentiment,
      tags: ["decision"],
    });

    const explanation: ExplanationNode = {
      summary: `${ctx.profile.name} — ${formatSituation(ctx.situationKey)}: ${actionType}${amount !== undefined ? ` ${amount}` : ""} — ${factors.handDescription}`,
      sentiment: actionSentiment,
      children: explanationChildren,
      tags: ["modified-gto"],
    };

    return {
      actionType,
      amount,
      situationKey: ctx.situationKey,
      engineId: "modified-gto",
      explanation,
      reasoning: {
        frequencies: modifiedFreqs,
        gtoBaseFrequencies: gtoFreqs,
        gtoSource: source,
        archetypeId: archetype?.archetypeId,
        archetypeConfidence: archetype?.confidence,
        handCategory: handCat?.category,
        handStrength: factors.handStrength,
        handDescription: factors.handDescription,
        boardWetness: factors.boardWetness,
        potOdds: factors.potOdds,
        foldEquity: factors.foldEquity,
        spr: factors.spr,
        isInPosition: factors.isInPosition,
        profileId: ctx.profile.id,
        modifierIntensity: modifier.base.intensity,
        effectiveFoldScale: effective.foldScale,
        effectiveAggressionScale: effective.aggressionScale,
      },
    };
  },
};

// ═══════════════════════════════════════════════════════
// GTO BASE FREQUENCY RETRIEVAL
// ═══════════════════════════════════════════════════════

interface GtoBaseResult {
  frequencies: ActionFrequencies;
  source: "solver" | "heuristic";
  archetype?: ArchetypeClassification;
  handCat?: HandCategorization;
}

/**
 * Get GTO base frequencies — solver tables when available, heuristic fallback otherwise.
 */
function getGtoBaseFrequencies(
  ctx: DecisionContext,
  _factors: ContextFactors,
): GtoBaseResult {
  if (ctx.holeCards && ctx.holeCards.length >= 2) {
    const classCtx = contextFromGameState(ctx.state, ctx.seatIndex);
    const archetype = classifyArchetype(classCtx);
    const street = ctx.state.currentStreet;

    // Preflop: try per-hand-class lookup first (169 grid from PokerBench)
    if (street === "preflop") {
      const combo = cardsToCombo(ctx.holeCards[0], ctx.holeCards[1]);
      const handClass = comboToHandClass(combo);
      const position = ctx.state.players[ctx.seatIndex].position;
      const openerPos = findPreflopOpener(ctx.state, ctx.seatIndex);
      const hcLookup = lookupPreflopHandClass(archetype.archetypeId, position, handClass, openerPos);

      if (hcLookup) {
        const handCat = categorizeHand(ctx.holeCards, ctx.state.communityCards);
        return {
          frequencies: handClassToActionFrequencies(hcLookup, archetype.archetypeId),
          source: "solver",
          archetype,
          handCat,
        };
      }
    }

    // Postflop (or preflop fallback): try solver table lookup by hand category
    const lookupArchetypeId = archetype.textureArchetypeId ?? archetype.archetypeId;

    if (archetype.confidence >= CONFIDENCE_THRESHOLD && hasTable(lookupArchetypeId, street)) {
      const handCat = categorizeHand(ctx.holeCards, ctx.state.communityCards);
      // Pass hand class for per-hand-class solver lookup (more granular than category)
      const postflopCombo = cardsToCombo(ctx.holeCards[0], ctx.holeCards[1]);
      const postflopHandClass = comboToHandClass(postflopCombo);
      const lookup = lookupFrequencies(
        lookupArchetypeId,
        handCat.category,
        classCtx.isInPosition,
        street,
        postflopHandClass,
      );

      if (lookup) {
        return {
          frequencies: lookup.frequencies,
          source: "solver",
          archetype,
          handCat,
        };
      }
    }
  }

  // PokerBench postflop fallback: per-hand-class from 500k aggregated data
  if (ctx.holeCards && ctx.holeCards.length >= 2 && ctx.state.currentStreet !== "preflop") {
    const combo = cardsToCombo(ctx.holeCards[0], ctx.holeCards[1]);
    const handClass = comboToHandClass(combo);
    const classCtx2 = contextFromGameState(ctx.state, ctx.seatIndex);
    const archetype2 = classifyArchetype(classCtx2);
    const textureId = archetype2.textureArchetypeId ?? archetype2.archetypeId;

    const pbLookup = lookupPostflopHandClass(
      textureId,
      handClass,
      classCtx2.isInPosition,
      ctx.state.currentStreet,
    );
    if (pbLookup) {
      return {
        frequencies: postflopHandClassToActionFrequencies(pbLookup),
        source: "solver",
        archetype: archetype2,
        handCat: categorizeHand(ctx.holeCards, ctx.state.communityCards),
      };
    }
  }

  // Heuristic fallback: use GTO profile's BehavioralParams converted to frequencies
  const gtoFreqs = paramsToFrequencies(ctx.params, ctx.legal);
  return {
    frequencies: gtoFreqs,
    source: "heuristic",
  };
}

/** Find the first preflop raiser's position (the opener) from action history. */
function findPreflopOpener(
  state: import("../../state/game-state").GameState,
  heroSeatIndex: number,
): string | undefined {
  for (const action of state.actionHistory) {
    if (action.street !== "preflop") break;
    if (action.seatIndex === heroSeatIndex) continue;
    if (action.actionType === "raise" || action.actionType === "bet") {
      return action.position;
    }
  }
  return undefined;
}

// ═══════════════════════════════════════════════════════
// ACTION SAMPLING
// ═══════════════════════════════════════════════════════

/**
 * Sample an action from modified frequency distribution,
 * mapping GtoActions to legal game actions with sizing.
 */
function sampleFromModifiedFrequencies(
  frequencies: ActionFrequencies,
  legal: LegalActions,
  potSize: number,
  random: () => number,
): { actionType: ActionType; amount?: number } {
  // Build weighted options
  const options: { actionType: ActionType; amount?: number; weight: number }[] = [];

  for (const [action, freq] of Object.entries(frequencies)) {
    if (!freq || freq < 0.001) continue;

    const mapped = mapGtoActionToLegal(action as GtoAction, legal, potSize);
    if (mapped) {
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

  const last = options[options.length - 1];
  return { actionType: last.actionType, amount: last.amount };
}

/**
 * Map a GtoAction to a legal game action with appropriate sizing.
 */
function mapGtoActionToLegal(
  gtoAction: GtoAction,
  legal: LegalActions,
  potSize: number,
): { actionType: ActionType; amount?: number } | null {
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));

  switch (gtoAction) {
    case "fold":
      if (legal.canFold) return { actionType: "fold" };
      if (legal.canCheck) return { actionType: "check" };
      return null;
    case "check":
      if (legal.canCheck) return { actionType: "check" };
      if (legal.canCall) return { actionType: "call", amount: legal.callAmount };
      return null;
    case "call":
      if (legal.canCall) return { actionType: "call", amount: legal.callAmount };
      if (legal.canCheck) return { actionType: "check" };
      return null;

    case "bet_small": {
      const size = Math.round(potSize * 0.33);
      if (legal.canBet) return { actionType: "bet", amount: clamp(size, legal.betMin, legal.betMax) };
      if (legal.canRaise) return { actionType: "raise", amount: clamp(legal.raiseMin + size, legal.raiseMin, legal.raiseMax) };
      return null;
    }
    case "bet_medium": {
      const size = Math.round(potSize * 0.75);
      if (legal.canBet) return { actionType: "bet", amount: clamp(size, legal.betMin, legal.betMax) };
      if (legal.canRaise) return { actionType: "raise", amount: clamp(legal.raiseMin + size, legal.raiseMin, legal.raiseMax) };
      return null;
    }
    case "bet_large": {
      const size = Math.round(potSize * 1.2);
      if (legal.canBet) return { actionType: "bet", amount: clamp(size, legal.betMin, legal.betMax) };
      if (legal.canRaise) return { actionType: "raise", amount: clamp(legal.raiseMin + size, legal.raiseMin, legal.raiseMax) };
      return null;
    }
    case "raise_small": {
      if (!legal.canRaise) return null;
      return { actionType: "raise", amount: clamp(legal.raiseMin, legal.raiseMin, legal.raiseMax) };
    }
    case "raise_large": {
      if (!legal.canRaise) return null;
      return { actionType: "raise", amount: clamp(Math.round(legal.raiseMin * 1.5), legal.raiseMin, legal.raiseMax) };
    }
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════

registerEngine(modifiedGtoEngine);
