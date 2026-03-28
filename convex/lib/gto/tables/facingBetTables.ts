/**
 * Facing-Bet Frequency Tables — solver-derived fold/call/raise frequencies
 * for when a player is facing a bet (not first to act).
 *
 * The main solver tables answer "what should I do when first to act?"
 * These tables answer "what should I do when someone bets into me?"
 * extracted from the same 193-board solver runs.
 *
 * Data layers:
 * - 24 generic tables (8 flop + 8 turn + 8 river, keyed by archetypeId)
 * - 32 scenario-specific tables (4 preflop scenarios x 8 flop archetypes)
 *   keyed by "{scenario}_{archetypeId}" (e.g., "btn_vs_bb_ace_high_dry_rainbow")
 *
 * Lookup order: scenario-specific first, then generic fallback, then closest category.
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

/** Preflop scenario identifier for scenario-specific tables */
export type FacingBetScenario = "btn_vs_bb" | "co_vs_bb" | "utg_vs_bb" | "bvb";

// ═══════════════════════════════════════════════════════
// STATIC IMPORTS
// ═══════════════════════════════════════════════════════

// Flop facing-bet tables (generic)
import aceHighDryFB from "../../../../data/frequency_tables/ace_high_dry_rainbow_facing_bet.json";
import kqHighDryFB from "../../../../data/frequency_tables/kq_high_dry_rainbow_facing_bet.json";
import midLowDryFB from "../../../../data/frequency_tables/mid_low_dry_rainbow_facing_bet.json";
import monotoneFB from "../../../../data/frequency_tables/monotone_facing_bet.json";
import pairedBoardsFB from "../../../../data/frequency_tables/paired_boards_facing_bet.json";
import rainbowConnectedFB from "../../../../data/frequency_tables/rainbow_connected_facing_bet.json";
import twoToneConnectedFB from "../../../../data/frequency_tables/two_tone_connected_facing_bet.json";
import twoToneDisconnectedFB from "../../../../data/frequency_tables/two_tone_disconnected_facing_bet.json";
// Turn facing-bet tables (generic)
import turnAceHighDryFB from "../../../../data/frequency_tables/turn_ace_high_dry_rainbow_facing_bet.json";
import turnKqHighDryFB from "../../../../data/frequency_tables/turn_kq_high_dry_rainbow_facing_bet.json";
import turnMidLowDryFB from "../../../../data/frequency_tables/turn_mid_low_dry_rainbow_facing_bet.json";
import turnMonotoneFB from "../../../../data/frequency_tables/turn_monotone_facing_bet.json";
import turnPairedBoardsFB from "../../../../data/frequency_tables/turn_paired_boards_facing_bet.json";
import turnRainbowConnectedFB from "../../../../data/frequency_tables/turn_rainbow_connected_facing_bet.json";
import turnTwoToneConnectedFB from "../../../../data/frequency_tables/turn_two_tone_connected_facing_bet.json";
import turnTwoToneDisconnectedFB from "../../../../data/frequency_tables/turn_two_tone_disconnected_facing_bet.json";
// River facing-bet tables (generic)
import riverAceHighDryFB from "../../../../data/frequency_tables/river_ace_high_dry_rainbow_facing_bet.json";
import riverKqHighDryFB from "../../../../data/frequency_tables/river_kq_high_dry_rainbow_facing_bet.json";
import riverMidLowDryFB from "../../../../data/frequency_tables/river_mid_low_dry_rainbow_facing_bet.json";
import riverMonotoneFB from "../../../../data/frequency_tables/river_monotone_facing_bet.json";
import riverPairedBoardsFB from "../../../../data/frequency_tables/river_paired_boards_facing_bet.json";
import riverRainbowConnectedFB from "../../../../data/frequency_tables/river_rainbow_connected_facing_bet.json";
import riverTwoToneConnectedFB from "../../../../data/frequency_tables/river_two_tone_connected_facing_bet.json";
import riverTwoToneDisconnectedFB from "../../../../data/frequency_tables/river_two_tone_disconnected_facing_bet.json";

// Scenario-specific flop facing-bet tables (BTN vs BB)
import btnVsBbAceHighDryFB from "../../../../data/frequency_tables/btn_vs_bb_ace_high_dry_rainbow_facing_bet.json";
import btnVsBbKqHighDryFB from "../../../../data/frequency_tables/btn_vs_bb_kq_high_dry_rainbow_facing_bet.json";
import btnVsBbMidLowDryFB from "../../../../data/frequency_tables/btn_vs_bb_mid_low_dry_rainbow_facing_bet.json";
import btnVsBbMonotoneFB from "../../../../data/frequency_tables/btn_vs_bb_monotone_facing_bet.json";
import btnVsBbPairedBoardsFB from "../../../../data/frequency_tables/btn_vs_bb_paired_boards_facing_bet.json";
import btnVsBbRainbowConnectedFB from "../../../../data/frequency_tables/btn_vs_bb_rainbow_connected_facing_bet.json";
import btnVsBbTwoToneConnectedFB from "../../../../data/frequency_tables/btn_vs_bb_two_tone_connected_facing_bet.json";
import btnVsBbTwoToneDisconnectedFB from "../../../../data/frequency_tables/btn_vs_bb_two_tone_disconnected_facing_bet.json";

// Scenario-specific flop facing-bet tables (CO vs BB)
import coVsBbAceHighDryFB from "../../../../data/frequency_tables/co_vs_bb_ace_high_dry_rainbow_facing_bet.json";
import coVsBbKqHighDryFB from "../../../../data/frequency_tables/co_vs_bb_kq_high_dry_rainbow_facing_bet.json";
import coVsBbMidLowDryFB from "../../../../data/frequency_tables/co_vs_bb_mid_low_dry_rainbow_facing_bet.json";
import coVsBbMonotoneFB from "../../../../data/frequency_tables/co_vs_bb_monotone_facing_bet.json";
import coVsBbPairedBoardsFB from "../../../../data/frequency_tables/co_vs_bb_paired_boards_facing_bet.json";
import coVsBbRainbowConnectedFB from "../../../../data/frequency_tables/co_vs_bb_rainbow_connected_facing_bet.json";
import coVsBbTwoToneConnectedFB from "../../../../data/frequency_tables/co_vs_bb_two_tone_connected_facing_bet.json";
import coVsBbTwoToneDisconnectedFB from "../../../../data/frequency_tables/co_vs_bb_two_tone_disconnected_facing_bet.json";

// Scenario-specific flop facing-bet tables (UTG vs BB)
import utgVsBbAceHighDryFB from "../../../../data/frequency_tables/utg_vs_bb_ace_high_dry_rainbow_facing_bet.json";
import utgVsBbKqHighDryFB from "../../../../data/frequency_tables/utg_vs_bb_kq_high_dry_rainbow_facing_bet.json";
import utgVsBbMidLowDryFB from "../../../../data/frequency_tables/utg_vs_bb_mid_low_dry_rainbow_facing_bet.json";
import utgVsBbMonotoneFB from "../../../../data/frequency_tables/utg_vs_bb_monotone_facing_bet.json";
import utgVsBbPairedBoardsFB from "../../../../data/frequency_tables/utg_vs_bb_paired_boards_facing_bet.json";
import utgVsBbRainbowConnectedFB from "../../../../data/frequency_tables/utg_vs_bb_rainbow_connected_facing_bet.json";
import utgVsBbTwoToneConnectedFB from "../../../../data/frequency_tables/utg_vs_bb_two_tone_connected_facing_bet.json";
import utgVsBbTwoToneDisconnectedFB from "../../../../data/frequency_tables/utg_vs_bb_two_tone_disconnected_facing_bet.json";

// Scenario-specific flop facing-bet tables (BvB — SB vs BB)
import bvbAceHighDryFB from "../../../../data/frequency_tables/bvb_ace_high_dry_rainbow_facing_bet.json";
import bvbKqHighDryFB from "../../../../data/frequency_tables/bvb_kq_high_dry_rainbow_facing_bet.json";
import bvbMidLowDryFB from "../../../../data/frequency_tables/bvb_mid_low_dry_rainbow_facing_bet.json";
import bvbMonotoneFB from "../../../../data/frequency_tables/bvb_monotone_facing_bet.json";
import bvbPairedBoardsFB from "../../../../data/frequency_tables/bvb_paired_boards_facing_bet.json";
import bvbRainbowConnectedFB from "../../../../data/frequency_tables/bvb_rainbow_connected_facing_bet.json";
import bvbTwoToneConnectedFB from "../../../../data/frequency_tables/bvb_two_tone_connected_facing_bet.json";
import bvbTwoToneDisconnectedFB from "../../../../data/frequency_tables/bvb_two_tone_disconnected_facing_bet.json";

// ═══════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════

const facingBetTables = new Map<string, FacingBetData>();

function register(data: FacingBetData): void {
  facingBetTables.set(data.archetypeId, data);
}

/** Register with an explicit key (for scenario-prefixed tables). */
function registerWithKey(key: string, data: FacingBetData): void {
  facingBetTables.set(key, data);
}

// Register generic facing-bet tables at module load time
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

// Scenario-specific tables: BTN vs BB (8 archetypes)
registerWithKey("btn_vs_bb_ace_high_dry_rainbow", btnVsBbAceHighDryFB as FacingBetData);
registerWithKey("btn_vs_bb_kq_high_dry_rainbow", btnVsBbKqHighDryFB as FacingBetData);
registerWithKey("btn_vs_bb_mid_low_dry_rainbow", btnVsBbMidLowDryFB as FacingBetData);
registerWithKey("btn_vs_bb_monotone", btnVsBbMonotoneFB as FacingBetData);
registerWithKey("btn_vs_bb_paired_boards", btnVsBbPairedBoardsFB as FacingBetData);
registerWithKey("btn_vs_bb_rainbow_connected", btnVsBbRainbowConnectedFB as FacingBetData);
registerWithKey("btn_vs_bb_two_tone_connected", btnVsBbTwoToneConnectedFB as FacingBetData);
registerWithKey("btn_vs_bb_two_tone_disconnected", btnVsBbTwoToneDisconnectedFB as FacingBetData);

// Scenario-specific tables: CO vs BB (8 archetypes)
registerWithKey("co_vs_bb_ace_high_dry_rainbow", coVsBbAceHighDryFB as FacingBetData);
registerWithKey("co_vs_bb_kq_high_dry_rainbow", coVsBbKqHighDryFB as FacingBetData);
registerWithKey("co_vs_bb_mid_low_dry_rainbow", coVsBbMidLowDryFB as FacingBetData);
registerWithKey("co_vs_bb_monotone", coVsBbMonotoneFB as FacingBetData);
registerWithKey("co_vs_bb_paired_boards", coVsBbPairedBoardsFB as FacingBetData);
registerWithKey("co_vs_bb_rainbow_connected", coVsBbRainbowConnectedFB as FacingBetData);
registerWithKey("co_vs_bb_two_tone_connected", coVsBbTwoToneConnectedFB as FacingBetData);
registerWithKey("co_vs_bb_two_tone_disconnected", coVsBbTwoToneDisconnectedFB as FacingBetData);

// Scenario-specific tables: UTG vs BB (8 archetypes)
registerWithKey("utg_vs_bb_ace_high_dry_rainbow", utgVsBbAceHighDryFB as FacingBetData);
registerWithKey("utg_vs_bb_kq_high_dry_rainbow", utgVsBbKqHighDryFB as FacingBetData);
registerWithKey("utg_vs_bb_mid_low_dry_rainbow", utgVsBbMidLowDryFB as FacingBetData);
registerWithKey("utg_vs_bb_monotone", utgVsBbMonotoneFB as FacingBetData);
registerWithKey("utg_vs_bb_paired_boards", utgVsBbPairedBoardsFB as FacingBetData);
registerWithKey("utg_vs_bb_rainbow_connected", utgVsBbRainbowConnectedFB as FacingBetData);
registerWithKey("utg_vs_bb_two_tone_connected", utgVsBbTwoToneConnectedFB as FacingBetData);
registerWithKey("utg_vs_bb_two_tone_disconnected", utgVsBbTwoToneDisconnectedFB as FacingBetData);

// Scenario-specific tables: BvB — SB vs BB (8 archetypes)
registerWithKey("bvb_ace_high_dry_rainbow", bvbAceHighDryFB as FacingBetData);
registerWithKey("bvb_kq_high_dry_rainbow", bvbKqHighDryFB as FacingBetData);
registerWithKey("bvb_mid_low_dry_rainbow", bvbMidLowDryFB as FacingBetData);
registerWithKey("bvb_monotone", bvbMonotoneFB as FacingBetData);
registerWithKey("bvb_paired_boards", bvbPairedBoardsFB as FacingBetData);
registerWithKey("bvb_rainbow_connected", bvbRainbowConnectedFB as FacingBetData);
registerWithKey("bvb_two_tone_connected", bvbTwoToneConnectedFB as FacingBetData);
registerWithKey("bvb_two_tone_disconnected", bvbTwoToneDisconnectedFB as FacingBetData);

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
// LOOKUP HELPER
// ═══════════════════════════════════════════════════════

/**
 * Internal: look up frequencies from a specific table by key.
 * Returns null if the key doesn't exist or the position data is empty.
 */
function lookupFromTable(
  tableKey: string,
  handCategory: HandCategory,
  isInPosition: boolean,
): FacingBetFrequencies | null {
  const table = facingBetTables.get(tableKey);
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

// ═══════════════════════════════════════════════════════
// LOOKUP
// ═══════════════════════════════════════════════════════

/**
 * Look up facing-bet frequencies from solver data.
 *
 * Lookup order:
 * 1. Try scenario-specific table ("{scenario}_{archetypeId}") if scenario provided
 * 2. Fall back to generic table ("{archetypeId}")
 * 3. Fall back to closest category by strength within whichever table matched
 *
 * @param archetypeId - Flop texture archetype (e.g., "ace_high_dry_rainbow")
 * @param handCategory - Hero's hand category (e.g., "top_pair_top_kicker")
 * @param isInPosition - Whether hero is IP or OOP
 * @param scenario - Optional preflop scenario (e.g., "btn_vs_bb", "co_vs_bb", "utg_vs_bb", "bvb")
 * @returns Fold/call/raise frequencies, or null if no data exists
 */
export function lookupFacingBetFrequencies(
  archetypeId: ArchetypeId,
  handCategory: HandCategory,
  isInPosition: boolean,
  scenario?: FacingBetScenario,
): FacingBetFrequencies | null {
  // 1. Try scenario-specific table first
  if (scenario) {
    const scenarioResult = lookupFromTable(
      `${scenario}_${archetypeId}`,
      handCategory,
      isInPosition,
    );
    if (scenarioResult) return scenarioResult;
  }

  // 2. Fall back to generic table
  return lookupFromTable(archetypeId, handCategory, isInPosition);
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
 * Maps: fold -> "fold", call -> "call", raise -> "raise_small"
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
