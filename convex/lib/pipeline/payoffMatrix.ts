/**
 * Payoff Matrix — statistical validation of profile interactions.
 *
 * Runs the full K×K matchup matrix and computes:
 * - Win rates for each profile pair
 * - Counter-strategy indicators
 * - Behavioral confidence model (N observations → confidence)
 *
 * Layer 9 of first-principles.md.
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { OpponentProfile } from "../types/opponents";
import { runBatch, type BatchResult } from "./batchRunner";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface MatchupEntry {
  heroProfileId: string;
  villainProfileId: string;
  result: BatchResult;
}

export interface PayoffMatrix {
  /** Profile IDs in order */
  profileIds: string[];
  /** K×K results (profileIds[i] as hero vs profileIds[j] as villain) */
  results: MatchupEntry[];
  /** Timestamp */
  generatedAt: number;
  /** Hands per matchup */
  handsPerMatchup: number;
  /** Base seed */
  seed: number;
}

export interface ProfileRanking {
  profileId: string;
  avgBbPer100: number;
  winsAgainst: string[];
  losesTo: string[];
}

// ═══════════════════════════════════════════════════════
// MATRIX GENERATION
// ═══════════════════════════════════════════════════════

/**
 * Generate the full K×K payoff matrix.
 *
 * For K profiles, runs K×(K-1)/2 unique matchups heads-up.
 * Each matchup is run twice (A as hero, B as hero) for symmetry.
 */
export function generatePayoffMatrix(
  profiles: OpponentProfile[],
  handsPerMatchup: number = 2000,
  seed: number = 42,
): PayoffMatrix {
  const results: MatchupEntry[] = [];

  for (let i = 0; i < profiles.length; i++) {
    for (let j = 0; j < profiles.length; j++) {
      if (i === j) continue; // skip self vs self (use symmetric validation test)

      const result = runBatch({
        heroProfile: profiles[i],
        villainProfile: profiles[j],
        hands: handsPerMatchup,
        seed: seed + i * 1000 + j,
        numPlayers: 2,
      });

      results.push({
        heroProfileId: profiles[i].id,
        villainProfileId: profiles[j].id,
        result,
      });
    }
  }

  return {
    profileIds: profiles.map(p => p.id),
    results,
    generatedAt: Date.now(),
    handsPerMatchup,
    seed,
  };
}

/**
 * Rank profiles by average performance across all matchups.
 */
export function rankProfiles(matrix: PayoffMatrix): ProfileRanking[] {
  const rankings: ProfileRanking[] = [];

  for (const profileId of matrix.profileIds) {
    const asHero = matrix.results.filter(r => r.heroProfileId === profileId);
    const avgBbPer100 = asHero.length > 0
      ? asHero.reduce((s, r) => s + r.result.bbPer100, 0) / asHero.length
      : 0;

    const winsAgainst = asHero.filter(r => r.result.bbPer100 > 5).map(r => r.villainProfileId);
    const losesTo = asHero.filter(r => r.result.bbPer100 < -5).map(r => r.villainProfileId);

    rankings.push({ profileId, avgBbPer100, winsAgainst, losesTo });
  }

  return rankings.sort((a, b) => b.avgBbPer100 - a.avgBbPer100);
}

// ═══════════════════════════════════════════════════════
// CONFIDENCE MODEL
// ═══════════════════════════════════════════════════════

/**
 * Given N observed actions matching a behavior pattern,
 * compute confidence that the pattern is real (not variance).
 *
 * Based on Bayesian inference with a GTO prior:
 * - Prior: assume opponent is GTO (balanced)
 * - Evidence: observed actions deviate from GTO expectations
 * - Posterior: probability that the deviation is systematic
 *
 * Returns 0-1 confidence.
 */
export function computeBehaviorConfidence(
  observedActions: number,
  deviationFromGTO: number, // 0-1: how far from GTO frequencies
): number {
  if (observedActions === 0) return 0;
  if (deviationFromGTO <= 0.05) return 0; // within noise

  // Simple Bayesian-inspired model:
  // confidence = 1 - (1 / (1 + k * n * d^2))
  // where n = observations, d = deviation, k = scaling factor
  const k = 2.0;
  const n = observedActions;
  const d = deviationFromGTO;

  const confidence = 1 - (1 / (1 + k * n * d * d));
  return Math.min(confidence, 0.99); // never 100% certain
}

/**
 * Human-readable confidence label.
 */
export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return "very high";
  if (confidence >= 0.7) return "high";
  if (confidence >= 0.5) return "moderate";
  if (confidence >= 0.3) return "weak";
  return "speculative";
}

// ═══════════════════════════════════════════════════════
// DISPLAY
// ═══════════════════════════════════════════════════════

/**
 * Format the payoff matrix as a human-readable table.
 */
export function formatMatrix(matrix: PayoffMatrix): string {
  const lines: string[] = [];
  lines.push(`Payoff Matrix (${matrix.handsPerMatchup} hands/matchup, seed=${matrix.seed})`);
  lines.push("");

  // Header
  const header = "Hero \\ Villain".padEnd(15) + matrix.profileIds.map(id => id.padStart(10)).join("");
  lines.push(header);
  lines.push("-".repeat(header.length));

  // Rows
  for (const heroId of matrix.profileIds) {
    const cells = matrix.profileIds.map(villainId => {
      if (heroId === villainId) return "   ---   ";
      const entry = matrix.results.find(r => r.heroProfileId === heroId && r.villainProfileId === villainId);
      if (!entry) return "   ???   ";
      const bb = entry.result.bbPer100;
      return (bb >= 0 ? "+" : "") + bb.toFixed(1).padStart(8);
    });
    lines.push(heroId.padEnd(15) + cells.join(""));
  }

  return lines.join("\n");
}
