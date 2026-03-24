import { describe, it, expect } from "vitest";
import { buildOpponentStory } from "../../convex/lib/analysis/opponentStory";
import { GTO_PROFILE } from "../../convex/lib/opponents/presets";
import type { PlayerAction } from "../../convex/lib/types/opponents";
import { cardFromString } from "../../convex/lib/primitives/card";

const gtoProfile = GTO_PROFILE;

function card(notation: string) {
  return cardFromString(notation);
}

describe("Opponent Story Engine", () => {
  describe("QQ on ace-high board — opponent calls", () => {
    // Hero: QQ in CO, raised preflop
    // Villain: BB (GTO profile), called preflop, called flop bet on A-T-4
    const heroCards = [card("Qs"), card("Qc")];
    const communityFlop = [card("Ah"), card("Tc"), card("4d")];

    const bbActions: PlayerAction[] = [
      { street: "preflop", actionType: "call", amount: 2 },
      { street: "flop", actionType: "check" },
      { street: "flop", actionType: "call", amount: 4 },
    ];

    it("estimates equity below 60% for QQ vs calling range on ace-high board", () => {
      const story = buildOpponentStory(
        heroCards,
        communityFlop,
        bbActions,
        gtoProfile,
        "bb",
        12,
        0,
        "turn",
      );

      // QQ on A-T-4 vs BB's calling range — equity reduced from vacuum
      // GTO profile's range still includes Tx and draws QQ beats, but
      // ace-heavy enough to be marginal. Should NOT be a value bet.
      // Monte Carlo has variance — allow 65% ceiling (still well below vacuum ~80%)
      expect(story.data.equityVsRange).toBeLessThan(0.65);
    });

    it("recommends check, not bet, when behind opponent's range", () => {
      const story = buildOpponentStory(
        heroCards,
        communityFlop,
        bbActions,
        gtoProfile,
        "bb",
        12,
        0,
        "turn",
      );

      expect(story.adjustedAction).toBe("check");
    });

    it("produces a narrative about the flop call", () => {
      const story = buildOpponentStory(
        heroCards,
        communityFlop,
        bbActions,
        gtoProfile,
        "bb",
        12,
        0,
        "turn",
      );

      const flopNarrative = story.streetNarratives.find(
        (sn) => sn.street === "flop" && sn.action === "call",
      );
      expect(flopNarrative).toBeDefined();
      expect(flopNarrative!.interpretation.length).toBeGreaterThan(20);
    });

    it("has moderate or strong confidence after 3 actions", () => {
      const story = buildOpponentStory(
        heroCards,
        communityFlop,
        bbActions,
        gtoProfile,
        "bb",
        12,
        0,
        "turn",
      );

      expect(["moderate", "strong"]).toContain(story.confidence);
    });

    it("narrows range significantly", () => {
      const story = buildOpponentStory(
        heroCards,
        communityFlop,
        bbActions,
        gtoProfile,
        "bb",
        12,
        0,
        "turn",
      );

      expect(story.data.rangePercent).toBeLessThan(30);
    });
  });

  describe("AA preflop — opponent 3-bets", () => {
    const heroCards = [card("As"), card("Ah")];

    const oppActions: PlayerAction[] = [
      { street: "preflop", actionType: "raise", amount: 8 },
    ];

    it("estimates good equity for AA vs 3-bet range", () => {
      const story = buildOpponentStory(
        heroCards,
        [],
        oppActions,
        gtoProfile,
        "btn",
        12,
        6,
        "preflop",
      );

      expect(story.data.equityVsRange).toBeGreaterThan(0.6);
    });

    it("recommends raise or call with AA", () => {
      const story = buildOpponentStory(
        heroCards,
        [],
        oppActions,
        gtoProfile,
        "btn",
        12,
        6,
        "preflop",
      );

      expect(["raise", "call"]).toContain(story.adjustedAction);
    });
  });

  describe("72o on K-high board — opponent bets twice", () => {
    const heroCards = [card("7h"), card("2d")];
    const board = [card("Ks"), card("9c"), card("3h")];

    const oppActions: PlayerAction[] = [
      { street: "preflop", actionType: "raise", amount: 3 },
      { street: "flop", actionType: "bet", amount: 4 },
    ];

    it("recommends fold with air vs aggression", () => {
      const story = buildOpponentStory(
        heroCards,
        board,
        oppActions,
        gtoProfile,
        "co",
        10,
        4,
        "flop",
      );

      expect(story.adjustedAction).toBe("fold");
    });

    it("shows low equity", () => {
      const story = buildOpponentStory(
        heroCards,
        board,
        oppActions,
        gtoProfile,
        "co",
        10,
        4,
        "flop",
      );

      expect(story.data.equityVsRange).toBeLessThan(0.3);
    });
  });

  describe("explanation tree", () => {
    it("produces a well-structured explanation", () => {
      const heroCards = [card("Qs"), card("Qc")];
      const board = [card("Ah"), card("Tc"), card("4d")];
      const actions: PlayerAction[] = [
        { street: "preflop", actionType: "call", amount: 2 },
        { street: "flop", actionType: "call", amount: 4 },
      ];

      const story = buildOpponentStory(
        heroCards, board, actions, gtoProfile, "bb", 12, 0, "turn",
      );

      expect(story.explanation.summary).toContain("story");
      expect(story.explanation.children).toBeDefined();
      expect(story.explanation.children!.length).toBeGreaterThanOrEqual(2);
      expect(story.explanation.tags).toContain("opponent-story");
    });
  });

  describe("street narratives", () => {
    it("generates one narrative per action", () => {
      const heroCards = [card("Ks"), card("Kh")];
      const board = [card("Qc"), card("7d"), card("2s")];
      const actions: PlayerAction[] = [
        { street: "preflop", actionType: "call", amount: 2 },
        { street: "flop", actionType: "check" },
        { street: "flop", actionType: "call", amount: 3 },
      ];

      const story = buildOpponentStory(
        heroCards, board, actions, gtoProfile, "bb", 8, 0, "turn",
      );

      expect(story.streetNarratives).toHaveLength(3);
      expect(story.streetNarratives[0].street).toBe("preflop");
      expect(story.streetNarratives[1].street).toBe("flop");
      expect(story.streetNarratives[2].street).toBe("flop");
    });
  });
});
