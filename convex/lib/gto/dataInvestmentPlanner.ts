/**
 * Data Investment Planner — identifies where more solver data would
 * improve coaching accuracy the most.
 *
 * Given a set of spots the user encounters, computes which data sources
 * have the lowest confidence, and prioritizes investments by ROI:
 * how often the spot occurs x how much the data gap costs x pot size.
 *
 * Lightweight: reads existing metadata, no solver calls.
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { DataConfidence, ConfidenceTier } from "./dataConfidence";
import type { GtoLookupResult } from "./frequencyLookup";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

/** A spot description with its frequency and confidence */
export interface SpotDescription {
  /** Human label (e.g., "BTN RFI with AKo", "CO vs 3-bet on ace-high dry flop") */
  label: string;
  /** Data source identifier */
  source: GtoLookupResult["source"];
  /** Pre-computed confidence (from GtoLookupResult.confidence) */
  confidence: DataConfidence;
  /** How often this spot occurs (0-1, relative frequency) */
  frequency: number;
  /** Average pot size in BB when this spot occurs */
  avgPotSizeBB: number;
}

/** A data gap with its priority score */
export interface DataGap {
  /** Spot label */
  label: string;
  /** Data source */
  source: GtoLookupResult["source"];
  /** Current confidence score (0-1) */
  currentConfidence: number;
  /** Current confidence tier */
  tier: ConfidenceTier;
  /** How much EV (BB) is at stake per occurrence */
  evAtStakeBB: number;
  /** Priority score: higher = more valuable to fix */
  priority: number;
  /** What abstractions are in use */
  abstractions: string[];
}

/** An investment recommendation */
export interface InvestmentRecommendation {
  /** Data source to invest in */
  source: GtoLookupResult["source"];
  /** Current confidence score */
  currentConfidence: number;
  /** Estimated confidence after investment */
  estimatedImprovement: number;
  /** Relative cost (1 = easy, 5 = expensive) */
  cost: number;
  /** ROI score: improvement × frequency × pot / cost */
  roi: number;
  /** What needs to be done */
  action: string;
}

// ═══════════════════════════════════════════════════════
// GAP IDENTIFICATION
// ═══════════════════════════════════════════════════════

/**
 * Given a list of spots the user has encountered, identify the ones
 * with lowest confidence — these are the biggest data gaps.
 *
 * Returns sorted by priority (highest first).
 */
export function identifyDataGaps(spots: SpotDescription[]): DataGap[] {
  const gaps: DataGap[] = spots.map((spot) => {
    const confidenceGap = 1 - spot.confidence.score;
    const evAtStakeBB = spot.confidence.implications.maxEvImpactBB;
    // Priority = frequency of spot x confidence gap x pot size
    const priority = spot.frequency * confidenceGap * spot.avgPotSizeBB;

    return {
      label: spot.label,
      source: spot.source,
      currentConfidence: spot.confidence.score,
      tier: spot.confidence.implications.tier,
      evAtStakeBB,
      priority,
      abstractions: spot.confidence.representational.abstractions,
    };
  });

  // Sort by priority descending (biggest gaps first)
  gaps.sort((a, b) => b.priority - a.priority);
  return gaps;
}

// ═══════════════════════════════════════════════════════
// INVESTMENT PRIORITIZATION
// ═══════════════════════════════════════════════════════

/**
 * Given identified gaps, produce ranked investment recommendations.
 *
 * Aggregates gaps by source type and computes ROI for each potential
 * data investment. ROI = (frequency x improvement x avgPot) / cost.
 */
export function prioritizeInvestments(
  spots: SpotDescription[],
): InvestmentRecommendation[] {
  // Group spots by source
  const bySource = new Map<GtoLookupResult["source"], SpotDescription[]>();
  for (const spot of spots) {
    const list = bySource.get(spot.source) ?? [];
    list.push(spot);
    bySource.set(spot.source, list);
  }

  const recommendations: InvestmentRecommendation[] = [];

  for (const [source, sourceSpots] of bySource) {
    const avgConfidence = sourceSpots.reduce((s, sp) => s + sp.confidence.score, 0) / sourceSpots.length;
    const totalFrequency = sourceSpots.reduce((s, sp) => s + sp.frequency, 0);
    const avgPot = sourceSpots.reduce((s, sp) => s + sp.avgPotSizeBB, 0) / sourceSpots.length;

    const { estimatedImprovement, cost, action } = investmentParams(source, avgConfidence);

    const improvementDelta = estimatedImprovement - avgConfidence;
    const roi = cost > 0 ? (totalFrequency * improvementDelta * avgPot) / cost : 0;

    recommendations.push({
      source,
      currentConfidence: round2(avgConfidence),
      estimatedImprovement: round2(estimatedImprovement),
      cost,
      roi: round2(roi),
      action,
    });
  }

  // Sort by ROI descending
  recommendations.sort((a, b) => b.roi - a.roi);
  return recommendations;
}

// ═══════════════════════════════════════════════════════
// INVESTMENT PARAMETERS
// ═══════════════════════════════════════════════════════

/**
 * Estimate what improving a data source would cost and yield.
 *
 * These are heuristic estimates based on the project's actual solver
 * pipeline capabilities and known data quality levels.
 */
function investmentParams(
  source: GtoLookupResult["source"],
  currentConfidence: number,
): { estimatedImprovement: number; cost: number; action: string } {
  switch (source) {
    case "category":
      // Already good (solver-backed). More boards help marginally.
      return {
        estimatedImprovement: Math.min(0.95, currentConfidence + 0.05),
        cost: 3, // moderate — need to run solver on more boards
        action: "Run additional solver boards for this archetype (diminishing returns past 40 boards).",
      };

    case "preflop-handclass":
      // PokerBench or validated ranges. Improvement = more PokerBench hands or dedicated solver runs.
      if (currentConfidence > 0.7) {
        return {
          estimatedImprovement: Math.min(0.90, currentConfidence + 0.08),
          cost: 2,
          action: "Increase PokerBench sample size for this position/archetype combination.",
        };
      }
      return {
        estimatedImprovement: Math.min(0.85, currentConfidence + 0.15),
        cost: 4, // expensive — need dedicated preflop solver runs
        action: "Run dedicated preflop solver for this spot (validated ranges only have direction, not frequencies).",
      };

    case "postflop-handclass":
      // PokerBench aggregated across boards. Improvement = per-board solver data.
      return {
        estimatedImprovement: Math.min(0.85, currentConfidence + 0.20),
        cost: 4,
        action: "Run solver for this specific board texture to get per-board data instead of cross-board averages.",
      };

    case "equity":
      // No solver data at all. Maximum improvement potential.
      return {
        estimatedImprovement: Math.min(0.80, currentConfidence + 0.35),
        cost: 5, // most expensive — building from scratch
        action: "Add solver data for this spot. Currently using equity heuristic only.",
      };
  }
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
