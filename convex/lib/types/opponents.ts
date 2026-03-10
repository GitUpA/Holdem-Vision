/**
 * Opponent modeling types — situation-based profiles, context.
 *
 * Every profile defines behavioral parameters for 11 standard poker situations.
 * The same variables exist for each situation; values differ per profile.
 * Profiles support inheritance via baseProfileId + partial overrides.
 */
import type { ExplanationNode } from "./analysis";
import type { CardIndex, Position } from "./cards";

// ─── Actions & Ranges ───

export interface PlayerAction {
  street: "preflop" | "flop" | "turn" | "river";
  actionType: "fold" | "check" | "call" | "bet" | "raise" | "all_in";
  amount?: number;
}

/** Range as a map of combo strings to weights (0-1) */
export type WeightedRange = Map<string, number>;

// ─── Situation-based Profile System ───

/**
 * Standard poker decision points. Every profile defines parameters for each.
 * Key hierarchy: {street}.{context}
 */
export type SituationKey =
  // Preflop
  | "preflop.open"            // RFI — no prior raise
  | "preflop.facing_raise"    // Facing an open raise
  | "preflop.facing_3bet"     // Facing a 3-bet
  | "preflop.facing_4bet"     // Facing a 4-bet+
  // Postflop as aggressor (preflop raiser or last bettor)
  | "postflop.aggressor.ip"   // In position as aggressor (c-bet spot)
  | "postflop.aggressor.oop"  // Out of position as aggressor
  // Postflop as caller (preflop caller)
  | "postflop.caller.ip"      // In position as caller (probe spot)
  | "postflop.caller.oop"     // Out of position as caller (donk/check spot)
  // Facing aggression postflop
  | "postflop.facing_bet"     // Facing a bet
  | "postflop.facing_raise"   // Facing a raise or check-raise
  | "postflop.facing_allin";  // Facing an all-in

/** All 11 situation keys in canonical order. */
export const ALL_SITUATION_KEYS: SituationKey[] = [
  "preflop.open",
  "preflop.facing_raise",
  "preflop.facing_3bet",
  "preflop.facing_4bet",
  "postflop.aggressor.ip",
  "postflop.aggressor.oop",
  "postflop.caller.ip",
  "postflop.caller.oop",
  "postflop.facing_bet",
  "postflop.facing_raise",
  "postflop.facing_allin",
];

/** Bet/raise sizing preference. */
export interface SizingPreference {
  action: "bet" | "raise";
  sizingPct: number; // % of pot
  weight: number;    // probability of choosing this sizing (0-1)
}

/**
 * Universal behavioral variables for a single situation.
 * Same structure for every situation; values differ per profile.
 */
export interface BehavioralParams {
  /** % of hands that continue (call or raise) in this situation. */
  continuePct: number;
  /** % of continuing hands that raise (vs call). 0 = always calls, 100 = always raises. */
  raisePct: number;
  /** How much position adjusts these numbers. 0 = ignores position, 1 = fully adjusts. */
  positionAwareness: number;
  /** Fraction of bets/raises that are bluffs (0-1). */
  bluffFrequency: number;
  /** Preferred bet/raise sizings. */
  sizings: SizingPreference[];
  /** Teaching text explaining why this profile acts this way in this situation. */
  explanation: string;
}

/**
 * Opponent profile — situation-based behavioral model.
 *
 * Base profiles (presets) define all 11 situations.
 * Derived profiles define only overridden situations and inherit the rest.
 */
export interface OpponentProfile {
  id: string;
  name: string;
  description: string;
  /** Optional base profile ID for inheritance ("based on TAG but more aggressive"). */
  baseProfileId?: string;
  /** Which decision engine drives this profile's actions. Default: "basic". */
  engineId?: string;
  /** Map of situation → behavioral parameters. Partial for derived profiles. */
  situations: Partial<Record<SituationKey, BehavioralParams>>;
}

// ─── Derived Stats ───

/**
 * Display-friendly stats derived from a resolved profile.
 * Read-only — never stored, always computed from the situation map.
 */
export interface DerivedStats {
  vpip: number;
  pfr: number;
  aggression: number;
  threeBetPct: number;
  cBetPct: number;
  foldToCBetPct: number;
  positionAwareness: number;
}

/**
 * Compute display stats from a fully resolved situation map.
 */
export function deriveTendencies(
  resolved: Record<SituationKey, BehavioralParams>,
): DerivedStats {
  const open = resolved["preflop.open"];
  const facingRaise = resolved["preflop.facing_raise"];
  const aggressorIP = resolved["postflop.aggressor.ip"];
  const aggressorOOP = resolved["postflop.aggressor.oop"];
  const facingBet = resolved["postflop.facing_bet"];

  const vpip = open.continuePct;
  const pfr = vpip * (open.raisePct / 100);
  const threeBetPct = facingRaise.continuePct * (facingRaise.raisePct / 100);

  // c-bet = average of IP/OOP aggressor continue * (they bet, not check)
  const cBetIP = aggressorIP.continuePct * ((aggressorIP.raisePct + (100 - aggressorIP.raisePct)) / 100);
  const cBetOOP = aggressorOOP.continuePct * ((aggressorOOP.raisePct + (100 - aggressorOOP.raisePct)) / 100);
  const cBetPct = (cBetIP + cBetOOP) / 2;

  const foldToCBetPct = 100 - facingBet.continuePct;

  // Aggression: ratio of aggressive actions to passive ones
  const aggActions = (aggressorIP.continuePct * aggressorIP.raisePct / 100 +
                      aggressorOOP.continuePct * aggressorOOP.raisePct / 100) / 2;
  const passiveActions = facingBet.continuePct * (100 - facingBet.raisePct) / 100;
  const aggression = passiveActions > 0 ? aggActions / passiveActions : 1;

  return {
    vpip,
    pfr,
    aggression,
    threeBetPct,
    cBetPct,
    foldToCBetPct,
    positionAwareness: open.positionAwareness,
  };
}

// ─── Opponent Context (for analysis pipeline) ───

export interface OpponentContext {
  seatIndex: number;
  label: string;
  position?: Position;
  actions: PlayerAction[];
  impliedRange: WeightedRange;
  rangeDerivation: ExplanationNode;
  profile?: OpponentProfile;
  /** Known hole cards for this opponent (assigned or revealed). Undefined = hidden (use range). */
  knownCards?: CardIndex[];
}
