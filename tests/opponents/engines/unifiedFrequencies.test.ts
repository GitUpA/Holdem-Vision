/**
 * Tests that all 4 engines produce ActionFrequencies in their reasoning output.
 * This validates the unified output format across the engine pipeline.
 */
import { describe, it, expect } from "vitest";
import type { DecisionContext } from "../../../convex/lib/opponents/engines/types";
import type { GameState, LegalActions } from "../../../convex/lib/state/game-state";
import type { OpponentProfile, BehavioralParams, SituationKey } from "../../../convex/lib/types/opponents";
import type { ActionFrequencies, GtoAction } from "../../../convex/lib/gto/tables/types";
import { getEngineOrDefault } from "../../../convex/lib/opponents/engines/engineRegistry";
import { paramsToFrequencies } from "../../../convex/lib/opponents/autoPlay";

// Ensure engines are registered
import "../../../convex/lib/opponents/engines/basicEngine";
import "../../../convex/lib/opponents/engines/rangeAwareEngine";
import "../../../convex/lib/opponents/engines/gtoEngine";
import "../../../convex/lib/opponents/engines/lookupGtoEngine";

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

const DEFAULT_PARAMS: BehavioralParams = {
  continuePct: 50,
  raisePct: 30,
  positionAwareness: 0.5,
  bluffFrequency: 0.10,
  sizings: [{ action: "bet", sizingPct: 66, weight: 1 }],
  explanation: "Test profile",
};

function makeResolvedParams(): Record<SituationKey, BehavioralParams> {
  const keys: SituationKey[] = [
    "preflop.open", "preflop.facing_raise", "preflop.facing_3bet", "preflop.facing_4bet",
    "postflop.aggressor.ip", "postflop.aggressor.oop", "postflop.caller.ip", "postflop.caller.oop",
    "postflop.facing_bet", "postflop.facing_raise", "postflop.facing_allin",
  ];
  const result = {} as Record<SituationKey, BehavioralParams>;
  for (const k of keys) result[k] = DEFAULT_PARAMS;
  return result;
}

function makeProfile(engineId: string): OpponentProfile {
  return {
    id: "test",
    name: "Test Profile",
    description: "For testing",
    engineId,
    situations: makeResolvedParams(),
  };
}

function makeLegal(opts: Partial<LegalActions> = {}): LegalActions {
  return {
    seatIndex: 2,
    position: "utg",
    canFold: true,
    canCheck: false,
    canCall: true,
    callAmount: 20,
    canBet: false,
    betMin: 0,
    betMax: 0,
    canRaise: true,
    raiseMin: 40,
    raiseMax: 200,
    isCallAllIn: false,
    explanation: "test",
    ...opts,
  };
}

// Minimal game state for testing
function makeGameState(street: "preflop" | "flop" = "preflop"): GameState {
  return {
    phase: "betting",
    currentStreet: street,
    handNumber: 1,
    numPlayers: 6,
    dealerSeatIndex: 0,
    blinds: { small: 1, big: 2 },
    pot: { total: 30, main: 30, side: [] },
    communityCards: street === "flop" ? [0, 13, 26] : [], // As, 2h, 3d
    deck: [],
    actionHistory: [],
    activePlayerIndex: 2,
    bettingRound: { roundNumber: 1, currentBet: 20, minRaise: 20 },
    players: [
      { seatIndex: 0, position: "sb", holeCards: [10, 23], currentStack: 200, totalBet: 1, roundBet: 1, hasFolded: false, isAllIn: false, cardVisibility: "hidden" as const },
      { seatIndex: 1, position: "bb", holeCards: [8, 21], currentStack: 200, totalBet: 2, roundBet: 2, hasFolded: false, isAllIn: false, cardVisibility: "hidden" as const },
      { seatIndex: 2, position: "utg", holeCards: [12, 25], currentStack: 200, totalBet: 20, roundBet: 20, hasFolded: false, isAllIn: false, cardVisibility: "revealed" as const }, // hero: Ah Ks
      { seatIndex: 3, position: "mp", holeCards: [4, 17], currentStack: 200, totalBet: 0, roundBet: 0, hasFolded: true, isAllIn: false, cardVisibility: "hidden" as const },
      { seatIndex: 4, position: "co", holeCards: [3, 16], currentStack: 200, totalBet: 0, roundBet: 0, hasFolded: true, isAllIn: false, cardVisibility: "hidden" as const },
      { seatIndex: 5, position: "btn", holeCards: [2, 15], currentStack: 200, totalBet: 0, roundBet: 0, hasFolded: true, isAllIn: false, cardVisibility: "hidden" as const },
    ],
  } as unknown as GameState;
}

function makeCtx(engineId: string, street: "preflop" | "flop" = "preflop"): DecisionContext {
  const profile = makeProfile(engineId);
  const legal = makeLegal();
  const state = makeGameState(street);
  return {
    state,
    seatIndex: 2,
    profile,
    resolvedParams: makeResolvedParams(),
    situationKey: street === "preflop" ? "preflop.facing_raise" : "postflop.facing_bet",
    params: DEFAULT_PARAMS,
    legal,
    potSize: 30,
    holeCards: [12, 25], // Ah Ks
    getBase: () => undefined,
    random: (() => { let i = 0; return () => [0.3, 0.7, 0.5, 0.2, 0.8, 0.1][i++ % 6]; })(),
  };
}

function assertValidFrequencies(freqs: ActionFrequencies) {
  const entries = Object.entries(freqs).filter(([, v]) => v !== undefined && v > 0);
  expect(entries.length).toBeGreaterThan(0);

  // All values should be 0-1
  for (const [action, value] of entries) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
    // Action should be a valid GtoAction
    const validActions: GtoAction[] = ["fold", "check", "call", "bet_small", "bet_medium", "bet_large", "raise_small", "raise_large"];
    expect(validActions).toContain(action);
  }

  // Should roughly sum to ~1 (allow small floating point variance)
  const total = entries.reduce((sum, [, v]) => sum + (v ?? 0), 0);
  expect(total).toBeGreaterThan(0.95);
  expect(total).toBeLessThan(1.05);
}

// ═══════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════

describe("Unified ActionFrequencies output", () => {
  describe("paramsToFrequencies converter", () => {
    it("converts basic params to valid frequencies", () => {
      const legal = makeLegal();
      const freqs = paramsToFrequencies(DEFAULT_PARAMS, legal);
      assertValidFrequencies(freqs);
    });

    it("fold probability decreases with high hand strength", () => {
      const legal = makeLegal();
      const weakFreqs = paramsToFrequencies(DEFAULT_PARAMS, legal, 0.2);
      const strongFreqs = paramsToFrequencies(DEFAULT_PARAMS, legal, 0.9);

      expect(weakFreqs.fold ?? 0).toBeGreaterThan(strongFreqs.fold ?? 0);
    });

    it("allocates bluffs from fold portion to aggressive actions", () => {
      const params: BehavioralParams = {
        ...DEFAULT_PARAMS,
        continuePct: 30, // high fold rate
        bluffFrequency: 0.20, // significant bluffs
      };
      const legal = makeLegal();
      const freqs = paramsToFrequencies(params, legal);

      // Should have bet/raise frequencies from bluffs
      const aggressive = (freqs.bet_small ?? 0) + (freqs.bet_medium ?? 0) + (freqs.bet_large ?? 0);
      expect(aggressive).toBeGreaterThan(0);
      assertValidFrequencies(freqs);
    });

    it("check replaces fold when fold is unavailable", () => {
      const legal = makeLegal({ canFold: false, canCheck: true });
      const freqs = paramsToFrequencies(DEFAULT_PARAMS, legal);

      expect(freqs.fold).toBeUndefined();
      expect(freqs.check).toBeGreaterThan(0);
      assertValidFrequencies(freqs);
    });

    it("maps sizings to correct GtoAction buckets", () => {
      const params: BehavioralParams = {
        ...DEFAULT_PARAMS,
        continuePct: 80,
        raisePct: 80,
        sizings: [
          { action: "bet", sizingPct: 33, weight: 1 }, // → bet_small
          { action: "bet", sizingPct: 75, weight: 1 }, // → bet_medium
          { action: "bet", sizingPct: 120, weight: 1 }, // → bet_large
        ],
      };
      const legal = makeLegal();
      const freqs = paramsToFrequencies(params, legal);

      // All three sizing buckets should be present
      expect(freqs.bet_small).toBeGreaterThan(0);
      expect(freqs.bet_medium).toBeGreaterThan(0);
      expect(freqs.bet_large).toBeGreaterThan(0);
      assertValidFrequencies(freqs);
    });

    it("handles continuePct=100 (never fold)", () => {
      const params = { ...DEFAULT_PARAMS, continuePct: 100 };
      const legal = makeLegal();
      const freqs = paramsToFrequencies(params, legal);

      expect(freqs.fold ?? 0).toBe(0);
      assertValidFrequencies(freqs);
    });

    it("handles continuePct=0 (always fold)", () => {
      const params = { ...DEFAULT_PARAMS, continuePct: 0, bluffFrequency: 0 };
      const legal = makeLegal();
      const freqs = paramsToFrequencies(params, legal);

      expect(freqs.fold).toBe(1);
      expect(freqs.call ?? 0).toBe(0);
    });
  });

  describe("all engines produce frequencies in reasoning", () => {
    it("basic engine includes frequencies", () => {
      const engine = getEngineOrDefault("basic");
      const ctx = makeCtx("basic");
      const decision = engine.decide(ctx);

      expect(decision.reasoning).toBeDefined();
      const freqs = decision.reasoning!.frequencies as ActionFrequencies;
      expect(freqs).toBeDefined();
      assertValidFrequencies(freqs);
    });

    it("range-aware engine includes frequencies", () => {
      const engine = getEngineOrDefault("range-aware");
      const ctx = makeCtx("range-aware");
      const decision = engine.decide(ctx);

      expect(decision.reasoning).toBeDefined();
      const freqs = decision.reasoning!.frequencies as ActionFrequencies;
      expect(freqs).toBeDefined();
      assertValidFrequencies(freqs);
    });

    it("gto heuristic engine includes frequencies", () => {
      const engine = getEngineOrDefault("gto");
      const ctx = makeCtx("gto");
      const decision = engine.decide(ctx);

      expect(decision.reasoning).toBeDefined();
      const freqs = decision.reasoning!.frequencies as ActionFrequencies;
      expect(freqs).toBeDefined();
      assertValidFrequencies(freqs);
    });

    it("lookup-gto engine includes frequencies (fallback path)", () => {
      // lookup-gto will fallback to heuristic gto since no solver tables
      // are loaded for preflop in this test context
      const engine = getEngineOrDefault("lookup-gto");
      const ctx = makeCtx("lookup-gto");
      const decision = engine.decide(ctx);

      expect(decision.reasoning).toBeDefined();
      const freqs = decision.reasoning!.frequencies as ActionFrequencies;
      expect(freqs).toBeDefined();
      assertValidFrequencies(freqs);
    });
  });

  describe("frequency consistency across engines", () => {
    it("strong hand produces higher continue frequency for all engines", () => {
      const engines = ["basic", "range-aware", "gto"];

      for (const engineId of engines) {
        const engine = getEngineOrDefault(engineId);

        // Strong hand: AKs (indices 12, 25 → Ah, Ks)
        const strongCtx = makeCtx(engineId);
        strongCtx.holeCards = [12, 25];
        const strongDecision = engine.decide(strongCtx);
        const strongFreqs = strongDecision.reasoning?.frequencies as ActionFrequencies | undefined;

        // Weak hand: 7h2d (indices 5, 14)
        const weakCtx = makeCtx(engineId);
        weakCtx.holeCards = [5, 14];
        // Reset the random seed
        weakCtx.random = (() => { let i = 0; return () => [0.3, 0.7, 0.5, 0.2, 0.8, 0.1][i++ % 6]; })();
        const weakDecision = engine.decide(weakCtx);
        const weakFreqs = weakDecision.reasoning?.frequencies as ActionFrequencies | undefined;

        if (strongFreqs && weakFreqs) {
          const strongFold = strongFreqs.fold ?? 0;
          const weakFold = weakFreqs.fold ?? 0;
          // Strong hand should fold less (or equal) than weak hand
          expect(strongFold).toBeLessThanOrEqual(weakFold + 0.01);
        }
      }
    });
  });
});
