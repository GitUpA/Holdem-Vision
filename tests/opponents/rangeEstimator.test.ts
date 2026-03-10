import { describe, it, expect } from "vitest";
import { estimateRange } from "../../convex/lib/opponents/rangeEstimator";
import {
  NIT_PROFILE,
  FISH_PROFILE,
  TAG_PROFILE,
  LAG_PROFILE,
  GTO_PROFILE,
} from "../../convex/lib/opponents/presets";
import { cardsFromStrings } from "../../convex/lib/primitives/card";
import type { PlayerAction } from "../../convex/lib/types/opponents";

describe("estimateRange", () => {
  const heroCards = cardsFromStrings(["Ah", "Kh"]);
  const communityCards = cardsFromStrings(["Qs", "7d", "2c"]);
  const knownCards = [...heroCards, ...communityCards];

  it("returns valid range estimation structure", () => {
    const result = estimateRange(NIT_PROFILE, [], knownCards);
    expect(result.range).toBeInstanceOf(Map);
    expect(result.explanation).toBeTruthy();
    expect(result.explanation.summary).toBeTruthy();
    expect(result.rangePctOfAll).toBeGreaterThan(0);
  });

  it("nit without actions has ~12% range", () => {
    const result = estimateRange(NIT_PROFILE, [], knownCards);
    expect(result.rangePctOfAll).toBeGreaterThan(5);
    expect(result.rangePctOfAll).toBeLessThan(20);
  });

  it("fish without actions has wide range", () => {
    const result = estimateRange(FISH_PROFILE, [], knownCards);
    // Fish has VPIP=55, so range should be significantly wider than nit
    expect(result.rangePctOfAll).toBeGreaterThan(25);
    expect(result.rangePctOfAll).toBeLessThan(65);
  });

  it("nit raise narrows range significantly", () => {
    const actions: PlayerAction[] = [
      { street: "preflop", actionType: "raise" },
    ];
    const result = estimateRange(NIT_PROFILE, actions, knownCards);
    // Nit raises with ~10% of hands (PFR)
    expect(result.rangePctOfAll).toBeLessThan(15);
  });

  it("fish call keeps wide range", () => {
    const actions: PlayerAction[] = [
      { street: "preflop", actionType: "call" },
    ];
    const result = estimateRange(FISH_PROFILE, actions, knownCards);
    // Fish calls with a very wide range
    expect(result.rangePctOfAll).toBeGreaterThan(20);
  });

  it("fold results in empty range", () => {
    const actions: PlayerAction[] = [
      { street: "preflop", actionType: "fold" },
    ];
    const result = estimateRange(NIT_PROFILE, actions, knownCards);
    expect(result.range.size).toBe(0);
    expect(result.rangePctOfAll).toBe(0);
  });

  it("multiple actions narrow range progressively", () => {
    const actions1: PlayerAction[] = [
      { street: "preflop", actionType: "raise" },
    ];
    const actions2: PlayerAction[] = [
      { street: "preflop", actionType: "raise" },
      { street: "flop", actionType: "bet" },
    ];

    const result1 = estimateRange(TAG_PROFILE, actions1, knownCards);
    const result2 = estimateRange(TAG_PROFILE, actions2, knownCards);

    // After a flop bet, range should be narrower or similar
    expect(result2.rangePctOfAll).toBeLessThanOrEqual(result1.rangePctOfAll + 5);
  });

  it("all-in preflop results in very narrow range", () => {
    const actions: PlayerAction[] = [
      { street: "preflop", actionType: "all_in" },
    ];
    const result = estimateRange(NIT_PROFILE, actions, knownCards);
    expect(result.rangePctOfAll).toBeLessThan(8);
  });

  it("check preflop preserves range (BB option)", () => {
    const actions: PlayerAction[] = [
      { street: "preflop", actionType: "check" },
    ];
    const before = estimateRange(TAG_PROFILE, [], knownCards);
    const after = estimateRange(TAG_PROFILE, actions, knownCards);
    expect(after.rangePctOfAll).toBeCloseTo(before.rangePctOfAll, 0);
  });

  it("explanation tree has children for each action", () => {
    const actions: PlayerAction[] = [
      { street: "preflop", actionType: "raise" },
      { street: "flop", actionType: "bet" },
    ];
    const result = estimateRange(LAG_PROFILE, actions, knownCards);
    // Should have: starting range + one node per action = 3 children
    expect(result.explanation.children).toBeDefined();
    expect(result.explanation.children!.length).toBe(3);
  });

  it("excludes combos with known cards", () => {
    const result = estimateRange(FISH_PROFILE, [], knownCards);
    for (const [combo] of result.range) {
      // No combo should contain any of the known cards
      const c1Str = combo.substring(0, 2);
      const c2Str = combo.substring(2, 4);
      for (const str of [c1Str, c2Str]) {
        const card = cardsFromStrings([str])[0];
        expect(knownCards).not.toContain(card);
      }
    }
  });

  // ─── Position-aware tests ───

  it("no position arg gives identical result to before", () => {
    const withoutPos = estimateRange(TAG_PROFILE, [], knownCards);
    const withUndefined = estimateRange(TAG_PROFILE, [], knownCards, undefined);
    expect(withoutPos.rangePctOfAll).toBe(withUndefined.rangePctOfAll);
  });

  it("TAG BTN has wider range than TAG UTG", () => {
    const btn = estimateRange(TAG_PROFILE, [], knownCards, "btn");
    const utg = estimateRange(TAG_PROFILE, [], knownCards, "utg");
    // BTN multiplier 1.40 vs UTG 0.55 — significant difference
    expect(btn.rangePctOfAll).toBeGreaterThan(utg.rangePctOfAll);
    // BTN should be roughly twice as wide or more
    expect(btn.rangePctOfAll / utg.rangePctOfAll).toBeGreaterThan(1.5);
  });

  it("GTO fully adjusts by position (positionAwareness=1.0)", () => {
    const btn = estimateRange(GTO_PROFILE, [], knownCards, "btn");
    const utg = estimateRange(GTO_PROFILE, [], knownCards, "utg");
    // GTO has positionAwareness=1.0, so full multiplier applies
    // BTN range should be much wider than UTG
    expect(btn.rangePctOfAll).toBeGreaterThan(utg.rangePctOfAll * 2);
  });

  it("Fish barely changes by position (positionAwareness=0.1)", () => {
    const btn = estimateRange(FISH_PROFILE, [], knownCards, "btn");
    const utg = estimateRange(FISH_PROFILE, [], knownCards, "utg");
    // Fish has positionAwareness=0.1, so ranges should be very similar
    const ratio = btn.rangePctOfAll / utg.rangePctOfAll;
    expect(ratio).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1.25);
  });

  it("position affects preflop raise range", () => {
    const actions: PlayerAction[] = [
      { street: "preflop", actionType: "raise" },
    ];
    const btnRaise = estimateRange(TAG_PROFILE, actions, knownCards, "btn");
    const utgRaise = estimateRange(TAG_PROFILE, actions, knownCards, "utg");
    // TAG raises wider from BTN than UTG
    expect(btnRaise.rangePctOfAll).toBeGreaterThan(utgRaise.rangePctOfAll);
  });

  it("BB position has no adjustment (multiplier=1.0)", () => {
    const bb = estimateRange(TAG_PROFILE, [], knownCards, "bb");
    const noPos = estimateRange(TAG_PROFILE, [], knownCards);
    expect(bb.rangePctOfAll).toBeCloseTo(noPos.rangePctOfAll, 0);
  });

  it("explanation mentions position when provided", () => {
    const result = estimateRange(TAG_PROFILE, [], knownCards, "co");
    expect(result.explanation.children![0].summary).toContain("CO");
  });
});
