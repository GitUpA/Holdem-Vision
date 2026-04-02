/**
 * Shared range utilities used by the situation registry and grid pipeline.
 *
 * Moved from preflopGrid.ts to avoid circular dependencies between
 * the preflop/ module and analysis/ module.
 *
 * Pure TypeScript, zero Convex/React imports.
 */

import { HAND_STRENGTH_ORDER } from "../gto/preflopClassification";

/**
 * Map any table-size position to the nearest 6-max equivalent for range lookup.
 *
 * 7+ player tables have positions (utg1, utg2, mp, mp1) that don't exist in our
 * 6-max range data. This maps them to the closest strategic equivalent.
 */
export function normalize6Max(pos: string): string {
  switch (pos) {
    case "utg1": case "utg2": return "utg";
    case "mp": case "mp1": return "hj";
    default: return pos;
  }
}

/**
 * Compress a range based on stack depth.
 *
 * At 100BB: full range (no compression).
 * At 40BB: remove bottom ~20% of range (speculative hands lose implied odds).
 * At 20BB: remove bottom ~40% (shove/fold territory — only premiums + high cards).
 * Below 15BB: keep only top ~40% of the range.
 *
 * Uses HAND_STRENGTH_ORDER to identify which hands to drop from the bottom.
 */
export function compressRangeByStack(range: Set<string>, stackDepthBB: number): Set<string> {
  if (stackDepthBB >= 80) return range; // deep stack — no compression

  // Compression factor: 0 at 80BB, 1 at 10BB
  const compression = Math.min(1, Math.max(0, (80 - stackDepthBB) / 70));
  // Remove bottom X% of the range by hand strength
  const dropPct = compression * 0.5; // at 10BB, drop bottom 50%

  // Rank each hand in the range by strength order
  const rankedHands = [...range].sort((a, b) => {
    const idxA = HAND_STRENGTH_ORDER.indexOf(a);
    const idxB = HAND_STRENGTH_ORDER.indexOf(b);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  const keepCount = Math.max(1, Math.ceil(rankedHands.length * (1 - dropPct)));
  return new Set(rankedHands.slice(0, keepCount));
}
