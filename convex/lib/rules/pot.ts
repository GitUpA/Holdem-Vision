/**
 * Pot calculation — main pot, side pots, max winnable.
 * Pure TypeScript, zero Convex imports.
 *
 * Side pot algorithm:
 * 1. Collect totalCommitted from all non-folded players
 * 2. Sort unique commitment thresholds ascending
 * 3. For each threshold, create a pot where each eligible player
 *    contributes min(threshold, their_committed) minus already accounted
 * 4. Eligible = players whose totalCommitted >= threshold AND not folded
 *
 * Folded players' chips go into existing pots but they can't win.
 */
import type { GameState, PotState, SidePot } from "../state/game-state";

interface Contribution {
  seatIndex: number;
  amount: number;
  folded: boolean;
}

/**
 * Calculate pots from raw contribution data.
 * This is the core algorithm, usable without full GameState.
 */
export function calculatePotsFromContributions(
  contributions: Contribution[],
): PotState {
  if (contributions.length === 0) {
    return { mainPot: 0, sidePots: [], total: 0, explanation: "No contributions" };
  }

  // Get unique non-zero commitment levels from non-folded, non-zero players
  const allInThresholds = [
    ...new Set(
      contributions
        .filter((c) => c.amount > 0)
        .map((c) => c.amount),
    ),
  ].sort((a, b) => a - b);

  if (allInThresholds.length === 0) {
    return { mainPot: 0, sidePots: [], total: 0, explanation: "No chips committed" };
  }

  const pots: SidePot[] = [];
  let previousThreshold = 0;

  for (const threshold of allInThresholds) {
    const increment = threshold - previousThreshold;
    if (increment <= 0) continue;

    let potAmount = 0;
    const eligible: number[] = [];

    for (const c of contributions) {
      // Each player contributes min(their amount, threshold) minus what was already accounted
      const playerContrib = Math.min(c.amount, threshold) - Math.min(c.amount, previousThreshold);
      potAmount += playerContrib;

      // Eligible to win if: not folded AND committed at least this threshold
      if (!c.folded && c.amount >= threshold) {
        eligible.push(c.seatIndex);
      }
    }

    if (potAmount > 0) {
      pots.push({
        amount: potAmount,
        eligiblePlayers: eligible,
        explanation:
          eligible.length === contributions.filter((c) => !c.folded).length
            ? "Main pot"
            : `Side pot (${eligible.length} eligible)`,
      });
    }

    previousThreshold = threshold;
  }

  // Label first pot as main, rest as side pots
  if (pots.length > 0) {
    pots[0].explanation = "Main pot";
    for (let i = 1; i < pots.length; i++) {
      pots[i].explanation = `Side pot ${i} (${pots[i].eligiblePlayers.length} eligible)`;
    }
  }

  const total = pots.reduce((sum, p) => sum + p.amount, 0);
  const mainPot = pots[0]?.amount ?? 0;
  const sidePots = pots.slice(1);

  const explanation =
    sidePots.length === 0
      ? `Pot: ${total}`
      : `Main: ${mainPot}, ${sidePots.length} side pot(s), Total: ${total}`;

  return { mainPot, sidePots, total, explanation };
}

/**
 * Calculate pots from current GameState.
 */
export function calculatePots(state: GameState): PotState {
  const contributions: Contribution[] = state.players.map((p) => ({
    seatIndex: p.seatIndex,
    amount: p.totalCommitted,
    folded: p.status === "folded",
  }));

  return calculatePotsFromContributions(contributions);
}

/**
 * Maximum amount a specific player can win.
 * A player can only win from each opponent up to their own totalCommitted.
 */
export function maxWinnable(state: GameState, seatIndex: number): number {
  const player = state.players.find((p) => p.seatIndex === seatIndex);
  if (!player || player.status === "folded") return 0;

  const playerCommitted = player.totalCommitted;
  let total = 0;

  for (const p of state.players) {
    // From each player (including self), can win up to own committed amount
    total += Math.min(p.totalCommitted, playerCommitted);
  }

  return total;
}
