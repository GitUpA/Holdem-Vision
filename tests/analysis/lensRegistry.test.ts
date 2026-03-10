import { describe, it, expect } from "vitest";
import {
  getLens,
  getAllLenses,
  getLensInfo,
  runLenses,
  runAllLenses,
  registerLens,
} from "../../convex/lib/analysis/lensRegistry";
import type { AnalysisContext, AnalysisLens, AnalysisResult } from "../../convex/lib/types/analysis";
import { cardsFromStrings } from "../../convex/lib/primitives/card";

function makeContext(hero: string[], community: string[] = []): AnalysisContext {
  return {
    heroCards: cardsFromStrings(hero),
    communityCards: cardsFromStrings(community),
    deadCards: [],
    street: community.length === 0 ? "preflop"
      : community.length === 3 ? "flop"
      : community.length === 4 ? "turn"
      : "river",
    opponents: [],
  };
}

describe("Lens Registry", () => {
  it("has all 6 built-in lenses registered", () => {
    const lenses = getAllLenses();
    const ids = lenses.map((l) => l.id);
    expect(ids).toContain("raw-equity");
    expect(ids).toContain("threats");
    expect(ids).toContain("outs");
    expect(ids).toContain("draws");
    expect(ids).toContain("opponent-read");
    expect(ids).toContain("monte-carlo");
  });

  it("getLens returns correct lens by ID", () => {
    const equity = getLens("raw-equity");
    expect(equity).toBeDefined();
    expect(equity!.name).toBe("Hand Strength");
  });

  it("getLens returns undefined for unknown ID", () => {
    expect(getLens("nonexistent")).toBeUndefined();
  });

  it("getLensInfo returns metadata for UI", () => {
    const info = getLensInfo();
    expect(info.length).toBeGreaterThanOrEqual(6);
    for (const lens of info) {
      expect(lens.id).toBeTruthy();
      expect(lens.name).toBeTruthy();
      expect(lens.description).toBeTruthy();
    }
  });

  it("runLenses runs only specified lenses", () => {
    const ctx = makeContext(["As", "Kd"], ["Qh", "7c", "2s"]);
    const results = runLenses(ctx, ["threats", "outs"]);

    expect(results.size).toBe(2);
    expect(results.has("threats")).toBe(true);
    expect(results.has("outs")).toBe(true);
    expect(results.has("raw-equity")).toBe(false);
  });

  it("runAllLenses runs every registered lens", () => {
    const ctx = makeContext(["Ah", "Kh"], ["Qh", "7h", "2c"]);
    const results = runAllLenses(ctx);

    expect(results.size).toBeGreaterThanOrEqual(6);
    for (const [id, result] of results) {
      expect(result.lensId).toBe(id);
      expect(result.explanation).toBeDefined();
    }
  });

  it("runLenses ignores unknown lens IDs gracefully", () => {
    const ctx = makeContext(["As", "Kd"]);
    const results = runLenses(ctx, ["raw-equity", "nonexistent"]);

    expect(results.size).toBe(1);
    expect(results.has("raw-equity")).toBe(true);
  });

  it("custom lens can be registered and run", () => {
    const mockLens: AnalysisLens = {
      id: "test-custom",
      name: "Test Custom",
      description: "A test lens",
      analyze(context: AnalysisContext): AnalysisResult<string> {
        return {
          value: "custom-result",
          context,
          explanation: { summary: "Test result", tags: ["test"] },
          visuals: [],
          lensId: "test-custom",
          dependencies: [],
        };
      },
    };

    registerLens(mockLens);
    const lens = getLens("test-custom");
    expect(lens).toBeDefined();
    expect(lens!.name).toBe("Test Custom");

    const ctx = makeContext(["As", "Kd"]);
    const results = runLenses(ctx, ["test-custom"]);
    expect(results.get("test-custom")?.value).toBe("custom-result");
  });
});
