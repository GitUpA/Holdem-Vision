/**
 * Profile-driven auto-play — choose an action for a seat based on its profile.
 * Pure TypeScript, zero Convex imports.
 *
 * Flow:
 * 1. classifyCurrentDecision(state, seatIndex) → SituationKey
 * 2. Resolve profile → BehavioralParams for that situation
 * 3. Dispatch to the appropriate DecisionEngine via profile.engineId
 * 4. Engine produces action + rich explanation
 *
 * The main entry point (chooseActionFromProfile) is a thin dispatcher.
 * Actual decision logic lives in engine implementations (engines/).
 */
import type { GameState, LegalActions, ActionType } from "../state/gameState";
import type {
  SituationKey,
  BehavioralParams,
  OpponentProfile,
} from "../types/opponents";
import type { ExplanationNode } from "../types/analysis";
import type { CardIndex } from "../types/cards";
import type { ActionFrequencies, GtoAction } from "../gto/tables/types";
import { rankValue, sameSuit } from "../primitives/card";
import { resolveProfile } from "./profileResolver";
import type { DecisionContext } from "./engines/types";
import { getEngineOrDefault } from "./engines/engineRegistry";
// Ensure engine is registered (side-effect import)
import "./engines/modifiedGtoEngine";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface AutoPlayDecision {
  actionType: ActionType;
  amount?: number;
  situationKey: SituationKey;
  /** Backward-compatible string explanation. */
  explanation: string;
  /** Rich explanation tree from the engine (for coaching/advanced display). */
  explanationNode?: ExplanationNode;
  /** Which engine produced this decision. */
  engineId?: string;
  /** Structured reasoning data from the engine (hand %, pot odds, fold equity, etc.). */
  reasoning?: Record<string, unknown>;
  /** Narrative explanation — character-coherent story about the decision. */
  narrative?: import("./engines/narrativeTypes").RenderedNarrative;
}

// ═══════════════════════════════════════════════════════
// CLASSIFY DECISION POINT
// ═══════════════════════════════════════════════════════

/**
 * Determine which SituationKey applies for the given seat in the current state.
 */
export function classifyCurrentDecision(
  state: GameState,
  seatIndex: number,
): SituationKey {
  const street = state.currentStreet;

  if (street === "preflop") {
    return classifyPreflop(state, seatIndex);
  }
  return classifyPostflop(state, seatIndex);
}

function classifyPreflop(
  state: GameState,
  seatIndex: number,
): SituationKey {
  const preflopActions = state.actionHistory.filter((a) => a.street === "preflop");
  const heroPosition = state.players[seatIndex].position;

  // Find first raise
  const firstRaiseIdx = preflopActions.findIndex(
    (a) => a.actionType === "raise" || (a.actionType === "bet" && a.seatIndex !== -1),
  );

  // Count raises
  const raises = preflopActions.filter(
    (a) => a.actionType === "raise" || a.actionType === "bet" || a.actionType === "all_in",
  );

  if (raises.length >= 3) return "preflop.facing_4bet";
  if (raises.length === 2) return "preflop.facing_3bet";
  if (raises.length === 1) return "preflop.facing_raise";

  // No raises — check for limpers
  const limpers = preflopActions.filter(
    (a) => a.actionType === "call" && (firstRaiseIdx === -1 || preflopActions.indexOf(a) < firstRaiseIdx),
  );

  if (limpers.length > 0) {
    if (heroPosition === "bb") {
      // Check for SB complete
      const isSBComplete = limpers.length === 1 && limpers.some(
        (a) => state.players[a.seatIndex].position === "sb",
      );
      if (isSBComplete) return "preflop.sb_complete";
      return "preflop.bb_vs_limpers";
    }
    return "preflop.facing_limpers";
  }

  return "preflop.open";
}

function classifyPostflop(
  state: GameState,
  seatIndex: number,
): SituationKey {
  const currentStreetActions = state.actionHistory.filter(
    (a) => a.street === state.currentStreet,
  );

  // Determine if facing aggression on this street
  const betsOrRaises = currentStreetActions.filter(
    (a) => a.seatIndex !== seatIndex &&
      (a.actionType === "bet" || a.actionType === "raise" || a.actionType === "all_in"),
  );

  if (betsOrRaises.length > 0) {
    const lastAgg = betsOrRaises[betsOrRaises.length - 1];
    if (lastAgg.actionType === "all_in") {
      return "postflop.facing_allin";
    }
    if (lastAgg.actionType === "raise") {
      return "postflop.facing_raise";
    }
    return "postflop.facing_bet";
  }

  // Not facing aggression — are we the aggressor or caller?
  const wasAggressor = isLastPreflopAggressor(state, seatIndex);
  const inPosition = isInPosition(state, seatIndex);

  if (wasAggressor) {
    return inPosition ? "postflop.aggressor.ip" : "postflop.aggressor.oop";
  }
  return inPosition ? "postflop.caller.ip" : "postflop.caller.oop";
}

/**
 * Was this player the last preflop raiser?
 */
function isLastPreflopAggressor(
  state: GameState,
  seatIndex: number,
): boolean {
  const preflopRaises = state.actionHistory.filter(
    (a) => a.street === "preflop" &&
      (a.actionType === "raise" || a.actionType === "bet"),
  );
  if (preflopRaises.length === 0) return false;
  return preflopRaises[preflopRaises.length - 1].seatIndex === seatIndex;
}

/**
 * Is this player in position relative to active opponents?
 *
 * Postflop action order goes clockwise from SB: SB, BB, UTG, ..., CO, BTN.
 * The BTN (dealer) acts last and is "in position."
 *
 * We convert seat distance from dealer into postflop action order:
 *   distance 0 (dealer/BTN) → acts last (highest order)
 *   distance 1 (SB) → acts first (lowest order)
 *   distance 2 (BB) → acts second, etc.
 */
function isInPosition(
  state: GameState,
  seatIndex: number,
): boolean {
  const activePlayers = state.players.filter(
    (p) => p.status === "active" || p.status === "all_in",
  );
  if (activePlayers.length <= 1) return true;

  const dealer = state.dealerSeatIndex;
  const n = state.numPlayers;

  // Clockwise distance from dealer: BTN=0, SB=1, BB=2, ...
  const distFromDealer = (seat: number) => ((seat - dealer + n) % n);

  // Postflop action order: SB(dist 1)=first, ..., BTN(dist 0)=last.
  // Convert: dist 0 → order N (last), dist k → order k (for k>0).
  const postflopOrder = (seat: number) => {
    const d = distFromDealer(seat);
    return d === 0 ? n : d;
  };

  // IP player = highest postflop order among active players
  let maxOrder = -1;
  let ipSeat = -1;
  for (const p of activePlayers) {
    const order = postflopOrder(p.seatIndex);
    if (order > maxOrder) {
      maxOrder = order;
      ipSeat = p.seatIndex;
    }
  }

  return seatIndex === ipSeat;
}

// ═══════════════════════════════════════════════════════
// HAND STRENGTH — simple preflop hand score (0–1)
// ═══════════════════════════════════════════════════════

/**
 * Quick preflop hand strength score for two hole cards.
 * Returns a value from 0 (worst) to 1 (best).
 *
 * Uses a simplified Chen-like formula:
 * - High card values contribute the most
 * - Pairs get a big bonus
 * - Suited hands get a small bonus
 * - Connectedness (gap ≤ 2) gets a bonus
 *
 * This is NOT used for analysis — only to modulate the auto-play
 * fold/continue decision so strong hands don't randomly fold.
 */
export function preflopHandScore(cards: CardIndex[]): number {
  if (cards.length < 2) return 0.5; // neutral fallback

  const r0 = rankValue(cards[0]); // 0=2, 12=A
  const r1 = rankValue(cards[1]);
  const high = Math.max(r0, r1);
  const low = Math.min(r0, r1);
  const gap = high - low;
  const paired = r0 === r1;
  const suited = sameSuit(cards[0], cards[1]);

  // Base score from high card (A=12 → 1.0, 2=0 → 0.15)
  let score = 0.15 + (high / 12) * 0.55; // 0.15 – 0.70

  // Pair bonus (bigger for higher pairs)
  if (paired) {
    score += 0.15 + (high / 12) * 0.15; // +0.15 to +0.30
  }

  // Second card contribution (high kicker matters)
  score += (low / 12) * 0.15; // 0 – 0.15

  // Suited bonus
  if (suited) score += 0.06;

  // Connectedness bonus (gap 0 = pair already counted, gap 1-2 = connected)
  if (!paired && gap <= 2) score += 0.04;
  if (!paired && gap <= 1) score += 0.03;

  return Math.min(1, Math.max(0, score));
}

// ═══════════════════════════════════════════════════════
// SAMPLE ACTION FROM PROFILE PARAMS
// ═══════════════════════════════════════════════════════

/**
 * Given behavioral parameters and legal actions, sample an action.
 *
 * Flow:
 * 1. Roll against continuePct (adjusted for hand strength) → fold or continue
 * 2. If continuing: roll raisePct → raise/bet or call/check
 * 3. If raising: sample sizing from sizings[] → chip amount
 * 4. Clamp to legal min/max
 */
export function sampleActionFromParams(
  params: BehavioralParams,
  legal: LegalActions,
  potSize: number,
  random: () => number = Math.random,
  holeCards?: CardIndex[],
): { actionType: ActionType; amount?: number; isBluff?: boolean } {
  const effectiveContinue = adjustedContinuePct(params.continuePct, holeCards);
  const roll = random() * 100;

  // Step 1: Fold or continue?
  if (roll >= effectiveContinue) {
    // Hand wants to fold/check. Check for bluff opportunity.
    // bluffFrequency gates how often weak hands raise/bet as a bluff.
    const canBluff = legal.canRaise || legal.canBet;
    if (canBluff && params.bluffFrequency > 0) {
      const bluffRoll = random();
      if (bluffRoll < params.bluffFrequency) {
        // Bluff! Raise or bet with a weak hand.
        if (legal.canRaise) {
          const amount = chooseBetSize(params, potSize, legal.raiseMin, legal.raiseMax, random);
          return { actionType: "raise", amount, isBluff: true };
        }
        if (legal.canBet) {
          const amount = chooseBetSize(params, potSize, legal.betMin, legal.betMax, random);
          return { actionType: "bet", amount, isBluff: true };
        }
      }
    }
    // Not bluffing → fold or check as before
    if (legal.canFold) return { actionType: "fold" };
    if (legal.canCheck) return { actionType: "check" };
    return { actionType: "check" };
  }

  // Step 2: Continuing — raise/bet or call/check?
  const raiseRoll = random() * 100;
  const wantsToRaise = raiseRoll < params.raisePct;

  if (wantsToRaise) {
    // Try to raise or bet
    if (legal.canRaise) {
      const amount = chooseBetSize(params, potSize, legal.raiseMin, legal.raiseMax, random);
      return { actionType: "raise", amount };
    }
    if (legal.canBet) {
      const amount = chooseBetSize(params, potSize, legal.betMin, legal.betMax, random);
      return { actionType: "bet", amount };
    }
    // Can't raise — fall through to passive action
  }

  // Passive: call or check
  if (legal.canCall) return { actionType: "call" };
  if (legal.canCheck) return { actionType: "check" };

  // Fallback: fold (shouldn't normally reach here)
  if (legal.canFold) return { actionType: "fold" };
  return { actionType: "check" };
}

/**
 * Choose a bet/raise size based on profile sizings and legal bounds.
 */
export function chooseBetSize(
  params: BehavioralParams,
  potSize: number,
  min: number,
  max: number,
  random: () => number = Math.random,
): number {
  if (min >= max) return min;

  const sizings = params.sizings.filter((s) => s.weight > 0);

  if (sizings.length === 0) {
    // No sizing preferences — use a default ~66% pot
    const defaultSize = Math.round(potSize * 0.66);
    return clamp(defaultSize, min, max);
  }

  // Weighted random selection from sizings
  const totalWeight = sizings.reduce((sum, s) => sum + s.weight, 0);
  let roll = random() * totalWeight;

  for (const sizing of sizings) {
    roll -= sizing.weight;
    if (roll <= 0) {
      const chipAmount = Math.round(potSize * (sizing.sizingPct / 100));
      return clamp(chipAmount, min, max);
    }
  }

  // Fallback to last sizing
  const last = sizings[sizings.length - 1];
  const chipAmount = Math.round(potSize * (last.sizingPct / 100));
  return clamp(chipAmount, min, max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ═══════════════════════════════════════════════════════
// PARAMS → ACTION FREQUENCIES (unified output format)
// ═══════════════════════════════════════════════════════

/**
 * Convert BehavioralParams into ActionFrequencies — the shared output format
 * used by all engines for UI display and comparison.
 *
 * Maps the profile's 2-level decision tree (continue/fold → raise/call)
 * plus the bluff pathway into flat action frequencies that sum to ~1.
 *
 * Sizings are mapped to GtoAction bet sizes:
 *   ≤50% pot → bet_small, 51-90% → bet_medium, >90% → bet_large
 *
 * @param params - The BehavioralParams (raw or adjusted)
 * @param legal - Legal actions (determines which actions are available)
 * @param handStrength - Optional 0-1 hand strength for per-hand modulation.
 *   If provided, adjustedContinuePct is used instead of raw continuePct.
 */
export function paramsToFrequencies(
  params: BehavioralParams,
  legal: LegalActions,
  handStrength?: number,
): ActionFrequencies {
  // Effective continue rate — optionally modulated by hand strength
  const effectiveContinue = handStrength !== undefined
    ? adjustedContinuePct(params.continuePct, handStrength)
    : params.continuePct;

  const continueProb = Math.min(100, Math.max(0, effectiveContinue)) / 100;
  const foldProb = 1 - continueProb;

  // Within continuing hands: raise vs passive
  const raiseProb = continueProb * (params.raisePct / 100);
  const passiveProb = continueProb * (1 - params.raisePct / 100);

  // Bluffs come from the fold portion
  const bluffProb = foldProb * params.bluffFrequency;
  const pureFoldProb = foldProb * (1 - params.bluffFrequency);

  const freqs: ActionFrequencies = {};

  // ── Fold ──
  if (legal.canFold) {
    freqs.fold = pureFoldProb;
  } else if (!legal.canCheck) {
    // Can't fold or check — redistribute fold probability to call
    // (This shouldn't normally happen)
  }

  // ── Passive: call or check ──
  if (legal.canCall) {
    freqs.call = passiveProb;
  } else if (legal.canCheck) {
    freqs.check = passiveProb;
  }

  // If can check and fold isn't available, redirect fold prob to check
  if (legal.canCheck && !legal.canFold) {
    freqs.check = (freqs.check ?? 0) + pureFoldProb;
  }

  // ── Aggressive: raise/bet (value + bluffs) ──
  const totalAggressive = raiseProb + bluffProb;
  if (totalAggressive > 0) {
    const sizingDistribution = sizingsToGtoActions(params);
    const canAggress = legal.canRaise || legal.canBet;

    if (canAggress) {
      for (const [action, weight] of Object.entries(sizingDistribution)) {
        freqs[action as GtoAction] = (freqs[action as GtoAction] ?? 0) + totalAggressive * weight;
      }
    } else {
      // Can't raise/bet — bluffs become folds, value raises become calls
      if (legal.canCall) {
        freqs.call = (freqs.call ?? 0) + raiseProb;
      }
      if (legal.canFold) {
        freqs.fold = (freqs.fold ?? 0) + bluffProb;
      } else if (legal.canCheck) {
        freqs.check = (freqs.check ?? 0) + bluffProb;
      }
    }
  }

  return freqs;
}

/**
 * Map a profile's SizingPreference[] to GtoAction weights.
 * Aggregates weighted sizings into bet_small / bet_medium / bet_large buckets.
 */
function sizingsToGtoActions(params: BehavioralParams): Partial<Record<GtoAction, number>> {
  const sizings = params.sizings.filter((s) => s.weight > 0);

  if (sizings.length === 0) {
    // Default: 66% pot → bet_medium
    return { bet_medium: 1 };
  }

  const buckets: Partial<Record<GtoAction, number>> = {};
  const totalWeight = sizings.reduce((sum, s) => sum + s.weight, 0);

  for (const sizing of sizings) {
    const action: GtoAction =
      sizing.sizingPct <= 50 ? "bet_small"
        : sizing.sizingPct <= 90 ? "bet_medium"
          : "bet_large";
    buckets[action] = (buckets[action] ?? 0) + sizing.weight / totalWeight;
  }

  return buckets;
}

/**
 * adjustedContinuePct variant that takes a numeric hand strength (0-1)
 * instead of hole cards. Used by paramsToFrequencies when the engine
 * has already computed hand strength.
 */
function adjustedContinuePct(basePct: number, strengthOrCards: number | CardIndex[] | undefined): number {
  if (strengthOrCards === undefined) return basePct;

  let strength: number;
  if (typeof strengthOrCards === "number") {
    strength = strengthOrCards;
  } else {
    if (strengthOrCards.length < 2) return basePct;
    strength = preflopHandScore(strengthOrCards);
  }

  if (basePct >= 100) return 100;
  if (basePct <= 0) return 0;

  const foldPct = 100 - basePct;
  const threshold = foldPct / 100;

  if (strength >= threshold) {
    const depth = threshold < 1 ? (strength - threshold) / (1 - threshold) : 1;
    return basePct + depth * (99 - basePct);
  } else {
    const depth = threshold > 0 ? strength / threshold : 0;
    return depth * basePct * 0.5;
  }
}

// ═══════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════

/**
 * Choose an action for a seat based on its opponent profile and the current game state.
 *
 * This is a thin dispatcher: it builds a DecisionContext, looks up the
 * engine via profile.engineId, and maps the EngineDecision back to
 * the backward-compatible AutoPlayDecision.
 *
 * @param state - Current game state
 * @param seatIndex - The seat making the decision
 * @param profile - The opponent profile for this seat
 * @param legal - Legal actions for this seat
 * @param getBase - Lookup function for base profiles (for inheritance resolution)
 * @param random - Optional PRNG for deterministic tests
 * @param opponentProfiles - Optional map of all table profiles (for fold equity calculation)
 */
/**
 * Build a DecisionContext for a seat — shared setup for both auto-play and coaching.
 *
 * Handles: classification → profile resolution → context assembly.
 * Callers provide optional overrides for holeCards, random, and opponentProfiles.
 */
export function buildDecisionContext(
  state: GameState,
  seatIndex: number,
  profile: OpponentProfile,
  legal: LegalActions,
  opts: {
    getBase?: (id: string) => OpponentProfile | undefined;
    random?: () => number;
    holeCards?: CardIndex[];
    opponentProfiles?: Map<number, OpponentProfile>;
  } = {},
): DecisionContext {
  const getBase = opts.getBase ?? (() => undefined);
  const situationKey = classifyCurrentDecision(state, seatIndex);
  const resolved = resolveProfile(profile, getBase);
  const params = resolved[situationKey];
  const holeCards = opts.holeCards ?? state.players[seatIndex]?.holeCards;

  return {
    state,
    seatIndex,
    profile,
    resolvedParams: resolved,
    situationKey,
    params,
    legal,
    potSize: state.pot.total,
    holeCards,
    getBase,
    random: opts.random ?? Math.random,
    opponentProfiles: opts.opponentProfiles,
  };
}

export function chooseActionFromProfile(
  state: GameState,
  seatIndex: number,
  profile: OpponentProfile,
  legal: LegalActions,
  getBase: (id: string) => OpponentProfile | undefined = () => undefined,
  random: () => number = Math.random,
  opponentProfiles?: Map<number, OpponentProfile>,
): AutoPlayDecision {
  const ctx = buildDecisionContext(state, seatIndex, profile, legal, {
    getBase,
    random,
    opponentProfiles,
  });

  // Dispatch to the appropriate engine
  const engine = getEngineOrDefault(profile.engineId);
  const decision = engine.decide(ctx);

  // Map EngineDecision → AutoPlayDecision (backward compat)
  return {
    actionType: decision.actionType,
    amount: decision.amount,
    situationKey: decision.situationKey,
    explanation: decision.explanation.summary,
    explanationNode: decision.explanation,
    engineId: decision.engineId,
    reasoning: decision.reasoning,
    narrative: decision.narrative,
  };
}
