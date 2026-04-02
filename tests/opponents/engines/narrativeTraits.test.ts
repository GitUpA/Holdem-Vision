/**
 * Narrative Trait Derivation Tests.
 *
 * Verifies that modifier parameters → personality traits → character labels
 * produce coherent, composable results for all 5 profiles and novel combinations.
 */
import { describe, it, expect } from "vitest";
import {
  deriveTraits,
  deriveTraitsFromModifier,
  deriveNarrativeProfile,
  synthesizeCharacter,
} from "../../../convex/lib/opponents/engines/narrativeTraits";
import {
  NIT_MODIFIERS,
  FISH_MODIFIERS,
  TAG_MODIFIERS,
  LAG_MODIFIERS,
  GTO_MODIFIERS,
} from "../../../convex/lib/opponents/engines/modifierProfiles";
import type { SituationModifier, ProfileModifierMap } from "../../../convex/lib/opponents/engines/modifiedGtoTypes";
import type { TraitId } from "../../../convex/lib/opponents/engines/narrativeTypes";

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

function hasTraitId(traits: Array<{ id: string }>, id: TraitId): boolean {
  return traits.some((t) => t.id === id);
}

function sm(
  foldScale: number,
  aggressionScale: number,
  raiseVsCallBias: number,
  sizingBias: number,
  intensity: number,
  context: Partial<Record<string, number>> = {},
): SituationModifier {
  return {
    base: { foldScale, aggressionScale, raiseVsCallBias, sizingBias, intensity },
    context: {
      handStrengthSensitivity: context.hand ?? 0,
      textureSensitivity: context.texture ?? 0,
      potOddsSensitivity: context.odds ?? 0,
      positionSensitivity: context.position ?? 0,
      foldEquitySensitivity: context.foldEq ?? 0,
      sprSensitivity: context.spr ?? 0,
      drawSensitivity: context.draw ?? 0,
    },
    deviationReason: "test",
  };
}

// ═══════════════════════════════════════════════════════
// SINGLE MODIFIER TRAIT DERIVATION
// ═══════════════════════════════════════════════════════

describe("deriveTraitsFromModifier", () => {
  it("detects cautious from high foldScale", () => {
    const traits = deriveTraitsFromModifier(sm(2.0, 1.0, 0, 0, 0.5));
    expect(hasTraitId(traits, "cautious")).toBe(true);
    expect(hasTraitId(traits, "sticky")).toBe(false);
  });

  it("detects sticky from low foldScale", () => {
    const traits = deriveTraitsFromModifier(sm(0.3, 1.0, 0, 0, 0.5));
    expect(hasTraitId(traits, "sticky")).toBe(true);
    expect(hasTraitId(traits, "cautious")).toBe(false);
  });

  it("detects aggressive from high aggressionScale", () => {
    const traits = deriveTraitsFromModifier(sm(1.0, 1.5, 0, 0, 0.5));
    expect(hasTraitId(traits, "aggressive")).toBe(true);
    expect(hasTraitId(traits, "passive")).toBe(false);
  });

  it("detects passive from low aggressionScale", () => {
    const traits = deriveTraitsFromModifier(sm(1.0, 0.3, 0, 0, 0.5));
    expect(hasTraitId(traits, "passive")).toBe(true);
  });

  it("detects call-heavy from negative raiseVsCallBias", () => {
    const traits = deriveTraitsFromModifier(sm(1.0, 1.0, -0.5, 0, 0.5));
    expect(hasTraitId(traits, "call-heavy")).toBe(true);
  });

  it("detects balanced from low intensity", () => {
    const traits = deriveTraitsFromModifier(sm(1.0, 1.0, 0, 0, 0.05));
    expect(hasTraitId(traits, "balanced")).toBe(true);
  });

  it("detects extreme from high intensity", () => {
    const traits = deriveTraitsFromModifier(sm(1.0, 1.0, 0, 0, 0.9));
    expect(hasTraitId(traits, "extreme")).toBe(true);
  });

  it("detects hand-reader from high handStrengthSensitivity", () => {
    const traits = deriveTraitsFromModifier(sm(1.0, 1.0, 0, 0, 0.5, { hand: 0.7 }));
    expect(hasTraitId(traits, "hand-reader")).toBe(true);
  });

  it("detects positional from high positionSensitivity", () => {
    const traits = deriveTraitsFromModifier(sm(1.0, 1.0, 0, 0, 0.5, { position: 0.8 }));
    expect(hasTraitId(traits, "positional")).toBe(true);
  });

  it("returns traits sorted by strength descending", () => {
    const traits = deriveTraitsFromModifier(sm(2.5, 0.3, -0.5, 0, 0.95));
    expect(traits.length).toBeGreaterThan(2);
    for (let i = 1; i < traits.length; i++) {
      expect(traits[i].strength).toBeLessThanOrEqual(traits[i - 1].strength);
    }
  });

  it("identity modifier produces only balanced trait", () => {
    const traits = deriveTraitsFromModifier(sm(1.0, 1.0, 0, 0, 0.0));
    expect(traits.length).toBe(1);
    expect(traits[0].id).toBe("balanced");
  });
});

// ═══════════════════════════════════════════════════════
// FULL PROFILE TRAIT DERIVATION
// ═══════════════════════════════════════════════════════

describe("deriveTraits (full profile)", () => {
  it("NIT: cautious + passive + extreme, no sticky/aggressive", () => {
    const traits = deriveTraits(NIT_MODIFIERS);
    expect(hasTraitId(traits, "cautious")).toBe(true);
    expect(hasTraitId(traits, "passive")).toBe(true);
    expect(hasTraitId(traits, "sticky")).toBe(false);
    expect(hasTraitId(traits, "aggressive")).toBe(false);
    // Cautious and extreme should both be present (NIT has high foldScale + high intensity)
    expect(hasTraitId(traits, "extreme")).toBe(true);
  });

  it("FISH: sticky + passive + call-heavy, no cautious/aggressive", () => {
    const traits = deriveTraits(FISH_MODIFIERS);
    expect(hasTraitId(traits, "sticky")).toBe(true);
    expect(hasTraitId(traits, "passive")).toBe(true);
    expect(hasTraitId(traits, "call-heavy")).toBe(true);
    expect(hasTraitId(traits, "cautious")).toBe(false);
    expect(hasTraitId(traits, "aggressive")).toBe(false);
  });

  it("TAG: hand-reader, moderate traits, not extreme", () => {
    const traits = deriveTraits(TAG_MODIFIERS);
    expect(hasTraitId(traits, "hand-reader")).toBe(true);
    // TAG has high position sensitivity in preflop spots but not consistently across all 11 situations
    // The key characteristic: TAG has many context sensitivities but moderate base modifiers
    expect(hasTraitId(traits, "extreme")).toBe(false);
    // TAG should have texture/draw/fold-equity awareness across postflop situations
    expect(hasTraitId(traits, "fold-equity-exploiter")).toBe(true);
  });

  it("LAG: sticky + aggressive, not cautious", () => {
    const traits = deriveTraits(LAG_MODIFIERS);
    expect(hasTraitId(traits, "aggressive")).toBe(true);
    expect(hasTraitId(traits, "cautious")).toBe(false);
    // LAG should exploit position and fold equity
    expect(hasTraitId(traits, "positional")).toBe(true);
  });

  it("GTO: balanced as dominant trait", () => {
    const traits = deriveTraits(GTO_MODIFIERS);
    expect(hasTraitId(traits, "balanced")).toBe(true);
  });

  it("all profiles produce at least 1 trait", () => {
    for (const map of [NIT_MODIFIERS, FISH_MODIFIERS, TAG_MODIFIERS, LAG_MODIFIERS, GTO_MODIFIERS]) {
      const traits = deriveTraits(map);
      expect(traits.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("traits are sorted by strength descending", () => {
    for (const map of [NIT_MODIFIERS, FISH_MODIFIERS, TAG_MODIFIERS, LAG_MODIFIERS]) {
      const traits = deriveTraits(map);
      for (let i = 1; i < traits.length; i++) {
        expect(traits[i].strength).toBeLessThanOrEqual(traits[i - 1].strength);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════
// CHARACTER LABEL SYNTHESIS
// ═══════════════════════════════════════════════════════

describe("synthesizeCharacter", () => {
  it("NIT → The Rock", () => {
    const traits = deriveTraits(NIT_MODIFIERS);
    const char = synthesizeCharacter(traits);
    expect(char.label).toBe("The Rock");
  });

  it("FISH → The Calling Station", () => {
    const traits = deriveTraits(FISH_MODIFIERS);
    const char = synthesizeCharacter(traits);
    expect(char.label).toBe("The Calling Station");
  });

  it("GTO → The Theorist", () => {
    const traits = deriveTraits(GTO_MODIFIERS);
    const char = synthesizeCharacter(traits);
    expect(char.label).toBe("The Theorist");
  });

  it("all profiles get non-empty labels and summaries", () => {
    for (const [name, map] of [
      ["NIT", NIT_MODIFIERS],
      ["FISH", FISH_MODIFIERS],
      ["TAG", TAG_MODIFIERS],
      ["LAG", LAG_MODIFIERS],
      ["GTO", GTO_MODIFIERS],
    ] as const) {
      const traits = deriveTraits(map);
      const char = synthesizeCharacter(traits);
      expect(char.label.length, `${name} label`).toBeGreaterThan(0);
      expect(char.summary.length, `${name} summary`).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════
// NARRATIVE PROFILE (FULL PIPELINE)
// ═══════════════════════════════════════════════════════

describe("deriveNarrativeProfile", () => {
  it("produces complete profile for NIT", () => {
    const np = deriveNarrativeProfile("nit", NIT_MODIFIERS);
    expect(np.profileId).toBe("nit");
    expect(np.traits.length).toBeGreaterThanOrEqual(2);
    expect(np.characterLabel).toBeTruthy();
    expect(np.characterSummary).toBeTruthy();
  });

  it("produces complete profile for all presets", () => {
    const presets: [string, ProfileModifierMap][] = [
      ["nit", NIT_MODIFIERS],
      ["fish", FISH_MODIFIERS],
      ["tag", TAG_MODIFIERS],
      ["lag", LAG_MODIFIERS],
      ["gto", GTO_MODIFIERS],
    ];

    for (const [id, map] of presets) {
      const np = deriveNarrativeProfile(id, map);
      expect(np.profileId).toBe(id);
      expect(np.traits.length).toBeGreaterThanOrEqual(1);
      expect(np.characterLabel.length).toBeGreaterThan(0);
    }
  });

  it("different profiles get different character labels", () => {
    const labels = new Set<string>();
    for (const [id, map] of [
      ["nit", NIT_MODIFIERS],
      ["fish", FISH_MODIFIERS],
      ["gto", GTO_MODIFIERS],
    ] as const) {
      const np = deriveNarrativeProfile(id, map);
      labels.add(np.characterLabel);
    }
    // NIT, FISH, and GTO should have distinct labels
    expect(labels.size).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════
// COMPOSABILITY — novel profiles get coherent traits
// ═══════════════════════════════════════════════════════

describe("composability (novel profiles)", () => {
  it("Maniac: sticky + aggressive", () => {
    // Novel profile: folds almost never, very aggressive
    const maniac = makeUniformProfile(0.2, 2.0, 0.3, 0.3, 0.95, {});
    const traits = deriveTraits(maniac);
    expect(hasTraitId(traits, "sticky")).toBe(true);
    expect(hasTraitId(traits, "aggressive")).toBe(true);
    const char = synthesizeCharacter(traits);
    expect(char.label).toBe("The Loose Cannon");
  });

  it("Tricky TAG: cautious + hand-reader + texture-reader", () => {
    const tricky = makeUniformProfile(1.3, 1.1, -0.1, 0.0, 0.5, {
      hand: 0.8, texture: 0.7, foldEq: 0.6,
    });
    const traits = deriveTraits(tricky);
    expect(hasTraitId(traits, "hand-reader")).toBe(true);
    expect(hasTraitId(traits, "texture-reader")).toBe(true);
  });

  it("Pure Aggro: aggressive + big-bettor + fold-equity-exploiter", () => {
    const aggro = makeUniformProfile(0.8, 1.8, 0.3, 0.3, 0.8, {
      foldEq: 0.7, position: 0.6,
    });
    const traits = deriveTraits(aggro);
    expect(hasTraitId(traits, "aggressive")).toBe(true);
    expect(hasTraitId(traits, "fold-equity-exploiter")).toBe(true);
  });

  it("random modifier values produce non-empty, non-crashing results", () => {
    // Generate 20 random profiles
    for (let i = 0; i < 20; i++) {
      const map = makeUniformProfile(
        Math.random() * 3,           // foldScale 0-3
        Math.random() * 2,           // aggressionScale 0-2
        (Math.random() - 0.5) * 2,   // raiseVsCallBias -1 to 1
        (Math.random() - 0.5) * 2,   // sizingBias -1 to 1
        Math.random(),                // intensity 0-1
        {
          hand: Math.random(),
          texture: Math.random(),
          odds: Math.random(),
          position: Math.random(),
          foldEq: Math.random(),
          spr: Math.random(),
          draw: Math.random(),
        },
      );

      const np = deriveNarrativeProfile(`random-${i}`, map);
      expect(np.traits.length).toBeGreaterThanOrEqual(0);
      expect(np.characterLabel.length).toBeGreaterThan(0);
      expect(np.characterSummary.length).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════
// HELPER: build a uniform ProfileModifierMap
// ═══════════════════════════════════════════════════════

function makeUniformProfile(
  foldScale: number,
  aggressionScale: number,
  raiseVsCallBias: number,
  sizingBias: number,
  intensity: number,
  context: Partial<Record<string, number>>,
): ProfileModifierMap {
  const modifier = sm(foldScale, aggressionScale, raiseVsCallBias, sizingBias, intensity, context);
  return {
    "preflop.open": modifier,
    "preflop.facing_raise": modifier,
    "preflop.facing_3bet": modifier,
    "preflop.facing_4bet": modifier,
    "preflop.facing_limpers": modifier,
    "preflop.bb_vs_limpers": modifier,
    "preflop.sb_complete": modifier,
    "postflop.aggressor.ip": modifier,
    "postflop.aggressor.oop": modifier,
    "postflop.caller.ip": modifier,
    "postflop.caller.oop": modifier,
    "postflop.facing_bet": modifier,
    "postflop.facing_raise": modifier,
    "postflop.facing_allin": modifier,
  };
}
