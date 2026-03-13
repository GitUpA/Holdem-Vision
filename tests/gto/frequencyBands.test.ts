import { describe, it, expect } from "vitest";
import {
  computeBand,
  computeArchetypeAccuracy,
  buildPositionBands,
  boardToFeatures,
  scoreBoardTypicality,
  estimateBoardAccuracy,
  computeTopActionGap,
  analyzeSampleSize,
  boardsNeededForPrecision,
  solverOutputToTableWithBands,
  type PositionFrequencyBands,
  type ArchetypeAccuracy,
  type SolverOutputWithBands,
  getAccuracy,
  lookupFrequencies,
} from "../../convex/lib/gto/tables";
import { loadSolverTables } from "../../convex/lib/gto/tables/loadSolverTables";
import { FLOP_ARCHETYPE_METADATA } from "../../convex/lib/gto/tables/preflopTables";

// ═══════════════════════════════════════════════════════
// computeBand
// ═══════════════════════════════════════════════════════

describe("computeBand", () => {
  it("handles empty array", () => {
    const band = computeBand([]);
    expect(band.mean).toBe(0);
    expect(band.sampleCount).toBe(0);
  });

  it("handles single value", () => {
    const band = computeBand([0.55]);
    expect(band.mean).toBe(0.55);
    expect(band.stdDev).toBe(0);
    expect(band.min).toBe(0.55);
    expect(band.max).toBe(0.55);
    expect(band.sampleCount).toBe(1);
  });

  it("computes correct statistics for uniform data", () => {
    const band = computeBand([0.50, 0.50, 0.50]);
    expect(band.mean).toBeCloseTo(0.50, 4);
    expect(band.stdDev).toBeCloseTo(0, 4);
    expect(band.min).toBe(0.50);
    expect(band.max).toBe(0.50);
    expect(band.sampleCount).toBe(3);
  });

  it("computes correct statistics for varied data", () => {
    const band = computeBand([0.40, 0.50, 0.60]);
    expect(band.mean).toBeCloseTo(0.50, 4);
    expect(band.stdDev).toBeGreaterThan(0.08);
    expect(band.min).toBe(0.40);
    expect(band.max).toBe(0.60);
  });

  it("computes correct statistics for wide spread", () => {
    const band = computeBand([0.20, 0.40, 0.60, 0.80]);
    expect(band.mean).toBeCloseTo(0.50, 4);
    expect(band.stdDev).toBeGreaterThan(0.20);
    expect(band.min).toBe(0.20);
    expect(band.max).toBe(0.80);
  });

  it("computes correct statistics for realistic solver data", () => {
    // Simulating ace-high dry rainbow, TPTK bet_medium across 5 boards
    const band = computeBand([0.61, 0.53, 0.57, 0.49, 0.55]);
    expect(band.mean).toBeCloseTo(0.55, 2);
    expect(band.stdDev).toBeLessThan(0.05);
    expect(band.min).toBe(0.49);
    expect(band.max).toBe(0.61);
    expect(band.sampleCount).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════
// computeArchetypeAccuracy
// ═══════════════════════════════════════════════════════

describe("computeArchetypeAccuracy", () => {
  it("returns very_high for tight clustering", () => {
    const ipBands: PositionFrequencyBands = {
      top_pair_top_kicker: {
        bet_small: { mean: 0.55, stdDev: 0.02, min: 0.52, max: 0.58, sampleCount: 25 },
        check: { mean: 0.30, stdDev: 0.03, min: 0.26, max: 0.34, sampleCount: 25 },
      },
    };
    const result = computeArchetypeAccuracy(ipBands, {}, 25);
    expect(result.accuracy).toBeGreaterThan(0.95);
    expect(result.confidenceLabel).toBe("very_high");
  });

  it("returns approximate for wide spread", () => {
    const ipBands: PositionFrequencyBands = {
      air: {
        check: { mean: 0.50, stdDev: 0.25, min: 0.20, max: 0.80, sampleCount: 10 },
        bet_small: { mean: 0.30, stdDev: 0.20, min: 0.05, max: 0.55, sampleCount: 10 },
      },
    };
    const result = computeArchetypeAccuracy(ipBands, {}, 10);
    expect(result.accuracy).toBeLessThan(0.80);
    expect(result.confidenceLabel).toBe("approximate");
  });

  it("combines IP and OOP band data", () => {
    const ipBands: PositionFrequencyBands = {
      overpair: {
        bet_medium: { mean: 0.65, stdDev: 0.04, min: 0.58, max: 0.72, sampleCount: 20 },
      },
    };
    const oopBands: PositionFrequencyBands = {
      overpair: {
        check: { mean: 0.85, stdDev: 0.06, min: 0.75, max: 0.95, sampleCount: 20 },
      },
    };
    const result = computeArchetypeAccuracy(ipBands, oopBands, 20);
    // Average stdDev = (0.04 + 0.06) / 2 = 0.05
    expect(result.avgStdDev).toBeCloseTo(0.05, 2);
    expect(result.accuracy).toBeCloseTo(0.95, 2);
    expect(result.boardCount).toBe(20);
  });

  it("ignores bands with < 2 samples", () => {
    const ipBands: PositionFrequencyBands = {
      sets_plus: {
        bet_large: { mean: 0.80, stdDev: 0, min: 0.80, max: 0.80, sampleCount: 1 },
      },
    };
    const result = computeArchetypeAccuracy(ipBands, {}, 1);
    // Single sample bands are ignored → no stdDevs → avgStdDev = 0
    expect(result.avgStdDev).toBe(0);
    expect(result.accuracy).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════
// buildPositionBands
// ═══════════════════════════════════════════════════════

describe("buildPositionBands", () => {
  it("builds bands from per-board distributions", () => {
    const distributions = {
      top_pair_top_kicker: {
        bet_small: [0.50, 0.55, 0.60],
        check: [0.30, 0.35, 0.25],
      },
      air: {
        check: [0.70, 0.65, 0.75],
      },
    };
    const result = buildPositionBands(distributions);

    expect(result.top_pair_top_kicker).toBeDefined();
    expect(result.top_pair_top_kicker!.bet_small!.mean).toBeCloseTo(0.55, 2);
    expect(result.top_pair_top_kicker!.bet_small!.sampleCount).toBe(3);
    expect(result.air!.check!.mean).toBeCloseTo(0.70, 2);
  });

  it("maps solver categories to HandCategory", () => {
    const distributions = {
      underpair: {
        check: [0.80, 0.85],
      },
    };
    const result = buildPositionBands(distributions);
    // underpair maps to bottom_pair
    expect(result.bottom_pair).toBeDefined();
    expect(result.bottom_pair!.check!.mean).toBeCloseTo(0.825, 2);
  });

  it("skips unknown categories", () => {
    const distributions = {
      nonexistent_category: {
        check: [0.50],
      },
    };
    const result = buildPositionBands(distributions);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════
// boardToFeatures
// ═══════════════════════════════════════════════════════

describe("boardToFeatures", () => {
  it("normalizes ace-high dry rainbow", () => {
    const features = boardToFeatures({
      highCard: 12, // Ace
      wetness: 0.1,
      isPaired: false,
      isMonotone: false,
      isTwoTone: false,
      isRainbow: true,
      hasConnectors: false,
    });
    expect(features.highCardNorm).toBe(1.0);
    expect(features.wetness).toBe(0.1);
    expect(features.isPaired).toBe(0);
    expect(features.suitedness).toBe(0); // rainbow
    expect(features.connectivity).toBe(0);
  });

  it("normalizes monotone connected board", () => {
    const features = boardToFeatures({
      highCard: 10, // Queen
      wetness: 0.9,
      isPaired: false,
      isMonotone: true,
      isTwoTone: false,
      isRainbow: false,
      hasConnectors: true,
    });
    expect(features.highCardNorm).toBeCloseTo(10 / 12, 2);
    expect(features.suitedness).toBe(1); // monotone
    expect(features.connectivity).toBe(1);
  });

  it("normalizes two-tone paired board", () => {
    const features = boardToFeatures({
      highCard: 8, // Ten
      wetness: 0.5,
      isPaired: true,
      isMonotone: false,
      isTwoTone: true,
      isRainbow: false,
      hasConnectors: false,
    });
    expect(features.isPaired).toBe(1);
    expect(features.suitedness).toBe(0.5); // two-tone
  });
});

// ═══════════════════════════════════════════════════════
// scoreBoardTypicality
// ═══════════════════════════════════════════════════════

describe("scoreBoardTypicality", () => {
  it("scores a perfect ace-high dry rainbow board near 1.0", () => {
    const features = boardToFeatures({
      highCard: 12, wetness: 0.15, isPaired: false,
      isMonotone: false, isTwoTone: false, isRainbow: true, hasConnectors: false,
    });
    const score = scoreBoardTypicality("ace_high_dry_rainbow", features);
    expect(score).toBeGreaterThan(0.9);
  });

  it("scores an atypical board lower", () => {
    // Board with connectors on an ace-high "dry" archetype
    const features = boardToFeatures({
      highCard: 12, wetness: 0.6, isPaired: false,
      isMonotone: false, isTwoTone: true, isRainbow: false, hasConnectors: true,
    });
    const score = scoreBoardTypicality("ace_high_dry_rainbow", features);
    expect(score).toBeLessThan(0.5);
  });

  it("returns 0.5 for unknown archetype", () => {
    const features = boardToFeatures({
      highCard: 8, wetness: 0.5, isPaired: false,
      isMonotone: false, isTwoTone: false, isRainbow: true, hasConnectors: false,
    });
    // postflop archetype — no centroid defined
    const score = scoreBoardTypicality("cbet_sizing_frequency", features);
    expect(score).toBe(0.5);
  });

  it("monotone board scores high for monotone archetype", () => {
    const features = boardToFeatures({
      highCard: 9, wetness: 0.85, isPaired: false,
      isMonotone: true, isTwoTone: false, isRainbow: false, hasConnectors: false,
    });
    const score = scoreBoardTypicality("monotone", features);
    expect(score).toBeGreaterThan(0.8);
  });

  it("paired board scores high for paired archetype", () => {
    const features = boardToFeatures({
      highCard: 8, wetness: 0.25, isPaired: true,
      isMonotone: false, isTwoTone: false, isRainbow: true, hasConnectors: false,
    });
    const score = scoreBoardTypicality("paired_boards", features);
    expect(score).toBeGreaterThan(0.7);
  });
});

// ═══════════════════════════════════════════════════════
// estimateBoardAccuracy
// ═══════════════════════════════════════════════════════

describe("estimateBoardAccuracy", () => {
  const highAccuracyArchetype: ArchetypeAccuracy = {
    avgStdDev: 0.03,
    accuracy: 0.97,
    confidenceLabel: "very_high",
    boardCount: 25,
  };

  const lowAccuracyArchetype: ArchetypeAccuracy = {
    avgStdDev: 0.22,
    accuracy: 0.78,
    confidenceLabel: "approximate",
    boardCount: 10,
  };

  it("typical board + high accuracy = very high estimate", () => {
    const result = estimateBoardAccuracy(highAccuracyArchetype, 0.95);
    expect(result.accuracy).toBeGreaterThan(0.9);
    expect(result.label).toBe("Very High");
    expect(result.description).toContain("25");
  });

  it("atypical board + high accuracy = reduced estimate", () => {
    const result = estimateBoardAccuracy(highAccuracyArchetype, 0.3);
    expect(result.accuracy).toBeLessThan(0.85);
  });

  it("typical board + low accuracy = moderate estimate", () => {
    const result = estimateBoardAccuracy(lowAccuracyArchetype, 0.95);
    expect(result.accuracy).toBeLessThan(0.85);
  });

  it("atypical board + low accuracy = approximate", () => {
    const result = estimateBoardAccuracy(lowAccuracyArchetype, 0.2);
    expect(result.accuracy).toBeLessThan(0.6);
    expect(result.label).toBe("Approximate");
    expect(result.description).toContain("edge of the pattern");
  });

  it("includes board count in description", () => {
    const result = estimateBoardAccuracy(highAccuracyArchetype, 0.9);
    expect(result.description).toContain("25");
  });

  // ── Practical impact tests ──

  it("returns maxEvImpactBB based on stdDev and pot size", () => {
    // avgStdDev=0.03, pot=10BB → maxEV = 0.03 * 10 * 0.5 = 0.15
    const result = estimateBoardAccuracy(highAccuracyArchetype, 0.95, 10);
    expect(result.maxEvImpactBB).toBeCloseTo(0.15, 1);
  });

  it("scales EV impact with pot size", () => {
    const small = estimateBoardAccuracy(highAccuracyArchetype, 0.95, 6);
    const large = estimateBoardAccuracy(highAccuracyArchetype, 0.95, 30);
    expect(large.maxEvImpactBB).toBeGreaterThan(small.maxEvImpactBB);
  });

  it("very high accuracy + clear spot → small EV impact, no flip", () => {
    // avgStdDev=0.03, pot=10BB → maxEV=0.15, gap=0.30 > 2×0.03 → no flip
    const result = estimateBoardAccuracy(highAccuracyArchetype, 0.98, 10, 0.30);
    expect(result.couldFlipOptimal).toBe(false);
    expect(result.maxEvImpactBB).toBeCloseTo(0.15, 1);
    expect(result.practicalMeaning).toContain("reliable");
  });

  it("moderate accuracy + close spot → flags could flip", () => {
    const closeSpot: ArchetypeAccuracy = {
      avgStdDev: 0.10,
      accuracy: 0.90,
      confidenceLabel: "high",
      boardCount: 15,
    };
    // topActionGap=0.05, uncertainty=0.10 → gap < 2×uncertainty → could flip
    const result = estimateBoardAccuracy(closeSpot, 0.85, 10, 0.05);
    expect(result.couldFlipOptimal).toBe(true);
    // Could land in Moderate or High bucket — check practical meaning mentions close or direction
    expect(result.practicalMeaning).toMatch(/Close spot|direction/);
  });

  it("low accuracy → practical meaning says focus on principle", () => {
    const result = estimateBoardAccuracy(lowAccuracyArchetype, 0.3, 10);
    expect(result.practicalMeaning).toContain("general principle");
  });

  it("practical meaning includes pot size context", () => {
    const result = estimateBoardAccuracy(highAccuracyArchetype, 0.85, 20);
    expect(result.practicalMeaning).toContain("20 BB");
  });
});

// ═══════════════════════════════════════════════════════
// computeTopActionGap
// ═══════════════════════════════════════════════════════

describe("computeTopActionGap", () => {
  it("returns gap between top two actions", () => {
    const gap = computeTopActionGap({ bet_small: 0.60, check: 0.30, bet_medium: 0.10 });
    expect(gap).toBeCloseTo(0.30, 2); // 0.60 - 0.30
  });

  it("returns 1.0 for single action", () => {
    const gap = computeTopActionGap({ bet_medium: 1.0 });
    expect(gap).toBe(1.0);
  });

  it("returns small gap for close frequencies", () => {
    const gap = computeTopActionGap({ check: 0.48, bet_small: 0.52 });
    expect(gap).toBeCloseTo(0.04, 2);
  });

  it("filters out near-zero actions", () => {
    const gap = computeTopActionGap({ bet_medium: 0.85, check: 0.15, bet_large: 0.0005 });
    expect(gap).toBeCloseTo(0.70, 2); // 0.85 - 0.15, ignoring ~0 bet_large
  });

  it("returns 1.0 for empty frequencies", () => {
    const gap = computeTopActionGap({});
    expect(gap).toBe(1.0);
  });
});

// ═══════════════════════════════════════════════════════
// solverOutputToTableWithBands (integration)
// ═══════════════════════════════════════════════════════

describe("solverOutputToTableWithBands", () => {
  const SAMPLE_WITH_BANDS: SolverOutputWithBands = {
    archetypeId: "ace_high_dry_rainbow",
    boardsAnalyzed: 3,
    context: { street: "flop", potType: "srp", heroPosition: "btn", villainPosition: "bb" },
    ip_frequencies: {
      top_pair_top_kicker: { check: 0.07, bet_small: 0.08, bet_medium: 0.85 },
      air: { check: 0.50, bet_small: 0.05, bet_medium: 0.45 },
    },
    oop_frequencies: {
      top_pair_top_kicker: { check: 0.95, bet_small: 0.04, bet_medium: 0.01 },
    },
    actions_ip: ["check", "bet_small", "bet_medium"],
    actions_oop: ["check", "bet_small", "bet_medium"],
    ip_distributions: {
      top_pair_top_kicker: {
        check: [0.05, 0.08, 0.08],
        bet_small: [0.06, 0.09, 0.09],
        bet_medium: [0.89, 0.83, 0.83],
      },
      air: {
        check: [0.45, 0.52, 0.53],
        bet_small: [0.04, 0.05, 0.06],
        bet_medium: [0.51, 0.43, 0.41],
      },
    },
    oop_distributions: {
      top_pair_top_kicker: {
        check: [0.94, 0.95, 0.96],
        bet_small: [0.05, 0.04, 0.03],
        bet_medium: [0.01, 0.01, 0.01],
      },
    },
  };

  it("produces both table and band data", () => {
    const meta = FLOP_ARCHETYPE_METADATA["ace_high_dry_rainbow"];
    const { table, ipBands, oopBands, accuracy } = solverOutputToTableWithBands(
      SAMPLE_WITH_BANDS,
      meta,
    );

    // Table should work as normal
    expect(table.archetypeId).toBe("ace_high_dry_rainbow");
    expect(table.ipFrequencies.top_pair_top_kicker).toBeDefined();

    // IP bands should have distributions
    expect(ipBands.top_pair_top_kicker).toBeDefined();
    expect(ipBands.top_pair_top_kicker!.bet_medium!.sampleCount).toBe(3);
    expect(ipBands.top_pair_top_kicker!.bet_medium!.mean).toBeCloseTo(0.85, 1);

    // OOP bands
    expect(oopBands.top_pair_top_kicker).toBeDefined();
    expect(oopBands.top_pair_top_kicker!.check!.mean).toBeCloseTo(0.95, 1);

    // Accuracy should be high (tight clustering in this sample)
    expect(accuracy.accuracy).toBeGreaterThan(0.9);
    expect(accuracy.boardCount).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════
// Registry band integration
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
// analyzeSampleSize
// ═══════════════════════════════════════════════════════

describe("analyzeSampleSize", () => {
  it("projects improvement for a tight archetype", () => {
    // Simulate ace-high dry rainbow: low variance across boards
    const bands: PositionFrequencyBands = {
      top_pair_top_kicker: {
        bet_medium: { mean: 0.85, stdDev: 0.04, min: 0.80, max: 0.90, sampleCount: 25 },
        check: { mean: 0.10, stdDev: 0.03, min: 0.06, max: 0.14, sampleCount: 25 },
      },
      air: {
        check: { mean: 0.50, stdDev: 0.06, min: 0.40, max: 0.60, sampleCount: 25 },
        bet_small: { mean: 0.30, stdDev: 0.05, min: 0.22, max: 0.38, sampleCount: 25 },
      },
    };

    const result = analyzeSampleSize(bands, 25);

    expect(result.currentBoards).toBe(25);
    expect(result.currentStdError).toBeGreaterThan(0);
    expect(result.projections.length).toBeGreaterThan(0);
    expect(result.sweetSpot).toBeGreaterThanOrEqual(25);
    expect(result.summary).toContain("25 boards");

    // Each projection should improve over current
    for (const p of result.projections) {
      expect(p.improvement).toBeGreaterThan(0);
      expect(p.stdError).toBeLessThan(result.currentStdError);
    }
  });

  it("projects improvement for a wide archetype", () => {
    // Simulate two-tone connected: high variance across boards
    const bands: PositionFrequencyBands = {
      middle_pair: {
        check: { mean: 0.50, stdDev: 0.15, min: 0.25, max: 0.75, sampleCount: 25 },
        bet_small: { mean: 0.30, stdDev: 0.12, min: 0.10, max: 0.50, sampleCount: 25 },
      },
    };

    const result = analyzeSampleSize(bands, 25);

    // Wide archetype should recommend more boards
    expect(result.sweetSpot).toBeGreaterThan(25);
    expect(result.sufficientlyPrecise).toBe(false);
    expect(result.currentMaxEvBB).toBeGreaterThan(0.1);
  });

  it("shows diminishing returns in projections", () => {
    const bands: PositionFrequencyBands = {
      overpair: {
        bet_medium: { mean: 0.65, stdDev: 0.08, min: 0.50, max: 0.80, sampleCount: 25 },
      },
    };

    const result = analyzeSampleSize(bands, 25);

    // Marginal gain per board should decrease
    const gains = result.projections.map(p => p.marginalGainPerBoard);
    for (let i = 1; i < gains.length; i++) {
      expect(gains[i]).toBeLessThanOrEqual(gains[i - 1] + 0.0001); // allow small float noise
    }
  });

  it("handles already-precise data", () => {
    const bands: PositionFrequencyBands = {
      sets_plus: {
        bet_large: { mean: 0.80, stdDev: 0.01, min: 0.79, max: 0.81, sampleCount: 100 },
      },
    };

    const result = analyzeSampleSize(bands, 100);
    expect(result.sufficientlyPrecise).toBe(true);
    expect(result.summary).toContain("Already precise");
  });

  it("handles no variance data", () => {
    const result = analyzeSampleSize({}, 25);
    expect(result.sufficientlyPrecise).toBe(true);
    expect(result.summary).toContain("No variance data");
  });

  it("scales EV impact with reference pot size", () => {
    const bands: PositionFrequencyBands = {
      overpair: {
        bet_medium: { mean: 0.65, stdDev: 0.08, min: 0.50, max: 0.80, sampleCount: 25 },
      },
    };

    const small = analyzeSampleSize(bands, 25, 6);
    const large = analyzeSampleSize(bands, 25, 30);
    expect(large.currentMaxEvBB).toBeGreaterThan(small.currentMaxEvBB);
  });
});

describe("boardsNeededForPrecision", () => {
  it("computes boards for 1% std error with 8% population stdDev", () => {
    // stdError = 0.08 / sqrt(n) = 0.01 → n = (0.08/0.01)² = 64
    const n = boardsNeededForPrecision(0.08, 0.01);
    expect(n).toBe(64);
  });

  it("computes boards for 2% std error with 8% population stdDev", () => {
    // n = (0.08/0.02)² = 16
    const n = boardsNeededForPrecision(0.08, 0.02);
    expect(n).toBe(16);
  });

  it("tight archetype needs fewer boards", () => {
    const tight = boardsNeededForPrecision(0.03, 0.01); // n = 9
    const wide = boardsNeededForPrecision(0.15, 0.01);  // n = 225
    expect(tight).toBeLessThan(wide);
  });

  it("returns Infinity for zero target", () => {
    expect(boardsNeededForPrecision(0.08, 0)).toBe(Infinity);
  });
});

// ═══════════════════════════════════════════════════════
// Registry band integration
// ═══════════════════════════════════════════════════════

describe("registry band integration", () => {
  it("loadSolverTables registers bands when distributions present", () => {
    const withBands: SolverOutputWithBands = {
      archetypeId: "ace_high_dry_rainbow",
      boardsAnalyzed: 5,
      context: { street: "flop", potType: "srp", heroPosition: "btn", villainPosition: "bb" },
      ip_frequencies: {
        top_pair_top_kicker: { check: 0.10, bet_medium: 0.90 },
      },
      oop_frequencies: {
        top_pair_top_kicker: { check: 0.95, bet_small: 0.05 },
      },
      actions_ip: ["check", "bet_medium"],
      actions_oop: ["check", "bet_small"],
      ip_distributions: {
        top_pair_top_kicker: {
          check: [0.08, 0.10, 0.12, 0.09, 0.11],
          bet_medium: [0.92, 0.90, 0.88, 0.91, 0.89],
        },
      },
      oop_distributions: {
        top_pair_top_kicker: {
          check: [0.94, 0.95, 0.96, 0.95, 0.95],
          bet_small: [0.06, 0.05, 0.04, 0.05, 0.05],
        },
      },
    };

    loadSolverTables([withBands]);

    // Accuracy should be registered
    const accuracy = getAccuracy("ace_high_dry_rainbow");
    expect(accuracy).toBeDefined();
    expect(accuracy!.boardCount).toBe(5);
    expect(accuracy!.accuracy).toBeGreaterThan(0.9);

    // Lookup should include band data
    const lookup = lookupFrequencies("ace_high_dry_rainbow", "top_pair_top_kicker", true);
    expect(lookup).not.toBeNull();
    expect(lookup!.bands).toBeDefined();
    expect(lookup!.bands!.bet_medium!.sampleCount).toBe(5);
    expect(lookup!.archetypeAccuracy).toBeDefined();
  });
});
