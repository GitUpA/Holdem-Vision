/**
 * Tests for the equity-based recommendation engine.
 *
 * Validates that the engine produces correct fold/call/raise recommendations
 * based on equity vs estimated opponent ranges and pot odds.
 */
import { describe, it, expect } from "vitest";
import { equityBasedRecommendation } from "../../convex/lib/analysis/equityRecommendation";
import { PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import { cardFromString } from "../../convex/lib/primitives/card";
import type { LegalActions } from "../../convex/lib/state/gameState";

// ── Helpers ──

function cards(...strs: string[]) {
  return strs.map(cardFromString);
}

function makeLegal(opts: { canFold?: boolean; canCall?: boolean; canCheck?: boolean; canRaise?: boolean } = {}): LegalActions {
  return {
    seatIndex: 0,
    position: "sb",
    canFold: opts.canFold ?? true,
    canCheck: opts.canCheck ?? false,
    canCall: opts.canCall ?? true,
    callAmount: 0,
    canBet: false,
    betMin: 0,
    betMax: 0,
    canRaise: opts.canRaise ?? true,
    raiseMin: 0,
    raiseMax: 100,
    isCallAllIn: false,
    explanation: "",
  };
}

function getTopAction(frequencies: Record<string, number | undefined>): string {
  let top = "fold";
  let topFreq = 0;
  for (const [action, freq] of Object.entries(frequencies)) {
    if ((freq ?? 0) > topFreq) {
      topFreq = freq ?? 0;
      top = action;
    }
  }
  return top;
}

const GTO = PRESET_PROFILES["gto"];

// ── Tests ──

describe("equityBasedRecommendation", () => {
  it("recommends fold with 55 facing a 4-bet (poor implied odds OOP)", () => {
    const result = equityBasedRecommendation(
      cards("5h", "5c"),  // Pocket 5s
      [],                  // Preflop (no community)
      [{
        profile: GTO,
        actions: [
          { street: "preflop", actionType: "raise", amount: 3 },
          { street: "preflop", actionType: "raise", amount: 13 },  // 4-bet
        ],
        position: "btn",
      }],
      62,    // pot BB
      43,    // call cost BB (massive)
      "preflop",
      false, // OOP
      makeLegal(),
    );

    expect(result).not.toBeNull();
    const top = getTopAction(result!.frequencies);
    expect(top).toBe("fold");
    expect(result!.adjustedEquity).toBeLessThan(result!.potOddsNeeded);
  });

  it("recommends call/raise with AA facing a 3-bet", () => {
    const result = equityBasedRecommendation(
      cards("Ah", "As"),
      [],
      [{
        profile: GTO,
        actions: [
          { street: "preflop", actionType: "raise", amount: 3 },
          { street: "preflop", actionType: "raise", amount: 9 },  // 3-bet
        ],
        position: "co",
      }],
      20,    // pot BB
      6,     // call cost BB
      "preflop",
      true,  // IP
      makeLegal(),
    );

    expect(result).not.toBeNull();
    const top = getTopAction(result!.frequencies);
    expect(["call", "bet_large"]).toContain(top);
    expect(result!.equity).toBeGreaterThan(0.6);
  });

  it("recommends fold with 72o facing any raise", () => {
    const result = equityBasedRecommendation(
      cards("7h", "2c"),
      [],
      [{
        profile: GTO,
        actions: [{ street: "preflop", actionType: "raise", amount: 3 }],
        position: "btn",
      }],
      5,
      2,
      "preflop",
      false,
      makeLegal(),
    );

    expect(result).not.toBeNull();
    const top = getTopAction(result!.frequencies);
    expect(top).toBe("fold");
  });

  it("recommends call with AKs facing a single raise (strong hand, good equity)", () => {
    const result = equityBasedRecommendation(
      cards("Ah", "Kh"),
      [],
      [{
        profile: GTO,
        actions: [{ street: "preflop", actionType: "raise", amount: 3 }],
        position: "co",
      }],
      5,
      2,
      "preflop",
      true,
      makeLegal(),
    );

    expect(result).not.toBeNull();
    const top = getTopAction(result!.frequencies);
    expect(["call", "bet_large"]).toContain(top);
  });

  it("equity below pot odds always produces fold-heavy frequencies", () => {
    // Use a very weak hand against a tight range with bad pot odds
    const result = equityBasedRecommendation(
      cards("3h", "2c"),
      [],
      [{
        profile: GTO,
        actions: [
          { street: "preflop", actionType: "raise", amount: 3 },
          { street: "preflop", actionType: "raise", amount: 10 },
          { street: "preflop", actionType: "raise", amount: 30 },
        ],
        position: "utg",
      }],
      80,
      50,
      "preflop",
      false,
      makeLegal(),
    );

    expect(result).not.toBeNull();
    expect(result!.frequencies.fold).toBeGreaterThan(0.7);
  });

  it("provides explanation with equity and pot odds", () => {
    const result = equityBasedRecommendation(
      cards("Th", "Tc"),
      [],
      [{
        profile: GTO,
        actions: [{ street: "preflop", actionType: "raise", amount: 3 }],
        position: "btn",
      }],
      5,
      2,
      "preflop",
      false,
      makeLegal(),
    );

    expect(result).not.toBeNull();
    expect(result!.explanation.summary).toContain("TT");
    expect(result!.explanation.children).toBeDefined();
    expect(result!.explanation.children!.length).toBeGreaterThan(0);
  });

  it("handles known opponent cards (all-in with revealed hand)", () => {
    const result = equityBasedRecommendation(
      cards("Jh", "Jc"),  // JJ
      [],
      [{
        profile: GTO,
        actions: [{ street: "preflop", actionType: "all_in", amount: 100 }],
        position: "btn",
        knownCards: cards("Ah", "Kd"),  // AKo — we know their hand
      }],
      200,
      100,
      "preflop",
      false,
      makeLegal(),
    );

    expect(result).not.toBeNull();
    // JJ vs AKo is roughly 55-57% equity — should be a call
    expect(result!.equity).toBeGreaterThan(0.5);
    const top = getTopAction(result!.frequencies);
    expect(["call", "bet_large"]).toContain(top);
  });

  it("returns null with no opponents", () => {
    const result = equityBasedRecommendation(
      cards("Ah", "Kh"),
      [],
      [],
      10,
      5,
      "preflop",
      true,
      makeLegal(),
    );

    expect(result).toBeNull();
  });
});
