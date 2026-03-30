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
  type FacingBetScenario,
} from "../../gto/tables/facingBetTables";

// GTO base frequency retrieval — shared lookup
import type { ArchetypeClassification } from "../../gto/archetypeClassifier";
import type { HandCategorization } from "../../gto/handCategorizer";
import { lookupGtoFrequencies, findPreflopOpener } from "../../gto/frequencyLookup";
import { PRESET_PROFILES } from "../../opponents/presets";
import type { OpponentInput } from "../../analysis/equityRecommendation";
import { suitValue, rankValue } from "../../primitives/card";
import type { CardIndex } from "../../types/cards";

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
    let modifiedFreqs = applyModifier(gtoFreqs, modifier, factors);

    // ── 4b. Equity reality check ──
    // If the board makes our hand much weaker than the category suggests,
    // shift frequencies toward folding. Catches: pocket pair on flush board
    // without flush card, underpair calling big bets, etc.
    if (ctx.state.currentStreet !== "preflop" && ctx.holeCards && ctx.holeCards.length >= 2) {
      modifiedFreqs = applyEquityRealityCheck(
        modifiedFreqs,
        ctx.holeCards,
        ctx.state.communityCards as CardIndex[],
        handCat,
      );
    }

    // ── 5. Sample action from modified frequencies ──
    const scenario = deriveFacingBetScenario(ctx);
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
        scenario,
      },
    );

    // ── 5b. Premium hand protection ──
    // AA/KK/AKs/QQ should NEVER fold preflop. The solver's small fold frequency
    // is a theoretical artifact that looks wrong to users.
    let finalAction = actionType;
    let finalAmount = amount;
    if (ctx.state.currentStreet === "preflop" && actionType === "fold" && handCat) {
      const cat = handCat.category;
      const strength = handCat.relativeStrength ?? 0;
      if (cat === "premium_pair" || cat === "overpair" || strength >= 0.75) {
        // Override: raise if possible, else call
        if (ctx.legal.canRaise) {
          finalAction = "raise";
          finalAmount = ctx.legal.raiseMin;
        } else if (ctx.legal.canCall) {
          finalAction = "call";
          finalAmount = ctx.legal.callAmount;
        }
      }
    }

    // ── 6. Build narrative explanation ──
    const effective = computeEffectiveModifier(modifier, factors);

    const narrative = buildNarrativeExplanation({
      profileId: ctx.profile.id,
      profileName: ctx.profile.name,
      situationKey: ctx.situationKey,
      action: { actionType: finalAction, amount: finalAmount },
      factors,
      baseModifier: modifier,
      effectiveModifier: effective,
      gtoFrequencies: gtoFreqs,
      modifiedFrequencies: modifiedFreqs,
      gtoSource: source,
      arc: ctx.narrativeArc,
    });

    return {
      actionType: finalAction,
      amount: finalAmount,
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
// EQUITY REALITY CHECK
// ═══════════════════════════════════════════════════════

/**
 * Board-specific equity reality check using pattern heuristics.
 *
 * Solver frequencies are keyed by hand CATEGORY averaged across all boards.
 * This detects when the specific board makes the hand much weaker and
 * shifts frequencies toward folding.
 *
 * NOTE: We tried micro-MC (phe) for actual equity but equity vs RANDOM
 * doesn't capture facing-action danger. Pairs have HIGH equity vs random
 * on flush boards (most randoms miss). The solver already accounts for
 * balanced ranges. Heuristic pattern detection targets the real issue:
 * "flush board + no flush card = opponent who bets likely has the flush."
 * microEquity() remains available for coaching narratives.
 */
function applyEquityRealityCheck(
  freqs: ActionFrequencies,
  holeCards: CardIndex[],
  communityCards: CardIndex[],
  handCat?: HandCategorization,
): ActionFrequencies {
  if (communityCards.length < 3) return freqs;

  const category = handCat?.category ?? "air";
  const strength = handCat?.relativeStrength ?? 0.1;

  // sets_plus covers sets, straights, flushes, full houses, quads.
  // Very strong sets_plus hands (full house+, nut flush) — no penalty.
  if (category === "sets_plus" && strength >= 0.8) return freqs;

  // ── Flush vulnerability ──
  const boardSuits = communityCards.map(suitValue);
  const suitCounts = new Map<number, number>();
  for (const s of boardSuits) suitCounts.set(s, (suitCounts.get(s) ?? 0) + 1);
  const maxSuitCount = Math.max(...suitCounts.values());
  const flushSuit = [...suitCounts.entries()].find(([, c]) => c >= 3)?.[0];

  let penalty = 0;

  if (flushSuit !== undefined && maxSuitCount >= 3) {
    const heroHasFlushCard = holeCards.some(c => suitValue(c) === flushSuit);
    const heroFlushCards = holeCards.filter(c => suitValue(c) === flushSuit).length;

    if (!heroHasFlushCard) {
      // No flush card at all — scale penalty by hand strength
      const strongPair = category === "premium_pair" || category === "overpair"
        || category === "top_pair_top_kicker" || category === "two_pair";
      // sets_plus with moderate strength = trips/sets (not full house/quads)
      const hasTrips = category === "sets_plus" && strength < 0.8;
      // sets_plus with low-moderate strength could be a straight
      const hasStraight = category === "sets_plus" && strength >= 0.4 && strength < 0.6;

      if (maxSuitCount >= 4) {
        // 4-flush board: any single club in opponent's hand makes a flush
        // Even straights and trips are nearly dead (only full house+ survives)
        if (hasTrips) penalty += 0.55;      // trips can improve to full house
        else if (hasStraight) penalty += 0.75; // straight is dead vs flush
        else if (strongPair) penalty += 0.7;   // overpair/TPTK nearly dead
        else penalty += 0.88;                  // weak hands almost always fold
      } else {
        // 3-flush board: flush is possible but not guaranteed
        if (hasTrips) penalty += 0.15;         // trips still strong
        else if (hasStraight) penalty += 0.2;  // straight still strong
        else if (strongPair) penalty += 0.3;   // overpair/TPTK has showdown value
        else penalty += 0.55;                  // weak hands fold more
        if (strength < 0.35) penalty += 0.15;  // extra for very weak hands
      }
    } else if (maxSuitCount >= 4 && heroFlushCards < 2) {
      // 4-flush on board, hero has one card of suit — only nut flush matters
      penalty += 0.25;
    }
  }

  // ── Board trips ──
  const boardRanks = communityCards.map(rankValue);
  const rankCounts = new Map<number, number>();
  for (const r of boardRanks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
  if (Math.max(...rankCounts.values()) >= 3 && category !== "sets_plus") {
    penalty += 0.15;
  }

  // ── Weak pairs on later streets ──
  if ((category === "middle_pair" || category === "bottom_pair" || category === "second_pair") &&
      communityCards.length >= 4) {
    if (boardRanks.filter(r => r >= 10).length >= 3) penalty += 0.2;
  }
  if (category === "bottom_pair" && communityCards.length >= 4) {
    penalty += 0.15;
  }
  // Underpairs on turn+ are very weak — add penalty (subCategory "underpair" under bottom_pair)
  if (category === "bottom_pair" && handCat?.subCategory === "underpair" && communityCards.length >= 4) {
    penalty += 0.25;
  }

  // ── Air aggression dampening ──
  // If hero has air (no pair, no draw) on later streets, reduce aggression
  const isAir = category === "air" || category === "overcards" || category === "weak_draw";
  if (isAir && communityCards.length >= 4) {
    // On turn/river with air, severely limit betting/raising
    penalty += 0.3;
  }

  // ── Street escalation ──
  // Dangers compound: a dangerous board on the flop is MORE dangerous on turn/river
  // because opponents who bet multiple streets are more likely to have it
  if (penalty > 0.1 && communityCards.length >= 4) {
    penalty *= 1.15; // 15% escalation on turn
  }
  if (penalty > 0.1 && communityCards.length >= 5) {
    penalty *= 1.15; // another 15% on river (compounds to ~32%)
  }

  if (penalty <= 0.05) return freqs;
  penalty = Math.min(penalty, 0.92);

  const currentFold = freqs.fold ?? 0;
  const nonFold = 1 - currentFold;
  if (nonFold <= 0.01) return freqs;

  const foldIncrease = nonFold * penalty;
  const scale = (nonFold - foldIncrease) / nonFold;

  const adjusted: ActionFrequencies = { ...freqs };
  for (const key of Object.keys(adjusted) as Array<keyof ActionFrequencies>) {
    const val = adjusted[key];
    if (val === undefined || val === null) continue;
    if (key === "fold") adjusted.fold = Math.min(1, currentFold + foldIncrease);
    else adjusted[key] = val * scale;
  }

  // ── Aggression dampening for air/weak hands ──
  // When hero has air, additionally shift raise → call (not just more folding)
  if (isAir && communityCards.length >= 4) {
    const aggroKeys: (keyof ActionFrequencies)[] = ["raise_small", "raise_large", "bet_medium", "bet_small", "bet_large"];
    const raiseWeight = aggroKeys.reduce((s, k) => s + (adjusted[k] ?? 0), 0);
    if (raiseWeight > 0.15) {
      const dampen = raiseWeight * 0.6;
      for (const key of aggroKeys) {
        if (adjusted[key]) adjusted[key] = adjusted[key]! * 0.4;
      }
      if (adjusted.check !== undefined) adjusted.check += dampen * 0.5;
      if (adjusted.call !== undefined) adjusted.call = (adjusted.call ?? 0) + dampen * 0.5;
      else if (adjusted.check !== undefined) adjusted.check += dampen * 0.5;
    }
  }

  return adjusted;
}

// ═══════════════════════════════════════════════════════
// ACTION SAMPLING
// ═══════════════════════════════════════════════════════

/** Context needed for facing-bet solver lookup */
interface FacingBetContext {
  archetype?: ArchetypeClassification;
  handCat?: HandCategorization;
  isInPosition: boolean;
  scenario?: FacingBetScenario;
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
      fbCtx.scenario,
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
// SCENARIO DETECTION
// ═══════════════════════════════════════════════════════

/**
 * Derive the preflop scenario from game state for facing-bet table lookup.
 *
 * Maps the first preflop raiser's position to a scenario:
 * - UTG, UTG+1, HJ -> "utg_vs_bb" (early position)
 * - CO -> "co_vs_bb"
 * - BTN -> "btn_vs_bb"
 * - SB -> "bvb" (blind vs blind)
 *
 * Returns undefined if no preflop raiser found (shouldn't happen in practice).
 */
function deriveFacingBetScenario(
  ctx: DecisionContext,
): FacingBetScenario | undefined {
  // findPreflopOpener skips the hero seat, which is fine —
  // we want the position of whoever opened the pot preflop.
  const openerPos = findPreflopOpener(ctx.state, ctx.seatIndex);
  if (!openerPos) return undefined;

  const pos = openerPos.toLowerCase();
  switch (pos) {
    case "btn":
      return "btn_vs_bb";
    case "co":
      return "co_vs_bb";
    case "sb":
      return "bvb";
    case "utg":
    case "utg1":
    case "utg+1":
    case "utg2":
    case "utg+2":
    case "hj":
      return "utg_vs_bb";
    default:
      return undefined;
  }
}

// ═══════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════

registerEngine(modifiedGtoEngine);
