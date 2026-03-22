import { describe, it, expect } from "vitest";
import {
  classifyArchetype,
  contextFromGameState,
  derivePotType,
  deriveIsAggressor,
  deriveIsInPosition,
  type ClassificationContext,
  type ActionSummary,
} from "../../convex/lib/gto/archetypeClassifier";
import { initializeHand, applyAction } from "../../convex/lib/state/stateMachine";
import { createTestConfig } from "../state/helpers";
import { cardsFromStrings } from "../../convex/lib/primitives/card";
import type { Position, Street } from "../../convex/lib/types/cards";

// ─── Helpers ───

function makeCtx(overrides: Partial<ClassificationContext>): ClassificationContext {
  return {
    street: "preflop",
    communityCards: [],
    heroPosition: "btn",
    villainPositions: ["bb"],
    potType: "srp",
    actionHistory: [],
    isAggressor: true,
    isInPosition: true,
    actingStreet: "preflop",
    ...overrides,
  };
}

function action(
  position: Position,
  street: Street,
  actionType: ActionSummary["actionType"],
  isHero: boolean = false,
): ActionSummary {
  return { position, street, actionType, isHero };
}

// ═══════════════════════════════════════════════════════
// PREFLOP ARCHETYPES
// ═══════════════════════════════════════════════════════

describe("Preflop Archetypes", () => {
  it("classifies RFI opening — hero opens from CO", () => {
    const ctx = makeCtx({
      heroPosition: "co",
      villainPositions: ["bb", "btn"],
      actionHistory: [
        action("utg", "preflop", "fold"),
        action("hj", "preflop", "fold"),
        action("co", "preflop", "raise", true),
      ],
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("rfi_opening");
    expect(result.category).toBe("preflop");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("classifies RFI opening — hero first to act UTG", () => {
    const ctx = makeCtx({
      heroPosition: "utg",
      villainPositions: ["bb", "btn", "co", "hj"],
      actionHistory: [],
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("rfi_opening");
  });

  it("classifies BB defense vs RFI", () => {
    const ctx = makeCtx({
      heroPosition: "bb",
      villainPositions: ["btn"],
      isAggressor: false,
      isInPosition: false,
      actionHistory: [
        action("btn", "preflop", "raise"),
        action("sb", "preflop", "fold"),
      ],
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("bb_defense_vs_rfi");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("classifies 3-bet pot", () => {
    const ctx = makeCtx({
      heroPosition: "bb",
      villainPositions: ["btn"],
      actionHistory: [
        action("btn", "preflop", "raise"),
        action("sb", "preflop", "fold"),
        action("bb", "preflop", "raise", true), // 3-bet
      ],
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("three_bet_pots");
  });

  it("classifies blind vs blind — SB opens, BB defends", () => {
    const ctx = makeCtx({
      heroPosition: "bb",
      villainPositions: ["sb"],
      isInPosition: true,
      actionHistory: [
        action("sb", "preflop", "raise"),
      ],
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("blind_vs_blind");
  });

  it("classifies 4-bet pot", () => {
    const ctx = makeCtx({
      heroPosition: "btn",
      villainPositions: ["bb"],
      actionHistory: [
        action("btn", "preflop", "raise", true),
        action("bb", "preflop", "raise"),
        action("btn", "preflop", "raise", true), // 4-bet
      ],
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("four_bet_five_bet");
  });

  it("classifies 5-bet pot", () => {
    const ctx = makeCtx({
      heroPosition: "bb",
      villainPositions: ["btn"],
      actionHistory: [
        action("btn", "preflop", "raise"),
        action("bb", "preflop", "raise", true),
        action("btn", "preflop", "raise"),
        action("bb", "preflop", "raise", true), // 5-bet
      ],
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("four_bet_five_bet");
  });
});

// ═══════════════════════════════════════════════════════
// FLOP TEXTURE ARCHETYPES
// ═══════════════════════════════════════════════════════

describe("Flop Texture Archetypes", () => {
  it("classifies ace-high dry rainbow (A82r)", () => {
    const ctx = makeCtx({
      street: "flop",
      actingStreet: "flop",
      communityCards: cardsFromStrings(["As", "8d", "2c"]),
      actionHistory: [
        action("btn", "preflop", "raise", true),
        action("bb", "preflop", "call"),
      ],
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("ace_high_dry_rainbow");
    expect(result.category).toBe("flop_texture");
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("classifies ace-high dry rainbow (A72r)", () => {
    const ctx = makeCtx({
      street: "flop",
      actingStreet: "flop",
      communityCards: cardsFromStrings(["Ad", "7h", "2s"]),
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("ace_high_dry_rainbow");
  });

  it("classifies K-high dry rainbow", () => {
    const ctx = makeCtx({
      street: "flop",
      actingStreet: "flop",
      communityCards: cardsFromStrings(["Ks", "7d", "2c"]),
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("kq_high_dry_rainbow");
  });

  it("classifies Q-high dry rainbow", () => {
    const ctx = makeCtx({
      street: "flop",
      actingStreet: "flop",
      communityCards: cardsFromStrings(["Qh", "5d", "3c"]),
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("kq_high_dry_rainbow");
  });

  it("classifies mid/low dry rainbow (T52r)", () => {
    const ctx = makeCtx({
      street: "flop",
      actingStreet: "flop",
      communityCards: cardsFromStrings(["Ts", "5d", "2c"]),
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("mid_low_dry_rainbow");
  });

  it("classifies paired board", () => {
    const ctx = makeCtx({
      street: "flop",
      actingStreet: "flop",
      communityCards: cardsFromStrings(["Ks", "Kd", "7c"]),
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("paired_boards");
  });

  it("classifies paired board — low pair", () => {
    const ctx = makeCtx({
      street: "flop",
      actingStreet: "flop",
      communityCards: cardsFromStrings(["3s", "3d", "Tc"]),
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("paired_boards");
  });

  it("classifies two-tone disconnected (As 7s 2d)", () => {
    const ctx = makeCtx({
      street: "flop",
      actingStreet: "flop",
      communityCards: cardsFromStrings(["As", "7s", "2d"]),
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("two_tone_disconnected");
  });

  it("classifies two-tone connected (Ts 9s 8d)", () => {
    const ctx = makeCtx({
      street: "flop",
      actingStreet: "flop",
      communityCards: cardsFromStrings(["Ts", "9s", "8d"]),
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("two_tone_connected");
  });

  it("classifies monotone board", () => {
    const ctx = makeCtx({
      street: "flop",
      actingStreet: "flop",
      communityCards: cardsFromStrings(["Ks", "8s", "3s"]),
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("monotone");
  });

  it("classifies rainbow connected (8-7-6 rainbow)", () => {
    const ctx = makeCtx({
      street: "flop",
      actingStreet: "flop",
      communityCards: cardsFromStrings(["8s", "7d", "6c"]),
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("rainbow_connected");
  });
});

// ═══════════════════════════════════════════════════════
// POSTFLOP PRINCIPLE ARCHETYPES
// ═══════════════════════════════════════════════════════

describe("Postflop Principle Archetypes", () => {
  it("classifies 3-bet pot postflop", () => {
    const ctx = makeCtx({
      street: "flop",
      actingStreet: "flop",
      potType: "3bet",
      communityCards: cardsFromStrings(["As", "8d", "2c"]),
      actionHistory: [
        action("btn", "preflop", "raise", true),
        action("bb", "preflop", "raise"),
        action("btn", "preflop", "call", true),
      ],
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("three_bet_pot_postflop");
  });

  it("classifies turn barreling — aggressor on turn", () => {
    const ctx = makeCtx({
      street: "turn",
      actingStreet: "turn",
      communityCards: cardsFromStrings(["As", "8d", "2c", "5h"]),
      isAggressor: true,
      actionHistory: [
        action("btn", "preflop", "raise", true),
        action("bb", "preflop", "call"),
        action("bb", "flop", "check"),
        action("btn", "flop", "bet", true),
        action("bb", "flop", "call"),
        action("bb", "turn", "check"),
      ],
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("turn_barreling");
  });

  it("classifies turn barreling — defender facing turn bet", () => {
    const ctx = makeCtx({
      street: "turn",
      actingStreet: "turn",
      heroPosition: "bb",
      isAggressor: false,
      isInPosition: false,
      communityCards: cardsFromStrings(["As", "8d", "2c", "5h"]),
      actionHistory: [
        action("btn", "preflop", "raise"),
        action("bb", "preflop", "call", true),
        action("bb", "flop", "check", true),
        action("btn", "flop", "bet"),
        action("bb", "flop", "call", true),
        action("bb", "turn", "check", true),
        action("btn", "turn", "bet"),
      ],
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("turn_barreling");
  });

  it("classifies river bluff-catching — facing river bet", () => {
    const ctx = makeCtx({
      street: "river",
      actingStreet: "river",
      heroPosition: "bb",
      isAggressor: false,
      isInPosition: false,
      communityCards: cardsFromStrings(["As", "8d", "2c", "5h", "Jd"]),
      actionHistory: [
        action("bb", "river", "check", true),
        action("btn", "river", "bet"),
      ],
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("river_bluff_catching_mdf");
  });

  it("classifies thin value river — hero's turn to bet on river", () => {
    const ctx = makeCtx({
      street: "river",
      actingStreet: "river",
      heroPosition: "btn",
      isAggressor: true,
      communityCards: cardsFromStrings(["As", "8d", "2c", "5h", "Jd"]),
      actionHistory: [
        action("bb", "river", "check"),
      ],
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("thin_value_river");
  });
});

// ═══════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════

describe("Edge Cases", () => {
  it("returns fallback for ambiguous spots", () => {
    const ctx = makeCtx({
      heroPosition: "hj",
      villainPositions: ["co", "btn", "bb"],
      actionHistory: [
        action("utg", "preflop", "fold"),
        action("hj", "preflop", "raise", true),
        action("co", "preflop", "call"),
      ],
    });
    const result = classifyArchetype(ctx);
    // Should still classify as something preflop
    expect(result.category).toBe("preflop");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("4-bet pot postflop uses three_bet_pot_postflop archetype", () => {
    const ctx = makeCtx({
      street: "flop",
      actingStreet: "flop",
      potType: "4bet",
      communityCards: cardsFromStrings(["Ks", "Jd", "3c"]),
    });
    const result = classifyArchetype(ctx);
    expect(result.archetypeId).toBe("three_bet_pot_postflop");
  });

  it("J-high rainbow classified as kq_high_dry or mid_low_dry", () => {
    const ctx = makeCtx({
      street: "flop",
      actingStreet: "flop",
      communityCards: cardsFromStrings(["Jh", "5d", "2c"]),
    });
    const result = classifyArchetype(ctx);
    // J is rank 9 — below K(11)/Q(10) threshold, so mid_low range
    expect(["kq_high_dry_rainbow", "mid_low_dry_rainbow"]).toContain(result.archetypeId);
  });
});

// ═══════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════

describe("derivePotType", () => {
  it("detects SRP (single raised pot)", () => {
    const config = createTestConfig();
    let { state } = initializeHand(config);
    // UTG folds, HJ folds, CO folds, BTN raises, SB folds, BB calls
    state = applyAction(state, 3, "fold").state;
    state = applyAction(state, 4, "fold").state;
    state = applyAction(state, 5, "fold").state;
    state = applyAction(state, 0, "raise", 6).state;
    state = applyAction(state, 1, "fold").state;
    const potType = derivePotType(state.actionHistory);
    expect(potType).toBe("srp");
  });

  it("detects 3-bet pot", () => {
    const config = createTestConfig();
    let { state } = initializeHand(config);
    state = applyAction(state, 3, "fold").state;
    state = applyAction(state, 4, "fold").state;
    state = applyAction(state, 5, "fold").state;
    state = applyAction(state, 0, "raise", 6).state;
    state = applyAction(state, 1, "fold").state;
    state = applyAction(state, 2, "raise", 18).state;
    const potType = derivePotType(state.actionHistory);
    expect(potType).toBe("3bet");
  });

  it("detects BvB", () => {
    const config = createTestConfig();
    let { state } = initializeHand(config);
    // Everyone folds to SB who completes
    state = applyAction(state, 3, "fold").state;
    state = applyAction(state, 4, "fold").state;
    state = applyAction(state, 5, "fold").state;
    state = applyAction(state, 0, "fold").state;
    state = applyAction(state, 1, "call").state; // SB completes
    const potType = derivePotType(state.actionHistory);
    expect(potType).toBe("bvb");
  });
});

describe("deriveIsAggressor", () => {
  it("last preflop raiser is aggressor", () => {
    const config = createTestConfig();
    let { state } = initializeHand(config);
    state = applyAction(state, 3, "fold").state;
    state = applyAction(state, 4, "fold").state;
    state = applyAction(state, 5, "fold").state;
    state = applyAction(state, 0, "raise", 6).state; // BTN raises (seat 0)
    expect(deriveIsAggressor(state.actionHistory, 0)).toBe(true);
    expect(deriveIsAggressor(state.actionHistory, 2)).toBe(false);
  });
});

describe("deriveIsInPosition", () => {
  it("BTN is in position vs BB", () => {
    expect(deriveIsInPosition("btn", ["bb"])).toBe(true);
  });

  it("BB is out of position vs BTN", () => {
    expect(deriveIsInPosition("bb", ["btn"])).toBe(false);
  });

  it("CO is in position vs UTG and HJ", () => {
    expect(deriveIsInPosition("co", ["utg", "hj"])).toBe(true);
  });

  it("UTG is out of position vs everyone", () => {
    expect(deriveIsInPosition("utg", ["btn", "bb", "co"])).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════
// INTEGRATION: contextFromGameState
// ═══════════════════════════════════════════════════════

describe("contextFromGameState", () => {
  it("builds context from a live game state", () => {
    const config = createTestConfig();
    let { state } = initializeHand(config);
    // BTN raises, all fold to BB who calls
    state = applyAction(state, 3, "fold").state;
    state = applyAction(state, 4, "fold").state;
    state = applyAction(state, 5, "fold").state;
    state = applyAction(state, 0, "raise", 6).state;
    state = applyAction(state, 1, "fold").state;
    state = applyAction(state, 2, "call").state;

    // Now on flop — classify from BTN's perspective (seat 0)
    const ctx = contextFromGameState(state, 0);
    expect(ctx.street).toBe("flop");
    expect(ctx.heroPosition).toBe("btn");
    expect(ctx.potType).toBe("srp");
    expect(ctx.isAggressor).toBe(true);
    expect(ctx.isInPosition).toBe(true);
    expect(ctx.communityCards.length).toBe(3);

    const result = classifyArchetype(ctx);
    expect(result.category).toBe("flop_texture");
  });
});
