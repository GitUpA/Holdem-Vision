import { describe, it, expect } from "vitest";
import {
  NIT_PROFILE,
  FISH_PROFILE,
  TAG_PROFILE,
  LAG_PROFILE,
  GTO_PROFILE,
  getAllPresets,
  getPreset,
  PRESET_IDS,
} from "../../convex/lib/opponents/presets";
import { ALL_SITUATION_KEYS, deriveTendencies } from "../../convex/lib/types/opponents";
import type { SituationKey, BehavioralParams } from "../../convex/lib/types/opponents";
import { resolveProfile } from "../../convex/lib/opponents/profileResolver";

describe("preset profiles", () => {
  it("has 5 presets", () => {
    const all = getAllPresets();
    expect(all.length).toBe(5);
  });

  it("all presets have required fields", () => {
    for (const p of getAllPresets()) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.description.length).toBeGreaterThan(20);
      expect(p.situations).toBeTruthy();
    }
  });

  it("all presets define all 11 situations", () => {
    for (const p of getAllPresets()) {
      for (const key of ALL_SITUATION_KEYS) {
        expect(p.situations[key], `${p.name} missing ${key}`).toBeDefined();
      }
    }
  });

  it("all situation params are in valid ranges", () => {
    for (const p of getAllPresets()) {
      for (const key of ALL_SITUATION_KEYS) {
        const params = p.situations[key]!;
        expect(params.continuePct).toBeGreaterThanOrEqual(0);
        expect(params.continuePct).toBeLessThanOrEqual(100);
        expect(params.raisePct).toBeGreaterThanOrEqual(0);
        expect(params.raisePct).toBeLessThanOrEqual(100);
        expect(params.positionAwareness).toBeGreaterThanOrEqual(0);
        expect(params.positionAwareness).toBeLessThanOrEqual(1);
        expect(params.bluffFrequency).toBeGreaterThanOrEqual(0);
        expect(params.bluffFrequency).toBeLessThanOrEqual(1);
        expect(params.explanation.length).toBeGreaterThan(10);
      }
    }
  });

  it("all presets resolve fully", () => {
    for (const p of getAllPresets()) {
      const resolved = resolveProfile(p, () => undefined);
      expect(Object.keys(resolved)).toHaveLength(11);
    }
  });

  it("derived stats match expected values", () => {
    const nitStats = deriveTendencies(
      resolveProfile(NIT_PROFILE, () => undefined),
    );
    expect(nitStats.vpip).toBe(12);
    expect(nitStats.foldToCBetPct).toBe(55); // 100 - 45

    const fishStats = deriveTendencies(
      resolveProfile(FISH_PROFILE, () => undefined),
    );
    expect(fishStats.vpip).toBe(55);
    expect(fishStats.foldToCBetPct).toBe(35); // 100 - 65

    const tagStats = deriveTendencies(
      resolveProfile(TAG_PROFILE, () => undefined),
    );
    expect(tagStats.vpip).toBe(22);
    expect(tagStats.foldToCBetPct).toBe(45); // 100 - 55

    const lagStats = deriveTendencies(
      resolveProfile(LAG_PROFILE, () => undefined),
    );
    expect(lagStats.vpip).toBe(35);
    expect(lagStats.foldToCBetPct).toBe(30); // 100 - 70

    const gtoStats = deriveTendencies(
      resolveProfile(GTO_PROFILE, () => undefined),
    );
    expect(gtoStats.vpip).toBe(27);
    expect(gtoStats.foldToCBetPct).toBe(40); // 100 - 60
    expect(gtoStats.positionAwareness).toBe(1.0);
  });

  it("nit has lowest opening range", () => {
    const all = getAllPresets();
    const vpips = all.map((p) => p.situations["preflop.open"]!.continuePct);
    expect(NIT_PROFILE.situations["preflop.open"]!.continuePct).toBe(Math.min(...vpips));
  });

  it("fish has highest opening range", () => {
    expect(FISH_PROFILE.situations["preflop.open"]!.continuePct).toBeGreaterThan(50);
  });

  it("lag has highest postflop aggression (bluff frequency)", () => {
    const all = getAllPresets();
    const bluffs = all.map(
      (p) => p.situations["postflop.aggressor.ip"]!.bluffFrequency,
    );
    expect(LAG_PROFILE.situations["postflop.aggressor.ip"]!.bluffFrequency).toBe(
      Math.max(...bluffs),
    );
  });

  it("gto has perfect position awareness", () => {
    expect(GTO_PROFILE.situations["preflop.open"]!.positionAwareness).toBe(1.0);
  });

  it("getPreset returns correct profile", () => {
    expect(getPreset("nit").id).toBe("nit");
    expect(getPreset("fish").id).toBe("fish");
    expect(getPreset("tag").id).toBe("tag");
    expect(getPreset("lag").id).toBe("lag");
    expect(getPreset("gto").id).toBe("gto");
  });

  it("profiles are distinguishable by opening range", () => {
    const vpips = getAllPresets().map(
      (p) => p.situations["preflop.open"]!.continuePct,
    );
    expect(new Set(vpips).size).toBe(5);
  });

  it("tighter profiles have narrower facing-raise ranges", () => {
    const nitFR = NIT_PROFILE.situations["preflop.facing_raise"]!.continuePct;
    const tagFR = TAG_PROFILE.situations["preflop.facing_raise"]!.continuePct;
    const lagFR = LAG_PROFILE.situations["preflop.facing_raise"]!.continuePct;
    const fishFR = FISH_PROFILE.situations["preflop.facing_raise"]!.continuePct;

    expect(nitFR).toBeLessThan(tagFR);
    expect(tagFR).toBeLessThan(lagFR);
    expect(lagFR).toBeLessThan(fishFR);
  });
});
