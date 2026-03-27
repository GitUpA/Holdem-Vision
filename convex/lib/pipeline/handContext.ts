/**
 * HandContext — lightweight struct accumulating range context across streets.
 *
 * Design principles (from docs/first-principles.md):
 * - Seat-agnostic: works identically for hero and villain (Layer 6)
 * - Observable-only: contains actions and position, NEVER profile labels (Layer 7)
 * - Feeds INTO FullSnapshot, does not duplicate it
 * - Range estimation computed lazily via estimateRange(), not stored
 *
 * Created at preflop, updated at each street transition.
 * Carried through HandSession (UI) and HandStepper (headless).
 *
 * Pure TypeScript, zero Convex/React imports.
 */

import type { Position, Street } from "../types/cards";
import type { PlayerAction } from "../types/opponents";
import type { ArchetypeId } from "../gto/archetypeClassifier";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

/**
 * Observable context for a single seat.
 * Contains only what a coach watching tape would see — no profile labels.
 */
export interface SeatContext {
  /** Table position this hand */
  position: Position;
  /** Every action this seat has taken, in order */
  actionHistory: PlayerAction[];
}

/**
 * Hand-level context that accumulates across streets.
 *
 * This is the "funnel tracker" — it records what happened at each street
 * so downstream consumers (coaching, scoring, opponent story) know HOW
 * the hand reached the current decision point.
 */
export interface HandContext {
  /** Hero's observable context */
  heroSeat: SeatContext;
  /** Each active villain's observable context */
  villainSeats: SeatContext[];
  /** Archetype at preflop (how the hand started) */
  preflopArchetypeId: ArchetypeId;
  /** Hero's hand class (e.g., "AKs", "72o") — known to hero, not to villains */
  heroHandClass: string;
  /** Per-street record of hero's decisions + GTO frequency for that decision */
  streetHistory: StreetDecision[];
  /** Was hero's preflop entry GTO-approved? (raise freq > 10% for position) */
  heroInRange: boolean;
  /** GTO frequency for hero's preflop action (0-1) */
  heroPreflopFrequency: number;
}

/**
 * Record of a hero decision at one street.
 */
export interface StreetDecision {
  street: Street;
  /** What hero did */
  heroAction: string;
  /** How often GTO takes this action in this spot (0-1) */
  heroActionFrequency: number;
}

// ═══════════════════════════════════════════════════════
// BUILDERS
// ═══════════════════════════════════════════════════════

/**
 * Create an initial HandContext at preflop.
 */
export function createHandContext(
  heroPosition: Position,
  heroHandClass: string,
  preflopArchetypeId: ArchetypeId,
  heroInRange: boolean,
  heroPreflopFrequency: number,
): HandContext {
  return {
    heroSeat: {
      position: heroPosition,
      actionHistory: [],
    },
    villainSeats: [],
    preflopArchetypeId,
    heroHandClass,
    streetHistory: [],
    heroInRange,
    heroPreflopFrequency,
  };
}

/**
 * Record a hero action on the current street.
 */
export function recordHeroAction(
  ctx: HandContext,
  street: Street,
  action: PlayerAction,
  gtoFrequency: number,
): HandContext {
  return {
    ...ctx,
    heroSeat: {
      ...ctx.heroSeat,
      actionHistory: [...ctx.heroSeat.actionHistory, action],
    },
    streetHistory: [
      ...ctx.streetHistory,
      { street, heroAction: action.actionType, heroActionFrequency: gtoFrequency },
    ],
  };
}

/**
 * Record a villain action (adds to the appropriate villain's context).
 */
export function recordVillainAction(
  ctx: HandContext,
  villainIndex: number,
  position: Position,
  action: PlayerAction,
): HandContext {
  const villainSeats = [...ctx.villainSeats];

  // Ensure villain seat exists
  while (villainSeats.length <= villainIndex) {
    villainSeats.push({ position, actionHistory: [] });
  }

  villainSeats[villainIndex] = {
    ...villainSeats[villainIndex],
    actionHistory: [...villainSeats[villainIndex].actionHistory, action],
  };

  return { ...ctx, villainSeats };
}

/**
 * Summary for display: one-line description of how the hand reached this point.
 */
export function summarizeContext(ctx: HandContext): string {
  const parts: string[] = [];

  // Preflop entry
  const preflopAction = ctx.streetHistory.find(s => s.street === "preflop");
  if (preflopAction) {
    const freqPct = (preflopAction.heroActionFrequency * 100).toFixed(0);
    const inRange = ctx.heroInRange ? "" : " (outside GTO range)";
    parts.push(`Preflop: ${preflopAction.heroAction} with ${ctx.heroHandClass} from ${ctx.heroSeat.position} (GTO ${freqPct}%)${inRange}`);
  }

  // Villain context
  const activeVillains = ctx.villainSeats.filter(v => v.actionHistory.length > 0);
  if (activeVillains.length > 0) {
    const v = activeVillains[0];
    const lastAction = v.actionHistory[v.actionHistory.length - 1];
    parts.push(`Villain (${v.position}): ${lastAction.actionType}${lastAction.amount ? " " + lastAction.amount : ""}`);
  }

  return parts.join(" → ");
}
