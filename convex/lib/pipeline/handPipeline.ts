/**
 * Hand Pipeline — orchestrates HandContext through the hand lifecycle.
 *
 * Builds HandContext at preflop, updates at each street transition.
 * Same code path for HandSession (UI) and HandStepper (headless).
 *
 * Per first principles:
 * - Tracks the funnel (Layer 2)
 * - Seat-agnostic (Layer 6)
 * - Observable-only (Layer 7)
 *
 * Pure TypeScript, zero Convex/React imports.
 */

import type { GameState } from "../state/gameState";
import type { CardIndex, Position, Street } from "../types/cards";
import type { PlayerAction } from "../types/opponents";
import type { ArchetypeId } from "../gto/archetypeClassifier";
import { classifyArchetype, contextFromGameState } from "../gto/archetypeClassifier";
import { comboToHandClass, cardsToCombo } from "../opponents/combos";
import { classifyPreflopHand, classificationToFrequencies } from "../gto/preflopClassification";
import { classifySituationFromState, resolveArchetype } from "../preflop/situationRegistry";
import {
  createHandContext,
  recordHeroAction,
  recordVillainAction,
  type HandContext,
} from "./handContext";

// ═══════════════════════════════════════════════════════
// CONTEXT CONSTRUCTION
// ═══════════════════════════════════════════════════════

/**
 * Build initial HandContext from game state at the start of a hand.
 *
 * Called once at preflop, before hero's first action.
 */
export function buildInitialContext(
  gameState: GameState,
  heroSeatIndex: number,
  heroCards: CardIndex[],
): HandContext {
  const hero = gameState.players.find(p => p.seatIndex === heroSeatIndex);
  if (!hero || heroCards.length < 2) {
    // Minimal context when data is insufficient
    return createHandContext(
      "btn" as Position,
      "unknown",
      "rfi_opening" as ArchetypeId,
      false,
      0,
    );
  }

  // Classify the preflop archetype
  const classCtx = contextFromGameState(gameState, heroSeatIndex);
  const archetype = classifyArchetype(classCtx);

  // Determine hero's hand class
  const combo = cardsToCombo(heroCards[0], heroCards[1]);
  const handClass = comboToHandClass(combo);

  // Classify hero's hand via registry (position-aware, fixes missing openerPosition)
  const sitCtx = classifySituationFromState(gameState, heroSeatIndex);
  const preflopArchetypeId = resolveArchetype(sitCtx);
  const classification = classifyPreflopHand(
    handClass,
    preflopArchetypeId,
    hero.position,
    sitCtx.openerPosition ?? undefined,
  );
  const heroInRange = classification.rangeClass !== "clear_fold" && classification.rangeClass !== "borderline";
  const freqs = classificationToFrequencies(classification, preflopArchetypeId);
  const raiseFreq = Math.max(freqs.bet_medium ?? 0, freqs.raise_large ?? 0);

  return createHandContext(
    hero.position,
    handClass,
    archetype.archetypeId as ArchetypeId,
    heroInRange,
    raiseFreq,
  );
}

/**
 * Update HandContext after hero acts on a street.
 *
 * Called each time hero makes a decision. Records the action
 * and the GTO frequency for that action (for scoring context).
 */
export function updateContextAfterHeroAction(
  context: HandContext,
  street: Street,
  action: PlayerAction,
  gtoFrequency: number,
): HandContext {
  return recordHeroAction(context, street, action, gtoFrequency);
}

/**
 * Update HandContext after a villain acts.
 *
 * Records observable actions for the coaching engine to read
 * (Layer 7: only actions, no profile labels).
 */
export function updateContextAfterVillainAction(
  context: HandContext,
  villainIndex: number,
  villainPosition: Position,
  action: PlayerAction,
): HandContext {
  return recordVillainAction(context, villainIndex, villainPosition, action);
}

/**
 * Build HandContext from a completed or in-progress game state.
 *
 * Useful for reconstructing context mid-hand (e.g., when coaching
 * needs context but the pipeline wasn't tracking from the start).
 */
export function buildContextFromGameState(
  gameState: GameState,
  heroSeatIndex: number,
  heroCards: CardIndex[],
): HandContext {
  // Start with initial context
  let ctx = buildInitialContext(gameState, heroSeatIndex, heroCards);

  // Replay action history to build up villain contexts
  const hero = gameState.players.find(p => p.seatIndex === heroSeatIndex);
  if (!hero) return ctx;

  let villainIndexMap = new Map<number, number>(); // seatIndex → villainIndex
  let nextVillainIndex = 0;

  for (const action of gameState.actionHistory) {
    const player = gameState.players.find(p => p.seatIndex === action.seatIndex);
    if (!player) continue;

    const playerAction: PlayerAction = {
      street: action.street as Street,
      actionType: action.actionType,
      amount: action.amount,
    };

    if (action.seatIndex === heroSeatIndex) {
      // Hero action — record with GTO frequency 0 (unknown retroactively)
      ctx = updateContextAfterHeroAction(ctx, action.street as Street, playerAction, 0);
    } else {
      // Villain action
      if (!villainIndexMap.has(action.seatIndex)) {
        villainIndexMap.set(action.seatIndex, nextVillainIndex++);
      }
      const villainIdx = villainIndexMap.get(action.seatIndex)!;
      ctx = updateContextAfterVillainAction(ctx, villainIdx, player.position, playerAction);
    }
  }

  return ctx;
}
