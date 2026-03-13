import { describe, it, expect } from "vitest";
import { coachingLens } from "../../convex/lib/analysis/coachingLens";
import type { CoachingValue } from "../../convex/lib/analysis/coachingLens";
import { initializeHand, analysisContextFromState } from "../../convex/lib/state/state-machine";
import { createHeadsUpConfig, createTestConfig } from "../state/helpers";
import { PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import type { AnalysisContext } from "../../convex/lib/types/analysis";

// ─── Helpers ───

function makeContext(seed: number = 42, numPlayers: number = 2): AnalysisContext {
  const config = numPlayers === 2
    ? createHeadsUpConfig({ seed })
    : createTestConfig({ seed, numPlayers });
  const { state } = initializeHand(config);

  // Hero is seat 0
  const bridgeConfig = {
    seatProfiles: new Map(
      state.players
        .filter((p) => p.seatIndex !== 0)
        .map((p) => [p.seatIndex, PRESET_PROFILES["tag"]]),
    ),
    getBase: (id: string) => PRESET_PROFILES[id],
  };

  return analysisContextFromState(state, 0, bridgeConfig);
}

describe("coachingLens", () => {
  it("has correct metadata", () => {
    expect(coachingLens.id).toBe("coaching");
    expect(coachingLens.name).toBe("Coaching");
    expect(coachingLens.heavy).toBe(true);
  });

  it("returns empty result when no game state", () => {
    const context: AnalysisContext = {
      heroCards: [0, 1],
      communityCards: [],
      deadCards: [],
      street: "preflop",
      opponents: [],
    };

    const result = coachingLens.analyze(context);
    const value = result.value as CoachingValue;
    expect(value.advices).toHaveLength(0);
    expect(result.lensId).toBe("coaching");
  });

  it("returns empty result when hero has no cards", () => {
    const context = makeContext();
    context.heroCards = [];
    const result = coachingLens.analyze(context);
    const value = result.value as CoachingValue;
    expect(value.advices).toHaveLength(0);
  });

  it("produces advice from all 5 preset profiles", () => {
    const context = makeContext();
    const result = coachingLens.analyze(context);
    const value = result.value as CoachingValue;

    expect(value.advices).toHaveLength(5);
    const profileIds = value.advices.map((a) => a.profileId);
    expect(profileIds).toContain("nit");
    expect(profileIds).toContain("fish");
    expect(profileIds).toContain("tag");
    expect(profileIds).toContain("lag");
    expect(profileIds).toContain("gto");
  });

  it("emits a coaching visual directive when advices exist", () => {
    const context = makeContext();
    const result = coachingLens.analyze(context);

    expect(result.visuals).toHaveLength(1);
    expect(result.visuals[0].type).toBe("coaching");
    expect(result.visuals[0].lensId).toBe("coaching");
    expect(result.visuals[0].priority).toBe(100);

    const data = result.visuals[0].data as { advices: unknown[]; consensus?: unknown };
    expect(data.advices).toHaveLength(5);
  });

  it("each advice has valid action types", () => {
    const context = makeContext();
    const result = coachingLens.analyze(context);
    const value = result.value as CoachingValue;

    const validActions = ["fold", "check", "call", "bet", "raise", "all_in"];
    for (const advice of value.advices) {
      expect(validActions).toContain(advice.actionType);
      expect(advice.profileName).toBeDefined();
      expect(advice.engineId).toBeDefined();
      expect(advice.explanation).toBeDefined();
      expect(advice.explanation.summary).toBeDefined();
    }
  });

  it("each advice uses the correct engine for its profile", () => {
    const context = makeContext();
    const result = coachingLens.analyze(context);
    const value = result.value as CoachingValue;

    const nitAdvice = value.advices.find((a) => a.profileId === "nit")!;
    expect(nitAdvice.engineId).toBe("basic");

    const tagAdvice = value.advices.find((a) => a.profileId === "tag")!;
    expect(tagAdvice.engineId).toBe("range-aware");

    const lagAdvice = value.advices.find((a) => a.profileId === "lag")!;
    expect(lagAdvice.engineId).toBe("range-aware");
  });

  it("detects consensus when profiles agree", () => {
    // Run multiple seeds to find one with consensus
    let foundConsensus = false;
    for (let seed = 1; seed < 50 && !foundConsensus; seed++) {
      const context = makeContext(seed);
      const result = coachingLens.analyze(context);
      const value = result.value as CoachingValue;
      if (value.consensus) {
        foundConsensus = true;
        expect(value.consensus.agreeing.length).toBeGreaterThanOrEqual(2);
        expect(value.consensus.actionType).toBeDefined();
      }
    }
    // It's very likely at least one seed produces consensus across 50 tries
    expect(foundConsensus).toBe(true);
  });

  it("explanation tree has per-profile children", () => {
    const context = makeContext();
    const result = coachingLens.analyze(context);

    expect(result.explanation.children).toBeDefined();
    expect(result.explanation.children!.length).toBe(5);
    expect(result.explanation.summary).toContain("Coaching");
  });

  it("is deterministic with same seed", () => {
    const context1 = makeContext(42);
    const context2 = makeContext(42);
    const result1 = coachingLens.analyze(context1);
    const result2 = coachingLens.analyze(context2);
    const value1 = result1.value as CoachingValue;
    const value2 = result2.value as CoachingValue;

    for (let i = 0; i < value1.advices.length; i++) {
      expect(value1.advices[i].actionType).toBe(value2.advices[i].actionType);
      expect(value1.advices[i].amount).toBe(value2.advices[i].amount);
    }
  });
});
