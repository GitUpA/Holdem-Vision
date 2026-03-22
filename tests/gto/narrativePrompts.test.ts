import { describe, it, expect } from "vitest";
import {
  buildNarrativePrompt,
  checkNarrativeAlignment,
  type NarrativeIntentId,
} from "../../convex/lib/gto/narrativePrompts";
import type { HandCategorization } from "../../convex/lib/gto/handCategorizer";
import type { ActionFrequencies } from "../../convex/lib/gto/tables/types";

function makeHand(category: string, relativeStrength = 0.5): HandCategorization {
  return {
    category: category as HandCategorization["category"],
    relativeStrength,
    description: `test ${category}`,
  };
}

describe("buildNarrativePrompt", () => {
  it("returns 2-3 options", () => {
    const prompt = buildNarrativePrompt(
      makeHand("top_pair_top_kicker", 0.8),
      true,
      false,
      { bet_medium: 0.6, check: 0.3, bet_small: 0.1 },
    );
    expect(prompt.options.length).toBeGreaterThanOrEqual(2);
    expect(prompt.options.length).toBeLessThanOrEqual(3);
  });

  it("has a question", () => {
    const prompt = buildNarrativePrompt(
      makeHand("air", 0.05),
      false,
      false,
      { fold: 0.7, check: 0.3 },
    );
    expect(prompt.question.length).toBeGreaterThan(0);
  });

  it("strong hand gets value options first", () => {
    const prompt = buildNarrativePrompt(
      makeHand("sets_plus", 1.0),
      true,
      false,
      { bet_large: 0.5, bet_medium: 0.3, check: 0.2 },
    );
    expect(prompt.options[0].id).toBe("value_strong");
  });

  it("air gets bluff/fold options", () => {
    const prompt = buildNarrativePrompt(
      makeHand("air", 0.05),
      true,
      false,
      { fold: 0.6, check: 0.3, bet_medium: 0.1 },
    );
    const ids = prompt.options.map((o) => o.id);
    expect(ids.some((id) => id === "give_up" || id === "bluff_fold_equity")).toBe(true);
  });

  it("flush draw gets draw options", () => {
    const prompt = buildNarrativePrompt(
      makeHand("flush_draw", 0.4),
      true,
      false,
      { call: 0.4, bet_medium: 0.35, fold: 0.25 },
    );
    const ids = prompt.options.map((o) => o.id);
    expect(ids.some((id) => id === "draw_priced_in" || id === "draw_semi_bluff")).toBe(true);
  });

  it("preflop suppresses draw intents", () => {
    const prompt = buildNarrativePrompt(
      makeHand("overcards", 0.3),
      true,
      true,
      { raise_large: 0.5, fold: 0.4, call: 0.1 },
    );
    const ids = prompt.options.map((o) => o.id);
    expect(ids).not.toContain("draw_priced_in");
    expect(ids).not.toContain("draw_semi_bluff");
  });

  it("ensures at least 2 different action families", () => {
    const prompt = buildNarrativePrompt(
      makeHand("middle_pair", 0.5),
      false,
      false,
      { check: 0.5, bet_medium: 0.3, fold: 0.2 },
    );
    const families = new Set(
      prompt.options.map((o) => o.mappedActions[0]?.replace(/_.*/, "")),
    );
    expect(families.size).toBeGreaterThanOrEqual(2);
  });

  it("gtoNarrative matches the highest-frequency action", () => {
    const prompt = buildNarrativePrompt(
      makeHand("top_pair_top_kicker", 0.8),
      true,
      false,
      { bet_medium: 0.7, check: 0.2, bet_small: 0.1 },
    );
    // gtoNarrative should map to an intent that includes bet_medium
    const gtoOption = prompt.options.find((o) => o.id === prompt.gtoNarrative);
    expect(gtoOption).toBeDefined();
    expect(gtoOption!.mappedActions.some((a) => a.startsWith("bet"))).toBe(true);
  });

  it("each option has label and detail", () => {
    const prompt = buildNarrativePrompt(
      makeHand("overpair", 0.75),
      true,
      false,
      { bet_medium: 0.5, check: 0.3, bet_large: 0.2 },
    );
    for (const opt of prompt.options) {
      expect(opt.label.length).toBeGreaterThan(0);
      expect(opt.detail.length).toBeGreaterThan(0);
      expect(opt.mappedActions.length).toBeGreaterThan(0);
      expect(opt.fitness).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("checkNarrativeAlignment", () => {
  it("aligned when action matches mapped actions", () => {
    expect(checkNarrativeAlignment("value_strong", "bet_medium")).toBe("aligned");
    expect(checkNarrativeAlignment("value_strong", "bet_large")).toBe("aligned");
    expect(checkNarrativeAlignment("pot_control", "check")).toBe("aligned");
    expect(checkNarrativeAlignment("give_up", "fold")).toBe("aligned");
  });

  it("mixed when action family overlaps", () => {
    expect(checkNarrativeAlignment("value_strong", "bet_small")).toBe("mixed");
    expect(checkNarrativeAlignment("draw_semi_bluff", "bet_small")).toBe("mixed");
  });

  it("contradicted when action doesn't match at all", () => {
    expect(checkNarrativeAlignment("value_strong", "fold")).toBe("contradicted");
    expect(checkNarrativeAlignment("give_up", "bet_large")).toBe("contradicted");
    expect(checkNarrativeAlignment("pot_control", "bet_large")).toBe("contradicted");
  });
});
