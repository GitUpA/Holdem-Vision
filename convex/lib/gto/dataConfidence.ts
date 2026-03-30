/**
 * DataConfidence — unified confidence metric for all GTO data sources.
 *
 * Computes a single 0-1 confidence score from the metadata already present
 * in GtoLookupResult (archetype accuracy, frequency bands, preflop sample
 * counts). Translates that into practical implications: how much EV could
 * the data gap cost, and could it flip the optimal action?
 *
 * Lightweight by design: no Monte Carlo, no solver calls, no heavy math.
 * Just reads existing metadata and produces a structured confidence object.
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { GtoLookupResult } from "./frequencyLookup";
import type { ActionFrequencies } from "./tables/types";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export type ConfidenceTier =
  | "solver-verified"
  | "high-confidence"
  | "directional"
  | "approximate"
  | "speculative";

export interface DataConfidence {
  /** Overall confidence score 0-1 */
  score: number;
  /** Statistical precision metrics */
  precision: {
    /** Standard error of the frequency estimate */
    standardError: number;
    /** Number of samples (boards or hands) backing this estimate */
    sampleCount: number;
    /** Half-width of the 95% confidence interval */
    ci95HalfWidth: number;
  };
  /** How well the data represents this specific spot */
  representational: {
    /** 0-1 score for how well the abstraction fits */
    score: number;
    /** List of abstractions applied (e.g., "archetype grouping", "category aggregation") */
    abstractions: string[];
  };
  /** Which data source produced this result */
  source: GtoLookupResult["source"];
  /** Practical implications for the user's decisions */
  implications: {
    /** Estimated max EV impact in BB from data uncertainty */
    maxEvImpactBB: number;
    /** Whether uncertainty could change which action is "best" */
    couldFlipOptimal: boolean;
    /** Confidence tier label */
    tier: ConfidenceTier;
    /** Human-readable description */
    description: string;
  };
}

// ═══════════════════════════════════════════════════════
// BUILDER
// ═══════════════════════════════════════════════════════

/**
 * Build a DataConfidence from an existing GtoLookupResult.
 *
 * Reads the metadata already present (archetypeAccuracy, bands,
 * preflopConfidence) and computes a unified confidence score.
 *
 * @param result - The GTO lookup result with its metadata
 * @param potSizeBB - Current pot size in big blinds (for EV impact)
 */
export function buildDataConfidence(
  result: GtoLookupResult,
  potSizeBB: number,
): DataConfidence {
  switch (result.source) {
    case "category":
      return buildCategoryConfidence(result, potSizeBB);
    case "preflop-handclass":
    case "preflop-classification":
      return buildPreflopConfidence(result, potSizeBB);
    case "postflop-handclass":
      return buildPostflopHandClassConfidence(result, potSizeBB);
    case "equity":
      return buildEquityConfidence(result, potSizeBB);
  }
}

// ═══════════════════════════════════════════════════════
// SOURCE-SPECIFIC BUILDERS
// ═══════════════════════════════════════════════════════

/**
 * Category-level solver data (postflop archetypes with 24+ boards).
 * Uses archetypeAccuracy for precision, bands for stdDev.
 */
function buildCategoryConfidence(
  result: GtoLookupResult,
  potSizeBB: number,
): DataConfidence {
  const accuracy = result.archetypeAccuracy;
  const bands = result.bands;

  // Compute average stdDev from bands (if available)
  let avgStdDev = 0.05; // default if no bands
  let sampleCount = 24;  // default board count
  if (accuracy) {
    avgStdDev = accuracy.avgStdDev;
    sampleCount = accuracy.boardCount;
  } else if (bands) {
    const stdDevs: number[] = [];
    for (const band of Object.values(bands)) {
      if (band && band.sampleCount >= 2) {
        stdDevs.push(band.stdDev);
        sampleCount = Math.max(sampleCount, band.sampleCount);
      }
    }
    if (stdDevs.length > 0) {
      avgStdDev = stdDevs.reduce((a, b) => a + b, 0) / stdDevs.length;
    }
  }

  const standardError = sampleCount > 0 ? avgStdDev / Math.sqrt(sampleCount) : avgStdDev;
  const ci95HalfWidth = 1.96 * standardError;

  // Representational score: category-level is good but not per-hand-class
  const repScore = result.isExactMatch ? 0.85 : 0.70;
  const abstractions = ["archetype grouping", "category aggregation"];

  // Overall score: weighted combination of precision and representational fit
  const precisionScore = Math.max(0, Math.min(1, 1 - standardError * 10));
  const score = precisionScore * 0.6 + repScore * 0.4;

  const topActionGap = computeTopGap(result.frequencies);
  const maxEvImpactBB = round2(standardError * potSizeBB * 0.5);
  const couldFlipOptimal = topActionGap < ci95HalfWidth * 2;

  return {
    score: clamp01(score),
    precision: { standardError: round4(standardError), sampleCount, ci95HalfWidth: round4(ci95HalfWidth) },
    representational: { score: repScore, abstractions },
    source: "category",
    implications: {
      maxEvImpactBB,
      couldFlipOptimal,
      tier: scoreTier(score),
      description: tierDescription(scoreTier(score), sampleCount, maxEvImpactBB, potSizeBB),
    },
  };
}

/**
 * Preflop per-hand-class data (PokerBench or validated ranges).
 * Uses preflopConfidence.sampleCount via sqrt(p*(1-p)/N).
 */
function buildPreflopConfidence(
  result: GtoLookupResult,
  potSizeBB: number,
): DataConfidence {
  const pc = result.preflopConfidence;
  const sampleCount = pc?.sampleCount ?? 5;

  // Estimate standard error using binomial approximation: sqrt(p*(1-p)/N)
  // Use the max frequency as p (most important action)
  const freqValues = Object.values(result.frequencies).filter(
    (v): v is number => v !== undefined && v > 0,
  );
  const maxFreq = freqValues.length > 0 ? Math.max(...freqValues) : 0.5;
  const standardError = sampleCount > 0
    ? Math.sqrt((maxFreq * (1 - maxFreq)) / sampleCount)
    : 0.25;
  const ci95HalfWidth = 1.96 * standardError;

  // Representational: per-hand-class is very specific
  const repScore = result.isExactMatch ? 0.95 : 0.75;
  const abstractions = result.isExactMatch
    ? ["position-specific hand class"]
    : ["position-specific hand class", "validated range fallback"];

  const precisionScore = Math.max(0, Math.min(1, 1 - standardError * 5));
  const score = precisionScore * 0.6 + repScore * 0.4;

  const topActionGap = computeTopGap(result.frequencies);
  const maxEvImpactBB = round2(standardError * potSizeBB * 0.5);
  const couldFlipOptimal = topActionGap < ci95HalfWidth * 2;

  return {
    score: clamp01(score),
    precision: { standardError: round4(standardError), sampleCount, ci95HalfWidth: round4(ci95HalfWidth) },
    representational: { score: repScore, abstractions },
    source: "preflop-handclass",
    implications: {
      maxEvImpactBB,
      couldFlipOptimal,
      tier: scoreTier(score),
      description: tierDescription(scoreTier(score), sampleCount, maxEvImpactBB, potSizeBB),
    },
  };
}

/**
 * PokerBench postflop per-hand-class (500k aggregated, no per-board variance).
 * Good coverage but no bands or accuracy metrics.
 */
function buildPostflopHandClassConfidence(
  result: GtoLookupResult,
  potSizeBB: number,
): DataConfidence {
  // PokerBench postflop has large sample but aggregates across board textures
  const sampleCount = 100; // approximate effective sample from PokerBench
  const standardError = 0.08; // conservative estimate — no per-board variance data
  const ci95HalfWidth = 1.96 * standardError;

  const repScore = 0.60; // aggregated across boards — moderate representational fit
  const abstractions = ["cross-board aggregation", "hand-class grouping"];

  const precisionScore = Math.max(0, Math.min(1, 1 - standardError * 5));
  const score = precisionScore * 0.6 + repScore * 0.4;

  const topActionGap = computeTopGap(result.frequencies);
  const maxEvImpactBB = round2(standardError * potSizeBB * 0.5);
  const couldFlipOptimal = topActionGap < ci95HalfWidth * 2;

  return {
    score: clamp01(score),
    precision: { standardError: round4(standardError), sampleCount, ci95HalfWidth: round4(ci95HalfWidth) },
    representational: { score: repScore, abstractions },
    source: "postflop-handclass",
    implications: {
      maxEvImpactBB,
      couldFlipOptimal,
      tier: scoreTier(score),
      description: tierDescription(scoreTier(score), sampleCount, maxEvImpactBB, potSizeBB),
    },
  };
}

/**
 * Equity-based heuristic recommendation (no solver data at all).
 * Lowest confidence — purely derived from hand strength vs pot odds.
 */
function buildEquityConfidence(
  result: GtoLookupResult,
  potSizeBB: number,
): DataConfidence {
  const sampleCount = 0;
  const standardError = 0.20; // high uncertainty — no solver backing
  const ci95HalfWidth = 1.96 * standardError;

  const repScore = 0.35; // equity heuristic ignores many game-tree factors
  const abstractions = ["equity heuristic", "no solver data", "pot-odds approximation"];

  const score = 0.30; // speculative tier

  const maxEvImpactBB = round2(standardError * potSizeBB * 0.5);

  return {
    score: clamp01(score),
    precision: { standardError: round4(standardError), sampleCount, ci95HalfWidth: round4(ci95HalfWidth) },
    representational: { score: repScore, abstractions },
    source: "equity",
    implications: {
      maxEvImpactBB,
      couldFlipOptimal: true, // always possible with equity heuristic
      tier: "speculative",
      description: `No solver data available. Recommendation based on equity heuristic only. In a ${potSizeBB} BB pot, the true GTO answer could differ by ~${maxEvImpactBB} BB.`,
    },
  };
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

/** Compute gap between top two action frequencies */
function computeTopGap(frequencies: ActionFrequencies): number {
  const values = Object.values(frequencies)
    .filter((v): v is number => v !== undefined && v > 0.001)
    .sort((a, b) => b - a);
  if (values.length <= 1) return 1.0;
  return values[0] - values[1];
}

/** Map overall score to confidence tier */
function scoreTier(score: number): ConfidenceTier {
  if (score >= 0.90) return "solver-verified";
  if (score >= 0.70) return "high-confidence";
  if (score >= 0.50) return "directional";
  if (score >= 0.35) return "approximate";
  return "speculative";
}

/** Build tier-appropriate description */
function tierDescription(
  tier: ConfidenceTier,
  sampleCount: number,
  maxEvBB: number,
  potBB: number,
): string {
  switch (tier) {
    case "solver-verified":
      return `Based on ${sampleCount} solver samples. Frequencies are reliable to within ~${maxEvBB} BB in a ${potBB} BB pot.`;
    case "high-confidence":
      return `Based on ${sampleCount} samples. The recommended action is reliable; exact frequencies may vary by ~${maxEvBB} BB in a ${potBB} BB pot.`;
    case "directional":
      return `Based on ${sampleCount} samples. The general direction is correct but exact frequencies could shift. Potential impact: ~${maxEvBB} BB in a ${potBB} BB pot.`;
    case "approximate":
      return `Limited data (${sampleCount} samples). Use as a rough guide — the true answer may differ meaningfully. Potential impact: ~${maxEvBB} BB in a ${potBB} BB pot.`;
    case "speculative":
      return `Minimal or no solver backing. Treat as directional guidance only. In a ${potBB} BB pot, the true answer could differ by ~${maxEvBB} BB.`;
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
