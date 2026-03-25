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
