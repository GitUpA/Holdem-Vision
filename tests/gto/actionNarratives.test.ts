import { describe, it, expect } from "vitest";
import { buildActionStories } from "../../convex/lib/gto/actionNarratives";
import type { LegalActions } from "../../convex/lib/state/gameState";
import type { HandCategorization } from "../../convex/lib/gto/handCategorizer";
import { cardFromString } from "../../convex/lib/primitives/card";

function makeLegal(opts: Partial<LegalActions> = {}): LegalActions {
  return {
    seatIndex: 0,
    position: "co",
    canFold: true,
    canCheck: false,
    canCall: true,
    callAmount: 6,
    canBet: false,
    betMin: 0,
    betMax: 0,
    canRaise: true,
    raiseMin: 12,
    raiseMax: 100,
    isCallAllIn: false,
    explanation: "",
    ...opts,
  };
}

function makeHandCat(strength: number, category = "top_pair_top_kicker"): HandCategorization {
  return {
    category: category as HandCategorization["category"],
    relativeStrength: strength,
    description: "test hand",
  };
}

describe("Action Narratives", () => {
  const heroCards = [cardFromString("As"), cardFromString("Qd")];
  const board = [cardFromString("Ah"), cardFromString("Tc"), cardFromString("4d")];

  it("generates one story per legal action", () => {
    const legal = makeLegal({ canFold: true, canCall: true, canRaise: true });
    const stories = buildActionStories(heroCards, board, legal, undefined, makeHandCat(0.7), "flop");

    // fold + call + raise = 3
    expect(stories).toHaveLength(3);
    expect(stories.map((s) => s.action)).toEqual(["fold", "call", "raise"]);
  });

  it("includes check when canCheck is true", () => {
    const legal = makeLegal({ canFold: true, canCheck: true, canCall: false, callAmount: 0, canBet: true, canRaise: false });
    const stories = buildActionStories(heroCards, board, legal, undefined, makeHandCat(0.5), "flop");

    const actions = stories.map((s) => s.action);
    expect(actions).toContain("check");
    expect(actions).toContain("bet");
    expect(actions).not.toContain("call");
  });

  it("each story has a non-empty narrative", () => {
    const legal = makeLegal();
    const stories = buildActionStories(heroCards, board, legal, undefined, makeHandCat(0.6), "flop");

    for (const story of stories) {
      expect(story.narrative.length).toBeGreaterThan(10);
    }
  });

  it("generates counter-narratives when opponent story provided", () => {
    const legal = makeLegal();
    const oppStory = {
      streetNarratives: [],
      rangeNarrative: "Opponent has a strong range",
      heroImplication: "You're behind",
      adjustedAction: "fold" as const,
      confidence: "moderate" as const,
      data: {
        estimatedRange: new Map(),
        equityVsRange: 0.35,
        potOddsNeeded: 0.33,
        rangePercent: 15,
        boardTexture: {} as any,
        heroHandStrength: 0.6,
      },
      explanation: { summary: "test" },
    };

    const stories = buildActionStories(heroCards, board, legal, oppStory, makeHandCat(0.6), "flop");

    for (const story of stories) {
      expect(story.counterNarrative).toBeDefined();
      expect(story.counterNarrative!.length).toBeGreaterThan(10);
    }
  });

  it("fold narrative varies by street", () => {
    const legal = makeLegal({ callAmount: 20 });
    const preflop = buildActionStories(heroCards, [], legal, undefined, makeHandCat(0.5), "preflop");
    const flop = buildActionStories(heroCards, board, legal, undefined, makeHandCat(0.5), "flop");

    const preflopFold = preflop.find((s) => s.action === "fold")!;
    const flopFold = flop.find((s) => s.action === "fold")!;
    expect(preflopFold.narrative).not.toBe(flopFold.narrative);
  });

  it("strong hand gets value-oriented bet narrative", () => {
    const legal = makeLegal({ canCheck: true, canBet: true, canCall: false, callAmount: 0, canRaise: false });
    const stories = buildActionStories(heroCards, board, legal, undefined, makeHandCat(0.8), "flop");

    const bet = stories.find((s) => s.action === "bet")!;
    expect(bet.narrative).toContain("value");
  });

  it("weak hand gets bluff-oriented bet narrative", () => {
    const legal = makeLegal({ canCheck: true, canBet: true, canCall: false, callAmount: 0, canRaise: false });
    const stories = buildActionStories(heroCards, board, legal, undefined, makeHandCat(0.15), "flop");

    const bet = stories.find((s) => s.action === "bet")!;
    expect(bet.narrative).toContain("story");
  });

  it("preflop narratives differ from postflop", () => {
    const legal = makeLegal();
    const preflop = buildActionStories(heroCards, [], legal, undefined, makeHandCat(0.6), "preflop");
    const flop = buildActionStories(heroCards, board, legal, undefined, makeHandCat(0.6), "flop");

    const preflopCall = preflop.find((s) => s.action === "call")!;
    const flopCall = flop.find((s) => s.action === "call")!;
    expect(preflopCall.narrative).not.toBe(flopCall.narrative);
  });
});
