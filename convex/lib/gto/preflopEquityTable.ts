/**
 * Preflop Equity Tables — equity of every hand class vs N random opponents.
 *
 * Tables for 1–9 opponents, computed via Monte Carlo (100K trials per hand class)
 * using our own evaluateHand(). Precision: ~0.3% at 100K trials.
 *
 * To regenerate: powershell -File data/solver/computeMultiOpponent.ps1
 * Individual: node data/solver/runEquity.mjs 169 100000 <numOpponents>
 *
 * Pure TypeScript, zero Convex imports.
 */

import eq1 from "../../../data/solver/preflopEquity_1opp.json";
import eq2 from "../../../data/solver/preflopEquity_2opp.json";
import eq3 from "../../../data/solver/preflopEquity_3opp.json";
import eq4 from "../../../data/solver/preflopEquity_4opp.json";
import eq5 from "../../../data/solver/preflopEquity_5opp.json";
import eq6 from "../../../data/solver/preflopEquity_6opp.json";
import eq7 from "../../../data/solver/preflopEquity_7opp.json";
import eq8 from "../../../data/solver/preflopEquity_8opp.json";
import eq9 from "../../../data/solver/preflopEquity_9opp.json";

/** All equity tables indexed by opponent count (1–9). */
const EQUITY_TABLES: Record<number, Record<string, number>> = {
  1: eq1, 2: eq2, 3: eq3, 4: eq4, 5: eq5,
  6: eq6, 7: eq7, 8: eq8, 9: eq9,
};

/** Legacy: heads-up equity table (1 opponent). */
export const PREFLOP_EQUITY: Record<string, number> = eq1;

/**
 * Get preflop equity for a hand class vs N opponents.
 * @param handClass - e.g. "AA", "AKs", "72o"
 * @param numOpponents - 1–9 (clamped). Default 1 (heads up).
 * @returns equity (0–1), or 0.45 if hand class not found.
 */
export function getPreflopEquity(handClass: string, numOpponents: number = 1): number {
  const clamped = Math.max(1, Math.min(9, Math.round(numOpponents)));
  const table = EQUITY_TABLES[clamped];
  return table[handClass] ?? 0.45;
}
