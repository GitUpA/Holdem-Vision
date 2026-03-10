import { describe, it, expect } from "vitest";
import { resolveProfile, isCompleteProfile } from "../../convex/lib/opponents/profileResolver";
import type { OpponentProfile, BehavioralParams, SituationKey } from "../../convex/lib/types/opponents";
import { ALL_SITUATION_KEYS } from "../../convex/lib/types/opponents";

/** Helper: create a complete BehavioralParams with defaults. */
function makeParams(overrides: Partial<BehavioralParams> = {}): BehavioralParams {
  return {
    continuePct: 50,
    raisePct: 30,
    positionAwareness: 0.5,
    bluffFrequency: 0.1,
    sizings: [],
    explanation: "test",
    ...overrides,
  };
}

/** Helper: create a profile with all 11 situations using the same defaults. */
function makeCompleteProfile(
  id: string,
  name: string,
  overrides: Partial<Record<SituationKey, Partial<BehavioralParams>>> = {},
): OpponentProfile {
  const situations: Partial<Record<SituationKey, BehavioralParams>> = {};
  for (const key of ALL_SITUATION_KEYS) {
    situations[key] = makeParams(overrides[key]);
  }
  return { id, name, description: `${name} profile`, situations };
}

describe("resolveProfile", () => {
  it("resolves a complete profile with no base", () => {
    const profile = makeCompleteProfile("tag", "TAG");
    const resolved = resolveProfile(profile, () => undefined);

    expect(Object.keys(resolved)).toHaveLength(11);
    for (const key of ALL_SITUATION_KEYS) {
      expect(resolved[key]).toBeDefined();
      expect(resolved[key].continuePct).toBe(50);
    }
  });

  it("resolves single-level inheritance", () => {
    const base = makeCompleteProfile("tag", "TAG", {
      "preflop.open": { continuePct: 22 },
    });

    const derived: OpponentProfile = {
      id: "agg-tag",
      name: "Aggressive TAG",
      description: "TAG with wider opens",
      baseProfileId: "tag",
      situations: {
        "preflop.open": makeParams({ continuePct: 28 }),
      },
    };

    const getBase = (id: string) => (id === "tag" ? base : undefined);
    const resolved = resolveProfile(derived, getBase);

    // Override applied
    expect(resolved["preflop.open"].continuePct).toBe(28);
    // Inherited from base
    expect(resolved["preflop.facing_raise"].continuePct).toBe(50);
    // All 11 present
    expect(Object.keys(resolved)).toHaveLength(11);
  });

  it("resolves multi-level inheritance", () => {
    const grandparent = makeCompleteProfile("tag", "TAG", {
      "preflop.open": { continuePct: 22 },
      "postflop.aggressor.ip": { bluffFrequency: 0.15 },
    });

    const parent: OpponentProfile = {
      id: "agg-tag",
      name: "Aggressive TAG",
      description: "More aggressive",
      baseProfileId: "tag",
      situations: {
        "preflop.open": makeParams({ continuePct: 28 }),
      },
    };

    const child: OpponentProfile = {
      id: "ultra-agg",
      name: "Ultra Aggressive",
      description: "Even more aggressive",
      baseProfileId: "agg-tag",
      situations: {
        "postflop.aggressor.ip": makeParams({ bluffFrequency: 0.45 }),
      },
    };

    const profiles = new Map<string, OpponentProfile>([
      ["tag", grandparent],
      ["agg-tag", parent],
    ]);
    const getBase = (id: string) => profiles.get(id);

    const resolved = resolveProfile(child, getBase);

    // Child override
    expect(resolved["postflop.aggressor.ip"].bluffFrequency).toBe(0.45);
    // Parent override (inherited through parent)
    expect(resolved["preflop.open"].continuePct).toBe(28);
    // Grandparent default
    expect(resolved["preflop.facing_raise"].continuePct).toBe(50);
  });

  it("throws when missing situations after resolution", () => {
    const incomplete: OpponentProfile = {
      id: "bad",
      name: "Bad",
      description: "Missing situations",
      situations: {
        "preflop.open": makeParams(),
      },
    };

    expect(() => resolveProfile(incomplete, () => undefined)).toThrow(
      /missing situation/i,
    );
  });

  it("respects max depth to prevent infinite loops", () => {
    // Create a chain of 10 profiles, each with only 1 situation
    const profiles = new Map<string, OpponentProfile>();

    for (let i = 0; i < 10; i++) {
      profiles.set(`p${i}`, {
        id: `p${i}`,
        name: `Profile ${i}`,
        description: "",
        baseProfileId: i < 9 ? `p${i + 1}` : undefined,
        situations: {
          [ALL_SITUATION_KEYS[i % ALL_SITUATION_KEYS.length]]: makeParams({
            continuePct: i * 10,
          }),
        },
      });
    }

    // With maxDepth=5, only first 6 profiles in chain are visited
    // This should throw because not all situations are covered
    const getBase = (id: string) => profiles.get(id);
    expect(() => resolveProfile(profiles.get("p0")!, getBase, 5)).toThrow(
      /missing situation/i,
    );
  });

  it("handles missing base gracefully", () => {
    const profile = makeCompleteProfile("tag", "TAG");
    // Set a baseProfileId that doesn't exist — should still work since profile is complete
    profile.baseProfileId = "nonexistent";

    const resolved = resolveProfile(profile, () => undefined);
    expect(Object.keys(resolved)).toHaveLength(11);
  });
});

describe("isCompleteProfile", () => {
  it("returns true for complete profiles", () => {
    const profile = makeCompleteProfile("tag", "TAG");
    expect(isCompleteProfile(profile)).toBe(true);
  });

  it("returns false for partial profiles", () => {
    const profile: OpponentProfile = {
      id: "partial",
      name: "Partial",
      description: "",
      situations: {
        "preflop.open": makeParams(),
      },
    };
    expect(isCompleteProfile(profile)).toBe(false);
  });
});
