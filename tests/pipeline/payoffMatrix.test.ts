/**
 * Payoff Matrix — full K×K profile interaction test.
 *
 * Runs all profile pairs heads-up and produces the interaction matrix.
 * This is the Layer 9 validation from first-principles.md.
 */
import { describe, it, expect } from "vitest";
import { generatePayoffMatrix, rankProfiles, formatMatrix, computeBehaviorConfidence, confidenceLabel } from "../../convex/lib/pipeline/payoffMatrix";
import { PRESET_PROFILES } from "../../convex/lib/opponents/presets";

describe("Payoff Matrix", () => {
  it("generates 4-profile matrix and ranks profiles", () => {
    const profiles = [
      PRESET_PROFILES.gto,
      PRESET_PROFILES.tag,
      PRESET_PROFILES.nit,
      PRESET_PROFILES.fish,
    ];

    const matrix = generatePayoffMatrix(profiles, 1000, 77777);

    console.log("\n" + formatMatrix(matrix));

    const rankings = rankProfiles(matrix);
    console.log("\nPROFILE RANKINGS (avg BB/100 across all matchups):");
    for (const r of rankings) {
      console.log(
        `  ${r.profileId.padEnd(10)} ${r.avgBbPer100 >= 0 ? "+" : ""}${r.avgBbPer100.toFixed(2)} BB/100` +
        `  wins: [${r.winsAgainst.join(", ")}]  loses: [${r.losesTo.join(", ")}]`
      );
    }

    expect(matrix.results.length).toBe(12); // 4 profiles × 3 opponents each
    expect(rankings.length).toBe(4);
  }, 60_000);

  it("confidence model produces expected values", () => {
    // No observations → 0 confidence
    expect(computeBehaviorConfidence(0, 0.5)).toBe(0);

    // Small deviation → low confidence even with many observations
    expect(computeBehaviorConfidence(10, 0.05)).toBe(0);

    // Large deviation + many observations → high confidence
    const highConf = computeBehaviorConfidence(20, 0.5);
    expect(highConf).toBeGreaterThan(0.8);

    // Moderate deviation + moderate observations
    const modConf = computeBehaviorConfidence(5, 0.3);
    expect(modConf).toBeGreaterThan(0.3);
    expect(modConf).toBeLessThan(0.8);

    console.log("\nCONFIDENCE MODEL:");
    const scenarios = [
      { n: 3, d: 0.3, desc: "3 folds, 30% above GTO fold rate" },
      { n: 5, d: 0.4, desc: "5 actions, 40% deviation" },
      { n: 10, d: 0.5, desc: "10 actions, 50% deviation" },
      { n: 20, d: 0.3, desc: "20 actions, 30% deviation" },
    ];
    for (const { n, d, desc } of scenarios) {
      const conf = computeBehaviorConfidence(n, d);
      console.log(`  ${desc}: ${(conf * 100).toFixed(0)}% (${confidenceLabel(conf)})`);
    }
  });
});
