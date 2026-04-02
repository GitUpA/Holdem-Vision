/**
 * Preflop Situation Registry — single source of truth for all preflop decision points.
 *
 * Every consumer (grid pipeline, decision engine, coaching, drill, audit) imports from
 * here. Adding a new situation = adding one registry entry + range data.
 *
 * Pure TypeScript, zero Convex/React imports.
 */

import type { Position } from "../types/cards";
import type { SituationKey } from "../types/opponents";
import { playersBehind } from "../primitives/position";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

/** Canonical situation IDs — the registry keys. */
export type PreflopSituationId =
  | "rfi"
  | "facing_open"
  | "facing_open_multiway"
  | "facing_3bet"
  | "facing_4bet"
  | "blind_vs_blind"
  | "facing_limpers"
  | "bb_vs_limpers"
  | "bb_vs_sb_complete"
  | "bb_uncontested";

/** Situation context: the ID plus game-state details. */
export interface PreflopSituationContext {
  id: PreflopSituationId;
  heroPosition: Position;
  tableSize: number;
  openerPosition: Position | null;
  numCallers: number;
  numLimpers: number;
  firstLimperPosition: Position | null;
  threeBettorPosition: Position | null;
  raiseCount: number;
  isSqueezeOpportunity: boolean;
}

/** How to resolve a range for a situation. */
export type RangeSource =
  | { type: "none" }
  | { type: "rfi_by_position" }
  | { type: "bb_defense_by_opener" }
  | { type: "cold_call_plus_3bet" }
  | { type: "bvb_defense" }
  | { type: "four_bet" }
  | { type: "four_bet_call_plus_value" }
  | { type: "limper_by_profile" }
  | { type: "iso_raise_by_position" }
  | { type: "bb_raise_vs_limpers" }
  | { type: "sb_complete_range" }
  | { type: "bb_raise_vs_sb_complete" };

/** How to determine numOpponents for equity lookup. */
export type OpponentCountRule =
  | { type: "players_behind" }
  | { type: "opener_plus_callers_plus_behind" }
  | { type: "aggressor_plus_callers" }
  | { type: "fixed"; count: number }
  | { type: "limpers_plus_behind" }
  | { type: "limpers_only" };

/** A registry entry — static data, no behavior. */
export interface PreflopSituationEntry {
  id: PreflopSituationId;
  displayName: string;
  description: string;
  engineKey: SituationKey;
  opponentRangeSource: RangeSource;
  heroRangeSource: RangeSource;
  opponentCountRule: OpponentCountRule;
  heroPostedRule: "none" | "sb" | "bb" | "from_position";
  callMeaning: string;
  raiseMeaning: string;
  keyPrinciple: string;
  sceneTemplate: string;
  drillPriority: number;
  requiresDecision: boolean;
}

// ═══════════════════════════════════════════════════════
// THE REGISTRY
// ═══════════════════════════════════════════════════════

export const PREFLOP_SITUATIONS: Readonly<Record<PreflopSituationId, PreflopSituationEntry>> = {
  rfi: {
    id: "rfi",
    displayName: "Raise First In",
    description: "No one has entered the pot. Open-raise or fold.",
    engineKey: "preflop.open",
    opponentRangeSource: { type: "none" },
    heroRangeSource: { type: "rfi_by_position" },
    opponentCountRule: { type: "players_behind" },
    heroPostedRule: "from_position",
    callMeaning: "limp (sub-optimal)",
    raiseMeaning: "open-raise to establish initiative",
    keyPrinciple: "Raise or fold. Position determines width.",
    sceneTemplate: "No one has entered the pot. You're deciding whether to open.",
    drillPriority: 1,
    requiresDecision: true,
  },
  facing_open: {
    id: "facing_open",
    displayName: "Facing Open Raise",
    description: "A player has raised. 3-bet, call, or fold.",
    engineKey: "preflop.facing_raise",
    opponentRangeSource: { type: "rfi_by_position" },
    heroRangeSource: { type: "cold_call_plus_3bet" },
    opponentCountRule: { type: "opener_plus_callers_plus_behind" },
    heroPostedRule: "from_position",
    callMeaning: "cold-call (flat)",
    raiseMeaning: "3-bet for value or as a bluff",
    keyPrinciple: "Position and range advantage determine action.",
    sceneTemplate: "{openerPosition} opened.",
    drillPriority: 2,
    requiresDecision: true,
  },
  facing_open_multiway: {
    id: "facing_open_multiway",
    displayName: "Facing Raise + Callers",
    description: "A player raised and others called. Overcall, squeeze, or fold.",
    engineKey: "preflop.facing_raise",
    opponentRangeSource: { type: "rfi_by_position" },
    heroRangeSource: { type: "cold_call_plus_3bet" },
    opponentCountRule: { type: "opener_plus_callers_plus_behind" },
    heroPostedRule: "from_position",
    callMeaning: "overcall (flat into multiway pot)",
    raiseMeaning: "squeeze — 3-bet into dead money from callers",
    keyPrinciple: "Tighter ranges multiway. Squeeze with polarized hands when callers fold ~70%.",
    sceneTemplate: "{openerPosition} raised, {numCallers} caller(s). Dead money in the pot.",
    drillPriority: 5,
    requiresDecision: true,
  },
  facing_3bet: {
    id: "facing_3bet",
    displayName: "Facing 3-Bet",
    description: "You opened and got re-raised. 4-bet, call, or fold.",
    engineKey: "preflop.facing_3bet",
    opponentRangeSource: { type: "none" },
    heroRangeSource: { type: "four_bet_call_plus_value" },
    opponentCountRule: { type: "aggressor_plus_callers" },
    heroPostedRule: "none",
    callMeaning: "call the 3-bet in position",
    raiseMeaning: "4-bet for value or as a bluff",
    keyPrinciple: "Ranges narrow fast. Only continue with strong holdings.",
    sceneTemplate: "You opened, {threeBettorPosition} 3-bet.",
    drillPriority: 4,
    requiresDecision: true,
  },
  facing_4bet: {
    id: "facing_4bet",
    displayName: "Facing 4-Bet",
    description: "The pot has been raised 3+ times. Premium decisions only.",
    engineKey: "preflop.facing_4bet",
    opponentRangeSource: { type: "four_bet" },
    heroRangeSource: { type: "four_bet_call_plus_value" },
    opponentCountRule: { type: "aggressor_plus_callers" },
    heroPostedRule: "none",
    callMeaning: "call with a hand too strong to fold but not strong enough to 5-bet",
    raiseMeaning: "5-bet/jam — committing your stack",
    keyPrinciple: "Only AA/KK and select bluffs. Stacks are on the line.",
    sceneTemplate: "4-bet pot. Stacks are on the line.",
    drillPriority: 8,
    requiresDecision: true,
  },
  blind_vs_blind: {
    id: "blind_vs_blind",
    displayName: "Blind vs Blind",
    description: "Folded to the blinds. Wider ranges, unique dynamic.",
    engineKey: "preflop.facing_raise",
    opponentRangeSource: { type: "rfi_by_position" },
    heroRangeSource: { type: "bvb_defense" },
    opponentCountRule: { type: "fixed", count: 1 },
    heroPostedRule: "from_position",
    callMeaning: "defend the blind",
    raiseMeaning: "3-bet or open-raise (SB)",
    keyPrinciple: "Both ranges are wide. Aggression is rewarded.",
    sceneTemplate: "Folded to the blinds.",
    drillPriority: 3,
    requiresDecision: true,
  },
  facing_limpers: {
    id: "facing_limpers",
    displayName: "Facing Limper(s)",
    description: "One or more players limped. Iso-raise, over-limp, or fold.",
    engineKey: "preflop.facing_limpers",
    opponentRangeSource: { type: "limper_by_profile" },
    heroRangeSource: { type: "iso_raise_by_position" },
    opponentCountRule: { type: "limpers_plus_behind" },
    heroPostedRule: "from_position",
    callMeaning: "over-limp (see a cheap flop)",
    raiseMeaning: "iso-raise to isolate the weak limper",
    keyPrinciple: "Limpers have capped ranges. Raise to punish, or see a cheap flop with speculative hands.",
    sceneTemplate: "{numLimpers} limper(s) ahead. Their range is capped — no premiums.",
    drillPriority: 6,
    requiresDecision: true,
  },
  bb_vs_limpers: {
    id: "bb_vs_limpers",
    displayName: "BB vs Limper(s)",
    description: "Limpers came to the BB. Raise for value or check for a free flop.",
    engineKey: "preflop.bb_vs_limpers",
    opponentRangeSource: { type: "limper_by_profile" },
    heroRangeSource: { type: "bb_raise_vs_limpers" },
    opponentCountRule: { type: "limpers_only" },
    heroPostedRule: "bb",
    callMeaning: "check (free flop — never fold)",
    raiseMeaning: "raise for value (you are OOP the whole hand)",
    keyPrinciple: "Free flop is fine. Raise for value, not isolation — you are out of position.",
    sceneTemplate: "{numLimpers} limper(s) to you in the BB. You can check for free or raise.",
    drillPriority: 6,
    requiresDecision: true,
  },
  bb_vs_sb_complete: {
    id: "bb_vs_sb_complete",
    displayName: "BB vs SB Complete",
    description: "SB limped in. Their range is wide and capped — raise aggressively.",
    engineKey: "preflop.sb_complete",
    opponentRangeSource: { type: "sb_complete_range" },
    heroRangeSource: { type: "bb_raise_vs_sb_complete" },
    opponentCountRule: { type: "fixed", count: 1 },
    heroPostedRule: "bb",
    callMeaning: "check (free flop)",
    raiseMeaning: "raise — SB's range is capped, you have range advantage",
    keyPrinciple: "SB completed = weak range. Raise wide for value.",
    sceneTemplate: "SB completed. Their range is wide and capped — no premiums.",
    drillPriority: 7,
    requiresDecision: true,
  },
  bb_uncontested: {
    id: "bb_uncontested",
    displayName: "BB Uncontested",
    description: "Everyone folded to you in the big blind. You win.",
    engineKey: "preflop.open",
    opponentRangeSource: { type: "none" },
    heroRangeSource: { type: "none" },
    opponentCountRule: { type: "fixed", count: 0 },
    heroPostedRule: "bb",
    callMeaning: "n/a",
    raiseMeaning: "n/a",
    keyPrinciple: "Free money. No decision required.",
    sceneTemplate: "Everyone folded. You win the blinds.",
    drillPriority: 99,
    requiresDecision: false,
  },
};

// ═══════════════════════════════════════════════════════
// CLASSIFIER
// ═══════════════════════════════════════════════════════

/** Classify a preflop situation from explicit parameters. */
export function classifySituation(params: {
  heroPosition: Position;
  tableSize?: number;
  openerPosition: Position | null;
  numCallers: number;
  numLimpers: number;
  firstLimperPosition?: Position | null;
  facing3Bet: boolean;
  threeBettorPosition?: Position | null;
  facing4Bet?: boolean;
  isSBComplete?: boolean;
  everyoneElseFolded?: boolean;
}): PreflopSituationContext {
  const {
    heroPosition,
    tableSize = 6,
    openerPosition,
    numCallers,
    numLimpers,
    firstLimperPosition = null,
    facing3Bet,
    threeBettorPosition = null,
    facing4Bet = false,
    isSBComplete = false,
    everyoneElseFolded = false,
  } = params;

  const base = {
    heroPosition,
    tableSize,
    openerPosition,
    numCallers,
    numLimpers,
    firstLimperPosition,
    threeBettorPosition,
    isSqueezeOpportunity: false,
  };

  // Priority 1: Facing 4-bet+
  if (facing4Bet) {
    return { ...base, id: "facing_4bet", raiseCount: 3 };
  }

  // Priority 2: Facing 3-bet
  if (facing3Bet && threeBettorPosition) {
    return { ...base, id: "facing_3bet", raiseCount: 2 };
  }

  // Priority 3: BB uncontested
  if (!openerPosition && numLimpers === 0 && heroPosition === "bb" && everyoneElseFolded) {
    return { ...base, id: "bb_uncontested", raiseCount: 0 };
  }

  // Priority 4: RFI (no opener, no limpers)
  if (!openerPosition && numLimpers === 0) {
    return { ...base, id: "rfi", raiseCount: 0 };
  }

  // Priority 5: BB vs SB complete (must precede bb_vs_limpers)
  if (isSBComplete && heroPosition === "bb" && numLimpers === 1) {
    return { ...base, id: "bb_vs_sb_complete", raiseCount: 0 };
  }

  // Priority 6: BB vs limpers
  if (!openerPosition && numLimpers > 0 && heroPosition === "bb") {
    return { ...base, id: "bb_vs_limpers", raiseCount: 0 };
  }

  // Priority 7: Facing limpers (non-BB)
  if (!openerPosition && numLimpers > 0) {
    return { ...base, id: "facing_limpers", raiseCount: 0 };
  }

  // Priority 8: Blind vs blind
  const blinds: Set<Position> = new Set(["sb", "bb"]);
  if (openerPosition && blinds.has(heroPosition) && blinds.has(openerPosition) && numCallers === 0) {
    return { ...base, id: "blind_vs_blind", raiseCount: 1 };
  }

  // Priority 9: Facing open + callers (multiway / squeeze opportunity)
  if (openerPosition && numCallers > 0) {
    return { ...base, id: "facing_open_multiway", raiseCount: 1, isSqueezeOpportunity: true };
  }

  // Priority 10: Facing single open
  return { ...base, id: "facing_open", raiseCount: 1 };
}

// ═══════════════════════════════════════════════════════
// OPPONENT COUNT RESOLVER
// ═══════════════════════════════════════════════════════

/** Resolve the number of opponents for equity table lookup. */
export function resolveOpponentCount(
  entry: PreflopSituationEntry,
  ctx: PreflopSituationContext,
): number {
  const behind = playersBehind(ctx.heroPosition, ctx.tableSize);
  let count: number;
  switch (entry.opponentCountRule.type) {
    case "players_behind":
      count = behind;
      break;
    case "opener_plus_callers_plus_behind":
      count = 1 + ctx.numCallers + behind;
      break;
    case "aggressor_plus_callers":
      count = 1 + ctx.numCallers;
      break;
    case "fixed":
      count = entry.opponentCountRule.count;
      break;
    case "limpers_plus_behind":
      count = ctx.numLimpers + behind;
      break;
    case "limpers_only":
      count = ctx.numLimpers;
      break;
  }
  return Math.max(1, Math.min(9, count));
}
