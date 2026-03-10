import { describe, it, expect } from "vitest";
import { monteCarloLens, type MonteCarloValue } from "../../convex/lib/analysis/monteCarloLens";
import type { AnalysisContext } from "../../convex/lib/types/analysis";
import { cardsFromStrings } from "../../convex/lib/primitives/card";

/** Helper to get typed value from monte carlo result. */
function val(result: { value: unknown }): MonteCarloValue {
  return result.value as MonteCarloValue;
}

function makeContext(
  hero: string[],
  community: string[] = [],
  extra: Partial<AnalysisContext> = {},
): AnalysisContext {
  return {
    heroCards: cardsFromStrings(hero),
    communityCards: cardsFromStrings(community),
    deadCards: [],
    street: community.length === 0 ? "preflop"
      : community.length === 3 ? "flop"
      : community.length === 4 ? "turn"
      : "river",
    opponents: [],
    ...extra,
  };
}

describe("MonteCarloLens", () => {
  it("returns valid AnalysisResult shape", () => {
    const ctx = makeContext(["As", "Ah"]);
    const result = monteCarloLens.analyze(ctx);

    expect(result.lensId).toBe("monte-carlo");
    expect(result.context).toBe(ctx);
    expect(result.explanation).toBeDefined();
    expect(result.explanation.summary).toBeTruthy();
    expect(result.explanation.tags).toContain("equity");
    expect(result.visuals.length).toBeGreaterThan(0);
    expect(result.dependencies).toEqual([]);
  });

  it("equity_bar visual directive is present", () => {
    const ctx = makeContext(["Kh", "Qh"]);
    const result = monteCarloLens.analyze(ctx);

    const equityBar = result.visuals.find((v) => v.type === "equity_bar");
    expect(equityBar).toBeDefined();
    expect(equityBar!.data).toHaveProperty("win");
    expect(equityBar!.data).toHaveProperty("tie");
    expect(equityBar!.data).toHaveProperty("lose");
  });

  it("equity values sum to ~1", () => {
    const ctx = makeContext(["As", "Ah"]);
    const { win, tie, lose } = val(monteCarloLens.analyze(ctx)).equity;
    expect(win + tie + lose).toBeCloseTo(1, 1);
  });

  it("AA has high equity preflop", () => {
    const ctx = makeContext(["As", "Ah"]);
    expect(val(monteCarloLens.analyze(ctx)).equity.win).toBeGreaterThan(0.8);
  });

  it("explanation has equity breakdown children", () => {
    const ctx = makeContext(["Jc", "Td"]);
    const result = monteCarloLens.analyze(ctx);

    expect(result.explanation.children).toBeDefined();
    expect(result.explanation.children!.length).toBeGreaterThan(0);
    const breakdownChild = result.explanation.children!.find((c) =>
      c.tags?.includes("equity-breakdown"),
    );
    expect(breakdownChild).toBeDefined();
  });

  it("sentiment reflects equity strength", () => {
    // AA should have positive sentiment
    const strongCtx = makeContext(["As", "Ah"]);
    const strong = monteCarloLens.analyze(strongCtx);
    expect(strong.explanation.sentiment).toBe("positive");
  });

  it("includes hand distribution on flop", () => {
    const ctx = makeContext(["Ah", "Kh"], ["Qh", "7h", "2c"]);
    expect(Object.keys(val(monteCarloLens.analyze(ctx)).equity.handDistribution).length).toBeGreaterThan(0);
  });

  it("runs 10000 trials", () => {
    const ctx = makeContext(["As", "Kd"]);
    expect(val(monteCarloLens.analyze(ctx)).equity.trials).toBe(10000);
  });
});
