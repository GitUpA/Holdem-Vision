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
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66",
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
    "KQo",
    "QJs", "QTs", "Q9s",
    "QJo",
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
    "AA", "KK", "QQ", "JJ", "TT", "99", "88", "77", "66", "55", "44",
    "AKs", "AQs", "AJs", "ATs", "A9s", "A8s", "A7s", "A6s", "A5s", "A4s", "A3s", "A2s",
    "AKo", "AQo", "AJo", "ATo", "A9o", "A8o",
    "KQs", "KJs", "KTs", "K9s", "K8s", "K7s",
    "KQo", "KJo", "KTo",
    "QJs", "QTs", "Q9s", "Q8s",
    "QJo", "QTo",
    "JTs", "J9s", "J8s",
    "JTo",
    "T9s", "T8s", "T7s",
    "T9o",
    "98s", "97s", "96s",
    "98o",
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
    "KQo", "KJo", "KTo", "K9o", "K8o", "K7o", "K6o", "K5o",
    "QJs", "QTs", "Q9s", "Q8s", "Q7s", "Q6s", "Q5s", "Q4s", "Q3s", "Q2s",
    "QJo", "QTo", "Q9o", "Q8o",
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
    "QJo", "QTo", "Q9o",
    "JTs", "J9s", "J8s", "J7s", "J6s",
    "JTo", "J9o",
    "T9s", "T8s", "T7s", "T6s",
    "T9o", "T8o",
    "98s", "97s", "96s", "95s",
    "98o", "97o",
    "87s", "86s", "85s",
    "87o", "86o",
    "76s", "75s", "74s",
    "76o", "75o",
    "65s", "64s", "63s",
    "65o",
    "54s", "53s",
    "54o",
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
  // vs HJ open (~35% defend total: ~25% call, ~10% 3-bet)
  vs_hj: {
    threebet: new Set(["AA", "KK", "QQ", "AKs", "AKo", "A5s", "A4s"]),
    call: new Set([
      "JJ", "TT", "99", "88", "77", "66", "55",
      "AQs", "AJs", "ATs", "A9s", "A8s",
      "AQo", "AJo", "ATo",
      "KQs", "KJs", "KTs", "K9s",
      "KQo",
      "QJs", "QTs", "Q9s",
      "JTs", "J9s",
      "T9s", "T8s", "98s", "87s", "76s", "65s", "54s",
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
      "KQo", "KJo", "KTo", "K9o",
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
    "A5s", "A4s", "A3s",
  ]),
  // From CO vs earlier open
  co: new Set(["AA", "KK", "QQ", "JJ", "AKs", "AQs", "AKo", "A5s", "A4s"]),
  // From SB vs any open
  sb: new Set([
    "AA", "KK", "QQ", "JJ", "TT",
    "AKs", "AQs", "AJs", "ATs", "AKo", "AQo",
    "A5s", "A4s", "A3s", "A2s", "KQs", "KJs",
  ]),
  // From HJ vs earlier open
  hj: new Set(["AA", "KK", "QQ", "JJ", "AKs", "AQs", "AKo", "A5s"]),
  // UTG facing a 3-bet (opened tight, now 4-betting)
  utg: new Set(["AA", "KK", "QQ", "AKs", "AKo"]),
  // BB facing a 3-bet (open + 3-bet happened, BB cold-decides)
  bb: new Set(["AA", "KK", "AKs"]),
};

/** Hands that 3-bet at mixed frequency (sometimes 3-bet, sometimes flat) */
export const GTO_3BET_MIXED: Record<string, Set<string>> = {
  btn: new Set(["KQs", "76s", "65s", "54s"]),
  co: new Set([]),
  sb: new Set(["76s", "65s"]),
  hj: new Set([]),
  utg: new Set([]),
  bb: new Set(["QQ", "AKo"]),
};

export const GTO_COLD_CALL_RANGES: Record<string, Set<string>> = {
  // UTG facing a 3-bet: call with strong non-4bet hands
  utg: new Set([
    "JJ", "TT", "99",
    "AQs", "AJs",
    "AQo",
    "KQs",
  ]),
  // HJ facing a raise
  hj: new Set([
    "TT", "99", "88",
    "AJs", "ATs",
    "AJo",
    "KQs", "KJs",
    "QJs", "JTs", "T9s",
  ]),
  btn: new Set([
    "99", "88", "77", "66", "55",
    "ATs", "A9s", "A8s",
    "AJo", "ATo",
    "KQs", "KJs", "KTs", "K9s",
    "KQo",
    "QJs", "QTs",
    "JTs", "J9s",
    "T9s", "98s", "87s", "76s", "65s", "54s",
  ]),
  co: new Set([
    "TT", "99", "88", "77",
    "AJs", "ATs", "A9s",
    "AJo",
    "KQs", "KJs", "KTs",
    "KQo",
    "QJs", "QTs",
    "JTs",
    "T9s", "98s",
  ]),
  sb: new Set([
    "99", "88", "77",
    "A9s", "A8s",
    "AJo",
    "KTs", "K9s",
    "KQo",
    "QJs", "QTs",
    "JTs", "J9s",
    "T9s", "98s", "87s",
  ]),
  // BB facing a 3-bet: call with strong but not 4-bet hands
  bb: new Set([
    "JJ", "TT", "99",
    "AQs", "AJs", "ATs",
    "AQo",
    "KQs", "KJs",
    "QJs", "JTs",
  ]),
};

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

