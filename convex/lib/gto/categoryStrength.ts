/**
 * Category Strength — canonical strength ordering for hand categories.
 *
 * Used by hand categorization, engine decision-making, and benchmarking.
 * Single source of truth for how strong each HandCategory is (0-1 scale).
 *
 * Pure TypeScript, zero Convex imports.
 */

export const CATEGORY_STRENGTH: Record<string, number> = {
  sets_plus: 1.0,
  two_pair: 0.85,
  premium_pair: 0.82,
  overpair: 0.78,
  top_pair_top_kicker: 0.7,
  top_pair_weak_kicker: 0.6,
  middle_pair: 0.45,
  bottom_pair: 0.35,
  combo_draw: 0.5,
  flush_draw: 0.4,
  straight_draw: 0.33,
  overcards: 0.25,
  weak_draw: 0.15,
  air: 0.05,
};
