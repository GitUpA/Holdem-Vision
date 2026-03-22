import { describe, it, expect } from "vitest";
import { gtoActionToGameAction, gtoActionLabel } from "../../convex/lib/gto/actionMapping";
import type { LegalActions } from "../../convex/lib/state/gameState";
import type { GtoAction } from "../../convex/lib/gto/tables/types";

// ─── Helpers ───

function makeLegal(overrides: Partial<LegalActions> = {}): LegalActions {
  return {
    seatIndex: 0,
    position: "btn",
    canFold: true,
    canCheck: false,
    canCall: true,
    callAmount: 4,
    canBet: false,
    betMin: 0,
    betMax: 0,
    canRaise: true,
    raiseMin: 8,
    raiseMax: 1000,
    ...overrides,
  } as LegalActions;
}

function makeOpenLegal(): LegalActions {
  return makeLegal({
    canCheck: true,
    canCall: false,
    callAmount: 0,
    canBet: true,
    betMin: 2,
    betMax: 1000,
    canRaise: false,
    raiseMin: 0,
    raiseMax: 0,
  });
}

// ═══════════════════════════════════════════════════════
// BASIC MAPPINGS
// ═══════════════════════════════════════════════════════

describe("gtoActionToGameAction", () => {
  it("fold maps to fold", () => {
    const result = gtoActionToGameAction("fold", makeLegal(), 100);
    expect(result.actionType).toBe("fold");
    expect(result.amount).toBeUndefined();
  });

  it("check maps to check when legal", () => {
    const legal = makeLegal({ canCheck: true });
    const result = gtoActionToGameAction("check", legal, 100);
    expect(result.actionType).toBe("check");
  });

  it("check falls back to fold when not legal", () => {
    const legal = makeLegal({ canCheck: false });
    const result = gtoActionToGameAction("check", legal, 100);
    expect(result.actionType).toBe("fold");
  });

  it("call maps to call with correct amount", () => {
    const legal = makeLegal({ canCall: true, callAmount: 6 });
    const result = gtoActionToGameAction("call", legal, 100);
    expect(result.actionType).toBe("call");
    expect(result.amount).toBe(6);
  });
});

// ═══════════════════════════════════════════════════════
// BET SIZING
// ═══════════════════════════════════════════════════════

describe("bet sizing", () => {
  it("bet_small: 33% of pot", () => {
    const legal = makeOpenLegal();
    const result = gtoActionToGameAction("bet_small", legal, 100);
    expect(result.actionType).toBe("bet");
    expect(result.amount).toBe(33);
  });

  it("bet_medium: 67% of pot", () => {
    const legal = makeOpenLegal();
    const result = gtoActionToGameAction("bet_medium", legal, 100);
    expect(result.actionType).toBe("bet");
    expect(result.amount).toBe(67);
  });

  it("bet_large: 100% of pot", () => {
    const legal = makeOpenLegal();
    const result = gtoActionToGameAction("bet_large", legal, 100);
    expect(result.actionType).toBe("bet");
    expect(result.amount).toBe(100);
  });

  it("clamps bet to legal min", () => {
    const legal = makeOpenLegal();
    legal.betMin = 50; // min bet is 50
    const result = gtoActionToGameAction("bet_small", legal, 10); // 33% of 10 = 3
    expect(result.amount).toBe(50); // clamped to min
  });

  it("clamps bet to legal max", () => {
    const legal = makeOpenLegal();
    legal.betMax = 20; // max bet is 20
    const result = gtoActionToGameAction("bet_large", legal, 100); // 100% of 100 = 100
    expect(result.amount).toBe(20); // clamped to max
  });

  it("bet maps to raise when can't bet but can raise", () => {
    const legal = makeLegal(); // canBet=false, canRaise=true
    const result = gtoActionToGameAction("bet_medium", legal, 100);
    expect(result.actionType).toBe("raise");
  });
});

// ═══════════════════════════════════════════════════════
// RAISE SIZING
// ═══════════════════════════════════════════════════════

describe("raise sizing", () => {
  it("raise_small: 2.5x current bet", () => {
    const legal = makeLegal({ callAmount: 10, raiseMin: 20, raiseMax: 1000 });
    const result = gtoActionToGameAction("raise_small", legal, 100);
    expect(result.actionType).toBe("raise");
    expect(result.amount).toBe(25); // 10 * 2.5
  });

  it("raise_large: 3x current bet", () => {
    const legal = makeLegal({ callAmount: 10, raiseMin: 20, raiseMax: 1000 });
    const result = gtoActionToGameAction("raise_large", legal, 100);
    expect(result.actionType).toBe("raise");
    expect(result.amount).toBe(30); // 10 * 3.0
  });

  it("clamps raise to legal range", () => {
    const legal = makeLegal({ callAmount: 10, raiseMin: 20, raiseMax: 22 });
    const result = gtoActionToGameAction("raise_large", legal, 100); // wants 30 but max is 22
    expect(result.amount).toBe(22);
  });
});

// ═══════════════════════════════════════════════════════
// LABELS
// ═══════════════════════════════════════════════════════

describe("gtoActionLabel", () => {
  const cases: [GtoAction, string][] = [
    ["fold", "Fold"],
    ["check", "Check"],
    ["call", "Call"],
    ["bet_small", "Bet 33%"],
    ["bet_medium", "Bet 67%"],
    ["bet_large", "Bet 100%"],
    ["raise_small", "Raise Small"],
    ["raise_large", "Raise Large"],
  ];

  for (const [action, label] of cases) {
    it(`${action} → "${label}"`, () => {
      expect(gtoActionLabel(action)).toBe(label);
    });
  }
});
