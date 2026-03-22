/**
 * Weak Hand Calibration — adjusts frequencies for weak hand categories.
 *
 * The solver table and PokerBench data aggregate across many boards,
 * averaging hands that should fold on some boards and call on others.
 * For weak hands, this averaging produces "call 40%" when the specific
 * board often warrants "fold 70%+". This calibration boosts fold for
 * weak categories to align with board-specific solver behavior.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ActionFrequencies } from "./tables/types";
import { CATEGORY_STRENGTH } from "./categoryStrength";

/** Hand categories where the aggregate data under-folds */
export const WEAK_HAND_CATEGORIES = new Set([
  "air", "weak_draw", "bottom_pair", "overcards", "straight_draw",
]);

/**
 * Calibrate frequencies for weak hand categories.
 *
 * The calibration is proportional to hand weakness and only fires
 * when the raw data says continue (fold < 60%).
 *
 * @param frequencies - raw action frequencies from solver/data
 * @param category - the hand category string (e.g. "air", "bottom_pair")
 * @param street - current street (calibration skipped for preflop)
 */
export function calibrateWeakHandFrequencies(
  frequencies: ActionFrequencies,
  category: string,
  street?: string,
): ActionFrequencies {
  if (street === "preflop") return frequencies;
  if (!WEAK_HAND_CATEGORIES.has(category)) return frequencies;

  const currentFold = frequencies.fold ?? 0;
  // Only calibrate if the data says continue more than fold
  if (currentFold >= 0.6) return frequencies;

  // Calibration strength based on how weak the hand is
  // air (0.05) gets strong boost, overcards (0.25) gets mild boost
  const catStrength = CATEGORY_STRENGTH[category] ?? 0.3;
  const weakness = Math.max(0, 0.35 - catStrength); // 0-0.30 range
  const boostFactor = weakness * 1.2; // 0-0.36 range (moderate)

  if (boostFactor < 0.05) return frequencies;

  // Boost fold, reduce continue actions proportionally
  const result = { ...frequencies };
  const foldBoost = boostFactor * (1 - currentFold); // boost relative to room
  result.fold = Math.min(0.95, currentFold + foldBoost);

  // Reduce other actions proportionally
  const totalOther = 1 - currentFold;
  const newTotalOther = 1 - result.fold;
  if (totalOther > 0.01) {
    const scale = newTotalOther / totalOther;
    for (const key of Object.keys(result) as (keyof ActionFrequencies)[]) {
      if (key !== "fold" && result[key]) {
        result[key] = (result[key] ?? 0) * scale;
      }
    }
  }

  return result;
}
