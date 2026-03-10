import { describe, it, expect } from "vitest";
import { getLegalActions, validateAction } from "../../convex/lib/rules/actions";
import type { GameState, PlayerState } from "../../convex/lib/state/game-state";
import { seatToPositionMap } from "../../convex/lib/primitives/position";

// ─── Helper ───

function makePlayer(
  seatIndex: number,
  position: string,
  overrides: Partial<PlayerState> = {},
): PlayerState {
  return {
    seatIndex,
    position: position as PlayerState["position"],
    status: "active",
    startingStack: 1000,
    currentStack: 1000,
    totalCommitted: 0,
    streetCommitted: 0,
    holeCards: [],
    hasActedThisStreet: false,
    cardVisibility: "hidden",
    ...overrides,
  };
}

function makeState(
  numPlayers: number,
  dealerSeatIndex: number,
  activePlayerIndex: number | null,
  overrides: Partial<GameState> = {},
  playerOverrides: Record<number, Partial<PlayerState>> = {},
): GameState {
  const posMap = seatToPositionMap(dealerSeatIndex, numPlayers);
  const players: PlayerState[] = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push(makePlayer(i, posMap.get(i)!, playerOverrides[i] || {}));
  }

  return {
    numPlayers,
    dealerSeatIndex,
    blinds: { small: 1, big: 2 },
    handNumber: 1,
    deck: [],
    communityCards: [],
    players,
    currentStreet: "preflop",
    activePlayerIndex,
    lastAggressorIndex: null,
    currentBet: 2,
    minRaiseSize: 2,
    raiseCount: 0,
    pot: { mainPot: 0, sidePots: [], total: 0, explanation: "" },
    actionHistory: [],
    phase: "preflop",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════
// getLegalActions
// ═══════════════════════════════════════════════════════

describe("getLegalActions", () => {
  it("returns null when no active player", () => {
    const state = makeState(3, 0, null);
    expect(getLegalActions(state)).toBeNull();
  });

  it("preflop facing a bet: can fold, call, or raise", () => {
    // Active player hasn't put in any chips, currentBet=2
    const state = makeState(3, 0, 0, { currentBet: 2 });
    const legal = getLegalActions(state)!;
    expect(legal).not.toBeNull();
    expect(legal.canFold).toBe(true);
    expect(legal.canCheck).toBe(false);
    expect(legal.canCall).toBe(true);
    expect(legal.callAmount).toBe(2);
    expect(legal.canBet).toBe(false); // there's already a bet
    expect(legal.canRaise).toBe(true);
  });

  it("no bet to face: can check or bet (not fold/call)", () => {
    const state = makeState(3, 0, 0, { currentBet: 0 });
    const legal = getLegalActions(state)!;
    expect(legal.canFold).toBe(false);
    expect(legal.canCheck).toBe(true);
    expect(legal.canCall).toBe(false);
    expect(legal.canBet).toBe(true);
    expect(legal.betMin).toBe(2); // BB
    expect(legal.betMax).toBe(1000); // full stack
  });

  it("BB option: can check when already matched the blind", () => {
    const state = makeState(3, 0, 2, { currentBet: 2 }, {
      2: { streetCommitted: 2 }, // BB already posted 2
    });
    const legal = getLegalActions(state)!;
    expect(legal.canCheck).toBe(true);
    expect(legal.canFold).toBe(false);
    expect(legal.canRaise).toBe(true);
  });

  it("short stack call is all-in", () => {
    const state = makeState(3, 0, 0, { currentBet: 100 }, {
      0: { currentStack: 50 },
    });
    const legal = getLegalActions(state)!;
    expect(legal.canCall).toBe(true);
    expect(legal.callAmount).toBe(50); // can only put in what they have
    expect(legal.isCallAllIn).toBe(true);
  });

  it("short stack can't raise (only call all-in)", () => {
    // currentBet=100, minRaise=100, so raiseMin=200
    // Player has 50 chips — can't reach 200, can only call all-in
    const state = makeState(3, 0, 0, { currentBet: 100, minRaiseSize: 100 }, {
      0: { currentStack: 50 },
    });
    const legal = getLegalActions(state)!;
    expect(legal.canCall).toBe(true);
    expect(legal.isCallAllIn).toBe(true);
    // canRaise should be false since stack <= toCall
    expect(legal.canRaise).toBe(false);
  });

  it("min raise calculation tracks last raise size", () => {
    // Player 1 bet 10, Player 2 raised to 30 (raise increment = 20)
    // minRaiseSize should be 20, so min re-raise = 30+20 = 50
    const state = makeState(3, 0, 0, {
      currentBet: 30,
      minRaiseSize: 20,
    });
    const legal = getLegalActions(state)!;
    expect(legal.canRaise).toBe(true);
    expect(legal.raiseMin).toBe(50); // 30 + 20
    expect(legal.raiseMax).toBe(1000); // full stack
  });

  it("bet minimum is BB or stack if shorter", () => {
    const state = makeState(3, 0, 0, { currentBet: 0 }, {
      0: { currentStack: 1 }, // less than BB
    });
    const legal = getLegalActions(state)!;
    expect(legal.canBet).toBe(true);
    expect(legal.betMin).toBe(1); // min of BB(2) and stack(1)
    expect(legal.betMax).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════
// validateAction
// ═══════════════════════════════════════════════════════

describe("validateAction", () => {
  it("rejects action when no active player", () => {
    const state = makeState(3, 0, null);
    const result = validateAction(state, 0, "fold");
    expect(result.valid).toBe(false);
  });

  it("rejects action from wrong seat", () => {
    const state = makeState(3, 0, 1); // seat 1 is active
    const result = validateAction(state, 0, "fold"); // seat 0 tries to act
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Not seat 0's turn");
  });

  it("validates legal fold", () => {
    const state = makeState(3, 0, 0, { currentBet: 2 });
    expect(validateAction(state, 0, "fold").valid).toBe(true);
  });

  it("rejects fold when no bet to face", () => {
    const state = makeState(3, 0, 0, { currentBet: 0 });
    expect(validateAction(state, 0, "fold").valid).toBe(false);
  });

  it("validates legal check", () => {
    const state = makeState(3, 0, 0, { currentBet: 0 });
    expect(validateAction(state, 0, "check").valid).toBe(true);
  });

  it("rejects check when facing a bet", () => {
    const state = makeState(3, 0, 0, { currentBet: 2 });
    expect(validateAction(state, 0, "check").valid).toBe(false);
  });

  it("validates legal call", () => {
    const state = makeState(3, 0, 0, { currentBet: 10 });
    expect(validateAction(state, 0, "call").valid).toBe(true);
  });

  it("validates legal bet with proper amount", () => {
    const state = makeState(3, 0, 0, { currentBet: 0 });
    expect(validateAction(state, 0, "bet", 10).valid).toBe(true);
  });

  it("rejects bet below minimum", () => {
    const state = makeState(3, 0, 0, { currentBet: 0 });
    expect(validateAction(state, 0, "bet", 1).valid).toBe(false); // min is BB=2
  });

  it("rejects bet above stack", () => {
    const state = makeState(3, 0, 0, { currentBet: 0 });
    expect(validateAction(state, 0, "bet", 2000).valid).toBe(false);
  });

  it("validates legal raise", () => {
    const state = makeState(3, 0, 0, { currentBet: 10, minRaiseSize: 10 });
    // raiseMin = 10+10=20, player has 1000 chips
    expect(validateAction(state, 0, "raise", 20).valid).toBe(true);
  });

  it("rejects raise below minimum", () => {
    const state = makeState(3, 0, 0, { currentBet: 10, minRaiseSize: 10 });
    expect(validateAction(state, 0, "raise", 15).valid).toBe(false);
  });

  it("validates all-in with chips", () => {
    const state = makeState(3, 0, 0, { currentBet: 10 });
    expect(validateAction(state, 0, "all_in").valid).toBe(true);
  });

  it("rejects all-in with no chips", () => {
    const state = makeState(3, 0, 0, { currentBet: 10 }, {
      0: { currentStack: 0 },
    });
    expect(validateAction(state, 0, "all_in").valid).toBe(false);
  });
});
