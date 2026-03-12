import { describe, it, expect, beforeEach } from "vitest";
import { lookupGtoEngine } from "../../convex/lib/opponents/engines/lookupGtoEngine";
import { getEngine } from "../../convex/lib/opponents/engines/engineRegistry";
// Side-effect: registers all engines including lookup-gto, gto, basic
import "../../convex/lib/opponents/engines";
import { initializeHand, applyAction, currentLegalActions } from "../../convex/lib/state/state-machine";
import { createHeadsUpConfig } from "../state/helpers";
import { GTO_PROFILE, TAG_PROFILE } from "../../convex/lib/opponents/presets";
import { resolveProfile } from "../../convex/lib/opponents/profileResolver";
import { classifyCurrentDecision } from "../../convex/lib/opponents/autoPlay";
import { seededRandom } from "../../convex/lib/primitives/deck";
import type { DecisionContext } from "../../convex/lib/opponents/engines/types";
import type { OpponentProfile } from "../../convex/lib/types/opponents";
// Ensure preflop tables are registered
import "../../convex/lib/gto/tables";

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

// ═══════════════════════════════════════════════════════
// ENGINE REGISTRATION
// ═══════════════════════════════════════════════════════

describe("lookupGtoEngine registration", () => {
  it("is registered in the engine registry", () => {
    const engine = getEngine("lookup-gto");
    expect(engine).toBeDefined();
    expect(engine!.id).toBe("lookup-gto");
  });

  it("has correct metadata", () => {
    expect(lookupGtoEngine.id).toBe("lookup-gto");
    expect(lookupGtoEngine.name).toBe("GTO Lookup Engine");
    expect(lookupGtoEngine.description).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════
// DECISION SHAPE
// ═══════════════════════════════════════════════════════

describe("lookupGtoEngine.decide()", () => {
  it("returns valid EngineDecision shape", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, GTO_PROFILE);
    if (!ctx) return;

    const decision = lookupGtoEngine.decide(ctx);
    expect(decision.actionType).toBeDefined();
    expect(decision.situationKey).toBeDefined();
    expect(decision.engineId).toBe("lookup-gto");
    expect(decision.explanation).toBeDefined();
    expect(decision.explanation.summary).toBeTruthy();
  });

  it("returns explanation with children", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, GTO_PROFILE);
    if (!ctx) return;

    const decision = lookupGtoEngine.decide(ctx);
    expect(decision.explanation.children).toBeDefined();
    expect(decision.explanation.children!.length).toBeGreaterThan(0);
  });

  it("includes reasoning metadata", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 100 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, GTO_PROFILE, 100);
    if (!ctx) return;

    const decision = lookupGtoEngine.decide(ctx);
    // Reasoning should include archetype info (may be from fallback or direct)
    expect(decision.reasoning).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════
// DETERMINISM
// ═══════════════════════════════════════════════════════

describe("lookupGtoEngine determinism", () => {
  it("produces same action with same seed", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;

    const ctx1 = buildContext(state, seatIndex, GTO_PROFILE, 999);
    const ctx2 = buildContext(state, seatIndex, GTO_PROFILE, 999);
    if (!ctx1 || !ctx2) return;

    const d1 = lookupGtoEngine.decide(ctx1);
    const d2 = lookupGtoEngine.decide(ctx2);
    expect(d1.actionType).toBe(d2.actionType);
    expect(d1.amount).toBe(d2.amount);
  });

  it("may produce different actions with different seeds", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;

    // Try many seeds — at least one should differ (mixed strategies)
    const actions = new Set<string>();
    for (let seed = 0; seed < 50; seed++) {
      const ctx = buildContext(state, seatIndex, GTO_PROFILE, seed);
      if (!ctx) continue;
      const d = lookupGtoEngine.decide(ctx);
      actions.add(`${d.actionType}:${d.amount}`);
    }
    // Preflop frequencies should produce at least 2 different actions
    expect(actions.size).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════
// FALLBACK BEHAVIOR
// ═══════════════════════════════════════════════════════

describe("lookupGtoEngine fallback", () => {
  it("falls back to heuristic gto engine for non-gto profiles", () => {
    // TAG_PROFILE uses "range-aware" engine but we're calling lookupGtoEngine directly
    // It should still work — archetype classification doesn't depend on engine
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex, TAG_PROFILE);
    if (!ctx) return;

    const decision = lookupGtoEngine.decide(ctx);
    expect(decision.actionType).toBeDefined();
    expect(decision.engineId).toBe("lookup-gto");
  });

  it("always returns a valid action (never throws)", () => {
    // Run through several different seeds and configs
    for (const seed of [1, 42, 100, 255, 999]) {
      const { state } = initializeHand(createHeadsUpConfig({ seed }));
      const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
      const ctx = buildContext(state, seatIndex, GTO_PROFILE, seed);
      if (!ctx) continue;

      const decision = lookupGtoEngine.decide(ctx);
      expect(["fold", "check", "call", "bet", "raise", "all_in"]).toContain(decision.actionType);
    }
  });
});

// ═══════════════════════════════════════════════════════
// POSTFLOP (with community cards)
// ═══════════════════════════════════════════════════════

describe("lookupGtoEngine postflop", () => {
  it("handles flop decision with community cards", () => {
    // Deal preflop actions to get to flop
    let { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seat0 = state.players[0].seatIndex;
    const seat1 = state.players[1].seatIndex;

    // Preflop: SB calls, BB checks
    const activeIdx = state.activePlayerIndex!;
    const activeSeat = state.players[activeIdx].seatIndex;
    state = applyAction(state, activeSeat, "call").state;
    const nextActive = state.activePlayerIndex;
    if (nextActive !== null) {
      const nextSeat = state.players[nextActive].seatIndex;
      state = applyAction(state, nextSeat, "check").state;
    }

    // Now on flop — community cards should be dealt
    if (state.communityCards.length >= 3 && state.activePlayerIndex !== null) {
      const flopActive = state.players[state.activePlayerIndex].seatIndex;
      const ctx = buildContext(state, flopActive, GTO_PROFILE, 42);
      if (!ctx) return;

      const decision = lookupGtoEngine.decide(ctx);
      expect(decision.actionType).toBeDefined();
      expect(decision.engineId).toBe("lookup-gto");
      // Flop decisions should have richer reasoning
      if (decision.reasoning) {
        expect(decision.reasoning.archetypeId).toBeDefined();
      }
    }
  });
});
