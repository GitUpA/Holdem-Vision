import { describe, it, expect } from "vitest";
import { outsLens, type OutsValue } from "../../convex/lib/analysis/outs";
import type { AnalysisContext } from "../../convex/lib/types/analysis";
import { cardsFromStrings } from "../../convex/lib/primitives/card";

function makeContext(hero: string[], community: string[]): AnalysisContext {
  return {
    heroCards: cardsFromStrings(hero),
    communityCards: cardsFromStrings(community),
    deadCards: [],
    street: community.length === 3 ? "flop" : community.length === 4 ? "turn" : "river",
    opponents: [],
  };
}

describe("OutsLens", () => {
  it("returns empty for preflop", () => {
    const ctx: AnalysisContext = {
      heroCards: cardsFromStrings(["As", "Kd"]),
      communityCards: [],
      deadCards: [],
      street: "preflop",
      opponents: [],
    };
    const result = outsLens.analyze(ctx);
    expect((result.value as OutsValue).outsCount).toBe(0);
  });

  it("returns empty for river (all cards dealt)", () => {
    const ctx = makeContext(
      ["As", "Kd"],
      ["Qc", "Jh", "2s", "7d", "3c"],
    );
    const result = outsLens.analyze(ctx);
    expect((result.value as OutsValue).outsCount).toBe(0);
  });

  it("finds outs for pair to improve", () => {
    // Hero: AK on K-7-2 board — hitting an Ace gives two pair
    const ctx = makeContext(["Ac", "Kd"], ["Ks", "7h", "2c"]);
    const result = outsLens.analyze(ctx);

    expect((result.value as OutsValue).outsCount).toBeGreaterThan(0);
    // Should have "One Pair → Two Pair" outs (remaining Aces)
    expect((result.value as OutsValue).byImprovement).toHaveProperty("One Pair → Two Pair");
  });

  it("finds outs for flush draw", () => {
    // Hero: Ah Kh on 9h 5h 2c board — flush draw with 9 outs
    const ctx = makeContext(["Ah", "Kh"], ["9h", "5h", "2c"]);
    const result = outsLens.analyze(ctx);

    // Should find hearts that complete the flush
    const flushOuts = Object.entries((result.value as OutsValue).byImprovement).find(
      ([key]) => key.includes("Flush"),
    );
    expect(flushOuts).toBeDefined();
  });

  it("probability is calculated correctly", () => {
    const ctx = makeContext(["Ac", "Kd"], ["Ks", "7h", "2c"]);
    const result = outsLens.analyze(ctx);

    // probability = outsCount / remaining cards
    const remaining = 52 - 5; // 2 hero + 3 community
    expect((result.value as OutsValue).probability).toBeCloseTo(
      (result.value as OutsValue).outsCount / remaining,
      5,
    );
  });

  it("returns valid AnalysisResult shape", () => {
    const ctx = makeContext(["Ah", "Kh"], ["9h", "5h", "2c"]);
    const result = outsLens.analyze(ctx);

    expect(result.lensId).toBe("outs");
    expect(result.explanation.tags).toContain("outs");
    expect(result.explanation.summary).toBeTruthy();
  });

  it("explanation includes odds helper", () => {
    const ctx = makeContext(["Ah", "Kh"], ["9h", "5h", "2c"]);
    const result = outsLens.analyze(ctx);

    // Should have a child about odds/rule of 2/4
    const oddsChild = result.explanation.children?.find((c) =>
      c.tags?.includes("outs-odds"),
    );
    if ((result.value as OutsValue).outsCount > 0) {
      expect(oddsChild).toBeDefined();
    }
  });

  it("outs_display visual directive present", () => {
    const ctx = makeContext(["Ah", "Kh"], ["9h", "5h", "2c"]);
    const result = outsLens.analyze(ctx);

    if ((result.value as OutsValue).outsCount > 0) {
      const outsDisplay = result.visuals.find((v) => v.type === "outs_display");
      expect(outsDisplay).toBeDefined();
      expect(outsDisplay!.lensId).toBe("outs");
    }
  });
});
