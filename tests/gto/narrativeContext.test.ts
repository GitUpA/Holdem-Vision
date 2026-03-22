import { describe, it, expect } from "vitest";
import { buildBoardNarrative } from "../../convex/lib/gto/narrativeContext";
import type { ArchetypeClassification } from "../../convex/lib/gto/archetypeClassifier";
import type { HandCategorization } from "../../convex/lib/gto/handCategorizer";
import type { BoardTexture } from "../../convex/lib/opponents/engines/boardTexture";

function makeArchetype(
  archetypeId: string,
  category: "preflop" | "flop_texture" | "postflop_principle",
  description = "Test archetype",
): ArchetypeClassification {
  return {
    archetypeId: archetypeId as ArchetypeClassification["archetypeId"],
    confidence: 0.9,
    category,
    description,
  };
}

function makeHand(category: string, relativeStrength = 0.5): HandCategorization {
  return {
    category: category as HandCategorization["category"],
    relativeStrength,
    description: `test ${category}`,
  };
}

function makeBoard(wetness = 0.3): BoardTexture {
  return {
    wetness,
    suitDistribution: { rainbow: true, twoTone: false, monotone: false },
    connectivity: 0.2,
    pairing: { paired: false, trips: false },
    highCard: 14,
    description: "test board",
    isMonotone: false,
    isTwoTone: false,
    isRainbow: true,
    isPaired: false,
    isTrips: false,
    hasFlushDraw: false,
    hasStraightDraw: false,
    suitCounts: [3, 0, 0, 0],
    ranks: [14, 7, 2],
  } as unknown as BoardTexture;
}

describe("buildBoardNarrative", () => {
  describe("headline", () => {
    it("includes archetype description", () => {
      const narrative = buildBoardNarrative(
        makeArchetype("ace_high_dry_rainbow", "flop_texture", "Ace-high dry rainbow"),
        makeHand("top_pair_top_kicker"),
        makeBoard(0.2),
        true,
      );
      expect(narrative.headline).toContain("Ace-high dry rainbow");
    });

    it("includes range advantage for known archetypes", () => {
      const narrative = buildBoardNarrative(
        makeArchetype("ace_high_dry_rainbow", "flop_texture", "Ace-high dry"),
        makeHand("overpair"),
        makeBoard(0.2),
        true,
      );
      expect(narrative.headline).toContain("favors the preflop raiser");
    });

    it("includes position note for preflop", () => {
      const ip = buildBoardNarrative(
        makeArchetype("rfi_opening", "preflop", "RFI Opening"),
        makeHand("premium_pair"),
        undefined,
        true,
      );
      expect(ip.headline).toContain("You have position");

      const oop = buildBoardNarrative(
        makeArchetype("rfi_opening", "preflop", "RFI Opening"),
        makeHand("premium_pair"),
        undefined,
        false,
      );
      expect(oop.headline).toContain("out of position");
    });

    it("includes wet/dry label for postflop", () => {
      const dry = buildBoardNarrative(
        makeArchetype("ace_high_dry_rainbow", "flop_texture", "Ace-high dry"),
        makeHand("overpair"),
        makeBoard(0.2),
        true,
      );
      expect(dry.headline).toContain("dry");

      const wet = buildBoardNarrative(
        makeArchetype("two_tone_connected", "flop_texture", "Two-tone connected"),
        makeHand("flush_draw"),
        makeBoard(0.7),
        false,
      );
      expect(wet.headline).toContain("wet");
    });
  });

  describe("context", () => {
    it("returns non-empty for known archetypes", () => {
      const narrative = buildBoardNarrative(
        makeArchetype("ace_high_dry_rainbow", "flop_texture"),
        makeHand("top_pair_top_kicker"),
        makeBoard(),
        true,
      );
      expect(narrative.context.length).toBeGreaterThan(0);
    });

    it("returns empty for unknown archetypes", () => {
      const narrative = buildBoardNarrative(
        makeArchetype("nonexistent_archetype", "flop_texture"),
        makeHand("air"),
        makeBoard(),
        true,
      );
      expect(narrative.context).toBe("");
    });

    it("is at most 2 sentences from teaching", () => {
      const narrative = buildBoardNarrative(
        makeArchetype("ace_high_dry_rainbow", "flop_texture"),
        makeHand("overpair"),
        makeBoard(),
        true,
      );
      // Count sentence-ending punctuation
      const sentenceCount = (narrative.context.match(/[.!?]/g) || []).length;
      expect(sentenceCount).toBeLessThanOrEqual(3); // Allow for abbreviations
    });
  });

  describe("question", () => {
    it("asks value question for strong hands", () => {
      const narrative = buildBoardNarrative(
        makeArchetype("ace_high_dry_rainbow", "flop_texture"),
        makeHand("sets_plus", 1.0),
        makeBoard(),
        true,
      );
      expect(narrative.question.length).toBeGreaterThan(0);
      // Value questions mention "value" or "strong" or "pay off"
      expect(
        narrative.question.toLowerCase().includes("value") ||
        narrative.question.toLowerCase().includes("strong") ||
        narrative.question.toLowerCase().includes("extract") ||
        narrative.question.toLowerCase().includes("pay")
      ).toBe(true);
    });

    it("asks pot control question for marginal hands", () => {
      const narrative = buildBoardNarrative(
        makeArchetype("ace_high_dry_rainbow", "flop_texture"),
        makeHand("middle_pair", 0.4),
        makeBoard(),
        true,
      );
      expect(narrative.question.length).toBeGreaterThan(0);
      expect(
        narrative.question.toLowerCase().includes("showdown") ||
        narrative.question.toLowerCase().includes("control") ||
        narrative.question.toLowerCase().includes("protect") ||
        narrative.question.toLowerCase().includes("close") ||
        narrative.question.toLowerCase().includes("decent") ||
        narrative.question.toLowerCase().includes("vulnerable")
      ).toBe(true);
    });

    it("asks draw question for drawing hands", () => {
      const narrative = buildBoardNarrative(
        makeArchetype("two_tone_connected", "flop_texture"),
        makeHand("flush_draw", 0.4),
        makeBoard(0.7),
        true,
      );
      expect(narrative.question.length).toBeGreaterThan(0);
      expect(
        narrative.question.toLowerCase().includes("draw") ||
        narrative.question.toLowerCase().includes("price") ||
        narrative.question.toLowerCase().includes("outs") ||
        narrative.question.toLowerCase().includes("equity") ||
        narrative.question.toLowerCase().includes("improve")
      ).toBe(true);
    });

    it("asks bluff/fold question for air", () => {
      const narrative = buildBoardNarrative(
        makeArchetype("ace_high_dry_rainbow", "flop_texture"),
        makeHand("air", 0.0),
        makeBoard(),
        true,
      );
      expect(narrative.question.length).toBeGreaterThan(0);
      expect(
        narrative.question.toLowerCase().includes("fold") ||
        narrative.question.toLowerCase().includes("bluff") ||
        narrative.question.toLowerCase().includes("nothing") ||
        narrative.question.toLowerCase().includes("give up") ||
        narrative.question.toLowerCase().includes("story")
      ).toBe(true);
    });

    it("asks position question for preflop", () => {
      const narrative = buildBoardNarrative(
        makeArchetype("rfi_opening", "preflop"),
        makeHand("overcards"),
        undefined,
        true,
      );
      expect(narrative.question.toLowerCase()).toContain("position");
    });
  });

  describe("all archetypes produce output", () => {
    const archetypes: Array<[string, "preflop" | "flop_texture" | "postflop_principle"]> = [
      ["rfi_opening", "preflop"],
      ["bb_defense_vs_rfi", "preflop"],
      ["three_bet_pots", "preflop"],
      ["blind_vs_blind", "preflop"],
      ["four_bet_five_bet", "preflop"],
      ["ace_high_dry_rainbow", "flop_texture"],
      ["kq_high_dry_rainbow", "flop_texture"],
      ["mid_low_dry_rainbow", "flop_texture"],
      ["monotone", "flop_texture"],
      ["paired_boards", "flop_texture"],
      ["two_tone_connected", "flop_texture"],
      ["two_tone_disconnected", "flop_texture"],
      ["rainbow_connected", "flop_texture"],
      ["cbet_sizing_frequency", "postflop_principle"],
      ["turn_barreling", "postflop_principle"],
      ["river_bluff_catching_mdf", "postflop_principle"],
      ["thin_value_river", "postflop_principle"],
      ["overbet_river", "postflop_principle"],
      ["three_bet_pot_postflop", "postflop_principle"],
      ["exploitative_overrides", "postflop_principle"],
    ];

    for (const [id, cat] of archetypes) {
      it(`${id} produces non-empty headline and question`, () => {
        const narrative = buildBoardNarrative(
          makeArchetype(id, cat),
          makeHand("top_pair_top_kicker"),
          cat !== "preflop" ? makeBoard() : undefined,
          true,
        );
        expect(narrative.headline.length).toBeGreaterThan(0);
        expect(narrative.question.length).toBeGreaterThan(0);
      });
    }
  });
});
