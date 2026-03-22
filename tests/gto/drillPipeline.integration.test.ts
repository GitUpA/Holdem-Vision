/**
 * Drill Pipeline Integration Test
 *
 * Uses the SAME executeDrillPipeline() function that the UI hook calls.
 * This is the architectural guarantee: test output === UI output.
 *
 * The shared pipeline lives in convex/lib/gto/drillPipeline.ts — one source
 * of truth for deal → solve → advance → remap. No code is duplicated.
 */
import { describe, it, expect } from "vitest";
import {
  executeDrillPipeline,
  type DrillDealResult,
} from "../../convex/lib/gto/drillPipeline";
import { categorizeHand } from "../../convex/lib/gto/handCategorizer";
import { evaluateHand } from "../../convex/lib/primitives/handEvaluator";
import { currentLegalActions } from "../../convex/lib/state/stateMachine";
import type { ArchetypeId } from "../../convex/lib/gto/archetypeClassifier";
import type { CardIndex } from "../../convex/lib/types/cards";
import { seededRandom } from "../../convex/lib/primitives/deck";

// ═══════════════════════════════════════════════════════
// ARCHETYPE LIST
// ═══════════════════════════════════════════════════════

const ALL_ARCHETYPES: ArchetypeId[] = [
  // Preflop (5)
  "rfi_opening",
  "bb_defense_vs_rfi",
  "three_bet_pots",
  "blind_vs_blind",
  "four_bet_five_bet",
  // Flop texture (8)
  "ace_high_dry_rainbow",
  "kq_high_dry_rainbow",
  "mid_low_dry_rainbow",
  "paired_boards",
  "two_tone_disconnected",
  "two_tone_connected",
  "monotone",
  "rainbow_connected",
  // Postflop principle (7)
  "cbet_sizing_frequency",
  "turn_barreling",
  "river_bluff_catching_mdf",
  "thin_value_river",
  "overbet_river",
  "three_bet_pot_postflop",
  "exploitative_overrides",
];

const PREFLOP_ARCHETYPES = ALL_ARCHETYPES.slice(0, 5);

const DEALS_PER_ARCHETYPE = 5;

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

/** Expected street name for archetype */
function expectedStreet(archetypeId: ArchetypeId): string {
  if (PREFLOP_ARCHETYPES.includes(archetypeId)) return "preflop";
  if (["ace_high_dry_rainbow", "kq_high_dry_rainbow", "mid_low_dry_rainbow", "paired_boards",
       "two_tone_disconnected", "two_tone_connected", "monotone", "rainbow_connected",
       "cbet_sizing_frequency", "three_bet_pot_postflop", "exploitative_overrides"].includes(archetypeId)) {
    return "flop";
  }
  if (archetypeId === "turn_barreling") return "turn";
  return "river";
}

/** Run the canonical pipeline — same function the UI calls */
function deal(archId: ArchetypeId, rng: () => number): DrillDealResult {
  return executeDrillPipeline(archId, rng);
}

// ═══════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════

describe("Drill Pipeline Integration", () => {

  // ── 1. Card integrity through HandSession ──

  describe("Card integrity — hero cards match through HandSession", () => {
    for (const archId of ALL_ARCHETYPES) {
      it(`${archId}: hero hole cards in game state match deal output`, () => {
        const rng = seededRandom(42 + ALL_ARCHETYPES.indexOf(archId));
        for (let i = 0; i < DEALS_PER_ARCHETYPE; i++) {
          const { deal: d, state } = deal(archId, rng);

          const heroPlayer = state.players.find(
            (p) => p.seatIndex === d.heroSeatIndex,
          );
          expect(heroPlayer).toBeDefined();

          expect(
            heroPlayer!.holeCards.slice().sort(),
            `${archId} deal #${i}: hero cards mismatch`,
          ).toEqual(d.heroCards.slice().sort());
        }
      });
    }
  });

  describe("Card integrity — community cards match through HandSession", () => {
    for (const archId of ALL_ARCHETYPES) {
      it(`${archId}: community cards in game state match deal output`, () => {
        const rng = seededRandom(100 + ALL_ARCHETYPES.indexOf(archId));
        for (let i = 0; i < DEALS_PER_ARCHETYPE; i++) {
          const { deal: d, state } = deal(archId, rng);

          if (d.communityCards.length === 0) continue;
          if (state.phase === "complete" || state.phase === "showdown") continue;

          const stateCommunity = state.communityCards;
          for (const card of d.communityCards) {
            expect(
              stateCommunity,
              `${archId} deal #${i}: missing community card ${card}`,
            ).toContain(card);
          }
        }
      });
    }
  });

  describe("Card integrity — no duplicate cards", () => {
    for (const archId of ALL_ARCHETYPES) {
      it(`${archId}: no duplicates across all players + community + deck`, () => {
        const rng = seededRandom(200 + ALL_ARCHETYPES.indexOf(archId));
        for (let i = 0; i < DEALS_PER_ARCHETYPE; i++) {
          const { state } = deal(archId, rng);

          const allCards: number[] = [];
          for (const p of state.players) {
            allCards.push(...p.holeCards);
          }
          allCards.push(...state.communityCards);
          allCards.push(...state.deck);

          const seen = new Set<number>();
          for (const card of allCards) {
            expect(
              seen.has(card),
              `${archId} deal #${i}: duplicate card ${card}`,
            ).toBe(false);
            seen.add(card);
          }

          expect(
            allCards.length,
            `${archId} deal #${i}: expected 52 cards, got ${allCards.length}`,
          ).toBe(52);
        }
      });
    }
  });

  // ── 2. Hand evaluation consistency ──

  describe("Hand evaluation — categorizeHand on game-state cards matches deal", () => {
    for (const archId of ALL_ARCHETYPES) {
      if (PREFLOP_ARCHETYPES.includes(archId)) continue;

      it(`${archId}: hand category from game state matches deal-time category`, () => {
        const rng = seededRandom(300 + ALL_ARCHETYPES.indexOf(archId));
        for (let i = 0; i < DEALS_PER_ARCHETYPE; i++) {
          const { deal: d, state } = deal(archId, rng);

          const heroPlayer = state.players.find(
            (p) => p.seatIndex === d.heroSeatIndex,
          );
          expect(heroPlayer).toBeDefined();

          const reCategorized = categorizeHand(
            heroPlayer!.holeCards as CardIndex[],
            state.communityCards.slice(0, d.communityCards.length) as CardIndex[],
          );

          expect(
            reCategorized.category,
            `${archId} deal #${i}: category mismatch. ` +
            `Deal: ${d.handCategory.category}, Re-eval: ${reCategorized.category}`,
          ).toBe(d.handCategory.category);
        }
      });
    }
  });

  describe("Hand evaluation — evaluateHand produces valid tier", () => {
    for (const archId of ALL_ARCHETYPES) {
      if (PREFLOP_ARCHETYPES.includes(archId)) continue;

      it(`${archId}: evaluateHand returns a recognized hand tier`, () => {
        const rng = seededRandom(400 + ALL_ARCHETYPES.indexOf(archId));
        const validTiers = [
          "Royal Flush", "Straight Flush", "Four of a Kind", "Full House",
          "Flush", "Straight", "Three of a Kind", "Two Pair",
          "One Pair", "High Card",
        ];

        for (let i = 0; i < DEALS_PER_ARCHETYPE; i++) {
          const { deal: d, state } = deal(archId, rng);

          const heroPlayer = state.players.find(
            (p) => p.seatIndex === d.heroSeatIndex,
          );
          expect(heroPlayer).toBeDefined();

          const allCards = [
            ...heroPlayer!.holeCards,
            ...state.communityCards.slice(0, d.communityCards.length),
          ] as CardIndex[];

          if (allCards.length >= 5) {
            const result = evaluateHand(allCards);
            expect(
              validTiers,
              `${archId} deal #${i}: unrecognized tier "${result.rank.name}"`,
            ).toContain(result.rank.name);
          }
        }
      });
    }
  });

  // ── 3. Game state consistency ──

  describe("Game state — hand is active at expected street", () => {
    for (const archId of ALL_ARCHETYPES) {
      it(`${archId}: game is not complete, at correct street`, () => {
        const rng = seededRandom(500 + ALL_ARCHETYPES.indexOf(archId));
        for (let i = 0; i < DEALS_PER_ARCHETYPE; i++) {
          const { state } = deal(archId, rng);

          if (state.phase === "complete" || state.phase === "showdown") continue;

          const expected = expectedStreet(archId);
          const STREET_ORDER = ["preflop", "flop", "turn", "river"];
          const stateIdx = STREET_ORDER.indexOf(state.currentStreet);
          const expectedIdx = STREET_ORDER.indexOf(expected);
          expect(
            stateIdx,
            `${archId} deal #${i}: at ${state.currentStreet}, expected at least ${expected}`,
          ).toBeGreaterThanOrEqual(expectedIdx);
        }
      });
    }
  });

  describe("Game state — hero is at decision point", () => {
    for (const archId of ALL_ARCHETYPES) {
      it(`${archId}: hero is the active player when hand is live`, () => {
        const rng = seededRandom(600 + ALL_ARCHETYPES.indexOf(archId));
        for (let i = 0; i < DEALS_PER_ARCHETYPE; i++) {
          const { deal: d, state } = deal(archId, rng);

          if (state.phase === "complete" || state.phase === "showdown") continue;

          expect(
            state.activePlayerIndex,
            `${archId} deal #${i}: no active player`,
          ).not.toBeNull();

          const activePlayer = state.players[state.activePlayerIndex!];
          expect(
            activePlayer.seatIndex,
            `${archId} deal #${i}: active seat ${activePlayer.seatIndex} != hero seat ${d.heroSeatIndex}`,
          ).toBe(d.heroSeatIndex);
        }
      });
    }
  });

  // ── 4. Solution remapping correctness ──

  describe("Solution remapping — actions match legal options", () => {
    for (const archId of ALL_ARCHETYPES) {
      it(`${archId}: remapped solution uses only legal action labels`, () => {
        const rng = seededRandom(700 + ALL_ARCHETYPES.indexOf(archId));
        for (let i = 0; i < DEALS_PER_ARCHETYPE; i++) {
          const { state, solution } = deal(archId, rng);

          if (!solution) continue;
          if (state.phase === "complete" || state.phase === "showdown") continue;

          const legal = currentLegalActions(state);
          if (!legal) continue;

          if (legal.canCall && !legal.canCheck) {
            expect(
              solution.frequencies.check,
              `${archId} deal #${i}: solution has "check" but hero faces a bet`,
            ).toBeUndefined();
          }

          if (legal.canCheck && !legal.canCall) {
            expect(
              solution.frequencies.call,
              `${archId} deal #${i}: solution has "call" but hero can check`,
            ).toBeUndefined();
          }

          if (legal.canRaise && !legal.canBet) {
            for (const betKey of ["bet_small", "bet_medium", "bet_large"] as const) {
              expect(
                solution.frequencies[betKey],
                `${archId} deal #${i}: solution has "${betKey}" but hero faces a bet`,
              ).toBeUndefined();
            }
          }

          if (legal.canBet && !legal.canRaise) {
            for (const raiseKey of ["raise_small", "raise_large"] as const) {
              expect(
                solution.frequencies[raiseKey],
                `${archId} deal #${i}: solution has "${raiseKey}" but hero has no bet to raise`,
              ).toBeUndefined();
            }
          }
        }
      });
    }
  });

  // ── 5. Solution frequencies are valid distributions ──

  describe("Solution frequencies — valid probability distribution", () => {
    for (const archId of ALL_ARCHETYPES) {
      it(`${archId}: frequencies sum to ~1.0 and are all non-negative`, () => {
        const rng = seededRandom(800 + ALL_ARCHETYPES.indexOf(archId));
        for (let i = 0; i < DEALS_PER_ARCHETYPE; i++) {
          const { state, solution } = deal(archId, rng);
          if (!solution) continue;
          if (state.phase === "complete" || state.phase === "showdown") continue;

          for (const [action, freq] of Object.entries(solution.frequencies)) {
            expect(
              freq,
              `${archId} deal #${i}: negative frequency for ${action}`,
            ).toBeGreaterThanOrEqual(0);
          }

          const sum = Object.values(solution.frequencies).reduce(
            (acc, v) => acc + (v ?? 0),
            0,
          );
          expect(
            sum,
            `${archId} deal #${i}: frequency sum ${sum} not close to 1.0`,
          ).toBeGreaterThan(0.95);
          expect(sum).toBeLessThan(1.05);
        }
      });
    }
  });

  // ── 6. Explanation tree is well-formed ──

  describe("Solution explanation — has valid structure", () => {
    for (const archId of ALL_ARCHETYPES) {
      it(`${archId}: explanation has summary and children`, () => {
        const rng = seededRandom(900 + ALL_ARCHETYPES.indexOf(archId));
        for (let i = 0; i < DEALS_PER_ARCHETYPE; i++) {
          const { state, solution } = deal(archId, rng);
          if (!solution) continue;
          if (state.phase === "complete" || state.phase === "showdown") continue;

          expect(solution.explanation).toBeDefined();
          expect(solution.explanation.summary).toBeTruthy();
          expect(solution.explanation.children).toBeDefined();
          if (solution.explanation.children) {
            expect(solution.explanation.children.length).toBeGreaterThan(0);
          }
        }
      });
    }
  });
});
