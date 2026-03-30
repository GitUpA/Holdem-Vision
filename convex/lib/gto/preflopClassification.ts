/**
 * Preflop Range Classification — the source of truth for preflop decisions.
 *
 * Replaces fake GTO frequency tables with honest range classifications.
 * Preflop is solved: for each hand × position × situation, the answer is
 * "in range" (raise/call) or "out of range" (fold), with borderline hands
 * that depend on opponent reads.
 *
 * The range Sets in preflopRanges.ts ARE the knowledge. This module
 * classifies hands against those ranges and derives engine frequencies.
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { ActionFrequencies } from "./tables/types";
import {
  GTO_RFI_RANGES,
  GTO_BB_DEFENSE,
  GTO_3BET_RANGES,
  GTO_3BET_MIXED,
  GTO_COLD_CALL_RANGES,
  GTO_BVB,
  GTO_4BET,
} from "./tables/preflopRanges";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type PreflopRangeClass =
  | "clear_raise"     // Premium, deep in raise range (AA, KK from any position)
  | "raise"           // Standard range hand (AJs from CO RFI)
  | "mixed_raise"     // Sometimes raise, sometimes call (65s BTN 3-bet mix)
  | "call"            // In call/defense range (KQs BB vs UTG cold-call)
  | "borderline"      // Just outside range boundary — depends on reads
  | "clear_fold";     // Well outside all ranges

export interface PreflopClassification {
  rangeClass: PreflopRangeClass;
  /** Which range set matched */
  matchedRange: string;
  /** Human-readable reason: "AKs is in the CO RFI range" */
  reason: string;
  /** Teaching note for the student */
  teachingNote: string;
  /** Distance from boundary (positive = inside, negative = outside) */
  boundaryDistance: number;
}

// ═══════════════════════════════════════════════════════
// HAND STRENGTH ORDER (169 hand classes ranked by equity)
// ═══════════════════════════════════════════════════════

export const HAND_STRENGTH_ORDER: string[] = [
  "AA", "KK", "QQ", "AKs", "JJ",
  "AQs", "TT", "AKo", "AJs", "KQs",
  "99", "ATs", "AQo",
  "KJs", "88", "QJs", "KTs", "A9s",
  "AJo", "QTs", "KQo", "77", "JTs",
  "A8s", "K9s", "ATo", "A7s", "KJo",
  "Q9s", "66", "A5s", "A6s", "A4s",
  "QJo", "T9s", "J9s", "KTo", "A3s",
  "A2s", "55", "K8s", "98s", "QTo",
  "K7s", "JTo", "87s", "Q8s", "44",
  "K6s", "T8s", "J8s", "97s", "A9o",
  "76s", "K5s", "33", "Q7s", "K4s",
  "Q9o", "J9o", "65s", "86s", "K3s",
  "22", "T9o", "K2s", "54s", "Q6s",
  "A8o", "75s", "96s", "Q5s", "J7s",
  "T7s", "64s", "A7o", "Q4s", "98o",
  "A5o", "53s", "85s", "Q3s", "A6o",
  "J6s", "87o", "Q2s", "43s", "A4o",
  "74s", "T6s", "A3o", "95s", "76o",
  "J5s", "A2o", "J8o", "Q8o", "63s",
  "84s", "T8o", "J4s", "97o", "52s",
  "65o", "T5s", "86o", "J3s", "54o",
  "73s", "K9o", "J2s", "T4s", "96o",
  "42s", "75o", "T3s", "64o",
  "62s", "T2s", "85o", "53o", "32s",
  "93s", "K8o", "43o", "92s", "74o",
  "83s", "95o", "82s", "K7o", "63o",
  "72s", "K6o", "52o", "K5o", "84o",
  "K4o", "42o", "73o", "K3o", "62o",
  "K2o", "Q7o", "32o", "Q6o", "93o",
  "Q5o", "92o", "Q4o", "83o", "Q3o",
  "82o", "Q2o", "72o",
  "J7o", "J6o", "J5o", "J4o", "J3o", "J2o",
  "T7o", "T6o", "T5o", "T4o", "T3o", "T2o",
  "94s", "94o",
];

// Premium hands that never fold from any position
const PREMIUMS = new Set(["AA", "KK", "QQ", "AKs"]);

// ═══════════════════════════════════════════════════════
// CLASSIFICATION
// ═══════════════════════════════════════════════════════

/**
 * Classify a preflop hand for a given situation.
 *
 * This is the single source of truth for preflop decisions.
 * The range Sets define what's in/out. This function tells you which
 * bucket a hand falls into and why.
 */
/** Normalize position names to 6-max standard (utg/hj/co/btn/sb/bb) */
function normalizePosition(pos: string): string {
  const p = pos.toLowerCase();
  // Map non-standard position names to 6-max equivalents
  if (p === "utg1" || p === "utg2" || p === "mp" || p === "mp1" || p === "ep") return "utg";
  if (p === "lj" || p === "lojack") return "hj";
  if (p === "hijack") return "hj";
  if (p === "cutoff") return "co";
  if (p === "button" || p === "dealer") return "btn";
  if (p === "small_blind") return "sb";
  if (p === "big_blind") return "bb";
  return p;
}

export function classifyPreflopHand(
  handClass: string,
  archetypeId: string,
  heroPosition: string,
  openerPosition?: string,
): PreflopClassification {
  const pos = normalizePosition(heroPosition);

  switch (archetypeId) {
    case "rfi_opening":
      return classifyRfi(handClass, pos);
    case "bb_defense_vs_rfi":
      return classifyBbDefense(handClass, openerPosition ? normalizePosition(openerPosition) : "btn");
    case "three_bet_pots":
      return classify3Bet(handClass, pos);
    case "blind_vs_blind":
      return classifyBvB(handClass, pos);
    case "four_bet_five_bet":
      return classify4Bet(handClass, pos);
    default:
      return classifyRfi(handClass, pos);
  }
}

function classifyRfi(handClass: string, position: string): PreflopClassification {
  // BB in unopened pot: already posted blind, can check. Never folds RFI.
  // Premiums raise, everything else checks (free flop).
  if (position === "bb") {
    if (PREMIUMS.has(handClass)) {
      return {
        rangeClass: "clear_raise",
        matchedRange: "rfi",
        reason: `${handClass} in the BB — raise for value even in an unopened pot.`,
        teachingNote: "Premium hand in the big blind. Raise to build the pot.",
        boundaryDistance: 20,
      };
    }
    // Any non-premium in BB unopened = free flop
    const idx = HAND_STRENGTH_ORDER.indexOf(handClass);
    const isPlayable = idx < 30; // top ~30 hands worth raising
    return {
      rangeClass: isPlayable ? "raise" : "call",
      matchedRange: "rfi",
      reason: `${handClass} in the BB — ${isPlayable ? "raise for value" : "check and see a free flop"}.`,
      teachingNote: isPlayable
        ? "You have a strong enough hand to raise from the BB."
        : "You're in the BB with a free option. Check and see the flop.",
      boundaryDistance: isPlayable ? 5 : 0,
    };
  }

  const range = GTO_RFI_RANGES[position];
  if (!range) return makeFold(handClass, position, "rfi");

  if (PREMIUMS.has(handClass)) {
    return {
      rangeClass: "clear_raise",
      matchedRange: "rfi",
      reason: `${handClass} is a premium hand — always raise from any position.`,
      teachingNote: "Premium hands are automatic raises. Build the pot preflop.",
      boundaryDistance: 20,
    };
  }

  if (range.has(handClass)) {
    const dist = boundaryDistance(handClass, range);
    const isDeep = dist >= 5;
    return {
      rangeClass: isDeep ? "raise" : "raise",
      matchedRange: "rfi",
      reason: `${handClass} is in the ${position.toUpperCase()} opening range.`,
      teachingNote: isDeep
        ? `Standard open from ${position.toUpperCase()}. Raise for value and initiative.`
        : `Near the edge of the ${position.toUpperCase()} range. Open, but be prepared to fold to a 3-bet.`,
      boundaryDistance: dist,
    };
  }

  // Not in range — check how far outside
  const dist = boundaryDistance(handClass, range);
  if (dist >= -3) {
    return {
      rangeClass: "borderline",
      matchedRange: "none",
      reason: `${handClass} is just outside the ${position.toUpperCase()} opening range.`,
      teachingNote: `Borderline hand. Against tight blinds or passive players, you can open this. Against aggressive 3-bettors, fold.`,
      boundaryDistance: dist,
    };
  }

  return makeFold(handClass, position, "rfi");
}

function classifyBbDefense(handClass: string, openerPosition: string): PreflopClassification {
  const key = openerPosition === "co" ? "vs_co"
    : openerPosition === "btn" ? "vs_btn"
    : openerPosition === "hj" ? "vs_hj"
    : "vs_utg";
  const defense = GTO_BB_DEFENSE[key];
  if (!defense) return makeFold(handClass, "bb", "bb_defense");

  const opLabel = openerPosition.toUpperCase();

  if (defense.threebet.has(handClass)) {
    return {
      rangeClass: PREMIUMS.has(handClass) ? "clear_raise" : "raise",
      matchedRange: "bb_3bet",
      reason: `${handClass} is in the BB 3-bet range vs ${opLabel}.`,
      teachingNote: `3-bet for value from the BB. You have a strong hand that plays well in a re-raised pot.`,
      boundaryDistance: 10,
    };
  }

  if (defense.call.has(handClass)) {
    return {
      rangeClass: "call",
      matchedRange: "bb_call",
      reason: `${handClass} defends in the BB vs ${opLabel} open — call.`,
      teachingNote: `You're getting a discount from the big blind. This hand has enough playability to see a flop.`,
      boundaryDistance: 5,
    };
  }

  // Check if borderline
  const allDefense = new Set([...defense.threebet, ...defense.call]);
  const dist = boundaryDistance(handClass, allDefense);
  if (dist >= -3) {
    return {
      rangeClass: "borderline",
      matchedRange: "none",
      reason: `${handClass} is just outside the BB defense range vs ${opLabel}.`,
      teachingNote: `Borderline. Defend against loose openers or if you have a read. Fold vs tight early-position opens.`,
      boundaryDistance: dist,
    };
  }

  return {
    rangeClass: "clear_fold",
    matchedRange: "none",
    reason: `${handClass} is too weak to defend in the BB vs ${opLabel}.`,
    teachingNote: `Don't throw good money after bad. This hand doesn't have the equity or playability to continue.`,
    boundaryDistance: dist,
  };
}

function classify3Bet(handClass: string, position: string): PreflopClassification {
  const threebet = GTO_3BET_RANGES[position];
  const mixed = GTO_3BET_MIXED?.[position];
  const coldCall = GTO_COLD_CALL_RANGES?.[position];

  if (threebet?.has(handClass)) {
    return {
      rangeClass: PREMIUMS.has(handClass) ? "clear_raise" : "raise",
      matchedRange: "3bet",
      reason: `${handClass} is in the ${position.toUpperCase()} 3-bet range.`,
      teachingNote: `3-bet for value. You have a hand strong enough to build a big pot preflop.`,
      boundaryDistance: 10,
    };
  }

  if (mixed?.has(handClass)) {
    return {
      rangeClass: "mixed_raise",
      matchedRange: "3bet_mixed",
      reason: `${handClass} is a mixed 3-bet/call hand from ${position.toUpperCase()}.`,
      teachingNote: `This hand plays well both as a 3-bet (for balance/fold equity) and as a call (for implied odds). Mix it up.`,
      boundaryDistance: 5,
    };
  }

  if (coldCall?.has(handClass)) {
    return {
      rangeClass: "call",
      matchedRange: "cold_call",
      reason: `${handClass} cold-calls from ${position.toUpperCase()} — too strong to fold, not strong enough to 3-bet.`,
      teachingNote: `Call in position. This hand has good playability postflop but doesn't want to bloat the pot preflop.`,
      boundaryDistance: 5,
    };
  }

  // Check if borderline
  const allContinue = new Set([
    ...(threebet ?? []),
    ...(mixed ?? []),
    ...(coldCall ?? []),
  ]);
  const dist = allContinue.size > 0 ? boundaryDistance(handClass, allContinue) : -10;

  if (dist >= -3) {
    return {
      rangeClass: "borderline",
      matchedRange: "none",
      reason: `${handClass} is just outside the ${position.toUpperCase()} continue range vs a raise.`,
      teachingNote: `Close spot. If the raiser is loose or you have position, continuing is defensible. Against a tight raiser, fold.`,
      boundaryDistance: dist,
    };
  }

  return {
    rangeClass: "clear_fold",
    matchedRange: "none",
    reason: `${handClass} doesn't make the cut from ${position.toUpperCase()} facing a raise.`,
    teachingNote: `Fold and wait for a better spot. Playing this hand against a raise will cost you money over time.`,
    boundaryDistance: dist,
  };
}

function classifyBvB(handClass: string, position: string): PreflopClassification {
  if (position === "sb") {
    // SB open in BvB — use RFI range (SB opens wider in BvB)
    return classifyRfi(handClass, "sb");
  }
  // BB facing SB open — use BvB defense ranges
  const bb3bet = GTO_BVB?.bb_3bet_vs_sb;
  const bbCall = GTO_BVB?.bb_call_vs_sb;

  if (bb3bet?.has(handClass)) {
    return {
      rangeClass: PREMIUMS.has(handClass) ? "clear_raise" : "raise",
      matchedRange: "bvb_3bet",
      reason: `${handClass} 3-bets in the BB vs SB open.`,
      teachingNote: `SB opens wide in blind battles. Punish them with a 3-bet — you have a strong hand.`,
      boundaryDistance: 10,
    };
  }

  if (bbCall?.has(handClass)) {
    return {
      rangeClass: "call",
      matchedRange: "bvb_call",
      reason: `${handClass} calls in the BB vs SB open.`,
      teachingNote: `You have position postflop and a discount from the big blind. Call and outplay them on later streets.`,
      boundaryDistance: 5,
    };
  }

  const allBvb = new Set([...(bb3bet ?? []), ...(bbCall ?? [])]);
  const dist = allBvb.size > 0 ? boundaryDistance(handClass, allBvb) : -10;
  if (dist >= -3) {
    return {
      rangeClass: "borderline",
      matchedRange: "none",
      reason: `${handClass} is borderline in BB vs SB.`,
      teachingNote: `Close. If the SB opens too wide, defend more. If they're tight, let it go.`,
      boundaryDistance: dist,
    };
  }

  // In BvB, BB might face a SB raise OR a SB completion (limp).
  // When SB completes, BB gets a free check — never fold.
  // Since we can't distinguish here, default to "call" (check) for BB
  // rather than fold. Folding in a BvB limped pot is never correct.
  return {
    rangeClass: "call",
    matchedRange: "none",
    reason: `${handClass} in the BB vs SB — check and see a free flop.`,
    teachingNote: `You're in the big blind. Check and take the free flop — even weak hands have equity.`,
    boundaryDistance: 0,
  };
}

function classify4Bet(handClass: string, position: string): PreflopClassification {
  if (GTO_4BET?.value?.has(handClass)) {
    return {
      rangeClass: "clear_raise",
      matchedRange: "4bet_value",
      reason: `${handClass} is a 4-bet value hand.`,
      teachingNote: `This is one of the strongest hands in poker. 4-bet for value — you want to get as much money in as possible.`,
      boundaryDistance: 20,
    };
  }

  if (GTO_4BET?.bluffs?.has(handClass)) {
    return {
      rangeClass: "raise",
      matchedRange: "4bet_bluff",
      reason: `${handClass} is a 4-bet bluff candidate.`,
      teachingNote: `This hand has good blocker properties. 4-betting as a bluff keeps your range balanced.`,
      boundaryDistance: 5,
    };
  }

  // Premiums that call (QQ, JJ, AQs in some spots)
  if (PREMIUMS.has(handClass) || ["JJ", "QQ", "AQs", "AQo"].includes(handClass)) {
    return {
      rangeClass: "call",
      matchedRange: "4bet_call",
      reason: `${handClass} calls the 3-bet from ${position.toUpperCase()}.`,
      teachingNote: `Strong enough to continue but not strong enough to 4-bet. Calling keeps the pot manageable.`,
      boundaryDistance: 8,
    };
  }

  return {
    rangeClass: "clear_fold",
    matchedRange: "none",
    reason: `${handClass} folds to a 3-bet from ${position.toUpperCase()}.`,
    teachingNote: `Facing a 3-bet, you need a strong hand to continue. This doesn't qualify.`,
    boundaryDistance: -10,
  };
}

// ═══════════════════════════════════════════════════════
// FREQUENCY DERIVATION (for engine sampling)
// ═══════════════════════════════════════════════════════

/**
 * Derive ActionFrequencies from a classification.
 *
 * The engine needs numeric probabilities to sample actions.
 * These are derived from the classification tier, NOT pretended to be solver output.
 */
export function classificationToFrequencies(
  classification: PreflopClassification,
  archetypeId: string,
): ActionFrequencies {
  const raiseAction = (archetypeId === "rfi_opening" || archetypeId === "blind_vs_blind")
    ? "bet_medium" : "raise_large";

  // Base frequencies per tier
  switch (classification.rangeClass) {
    case "clear_raise":
      return { fold: 0.02, call: 0.03, [raiseAction]: 0.95 };
    case "raise":
      return { fold: 0.05, call: 0.05, [raiseAction]: 0.90 };
    case "mixed_raise":
      return { fold: 0.15, call: 0.55, [raiseAction]: 0.30 };
    case "call":
      return { fold: 0.05, call: 0.85, [raiseAction]: 0.10 };
    case "borderline": {
      // Smooth gradient based on boundary distance (-1 = barely out, -3 = clearly out)
      const dist = Math.max(-5, classification.boundaryDistance);
      const continuePct = Math.max(0.10, 0.50 + dist * 0.12);
      return {
        fold: 1 - continuePct,
        call: continuePct * 0.70,
        [raiseAction]: continuePct * 0.30,
      };
    }
    case "clear_fold":
      return { fold: 0.92, call: 0.05, [raiseAction]: 0.03 };
  }
}

// ═══════════════════════════════════════════════════════
// COACHING NARRATIVE
// ═══════════════════════════════════════════════════════

/**
 * Build a coaching confirmation string from a classification.
 * Replaces "GTO recommends fold 88%" with honest range-based language.
 */
export function classificationToCoachingText(classification: PreflopClassification): string {
  switch (classification.rangeClass) {
    case "clear_raise":
      return ` ${classification.reason} Always raise.`;
    case "raise":
      return ` ${classification.reason} Raise is standard here.`;
    case "mixed_raise":
      return ` ${classification.reason} Both raising and calling are valid.`;
    case "call":
      return ` ${classification.reason} Calling is the standard play.`;
    case "borderline":
      return ` ${classification.reason} This is a close spot — adjust based on your opponent.`;
    case "clear_fold":
      return ` ${classification.reason} Fold is standard.`;
  }
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

/** Compute signed distance from range boundary in HAND_STRENGTH_ORDER.
 * Positive = inside range, negative = outside. */
function boundaryDistance(handClass: string, range: Set<string>): number {
  const handIdx = HAND_STRENGTH_ORDER.indexOf(handClass);
  if (handIdx === -1) return -20;

  // Find the last hand in the range by strength order index
  let lastInRange = -1;
  for (let i = HAND_STRENGTH_ORDER.length - 1; i >= 0; i--) {
    if (range.has(HAND_STRENGTH_ORDER[i])) {
      lastInRange = i;
      break;
    }
  }
  if (lastInRange === -1) return -20;

  // Find the CLOSEST range hand to this hand's position
  let closestInRange = lastInRange;
  for (let i = handIdx; i >= 0; i--) {
    if (range.has(HAND_STRENGTH_ORDER[i])) {
      closestInRange = i;
      break;
    }
  }

  if (range.has(handClass)) {
    // Inside range — distance from boundary
    return lastInRange - handIdx;
  }
  // Outside range — negative distance from nearest in-range hand
  return closestInRange - handIdx;
}

function makeFold(handClass: string, position: string, context: string): PreflopClassification {
  return {
    rangeClass: "clear_fold",
    matchedRange: "none",
    reason: `${handClass} is outside the ${position.toUpperCase()} range.`,
    teachingNote: `This hand doesn't have enough equity or playability to play from this position. Wait for a better spot.`,
    boundaryDistance: -10,
  };
}
