import { describe, it, expect } from "vitest";
import { gtoEngine } from "../../../convex/lib/opponents/engines/gtoEngine";
import { initializeHand, applyAction, currentLegalActions } from "../../../convex/lib/state/state-machine";
import { createHeadsUpConfig, createTestConfig } from "../../state/helpers";
import { GTO_PROFILE } from "../../../convex/lib/opponents/presets";
import { resolveProfile } from "../../../convex/lib/opponents/profileResolver";
import { classifyCurrentDecision } from "../../../convex/lib/opponents/autoPlay";
import { seededRandom } from "../../../convex/lib/primitives/deck";
import type { DecisionContext } from "../../../convex/lib/opponents/engines/types";

// ─── Helpers ───

function buildContext(
  state: Parameters<typeof classifyCurrentDecision>[0],
  seatIndex: number,
  seed: number = 42,
): DecisionContext | null {
  const legal = currentLegalActions(state);
  if (!legal) return null;

  const resolved = resolveProfile(GTO_PROFILE, () => undefined);
  const situationKey = classifyCurrentDecision(state, seatIndex);
  const params = resolved[situationKey];

  return {
    state,
    seatIndex,
    profile: GTO_PROFILE,
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

describe("gtoEngine", () => {
  it("has correct id and metadata", () => {
    expect(gtoEngine.id).toBe("gto");
    expect(gtoEngine.name).toBe("GTO Engine");
    expect(gtoEngine.description).toBeDefined();
  });

  it("returns valid EngineDecision shape", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex);
    if (!ctx) return;

    const decision = gtoEngine.decide(ctx);
    expect(decision.actionType).toBeDefined();
    expect(decision.situationKey).toBeDefined();
    expect(decision.engineId).toBe("gto");
    expect(decision.explanation).toBeDefined();
    expect(decision.explanation.summary).toBeDefined();
    expect(decision.explanation.children).toBeDefined();
    expect(decision.explanation.children!.length).toBeGreaterThan(0);
    expect(decision.explanation.tags).toContain("gto-engine");
  });

  it("includes reasoning metadata", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;
    const ctx = buildContext(state, seatIndex);
    if (!ctx) return;

    const decision = gtoEngine.decide(ctx);
    expect(decision.reasoning).toBeDefined();
    expect(typeof decision.reasoning!.handStrength).toBe("number");
    expect(typeof decision.reasoning!.adjustedContinuePct).toBe("number");
    expect(typeof decision.reasoning!.adjustedRaisePct).toBe("number");
    expect(typeof decision.reasoning!.adjustedBluffFrequency).toBe("number");
    expect(typeof decision.reasoning!.isBluff).toBe("boolean");
  });

  it("produces valid action types over many trials", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;

    for (let i = 0; i < 50; i++) {
      const ctx = buildContext(state, seatIndex, i);
      if (!ctx) continue;
      const decision = gtoEngine.decide(ctx);
      expect(["fold", "check", "call", "bet", "raise", "all_in"]).toContain(decision.actionType);
    }
  });

  it("produces legal raise amounts", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    const seatIndex = state.players[state.activePlayerIndex!].seatIndex;

    for (let i = 0; i < 100; i++) {
      const ctx = buildContext(state, seatIndex, i);
      if (!ctx) continue;
      const decision = gtoEngine.decide(ctx);
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

  // ─── MDF defense tests ───

  it("defends at MDF — continues more when facing small bets vs large", () => {
    // Get to flop
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "raise", 6).state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    // On flop — BB acts first

    const flopSeatIdx = s.activePlayerIndex!;
    const flopSeat = s.players[flopSeatIdx].seatIndex;

    // Give hero a marginal hand (middle pair)
    const _7h = 5 * 4 + 2; // 7♥
    const _8d = 6 * 4 + 1; // 8♦

    const modState = {
      ...s,
      players: s.players.map((p, i) =>
        i === flopSeatIdx ? { ...p, holeCards: [_7h, _8d] } : p,
      ),
      communityCards: [
        7 * 4 + 0,  // 9♣
        3 * 4 + 3,  // 5♠
        10 * 4 + 1, // Q♦
      ],
    };

    // Simulate "facing a small bet" (low pot odds → high MDF)
    // vs "facing a large bet" (high pot odds → low MDF)
    let smallBetContinues = 0;
    let largeBetContinues = 0;
    const trials = 200;

    for (let i = 0; i < trials; i++) {
      // Small bet scenario: call amount is 20% of pot → pot odds ~17% → MDF ~83%
      const smallBetCtx = buildContext(modState, flopSeat, i);
      if (smallBetCtx) {
        smallBetCtx.legal = {
          ...smallBetCtx.legal,
          canCall: true,
          callAmount: 3,
          canFold: true,
        };
        smallBetCtx.potSize = 12;
        const d = gtoEngine.decide(smallBetCtx);
        if (d.actionType !== "fold") smallBetContinues++;
      }

      // Large bet scenario: call amount is 100% of pot → pot odds ~50% → MDF ~50%
      const largeBetCtx = buildContext(modState, flopSeat, i);
      if (largeBetCtx) {
        largeBetCtx.legal = {
          ...largeBetCtx.legal,
          canCall: true,
          callAmount: 12,
          canFold: true,
        };
        largeBetCtx.potSize = 12;
        const d = gtoEngine.decide(largeBetCtx);
        if (d.actionType !== "fold") largeBetContinues++;
      }
    }

    // Should defend more often against small bets (higher MDF)
    expect(smallBetContinues).toBeGreaterThan(largeBetContinues);
  });

  it("MDF appears in reasoning when facing bets postflop", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "raise", 6).state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    const flopSeat = s.players[s.activePlayerIndex!].seatIndex;

    const ctx = buildContext(s, flopSeat);
    if (!ctx) return;

    // Set up as facing a bet
    ctx.legal = {
      ...ctx.legal,
      canCall: true,
      callAmount: 6,
      canFold: true,
    };

    const decision = gtoEngine.decide(ctx);
    const allTags = decision.explanation.children!.flatMap((c) => c.tags ?? []);
    expect(allTags).toContain("mdf");
    expect(allTags).toContain("gto");

    // Reasoning should include MDF value
    expect(decision.reasoning!.mdf).toBeDefined();
    expect(typeof decision.reasoning!.mdf).toBe("number");
  });

  // ─── Preflop position tests ───

  it("preflop explanation includes position tag with full awareness", () => {
    const config = createTestConfig({ numPlayers: 6, seed: 42 });
    const { state } = initializeHand(config);

    const utg = state.players.find((p) => p.position === "utg")!;
    const ctx = buildContext(state, utg.seatIndex);
    if (!ctx) return;

    const decision = gtoEngine.decide(ctx);
    const allTags = decision.explanation.children!.flatMap((c) => c.tags ?? []);
    expect(allTags).toContain("position");
    expect(allTags).toContain("preflop");

    const posNode = decision.explanation.children!.find(
      (c) => c.tags?.includes("position"),
    );
    expect(posNode).toBeDefined();
    expect(posNode!.summary).toContain("UTG");
    expect(decision.reasoning!.position).toBe("utg");
  });

  // ─── Board texture sizing tests ───

  it("includes sizing explanation on postflop", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "raise", 6).state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    const flopSeat = s.players[s.activePlayerIndex!].seatIndex;

    const ctx = buildContext(s, flopSeat);
    if (!ctx) return;

    const decision = gtoEngine.decide(ctx);
    const allTags = decision.explanation.children!.flatMap((c) => c.tags ?? []);
    // Should have sizing explanation when betting is possible
    if (ctx.legal.canBet || ctx.legal.canRaise) {
      expect(allTags).toContain("sizing");
    }
  });

  it("includes board texture in postflop explanations", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "raise", 6).state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    const flopSeat = s.players[s.activePlayerIndex!].seatIndex;

    const ctx = buildContext(s, flopSeat);
    if (!ctx) return;

    const decision = gtoEngine.decide(ctx);
    const tags = decision.explanation.children!.flatMap((c) => c.tags ?? []);
    expect(tags).toContain("board-texture");
    expect(tags).toContain("hand-strength");
  });
});
