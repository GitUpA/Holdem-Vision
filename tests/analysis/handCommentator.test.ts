import { describe, it, expect } from "vitest";
import { commentateHand, type CommentaryInput } from "../../convex/lib/analysis/handCommentator";
import { cardFromString } from "../../convex/lib/primitives/card";
import { initializeHand } from "../../convex/lib/state/stateMachine";
import { createTestConfig } from "../state/helpers";
import type { HandCategorization } from "../../convex/lib/gto/handCategorizer";
import type { OpponentStory } from "../../convex/lib/analysis/opponentStory";
import type { ActionFrequencies } from "../../convex/lib/gto/tables/types";
import type { LegalActions } from "../../convex/lib/state/gameState";

function makeLegal(opts: Partial<LegalActions> = {}): LegalActions {
  return {
    seatIndex: 0, position: "btn",
    canFold: true, canCheck: false, canCall: true, callAmount: 3,
    canBet: false, betMin: 0, betMax: 0,
    canRaise: true, raiseMin: 6, raiseMax: 100,
    isCallAllIn: false, explanation: "",
    ...opts,
  };
}

function makeHandCat(desc: string, strength: number): HandCategorization {
  return { category: "air" as any, relativeStrength: strength, description: desc };
}

function makeOppStory(equity: number, rangePct: number, confidence: "strong" | "moderate" | "speculative" = "moderate"): OpponentStory {
  return {
    streetNarratives: [{ street: "preflop", action: "raise", interpretation: "Raised from early position — showing strength.", rangeUpdate: "Range: ~15%" }],
    rangeNarrative: `Range is ${rangePct < 15 ? "narrow" : "moderate"} (~${rangePct}% of hands).`,
    heroImplication: `You have ${(equity * 100).toFixed(0)}% equity.`,
    adjustedAction: equity < 0.35 ? "fold" : equity > 0.55 ? "bet" : "call",
    confidence,
    data: { estimatedRange: new Map(), equityVsRange: equity, potOddsNeeded: 0.25, rangePercent: rangePct, boardTexture: {} as any, heroHandStrength: 0.5 },
    explanation: { summary: "test" },
  };
}

describe("Hand Commentator", () => {
  const { state } = initializeHand(createTestConfig());

  it("produces a non-empty narrative", () => {
    const input: CommentaryInput = {
      heroCards: [cardFromString("9c"), cardFromString("4c")],
      communityCards: [],
      gameState: state,
      heroSeat: 5,
      legal: makeLegal(),
      handCat: makeHandCat("weak starting hand", 0.2),
    };

    const result = commentateHand(input);
    expect(result.narrative.length).toBeGreaterThan(50);
    expect(result.summary.length).toBeGreaterThan(10);
  });

  it("recommends fold when GTO says fold and equity is low", () => {
    const input: CommentaryInput = {
      heroCards: [cardFromString("9c"), cardFromString("4c")],
      communityCards: [],
      gameState: state,
      heroSeat: 5,
      legal: makeLegal(),
      handCat: makeHandCat("weak starting hand", 0.15),
      gtoFrequencies: { fold: 0.9, call: 0.05, raise_large: 0.05 },
      gtoOptimalAction: "fold",
      opponentStories: [makeOppStory(0.25, 12)],
    };

    const result = commentateHand(input);
    expect(result.recommendedAction).toBe("fold");
    expect(result.narrative).toContain("behind");
  });

  it("recommends call when GTO says call even with low equity (MDF spot)", () => {
    const input: CommentaryInput = {
      heroCards: [cardFromString("Kc"), cardFromString("Td")],
      communityCards: [],
      gameState: state,
      heroSeat: 5,
      legal: makeLegal(),
      handCat: makeHandCat("air (K high)", 0.15),
      gtoFrequencies: { fold: 0, call: 1.0 },
      gtoOptimalAction: "call",
      opponentStories: [makeOppStory(0.01, 3)],
    };

    const result = commentateHand(input);
    // GTO says call, even though equity is 1% — MDF spot
    expect(result.recommendedAction).toBe("call");
    expect(result.narrative).toContain("pot odds");
  });

  it("recommends continuing when GTO says continue and equity is good", () => {
    const input: CommentaryInput = {
      heroCards: [cardFromString("As"), cardFromString("Ah")],
      communityCards: [],
      gameState: state,
      heroSeat: 5,
      legal: makeLegal(),
      handCat: makeHandCat("premium pair", 0.95),
      gtoFrequencies: { fold: 0, call: 0.3, raise_large: 0.7 },
      gtoOptimalAction: "raise_large",
      opponentStories: [makeOppStory(0.8, 15)],
    };

    const result = commentateHand(input);
    expect(["bet", "raise", "call"]).toContain(result.recommendedAction);
    expect(result.narrative).toContain("strong");
  });

  it("includes GTO confirmation when frequencies provided", () => {
    const freqs: ActionFrequencies = { fold: 0.9, call: 0.05, raise_large: 0.05 };
    const input: CommentaryInput = {
      heroCards: [cardFromString("7h"), cardFromString("2d")],
      communityCards: [],
      gameState: state,
      heroSeat: 5,
      legal: makeLegal(),
      handCat: makeHandCat("air", 0.05),
      gtoFrequencies: freqs,
      gtoOptimalAction: "fold",
    };

    const result = commentateHand(input);
    expect(result.narrative).toContain("GTO");
    expect(result.confidence).toBe("clear");
  });

  it("marks close spots when frequencies are mixed", () => {
    const freqs: ActionFrequencies = { fold: 0.45, call: 0.40, raise_large: 0.15 };
    const input: CommentaryInput = {
      heroCards: [cardFromString("Ts"), cardFromString("9s")],
      communityCards: [],
      gameState: state,
      heroSeat: 5,
      legal: makeLegal(),
      handCat: makeHandCat("suited connector", 0.45),
      gtoFrequencies: freqs,
      gtoOptimalAction: "fold",
    };

    const result = commentateHand(input);
    expect(result.confidence).toBe("close_spot");
  });

  it("produces a meaningful summary", () => {
    const input: CommentaryInput = {
      heroCards: [cardFromString("Kd"), cardFromString("Qh")],
      communityCards: [],
      gameState: state,
      heroSeat: 5,
      legal: makeLegal(),
      handCat: makeHandCat("broadway offsuit", 0.55),
    };

    const result = commentateHand(input);
    expect(result.summary).toContain("broadway offsuit");
  });

  it("includes opponent narrative in the commentary", () => {
    const input: CommentaryInput = {
      heroCards: [cardFromString("Qs"), cardFromString("Qc")],
      communityCards: [cardFromString("Ah"), cardFromString("Tc"), cardFromString("4d")],
      gameState: { ...state, currentStreet: "flop" as const, communityCards: [cardFromString("Ah"), cardFromString("Tc"), cardFromString("4d")] } as any,
      heroSeat: 5,
      legal: makeLegal({ canCheck: true, canBet: true, canCall: false, callAmount: 0, canRaise: false }),
      handCat: makeHandCat("overpair", 0.7),
      opponentStories: [makeOppStory(0.45, 18, "moderate")],
    };

    const result = commentateHand(input);
    expect(result.narrative).toContain("story");
  });
});
