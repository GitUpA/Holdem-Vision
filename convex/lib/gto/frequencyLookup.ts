/**
 * Shared GTO Frequency Lookup — single source of truth for solver data retrieval.
 *
 * Both the engine (modifiedGtoEngine) and coaching lens (coachingLens) use this
 * function to look up GTO frequencies. This eliminates the duplicate lookup logic
 * that previously existed in both paths.
 *
 * Canonical lookup order:
 * 1. Preflop per-hand-class (169 grid from PokerBench)
 * 2. Postflop per-category (solver tables) — when confidence >= threshold AND table exists
 * 3. PokerBench postflop per-hand-class (500k aggregated) — fallback
 * 4. Equity-based recommendation — when opponents available
 * 5. Return null
 *
 * Does NOT apply calibrateWeakHandFrequencies() — consumers handle that if needed.
 * Does NOT apply remapFrequenciesToLegal() — consumers handle that if needed.
 * Does NOT build CoachingAdvice or ExplanationNode — those are consumer concerns.
 *
 * Pure TypeScript, zero Convex imports.
 */

import type { CardIndex } from "../types/cards";
import type { GameState, LegalActions } from "../state/gameState";
import type {
  ActionFrequencies,
  ActionFrequencyBands,
  ArchetypeAccuracy,
} from "./tables/types";
import type { ArchetypeClassification } from "./archetypeClassifier";
import type { HandCategorization } from "./handCategorizer";
import type { PreflopConfidence } from "./tables/preflopHandClass";
import type { OpponentInput } from "../analysis/equityRecommendation";

import {
  classifyArchetype,
  contextFromGameState,
} from "./archetypeClassifier";
import { categorizeHand } from "./handCategorizer";
import {
  lookupFrequencies,
  hasTable,
  lookupPreflopHandClass,
  handClassToActionFrequencies,
  getPreflopConfidence,
  lookupPostflopHandClass,
  postflopHandClassToActionFrequencies,
} from "./tables";
import { equityBasedRecommendation } from "../analysis/equityRecommendation";
import { comboToHandClass, cardsToCombo } from "../opponents/combos";
import { getRfiFrequencies, getBbDefenseFrequencies, get3BetFrequencies, getBvbFrequencies, get4BetFrequencies } from "./tables/preflopRanges";

// ═══════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════

/** Minimum archetype confidence to use solver tables. */
const CONFIDENCE_THRESHOLD = 0.6;

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface GtoLookupResult {
  frequencies: ActionFrequencies;
  source: "preflop-handclass" | "postflop-handclass" | "category" | "equity";
  archetype: ArchetypeClassification;
  handCat: HandCategorization;
  /** Frequency bands (if solver distributions available) */
  bands?: ActionFrequencyBands;
  /** Archetype-level accuracy (if available) */
  archetypeAccuracy?: ArchetypeAccuracy;
  /** Preflop confidence based on sample count */
  preflopConfidence?: PreflopConfidence;
  /** Whether this is an exact match or a fallback/interpolation */
  isExactMatch: boolean;
}

// ═══════════════════════════════════════════════════════
// MAIN LOOKUP
// ═══════════════════════════════════════════════════════

/**
 * Look up GTO frequencies from solver data using the canonical lookup chain.
 *
 * Returns null if no solver/equity data is available (caller should fall back
 * to heuristic methods like paramsToFrequencies).
 */
export function lookupGtoFrequencies(
  heroCards: CardIndex[],
  communityCards: CardIndex[],
  gameState: GameState,
  heroSeat: number,
  legal: LegalActions,
  opts?: {
    opponents?: OpponentInput[];
    deadCards?: CardIndex[];
  },
): GtoLookupResult | null {
  if (heroCards.length < 2) return null;

  const classCtx = contextFromGameState(gameState, heroSeat);
  const archetype = classifyArchetype(classCtx);
  const street = gameState.currentStreet;
  const combo = cardsToCombo(heroCards[0], heroCards[1]);
  const handClass = comboToHandClass(combo);

  // ── 1. Preflop ──
  if (street === "preflop") {
    const position = gameState.players[heroSeat].position;
    const handCat = categorizeHand(heroCards, communityCards);

    // ── Primary: PokerBench per-hand-class data (solver-derived, position-aware) ──
    const openerPos = findPreflopOpener(gameState, heroSeat);
    const hcLookup = lookupPreflopHandClass(
      archetype.archetypeId,
      position,
      handClass,
      openerPos,
    );

    if (hcLookup) {
      return {
        frequencies: handClassToActionFrequencies(hcLookup, archetype.archetypeId),
        source: "preflop-handclass",
        archetype,
        handCat,
        preflopConfidence: getPreflopConfidence(hcLookup),
        isExactMatch: true,
      };
    }

    // ── Fallback: validated GTO ranges for hands missing from PokerBench data ──
    let fallbackFreqs: { fold: number; call: number; raise: number } | null = null;
    switch (archetype.archetypeId) {
      case "rfi_opening":
        fallbackFreqs = getRfiFrequencies(handClass, position); break;
      case "bb_defense_vs_rfi":
        fallbackFreqs = getBbDefenseFrequencies(handClass, openerPos ?? "btn"); break;
      case "three_bet_pots":
        fallbackFreqs = get3BetFrequencies(handClass, position); break;
      case "blind_vs_blind":
        fallbackFreqs = getBvbFrequencies(handClass, position); break;
      case "four_bet_five_bet": {
        const raises = gameState.actionHistory.filter(
          (a) => a.street === "preflop" && (a.actionType === "raise" || a.actionType === "bet"),
        );
        fallbackFreqs = get4BetFrequencies(handClass, raises.length); break;
      }
    }

    if (fallbackFreqs) {
      const raiseAction = archetype.archetypeId === "rfi_opening" || archetype.archetypeId === "blind_vs_blind"
        ? "bet_medium" : "raise_large";
      return {
        frequencies: {
          fold: fallbackFreqs.fold,
          call: fallbackFreqs.call,
          [raiseAction]: fallbackFreqs.raise,
        },
        source: "preflop-handclass",
        archetype,
        handCat,
        isExactMatch: false, // fallback, not primary data
      };
    }
  }

  // ── 2. Postflop per-category (solver tables) ──
  const lookupArchetypeId = archetype.textureArchetypeId ?? archetype.archetypeId;

  if (archetype.confidence >= CONFIDENCE_THRESHOLD && hasTable(lookupArchetypeId, street)) {
    const handCat = categorizeHand(heroCards, communityCards);
    const lookup = lookupFrequencies(
      lookupArchetypeId,
      handCat.category,
      classCtx.isInPosition,
      street,
      handClass,
    );

    if (lookup) {
      return {
        frequencies: lookup.frequencies,
        source: "category",
        archetype,
        handCat,
        bands: lookup.bands,
        archetypeAccuracy: lookup.archetypeAccuracy,
        isExactMatch: lookup.isExact,
      };
    }
  }

  // ── 3. PokerBench postflop per-hand-class (500k aggregated) ──
  if (street !== "preflop") {
    const pbLookup = lookupPostflopHandClass(
      lookupArchetypeId,
      handClass,
      classCtx.isInPosition,
      street,
    );

    if (pbLookup) {
      const handCat = categorizeHand(heroCards, communityCards);
      return {
        frequencies: postflopHandClassToActionFrequencies(pbLookup),
        source: "postflop-handclass",
        archetype,
        handCat,
        isExactMatch: false,
      };
    }
  }

  // ── 4. Equity-based recommendation ──
  if (opts?.opponents && opts.opponents.length > 0) {
    const bigBlind = gameState.blinds.big || 1;
    const potBB = gameState.pot.total / bigBlind;
    const hero = gameState.players[heroSeat];
    const callCostBB = legal.canCall
      ? (gameState.currentBet - hero.streetCommitted) / bigBlind
      : 0;

    const eqResult = equityBasedRecommendation(
      heroCards,
      communityCards,
      opts.opponents,
      potBB,
      callCostBB,
      street,
      classCtx.isInPosition,
      legal,
    );

    if (eqResult) {
      const handCat = categorizeHand(heroCards, communityCards);
      return {
        frequencies: eqResult.frequencies,
        source: "equity",
        archetype,
        handCat,
        isExactMatch: false,
      };
    }
  }

  // ── 5. No solver data available ──
  return null;
}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════

/**
 * Find the first preflop raiser's position (the opener) from action history.
 * Shared by both engine and coaching paths.
 */
export function findPreflopOpener(
  gameState: GameState,
  heroSeatIndex: number,
): string | undefined {
  for (const action of gameState.actionHistory) {
    if (action.street !== "preflop") break;
    if (action.seatIndex === heroSeatIndex) continue;
    if (action.actionType === "raise" || action.actionType === "bet") {
      return action.position;
    }
  }
  return undefined;
}
