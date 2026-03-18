import { describe, it, expect } from "vitest";
import {
  classifyCurrentDecision,
  sampleActionFromParams,
  chooseBetSize,
  chooseActionFromProfile,
} from "../../convex/lib/opponents/autoPlay";
import { initializeHand, applyAction, currentLegalActions } from "../../convex/lib/state/state-machine";
import { createTestConfig, createHeadsUpConfig } from "../state/helpers";
import { NIT_PROFILE, FISH_PROFILE, TAG_PROFILE, LAG_PROFILE } from "../../convex/lib/opponents/presets";
import type { LegalActions } from "../../convex/lib/state/game-state";
import type { BehavioralParams } from "../../convex/lib/types/opponents";
import { seededRandom } from "../../convex/lib/primitives/deck";

// ─── Helpers ───

function makeLegal(overrides: Partial<LegalActions> = {}): LegalActions {
  return {
    seatIndex: 0,
    position: "btn",
    canFold: true,
    canCheck: false,
    canCall: true,
    callAmount: 2,
    canBet: false,
    betMin: 0,
    betMax: 0,
    canRaise: true,
    raiseMin: 4,
    raiseMax: 1000,
    isCallAllIn: false,
    explanation: "test",
    ...overrides,
  };
}

function makeParams(overrides: Partial<BehavioralParams> = {}): BehavioralParams {
  return {
    continuePct: 50,
    raisePct: 50,
    positionAwareness: 0.5,
    bluffFrequency: 0.1,
    sizings: [{ action: "bet", sizingPct: 66, weight: 1.0 }],
    explanation: "test params",
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════
// classifyCurrentDecision
// ═══════════════════════════════════════════════════════

describe("classifyCurrentDecision", () => {
  it("classifies initial preflop as preflop.open", () => {
    const { state } = initializeHand(createTestConfig({ seed: 42 }));
    const activeSeat = state.players[state.activePlayerIndex!].seatIndex;
    const key = classifyCurrentDecision(state, activeSeat);
    expect(key).toBe("preflop.open");
  });

  it("classifies facing a raise as preflop.facing_raise", () => {
    const { state } = initializeHand(createTestConfig({ seed: 42 }));
    // UTG raises
    const utg = state.players[state.activePlayerIndex!].seatIndex;
    const s2 = applyAction(state, utg, "raise", 6).state;
    // Next player faces a raise
    const nextSeat = s2.players[s2.activePlayerIndex!].seatIndex;
    const key = classifyCurrentDecision(s2, nextSeat);
    expect(key).toBe("preflop.facing_raise");
  });

  it("classifies facing a 3-bet as preflop.facing_3bet", () => {
    const { state } = initializeHand(createTestConfig({ seed: 42 }));
    // UTG raises
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "raise", 6).state;
    // HJ 3-bets
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "raise", 18).state;
    // CO faces a 3-bet
    const key = classifyCurrentDecision(s, s.players[s.activePlayerIndex!].seatIndex);
    expect(key).toBe("preflop.facing_3bet");
  });

  it("classifies postflop aggressor in position", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    // BTN (seat 0, in position) raises
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "raise", 6).state;
    // BB calls
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "call").state;
    // Now on flop, BB checks
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "check").state;
    // BTN is the aggressor IP on the flop
    const btnSeat = s.players[s.activePlayerIndex!].seatIndex;
    const key = classifyCurrentDecision(s, btnSeat);
    expect(key).toBe("postflop.aggressor.ip");
  });

  it("classifies postflop facing a bet", () => {
    const { state } = initializeHand(createHeadsUpConfig({ seed: 42 }));
    // BTN calls, BB checks → flop
    let s = applyAction(state, state.players[state.activePlayerIndex!].seatIndex, "call").state;
    s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "check").state;
    // On flop: BB bets
    const legal = currentLegalActions(s)!;
    if (legal.canBet) {
      s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "bet", legal.betMin).state;
    } else {
      s = applyAction(s, s.players[s.activePlayerIndex!].seatIndex, "check").state;
      // Skip if BB can't bet — but they should be able to on flop
    }
    if (s.activePlayerIndex !== null) {
      const nextSeat = s.players[s.activePlayerIndex].seatIndex;
      const key = classifyCurrentDecision(s, nextSeat);
      expect(key).toBe("postflop.facing_bet");
    }
  });
});

// ═══════════════════════════════════════════════════════
// sampleActionFromParams
// ═══════════════════════════════════════════════════════

describe("sampleActionFromParams", () => {
  it("folds when roll exceeds continuePct", () => {
    const params = makeParams({ continuePct: 20 });
    // Random always returns 0.95 → roll=95 which > 20 → fold
    const result = sampleActionFromParams(params, makeLegal(), 10, () => 0.95);
    expect(result.actionType).toBe("fold");
  });

  it("checks when wants to fold but no bet to face", () => {
    const params = makeParams({ continuePct: 20 });
    const legal = makeLegal({ canFold: false, canCheck: true, canCall: false });
    const result = sampleActionFromParams(params, legal, 10, () => 0.95);
    expect(result.actionType).toBe("check");
  });

  it("raises when continuing and raiseRoll < raisePct", () => {
    const params = makeParams({
      continuePct: 100,
      raisePct: 100,
      sizings: [{ action: "raise", sizingPct: 75, weight: 1.0 }],
    });
    // First roll: continue (any), second roll: raise (0 < 100)
    let callCount = 0;
    const mockRandom = () => {
      callCount++;
      return callCount === 1 ? 0.0 : 0.0; // Both rolls succeed
    };
    const result = sampleActionFromParams(params, makeLegal(), 100, mockRandom);
    expect(result.actionType).toBe("raise");
    expect(result.amount).toBeDefined();
  });

  it("calls when continuing but raiseRoll >= raisePct", () => {
    const params = makeParams({
      continuePct: 100,
      raisePct: 0, // never raise
    });
    let callCount = 0;
    const mockRandom = () => {
      callCount++;
      return callCount === 1 ? 0.0 : 0.5;
    };
    const result = sampleActionFromParams(params, makeLegal(), 100, mockRandom);
    expect(result.actionType).toBe("call");
  });

  it("checks when continuing passively with no bet to face", () => {
    const params = makeParams({
      continuePct: 100,
      raisePct: 0,
    });
    const legal = makeLegal({
      canFold: false,
      canCheck: true,
      canCall: false,
      canRaise: false,
      canBet: false,
    });
    const result = sampleActionFromParams(params, legal, 10, () => 0.0);
    expect(result.actionType).toBe("check");
  });
});

// ═══════════════════════════════════════════════════════
// chooseBetSize
// ═══════════════════════════════════════════════════════

describe("chooseBetSize", () => {
  it("chooses sizing based on pot percentage", () => {
    const params = makeParams({
      sizings: [{ action: "bet", sizingPct: 75, weight: 1.0 }],
    });
    const size = chooseBetSize(params, 100, 2, 1000, () => 0.0);
    expect(size).toBe(75); // 75% of 100
  });

  it("clamps to min when sizing is below minimum", () => {
    const params = makeParams({
      sizings: [{ action: "bet", sizingPct: 10, weight: 1.0 }],
    });
    const size = chooseBetSize(params, 10, 20, 1000, () => 0.0);
    expect(size).toBe(20); // 10% of 10 = 1, clamped to min 20
  });

  it("clamps to max when sizing exceeds maximum", () => {
    const params = makeParams({
      sizings: [{ action: "bet", sizingPct: 300, weight: 1.0 }],
    });
    const size = chooseBetSize(params, 100, 2, 50, () => 0.0);
    expect(size).toBe(50); // 300% of 100 = 300, clamped to max 50
  });

  it("returns min when min equals max", () => {
    const params = makeParams();
    const size = chooseBetSize(params, 100, 50, 50, () => 0.0);
    expect(size).toBe(50);
  });

  it("uses default 66% pot with no sizings", () => {
    const params = makeParams({ sizings: [] });
    const size = chooseBetSize(params, 100, 2, 1000, () => 0.0);
    expect(size).toBe(66); // 66% of 100
  });
});

// ═══════════════════════════════════════════════════════
// bluff frequency in sampleActionFromParams
// ═══════════════════════════════════════════════════════

describe("bluff frequency in sampleActionFromParams", () => {
  it("bluffs when high bluffFrequency and hand would fold", () => {
    // continuePct=0 forces fold. bluffFrequency=0.35 means 35% of those
    // "fold" decisions get converted to bluff-raises.
    const params = makeParams({ continuePct: 0, bluffFrequency: 0.35 });
    const legal = makeLegal(); // canRaise=true
    const random = seededRandom(1);

    let bluffs = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      const result = sampleActionFromParams(params, legal, 100, random);
      if (result.actionType === "raise" || result.actionType === "bet") {
        bluffs++;
      }
    }

    // With bluffFrequency=0.35, ~35% of decisions should be bluff-raises
    expect(bluffs).toBeGreaterThan(trials * 0.2);
    expect(bluffs).toBeLessThan(trials * 0.5);
  });

  it("never bluffs when bluffFrequency is 0", () => {
    const params = makeParams({ continuePct: 0, bluffFrequency: 0 });
    const legal = makeLegal();
    const random = seededRandom(2);

    let bluffs = 0;
    for (let i = 0; i < 100; i++) {
      const result = sampleActionFromParams(params, legal, 100, random);
      if (result.actionType === "raise" || result.actionType === "bet") {
        bluffs++;
      }
    }

    expect(bluffs).toBe(0);
  });

  it("bluff pathway not triggered when hand continues", () => {
    // With continuePct=100 the hand always continues — bluff pathway is skipped.
    // The raise/call decision uses raisePct, not bluffFrequency.
    const params = makeParams({ continuePct: 100, raisePct: 0, bluffFrequency: 1.0 });
    const legal = makeLegal();
    const random = seededRandom(3);

    let raises = 0;
    for (let i = 0; i < 100; i++) {
      const result = sampleActionFromParams(params, legal, 100, random);
      if (result.actionType === "raise" || result.actionType === "bet") {
        raises++;
      }
    }

    // raisePct=0 → no value raises. bluffFrequency only applies to fold/check path.
    expect(raises).toBe(0);
  });

  it("bluff returns isBluff flag", () => {
    // Force a bluff: continuePct=0 (always fold path), bluffFrequency=1.0 (always bluff)
    const params = makeParams({ continuePct: 0, bluffFrequency: 1.0 });
    const legal = makeLegal(); // canRaise=true
    // Need 3 random calls: 1 for continuePct roll, 1 for bluff roll, 1+ for sizing
    let callCount = 0;
    const mockRandom = () => {
      callCount++;
      return callCount === 1
        ? 0.99  // Exceeds continuePct (0) → fold path
        : 0.0;  // bluff roll < bluffFrequency (1.0) → bluff!
    };

    const result = sampleActionFromParams(params, legal, 100, mockRandom);
    expect(result.actionType).toBe("raise");
    expect(result.isBluff).toBe(true);
  });

  it("cannot bluff without raise/bet legal actions", () => {
    const params = makeParams({ continuePct: 0, bluffFrequency: 1.0 });
    const legal = makeLegal({
      canRaise: false,
      canBet: false,
      canFold: true,
    });
    const random = seededRandom(4);

    let bluffs = 0;
    for (let i = 0; i < 100; i++) {
      const result = sampleActionFromParams(params, legal, 100, random);
      if (result.isBluff) bluffs++;
    }

    expect(bluffs).toBe(0);
  });

  it("bluffs with bet when canRaise is false but canBet is true", () => {
    const params = makeParams({ continuePct: 0, bluffFrequency: 1.0 });
    const legal = makeLegal({
      canRaise: false,
      canBet: true,
      betMin: 2,
      betMax: 100,
      canFold: false,
      canCheck: true,
      canCall: false,
    });
    let callCount = 0;
    const mockRandom = () => {
      callCount++;
      return callCount === 1
        ? 0.99  // Exceeds continuePct → fold/check path
        : 0.0;  // bluff roll succeeds
    };

    const result = sampleActionFromParams(params, legal, 100, mockRandom);
    expect(result.actionType).toBe("bet");
    expect(result.isBluff).toBe(true);
    expect(result.amount).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════
// chooseActionFromProfile (integration)
// ═══════════════════════════════════════════════════════

describe("chooseActionFromProfile", () => {
  it("nit folds most of the time preflop across multiple deals", () => {
    // Test across multiple deal seeds to account for solver hand-class data
    // (strong hands like AA correctly don't fold even as NIT)
    let totalFolds = 0;
    const totalTrials = 100;

    for (let seed = 0; seed < totalTrials; seed++) {
      const { state } = initializeHand(createTestConfig({ seed }));
      const activeSeat = state.activePlayerIndex!;
      const legal = currentLegalActions(state)!;
      const random = seededRandom(seed + 1000);

      const decision = chooseActionFromProfile(state, activeSeat, NIT_PROFILE, legal, undefined, random);
      if (decision.actionType === "fold") totalFolds++;
    }

    // NIT should fold a majority of random hands — at least 40%
    expect(totalFolds).toBeGreaterThan(40);
  });

  it("fish continues most of the time", () => {
    const { state } = initializeHand(createTestConfig({ seed: 42 }));
    const activeSeat = state.activePlayerIndex!;
    const legal = currentLegalActions(state)!;
    const random = seededRandom(2);

    let continues = 0;
    for (let i = 0; i < 100; i++) {
      const decision = chooseActionFromProfile(state, activeSeat, FISH_PROFILE, legal, undefined, random);
      if (decision.actionType !== "fold") continues++;
    }

    // Fish has high continuePct → should continue often
    expect(continues).toBeGreaterThan(40);
  });

  it("returns a valid situation key", () => {
    const { state } = initializeHand(createTestConfig({ seed: 42 }));
    const activeSeat = state.activePlayerIndex!;
    const legal = currentLegalActions(state)!;

    const decision = chooseActionFromProfile(state, activeSeat, TAG_PROFILE, legal);
    expect(decision.situationKey).toBe("preflop.open");
    expect(decision.explanation).toContain("TAG");
  });

  it("produces valid amounts for raise decisions", () => {
    const { state } = initializeHand(createTestConfig({ seed: 42 }));
    const activeSeat = state.activePlayerIndex!;
    const legal = currentLegalActions(state)!;
    const random = seededRandom(3);

    // Run many trials and check all raise amounts are within legal bounds
    for (let i = 0; i < 100; i++) {
      const decision = chooseActionFromProfile(state, activeSeat, LAG_PROFILE, legal, undefined, random);
      if (decision.actionType === "raise" && decision.amount !== undefined) {
        expect(decision.amount).toBeGreaterThanOrEqual(legal.raiseMin);
        expect(decision.amount).toBeLessThanOrEqual(legal.raiseMax);
      }
      if (decision.actionType === "bet" && decision.amount !== undefined) {
        expect(decision.amount).toBeGreaterThanOrEqual(legal.betMin);
        expect(decision.amount).toBeLessThanOrEqual(legal.betMax);
      }
    }
  });
});
