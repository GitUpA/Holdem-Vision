import { describe, it, expect } from "vitest";
import {
  calculatePotsFromContributions,
  calculatePots,
  maxWinnable,
} from "../../convex/lib/rules/pot";
import type { GameState } from "../../convex/lib/state/gameState";

// ─── Helper ───

function makeContributions(
  data: { seat: number; amount: number; folded?: boolean }[],
) {
  return data.map((d) => ({
    seatIndex: d.seat,
    amount: d.amount,
    folded: d.folded ?? false,
  }));
}

function makeMinimalState(
  players: { seat: number; committed: number; status?: string }[],
): GameState {
  return {
    numPlayers: players.length,
    dealerSeatIndex: 0,
    blinds: { small: 1, big: 2 },
    handNumber: 1,
    deck: [],
    communityCards: [],
    players: players.map((p) => ({
      seatIndex: p.seat,
      position: "btn" as const,
      status: (p.status ?? "active") as "active" | "folded" | "all_in",
      startingStack: 1000,
      currentStack: 1000 - p.committed,
      totalCommitted: p.committed,
      streetCommitted: p.committed,
      holeCards: [],
      hasActedThisStreet: true,
      cardVisibility: "hidden",
    })),
    currentStreet: "preflop",
    activePlayerIndex: null,
    lastAggressorIndex: null,
    currentBet: 0,
    minRaiseSize: 2,
    raiseCount: 0,
    pot: { mainPot: 0, sidePots: [], total: 0, explanation: "" },
    actionHistory: [],
    phase: "preflop",
  };
}

// ═══════════════════════════════════════════════════════
// calculatePotsFromContributions
// ═══════════════════════════════════════════════════════

describe("calculatePotsFromContributions", () => {
  it("handles empty contributions", () => {
    const result = calculatePotsFromContributions([]);
    expect(result.total).toBe(0);
    expect(result.mainPot).toBe(0);
    expect(result.sidePots).toHaveLength(0);
  });

  it("single pot — all players commit equally", () => {
    const contribs = makeContributions([
      { seat: 0, amount: 100 },
      { seat: 1, amount: 100 },
      { seat: 2, amount: 100 },
    ]);
    const result = calculatePotsFromContributions(contribs);
    expect(result.total).toBe(300);
    expect(result.mainPot).toBe(300);
    expect(result.sidePots).toHaveLength(0);
  });

  it("two players heads-up — no side pots", () => {
    const contribs = makeContributions([
      { seat: 0, amount: 50 },
      { seat: 1, amount: 50 },
    ]);
    const result = calculatePotsFromContributions(contribs);
    expect(result.total).toBe(100);
    expect(result.mainPot).toBe(100);
    expect(result.sidePots).toHaveLength(0);
  });

  it("one all-in short — creates main + side pot", () => {
    // A all-in 100, B and C call 300
    const contribs = makeContributions([
      { seat: 0, amount: 100 },
      { seat: 1, amount: 300 },
      { seat: 2, amount: 300 },
    ]);
    const result = calculatePotsFromContributions(contribs);
    // Main pot: 100*3 = 300 (all 3 eligible)
    // Side pot: 200*2 = 400 (only B and C)
    expect(result.mainPot).toBe(300);
    expect(result.sidePots).toHaveLength(1);
    expect(result.sidePots[0].amount).toBe(400);
    expect(result.sidePots[0].eligiblePlayers).toEqual([1, 2]);
    expect(result.total).toBe(700);
  });

  it("cascading all-ins — three different commitment levels", () => {
    // A: 50, B: 150, C: 300, D: 300
    const contribs = makeContributions([
      { seat: 0, amount: 50 },
      { seat: 1, amount: 150 },
      { seat: 2, amount: 300 },
      { seat: 3, amount: 300 },
    ]);
    const result = calculatePotsFromContributions(contribs);
    // Main pot: 50*4 = 200 (all 4)
    // Side pot 1: 100*3 = 300 (B,C,D)
    // Side pot 2: 150*2 = 300 (C,D)
    expect(result.mainPot).toBe(200);
    expect(result.sidePots).toHaveLength(2);
    expect(result.sidePots[0].amount).toBe(300);
    expect(result.sidePots[0].eligiblePlayers).toEqual([1, 2, 3]);
    expect(result.sidePots[1].amount).toBe(300);
    expect(result.sidePots[1].eligiblePlayers).toEqual([2, 3]);
    expect(result.total).toBe(800);
  });

  it("folded player's chips go into pot but they can't win", () => {
    const contribs = makeContributions([
      { seat: 0, amount: 100, folded: true },
      { seat: 1, amount: 200 },
      { seat: 2, amount: 200 },
    ]);
    const result = calculatePotsFromContributions(contribs);
    // All 100 from seat 0 goes into main pot (100*3 = 300 at threshold 100... but seat 0 folded)
    // Actually: threshold 100: each contributes min(amount,100) - 0 = 100,100,100 = 300
    //   eligible: seat 1 and 2 (seat 0 folded)
    // threshold 200: each contributes min(amount,200)-100 = 0,100,100 = 200
    //   eligible: seat 1 and 2
    expect(result.total).toBe(500);
    // Main pot should include folded player's chips
    expect(result.mainPot).toBe(300);
    expect(result.sidePots).toHaveLength(1);
    expect(result.sidePots[0].amount).toBe(200);
  });

  it("all players fold except one — still calculates pot", () => {
    const contribs = makeContributions([
      { seat: 0, amount: 50, folded: true },
      { seat: 1, amount: 50, folded: true },
      { seat: 2, amount: 50 },
    ]);
    const result = calculatePotsFromContributions(contribs);
    expect(result.total).toBe(150);
    expect(result.mainPot).toBe(150);
  });

  it("handles antes (small equal amounts from all)", () => {
    const contribs = makeContributions([
      { seat: 0, amount: 5 },
      { seat: 1, amount: 5 },
      { seat: 2, amount: 5 },
      { seat: 3, amount: 5 },
    ]);
    const result = calculatePotsFromContributions(contribs);
    expect(result.total).toBe(20);
    expect(result.mainPot).toBe(20);
    expect(result.sidePots).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════
// calculatePots (from GameState)
// ═══════════════════════════════════════════════════════

describe("calculatePots", () => {
  it("calculates from GameState players", () => {
    const state = makeMinimalState([
      { seat: 0, committed: 100 },
      { seat: 1, committed: 100 },
    ]);
    const result = calculatePots(state);
    expect(result.total).toBe(200);
    expect(result.mainPot).toBe(200);
  });

  it("handles folded players in GameState", () => {
    const state = makeMinimalState([
      { seat: 0, committed: 50, status: "folded" },
      { seat: 1, committed: 100 },
      { seat: 2, committed: 100 },
    ]);
    const result = calculatePots(state);
    expect(result.total).toBe(250);
  });
});

// ═══════════════════════════════════════════════════════
// maxWinnable
// ═══════════════════════════════════════════════════════

describe("maxWinnable", () => {
  it("player can win full pot when all committed equally", () => {
    const state = makeMinimalState([
      { seat: 0, committed: 100 },
      { seat: 1, committed: 100 },
      { seat: 2, committed: 100 },
    ]);
    expect(maxWinnable(state, 0)).toBe(300);
  });

  it("short all-in player can only win up to their committed from each opponent", () => {
    const state = makeMinimalState([
      { seat: 0, committed: 50, status: "all_in" },
      { seat: 1, committed: 200 },
      { seat: 2, committed: 200 },
    ]);
    // Can win min(50,50) + min(200,50) + min(200,50) = 50+50+50 = 150
    expect(maxWinnable(state, 0)).toBe(150);
  });

  it("big stack can win everything", () => {
    const state = makeMinimalState([
      { seat: 0, committed: 50, status: "all_in" },
      { seat: 1, committed: 200 },
      { seat: 2, committed: 200 },
    ]);
    // Can win min(50,200) + min(200,200) + min(200,200) = 50+200+200 = 450
    expect(maxWinnable(state, 1)).toBe(450);
  });

  it("folded player can win nothing", () => {
    const state = makeMinimalState([
      { seat: 0, committed: 100, status: "folded" },
      { seat: 1, committed: 100 },
    ]);
    expect(maxWinnable(state, 0)).toBe(0);
  });

  it("nonexistent seat returns 0", () => {
    const state = makeMinimalState([
      { seat: 0, committed: 100 },
      { seat: 1, committed: 100 },
    ]);
    expect(maxWinnable(state, 5)).toBe(0);
  });
});
