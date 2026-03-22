import { describe, it, expect } from "vitest";
import { modifiedGtoEngine } from "../../../convex/lib/opponents/engines/modifiedGtoEngine";
import { initializeHand, currentLegalActions } from "../../../convex/lib/state/stateMachine";
import { createHeadsUpConfig } from "../../state/helpers";
import {
  NIT_PROFILE,
  FISH_PROFILE,
  TAG_PROFILE,
  LAG_PROFILE,
  GTO_PROFILE,
  getAllPresets,
} from "../../../convex/lib/opponents/presets";
import { resolveProfile } from "../../../convex/lib/opponents/profileResolver";
import { classifyCurrentDecision } from "../../../convex/lib/opponents/autoPlay";
import { seededRandom } from "../../../convex/lib/primitives/deck";
import type { DecisionContext } from "../../../convex/lib/opponents/engines/types";
import type { OpponentProfile } from "../../../convex/lib/types/opponents";

// Ensure engine is registered
import "../../../convex/lib/opponents/engines/modifiedGtoEngine";

// ─── Helpers ───

function buildContext(
  state: Parameters<typeof classifyCurrentDecision>[0],
  seatIndex: number,
  profile: OpponentProfile,
  seed: number = 42,
): DecisionContext | null {
  const legal = currentLegalActions(state);
  if (!legal) return null;

  const resolved = resolveProfile(profile, () => undefined);
  const situationKey = classifyCurrentDecision(state, seatIndex);
  const params = resolved[situationKey];

  return {
    state,
    seatIndex,
    profile,
    resolvedParams: resolved,
    situationKey,
    params,
    legal,
    potSize: state.pot.total,
    holeCards: state.players[seatIndex]?.holeCards,
    getBase: () => undefined,
    random: seededRandom(seed),
  };
}

describe("modifiedGtoEngine", () => {
  it("has correct id and metadata", () => {
    expect(modifiedGtoEngine.id).toBe("modified-gto");
    expect(modifiedGtoEngine.name).toBe("Modified GTO Engine");
    expect(modifiedGtoEngine.description).toBeDefined();
  });

  it("returns valid EngineDecision shape for all profiles", () => {
    const profiles = getAllPresets();
    for (const profile of profiles) {
      const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
      const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
      const ctx = buildContext(state, seatIndex, profile);
      if (!ctx) continue;

      const decision = modifiedGtoEngine.decide(ctx);
      expect(decision.actionType).toBeDefined();
      expect(decision.situationKey).toBeDefined();
      expect(decision.engineId).toBe("modified-gto");
      expect(decision.explanation).toBeDefined();
      expect(decision.explanation.summary).toBeDefined();
      expect(decision.explanation.children).toBeDefined();
      expect(decision.explanation.children!.length).toBeGreaterThan(0);
      expect(decision.explanation.tags).toContain("modified-gto");
    }
  });

  it("includes reasoning metadata", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, TAG_PROFILE);
    if (!ctx) return;

    const decision = modifiedGtoEngine.decide(ctx);
    expect(decision.reasoning).toBeDefined();
    expect(typeof decision.reasoning!.handStrength).toBe("number");
    expect(typeof decision.reasoning!.boardWetness).toBe("number");
    expect(typeof decision.reasoning!.potOdds).toBe("number");
    expect(typeof decision.reasoning!.foldEquity).toBe("number");
    expect(typeof decision.reasoning!.spr).toBe("number");
    expect(decision.reasoning!.profileId).toBe("tag");
    expect(decision.reasoning!.gtoSource).toBeDefined();
  });

  it("GTO profile produces identity modifier (intensity near 0)", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, GTO_PROFILE);
    if (!ctx) return;

    const decision = modifiedGtoEngine.decide(ctx);
    expect(decision.reasoning!.modifierIntensity).toBeLessThanOrEqual(0.001);
  });

  it("produces valid action types over many trials for each profile", () => {
    const profiles = [NIT_PROFILE, FISH_PROFILE, TAG_PROFILE, LAG_PROFILE, GTO_PROFILE];
    const validActions = new Set(["fold", "check", "call", "bet", "raise", "all_in"]);

    for (const profile of profiles) {
      for (let seed = 0; seed < 50; seed++) {
        const { state } = initializeHand(createHeadsUpConfig({ seed }));
        const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
        const ctx = buildContext(state, seatIndex, profile, seed);
        if (!ctx) continue;

        const decision = modifiedGtoEngine.decide(ctx);
        expect(validActions.has(decision.actionType)).toBe(true);
      }
    }
  });

  it("is deterministic with same seed", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;

    const ctx1 = buildContext(state, seatIndex, TAG_PROFILE, 123);
    const ctx2 = buildContext(state, seatIndex, TAG_PROFILE, 123);
    if (!ctx1 || !ctx2) return;

    const d1 = modifiedGtoEngine.decide(ctx1);
    const d2 = modifiedGtoEngine.decide(ctx2);
    expect(d1.actionType).toBe(d2.actionType);
    expect(d1.amount).toBe(d2.amount);
  });

  it("different seeds can produce different actions", () => {
    // Across many different deals and seeds, we should see action variety
    const allActions = new Set<string>();
    const profiles = [NIT_PROFILE, FISH_PROFILE, TAG_PROFILE, LAG_PROFILE, GTO_PROFILE];
    for (const profile of profiles) {
      for (let dealSeed = 0; dealSeed < 20; dealSeed++) {
        const { state } = initializeHand(createHeadsUpConfig({ seed: dealSeed }));
        const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
        const ctx = buildContext(state, seatIndex, profile, dealSeed * 7);
        if (!ctx) continue;

        const decision = modifiedGtoEngine.decide(ctx);
        allActions.add(decision.actionType);
      }
    }
    // Across different profiles and hands we should see variety
    expect(allActions.size).toBeGreaterThanOrEqual(2);
  });

  it("explanation tree has GTO base frequencies node", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, NIT_PROFILE);
    if (!ctx) return;

    const decision = modifiedGtoEngine.decide(ctx);
    const gtoBase = decision.explanation.children?.find(
      (c) => c.tags?.includes("gto-base"),
    );
    expect(gtoBase).toBeDefined();
  });

  it("non-GTO profiles include modifier explanation", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, NIT_PROFILE);
    if (!ctx) return;

    const decision = modifiedGtoEngine.decide(ctx);
    const modNode = decision.explanation.children?.find(
      (c) => c.tags?.includes("modifier"),
    );
    expect(modNode).toBeDefined();
    expect(modNode!.tags).toContain("nit");
    expect(modNode!.detail).toBeDefined(); // deviationReason
  });

  it("GTO profile does NOT include modifier explanation", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, GTO_PROFILE);
    if (!ctx) return;

    const decision = modifiedGtoEngine.decide(ctx);
    const modNode = decision.explanation.children?.find(
      (c) => c.tags?.includes("modifier"),
    );
    expect(modNode).toBeUndefined();
  });
});
