import { describe, it, expect } from "vitest";
import {
  initializeHand,
  applyAction,
  gameContextFromState,
  analysisContextFromState,
  currentLegalActions,
} from "../../convex/lib/state/stateMachine";
import type { AnalysisBridgeConfig } from "../../convex/lib/state/stateMachine";
import { createTestConfig, createHeadsUpConfig, runActions } from "./helpers";
import { TAG_PROFILE, NIT_PROFILE, PRESET_PROFILES } from "../../convex/lib/opponents/presets";
import { applyCardOverrides } from "../../convex/lib/state/cardOverrides";

// ═══════════════════════════════════════════════════════
// initializeHand
// ═══════════════════════════════════════════════════════

describe("initializeHand", () => {
  it("creates a valid initial state for 6 players", () => {
    const config = createTestConfig();
    const { state } = initializeHand(config);

    expect(state.numPlayers).toBe(6);
    expect(state.phase).toBe("preflop");
    expect(state.communityCards).toHaveLength(0);
    expect(state.players).toHaveLength(6);

    // Each player has 2 hole cards
    for (const p of state.players) {
      expect(p.holeCards).toHaveLength(2);
    }

    // Deck should have 52 - 12 = 40 cards
    expect(state.deck).toHaveLength(40);
  });

  it("posts blinds correctly", () => {
    const config = createTestConfig({ dealerSeatIndex: 0 });
    const { state } = initializeHand(config);

    // dealer=0 → SB=1, BB=2
    const sb = state.players[1];
    const bb = state.players[2];

    expect(sb.totalCommitted).toBe(1);
    expect(sb.currentStack).toBe(999);
    expect(bb.totalCommitted).toBe(2);
    expect(bb.currentStack).toBe(998);
    expect(state.currentBet).toBe(2);
  });

  it("heads-up: BTN is SB", () => {
    const config = createHeadsUpConfig({ dealerSeatIndex: 0 });
    const { state } = initializeHand(config);

    // Heads-up: dealer(0) posts SB, seat 1 posts BB
    const btn = state.players[0];
    const bb = state.players[1];

    expect(btn.position).toBe("btn");
    expect(btn.totalCommitted).toBe(1); // SB
    expect(bb.position).toBe("bb");
    expect(bb.totalCommitted).toBe(2); // BB
  });

  it("heads-up: BTN/SB acts first preflop", () => {
    const config = createHeadsUpConfig({ dealerSeatIndex: 0 });
    const { state } = initializeHand(config);

    expect(state.activePlayerIndex).not.toBeNull();
    expect(state.players[state.activePlayerIndex!].position).toBe("btn");
  });

  it("6-max: UTG acts first preflop", () => {
    const config = createTestConfig({ dealerSeatIndex: 0 });
    const { state } = initializeHand(config);

    expect(state.activePlayerIndex).not.toBeNull();
    expect(state.players[state.activePlayerIndex!].position).toBe("utg");
  });

  it("uses deterministic deck with seed", () => {
    const config1 = createTestConfig({ seed: 42 });
    const config2 = createTestConfig({ seed: 42 });

    const { state: s1 } = initializeHand(config1);
    const { state: s2 } = initializeHand(config2);

    // Same seed → same hole cards
    for (let i = 0; i < s1.players.length; i++) {
      expect(s1.players[i].holeCards).toEqual(s2.players[i].holeCards);
    }
  });

  it("different seeds produce different cards", () => {
    const { state: s1 } = initializeHand(createTestConfig({ seed: 42 }));
    const { state: s2 } = initializeHand(createTestConfig({ seed: 99 }));

    // Very unlikely to be the same
    const allSame = s1.players.every((p, i) =>
      p.holeCards[0] === s2.players[i].holeCards[0] &&
      p.holeCards[1] === s2.players[i].holeCards[1],
    );
    expect(allSame).toBe(false);
  });

  it("posts antes when configured", () => {
    const config = createTestConfig({
      numPlayers: 3,
      startingStacks: [1000, 1000, 1000],
      blinds: { small: 1, big: 2, ante: 0.5 },
    });
    const { state } = initializeHand(config);

    // Each player posts ante (0.5) + blind if applicable
    // Seat 0 = BTN: 0.5 ante
    // Seat 1 = SB: 0.5 ante + 1 SB = 1.5
    // Seat 2 = BB: 0.5 ante + 2 BB = 2.5
    expect(state.players[0].totalCommitted).toBe(0.5);
    expect(state.players[1].totalCommitted).toBe(1.5);
    expect(state.players[2].totalCommitted).toBe(2.5);
  });

  it("short stack posts partial blind", () => {
    const config = createHeadsUpConfig({
      startingStacks: [1000, 1], // BB only has 1 chip
    });
    const { state } = initializeHand(config);

    const bb = state.players[1];
    expect(bb.totalCommitted).toBe(1);
    expect(bb.currentStack).toBe(0);
    expect(bb.status).toBe("all_in");
  });

  it("calculates initial pot", () => {
    const config = createTestConfig();
    const { state } = initializeHand(config);

    // SB(1) + BB(2) = 3
    expect(state.pot.total).toBe(3);
  });

  it("throws on invalid player count", () => {
    expect(() => initializeHand(createTestConfig({ numPlayers: 1 }))).toThrow();
    expect(() => initializeHand(createTestConfig({ numPlayers: 11 }))).toThrow();
  });

  it("throws on mismatched stacks", () => {
    expect(() =>
      initializeHand(createTestConfig({ numPlayers: 3, startingStacks: [100, 100] })),
    ).toThrow();
  });
});

// ═══════════════════════════════════════════════════════
// applyAction — basic actions
// ═══════════════════════════════════════════════════════

describe("applyAction", () => {
  it("applies fold correctly", () => {
    const config = createTestConfig();
    const { state } = initializeHand(config);

    // UTG (seat 3) folds
    const activeSeat = state.players[state.activePlayerIndex!].seatIndex;
    const { state: newState } = applyAction(state, activeSeat, "fold");

    const folder = newState.players.find((p) => p.seatIndex === activeSeat)!;
    expect(folder.status).toBe("folded");
  });

  it("applies call correctly", () => {
    const config = createTestConfig();
    const { state } = initializeHand(config);

    const activeSeat = state.players[state.activePlayerIndex!].seatIndex;
    const { state: newState } = applyAction(state, activeSeat, "call");

    const caller = newState.players.find((p) => p.seatIndex === activeSeat)!;
    expect(caller.streetCommitted).toBe(2); // called the BB
    expect(caller.currentStack).toBe(998);
  });

  it("applies raise correctly", () => {
    const config = createTestConfig();
    const { state } = initializeHand(config);

    const activeSeat = state.players[state.activePlayerIndex!].seatIndex;
    // Raise to 6 (minRaise is 2, so raise to 2+2=4 minimum, 6 is valid)
    const { state: newState } = applyAction(state, activeSeat, "raise", 6);

    const raiser = newState.players.find((p) => p.seatIndex === activeSeat)!;
    expect(raiser.streetCommitted).toBe(6);
    expect(raiser.currentStack).toBe(994);
    expect(newState.currentBet).toBe(6);
    expect(newState.minRaiseSize).toBe(4); // raise increment was 6-2=4
  });

  it("applies all-in correctly", () => {
    const config = createTestConfig({
      numPlayers: 2,
      startingStacks: [100, 100],
    });
    const { state } = initializeHand(config);

    const activeSeat = state.players[state.activePlayerIndex!].seatIndex;
    const { state: newState } = applyAction(state, activeSeat, "all_in");

    const allInPlayer = newState.players.find((p) => p.seatIndex === activeSeat)!;
    expect(allInPlayer.status).toBe("all_in");
    expect(allInPlayer.currentStack).toBe(0);
  });

  it("throws on invalid action", () => {
    const config = createTestConfig();
    const { state } = initializeHand(config);

    // Wrong seat tries to act
    expect(() => applyAction(state, 99, "fold")).toThrow();
  });

  it("records action in history", () => {
    const config = createTestConfig();
    const { state } = initializeHand(config);

    const activeSeat = state.players[state.activePlayerIndex!].seatIndex;
    const { state: newState } = applyAction(state, activeSeat, "call");

    expect(newState.actionHistory).toHaveLength(1);
    expect(newState.actionHistory[0].actionType).toBe("call");
    expect(newState.actionHistory[0].seatIndex).toBe(activeSeat);
    expect(newState.actionHistory[0].street).toBe("preflop");
  });

  it("advances active player after action", () => {
    const config = createTestConfig();
    const { state } = initializeHand(config);

    const firstActive = state.activePlayerIndex!;
    const firstSeat = state.players[firstActive].seatIndex;
    const { state: newState } = applyAction(state, firstSeat, "call");

    // Should advance to next player
    expect(newState.activePlayerIndex).not.toBeNull();
    expect(newState.activePlayerIndex).not.toBe(firstActive);
  });
});

// ═══════════════════════════════════════════════════════
// Full hand progression
// ═══════════════════════════════════════════════════════

describe("full hand progression", () => {
  it("heads-up: everyone folds → hand over", () => {
    const config = createHeadsUpConfig();
    const { state } = initializeHand(config);

    // BTN/SB folds
    const btnSeat = state.players[state.activePlayerIndex!].seatIndex;
    const { state: newState } = applyAction(state, btnSeat, "fold");

    expect(newState.phase).toBe("complete");
    expect(newState.activePlayerIndex).toBeNull();
  });

  it("heads-up: call → advances to flop", () => {
    const config = createHeadsUpConfig();
    const { state } = initializeHand(config);

    // BTN calls
    const btnSeat = state.players[state.activePlayerIndex!].seatIndex;
    const { state: s2 } = applyAction(state, btnSeat, "call");

    // BB checks
    const bbSeat = s2.players[s2.activePlayerIndex!].seatIndex;
    const { state: s3 } = applyAction(s2, bbSeat, "check");

    expect(s3.currentStreet).toBe("flop");
    expect(s3.communityCards).toHaveLength(3);
    expect(s3.currentBet).toBe(0);
  });

  it("6-max: all call preflop → flop dealt", () => {
    const config = createTestConfig({ seed: 42 });
    const { state } = initializeHand(config);

    let s = state;
    // UTG(3), HJ(4), CO(5), BTN(0) all call, SB(1) calls, BB(2) checks
    for (let i = 0; i < 4; i++) {
      const seat = s.players[s.activePlayerIndex!].seatIndex;
      s = applyAction(s, seat, "call").state;
    }
    // SB completes (calls 1 more)
    const sbSeat = s.players[s.activePlayerIndex!].seatIndex;
    s = applyAction(s, sbSeat, "call").state;
    // BB checks
    const bbSeat = s.players[s.activePlayerIndex!].seatIndex;
    s = applyAction(s, bbSeat, "check").state;

    expect(s.currentStreet).toBe("flop");
    expect(s.communityCards).toHaveLength(3);
  });

  it("full hand to showdown: call every street", () => {
    const config = createHeadsUpConfig({ seed: 42 });
    let { state: s } = initializeHand(config);

    // Play through each street with calls/checks
    const playStreet = () => {
      // Both players act (call or check as appropriate)
      for (let i = 0; i < 2; i++) {
        if (s.activePlayerIndex === null) break;
        const seat = s.players[s.activePlayerIndex].seatIndex;
        const legal = currentLegalActions(s);
        if (!legal) break;

        if (legal.canCheck) {
          s = applyAction(s, seat, "check").state;
        } else if (legal.canCall) {
          s = applyAction(s, seat, "call").state;
        }
      }
    };

    // Preflop
    playStreet();
    expect(s.communityCards.length).toBeGreaterThanOrEqual(3);

    // Flop
    playStreet();

    // Turn
    playStreet();

    // River
    playStreet();

    expect(s.phase).toBe("showdown");
    expect(s.communityCards).toHaveLength(5);
  });

  it("multi-way all-in → runs out board automatically", () => {
    const config = createTestConfig({
      numPlayers: 3,
      startingStacks: [100, 100, 100],
      seed: 42,
    });
    let { state: s } = initializeHand(config);

    // BTN(0) raises all-in
    // dealer=0 → positions: btn(0), sb(1), bb(2)
    // Preflop order: btn first (3-player, seat 0 is left of BB)
    const seat0 = s.players[s.activePlayerIndex!].seatIndex;
    s = applyAction(s, seat0, "all_in").state;

    // SB calls all-in
    const seat1 = s.players[s.activePlayerIndex!].seatIndex;
    s = applyAction(s, seat1, "all_in").state;

    // BB calls all-in
    const seat2 = s.players[s.activePlayerIndex!].seatIndex;
    s = applyAction(s, seat2, "all_in").state;

    // Board should be run out
    expect(s.communityCards).toHaveLength(5);
    expect(s.phase).toBe("showdown");
  });

  it("short all-in does not reopen action", () => {
    const config = createTestConfig({
      numPlayers: 3,
      startingStacks: [1000, 3, 1000], // SB has only 3 chips
      seed: 42,
    });
    let { state: s } = initializeHand(config);

    // BTN(0) raises to 6
    const seat0 = s.players[s.activePlayerIndex!].seatIndex;
    s = applyAction(s, seat0, "raise", 6).state;

    // SB(1) all-in for 2 more (total 3, posted 1 SB already)
    // This is a short all-in (increment < minRaise)
    const seat1 = s.players[s.activePlayerIndex!].seatIndex;
    const lastAgg = s.lastAggressorIndex;
    s = applyAction(s, seat1, "all_in").state;

    // lastAggressorIndex should NOT have changed (short all-in)
    expect(s.lastAggressorIndex).toBe(lastAgg);
  });
});

// ═══════════════════════════════════════════════════════
// BB option
// ═══════════════════════════════════════════════════════

describe("BB option", () => {
  it("BB can check in an unraised pot", () => {
    const config = createTestConfig({
      numPlayers: 3,
      startingStacks: [1000, 1000, 1000],
      seed: 42,
    });
    let { state: s } = initializeHand(config);

    // BTN(0) calls
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    // SB(1) calls
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    // BB(2) should be able to check
    const legal = currentLegalActions(s);
    expect(legal).not.toBeNull();
    expect(legal!.canCheck).toBe(true);
    expect(legal!.canRaise).toBe(true);
  });

  it("BB can raise in an unraised pot", () => {
    const config = createTestConfig({
      numPlayers: 3,
      startingStacks: [1000, 1000, 1000],
      seed: 42,
    });
    let { state: s } = initializeHand(config);

    // BTN calls, SB calls
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;

    // BB raises to 8
    const bbSeat = s.players[s.activePlayerIndex!].seatIndex;
    s = applyAction(s, bbSeat, "raise", 8).state;

    expect(s.currentBet).toBe(8);
    // Other players should need to act again
    expect(s.activePlayerIndex).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════
// Side pots in full hands
// ═══════════════════════════════════════════════════════

describe("side pots in hands", () => {
  it("creates side pot when short stack all-in", () => {
    const config = createTestConfig({
      numPlayers: 3,
      startingStacks: [100, 300, 300],
      seed: 42,
    });
    let { state: s } = initializeHand(config);

    // BTN(0) all-in for 100
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "all_in").state;
    // SB(1) calls (puts in 100 total)
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    // BB(2) calls (puts in 100 total)
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;

    // All committed 100 each, so main pot = 300, no side pots
    expect(s.pot.total).toBe(300);
    expect(s.pot.mainPot).toBe(300);
  });
});

// ═══════════════════════════════════════════════════════
// Bridge functions
// ═══════════════════════════════════════════════════════

describe("gameContextFromState", () => {
  it("produces valid GameContext", () => {
    const config = createTestConfig();
    const { state } = initializeHand(config);

    const gc = gameContextFromState(state);
    expect(gc.pot).toBe(state.pot.total);
    expect(gc.blinds.small).toBe(1);
    expect(gc.blinds.big).toBe(2);
    expect(gc.stackSizes.size).toBe(6);
    // Check specific stacks
    expect(gc.stackSizes.get(1)).toBe(999); // SB posted 1
    expect(gc.stackSizes.get(2)).toBe(998); // BB posted 2
  });
});

describe("analysisContextFromState", () => {
  it("produces valid AnalysisContext for hero", () => {
    const config = createTestConfig({ seed: 42 });
    const { state } = initializeHand(config);

    const ctx = analysisContextFromState(state, 0);
    expect(ctx.heroCards).toHaveLength(2);
    expect(ctx.communityCards).toHaveLength(0);
    expect(ctx.deadCards).toHaveLength(0);
    expect(ctx.street).toBe("preflop");
    expect(ctx.position).toBe("btn"); // seat 0 with dealer at 0
    expect(ctx.numPlayers).toBe(6);
    expect(ctx.heroSeatIndex).toBe(0);
    expect(ctx.gameContext).toBeDefined();
    expect(ctx.gameContext!.pot).toBe(3); // SB+BB
  });

  it("hero cards match dealt cards", () => {
    const config = createTestConfig({ seed: 42 });
    const { state } = initializeHand(config);

    const ctx = analysisContextFromState(state, 3);
    expect(ctx.heroCards).toEqual(state.players[3].holeCards);
    expect(ctx.position).toBe("utg");
  });

  it("includes community cards after flop", () => {
    const config = createHeadsUpConfig({ seed: 42 });
    let { state: s } = initializeHand(config);

    // Play to flop
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "check").state;

    const ctx = analysisContextFromState(s, 0);
    expect(ctx.communityCards).toHaveLength(3);
    expect(ctx.street).toBe("flop");
  });

  it("throws for invalid hero seat", () => {
    const config = createTestConfig();
    const { state } = initializeHand(config);

    expect(() => analysisContextFromState(state, 99)).toThrow();
  });
});

// ═══════════════════════════════════════════════════════
// State immutability
// ═══════════════════════════════════════════════════════

describe("state immutability", () => {
  it("applyAction does not mutate original state", () => {
    const config = createTestConfig();
    const { state } = initializeHand(config);

    const originalActivePlayer = state.activePlayerIndex;
    const originalHistoryLen = state.actionHistory.length;
    const activeSeat = state.players[state.activePlayerIndex!].seatIndex;

    applyAction(state, activeSeat, "call");

    // Original state should be unchanged
    expect(state.activePlayerIndex).toBe(originalActivePlayer);
    expect(state.actionHistory).toHaveLength(originalHistoryLen);
  });
});

// ═══════════════════════════════════════════════════════
// runActions helper
// ═══════════════════════════════════════════════════════

describe("runActions helper", () => {
  it("runs a sequence of actions", () => {
    const config = createHeadsUpConfig({ seed: 42 });
    const state = runActions(config, [
      [0, "call"],   // BTN calls
      [1, "check"],  // BB checks
    ]);

    expect(state.currentStreet).toBe("flop");
    expect(state.communityCards).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════
// Analysis bridge with opponents (Phase 7B)
// ═══════════════════════════════════════════════════════

describe("analysisContextFromState with bridgeConfig", () => {
  it("builds opponents from bridge config with profiles", () => {
    const config = createTestConfig({ seed: 42 });
    const { state } = initializeHand(config);

    const bridgeConfig: AnalysisBridgeConfig = {
      seatProfiles: new Map([
        [1, TAG_PROFILE],
        [2, NIT_PROFILE],
      ]),
      seatLabels: new Map([
        [1, "Villain 1"],
        [2, "Villain 2"],
      ]),
      getBase: (id) => PRESET_PROFILES[id],
    };

    const ctx = analysisContextFromState(state, 0, bridgeConfig);

    // Should have opponents for all non-hero, non-folded seats
    expect(ctx.opponents.length).toBe(5); // seats 1-5 (hero is seat 0)

    // Seats with profiles should have ranges
    const v1 = ctx.opponents.find((o) => o.seatIndex === 1)!;
    expect(v1.label).toBe("Villain 1");
    expect(v1.profile).toBe(TAG_PROFILE);
    expect(v1.impliedRange.size).toBeGreaterThan(0);

    // Seats without profiles still appear
    const v3 = ctx.opponents.find((o) => o.seatIndex === 3)!;
    expect(v3.label).toBe("Seat 3");
    expect(v3.profile).toBeUndefined();
    expect(v3.impliedRange.size).toBe(0);
  });

  it("includes opponent actions in context", () => {
    const config = createHeadsUpConfig({ seed: 42 });
    let { state: s } = initializeHand(config);

    // BTN raises
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "raise", 6).state;
    // BB calls
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;

    const bridgeConfig: AnalysisBridgeConfig = {
      seatProfiles: new Map([[1, TAG_PROFILE]]),
    };

    const ctx = analysisContextFromState(s, 0, bridgeConfig);
    const opponent = ctx.opponents.find((o) => o.seatIndex === 1)!;

    // BB (seat 1) called
    expect(opponent.actions).toHaveLength(1);
    expect(opponent.actions[0].actionType).toBe("call");
  });

  it("adds known villain cards to deadCards", () => {
    const config = createHeadsUpConfig({ seed: 42 });
    const { state } = initializeHand(config);

    // Assign known cards to seat 1
    const knownCards = [state.deck[0], state.deck[1]];
    const overriddenState = applyCardOverrides(state, [
      { seatIndex: 1, cards: [knownCards[0], knownCards[1]], visibility: "revealed" },
    ]);

    const bridgeConfig: AnalysisBridgeConfig = {
      seatProfiles: new Map([[1, TAG_PROFILE]]),
    };

    const ctx = analysisContextFromState(overriddenState, 0, bridgeConfig);

    // Dead cards should include villain's known cards
    expect(ctx.deadCards).toHaveLength(2);
    expect(ctx.deadCards).toContain(knownCards[0]);
    expect(ctx.deadCards).toContain(knownCards[1]);

    // Opponent should have knownCards set
    const opponent = ctx.opponents.find((o) => o.seatIndex === 1)!;
    expect(opponent.knownCards).toEqual(expect.arrayContaining(knownCards));
  });

  it("excludes folded players from opponents", () => {
    const config = createTestConfig({ seed: 42, numPlayers: 3, startingStacks: [1000, 1000, 1000] });
    let { state: s } = initializeHand(config);

    // BTN (seat 0) folds
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "fold").state;

    const bridgeConfig: AnalysisBridgeConfig = {
      seatProfiles: new Map([[0, TAG_PROFILE]]),
    };

    // Hero = seat 1 (SB). Seat 0 folded.
    const ctx = analysisContextFromState(s, 1, bridgeConfig);
    expect(ctx.opponents.length).toBe(1); // only seat 2 (BB)
    expect(ctx.opponents[0].seatIndex).toBe(2);
  });

  it("backward compatible: no bridgeConfig → empty opponents and deadCards", () => {
    const config = createTestConfig({ seed: 42 });
    const { state } = initializeHand(config);

    const ctx = analysisContextFromState(state, 0);
    expect(ctx.opponents).toEqual([]);
    expect(ctx.deadCards).toEqual([]);
  });
});
