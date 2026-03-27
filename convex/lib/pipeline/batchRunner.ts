/**
 * Batch Runner — run N hands headless for statistical validation.
 *
 * Every seat is a player. Hero is just another profile-driven seat.
 * Deterministic: same seed → same results.
 *
 * Used for:
 * - Symmetric validation (GTO vs GTO = ~50/50)
 * - Profile strength ranking (TAG vs GTO, NIT vs GTO)
 * - Full payoff matrix (K×K matchups)
 *
 * Pure TypeScript, zero Convex/React imports.
 */

import type { OpponentProfile } from "../types/opponents";
import { HandStepper, type StepperConfig } from "../analysis/handStepper";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface BatchConfig {
  /** Profile for hero (seat 0) */
  heroProfile: OpponentProfile;
  /** Profile for all villains */
  villainProfile: OpponentProfile;
  /** Number of hands to play */
  hands: number;
  /** Seed for deterministic results */
  seed: number;
  /** Number of players (default 2 for heads-up) */
  numPlayers?: number;
  /** Starting stack in BB (default 100) */
  startingStack?: number;
}

export interface BatchResult {
  heroProfileId: string;
  villainProfileId: string;
  handsPlayed: number;
  /** Net chips won/lost by hero */
  heroChipDelta: number;
  /** Win rate in BB/100 hands */
  bbPer100: number;
  /** Hero's final stack minus starting stack */
  heroWinRate: number;
  /** Hands hero won outright */
  heroWins: number;
  /** Hands hero lost */
  heroLosses: number;
  /** Standard deviation of per-hand results */
  stdDev: number;
  /** Seed used (for reproducibility) */
  seed: number;
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

/**
 * Run a batch of hands with deterministic play.
 * Both hero and villains auto-play using their assigned profiles.
 */
export function runBatch(config: BatchConfig): BatchResult {
  const {
    heroProfile,
    villainProfile,
    hands,
    seed,
    numPlayers = 2,
    startingStack = 100,
  } = config;

  const perHandResults: number[] = [];
  let totalChipDelta = 0;
  let wins = 0;
  let losses = 0;

  for (let i = 0; i < hands; i++) {
    const stepper = new HandStepper({
      numPlayers,
      startingStack,
      heroSeat: 0,
      dealerSeat: i % numPlayers, // rotate dealer each hand
      heroProfile,
      villainProfile,
      seed: seed + i, // unique seed per hand, deterministic
    });

    const result = stepper.playFullHand();
    if (!result.finalState) continue;

    const heroPlayer = result.finalState.players[0];
    const delta = heroPlayer.currentStack - startingStack;
    perHandResults.push(delta);
    totalChipDelta += delta;

    if (delta > 0) wins++;
    else if (delta < 0) losses++;
  }

  // Compute standard deviation
  const mean = perHandResults.length > 0 ? totalChipDelta / perHandResults.length : 0;
  const variance = perHandResults.length > 1
    ? perHandResults.reduce((s, v) => s + (v - mean) ** 2, 0) / (perHandResults.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);

  const bbPer100 = perHandResults.length > 0
    ? (totalChipDelta / perHandResults.length) * 100
    : 0;

  return {
    heroProfileId: heroProfile.id,
    villainProfileId: villainProfile.id,
    handsPlayed: perHandResults.length,
    heroChipDelta: totalChipDelta,
    bbPer100,
    heroWinRate: perHandResults.length > 0 ? wins / perHandResults.length : 0,
    heroWins: wins,
    heroLosses: losses,
    stdDev,
    seed,
  };
}
