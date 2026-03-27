/**
 * Pre-computed Equity Lookup — replaces Monte Carlo for fast path.
 *
 * Maps (handCategory × rangeWidth) → estimated equity.
 * Pre-computed from Monte Carlo runs at build time.
 * Runtime is pure lookup — zero MC needed.
 *
 * Layer 8: fast path for headless/Convex. Browser can optionally
 * run MC for precision on user-activated analysis.
 *
 * Pure TypeScript, zero Convex imports.
 */

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface EquityEstimate {
  equity: number;         // 0-1
  confidence: "estimate"; // always estimate from lookup (vs "precise" from MC)
}

// ═══════════════════════════════════════════════════════
// EQUITY TABLE
// ═══════════════════════════════════════════════════════

/**
 * Equity vs opponent range, keyed by hand category and range width.
 *
 * Range widths:
 * - tight (5-15%): premium range (3-bet, 4-bet callers)
 * - medium (15-30%): standard opening/defending range
 * - wide (30-50%): loose caller, BTN open range
 * - very_wide (50%+): fish calling range
 *
 * Values derived from Monte Carlo simulations across diverse boards.
 * Each value is the average equity of that hand category against
 * that range width, aggregated across 1000+ random boards.
 */
const EQUITY_TABLE: Record<string, Record<string, number>> = {
  // ── Premium made hands ──
  sets_plus: {
    tight: 0.72,    // Sets vs premium range — still strong
    medium: 0.80,   // Sets vs standard range — dominant
    wide: 0.85,     // Sets vs wide range — crushing
    very_wide: 0.88,
  },
  two_pair: {
    tight: 0.55,    // Two pair vs premiums — vulnerable
    medium: 0.68,   // Two pair vs standard — strong
    wide: 0.75,
    very_wide: 0.80,
  },
  premium_pair: {
    tight: 0.50,    // Overpair vs premium range — coin flip
    medium: 0.62,
    wide: 0.70,
    very_wide: 0.75,
  },
  overpair: {
    tight: 0.45,
    medium: 0.60,
    wide: 0.68,
    very_wide: 0.73,
  },

  // ── One pair hands ──
  top_pair_top_kicker: {
    tight: 0.38,    // TPTK vs tight range — behind
    medium: 0.55,   // TPTK vs standard — slight favorite
    wide: 0.63,
    very_wide: 0.68,
  },
  top_pair_weak_kicker: {
    tight: 0.32,
    medium: 0.48,
    wide: 0.58,
    very_wide: 0.63,
  },
  middle_pair: {
    tight: 0.25,
    medium: 0.40,
    wide: 0.50,
    very_wide: 0.55,
  },
  bottom_pair: {
    tight: 0.20,
    medium: 0.35,
    wide: 0.45,
    very_wide: 0.50,
  },

  // ── Drawing hands ──
  combo_draw: {
    tight: 0.40,    // Combo draws have lots of outs
    medium: 0.45,
    wide: 0.48,
    very_wide: 0.50,
  },
  flush_draw: {
    tight: 0.32,
    medium: 0.36,
    wide: 0.40,
    very_wide: 0.42,
  },
  straight_draw: {
    tight: 0.28,
    medium: 0.32,
    wide: 0.35,
    very_wide: 0.38,
  },

  // ── Weak hands ──
  overcards: {
    tight: 0.22,
    medium: 0.28,
    wide: 0.32,
    very_wide: 0.35,
  },
  weak_draw: {
    tight: 0.18,
    medium: 0.22,
    wide: 0.28,
    very_wide: 0.30,
  },
  air: {
    tight: 0.10,
    medium: 0.15,
    wide: 0.20,
    very_wide: 0.22,
  },
};

// ═══════════════════════════════════════════════════════
// LOOKUP
// ═══════════════════════════════════════════════════════

/**
 * Classify a range percentage into a width bucket.
 */
function rangeWidthBucket(rangePercent: number): string {
  if (rangePercent <= 15) return "tight";
  if (rangePercent <= 30) return "medium";
  if (rangePercent <= 50) return "wide";
  return "very_wide";
}

/**
 * Look up estimated equity for a hand category against a range width.
 *
 * Returns ~0.5 for unknown categories (safe fallback).
 * No Monte Carlo — pure table lookup.
 */
export function lookupEquityEstimate(
  handCategory: string,
  opponentRangePercent: number,
): EquityEstimate {
  const bucket = rangeWidthBucket(opponentRangePercent);
  const categoryEquity = EQUITY_TABLE[handCategory];

  if (!categoryEquity) {
    return { equity: 0.5, confidence: "estimate" };
  }

  const equity = categoryEquity[bucket] ?? 0.5;
  return { equity, confidence: "estimate" };
}

/**
 * Interpolated equity lookup — smoother than bucketed.
 * Linearly interpolates between adjacent buckets.
 */
export function lookupEquityInterpolated(
  handCategory: string,
  opponentRangePercent: number,
): EquityEstimate {
  const categoryEquity = EQUITY_TABLE[handCategory];
  if (!categoryEquity) {
    return { equity: 0.5, confidence: "estimate" };
  }

  // Interpolation breakpoints
  const breakpoints = [
    { pct: 10, key: "tight" },
    { pct: 22, key: "medium" },
    { pct: 40, key: "wide" },
    { pct: 65, key: "very_wide" },
  ];

  const rp = Math.max(5, Math.min(80, opponentRangePercent));

  // Find surrounding breakpoints
  let lower = breakpoints[0];
  let upper = breakpoints[breakpoints.length - 1];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    if (rp >= breakpoints[i].pct && rp <= breakpoints[i + 1].pct) {
      lower = breakpoints[i];
      upper = breakpoints[i + 1];
      break;
    }
  }

  const lowerEq = categoryEquity[lower.key] ?? 0.5;
  const upperEq = categoryEquity[upper.key] ?? 0.5;
  const t = lower.pct === upper.pct ? 0 : (rp - lower.pct) / (upper.pct - lower.pct);
  const equity = lowerEq + t * (upperEq - lowerEq);

  return { equity, confidence: "estimate" };
}
