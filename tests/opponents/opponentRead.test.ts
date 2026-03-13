import { describe, it, expect } from "vitest";
import { opponentReadLens } from "../../convex/lib/analysis/opponentRead";
import type { OpponentReadValue } from "../../convex/lib/analysis/opponentRead";
import { NIT_PROFILE, FISH_PROFILE } from "../../convex/lib/opponents/presets";
import { cardsFromStrings } from "../../convex/lib/primitives/card";
import type { AnalysisContext } from "../../convex/lib/types/analysis";
import type { OpponentContext } from "../../convex/lib/types/opponents";

function makeContext(overrides?: Partial<AnalysisContext>): AnalysisContext {
  return {
    heroCards: cardsFromStrings(["Ah", "Kh"]),
    communityCards: cardsFromStrings(["Qs", "7d", "2c"]),
    deadCards: [],
    street: "flop",
    opponents: [],
    ...overrides,
  };
}

function makeOpponent(
  label: string,
  profile: typeof NIT_PROFILE,
  actions: { street: string; actionType: string }[] = [],
): OpponentContext {
  return {
    seatIndex: 1,
    label,
    actions: actions as OpponentContext["actions"],
    impliedRange: new Map(),
    rangeDerivation: { summary: "No derivation", sentiment: "neutral" },
    profile,
  };
}

describe("opponentReadLens", () => {
  it("has correct lens metadata", () => {
    expect(opponentReadLens.id).toBe("opponent-read");
    expect(opponentReadLens.name).toBe("Opponent Read");
    expect(opponentReadLens.description.length).toBeGreaterThan(10);
  });

  it("returns no-opponent result when no opponents", () => {
    const ctx = makeContext();
    const result = opponentReadLens.analyze(ctx);
    const value = result.value as OpponentReadValue;

    expect(value.opponents.length).toBe(0);
    expect(value.equityDelta).toBe(0);
    expect(result.explanation.summary).toContain("No opponent data");
  });

  it("analyzes a single nit opponent", () => {
    const ctx = makeContext({
      opponents: [
        makeOpponent("Villain 1", NIT_PROFILE, [
          { street: "preflop", actionType: "raise" },
        ]),
      ],
    });

    const result = opponentReadLens.analyze(ctx);
    const value = result.value as OpponentReadValue;

    expect(value.opponents.length).toBe(1);
    expect(value.opponents[0].profileName).toBe("Nit");
    expect(value.opponents[0].rangePct).toBeLessThan(15);
    expect(value.aggregateEquity.win).toBeGreaterThan(0);
    expect(value.aggregateEquity.win).toBeLessThan(1);
    expect(value.vacuumEquity.win).toBeGreaterThan(0);
  });

  it("equity vs nit is lower than vacuum (nit has strong range)", () => {
    const ctx = makeContext({
      opponents: [
        makeOpponent("Villain 1", NIT_PROFILE, [
          { street: "preflop", actionType: "raise" },
          { street: "flop", actionType: "bet" },
        ]),
      ],
    });

    const result = opponentReadLens.analyze(ctx);
    const value = result.value as OpponentReadValue;

    // Against a nit who raised preflop and bet the flop,
    // our AKh should have lower equity than vacuum
    expect(value.equityDelta).toBeLessThan(0.1);
  }, 10000);

  it("equity vs fish is higher than vacuum (fish has weak range)", () => {
    const ctx = makeContext({
      opponents: [
        makeOpponent("Villain 1", FISH_PROFILE, [
          { street: "preflop", actionType: "call" },
        ]),
      ],
    });

    const result = opponentReadLens.analyze(ctx);
    const value = result.value as OpponentReadValue;

    // Against a fish who just called, our AKh should have good equity
    expect(value.aggregateEquity.win).toBeGreaterThan(0.3);
  }, 10000);

  it("builds visual directives including comparison and range_grid", () => {
    const ctx = makeContext({
      opponents: [
        makeOpponent("Villain 1", NIT_PROFILE, [
          { street: "preflop", actionType: "raise" },
        ]),
      ],
    });

    const result = opponentReadLens.analyze(ctx);

    // Should have comparison visual
    const comparison = result.visuals.find((v) => v.type === "comparison");
    expect(comparison).toBeDefined();

    // Should have range_grid visual
    const rangeGrid = result.visuals.find((v) => v.type === "range_grid");
    expect(rangeGrid).toBeDefined();
  }, 10000);

  it("explanation tree has equity delta and per-opponent breakdown", () => {
    const ctx = makeContext({
      opponents: [
        makeOpponent("V1", NIT_PROFILE, [
          { street: "preflop", actionType: "raise" },
        ]),
      ],
    });

    const result = opponentReadLens.analyze(ctx);

    expect(result.explanation.children).toBeDefined();
    expect(result.explanation.children!.length).toBeGreaterThanOrEqual(2);

    // First child should be equity delta
    const deltaChild = result.explanation.children!.find((c) =>
      c.tags?.includes("equity-delta"),
    );
    expect(deltaChild).toBeDefined();

    // Should have per-opponent child
    const oppChild = result.explanation.children!.find((c) =>
      c.tags?.includes("per-opponent"),
    );
    expect(oppChild).toBeDefined();
  }, 10000);

  it("handles multiple opponents", () => {
    const ctx = makeContext({
      opponents: [
        makeOpponent("V1", NIT_PROFILE, [
          { street: "preflop", actionType: "raise" },
        ]),
        makeOpponent("V2", FISH_PROFILE, [
          { street: "preflop", actionType: "call" },
        ]),
      ],
    });

    const result = opponentReadLens.analyze(ctx);
    const value = result.value as OpponentReadValue;

    expect(value.opponents.length).toBe(2);
    expect(value.opponents[0].profileName).toBe("Nit");
    expect(value.opponents[1].profileName).toBe("Fish / Calling Station");
  }, 15000);

  it("depends on raw-equity lens", () => {
    const ctx = makeContext();
    const result = opponentReadLens.analyze(ctx);
    expect(result.dependencies).toContain("raw-equity");
  });
});
