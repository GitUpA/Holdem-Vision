import { describe, it, expect } from "vitest";
import { rawEquityLens, type RawEquityValue } from "../../convex/lib/analysis/rawEquity";
import type { AnalysisContext } from "../../convex/lib/types/analysis";
import { cardsFromStrings } from "../../convex/lib/primitives/card";

/** Helper to get typed value from raw equity result. */
function val(result: { value: unknown }): RawEquityValue {
  return result.value as RawEquityValue;
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

describe("RawEquityLens (Hand Strength)", () => {
  it("returns valid AnalysisResult shape", () => {
    const ctx = makeContext(["As", "Ah"]);
    const result = rawEquityLens.analyze(ctx);

    expect(result.lensId).toBe("raw-equity");
    expect(result.context).toBe(ctx);
    expect(result.explanation).toBeDefined();
    expect(result.explanation.summary).toBeTruthy();
    expect(result.explanation.tags).toContain("hand-strength");
    expect(result.visuals.length).toBeGreaterThan(0);
    expect(result.dependencies).toEqual([]);
  });

  it("hand_strength visual directive is present", () => {
    const ctx = makeContext(["Kh", "Qh"]);
    const result = rawEquityLens.analyze(ctx);

    const handStrength = result.visuals.find((v) => v.type === "hand_strength");
    expect(handStrength).toBeDefined();
    expect(handStrength!.data).toHaveProperty("currentHand");
    expect(handStrength!.data).toHaveProperty("preflopStrength");
  });

  it("includes current hand evaluation on flop", () => {
    const ctx = makeContext(["Ah", "Kh"], ["Kd", "7c", "2s"]);
    const result = rawEquityLens.analyze(ctx);
    const v = val(result);

    expect(v.currentHand).toBeDefined();
    expect(v.currentHand!.name).toBe("One Pair");
    expect(v.currentHand!.tier).toBe(1);
  });

  it("classifies premium preflop hands", () => {
    // AA
    expect(val(rawEquityLens.analyze(makeContext(["As", "Ah"]))).preflopStrength!.category).toBe("premium");
    // KK
    expect(val(rawEquityLens.analyze(makeContext(["Ks", "Kh"]))).preflopStrength!.category).toBe("premium");
    // AKs
    expect(val(rawEquityLens.analyze(makeContext(["Ah", "Kh"]))).preflopStrength!.category).toBe("premium");
  });

  it("classifies strong preflop hands", () => {
    // JJ
    expect(val(rawEquityLens.analyze(makeContext(["Js", "Jh"]))).preflopStrength!.category).toBe("strong");
    // AKo
    expect(val(rawEquityLens.analyze(makeContext(["Ah", "Kd"]))).preflopStrength!.category).toBe("strong");
  });

  it("classifies weak preflop hands", () => {
    // 72o
    expect(val(rawEquityLens.analyze(makeContext(["2h", "7d"]))).preflopStrength!.category).toBe("weak");
  });

  it("explanation sentiment reflects hand strength", () => {
    // AA preflop should be positive
    const strongCtx = makeContext(["As", "Ah"]);
    const strong = rawEquityLens.analyze(strongCtx);
    expect(strong.explanation.sentiment).toBe("positive");

    // 72o should be negative
    const weakCtx = makeContext(["2h", "7d"]);
    const weak = rawEquityLens.analyze(weakCtx);
    expect(weak.explanation.sentiment).toBe("negative");
  });

  it("does not run Monte Carlo (instant)", () => {
    const ctx = makeContext(["As", "Ah"], ["Kd", "7c", "2s"]);
    const start = performance.now();
    rawEquityLens.analyze(ctx);
    const elapsed = performance.now() - start;
    // Hand evaluation should take < 5ms, never the 50-200ms of Monte Carlo
    expect(elapsed).toBeLessThan(20);
  });

  it("provides both preflop and postflop info when applicable", () => {
    const ctx = makeContext(["Ah", "Kh"], ["Qh", "7h", "2c"]);
    const v = val(rawEquityLens.analyze(ctx));

    // Has current hand (flush draw / high card on flop)
    expect(v.currentHand).toBeDefined();
    // Also has preflop strength since hero has 2 cards
    expect(v.preflopStrength).toBeDefined();
  });
});
