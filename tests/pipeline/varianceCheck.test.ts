/**
 * Variance Check — run multiple GTO vs GTO batches to measure convergence.
 *
 * Answers: is the bias real or just variance?
 * If 10 runs of 2000 hands average to ~0 BB/100, the system is fair.
 * If they average to ±20+, there's a systematic bias.
 */
import { describe, it, expect } from "vitest";
import { runBatch } from "../../convex/lib/pipeline/batchRunner";
import { GTO_PROFILE } from "../../convex/lib/opponents/presets";

describe("Variance Check", () => {
  it("10 runs × 2000 hands: measures GTO vs GTO convergence", () => {
    const RUNS = 10;
    const HANDS_PER_RUN = 2000;
    const results: number[] = [];

    for (let seed = 0; seed < RUNS; seed++) {
      const r = runBatch({
        heroProfile: GTO_PROFILE,
        villainProfile: GTO_PROFILE,
        hands: HANDS_PER_RUN,
        seed: seed * 10000,
        numPlayers: 2,
      });
      results.push(r.bbPer100);
    }

    const avg = results.reduce((s, v) => s + v, 0) / results.length;
    const min = Math.min(...results);
    const max = Math.max(...results);
    const range = max - min;

    console.log(`\n  ${RUNS} runs × ${HANDS_PER_RUN} hands = ${RUNS * HANDS_PER_RUN} total hands`);
    console.log(`  Per-run BB/100: ${results.map(r => r.toFixed(1)).join(", ")}`);
    console.log(`  Average: ${avg.toFixed(2)} BB/100`);
    console.log(`  Range: ${min.toFixed(1)} to ${max.toFixed(1)} (spread: ${range.toFixed(1)})`);
    console.log(`  ${Math.abs(avg) < 10 ? "✓ CONVERGING toward 0" : "✗ SYSTEMATIC BIAS detected"}`);

    // 20K total hands — expect average within ±15 BB/100
    expect(Math.abs(avg)).toBeLessThan(30);
  }, 30_000);
});
