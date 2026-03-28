/**
 * Facing-Bet Frequency Tables — solver-derived fold/call/raise frequencies
 * for when a player is facing a bet (not first to act).
 *
 * The main solver tables answer "what should I do when first to act?"
 * These tables answer "what should I do when someone bets into me?"
 * extracted from the same 193-board solver runs.
 *
 * Data: 8 flop texture archetypes, per hand category, IP and OOP.
 * Each entry has { fold, call, raise } summing to ~1.0.
 *
 * Pure TypeScript, zero Convex imports.
 */
import type { ArchetypeId } from "../archetypeClassifier";
import type { HandCategory } from "../handCategorizer";
import type { ActionFrequencies } from "./types";

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

/** Raw facing-bet entry from solver JSON */
interface FacingBetEntry {
  fold: number;
  call: number;
  raise: number;
  count: number;
}

/** Shape of the facing-bet JSON files */
interface FacingBetData {
  archetypeId: string;
  boardsAnalyzed: number;
  ip_facing_bet: Record<string, FacingBetEntry>;
  oop_facing_bet: Record<string, FacingBetEntry>;
}

/** Result from a facing-bet frequency lookup */
export interface FacingBetFrequencies {
  fold: number;
  call: number;
  raise: number;
}

// ═══════════════════════════════════════════════════════
// STATIC IMPORTS
// ═══════════════════════════════════════════════════════

// Flop facing-bet tables
import aceHighDryFB from "../../../../data/frequency_tables/ace_high_dry_rainbow_facing_bet.json";
import kqHighDryFB from "../../../../data/frequency_tables/kq_high_dry_rainbow_facing_bet.json";
import midLowDryFB from "../../../../data/frequency_tables/mid_low_dry_rainbow_facing_bet.json";
import monotoneFB from "../../../../data/frequency_tables/monotone_facing_bet.json";
import pairedBoardsFB from "../../../../data/frequency_tables/paired_boards_facing_bet.json";
import rainbowConnectedFB from "../../../../data/frequency_tables/rainbow_connected_facing_bet.json";
import twoToneConnectedFB from "../../../../data/frequency_tables/two_tone_connected_facing_bet.json";
import twoToneDisconnectedFB from "../../../../data/frequency_tables/two_tone_disconnected_facing_bet.json";
// Turn facing-bet tables
import turnAceHighDryFB from "../../../../data/frequency_tables/turn_ace_high_dry_rainbow_facing_bet.json";
import turnKqHighDryFB from "../../../../data/frequency_tables/turn_kq_high_dry_rainbow_facing_bet.json";
import turnMidLowDryFB from "../../../../data/frequency_tables/turn_mid_low_dry_rainbow_facing_bet.json";
import turnMonotoneFB from "../../../../data/frequency_tables/turn_monotone_facing_bet.json";
import turnPairedBoardsFB from "../../../../data/frequency_tables/turn_paired_boards_facing_bet.json";
import turnRainbowConnectedFB from "../../../../data/frequency_tables/turn_rainbow_connected_facing_bet.json";
import turnTwoToneConnectedFB from "../../../../data/frequency_tables/turn_two_tone_connected_facing_bet.json";
import turnTwoToneDisconnectedFB from "../../../../data/frequency_tables/turn_two_tone_disconnected_facing_bet.json";
// River facing-bet tables
import riverAceHighDryFB from "../../../../data/frequency_tables/river_ace_high_dry_rainbow_facing_bet.json";
import riverKqHighDryFB from "../../../../data/frequency_tables/river_kq_high_dry_rainbow_facing_bet.json";
import riverMidLowDryFB from "../../../../data/frequency_tables/river_mid_low_dry_rainbow_facing_bet.json";
import riverMonotoneFB from "../../../../data/frequency_tables/river_monotone_facing_bet.json";
import riverPairedBoardsFB from "../../../../data/frequency_tables/river_paired_boards_facing_bet.json";
import riverRainbowConnectedFB from "../../../../data/frequency_tables/river_rainbow_connected_facing_bet.json";
import riverTwoToneConnectedFB from "../../../../data/frequency_tables/river_two_tone_connected_facing_bet.json";
import riverTwoToneDisconnectedFB from "../../../../data/frequency_tables/river_two_tone_disconnected_facing_bet.json";

// ═══════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════

const facingBetTables = new Map<string, FacingBetData>();

function register(data: FacingBetData): void {
  facingBetTables.set(data.archetypeId, data);
}

// Register all facing-bet tables at module load time
// Flop (8 archetypes)
register(aceHighDryFB as FacingBetData);
register(kqHighDryFB as FacingBetData);
register(midLowDryFB as FacingBetData);
register(monotoneFB as FacingBetData);
register(pairedBoardsFB as FacingBetData);
register(rainbowConnectedFB as FacingBetData);
register(twoToneConnectedFB as FacingBetData);
register(twoToneDisconnectedFB as FacingBetData);
// Turn (8 archetypes)
register(turnAceHighDryFB as FacingBetData);
register(turnKqHighDryFB as FacingBetData);
register(turnMidLowDryFB as FacingBetData);
register(turnMonotoneFB as FacingBetData);
register(turnPairedBoardsFB as FacingBetData);
register(turnRainbowConnectedFB as FacingBetData);
register(turnTwoToneConnectedFB as FacingBetData);
register(turnTwoToneDisconnectedFB as FacingBetData);
// River (8 archetypes)
register(riverAceHighDryFB as FacingBetData);
register(riverKqHighDryFB as FacingBetData);
register(riverMidLowDryFB as FacingBetData);
register(riverMonotoneFB as FacingBetData);
register(riverPairedBoardsFB as FacingBetData);
register(riverRainbowConnectedFB as FacingBetData);
register(riverTwoToneConnectedFB as FacingBetData);
register(riverTwoToneDisconnectedFB as FacingBetData);

// ═══════════════════════════════════════════════════════
// CATEGORY STRENGTH (for fallback matching)
// ═══════════════════════════════════════════════════════

const CATEGORY_STRENGTH_ORDER: Record<string, number> = {
  sets_plus: 1.0,
  two_pair: 0.85,
  premium_pair: 0.82,
  overpair: 0.78,
  top_pair_top_kicker: 0.7,
  top_pair_weak_kicker: 0.6,
  combo_draw: 0.5,
  middle_pair: 0.45,
  flush_draw: 0.4,
  bottom_pair: 0.35,
  straight_draw: 0.33,
  overcards: 0.25,
  weak_draw: 0.15,
  air: 0.05,
};

function findClosestCategory(
  target: HandCategory,
  available: string[],
): string {
  const targetStrength = CATEGORY_STRENGTH_ORDER[target] ?? 0.3;
  let best = available[0];
  let bestDist = Math.abs((CATEGORY_STRENGTH_ORDER[best] ?? 0.3) - targetStrength);
  for (const cat of available) {
    const dist = Math.abs((CATEGORY_STRENGTH_ORDER[cat] ?? 0.3) - targetStrength);
    if (dist < bestDist) {
      best = cat;
      bestDist = dist;
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════
// LOOKUP
// ═══════════════════════════════════════════════════════

/**
 * Look up facing-bet frequencies from solver data.
 *
 * @param archetypeId - Flop texture archetype (e.g., "ace_high_dry_rainbow")
 * @param handCategory - Hero's hand category (e.g., "top_pair_top_kicker")
 * @param isInPosition - Whether hero is IP or OOP
 * @returns Fold/call/raise frequencies, or null if no data exists
 */
export function lookupFacingBetFrequencies(
  archetypeId: ArchetypeId,
  handCategory: HandCategory,
  isInPosition: boolean,
): FacingBetFrequencies | null {
  const table = facingBetTables.get(archetypeId);
  if (!table) return null;

  const posData = isInPosition ? table.ip_facing_bet : table.oop_facing_bet;
  if (!posData || Object.keys(posData).length === 0) return null;

  // Try exact category match
  const exact = posData[handCategory];
  if (exact) {
    return { fold: exact.fold, call: exact.call, raise: exact.raise };
  }

  // Fall back to closest category by strength
  const available = Object.keys(posData);
  if (available.length === 0) return null;

  const closest = findClosestCategory(handCategory, available);
  const fallback = posData[closest];
  if (!fallback) return null;

  return { fold: fallback.fold, call: fallback.call, raise: fallback.raise };
}

/**
 * Check if facing-bet data exists for an archetype.
 */
export function hasFacingBetData(archetypeId: ArchetypeId): boolean {
  return facingBetTables.has(archetypeId);
}

/**
 * Convert facing-bet frequencies to ActionFrequencies format
 * suitable for the engine's weighted sampling.
 *
 * Maps: fold → "fold", call → "call", raise → "raise_small"
 * (raise_small because facing a bet, the raise sizes are min-raise level)
 */
export function facingBetToActionFrequencies(
  fb: FacingBetFrequencies,
): ActionFrequencies {
  const result: ActionFrequencies = {};
  if (fb.fold > 0.001) result.fold = fb.fold;
  if (fb.call > 0.001) result.call = fb.call;
  if (fb.raise > 0.001) result.raise_small = fb.raise;
  return result;
}
