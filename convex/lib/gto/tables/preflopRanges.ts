/**
 * Standard GTO Preflop Opening Ranges (RFI — Raise First In).
 *
 * These are well-established 6-max opening ranges used by GTO solvers.
 * Each position has a set of hands that should be raised when folded to.
 * Hands not in the set should be folded.
 *
 * Source: consensus from PioSolver, GTO Wizard, and standard poker theory.
 * These ranges assume 100BB effective stacks, 6-max.
 *
 * Format: each hand is listed as "AKs" (suited) or "AKo" (offsuit) or "AA" (pair).
 * The range represents ~raise percentage for each position:
 *   UTG: ~15%, HJ: ~19%, CO: ~27%, BTN: ~44%, SB: ~40%
 *
 * Pure TypeScript, zero Convex imports.
 */

/** Hands that should be opened (raised) from each position when folded to. */
export const GTO_RFI_RANGES: Record<string, Set<string>> = {
  utg: new Set([
    // ~15% of hands
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77",
    "AKs", "AQs", "AJs", "ATs", "A5s", "A4s",
    "AKo", "AQo", "AJo",
    "KQs", "KJs", "KTs",
    "QJs", "QTs",
    "JTs",
    "T9s",
    "98s",
    "87s",
    "76s",
    "65s",
  ]),

  hj: new Set([
    // ~19% of hands — UTG range + extras
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A5s", "A4s", "A3s",
    "AKo", "AQo", "AJo", "ATo",
    "KQs", "KJs", "KTs", "K9s",
    "QJs", "QTs", "Q9s",
    "JTs", "J9s",
    "T9s", "T8s",
    "98s", "97s",
    "87s", "86s",
    "76s", "75s",
    "65s", "64s",
    "54s",
  ]),

  co: new Set([
    // ~27% of hands — HJ range + extras
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "AKo", "AQo", "AJo", "ATo", "A9o",
    "KQs", "KJs", "KTs", "K9s", "K8s",
    "KQo", "KJo",
    "QJs", "QTs", "Q9s", "Q8s",
    "QJo",
    "JTs", "J9s", "J8s",
    "JTo",
    "T9s", "T8s", "T7s",
    "98s", "97s", "96s",
    "87s", "86s", "85s",
    "76s", "75s", "74s",
    "65s", "64s", "63s",
    "54s", "53s",
    "43s",
  ]),

  btn: new Set([
    // ~44% of hands — CO range + many extras
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o", "A6o", "A5o", "A4o", "A3o", "A2o",
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s", "K3s", "K2s",
    "KQo", "KJo", "KTo", "K9o",
    "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s", "Q4s", "Q3s", "Q2s",
    "QJo", "QTo", "Q9o",
    "JTs", "J9s", "J8s", "J7s", "J6s", "J5s",
    "JTo", "J9o",
    "T9s", "T8s", "T7s", "T6s",
    "T9o", "T8o",
    "98s", "97s", "96s", "95s",
    "98o",
    "87s", "86s", "85s", "84s",
    "87o",
    "76s", "75s", "74s", "73s",
    "76o",
    "65s", "64s", "63s", "62s",
    "65o",
    "54s", "53s", "52s",
    "54o",
    "43s", "42s",
    "32s",
  ]),

  sb: new Set([
    // ~40% of hands — similar to BTN but slightly tighter (OOP)
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44", "33", "22",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "AKo", "AQo", "AJo", "ATo", "A9o", "A8o", "A7o", "A6o", "A5o", "A4o",
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s", "K6s", "K5s", "K4s",
    "KQo", "KJo", "KTo", "K9o",
    "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s",
    "QJo", "QTo",
    "JTs", "J9s", "J8s", "J7s", "J6s",
    "JTo", "J9o",
    "T9s", "T8s", "T7s", "T6s",
    "T9o",
    "98s", "97s", "96s", "95s",
    "98o",
    "87s", "86s", "85s",
    "87o",
    "76s", "75s", "74s",
    "76o",
    "65s", "64s", "63s",
    "54s", "53s",
    "43s",
  ]),
};

/**
 * Check if a hand should be opened (raised) from a given position.
 * Returns true if the hand is in the standard GTO RFI range.
 */
export function isInRfiRange(handClass: string, position: string): boolean {
  const range = GTO_RFI_RANGES[position];
  if (!range) return false;
  return range.has(handClass);
}

/**
 * Get the approximate RFI frequencies for a hand from a position.
 * Hands in range: raise ~85%, fold ~10%, call ~5% (mixed at edges)
 * Hands not in range: fold ~95%, call ~3%, raise ~2% (occasional bluff)
 */
export function getRfiFrequencies(
  handClass: string,
  position: string,
): { fold: number; call: number; raise: number } {
  if (isInRfiRange(handClass, position)) {
    return { fold: 0.05, call: 0.05, raise: 0.90 };
  }
  return { fold: 0.95, call: 0.03, raise: 0.02 };
}

// ═══════════════════════════════════════════════════════
// BB DEFENSE vs RFI
// ═══════════════════════════════════════════════════════

/**
 * BB defense ranges vary by who opened. Tighter vs UTG, wider vs BTN.
 * BB gets a discount (already posted 1BB), so defends wider than other positions.
 *
 * Each set has two parts:
 * - call: hands to flat-call the raise
 * - threebet: hands to 3-bet (value + bluffs)
 */
export const GTO_BB_DEFENSE: Record<string, { call: Set<string>; threebet: Set<string> }> = {
  // vs UTG open (~30% defend total: ~22% call, ~8% 3-bet)
  vs_utg: {
    threebet: new Set([
      "AA", "KK", "QQ", "AKs", "AKo",
      // Bluffs: suited aces with blockers
      "A5s", "A4s",
    ]),
    call: new Set([
      "JJ", "TT", "99", "88", "77", "66", "55",
      "AQs", "AJs", "ATs", "A9s",
      "AQo",
      "KQs", "KJs", "KTs",
      "QJs", "QTs",
      "JTs", "J9s",
      "T9s",
      "98s", "87s", "76s", "65s", "54s",
    ]),
  },
  // vs CO open (~40% defend total: ~30% call, ~10% 3-bet)
  vs_co: {
    threebet: new Set([
      "AA", "KK", "QQ", "JJ", "AKs", "AKo", "AQs",
      "A5s", "A4s", "A3s",
      "KQs",
    ]),
    call: new Set([
      "TT", "99", "88", "77", "66", "55", "44", "33", "22",
      "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
      "AQo", "AJo", "ATo",
      "KJs", "KTs", "K9s", "K8s",
      "KQo", "KJo",
      "QJs", "QTs", "Q9s",
      "QJo",
      "JTs", "J9s", "J8s",
      "T9s", "T8s",
      "98s", "97s",
      "87s", "86s",
      "76s", "75s",
      "65s", "64s",
      "54s", "53s",
      "43s",
    ]),
  },
  // vs BTN open (~50% defend total: ~38% call, ~12% 3-bet)
  vs_btn: {
    threebet: new Set([
      "AA", "KK", "QQ", "JJ", "TT", "AKs", "AKo", "AQs", "AQo", "AJs",
      "A5s", "A4s", "A3s", "A2s",
      "KQs", "KJs",
      "76s", "65s", // suited connector bluffs
    ]),
    call: new Set([
      "99", "88", "77", "66", "55", "44", "33", "22",
      "ATs", "A9s", "A8s", "A7s", "A6s",
      "AJo", "ATo", "A9o",
      "KTs", "K9s", "K8s", "K7s", "K6s", "K5s",
      "KQo", "KJo", "KTo",
      "QJs", "QTs", "Q9s", "Q8s", "Q7s",
      "QJo", "QTo",
      "JTs", "J9s", "J8s", "J7s",
      "JTo", "J9o",
      "T9s", "T8s", "T7s",
      "T9o",
      "98s", "97s", "96s",
      "98o",
      "87s", "86s", "85s",
      "87o",
      "76s", "75s", "74s",
      "65s", "64s", "63s",
      "54s", "53s", "52s",
      "43s", "42s",
      "32s",
    ]),
  },
};

/** Get BB defense frequencies vs a raiser from a given position. */
export function getBbDefenseFrequencies(
  handClass: string,
  raiserPosition: string,
): { fold: number; call: number; raise: number } {
  // Map raiser position to defense range
  let key = "vs_btn"; // default to widest
  if (raiserPosition === "utg" || raiserPosition === "hj") key = "vs_utg";
  else if (raiserPosition === "co") key = "vs_co";

  const range = GTO_BB_DEFENSE[key];
  if (!range) return { fold: 0.80, call: 0.15, raise: 0.05 };

  if (range.threebet.has(handClass)) return { fold: 0.05, call: 0.10, raise: 0.85 };
  if (range.call.has(handClass)) return { fold: 0.05, call: 0.90, raise: 0.05 };
  return { fold: 0.95, call: 0.03, raise: 0.02 };
}

// ═══════════════════════════════════════════════════════
// 3-BET POTS (non-BB positions facing a raise, deciding to 3-bet or fold)
// ═══════════════════════════════════════════════════════

/**
 * 3-bet ranges by position. When facing a single raise, these hands 3-bet.
 * All other hands fold (cold-calling is generally discouraged in GTO, except from BB).
 */
export const GTO_3BET_RANGES: Record<string, Set<string>> = {
  // From BTN vs earlier position open
  btn: new Set([
    "AA", "KK", "QQ", "JJ", "TT",
    "AKs", "AQs", "AJs", "AKo", "AQo",
    // Bluffs
    "A5s", "A4s", "A3s",
    "KQs",
    "76s", "65s", "54s",
  ]),
  // From CO vs earlier open
  co: new Set([
    "AA", "KK", "QQ", "JJ",
    "AKs", "AQs", "AKo",
    "A5s", "A4s",
  ]),
  // From SB vs any open
  sb: new Set([
    "AA", "KK", "QQ", "JJ", "TT",
    "AKs", "AQs", "AJs", "ATs", "AKo", "AQo",
    "A5s", "A4s", "A3s", "A2s",
    "KQs", "KJs",
    "76s", "65s",
  ]),
};

/** Get 3-bet frequencies for a hand facing a raise (non-BB). */
export function get3BetFrequencies(
  handClass: string,
  heroPosition: string,
): { fold: number; call: number; raise: number } {
  const range = GTO_3BET_RANGES[heroPosition] ?? GTO_3BET_RANGES.co;
  if (range.has(handClass)) return { fold: 0.05, call: 0.05, raise: 0.90 };
  // Cold-call range is very narrow in GTO (mostly from BTN/CO with suited hands)
  return { fold: 0.92, call: 0.05, raise: 0.03 };
}

// ═══════════════════════════════════════════════════════
// BLIND vs BLIND
// ═══════════════════════════════════════════════════════

/**
 * When folded to SB, SB opens wide. BB defends very wide.
 * SB opening range is similar to BTN RFI but from OOP.
 * BB defense vs SB is very wide (heads up, already has 1BB invested).
 */
export const GTO_BVB = {
  /** SB open range (~45% — similar to BTN but slightly tighter OOP) */
  sb_open: GTO_RFI_RANGES.sb, // reuse SB RFI range

  /** BB 3-bet vs SB open */
  bb_3bet_vs_sb: new Set([
    "AA", "KK", "QQ", "JJ", "TT", "99",
    "AKs", "AQs", "AJs", "ATs", "AKo", "AQo", "AJo",
    "A5s", "A4s", "A3s", "A2s",
    "KQs", "KJs", "KTs",
    "QJs",
    "76s", "65s", "54s",
  ]),

  /** BB call vs SB open (very wide — ~55% of hands) */
  bb_call_vs_sb: new Set([
    "88", "77", "66", "55", "44", "33", "22",
    "A9s", "A8s", "A7s", "A6s",
    "ATo", "A9o", "A8o", "A7o", "A6o", "A5o", "A4o", "A3o", "A2o",
    "K9s", "K8s", "K7s", "K6s", "K5s", "K4s", "K3s", "K2s",
    "KQo", "KJo", "KTo", "K9o", "K8o",
    "Q9s", "Q8s", "Q7s", "Q6s", "Q5s", "Q4s", "Q3s", "Q2s",
    "QJo", "QTo", "Q9o",
    "J9s", "J8s", "J7s", "J6s", "J5s",
    "JTo", "J9o", "J8o",
    "T9s", "T8s", "T7s", "T6s",
    "T9o", "T8o",
    "98s", "97s", "96s", "95s",
    "98o", "97o",
    "87s", "86s", "85s", "84s",
    "87o", "86o",
    "76s", "75s", "74s", "73s",
    "76o", "75o",
    "65s", "64s", "63s", "62s",
    "65o",
    "54s", "53s", "52s",
    "54o",
    "43s", "42s",
    "32s",
  ]),
};

/** Get BvB frequencies. */
export function getBvbFrequencies(
  handClass: string,
  heroPosition: string,
): { fold: number; call: number; raise: number } {
  if (heroPosition === "sb") {
    // SB opening
    return getRfiFrequencies(handClass, "sb");
  }
  // BB vs SB
  if (GTO_BVB.bb_3bet_vs_sb.has(handClass)) return { fold: 0.05, call: 0.05, raise: 0.90 };
  if (GTO_BVB.bb_call_vs_sb.has(handClass)) return { fold: 0.05, call: 0.90, raise: 0.05 };
  return { fold: 0.90, call: 0.07, raise: 0.03 };
}

// ═══════════════════════════════════════════════════════
// 4-BET / 5-BET
// ═══════════════════════════════════════════════════════

/**
 * Facing a 3-bet (deciding to 4-bet, call, or fold).
 * Very narrow value range + polarized bluffs.
 */
export const GTO_4BET = {
  /** Hands that 4-bet for value */
  value: new Set(["AA", "KK", "QQ", "AKs", "AKo"]),
  /** Hands that call a 3-bet (not 4-betting, not folding) */
  call: new Set([
    "JJ", "TT", "99",
    "AQs", "AJs", "ATs",
    "AQo",
    "KQs",
    "QJs", "JTs",
  ]),
  /** Hands that 4-bet as bluffs (blockers + suited) */
  bluffs: new Set(["A5s", "A4s", "A3s", "A2s"]),
};

/** Facing a 4-bet (deciding to 5-bet, call, or fold). Very narrow. */
export const GTO_5BET = {
  value: new Set(["AA", "KK"]),
  call: new Set(["QQ", "AKs", "AKo"]),
};

/** Get 4-bet/5-bet frequencies. */
export function get4BetFrequencies(
  handClass: string,
  numBets: number,
): { fold: number; call: number; raise: number } {
  if (numBets >= 3) {
    // Facing a 4-bet (deciding to 5-bet)
    if (GTO_5BET.value.has(handClass)) return { fold: 0.02, call: 0.08, raise: 0.90 };
    if (GTO_5BET.call.has(handClass)) return { fold: 0.10, call: 0.85, raise: 0.05 };
    return { fold: 0.95, call: 0.03, raise: 0.02 };
  }
  // Facing a 3-bet (deciding to 4-bet)
  if (GTO_4BET.value.has(handClass)) return { fold: 0.02, call: 0.08, raise: 0.90 };
  if (GTO_4BET.bluffs.has(handClass)) return { fold: 0.15, call: 0.05, raise: 0.80 };
  if (GTO_4BET.call.has(handClass)) return { fold: 0.10, call: 0.85, raise: 0.05 };
  return { fold: 0.92, call: 0.05, raise: 0.03 };
}
