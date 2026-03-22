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
import { equityBasedRecommendation } from "../../analysis/equityRecommendation";
import { PRESET_PROFILES } from "../../opponents/presets";
import { comboToHandClass, cardsToCombo } from "../../opponents/combos";

// Shared context analysis
import { computeContextFactors, type ContextFactors } from "./contextAnalysis";

// Modifier system
import { identitySituationModifier } from "./modifiedGtoTypes";
import { applyModifier, computeEffectiveModifier } from "./modifierTransform";
import { getModifierMap } from "./modifierProfiles";
import { buildNarrativeExplanation } from "./narrativeEngine";

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

    // ── 6. Build narrative explanation ──
    const effective = computeEffectiveModifier(modifier, factors);

    const narrative = buildNarrativeExplanation({
      profileId: ctx.profile.id,
      profileName: ctx.profile.name,
      situationKey: ctx.situationKey,
      action: { actionType, amount },
      factors,
      baseModifier: modifier,
      effectiveModifier: effective,
      gtoFrequencies: gtoFreqs,
      modifiedFrequencies: modifiedFreqs,
      gtoSource: source,
      arc: ctx.narrativeArc,
    });

    return {
      actionType,
      amount,
      situationKey: ctx.situationKey,
      engineId: "modified-gto",
      explanation: narrative.explanationTree,
      narrative,
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

// ═══════════════════════════════════════════════════════
// WEAK HAND FOLD CALIBRATION
// ═══════════════════════════════════════════════════════

/** Hand categories where the aggregate data under-folds */
const WEAK_CATEGORIES = new Set([
  "air", "weak_draw", "bottom_pair", "overcards", "straight_draw",
]);

/**
 * Calibrate frequencies for weak hand categories.
 *
 * The solver table and PokerBench data aggregate across many boards,
 * averaging hands that should fold on some boards and call on others.
 * For weak hands, this averaging produces "call 40%" when the specific
 * board often warrants "fold 70%+". This calibration boosts fold for
 * weak categories to align with board-specific solver behavior.
 *
 * The calibration is proportional to hand weakness and only fires
 * when the raw data says continue (fold < 60%).
 */
function calibrateWeakHandFrequencies(
  frequencies: ActionFrequencies,
  handCat: HandCategorization | undefined,
  street: string,
): ActionFrequencies {
  if (!handCat || street === "preflop") return frequencies;
  if (!WEAK_CATEGORIES.has(handCat.category)) return frequencies;

  const currentFold = frequencies.fold ?? 0;
  // Only calibrate if the data says continue more than fold
  if (currentFold >= 0.6) return frequencies;

  // Calibration strength based on how weak the hand is
  // air (0.05) gets strong boost, overcards (0.25) gets mild boost
  const catStrength = CATEGORY_STRENGTH_MAP[handCat.category] ?? 0.3;
  const weakness = Math.max(0, 0.35 - catStrength); // 0-0.30 range
  const boostFactor = weakness * 1.2; // 0-0.36 range (moderate)

  if (boostFactor < 0.05) return frequencies;

  // Boost fold, reduce continue actions proportionally
  const result = { ...frequencies };
  const foldBoost = boostFactor * (1 - currentFold); // boost relative to room
  result.fold = Math.min(0.95, currentFold + foldBoost);

  // Reduce other actions proportionally
  const totalOther = 1 - currentFold;
  const newTotalOther = 1 - result.fold;
  if (totalOther > 0.01) {
    const scale = newTotalOther / totalOther;
    for (const key of Object.keys(result) as (keyof ActionFrequencies)[]) {
      if (key !== "fold" && result[key]) {
        result[key] = (result[key] ?? 0) * scale;
      }
    }
  }

  return result;
}

const CATEGORY_STRENGTH_MAP: Record<string, number> = {
  sets_plus: 1.0,
  two_pair: 0.85,
  premium_pair: 0.82,
  overpair: 0.78,
  top_pair_top_kicker: 0.7,
  top_pair_weak_kicker: 0.6,
  middle_pair: 0.45,
  bottom_pair: 0.35,
  combo_draw: 0.5,
  flush_draw: 0.4,
  straight_draw: 0.33,
  overcards: 0.25,
  weak_draw: 0.15,
  air: 0.05,
};

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
          frequencies: calibrateWeakHandFrequencies(lookup.frequencies, handCat, street),
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
      const pbHandCat = categorizeHand(ctx.holeCards, ctx.state.communityCards);
      return {
        frequencies: calibrateWeakHandFrequencies(
          postflopHandClassToActionFrequencies(pbLookup),
          pbHandCat,
          ctx.state.currentStreet,
        ),
        source: "solver",
        archetype: archetype2,
        handCat: pbHandCat,
      };
    }
  }

  // Equity-based fallback: compute from range estimation + pot odds
  if (ctx.holeCards && ctx.holeCards.length >= 2) {
    const opponents = ctx.state.players
      .filter((p) => p.seatIndex !== ctx.seatIndex && (p.status === "active" || p.status === "all_in"))
      .map((p) => ({
        profile: ctx.opponentProfiles?.get(p.seatIndex) ?? PRESET_PROFILES["gto"],
        actions: ctx.state.actionHistory
          .filter((a) => a.seatIndex === p.seatIndex)
          .map((a) => ({ street: a.street as "preflop" | "flop" | "turn" | "river", actionType: a.actionType, amount: a.amount })),
        position: p.position,
        knownCards: p.holeCards.length >= 2 ? p.holeCards : undefined,
      }));

    if (opponents.length > 0) {
      const bigBlind = ctx.state.blinds.big || 1;
      const potBB = ctx.state.pot.total / bigBlind;
      const hero = ctx.state.players[ctx.seatIndex];
      const callCostBB = ctx.legal.canCall
        ? (ctx.state.currentBet - hero.streetCommitted) / bigBlind
        : 0;
      const classCtxEq = contextFromGameState(ctx.state, ctx.seatIndex);

      const eqResult = equityBasedRecommendation(
        ctx.holeCards,
        ctx.state.communityCards,
        opponents,
        potBB,
        callCostBB,
        ctx.state.currentStreet,
        classCtxEq.isInPosition,
        ctx.legal,
      );

      if (eqResult) {
        return {
          frequencies: eqResult.frequencies,
          source: "solver", // treat equity engine as better than heuristic
        };
      }
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
