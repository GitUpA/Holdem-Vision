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
import type { ActionType, LegalActions } from "../../state/gameState";
import type { ActionFrequencies, GtoAction } from "../../gto/tables/types";
import { registerEngine } from "./engineRegistry";
import { CATEGORY_STRENGTH } from "../../gto/categoryStrength";
import { categorizeHand } from "../../gto/handCategorizer";

// Facing-bet solver data
import {
  lookupFacingBetFrequencies,
  facingBetToActionFrequencies,
} from "../../gto/tables/facingBetTables";

// GTO base frequency retrieval — shared lookup
import type { ArchetypeClassification } from "../../gto/archetypeClassifier";
import type { HandCategorization } from "../../gto/handCategorizer";
import { lookupGtoFrequencies } from "../../gto/frequencyLookup";
import { PRESET_PROFILES } from "../../opponents/presets";
import type { OpponentInput } from "../../analysis/equityRecommendation";

// Shared context analysis
import { computeContextFactors, type ContextFactors } from "./contextAnalysis";

// Modifier system
import { identitySituationModifier } from "./modifiedGtoTypes";
import { applyModifier, computeEffectiveModifier } from "./modifierTransform";
import { getModifierMap } from "./modifierProfiles";
import { buildNarrativeExplanation } from "./narrativeEngine";

// Heuristic fallback
import { paramsToFrequencies } from "../autoPlay";

// Shared calibration
import { calibrateWeakHandFrequencies } from "../../gto/weakHandCalibration";

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
      factors.handStrength,
      {
        archetype,
        handCat,
        isInPosition: factors.isInPosition,
      },
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

// WEAK_CATEGORIES, calibrateWeakHandFrequencies, CATEGORY_STRENGTH imported from shared modules

/**
 * Get GTO base frequencies — shared solver lookup, then heuristic fallback.
 */
function getGtoBaseFrequencies(
  ctx: DecisionContext,
  _factors: ContextFactors,
): GtoBaseResult {
  if (ctx.holeCards && ctx.holeCards.length >= 2) {
    // Build opponent inputs for equity-based fallback
    const opponents: OpponentInput[] = ctx.state.players
      .filter((p) => p.seatIndex !== ctx.seatIndex && (p.status === "active" || p.status === "all_in"))
      .map((p) => ({
        profile: ctx.opponentProfiles?.get(p.seatIndex) ?? PRESET_PROFILES["gto"],
        actions: ctx.state.actionHistory
          .filter((a) => a.seatIndex === p.seatIndex)
          .map((a) => ({ street: a.street as "preflop" | "flop" | "turn" | "river", actionType: a.actionType, amount: a.amount })),
        position: p.position,
        knownCards: p.holeCards.length >= 2 ? p.holeCards : undefined,
      }));

    const result = lookupGtoFrequencies(
      ctx.holeCards,
      ctx.state.communityCards,
      ctx.state,
      ctx.seatIndex,
      ctx.legal,
      { opponents: opponents.length > 0 ? opponents : undefined },
    );

    if (result) {
      // Apply calibration for solver-category and postflop-handclass sources
      // (the engine path historically calibrated weak hands; coaching did not)
      let frequencies = result.frequencies;
      if (result.source === "category" || result.source === "postflop-handclass") {
        frequencies = calibrateWeakHandFrequencies(
          frequencies,
          result.handCat.category,
          ctx.state.currentStreet,
        );
      }

      return {
        frequencies,
        source: "solver",
        archetype: result.archetype,
        handCat: result.handCat,
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

// ═══════════════════════════════════════════════════════
// ACTION SAMPLING
// ═══════════════════════════════════════════════════════

/** Context needed for facing-bet solver lookup */
interface FacingBetContext {
  archetype?: ArchetypeClassification;
  handCat?: HandCategorization;
  isInPosition: boolean;
}

/**
 * Sample an action from modified frequency distribution,
 * mapping GtoActions to legal game actions with sizing.
 *
 * When facing a bet (canCheck=false, canCall=true) and the frequencies
 * contain "check" weight, replaces that weight with solver-derived
 * facing-bet frequencies (fold/call/raise) for the specific archetype
 * and hand category. Falls back to the old hand-strength threshold
 * if no facing-bet data exists.
 */
function sampleFromModifiedFrequencies(
  frequencies: ActionFrequencies,
  legal: LegalActions,
  potSize: number,
  random: () => number,
  handStrength?: number,
  fbCtx?: FacingBetContext,
): { actionType: ActionType; amount?: number } {
  // ── Facing-bet replacement: swap "check" weight for solver fold/call/raise ──
  // The solver "first to act" tables use "check" for passive actions.
  // When we're facing a bet, we need to redistribute that "check" weight
  // into fold/call/raise using the facing-bet solver data.
  let effectiveFreqs = frequencies;
  const isFacingBet = !legal.canCheck && legal.canCall;
  const checkWeight = frequencies.check ?? 0;

  if (isFacingBet && checkWeight > 0.001 && fbCtx?.archetype && fbCtx?.handCat) {
    const textureId = fbCtx.archetype.textureArchetypeId ?? fbCtx.archetype.archetypeId;
    const fbLookup = lookupFacingBetFrequencies(
      textureId,
      fbCtx.handCat.category,
      fbCtx.isInPosition,
    );

    if (fbLookup) {
      // Replace "check" with solver-derived facing-bet frequencies,
      // scaled by the original check weight so the total stays normalized.
      const fbFreqs = facingBetToActionFrequencies(fbLookup);
      effectiveFreqs = { ...frequencies };
      delete effectiveFreqs.check;

      for (const [action, prob] of Object.entries(fbFreqs)) {
        if (!prob) continue;
        const key = action as GtoAction;
        effectiveFreqs[key] = (effectiveFreqs[key] ?? 0) + checkWeight * prob;
      }
    }
    // If no facing-bet data, fall through to mapGtoActionToLegal's
    // hand-strength threshold fallback (existing behavior).
  }

  // Build weighted options
  const options: { actionType: ActionType; amount?: number; weight: number }[] = [];

  for (const [action, freq] of Object.entries(effectiveFreqs)) {
    if (!freq || freq < 0.001) continue;

    const mapped = mapGtoActionToLegal(action as GtoAction, legal, potSize, handStrength);
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
  handStrength?: number,
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
      // Facing a bet: use hand strength with balanced threshold.
      // 0.25 = overcards and better call, weak draws and air fold.
      if (handStrength !== undefined && handStrength >= 0.25) {
        if (legal.canCall) return { actionType: "call", amount: legal.callAmount };
      } else {
        if (legal.canFold) return { actionType: "fold" };
      }
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
