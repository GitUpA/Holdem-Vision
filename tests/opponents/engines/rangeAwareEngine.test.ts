import { describe, it, expect } from "vitest";
import { rangeAwareEngine } from "../../../convex/lib/opponents/engines/rangeAwareEngine";
import { basicEngine } from "../../../convex/lib/opponents/engines/basicEngine";
import { initializeHand, applyAction, currentLegalActions } from "../../../convex/lib/state/state-machine";
import { createHeadsUpConfig } from "../../state/helpers";
import { TAG_PROFILE, LAG_PROFILE } from "../../../convex/lib/opponents/presets";
import { resolveProfile } from "../../../convex/lib/opponents/profileResolver";
import { classifyCurrentDecision } from "../../../convex/lib/opponents/autoPlay";
import { seededRandom } from "../../../convex/lib/primitives/deck";
import type { DecisionContext } from "../../../convex/lib/opponents/engines/types";

// ─── Helpers ───

function buildContext(
  state: Parameters<typeof classifyCurrentDecision>[0],
  seatIndex: number,
  profile: typeof TAG_PROFILE,
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

describe("rangeAwareEngine", () => {
  it("has correct id and metadata", () => {
    expect(rangeAwareEngine.id).toBe("range-aware");
    expect(rangeAwareEngine.name).toBeDefined();
    expect(rangeAwareEngine.description).toBeDefined();
  });

  it("returns valid EngineDecision shape", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, TAG_PROFILE);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    expect(decision.actionType).toBeDefined();
    expect(decision.situationKey).toBeDefined();
    expect(decision.engineId).toBe("range-aware");
    expect(decision.explanation).toBeDefined();
    expect(decision.explanation.summary).toBeDefined();
    expect(decision.explanation.children).toBeDefined();
    expect(decision.explanation.children!.length).toBeGreaterThan(0);
  });

  it("includes reasoning metadata", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, TAG_PROFILE);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    expect(decision.reasoning).toBeDefined();
    expect(typeof decision.reasoning!.handStrength).toBe("number");
    expect(typeof decision.reasoning!.adjustedContinuePct).toBe("number");
    expect(typeof decision.reasoning!.adjustedRaisePct).toBe("number");
  });

  it("produces valid action types", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const random = seededRandom(1);

    for (let i = 0; i < 50; i++) {
      const ctx = buildContext(state, seatIndex, TAG_PROFILE, i);
      if (!ctx) continue;
      ctx.random = random;
      const decision = rangeAwareEngine.decide(ctx);
      expect(["fold", "check", "call", "bet", "raise", "all_in"]).toContain(decision.actionType);
    }
  });

  it("produces legal raise amounts", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const random = seededRandom(1);

    for (let i = 0; i < 100; i++) {
      const ctx = buildContext(state, seatIndex, LAG_PROFILE, i);
      if (!ctx) continue;
      ctx.random = random;
      const decision = rangeAwareEngine.decide(ctx);
      if (decision.actionType === "raise" && decision.amount !== undefined) {
        expect(decision.amount).toBeGreaterThanOrEqual(ctx.legal.raiseMin);
        expect(decision.amount).toBeLessThanOrEqual(ctx.legal.raiseMax);
      }
      if (decision.actionType === "bet" && decision.amount !== undefined) {
        expect(decision.amount).toBeGreaterThanOrEqual(ctx.legal.betMin);
        expect(decision.amount).toBeLessThanOrEqual(ctx.legal.betMax);
      }
    }
  });

  it("includes board texture in postflop explanations", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    // Get to flop: BTN raises, BB calls
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "raise", 6).state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    // Now on flop — BB acts first
    const flopSeat = s.players[s.activePlayerIndex!].seatIndex;
    const ctx = buildContext(s, flopSeat, TAG_PROFILE);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    const tags = decision.explanation.children!.flatMap((c) => c.tags ?? []);
    expect(tags).toContain("board-texture");
    expect(tags).toContain("hand-strength");
  });

  it("explanation has tagged children for each reasoning step", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, TAG_PROFILE);
    if (!ctx) return;

    const decision = rangeAwareEngine.decide(ctx);
    const allTags = decision.explanation.children!.flatMap((c) => c.tags ?? []);
    expect(allTags).toContain("decision");
    expect(allTags).toContain("hand-strength");
    expect(allTags).toContain("adjusted-params");
  });
});
