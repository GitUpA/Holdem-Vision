/**
 * Shared GTO Frequency Lookup — single source of truth for solver data retrieval.
 *
 * Both the engine (modifiedGtoEngine) and coaching lens (coachingLens) use this
 * function to look up GTO frequencies. This eliminates the duplicate lookup logic
 * that previously existed in both paths.
 *
 * Canonical lookup order:
 * 1. Preflop per-hand-class (169 grid, solver-quality complete table)
 * 2. Postflop facing-bet (solver tables) — when hero faces a bet
 * 3. Postflop per-category (solver tables) — when confidence >= threshold AND table exists
 * 4. Postflop per-hand-class (500k aggregated) — fallback
 * 5. Equity-based recommendation — when opponents available
 * 6. Return null
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
import type { DataConfidence } from "./dataConfidence";
import { buildDataConfidence } from "./dataConfidence";

import {
  classifyArchetype,
  contextFromGameState,
} from "./archetypeClassifier";
import { categorizeHand } from "./handCategorizer";
import {
  lookupFrequencies,
  hasTable,
  lookupPostflopHandClass,
  postflopHandClassToActionFrequencies,
  lookupFacingBetFrequencies,
  hasFacingBetData,
  facingBetToActionFrequencies,
} from "./tables";
import { equityBasedRecommendation } from "../analysis/equityRecommendation";
import { comboToHandClass, cardsToCombo } from "../opponents/combos";
import { classifyPreflopHand, classificationToFrequencies, type PreflopClassification } from "./preflopClassification";

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
  source: "preflop-handclass" | "preflop-classification" | "postflop-handclass" | "category" | "equity";
  archetype: ArchetypeClassification;
  handCat: HandCategorization;
  /** Frequency bands (if solver distributions available) */
  bands?: ActionFrequencyBands;
  /** Archetype-level accuracy (if available) */
  archetypeAccuracy?: ArchetypeAccuracy;
  /** Preflop confidence based on sample count */
  preflopConfidence?: PreflopConfidence;
  /** Preflop range classification (when using classification system) */
  preflopClassification?: PreflopClassification;
  /** Whether this is an exact match or a fallback/interpolation */
  isExactMatch: boolean;
  /** Unified confidence assessment for this data source */
  confidence?: DataConfidence;
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

  const bigBlindForConf = gameState.blinds.big || 1;
  const potSizeBB = gameState.pot.total / bigBlindForConf;

  const classCtx = contextFromGameState(gameState, heroSeat);
  const archetype = classifyArchetype(classCtx);
  const street = gameState.currentStreet;
  const combo = cardsToCombo(heroCards[0], heroCards[1]);
  const handClass = comboToHandClass(combo);

  // ── 1. Preflop ──
  if (street === "preflop") {
    const position = gameState.players[heroSeat].position;
    const handCat = categorizeHand(heroCards, communityCards);
    const openerPos = findPreflopOpener(gameState, heroSeat);

    const classification = classifyPreflopHand(handClass, archetype.archetypeId, position, openerPos);
    const frequencies = classificationToFrequencies(classification, archetype.archetypeId);

    return attachConfidence({
      frequencies,
      source: "preflop-classification",
      archetype,
      handCat,
      preflopClassification: classification,
      isExactMatch: true,
    }, potSizeBB);
  }

  // ── 2a. Postflop facing-bet (hero can't check but can call) ──
  // Preflop already returned above, so street is always postflop here
  const isFacingBet = !legal.canCheck && legal.canCall;
  const lookupArchetypeId = archetype.textureArchetypeId ?? archetype.archetypeId;

  // Facing-bet tables are keyed with street prefix: "turn_ace_high_dry_rainbow", "river_paired_boards"
  const fbArchetypeId = (street === "turn" ? `turn_${lookupArchetypeId}`
    : street === "river" ? `river_${lookupArchetypeId}`
    : lookupArchetypeId) as typeof lookupArchetypeId;

  if (isFacingBet && (hasFacingBetData(fbArchetypeId) || hasFacingBetData(lookupArchetypeId))) {
    const handCat = categorizeHand(heroCards, communityCards);
    // Try street-specific first, fall back to generic (flop) table
    const fbLookup = lookupFacingBetFrequencies(
      fbArchetypeId,
      handCat.category,
      classCtx.isInPosition,
    ) ?? lookupFacingBetFrequencies(
      lookupArchetypeId,
      handCat.category,
      classCtx.isInPosition,
    );
    if (fbLookup) {
      return attachConfidence({
        frequencies: facingBetToActionFrequencies(fbLookup),
        source: "category",
        archetype,
        handCat,
        isExactMatch: true,
      }, potSizeBB);
    }
  }

  // ── 2b. Postflop per-category (solver tables) ──

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
      return attachConfidence({
        frequencies: lookup.frequencies,
        source: "category",
        archetype,
        handCat,
        bands: lookup.bands,
        archetypeAccuracy: lookup.archetypeAccuracy,
        isExactMatch: lookup.isExact,
      }, potSizeBB);
    }
  }

  // ── 3. PokerBench postflop per-hand-class (500k aggregated) ──
  {
    const pbLookup = lookupPostflopHandClass(
      lookupArchetypeId,
      handClass,
      classCtx.isInPosition,
      street,
    );

    if (pbLookup) {
      const handCat = categorizeHand(heroCards, communityCards);
      return attachConfidence({
        frequencies: postflopHandClassToActionFrequencies(pbLookup),
        source: "postflop-handclass",
        archetype,
        handCat,
        isExactMatch: false,
      }, potSizeBB);
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
      return attachConfidence({
        frequencies: eqResult.frequencies,
        source: "equity",
        archetype,
        handCat,
        isExactMatch: false,
      }, potSizeBB);
    }
  }

  // ── 5. No solver data available ──
  return null;
}

// ═══════════════════════════════════════════════════════
// CONFIDENCE ENRICHMENT
// ═══════════════════════════════════════════════════════

/**
 * Attach DataConfidence to a GtoLookupResult before returning.
 * potSizeBB is computed from gameState at the call site.
 */
function attachConfidence(
  result: GtoLookupResult,
  potSizeBB: number,
): GtoLookupResult {
  result.confidence = buildDataConfidence(result, potSizeBB);
  return result;
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
