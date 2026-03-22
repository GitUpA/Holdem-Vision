/**
 * Narrative Engine Integration Tests.
 *
 * Tests the full pipeline: profile modifiers → traits → interpretation → rendered narrative.
 * Verifies that narratives are character-coherent and context-sensitive.
 */
import { describe, it, expect } from "vitest";
import { buildNarrativeExplanation } from "../../../convex/lib/opponents/engines/narrativeEngine";
import { interpretSituation } from "../../../convex/lib/opponents/engines/narrativeInterpreter";
import { deriveNarrativeProfile } from "../../../convex/lib/opponents/engines/narrativeTraits";
import { createNarrativeArcTracker } from "../../../convex/lib/opponents/engines/narrativeArc";
import {
  NIT_MODIFIERS,
  FISH_MODIFIERS,
  TAG_MODIFIERS,
  LAG_MODIFIERS,
} from "../../../convex/lib/opponents/engines/modifierProfiles";
import { computeEffectiveModifier } from "../../../convex/lib/opponents/engines/modifierTransform";
import type { NarrativeInput } from "../../../convex/lib/opponents/engines/narrativeTypes";
import type { ContextFactors } from "../../../convex/lib/opponents/engines/modifiedGtoTypes";

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function makeFactors(overrides: Partial<ContextFactors> = {}): ContextFactors {
  return {
    handStrength: 0.5,
    handDescription: "middle pair",
    boardWetness: 0.3,
    drawOuts: 0,
    bestDrawType: "none",
    potOdds: 0.2,
    foldEquity: 0.35,
    spr: 10,
    isInPosition: true,
    isPreflop: false,
    ...overrides,
  };
}

function makeInput(overrides: Partial<NarrativeInput>): NarrativeInput {
  const baseModifier = overrides.baseModifier ?? NIT_MODIFIERS["postflop.facing_bet"];
  const factors = overrides.factors ?? makeFactors();
  const effective = computeEffectiveModifier(baseModifier, factors);

  return {
    profileId: "nit",
    situationKey: "postflop.facing_bet",
    action: { actionType: "fold" },
    factors,
    baseModifier,
    effectiveModifier: effective,
    gtoFrequencies: { fold: 0.3, call: 0.5, raise_small: 0.2 },
    modifiedFrequencies: { fold: 0.55, call: 0.35, raise_small: 0.1 },
    gtoSource: "solver",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════
// FULL PIPELINE TESTS
// ═══════════════════════════════════════════════════════

describe("buildNarrativeExplanation", () => {
  it("produces a complete RenderedNarrative for NIT folding", () => {
    const result = buildNarrativeExplanation(makeInput({}));

    expect(result.oneLiner).toBeTruthy();
    expect(result.paragraph).toBeTruthy();
    expect(result.explanationTree).toBeTruthy();
    expect(result.character.label).toBe("The Rock");
    expect(result.interpretation.primaryReason).toBeTruthy();
  });

  it("NIT folding mentions caution in the narrative", () => {
    const result = buildNarrativeExplanation(makeInput({
      factors: makeFactors({ handStrength: 0.2, handDescription: "high card" }),
    }));

    // Should mention caution or confidence
    const combined = result.oneLiner + " " + result.paragraph;
    expect(combined.toLowerCase()).toMatch(/caution|confident|fold|premium|strong/);
  });

  it("NIT continuing with strong hand mentions override", () => {
    const result = buildNarrativeExplanation(makeInput({
      action: { actionType: "call" },
      factors: makeFactors({ handStrength: 0.85, handDescription: "top pair top kicker" }),
      modifiedFrequencies: { fold: 0.2, call: 0.6, raise_small: 0.2 },
    }));

    // Should mention the hand being strong enough
    expect(result.interpretation.contextOverride).toBeTruthy();
    expect(result.interpretation.contextOverride!.toLowerCase()).toMatch(/strong|enough|continue/);
  });

  it("FISH calling produces sticky narrative", () => {
    const baseModifier = FISH_MODIFIERS["postflop.facing_bet"];
    const factors = makeFactors({ handStrength: 0.25, handDescription: "bottom pair" });

    const result = buildNarrativeExplanation(makeInput({
      profileId: "fish",
      baseModifier,
      factors,
      action: { actionType: "call" },
      modifiedFrequencies: { fold: 0.1, call: 0.8, raise_small: 0.1 },
    }));

    expect(result.character.label).toBe("The Calling Station");
    const combined = result.oneLiner + " " + result.paragraph;
    expect(combined.toLowerCase()).toMatch(/reluctant|fold|stay|call|sticky/);
  });

  it("LAG betting with position mentions pressure", () => {
    const baseModifier = LAG_MODIFIERS["postflop.aggressor.ip"];
    const factors = makeFactors({
      handStrength: 0.4,
      handDescription: "overcards",
      isInPosition: true,
      foldEquity: 0.55,
    });

    const result = buildNarrativeExplanation(makeInput({
      profileId: "lag",
      baseModifier,
      factors,
      action: { actionType: "bet", amount: 15 },
      situationKey: "postflop.aggressor.ip",
      modifiedFrequencies: { check: 0.2, bet_medium: 0.6, bet_large: 0.2 },
    }));

    const combined = result.oneLiner + " " + result.paragraph;
    expect(combined.toLowerCase()).toMatch(/pressure|aggress|position|fold/);
  });

  it("produces valid ExplanationNode tree with expected tags", () => {
    const result = buildNarrativeExplanation(makeInput({}));
    const tree = result.explanationTree;

    expect(tree.summary).toBeTruthy();
    expect(tree.children).toBeDefined();
    expect(tree.children!.length).toBeGreaterThanOrEqual(3);

    // Check for expected tag structure
    const allTags = collectTags(tree);
    expect(allTags).toContain("decision");
    expect(allTags).toContain("narrative");
    expect(allTags).toContain("gto-base");
  });

  it("all 5 profiles produce valid narratives", () => {
    const profiles: [string, typeof NIT_MODIFIERS][] = [
      ["nit", NIT_MODIFIERS],
      ["fish", FISH_MODIFIERS],
      ["tag", TAG_MODIFIERS],
      ["lag", LAG_MODIFIERS],
    ];

    for (const [id, mods] of profiles) {
      const result = buildNarrativeExplanation(makeInput({
        profileId: id,
        baseModifier: mods["postflop.facing_bet"],
      }));

      expect(result.oneLiner.length, `${id} oneLiner`).toBeGreaterThan(5);
      expect(result.paragraph.length, `${id} paragraph`).toBeGreaterThan(20);
      expect(result.character.label.length, `${id} label`).toBeGreaterThan(0);
      expect(result.explanationTree.children!.length, `${id} tree children`).toBeGreaterThanOrEqual(3);
    }
  });
});

// ═══════════════════════════════════════════════════════
// SITUATION INTERPRETATION TESTS
// ═══════════════════════════════════════════════════════

describe("interpretSituation", () => {
  it("NIT with strong hand generates override narrative", () => {
    const profile = deriveNarrativeProfile("nit", NIT_MODIFIERS);
    const modifier = NIT_MODIFIERS["postflop.facing_bet"];
    const factors = makeFactors({ handStrength: 0.85, handDescription: "overpair" });
    const effective = computeEffectiveModifier(modifier, factors);

    const interp = interpretSituation(
      profile, factors, modifier, effective, "call",
    );

    expect(interp.contextOverride).toBeTruthy();
    expect(interp.contextOverride!.toLowerCase()).toMatch(/strong|overpair|continue/);
  });

  it("FISH with low hand strength still continues (no override needed)", () => {
    const profile = deriveNarrativeProfile("fish", FISH_MODIFIERS);
    const modifier = FISH_MODIFIERS["postflop.facing_bet"];
    const factors = makeFactors({ handStrength: 0.2, handDescription: "bottom pair" });
    const effective = computeEffectiveModifier(modifier, factors);

    const interp = interpretSituation(
      profile, factors, modifier, effective, "call",
    );

    // Fish doesn't need context override to call — calling IS their default
    // primaryReason should reflect sticky nature
    expect(interp.primaryReason.toLowerCase()).toMatch(/fold|stay|reluctant|call/);
  });

  it("perception reflects personality", () => {
    const nitProfile = deriveNarrativeProfile("nit", NIT_MODIFIERS);
    const lagProfile = deriveNarrativeProfile("lag", LAG_MODIFIERS);
    const factors = makeFactors({ handStrength: 0.45, handDescription: "middle pair", boardWetness: 0.6 });

    const nitModifier = NIT_MODIFIERS["postflop.facing_bet"];
    const lagModifier = LAG_MODIFIERS["postflop.facing_bet"];

    const nitInterp = interpretSituation(
      nitProfile, factors, nitModifier, computeEffectiveModifier(nitModifier, factors), "fold",
    );
    const lagInterp = interpretSituation(
      lagProfile, factors, lagModifier, computeEffectiveModifier(lagModifier, factors), "raise",
    );

    // NIT sees "marginal" hand as "too marginal"
    expect(nitInterp.perception.handAssessment.toLowerCase()).toMatch(/marginal|comfortable/);
    // LAG sees same hand differently
    expect(lagInterp.perception.boardAssessment.toLowerCase()).toMatch(/action|draw|wet/);
  });

  it("NIT with good pot odds gets price-aware override", () => {
    const profile = deriveNarrativeProfile("nit", NIT_MODIFIERS);
    const modifier = NIT_MODIFIERS["postflop.facing_bet"];
    const factors = makeFactors({
      handStrength: 0.3,
      handDescription: "gutshot draw",
      potOdds: 0.12,
      drawOuts: 8,
    });
    const effective = computeEffectiveModifier(modifier, factors);

    const interp = interpretSituation(
      profile, factors, modifier, effective, "call",
    );

    // Should mention draws or price as override
    const combined = (interp.contextOverride ?? "") + " " + interp.secondaryReasons.join(" ");
    expect(combined.toLowerCase()).toMatch(/outs|draw|price|improve/);
  });
});

// ═══════════════════════════════════════════════════════
// ARC TRACKER TESTS
// ═══════════════════════════════════════════════════════

describe("NarrativeArcTracker", () => {
  it("records and retrieves decisions", () => {
    const tracker = createNarrativeArcTracker();

    tracker.recordDecision(0, "flop", "bet", "value", "Bet for value with top pair");

    const arc = tracker.getArc(0);
    expect(arc).toBeDefined();
    expect(arc!.previousActions).toHaveLength(1);
    expect(arc!.previousActions[0].street).toBe("flop");
    expect(arc!.previousActions[0].action).toBe("bet");
    expect(arc!.previousActions[0].intent).toBe("value");
  });

  it("tracks multiple streets", () => {
    const tracker = createNarrativeArcTracker();

    tracker.recordDecision(0, "flop", "bet", "value", "Bet flop");
    tracker.recordDecision(0, "turn", "check", "defensive", "Check turn");

    const arc = tracker.getArc(0);
    expect(arc!.previousActions).toHaveLength(2);
    expect(arc!.previousActions[0].street).toBe("flop");
    expect(arc!.previousActions[1].street).toBe("turn");
  });

  it("tracks different seats independently", () => {
    const tracker = createNarrativeArcTracker();

    tracker.recordDecision(0, "flop", "bet", "value", "Seat 0 bet");
    tracker.recordDecision(1, "flop", "call", "defensive", "Seat 1 called");

    expect(tracker.getArc(0)!.previousActions).toHaveLength(1);
    expect(tracker.getArc(1)!.previousActions).toHaveLength(1);
    expect(tracker.getArc(2)).toBeUndefined();
  });

  it("resets clears all history", () => {
    const tracker = createNarrativeArcTracker();

    tracker.recordDecision(0, "flop", "bet", "value", "Bet");
    tracker.reset();

    expect(tracker.getArc(0)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════
// COMPOSABILITY TESTS
// ═══════════════════════════════════════════════════════

describe("composability (novel profiles)", () => {
  it("Maniac profile produces aggressive narrative", () => {
    const maniacModifier: import("../../../convex/lib/opponents/engines/modifiedGtoTypes").SituationModifier = {
      base: { foldScale: 0.2, aggressionScale: 2.0, raiseVsCallBias: 0.3, sizingBias: 0.3, intensity: 0.95 },
      context: {
        handStrengthSensitivity: 0.2,
        textureSensitivity: 0.3,
        potOddsSensitivity: 0.1,
        positionSensitivity: 0.5,
        foldEquitySensitivity: 0.3,
        sprSensitivity: 0.2,
        drawSensitivity: 0.1,
      },
      deviationReason: "test",
    };

    const factors = makeFactors({ handStrength: 0.3, foldEquity: 0.5, isInPosition: true });

    const result = buildNarrativeExplanation({
      profileId: "maniac",
      situationKey: "postflop.aggressor.ip",
      action: { actionType: "bet", amount: 20 },
      factors,
      baseModifier: maniacModifier,
      effectiveModifier: computeEffectiveModifier(maniacModifier, factors),
      gtoFrequencies: { check: 0.4, bet_medium: 0.4, bet_large: 0.2 },
      modifiedFrequencies: { check: 0.1, bet_medium: 0.5, bet_large: 0.4 },
      gtoSource: "solver",
    });

    // Novel profile — should get a coherent character label
    expect(result.character.label.length).toBeGreaterThan(0);
    // The maniac has sticky + aggressive traits → should get a relevant label
    expect(result.character.label).toBeTruthy();
    expect(result.oneLiner).toBeTruthy();
    expect(result.paragraph.length).toBeGreaterThan(20);
  });
});

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function collectTags(node: import("../../../convex/lib/types/analysis").ExplanationNode): string[] {
  const tags: string[] = [...(node.tags ?? [])];
  for (const child of node.children ?? []) {
    tags.push(...collectTags(child));
  }
  return tags;
}
