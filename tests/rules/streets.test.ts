import { describe, it, expect } from "vitest";
import {
  nextStreet,
  firstToAct,
  isBettingRoundComplete,
  isHandOver,
  allPlayersAllIn,
  showdownPlayers,
  actionOrder,
  activePlayerCount,
  playersInHand,
} from "../../convex/lib/rules/streets";
import type { GameState, PlayerState } from "../../convex/lib/state/gameState";
import { seatToPositionMap } from "../../convex/lib/primitives/position";

// ─── Helpers ───

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
  overrides: Partial<GameState> = {},
  playerOverrides: Record<number, Partial<PlayerState>> = {},
): GameState {
  const posMap = seatToPositionMap(dealerSeatIndex, numPlayers);
  const players: PlayerState[] = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push(
      makePlayer(i, posMap.get(i)!, playerOverrides[i] || {}),
    );
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
    activePlayerIndex: null,
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
// nextStreet
// ═══════════════════════════════════════════════════════

describe("nextStreet", () => {
  it("preflop → flop", () => expect(nextStreet("preflop")).toBe("flop"));
  it("flop → turn", () => expect(nextStreet("flop")).toBe("turn"));
  it("turn → river", () => expect(nextStreet("turn")).toBe("river"));
  it("river → null", () => expect(nextStreet("river")).toBeNull());
});

// ═══════════════════════════════════════════════════════
// firstToAct
// ═══════════════════════════════════════════════════════

describe("firstToAct", () => {
  it("6-max preflop: UTG is first to act", () => {
    // dealer=0 → positions: 0=btn, 1=sb, 2=bb, 3=utg, 4=hj, 5=co
    const state = makeState(6, 0);
    const first = firstToAct(state, "preflop");
    expect(first).not.toBeNull();
    expect(state.players[first!].position).toBe("utg");
  });

  it("heads-up preflop: BTN/SB acts first", () => {
    // dealer=0 → 0=btn, 1=bb
    const state = makeState(2, 0);
    const first = firstToAct(state, "preflop");
    expect(first).not.toBeNull();
    expect(state.players[first!].position).toBe("btn");
  });

  it("3-player preflop: BTN acts first (left of BB = BTN)", () => {
    // dealer=0 → 0=btn, 1=sb, 2=bb → UTG = seat 0 (btn)
    const state = makeState(3, 0);
    const first = firstToAct(state, "preflop");
    expect(first).not.toBeNull();
    // In 3-player, positions are btn, sb, bb. Left of bb wraps to btn.
    expect(state.players[first!].seatIndex).toBe(0);
  });

  it("postflop: first active left of dealer", () => {
    // dealer=0 → SB=1 is first postflop
    const state = makeState(6, 0, { currentStreet: "flop", currentBet: 0 });
    const first = firstToAct(state, "flop");
    expect(first).not.toBeNull();
    expect(state.players[first!].position).toBe("sb");
  });

  it("postflop: skips folded SB", () => {
    const state = makeState(6, 0, { currentStreet: "flop", currentBet: 0 }, {
      1: { status: "folded" },
    });
    const first = firstToAct(state, "flop");
    expect(first).not.toBeNull();
    expect(state.players[first!].position).toBe("bb");
  });

  it("returns null when only one active player", () => {
    const state = makeState(3, 0, {}, {
      0: { status: "folded" },
      1: { status: "folded" },
    });
    expect(firstToAct(state, "preflop")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════
// isBettingRoundComplete
// ═══════════════════════════════════════════════════════

describe("isBettingRoundComplete", () => {
  it("not complete when active players haven't acted", () => {
    const state = makeState(3, 0);
    expect(isBettingRoundComplete(state)).toBe(false);
  });

  it("complete when all active players have acted and matched bet", () => {
    const state = makeState(3, 0, { currentBet: 2 }, {
      0: { hasActedThisStreet: true, streetCommitted: 2 },
      1: { hasActedThisStreet: true, streetCommitted: 2 },
      2: { hasActedThisStreet: true, streetCommitted: 2 },
    });
    expect(isBettingRoundComplete(state)).toBe(true);
  });

  it("not complete when one player hasn't matched the bet", () => {
    const state = makeState(3, 0, { currentBet: 4 }, {
      0: { hasActedThisStreet: true, streetCommitted: 4 },
      1: { hasActedThisStreet: true, streetCommitted: 2 }, // hasn't matched
      2: { hasActedThisStreet: true, streetCommitted: 4 },
    });
    expect(isBettingRoundComplete(state)).toBe(false);
  });

  it("complete when all but one player folded", () => {
    const state = makeState(3, 0, {}, {
      0: { status: "folded", hasActedThisStreet: true },
      1: { status: "folded", hasActedThisStreet: true },
      2: { hasActedThisStreet: true },
    });
    expect(isBettingRoundComplete(state)).toBe(true);
  });

  it("complete when no active players (all folded/all-in)", () => {
    const state = makeState(3, 0, {}, {
      0: { status: "all_in" },
      1: { status: "all_in" },
      2: { status: "folded" },
    });
    expect(isBettingRoundComplete(state)).toBe(true);
  });

  it("complete when only one active player is the aggressor", () => {
    const state = makeState(3, 0, { lastAggressorIndex: 2, currentBet: 10 }, {
      0: { status: "folded", hasActedThisStreet: true },
      1: { status: "all_in", hasActedThisStreet: true },
      2: { hasActedThisStreet: true, streetCommitted: 10 },
    });
    expect(isBettingRoundComplete(state)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// isHandOver
// ═══════════════════════════════════════════════════════

describe("isHandOver", () => {
  it("not over in normal play", () => {
    const state = makeState(3, 0);
    expect(isHandOver(state)).toBe(false);
  });

  it("over when only one player in hand", () => {
    const state = makeState(3, 0, {}, {
      0: { status: "folded" },
      1: { status: "folded" },
    });
    expect(isHandOver(state)).toBe(true);
  });

  it("over at showdown phase", () => {
    const state = makeState(3, 0, { phase: "showdown" });
    expect(isHandOver(state)).toBe(true);
  });

  it("over at complete phase", () => {
    const state = makeState(3, 0, { phase: "complete" });
    expect(isHandOver(state)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// allPlayersAllIn
// ═══════════════════════════════════════════════════════

describe("allPlayersAllIn", () => {
  it("false in normal play", () => {
    const state = makeState(3, 0);
    expect(allPlayersAllIn(state)).toBe(false);
  });

  it("true when all remaining are all-in", () => {
    const state = makeState(3, 0, {}, {
      0: { status: "all_in" },
      1: { status: "all_in" },
      2: { status: "folded" },
    });
    expect(allPlayersAllIn(state)).toBe(true);
  });

  it("false when one active player remains", () => {
    const state = makeState(3, 0, {}, {
      0: { status: "all_in" },
      1: { status: "active" },
      2: { status: "folded" },
    });
    expect(allPlayersAllIn(state)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════
// showdownPlayers
// ═══════════════════════════════════════════════════════

describe("showdownPlayers", () => {
  it("returns all non-folded players", () => {
    const state = makeState(4, 0, {}, {
      0: { status: "folded" },
      2: { status: "all_in" },
    });
    const result = showdownPlayers(state);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.seatIndex)).toEqual([1, 2, 3]);
  });
});

// ═══════════════════════════════════════════════════════
// actionOrder
// ═══════════════════════════════════════════════════════

describe("actionOrder", () => {
  it("6-max preflop order starts at UTG", () => {
    const state = makeState(6, 0);
    const order = actionOrder(state, "preflop");
    expect(order).toHaveLength(6);
    // UTG(3), HJ(4), CO(5), BTN(0), SB(1), BB(2)
    expect(order[0]).toBe(3); // UTG
  });

  it("6-max postflop order starts at SB", () => {
    const state = makeState(6, 0, { currentStreet: "flop", currentBet: 0 });
    const order = actionOrder(state, "flop");
    expect(order).toHaveLength(6);
    expect(order[0]).toBe(1); // SB
  });

  it("skips folded players in order", () => {
    const state = makeState(4, 0, { currentStreet: "flop", currentBet: 0 }, {
      1: { status: "folded" },
    });
    const order = actionOrder(state, "flop");
    expect(order).toHaveLength(3);
    expect(order).not.toContain(1);
  });
});

// ═══════════════════════════════════════════════════════
// Utility functions
// ═══════════════════════════════════════════════════════

describe("activePlayerCount / playersInHand", () => {
  it("counts active players", () => {
    const state = makeState(4, 0, {}, {
      0: { status: "folded" },
      2: { status: "all_in" },
    });
    expect(activePlayerCount(state)).toBe(2);
    expect(playersInHand(state)).toBe(3);
  });
});
