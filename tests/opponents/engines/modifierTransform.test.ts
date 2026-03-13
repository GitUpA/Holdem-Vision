import { describe, it, expect } from "vitest";
import {
  applyModifier,
  computeEffectiveModifier,
  renormalize,
} from "../../../convex/lib/opponents/engines/modifierTransform";
import {
  identitySituationModifier,
  ZERO_CONTEXT,
} from "../../../convex/lib/opponents/engines/modifiedGtoTypes";
import type {
  SituationModifier,
  ContextFactors,
} from "../../../convex/lib/opponents/engines/modifiedGtoTypes";
import type { ActionFrequencies } from "../../../convex/lib/gto/tables/types";
import {
  NIT_MODIFIERS,
  FISH_MODIFIERS,
  LAG_MODIFIERS,
} from "../../../convex/lib/opponents/engines/modifierProfiles";

// ─── Helpers ───

function defaultFactors(overrides: Partial<ContextFactors> = {}): ContextFactors {
  return {
    handStrength: 0.5,
    handDescription: "playable",
    boardWetness: 0.5,
    drawOuts: 0,
    bestDrawType: "none",
    potOdds: 0,
    foldEquity: 0.3,
    spr: 8,
    isInPosition: false,
    isPreflop: false,
    ...overrides,
  };
}

function sumFreqs(freqs: ActionFrequencies): number {
  return Object.values(freqs).reduce((s, v) => s + (v ?? 0), 0);
}

describe("renormalize", () => {
  it("normalizes to sum=1", () => {
    const result = renormalize({ fold: 2, call: 3, bet_small: 5 });
    expect(Math.abs(sumFreqs(result) - 1.0)).toBeLessThan(0.001);
    expect(result.fold).toBeCloseTo(0.2);
    expect(result.call).toBeCloseTo(0.3);
    expect(result.bet_small).toBeCloseTo(0.5);
  });

  it("filters near-zero entries", () => {
    const result = renormalize({ fold: 0.0001, call: 0.5, check: 0.5 });
    expect(result.fold).toBeUndefined();
    expect(result.call).toBeDefined();
    expect(result.check).toBeDefined();
  });

  it("returns check=1 for empty input", () => {
    const result = renormalize({});
    expect(result.check).toBe(1.0);
  });
});

describe("computeEffectiveModifier", () => {
  it("identity modifier returns all 1.0 scales", () => {
    const modifier = identitySituationModifier();
    const result = computeEffectiveModifier(modifier, defaultFactors());
    expect(result.foldScale).toBeCloseTo(1.0);
    expect(result.aggressionScale).toBeCloseTo(1.0);
    expect(result.raiseVsCallBias).toBeCloseTo(0.0);
    expect(result.sizingBias).toBeCloseTo(0.0);
  });

  it("high foldScale is attenuated by strong hand", () => {
    const modifier: SituationModifier = {
      base: { foldScale: 2.0, aggressionScale: 1.0, raiseVsCallBias: 0, sizingBias: 0, intensity: 1.0 },
      context: { ...ZERO_CONTEXT, handStrengthSensitivity: 0.8 },
      deviationReason: "test",
    };

    const weakHand = computeEffectiveModifier(modifier, defaultFactors({ handStrength: 0.2 }));
    const strongHand = computeEffectiveModifier(modifier, defaultFactors({ handStrength: 0.9 }));

    // Strong hand should have lower effective foldScale (closer to 1.0)
    expect(strongHand.foldScale).toBeLessThan(weakHand.foldScale);
  });

  it("draws attenuate fold modifier", () => {
    const modifier: SituationModifier = {
      base: { foldScale: 2.0, aggressionScale: 1.0, raiseVsCallBias: 0, sizingBias: 0, intensity: 1.0 },
      context: { ...ZERO_CONTEXT, drawSensitivity: 0.8 },
      deviationReason: "test",
    };

    const noDraws = computeEffectiveModifier(modifier, defaultFactors({ drawOuts: 0 }));
    const flushDraw = computeEffectiveModifier(modifier, defaultFactors({ drawOuts: 9 }));

    expect(flushDraw.foldScale).toBeLessThan(noDraws.foldScale);
  });

  it("fold equity boosts aggression for sensitive profiles", () => {
    const modifier: SituationModifier = {
      base: { foldScale: 1.0, aggressionScale: 1.5, raiseVsCallBias: 0, sizingBias: 0, intensity: 1.0 },
      context: { ...ZERO_CONTEXT, foldEquitySensitivity: 0.8 },
      deviationReason: "test",
    };

    const lowFE = computeEffectiveModifier(modifier, defaultFactors({ foldEquity: 0.1 }));
    const highFE = computeEffectiveModifier(modifier, defaultFactors({ foldEquity: 0.7 }));

    expect(highFE.aggressionScale).toBeGreaterThan(lowFE.aggressionScale);
  });

  it("intensity=0 always returns 1.0 scales regardless of base", () => {
    const modifier: SituationModifier = {
      base: { foldScale: 5.0, aggressionScale: 0.1, raiseVsCallBias: -1, sizingBias: 1, intensity: 0 },
      context: { ...ZERO_CONTEXT },
      deviationReason: "test",
    };

    const result = computeEffectiveModifier(modifier, defaultFactors());
    expect(result.foldScale).toBeCloseTo(1.0);
    expect(result.aggressionScale).toBeCloseTo(1.0);
    expect(result.raiseVsCallBias).toBeCloseTo(0.0);
    expect(result.sizingBias).toBeCloseTo(0.0);
  });
});

describe("applyModifier", () => {
  const baseGto: ActionFrequencies = {
    fold: 0.3,
    call: 0.25,
    check: 0.2,
    bet_small: 0.15,
    bet_medium: 0.1,
  };

  it("identity modifier preserves GTO frequencies", () => {
    const modifier = identitySituationModifier();
    const result = applyModifier(baseGto, modifier, defaultFactors());

    // Should be close to original (renormalized)
    const total = sumFreqs(result);
    expect(Math.abs(total - 1.0)).toBeLessThan(0.001);
    // fold proportion should be roughly preserved
    if (result.fold) {
      expect(result.fold).toBeCloseTo(0.3, 1);
    }
  });

  it("high foldScale increases fold frequency", () => {
    const modifier: SituationModifier = {
      base: { foldScale: 2.0, aggressionScale: 1.0, raiseVsCallBias: 0, sizingBias: 0, intensity: 1.0 },
      context: ZERO_CONTEXT,
      deviationReason: "test",
    };

    const result = applyModifier(baseGto, modifier, defaultFactors());
    // Fold should be a larger proportion than in GTO
    expect(result.fold!).toBeGreaterThan(baseGto.fold! / sumFreqs(baseGto));
  });

  it("low foldScale decreases fold frequency", () => {
    const modifier: SituationModifier = {
      base: { foldScale: 0.3, aggressionScale: 1.0, raiseVsCallBias: 0, sizingBias: 0, intensity: 1.0 },
      context: ZERO_CONTEXT,
      deviationReason: "test",
    };

    const result = applyModifier(baseGto, modifier, defaultFactors());
    expect(result.fold!).toBeLessThan(baseGto.fold! / sumFreqs(baseGto));
  });

  it("high aggressionScale increases bet/raise frequencies", () => {
    const modifier: SituationModifier = {
      base: { foldScale: 1.0, aggressionScale: 2.0, raiseVsCallBias: 0, sizingBias: 0, intensity: 1.0 },
      context: ZERO_CONTEXT,
      deviationReason: "test",
    };

    const result = applyModifier(baseGto, modifier, defaultFactors());
    const origBetTotal = (baseGto.bet_small ?? 0) + (baseGto.bet_medium ?? 0);
    const modBetTotal = (result.bet_small ?? 0) + (result.bet_medium ?? 0);
    // Bet proportion should increase
    expect(modBetTotal / sumFreqs(result)).toBeGreaterThan(origBetTotal / sumFreqs(baseGto));
  });

  it("negative raiseVsCallBias shifts toward calls", () => {
    const modifier: SituationModifier = {
      base: { foldScale: 1.0, aggressionScale: 1.0, raiseVsCallBias: -0.8, sizingBias: 0, intensity: 1.0 },
      context: ZERO_CONTEXT,
      deviationReason: "test",
    };

    const result = applyModifier(baseGto, modifier, defaultFactors());
    // Call proportion should increase
    expect(result.call!).toBeGreaterThan(baseGto.call! / sumFreqs(baseGto));
  });

  it("always sums to 1.0 after modification", () => {
    const modifiers: SituationModifier[] = [
      { base: { foldScale: 3.0, aggressionScale: 0.1, raiseVsCallBias: -1, sizingBias: -1, intensity: 1 }, context: ZERO_CONTEXT, deviationReason: "" },
      { base: { foldScale: 0.1, aggressionScale: 3.0, raiseVsCallBias: 1, sizingBias: 1, intensity: 1 }, context: ZERO_CONTEXT, deviationReason: "" },
      { base: { foldScale: 1.0, aggressionScale: 1.0, raiseVsCallBias: 0, sizingBias: 0, intensity: 0.5 }, context: ZERO_CONTEXT, deviationReason: "" },
    ];

    for (const mod of modifiers) {
      const result = applyModifier(baseGto, mod, defaultFactors());
      expect(Math.abs(sumFreqs(result) - 1.0)).toBeLessThan(0.01);
    }
  });

  it("zero fold frequency stays zero regardless of modifier (intersection)", () => {
    // GTO says "never fold" for this hand category
    const noFoldGto: ActionFrequencies = {
      check: 0.4,
      bet_small: 0.35,
      bet_medium: 0.25,
    };

    // NIT-like modifier that folds a lot
    const modifier: SituationModifier = {
      base: { foldScale: 3.0, aggressionScale: 0.5, raiseVsCallBias: 0, sizingBias: 0, intensity: 1.0 },
      context: ZERO_CONTEXT,
      deviationReason: "test",
    };

    const result = applyModifier(noFoldGto, modifier, defaultFactors());
    // Fold should still be undefined/zero — can't fold what GTO says never fold
    expect(result.fold ?? 0).toBeLessThan(0.001);
  });

  it("handles edge case: only fold in GTO frequencies", () => {
    const foldOnly: ActionFrequencies = { fold: 1.0 };
    const modifier = identitySituationModifier();
    const result = applyModifier(foldOnly, modifier, defaultFactors());
    expect(result.fold).toBeCloseTo(1.0);
  });
});

describe("profile behavioral properties", () => {
  const testFreqs: ActionFrequencies = {
    fold: 0.3,
    call: 0.2,
    check: 0.1,
    bet_small: 0.15,
    bet_medium: 0.15,
    raise_small: 0.1,
  };

  const factors = defaultFactors({ handStrength: 0.4 }); // Marginal hand

  it("NIT folds more than GTO for marginal hands", () => {
    const modifier = NIT_MODIFIERS["postflop.facing_bet"];
    const result = applyModifier(testFreqs, modifier, factors);
    const gtoResult = applyModifier(testFreqs, identitySituationModifier(), factors);
    expect(result.fold!).toBeGreaterThan(gtoResult.fold!);
  });

  it("FISH calls more than GTO", () => {
    const modifier = FISH_MODIFIERS["postflop.facing_bet"];
    const result = applyModifier(testFreqs, modifier, factors);
    const gtoResult = applyModifier(testFreqs, identitySituationModifier(), factors);
    expect(result.call!).toBeGreaterThan(gtoResult.call!);
  });

  it("LAG is more aggressive than GTO", () => {
    const modifier = LAG_MODIFIERS["postflop.aggressor.ip"];
    const result = applyModifier(testFreqs, modifier, factors);
    const gtoResult = applyModifier(testFreqs, identitySituationModifier(), factors);
    const lagAggr = (result.bet_small ?? 0) + (result.bet_medium ?? 0) + (result.raise_small ?? 0);
    const gtoAggr = (gtoResult.bet_small ?? 0) + (gtoResult.bet_medium ?? 0) + (gtoResult.raise_small ?? 0);
    expect(lagAggr).toBeGreaterThan(gtoAggr);
  });

  it("strong hands make NIT converge toward GTO", () => {
    const modifier = NIT_MODIFIERS["postflop.facing_bet"];

    const weakFactors = defaultFactors({ handStrength: 0.2 });
    const strongFactors = defaultFactors({ handStrength: 0.9 });

    const weakResult = applyModifier(testFreqs, modifier, weakFactors);
    const strongResult = applyModifier(testFreqs, modifier, strongFactors);

    // NIT with strong hand should fold less than NIT with weak hand
    expect(strongResult.fold ?? 0).toBeLessThan(weakResult.fold ?? 0);
  });
});
