import { describe, it, expect } from "vitest";
import { threatLens } from "../../convex/lib/analysis/threats";
import type { AnalysisContext } from "../../convex/lib/types/analysis";
import { cardsFromStrings, cardFromString } from "../../convex/lib/primitives/card";

function makeContext(hero: string[], community: string[]): AnalysisContext {
  return {
    heroCards: cardsFromStrings(hero),
    communityCards: cardsFromStrings(community),
    deadCards: [],
    street: community.length === 3 ? "flop" : community.length === 4 ? "turn" : "river",
    opponents: [],
  };
}

describe("ThreatLens", () => {
  it("returns empty for preflop", () => {
    const ctx: AnalysisContext = {
      heroCards: cardsFromStrings(["As", "Kd"]),
      communityCards: [],
      deadCards: [],
      street: "preflop",
      opponents: [],
    };
    const result = threatLens.analyze(ctx);
    expect(result.value.threatCount).toBe(0);
    expect(result.explanation.summary).toContain("requires community cards");
  });

  it("detects flush threats on monotone flop", () => {
    // Hero has no hearts, board is all hearts
    const ctx = makeContext(["As", "Kd"], ["9h", "7h", "3h"]);
    const result = threatLens.analyze(ctx);

    // Any heart is a flush threat
    const flushThreats = result.value.threats.filter((t) =>
      t.categories.includes("completes_flush"),
    );
    expect(flushThreats.length).toBeGreaterThan(0);
  });

  it("detects straight threats on connected board", () => {
    // Board: 9-8-7 — any 6 or T completes a straight
    const ctx = makeContext(["As", "Ad"], ["9c", "8d", "7h"]);
    const result = threatLens.analyze(ctx);

    const straightThreats = result.value.threats.filter((t) =>
      t.categories.includes("completes_straight"),
    );
    expect(straightThreats.length).toBeGreaterThan(0);
  });

  it("detects board pairing threats", () => {
    // Hero: AK on K-7-2 board — another 7 or 2 pairs the board
    const ctx = makeContext(["Ac", "Kc"], ["Kd", "7h", "2s"]);
    const result = threatLens.analyze(ctx);

    const pairThreats = result.value.threats.filter((t) =>
      t.categories.includes("pairs_board"),
    );
    // Should identify 7s and 2s as threats (they pair the board)
    expect(pairThreats.length).toBeGreaterThan(0);
  });

  it("overcard threats detected for pair on board", () => {
    // Hero: T9 on T-5-3 board — any J, Q, K, A is an overcard threat
    const ctx = makeContext(["Tc", "9d"], ["Th", "5s", "3c"]);
    const result = threatLens.analyze(ctx);

    const overcardThreats = result.value.threats.filter((t) =>
      t.categories.includes("overcards"),
    );
    expect(overcardThreats.length).toBeGreaterThan(0);
  });

  it("returns valid AnalysisResult shape", () => {
    const ctx = makeContext(["Ah", "Kd"], ["Qc", "Jh", "2s"]);
    const result = threatLens.analyze(ctx);

    expect(result.lensId).toBe("threats");
    expect(result.explanation.tags).toContain("threats");
    expect(result.value.threatCount + result.value.safeCount).toBe(
      52 - 5, // 52 total - 2 hero - 3 community
    );
  });

  it("threat_map visual directive present", () => {
    const ctx = makeContext(["As", "Kd"], ["9h", "7h", "3h"]);
    const result = threatLens.analyze(ctx);

    const threatMap = result.visuals.find((v) => v.type === "threat_map");
    expect(threatMap).toBeDefined();
    expect(threatMap!.lensId).toBe("threats");
  });

  it("dry board has fewer threats", () => {
    // Very dry board: K-7-2 rainbow — fewer threats than wet board
    const dry = makeContext(["Ac", "Kd"], ["Ks", "7h", "2c"]);
    const wet = makeContext(["Ac", "Kd"], ["9h", "8h", "7h"]);

    const dryResult = threatLens.analyze(dry);
    const wetResult = threatLens.analyze(wet);

    expect(wetResult.value.threatCount).toBeGreaterThan(dryResult.value.threatCount);
  });
});
